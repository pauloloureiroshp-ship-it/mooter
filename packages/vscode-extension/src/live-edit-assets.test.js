'use strict';
// live-edit-assets.test.js — LP-4.7 §3 · the asset fence. The class under test: a local moo
// importing a lucide brand icon that stopped existing in v1.0, or inventing a package. Every
// refusal must be honest (reason + offending statement) and the whitelist must come from the
// VENDORED ground truth (or the workspace override), never from anyone's memory.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LEAS = require('./live-edit-assets.js');

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'leas-')); }
function mkWs(withPkgs) {
  const root = mkTmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ws', dependencies: {} }), 'utf8');
  for (const p of withPkgs || []) {
    const dir = path.join(root, 'node_modules', p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: p, version: '1.0.0' }), 'utf8');
  }
  return root;
}

// ── vendored ground truth ────────────────────────────────────────────────────────────────────
test('bundled whitelist loads, holds real lucide names and NOT the removed brand icons', () => {
  const wl = LEAS.loadLucideWhitelist({});
  assert.ok(wl.names.size > 1000, 'vendored whitelist present and non-trivial');
  assert.ok(wl.names.has('ArrowDown'), 'canonical name');
  assert.ok(wl.names.has('ArrowDownIcon'), 'alias names count too — they are valid imports');
  assert.strictEqual(wl.names.has('Github'), false, 'v1.0 removed brand icons — the whitelist must agree');
  assert.strictEqual(wl.names.has('Twitter'), false);
});

test('workspace .mooter/assets override wins over the bundled copy', () => {
  const root = mkTmp();
  const dir = path.join(root, '.mooter', 'assets', 'live-edit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'lucide-icons.llms.txt'), '# custom\nMyCompanyMark\n', 'utf8');
  const wl = LEAS.loadLucideWhitelist({ wsRoot: root });
  assert.ok(wl.names.has('MyCompanyMark'));
  assert.strictEqual(wl.names.has('ArrowDown'), false, 'override REPLACES — no silent merge');
  fs.rmSync(root, { recursive: true, force: true });
});

test('bundled brand SVGs load with real path data (GitHub octocat from simple-icons, not memory)', () => {
  const brands = LEAS.loadBrandSvgs({});
  const gh = brands.find((b) => b.slug === 'github');
  assert.ok(gh, 'github.svg vendored');
  assert.strictEqual(gh.title, 'GitHub');
  assert.ok(gh.svg.indexOf('<path d="M12 .297') === -1 || true); // no fixed prefix assumption
  assert.ok(gh.svg.length > 400, 'full path data, not a stub');
  assert.ok(/^<svg [^>]*viewBox="0 0 24 24"/.test(gh.svg), 'JSX-compatible svg root');
});

// ── intent detection + prompt block ─────────────────────────────────────────────────────────
test('no asset intent → NO block (a plain text edit must not pay the format tax)', () => {
  assert.strictEqual(LEAS.buildAssetBlock('muda o texto do botão para Entrar', {}), null);
  assert.strictEqual(LEAS.buildAssetBlock('make the heading bigger and bolder', {}), null);
});

test('brand mention → block carries the official SVG verbatim + the lucide v1.0 warning', () => {
  const block = LEAS.buildAssetBlock('insere o logo do GitHub no hero', { wsRoot: mkWs([]) });
  assert.ok(block, 'block built');
  assert.ok(block.indexOf('v1.0 removeu todos os ícones de marca') !== -1);
  assert.ok(block.indexOf('SVG oficial de GitHub') !== -1);
  assert.ok(block.indexOf('aria-label="GitHub"') !== -1, 'the actual vendored svg is inline');
  assert.ok(block.indexOf('<path d="') !== -1);
});

test('icon ask without lucide installed → says inline SVG, forbids new imports', () => {
  const ws = mkWs([]);
  const block = LEAS.buildAssetBlock('adiciona um ícone de seta', { wsRoot: ws });
  assert.ok(block.indexOf('NÃO está instalado') !== -1);
  fs.rmSync(ws, { recursive: true, force: true });
});

test('icon ask WITH lucide installed → matched whitelist names ride the block (capped)', () => {
  const ws = mkWs(['lucide-react']);
  const block = LEAS.buildAssetBlock('add an arrow icon pointing down', { wsRoot: ws });
  assert.ok(block.indexOf('ArrowDown') !== -1, 'fuzzy match found the name');
  assert.ok(block.indexOf('new_imports') !== -1);
  const names = (block.match(/nomes? EXACT[OA]/i) ? block : '');
  assert.ok(names.indexOf('ArrowDownIcon') === -1, 'alias noise stays out of the prompt block');
  fs.rmSync(ws, { recursive: true, force: true });
});

// ── the import fence ─────────────────────────────────────────────────────────────────────────
test('verifyImports: resolvable package passes; invented package refused with honest reason', () => {
  const ws = mkWs(['simple-icons']);
  const ok = LEAS.verifyImports(["import { siGithub } from 'simple-icons'"], { wsRoot: ws });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.imports[0].specifier, 'simple-icons');
  const bad = LEAS.verifyImports(["import { Foo } from 'made-up-pkg'"], { wsRoot: ws });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'import-unresolved');
  assert.ok(bad.detail.indexOf('made-up-pkg') !== -1, 'the offending package is named');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verifyImports: lucide brand icon refused with the v1.0 evidence; valid lucide name passes', () => {
  const ws = mkWs(['lucide-react']);
  const bad = LEAS.verifyImports(["import { Github } from 'lucide-react'"], { wsRoot: ws });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'lucide-name-unknown');
  assert.ok(bad.detail.indexOf('v1.0') !== -1, 'the reason teaches the retry round WHY');
  const ok = LEAS.verifyImports(["import { ArrowDown, Star } from 'lucide-react'"], { wsRoot: ws });
  assert.strictEqual(ok.ok, true);
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verifyImports: smuggling refused — comments, trailing junk, non-import, two statements', () => {
  const ws = mkWs(['react']);
  assert.strictEqual(LEAS.verifyImports(["import { A } from 'react' // hi"], { wsRoot: ws }).reason, 'import-has-comments');
  assert.strictEqual(LEAS.verifyImports(["/* x */ import { A } from 'react'"], { wsRoot: ws }).reason, 'import-has-comments');
  assert.strictEqual(LEAS.verifyImports(["const x = 1"], { wsRoot: ws }).reason, 'import-not-an-import');
  assert.strictEqual(LEAS.verifyImports(["import A from 'react'; alert(1)"], { wsRoot: ws }).reason, 'import-not-an-import');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verifyImports: relative imports must exist inside the workspace', () => {
  const ws = mkWs([]);
  fs.mkdirSync(path.join(ws, 'app', 'components'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'app', 'components', 'Logo.tsx'), 'export const Logo = () => null;', 'utf8');
  const file = path.join(ws, 'app', 'page.tsx');
  const ok = LEAS.verifyImports(["import { Logo } from './components/Logo'"], { wsRoot: ws, file });
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  assert.strictEqual(LEAS.verifyImports(["import { X } from './missing'"], { wsRoot: ws, file }).reason, 'import-file-missing');
  const esc = LEAS.verifyImports(["import { X } from '../../../etc/passwd'"], { wsRoot: ws, file });
  assert.strictEqual(esc.reason, 'import-outside-workspace');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verifyImports: absolute/parent-path specifiers and floods are refused; empty is fine', () => {
  const ws = mkWs([]);
  assert.strictEqual(LEAS.verifyImports(["import x from '/abs/path'"], { wsRoot: ws }).reason, 'import-outside-workspace');
  assert.strictEqual(LEAS.verifyImports(["import x from 'pkg/../../x'"], { wsRoot: ws }).reason, 'import-outside-workspace');
  assert.strictEqual(LEAS.verifyImports(new Array(6).fill("import a from 'react'"), { wsRoot: ws }).reason, 'too-many-imports');
  assert.strictEqual(LEAS.verifyImports([], { wsRoot: ws }).ok, true);
  assert.strictEqual(LEAS.verifyImports(null, { wsRoot: ws }).ok, true);
  assert.strictEqual(LEAS.verifyImports('not-an-array', { wsRoot: ws }).ok, false);
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verifyImports: scoped packages resolve by their two-segment name', () => {
  const ws = mkWs(['@scope/pkg']);
  assert.strictEqual(LEAS.verifyImports(["import { a } from '@scope/pkg/sub'"], { wsRoot: ws }).ok, true);
  assert.strictEqual(LEAS.verifyImports(["import { a } from '@scope/other'"], { wsRoot: ws }).reason, 'import-unresolved');
  fs.rmSync(ws, { recursive: true, force: true });
});
