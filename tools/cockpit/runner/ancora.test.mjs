/**
 * ancora.test.mjs
 *
 * O modo ANCORADO correu ZERO vezes em 10 624 recibos — não por estar partido,
 * por nunca ter tido entrada. Estes testes trancam as duas coisas que fizeram
 * isso durar: a ausência ser silenciosa, e uma regra entrar sem medição.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  gerar, escrever, lerManifesto, regrasActivas, limparLinha,
  REGRAS, GLOBS_OMISSAO,
} from './ancora.mjs';
import { verAncora } from './self-check.mjs';
import { readAnchor } from './context-pack.mjs';

const ler = (mapa) => (p) => {
  const k = String(p).replace(/\\/g, '/');
  for (const [nome, v] of Object.entries(mapa)) if (k.endsWith(nome)) return v;
  throw new Error('ENOENT');
};

// ── o catálogo nasce a zero, e isso é medição, não esqueleto ───────────────

test('nenhuma regra está activa — e cada entrada diz o número que a desligou', () => {
  // Sete regras candidatas sondadas em 288 ficheiros a 2026-08-25. Nenhuma
  // passou o portão de existência (>= 10 reais E >= 30% de precisão). Um
  // catálogo a zero aqui é o mesmo estado honesto que a rotação de pilares.
  assert.deepEqual(regrasActivas(), [], 'se isto deixar de ser vazio, foi por decisão e este teste muda com ela');
  assert.ok(Object.keys(REGRAS).length >= 6, 'as candidatas ficam no catálogo, como os pilares desligados');
  for (const [id, r] of Object.entries(REGRAS)) {
    assert.equal(r.activo, false, `${id} está activa sem ter passado o portão`);
    assert.ok(r.porque && r.porque.length > 10, `${id} está desligada sem dizer com que número`);
    assert.equal(typeof r.detectar, 'function', `${id} tem de continuar executável para se poder re-medir`);
  }
});

test('uma regra ligada tem de trazer o número, não só a vontade', () => {
  // A regra que impede a repetição do P11: entrar exige medição escrita.
  for (const id of regrasActivas()) {
    assert.match(REGRAS[id].porque, /\d/, `${id} está activa e o seu "porque" não tem número nenhum`);
  }
});

// ── o manifesto: um zero afirmado ≠ um ficheiro que não existe ─────────────

test('sem regras activas NÃO se lê ficheiro nenhum — varrer para nada é trabalho a fingir', () => {
  let leituras = 0;
  const r = gerar({
    repoRoot: '/r',
    regras: { x: { activo: false, porque: '0 candidatos', detectar: () => true } },
    globs: ['a/*.js'],
    expandirImpl: () => ['a/um.js', 'a/dois.js'],
    readImpl: () => { leituras += 1; return 'const x = 1;\n'; },
  });
  assert.equal(leituras, 0);
  assert.equal(r.apontamentos.length, 0);
  assert.equal(r.manifesto.ficheiros_varridos, 0, 'não varreu');
  assert.equal(r.manifesto.ficheiros_no_ambito, 2, 'mas diz quantos estavam no âmbito — senão parecia que não havia nada');
});

test('o manifesto distingue "vazia por decisão" de "vazia por acaso"', () => {
  const semRegras = gerar({
    repoRoot: '/r', regras: {}, globs: ['a/*.js'],
    expandirImpl: () => ['a/um.js'], readImpl: () => 'const x = 1;\n',
  });
  assert.match(semRegras.manifesto.porque, /zero regras activas/);

  const comRegra = gerar({
    repoRoot: '/r',
    regras: { r1: { activo: true, porque: '12 reais em 30', detectar: (l) => l.includes('BUG') } },
    globs: ['a/*.js'],
    expandirImpl: () => ['a/um.js'], readImpl: () => 'const x = 1;\n',
  });
  assert.match(comRegra.manifesto.porque, /1 regra/);
  assert.equal(comRegra.manifesto.apontamentos, 0, 'zero apontamentos COM uma regra a correr é outra coisa');
  assert.equal(comRegra.manifesto.ficheiros_varridos, 1, 'e desta vez varreu mesmo');
});

test('os apontamentos saem no formato que o readAnchor consome — sem tradução pelo meio', () => {
  // O contrato é `{file, line, rule}`. Se divergir, o produtor escreve para o
  // vazio e ninguém dá por isso: o `readAnchor` filtra silenciosamente o que
  // não reconhece, que é exactamente a forma de falha que este ficheiro corrige.
  const { apontamentos } = gerar({
    repoRoot: '/r',
    regras: { minha: { activo: true, porque: '11 reais em 30', detectar: (l) => l.includes('BUG') } },
    globs: ['a/*.js'],
    expandirImpl: () => ['a/um.js'],
    readImpl: () => 'ok\nBUG aqui\nok\n',
  });
  assert.deepEqual(apontamentos, [{ file: 'a/um.js', line: 2, rule: 'minha' }]);

  let escrito = null;
  escrever({
    dir: '/m', apontamentos, manifesto: {},
    writeImpl: (p, t) => { if (String(p).endsWith('ancora-achados.json')) escrito = t; },
    mkdirImpl: () => {},
  });
  const relido = readAnchor('/qualquer', { readImpl: () => escrito });
  assert.equal(relido.length, 1, 'o que o produtor escreve tem de sobreviver ao leitor real');
  assert.equal(relido[0].file, 'a/um.js');
  assert.equal(relido[0].line, 2);
});

test('o ficheiro de achados é um ARRAY — um objecto fá-lo-ia ler como vazio', () => {
  // `readAnchor` faz `if (!Array.isArray(parsed)) return []`. Escrever o
  // manifesto DENTRO deste ficheiro teria desligado a âncora em silêncio.
  let achados = null;
  escrever({
    dir: '/m', apontamentos: [{ file: 'a.js', line: 1, rule: 'r' }], manifesto: { apontamentos: 1 },
    writeImpl: (p, t) => { if (String(p).endsWith('ancora-achados.json')) achados = t; },
    mkdirImpl: () => {},
  });
  assert.equal(Array.isArray(JSON.parse(achados)), true);
});

test('um ficheiro ilegível é contado, não tratado como ficheiro sem apontamentos', () => {
  const r = gerar({
    repoRoot: '/r',
    regras: { r1: { activo: true, porque: '10 reais', detectar: () => true } },
    globs: ['a/*.js'],
    expandirImpl: () => ['a/bom.js', 'a/mau.js'],
    readImpl: ler({ 'a/bom.js': 'x\n' }),
  });
  assert.deepEqual(r.manifesto.ilegiveis, ['a/mau.js']);
});

test('um detector que rebenta não derruba a geração', () => {
  const r = gerar({
    repoRoot: '/r',
    regras: {
      boa: { activo: true, porque: '10 reais', detectar: (l) => l.includes('x') },
      ma: { activo: true, porque: '10 reais', detectar: () => { throw new Error('regex má'); } },
    },
    globs: ['a/*.js'],
    expandirImpl: () => ['a/um.js'],
    readImpl: () => 'x\n',
  });
  assert.equal(r.manifesto.apontamentos, 1);
  assert.equal(r.manifesto.por_regra.ma, 0);
});

test('um glob sem ficheiros é declarado, nunca "zero apontamentos" em silêncio', () => {
  const r = gerar({
    repoRoot: '/r', regras: {}, globs: ['nao/existe/*.js'],
    expandirImpl: () => [], readImpl: () => '',
  });
  assert.deepEqual(r.manifesto.globs_vazios, ['nao/existe/*.js']);
});

test('limparLinha tira comentários mas não parte um URL', () => {
  assert.equal(limparLinha('const a = 1; // nota').trim(), 'const a = 1;');
  assert.match(limparLinha("const u = 'https://x.dev/a';"), /https:\/\/x\.dev/);
});

test('os globs por omissão apontam para código, não para markdown', () => {
  assert.ok(GLOBS_OMISSAO.every((g) => /\*\.(js|mjs|cjs|ts)$/.test(g)), `âmbito com não-código: ${GLOBS_OMISSAO}`);
});

// ── o self-check: nunca-gerada é alerta, vazia-por-decisão não é ───────────

test('NUNCA GERADA é aviso — é a confusão que custou o modo ancorado inteiro', () => {
  const r = verAncora('/m', { readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.estado, 'aviso');
  assert.match(r.valor, /nunca gerada/);
  assert.match(r.resolver, /ancora\.mjs/, 'um alerta sem o gesto exacto é uma queixa');
});

test('VAZIA POR DECISÃO não é aviso — um alerta de rotina ensina a ignorar a secção', () => {
  const r = verAncora('/m', {
    readImpl: () => JSON.stringify({ apontamentos: 0, regras_activas: [] }),
  });
  assert.equal(r.estado, 'ok');
  assert.match(r.porque, /POR DECIS/i);
  assert.equal(r.resolver, null);
});

test('um manifesto sem contagem legível é n/d — nunca se inventa o número', () => {
  const r = verAncora('/m', { readImpl: () => JSON.stringify({ regras_activas: [] }) });
  assert.equal(r.estado, 'n/d');
});

test('lerManifesto rejeita um array — só um objecto é um manifesto', () => {
  assert.equal(lerManifesto('/m', { readImpl: () => '[]' }), null);
  assert.equal(lerManifesto('/m', { readImpl: () => 'nao e json' }), null);
  assert.ok(lerManifesto('/m', { readImpl: () => '{"apontamentos":0}' }));
});
