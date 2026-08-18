'use strict';
/** ⚠️ THROWAWAY — spike Slack. Unidade da barreira 2b. */

const test = require('node:test');
const assert = require('node:assert/strict');

const esquema = require('./esquema.js');
const broker = require('../mooter-bridge/broker.js');

const HASH = 'a'.repeat(64);
const base = (extra) => Object.assign({ tipo: 'estado', job_id: 'job-x' }, extra || {});

test('esquema · tipo, estado e accoes usam vocabularios fechados', () => {
  for (const tipo of esquema.TIPOS) assert.equal(esquema.validar({ tipo }).ok, true);
  for (const estado of esquema.ESTADOS) {
    assert.equal(esquema.validar(base({ estado })).ok, true, estado);
  }
  assert.equal(esquema.validar({ tipo: 'inventado' }).ok, false);
  assert.equal(esquema.validar(base({ estado: 'LOCKED' })).ok, false);
  assert.equal(esquema.validar(base({ accoes: ['aprovar', 'parar'] })).ok, true);
  assert.equal(esquema.validar(base({ accoes: ['aprovar', 'aprovar'] })).ok, false);
  assert.equal(esquema.validar(base({ accoes: ['executar'] })).ok, false);
});

test('esquema · job_id acrescenta tecto mas todo o aceite continua compativel com o broker', () => {
  for (const id of ['j', 'job-a_1.2', 'a'.repeat(64)]) {
    assert.equal(esquema.validar(base({ job_id: id })).ok, true, id);
    assert.equal(broker.JOB_ID_VALIDO.test(id), true, 'o broker recusaria ' + id);
  }
  for (const id of ['', '.', '..', 'com espaço', 'a'.repeat(65)]) {
    assert.equal(esquema.validar(base({ job_id: id })).ok, false, id);
  }
});

test('esquema · hashes recusam canais disfarçados de prova', () => {
  assert.equal(esquema.validar(base({ hash_esperado: null })).ok, true);
  assert.equal(esquema.validar(base({ hash_esperado: HASH, hash_actual: HASH })).ok, true);
  for (const hash of ['a'.repeat(63), 'A'.repeat(64), 'CANARY_PRIVATE_HASH']) {
    assert.equal(esquema.validar(base({ hash_esperado: hash })).ok, false);
  }
});

test('esquema · passos e segundos aceitam apenas inteiros dentro dos tectos', () => {
  for (const payload of [
    { passos: 0, segundos: 0 },
    { passos: 10000, segundos: 2592000 },
  ]) assert.equal(esquema.validar(base(payload)).ok, true);
  for (const payload of [
    { passos: -1 }, { passos: 1.5 }, { passos: 10001 }, { passos: NaN },
    { segundos: -1 }, { segundos: Infinity }, { segundos: 2592001 },
  ]) assert.equal(esquema.validar(base(payload)).ok, false);
});

test('esquema · mostruario invalido degrada para null sem eco', () => {
  const r = esquema.validar(base({
    wave: 'CANARY WAVE',
    autor: { valor: 'CANARY AUTHOR', porque: 'CANARY PORQUE' },
    motor: { valor: 'CANARY MOTOR' },
    modelo: { valor: 'CANARY MODEL' },
    diff_stat: { valor: 'CANARY DIFF' },
  }));
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.payload).includes('CANARY'), false);
  assert.deepEqual(r.payload.autor, { valor: null });
  for (const campo of ['wave', 'autor', 'motor', 'modelo', 'diff_stat']) {
    assert.ok(r.degradados.includes(campo), campo);
  }
});

test('esquema · custo so aceita fonte exacta e fonte desconhecida corta numero e fonte', () => {
  const seguro = esquema.validar(base({
    custo: { valor: 2, fonte: 'reportado pelo CLI', porque: null },
  }));
  assert.equal(seguro.ok, true);
  assert.deepEqual(seguro.payload.custo, {
    valor: 2, fonte: esquema.FONTES_CANONICAS.motor, porque: null,
  });
  assert.equal(JSON.stringify(seguro.payload).includes('CANARY'), false);

  const degradado = esquema.validar(base({
    custo: { valor: 2, fonte: 'CANARY reportado pelo CLI', porque: 'CANARY_PRIVATE_PORQUE' },
  }));
  assert.equal(degradado.ok, true);
  assert.deepEqual(degradado.payload.custo, {
    valor: null, fonte: null, porque: esquema.CUSTO_PORQUE.DEGRADADO,
  });
  assert.ok(degradado.degradados.includes('custo'));
});

test('esquema · cadeia publica apenas quatro campos e degrada inteira se forem ilegíveis', () => {
  const valida = esquema.validar(base({ cadeia: {
    pedidos: 2, total: 1.2, fontes: ['reportado pelo CLI'], todosMedidos: true,
  } }));
  assert.deepEqual(Object.keys(valida.payload.cadeia).sort(),
    ['fontes', 'pedidos', 'todosMedidos', 'total']);
  const invalida = esquema.validar(base({ cadeia: {
    pedidos: 2, total: '1.2', fontes: ['CANARY'], todosMedidos: true,
  } }));
  assert.equal(invalida.ok, true);
  assert.equal(invalida.payload.cadeia, null);
  assert.ok(invalida.degradados.includes('cadeia'));
});

test('esquema · allowlist profunda recusa subchaves desconhecidas em todo o objecto', () => {
  const casos = {
    autor: { valor: null, canario: 1 },
    motor: { valor: null, canario: 1 },
    modelo: { valor: null, canario: 1 },
    custo: { valor: null, canario: 1 },
    diff_stat: { valor: null, canario: 1 },
    cadeia: { pedidos: 1, total: 0, fontes: [], todosMedidos: false, canario: 1 },
    auditoria: { request: 'job-x', canario: 1 },
  };
  for (const [campo, valor] of Object.entries(casos)) {
    const r = esquema.validar(base({ [campo]: valor }));
    assert.equal(r.ok, false, campo);
    assert.match(r.porque, /subchave/);
  }
});

test('esquema · auditoria deriva texto e o stop nunca recusa por hash visto', () => {
  const boa = esquema.validar(base({ auditoria: {
    request: 'job-x', veredicto: 'aprovar', estado: 'APPROVED',
    actor: 'slack:UABC12345', hash: HASH, autorizacao: 'single_user', job_novo: 'job-y',
  } }));
  assert.equal(boa.ok, true);
  assert.match(boa.payload.auditoria, /hash=aaaaaaaaaaaa…/);
  assert.ok(!boa.payload.auditoria.includes(HASH));

  const stop = esquema.validar(base({ auditoria: {
    request: 'job-x', accao: 'parar', estado: 'PARADO',
    actor: 'slack:U_PAULO', hash: 'CANARY_PRIVATE_HASH',
  } }));
  assert.equal(stop.ok, true);
  assert.match(stop.payload.auditoria, /hash=n\/d/);
  assert.equal(stop.payload.auditoria.includes('CANARY'), false);
});

test('esquema · texto so atravessa pelo catalogo fechado', () => {
  for (const frase of Object.values(esquema.FRASES)) {
    assert.equal(esquema.validar(base({ texto: frase })).ok, true, frase);
  }
  assert.equal(esquema.validar(base({ texto: 'frase inventada' })).ok, false);
});

test('esquema · reconstrucao nao partilha referencias e fica congelada', () => {
  const entrada = base({ autor: { valor: 'slack:UABC12345', rotulo: 'autor' },
    accoes: ['parar'] });
  const r = esquema.validar(entrada);
  entrada.autor.valor = 'CANARY';
  entrada.accoes.push('aprovar');
  assert.equal(r.payload.autor.valor, 'slack:UABC12345');
  assert.equal(esquema.validar(base({ autor: { valor: 'slack:U_PAULO' } })).payload.autor.valor,
    null, 'um id com underscore nao e forma possivel de user do Slack: degrada fail-closed');
  assert.deepEqual(r.payload.accoes, ['parar']);
  assert.equal(Object.isFrozen(esquema.FRASES), true);
  assert.equal(Object.isFrozen(esquema.FORMA_DE_JOB_ID), true);
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.payload), true);
  assert.equal(Object.isFrozen(r.payload.autor), true);
  assert.equal(Object.isFrozen(r.payload.accoes), true);
});

test('esquema · tipo e obrigatorio e campos fornecidos sem valor degradam visivelmente', () => {
  assert.equal(esquema.validar({}).ok, false);
  const r = esquema.validar(base({ autor: null, motor: {}, modelo: { valor: undefined } }));
  assert.equal(r.ok, true);
  for (const campo of ['autor', 'motor', 'modelo']) assert.ok(r.degradados.includes(campo));
});

test('esquema · autorizacao por roles publica a classe, nunca o nome livre do papel', () => {
  const r = esquema.validar(base({ auditoria: {
    request: 'job-x', veredicto: 'aprovar', estado: 'APPROVED',
    autorizacao: 'roles:senior reviewer',
  } }));
  assert.equal(r.ok, true);
  assert.match(r.payload.auditoria, /autorizacao=roles/);
  assert.equal(r.payload.auditoria.includes('senior reviewer'), false);
});

test('esquema · auditoria exige request e exactamente veredicto ou accao', () => {
  const semRequest = esquema.validar(base({ auditoria: { veredicto: 'aprovar' } }));
  assert.equal(semRequest.ok, false);
  assert.match(semRequest.porque, /request/);

  const ambos = esquema.validar(base({ auditoria: {
    request: 'job-x', veredicto: 'aprovar', accao: 'parar',
  } }));
  assert.equal(ambos.ok, false);
  assert.match(ambos.porque, /exactamente/);
});

test('esquema · cada valor adversarial da auditoria degrada sem atravessar', () => {
  const r = esquema.validar(base({ auditoria: {
    request: 'CANARY/request', veredicto: 'CANARY_VEREDICTO', estado: 'CANARY_ESTADO',
    actor: 'CANARY_ACTOR', hash: 'CANARY_HASH', autorizacao: 'CANARY_AUTH',
    job_novo: 'CANARY/job',
  } }));
  assert.equal(r.ok, true);
  assert.equal(r.payload.auditoria.includes('CANARY'), false);
  for (const campo of ['request', 'veredicto', 'estado', 'actor', 'hash', 'autorizacao', 'job_novo']) {
    assert.ok(r.degradados.includes('auditoria.' + campo), campo + ' degradou em silencio');
  }
});
