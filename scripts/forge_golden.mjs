#!/usr/bin/env node
// Adapter Forge — Golden Set stamp/check (AF-01, $0, no GPU).
//
// The gate compares an adapter candidate against a HASHED, VERSIONED golden set:
//   core-frozen   ~50-100 timeless-capability examples (reasoning, format,
//                 no-hallucination, honesty, refusal, reversibility, groundedness).
//                 Immutable → gate DURO. Any edit must bump version + re-stamp.
//   domain-rolling  sampled from decisions.log with τ≈60d decay, re-sampled
//                   weekly → gate SOFT. (Config only here; sampler is a later step.)
//
// Promotion is asymmetric (docs/strategy/ADAPTER_FORGE.md §6 AF-01):
//   serve iff  core >= baseline-ε  AND  domain-rolling > incumbent.
//
//   node scripts/forge_golden.mjs --stamp   → (re)write MANIFEST.json from files
//   node scripts/forge_golden.mjs --check    → verify hashes match manifest (CI/gate)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.resolve(__dirname, '..', 'audit', 'forge', 'golden');
const CORE = path.join(GOLDEN_DIR, 'core-frozen.jsonl');
const MANIFEST = path.join(GOLDEN_DIR, 'MANIFEST.json');
const VERSION = '0.1.0-starter';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function loadCore() {
  const lines = fs.readFileSync(CORE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((l, i) => {
    let o; try { o = JSON.parse(l); } catch { throw new Error(`core-frozen.jsonl:${i + 1} bad JSON`); }
    for (const k of ['id', 'capability', 'prompt']) if (!o[k]) throw new Error(`core-frozen.jsonl:${i + 1} missing ${k}`);
    if (!o.ground_truth && !o.rubric) throw new Error(`core-frozen.jsonl:${i + 1} needs ground_truth or rubric`);
    return o;
  });
}

function buildManifest() {
  const items = loadCore();
  const byCap = {};
  for (const it of items) byCap[it.capability] = (byCap[it.capability] || 0) + 1;
  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate id in core-frozen.jsonl');
  return {
    version: VERSION,
    frozen: true,
    note: 'STARTER — expand core-frozen to 50-100 human-curated examples before F4 gate is authoritative.',
    core_frozen: {
      path: 'audit/forge/golden/core-frozen.jsonl',
      count: items.length,
      sha256: sha256(fs.readFileSync(CORE)),
      capabilities: byCap,
      gate: 'hard',
      epsilon: 0.0,
    },
    domain_rolling: {
      source: 'tools/router/decisions.log',
      tau_days: 60,
      resample: 'weekly',
      gate: 'soft',
      status: 'config-only (sampler is a later Forge step)',
    },
    promotion_rule: 'serve iff core >= baseline-epsilon AND domain_rolling > incumbent',
  };
}

const mode = process.argv.includes('--check') ? 'check' : 'stamp';
if (mode === 'stamp') {
  const m = buildManifest();
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  console.log(`[forge-golden] stamped ${MANIFEST} — core=${m.core_frozen.count} sha=${m.core_frozen.sha256.slice(0, 12)}… caps=${JSON.stringify(m.core_frozen.capabilities)}`);
} else {
  if (!fs.existsSync(MANIFEST)) { console.error('[forge-golden] no MANIFEST.json — run --stamp first'); process.exit(1); }
  const saved = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const actual = sha256(fs.readFileSync(CORE));
  if (actual !== saved.core_frozen.sha256) {
    console.error(`[forge-golden] FAIL core-frozen changed without a version bump.\n  manifest: ${saved.core_frozen.sha256}\n  actual:   ${actual}`);
    process.exit(1);
  }
  console.log(`[forge-golden] OK core-frozen matches manifest (v${saved.version}, ${saved.core_frozen.count} items)`);
}
