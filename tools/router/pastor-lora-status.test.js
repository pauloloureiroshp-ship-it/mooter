// Wave 58.4 Block D — pastor-lora-status chip (Q1 Pastor v2 honest TF-IDF chip).
// Hermetic: pure buildPastorLoraChip + decisionCount over a temp log; statusLine
// integration uses a temp MOOTER_DECISIONS_LOG so it never touches the real log.
'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildPastorLoraChip,
  decisionCount,
  statusLine,
  DEFAULT_ON_THRESHOLD,
} = require('./pastor-lora-status.js');

// ── buildPastorLoraChip (pure) ────────────────────────────────────────────────

test('renders the honest TF-IDF chip at/above threshold', () => {
  const chip = buildPastorLoraChip(66);
  assert.equal(chip, '🎓 Pastor v2 · 66 decisions · TF-IDF (Occam-aligned)');
});

test('says "TF-IDF", never "LoRA" / "neural" (anti-confusion)', () => {
  const chip = buildPastorLoraChip(100);
  assert.match(chip, /TF-IDF/);
  assert.doesNotMatch(chip, /LoRA|neural/i);
});

test('exactly at threshold (50) → shows', () => {
  assert.ok(buildPastorLoraChip(DEFAULT_ON_THRESHOLD).startsWith('🎓 Pastor v2'));
});

test('below threshold → silent (empty string)', () => {
  assert.equal(buildPastorLoraChip(49), '');
  assert.equal(buildPastorLoraChip(1), '');
});

test('zero / negative / NaN decisions → silent (no fabrication)', () => {
  assert.equal(buildPastorLoraChip(0), '');
  assert.equal(buildPastorLoraChip(-5), '');
  assert.equal(buildPastorLoraChip(NaN), '');
});

test('force shows the REAL count below threshold, but still silent at 0', () => {
  assert.equal(buildPastorLoraChip(10, { force: true }), '🎓 Pastor v2 · 10 decisions · TF-IDF (Occam-aligned)');
  assert.equal(buildPastorLoraChip(0, { force: true }), ''); // never fabricate a count
});

test('custom threshold is honoured', () => {
  assert.equal(buildPastorLoraChip(30, { threshold: 25 }).startsWith('🎓'), true);
  assert.equal(buildPastorLoraChip(20, { threshold: 25 }), '');
});

// ── decisionCount (temp file) ─────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-pastor-'));
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

test('decisionCount counts non-empty lines; missing file → 0', () => {
  const log = path.join(tmp, 'decisions.log');
  fs.writeFileSync(log, 'a\nb\n\n  \nc\n'); // 3 non-empty lines
  assert.equal(decisionCount(log), 3);
  assert.equal(decisionCount(path.join(tmp, 'nope.log')), 0);
});

// ── statusLine integration (temp MOOTER_DECISIONS_LOG) ────────────────────────

test('statusLine: ≥50 lines → chip; <50 → silent; MOOTER_STATUSLINE_PASTOR=0 hides', () => {
  const log = path.join(tmp, 'sl.log');
  const prevLog = process.env.MOOTER_DECISIONS_LOG;
  const prevHide = process.env.MOOTER_STATUSLINE_PASTOR;
  process.env.MOOTER_DECISIONS_LOG = log;
  try {
    fs.writeFileSync(log, Array.from({ length: 66 }, (_, i) => `d${i}`).join('\n') + '\n');
    delete process.env.MOOTER_STATUSLINE_PASTOR;
    assert.equal(statusLine(), '🎓 Pastor v2 · 66 decisions · TF-IDF (Occam-aligned)');

    process.env.MOOTER_STATUSLINE_PASTOR = '0'; // explicit hide
    assert.equal(statusLine(), '');

    delete process.env.MOOTER_STATUSLINE_PASTOR;
    fs.writeFileSync(log, 'only\ntwo\n'); // below threshold
    assert.equal(statusLine(), '');
  } finally {
    if (prevLog === undefined) delete process.env.MOOTER_DECISIONS_LOG; else process.env.MOOTER_DECISIONS_LOG = prevLog;
    if (prevHide === undefined) delete process.env.MOOTER_STATUSLINE_PASTOR; else process.env.MOOTER_STATUSLINE_PASTOR = prevHide;
  }
});
