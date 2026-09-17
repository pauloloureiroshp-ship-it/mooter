// contract.mjs — o contrato 0.3 congelado, lido em runtime, verificado por sha256.
//
// AMENDMENT-001 (2026-09-17, correcção mecânica da revisão científica do GPT):
// «closeout_required tem 21 entradas no contrato 0.3, não 20 — lê a lista da
// versão congelada, nunca constante.» A constante do passo 4 tinha as 21
// entradas certas e o TEXTO dizia 20 — o que prova o ponto: uma lista copiada
// à mão diverge do documento que a rege sem ninguém dar por isso.
//
// A partir daqui o vocabulário normativo (closeout_required, slot_outcomes,
// wave_decisions, scientific_observations.fields, learning.denominators,
// condition_record.required_record) vem de
// contract/engine-contract-0.3-proposed.json — cópia byte a byte de
// consensus-gpt-v0.2/engine-contract-0.3-proposed.json (sha256 61acea27…),
// pinada em pins.json. Se o ficheiro mudar, o kit recusa (pins_mismatch);
// se alguém quiser outro contrato, é outra versão, outra pin, outra AMENDMENT.

import nodeFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPins, sha256, PinsError } from './pins.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT_REL = 'tools/experiment/contract/engine-contract-0.3-proposed.json';
export const CONTRACT_PATH = path.join(AQUI, 'contract', 'engine-contract-0.3-proposed.json');
export const CONTRACT_VERSION = 'prisma-engine-draft-0.3-proposed';

let _cache = null;

/** Lê e verifica o contrato congelado. Lança PinsError('pins_mismatch') se o sha não bater. */
export function loadContract({ fs = nodeFs, pinsOpts = {} } = {}) {
  if (_cache && fs === nodeFs) return _cache;
  const bytes = fs.readFileSync(CONTRACT_PATH);
  const actual = sha256(bytes);
  const pins = loadPins({ fs, ...pinsOpts });
  const expected = String(pins.files[CONTRACT_REL] || '').toLowerCase();
  if (!expected) throw new PinsError('pins_mismatch', `o contrato não está pinado em pins.json (${CONTRACT_REL})`);
  if (actual !== expected) throw new PinsError('pins_mismatch', `contrato congelado alterado: esperado ${expected.slice(0, 12)}…, medido ${actual.slice(0, 12)}… — outro contrato é outra versão, outra pin, outra AMENDMENT`, { expected, actual });
  const c = JSON.parse(bytes.toString('utf8'));
  if (c.version !== CONTRACT_VERSION) throw new PinsError('pins_mismatch', `contrato diz version ${c.version}, o kit implementa ${CONTRACT_VERSION}`);
  const out = Object.freeze({
    version: c.version,
    sha256: actual,
    closeout_required: Object.freeze([...c.storage.closeout_required]),
    slot_outcomes: Object.freeze([...c.state_machine.slot_outcomes]),
    wave_decisions: Object.freeze([...c.state_machine.wave_decisions]),
    science_fields: Object.freeze([...c.scientific_observations.fields]),
    science_value_domain: Object.freeze([...c.scientific_observations.value_domain]),
    science_provenance: Object.freeze([...c.scientific_observations.required_provenance]),
    denominators: Object.freeze({ ...c.learning.denominators }),
    condition_required: Object.freeze([...c.condition_record.required_record]),
    raw: c,
  });
  if (fs === nodeFs) _cache = out;
  return out;
}
