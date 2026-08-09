import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { carregarCorpus, avaliar, selar, hashEsperado, lerLedger, escreverLedger, NUCLEO_VERSAO, SCHEMA } from './nucleo.mjs';
import { verificar } from './verificar.mjs';
import { projectar } from './projectar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

function tmp(nome) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  return path.join(d, nome);
}

const AMBIENTE = { corpus_sha: 'abc', nucleo_versao: NUCLEO_VERSAO, transporte: 'fixture', sandbox: 'n/d', host: 'test' };

/** Constroi uma cadeia valida a partir de tuplos [candidato, tipo, host, tarefa, categoria, tier, sucesso]. */
function cadeia(linhas) {
  const out = [];
  let prev = null;
  linhas.forEach(([candidato_id, tipo, host_model, tarefa_id, categoria, tier, sucesso], i) => {
    const r = selar({
      seq: i, schema: SCHEMA, candidato_id, tipo, host_model,
      skill_sha: tipo === 'skill' ? 'sha-skill' : null,
      tarefa_id, categoria, tier, sucesso, motivo: 'fixture',
      tokens_in: 10, tokens_out: 5, latencia_ms: 100 + i, custo_usd: 0,
      seed: 'n/d', determinismo: 'n/d', ambiente: AMBIENTE,
      timestamp: '2026-08-09T00:00:00.000Z', prev_hash: prev,
    });
    prev = r.record_hash;
    out.push(r);
  });
  return out;
}

// Duas categorias em dois tiers, e uma tarefa que separa os candidatos.
const BOA = () => cadeia([
  ['m1', 'modelo', 'm1', 'ext-a', 'extracao', 'T0', true],
  ['m1', 'modelo', 'm1', 'ext-b', 'extracao', 'T1', true],
  ['m1', 'modelo', 'm1', 'cod-a', 'codigo', 'T0', false],
  ['m2', 'modelo', 'm2', 'ext-a', 'extracao', 'T0', true],
  ['m2', 'modelo', 'm2', 'ext-b', 'extracao', 'T1', false],
  ['m2', 'modelo', 'm2', 'cod-a', 'codigo', 'T0', true],
]);

test('corpus real carrega e toda a tarefa traz verificacao', () => {
  const c = carregarCorpus(path.join(AQUI, 'corpus.json'));
  assert.ok(c.tarefas.length >= 8, 'esperava >=8 tarefas');
  for (const t of c.tarefas) assert.ok(t.verificacao, `${t.id} sem verificacao`);
  assert.match(c.corpus_sha, /^[0-9a-f]{64}$/);
});

test('tarefa sem verificador NAO carrega — o buraco do task-loader fica fechado', () => {
  const p = tmp('corpus-mau.json');
  fs.writeFileSync(p, JSON.stringify({
    schema: 'corpus_v1', versao: 1,
    tarefas: [{ id: 'x', categoria: 'extracao', tier: 'T0', prompt: 'p' }],
  }));
  assert.throws(() => carregarCorpus(p), /SEM verificacao/);
});

test('graders sao mecanicos e ternarios', () => {
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, ' `8412` ').sucesso, true);
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, 'A porta e 8412.').sucesso, false);
  assert.equal(avaliar({ tipo: 'resposta-exata', esperado: '8412' }, '   ').sucesso, null);
  assert.equal(avaliar({ tipo: 'regex-presente', padrao: 'new\\s+Set' }, 'new Set(a).size').sucesso, true);
  assert.equal(avaliar({ tipo: 'regex-ausente', padrao: '\\busr\\b' }, 'function greet(currentUser)').sucesso, true);
  assert.equal(avaliar({ tipo: 'regex-ausente', padrao: '\\busr\\b' }, 'function greet(usr)').sucesso, false);
  // reuso verbatim do grader do Mooter: vago fica n/d, nunca falso
  assert.equal(avaliar({ tipo: 'constante', esperado: 7, kind: 'number' }, 'nao sei').sucesso, null);
  assert.equal(avaliar({ tipo: 'constante', esperado: 7, kind: 'number' }, 'sao 7').sucesso, true);
  assert.equal(avaliar({ tipo: 'constante', esperado: 7, kind: 'number' }, 'sao 9').sucesso, false);
  // 'todos' curto-circuita no primeiro falso
  assert.equal(avaliar({
    tipo: 'todos',
    checks: [{ tipo: 'regex-presente', padrao: 'currentUser' }, { tipo: 'regex-ausente', padrao: '\\busr\\b' }],
  }, 'const currentUser = usr').sucesso, false);
});

test('ledger valido passa o portao', () => {
  const r = verificar(BOA());
  assert.deepEqual(r.falhas, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.resumo.tarefas_discriminantes.sort(), ['cod-a', 'ext-b']);
});

test('adulterar um byte e deixar o hash: o portao nomeia o seq corrompido', () => {
  const l = BOA();
  l[2].motivo = 'fixture adulterada';
  const r = verificar(l);
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C2 seq 2') && f.includes('ADULTERADO')), r.falhas.join('\n'));
});

test('adulterar e recalcular o hash: a cadeia parte no elo seguinte', () => {
  const l = BOA();
  // O atacante esperto reancora o proprio registo — e e ai que o prev_hash o apanha.
  l[2] = selar({ ...l[2], motivo: 'fixture adulterada' });
  const r = verificar(l);
  assert.equal(r.ok, false);
  assert.ok(!r.falhas.some((f) => f.startsWith('C2 seq 2') && f.includes('ADULTERADO')), 'seq 2 volta a ser coerente consigo proprio');
  assert.ok(r.falhas.some((f) => f.startsWith('C2 seq 3') && f.includes('CADEIA PARTIDA')), r.falhas.join('\n'));
});

test('72/72 e recusado: sem tarefa que separe candidatos o portao fecha', () => {
  const r = verificar(cadeia([
    ['m1', 'modelo', 'm1', 'ext-a', 'extracao', 'T0', true],
    ['m1', 'modelo', 'm1', 'cod-a', 'codigo', 'T1', true],
    ['m2', 'modelo', 'm2', 'ext-a', 'extracao', 'T0', true],
    ['m2', 'modelo', 'm2', 'cod-a', 'codigo', 'T1', true],
  ]));
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C4')), r.falhas.join('\n'));
});

test('categoria confundida com tier e recusada', () => {
  const r = verificar(cadeia([
    ['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true],
    ['m1', 'modelo', 'm1', 'b', 'codigo', 'T1', false],
    ['m2', 'modelo', 'm2', 'a', 'extracao', 'T0', false],
    ['m2', 'modelo', 'm2', 'b', 'codigo', 'T1', true],
  ]));
  assert.equal(r.ok, false);
  assert.ok(r.falhas.some((f) => f.startsWith('C6')), r.falhas.join('\n'));
});

test('seed ou determinismo prometidos sao recusados', () => {
  const l = BOA();
  const adulterado = selar({ ...l[0], seed: 42 });
  const r = verificar([adulterado, ...l.slice(1)]);
  assert.ok(r.falhas.some((f) => f.startsWith('C5')), r.falhas.join('\n'));
});

test('candidato skill sem skill_sha e recusado', () => {
  const l = cadeia([
    ['m1', 'modelo', 'm1', 'a', 'extracao', 'T0', true],
    ['s1', 'skill', 'm1', 'a', 'extracao', 'T0', false],
  ]);
  const sem = selar({ ...l[1], skill_sha: null });
  const r = verificar([l[0], sem]);
  assert.ok(r.falhas.some((f) => f.includes('skill sem skill_sha')), r.falhas.join('\n'));
});

test('as duas projeccoes saem da mesma cadeia, e a forja e delta pareado', () => {
  const l = cadeia([
    ['m1', 'modelo', 'm1', 'ext-a', 'extracao', 'T0', false],
    ['m1', 'modelo', 'm1', 'ext-b', 'extracao', 'T1', true],
    ['m1', 'modelo', 'm1', 'cod-a', 'codigo', 'T0', false],
    ['skill:p@m1', 'skill', 'm1', 'ext-a', 'extracao', 'T0', true],
    ['skill:p@m1', 'skill', 'm1', 'ext-b', 'extracao', 'T1', true],
    ['skill:p@m1', 'skill', 'm1', 'cod-a', 'codigo', 'T0', false],
  ]);
  const p = projectar(l);
  // cascata: nivel absoluto, so modelos
  assert.equal(p.cascata.m1.extracao.taxa_acerto, 0.5);
  assert.equal(p.cascata.m1.codigo.taxa_acerto, 0);
  assert.equal(Object.keys(p.cascata).length, 1, 'a skill nao entra na projeccao da cascata');
  // forja: delta pareado sobre o mesmo host — 1 ganho, 1 igual em extracao
  const cel = p.forja['skill:p@m1'].categorias.extracao;
  assert.equal(cel.pares, 2);
  assert.equal(cel.ganhos, 1);
  assert.equal(cel.perdas, 0);
  assert.equal(cel.delta, 0.5);
  assert.equal(p.forja['skill:p@m1'].categorias.codigo.delta, 0);
  assert.equal(p.derivada_de.ultimo_record_hash, l[l.length - 1].record_hash);
});

test('nenhuma fonte tem bytes nulos — git tratava o ficheiro como binario e a revisao cegava', () => {
  for (const nome of ['nucleo.mjs', 'medir.mjs', 'verificar.mjs', 'projectar.mjs', 'nucleo.test.mjs', 'corpus.json']) {
    const b = fs.readFileSync(path.join(AQUI, nome));
    const i = b.indexOf(0);
    assert.equal(i, -1, `${nome}: byte NUL no offset ${i}`);
  }
});

test('ledger sobrevive a ida e volta ao disco', () => {
  const p = tmp('ledger.jsonl');
  const l = BOA();
  escreverLedger(p, l);
  const lido = lerLedger(p);
  assert.deepEqual(lido, l);
  assert.equal(verificar(lido).ok, true);
  assert.equal(hashEsperado(lido[0]), lido[0].record_hash);
});
