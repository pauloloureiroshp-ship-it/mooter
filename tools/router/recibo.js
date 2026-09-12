// recibo.js — o que se gastou, medido, atribuído ao que o router recomendou.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// Durante meses este projecto publicou «No tokens are logged, so there is no
// measured dollar figure». Era verdade sobre a telemetria do Mooter e **falso
// sobre a máquina**: o Claude Code escreve `message.usage` completo — input,
// output, `cache_read_input_tokens`, `cache_creation_input_tokens` e o modelo —
// em cada linha de `~/.claude/projects/**/*.jsonl`.
//
// Medido a 2026-09-12, só nos 40 transcripts mais recentes de 539, contando
// cada resposta da API UMA vez, com o máximo por campo (ver «uma linha não é
// uma chamada», abaixo), todos os modelos incluídos — também os 264 sem preço,
// que o impresso conta mas não soma:
//   7.782 linhas com usage = 4.290 respostas (1,81×)
//   5,62M de output · **1,42 mil milhões de cache-read**
//   (somadas por linha, como a medição de 2026-08-28 fazia: 11,7M e 2,55 mil milhões)
//
// O modelo de poupança deste projecto ignorava o cache por inteiro, e o cache é
// o maior condutor de custo que aqui existe.
//
// ─────────────────────────────────────────────────────────────────────────────
// UMA LINHA NÃO É UMA CHAMADA
//
// O Claude Code escreve UMA LINHA POR BLOCO DE CONTEÚDO da mesma resposta da
// API (thinking + text, text + tool_use), cada uma a repetir o mesmo
// `message.id`, o mesmo `requestId` e o `usage` completo. Medido a 2026-09-11
// (revisão adversarial do `tools/ab/correr-custo.mjs`, brief 164) em 3
// transcripts reais PRINCIPAIS: 294/495/99 linhas para 162/278/54 `message.id`
// distintos (1,76–1,81×), com o `usage` idêntico em todas as linhas do mesmo id
// nesses três (0 desvios em 336 ids multi-linha — nos subagentes não, ver
// abaixo). A primeira versão deste ficheiro somava linhas, e
// por isso sobrestimava tokens e preço de tabela em ~1,8×. Desde 2026-09-12
// conta-se por `message.id` (fallback `requestId`, depois `uuid`) e o impresso
// diz quantas linhas ficaram de fora.
//
// E ficar com a PRIMEIRA linha também não chega. O «usage idêntico» só vale
// para os transcripts principais: nos de subagentes
// (`<sessão>/subagents/agent-*.jsonl`) o `output_tokens` das primeiras linhas
// é o contador em streaming (1–7) e só a última linha traz o total. Medido a
// 2026-09-12 na janela dos 40: 631 dos 2.500 ids multi-linha diferem, todos em
// 21 ficheiros de subagente, só em `output_tokens`, e a última linha é o máximo
// em 631/631; no corpus inteiro, 1.498 de 14.435. First-wins subcontava o
// output em 18,3% (4,58M contra 5,61M) — apanhado pelo final-reviewer antes do
// push. Por isso a resposta leva o MÁXIMO por campo das suas linhas.
//
// ─────────────────────────────────────────────────────────────────────────────
// A CHAVE DE ATRIBUIÇÃO, E PORQUE NÃO É A ÓBVIA
//
// A primeira versão deste plano juntava tokens ao `decisions.log` por
// `session_id`. Medido a 2026-09-12, nas 195 sessões que têm decisão registada:
//
//     970 prompts classificados  →  11.878 respostas com usage  =  12,2 por prompt
//     (por linha, como se media a 2026-08-28: 23.384 = 24,1 por prompt; o «25 por
//      prompt» que aqui esteve era linhas, e vinha inflado ~2× pelo mesmo defeito)
//
// `session_id` prova CO-RESIDÊNCIA na sessão, não causalidade prompt→chamada.
// Dividir por ele reconstruía exactamente o defeito que matou o `0%` deste
// projecto — a auditoria de 2026-08-23 escreveu-o assim: «o denominador eram
// chamadas Bash, não prompts (26 por prompt)». Corrigido o dedup, o número é
// 12,2, e continua a não ser 1. É o mesmo defeito, com melhor arquitectura.
//
// A chave certa é a cadeia `parentUuid`. Cada registo do transcript aponta ao
// pai; subindo até ao **turno humano** mais próximo — ignorando os `tool_result`,
// que também são `type: "user"` — cada chamada fica atribuída a exactamente um
// prompt do utilizador. Medido a 2026-09-12 nos 25 transcripts mais recentes:
//
//     223 turnos humanos  ←  3.813 respostas  ·  0 órfãs (0,00%)
//     (+ 3.105 linhas repetidas do mesmo message.id, não somadas: 1,81×)
//
// Isso é causal por construção, e é a diferença entre um recibo e uma alegação.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ESTE FICHEIRO NÃO FAZ
//
// Não calcula «poupança». Não há aqui nenhum «terias gasto $X se não usasses o
// Mooter», porque isso não é mensurável: não se mede o que não aconteceu.
//
// O que ele produz é o par que NENHUM concorrente pode produzir:
//   · quanto custou, medido, por turno e por modelo (o `ccusage` também dá isto)
//   · o que o router tinha recomendado para esse mesmo turno (só o Mooter tem)
//
// E do cruzamento sai um número inteiramente medido dos dois lados: **quanto
// custou o trabalho onde o conselho foi ignorado**. Não é uma estimativa de
// poupança — é o conselho ignorado, contado.
//
// ────────────────────────────────────────────────────────────────────────────
// A DISTINÇÃO QUE ESTE FICHEIRO NÃO PODE PERDER
//
// A primeira corrida deu **$5.700** (inflado ~1,8× pelo defeito das linhas,
// ver acima — o ponto não depende do valor): seria uma mentira grave
// publicá-la como «gastaste $5.700».
//
// Estes tokens correram dentro de uma **subscrição de valor fixo** (Claude Max,
// $200/mês). O que o número mede é o que os mesmos tokens custariam a **preço
// de tabela da API**. Não saiu dinheiro nenhum por eles além da mensalidade.
//
// Chamar-lhe «custo» seria exactamente o defeito que este projecto passou uma
// semana a apagar, só que ao contrário: em vez de inflacionar a poupança,
// inflacionava a despesa. A regra não é «não exagerar a nosso favor» — é **não
// afirmar o que não se mediu**, em direcção nenhuma.
//
// Por isso a etiqueta é `EQUIVALENTE A PREÇO DE TABELA` em todo o lado, e nunca
// `custo`. O que ela vale é como régua: é o tamanho do trabalho, numa unidade
// que qualquer pessoa reconhece.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Preços ──────────────────────────────────────────────────────────────────
//
// A tabela base é `pricing.js`, o SSOT do repositório, e não se duplica aqui.
//
// O que `pricing.js` NÃO tem é preço de cache, e sem ele este recibo estaria a
// ignorar 1,42 mil milhões de tokens só na janela dos 40 (2026-09-12; 8,12 mil
// milhões no corpus inteiro). Os multiplicadores abaixo são os
// publicados pela Anthropic sobre o preço de input do próprio modelo, e ficam
// declarados como multiplicadores — não como preços inventados — para que
// qualquer um os possa conferir contra a tabela do fornecedor.
//
// A excepção declarada: quando uma linha de `pricing.js` traz `cacheRead`
// (USD/MTok), é esse o preço da leitura de cache, não o multiplicador. Existe
// porque o Fable 5.1 cobra a leitura a 0,025× do input ($0,25/MTok) e não a
// 0,1× — aplicar-lhe o multiplicador sobrestimava a cache 4× (tabela do
// fornecedor, lida a 2026-09-12).
const MULT_CACHE = Object.freeze({
  leitura: 0.1,     // cache read  — 10% do input
  escrita5m: 1.25,  // cache write, TTL 5 minutos  — 125% do input
  escrita1h: 2.0,   // cache write, TTL 1 hora     — 200% do input
});

function precos() {
  try { return require('./pricing.js'); } catch { return null; }
}

/**
 * Custo em dólares de um bloco `usage`, para um modelo.
 * Devolve `null` quando o modelo não está na tabela — **nunca** um palpite.
 * Um custo em falta tem de ser visível como falta, não diluído num total.
 */
function custoDe(modelo, usage) {
  const P = precos();
  if (!P || !modelo || !usage) return null;
  const p = P.PRICES && P.PRICES[modelo];
  if (!p) return null;

  const M = 1e6;
  const inTok    = usage.input_tokens || 0;
  const outTok   = usage.output_tokens || 0;
  const leitura  = usage.cache_read_input_tokens || 0;
  // A criação de cache vem discriminada por TTL quando o fornecedor a
  // discrimina; quando não vem, trata-se como 5m (o mais barato dos dois), para
  // que um dado em falta nunca inflacione o custo a nosso favor.
  const cc  = usage.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens
    || Math.max(0, (usage.cache_creation_input_tokens || 0) - w1h);

  return {
    input:      (inTok   / M) * p.input,
    output:     (outTok  / M) * p.output,
    cacheLer:   (leitura / M) * (p.cacheRead != null ? p.cacheRead : p.input * MULT_CACHE.leitura),
    cacheEscr:  (w5m / M) * p.input * MULT_CACHE.escrita5m
              + (w1h / M) * p.input * MULT_CACHE.escrita1h,
    get total() {
      return this.input + this.output + this.cacheLer + this.cacheEscr;
    },
    tokens: { input: inTok, output: outTok, cacheLer: leitura, cacheEscr5m: w5m, cacheEscr1h: w1h },
  };
}

// ── Leitura dos transcripts ─────────────────────────────────────────────────

function raizProjectos(home) {
  return path.join(home || os.homedir(), '.claude', 'projects');
}

/** Todos os transcripts, mais recentes primeiro. Nunca lança. */
function transcripts(home) {
  const raiz = raizProjectos(home);
  const out = [];
  (function andar(d, prof) {
    if (prof > 3) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p, prof + 1);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  })(raiz, 0);
  try { out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); } catch { /* ordem best-effort */ }
  return out;
}

/**
 * Um turno humano é um registo `type: "user"` cuja mensagem NÃO é um
 * `tool_result`.
 *
 * Esta distinção é a que faz a atribuição funcionar. No transcript do Claude
 * Code, o resultado de cada ferramenta volta como `type: "user"` — tratá-los
 * como turnos partiria cada prompt em dezenas de pedaços e o recibo diria que
 * um prompt custou um trigésimo do que custou.
 */
function ehTurnoHumano(o) {
  if (!o || o.type !== 'user' || !o.message) return false;
  if (o.toolUseResult) return false;
  const c = o.message.content;
  if (typeof c === 'string') return c.length > 0;
  if (Array.isArray(c)) return !c.some(b => b && b.type === 'tool_result');
  return false;
}

/** Só os campos que `custoDe` lê, para a fusão ser por valor e não por forma. */
function copiarUsage(u) {
  const cc = u.cache_creation || {};
  return {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
    cache_creation: {
      ephemeral_5m_input_tokens: cc.ephemeral_5m_input_tokens || 0,
      ephemeral_1h_input_tokens: cc.ephemeral_1h_input_tokens || 0,
    },
  };
}

/** Máximo por campo: a última linha de uma resposta é a que traz o total. */
function fundirUsage(alvo, u) {
  const n = copiarUsage(u);
  for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
    if (n[k] > alvo[k]) alvo[k] = n[k];
  }
  for (const k of ['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens']) {
    if (n.cache_creation[k] > alvo.cache_creation[k]) alvo.cache_creation[k] = n.cache_creation[k];
  }
  return alvo;
}

/**
 * Lê um transcript e devolve um turno humano por entrada, com o custo medido
 * de TODAS as chamadas que dele descendem.
 *
 * Cada resposta da API conta UMA vez. O Claude Code escreve uma linha por
 * bloco de conteúdo da mesma resposta (thinking + text, text + tool_use), cada
 * uma a repetir o mesmo `message.id` e `requestId` — somar linhas dava ~1,8× o
 * facturado (medido a 2026-09-11 em 3 transcripts reais: 294/495/99 linhas
 * para 162/278/54 ids). A chave é `message.id` (fallback `requestId`, depois
 * `uuid`), a mesma de `tokensDoTranscript` em `tools/ab/correr-custo.mjs`
 * (#508), e a mesma fusão: o usage da resposta é o MÁXIMO por campo das suas
 * linhas, porque nos subagentes a 1.ª linha traz o `output_tokens` em
 * streaming (ver o cabeçalho). `linhas_repetidas` fica no resultado para o
 * impresso o dizer.
 *
 * @returns {{sessao:string, turnos:Array, orfas:number, linhas_repetidas:number}}
 */
function lerTranscript(ficheiro) {
  const registos = [];
  let bruto = '';
  try { bruto = fs.readFileSync(ficheiro, 'utf8'); } catch { return { sessao: null, turnos: [] }; }
  for (const l of bruto.split('\n')) {
    if (!l.trim()) continue;
    try { registos.push(JSON.parse(l)); } catch { /* linha truncada — ignora-se */ }
  }
  if (!registos.length) return { sessao: null, turnos: [] };

  const porUuid = new Map();
  for (const o of registos) if (o.uuid) porUuid.set(o.uuid, o);

  const turnos = new Map();
  const registarTurno = (o) => {
    if (!turnos.has(o.uuid)) {
      turnos.set(o.uuid, {
        uuid: o.uuid,
        ts: Date.parse(o.timestamp || '') || null,
        chamadas: 0,
        custo: 0,
        semPreco: 0,
        porModelo: {},
        tokens: { input: 0, output: 0, cacheLer: 0, cacheEscr: 0 },
      });
    }
    return turnos.get(o.uuid);
  };

  // Subir a cadeia até ao turno humano mais próximo.
  const turnoDe = (o) => {
    let n = o, guarda = 0;
    while (n && guarda++ < 10000) {
      if (ehTurnoHumano(n)) return n;
      if (!n.parentUuid) return null;
      const pai = porUuid.get(n.parentUuid);
      if (!pai) return null;
      n = pai;
    }
    return null;
  };

  // 1.ª passagem: uma resposta por chave, com o usage FUNDIDO pelo máximo de
  // cada campo. Não basta ficar com a 1.ª linha: nos transcripts de subagentes
  // (`<sessão>/subagents/agent-*.jsonl`) o bloco `apiBlockIndex: 0` traz o
  // `output_tokens` em streaming (1–7) e só o último bloco traz o valor final
  // — ver o cabeçalho, «uma linha não é uma chamada».
  let orfas = 0, linhasRepetidas = 0;
  const respostas = new Map();
  for (const o of registos) {
    const u = o.message && o.message.usage;
    if (!u) continue;
    const chave = o.message.id || o.requestId || o.uuid || o;
    const r = respostas.get(chave);
    if (!r) { respostas.set(chave, { o, usage: copiarUsage(u) }); continue; }
    linhasRepetidas++;
    fundirUsage(r.usage, u);
  }

  // 2.ª passagem: atribuir cada resposta ao turno humano de que descende.
  for (const { o, usage: u } of respostas.values()) {
    const t = turnoDe(o);
    if (!t) { orfas++; continue; }
    const alvo = registarTurno(t);
    const modelo = o.message.model || 'desconhecido';
    const c = custoDe(modelo, u);
    alvo.chamadas++;
    if (!c) {
      // Modelo fora da tabela: conta-se a chamada e diz-se que não tem preço.
      // Somar zero silenciosamente faria o recibo parecer mais barato do que é.
      alvo.semPreco++;
    } else {
      alvo.custo += c.total;
      alvo.tokens.input     += c.tokens.input;
      alvo.tokens.output    += c.tokens.output;
      alvo.tokens.cacheLer  += c.tokens.cacheLer;
      alvo.tokens.cacheEscr += c.tokens.cacheEscr5m + c.tokens.cacheEscr1h;
      alvo.porModelo[modelo] = (alvo.porModelo[modelo] || 0) + c.total;
    }
  }

  return {
    sessao: path.basename(ficheiro).replace(/\.jsonl$/, ''),
    turnos: [...turnos.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    orfas,
    linhas_repetidas: linhasRepetidas,
  };
}

// ── O lado do router ────────────────────────────────────────────────────────

/** As recomendações, por sessão, ordenadas no tempo. Nunca lança. */
function lerDecisoes(home) {
  const f = path.join(home || os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
  const porSessao = new Map();
  let bruto = '';
  try { bruto = fs.readFileSync(f, 'utf8'); } catch { return porSessao; }
  for (const l of bruto.split('\n')) {
    if (!l.trim()) continue;
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    // O log tem linhas que fazem parse para `null` (um `null` literal escrito
    // por um caminho de erro antigo). `JSON.parse` aceita-as sem lançar, e o
    // acesso seguinte é que rebenta — por isso a guarda é aqui e não no catch.
    if (!o || typeof o !== 'object') continue;
    if (o.event !== 'classified' || !o.session_id) continue;
    if (!porSessao.has(o.session_id)) porSessao.set(o.session_id, []);
    porSessao.get(o.session_id).push({
      ts: o.ts_ms || Date.parse(o.ts || '') || null,
      tier: o.tier || null,
      modelo: o.recommended_model || null,
      backend: o.recommended_backend || null,
    });
  }
  for (const arr of porSessao.values()) arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return porSessao;
}

/**
 * Casa cada turno com a recomendação que o classificador emitiu para ele.
 *
 * O hook corre ANTES do modelo ver o prompt, portanto a decisão precede sempre
 * o turno. Escolhe-se a decisão mais recente **antes** do turno, dentro de uma
 * janela — fora dela não se casa nada e diz-se `null`.
 *
 * `JANELA_MS` a 30s: o hook é síncrono e completa em ~122 ms p50 (medido, 660
 * amostras). 30 segundos é folga de duas ordens de grandeza, e é curto o
 * bastante para não roubar a decisão do turno anterior num diálogo rápido.
 */
const JANELA_MS = 30_000;

function casar(turnos, decisoes) {
  if (!decisoes || !decisoes.length) return turnos.map(t => ({ ...t, decisao: null }));
  return turnos.map(t => {
    if (!t.ts) return { ...t, decisao: null };
    let melhor = null;
    for (const d of decisoes) {
      if (!d.ts || d.ts > t.ts) break;         // ordenadas: passou o turno, pára
      if (t.ts - d.ts <= JANELA_MS) melhor = d; // a mais recente dentro da janela
    }
    return { ...t, decisao: melhor };
  });
}

// ── O recibo ────────────────────────────────────────────────────────────────

const TIERS_BARATOS = new Set(['T0', 'T1']);

/**
 * @param {{home?:string, limite?:number}} [opts] `limite` = quantos transcripts
 *        ler, mais recentes primeiro. Sem limite, lê todos.
 */
function recibo(opts = {}) {
  const home = opts.home;
  const decisoesPorSessao = lerDecisoes(home);
  const fich = transcripts(home);
  const usados = opts.limite ? fich.slice(0, opts.limite) : fich;

  const r = {
    transcriptsLidos: usados.length,
    transcriptsTotais: fich.length,
    turnos: 0,
    chamadas: 0,
    chamadasSemPreco: 0,
    orfas: 0,
    linhasRepetidas: 0,
    custoTotal: 0,
    porModelo: {},
    tokens: { input: 0, output: 0, cacheLer: 0, cacheEscr: 0 },
    // O cruzamento — só conta turnos que TÊM recomendação.
    comDecisao: 0,
    recomendadoBarato: { turnos: 0, custo: 0 },
    recomendadoCaro:   { turnos: 0, custo: 0 },
    primeiroTs: null,
    ultimoTs: null,
  };

  for (const f of usados) {
    const { sessao, turnos, orfas, linhas_repetidas } = lerTranscript(f);
    r.orfas += orfas || 0;
    r.linhasRepetidas += linhas_repetidas || 0;
    const casados = casar(turnos, decisoesPorSessao.get(sessao));
    for (const t of casados) {
      r.turnos++;
      r.chamadas += t.chamadas;
      r.chamadasSemPreco += t.semPreco;
      r.custoTotal += t.custo;
      for (const [m, v] of Object.entries(t.porModelo)) r.porModelo[m] = (r.porModelo[m] || 0) + v;
      r.tokens.input     += t.tokens.input;
      r.tokens.output    += t.tokens.output;
      r.tokens.cacheLer  += t.tokens.cacheLer;
      r.tokens.cacheEscr += t.tokens.cacheEscr;
      if (t.ts) {
        if (!r.primeiroTs || t.ts < r.primeiroTs) r.primeiroTs = t.ts;
        if (!r.ultimoTs   || t.ts > r.ultimoTs)   r.ultimoTs   = t.ts;
      }
      if (t.decisao && t.decisao.tier) {
        r.comDecisao++;
        const alvo = TIERS_BARATOS.has(t.decisao.tier) ? r.recomendadoBarato : r.recomendadoCaro;
        alvo.turnos++;
        alvo.custo += t.custo;
      }
    }
  }
  return r;
}

/**
 * O recibo em texto. Sem uma única percentagem de poupança — porque não há
 * poupança medida — e com o denominador colado a cada número.
 */
function imprimir(r) {
  const usd = (v) => `$${v.toFixed(2)}`;
  const mil = (n) => n.toLocaleString('en-US');
  const L = [];
  L.push('');
  L.push('  🐮 RECIBO — o trabalho feito, em tokens medidos');
  L.push('  ' + '─'.repeat(66));
  if (r.primeiroTs && r.ultimoTs) {
    L.push(`  janela      ${new Date(r.primeiroTs).toISOString().slice(0, 16)}Z → ${new Date(r.ultimoTs).toISOString().slice(0, 16)}Z`);
  }
  L.push(`  fonte       ${r.transcriptsLidos} de ${r.transcriptsTotais} transcripts · ~/.claude/projects/**/*.jsonl`);
  L.push(`  atribuição  cadeia parentUuid → turno humano · ${r.orfas} chamada(s) órfã(s)`);
  L.push(`  dedup       1 resposta por message.id · ${mil(r.linhasRepetidas)} linha(s) repetida(s) não somada(s)`);
  L.push('');
  L.push(`  ${r.turnos} turnos humanos  ←  ${mil(r.chamadas)} chamadas à API  (${(r.chamadas / Math.max(1, r.turnos)).toFixed(1)} por turno)`);
  L.push('');
  L.push(`  EQUIVALENTE A PREÇO DE TABELA DA API             ${usd(r.custoTotal).padStart(12)}`);
  L.push('    (tokens medidos x preço público. NÃO é despesa: isto correu dentro de');
  L.push('     uma subscrição de valor fixo, e nenhum dólar saiu por estes tokens.)');
  const porM = Object.entries(r.porModelo).sort((a, b) => b[1] - a[1]);
  for (const [m, v] of porM) {
    L.push(`    ${m.padEnd(46)}${usd(v).padStart(12)}`);
  }
  if (r.chamadasSemPreco) {
    L.push(`    ⚠️  ${r.chamadasSemPreco} chamada(s) de modelo sem preço na tabela — NÃO somadas`);
  }
  L.push('');
  L.push('  TOKENS');
  L.push(`    input ${mil(r.tokens.input).padStart(14)}   output ${mil(r.tokens.output).padStart(14)}`);
  L.push(`    cache lido ${mil(r.tokens.cacheLer).padStart(9)}   cache escrito ${mil(r.tokens.cacheEscr).padStart(9)}`);
  L.push('');
  if (r.comDecisao) {
    L.push(`  O QUE O ROUTER TINHA RECOMENDADO  (${r.comDecisao} de ${r.turnos} turnos casados)`);
    L.push(`    tier barato (T0/T1)   ${String(r.recomendadoBarato.turnos).padStart(5)} turnos   ${usd(r.recomendadoBarato.custo).padStart(12)}`);
    L.push(`    tier caro   (T2/T3)   ${String(r.recomendadoCaro.turnos).padStart(5)} turnos   ${usd(r.recomendadoCaro.custo).padStart(12)}`);
    L.push('');
    L.push(`    ↑ os ${usd(r.recomendadoBarato.custo)} da primeira linha são o tamanho, medido, do`);
    L.push('      trabalho que o router disse que podia ter corrido barato.');
    L.push('      Não é poupança nem despesa: é o conselho ignorado, contado.');
  } else {
    L.push('  O QUE O ROUTER TINHA RECOMENDADO   n/d — nenhum turno casou com uma');
    L.push('  decisão do `decisions.log` (sessões anteriores ao registo, ou sem hook).');
  }
  L.push('');
  L.push('  Não há aqui nenhuma percentagem de poupança. Poupança seria o preço');
  L.push('  do que NÃO aconteceu, e isso não se mede — mede-se o que aconteceu.');
  L.push('');
  return L.join('\n');
}

module.exports = {
  MULT_CACHE,
  JANELA_MS,
  custoDe,
  ehTurnoHumano,
  lerTranscript,
  lerDecisoes,
  casar,
  transcripts,
  recibo,
  imprimir,
};

if (require.main === module) {
  const lim = process.argv.includes('--todos') ? 0 : 40;
  process.stdout.write(imprimir(recibo({ limite: lim || undefined })) + '\n');
}
