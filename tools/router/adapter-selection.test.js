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

test('getActiveAdapter: null when marked but no manifest on disk', () => {
  // Override via MOOTER_HOME (the .mooter dir itself) — the cross-platform home
  // resolution the source actually honors; $HOME is a no-op on Windows.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-'));
  const mooterHome = path.join(tmp, '.mooter');
  fs.mkdirSync(mooterHome, { recursive: true });
  fs.writeFileSync(path.join(mooterHome, 'preferences.json'), JSON.stringify({ active_adapter_id: 'abc123' }));
  const prevMH = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = mooterHome;
  try {
    assert.equal(getActiveAdapter(), null, 'marked id with no manifest → baseline');
    assert.equal(markedAdapterId(), 'abc123', 'but it reports the marked id');
  } finally {
    if (prevMH === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevMH;
  }
});

const crypto = require('node:crypto');
const { verifyManifestSignatureSync } = require('./adapter_selection.js');

// Sign a manifest the SAME way packages/router adapter_manifest does (natural-order
// JSON.stringify of the object WITHOUT `signature`).
function signed(manifest, secret) {
  const { signature, ...rest } = manifest;
  return { ...rest, signature: crypto.createHmac('sha256', secret).update(JSON.stringify(rest)).digest('hex') };
}

// `mooterHome` is the .mooter dir itself (matches MOOTER_HOME semantics).
function setupAdapter(mooterHome, id, manifestFields, secret, opts = {}) {
  fs.mkdirSync(path.join(mooterHome, 'adapters', id), { recursive: true });
  fs.writeFileSync(path.join(mooterHome, '.telemetry_secret'), secret + '\n');
  fs.writeFileSync(path.join(mooterHome, 'preferences.json'), JSON.stringify({ active_adapter_id: id }));
  const manifest = signed({ schema_version: 1, adapter_id: id, name: manifestFields.name, base_model: 'qwen2.5:3b', adapter_type: 'lora', quantization: 'q4_k_m', ...manifestFields }, secret);
  fs.writeFileSync(path.join(mooterHome, 'adapters', id, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (opts.withGguf !== false) fs.writeFileSync(path.join(mooterHome, 'adapters', id, 'adapter.gguf'), 'FAKE');
  return manifest;
}

// Point MOOTER_HOME at the .mooter dir — the cross-platform override the source
// honors (setting $HOME is a no-op on Windows where os.homedir() ignores it).
function withHome(mooterHome, fn) {
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = mooterHome;
  try { return fn(); } finally { if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev; }
}

test('getActiveAdapter (D2): valid signed manifest + gguf → returns it', () => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ad-')), '.mooter');
  setupAdapter(home, 'aaa111', { name: 'diagram-v1' }, 'sec-1');
  withHome(home, () => {
    const a = getActiveAdapter();
    assert.ok(a, 'returns the manifest');
    assert.equal(a.name, 'diagram-v1');
  });
});

test('getActiveAdapter (D2): tampered signature → null (never honor)', () => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ad-')), '.mooter');
  const m = setupAdapter(home, 'bbb222', { name: 'x' }, 'sec-2');
  // tamper: change name without re-signing
  m.name = 'evil';
  fs.writeFileSync(path.join(home, 'adapters', 'bbb222', 'manifest.json'), JSON.stringify(m));
  withHome(home, () => assert.equal(getActiveAdapter(), null, 'tampered manifest → baseline'));
});

test('getActiveAdapter (D2): missing adapter.gguf → null', () => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ad-')), '.mooter');
  setupAdapter(home, 'ccc333', { name: 'x' }, 'sec-3', { withGguf: false });
  withHome(home, () => assert.equal(getActiveAdapter(), null, 'no .gguf → baseline'));
});

test('verifyManifestSignatureSync: matches the natural-order signing', () => {
  const m = signed({ schema_version: 1, adapter_id: 'z', name: 'n', base_model: 'b', adapter_type: 'lora', quantization: 'q4_k_m' }, 'k');
  assert.equal(verifyManifestSignatureSync(m, 'k'), true);
  assert.equal(verifyManifestSignatureSync(m, 'wrong'), false);
  assert.equal(verifyManifestSignatureSync({ ...m, name: 'tampered' }, 'k'), false);
});

test('applyAdapterToDecision: null adapter → baseline annotation', () => {
  const d = applyAdapterToDecision({ tier: 'T2' }, null);
  assert.equal(d.adapter_applied, false);
  assert.equal(d.adapter_id, null);
  assert.match(d.adapter_reason, /baseline \(no adapter installed\)/);
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
