#!/usr/bin/env node
// generate-live-edit-assets.mjs — LP-4.7 · regenerates the vendored asset ground truth under
// assets/live-edit/. Dev-time only (scripts/ is .vscodeignore'd out of the vsix). Two sources,
// both REAL packages — nothing here comes from a model's memory:
//
//   lucide-icons.llms.txt  ← the export block of lucide-react's published d.ts (unpkg). Every
//                            valid import name, aliases included; provenance in the header.
//   brand/<slug>.svg       ← path data from an INSTALLED simple-icons package (pass the dir of
//                            a project that has it, e.g. ../../landing).
//
// Usage: node scripts/generate-live-edit-assets.mjs [--simple-icons-from <dir>] [--lucide-version <v>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'assets', 'live-edit');
const args = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : dflt; };
const lucideVersion = argOf('--lucide-version', 'latest');
const siFrom = argOf('--simple-icons-from', path.join(here, '..', '..', '..', 'landing'));
const BRANDS = ['siGithub', 'siX', 'siDiscord', 'siGoogle', 'siYoutube', 'siInstagram', 'siFacebook', 'siApple'];

const dts = await (await fetch('https://unpkg.com/lucide-react@' + lucideVersion + '/dist/lucide-react.d.ts')).text();
const resolved = (dts.match(/@component @name/) ? lucideVersion : null);
if (!resolved && !dts.includes('LucideIcon')) throw new Error('unexpected d.ts payload — refusing to write a bogus whitelist');
const names = new Set();
for (const block of dts.match(/export \{[^}]*\}/g) || []) {
  for (const part of block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')).split(',')) {
    const p = part.trim();
    if (!p) continue;
    const name = p.includes(' as ') ? p.split(' as ').pop().trim() : p;
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) names.add(name);
  }
}
const UTIL = new Set(['createLucideIcon', 'icons', 'IconNode', 'LucideIcon', 'LucideProps', 'defaultAttributes', 'Icon', 'DynamicIcon', 'SVGAttributes', 'ElementAttributes', 'SVGElementType']);
const iconNames = [...names].filter((n) => !UTIL.has(n)).sort();
if (iconNames.length < 1000) throw new Error('whitelist suspiciously small (' + iconNames.length + ') — refusing to overwrite');
const today = new Date().toISOString().slice(0, 10);
const header = [
  '# lucide-react icon whitelist — Live Edit asset fence (LP-4.7)',
  '# source: lucide-react@' + lucideVersion + ' dist/lucide-react.d.ts export block (unpkg.com), extracted ' + today,
  '# regenerate: packages/vscode-extension/scripts/generate-live-edit-assets.mjs',
  '# fact (verified against the package): lucide v1.0 (Jun 2026) removed ALL brand icons —',
  '# Github/Twitter/Facebook are NOT exports. Brand logos live in brand/*.svg (simple-icons data).',
  '# format: one valid lucide-react export name per line; lines starting with # are comments.',
  '',
].join('\n');
fs.mkdirSync(path.join(outDir, 'brand'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'lucide-icons.llms.txt'), header + iconNames.join('\n') + '\n');
console.log('lucide-icons.llms.txt:', iconNames.length, 'names');

const req = createRequire(path.join(path.resolve(siFrom), 'package.json'));
const si = req('simple-icons');
for (const key of BRANDS) {
  const icon = si[key];
  if (!icon) { console.warn(key, 'not in this simple-icons version — skipped'); continue; }
  const svg = '<svg role="img" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-label="'
    + icon.title + '"><path d="' + icon.path + '"/></svg>\n';
  fs.writeFileSync(path.join(outDir, 'brand', icon.slug + '.svg'), svg);
  console.log('brand/' + icon.slug + '.svg —', icon.title);
}
