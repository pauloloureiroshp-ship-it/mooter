// contract.test.mjs — AMENDMENT-001, correcção mecânica: o vocabulário normativo é
// LIDO do contrato 0.3 congelado e pinado, nunca de uma constante. A constante do
// passo 4 tinha 21 entradas e o texto dizia «20»; este teste fixa que o número vem do
// ficheiro, e que um ficheiro alterado é recusado.
//
// Mordida (verificada à mão): voltar a uma lista literal em closeout.mjs com 20
// entradas, ou deixar loadContract ignorar o sha, põe contract-a/contract-b vermelhos.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadContract, CONTRACT_PATH, CONTRACT_REL, CONTRACT_VERSION } from '../contract.mjs';
import { CLOSEOUT_REQUIRED, WAVE_DECISIONS, OUTCOMES, HUMAN_FIELDS, DERIVED_FIELDS, CONTRACT_SHA256 } from '../closeout.mjs';
import { SCIENCE_FIELDS, VALUE_DOMAIN, REQUIRED_PROVENANCE } from '../scores.mjs';
import { CONDITION_KEYS } from '../freeze.mjs';
import { loadPins, sha256 } from '../pins.mjs';

test('contract-a · closeout_required tem 21 entradas — lidas do ficheiro congelado, iguais às do JSON, na ordem do contrato', () => {
  const c = loadContract();
  const raw = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  assert.equal(c.version, CONTRACT_VERSION);
  assert.equal(raw.storage.closeout_required.length, 21, 'o contrato 0.3-proposed tem 21, não 20');
  assert.deepEqual([...CLOSEOUT_REQUIRED], raw.storage.closeout_required, 'closeout.mjs expõe exactamente a lista do ficheiro');
  assert.equal(CLOSEOUT_REQUIRED.length, 21);
  assert.equal(HUMAN_FIELDS.length + DERIVED_FIELDS.length, 21, '7 humanos + 14 derivados');
  assert.deepEqual([...WAVE_DECISIONS], raw.state_machine.wave_decisions);
  assert.deepEqual([...OUTCOMES], raw.state_machine.slot_outcomes);
  assert.deepEqual(SCIENCE_FIELDS.slice(0, 8), raw.scientific_observations.fields);
  assert.equal(SCIENCE_FIELDS[8], 'competitor_included', 'a chave própria do contrato, por marca');
  assert.deepEqual([...VALUE_DOMAIN], raw.scientific_observations.value_domain);
  assert.deepEqual([...REQUIRED_PROVENANCE], raw.scientific_observations.required_provenance);
  assert.deepEqual([...CONDITION_KEYS], raw.condition_record.required_record);
  assert.equal(CONDITION_KEYS.length, 14);
  assert.equal(CONTRACT_SHA256, sha256(fs.readFileSync(CONTRACT_PATH)));
  assert.equal(loadPins().files[CONTRACT_REL], CONTRACT_SHA256, 'o pin em pins.json é o hash do ficheiro que está no disco');
});

test('contract-b · MORDIDA · um contrato alterado (1 entrada a menos em closeout_required) é recusado por pins_mismatch; um pin em falta também', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-contract-'));
  const raw = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const original = fs.readFileSync(CONTRACT_PATH);
  // fs injectado: o «ficheiro» do contrato tem 20 entradas; pins.json é o real.
  const alterado = { ...raw, storage: { ...raw.storage, closeout_required: raw.storage.closeout_required.slice(0, 20) } };
  const fakeFs = { readFileSync: (p, enc) => (String(p) === CONTRACT_PATH ? Buffer.from(JSON.stringify(alterado, null, 2)) : fs.readFileSync(p, enc)) };
  assert.throws(() => loadContract({ fs: fakeFs }), (e) => e.code === 'pins_mismatch' && /contrato congelado alterado/.test(e.message));
  // pin em falta: pins.json sem a entrada do contrato.
  const pins = loadPins();
  const semPin = { ...pins, files: Object.fromEntries(Object.entries(pins.files).filter(([k]) => k !== CONTRACT_REL)) };
  const pinsPath = path.join(dir, 'pins.json');
  fs.writeFileSync(pinsPath, JSON.stringify(semPin));
  assert.throws(() => loadContract({ fs: { readFileSync: (p, enc) => fs.readFileSync(p, enc) }, pinsOpts: { pinsPath } }), (e) => e.code === 'pins_mismatch' && /não está pinado/.test(e.message));
  // O ficheiro real continua intacto.
  assert.equal(Buffer.compare(fs.readFileSync(CONTRACT_PATH), original), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
