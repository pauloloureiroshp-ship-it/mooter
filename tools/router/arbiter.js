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
    // node -e: process.argv = [node, ...args] — o 1.o argumento e argv[1]. Ate 2026-09-21 (MP4-a bug B) lia-se
    // argv[2]/argv[3]: body = chave, apiKey = undefined -> o arbiter Haiku nunca correu, nem com chave.
    const body = process.argv[1];
    const apiKey = process.argv[2];
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
// `/v1/chat/completions`. $0, so loopback (host de `ollama-host.js`, validado).
//
// Medido (3 corpora reais, rotulo cego): acc 0,600 / 0,614 / 0,622 contra
// «T2 sempre» 0,450 / 0,316 / 0,243 e a regra 0,325 / 0,439 / 0,324; p50 quente
// 147–162 ms; ECE 0,110 / 0,124 / 0,146 — acima do tecto 0,10 as tres vezes.
// E por isso que isto NAO roteia:
//
//   1. OPT-IN — so corre com MOOTER_DECISOR_SHADOW=1 (o dono liga; ver
//      RUN-DECISOR-SHADOW-ON.bat). Sem a env, ou com MOOTER_ARBITER_DISABLE=1,
//      zero comportamento novo.
//   2. FORA DO CAMINHO CRITICO — o hook so tira um snapshot de 4 campos da
//      decisao e lanca um worker DESLIGADO (`node arbiter.js --shadow-worker`,
//      payload por stdin, nunca por argv). O hook nao espera; a rota nunca
//      espera. (Round 3 do adversario, A3: a 1.a versao usava spawnSync e
//      gastava ate 800 ms do orcamento de 5 s do hook.)
//   3. LOG SEM TEXTO — evento `decisor_shadow` no decisions.log so com
//      `prompt_sha12` + `prompt_len`; nem preview (A1: o `classified` da mesma
//      sessao ja tem os 80 chars; o shadow nao acrescenta texto nenhum).
//   4. FAST-FAIL + AQUECIMENTO UNICO — 800 ms de tecto (AMENDMENT mp3-2 +
//      erratum). O Ollama 0.34 aborta o carregamento quando o cliente desliga,
//      por isso em timeout o proprio worker aquece o modelo (keep_alive 30m),
//      com lock de 90 s para nunca haver dois aquecimentos ao mesmo tempo (A4).
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
// 400 ms no pre-registo (MP3 §B0, a partir dos 147-162 ms medidos EM PROCESSO); AMENDMENT mp3-2 + erratum:
// pelo caminho do hook o custo intrinseco e ~245 ms quente, ~400 ms a re-avaliar o prefixo. 800 da margem;
// o frio (~2,5 s) continua a ser timeout — e agora ninguem espera por ele.
const DECISOR_TIMEOUT_MS = 800;
const DECISOR_ABSTAIN_BELOW = 0.4;
// MP8 (2026-09-21): o evento passa a dizer se o prompt bate no predicado HIGH_RISK que o hook usa para recusar
// despromocoes (inject_context.js:HIGH_RISK_HINT). E uma COPIA — o arbiter.js nao pode requerer o hook (correria
// o hook). A paridade byte-a-byte com a de inject_context.js e imposta por arbiter-shadow.test.js (9).
const HIGH_RISK_HINT = /\b(?:push|deploy|release|migration|migrac|drop\s+table|rm\s+-rf|reset\s+--hard|\.env|secret|credential|api[_ ]?key|architect|arquitetur|refactor|refator|critical|cr[ií]tic|audit|review\s+final|merge|ci\s+pipeline|\.github\/workflow)/i;
const DECISOR_PROMPT_MAX_CHARS = 4000;
const DECISOR_KEEP_ALIVE = '30m';
const DECISOR_WARM_LOCK_MS = 90 * 1000;
const LOOPBACK_HOST = /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:\d+)?$/i;

/** @returns {string} */
function decisorModel() {
  return process.env.MOOTER_DECISOR_MODEL || 'qwen2.5-coder:14b';
}
/** @returns {string | null}  so loopback; qualquer outro destino -> null (nunca se chama) */
function decisorHost() {
  let host = 'http://127.0.0.1:11434';
  try { host = require('./ollama-host.js').ollamaHostFromEnv(); } catch { /* default acima */ }
  const clean = String(host).replace(/\/+$/, '');
  return LOOPBACK_HOST.test(clean) ? clean : null;
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
 * As 4 chamadas em sequencia, assincronas, com um orcamento total. Devolve as respostas cruas
 * do /v1/chat/completions ou { error }. Nunca lanca. Redirects recusados (so loopback).
 * @param {string} prompt
 * @param {number} [budgetMs]
 * @returns {Promise<{ responses?: unknown[], error?: string }>}
 */
async function ollamaLogitAsync(prompt, budgetMs = DECISOR_TIMEOUT_MS) {
  const host = decisorHost();
  if (!host) return { error: 'refused_non_loopback' };
  const model = decisorModel();
  const deadline = Date.now() + budgetMs;
  const out = [];
  try {
    for (const q of Object.values(DECISOR_QUESTIONS)) {
      const left = deadline - Date.now();
      if (left <= 0) return { error: 'timeout' };
      const body = { model, temperature: 0, max_tokens: 1, logprobs: true, top_logprobs: 10, keep_alive: DECISOR_KEEP_ALIVE, messages: decisorMessages(prompt, q) };
      // `connection: close`: sem socket keep-alive pendurado, o filho/worker sai sozinho quando acaba —
      // um process.exit() com handles do undici abertos dispara uma assercao do libuv no Windows (medido).
      const r = await fetch(`${host}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(left) });
      out.push(await r.json());
    }
    return { responses: out };
  } catch (e) {
    const name = String((e && /** @type {any} */ (e).name) || e);
    return { error: /abort|timeout/i.test(name) ? 'timeout' : 'failed' };
  }
}

/**
 * Versao SINCRONA (chamadores directos, CLI, testes): corre `ollamaLogitAsync` num filho, payload por
 * STDIN (nunca por argv — no Windows a linha de comandos e visivel a outros processos; round 3, A2).
 * @param {string} prompt
 * @returns {{ responses?: unknown[], error?: string }}
 */
function callOllamaLogitSync(prompt) {
  const r = spawnSync(process.execPath, [__filename, '--logit-child'], {
    input: JSON.stringify({ prompt, budgetMs: DECISOR_TIMEOUT_MS }),
    encoding: 'utf8',
    timeout: DECISOR_TIMEOUT_MS + 400, // margem para o arranque do filho
    windowsHide: true,
  });
  const spawnErr = /** @type {(Error & { code?: string }) | undefined} */ (r.error);
  if (spawnErr && /ETIMEDOUT/.test(String(spawnErr.code || spawnErr.message))) return { error: 'timeout' };
  if (r.status !== 0 || !r.stdout) return { error: 'failed' };
  try { return JSON.parse(r.stdout); } catch { return { error: 'parse_failed' }; }
}

/**
 * Le a probabilidade de cada letra dos top_logprobs da 1.a posicao (igual ao braco D).
 * Exige logprobs finitos e massa > 0 nas letras (A15): senao null -> `parse_failed`.
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
    if (!Number.isFinite(t.logprob)) return null;
    const L = String(t.token).trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.includes(L)) probs[L] = (probs[L] || 0) + Math.exp(t.logprob);
  }
  const mass = Object.values(probs).reduce((a, b) => a + b, 0);
  if (!(mass > 0)) return null;
  /** @type {Record<string, number>} */
  const norm = {};
  for (const L of letters) norm[String(options[L])] = (probs[L] || 0) / mass;
  return { probs: norm, mass_on_letters: mass };
}

/**
 * Respostas cruas -> resultado v0 (argmax do tier). Partilhado pelos caminhos sincrono, assincrono e mock.
 * @param {{ responses?: unknown[], error?: string } | null | undefined} raw
 * @param {number} latencyMs
 * @returns {{ result: DecisorShadowResult | null, outcome: string }}
 */
function decisorResult(raw, latencyMs) {
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
      abstained: pt[tier] < DECISOR_ABSTAIN_BELOW, // flag: o tier existe na mesma; a avaliacao conta-o como previsao (como no braco D)
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
 * Decisor tipado local (braco D, politica v0 = argmax do tier). Sincrono. Nunca roteia.
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
  return decisorResult(raw, Date.now() - t0);
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
 * Os UNICOS campos da decisao que o shadow ve — copiados por valor, validados por tipo e tamanho (A6).
 * @param {Record<string, unknown> | null | undefined} decision
 * @returns {{ tier: string | null, confidence: number | null, task_category: string | null, escalation_rule: string | null, tier_arbiter_haiku: string | null, risk_level: string | null }}
 */
function decisionSnapshot(decision) {
  const d = /** @type {Record<string, any>} */ (decision && typeof decision === 'object' ? decision : {});
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' && v.length <= 80 ? v : null);
  const tierOf = (/** @type {unknown} */ v) => (/^T[0-3]$/.test(String(v)) ? String(v) : null);
  const arb = d.arbiter && typeof d.arbiter === 'object' ? d.arbiter : null;
  return {
    tier: tierOf(d.tier),
    confidence: typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? d.confidence : null,
    task_category: str(d.task_category),
    escalation_rule: str(d.escalation_rule),
    // MP8: o risk_level da regra (classify.js) — so um dos 4 valores, senao null.
    risk_level: ['minimal', 'low', 'medium', 'high'].includes(d.risk_level) ? String(d.risk_level) : null,
    // O arbiter Haiku corre DEPOIS deste ponto no hook (MP3 §B0); so chamadores directos o trazem.
    // O 09-shadow-report junta ao `classified` da mesma sessao para o tier final.
    tier_arbiter_haiku: arb ? (arb.honored ? tierOf(d.tier) : tierOf(arb.proposed_tier)) : null,
  };
}

/**
 * Constroi o evento (sem texto do prompt: sha12 + len, e nada mais).
 * @param {string} prompt
 * @param {ReturnType<typeof decisionSnapshot>} snap
 * @param {{ result: DecisorShadowResult | null, outcome: string }} r
 * @param {{ session_id?: string | null, hook_ts_ms?: number | null }} meta
 * @returns {DecisorShadowEvent}
 */
function shadowEvent(prompt, snap, r, meta) {
  const { result, outcome } = r;
  return {
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
    hook_ts_ms: meta.hook_ts_ms ?? null,
    event: 'decisor_shadow',
    outcome,
    session_id: meta.session_id || null,
    prompt_sha12: crypto.createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 12),
    prompt_len: prompt.length,
    tier_regra: snap.tier,
    confidence_regra: snap.confidence,
    task_category: snap.task_category,
    escalation_rule_regra: snap.escalation_rule,
    // MP8: o que o gate de F2 (mp4-3) precisa sem recuperar texto — o predicado de producao sobre o prompt CRU, e o risk_level da regra.
    high_risk_hint: HIGH_RISK_HINT.test(prompt),
    risk_level_regra: snap.risk_level,
    tier_arbiter_haiku: snap.tier_arbiter_haiku,
    tier_D: result ? result.tier : null,
    probs_D: result ? result.probabilities : null,
    p_max_D: result ? result.p_max : null,
    abstained_D: result ? result.abstained : null,
    ms_D: result ? result.latency_ms : null,
    aux_D: result ? result.aux : null,
    agree_regra: result && snap.tier ? result.tier === snap.tier : null,
    backend: 'ollama-logit',
    model: decisorModel(),
  };
}
/**
 * @param {DecisorShadowEvent} event
 * @param {string} logPath
 * @returns {boolean}  true se ficou no disco
 */
function appendShadowEvent(event, logPath) {
  try { fs.appendFileSync(logPath, JSON.stringify(event) + '\n', 'utf8'); return true; } catch { return false; }
}
/**
 * Aquecimento unico: pede ao Ollama para carregar o modelo (keep_alive 30m) e ESPERA pelo fim — e o
 * cliente desligar que aborta o carregamento no 0.34. Lock por ficheiro (90 s) para nunca haver dois.
 * @param {string} model
 */
async function warmDecisorModel(model) {
  const host = decisorHost(); if (!host) return false;
  const lock = path.join(os.tmpdir(), `mooter-decisor-warm-${model.replace(/[^\w.-]/g, '_')}.lock`);
  try { const st = fs.statSync(lock); if (Date.now() - st.mtimeMs < DECISOR_WARM_LOCK_MS) return false; } catch { /* sem lock */ }
  try { fs.writeFileSync(lock, String(process.pid)); } catch { /* best-effort */ }
  try {
    await fetch(`${host}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: DECISOR_KEEP_ALIVE }), redirect: 'error', signal: AbortSignal.timeout(120000) });
    return true;
  } catch { return false; }
}

/**
 * Modo sombra. Regista o que o decisor local DIRIA, ao lado do que a regra decidiu.
 *  - sem MOOTER_DECISOR_SHADOW=1, ou com MOOTER_ARBITER_DISABLE=1 -> null, zero efeitos;
 *  - caminho real: snapshot de 4 campos + spawn DESLIGADO do worker; devolve { detached: true }
 *    sem esperar (a rota e o hook nunca esperam);
 *  - com mocks (testes) ou `_inline`: corre aqui e devolve o evento escrito.
 * Nunca escreve em `decision`. Nunca lanca.
 * @param {string} prompt
 * @param {Record<string, unknown> | null | undefined} decision  a decisao JA tomada pelo hook
 * @param {ShadowOptions} [options]
 * @returns {DecisorShadowEvent | { detached: true, pid: number | null } | null}
 */
function shadowDecisor(prompt, decision, options = {}) {
  try {
    if (!options._force && process.env.MOOTER_DECISOR_SHADOW !== '1') return null;
    if (process.env.MOOTER_ARBITER_DISABLE === '1') return null;
    if (!prompt || typeof prompt !== 'string') return null;
    const snap = decisionSnapshot(decision);
    const logPath = options._logPath || process.env.MOOTER_DECISIONS_LOG || LOG_PATH;
    const meta = { session_id: options.session_id || null, hook_ts_ms: Date.now() };
    if (options._inline || Array.isArray(options._mockResponses) || options._mockTimeout) {
      const event = shadowEvent(prompt, snap, ollamaLogitRaw(prompt, options), meta);
      appendShadowEvent(event, logPath);
      return event;
    }
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [__filename, '--shadow-worker'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    child.on('error', () => { /* best-effort: um spawn falhado nunca chega ao hook */ });
    child.stdin.on('error', () => { /* idem */ });
    child.stdin.end(JSON.stringify({ prompt, snap, meta, logPath }));
    child.unref();
    return { detached: true, pid: child.pid || null };
  } catch {
    return null;
  }
}
/** O worker desligado: le o payload por stdin, corre o decisor, escreve o evento, aquece em timeout. */
async function shadowWorkerMain() {
  let payload; try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }
  const { prompt, snap, meta, logPath } = payload; if (!prompt || !snap) return;
  const t0 = Date.now();
  const raw = await ollamaLogitAsync(String(prompt));
  const r = decisorResult(raw, Date.now() - t0);
  appendShadowEvent(shadowEvent(String(prompt), snap, r, meta || {}), logPath || LOG_PATH);
  if (r.outcome === 'timeout') await warmDecisorModel(decisorModel());
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
  ollamaLogitAsync,
  shadowDecisor,
  decisionSnapshot,
  DECISOR_QUESTIONS,
  DECISOR_TIMEOUT_MS,
};

// CLI mode — useful for debugging: `node arbiter.js "some prompt"`
if (require.main === module) {
  if (process.argv[2] === '--shadow-worker') {
    // F2-shadow: worker desligado do hook (payload por stdin). Sai em silencio; nunca escreve texto em lado nenhum.
    shadowWorkerMain().then(() => { process.exitCode = 0; }, () => { process.exitCode = 0; });
  } else if (process.argv[2] === '--logit-child') {
    // F2-shadow: filho do caminho sincrono (ollamaLogit); payload por stdin, respostas cruas por stdout.
    /** @type {{ prompt?: string, budgetMs?: number }} */
    let p = {}; try { p = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* vazio */ }
    ollamaLogitAsync(String(p.prompt || ''), p.budgetMs).then((raw) => { process.stdout.write(JSON.stringify(raw)); process.exitCode = 0; }, () => { process.stdout.write(JSON.stringify({ error: 'failed' })); process.exitCode = 0; });
  } else {
    const prompt = process.argv.slice(2).join(' ').trim();
    if (!prompt) {
      console.error('usage: node arbiter.js "<prompt>"');
      process.exit(1);
    }
    const result = arbitrate(prompt);
    console.log(JSON.stringify(result, null, 2));
  }
}
