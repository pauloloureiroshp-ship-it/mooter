/**
 * deriva-de-codigo.test.mjs — o processo esta a correr o codigo que esta em disco?
 *
 * TRES VEZES EM TRES DIAS o `main` recebeu uma correccao e o loop continuou com
 * o codigo velho. O `SYNC.md:468` ja documentava a segunda ocorrencia —
 * documentar nao corrigiu, porque o defeito nao era esquecimento: era nao haver
 * nada que o tornasse VISIVEL.
 *
 * O caso que mais importa aqui nao e detectar a deriva. E o caso `null`: quando
 * a comparacao nao se consegue fazer, a resposta tem de ser "nao sei" e nunca
 * "esta tudo bem". Um instrumento que so sabe dizer sim e nao mente numa das
 * direccoes, e este repo ja pagou essa licao duas vezes (o beacon a jurar motor
 * vivo durante 11 horas, e o meu proprio verBeacon a trocar um falso OK por um
 * falso alarme).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { verDeriva, buildAlignment } from './alignment.mjs';

test('shas iguais -> nao ha deriva', () => {
  const d = verDeriva('abc123def456', 'abc123def456');
  assert.equal(d.desactualizado, false);
  assert.equal(d.sha_carregado, 'abc123def456');
});

test('shas diferentes -> ha deriva, e os DOIS shas viajam', () => {
  // Os dois, porque "esta desactualizado" sem dizer de que para que obriga a
  // pessoa a ir procurar — e quem esta a olhar para um painel a dizer que algo
  // esta mal quer saber quanto, nao so que sim.
  const d = verDeriva('aaaa1111', 'bbbb2222');
  assert.equal(d.desactualizado, true);
  assert.equal(d.sha_carregado, 'aaaa1111');
  assert.equal(d.sha_disco, 'bbbb2222');
});

test('sem sha de arranque -> `null`, NUNCA `false`', () => {
  // Este e o teste que importa. `false` diria "comparei e esta bem"; a verdade e
  // que nao houve comparacao nenhuma.
  for (const [a, b] of [[null, 'x'], ['x', null], [null, null], [undefined, 'x'], ['', 'x']]) {
    const d = verDeriva(a, b);
    assert.equal(d.desactualizado, null,
      `verDeriva(${JSON.stringify(a)}, ${JSON.stringify(b)}) devia ser null e foi ${d.desactualizado}`);
  }
});

test('buildAlignment publica o campo `codigo` mesmo sem lhe darem os shas', async () => {
  // Um campo AUSENTE obriga o painel a adivinhar. Presente com `null` nao.
  const a = await buildAlignment({ repoRoot: process.cwd(), gitImpl: async () => null });
  assert.ok(a.codigo, 'o campo `codigo` nao pode faltar do payload');
  assert.equal(a.codigo.desactualizado, null);
});

test('buildAlignment propaga a deriva quando lhe dao os dois shas', async () => {
  const a = await buildAlignment({
    repoRoot: process.cwd(),
    shaCarregado: 'velho000',
    shaEmDisco: 'novo1111',
    gitImpl: async () => null,
  });
  assert.equal(a.codigo.desactualizado, true);
  assert.equal(a.codigo.sha_carregado, 'velho000');
});
