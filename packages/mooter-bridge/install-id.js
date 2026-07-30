'use strict';

/**
 * install-id.js — UUID persistente por device, para contagem de instalações únicas.
 *
 * Não rastreia comportamento, prompts, ni conteúdo — apenas a presença do conector.
 * Guardado em ~/.mooter/install-id.json, fora do repo e do bundle.
 * Se o utilizador apagar o ficheiro, um novo ID é gerado na próxima sessão.
 */

const { randomUUID } = require('crypto');
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const MOOTER_DIR   = join(os.homedir(), '.mooter');
const INSTALL_FILE = join(MOOTER_DIR, 'install-id.json');

let _cached = null;

/**
 * Devolve o install-id desta instalação.
 * Gera e persiste um UUID na primeira chamada.
 * Se não conseguir escrever (permissões), devolve um UUID efémero (não persiste).
 */
function getInstallId() {
  if (_cached) return _cached;

  // tentar ler install-id existente
  try {
    if (existsSync(INSTALL_FILE)) {
      const data = JSON.parse(readFileSync(INSTALL_FILE, 'utf8'));
      if (data && typeof data.id === 'string' && data.id.length > 8) {
        _cached = data.id;
        return _cached;
      }
    }
  } catch {
    // ficheiro corrompido ou ilegível — regenerar
  }

  // gerar novo
  const id = randomUUID();
  const firstSeen = new Date().toISOString();

  try {
    mkdirSync(MOOTER_DIR, { recursive: true });
    writeFileSync(
      INSTALL_FILE,
      JSON.stringify({ id, first_seen: firstSeen, version: require('./manifest.json').version }, null, 2),
      'utf8'
    );
  } catch {
    // sem permissão de escrita — UUID efémero para esta sessão
  }

  _cached = id;
  return _cached;
}

/**
 * Devolve {id, first_seen, version} — para logs de arranque e telemetria.
 */
function installIdInfo() {
  const id = getInstallId();
  let firstSeen = null;
  let version = null;
  try {
    const data = JSON.parse(readFileSync(INSTALL_FILE, 'utf8'));
    firstSeen = data.first_seen || null;
    version   = data.version   || null;
  } catch { /* sem acesso */ }
  return { id, first_seen: firstSeen, version };
}

module.exports = { getInstallId, installIdInfo };
