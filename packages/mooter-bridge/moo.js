'use strict';
/**
 * moo.js — mooter-bridge v1.2 · CW2/CW5: the local tier finally works.
 *
 * Until v1.1 the router mapped T0 → `moo` and then admitted, in its own
 * routing_note, that "T0/moo não é dispatchável na v0". The 4090 sat there with
 * a model resident and ZERO jobs while every single task went to Opus. Measured
 * 2026-07-25: 6 of 6 sessions on claude-opus-4-8, savedUsd negative in all six.
 * A local-first router that never routes locally is a slogan, not a moat.
 *
 * This adapter runs a job on Ollama and writes the SAME NDJSON shape the cloud
 * agents write, so telemetry.js, the ledger and the panel need no special case:
 * one pipeline, three vendors, one honest set of numbers.
 *
 * Cost: 0, and that is a MEASURED zero, not an unknown. Ollama bills nothing.
 * Tokens are the real thing Ollama reports (prompt_eval_count / eval_count) and
 * tok/s is computed from eval_duration, which Ollama returns in NANOSECONDS.
 *
 * Zero dependencies, zero writes outside the job dir. If the daemon is down we
 * fail loudly and immediately instead of pretending a job is running.
 */

const http = require('http');
const fs = require('fs');
const { EventEmitter } = require('events');

function hostPort(hostStr) {
  const [h, p] = String(hostStr || '127.0.0.1:11434').replace(/^https?:\/\//, '').split(':');
  return { host: h || '127.0.0.1', port: Number(p) || 11434 };
}

/** GET /api/tags — which models this machine can actually run. */
function listModels(hostStr, timeoutMs) {
  const { host, port } = hostPort(hostStr);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let req;
    try {
      req = http.get({ host, port, path: '/api/tags', timeout: timeoutMs || 1500 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { body += d; if (body.length > 500000) req.destroy(); });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            finish((j && j.models || []).map((m) => ({
              model: m.model || m.name || null,
              size_bytes: m.size != null ? m.size : null,
              parameter_size: (m.details && m.details.parameter_size) || null,
              quantization: (m.details && m.details.quantization_level) || null,
            })).filter((m) => m.model));
          } catch { finish(null); }
        });
      });
    } catch { return finish(null); }
    req.on('timeout', () => { try { req.destroy(); } catch { /* */ } finish(null); });
    req.on('error', () => finish(null));
  });
}

/**
 * Pick a model without ever inventing one.
 * Order: explicit arg → MOOTER_MOO_MODEL → resident on the GPU → smallest installed.
 * Returns null when the machine genuinely has nothing — the caller must fail.
 */
/**
 * ⚠️ v1.3.3 — um modelo de EMBEDDINGS não gera texto.
 *
 * A v1.3.2 escolhia "o primeiro residente, senão o menor instalado". Nenhuma das
 * duas perguntava se o modelo sabe gerar. Um job real recebeu
 * `nomic-embed-text:latest` e morreu em 102 ms com só a linha de init.
 *
 * E não foi azar — é enviesamento duplo:
 *   1. embedders são quase sempre os MENORES instalados → ganhavam o sort;
 *   2. o RAG do vault mantém o embedder RESIDENTE → ganhava o primeiro lugar.
 * Quanto melhor o RAG funcionava, mais garantido era escolher o modelo errado.
 *
 * Agora: filtrar por capacidade primeiro, e preferir o MAIOR que cabe na VRAM
 * livre — porque um modelo maior dá um briefing melhor, e a folga já é medida.
 */
const EMBED_RE = /(embed|bge|gte|minilm|e5-|nomic|mxbai|arctic-embed|all-minilm)/i;

/**
 * Quanto raciocínio se tolera antes da primeira palavra de resposta.
 * 60k caracteres são ~15k tokens de pensamento — muito para qualquer tarefa
 * que valha a pena dar a um tier local. Ajustável por ambiente para quem
 * quiser deixar um modelo pensar mais.
 */
const MAX_RACIOCINIO = Math.max(5000, Number(process.env.MOOTER_MAX_RACIOCINIO) || 60000);

function isGenerative(m) {
  if (!m || !m.model) return false;
  if (EMBED_RE.test(String(m.model))) return false;
  const fam = String((m.details && m.details.family) || m.family || '');
  if (EMBED_RE.test(fam)) return false;
  return true;
}

/** Tamanho em bytes de um modelo, venha ele de /api/ps ou de /api/tags. */
function bytesDe(m) {
  if (!m) return null;
  for (const k of ['size_bytes', 'size', 'vram_bytes']) {
    if (m[k] != null && Number.isFinite(Number(m[k]))) return Number(m[k]);
  }
  return null;
}

/**
 * ⚠️ v1.4.2 — o residente deixa de ganhar SEMPRE, e a razão é um ciclo vicioso
 * medido no ledger de 2026-07-25: os 4 jobs locais do dia correram todos em
 * `qwen2.5:3b`. Não porque fosse o melhor — porque era o que estava carregado.
 * E estava carregado porque o job anterior, minúsculo, o tinha carregado.
 *
 *   modelo pequeno é carregado → é residente → ganha a regra 1 → volta a ser
 *   carregado → nunca há espaço nem motivo para carregar um maior.
 *
 * O tier local ficava preso a 3B numa máquina com 19 GB de VRAM livres e ninguém
 * dava por isso, porque a escolha nunca era explicada. Carregar um modelo maior
 * custa segundos; usar um 3B para trabalho a sério custa uma resposta errada.
 *
 * Regra nova: o residente ganha se estiver na mesma ordem de grandeza do melhor
 * que cabe (≥70% do tamanho). Abaixo disso, vale a pena pagar o arranque.
 * A decisão vem sempre com o `porque` — uma escolha que não se explica não se
 * pode auditar.
 */
/**
 * ── ONDA 1.3/1.6 (2026-07-26) — adequação × capacidade, não "o maior que cabe" ──
 *
 * O critério antigo ordenava por tamanho e levava o maior. Medido nesta máquina:
 * escolhia o `qwen3:30b` (18,5 GB, geração 2025) e ignorava o `qwen3.6:27b`
 * (17,4 GB, Abril 2026) por 1,1 GB. Uma geração à frente perdia para um giga.
 *
 * Critério novo, com os dados que o /api/tags REALMENTE tem (nome e tamanho —
 * não inventamos benchmarks):
 *   · geração dentro da família (qwen3.6 > qwen3 > qwen2.5) pesa mais do que 1 GB;
 *   · tamanho continua a contar (log2 — dobrar o modelo vale +1, não +tudo);
 *   · um modelo *-coder ganha bónus quando a tarefa é código, e perde um pouco
 *     quando não é (é especialista, não generalista).
 *
 * ⚠️ A specialization-matrix.ts do router (Wave 58) NÃO é consumível daqui:
 * é TypeScript com imports e células por MEDIR (o adaptive-learner é quem a
 * preenche — Onda 3). Este selector usa só factos locais verificáveis; ligar a
 * matriz medida ao tier local fica explicitamente para a Onda 3.
 */
const CODER_RE = /(coder|codegemma|codellama|starcoder|codeqwen|codestral)/i;
const TAREFA_CODIGO_RE = /\b(c[oó]digo|code|diff|patch|refactor|refactoriza|bug|fun[cç][aã]o|classe|implementa|regex|sql|typescript|javascript|python|stack ?trace|\.jsx?|\.tsx?|\.py|\.rs|\.go)\b/i;

function familiaVersao(nome) {
  const m = String(nome || '').toLowerCase().match(/^([a-z][a-z-]*?)[-]?(\d+(?:\.\d+)?)/);
  if (!m) return { familia: String(nome || '').toLowerCase().split(/[:\s]/)[0] || 'n/d', versao: null };
  return { familia: m[1].replace(/-$/, ''), versao: Number(m[2]) };
}

/** Pontua candidatos que cabem. Devolve ordenado, cada um com a justificação. */
function pontuar(cands, tarefaCodigo) {
  const maxVer = {};
  for (const c of cands) {
    const fv = familiaVersao(c.model);
    if (fv.versao != null) maxVer[fv.familia] = Math.max(maxVer[fv.familia] || 0, fv.versao);
  }
  return cands.map((c) => {
    const fv = familiaVersao(c.model);
    const gb = (bytesDe(c) || 0) / 1073741824;
    const novidade = (fv.versao != null && maxVer[fv.familia]) ? fv.versao / maxVer[fv.familia] : 0.8;
    const coder = CODER_RE.test(String(c.model));
    let score = novidade * 3 + (gb > 0 ? Math.log2(gb) : 0);
    const just = [];
    just.push(fv.versao != null
      ? ('geração ' + fv.versao + (novidade >= 1 ? ' — a mais recente da família ' + fv.familia : ' (há mais recente na família)'))
      : 'geração n/d');
    just.push(gb > 0 ? gb.toFixed(1) + ' GB' : 'tamanho n/d');
    if (coder && tarefaCodigo) { score += 4; just.push('especializado em código, e a tarefa é código'); }
    else if (coder) { score -= 1; just.push('especializado em código mas a tarefa não é'); }
    return { model: c.model, bytes: bytesDe(c), score, novidade, just };
  }).sort((a, b) => b.score - a.score);
}

async function pickModelExplained(explicit, hostStr, residentList, opts) {
  if (explicit) return { model: String(explicit), porque: 'pedido explicitamente por quem chamou' };
  const env = process.env.MOOTER_MOO_MODEL;
  if (env && env.indexOf('${') < 0 && env.trim()) {
    return { model: env.trim(), porque: 'fixado em MOOTER_MOO_MODEL' };
  }

  const freeMb = opts && opts.free_mb != null ? Number(opts.free_mb) : null;
  /**
   * ⚠️ A VRAM LIVRE É UMA FOTOGRAFIA, NÃO UMA RESERVA.
   *
   * Medido a 2026-07-26: três jobs locais despachados quase ao mesmo tempo
   * viram todos "19 GB livres" e escolheram todos o modelo grande. A GPU foi a
   * 100% com 22,3 de 23 GB, e os três estrangularam-se — 8 minutos para um
   * resumo de 4 bullets. Cada decisão estava certa isoladamente e o conjunto
   * estava errado.
   *
   * `locais_a_correr` é quantos jobs locais já estão vivos. Cada um deles vai
   * disputar a mesma placa, por isso o orçamento de cada novo job encolhe. Não
   * é uma reserva real — é a humildade de assumir que não somos os únicos.
   */
  const jaCorrem = opts && opts.locais_a_correr != null ? Math.max(0, Number(opts.locais_a_correr)) : 0;
  const fatia = jaCorrem > 0 ? 1 / (jaCorrem + 1) : 1;
  const orcamentoMb = freeMb == null ? null : freeMb * fatia;
  const cabe = (b) => (orcamentoMb == null || b == null) ? true : (b / 1048576) <= orcamentoMb * 0.9;

  const instalados = (await listModels(hostStr, 1500)) || [];
  const gen = instalados.filter(isGenerative);
  const porNome = new Map(gen.map((m) => [String(m.model), m]));

  // tamanho do residente: /api/ps nem sempre o traz — vai buscá-lo aos instalados
  const residentes = (Array.isArray(residentList) ? residentList : [])
    .filter(isGenerative)
    .map((m) => ({ model: String(m.model), bytes: bytesDe(m) != null ? bytesDe(m) : bytesDe(porNome.get(String(m.model))) }))
    .filter((m) => cabe(m.bytes));
  residentes.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  const residente = residentes[0] || null;

  if (!gen.length) {
    // sem /api/tags só temos o residente — melhor isso do que inventar
    if (residente) return { model: residente.model, porque: 'já carregado na GPU (não consegui listar os instalados)' };
    return { model: null, porque: 'esta máquina não tem nenhum modelo local capaz de gerar texto' };
  }

  const comTamanho = gen.filter((m) => bytesDe(m) != null);
  const queCabem = comTamanho.filter((m) => cabe(bytesDe(m)));
  // Onda 1.3 — adequação × capacidade em vez de "o maior que cabe"
  const tarefaCodigo = TAREFA_CODIGO_RE.test(String((opts && opts.goal) || ''));
  const ranking = pontuar(queCabem, tarefaCodigo);
  const melhor = ranking[0] || null;
  const segundo = ranking[1] || null;

  if (residente) {
    const rankRes = ranking.find((r) => r.model === residente.model) || null;
    if (!melhor || residente.bytes == null || !rankRes) {
      return { model: residente.model, porque: 'já carregado na GPU — arranca de imediato' };
    }
    if (rankRes.model === melhor.model) {
      return { model: melhor.model, porque: 'já carregado na GPU e é a melhor escolha: ' + melhor.just.join(', ') };
    }
    /**
     * O residente só ganha se estiver no mesmo calibre E não for de geração
     * mais antiga. Sem a segunda condição, o `qwen3:30b` residente (2025)
     * bloqueava o `qwen3.6:27b` (Abr 2026) para sempre — a inércia a preservar
     * exactamente o erro que o selector novo veio corrigir.
     */
    if (rankRes.score >= melhor.score * 0.9 && rankRes.novidade >= melhor.novidade - 0.05) {
      return { model: rankRes.model, porque: 'já carregado e do mesmo calibre da melhor escolha — não compensa recarregar' };
    }
    const eMaior = (melhor.bytes || 0) > (rankRes.bytes || 0);
    return {
      model: melhor.model,
      porque: 'troquei o residente ' + rankRes.model + ' pelo ' + melhor.model + ': ' + melhor.just.join(', ')
        + (eMaior ? ' — maior e mais capaz' : ' — mais recente, e ainda liberta VRAM'),
      trocou_residente: rankRes.model,
      custo: 'o arranque leva alguns segundos porque o modelo tem de ser carregado',
    };
  }

  if (melhor) {
    return {
      model: melhor.model,
      porque: 'escolhi o ' + melhor.model + ': ' + melhor.just.join(', ')
        + (segundo ? ' — ganhou ao ' + segundo.model : '')
        + (jaCorrem ? ' (fatia de GPU repartida: ' + jaCorrem + ' job local já a correr)' : ''),
      locais_a_correr: jaCorrem || null,
    };
  }
  // nada com tamanho conhecido: o menor é o palpite menos arriscado, e diz-se
  const anySized = comTamanho.slice().sort((a, b) => bytesDe(a) - bytesDe(b));
  if (anySized.length) return { model: anySized[0].model, porque: 'nenhum cabe com folga na VRAM livre — escolhi o mais pequeno' };
  return { model: gen[0].model, porque: 'não sei os tamanhos — escolhi o primeiro que sabe gerar' };
}

async function pickModel(explicit, hostStr, residentList, opts) {
  const r = await pickModelExplained(explicit, hostStr, residentList, opts);
  return r.model;
}

/**
 * Run a prompt on Ollama, streaming.
 *
 * Returns an EventEmitter shaped like a ChildProcess on purpose: `spawn`,
 * `close`, `.kill()`. seamless.js then treats local and cloud identically —
 * same ledger events, same registry, same cancel path, same watchdog.
 */
function runLocal({ hostStr, model, prompt, outStream, errStream, options }) {
  const { host, port } = hostPort(hostStr);
  const em = new EventEmitter();
  const t0 = Date.now();
  let killed = false;
  let req = null;
  let pensamento = '';        // o que os modelos de raciocínio emitem em `thinking`
  let avisadoDoLimite = false;

  const write = (obj) => { try { outStream.write(JSON.stringify(obj) + '\n'); } catch { /* */ } };
  const werr = (s) => { try { errStream.write(s + '\n'); } catch { /* */ } };

  /**
   * ── ONDA 1.1/1.2 (2026-07-26) — o contexto deixou de ser truncado em silêncio ──
   *
   * Medido hoje via /api/ps: `context_length: 4096` — o DEFAULT do Ollama,
   * porque nunca enviámos `num_ctx`. O A3 lia ficheiros para dar olhos ao
   * modelo e o Ollama cortava-os fora sem dizer nada. Todo o esforço de
   * injecção alimentava uma janela que não o comportava.
   *
   * Agora: `num_ctx` calculado a partir do prompt real (mínimo 16384), com
   * tecto configurável; se mesmo assim não couber, o corte é DITO — no stderr,
   * no init e no result — com números, nunca `null`.
   *
   * `keep_alive` evita pagar 18 GB de recarregamento a cada troca de job.
   * `num_batch`: n/d — sem medição própria não se afina às cegas.
   */
  const charsPrompt = String(prompt || '').length;
  const tokensEstimados = Math.ceil(charsPrompt / 3.5);   // ESTIMATIVA, e diz-se
  const tetoCtx = Math.max(16384, Number(process.env.MOOTER_NUM_CTX_MAX) || 32768);
  const numCtx = Math.min(Math.max(16384, tokensEstimados + 2048), tetoCtx);
  const keepAlive = process.env.MOOTER_KEEP_ALIVE || '10m';
  const contextoTruncado = (tokensEstimados + 2048) > tetoCtx
    ? { chars_prompt: charsPrompt, tokens_estimados: tokensEstimados, num_ctx: tetoCtx,
        nota: 'estimativa ~3,5 chars/token; o que passar do num_ctx é cortado pelo Ollama' }
    : null;
  if (contextoTruncado) {
    werr('⚠️ contexto de ~' + tokensEstimados + ' tokens excede num_ctx=' + tetoCtx + ' — o excedente será truncado pelo Ollama');
  }

  // Mirror the cloud agents' first event so telemetry.js needs no special case.
  write({ type: 'system', subtype: 'init', model, session_id: 'moo-' + t0.toString(36), local: true, host: hostStr,
    num_ctx: numCtx, keep_alive: keepAlive, contexto_truncado: contextoTruncado });

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    keep_alive: keepAlive,
    options: Object.assign({ temperature: 0.2, num_ctx: numCtx }, options || {}),
  });

  setImmediate(() => em.emit('spawn'));

  try {
    req = http.request(
      { host, port, path: '/api/chat', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
      (res) => {
        let buf = '';
        let text = '';
        let lastEmit = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buf += chunk;
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let j;
            try { j = JSON.parse(line); } catch { continue; }
            if (j.message && j.message.content) text += j.message.content;
            /**
             * ⚠️ O "A PENSAR" DE OITO MINUTOS SEM UM ÚNICO TOKEN.
             *
             * Medido a 2026-07-26: o `qwen3:30b` correu 529 s e o painel mostrou
             * `a pensar` com `tok_s: null` do princípio ao fim. Não era falha do
             * painel — era daqui.
             *
             * Modelos de raciocínio emitem o raciocínio no campo `thinking` do
             * Ollama, não em `content`. Esta linha só somava `content`, por isso
             * `text` ficava VAZIO durante todo o raciocínio e a moldura de
             * progresso saía sem nada dentro. Do lado de fora era
             * indistinguível de um job pendurado.
             *
             * Agora o raciocínio é contado e DITO como raciocínio. Um utilizador
             * que vê "a raciocinar · 12k caracteres" sabe que está vivo; um que
             * vê "a pensar" durante oito minutos vai matar o processo.
             */
            if (j.message && j.message.thinking) pensamento += j.message.thinking;

            /**
             * ⚠️ TRELA NO RACIOCÍNIO — apanhado ao vivo a 2026-07-26.
             *
             * Um job de PREPARAÇÃO (o moo a amaciar o caminho ao agente pago,
             * a $0) chegou a **140 376 caracteres de raciocínio em 6 minutos**
             * e continuava. Um preparador que demora mais do que o trabalho que
             * prepara não poupa nada: atrasa. E o pior é que sem trela ele
             * ficava assim para sempre, com a GPU ocupada e o agente pago à
             * espera.
             *
             * A trela é sobre o RACIOCÍNIO, não sobre a resposta: quando estoura,
             * pedimos ao modelo para parar de pensar e responder já. Se nem isso
             * resultar, o watchdog do job trata do resto.
             *
             * ❌ Nunca cortar a resposta a meio — só o preâmbulo interno.
             */
            if (!avisadoDoLimite && !text && pensamento.length > MAX_RACIOCINIO) {
              avisadoDoLimite = true;
              werr('raciocínio passou os ' + MAX_RACIOCINIO + ' caracteres sem uma única palavra de resposta — a interromper');
              write({
                type: 'assistant', local: true, fase: 'raciocinio-cortado',
                message: { model, content: [{ type: 'text',
                  text: '⚠️ o modelo local raciocinou ' + pensamento.length + ' caracteres sem começar a responder. Interrompido.' }] },
                chars_raciocinio: pensamento.length,
              });
              try { req.destroy(); } catch { /* */ }
              em.emit('close', 0);
              return;
            }

            // throttle: one assistant frame per ~400ms keeps out.log small while
            // still letting the panel show live progress at its 3s cadence
            const now = Date.now();
            if (!j.done && now - lastEmit > 400) {
              lastEmit = now;
              const aRaciocinar = !text && pensamento;
              write({
                type: 'assistant', local: true,
                message: {
                  model,
                  content: [{ type: 'text', text: aRaciocinar
                    ? ('🤔 a raciocinar · ' + pensamento.length + ' caracteres até agora')
                    : text.slice(-400) }],
                  // ⚠️ CARACTERES, não tokens. O Ollama só reporta a contagem de
                  // tokens na mensagem final; inventar um número aqui seria pior
                  // do que não ter nenhum. O nome do campo diz o que é.
                  usage: { output_chars_partial: text.length + pensamento.length },
                },
                fase: aRaciocinar ? 'raciocinio' : 'resposta',
                chars_raciocinio: pensamento.length,
                chars_resposta: text.length,
              });
            }

            if (j.done) {
              const evalCount = j.eval_count != null ? j.eval_count : null;
              const promptCount = j.prompt_eval_count != null ? j.prompt_eval_count : null;
              const evalNs = j.eval_duration != null ? j.eval_duration : null;
              const tok_s = (evalCount != null && evalNs) ? Math.round(evalCount / (evalNs / 1e9)) : null;
              write({
                type: 'assistant', local: true,
                message: { model, content: [{ type: 'text', text }], usage: { input_tokens: promptCount, output_tokens: evalCount } },
              });
              write({
                type: 'result', subtype: 'success', local: true, model,
                result: text,
                // Onda 1.2 — se houve corte, ele viaja até ao fim, com números
                contexto_truncado: contextoTruncado,
                num_ctx: numCtx,
                // Zero API cost — measured, not unknown: Ollama bills nothing.
                // NOT zero real cost: electricity and wear exist. We report what
                // we can measure and name it precisely instead of saying "free".
                total_cost_usd: 0,
                cost_note: 'custo de API = 0 (inferência local). Energia e desgaste não estão medidos — não são zero.',
                num_turns: 1,
                usage: { input_tokens: promptCount, output_tokens: evalCount },
                ollama: {
                  eval_count: evalCount,
                  prompt_eval_count: promptCount,
                  eval_duration_ns: evalNs,
                  prompt_eval_duration_ns: j.prompt_eval_duration != null ? j.prompt_eval_duration : null,
                  total_duration_ns: j.total_duration != null ? j.total_duration : null,
                  load_duration_ns: j.load_duration != null ? j.load_duration : null,
                  tok_s,
                  // quanto do trabalho foi raciocínio que nunca chegou a ver-se
                  chars_raciocinio: pensamento.length || null,
                  chars_resposta: text.length,
                },
              });
            }
          }
        });
        res.on('end', () => { try { outStream.end(); } catch { /* */ } em.emit('close', killed ? 137 : 0); });
        res.on('error', (e) => { werr('stream error: ' + ((e && e.message) || e)); em.emit('close', 1); });
      }
    );
    req.on('error', (e) => {
      werr('ollama inalcançável em ' + hostStr + ': ' + ((e && e.message) || e));
      write({ type: 'result', subtype: 'error', local: true, model, result: 'ollama inalcançável: ' + ((e && e.message) || e) });
      try { outStream.end(); } catch { /* */ }
      em.emit('close', 1);
    });
    req.write(payload);
    req.end();
  } catch (e) {
    werr('falha ao iniciar: ' + ((e && e.message) || e));
    setImmediate(() => em.emit('close', 1));
  }

  em.kill = () => { killed = true; try { req && req.destroy(); } catch { /* */ } };
  em.stdout = { pipe() { /* we write to outStream ourselves */ } };
  em.stderr = { pipe() { /* idem */ } };
  return em;
}

module.exports = {
  MAX_RACIOCINIO,
  pickModelExplained,
  familiaVersao, pontuar, TAREFA_CODIGO_RE, CODER_RE,
  bytesDe, runLocal, listModels, pickModel, hostPort, isGenerative, EMBED_RE };
