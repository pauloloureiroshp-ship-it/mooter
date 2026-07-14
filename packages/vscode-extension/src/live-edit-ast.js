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

// ── MP5.2a — byte-bounded structural primitives. Still ZERO LLM in this module. ─────────────────
// locateRange/deleteNode are the deterministic gesture ("delete exactly this node", $0), and
// spliceNodeRange is the FENCE any future model path (MP5.2b) must pass through: whatever text a
// model returns, the write is physically bounded to one VERIFIED JSX node span — or it is refused.
// Fail-closed: every exit is { ok:false, reason }, and both mutators re-parse their OUTPUT before
// returning it, so a write that would break the file can never leave this module.

// Resolve target {line, col, tag} to the exact byte span of its JSXElement subtree.
function locateRange(source, target) {
  if (typeof source !== 'string' || !source) return { ok: false, reason: 'no-source' };
  const p = parse(source);
  if (p.error) return { ok: false, reason: 'parse-error', detail: p.error };
  const el = locate(collectJsxElements(p.ast), target || {});
  if (!el) return { ok: false, reason: 'not-found' };
  return { ok: true, start: el.start, end: el.end, el };
}

function normaliseIdentityText(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function identityTokens(value) {
  const out = new Set();
  const matches = normaliseIdentityText(value).match(/[a-z0-9_\-\u00c0-\u024f]+/g) || [];
  for (const token of matches) out.add(token);
  return out;
}

function setSimilarity(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common++;
  return (2 * common) / (a.size + b.size);
}

// Only user-meaningful static values participate in semantic identity. AST field names, tag names
// and JavaScript identifiers are deliberately excluded: two generic <p> siblings must not become
// "the same node" merely because their syntax is alike.
function semanticIdentityOf(el) {
  const visibleParts = [];
  const attributeParts = [];
  const seen = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const item of n) walk(item); return; }
    if (seen.has(n)) return;
    seen.add(n);
    if (n.type === 'JSXText') {
      const text = normaliseIdentityText(n.value);
      if (text) visibleParts.push(text);
      return;
    }
    if (n.type === 'JSXExpressionContainer') {
      const x = n.expression;
      if (x && (x.type === 'StringLiteral' || x.type === 'NumericLiteral')) {
        const text = normaliseIdentityText(x.value);
        if (text) visibleParts.push(text);
        return;
      }
      if (x && x.type === 'TemplateLiteral' && (!x.expressions || x.expressions.length === 0)) {
        const text = normaliseIdentityText((x.quasis || []).map((q) => q.value && q.value.cooked || '').join(''));
        if (text) visibleParts.push(text);
        return;
      }
    }
    if (n.type === 'JSXAttribute') {
      const v = n.value;
      if (v && v.type === 'StringLiteral') {
        const text = normaliseIdentityText(v.value);
        if (text) attributeParts.push(text);
      } else if (v && v.type === 'JSXExpressionContainer') {
        const x = v.expression;
        if (x && (x.type === 'StringLiteral' || x.type === 'NumericLiteral')) attributeParts.push(normaliseIdentityText(x.value));
        else if (x && x.type === 'TemplateLiteral' && (!x.expressions || x.expressions.length === 0)) {
          attributeParts.push(normaliseIdentityText((x.quasis || []).map((q) => q.value && q.value.cooked || '').join('')));
        }
      }
      return;
    }
    for (const key in n) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
      const value = n[key];
      if (value && typeof value === 'object') walk(value);
    }
  })(el);
  const visible = normaliseIdentityText(visibleParts.filter(Boolean).join(' '));
  const attributes = normaliseIdentityText(attributeParts.filter(Boolean).join(' '));
  return { visible, attributes, combined: normaliseIdentityText([visible, attributes].filter(Boolean).join(' ')) };
}

// Build the real JSX containment tree from byte spans. `collectJsxElements` is intentionally flat;
// rebasing needs the nearest JSX parent and direct siblings so an inserted node cannot steal the
// selected node's old global index.
function buildRebaseMeta(source, elements) {
  const ordered = elements.slice().sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const roots = [];
  const metas = [];
  const byElement = new Map();
  const stack = [];
  for (const el of ordered) {
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.el.start < el.start && el.end <= top.el.end) break;
      stack.pop();
    }
    const parent = stack.length ? stack[stack.length - 1] : null;
    const opening = el.openingElement;
    const attrs = new Set();
    for (const attr of (opening && opening.attributes) || []) {
      if (attr.type === 'JSXAttribute' && attr.name && attr.name.name) attrs.add(String(attr.name.name).toLowerCase());
      else if (attr.type === 'JSXSpreadAttribute') attrs.add('...');
    }
    const raw = source.slice(el.start, el.end);
    const identity = semanticIdentityOf(el);
    const semantic = identity.combined;
    const meta = {
      el,
      parent,
      children: [],
      tag: tagNameOf(opening).toLowerCase(),
      raw,
      rawNormalised: normaliseIdentityText(raw),
      semantic,
      semanticTokens: identityTokens(semantic),
      visible: identity.visible,
      visibleTokens: identityTokens(identity.visible),
      attributeValues: identity.attributes,
      attributeValueTokens: identityTokens(identity.attributes),
      attrs,
      loc: opening && opening.loc && opening.loc.start,
    };
    if (parent) parent.children.push(meta); else roots.push(meta);
    metas.push(meta);
    byElement.set(el, meta);
    stack.push(meta);
  }
  for (const meta of metas) {
    const siblings = meta.parent ? meta.parent.children : roots;
    meta.siblingIndex = siblings.indexOf(meta);
    meta.siblingCount = siblings.length;
    meta.depth = 0;
    meta.ancestorTags = [];
    let parent = meta.parent;
    while (parent) {
      meta.depth++;
      meta.ancestorTags.unshift(parent.tag);
      parent = parent.parent;
    }
    meta.childTags = new Set(meta.children.map((child) => child.tag).filter(Boolean));
    meta.signature = [meta.tag, meta.semantic, Array.from(meta.attrs).sort().join(','), Array.from(meta.childTags).sort().join(',')].join('|');
  }
  return { metas, roots, byElement };
}

function ancestorSimilarity(a, b) {
  const left = a || [];
  const right = b || [];
  if (left.length === 0 && right.length === 0) return 1;
  const longest = Math.max(left.length, right.length);
  if (!longest) return 0;
  let common = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) break;
    common++;
  }
  return common / longest;
}

function siblingPosition(meta) {
  return meta.siblingCount > 1 ? meta.siblingIndex / (meta.siblingCount - 1) : 0;
}

function rebasePairScore(oldMeta, newMeta, expectedLine) {
  if (!oldMeta || !newMeta || !newMeta.loc) return { score: -Infinity, semantic: 0, rawExact: false };
  const rawExact = !!oldMeta.raw && oldMeta.raw === newMeta.raw;
  const semantic = setSimilarity(oldMeta.semanticTokens, newMeta.semanticTokens);
  const visible = setSimilarity(oldMeta.visibleTokens, newMeta.visibleTokens);
  const attributeValues = setSimilarity(oldMeta.attributeValueTokens, newMeta.attributeValueTokens);
  const attrs = setSimilarity(oldMeta.attrs, newMeta.attrs);
  const shape = setSimilarity(oldMeta.childTags, newMeta.childTags);
  const ancestry = ancestorSimilarity(oldMeta.ancestorTags, newMeta.ancestorTags);
  const oldParent = oldMeta.parent ? oldMeta.parent.tag : '#root';
  const newParent = newMeta.parent ? newMeta.parent.tag : '#root';
  let score = 0;
  if (rawExact) score += 140;
  if (oldMeta.tag && oldMeta.tag === newMeta.tag) score += 32;
  if (semantic > 0) score += Math.round(36 * semantic);
  if (visible > 0) score += Math.round(54 * visible);
  if (attributeValues > 0) score += Math.round(14 * attributeValues);
  if (oldMeta.semantic && oldMeta.semantic === newMeta.semantic) score += 12;
  score += Math.round(16 * attrs);
  score += Math.round(12 * shape);
  score += Math.round(28 * ancestry);
  if (oldParent === newParent) score += 20;
  if (oldMeta.depth === newMeta.depth) score += 8;
  else if (Math.abs(oldMeta.depth - newMeta.depth) === 1) score += 2;
  if (oldMeta.siblingIndex === 0 && newMeta.siblingIndex === 0) score += 6;
  if (oldMeta.siblingIndex === oldMeta.siblingCount - 1 && newMeta.siblingIndex === newMeta.siblingCount - 1) score += 6;
  score += Math.max(0, 6 - Math.round(Math.abs(siblingPosition(oldMeta) - siblingPosition(newMeta)) * 6));
  if (Number.isInteger(expectedLine)) score += Math.max(0, 6 - Math.abs(newMeta.loc.line - expectedLine));
  return { score, semantic, rawExact };
}

function expectedRebaseLine(before, after, oldLine) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let expected = oldLine + (newLines.length - oldLines.length);
  let distanceFound = Infinity;
  // A unique unchanged line is only a weak geographic anchor. Identity still comes from the AST
  // candidate comparison below; an inserted same-tag line is allowed to sit on this exact line.
  for (let distance = 0; distance <= 40; distance++) {
    const directions = distance === 0 ? [0] : [-1, 1];
    for (const direction of directions) {
      const oldIndex = (oldLine - 1) + (distance * direction);
      if (oldIndex < 0 || oldIndex >= oldLines.length) continue;
      const needle = oldLines[oldIndex];
      if (!needle || !needle.trim()) continue;
      let found = -1;
      let count = 0;
      for (let newIndex = 0; newIndex < newLines.length; newIndex++) {
        if (newLines[newIndex] === needle) { found = newIndex; count++; if (count > 1) break; }
      }
      if (count === 1) {
        expected = (found + 1) - (oldIndex + 1 - oldLine);
        distanceFound = distance;
        break;
      }
    }
    if (distanceFound !== Infinity) break;
  }
  return { line: expected, anchored: distanceFound !== Infinity };
}

// Rebase a source-map stamp after an edit/HMR. The preview tap can only re-pin an exact
// data-insp-path, so reusing the old line after imports (or an agent edit above the node) makes the
// Cowork-style border disappear. Identity is proven by a unique combination of node semantics,
// ancestry, parent/sibling context and source geography. Index is weak evidence only; insertions,
// reorders and duplicates either map to one clearly stronger node or fail closed.
function rebaseTargetStamp(before, after, target) {
  if (typeof before !== 'string' || !before || typeof after !== 'string' || !after) return { ok: false, reason: 'no-source' };
  const pb = parse(before);
  const pa = parse(after);
  if (pb.error || pa.error) return { ok: false, reason: 'parse-error', detail: pb.error || pa.error };
  const oldEls = collectJsxElements(pb.ast);
  const newEls = collectJsxElements(pa.ast);
  const oldEl = locate(oldEls, target || {});
  if (!oldEl) return { ok: false, reason: 'not-found' };
  if (!newEls.length) return { ok: false, reason: 'not-found-after' };

  const oldTree = buildRebaseMeta(before, oldEls);
  const newTree = buildRebaseMeta(after, newEls);
  const oldMeta = oldTree.byElement.get(oldEl);
  const oldLoc = oldMeta && oldMeta.loc;
  if (!oldLoc) return { ok: false, reason: 'not-found' };
  const oldLine = oldLoc.line;
  const oldTag = oldMeta.tag;
  const requestedCol = Number.isInteger(target && target.col) ? target.col : oldLoc.column;
  const colBias = requestedCol - oldLoc.column;
  if (before === after) {
    return {
      ok: true,
      line: oldLoc.line,
      col: Math.max(0, oldLoc.column + colBias),
      tag: tagNameOf(oldEl.openingElement) || String((target && target.tag) || ''),
      shifted: false,
      evidence: 'exact-source',
    };
  }

  const geography = expectedRebaseLine(before, after, oldLine);
  const MIN_SCORE = 60;
  const MIN_WIN_MARGIN = 16;
  const rows = [];
  let duplicateCompetition = false;
  let removedCompetition = false;
  for (const candidate of newTree.metas) {
    const own = rebasePairScore(oldMeta, candidate, geography.line);
    if (own.score < MIN_SCORE) continue;
    let competitor = null;
    for (const otherOld of oldTree.metas) {
      if (otherOld === oldMeta) continue;
      const other = rebasePairScore(otherOld, candidate, geography.line);
      if (!competitor || other.score > competitor.score) competitor = { score: other.score, meta: otherOld };
    }
    const sameOldIdentity = !!(competitor && competitor.meta.rawNormalised
      && competitor.meta.rawNormalised === oldMeta.rawNormalised
      && competitor.score >= own.score - 12);
    const consumedByOther = !!(competitor && competitor.score >= own.score + 12);
    if (sameOldIdentity) duplicateCompetition = true;
    if (consumedByOther) removedCompetition = true;
    if (!sameOldIdentity && !consumedByOther) rows.push({ candidate, own });
  }
  if (!rows.length) {
    if (duplicateCompetition) return { ok: false, reason: 'ambiguous-after' };
    return { ok: false, reason: removedCompetition ? 'node-removed' : 'ambiguous-after' };
  }
  rows.sort((a, b) => b.own.score - a.own.score);
  const best = rows[0];
  const second = rows[1];
  if (second && best.own.score - second.own.score < MIN_WIN_MARGIN) return { ok: false, reason: 'ambiguous-after' };
  // Two equivalent candidates under the same JSX parent are indistinguishable regardless of
  // their indices: one may have been inserted before/after the selected node during the edit.
  const duplicate = rows.find((row, index) => index > 0
    && row.candidate.parent === best.candidate.parent
    && row.candidate.signature === best.candidate.signature
    && best.own.score - row.own.score < 24);
  if (duplicate) return { ok: false, reason: 'ambiguous-after' };

  const bestLoc = best.candidate.loc;
  const bestTag = tagNameOf(best.candidate.el.openingElement);
  return {
    ok: true,
    line: bestLoc.line,
    col: Math.max(0, bestLoc.column + colBias),
    tag: bestTag || String((target && target.tag) || ''),
    shifted: bestLoc.line !== oldLine || (bestLoc.column + colBias) !== requestedCol || (bestTag && bestTag.toLowerCase() !== oldTag),
    evidence: best.own.rawExact ? 'exact-source' : (best.own.semantic > 0 ? 'semantic-context' : (geography.anchored ? 'source-context' : 'structural-context')),
  };
}

// Delete the node's exact span. If the element sat alone on its line(s), the orphaned indentation
// and the trailing newline go with it (no blank line left behind); an inline element among siblings
// loses only its own bytes. The result must still parse — deleting a structurally mandatory node
// (e.g. the sole argument of `return (…)`) is refused instead of writing a broken file.
function deleteNode(source, target) {
  const r = locateRange(source, target);
  if (!r.ok) return r;
  let start = r.start;
  let end = r.end;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const nlAfter = source.indexOf('\n', end);
  const beforeOnLine = source.slice(lineStart, start);
  const afterOnLine = nlAfter === -1 ? source.slice(end) : source.slice(end, nlAfter);
  if (!beforeOnLine.trim() && !afterOnLine.trim()) {
    start = lineStart;
    end = nlAfter === -1 ? source.length : nlAfter + 1;
  }
  const code = source.slice(0, start) + source.slice(end);
  const check = parse(code);
  if (check.error) return { ok: false, reason: 'delete-breaks-parse', detail: check.error };
  return { ok: true, code, changed: code !== source, kind: 'delete' };
}

// The fence. Replace EXACTLY one verified JSX node span with a replacement that (a) parses as JSX,
// (b) is a single root element, (c) leaves every byte outside start..end untouched — and the
// spliced result must re-parse. Any failed condition rejects WITHOUT writing. A model can
// hallucinate content; it cannot escape the span.
function spliceNodeRange(source, range, replacement) {
  if (typeof source !== 'string' || !source) return { ok: false, reason: 'no-source' };
  if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return { ok: false, reason: 'bad-range' };
  const start = range.start;
  const end = range.end;
  if (start < 0 || end > source.length || start >= end) return { ok: false, reason: 'bad-range' };
  const p = parse(source);
  if (p.error) return { ok: false, reason: 'parse-error', detail: p.error };
  // The range must be the exact span of a real JSXElement — a fabricated range cannot write.
  const el = collectJsxElements(p.ast).find((e) => e.start === start && e.end === end);
  if (!el) return { ok: false, reason: 'range-not-a-node' };
  const repl = typeof replacement === 'string' ? replacement.trim() : '';
  if (!repl) return { ok: false, reason: 'empty-replacement' };
  const rp = parse(repl);
  if (rp.error) return { ok: false, reason: 'replacement-parse-error', detail: rp.error };
  // A replacement smuggling a comment (`<img/> //` or `/* … */`) parses standalone AND re-parses
  // after the splice, yet the trailing `//` would comment OUT sibling code beyond the span — the
  // one way a byte-bounded write could still neutralise outside bytes. Fail-closed: no comments.
  const comments = (rp.ast && rp.ast.comments) || [];
  if (comments.length > 0) return { ok: false, reason: 'replacement-has-comments' };
  const body = (rp.ast.program && rp.ast.program.body) || [];
  const single =
    body.length === 1 &&
    body[0].type === 'ExpressionStatement' &&
    body[0].expression &&
    body[0].expression.type === 'JSXElement';
  if (!single) return { ok: false, reason: 'not-single-root' };
  // Belt and braces: the single statement must cover the WHOLE replacement text — any leading or
  // trailing trivia that is not part of the element (whatever it is) has no business in the span.
  if (body[0].start !== 0 || body[0].end !== repl.length) return { ok: false, reason: 'replacement-trailing-junk' };
  const code = source.slice(0, start) + repl + source.slice(end);
  const check = parse(code);
  if (check.error) return { ok: false, reason: 'splice-breaks-parse', detail: check.error };
  return { ok: true, code, changed: code !== source, kind: 'splice' };
}

// ── LP-4.7 §3/§4 — insertImports: the ONLY way a verified new import reaches the file. The
// splice fence bounds the node write; an import the model DECLARED (envelope) and the asset
// fence VERIFIED still has to land at the top of the file — deterministically, byte-spliced,
// re-parsed. Same discipline as spliceNodeRange: each statement must parse as exactly ONE
// ImportDeclaration covering every byte (no comment/junk smuggling), locals already bound are
// skipped idempotently, a partial collision refuses fail-closed, and the OUTPUT must re-parse
// or nothing is returned. Still zero LLM in this module.
function insertImports(source, statements) {
  if (typeof source !== 'string' || !source) return { ok: false, reason: 'no-source' };
  const list = Array.isArray(statements) ? statements.map((s) => String(s == null ? '' : s).trim()).filter(Boolean) : null;
  if (!list) return { ok: false, reason: 'bad-imports' };
  if (list.length === 0) return { ok: true, code: source, changed: false, inserted: [], kind: 'imports' };
  const p = parse(source);
  if (p.error) return { ok: false, reason: 'parse-error', detail: p.error };
  const body = (p.ast.program && p.ast.program.body) || [];
  const bound = new Map(); // local name → source module (skip is only honest for the SAME source)
  let lastImport = null;
  for (const n of body) {
    if (n.type !== 'ImportDeclaration') continue;
    lastImport = n;
    const src = String((n.source && n.source.value) || '');
    for (const s of n.specifiers || []) { if (s.local && s.local.name) bound.set(s.local.name, src); }
  }
  const queued = [];
  const queuedBound = new Set();
  for (const raw of list) {
    const rp = parse(raw);
    if (rp.error) return { ok: false, reason: 'import-parse-error', detail: rp.error };
    if (((rp.ast && rp.ast.comments) || []).length > 0) return { ok: false, reason: 'import-has-comments' };
    const b = (rp.ast.program && rp.ast.program.body) || [];
    if (b.length !== 1 || b[0].type !== 'ImportDeclaration') return { ok: false, reason: 'not-an-import' };
    if (b[0].start !== 0 || b[0].end !== raw.length) return { ok: false, reason: 'import-trailing-junk' };
    const stmtSource = String((b[0].source && b[0].source.value) || '');
    const locals = (b[0].specifiers || []).map((s) => s.local && s.local.name).filter(Boolean);
    // "Already in the FILE from the SAME module" skips idempotently. The same local bound from a
    // DIFFERENT module is a conflict (silently keeping the old one would swap the symbol the
    // model meant), as is colliding with another QUEUED statement.
    const queuedClash = locals.filter((l) => queuedBound.has(l));
    if (queuedClash.length > 0) return { ok: false, reason: 'import-conflicts', detail: queuedClash.join(', ') + ' já importado' };
    const clash = locals.filter((l) => bound.has(l) && bound.get(l) !== stmtSource);
    if (clash.length > 0) return { ok: false, reason: 'import-conflicts', detail: clash.map((l) => l + ' já vem de ' + bound.get(l)).join(', ') };
    const already = locals.filter((l) => bound.has(l));
    if (locals.length > 0 && already.length === locals.length) continue; // fully present — idempotent skip
    if (already.length > 0) return { ok: false, reason: 'import-conflicts', detail: already.join(', ') + ' já importado' };
    for (const l of locals) queuedBound.add(l);
    queued.push(raw);
  }
  if (queued.length === 0) return { ok: true, code: source, changed: false, inserted: [], kind: 'imports' };
  const joined = queued.join('\n');
  let code;
  if (lastImport) {
    code = source.slice(0, lastImport.end) + '\n' + joined + source.slice(lastImport.end);
  } else {
    const dirs = (p.ast.program && p.ast.program.directives) || [];
    const inter = p.ast.program && p.ast.program.interpreter;
    const at = dirs.length ? dirs[dirs.length - 1].end : (inter ? inter.end : 0);
    code = at > 0
      ? source.slice(0, at) + '\n' + joined + source.slice(at)
      : joined + '\n' + source;
  }
  const check = parse(code);
  if (check.error) return { ok: false, reason: 'imports-break-parse', detail: check.error };
  return { ok: true, code, changed: true, inserted: queued, kind: 'imports' };
}

// Whether the target node sits inside a JSX expression container ({…} — a .map(), a ternary, an
// &&-guard). The panel uses this for the honest warning (spec §5.2): deleting JSX inside a .map()
// removes it from the template — i.e. from EVERY rendered item, not just the one that was clicked.
// Fail-soft: any doubt (parse error, not found) returns false rather than a fabricated warning.
function isInsideExpression(source, target) {
  if (typeof source !== 'string' || !source) return false;
  const p = parse(source);
  if (p.error) return false;
  const el = locate(collectJsxElements(p.ast), target || {});
  if (!el) return false;
  let found = false;
  const seen = new Set();
  (function walk(n) {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if (seen.has(n)) return;
    seen.add(n);
    if (n.type === 'JSXExpressionContainer' && Number.isInteger(n.start) && Number.isInteger(n.end)
        && n.start < el.start && el.end <= n.end) { found = true; return; }
    for (const k in n) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      const v = n[k];
      if (v && typeof v === 'object') walk(v);
    }
  })(p.ast);
  return found;
}

// Line-level diff of a single contiguous splice (all this engine ever produces): trim the common
// prefix/suffix and report whatever differs in between as removed/added lines (1-based start).
// Exactly enough for the panel's honest mini-diff — deliberately NOT a general diff algorithm.
function diffRemovedLines(before, after) {
  const a = String(before == null ? '' : before).split('\n');
  const b = String(after == null ? '' : after).split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1;
  let jb = b.length - 1;
  while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
  return { start: i + 1, removed: a.slice(i, ja + 1), added: b.slice(i, jb + 1) };
}

module.exports = {
  applyDeterministicEdit,
  locate,
  collectJsxElements,
  tagNameOf,
  editText,
  editClass,
  locateRange,
  rebaseTargetStamp,
  deleteNode,
  spliceNodeRange,
  insertImports,
  diffRemovedLines,
  isInsideExpression,
  PARSE_OPTS,
};
