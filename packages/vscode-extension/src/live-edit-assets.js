'use strict';
/**
 * live-edit-assets.js — LP-4.7 §3 · the ASSET fence for the fenced model path.
 *
 * The GitHub-logo failure class (study §0): lucide v1.0 removed every brand icon, and a small
 * local model either imports a component that no longer exists (`Github` from lucide-react) or
 * hallucinates an SVG path from memory. Both die AFTER the write fence lets them through — the
 * file parses, the browser breaks. This module kills the class with knowledge, not tokens:
 *
 *   1. Vendored ground truth, shipped in the vsix (assets/live-edit/): the full lucide-react
 *      export-name whitelist (extracted from the package's own d.ts — provenance in the file
 *      header) + official brand SVGs (path data from the simple-icons package, never from a
 *      model's memory). A workspace can override/extend under .mooter/assets/live-edit/.
 *   2. buildAssetBlock(prompt): when (and only when) the prompt smells like an icon/logo ask,
 *      a prompt block with the rules + the exact inline SVGs to copy verbatim — sized to the
 *      ask (only mentioned brands, only fuzzy-matched lucide names) to avoid the format tax.
 *   3. verifyImports(newImports): every import the model DECLARES (envelope, LP-4.7 §4) must
 *      resolve in the workspace's node_modules/package.json; lucide-react named imports must
 *      be on the whitelist. Fail-closed: no parser → no imports; first offence → honest reason
 *      the panel renders and the retry round feeds back verbatim.
 *
 * Zero new dependencies; @babel/parser is the one the edit engine already ships. No vscode
 * import — everything injectable for tests. Never throws; refusals are { ok:false, reason }.
 */

const fs = require('fs');
const path = require('path');

let babel = null;
try { babel = require('@babel/parser'); } catch { babel = null; }

// Same plugin set as live-edit-ast.PARSE_OPTS — an import statement a TSX file can carry must
// parse here too (kept literal to avoid a require cycle; the ast module owns the node fence).
const PARSE_OPTS = {
  sourceType: 'module',
  allowReturnOutsideFunction: true,
  plugins: [
    'jsx', 'typescript', 'decorators-legacy', 'classProperties',
    'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait',
  ],
};

const MAX_NEW_IMPORTS = 5;
const LUCIDE_PKG = 'lucide-react';
// Brand-ish import names get the honest "removed in v1.0" detail instead of a bare "unknown".
const BRANDISH = /^(Github|Gitlab|Twitter|Facebook|Instagram|Linkedin|Youtube|Twitch|Slack|Chrome|Codepen|Codesandbox|Dribbble|Figma|Framer|Hexagon|Pocket|Trello)/i;

function bundledAssetsDir() { return path.join(__dirname, '..', 'assets', 'live-edit'); }

// Resolution order: the workspace's .mooter/assets/live-edit (project-specific overrides,
// e.g. a company logo) wins over the copies bundled in the vsix. Missing dirs are skipped.
function assetRoots(opts) {
  const o = opts || {};
  const roots = [];
  if (o.wsRoot) roots.push(path.join(o.wsRoot, '.mooter', 'assets', 'live-edit'));
  roots.push(o.bundledDir || bundledAssetsDir());
  return roots;
}

// { names: Set<string>, source: <path>|null }. Lines starting with # are provenance comments.
function loadLucideWhitelist(opts) {
  for (const root of assetRoots(opts)) {
    try {
      const file = path.join(root, 'lucide-icons.llms.txt');
      const txt = fs.readFileSync(file, 'utf8');
      const names = new Set();
      for (const line of txt.split(/\r?\n/)) {
        const t = line.trim();
        if (t && t.charAt(0) !== '#') names.add(t);
      }
      if (names.size > 0) return { names, source: file };
    } catch { /* next root */ }
  }
  return { names: new Set(), source: null };
}

// Brand SVGs by slug: workspace overrides bundled on slug collision. Each entry carries the
// FULL svg markup — the block offers it verbatim so the model copies instead of remembering.
function loadBrandSvgs(opts) {
  const bySlug = new Map();
  const roots = assetRoots(opts);
  for (let i = roots.length - 1; i >= 0; i--) { // bundled first, workspace last → workspace wins
    let entries = [];
    try { entries = fs.readdirSync(path.join(roots[i], 'brand')); } catch { continue; }
    for (const e of entries) {
      if (!/\.svg$/i.test(e)) continue;
      try {
        const svg = fs.readFileSync(path.join(roots[i], 'brand', e), 'utf8').trim();
        if (!svg) continue;
        const slug = e.replace(/\.svg$/i, '').toLowerCase();
        const label = svg.match(/aria-label="([^"]{1,60})"/);
        bySlug.set(slug, { slug, title: (label && label[1]) || slug, svg });
      } catch { /* skip unreadable */ }
    }
  }
  return [...bySlug.values()];
}

// The trigger for the prompt block. Deliberately broad on nouns, silent otherwise — a plain
// "muda o texto para X" must NOT pay the block's tokens (format-tax evidence, study §1).
// Matching runs on the diacritics-stripped prompt (JS \b is ASCII-only — it can never fire
// before "ícone"), so the regex carries plain-ascii forms only.
const INTENT_RE = /\b(icons?|icones?|logos?|logotipos?|svg|badge|marca|brand|emblema|simbolo)\b/i;

function stripDiacritics(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function detectAssetIntent(prompt, brands) {
  const p = stripDiacritics(prompt);
  if (INTENT_RE.test(p)) return true;
  for (const b of brands || []) {
    const re = new RegExp('\\b' + b.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(p)) return true;
  }
  return false;
}

function lucideInstalled(wsRoot) {
  if (!wsRoot) return false;
  try {
    if (fs.existsSync(path.join(wsRoot, 'node_modules', LUCIDE_PKG, 'package.json'))) return true;
    const pkg = JSON.parse(fs.readFileSync(path.join(wsRoot, 'package.json'), 'utf8'));
    for (const k of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[k] && pkg[k][LUCIDE_PKG]) return true;
    }
  } catch { /* absent */ }
  return false;
}

// Fuzzy-match lucide names against the prompt's words so the block stays small: "adiciona um
// ícone de seta para baixo" → arrow/down → ArrowDown, ArrowBigDown, … capped, never the 5972.
function matchLucideNames(prompt, names, cap) {
  const words = String(prompt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  // PT→EN hints for the most common icon nouns — best-effort, the verifier is the enforcement.
  const hints = { seta: 'arrow', setas: 'arrow', baixo: 'down', cima: 'up', esquerda: 'left', direita: 'right', casa: 'house', lixo: 'trash', estrela: 'star', coracao: 'heart', olho: 'eye', sino: 'bell', lua: 'moon', sol: 'sun', pesquisa: 'search', procura: 'search', menu: 'menu', fechar: 'x', mais: 'plus', menos: 'minus', descarregar: 'download', carregar: 'upload' };
  const keys = new Set();
  for (const w of words) { keys.add(w); if (hints[w]) keys.add(hints[w]); }
  const out = [];
  for (const n of names) {
    if (/Icon$/.test(n) || /^Lucide/.test(n)) continue; // aliases stay verifier-only; the block shows canonical names
    const ln = n.toLowerCase();
    for (const k of keys) { if (ln.indexOf(k) !== -1) { out.push(n); break; } }
    if (out.length >= (cap || 60)) break;
  }
  return out;
}

/**
 * The prompt block (or null when the ask has nothing to do with assets). PT-PT like the rest
 * of the moo prompt. opts: { wsRoot, bundledDir } — injectable for tests.
 */
function buildAssetBlock(prompt, opts) {
  const o = opts || {};
  const brands = loadBrandSvgs(o);
  if (!detectAssetIntent(prompt, brands)) return null;
  const lines = ['REGRAS DE ASSETS (obrigatórias):'];
  lines.push('- Logos de MARCA: NUNCA de lucide-react — a v1.0 removeu todos os ícones de marca (Github, Twitter, …).');
  const p = String(prompt || '').toLowerCase();
  const mentioned = brands.filter((b) => p.indexOf(b.slug) !== -1 || p.indexOf(b.title.toLowerCase()) !== -1);
  for (const b of mentioned) {
    lines.push('- SVG oficial de ' + b.title + ' — copia-o VERBATIM para o JSX (podes ajustar width/height/className):');
    lines.push(b.svg);
  }
  const wl = loadLucideWhitelist(o);
  if (lucideInstalled(o.wsRoot)) {
    const matched = matchLucideNames(prompt, wl.names, 60);
    if (matched.length) {
      lines.push('- Ícones de UI: usa lucide-react com um nome EXACTO desta lista e declara o import em new_imports: ' + matched.join(', ') + '.');
    } else {
      lines.push('- Ícones de UI: usa lucide-react com um nome de ícone EXACTO (o import é verificado na escrita) e declara-o em new_imports.');
    }
  } else {
    lines.push('- lucide-react NÃO está instalado neste projecto: desenha ícones de UI como SVG inline e NÃO acrescentes imports novos.');
  }
  lines.push('- Qualquer import novo tem de existir mesmo no projecto — imports inventados são recusados e o edit falha.');
  return lines.join('\n');
}

function parseOneImport(statement) {
  if (!babel) return { error: 'parser-unavailable' };
  const src = String(statement == null ? '' : statement).trim();
  if (!src) return { error: 'empty' };
  let ast;
  try { ast = babel.parse(src, PARSE_OPTS); } catch (e) {
    return { error: (e && e.message) ? String(e.message).slice(0, 160) : 'parse error' };
  }
  // Comment smuggling is the splice fence's lesson applied here: an import that will later be
  // INSERTED into the file must be exactly one ImportDeclaration covering every byte — no
  // trailing `//`, no /* */, no second statement riding along.
  if (((ast && ast.comments) || []).length > 0) return { error: 'has-comments' };
  const body = (ast.program && ast.program.body) || [];
  if (body.length !== 1 || body[0].type !== 'ImportDeclaration') return { error: 'not-an-import' };
  if (body[0].start !== 0 || body[0].end !== src.length) return { error: 'trailing-junk' };
  const decl = body[0];
  const names = [];
  const locals = [];
  for (const s of decl.specifiers || []) {
    if (s.local && s.local.name) locals.push(s.local.name);
    if (s.type === 'ImportSpecifier' && s.imported) names.push(s.imported.name || (s.imported.value != null ? String(s.imported.value) : ''));
  }
  return { statement: src, specifier: String(decl.source && decl.source.value || ''), names, locals };
}

function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.charAt(0) === '@' ? parts.slice(0, 2).join('/') : parts[0];
}

function packageResolvable(wsRoot, pkgName) {
  if (!wsRoot || !pkgName) return false;
  try {
    if (fs.existsSync(path.join(wsRoot, 'node_modules', pkgName, 'package.json'))) return true;
    const pkg = JSON.parse(fs.readFileSync(path.join(wsRoot, 'package.json'), 'utf8'));
    for (const k of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[k] && pkg[k][pkgName]) return true;
    }
  } catch { /* unresolved */ }
  return false;
}

const REL_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css', '.svg', '.json'];

function relativeResolvable(wsRoot, fromFile, specifier) {
  try {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const rel = path.relative(wsRoot, base);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: 'import-outside-workspace' };
    for (const ext of REL_EXTS) { if (fs.existsSync(base + ext) && (ext || fs.statSync(base).isFile())) return { ok: true }; }
    for (const ext of REL_EXTS.slice(1)) { if (fs.existsSync(path.join(base, 'index' + ext))) return { ok: true }; }
    return { ok: false, reason: 'import-file-missing' };
  } catch { return { ok: false, reason: 'import-file-missing' }; }
}

/**
 * The import fence. newImports: string[] of full ES import statements (the envelope's
 * new_imports). opts: { wsRoot (required), file (abs path of the file being edited — anchors
 * relative imports), bundledDir }. Returns { ok:true, imports:[{statement,specifier,names,locals}] }
 * or { ok:false, reason, detail } — first offence wins, detail carries the offending statement
 * so the retry round can feed the model its EXACT mistake.
 */
function verifyImports(newImports, opts) {
  const o = opts || {};
  if (newImports == null) return { ok: true, imports: [] };
  if (!Array.isArray(newImports)) return { ok: false, reason: 'import-not-an-import', detail: 'new_imports must be an array' };
  const list = newImports.filter((s) => String(s == null ? '' : s).trim());
  if (list.length === 0) return { ok: true, imports: [] };
  if (list.length > MAX_NEW_IMPORTS) return { ok: false, reason: 'too-many-imports', detail: list.length + ' > ' + MAX_NEW_IMPORTS };
  if (!o.wsRoot) return { ok: false, reason: 'import-unresolved', detail: 'no workspace root' };
  if (!babel) return { ok: false, reason: 'import-verifier-unavailable', detail: 'parser-unavailable' }; // fail CLOSED
  const out = [];
  let whitelist = null;
  for (const raw of list) {
    const p = parseOneImport(raw);
    if (p.error === 'has-comments') return { ok: false, reason: 'import-has-comments', detail: String(raw).slice(0, 160) };
    if (p.error === 'trailing-junk') return { ok: false, reason: 'import-trailing-junk', detail: String(raw).slice(0, 160) };
    if (p.error === 'parser-unavailable') return { ok: false, reason: 'import-verifier-unavailable', detail: 'parser-unavailable' };
    if (p.error) return { ok: false, reason: 'import-not-an-import', detail: String(raw).slice(0, 160) };
    const spec = p.specifier;
    if (!spec) return { ok: false, reason: 'import-not-an-import', detail: String(raw).slice(0, 160) };
    if (path.isAbsolute(spec) || /^[a-zA-Z]:[\\/]/.test(spec)) return { ok: false, reason: 'import-outside-workspace', detail: spec };
    if (spec.charAt(0) === '.') {
      if (!o.file) return { ok: false, reason: 'import-file-missing', detail: spec };
      const r = relativeResolvable(o.wsRoot, o.file, spec);
      if (!r.ok) return { ok: false, reason: r.reason, detail: spec };
    } else {
      if (spec.indexOf('..') !== -1) return { ok: false, reason: 'import-outside-workspace', detail: spec };
      const pkgName = packageNameOf(spec);
      if (!packageResolvable(o.wsRoot, pkgName)) {
        return { ok: false, reason: 'import-unresolved', detail: pkgName + ' não está no package.json nem em node_modules' };
      }
      if (pkgName === LUCIDE_PKG) {
        if (whitelist == null) whitelist = loadLucideWhitelist(o);
        for (const n of p.names) {
          if (!whitelist.names.has(n)) {
            const detail = BRANDISH.test(n)
              ? ('lucide-react não exporta ' + n + ' — a v1.0 removeu os brand icons; usa o SVG inline fornecido')
              : ('lucide-react não exporta ' + n + ' — usa um nome exacto da whitelist');
            return { ok: false, reason: 'lucide-name-unknown', detail };
          }
        }
      }
    }
    out.push({ statement: p.statement, specifier: spec, names: p.names, locals: p.locals });
  }
  return { ok: true, imports: out };
}

module.exports = {
  assetRoots,
  bundledAssetsDir,
  loadLucideWhitelist,
  loadBrandSvgs,
  detectAssetIntent,
  buildAssetBlock,
  matchLucideNames,
  lucideInstalled,
  verifyImports,
  parseOneImport,
  MAX_NEW_IMPORTS,
  LUCIDE_PKG,
};
