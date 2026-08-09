import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  carregarCorpus, avaliar, selar, hashEsperado, lerLedger, escreverLedger,
  carregarPrefixo, guardarSaida, provHash,
  CLASSES_CANDIDATO, DOUTRINA_CONTEUDO_IMPORTADO, TETO_TOKENS_PREFIXO,
  NUCLEO_VERSAO, SCHEMA,
} from './nucleo.mjs';
import { verificar } from './verificar.mjs';
import { projectar } from './projectar.mjs';
import { CRITERIOS } from './prereg.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

function tmp(nome) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-')), nome);
}

const CORPUS_SHA = 'sha-de-fixture';
const AMBIENTE = {
  corpus_sha: CORPUS_SHA, nucleo_versao: NUCLEO_VERSAO, transporte: 'fixture',
  amostragem: { temperature: 0, num_predict: 256 }, sandbox: 'n/d', host: 'test',
};

/** Saida que um candidato daria para produzir aquele veredito. */
const SAIDA = { true: 'ok', false: 'nope', null: '' };

/** Corpus de fixture: toda tarefa aceita exactamente "ok". */
function corpusFixture(linhas) {
  const ids = new Map();
  for (const [, , , tarefa_id, categoria, tier] of linhas) {
    ids.set(tarefa_id, { id: tarefa_id, categoria, tier, dificuldade: 'D1', verificacao: { tipo: 'resposta-exata', esperado: 'ok' } });
  }
  return { corpus_sha: CORPUS_SHA, tarefas: [...ids.values()] };
}

/** [candidato_id, classe, host, tarefa_id, categoria, tier, sucesso] */
function cadeia(linhas) {
  const out = [];
  let prev = null;
  linhas.forEach(([candidato_id, classe_candidato, host_model, tarefa_id, categoria, tier, sucesso], i) => {
    const r = selar({
      seq: i, schema: SCHEMA, candidato_id, classe_candidato, host_model,
      skill_sha: classe_candidato === 'skill_prefixo' ? 'sha-skill' : null,
      tarefa_id, categoria, dificuldade: 'D1', tier, sucesso, motivo: 'fixture',
      ...guardarSaida(SAIDA[String(sucesso)]), truncado: false,
      tokens_in: 10, tokens_out: 5, latencia_ms: 100 + i, custo_usd: 0,
      seed: 'n/d', determinismo: 'n/d', ambiente: AMBIENTE,
      timestamp: '2026-08-09T00:00:00.000Z', prev_hash: prev,
    });
    prev = r.record_hash;
    out.push(r);
  });
  return out;
}

const LINHAS_BOAS = [
  ['m1', 'modelo', 'm1', 'ext-a', 'extracao', 'T0', true],
  ['m1', 'modelo', 'm1', 'ext-b', 'extracao', 'T1', true],
  ['m1', 'modelo', 'm1', 'cod-a', 'codigo', 'T0', false],
  ['m2', 'modelo', 'm2', 'ext-a', 'extracao', 'T0', true],
  ['m2', 'modelo', 'm2', 'ext-b', 'extracao', 'T1', false],
  ['m2', 'modelo', 'm2', 'cod-a', 'codigo', 'T0', true],
];
const BOA = () => cadeia(LINHAS_BOAS);
const CORPUS_BOM = () => corpusFixture(LINHAS_BOAS);

// --- corpus real -----------------------------------------------------------

test('corpus real carrega, toda tarefa traz verificacao e gabarito_fonte', () => {
  const c = carregarCorpus(path.join(AQUI, 'corpus.json'));
  assert.ok(c.tarefas.length >= 10, `esperava >=10 tarefas, tem ${c.tarefas.length}`);
  for (const t of c.tarefas) {
    assert.ok(t.verificacao, `${t.id} sem verificacao`);
    assert.ok(t.gabarito_fonte, `${t.id} sem gabarito_fonte`);
  }
  assert.match(c.corpus_sha, /^[0-9a-f]{64}$/);
});

test('tarefa sem verificador NAO carrega — o buraco do task-loader fica fechado', () => {
  const p = tmp('corpus-mau.json');
  fs.writeFileSync(p, JSON.stringify({
    schema: 'corpus_v2', versao: 2, rubrica: { niveis: { D1: 'x' } },
    tarefas: [{ id: 'x', categoria: 'extracao', tier: 'T0', dificuldade: 'D1', prompt: 'p', gabarito_fonte: { tipo: 'computado', fn: 'paraSnake', entrada: 'a' } }],
  }));
  assert.throws(() => carregarCorpus(p), /SEM verificacao/);
});

test('tarefa sem gabarito_fonte NAO carrega', () => {
  const p = tmp('corpus-sem-gabarito.json');
  fs.writeFileSync(p, JSON.stringify({
    schema: 'corpus_v2', versao: 2, rubrica: { niveis: { D1: 'x' } },
    tarefas: [{ id: 'x', categoria: 'extracao', tier: 'T0', dificuldade: 'D1', prompt: 'p', verificacao: { tipo: 'resposta-exata', esperado: 'a' } }],
  }));
  assert.throws(() => carregarCorpus(p), /SEM gabarito_fonte/);
});

// --- graders ---------------------------------------------------------------

test('graders sao mecanicos e ternarios', () => {
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, ' `8412` ').sucesso, true);
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, 'A porta e 8412.').sucesso, false);
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, '   ').sucesso, null);
  assert.equal(avaliar({ tipo: 'regex-ausente', padrao: '\\busr\\b' }, 'greet(currentUser)').sucesso, true);
  // reuso verbatim do grader do Mooter: vago fica n/d, nunca falso
  assert.equal(avaliar({ tipo: 'constante', esperado: 7, kind: 'number' }, 'nao sei').sucesso, null);
  assert.equal(avaliar({ tipo: 'constante', esperado: 7, kind: 'number' }, 'sao 9').sucesso, false);
});

test('json-igual valida por parser, nao por presenca de palavra', () => {
  const c = { tipo: 'json-igual', esperado: ['a', 'b', 'c'] };
  assert.equal(avaliar(c, '["a","b","c"]').sucesso, true);
  assert.equal(avaliar(c, 'Aqui tens: ["a", "b", "c"] pronto').sucesso, true);
  assert.equal(avaliar(c, '["a","c","b"]').sucesso, false, 'a ordem faz parte da restricao');
  assert.equal(avaliar(c, 'a, b, c').sucesso, false, 'mencionar os valores nao e produzir JSON');
  assert.equal(avaliar(c, '').sucesso, null);
});

test('tabela-markdown valida por parser', () => {
  const c = { tipo: 'tabela-markdown', colunas: ['k', 'v'], linhas: [['a', '1'], ['b', '2']] };
  assert.equal(avaliar(c, '| k | v |\n| --- | --- |\n| a | 1 |\n| b | 2 |').sucesso, true);
  assert.equal(avaliar(c, '| k | v |\n| --- | --- |\n| a | 1 |').sucesso, false, 'faltar uma linha e falhar');
  assert.equal(avaliar(c, 'k=a v=1, k=b v=2').sucesso, false, 'nao e tabela');
});

// --- conteudo importado ----------------------------------------------------

test('a doutrina de conteudo importado e mecanismo: o teto recusa, nao trunca', () => {
  const ok = carregarPrefixo('curto');
  assert.equal(ok.tokens_aprox, 2);
  assert.match(ok.sha, /^[0-9a-f]{64}$/);
  assert.throws(() => carregarPrefixo('x'.repeat(TETO_TOKENS_PREFIXO * 4 + 4)), /excede o teto/);
  assert.equal(DOUTRINA_CONTEUDO_IMPORTADO.classe_2_compila_para_dentro_do_motor.executor, 'n/d');
  assert.deepEqual(DOUTRINA_CONTEUDO_IMPORTADO.classe_2_compila_para_dentro_do_motor.proibido, ['ranked', 'publicacao']);
});

test('skill com ferramentas esta NOMEADA e recusada, nao aceite em silencio', () => {
  assert.equal(CLASSES_CANDIDATO.skill_ferramentas.suportada, false);
  const l = cadeia([['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true], ['s', 'modelo', 'm1', 'a', 'extracao', 'T0', false]]);
  const futuro = selar({ ...l[1], classe_candidato: 'skill_ferramentas', skill_sha: 'x' });
  const r = verificar([l[0], futuro], corpusFixture([['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true]]));
  assert.ok(r.falhas.some((f) => f.includes('skill_ferramentas') && f.includes('nao e suportada')), r.falhas.join('\n'));
});

// --- portao ----------------------------------------------------------------

test('ledger valido passa o portao', () => {
  const r = verificar(BOA(), CORPUS_BOM());
  assert.deepEqual(r.falhas, []);
  assert.equal(r.ok, true);
  assert.equal(r.resumo.separa_modelos.separa, true);
  assert.deepEqual(r.resumo.separa_modelos.tarefas.sort(), ['cod-a', 'ext-b']);
});

test('adulterar um byte e deixar o hash: o portao nomeia o seq corrompido', () => {
  const l = BOA();
  l[2].motivo = 'fixture adulterada';
  const r = verificar(l, CORPUS_BOM());
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C2 seq 2') && f.includes('ADULTERADO')), r.falhas.join('\n'));
});

test('adulterar e recalcular o hash: a cadeia parte no elo seguinte', () => {
  const l = BOA();
  l[2] = selar({ ...l[2], motivo: 'fixture adulterada' });
  const r = verificar(l, CORPUS_BOM());
  assert.equal(r.ok, false);
  assert.ok(!r.falhas.some((f) => f.startsWith('C2 seq 2') && f.includes('ADULTERADO')));
  assert.ok(r.falhas.some((f) => f.startsWith('C2 seq 3') && f.includes('CADEIA PARTIDA')), r.falhas.join('\n'));
});

test('C4: corpus inerte e recusado (o defeito dos 72/72)', () => {
  const linhas = [
    ['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true],
    ['m1', 'modelo', 'm1', 'b', 'codigo', 'T1', true],
    ['m2', 'modelo', 'm2', 'a', 'extracao', 'T0', true],
    ['m2', 'modelo', 'm2', 'b', 'codigo', 'T1', true],
  ];
  const r = verificar(cadeia(linhas), corpusFixture(linhas));
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C4')), r.falhas.join('\n'));
});

test('C6: categoria confundida com tier e recusada', () => {
  const linhas = [
    ['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true],
    ['m1', 'modelo', 'm1', 'b', 'codigo', 'T1', false],
    ['m2', 'modelo', 'm2', 'a', 'extracao', 'T0', false],
    ['m2', 'modelo', 'm2', 'b', 'codigo', 'T1', true],
  ];
  const r = verificar(cadeia(linhas), corpusFixture(linhas));
  assert.ok(r.falhas.some((f) => f.startsWith('C6')), r.falhas.join('\n'));
});

test('C5: seed ou determinismo prometidos sao recusados', () => {
  const l = BOA();
  const r = verificar([selar({ ...l[0], seed: 42 }), ...l.slice(1)], CORPUS_BOM());
  assert.ok(r.falhas.some((f) => f.startsWith('C5')), r.falhas.join('\n'));
});

test('C7: corpus trocado depois da corrida e apanhado', () => {
  const r = verificar(BOA(), { ...CORPUS_BOM(), corpus_sha: 'outro-sha-qualquer' });
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C7') && f.includes('mudou depois da corrida')), r.falhas.join('\n'));
});

test('C8: sucesso que nao se re-deriva da saida guardada e apanhado', () => {
  const l = BOA();
  // A saida diz "nope" (falha) mas o registo afirma sucesso.
  const mentiroso = selar({ ...l[2], sucesso: true });
  const r = verificar([...l.slice(0, 2), mentiroso, ...l.slice(3)], CORPUS_BOM());
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C8 seq 2')), r.falhas.join('\n'));
});

test('C1: campo numerico com lixo e apanhado', () => {
  const l = BOA();
  const r = verificar([selar({ ...l[0], tokens_in: 'muitos' }), ...l.slice(1)], CORPUS_BOM());
  assert.ok(r.falhas.some((f) => f.includes('tokens_in') && f.includes('nao e numero nem null')), r.falhas.join('\n'));
});

test('a saida guardada e integra: saida_sha cobre o texto', () => {
  const g = guardarSaida('resposta do modelo');
  assert.equal(g.saida_sha, provHash('resposta do modelo'));
});

test('os criterios pregados cobrem C1..C6 e declaram o que e reportado', () => {
  for (const c of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) assert.ok(CRITERIOS[c], `falta ${c}`);
  assert.match(CRITERIOS.reportado_nao_gated, /publica-se/);
});

// --- projeccoes ------------------------------------------------------------

test('as duas projeccoes saem da mesma cadeia, e a forja e delta pareado', () => {
  const linhas = [
    ['m1', 'modelo', 'm1', 'ext-a', 'extracao', 'T0', false],
    ['m1', 'modelo', 'm1', 'ext-b', 'extracao', 'T1', true],
    ['m1', 'modelo', 'm1', 'cod-a', 'codigo', 'T0', false],
    ['skill:p@m1', 'skill_prefixo', 'm1', 'ext-a', 'extracao', 'T0', true],
    ['skill:p@m1', 'skill_prefixo', 'm1', 'ext-b', 'extracao', 'T1', true],
    ['skill:p@m1', 'skill_prefixo', 'm1', 'cod-a', 'codigo', 'T0', false],
  ];
  const l = cadeia(linhas);
  const p = projectar(l, 'VERIFICADA');
  assert.equal(p.cascata.m1.extracao.taxa_acerto, 0.5);
  assert.equal(Object.keys(p.cascata).length, 1, 'a skill nao entra na projeccao da cascata');
  const cel = p.forja['skill:p@m1'].categorias.extracao;
  assert.deepEqual([cel.pares, cel.ganhos, cel.perdas, cel.delta], [2, 1, 0, 0.5]);
  assert.equal(p.derivada_de.cadeia, 'VERIFICADA');
});

test('projeccao de cadeia nao verificada diz-se nao verificada', () => {
  assert.equal(projectar(BOA()).derivada_de.cadeia, 'NAO VERIFICADA');
});

test('n/d nao vira zero nas projeccoes', () => {
  const l = BOA().map((r, i) => (i === 0 ? selar({ ...r, tokens_out: null, prev_hash: null }) : r));
  const p = projectar(l);
  assert.equal(p.cascata.m1.extracao.tokens_out_n_d, 1);
});

// --- io --------------------------------------------------------------------

test('nenhuma fonte tem bytes nulos — git tratava o ficheiro como binario e a revisao cegava', () => {
  for (const nome of ['nucleo.mjs', 'medir.mjs', 'verificar.mjs', 'projectar.mjs', 'prereg.mjs', 'gabarito.mjs', 'nucleo.test.mjs', 'gabarito.test.mjs', 'corpus.json']) {
    const b = fs.readFileSync(path.join(AQUI, nome));
    assert.equal(b.indexOf(0), -1, `${nome}: byte NUL no offset ${b.indexOf(0)}`);
  }
});

test('ledger sobrevive a ida e volta ao disco', () => {
  const p = tmp('ledger.jsonl');
  const l = BOA();
  escreverLedger(p, l);
  const lido = lerLedger(p);
  assert.deepEqual(lido, l);
  assert.equal(verificar(lido, CORPUS_BOM()).ok, true);
  assert.equal(hashEsperado(lido[0]), lido[0].record_hash);
});
