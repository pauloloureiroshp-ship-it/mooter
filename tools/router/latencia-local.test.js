/**
 * latencia-local.test.js — a escolha do modelo do pre-calculo.
 *
 * O que estes testes guardam nao e "qual o modelo bom" — e que a escolha SAIA
 * de medicao e nao de uma lista. A lista cravada e o defeito que este ficheiro
 * veio substituir, e seria trivial recria-la sem querer.
 *
 * O caso que mais importa e o do `qwen3:30b`: responde 200, DENTRO do prazo, e
 * devolve texto vazio. Se uma resposta vazia contasse como sucesso rapido, ele
 * ganhava sempre — e o pre-calculo continuava inutil, agora com uma medicao a
 * dizer que estava tudo bem.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resumir, escolher, p75, lerAmostras, registar, MINIMO_AMOSTRAS } = require('./latencia-local.js');

const amostra = (modelo, ms, ok) => ({ modelo, ms, ok });
const varias = (modelo, ms, ok, n) => Array.from({ length: n }, () => amostra(modelo, ms, ok));

test('uma resposta VAZIA conta como falha, nao como sucesso rapido', () => {
  // O caso do qwen3:30b. Se contasse como sucesso, ele ganhava por ser "rapido"
  // e o pre-calculo continuava a devolver nada.
  const r = resumir([...varias('vazio:30b', 500, false, 5), ...varias('bom:14b', 4000, true, 5)]);
  assert.equal(r.get('vazio:30b').sucesso, 0);
  const v = escolher({ resumo: r, catalogo: ['vazio:30b', 'bom:14b'], orcamentoMs: 8000 });
  assert.equal(v.modelo, 'bom:14b');
  assert.match(v.razao, /medido/);
});

test('sucesso vence velocidade — uma resposta errada custa mais que uma lenta', () => {
  const r = resumir([
    ...varias('rapido', 800, true, 3), ...varias('rapido', 800, false, 7),   // 30% ok
    ...varias('lento', 5000, true, 9), ...varias('lento', 5000, false, 1),   // 90% ok
  ]);
  const v = escolher({ resumo: r, catalogo: ['rapido', 'lento'], orcamentoMs: 8000 });
  assert.equal(v.modelo, 'lento', 'o de 30% de acerto nao pode ganhar por ser rapido');
});

test('quem nao cabe no orcamento nao entra, por muito bom que seja', () => {
  const r = resumir(varias('otimo-mas-lento', 9000, true, 10));
  const v = escolher({ recomendado: 'outro', resumo: r, catalogo: ['otimo-mas-lento'], orcamentoMs: 8000 });
  assert.notEqual(v.modelo, 'otimo-mas-lento');
});

test('o orcamento manda: subi-lo pode qualificar um modelo que nao cabia', () => {
  const r = resumir(varias('m', 6000, true, 10));
  assert.notEqual(escolher({ resumo: r, catalogo: ['m'], orcamentoMs: 6500 }).modelo, 'm');
  assert.equal(escolher({ resumo: r, catalogo: ['m'], orcamentoMs: 12000 }).modelo, 'm');
});

test('um modelo POR MEDIR tem a sua vez — senao nunca era experimentado', () => {
  // Sem isto o sistema ficava preso na primeira escolha que resultou, e um
  // modelo novo instalado pelo dono nunca chegava a ser tentado.
  const r = resumir(varias('reprovado', 500, false, 10));
  const v = escolher({ resumo: r, catalogo: ['reprovado', 'nunca-tentado'], orcamentoMs: 8000 });
  assert.equal(v.modelo, 'nunca-tentado');
  assert.match(v.razao, /por medir/);
});

test('entre os por medir, o recomendado pelo router tem prioridade', () => {
  // Ele sabe coisas que este ficheiro nao sabe (VRAM, especializacao). So nao
  // sabe latencia.
  const v = escolher({ recomendado: 'do-router', resumo: new Map(), catalogo: ['a', 'b', 'do-router'], orcamentoMs: 8000 });
  assert.equal(v.modelo, 'do-router');
});

test('poucas amostras nao chegam para condenar nem para absolver', () => {
  const poucas = resumir(varias('quase', 500, false, MINIMO_AMOSTRAS - 1));
  assert.equal(poucas.get('quase').medido, false);
  // Continua elegivel como "por medir".
  assert.equal(escolher({ resumo: poucas, catalogo: ['quase'], orcamentoMs: 8000 }).modelo, 'quase');
});

test('sem nada que sirva, devolve o recomendado — falha ABERTA', () => {
  // Manter o comportamento antigo e melhor do que nao pre-calcular de todo.
  // Aqui o PROPRIO recomendado ja esta reprovado por medicao: e o unico caso em
  // que nao ha mesmo alternativa nenhuma. (A primeira versao deste teste punha
  // o recomendado por medir e esperava `sem_alternativa` — estava errada: um
  // recomendado sem historico E uma alternativa legitima, e o codigo tinha
  // razao.)
  const r = resumir(varias('do-router', 500, false, 10));
  const v = escolher({ recomendado: 'do-router', resumo: r, catalogo: ['do-router'], orcamentoMs: 8000 });
  assert.equal(v.modelo, 'do-router');
  assert.match(v.razao, /sem_alternativa/);
});

test('a razao NUNCA vem vazia — uma escolha que nao se explica e um valor cravado', () => {
  for (const ctx of [
    {},
    { recomendado: 'x' },
    { resumo: resumir(varias('a', 100, true, 5)), catalogo: ['a'] },
  ]) {
    const v = escolher({ orcamentoMs: 8000, ...ctx });
    assert.ok(v.razao && v.razao.length > 3, `sem razao para ${JSON.stringify(ctx)}`);
  }
});

test('a latencia de uma FALHA nao entra no p75', () => {
  // Senao um modelo que falha por timeout parecia lento em vez de inutil, e a
  // correccao seguinte seria subir o orcamento em vez de o trocar.
  const r = resumir([amostra('m', 3000, true), amostra('m', 8000, false), amostra('m', 3200, true)]);
  assert.ok(r.get('m').p75Ms <= 3200, 'o timeout de 8000 nao pode contar');
});

test('p75 e entradas absurdas', () => {
  assert.equal(p75([]), null);
  assert.equal(p75([5]), 5);
  assert.equal(p75([1, 2, 3, 4]), 4);
  assert.doesNotThrow(() => resumir(null));
  assert.doesNotThrow(() => resumir([null, {}, { modelo: 'x' }]));
});

test('ler e registar: append-only, e nunca rebenta sem ficheiro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-'));
  const f = path.join(dir, 'l.jsonl');
  assert.deepEqual(lerAmostras(f), [], 'sem ficheiro devolve vazio, nao rebenta');
  registar(f, { modelo: 'a', ms: 100, ok: true });
  registar(f, { modelo: 'b', ms: 200, ok: false });
  const lidas = lerAmostras(f);
  assert.equal(lidas.length, 2);
  assert.equal(lidas[0].modelo, 'a');
  // Uma linha corrompida a meio nao pode matar a leitura.
  fs.appendFileSync(f, 'isto nao e json\n');
  registar(f, { modelo: 'c', ms: 300, ok: true });
  assert.equal(lerAmostras(f).length, 3);
});
