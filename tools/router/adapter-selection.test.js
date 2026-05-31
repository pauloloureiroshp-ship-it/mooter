// Wave 5 D1 — adapter runtime selection stub. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const { getActiveAdapter, markedAdapterId, applyAdapterToDecision } = require('./adapter_selection.js');

test('getActiveAdapter: null with no prefs (baseline)', () => {
  assert.equal(getActiveAdapter(), null);
});

test('getActiveAdapter: STILL null even when active_adapter_id is set (D1 stub)', () => {
  // Point HOME at a temp dir with a prefs file marking an adapter active.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-'));
  fs.mkdirSync(path.join(tmp, '.mooter'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.mooter', 'preferences.json'), JSON.stringify({ active_adapter_id: 'abc123' }));
  const prevHome = process.env.HOME;
  process.env.HOME = tmp;
  try {
    assert.equal(getActiveAdapter(), null, 'D1 never honors a marked adapter (no validation pipeline yet)');
    assert.equal(markedAdapterId(), 'abc123', 'but it CAN report that one was marked');
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
  }
});

test('applyAdapterToDecision: null adapter → baseline annotation', () => {
  const d = applyAdapterToDecision({ tier: 'T2' }, null);
  assert.equal(d.adapter_applied, false);
  assert.equal(d.adapter_id, null);
  assert.match(d.adapter_reason, /baseline \(forge ships Wave 5 D2\)/);
  assert.equal(d.tier, 'T2', 'original decision preserved');
});

test('applyAdapterToDecision: real adapter → applied annotation (D2 forward-compat)', () => {
  const d = applyAdapterToDecision({ tier: 'T0' }, { adapter_id: 'id1', name: 'diagram-v1', adapter_type: 'lora', quantization: 'q4_k_m' });
  assert.equal(d.adapter_applied, true);
  assert.equal(d.adapter_id, 'id1');
  assert.equal(d.adapter_name, 'diagram-v1');
  assert.match(d.adapter_reason, /validated adapter active \(lora, q4_k_m\)/);
});

test('applyAdapterToDecision: does not mutate input', () => {
  const input = { tier: 'T1' };
  applyAdapterToDecision(input, null);
  assert.deepEqual(input, { tier: 'T1' });
});
