'use strict';
/**
 * live-edit-ast.js — Live Edit (MP5.1) · the deterministic $0 edit engine. ZERO LLM.
 *
 * The select-to-edit tap hands us file:line:col:tag (from the dev-only data-insp-path attribute).
 * Here we locate that exact JSX node with @babel/parser and apply the edit as a BYTE-SPLICE on the
 * ORIGINAL source: only the element's text span or its className inner span is replaced in place, so
 * EVERY other byte (indentation, the rest of the line, sibling code) survives untouched. That is what
 * makes it regression-proof, gives a minimal reviewable diff, and makes rollback trivial (a single
 * localized span). We deliberately do NOT AST-reprint (recast mangles JSXText whitespace); the AST is
 * used ONLY to find the span. classify.js is never consulted — a deterministic edit costs nothing.
 *
 * Two kinds cover ~80% of visual edits (the doctrine): 'text' (a pure-text element's content) and
 * 'class' (the className string — colour/spacing/radius are all Tailwind class changes). Anything
 * structural or dynamic is REFUSED with an honest reason (that is the LLM path, MP5.2). Fail-soft:
 * every entry returns { ok:false, reason } instead of throwing, so the host can report honestly.
 */

let babel = null;
try { babel = require('@babel/parser'); } catch { babel = null; }

const PARSE_OPTS = {
  sourceType: 'module',
  allowReturnOutsideFunction: true,
  plugins: [
    'jsx', 'typescript', 'decorators-legacy', 'classProperties',
    'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait',
  ],
};

function parse(source) {
  if (!babel) return { error: 'parser-unavailable' };
  try { return { ast: babel.parse(source, PARSE_OPTS) }; }
  catch (e) { return { error: (e && e.message) ? String(e.message).slice(0, 200) : 'parse error' }; }
}

// Depth-first collect every JSXElement. Guards against cycles (a node reached twice) and skips the
// bulky `loc`/comment fields — we only need the structural tree.
function collectJsxElements(ast) {
  const out = [];
  const seen = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if (seen.has(n)) return;
    seen.add(n);
    if (n.type === 'JSXElement') out.push(n);
    for (const k in n) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      const v = n[k];
      if (v && typeof v === 'object') walk(v);
    }
  })(ast);
  return out;
}

// Best-effort JSX tag name as a string ('div', 'Foo', 'Foo.Bar', 'ns:tag').
function tagNameOf(opening) {
  const nm = opening && opening.name;
  if (!nm) return '';
  if (nm.type === 'JSXIdentifier') return nm.name || '';
  if (nm.type === 'JSXMemberExpression') {
    const o = (nm.object && nm.object.name) || '';
    const p = (nm.property && nm.property.name) || '';
    return o && p ? o + '.' + p : (o || p);
  }
  if (nm.type === 'JSXNamespacedName') {
    return ((nm.namespace && nm.namespace.name) || '') + ':' + ((nm.name && nm.name.name) || '');
  }
  return '';
}

// Locate the JSXElement whose opening tag matches {line, tag, col}. Line is the strong signal from
// data-insp-path; same-line ties break by tag name, then by nearest column (0- vs 1-based tolerant).
function locate(elements, target) {
  const line = target && Number.isInteger(target.line) ? target.line : null;
  if (line == null) return null;
  let cands = elements.filter(
    (e) => e.openingElement && e.openingElement.loc && e.openingElement.loc.start.line === line,
  );
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  const tag = target.tag ? String(target.tag).toLowerCase() : '';
  if (tag) {
    const byTag = cands.filter((e) => tagNameOf(e.openingElement).toLowerCase() === tag);
    if (byTag.length === 1) return byTag[0];
    if (byTag.length > 1) cands = byTag;
  }
  const col = Number.isInteger(target.col) ? target.col : null;
  if (col == null) return cands[0];
  let best = cands[0];
  let bestD = Infinity;
  for (const e of cands) {
    const c = e.openingElement.loc.start.column;
    const d = Math.min(Math.abs(c - col), Math.abs(c - (col - 1)));
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

const UNSAFE = /[<>{}]/; // JSX-significant chars — a value carrying these is not a deterministic edit

// Replace a pure-text element's content, preserving the exact leading/trailing whitespace so the
// surrounding indentation is byte-identical. Refuses mixed/dynamic content (that is the LLM path).
function editText(source, el, value) {
  if (typeof value !== 'string') return { ok: false, reason: 'bad-value' };
  if (UNSAFE.test(value)) return { ok: false, reason: 'unsafe-text' };
  const kids = el.children || [];
  const nonWs = kids.filter((c) => !(c.type === 'JSXText' && !c.value.trim()));
  const texts = nonWs.filter((c) => c.type === 'JSXText');
  if (nonWs.length !== 1 || texts.length !== 1) return { ok: false, reason: 'not-simple-text' };
  const t = texts[0];
  const raw = source.slice(t.start, t.end);
  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = m ? m[1] : '';
  const trail = m ? m[3] : '';
  const next = source.slice(0, t.start) + lead + value + trail + source.slice(t.end);
  return { ok: true, code: next, changed: next !== source, kind: 'text' };
}

// Set the className. A static string → splice the inner span between the quotes. A dynamic
// ({expr}) className is refused (LLM path). Absent → insert className="…" right after the tag name.
function editClass(source, el, value) {
  if (typeof value !== 'string') return { ok: false, reason: 'bad-value' };
  if (UNSAFE.test(value) || value.indexOf('"') !== -1) return { ok: false, reason: 'unsafe-class' };
  const opening = el.openingElement;
  const attrs = opening.attributes || [];
  const cls = attrs.find((a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'className');
  if (cls) {
    const v = cls.value;
    if (!v) {
      const at = cls.end;
      return { ok: true, code: source.slice(0, at) + '="' + value + '"' + source.slice(at), changed: true, kind: 'class' };
    }
    if (v.type === 'StringLiteral') {
      const inner0 = v.start + 1;
      const inner1 = v.end - 1; // between the quotes
      const next = source.slice(0, inner0) + value + source.slice(inner1);
      return { ok: true, code: next, changed: next !== source, kind: 'class' };
    }
    return { ok: false, reason: 'dynamic-classname' };
  }
  const at = opening.name.end;
  const next = source.slice(0, at) + ' className="' + value + '"' + source.slice(at);
  return { ok: true, code: next, changed: true, kind: 'class' };
}

// Entry point. Pure: returns { ok, code?, changed?, kind? } or { ok:false, reason }.
function applyDeterministicEdit(source, target, edit) {
  if (typeof source !== 'string' || !source) return { ok: false, reason: 'no-source' };
  if (!edit || typeof edit !== 'object') return { ok: false, reason: 'no-edit' };
  const p = parse(source);
  if (p.error) return { ok: false, reason: 'parse-error', detail: p.error };
  const el = locate(collectJsxElements(p.ast), target || {});
  if (!el) return { ok: false, reason: 'not-found' };
  if (edit.kind === 'text') return editText(source, el, edit.value);
  if (edit.kind === 'class') return editClass(source, el, edit.value);
  return { ok: false, reason: 'unknown-kind' };
}

module.exports = {
  applyDeterministicEdit,
  locate,
  collectJsxElements,
  tagNameOf,
  editText,
  editClass,
  PARSE_OPTS,
};
