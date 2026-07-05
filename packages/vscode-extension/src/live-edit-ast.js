// Live Edit · MP5.1 — deterministic $0 edit core (parse-locate + byte-splice).
//
// The whole "80% of edits cost zero tokens" promise lives here: given a source file, a
// `data-insp-path` location (file:line:col:tag) and a deterministic op (setText / setClass /
// bumpSpacing), find the exact JSX node BY IDENTITY and change ONLY its bytes — everything else in
// the file stays byte-for-byte identical. No LLM is ever involved (this module imports no model).
//
// WHY byte-splice, not a full AST reprint: we tried recast, but its babel JSX reprinter reformats
// element children when an attribute changes (collapses text onto the tag line, re-indents the
// close tag). That is the opposite of "regression-proof". Instead we use @babel/parser purely to
// LOCATE the precise character range of the token we're changing (the className string literal, the
// text child, or the insertion point right after the tag name) and splice that range in the raw
// source. Result: a truly surgical diff — only the touched line(s) change — with zero reformatting.
//
// Everything fails CLOSED and HONEST: if the target can't be resolved, or className is a dynamic
// expression (cn(...), template literal), we return { changed:false, reason } instead of guessing —
// the caller surfaces the reason and the user falls back to a structural edit (MP5.2). We never
// corrupt a file we don't fully understand.
//
// New module (Wave: Live Edit) — does not touch classify.js or any packages/router engine file.

let babelParser = null;
try { babelParser = require('@babel/parser'); } catch { babelParser = null; }

function parse(source) {
  return babelParser.parse(source, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    errorRecovery: false,
    plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
  });
}

// Tailwind class → its mutually-exclusive "group" key, so setClass replaces same-axis classes
// (e.g. bg-blue-500 → bg-red-500) instead of stacking a contradictory pair. Conservative: only
// well-known single-axis prefixes; anything unknown is its own group (added, never replacing). A
// variant prefix (hover:, md:, dark:) is part of the group key so `hover:bg-x` never clobbers `bg-y`.
const GROUP_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'shadow', 'rounded', 'font', 'leading', 'tracking',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y', 'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
  'flex', 'grid', 'items', 'justify', 'content', 'self', 'order', 'z', 'opacity', 'top', 'bottom',
  'left', 'right', 'inset',
];
function classGroup(cls) {
  const colon = cls.lastIndexOf(':');
  const variant = colon >= 0 ? cls.slice(0, colon + 1) : '';
  const base = colon >= 0 ? cls.slice(colon + 1) : cls;
  let best = null; // longest matching prefix wins (gap-x beats gap; min-w beats w)
  for (const p of GROUP_PREFIXES) {
    if (base === p || base.startsWith(p + '-')) { if (!best || p.length > best.length) best = p; }
  }
  return best ? variant + best : variant + base;
}
function mergeClasses(existing, incoming) {
  const inList = String(incoming).trim().split(/\s+/).filter(Boolean);
  const inGroups = new Set(inList.map(classGroup));
  const kept = String(existing).trim().split(/\s+/).filter(Boolean)
    .filter((c) => !inGroups.has(classGroup(c)));
  return [...kept, ...inList].join(' ');
}

const SPACING_SCALE = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8',
  '9', '10', '11', '12', '14', '16', '20', '24', '28', '32'];
function bumpSpacingClass(existing, prefix, dir) {
  const list = String(existing).trim().split(/\s+/).filter(Boolean);
  const re = new RegExp('^' + prefix.replace(/[-]/g, '\\-') + '-(' + SPACING_SCALE.map((s) => s.replace('.', '\\.')).join('|') + ')$');
  let cur = null;
  for (const c of list) { const m = c.match(re); if (m) { cur = m[1]; break; } }
  const idx = cur == null ? SPACING_SCALE.indexOf('4') : SPACING_SCALE.indexOf(cur);
  const next = Math.max(0, Math.min(SPACING_SCALE.length - 1, idx + (dir >= 0 ? 1 : -1)));
  return prefix + '-' + SPACING_SCALE[next];
}

// Recursive walk: collect every JSXOpeningElement with a loc. No @babel/traverse needed.
function collectOpenings(ast) {
  const out = [];
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (typeof node.type === 'string') {
      seen.add(node);
      if (node.type === 'JSXOpeningElement' && node.loc) out.push(node);
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range' || k === 'tokens' || k === 'comments' || k === 'extra') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v);
    }
  })(ast.program || ast);
  return out;
}

// Pick the JSXOpeningElement matching the stamped line. Prefer an exact start-line match (what
// code-inspector stamps); otherwise the tightest element whose range contains the line.
function findOpening(ast, line) {
  const openings = collectOpenings(ast);
  const exact = openings.filter((o) => o.loc.start.line === line);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact.sort((a, b) => span(a) - span(b))[0];
  const containing = openings.filter((o) => o.loc.start.line <= line && o.loc.end.line >= line);
  if (containing.length) return containing.sort((a, b) => span(a) - span(b))[0];
  return null;
}
function span(o) { return (o.loc.end.line - o.loc.start.line) * 1000 + (o.loc.end.column - o.loc.start.column); }

function getAttr(opening, name) {
  return (opening.attributes || []).find(
    (a) => a && a.type === 'JSXAttribute' && a.name && a.name.name === name);
}

// The parent JSXElement of an opening — needed for setText (it owns `.children`).
function findElementFor(ast, opening) {
  let found = null;
  const seen = new Set();
  (function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (typeof node.type === 'string') {
      seen.add(node);
      if (node.type === 'JSXElement' && node.openingElement === opening) { found = node; return; }
    }
    for (const k of Object.keys(node)) {
      if (found) return;
      if (k === 'loc' || k === 'tokens' || k === 'comments' || k === 'extra' || k === 'range') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v);
    }
  })(ast.program || ast);
  return found;
}

function splice(src, start, end, replacement) { return src.slice(0, start) + replacement + src.slice(end); }
function no(source, reason) { return { changed: false, code: source, touched: [], reason }; }
function done(source, code) {
  if (code === source) return no(source, 'sem alteração');
  return { changed: true, code, touched: diffLines(source, code), reason: null };
}

// Apply a deterministic op. Returns { changed, code, touched, reason }.
//   op.kind: 'setText'     → op.text
//            'setClass'    → op.classes (space-separated; merged by group)
//            'bumpSpacing' → op.prefix ('p','px','m',…), op.dir (+1 / -1)
// Never throws for a "can't do this cleanly" case — returns changed:false + reason.
function applyEdit(source, loc, op) {
  if (!babelParser) return no(source, 'parser ausente (@babel/parser)');
  if (!loc || !Number.isFinite(loc.line)) return no(source, 'localização inválida');
  let ast;
  try { ast = parse(source); }
  catch (e) { return no(source, 'parse falhou: ' + (e && e.message)); }

  const opening = findOpening(ast, loc.line);
  if (!opening) return no(source, 'elemento não encontrado na linha ' + loc.line);

  if (op.kind === 'setClass' || op.kind === 'bumpSpacing') {
    const attr = getAttr(opening, 'className');
    if (attr) {
      if (attr.value && attr.value.type === 'StringLiteral') {
        const raw = source.slice(attr.value.start, attr.value.end); // includes the quotes
        const q = raw[0] === "'" ? "'" : '"';
        const existing = attr.value.value;
        const next = op.kind === 'bumpSpacing'
          ? mergeClasses(existing, bumpSpacingClass(existing, op.prefix, op.dir))
          : mergeClasses(existing, op.classes);
        if (next === existing) return no(source, 'sem alteração');
        return done(source, splice(source, attr.value.start, attr.value.end, q + next + q));
      }
      return no(source, 'className dinâmico — usa edição estrutural (MP5.2)');
    }
    // No className yet → insert one right after the tag name.
    const next = op.kind === 'bumpSpacing'
      ? bumpSpacingClass('', op.prefix, op.dir)
      : String(op.classes || '').trim();
    if (!next) return no(source, 'sem classes a aplicar');
    const at = opening.name.end;
    return done(source, splice(source, at, at, ' className="' + next + '"'));
  }

  if (op.kind === 'setText') {
    if (opening.selfClosing) return no(source, 'elemento self-closing — texto não aplicável');
    const el = findElementFor(ast, opening);
    if (!el) return no(source, 'elemento sem corpo — texto não aplicável');
    const kids = el.children || [];
    const nonText = kids.filter((c) => c.type !== 'JSXText'
      && !(c.type === 'JSXExpressionContainer' && c.expression && c.expression.type === 'JSXEmptyExpression'));
    if (nonText.length > 0) return no(source, 'elemento tem filhos não-texto — usa edição estrutural (MP5.2)');
    const newText = String(op.text == null ? '' : op.text);
    const textKids = kids.filter((c) => c.type === 'JSXText');
    if (textKids.length === 0) {
      const at = opening.end; // just after the '>' of the opening tag
      return done(source, splice(source, at, at, newText));
    }
    const first = textKids[0], last = textKids[textKids.length - 1];
    const raw = source.slice(first.start, last.end);
    if (raw.trim() === newText) return no(source, 'sem alteração');
    const lead = (raw.match(/^\s*/) || [''])[0];
    const trail = (raw.match(/\s*$/) || [''])[0];
    return done(source, splice(source, first.start, last.end, lead + newText + trail));
  }

  return no(source, 'op desconhecida: ' + (op && op.kind));
}

// 1-based line numbers that differ between old and new (for the honest "tocou N linhas" UI).
function diffLines(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const touched = [];
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) { if (la[i] !== lb[i]) touched.push(i + 1); }
  return touched;
}

module.exports = { applyEdit, mergeClasses, classGroup, bumpSpacingClass, diffLines, _findOpening: findOpening };
