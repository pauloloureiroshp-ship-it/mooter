'use strict';
/**
 * publish-mcpb.test.js — F0 item 1: o .mcpb tem de sair do laptop de quem o
 * empacotou. Sem workflow, `pack-mcpb.mjs` produz um ficheiro que só existe
 * em `_handoff/` (gitignored) — ninguém no site consegue apontar para ele.
 *
 * Zero parser de YAML aqui de propósito (zero deps no pacote): os testes
 * abaixo leem o ficheiro como texto, no mesmo estilo que update.test.js já usa
 * para U9/U12/U14/U15/U16.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', '..', '.github', 'workflows', 'publish-mcpb.yml');

test('P1 — o workflow existe e dispara em release published', () => {
  assert.ok(fs.existsSync(WORKFLOW), 'falta .github/workflows/publish-mcpb.yml');
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /release:\s*\n\s*types:\s*\[published\]/, 'não dispara quando uma release é publicada');
});

test('P2 — corre pack-mcpb.mjs a partir de packages/mooter-bridge', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /working-directory:\s*packages\/mooter-bridge/);
  assert.match(src, /node pack-mcpb\.mjs/, 'não constrói o .mcpb — o gate de entrega nunca corre');
});

test('P3 — sobe o .mcpb como asset da release (gh release upload)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /gh release upload/, 'constrói o bundle mas não o anexa a lado nenhum');
  assert.match(src, /\*\.mcpb/, 'o upload não aponta para o ficheiro construído');
});

test('P4 — ignora tags que não são deste pacote (cli-v*, cockpit-v*)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/,
    'sem filtro de tag, uma release do @mooter/cli ou do cockpit também dispara este workflow');
});

test('P5 — permissions inclui contents:write (gh release upload precisa)', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /permissions:\s*\n\s*contents:\s*write/);
});
