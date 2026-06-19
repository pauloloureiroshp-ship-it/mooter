'use strict';
// Wave 32 (Phase NEW1) — validate the 8 /moo-* slash skills: each exists with
// well-formed frontmatter and a name matching its directory (so CC autocompletes
// /moo-<name>).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', '..', '.claude', 'skills');
const EXPECTED = ['moo-workflow', 'moo-effort', 'moo-herd', 'moo-dashboard', 'moo-status', 'moo-distill', 'moo-pack', 'moo-help',
  // Wave 53 Phase E — CC-parity skills (additive; do NOT shadow CC's native /agents //memory //init).
  'moo-agents', 'moo-memory', 'moo-init',
  // First Magic FASE 2 — the free deterministic critic.
  'moo-verify'];

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

test('all 12 /moo-* skills exist with valid frontmatter and matching name', () => {
  for (const slug of EXPECTED) {
    const p = path.join(SKILLS_DIR, slug, 'SKILL.md');
    assert.ok(fs.existsSync(p), `${slug}/SKILL.md missing`);
    const fm = frontmatter(fs.readFileSync(p, 'utf8'));
    assert.ok(fm, `${slug}: no frontmatter`);
    assert.strictEqual(fm.name, slug, `${slug}: name must equal dir`);
    assert.ok(fm.description && fm.description.length > 20, `${slug}: needs a description`);
  }
});

test('exactly the 12 expected moo-* skills are present (no stragglers)', () => {
  const dirs = fs.readdirSync(SKILLS_DIR).filter((d) => d.startsWith('moo-'));
  assert.deepStrictEqual(dirs.sort(), [...EXPECTED].sort());
});
