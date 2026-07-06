'use strict';
/**
 * live-edit-model.js — LP-4 §1 · the $0 LOCAL model runner for prompt-driven Live Edit.
 *
 * {nodeSource, prompt, file, line} → Ollama HTTP (127.0.0.1:11434) via NATIVE fetch — ZERO new
 * dependencies (any new dep would need the .vscodeignore allowlist + live-edit-packaging.test.js
 * treatment; none is needed). The model NEVER sees the whole file — the caller hands us ONLY the
 * selected JSX subtree, and the write is byte-bounded downstream by live-edit-ast.spliceNodeRange
 * anyway (this module bounds what the model READS; the fence bounds what it can WRITE).
 *
 * Model name: ~/.mooter/preferences.json — `live_edit.model`, then `local_model`, then
 * `default_local_model` — fallback qwen3:30b (the doctrine default).
 *
 * Fail-soft everywhere, honest reasons the panel can render verbatim:
 *   Ollama unreachable → { ok:false, reason:'local-model-offline' }
 *   30s timeout        → { ok:false, reason:'local-model-timeout' }
 *   non-200 / bad body → { ok:false, reason:'local-model-error', detail }
 *   empty reply        → { ok:false, reason:'local-model-empty' }
 * Never throws; never retries (no storm against a busy GPU).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MODEL = 'qwen3:30b';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 30000;
// A JSX subtree bigger than this is not a "pin one element" edit — refuse honestly instead of
// shipping a novel to a 30B local model (and it would blow the fence's single-root check anyway).
const MAX_NODE_BYTES = 32 * 1024;

// The strict contract (the brief's words): rewrite ONLY this element; return ONLY the element.
const SYSTEM_PROMPT = 'Reescreve APENAS este elemento JSX segundo a instrução do utilizador. '
  + 'Devolve SÓ o elemento JSX reescrito — sem prosa, sem markdown, sem comentários, sem explicações. '
  + 'Mantém tudo o que a instrução não pede para mudar.';

// LP-4.7 §4 — the structured ENVELOPE. Ollama structured outputs constrain ONLY the wrapper
// ({jsx, new_imports}); the JSX inside stays free-form — constraining the grammar itself is
// the documented "format tax" (study §1). new_imports feeds the §3 import fence downstream.
const ENVELOPE_SYSTEM_PROMPT = 'Reescreve APENAS este elemento JSX segundo a instrução do utilizador. '
  + 'Responde SÓ com JSON válido: {"jsx": string, "new_imports": string[]}. '
  + '"jsx" = o elemento JSX reescrito completo — um único elemento raiz, sem comentários, sem markdown. '
  + '"new_imports" = declarações ES import completas de que o teu JSX precisa e que o ficheiro ainda não deve ter '
  + '(ex.: "import { Star } from \'lucide-react\'"); [] se não precisares de nenhuma. '
  + 'Mantém tudo o que a instrução não pede para mudar.';

const ENVELOPE_FORMAT = {
  type: 'object',
  properties: {
    jsx: { type: 'string' },
    new_imports: { type: 'array', items: { type: 'string' } },
  },
  required: ['jsx'],
};

function prefsPath() { return path.join(os.homedir(), '.mooter', 'preferences.json'); }

function readPrefs(file) {
  try { return JSON.parse(fs.readFileSync(file || prefsPath(), 'utf8').replace(/^\uFEFF/, '')); }
  catch { return null; }
}

// Which local moo answers the prompt. Precedence: the Live-Edit-specific key wins, then the
// general local default, then the doctrine fallback. Never invents a model name.
function localModelName(prefs) {
  const p = (prefs && typeof prefs === 'object') ? prefs : {};
  const le = (p.live_edit && typeof p.live_edit === 'object') ? p.live_edit : {};
  const cands = [le.model, p.local_model, p.default_local_model];
  for (const c of cands) { if (typeof c === 'string' && c.trim()) return c.trim(); }
  return DEFAULT_MODEL;
}

// Strip the wrappers a chatty model may add around the element. A qwen3-style <think>…</think>
// reasoning block is never part of the element; a ```jsx fence is unwrapped to its content. The
// result is NOT validated here — live-edit-ast.spliceNodeRange is the fence (parse + single root
// + no comments + byte-bounded), so junk gets an honest refusal there, never a write.
function cleanModelReply(text) {
  let t = String(text == null ? '' : text);
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fence = t.match(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/);
  if (fence && fence[1] && fence[1].trim()) t = fence[1];
  return t.trim();
}

// Envelope reply → { jsx, newImports } | null. Structured outputs give clean JSON on a modern
// Ollama; a <think> block or an older daemon that ignored `format` degrade to a best-effort
// brace-scan, and a reply that is not an envelope at all returns null so the caller can fall
// back to the legacy free-text cleaning — honest downgrade, never a fabricated envelope.
function parseEnvelope(text) {
  let t = String(text == null ? '' : text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!t) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(t);
  if (!obj) {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b > a) obj = tryParse(t.slice(a, b + 1));
  }
  if (!obj || typeof obj !== 'object' || typeof obj.jsx !== 'string') return null;
  const imports = Array.isArray(obj.new_imports)
    ? obj.new_imports.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];
  return { jsx: obj.jsx, newImports: imports };
}

/**
 * rewriteElement({ nodeSource, prompt, file, line }, opts?) → Promise<{ok:true, text, model,
 * newImports, envelope} | {ok:false, reason, detail?}>. opts (all optional, injectable for
 * tests): baseUrl, model, timeoutMs, prefsFile, fetchImpl, temperature, envelope (structured
 * {jsx,new_imports} wrapper — LP-4.7 §4), extraBlocks (strings appended between instruction
 * and element — the §3 asset block, the retry round's exact-error feedback). One call, one
 * answer: retries belong to the quality engine, never here (no storm against a busy GPU).
 */
async function rewriteElement(input, opts) {
  const o = opts || {};
  const nodeSource = (input && typeof input.nodeSource === 'string') ? input.nodeSource : '';
  const prompt = (input && typeof input.prompt === 'string') ? input.prompt.trim() : '';
  if (!nodeSource.trim() || !prompt) return { ok: false, reason: 'bad-request' };
  if (Buffer.byteLength(nodeSource, 'utf8') > MAX_NODE_BYTES) return { ok: false, reason: 'node-too-large' };
  const fetchImpl = o.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { ok: false, reason: 'local-model-offline', detail: 'fetch-unavailable' };
  const baseUrl = String(o.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = (typeof o.model === 'string' && o.model.trim())
    ? o.model.trim()
    : localModelName(readPrefs(o.prefsFile));
  const timeoutMs = (Number.isFinite(o.timeoutMs) && o.timeoutMs > 0) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;
  const temperature = (Number.isFinite(o.temperature) && o.temperature >= 0) ? o.temperature : 0.2;
  const useEnvelope = o.envelope === true;
  const blocks = Array.isArray(o.extraBlocks) ? o.extraBlocks.filter((b) => typeof b === 'string' && b.trim()) : [];
  // Context is file:line ONLY — never file content. The element + the instruction is the whole read.
  const where = ((input && input.file) ? String(input.file) : '')
    + ((input && Number.isInteger(input.line)) ? (':' + input.line) : '');
  const userPrompt = 'Instrução: ' + prompt + '\n'
    + (blocks.length ? (blocks.join('\n') + '\n') : '')
    + (where ? ('Localização (contexto, NÃO leres mais nada): ' + where + '\n') : '')
    + 'Elemento JSX:\n' + nodeSource;
  const payload = {
    model,
    system: useEnvelope ? ENVELOPE_SYSTEM_PROMPT : SYSTEM_PROMPT,
    prompt: userPrompt,
    stream: false,
    options: { temperature },
  };
  if (useEnvelope) payload.format = ENVELOPE_FORMAT;
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch { /* noop */ } }, timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(baseUrl + '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
    } catch (e) {
      const aborted = (e && (e.name === 'AbortError' || String(e.message || '').indexOf('abort') !== -1));
      return aborted
        ? { ok: false, reason: 'local-model-timeout' }
        : { ok: false, reason: 'local-model-offline' };
    }
    if (!res || !res.ok) return { ok: false, reason: 'local-model-error', detail: res ? ('http ' + res.status) : 'no-response' };
    let body;
    try { body = await res.json(); } catch { return { ok: false, reason: 'local-model-error', detail: 'bad-json' }; }
    if (useEnvelope) {
      const env = parseEnvelope(body && body.response);
      if (env) {
        const text = cleanModelReply(env.jsx);
        if (!text) return { ok: false, reason: 'local-model-empty' };
        return { ok: true, text, model, newImports: env.newImports, envelope: true };
      }
      // Envelope asked for but not honoured — fall through to the legacy cleaning, honestly flagged.
    }
    const text = cleanModelReply(body && body.response);
    if (!text) return { ok: false, reason: 'local-model-empty' };
    return { ok: true, text, model, newImports: [], envelope: false };
  } finally { clearTimeout(timer); }
}

module.exports = {
  rewriteElement,
  localModelName,
  readPrefs,
  cleanModelReply,
  parseEnvelope,
  prefsPath,
  SYSTEM_PROMPT,
  ENVELOPE_SYSTEM_PROMPT,
  ENVELOPE_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  MAX_NODE_BYTES,
};
