'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  generateMooterSkills,
  buildSkillBody,
  PIN_MARKER,
} = require('./generate-mooter-skills');

function tmpSkillsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-skills-'));
}

const ANTHROPIC_FIXTURE = [
  { slug: 'opus-4-6', model: 'claude-opus-4-6', tier: 'T3', subagent: 'model-architect', displayName: 'Opus 4.6', provider: 'anthropic', available: true },
  { slug: 'haiku-4-5', model: 'claude-haiku-4-5', tier: 'T1', subagent: 'cheap-triage', displayName: 'Haiku 4.5', provider: 'anthropic', available: true },
];

test('dryRun: plans writes without touching the filesystem', () => {
  const dir = tmpSkillsDir();
  const res = generateMooterSkills({ dryRun: true, skillsDir: dir, models: ANTHROPIC_FIXTURE });
  assert.deepEqual(res.written.sort(), ['mooter-haiku-4-5', 'mooter-opus-4-6']);
  assert.equal(res.removed.length, 0);
  // Nothing was actually written.
  assert.equal(fs.existsSync(path.join(dir, 'mooter-opus-4-6', 'SKILL.md')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('write then re-run is idempotent (2nd run writes nothing)', () => {
  const dir = tmpSkillsDir();
  const first = generateMooterSkills({ skillsDir: dir, models: ANTHROPIC_FIXTURE });
  assert.equal(first.written.length, 2);
  assert.equal(first.skipped.length, 0);
  // Files exist and carry the marker.
  const body = fs.readFileSync(path.join(dir, 'mooter-opus-4-6', 'SKILL.md'), 'utf8');
  assert.ok(body.includes(PIN_MARKER));

  const second = generateMooterSkills({ skillsDir: dir, models: ANTHROPIC_FIXTURE });
  assert.equal(second.written.length, 0);
  assert.deepEqual(second.skipped.sort(), ['mooter-haiku-4-5', 'mooter-opus-4-6']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reduced catalog removes orphaned generated skill', () => {
  const dir = tmpSkillsDir();
  generateMooterSkills({ skillsDir: dir, models: ANTHROPIC_FIXTURE });
  // Now only opus is available → haiku skill should be removed.
  const res = generateMooterSkills({
    skillsDir: dir,
    models: [ANTHROPIC_FIXTURE[0]],
  });
  assert.deepEqual(res.removed, ['mooter-haiku-4-5']);
  assert.equal(fs.existsSync(path.join(dir, 'mooter-haiku-4-5')), false);
  assert.equal(fs.existsSync(path.join(dir, 'mooter-opus-4-6')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unavailable models are neither written nor kept', () => {
  const dir = tmpSkillsDir();
  const res = generateMooterSkills({
    skillsDir: dir,
    models: [{ ...ANTHROPIC_FIXTURE[0], available: false }],
  });
  assert.equal(res.written.length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'mooter-opus-4-6')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('SAFETY: hand-written mooter-* skill (no marker) is never removed', () => {
  const dir = tmpSkillsDir();
  // Simulate a real hand-written skill like mooter-review.
  const handDir = path.join(dir, 'mooter-review');
  fs.mkdirSync(handDir, { recursive: true });
  fs.writeFileSync(path.join(handDir, 'SKILL.md'), '---\nname: mooter-review\n---\nHand-written, no marker.\n');

  const res = generateMooterSkills({ skillsDir: dir, models: ANTHROPIC_FIXTURE });
  assert.ok(!res.removed.includes('mooter-review'));
  assert.equal(fs.existsSync(path.join(handDir, 'SKILL.md')), true, 'hand-written skill must survive');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('buildSkillBody: Anthropic template carries marker, model, tier, subagent', () => {
  const body = buildSkillBody(ANTHROPIC_FIXTURE[0]);
  assert.ok(body.includes(PIN_MARKER));
  assert.ok(body.includes('claude-opus-4-6'));
  assert.ok(body.includes('model-architect'));
  assert.ok(body.includes('name: mooter-opus-4-6'));
});

test('buildSkillBody: unknown provider throws (Sessão B extends this)', () => {
  assert.throws(() => buildSkillBody({ slug: 'x', provider: 'ollama' }), /no template for provider/);
});
