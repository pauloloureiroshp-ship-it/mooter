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

/**
 * rewriteElement({ nodeSource, prompt, file, line }, opts?) → Promise<{ok:true, text, model} |
 * {ok:false, reason, detail?}>. opts (all optional, injectable for tests): baseUrl, model,
 * timeoutMs, prefsFile, fetchImpl.
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
  // Context is file:line ONLY — never file content. The element + the instruction is the whole read.
  const where = ((input && input.file) ? String(input.file) : '')
    + ((input && Number.isInteger(input.line)) ? (':' + input.line) : '');
  const userPrompt = 'Instrução: ' + prompt + '\n'
    + (where ? ('Localização (contexto, NÃO leres mais nada): ' + where + '\n') : '')
    + 'Elemento JSX:\n' + nodeSource;
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch { /* noop */ } }, timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(baseUrl + '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, system: SYSTEM_PROMPT, prompt: userPrompt, stream: false, options: { temperature: 0.2 } }),
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
    const text = cleanModelReply(body && body.response);
    if (!text) return { ok: false, reason: 'local-model-empty' };
    return { ok: true, text, model };
  } finally { clearTimeout(timer); }
}

module.exports = {
  rewriteElement,
  localModelName,
  readPrefs,
  cleanModelReply,
  prefsPath,
  SYSTEM_PROMPT,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  MAX_NODE_BYTES,
};
