/**
 * landing-coerencia.test.mjs
 *
 * O que se tranca aqui e sobretudo o que NAO se fez: as duas decisoes de recusa
 * que impedem esta verificacao de virar o P4 outra vez.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { pctContraFraccao, verificar, ficheirosTsx } from './landing-coerencia.mjs';

test('apanha a percentagem que nao bate com a fraccao que a sustenta', () => {
  const mau = "const X = [\n  ['cache-hit', '31%', V.text, 'measured 126/999'],\n];";
  const a = pctContraFraccao(mau);
  assert.equal(a.length, 1);
  assert.equal(a[0].linha, 2);
  assert.match(a[0].porque, /diz 31% mas 126\/999 da 12\.6%/);
});

test('cala-se quando bate — e a tolerancia cobre o arredondamento', () => {
  // 126/408 = 30,88%, publicado como 31%. Arredondar nao e mentir.
  assert.equal(pctContraFraccao("['cache-hit', '31%', V.text, 'measured 126/408']").length, 0);
  assert.equal(pctContraFraccao("['x', '50%', 'measured 200/400']").length, 0);
});

test('SO na mesma linha — um % de uma linha nao emparelha com uma fraccao de outra', () => {
  // A primeira versao usava uma janela de duas linhas e produziu
  // "diz 31% mas 11/11 da 100%" a partir de um heading e de uma tabela sem
  // relacao nenhuma. Duas linhas nao provam que os dois numeros falam do mesmo.
  const solto = "<h2>Mooter is the only 11/11.</h2>\n<p>cache-hit 31%</p>";
  assert.deepEqual(pctContraFraccao(solto), [], 'linhas diferentes nao se emparelham');
});

test('a fraccao precisa de dois digitos de cada lado — datas e versoes nao contam', () => {
  // `v1/2`, `1/3 do ecra`, `2026-08-22` nao sao recibos de percentagem.
  assert.equal(pctContraFraccao("'40% · v1/2'").length, 0);
  assert.equal(pctContraFraccao("'40% em 1/3 dos casos'").length, 0);
});

test('entrada vazia ou ilegivel nao rebenta', () => {
  for (const x of ['', null, undefined]) assert.deepEqual(pctContraFraccao(x), []);
  assert.deepEqual(verificar(''), []);
});

test('a varredura ignora node_modules e ficheiros de teste', () => {
  const falso = (dir) => {
    if (dir.endsWith('raiz')) {
      return [
        { name: 'node_modules', isDirectory: () => true },
        { name: 'Bom.tsx', isDirectory: () => false },
        { name: 'Mau.test.tsx', isDirectory: () => false },
        { name: '.next', isDirectory: () => true },
      ];
    }
    throw new Error(`nao devia descer a ${dir}`);
  };
  const out = ficheirosTsx('raiz', { readdirImpl: falso });
  assert.equal(out.length, 1);
  assert.match(out[0], /Bom\.tsx$/);
});

test('a verificacao de CONTAGEM ficou de fora, e o ficheiro diz porque', () => {
  // Guarda contra alguem a repor a ideia sem repetir a medicao: eram 2
  // ocorrencias em 74 ficheiros e uma delas era falso positivo (um subconjunto
  // legitimo). 50% de falsos e o numero que desligou cinco pilares hoje.
  assert.equal(typeof verificar, 'function');
  const comContagem = "const ROWS = [\n  { a: 1 },\n];\n<h2>Eleven capabilities.</h2>";
  assert.deepEqual(verificar(comContagem), [],
    'se isto passar a acusar, alguem repos a contagem — mede a taxa de falsos ANTES');
});
