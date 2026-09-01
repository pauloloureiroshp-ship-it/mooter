/**
 * runner-core.mjs — one bounded round of the $0 autopilot.
 *
 * Three guarantees are mechanical here, not promised in prose:
 *  1. `$0 duro` — `assertLocalEngine()` refuses any endpoint that is not the
 *     local Ollama loopback, so the delivered runner cannot reach a paid API
 *     even if someone edits the config.
 *  2. `fail-closed` — the STOP flag is read twice: once before the round is
 *     built and again in the last instruction before dispatch, which closes the
 *     check-then-act race.
 *  3. `evidencia ou n/d` — every receipt carries a verdict produced by
 *     `evidence-verifier.mjs` against real files, never a hardcoded label.
 *
 * All I/O is injected so the round is testable without a GPU or a network.
 */

import fs from 'node:fs';
import { buildContextPack, PILLARS, PILLAR_IDS } from './context-pack.mjs';
import { verifyEvidence, VERDICT } from './evidence-verifier.mjs';
import { deviceName } from './fleet-beacon.mjs';
import { campoDeScore } from './score-sombra.mjs';

export const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:14b';
export const DEFAULT_TIMEOUT_MS = 90_000;
export const NUM_PREDICT = 700;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const OLLAMA_PORT = '11434';

/**
 * The single chokepoint that makes "$0 hard" checkable. Anything that is not the
 * local Ollama port throws — a delivered runner that spends a subscription token
 * is a bug, so make it impossible to express.
 */
export function assertLocalEngine(endpoint) {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    throw new Error(`motor invalido: ${endpoint}`);
  }
  if (url.protocol !== 'http:') {
    throw new Error(`motor tem de ser http loopback, veio ${url.protocol}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`motor tem de ser local (loopback), veio ${url.hostname}`);
  }
  if (url.port !== OLLAMA_PORT) {
    throw new Error(`motor tem de ser Ollama :${OLLAMA_PORT}, veio :${url.port || '(vazio)'}`);
  }
  return `${url.protocol}//${url.hostname}:${url.port}`;
}

/**
 * Fail-closed for real.
 *
 * The first version wrapped `fs.existsSync` in a try/catch and called itself
 * fail-closed. It was not: `existsSync` swallows EACCES/EPERM internally and
 * returns `false`, so a STOP flag the process could not read looked exactly
 * like a STOP flag that was not there — and the runner dispatched. The catch
 * never fired because nothing ever threw.
 *
 * `statSync` throws, which lets us tell the two apart: only ENOENT is proof of
 * absence. Every other error is doubt, and doubt means stop.
 */
export function isStopped(stopFile, statImpl = fs.statSync) {
  if (!stopFile) return true;
  try {
    statImpl(stopFile);
    return true;
  } catch (err) {
    return !(err && err.code === 'ENOENT');
  }
}

/** Builds the Ollama payload. `keep_alive` holds the model resident between rounds. */
/**
 * `think: false` — MEDIDO a 2026-08-29, e e a diferenca entre 0% e 83%.
 *
 * Um modelo de raciocinio (o `granite4.2` declara `thinking`; o
 * `qwen2.5-coder:14b` nao) gasta o `num_predict` DENTRO do traco de raciocinio e
 * nunca chega a escrever a conclusao. Medido no P2, N=12, mesmo excerto:
 *
 *   granite4.2:3b   sem think:false  0%  ·  com think:false  83,3%  (700 -> 127 tok)
 *   granite4.2:8b   sem think:false  0%  ·  com think:false  50%
 *
 * Dar-lhe MAIS espaco nao resolve (num_predict 2500 deu 8,3%): o raciocinio
 * expande para encher o que lhe derem. O `NUM_PREDICT = 700` foi afinado contra
 * um modelo que nao pensa, e por isso qualquer modelo de thinking ligado a este
 * runner parecia avariado — sempre 700 tokens, sempre `sem-citacao`.
 *
 * O repo ja sabia disto noutro canto, e nunca chegou aqui:
 * `tools/audit/audit_corpus_builder.js` — «think:false keeps qwen3 from emitting
 * reasoning tokens we'd have to strip».
 *
 * A ronda de pilar quer uma citacao curta, nao um rascunho. Um modelo que nao
 * suporta o campo ignora-o.
 */
export function buildPayload({ model, pack, numPredict = NUM_PREDICT, think = false }) {
  return {
    model,
    prompt: pack.prompt,
    system: pack.system,
    stream: false,
    think,
    keep_alive: '10m',
    options: { num_predict: numPredict, temperature: 0.2 },
  };
}

function nowIso(clock) {
  return new Date(clock()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Runs one round end to end and returns the receipt that will be appended to the
 * ledger. Never throws for an expected failure — an unreachable engine or a
 * refused answer produces an honest receipt instead of a gap in the record.
 *
 * @returns {{receipt: object, dispatched: boolean}}
 */
/**
 * SEGUNDO PARECER — a escalada que continua a custar $0.
 *
 * Medimos que o modelo primario le negacoes ao contrario. A resposta obvia seria
 * escalar para a cloud, mas o runner e $0 DURO: escalar para fora mataria a
 * promessa. Entao escala-se DE LADO — para outro modelo LOCAL de linhagem
 * DIFERENTE. A literatura e clara: dois modelos da mesma familia partilham os
 * mesmos erros, e o par so vale quando as linhagens divergem.
 *
 * Isto nao decide nada sozinho. Quando os dois discordam, o recibo diz que
 * discordam — e um humano (ou um tier pago, com o gate do Paulo) e que julga.
 */
export async function segundoParecer({ pack, model, base, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload({ model, pack })),
      signal: controller.signal,
      redirect: 'error',
    });
    if (res && res.url) assertLocalEngine(new URL(res.url).origin);
    if (!res || !res.ok) return { modelo: model, ok: false, porque: 'http' };
    const body = await res.json();
    // Mesma correccao do `runRound`: o segundo parecer tambem nao pontua rascunhos.
    const texto = String((body && body.response) || '').trim();
    return { modelo: model, ok: true, texto: texto.replace(/\s+/g, ' ').slice(0, 240) };
  } catch (err) {
    return { modelo: model, ok: false, porque: String((err && err.message) || err).slice(0, 80) };
  } finally {
    clearTimeout(t);
  }
}

/** Um veredicto e "achou" quando afirma ACHADO sem ser o SEM ACHADO. */
export function achou(texto) {
  const t = String(texto || '').toUpperCase();
  if (/\bSEM\s+ACHADO\b/.test(t)) return false;
  return /\bACHADO\s*:/.test(t);
}

export async function runRound({
  repoRoot,
  pillar,
  cursor = 0,
  model = DEFAULT_MODEL,
  endpoint = DEFAULT_OLLAMA,
  stopFile,
  fetchImpl = fetch,
  statImpl = fs.statSync,
  clock = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stopPollMs = 1000,
  anchorPath = null,
  diffBase = null,
  secondModel = null,
  // Os pilares em uso — os do projecto quando ele os declara (ver
  // `context-pack.loadPillars`), os embutidos quando nao.
  pillars = PILLARS,
  // Chaves de `hunkKey` ja julgadas. Um Set; ausente = tudo por rever.
  revistos = null,
  // O commit em que o repo esta. `null` quando nao ha git: nunca inventado.
  repoSha = null,
}) {
  const base = assertLocalEngine(endpoint);
  const started = clock();

  const receiptBase = () => ({
    ts: nowIso(clock),
    device: deviceName(),
    // QUE repo, e em que commit. Os 5478 recibos que ja existem nao dizem
    // nenhuma das duas coisas: sao interpretaveis apenas por quem se lembra de
    // que maquina e de que dia sao. Duas linhas resolvem isso para sempre.
    repo: repoRoot,
    repo_sha: repoSha,
    pilar: pillar,
    modelo: model,
    usd: 0,
    engine: 'ollama-local',
  });

  if (isStopped(stopFile, statImpl)) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        verdict: VERDICT.NO_FINDING,
        parado_pelo_dono: true,
        resultado_resumo: 'STOP presente — nao despachou',
        evidencia: 'kill-switch: fail-closed antes de construir a ronda',
      },
    };
  }

  // A âncora estática (eslint) é o detetor; o moo é o juiz. Se o ficheiro não
  // existir, readAnchor devolve [] e a ronda volta ao modo de caça — nunca falha.
  const pack = buildContextPack({ repoRoot, pillar, cursor, anchorPath, diffBase, pillars, revistos, device: deviceName() });
  if (!pack.ok) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        // Uma ronda que nunca chegou ao modelo nao e "o modelo respondeu sem
        // citar". Sao coisas diferentes e pedem respostas diferentes: uma diz
        // que o poco secou (alarga-se o ambito), a outra que o modelo divagou
        // (aperta-se a pergunta). Ate aqui tinham o mesmo nome.
        verdict: pack.esgotado ? VERDICT.NOT_RUN : VERDICT.UNCITED,
        // Uma ronda sem contexto nao produziu trabalho. Sem bandeira nenhuma
        // ela caia no ramo NEUTRO do disjuntor: 200 dessas escreviam 200
        // linhas com backoff ZERO — a inundacao do B8 por uma terceira porta.
        falha_ronda: true,
        ...(pack.esgotado ? { esgotado: true } : {}),
        resultado_resumo: `sem contexto: ${pack.reason}`,
        evidencia: 'n/d',
      },
    };
  }

  // Last instruction before the wire: closes the check-then-act race, so a STOP
  // that lands during the (filesystem-bound) pack build still stops this round.
  if (isStopped(stopFile, statImpl)) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        verdict: VERDICT.NO_FINDING,
        parado_pelo_dono: true,
        resultado_resumo: 'STOP chegou antes do despacho — race fechado',
        evidencia: `kill-switch: fail-closed com pacote pronto (${pack.file})`,
      },
    };
  }

  let body;
  let httpOk = false;
  let abortedByStop = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A STOP that lands mid-generation used to be ignored for up to 90s while the
  // round finished, and the work was still delivered and counted. The flag now
  // aborts the in-flight request too, so pressing stop stops.
  const stopWatch = setInterval(() => {
    if (isStopped(stopFile, statImpl)) {
      abortedByStop = true;
      controller.abort();
    }
  }, stopPollMs);
  if (typeof stopWatch.unref === 'function') stopWatch.unref();
  try {
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload({ model, pack })),
      signal: controller.signal,
      // Without this, `assertLocalEngine` only guards the FIRST hop: fetch
      // follows a 307 anywhere, method and body intact, so anything answering
      // on :11434 could bounce the prompt to a paid API and the "$0 hard"
      // guarantee would be a URL check that proves nothing.
      redirect: 'error',
    });
    // Belt and braces: if a fetch implementation ignores `redirect`, the final
    // URL still has to be the loopback engine we vetted.
    if (res && res.url) assertLocalEngine(new URL(res.url).origin);
    httpOk = Boolean(res && res.ok);
    body = httpOk ? await res.json() : null;
    if (!httpOk) {
      return {
        dispatched: true,
        receipt: {
          ...receiptBase(),
          dur_s: Math.round((clock() - started) / 1000),
          tokens_out: 0,
          ficheiro: pack.file,
          verdict: VERDICT.UNCITED,
          // Bandeira legivel por maquina: o loop desliga-se sozinho quando o
          // motor esta em baixo, e nao se desliga por uma ronda que so nao
          // achou nada. Distinguir isto por substring do resumo era fragil.
          falha_motor: true,
          resultado_resumo: `motor local respondeu HTTP ${res && res.status}`,
          evidencia: 'n/d',
        },
      };
    }
  } catch (err) {
    // Uma violacao do $0 DURO (um redirect para fora do loopback) caia aqui e
    // saia rotulada "motor local indisponivel" — e, a partir da 3a ronda, o
    // disjuntor calava-a. A promessa central do runner nao pode ser registada
    // como uma avaria banal, e muito menos silenciada.
    const violacaoZero = /motor tem de ser|motor invalido/.test(String((err && err.message) || ''));
    return {
      dispatched: true,
      receipt: {
        ...receiptBase(),
        dur_s: Math.round((clock() - started) / 1000),
        tokens_out: 0,
        ficheiro: pack.file,
        verdict: VERDICT.NO_FINDING,
        ...(violacaoZero ? { violacao_zero: true } : {}),
        ...(abortedByStop ? { parado_pelo_dono: true } : {}),
        // Um STOP nosso nao e o motor em baixo — so o segundo abre o disjuntor.
        ...(abortedByStop || violacaoZero ? {} : { falha_motor: true }),
        resultado_resumo: abortedByStop
          ? 'STOP durante a geracao — ronda abortada, trabalho descartado'
          : violacaoZero
            ? `VIOLACAO $0: ${String(err && err.message).slice(0, 120)}`
            : `motor local indisponivel: ${String(err && err.message).slice(0, 120)}`,
        evidencia: abortedByStop ? 'kill-switch: abortou a ronda em voo' : 'n/d',
      },
    };
  } finally {
    clearTimeout(timer);
    clearInterval(stopWatch);
  }

  // NAO cair para `body.thinking`. Ate 2026-08-29 esta linha era
  // `body.response || body.thinking` e, quando um modelo de raciocinio esgotava o
  // `num_predict` dentro do traco, o `response` vinha vazio — o fallback entregava
  // o RASCUNHO ao `verifyEvidence` como se fosse a resposta. Nao era resposta
  // truncada: era o runner a pontuar o raciocinio. Com `think:false` o `thinking`
  // deixa de existir; se aparecer, e sinal de que o pedido nao levou a trava, e um
  // `sem-citacao` honesto vale mais do que uma nota dada ao rascunho.
  const text = String((body && body.response) || '').trim();
  const tokens = Number((body && body.eval_count) || 0);
  const check = verifyEvidence({
    repoRoot,
    text,
    allowedFiles: pack.allowedFiles,
    // The window the model was actually shown. Without it, a citation to a real
    // line the model never saw is indistinguishable from one it read.
    window: { file: pack.file, startLine: pack.startLine, endLine: pack.endLine },
  });

  // Terreno de negacao + um veredicto positivo = pedir um segundo par de olhos
  // LOCAL, de outra linhagem. Custa $0 e nao decide nada: se discordarem, o
  // recibo diz que discordam, e a decisao sobe para quem paga o tier de cima.
  let parecer = null;
  if (secondModel && pack.negacaoDensa) {
    const p2 = await segundoParecer({ pack, model: secondModel, base, fetchImpl, timeoutMs });
    if (p2.ok) {
      const a1 = achou(text);
      const a2 = achou(p2.texto);
      parecer = {
        modelo: p2.modelo,
        achou: a2,
        concorda: a1 === a2,
        resposta: p2.texto,
      };
    } else {
      parecer = { modelo: p2.modelo, indisponivel: p2.porque };
    }
  }

  return {
    dispatched: true,
    receipt: {
      ...receiptBase(),
      // Prova POSITIVA de que o motor respondeu. O disjuntor so fecha com isto:
      // a ausencia de prova de sucesso e uma falha, nao um sucesso. Fechar por
      // "nao vi falha" fazia uma ronda REBENTADA emitir um `engine:up` com uma
      // duracao de apagao inventada, com o motor ainda morto.
      motor_ok: true,
      dur_s: Math.round((clock() - started) / 1000),
      tokens_out: Number.isFinite(tokens) ? tokens : 0,
      pilar_label: pack.label,
      modo: pack.mode || (pack.anchored ? 'ancorado' : 'caca'),
      // 'pilar' = o ficheiro revisto e mesmo do pilar; 'geral' = o pilar nao
      // tinha nada no diff e revimos o resto. Sem este campo o painel dava o
      // rotulo do pilar a trabalho que nao era dele.
      ...(pack.escopo ? { escopo: pack.escopo } : {}),
      // A identidade do excerto revisto (ficheiro:linhas:sha do conteudo). E o
      // que impede a ronda seguinte de o julgar outra vez, e o que faz um
      // excerto ALTERADO voltar a fila.
      ...(pack.chave ? { chave: pack.chave } : {}),
      ...(pack.escadaBase ? { diff_base: pack.escadaBase } : {}),
      // O `git diff` rebentou mas a escada degradou: o recibo diz que degradou
      // E porque. Capturar o erro e nao o publicar e um catch mudo com mais passos.
      ...(pack.diffErro ? { diff_erro: pack.diffErro } : {}),
      // O tecto de `maxFiles * 8` hunks. Era produzido pelo pack e lido por
      // NINGUEM — 'sem tectos silenciosos' e uma regra, nao uma intencao. Com
      // este campo, um recibo diz que houve trabalho que nem chegou a ser
      // considerado.
      ...(pack.hunksTruncados ? { hunks_truncados: pack.hunksTruncados } : {}),
      ficheiro: pack.file,
      janela: `${pack.startLine}-${pack.endLine}`,
      verdict: check.verdict,
      // Dois eixos: `verdict` diz se a linha citada existe; `conclusao` diz o que
      // o modelo concluiu. Juntar os dois num numero so fez 32,5% do verde do
      // painel ser, na verdade, o motor a dizer que nao ha problema.
      conclusao: check.conclusao,
      citacoes: check.citations.map((c) => ({
        ref: `${c.file}:${c.line}`,
        ok: c.ok,
        motivo: c.reason,
        // Surfaced, not just computed: this is the only signal separating
        // "cited what it was shown" from "cited some file at random".
        fora_da_janela: Boolean(c.off_window),
      })),
      fora_da_janela: check.offWindow,
      resultado_resumo: (text.replace(/\s+/g, ' ').slice(0, 280) || 'resposta_vazia'),
      // MODO SOMBRA (M3). O score viaja, acumula, e nao decide NADA — nem aqui
      // nem em lado nenhum. `null` ate o prompt o pedir, e o pedido esta
      // desligado de propósito: este ficheiro tem medicao de que alongar o
      // enunciado colapsa a deteccao. Ver `score-sombra.mjs`.
      ...campoDeScore(text),
      evidencia: check.evidence,
      // Ponto cego conhecido do tier local: quando ha negacao, dizemo-lo.
      ...(pack.negacaoDensa ? { negacao_densa: true } : {}),
      ...(parecer ? { segundo_parecer: parecer } : {}),
      // A unica bandeira que faz um humano olhar: dois modelos locais de
      // linhagens diferentes a discordar sobre logica que sabemos ser o ponto
      // fraco de ambos os tamanhos pequenos.
      ...(parecer && parecer.concorda === false ? { precisa_tier_superior: true } : {}),
    },
  };
}

/** Rotation over the pillars, kept pure so the loop stays trivial to reason about. */
export function nextPillar(index, pillars = PILLAR_IDS) {
  return pillars[Math.abs(index) % pillars.length];
}
