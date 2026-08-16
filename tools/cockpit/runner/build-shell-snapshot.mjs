#!/usr/bin/env node
/**
 * build-shell-snapshot.mjs — bakes a point-in-time fleet payload into the shell.
 *
 * This is rung 1 of the cockpit's data ladder: a standalone file that opens
 * anywhere, with no endpoint and no network. Precisely because it cannot
 * refresh, it must never look live — so the snapshot carries `__stamp` and the
 * shell renders a permanent "a ver um instantâneo" banner when it falls back to
 * it. A snapshot that passed for live data would be the worst lie this project
 * could ship.
 *
 * Usage:  node tools/cockpit/runner/build-shell-snapshot.mjs [saida.html]
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildFleetState } from './fleet-state.mjs';
import { buildAlignment } from './alignment.mjs';
import { sampleGpu } from './gpu-sampler.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..', '..');
const SHELL = path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html');
const MOO_DIR = process.env.MOOTER_HOME || path.join(process.env.HOME || '', '.mooter');

const BEGIN = '<!-- MOO_SNAPSHOT:BEGIN -->';
const END = '<!-- MOO_SNAPSHOT:END -->';

/** Prevents the payload from closing the script tag or opening a comment. */
export function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\u0021--');
}

/** Idempotent: re-running replaces the block instead of stacking copies. */
export function injectSnapshot(html, snapshot) {
  const clean = stripSnapshot(html);
  const block =
    `${BEGIN}\n<script>window.__MOOTER_SNAPSHOT__=${scriptSafeJson(snapshot)};</script>\n${END}\n`;
  const at = clean.search(/<script(?:\s|>)/i);
  if (at < 0) throw new Error('o shell nao tem <script> onde ancorar o snapshot');
  return clean.slice(0, at) + block + clean.slice(at);
}

export function stripSnapshot(html) {
  let out = String(html);
  for (;;) {
    const start = out.indexOf(BEGIN);
    if (start < 0) return out;
    const end = out.indexOf(END, start);
    if (end < 0) throw new Error('bloco de snapshot abre e nao fecha');
    out = out.slice(0, start) + out.slice(end + END.length);
  }
}

async function main() {
  const out = process.argv[2] || path.join(REPO, 'dist', 'moo-pilot-snapshot.html');
  const [gpu, alignment] = await Promise.all([
    sampleGpu(),
    buildAlignment({ repoRoot: REPO }).catch(() => null),
  ]);

  const snapshot = buildFleetState({
    ledgerPath: path.join(MOO_DIR, 'runner-ledger.jsonl'),
    statePath: path.join(MOO_DIR, 'runner-state.json'),
    stopFile: path.join(MOO_DIR, 'STOP'),
    gpu,
    alignment,
    // Deliberately false: a snapshot cannot vouch for a process being up right
    // now, so it never claims the engine is alive.
    engineAlive: false,
  });
  snapshot.__stamp = new Date().toISOString();
  snapshot.__fonte = 'instantaneo';

  const html = injectSnapshot(fs.readFileSync(SHELL, 'utf8'), snapshot);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  process.stdout.write(
    `instantaneo escrito: ${out} (${Math.round(html.length / 1024)} KB, ` +
      `${snapshot.recibos.total} recibos, ${snapshot.recibos.citacao_ok} citacao-ok)\n`,
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
