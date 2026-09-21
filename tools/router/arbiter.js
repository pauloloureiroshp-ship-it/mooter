#!/usr/bin/env node
/**
 * arbiter.js — Haiku-powered semantic arbiter for ambiguous prompts (v0.8).
 *
 * When the regex classifier in classify.js returns a low-confidence decision
 * (confidence < 0.75) OR lands in `ambiguous_medium` / `ambiguous_long`, we
 * fall through to this arbiter. It calls Claude Haiku 4.5 with a short
 * system prompt describing the tier ladder and asks for a JSON routing
 * decision. Haiku is cheap (~$0.001/call) and fast (~400ms).
 *
 * Design principles:
 *   1. OPTIONAL — if MOOTER_ARBITER_DISABLE=1 or ANTHROPIC_API_KEY is absent,
 *      the arbiter is a no-op and inject_context.js falls back to the regex
 *      decision. The dedicated switch wins even when a key is inherited.
 *   2. CACHED — decisions are keyed by SHA-256(prompt + system_version).
 *      Cache persists on disk (~/.claude/tools/router/.arbiter-cache.json).
 *      Semantic decisions don't rot quickly, so TTL = 7 days, LRU = 500.
 *   3. DUAL-ENFORCED — the arbiter can never downgrade a HIGH_RISK prompt.
 *      inject_context.js cross-checks the arbiter result against the regex
 *      high-risk signal count and refuses demotion if they conflict.
 *   4. FAST-FAIL — 1.5s hard timeout. On timeout/error/parse-fail, return
 *      null and the hook falls back to the regex decision silently.
 *   5. LOGGED — every arbiter call appends an `arbiter_call` event to
 *      decisions.log with duration, cost estimate, and decision. The
 *      backtest reads these to surface cost/hit ratio in the daily report.
 *
 * Exports:
 *   arbitrate(prompt) → { tier, subagent, reasoning } | null
 *   ARBITER_SYSTEM_PROMPT_VERSION: number (bump to invalidate cache)
 *   ollamaLogit(prompt) / shadowDecisor(prompt, decision) — F2-shadow (MP3,
 *   2026-09-21): decisor tipado local em modo SOMBRA; opt-in, regista, NUNCA
 *   roteia. Ver o bloco «F2-shadow» no fim do ficheiro.
 *
 * Used by: inject_context.js (hook path)
 * Tested in: backtest.test.js (mock-based unit tests)
 */

// @ts-check
'use strict';

/** @typedef {import('./types').ArbiterDecision} ArbiterDecision */
/** @typedef {import('./types').ArbiterCache} ArbiterCache */
/** @typedef {import('./types').ArbiterCacheEntry} ArbiterCacheEntry */
/** @typedef {import('./types').ArbitrateOptions} ArbitrateOptions */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Bump this when ARBITER_SYSTEM_PROMPT changes so cached decisions based on
// the old rules are invalidated automatically.
const ARBITER_SYSTEM_PROMPT_VERSION = 2;

const ARBITER_SYSTEM_PROMPT = `You are the routing arbiter for mooter, a cost-aware Claude Code router.
Given a user prompt, pick the minimum-viable tier and the correct subagent.
Respond with ONE line of JSON, no preamble, no markdown.

TIERS:
- T0: trivial local work (summarize, format, rename, explain short snippet, translate)
  subagent: "local-summarizer" or "local-transformer"
- T1: light reasoning (commit message, docstring, regex, explain error, trivial test)
  subagent: "cheap-triage"
- T2: multi-step reasoning (bug investigation, refactor plan, decomposition, compare approaches)
  subagent: "model-reasoner"
- T3: architecture, critical decisions, production changes, multi-file refactors, pre-merge review
  subagent: "model-architect"

SAFETY OVERRIDES (ALWAYS escalate to T3):
- anything touching .env, package.json, CI/CD, migrations, secrets, credentials
- anything before git push, merge, release, deploy
- refactor affecting more than 3 files
- architecture decisions

HEURISTICS:
- When in doubt between two tiers, pick the cheaper.
- Short prompts (<100 chars) without risk signals → usually T0.
- Natural quality signals ("pensa bem", "think hard", "best effort") → promote one tier.

DECOMPOSITION (v0.9):
When the task clearly splits into 2-4 INDEPENDENT subtasks with no data
dependencies between them, return a decomposition object. Otherwise omit it.
- Do NOT decompose tasks expected to need fewer than 3 tool calls.
- Do NOT decompose HIGH_RISK tasks (see SAFETY OVERRIDES).
- Each subtask must be executable in isolation with only the prompt context.

OUTPUT SCHEMA (exact):
{"tier":"T0|T1|T2|T3","subagent":"<name>","reasoning":"<≤15 words>","decomposition":{"applicable":true|false,"subtasks":[{"description":"...","tier":"...","rationale":"..."}]}}

The "decomposition" field is OPTIONAL. When omitted, treat as applicable:false.
Respond with ONLY the JSON.`;

const MODEL = process.env.ARBITER_MODEL || 'claude-haiku-4-5-20251001';
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const CACHE_PATH = path.join(ROUTER_DIR, '.arbiter-cache.json');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX = 500;
const TIMEOUT_MS = 1500;
const VALID_SUBAGENTS = new Set([
  'local-summarizer',
  'local-transformer',
  'cheap-triage',
  'model-reasoner',
  'model-architect',
]);

/**
 * @param {string} prompt
 * @returns {string}
 */
function hashKey(prompt) {
  return crypto
    .createHash('sha256')
    .update(`v${ARBITER_SYSTEM_PROMPT_VERSION}:${prompt}`)
    .digest('hex');
}

/**
 * @returns {ArbiterCache}
 */
function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
    if (raw.version !== ARBITER_SYSTEM_PROMPT_VERSION) {
      return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
    }
    return raw;
  } catch {
    return { version: ARBITER_SYSTEM_PROMPT_VERSION, entries: {} };
  }
}

/**
 * @param {ArbiterCache} cache
 */
function saveCache(cache) {
  try {
    // LRU eviction
    const keys = Object.keys(cache.entries);
    if (keys.length > CACHE_MAX) {
      const sorted = keys
        .map((k) => ({ k, ts: (cache.entries[k] && cache.entries[k].ts) || 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, CACHE_MAX);
      /** @type {Record<string, ArbiterCacheEntry>} */
      const kept = {};
      for (const { k } of sorted) {
        const entry = cache.entries[k];
        if (entry) kept[k] = entry;
      }
      cache.entries = kept;
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch { /* non-fatal */ }
}

/**
 * @param {Record<string, unknown>} entry
 */
function logArbiterEvent(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* telemetry best-effort */ }
}

/**
 * Synchronously call Haiku with the arbiter system prompt.
 * Returns the raw API response text (JSON string from Claude), or null on error.
 *
 * Uses the same spawnSync+inline-node pattern that inject_context.js uses for
 * the budget fetch — lets us stay in a sync hook context without block-ing
 * on node's async-only HTTPS module.
 */
/**
 * @param {string} apiKey
 * @param {string} prompt
 * @returns {string | null}
 */
function callHaikuSync(apiKey, prompt) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 300,
    system: ARBITER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const scriptText = `
    const https = require('https');
    const body = process.argv[2];
    const apiKey = process.argv[3];
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => process.stdout.write(data));
    });
    req.on('error', () => process.exit(1));
    req.setTimeout(${TIMEOUT_MS - 200}, () => { req.destroy(); process.exit(2); });
    req.write(body);
    req.end();
  `;

  const r = spawnSync(process.execPath, ['-e', scriptText, body, apiKey], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout;
}

/**
 * Extract the JSON decision from a full Anthropic /v1/messages response.
 * Tolerates markdown fences, leading text, and trailing whitespace.
 */
/**
 * @param {string} apiResponseText
 * @returns {ArbiterDecision | null}
 */
function extractDecision(apiResponseText) {
  try {
    const parsed = JSON.parse(apiResponseText);
    if (parsed.type === 'error') return null;
    const text = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!text) return null;
    // Find the first {...} block in the text.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    /** @type {ArbiterDecision} */
    const decision = JSON.parse(match[0]);
    // Sanity-check the shape.
    if (!['T0', 'T1', 'T2', 'T3'].includes(decision.tier)) return null;
    if (!VALID_SUBAGENTS.has(decision.subagent)) return null;
    if (typeof decision.reasoning !== 'string') decision.reasoning = '';
    // v0.9: normalize decomposition. Accept either { applicable, subtasks }
    // or a bare array (older arbiter responses). Drop anything malformed.
    if (decision.decomposition) {
      const d = decision.decomposition;
      if (Array.isArray(d)) {
        decision.decomposition = { applicable: d.length >= 2, subtasks: d };
      } else if (typeof d === 'object' && Array.isArray(d.subtasks)) {
        d.applicable = d.applicable === true && d.subtasks.length >= 2;
      } else {
        delete decision.decomposition;
      }
    }
    return decision;
  } catch {
    return null;
  }
}

/**
 * Main entry point. Returns { tier, subagent, reasoning, cached, decomposition? }
 * or null when the arbiter is unavailable / failed / timed out.
 *
 * Options:
 *   - _mockResponse: inject a fake API response (for tests, no real HTTP call)
 *   - _skipCache:   bypass cache read (for tests)
 */
/**
 * @param {string} prompt
 * @param {ArbitrateOptions} [options]
 * @returns {ArbiterDecision | null}
 */
function arbitrate(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') return null;

  // Friend builds set this dedicated switch. Enforce here as well as in the
  // hook so direct callers cannot silently reactivate Haiku with an inherited
  // ANTHROPIC_API_KEY. This intentionally does not reuse the broader v0.7 flag.
  if (process.env.MOOTER_ARBITER_DISABLE === '1') return null;

  // No key → no arbiter. This is a soft exit, not an error.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !options._mockResponse) {
    return null;
  }

  const key = hashKey(prompt);

  // Cache lookup
  if (!options._skipCache) {
    const cache = loadCache();
    const entry = cache.entries[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS && entry.decision) {
      // Log cache hits so /metrics can reconstruct the real hit-rate after a
      // tracker restart (AUDIT-MOOTER-2026-04-19 F6.1). Before this, hits were
      // only visible in the in-memory ARBITER_METRICS counter and zeroed at
      // every restart.
      logArbiterEvent({
        ts: new Date().toISOString(),
        event: 'arbiter_call',
        outcome: 'cache_hit',
        duration_ms: 0,
        prompt_len: prompt.length,
      });
      return { ...entry.decision, cached: true, latency_ms: 0 };
    }
  }

  // Fresh call
  const startMs = Date.now();
  const raw = options._mockResponse !== undefined
    ? options._mockResponse
    : callHaikuSync(/** @type {string} */ (apiKey), prompt);
  const durationMs = Date.now() - startMs;

  if (!raw) {
    logArbiterEvent({
      ts: new Date().toISOString(),
      event: 'arbiter_call',
      outcome: 'failed',
      duration_ms: durationMs,
      prompt_len: prompt.length,
    });
    return null;
  }

  const decision = extractDecision(raw);
  if (!decision) {
    logArbiterEvent({
      ts: new Date().toISOString(),
      event: 'arbiter_call',
      outcome: 'parse_failed',
      duration_ms: durationMs,
      prompt_len: prompt.length,
    });
    return null;
  }

  // Write cache
  if (!options._skipCache) {
    const cache = loadCache();
    cache.entries[key] = { ts: Date.now(), decision };
    saveCache(cache);
  }

  // Log the successful call
  logArbiterEvent({
    ts: new Date().toISOString(),
    event: 'arbiter_call',
    outcome: 'ok',
    duration_ms: durationMs,
    prompt_len: prompt.length,
    tier: decision.tier,
    subagent: decision.subagent,
    reasoning: decision.reasoning,
    // Rough cost estimate: system ~320 tok + prompt tok_est + response ~50 tok
    // at Haiku rates $0.80/$4.00 per MTok
    est_cost_usd:
      ((320 + Math.ceil(prompt.length / 3.5)) * 0.8 + 50 * 4) / 1e6,
  });

  return { ...decision, cached: false, latency_ms: durationMs };
}

// ── F2-shadow (MP3 · 2026-09-21) — decisor tipado LOCAL em modo SOMBRA ──────
//
// Porta directa de `_handoff/decisor-shadow-2026-09-21/02-arm-D-logit.mjs`, o
// braco D medido no MP1→MP3: 4 perguntas tipadas de 1 letra ao modelo Ollama
// residente, probabilidade lida dos `top_logprobs` da 1.a letra via
// `/v1/chat/completions`. $0, so loopback (host de `ollama-host.js`).
//
// Medido (3 corpora reais, rotulo cego): acc 0,600 / 0,614 / 0,622 contra
// «T2 sempre» 0,450 / 0,316 / 0,243 e a regra 0,325 / 0,439 / 0,324; p50 quente
// 147–162 ms; ECE 0,110 / 0,124 / 0,146 — acima do tecto 0,10 as tres vezes.
// E por isso que isto NAO roteia:
//
//   1. OPT-IN — so corre com MOOTER_DECISOR_SHADOW=1 (o dono liga; ver
//      RUN-DECISOR-SHADOW-ON.bat). Sem a env, ou com MOOTER_ARBITER_DISABLE=1,
//      zero comportamento novo.
//   2. SOMBRA — chamado pelo hook DEPOIS de a rota estar decidida; nunca le nem
//      escreve `decision`. O tier que devolve so vai para o log.
//   3. LOG SEM PROMPT — evento `decisor_shadow` no decisions.log com sha12 +
//      preview de 80 chars (como o resto do log). O que se acumula e o corpus
//      60d, para rotular as cegas pelo mesmo metodo dos 40/57/37.
//   4. FAST-FAIL — 800 ms de tecto (AMENDMENT mp3-2; quente ~255 ms pelo hook;
//      frio ~2,5 s -> `outcome:'timeout'`, e a rota nunca esperou por ele).
//
// Exports: ollamaLogit(prompt) · shadowDecisor(prompt, decision) — ver types.d.ts.

/** @typedef {import('./types').DecisorShadowResult} DecisorShadowResult */
/** @typedef {import('./types').DecisorShadowEvent} DecisorShadowEvent */
/** @typedef {import('./types').ShadowOptions} ShadowOptions */

// Rubrica = `_handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/label-rubric.txt`,
// sha256 f95958dd6e4b40a7caa1bc4b9d7659f90a3c92a9ec7127ddb6469f88fd5c7091 — a
// MESMA que rotulou os corpora e que o braco D usou como system prompt. Verbatim,
// incluindo a ultima linha: e assim que foi medido.
const DECISOR_RUBRIC = `You are labeling software-task prompts for a routing benchmark. Assign each prompt EXACTLY ONE tier using this ladder (the same definitions the benchmark labels use):

T0 = trivial, mechanical, one file, no risk (rename, format, move, change a colour, a short factual question, coordination chat like "tell me when done")
T1 = small text or short explanation (commit message, docstring, regex, explain an error, a small transform, a summary)
T2 = reasoning (investigate a bug, compare approaches, technical plan, decompose a feature, run and interpret an experiment)
T3 = architecture, multi-file change, production, secrets, CI, migrations, release, deploy, merge, push

Conventions that the labels use (do not guess them; they are here):
- high risk forces T3: deploy, push, merge, release, migrations, secrets, .env, CI
- an explicit request for more care ("pensa bem", "e critico", "think hard", "preciso do teu melhor") raises one tier
- naming a model (@opus, @haiku, "usa o sonnet") pins the tier of that model (haiku=T1, sonnet=T2, opus=T3)
- touching more than 3 files, or deciding architecture, is T3
- a prompt that asks an agent to run a failing test file and make it pass without touching frozen files is a code change: T2 unless it clearly spans many files or CI (then T3)
- prompts are in Portuguese or English; some are conversational coordination with an agent ("avisa quando terminar") - label those by what the agent would have to DO next (usually T0 if nothing, T1/T2 if it implies analysis)

Return ONLY JSON matching the schema: an array of {"id","tier","reason"} with a reason of at most 12 words. Label every id. Do not skip any.
`;

/** @type {Record<string, { options: Record<string, string | number | boolean>, text: string }>} */
const DECISOR_QUESTIONS = {
  tier: { options: { A: 'T0', B: 'T1', C: 'T2', D: 'T3' }, text: 'Which tier does this prompt need? A) T0 B) T1 C) T2 D) T3' },
  complexity: { options: { A: 0, B: 1, C: 2 }, text: 'How complex is the task? A) simple, one step B) moderate, a few steps C) demanding, needs investigation or design' },
  high_stakes: { options: { A: true, B: false }, text: 'Would a wrong or sloppy answer be costly (security, data loss, production, architecture)? A) yes B) no' },
  needs_repo: { options: { A: true, B: false }, text: 'Does answering well require reading or changing several files of the repository? A) yes B) no' },
};
// 400 ms no pre-registo (MP3 §B0, a partir dos 147-162 ms medidos EM PROCESSO). Pelo caminho do hook
// (spawnSync + 4 fetches num filho) mediu-se p50 ~255 ms com o prefixo da rubrica em cache e ~460 ms
// quando outra chamada ao Ollama o despeja (o hook faz a sua propria chamada nos T0): com 400 ms,
// 7 de 10 prompts sairam `timeout` e o shadow nao acumulava nada. AMENDMENT mp3-2 (protocol.json)
// sobe o tecto para 800 ms: o frio (~2,5 s) continua a ser timeout, e a rota nunca espera por isto.
const DECISOR_TIMEOUT_MS = 800;
const DECISOR_ABSTAIN_BELOW = 0.4;
const DECISOR_PROMPT_MAX_CHARS = 4000;
const DECISOR_KEEP_ALIVE = '30m';

/** @returns {string} */
function decisorModel() {
  return process.env.MOOTER_DECISOR_MODEL || 'qwen2.5-coder:14b';
}
/** @returns {string} */
function decisorHost() {
  try { return require('./ollama-host.js').ollamaHostFromEnv(); } catch { return 'http://127.0.0.1:11434'; }
}
/**
 * @param {string} prompt
 * @param {{ text: string }} q
 */
function decisorMessages(prompt, q) {
  return [
    { role: 'system', content: `You are a routing decision head. Use this ladder:\n${DECISOR_RUBRIC}\nAnswer with exactly ONE letter and nothing else.` },
    { role: 'user', content: `PROMPT:\n<<<\n${prompt.slice(0, DECISOR_PROMPT_MAX_CHARS)}\n>>>\n\nQUESTION: ${q.text}\nAnswer:` },
  ];
}

/**
 * Faz as 4 chamadas em sequencia num processo filho (o hook e sincrono — o mesmo
 * padrao spawnSync+node -e do callHaikuSync). Devolve as respostas cruas do
 * /v1/chat/completions, ou { error } em timeout/falha.
 * @param {string} prompt
 * @returns {{ responses?: unknown[], error?: string }}
 */
function callOllamaLogitSync(prompt) {
  const host = decisorHost();
  const model = decisorModel();
  const calls = Object.values(DECISOR_QUESTIONS).map((q) => ({
    model, temperature: 0, max_tokens: 1, logprobs: true, top_logprobs: 10, keep_alive: DECISOR_KEEP_ALIVE, messages: decisorMessages(prompt, q),
  }));
  const scriptText = `
    // node -e: process.argv = [node, ...args] (argv[1] e o 1.o argumento; medido, nao assumido)
    const [host, budgetMs, callsJson] = process.argv.slice(1);
    const calls = JSON.parse(callsJson);
    const deadline = Date.now() + Number(budgetMs);
    (async () => {
      const out = [];
      for (const body of calls) {
        const left = deadline - Date.now();
        if (left <= 0) { process.stdout.write(JSON.stringify({ error: 'timeout' })); process.exit(0); }
        const r = await fetch(host + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(left) });
        out.push(await r.json());
      }
      process.stdout.write(JSON.stringify({ responses: out }));
    })().catch((e) => { process.stdout.write(JSON.stringify({ error: /abort|timeout/i.test(String(e && e.name || e)) ? 'timeout' : 'failed' })); });
  `;
  const r = spawnSync(process.execPath, ['-e', scriptText, host, String(DECISOR_TIMEOUT_MS), JSON.stringify(calls)], {
    encoding: 'utf8',
    timeout: DECISOR_TIMEOUT_MS + 250, // margem para o arranque do processo filho
    windowsHide: true,
  });
  const spawnErr = /** @type {(Error & { code?: string }) | undefined} */ (r.error);
  if (spawnErr && /ETIMEDOUT/.test(String(spawnErr.code || spawnErr.message))) { warmDecisorDetached(host, model); return { error: 'timeout' }; }
  if (r.status !== 0 || !r.stdout) return { error: 'failed' };
  try { const parsed = JSON.parse(r.stdout); if (parsed && parsed.error === 'timeout') warmDecisorDetached(host, model); return parsed; } catch { return { error: 'parse_failed' }; }
}

/**
 * Medido 2026-09-21 (Ollama 0.34.2): quando o cliente aborta antes de o modelo acabar de carregar,
 * o Ollama ABORTA o carregamento («client connection closed before llama-server finished loading»).
 * Um cliente com tecto curto num modelo frio nunca o aquece — cada prompt repete o timeout. Por isso,
 * em timeout, dispara-se um aquecimento DESLIGADO do hook (mesmo padrao do ollama-warmup.js do 3b):
 * um filho que espera pelo carregamento e pede keep_alive 30m. O hook nao espera por ele.
 * @param {string} host
 * @param {string} model
 */
function warmDecisorDetached(host, model) {
  try {
    const { spawn } = require('child_process');
    const script = `fetch(process.argv[1] + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: process.argv[2], prompt: '', stream: false, keep_alive: '${DECISOR_KEEP_ALIVE}' }), signal: AbortSignal.timeout(120000) }).then(() => process.exit(0), () => process.exit(0));`;
    const child = spawn(process.execPath, ['-e', script, host, model], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch { /* best-effort */ }
}

/**
 * Le a probabilidade de cada letra dos top_logprobs da 1.a posicao (igual ao braco D).
 * @param {unknown} response  resposta crua do /v1/chat/completions
 * @param {Record<string, string | number | boolean>} options
 */
function decisorRead(response, options) {
  const letters = Object.keys(options);
  const resp = /** @type {{ choices?: Array<{ logprobs?: { content?: Array<{ top_logprobs?: Array<{ token: string, logprob: number }> }> } }> }} */ (response);
  const lp = resp && resp.choices && resp.choices[0] && resp.choices[0].logprobs && resp.choices[0].logprobs.content && resp.choices[0].logprobs.content[0];
  if (!lp || !Array.isArray(lp.top_logprobs) || !lp.top_logprobs.length) return null;
  /** @type {Record<string, number>} */
  const probs = {};
  for (const t of lp.top_logprobs) {
    const L = String(t.token).trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.includes(L)) probs[L] = (probs[L] || 0) + Math.exp(t.logprob);
  }
  const mass = Object.values(probs).reduce((a, b) => a + b, 0);
  /** @type {Record<string, number>} */
  const norm = {};
  for (const L of letters) norm[String(options[L])] = mass > 0 ? (probs[L] || 0) / mass : 1 / letters.length;
  return { probs: norm, mass_on_letters: mass };
}

/**
 * Decisor tipado local (braco D, politica v0 = argmax do tier). Nunca roteia.
 * @param {string} prompt
 * @param {ShadowOptions} [options]  _mockResponses: 4 respostas cruas (testes) · _mockTimeout: simula timeout
 * @returns {{ result: DecisorShadowResult | null, outcome: string }}
 */
function ollamaLogitRaw(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') return { result: null, outcome: 'failed' };
  const t0 = Date.now();
  const raw = options._mockTimeout ? { error: 'timeout' }
    : Array.isArray(options._mockResponses) ? { responses: options._mockResponses }
      : callOllamaLogitSync(prompt);
  const latencyMs = Date.now() - t0;
  if (!raw || raw.error || !Array.isArray(raw.responses)) return { result: null, outcome: (raw && raw.error) || 'failed' };
  const keys = Object.keys(DECISOR_QUESTIONS);
  /** @type {Record<string, { probs: Record<string, number>, mass_on_letters: number }>} */
  const answers = {};
  for (let i = 0; i < keys.length; i++) {
    const read = decisorRead(raw.responses[i], DECISOR_QUESTIONS[keys[i]].options);
    if (!read) return { result: null, outcome: 'parse_failed' };
    answers[keys[i]] = read;
  }
  const pt = answers.tier.probs;
  const tier = /** @type {import('./types').Tier} */ (['T0', 'T1', 'T2', 'T3'].reduce((b, t) => (pt[t] > pt[b] ? t : b), 'T0'));
  const pc = answers.complexity.probs;
  return {
    outcome: 'ok',
    result: {
      tier,
      probabilities: { T0: pt.T0, T1: pt.T1, T2: pt.T2, T3: pt.T3 },
      p_max: pt[tier],
      abstained: pt[tier] < DECISOR_ABSTAIN_BELOW,
      latency_ms: latencyMs,
      backend: 'ollama-logit',
      model: decisorModel(),
      aux: {
        p_needs_repo: answers.needs_repo.probs['true'],
        p_high_stakes: answers.high_stakes.probs['true'],
        e_complexity: 1 * (pc['1'] || 0) + 2 * (pc['2'] || 0),
        mass_on_letters_tier: answers.tier.mass_on_letters,
      },
    },
  };
}
/**
 * @param {string} prompt
 * @param {ShadowOptions} [options]
 * @returns {DecisorShadowResult | null}
 */
function ollamaLogit(prompt, options = {}) {
  return ollamaLogitRaw(prompt, options).result;
}

/**
 * Modo sombra: regista o que o decisor local DIRIA, ao lado do que a regra decidiu.
 * Nao le `decision` para decidir nada; nao escreve em `decision`; devolve o evento
 * escrito (ou null quando nao corre). Best-effort: nunca lanca.
 * @param {string} prompt
 * @param {Record<string, unknown> | null | undefined} decision  a decisao JA tomada pelo hook
 * @param {ShadowOptions} [options]  _force ignora a env (testes) · _logPath desvia o log (testes) · session_id
 * @returns {DecisorShadowEvent | null}
 */
function shadowDecisor(prompt, decision, options = {}) {
  try {
    if (!options._force && process.env.MOOTER_DECISOR_SHADOW !== '1') return null;
    if (process.env.MOOTER_ARBITER_DISABLE === '1') return null;
    if (!prompt || typeof prompt !== 'string') return null;
    const d = /** @type {Record<string, any>} */ (decision || {});
    const { result, outcome } = ollamaLogitRaw(prompt, options);
    /** @type {DecisorShadowEvent} */
    const event = {
      ts: new Date().toISOString(),
      ts_ms: Date.now(),
      event: 'decisor_shadow',
      outcome,
      session_id: options.session_id || null,
      prompt_sha12: crypto.createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 12),
      prompt_len: prompt.length,
      prompt_preview: prompt.slice(0, 80).replace(/\s+/g, ' '),
      tier_regra: typeof d.tier === 'string' ? d.tier : null,
      confidence_regra: typeof d.confidence === 'number' ? d.confidence : null,
      task_category: typeof d.task_category === 'string' ? d.task_category : null,
      escalation_rule_regra: typeof d.escalation_rule === 'string' ? d.escalation_rule : null,
      // O arbiter Haiku corre DEPOIS deste ponto no hook (MP3 §B0: a chamada vive
      // antes da seccao v0.8 para apanhar todos os prompts); quando ja tiver
      // corrido (chamadores directos), fica aqui. O 09-shadow-report junta com o
      // evento `classified` da mesma sessao para o tier final.
      tier_arbiter_haiku: d.arbiter && d.arbiter.honored ? d.tier : (d.arbiter && d.arbiter.proposed_tier) || null,
      tier_D: result ? result.tier : null,
      probs_D: result ? result.probabilities : null,
      p_max_D: result ? result.p_max : null,
      abstained_D: result ? result.abstained : null,
      ms_D: result ? result.latency_ms : null,
      aux_D: result ? result.aux : null,
      agree_regra: result && typeof d.tier === 'string' ? result.tier === d.tier : null,
      backend: 'ollama-logit',
      model: decisorModel(),
    };
    const logPath = options._logPath || process.env.MOOTER_DECISIONS_LOG || LOG_PATH;
    try { fs.appendFileSync(logPath, JSON.stringify(event) + '\n', 'utf8'); } catch { /* telemetria best-effort */ }
    return event;
  } catch {
    return null;
  }
}

module.exports = {
  arbitrate,
  extractDecision,
  hashKey,
  ARBITER_SYSTEM_PROMPT,
  ARBITER_SYSTEM_PROMPT_VERSION,
  VALID_SUBAGENTS,
  // F2-shadow (MP3): regista, nao roteia.
  ollamaLogit,
  shadowDecisor,
  DECISOR_QUESTIONS,
  DECISOR_TIMEOUT_MS,
};

// CLI mode — useful for debugging: `node arbiter.js "some prompt"`
if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) {
    console.error('usage: node arbiter.js "<prompt>"');
    process.exit(1);
  }
  const result = arbitrate(prompt);
  console.log(JSON.stringify(result, null, 2));
}
