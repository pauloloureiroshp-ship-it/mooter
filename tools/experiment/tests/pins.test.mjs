// pins.test.mjs — condição C3: os dois módulos do motor que o kit lê estão
// pinados por sha256; o kit recusa arrancar se algum não bater.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { verifyPins, assertPins, loadPins, PINS_PATH, REPO_ROOT, sha256, PinsError } from '../pins.mjs';
import * as J from '../journal.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-pins-'));

test('pins · no repo actual os três pins batem (ledger-prov.js, provider-health.js, e o contrato 0.3 congelado — AMENDMENT-001)', () => {
  const r = verifyPins();
  assert.equal(r.ok, true, JSON.stringify(r.mismatches));
  assert.deepEqual(r.checked.map((c) => c.path).sort(), ['tools/experiment/contract/engine-contract-0.3-proposed.json', 'tools/router/ledger-prov.js', 'tools/router/provider-health.js']);
  assert.equal(r.checked.find((c) => c.path.endsWith('0.3-proposed.json')).actual, '61acea27efd7f9d2fcc7c047fc309d37bd6df17843a7303140a2be11fb3f5c20', 'é byte a byte o ficheiro do pacote consensus-gpt-v0.2');
  assert.match(r.pinned_at_sha, /^[0-9a-f]{40}$/);
  for (const c of r.checked) assert.equal(c.actual, sha256(fs.readFileSync(path.join(REPO_ROOT, c.path))));
});

test('pins · pins.json adulterado → verifyPins lista o desvio, assertPins recusa, openJournal não chega a criar nada', () => {
  const pins = loadPins();
  const dir = tmp();
  const pinsPath = path.join(dir, 'pins.json');
  const alterado = { ...pins, files: { ...pins.files, 'tools/router/ledger-prov.js': 'f'.repeat(64) } };
  fs.writeFileSync(pinsPath, JSON.stringify(alterado));

  const r = verifyPins({ pinsPath });
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatches.map((m) => m.path), ['tools/router/ledger-prov.js']);
  assert.throws(() => assertPins({ pinsPath }), (e) => e instanceof PinsError && e.code === 'pins_mismatch' && /ledger-prov/.test(e.message));

  const root = path.join(dir, 'data');
  assert.throws(() => J.openJournal({ root, waveId: 'W-x', pinsOpts: { pinsPath } }), (e) => e.code === 'pins_mismatch');
  assert.equal(fs.existsSync(root), false, 'a recusa acontece antes de tocar no disco de dados');
});

test('pins · MORDIDA · o pin morde no CONTEÚDO: um byte a mais numa cópia do módulo é mismatch; ficheiro ausente é AUSENTE, não «bate»', () => {
  const fakeRepo = tmp();
  fs.mkdirSync(path.join(fakeRepo, 'tools', 'router'), { recursive: true });
  const src = fs.readFileSync(path.join(REPO_ROOT, 'tools/router/ledger-prov.js'));
  fs.writeFileSync(path.join(fakeRepo, 'tools/router/ledger-prov.js'), Buffer.concat([src, Buffer.from('\n')]));
  const r = verifyPins({ repoRoot: fakeRepo });
  assert.equal(r.ok, false);
  const byPath = Object.fromEntries(r.mismatches.map((m) => [m.path, m]));
  assert.ok(byPath['tools/router/ledger-prov.js'], 'um \\n a mais já é outro conteúdo');
  assert.notEqual(byPath['tools/router/ledger-prov.js'].actual, 'AUSENTE');
  assert.equal(byPath['tools/router/provider-health.js'].actual, 'AUSENTE');
  assert.equal(byPath['tools/experiment/contract/engine-contract-0.3-proposed.json'].actual, 'AUSENTE');
  assert.equal(PINS_PATH.endsWith('pins.json'), true);
});
