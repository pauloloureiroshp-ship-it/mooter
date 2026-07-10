'use strict';
/**
 * live-edit-context.js — Context Engine Wave 2.2 · deterministic, $0-local scoping for the anchored
 * task agent (live-edit-task-runner.mjs).
 *
 * WHY: today the agent gets `raw prompt + pinned node + Read/Grep tools` and discovers everything by
 * exploring the repo live (measured 20.7s ask / 52.6s edit with only 2 files). This module computes,
 * BEFORE any model token is spent, two small curated context blocks the agent would otherwise have to
 * grep for:
 *   - buildImportSlice(wsRoot, anchorFile): the files reachable from the clicked element via the LOCAL
 *     import graph (BFS, bounded) — "these are the files connected to what you clicked".
 *   - buildRepoMap(wsRoot): a compact PageRank TOC of the repo's most-imported modules + their exports
 *     — a ~1-2K-token table of contents (Aider repo-map, no embeddings).
 *
 * DISCIPLINE (RULER arXiv 2510.05381 — long context degrades small models): every output is BOUNDED
 * (file counts, per-file bytes, total bytes) — a small curated slice, never the repo. All paths are
 * WORKSPACE-RELATIVE (never absolute → no OS username / tree leak, matching the runner's P3-a posture).
 *
 * PURE + fail-soft: fs read-only, no `vscode`, no SDK, no network. Never throws — any error yields an
 * empty block so the agent simply falls back to its existing Read/Grep behaviour. Within the SAME fence
 * as the runner (the trust-gated agent already reads the workspace); this only front-loads what it would
 * read anyway, so it is a speed/cost win, not a new capability.
 *
 * Extraction is REGEX-based (not a full AST): fast, dependency-free, and tolerant of exotic syntax — it
 * only needs import edges + top-level export names, which regex captures reliably for TS/JS/JSX.
 */

const fs = require('fs');
const path = require('path');

const SRC_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage', '.turbo', '.vercel', '.cache']);

// ── extraction (regex — import edges + top-level exports) ─────────────────────────────────────────
const IMPORT_RE = /(?:^|;|\n)\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const EXPORT_FROM_RE = /(?:^|;|\n)\s*export\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYN_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** All module specifiers referenced by `source` (import/export-from/require/dynamic-import), deduped. */
function extractSpecifiers(source) {
  const out = new Set();
  const s = String(source || '');
  for (const re of [IMPORT_RE, EXPORT_FROM_RE, REQUIRE_RE, DYN_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s)) !== null) { if (m[1]) out.add(m[1]); }
  }
  return Array.from(out);
}

const EXPORT_NAME_RES = [
  /(?:^|\n)\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\n)\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\n)\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\n)\s*export\s+class\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\n)\s*export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g,
];

/** Top-level exported symbol names (best-effort). Includes `default` when a default export is present. */
function extractExports(source) {
  const s = String(source || '');
  const names = new Set();
  for (const re of EXPORT_NAME_RES) { re.lastIndex = 0; let m; while ((m = re.exec(s)) !== null) { if (m[1]) names.add(m[1]); } }
  // export { a, b as c } — list the local names
  const braceRe = /(?:^|\n)\s*export\s*\{([^}]*)\}/g;
  let bm;
  while ((bm = braceRe.exec(s)) !== null) {
    for (const part of bm[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  if (/(?:^|\n)\s*export\s+default\s/.test(s) && !Array.from(names).some((n) => n === 'default')) {
    // a default export that is not a named function/class (e.g. `export default X` / object)
    if (/(?:^|\n)\s*export\s+default\s+(?!function|async|class)/.test(s)) names.add('default');
  }
  return Array.from(names);
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const IMPORT_STMT_RE = /(?:^|\n)\s*import\s+([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/g;

/**
 * Local binding names introduced by each import + the specifier they come from:
 *   import Default, { a, b as c } from 'x'  →  [{name:'Default',spec:'x'}, {name:'a',...}, {name:'c',...}]
 *   import * as NS from 'x'                 →  [{name:'NS', spec:'x', kind:'namespace'}]
 * These are the symbols the data-hop can trace from the pinned node back to their definition file.
 */
function extractImportBindings(source) {
  const s = String(source || '');
  const out = [];
  IMPORT_STMT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_STMT_RE.exec(s)) !== null) {
    const clause = m[1].trim();
    const spec = m[2];
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) { out.push({ name: ns[1], spec, kind: 'namespace' }); continue; }
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        const local = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(local)) out.push({ name: local, spec, kind: 'named' });
      }
    }
    const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def) out.push({ name: def[1], spec, kind: 'default' });
  }
  return out;
}

// ── module resolution (LOCAL specifiers only; bare specifiers are external → skipped) ─────────────
/** Read tsconfig-style path aliases once (best-effort): returns [{prefix, base}] for `@/*`-style maps. */
function readAliases(wsRoot) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'jsconfig.json', 'landing/tsconfig.json']) {
    try {
      const raw = fs.readFileSync(path.join(wsRoot, name), 'utf8');
      // tolerate comments/trailing commas in tsconfig by a permissive strip (best-effort, never throws)
      const json = JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1'));
      const co = (json && json.compilerOptions) || {};
      const baseUrl = typeof co.baseUrl === 'string' ? co.baseUrl : '.';
      const cfgDir = path.dirname(path.join(wsRoot, name));
      const paths = (co.paths && typeof co.paths === 'object') ? co.paths : {};
      for (const key of Object.keys(paths)) {
        const targets = Array.isArray(paths[key]) ? paths[key] : [];
        if (!targets.length) continue;
        const prefix = key.replace(/\*$/, '');
        const base = path.resolve(cfgDir, baseUrl, String(targets[0]).replace(/\*$/, ''));
        aliases.push({ prefix, base });
      }
    } catch { /* no/invalid tsconfig at this location — keep looking */ }
  }
  return aliases;
}

// Any symlink/junction component from `abs` up to (but not past) `wsRoot`. Bounded climb; a component
// that does not exist is skipped (keep climbing) — only an EXISTING reparse point denies. Mirrors the
// runner's hasReparsePointUnderRoot so a later-filled junction cannot redirect an already-vetted path.
function hasSymlinkUnderRoot(wsRoot, abs) {
  let cur = abs;
  for (let i = 0; i < 128; i++) {
    const rel = path.relative(wsRoot, cur);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) break; // reached/left root
    try { if (fs.lstatSync(cur).isSymbolicLink()) return true; } catch { /* absent component — keep climbing */ }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

// SECURITY (final-reviewer Wave 2.2): containment IDENTICAL to the runner's inWorkspace — lexical AND
// realpath. A symlink/junction inside the workspace that points OUTSIDE must NOT be readable: the engine
// must not leak into the cloud pack content the agent's own fence would deny. Lexical first; then, when
// the target exists, its realpath must also stay inside the workspace's realpath; when it does not exist,
// reject if any existing ancestor component is a reparse point (TOCTOU).
function containedReal(wsRoot, abs) {
  const r = path.relative(wsRoot, abs);
  if (r === '' || r.startsWith('..') || path.isAbsolute(r)) return false; // lexical
  try {
    const real = fs.realpathSync(abs);
    const rr = path.relative(fs.realpathSync(wsRoot), real);
    if (rr !== '' && (rr.startsWith('..') || path.isAbsolute(rr))) return false; // realpath escaped the workspace
  } catch {
    if (hasSymlinkUnderRoot(wsRoot, abs)) return false; // a symlink component could redirect outside
  }
  return true;
}

/** Try a candidate path (no/with extension, or /index) and return the first existing FILE inside wsRoot. */
function resolveCandidate(candidate, wsRoot) {
  const tryFile = (p) => { try { return containedReal(wsRoot, p) && fs.statSync(p).isFile() ? p : null; } catch { return null; } };
  // exact (has a source extension already)
  if (SRC_EXT.some((e) => candidate.endsWith(e))) { const hit = tryFile(candidate); if (hit) return hit; }
  for (const e of SRC_EXT) { const hit = tryFile(candidate + e); if (hit) return hit; }
  for (const e of SRC_EXT) { const hit = tryFile(path.join(candidate, 'index' + e)); if (hit) return hit; }
  return null;
}

/** Resolve a LOCAL specifier from `fromFile` to an absolute file inside wsRoot, or null (external/unresolvable). */
function resolveLocal(fromFile, spec, wsRoot, aliases) {
  if (!spec || typeof spec !== 'string') return null;
  if (spec.startsWith('.')) return resolveCandidate(path.resolve(path.dirname(fromFile), spec), wsRoot);
  for (const a of aliases) {
    if (spec === a.prefix.replace(/\/$/, '') || spec.startsWith(a.prefix)) {
      const rest = spec.slice(a.prefix.length);
      return resolveCandidate(path.resolve(a.base, rest), wsRoot);
    }
  }
  return null; // bare specifier (react, next, …) — external, out of scope
}

function readCapped(abs, maxBytes) {
  try {
    const buf = fs.readFileSync(abs);
    return buf.length > maxBytes ? buf.slice(0, maxBytes).toString('utf8') : buf.toString('utf8');
  } catch { return null; }
}

function relPosix(wsRoot, abs) { const r = path.relative(wsRoot, abs); return r ? r.split(path.sep).join('/') : '.'; }

// ── (A) deterministic import-scoped slice ────────────────────────────────────────────────────────
/**
 * buildImportSlice(wsRoot, anchorFile, opts) → { text, files, tokenEstimate }.
 * BFS the LOCAL import graph out of `anchorFile` (relative or absolute) and return a compact block:
 * for each reachable file, its workspace-relative path + a short high-signal excerpt (export/decl lines).
 * Bounded by opts.maxFiles / maxDepth / maxTotalBytes. Empty block on any failure (agent falls back).
 */
function buildImportSlice(wsRoot, anchorFile, opts) {
  const o = opts || {};
  const maxFiles = o.maxFiles || 12;
  const maxDepth = o.maxDepth == null ? 2 : o.maxDepth;
  const maxTotalBytes = o.maxTotalBytes || 20000;
  const perFileReadCap = o.perFileReadCap || 64000;
  const empty = { text: '', files: [], tokenEstimate: 0 };
  try {
    if (!wsRoot || !anchorFile) return empty;
    const anchorAbs = path.isAbsolute(anchorFile) ? path.normalize(anchorFile) : path.resolve(wsRoot, anchorFile);
    // SECURITY: lexical + realpath containment (same as the runner fence) — a symlinked anchor pointing
    // outside the workspace must not be read.
    if (!containedReal(wsRoot, anchorAbs)) return empty;
    const aliases = readAliases(wsRoot);
    const visited = new Set();
    const order = [];
    const queue = [{ abs: anchorAbs, depth: 0 }];
    while (queue.length && order.length < maxFiles) {
      const { abs, depth } = queue.shift();
      if (visited.has(abs)) continue;
      visited.add(abs);
      const src = readCapped(abs, perFileReadCap);
      if (src == null) continue;
      order.push({ abs, depth, src });
      if (depth >= maxDepth) continue;
      for (const spec of extractSpecifiers(src)) {
        const target = resolveLocal(abs, spec, wsRoot, aliases);
        if (target && !visited.has(target)) queue.push({ abs: target, depth: depth + 1 });
      }
    }
    if (!order.length) return empty;
    const lines = [];
    let bytes = 0;
    const files = [];
    for (const { abs, depth, src } of order) {
      const rel = relPosix(wsRoot, abs);
      const excerpt = excerptOf(src);
      const block = (depth === 0 ? '• ' : '  ↳ ') + rel + '\n' + excerpt + '\n';
      if (bytes + block.length > maxTotalBytes && files.length) break;
      lines.push(block);
      bytes += block.length;
      files.push(rel);
    }
    const text = lines.join('\n');
    return { text, files, tokenEstimate: Math.ceil(text.length / 4) };
  } catch { return empty; }
}

/** A short, high-signal excerpt: the import + export/declaration lines (max ~14), else the first lines. */
function excerptOf(src) {
  const all = String(src).split(/\r?\n/);
  const sig = [];
  for (const ln of all) {
    if (/^\s*(import |export |(async\s+)?function |const [A-Za-z_$][\w$]*\s*=|class |type |interface )/.test(ln)) {
      sig.push(ln.length > 160 ? ln.slice(0, 157) + '…' : ln);
      if (sig.length >= 14) break;
    }
  }
  const picked = sig.length ? sig : all.slice(0, 10);
  return picked.map((l) => '    ' + l).join('\n');
}

// ── (B) PageRank repo-map (Aider-style TOC, no embeddings) ────────────────────────────────────────
/** Bounded recursive walk collecting source files under wsRoot. */
function walkSources(wsRoot, maxFiles) {
  const out = [];
  const stack = [wsRoot];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (out.length >= maxFiles) break;
      const name = e.name;
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(name) && name.charAt(0) !== '.') stack.push(path.join(dir, name)); continue; }
      if (!e.isFile()) continue;
      if (/\.(test|spec)\.[tj]sx?$/.test(name) || /\.d\.ts$/.test(name)) continue; // skip tests + type decls
      if (SRC_EXT.some((x) => name.endsWith(x))) out.push(path.join(dir, name));
    }
  }
  return out;
}

/**
 * buildRepoMap(wsRoot, opts) → { text, tokenEstimate, fileCount, ranked }.
 * Builds the local import graph over the repo's source files and ranks modules by PageRank (central =
 * imported by many). Returns a compact TOC of the top-K modules + their exports, ~1-2K tokens. Bounded
 * by opts.maxScan (files walked) / topK / maxBytes. Empty on failure.
 */
function buildRepoMap(wsRoot, opts) {
  const o = opts || {};
  const maxScan = o.maxScan || 600;
  const topK = o.topK || 28;
  const maxBytes = o.maxBytes || 2400;
  const perFileReadCap = o.perFileReadCap || 48000;
  const empty = { text: '', tokenEstimate: 0, fileCount: 0, ranked: [] };
  try {
    if (!wsRoot) return empty;
    const files = walkSources(wsRoot, maxScan);
    if (!files.length) return empty;
    const aliases = readAliases(wsRoot);
    const idx = new Map(); // abs → node id
    files.forEach((f, i) => idx.set(f, i));
    const exportsOf = new Array(files.length);
    const outEdges = new Array(files.length); // i → [j,...] (i imports j)
    for (let i = 0; i < files.length; i++) {
      const src = readCapped(files[i], perFileReadCap) || '';
      exportsOf[i] = extractExports(src);
      const targets = [];
      for (const spec of extractSpecifiers(src)) {
        const t = resolveLocal(files[i], spec, wsRoot, aliases);
        if (t != null && idx.has(t) && idx.get(t) !== i) targets.push(idx.get(t));
      }
      outEdges[i] = Array.from(new Set(targets));
    }
    const rank = pageRank(files.length, outEdges, 20, 0.85);
    const inDeg = new Array(files.length).fill(0);
    for (const outs of outEdges) for (const j of outs) inDeg[j]++;
    const ranked = files.map((f, i) => ({ file: relPosix(wsRoot, f), score: rank[i], inDeg: inDeg[i], exports: exportsOf[i] }))
      .sort((a, b) => (b.score - a.score) || (b.inDeg - a.inDeg) || a.file.localeCompare(b.file));
    const lines = [];
    let bytes = 0;
    for (const r of ranked) {
      if (lines.length >= topK) break;
      const ex = r.exports.length ? r.exports.slice(0, 6).join(', ') : '(no named exports)';
      const line = '• ' + r.file + ' — ' + ex + (r.inDeg ? ('  [imported by ' + r.inDeg + ']') : '');
      if (bytes + line.length > maxBytes && lines.length) break;
      lines.push(line);
      bytes += line.length + 1;
    }
    const text = lines.join('\n');
    return { text, tokenEstimate: Math.ceil(text.length / 4), fileCount: files.length, ranked };
  } catch { return empty; }
}

/** Standard PageRank over a directed graph (i → outEdges[i]). Sinks redistribute uniformly. */
function pageRank(n, outEdges, iterations, damping) {
  if (n === 0) return [];
  let pr = new Array(n).fill(1 / n);
  const base = (1 - damping) / n;
  for (let it = 0; it < iterations; it++) {
    const next = new Array(n).fill(base);
    let dangling = 0;
    for (let i = 0; i < n; i++) { if (!outEdges[i] || outEdges[i].length === 0) dangling += pr[i]; }
    const danglingShare = damping * dangling / n;
    for (let i = 0; i < n; i++) {
      const outs = outEdges[i];
      if (outs && outs.length) { const share = damping * pr[i] / outs.length; for (const j of outs) next[j] += share; }
    }
    for (let i = 0; i < n; i++) next[i] += danglingShare;
    pr = next;
  }
  return pr;
}

// ── (C) DATA-HOP — "clico → segue até à fonte de dados" (Wave 2.3, the moat) ──────────────────────
/** A few source lines from index `i` (each indented, long lines clipped). */
function excerptAt(lines, i, maxLines) {
  const start = Math.max(0, i);
  return lines.slice(start, start + maxLines).map((l) => '    ' + (l.length > 160 ? l.slice(0, 157) + '…' : l)).join('\n');
}

/** Locate the declaration of `name` in `defSrc`; return an excerpt + the identifiers it is DERIVED from
 *  (the RHS of `name = <expr>`), so the agent edits the SOURCE primitive, not the derived value. */
function locateDefinition(defSrc, name, maxLines) {
  const lines = String(defSrc).split(/\r?\n/);
  if (!name) {
    const i = lines.findIndex((l) => /export\s+default/.test(l));
    return { excerpt: excerptAt(lines, i >= 0 ? i : 0, maxLines), derivedFrom: [] };
  }
  const declRe = new RegExp('(export\\s+)?(const|let|var|function|class|type|interface)\\s+' + escapeRe(name) + '\\b');
  let idx = lines.findIndex((l) => declRe.test(l));
  if (idx < 0) idx = lines.findIndex((l) => new RegExp('(^|[^\\w$])' + escapeRe(name) + '\\s*[:=]').test(l)); // object member
  if (idx < 0) return { excerpt: excerptAt(lines, 0, maxLines), derivedFrom: [] };
  const derivedFrom = [];
  const declLine = lines[idx];
  const eq = declLine.indexOf('=');
  if (eq >= 0) {
    const rhs = declLine.slice(eq + 1);
    const idRe = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\b/g;
    let im;
    const SKIP = /^(Math|Number|String|Boolean|Array|Object|JSON|parseInt|parseFloat|round2|usd|toFixed|true|false|null|undefined)\b/;
    while ((im = idRe.exec(rhs)) !== null) {
      const id = im[1];
      if (!SKIP.test(id) && !/^\d/.test(id) && id !== name && derivedFrom.indexOf(id) === -1) derivedFrom.push(id);
    }
  }
  return { excerpt: excerptAt(lines, idx, maxLines), derivedFrom: derivedFrom.slice(0, 6) };
}

/** Bounded workspace-wide references to a bare symbol (blast radius): which source files mention it. */
function findReferences(wsRoot, symbol, opts) {
  const o = opts || {};
  const empty = { files: [], count: 0 };
  try {
    if (!wsRoot || !symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) return empty;
    const files = walkSources(wsRoot, o.maxScan || 500);
    const re = new RegExp('\\b' + escapeRe(symbol) + '\\b');
    const hits = [];
    for (const f of files) {
      if (hits.length >= (o.maxHits || 24)) break;
      const src = readCapped(f, 48000);
      if (src != null && re.test(src)) hits.push(relPosix(wsRoot, f));
    }
    return { files: hits, count: hits.length };
  } catch { return empty; }
}

/**
 * buildDataHop(wsRoot, anchorFile, anchorSource, opts) → { text, hops, tokenEstimate }.
 * For each IMPORTED symbol actually used in the pinned node's source, follow it to its DEFINITION file +
 * declaration, surface what it is DERIVED from, and (for the primary hop) its references (blast radius).
 * This is the moat: "click the savings box → the agent lands on the one place the number is defined."
 * Read paths are realpath-contained (same fence as the runner). Bounded + fail-soft.
 */
function buildDataHop(wsRoot, anchorFile, anchorSource, opts) {
  const o = opts || {};
  const maxHops = o.maxHops || 6;
  const defLines = o.defExcerptLines || 6;
  const empty = { text: '', hops: [], tokenEstimate: 0 };
  try {
    if (!wsRoot || !anchorFile || !anchorSource) return empty;
    const anchorAbs = path.isAbsolute(anchorFile) ? path.normalize(anchorFile) : path.resolve(wsRoot, anchorFile);
    if (!containedReal(wsRoot, anchorAbs)) return empty;
    const anchorSrc = readCapped(anchorAbs, o.perFileReadCap || 64000);
    if (anchorSrc == null) return empty;
    const bindings = extractImportBindings(anchorSrc);
    if (!bindings.length) return empty;
    const aliases = readAliases(wsRoot);
    const node = String(anchorSource);
    const hops = [];
    const seen = new Set();
    for (const b of bindings) {
      if (hops.length >= maxHops) break;
      const useRe = new RegExp('\\b' + escapeRe(b.name) + '\\b(?:\\s*\\.\\s*([A-Za-z_$][\\w$]*))?');
      const um = useRe.exec(node);
      if (!um) continue; // this import is not referenced by the pinned node
      const member = um[1] || null;
      const defAbs = resolveLocal(anchorAbs, b.spec, wsRoot, aliases);
      if (!defAbs) continue; // external (react/next) or unresolvable
      const key = relPosix(wsRoot, defAbs) + '::' + (member || b.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const defSrc = readCapped(defAbs, o.perFileReadCap || 64000);
      if (defSrc == null) continue;
      const target = member || (b.kind === 'default' ? null : b.name);
      const def = locateDefinition(defSrc, target, defLines);
      hops.push({ symbol: member ? (b.name + '.' + member) : b.name, importedFrom: relPosix(wsRoot, defAbs), target, excerpt: def.excerpt, derivedFrom: def.derivedFrom });
    }
    if (!hops.length) return empty;
    // Blast radius for the primary hop only (one walk) — where else the source symbol is used.
    let refs = null;
    if (o.references !== false && hops[0].target) {
      const r = findReferences(wsRoot, hops[0].target, o.refOpts);
      if (r.count > 1) refs = r;
    }
    const lines = hops.map((h) => {
      let s = '• ' + h.symbol + ' → definido em ' + h.importedFrom;
      if (h.derivedFrom && h.derivedFrom.length) s += '  (derivado de ' + h.derivedFrom.join(', ') + ' — edita a ORIGEM, não o valor derivado)';
      return s + '\n' + h.excerpt;
    });
    if (refs) lines.push('↳ "' + hops[0].target + '" aparece em ' + refs.count + ' ficheiro(s) (referências textuais por nome — confirma o âmbito): ' + refs.files.slice(0, 10).join(', '));
    const text = lines.join('\n\n');
    return { text, hops, tokenEstimate: Math.ceil(text.length / 4) };
  } catch { return empty; }
}

/**
 * buildContextPack(wsRoot, anchorFile, opts) → { text, tokenEstimate, slice, repoMap, dataHop }.
 * The combined block the runner prepends to the agent prompt: repo-map TOC + import slice + (when the
 * pinned node's source is provided via opts.anchorSource) the data-hop trail. Empty sections omitted.
 */
function buildContextPack(wsRoot, anchorFile, opts) {
  const o = opts || {};
  const repoMap = buildRepoMap(wsRoot, o.repoMap);
  const slice = buildImportSlice(wsRoot, anchorFile, o.slice);
  const dataHop = o.anchorSource ? buildDataHop(wsRoot, anchorFile, o.anchorSource, o.dataHop) : { text: '', hops: [], tokenEstimate: 0 };
  const parts = [];
  if (dataHop.text) parts.push('Data-hop (de onde vêm os valores do elemento fixado — segue até à fonte e edita lá):\n' + dataHop.text);
  if (slice.text) parts.push('Ficheiros ligados ao elemento fixado (grafo de imports, $0 local):\n' + slice.text);
  if (repoMap.text) parts.push('Repo-map (módulos centrais por PageRank — TOC, $0 local):\n' + repoMap.text);
  const text = parts.length
    ? ('Contexto do projecto (pré-computado localmente, $0 — usa-o para saltar a exploração; lê o ficheiro '
        + 'completo com Read quando precisares dos detalhes):\n\n' + parts.join('\n\n'))
    : '';
  return { text, tokenEstimate: Math.ceil(text.length / 4), slice, repoMap, dataHop };
}

module.exports = {
  buildImportSlice,
  buildRepoMap,
  buildContextPack,
  buildDataHop,
  findReferences,
  // exported for unit tests:
  extractSpecifiers,
  extractExports,
  extractImportBindings,
  locateDefinition,
  resolveLocal,
  readAliases,
  pageRank,
};
