'use strict';

/**
 * f-mu0 · PARTE A — identidade no envelope do ledger.
 *
 * O que estes testes protegem, e porquê cada um existe:
 *
 * A1. Um evento NOVO nunca sai sem ator. O default é EXPLÍCITO
 *     ({type:'system', id:'system'}) e fica gravado no ficheiro — omissão
 *     silenciosa é o bug, não a ausência de ator. (kimi #6)
 * A2. Eventos HISTÓRICOS não ganham ator retroactivo. O leitor degrada para
 *     `legacy`; NUNCA inventa o Paulo. (regra 3 da migração codex)
 * A3. O ator PROPAGA para todos os eventos do mesmo job — pelos dois caminhos
 *     que a propagação de dimensões já usa para cargo/local: o mapa em memória
 *     e a releitura do ledger (outro processo).
 * A4. Eventos de RESULTADO nascem fail-closed: `visibilidade: 'local_only'`.
 *     O enforcement da posting-policy é F-MU1; o DEFAULT nasce agora, porque
 *     default inseguro nunca mais se corrige depois. (simulação 08-15, furo c)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-actor-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_REPO = __dirname;

const actorMod = require('./actor.js');
const seamless = require('./seamless.js');

const LEDGER = path.join(HOME, 'ledger.jsonl');

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

function lines() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function ultimo(jobId) {
  const all = lines().filter((e) => e.job_id === jobId);
  return all[all.length - 1];
}
/**
 * Um evento terminal arrasta um `eta_observacao_recusada` atrás de si quando o
 * job não tem metadata em disco (seamless.js · recordEtaRefusal). Esse evento é
 * do MESMO job_id, por isso `ultimo()` não serve para apontar a um tipo: aponta
 * ao rasto. Que o rasto também leve o ator é o comportamento certo — é a prova
 * de que a propagação não conhece excepções.
 */
function eventoDoTipo(jobId, tipo) {
  const all = lines().filter((e) => e.job_id === jobId && e.event === tipo);
  return all[all.length - 1];
}

// ── A1 · o default é explícito, e está no ficheiro ────────────────────────
test('A1 — evento novo sem ator declarado grava o default system EXPLÍCITO', () => {
  seamless.ledgerAppend({ event: 'step', job_id: 'job-a1', step_index: 1 });

  const ev = ultimo('job-a1');
  assert.ok(ev, 'o evento tem de estar no ledger');
  assert.ok(Object.prototype.hasOwnProperty.call(ev, 'actor'),
    'evento NOVO sem campo actor gravado é BUG — omissão silenciosa é exactamente o que isto proíbe');
  assert.deepStrictEqual(ev.actor, { type: 'system', id: 'system', origem: null });
  assert.equal(ev.actor_porque, 'n/d — ator não declarado por quem disparou; nunca inferido');
});

test('A1b — o ator declarado persiste byte-a-byte', () => {
  const actor = { type: 'human', id: 'paulo', origem: 'cc:f-mu0' };
  seamless.ledgerAppend({ event: 'dispatched', job_id: 'job-a1b', actor });

  const bruto = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l)).filter((e) => e.job_id === 'job-a1b')[0];
  assert.deepStrictEqual(bruto.actor, actor, 'o que entrou tem de ser o que está no disco');
  assert.equal(bruto.actor_porque, 'declarado por quem disparou');
});

test('A1c — ator malformado é RECUSADO, não silenciosamente corrigido', () => {
  assert.throws(
    () => seamless.ledgerAppend({ event: 'step', job_id: 'job-a1c', actor: { id: 'sem-tipo' } }),
    /actor/i,
    'um ator sem type tem de rebentar — aceitar meio-ator é pior do que não ter ator');
  assert.throws(
    () => seamless.ledgerAppend({ event: 'step', job_id: 'job-a1c', actor: 'paulo' }),
    /actor/i,
    'uma string não é um ator');
});

// ── A2 · legacy: degradar, nunca inventar ─────────────────────────────────
test('A2 — evento histórico sem ator lê sem erro e degrada para legacy', () => {
  const legado = { ts: '2026-08-01T10:00:00.000Z', event: 'done', job_id: 'job-legacy', agent: 'cc' };
  fs.appendFileSync(LEDGER, JSON.stringify(legado) + '\n');

  const lido = seamless.ledgerRead().find((e) => e.job_id === 'job-legacy');
  assert.ok(lido, 'o leitor não pode rebentar num evento anterior à instrumentação');

  const quem = actorMod.actorDoEvento(lido);
  assert.equal(quem.id, 'legacy');
  assert.notEqual(quem.id, 'paulo', 'NUNCA inventar o Paulo como ator de um evento legacy');
});

test('A2b — o ficheiro não é reescrito para dar ator ao passado', () => {
  const antes = fs.readFileSync(LEDGER);
  const idx = antes.indexOf(Buffer.from('"job_id":"job-legacy"'));
  assert.ok(idx > 0, 'a linha legacy tem de estar no ficheiro');

  seamless.ledgerRead();
  seamless.ledgerAppend({ event: 'step', job_id: 'job-a2b' });

  const depois = fs.readFileSync(LEDGER);
  assert.deepStrictEqual(depois.subarray(0, antes.length), antes,
    'o ledger é append-only: o prefixo tem de ficar byte-a-byte igual');
});

// ── A3 · propagação pelos dois caminhos ───────────────────────────────────
test('A3 — o ator propaga ao evento terminal do mesmo job (mapa em memória)', () => {
  const actor = { type: 'human', id: 'ana', origem: 'slack:U123' };
  seamless.ledgerAppend({ event: 'dispatched', job_id: 'job-a3', actor, request_id: 'req-77' });
  // o chamador NÃO repete o ator — tem de viajar sozinho, como cargo/local já viajam
  seamless.ledgerAppend({ event: 'done', job_id: 'job-a3', exit_code: 0 });

  const fim = eventoDoTipo('job-a3', 'done');
  assert.ok(fim, 'o evento terminal tem de estar no ledger');
  assert.deepStrictEqual(fim.actor, actor, 'o evento terminal tem de saber de quem foi o pedido');
  assert.equal(fim.request_id, 'req-77', 'o request_id viaja com o ator');

  // e o rasto que o terminal arrasta atrás de si também leva o ator: a
  // propagação não tem excepções, nem para eventos que o Mooter escreve sobre si
  const rasto = eventoDoTipo('job-a3', 'eta_observacao_recusada');
  if (rasto) assert.deepStrictEqual(rasto.actor, actor, 'nem o rasto escapa à identidade');
});

test('A3b — propaga por releitura do ledger quando o mapa não sabe (outro processo)', () => {
  const actor = { type: 'agent', id: 'codex', origem: 'wave:f-mu0-w1-mapa' };
  // escrito "por outro processo": vai ao disco sem passar pelo mapa em memória
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T12:00:00.000Z', event: 'dispatched', job_id: 'job-a3b',
    actor, request_id: 'req-88', cargo: null, local: false,
  }) + '\n');

  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a3b' });

  const fim = ultimo('job-a3b');
  assert.deepStrictEqual(fim.actor, actor, 'a releitura do ledger tem de recuperar o ator');
  assert.equal(fim.request_id, 'req-88');
});

// ── A4 · visibilidade fail-closed ─────────────────────────────────────────
test('A4 — evento de RESULTADO nasce local_only', () => {
  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a4' });
  assert.equal(ultimo('job-a4').visibilidade, 'local_only',
    'default inseguro nunca mais se corrige depois — o resultado nasce fechado');

  seamless.ledgerAppend({ event: 'done', job_id: 'job-a4b', exit_code: 0 });
  assert.equal(eventoDoTipo('job-a4b', 'done').visibilidade, 'local_only');
});

test('A4b — shareable só quando declarado, e nada mais é aceite', () => {
  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a4c', visibilidade: 'shareable' });
  assert.equal(ultimo('job-a4c').visibilidade, 'shareable');

  assert.throws(
    () => seamless.ledgerAppend({ event: 'collected', job_id: 'job-a4d', visibilidade: 'publico' }),
    /visibilidade/i,
    'um valor fora do enum tem de rebentar, não cair em fail-open');
});

test('A4c — evento que não é resultado não ganha visibilidade', () => {
  seamless.ledgerAppend({ event: 'started', job_id: 'job-a4e' });
  assert.equal(Object.prototype.hasOwnProperty.call(ultimo('job-a4e'), 'visibilidade'), false,
    'só eventos de resultado carregam a etiqueta; o resto seria ruído');
});

// ── a porta MCP ───────────────────────────────────────────────────────────
test('A6 — mooter_dispatch e mooter_work declaram `actor` no schema', () => {
  // os schemas são additionalProperties:false: sem esta declaração, o host
  // rejeitava o campo antes de o código o ver, e o parâmetro era decorativo.
  for (const nome of ['mooter_dispatch', 'mooter_work']) {
    const tool = seamless.TOOLS.find((t) => t.name === nome);
    assert.ok(tool, nome + ' tem de existir');
    const actor = tool.inputSchema.properties.actor;
    assert.ok(actor, nome + ' não declara `actor` — o campo seria rejeitado na porta');
    assert.deepStrictEqual(actor.required, ['type', 'id']);
    assert.deepStrictEqual(actor.properties.type.enum, actorMod.ACTOR_TYPES);
    assert.equal(tool.inputSchema.required.includes('actor'), false,
      'o ator é OPCIONAL — quem não o declara fica com o default system, não com um erro');
  }
});

test('A6b — o handler RECUSA um ator inválido antes de pôr um job de pé', async () => {
  // não basta o schema: prova-se no handler real, que é quem escreve o ledger.
  const r = await seamless.toolDispatch({
    agent: 'moo', worktree: __dirname, masterprompt: 'x', wave: 'w-actor',
    actor: { type: 'robô', id: 'x' },
  });
  assert.match(r.error || '', /actor\.type/, 'devia recusar o type fora do enum');
  assert.deepStrictEqual(r.actor_types_validos, actorMod.ACTOR_TYPES);

  const antes = lines().length;
  await seamless.toolDispatch({
    agent: 'moo', worktree: __dirname, masterprompt: 'x', wave: 'w-actor',
    actor: { id: 'sem-type' },
  });
  assert.equal(lines().length, antes, 'uma recusa não pode deixar rasto no ledger');
});

// ── canónico único ────────────────────────────────────────────────────────
test('A5 — há uma única definição canónica de identidade', () => {
  assert.deepStrictEqual(actorMod.ACTOR_TYPES, ['human', 'agent', 'system']);
  assert.deepStrictEqual(actorMod.VISIBILIDADES, ['local_only', 'shareable']);

  const duplicates = [];
  for (const file of fs.readdirSync(__dirname)) {
    if (!file.endsWith('.js') || file.endsWith('.test.js') || file === 'actor.js') continue;
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    if (/\b(?:ACTOR_TYPES|VISIBILIDADES)\s*=\s*\[/.test(source)) duplicates.push(file);
  }
  assert.deepStrictEqual(duplicates, [], 'apareceu uma lista de identidade paralela');
});
