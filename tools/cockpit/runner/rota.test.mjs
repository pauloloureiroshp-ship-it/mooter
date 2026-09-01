/**
 * rota.test.mjs — a tabela e descritiva, e cada entrada exercida prova-se.
 *
 * O teste que mais importa e o de `prova`: uma classe pode entrar aqui como
 * `exercida:true` sem apontar para o ficheiro que a impoe, e nesse instante a
 * tabela volta a ser prosa — que foi exactamente o defeito que a fez nascer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLASSES, classe, exercidas, rotaDoRecibo, rotaDaCorreccao } from './rota.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('cada classe EXERCIDA nomeia motor, custo e a prova de quem a impoe', () => {
  for (const c of exercidas()) {
    for (const campo of ['motor', 'custo', 'porque', 'prova']) {
      assert.ok(c[campo], `${c.id} exercida sem ${campo} — volta a ser prosa`);
    }
  }
});

/**
 * A prova nomeia um ficheiro que EXISTE.
 *
 * Sem isto, a tabela repetiria a falha que a criou: uma afirmacao verdadeira a
 * citar uma fonte que ninguem verificou. Aceita-se um caminho com sufixo em
 * prosa (`… → assertLocalEngine()`), por isso corta-se no primeiro espaco.
 */
test('a prova de cada classe exercida aponta para ficheiros que existem', () => {
  for (const c of exercidas()) {
    const caminhos = String(c.prova).split('·').map((s) => s.trim().split(/\s+/)[0]);
    for (const p of caminhos) {
      if (!/[/.]/.test(p)) continue; // um fragmento em prosa, nao um caminho
      assert.ok(fs.existsSync(path.join(REPO, p)), `${c.id} cita ${p}, que nao existe`);
    }
  }
});

test('uma classe NAO exercida nao finge ter motor — declara-se vazia e diz porque', () => {
  const naoUsadas = CLASSES.filter((c) => !c.exercida);
  assert.ok(naoUsadas.length, 'a tabela tem de ser honesta sobre o que nao corre');
  for (const c of naoUsadas) {
    assert.equal(c.motor, null, `${c.id} nao e exercida mas anuncia um motor`);
    assert.equal(c.prova, null);
    assert.ok(c.porque, `${c.id} tem de dizer porque nao e exercida`);
  }
});

test('`exercidas()` e o que viaja para a pagina — e nao leva as outras', () => {
  const ids = exercidas().map((c) => c.id);
  assert.deepEqual(ids, ['C0', 'C2', 'C4', 'C5']);
  assert.equal(ids.includes('C1'), false);
  assert.equal(ids.includes('C3'), false);
});

test('a tabela e imutavel — ninguem lhe muda uma classe em tempo de execucao', () => {
  assert.throws(() => { CLASSES.push({ id: 'C9' }); });
  assert.throws(() => { classe('C2').motor = 'gpt'; }, TypeError);
});

test('um recibo com modelo e C2 — e a prova disso e o assertLocalEngine', () => {
  const c = rotaDoRecibo({ modelo: 'qwen2.5-coder:14b', verdict: 'citacao-ok' });
  assert.equal(c.id, 'C2');
  assert.match(c.prova, /assertLocalEngine/);
  assert.equal(c.custo, '$0');
});

test('um evento do disjuntor e C0 — nao passou por motor nenhum', () => {
  assert.equal(rotaDoRecibo({ evento: 'engine:down' }).id, 'C0');
});

test('um recibo que nao chega para decidir da null, nao um C2 por simpatia', () => {
  assert.equal(rotaDoRecibo({ ts: '2026-08-01T00:00:00Z', pilar: 'P2' }), null);
  assert.equal(rotaDoRecibo(null), null);
});

test('aceitar um achado manda-o para quem tem custodia do git', () => {
  const c = rotaDaCorreccao();
  assert.equal(c.id, 'C4');
  assert.match(c.motor, /Claude Code/);
  assert.match(c.porque, /irreversible belongs to the owner/);
});

test('classe() devolve null para um id que nao existe — nunca meio objecto', () => {
  for (const mau of ['C9', '', null, undefined, 'c2']) assert.equal(classe(mau), null);
});
