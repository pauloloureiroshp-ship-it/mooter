// Live Edit · MP5.0/5.1 — host-side glue (pure, VS-Code-agnostic so it unit-tests).
//
// extension.js keeps the vscode.* calls (showTextDocument, panel messaging); THIS module owns the
// security-critical + deterministic logic: parse a `data-insp-path`, CLAMP every file path to the
// workspace root (the framed dev-server is a foreign origin — never trust its paths), apply a $0
// AST edit with atomic rollback, and (fail-soft) ask the FROZEN classify.js what tier an instruction
// would get. No LLM is ever called for a deterministic edit.

const path = require('path');
let AST = null;
try { AST = require('./live-edit-ast.js'); } catch { AST = null; }

const ALLOWED_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs']);

// Parse the `data-insp-path` value stamped by code-inspector-plugin. Handles BOTH the documented
// "file:line:col:tag" and a tag-less "file:line:col", and survives a Windows drive colon
// (C:\Users\…\x.tsx:12:4:div): a purely-numeric LAST token means "no tag" (JSX tag names are never
// all digits), so the tag is only consumed when it's non-numeric; whatever remains is the file.
function parseInspPath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split(':');
  if (parts.length < 3) return null;
  let tag = null;
  if (!/^\d+$/.test(parts[parts.length - 1])) tag = parts.pop();
  const col = Number(parts.pop());
  const line = Number(parts.pop());
  const file = parts.join(':');
  if (!file || !Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { file, line, col, tag: tag || null };
}

// Resolve `file` against the workspace root and REFUSE anything that escapes it or isn't a JS/TS
// source. Returns the absolute path on success, or null. This is the single choke point that keeps
// a malicious/confused framed page from making the host open or overwrite arbitrary files.
function clampToWorkspace(wsRoot, file) {
  if (!wsRoot || !file || typeof file !== 'string') return null;
  const abs = path.isAbsolute(file) ? path.normalize(file) : path.resolve(wsRoot, file);
  const rel = path.relative(wsRoot, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null; // outside the workspace
  if (!ALLOWED_EXT.has(path.extname(abs).toLowerCase())) return null;    // only source files
  return abs;
}

// Apply a deterministic op to a file on disk. Reads → AST mutate → write (only if changed).
// Returns { ok, changed, touched, reason, absPath, prev } — `prev` is the pre-edit bytes so the
// caller can offer an atomic undo. On any failure the file is left untouched (fail-closed).
function applyEditToFile(fs, wsRoot, sel, op) {
  const absPath = clampToWorkspace(wsRoot, sel && sel.file);
  if (!absPath) return { ok: false, changed: false, reason: 'path fora do workspace ou tipo não suportado' };
  if (!AST) return { ok: false, changed: false, reason: 'AST indisponível' };
  let src;
  try { src = fs.readFileSync(absPath, 'utf8'); }
  catch (e) { return { ok: false, changed: false, reason: 'leitura falhou: ' + (e && e.message) }; }
  const res = AST.applyEdit(src, { line: sel.line, col: sel.col, tag: sel.tag }, op);
  if (!res.changed) return { ok: true, changed: false, reason: res.reason, absPath };
  try { fs.writeFileSync(absPath, res.code, 'utf8'); }
  catch (e) { return { ok: false, changed: false, reason: 'escrita falhou: ' + (e && e.message), absPath }; }
  return { ok: true, changed: true, touched: res.touched, absPath, prev: src };
}

// Atomic rollback: write the previously-captured bytes back. Fail-soft.
function undoEditToFile(fs, absPath, prev) {
  if (!absPath || prev == null) return { ok: false, reason: 'nada para desfazer' };
  try { fs.writeFileSync(absPath, prev, 'utf8'); return { ok: true }; }
  catch (e) { return { ok: false, reason: 'undo falhou: ' + (e && e.message) }; }
}

// The honest chip. Deterministic ops NEVER touch a model → always local $0. Only a free-text
// instruction (the MP5.2 bridge) is classified. classify.js is FROZEN — we only ever INVOKE it.
function deterministicChip() {
  return { tier: 'T0', label: '🐮 local · $0 · sem LLM', local: true, cost: 0 };
}

// Ask classify.js (frozen) what tier an instruction would get. `runNode(args)` must exec
// `node <classifyPath> <instruction>` and return stdout (extension.js injects child_process so this
// stays testable). Fail-soft: any error → null, and the UI keeps the honest local default.
function classifyInstruction(runNode, classifyPath, instruction) {
  if (!instruction || !classifyPath) return null;
  try {
    const out = runNode(classifyPath, String(instruction));
    const j = JSON.parse(out);
    const tier = j.tier || (j.decision && j.decision.tier) || null;
    const model = j.recommended_model || j.model || (j.decision && j.decision.recommended_model) || null;
    if (!tier) return null;
    return { tier, model, local: tier === 'T0', label: chipLabelForTier(tier, model) };
  } catch { return null; }
}

function chipLabelForTier(tier, model) {
  switch (tier) {
    case 'T0': return '🐮 local · $0';
    case 'T1': return '☁ Haiku · barato';
    case 'T2': return '☁ Sonnet';
    case 'T3': return '☁ Opus';
    case 'T5': return '✨ Fable (@fable)';
    default: return String(tier);
  }
}

module.exports = {
  parseInspPath, clampToWorkspace, applyEditToFile, undoEditToFile,
  deterministicChip, classifyInstruction, chipLabelForTier, ALLOWED_EXT,
};
