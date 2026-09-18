// pins.mjs — os dois ficheiros do motor que o kit lê ficam pinados por sha256.
//
// PORQUÊ ISTO EXISTE (2026-09-16, condição C3 do Cowork Prisma)
// O kit de experimento reutiliza exactamente dois módulos de tools/router:
// `ledger-prov.js` (canonicalize/provHash — o hash de todos os payloads e do
// manifesto) e `provider-health.js` (a taxonomia de falhas e o parse do reset).
// Se qualquer um mudar a meio de uma onda, o manifesto congelado deixa de ser
// comparável consigo próprio e uma falha pode ser etiquetada de outra maneira
// sem ninguém dar por isso. Um pin é a diferença entre «o hash mudou porque o
// prompt mudou» e «o hash mudou porque a função mudou».
//
// O que se pina é o CONTEÚDO (sha256 dos bytes), não a versão do repo: um
// worktree pode estar noutro SHA e ter os mesmos bytes — e é isso que interessa.
//
// Zero dependências. Lê com o `fs` real por omissão; injectável para testes.

import nodeFs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
/** Raiz do repositório Mooter (tools/experiment → tools → raiz). */
export const REPO_ROOT = path.resolve(AQUI, '..', '..');
export const PINS_PATH = path.join(AQUI, 'pins.json');

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export class PinsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PinsError';
    this.code = code;
    this.details = details;
  }
}

/** Lê pins.json. Lança PinsError('pins_unreadable') se faltar ou não for JSON. */
export function loadPins({ fs = nodeFs, pinsPath = PINS_PATH } = {}) {
  let raw;
  try { raw = fs.readFileSync(pinsPath, 'utf8'); } catch (e) {
    throw new PinsError('pins_unreadable', `pins.json ilegível: ${e && e.message}`, { pinsPath });
  }
  let pins;
  try { pins = JSON.parse(raw); } catch (e) {
    throw new PinsError('pins_unreadable', `pins.json não é JSON: ${e && e.message}`, { pinsPath });
  }
  if (!pins || typeof pins.files !== 'object' || pins.files === null) {
    throw new PinsError('pins_unreadable', 'pins.json sem campo `files`', { pinsPath });
  }
  return pins;
}

/**
 * Mede cada ficheiro pinado e compara. Nunca lança por divergência — devolve
 * `{ ok, checked, mismatches }` para quem quiser mostrar; `assertPins` é a
 * versão que recusa.
 *
 * Um ficheiro AUSENTE conta como mismatch com `actual: 'AUSENTE'` — o kit não
 * pode correr sem o módulo, e «não encontrei» não é «bate».
 */
export function verifyPins({ fs = nodeFs, repoRoot = REPO_ROOT, pinsPath = PINS_PATH } = {}) {
  const pins = loadPins({ fs, pinsPath });
  const checked = [];
  const mismatches = [];
  for (const [rel, expected] of Object.entries(pins.files)) {
    const abs = path.join(repoRoot, rel);
    let actual;
    try { actual = sha256(fs.readFileSync(abs)); } catch { actual = 'AUSENTE'; }
    const row = { path: rel, expected: String(expected).toLowerCase(), actual };
    checked.push(row);
    if (row.actual !== row.expected) mismatches.push(row);
  }
  return { ok: mismatches.length === 0, pinned_at_sha: pins.pinned_at_sha || null, checked, mismatches };
}

/** Recusa com PinsError('pins_mismatch') se algum pin não bater. Devolve o relatório se bater. */
export function assertPins(opts = {}) {
  const r = verifyPins(opts);
  if (!r.ok) {
    const lista = r.mismatches.map((m) => `${m.path}: esperado ${m.expected.slice(0, 12)}… medido ${m.actual === 'AUSENTE' ? 'AUSENTE' : m.actual.slice(0, 12) + '…'}`).join('; ');
    throw new PinsError('pins_mismatch', `módulo do motor mudou por baixo do kit — ${lista}`, r);
  }
  return r;
}
