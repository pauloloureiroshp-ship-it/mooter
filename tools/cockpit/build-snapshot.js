#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(REPO, 'plugin', 'mooter', 'skills', 'cockpit', 'cockpit.html');
const OUTPUT = path.join(REPO, 'dist', 'cockpit-snapshot.html');
const VIEWS = ['jobs', 'board', 'recibo', 'pastas'];
const SNAPSHOT_BEGIN = '<!-- MOOTER_SNAPSHOT:BEGIN -->';
const SNAPSHOT_END = '<!-- MOOTER_SNAPSHOT:END -->';

function literalError(error) {
  return String((error && error.message) || error || 'erro sem mensagem');
}

function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\u0021--');
}

function stripSnapshotBlocks(html) {
  let clean = String(html);
  while (clean.includes(SNAPSHOT_BEGIN)) {
    const start = clean.indexOf(SNAPSHOT_BEGIN);
    const end = clean.indexOf(SNAPSHOT_END, start);
    if (end < 0) throw new Error('bloco de snapshot abre mas não fecha');
    clean = clean.slice(0, start) + clean.slice(end + SNAPSHOT_END.length);
  }
  return clean;
}

function injectSnapshot(html, snapshot) {
  const clean = stripSnapshotBlocks(html);
  const scriptAt = clean.search(/<script(?:\s|>)/i);
  if (scriptAt < 0) throw new Error('cockpit.html não tem script principal');
  const block = SNAPSHOT_BEGIN + '\n'
    + '<script>window.__MOOTER_SNAPSHOT__ = ' + scriptSafeJson(snapshot) + ';</script>\n'
    + SNAPSHOT_END + '\n';
  return clean.slice(0, scriptAt) + block + clean.slice(scriptAt);
}

function defaultReaders() {
  const fleet = require(path.join(REPO, 'packages', 'mooter-bridge', 'fleet.js'));
  const seamless = require(path.join(REPO, 'packages', 'mooter-bridge', 'seamless.js'));
  const tools6 = require(path.join(REPO, 'packages', 'mooter-bridge', 'tools6.js'));
  const base = require(path.join(REPO, 'packages', 'mooter-bridge', 'server.js'));
  const board = require(path.join(REPO, 'packages', 'mooter-bridge', 'board.js'));
  const tools = tools6.build(seamless, fleet, base);
  const fleetTool = tools.find((tool) => tool.name === 'mooter_fleet');
  const setupTool = tools.find((tool) => tool.name === 'mooter_setup');
  if (!fleetTool || !setupTool) throw new Error('mooter_fleet/mooter_setup não estão registadas');
  return {
    // A vista board calcula a fotografia mas não a volta a persistir: o gerador
    // é leitor. O handler normal persiste scorecard.json para o cockpit vivo.
    readView: (view) => view === 'board'
      ? fleet.toolFleet({ view }, { boardScorecard:() => board.scorecardAsync({ persist:false }) })
      : fleetTool.handler({ view }),
    readSetup: () => setupTool.handler({}),
  };
}

async function generateSnapshot(options = {}) {
  const sourcePath = options.sourcePath || SOURCE;
  const outputPath = options.outputPath || OUTPUT;
  const now = options.now instanceof Date
    ? options.now
    : (typeof options.now === 'function' ? options.now() : new Date());
  const iso = now.toISOString();
  const readers = options.readView && options.readSetup ? options : defaultReaders();
  const snapshot = { __tirado_em: iso };
  let successes = 0;

  for (const view of VIEWS) {
    try {
      snapshot[view] = await readers.readView(view);
      successes++;
    } catch (error) {
      snapshot[view] = { erro: literalError(error) };
    }
  }
  try {
    snapshot.setup = await readers.readSetup();
  } catch (error) {
    snapshot.setup = { erro: literalError(error) };
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const rendered = injectSnapshot(source, snapshot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered, 'utf8');
  const bytes = Buffer.byteLength(rendered, 'utf8');
  const line = 'cockpit snapshot: ' + bytes + ' bytes · ' + iso + ' · '
    + successes + '/' + VIEWS.length + ' views read';
  (options.logger || console.log)(line);
  return { outputPath, bytes, instant: iso, successes, total: VIEWS.length, snapshot };
}

if (require.main === module) {
  generateSnapshot().catch((error) => {
    console.error('cockpit snapshot failed: ' + literalError(error));
    process.exitCode = 1;
  });
}

module.exports = {
  generateSnapshot,
  injectSnapshot,
  stripSnapshotBlocks,
  scriptSafeJson,
  SNAPSHOT_BEGIN,
  SNAPSHOT_END,
  SOURCE,
  OUTPUT,
};
