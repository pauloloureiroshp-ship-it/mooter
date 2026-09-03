'use strict';

// decisions_v2.js — Wave 19 (19.B): structured per-call decision log.
//
// A richer companion to decisions.log: one JSON line per routed decision, shaped
//   { ts, op, tier, llm, tokens_in, tokens_out, reason, via }
// `mooter trail --calls` reads it for a per-call breakdown. The legacy
// decisions.log writer is left untouched — this is an additive DUAL write, so
// every existing reader (statusline, backtest, `mooter trail`) keeps working.
//
// PRIVACY: records carry ONLY routing metadata. The raw prompt and the
// decisions.log `prompt_preview` field are NEVER copied here — `sanitize()`
// whitelists exactly the schema fields as defense-in-depth.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Cockpit v2 Wave 1: auto_skill + auto_skill_conf are ADDITIVE schema fields.
// When the hook emitted a confidence-gated auto-skill DIRECTIVE for this
// decision, auto_skill carries the primary skill name and auto_skill_conf its
// domain confidence. Null when no directive fired (the common case while
// auto-skill stays opt-in) — never a fabricated 0/empty.
const SCHEMA_FIELDS = [
  'ts', 'op', 'tier', 'llm', 'tokens_in', 'tokens_out', 'reason', 'via',
  'auto_skill', 'auto_skill_conf',
  // C1.3 (2026-09-02) — 'medido' quando os tokens vieram do stream do proprio
  // motor; null quando ninguem os mediu. Sem este campo, um leitor nao tem como
  // distinguir "gastou zero" de "ninguem contou", e as duas coisas escreviam-se
  // com o mesmo caractere.
  'tokens_fonte',
];

function routerDir() {
  const claude = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || path.join(os.homedir(), '.claude');
  return path.join(claude, 'tools', 'router');
}

/** Path to decisions_v2.jsonl (env-overridable for tests). */
function logPath() {
  return process.env.MOOTER_DECISIONS_V2_LOG || path.join(routerDir(), 'decisions_v2.jsonl');
}

/** Short, stable llm label from a model id, falling back to the tier default. */
function shortLlm(model, tier) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (/qwen|llama|gemma|deepseek|mistral|phi/.test(m)) return m.split(/[@\s]/)[0];
  if (m) return m;
  return { T0: 'qwen3:30b', T1: 'haiku', T2: 'sonnet', T3: 'opus' }[tier] || 'unknown';
}

/**
 * Human-readable routing reason, built ONLY from real decision fields — never
 * invented. Mirrors the brief's vocabulary (safety_boost_*, classify_score=X).
 * @param {Record<string, any>} [d]
 */
function deriveReason(d = {}) {
  if (d.safety_boost_applied && d.safety_boost_reason) {
    return `safety_boost_${String(d.safety_boost_reason).split(/[:(]/)[0].trim()}`;
  }
  if (d.escalation_rule) return String(d.escalation_rule);
  const conf = typeof d.confidence === 'number' ? d.confidence.toFixed(2) : '?';
  return `classify_score=${conf} ${d.tier || '?'}`;
}

/**
 * Um numero medido, ou `null`. Nunca uma coacao.
 *
 * `Number('')` e 0 e `Number(true)` e 1: aceitar qualquer um poria uma medicao
 * inventada no ledger, que e a unica coisa que este ficheiro nao pode fazer.
 */
function numeroOuNulo(v) {
  // `typeof`, e nao `Number()`. Medido a escrever este teste: `Number('')` e 0
  // e `Number(true)` e 1 — os dois passariam por medicoes. A direccao segura da
  // falha e `null` (n/d), nunca um numero que ninguem contou.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Build a v2 record from a classify decision object. Pure. Only emits schema
 * fields — token counts default to 0 when the decision predates execution
 * (they are not invented; real per-tier token totals live in token_tracker.js).
 * @param {Record<string, any>} [d]
 * @param {Record<string, any>} [opts]
 */
function recordFromDecision(d = {}, opts = {}) {
  return {
    ts: opts.ts || d.ts || new Date(opts.now || Date.now()).toISOString(),
    op: d.task_category || d.op || 'classify',
    tier: d.tier || null,
    llm: shortLlm(d.recommended_model || d.llm, d.tier),
    /**
     * ⚠️ `null`, e nao `0` — o defeito que C1.3 fecha.
     *
     * Esta funcao corre no hook de UserPromptSubmit, ou seja ANTES de a
     * execucao existir. Escrever `0` afirmava uma medicao («esta chamada
     * gastou zero tokens») onde a verdade era «ainda nao ha o que medir». Em
     * 2026-09-02 o ledger tinha 403 decisoes e 0/403 com tokens > 0 — e a
     * metrica-mae lia isso como cobertura zero, o que era certo por acidente:
     * lia zeros que se apresentavam como medicoes.
     *
     * `null` e a resposta honesta, e sobrevive a `Number(x) || 0` nos leitores
     * antigos (stop_hook.js:258, statusline) sem lhes mudar o comportamento.
     */
    tokens_in: numeroOuNulo(d.tokens_in),
    tokens_out: numeroOuNulo(d.tokens_out),
    tokens_fonte: (numeroOuNulo(d.tokens_in) != null || numeroOuNulo(d.tokens_out) != null)
      ? (d.tokens_fonte || 'medido') : null,
    reason: deriveReason(d),
    via: d.suggested_subagent || d.via || d.recommended_backend || 'inline',
    // Auto-skill (Cockpit v2 W1): only set when a directive actually fired.
    auto_skill: typeof d.auto_skill === 'string' && d.auto_skill ? d.auto_skill : null,
    auto_skill_conf: typeof d.auto_skill_conf === 'number' ? d.auto_skill_conf : null,
  };
}

/** Whitelist to exactly the schema fields (defense-in-depth against PII). */
function sanitize(rec = {}) {
  const out = {};
  for (const k of SCHEMA_FIELDS) {
    // Um campo ausente e `null` para TODOS, tokens incluidos. Ate 2026-09-02 os
    // tokens caiam para `0` — um zero que se lia como medicao.
    out[k] = rec[k] !== undefined ? rec[k] : null;
  }
  return out;
}

/** Append one decision as a sanitized JSONL line. Best-effort, never throws. */
function appendFromDecision(d, opts = {}) {
  try {
    const rec = sanitize(recordFromDecision(d, opts));
    fs.appendFileSync(opts.logPath || logPath(), JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  } catch {
    return null; // telemetry is best-effort — never break the caller
  }
}

/**
 * Read v2 records (newest `limit` kept). Skips junk + tierless lines. A log that
 * does not exist yet is genuinely zero records ⇒ []. A log that exists but cannot
 * be read is ignorance, not emptiness: it still returns [] (the caller indexes the
 * result) but says so on stderr first. Pure read — never throws. Used by
 * `mooter trail --calls` and the Stop session report.
 */
function readRecords(opts = {}) {
  let raw;
  try {
    raw = fs.readFileSync(opts.logPath || logPath(), 'utf8');
  } catch (e) {
    // O [] dizia duas coisas diferentes com a mesma palavra: "ainda nao houve
    // decisoes" e "nao consegui ler o log" — e o relatorio de sessao imprimia
    // "(no decisions logged this session)" nos dois casos. ENOENT e mesmo zero (o
    // ficheiro so nasce no primeiro append); os restantes erros (permissoes, I/O)
    // passam a sair em stderr com o codigo real. O [] fica porque o unico chamador
    // (stop_hook.js:421) faz `.length` na linha seguinte e esta fora do ambito
    // desta correccao — degradacao anunciada em vez de silenciosa.
    if (!e || e.code !== 'ENOENT') {
      const code = (e && (e.code || e.message)) || 'erro desconhecido';
      try {
        process.stderr.write('mooter: decisions_v2.jsonl ilegivel (' + code + ') — o relatorio desta sessao sai incompleto\n');
      } catch { /* stderr fechado */ }
    }
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r && r.tier) out.push(r);
  }
  return opts.limit ? out.slice(-opts.limit) : out;
}

/**
 * Wave 22 (22.F) — live count of decision records the Pastor loop learns from.
 * The statusline "trained on N decisions" must reflect the real corpus, not the stale
 * tuning-state.sample_size snapshot (a backtest metric that lagged at 8 while the corpus
 * grew to 188). Counts non-empty lines (append-only valid jsonl ⇒ matches `wc -l`) so it
 * stays cheap on the statusline render path. Best-effort: 0 when the log does not
 * exist yet (a real zero), null when it exists but cannot be read (`n/d`).
 */
function recordCount(opts = {}) {
  let raw;
  try {
    raw = fs.readFileSync(opts.logPath || logPath(), 'utf8');
  } catch (e) {
    // O 0 afirmava "o corpus tem zero decisoes" quando o que se passava era nao
    // conseguir le-lo — e a statusline escrevia essa ignorancia como facto ("trained
    // on 0"). Ficheiro inexistente continua a ser zero (so nasce no primeiro
    // append); o resto devolve null = "nao sei". Os dois chamadores
    // (statusline-multi.js:1115 e stop_hook.js:441) ja tratam o valor falsy como
    // desconhecido: caem para o tuning-state.json e, se esse tambem falhar, omitem o
    // "trained on N" em vez de imprimirem um 0 inventado. Nenhum deles indexa o
    // retorno, por isso o null nao chega a nenhum .length/.map.
    if (e && e.code === 'ENOENT') return 0;
    return null;
  }
  let n = 0;
  for (const line of raw.split('\n')) if (line.trim()) n += 1;
  return n;
}

/**
 * Uma decisao com tokens MEDIDOS, escrita por quem os mediu — C1.3.
 *
 * O `appendFromDecision` corre antes da execucao e por isso nunca pode trazer
 * tokens: exigir-lhos seria exigir um numero que ainda nao existe. Quem OS TEM
 * e o despachante — o conector le `tokens_in`/`tokens_out` do stream do proprio
 * motor, e ate aqui esse numero morria no ledger dele sem nunca chegar ao
 * corpus de routing.
 *
 * Recusa escrever sem tokens finitos. Um `appendMeasured` que aceitasse `null`
 * seria o `appendFromDecision` com outro nome e voltaria a poluir a cobertura.
 *
 * @returns {object|null} o registo escrito, ou null se nao havia o que medir
 */
function appendMeasured(d = {}, opts = {}) {
  const tin = numeroOuNulo(d.tokens_in);
  const tout = numeroOuNulo(d.tokens_out);
  if (tin == null && tout == null) return null;
  try {
    const rec = sanitize({
      ts: opts.ts || d.ts || new Date(opts.now || Date.now()).toISOString(),
      op: d.op || 'dispatch',
      tier: d.tier || null,
      llm: shortLlm(d.llm || d.model, d.tier),
      tokens_in: tin,
      tokens_out: tout,
      tokens_fonte: 'medido',
      reason: d.reason || 'measured after execution',
      via: d.via || 'inline',
    });
    fs.appendFileSync(opts.logPath || logPath(), JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  } catch {
    return null; // telemetria e best-effort — nunca parte o chamador
  }
}

module.exports = {
  SCHEMA_FIELDS,
  appendMeasured,
  shortLlm,
  deriveReason,
  recordFromDecision,
  sanitize,
  appendFromDecision,
  readRecords,
  recordCount,
  logPath,
};
