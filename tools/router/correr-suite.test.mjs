/**
 * correr-suite.test.mjs — o subset nao pode calar um invariante.
 *
 * Um subset de testes e uma promessa perigosa: promete cobertura em troca de
 * tempo, e a forma de o estragar e deixar cair, sem ninguem reparar, o ficheiro
 * que guardava a coisa que nunca se pode partir. Aqui isso e literal — o
 * `classify.js` e CONGELADO e tem o sha em CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { QUICK, FORA_DO_QUICK, ficheirosDaSuite, sumarioDoTap, correr } =
  await import('./correr-suite.mjs');

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');

test('o quick guarda os invariantes que nunca se podem partir em silencio', () => {
  for (const obrigatorio of [
    'classify.test.js',            // o classificador CONGELADO
    'user-override-guard.test.js', // e a guarda que impede o utilizador de o contornar
    'privacy.test.js', 'sanitize.test.js',
    'ollama-host.test.js',         // o motor $0 falhava MUDO sem isto (#454/#458)
    'ledger-prov.test.js',         // proveniencia
    'paridade-instaladores.test.js',
  ]) {
    assert.ok(QUICK.has(obrigatorio), `o quick deixou cair ${obrigatorio}`);
  }
});

test('todo ficheiro do quick existe MESMO na suite — um nome errado cala-se', () => {
  const suite = new Set(ficheirosDaSuite());
  for (const f of QUICK) {
    assert.ok(suite.has(f), `\`${f}\` esta no quick e nao esta no \`npm test\` do router`);
  }
});

test('e todo ficheiro do quick existe em disco', () => {
  for (const f of QUICK) {
    assert.ok(fs.existsSync(path.join(AQUI, f)), `\`${f}\` nao existe`);
  }
});

test('o quick e um SUBSET proprio — se fosse tudo, nao servia de nada', () => {
  const todos = ficheirosDaSuite().filter((f) => !f.startsWith('--'));
  assert.ok(QUICK.size < todos.length);
  assert.ok(QUICK.size >= 25, 'um subset demasiado pequeno deixa de ser um portao');
});

test('o ficheiro que PENDURA esta declarado como excluido, com a medicao', () => {
  const nota = FORA_DO_QUICK['tools/verify/render_medir.test.js'];
  assert.ok(nota, 'a exclusao que mais importa nao esta declarada');
  assert.match(nota, /3 em 5/, 'a exclusao tem de citar a medicao, nao uma opiniao');
  assert.ok(!QUICK.has('../verify/render_medir.test.js'));
});

test('o sumario le o TAP, e o que nao vier fica `null` — nunca zero', () => {
  const s = sumarioDoTap('# tests 10\n# pass 9\n# fail 1\n');
  assert.deepEqual(s, { testes: 10, ok: 9, falhas: 1, saltados: null, duracao_ms: null });
  assert.equal(sumarioDoTap('').ok, null, '0 ok e 0 testes nao e o mesmo que nao ter lido nada');
});

test('a corrida tem TECTO — um processo pendurado nao pode ficar a apodrecer', async () => {
  const r = await correr(['-e', 'setTimeout(()=>{},1e9)'], {
    prefixo: [], saida: path.join(process.env.TMPDIR || '/tmp', 'suite-teste.tap'), tectoMs: 1500,
  });
  assert.equal(r.sinal, 'SIGKILL');
  assert.ok(r.ms < 6000);
});

test('a suite escreve para FICHEIRO — o TAP fica auditavel depois da corrida', async () => {
  const saida = path.join(process.env.TMPDIR || '/tmp', 'suite-teste2.tap');
  const r = await correr(['-e', 'process.stdout.write("# tests 1\\n# pass 1\\n")'], { prefixo: [], saida, tectoMs: 8000 });
  assert.equal(r.tap, saida);
  assert.equal(r.ok, 1);
  assert.match(fs.readFileSync(saida, 'utf8'), /# pass 1/);
});

test('o doc existe e diz a verdade nova, nao a antiga', () => {
  const d = fs.readFileSync(path.join(REPO, 'docs', 'SUITE-DO-ROUTER.md'), 'utf8');
  assert.match(d, /nao demora 40 minutos/i);
  assert.match(d, /render_medir\.test\.js/);
  assert.match(d, /o que a CI mocka/i, 'o kickoff pedia isto por escrito');
  assert.match(d, /PROVAVEL/, 'a causa nao foi provada — o doc tem de o dizer');
});

test('o agendamento nocturno e um MOLDE e nao esta num portao', () => {
  const p = fs.readFileSync(path.join(REPO, 'tools', 'ops', 'moo', 'launchd', 'ai.mooter.router-suite.plist'), 'utf8');
  assert.match(p, /__NODE__/);
  assert.match(p, /<key>Hour<\/key><integer>4<\/integer>/);
  assert.doesNotMatch(p, /<key>RunAtLoad<\/key>\s*<true\/>/, 'um reboot nao e uma noite');
});
