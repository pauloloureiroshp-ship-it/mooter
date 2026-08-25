/**
 * portao-de-existencia.test.mjs
 *
 * O portao existe para impedir que se escreva um pilar cuja classe de defeito
 * nao existe neste repo. Cada teste aqui esta amarrado a um dos onze pilares que
 * ja foram desligados — nao a uma regra inventada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  censo, veredicto, ficheirosDaClasse, excluido, hashDaChave,
  LIMIARES, AMOSTRA_MAX,
} from './portao-de-existencia.mjs';

const ficheiroFalso = (mapa) => (p) => {
  const chave = String(p).replace(/\\/g, '/');
  for (const [k, v] of Object.entries(mapa)) if (chave.endsWith(k)) return v;
  throw new Error('ENOENT');
};

// ── os dois limiares, e porque sao dois ────────────────────────────────────

test('OS DOIS · so a precisao deixaria passar uma classe rara demais para sustentar um pilar', () => {
  // Medido: `|| 0` em codigo de dinheiro deu 2 reais em 39 candidatos. Se o
  // criterio fosse so a precisao e se baixasse a fasquia, isto passava — e daria
  // um pilar mudo, porque dois defeitos no repo inteiro nao enchem uma rotacao.
  const triados = [
    ...Array.from({ length: 2 }, () => ({ real: true })),
    ...Array.from({ length: 4 }, () => ({ real: false })),
  ];
  const v = veredicto({ triados });                     // 2 reais, 33% de precisao
  assert.equal(v.passa, false, 'a precisao passa (33% > 30%) mas o volume nao');
  assert.match(v.porque, /so 2 defeitos reais/);
  assert.match(v.porque, /faltam 8/);
});

test('OS DOIS · so o volume deixaria passar o P11, que produziu 87 e valia 1', () => {
  // O caso real: 87 achados, 1 talvez util. Passava por volume a qualquer
  // fasquia de contagem. A precisao e o que o apanha.
  const triados = [
    ...Array.from({ length: 12 }, () => ({ real: true })),
    ...Array.from({ length: 88 }, () => ({ real: false })),
  ];
  const v = veredicto({ triados });                     // 12 reais, 12% de precisao
  assert.equal(v.passa, false, 'o volume passa (12 >= 10) mas a precisao nao');
  assert.match(v.porque, /precisao 12\.0%/);
});

test('uma classe que cumpre os DOIS passa, e o veredicto di-lo com os numeros', () => {
  const triados = [
    ...Array.from({ length: 10 }, () => ({ real: true })),
    ...Array.from({ length: 20 }, () => ({ real: false })),
  ];
  const v = veredicto({ triados, total: 120 });         // 10 reais, 33,3%
  assert.equal(v.passa, true);
  assert.match(v.porque, /10 reais/);
  assert.match(v.porque, /amostra de 30 em 120/, 'a amostra nunca se apresenta como o universo');
});

test('os limiares sao PRE-REGISTADOS — muda-los depois de ver os numeros e batota', () => {
  assert.equal(LIMIARES.REAIS_MINIMO, 10);
  assert.equal(LIMIARES.PRECISAO_MINIMA, 0.30);
  assert.equal(Object.isFrozen(LIMIARES), true, 'ninguem os ajusta a meio de uma corrida');
});

// ── "nao decidi" nunca e "nao e defeito" ───────────────────────────────────

test('um candidato por triar bloqueia o veredicto em vez de contar como falso', () => {
  // Se `real: null` contasse como `false`, o portao aprovava-se pelo cansaco de
  // quem tria: bastava parar a meio para a precisao subir ou descer sozinha.
  const v = veredicto({ triados: [{ real: true }, { real: null }, {}] });
  assert.equal(v.passa, false);
  assert.equal(v.estado, 'incompleto');
  assert.equal(v.porTriar, 2);
});

test('sem triagem nenhuma o portao nao se aprova a si proprio', () => {
  const v = veredicto({ triados: [] });
  assert.equal(v.passa, false);
  assert.equal(v.estado, 'sem-triagem');
});

// ── o censo ────────────────────────────────────────────────────────────────

test('o censo NAO conta testes — um teste esta cheio de codigo errado de proposito', () => {
  // A forma mais facil de este portao mentir a favor da classe seria contar os
  // fixtures dos testes. O `DIFF_PATHSPEC` ja exclui `*.test.*` do loop; aqui
  // vale a mesma regra, e pela mesma razao.
  assert.equal(excluido('tools/cockpit/runner/algo.test.mjs'), true);
  assert.equal(excluido('_handoff/MP_QUALQUER.md'), true);
  assert.equal(excluido('docs/archive/2026-01/x.md'), true);
  assert.equal(excluido('node_modules/pacote/index.js'), true);
  assert.equal(excluido('tools/router/classify.js'), false);
});

test('um glob que nao encontra nada e AVISO, nunca "zero candidatos" em silencio', () => {
  // Um portao que aprova uma classe por nao ter conseguido procurar e pior do
  // que nao ter portao: da a mesma confianca sem a mesma prova.
  const r = ficheirosDaClasse('/r', ['nao/existe/*.js'], { expandirImpl: () => [] });
  assert.equal(r.ficheiros.length, 0);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].erro, /nenhum ficheiro/);
});

test('um glob que REBENTA tambem se declara, e nao vira zero', () => {
  const r = ficheirosDaClasse('/r', ['x/*.js'], {
    expandirImpl: () => { throw new Error('disco em chamas'); },
  });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].erro, /disco em chamas/);
});

test('um ficheiro ilegivel e contado e declarado — nao e um ficheiro sem defeitos', () => {
  const r = censo({
    repoRoot: '/r',
    files: ['a/*.js'],
    detectar: () => [{ linha: 1, porque: 'x' }],
    expandirImpl: () => ['a/bom.js', 'a/mau.js'],
    readImpl: ficheiroFalso({ 'a/bom.js': 'const x = 1;\n' }),
  });
  assert.equal(r.total, 1, 'so o ficheiro que se leu produz candidatos');
  assert.deepEqual(r.ilegiveis, ['a/mau.js']);
});

test('um detector que rebenta num ficheiro nao derruba o censo — declara-se', () => {
  const r = censo({
    repoRoot: '/r',
    files: ['a/*.js'],
    detectar: (linhas, f) => { if (f === 'a/dois.js') throw new Error('regex ma'); return [{ linha: 1 }]; },
    expandirImpl: () => ['a/um.js', 'a/dois.js'],
    readImpl: () => 'const x = 1;\n',
  });
  assert.equal(r.total, 1);
  assert.equal(r.ilegiveis.length, 1);
  assert.match(r.ilegiveis[0], /o detector rebentou/);
});

test('uma linha fora do ficheiro nao vira candidato — o portao nao cita o que nao ve', () => {
  const r = censo({
    repoRoot: '/r',
    files: ['a/*.js'],
    detectar: () => [{ linha: 999 }, { linha: 0 }, { linha: 2 }],
    expandirImpl: () => ['a/um.js'],
    readImpl: () => 'linha1\nlinha2\nlinha3\n',
  });
  assert.equal(r.total, 1);
  assert.equal(r.amostra[0].linha, 2);
  assert.equal(r.amostra[0].texto, 'linha2', 'o texto vem do ficheiro, nao do detector');
});

test('a amostra e DETERMINISTICA e espalhada — triar hoje continua a valer amanha', () => {
  // Os primeiros 40 por ordem de varredura seriam todos do mesmo canto do repo,
  // e a precisao medida seria a precisao daquele canto.
  const muitos = Array.from({ length: 100 }, (_, k) => `a/f${k}.js`);
  const correr = () => censo({
    repoRoot: '/r',
    files: ['a/*.js'],
    detectar: () => [{ linha: 1 }],
    expandirImpl: () => muitos,
    readImpl: () => 'const x = 1;\n',
  });
  const a = correr();
  const b = correr();
  assert.equal(a.total, 100);
  assert.equal(a.amostra.length, AMOSTRA_MAX);
  assert.equal(a.truncado, 60, 'o que fica de fora e declarado, nao escondido');
  assert.deepEqual(a.amostra.map((c) => c.ficheiro), b.amostra.map((c) => c.ficheiro), 'mesma amostra entre corridas');
  const ordemDeVarredura = muitos.slice(0, AMOSTRA_MAX);
  assert.notDeepEqual(a.amostra.map((c) => c.ficheiro), ordemDeVarredura, 'nao pode ser so os primeiros');
});

test('hashDaChave e estavel e sem sinal — um indice negativo partiria a ordem', () => {
  assert.equal(hashDaChave('a.js:1'), hashDaChave('a.js:1'));
  assert.notEqual(hashDaChave('a.js:1'), hashDaChave('a.js:2'));
  for (const k of ['', 'x', 'a/b/c.mjs:1234']) assert.ok(hashDaChave(k) >= 0);
});

test('uma classe com menos candidatos do que o minimo reprova SEM leitura nenhuma', () => {
  // O caso barato: se o universo inteiro tem 3 candidatos, nao ha triagem que
  // produza 10 reais. Reprovar aqui poupa a leitura toda.
  const r = censo({
    repoRoot: '/r',
    files: ['a/*.js'],
    detectar: (linhas, f) => (f === 'a/um.js' ? [{ linha: 1 }] : []),
    expandirImpl: () => ['a/um.js', 'a/dois.js'],
    readImpl: () => 'const x = 1;\n',
  });
  assert.ok(r.total < LIMIARES.REAIS_MINIMO, 'e o CLI diz "REPROVA JA, sem ler nada"');
});
