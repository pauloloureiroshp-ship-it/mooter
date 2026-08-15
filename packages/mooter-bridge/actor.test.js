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

// ── ronda 2 · os três achados do G4 que eram meus ─────────────────────────
test('A7 — ator histórico ILEGÍVEL não se herda, e não derruba o evento seguinte', () => {
  // O caminho que isto protege não tem rede: o ledgerAppend do timeout do job
  // corre dentro de um setTimeout sem try/catch (seamless.js). Se a herança
  // trouxesse o objecto cru, uma linha estragada no ficheiro derrubava o
  // processo — um ficheiro mau não pode matar um processo vivo.
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T11:00:00.000Z', event: 'dispatched', job_id: 'job-a7',
    actor: { id: 'sem-type-nenhum' }, cargo: null, local: false,
  }) + '\n');

  assert.doesNotThrow(() => seamless.ledgerAppend({ event: 'failed', job_id: 'job-a7', exit_code: 'timeout' }));
  const ev = eventoDoTipo('job-a7', 'failed');
  assert.deepStrictEqual(ev.actor, { type: 'system', id: 'system', origem: null },
    'ilegível não se herda — cai no default explícito');
  assert.equal(ev.actor_porque, actorMod.PORQUE_DEFAULT);
});

test('A8 — visibilidade inválida rebenta MESMO num evento que não é resultado', () => {
  // antes: a validação vivia dentro do ramo dos eventos de resultado, por isso
  // um valor bogus num `started` chegava intacto ao JSONL. Fail-open num campo
  // cuja razão de existir é ser fail-closed.
  assert.throws(
    () => seamless.ledgerAppend({ event: 'started', job_id: 'job-a8', visibilidade: 'publico' }),
    /visibilidade/i);
  assert.equal(lines().some((e) => e.job_id === 'job-a8'), false, 'não pode ter deixado rasto');

  seamless.ledgerAppend({ event: 'started', job_id: 'job-a8b', visibilidade: 'shareable' });
  assert.equal(eventoDoTipo('job-a8b', 'started').visibilidade, 'shareable',
    'declarada e válida continua a passar, mesmo fora de um evento de resultado');
});

test('A9 — o default é PROMOVIDO por um ator declarado que chegue depois', () => {
  seamless.ledgerAppend({ event: 'started', job_id: 'job-a9' });               // default system
  seamless.ledgerAppend({ event: 'step', job_id: 'job-a9', actor: { type: 'human', id: 'paulo' } });
  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a9' });             // herda

  const fim = eventoDoTipo('job-a9', 'collected');
  assert.equal(fim.actor.id, 'paulo', 'informação a chegar não é informação a mudar — promover é certo');
  assert.equal(fim.actor_porque, actorMod.PORQUE_DECLARADO);
});

test('A9b — declarado→OUTRO declarado não é silencioso, e o job continua de quem o pediu', () => {
  seamless.ledgerAppend({ event: 'dispatched', job_id: 'job-a9b', actor: { type: 'human', id: 'ana' } });
  seamless.ledgerAppend({ event: 'step', job_id: 'job-a9b', actor: { type: 'human', id: 'paulo' } });

  const intruso = eventoDoTipo('job-a9b', 'step');
  assert.equal(intruso.actor.id, 'paulo', 'o evento continua a dizer a verdade sobre si próprio');
  assert.ok(intruso.actor_reatribuido, 'a troca tem de ficar MARCADA — silenciosa é que não');
  assert.equal(intruso.actor_reatribuido.de.id, 'ana');

  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a9b' });
  assert.equal(eventoDoTipo('job-a9b', 'collected').actor.id, 'ana',
    'quem herda é quem PEDIU o job, não o último a falar');
});

test('A9c — mesmoActor ignora a origem: mudar de porta não é mudar de pessoa', () => {
  assert.equal(actorMod.mesmoActor({ type: 'human', id: 'paulo', origem: 'cc:f-mu0' },
    { type: 'human', id: 'paulo', origem: 'slack:U1' }), true);
  assert.equal(actorMod.mesmoActor({ type: 'human', id: 'paulo' },
    { type: 'agent', id: 'paulo' }), false, 'o tipo faz parte da identidade');
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

// ── ronda 3 · os dois ALTO do G4 #2 ───────────────────────────────────────
test('A10 — a porta principal NÃO carimba "declarado" quando ninguém declarou', async () => {
  // O ALTO #2 do crítico: o toolWork normalizava cedo e reencaminhava o objecto
  // JÁ normalizado; o toolDispatch via um actor não-nulo, concluía "então foi
  // declarado" e gravava PORQUE_DECLARADO num job onde ninguém declarou nada.
  // A opção A morria exactamente na porta que mais se usa.
  const { EventEmitter } = require('events');
  const { execFileSync } = require('child_process');
  // HOME próprio: os jobs dos testes acima não têm evento terminal, por isso o
  // selector de pastas vê tudo ocupado. Isolar é o padrão do board.test.js.
  const HOME10 = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-a10-'));
  const anterior = process.env.MOOTER_HOME;
  const raizAnterior = process.env.MOOTER_WORKTREE_ROOT;
  process.env.MOOTER_HOME = HOME10;
  process.env.MOOTER_WORKTREE_ROOT = HOME10;   // o guard só aceita pastas sob a raiz declarada
  const wt = path.join(HOME10, 'wt-a10');
  fs.mkdirSync(wt, { recursive: true });
  execFileSync('git', ['init', '-q', wt]);

  seamless.setJobSpawner(() => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stdout.pipe = () => {};
    c.stderr = new EventEmitter(); c.stderr.pipe = () => {};
    c.kill = () => { c.emit('close', 137); };
    setImmediate(() => c.emit('spawn'));
    return c;
  });
  try {
    const r = await seamless.toolWork({
      goal: 'sem ator declarado', agent: 'cc', worktree: wt, wave: 'w-a10', prepare: false,
    });
    assert.ok(!r.erro && !r.error,
      'o dispatch não pode ter sido recusado: ' + String(r.error).slice(0, 300));
    const linhas10 = fs.readFileSync(path.join(HOME10, 'ledger.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const ev = linhas10.find((e) => e.event === 'dispatched');
    assert.ok(ev, 'o dispatch tem de ter chegado ao ledger');
    assert.deepStrictEqual(ev.actor, { type: 'system', id: 'system', origem: null });
    assert.equal(ev.actor_porque, actorMod.PORQUE_DEFAULT,
      'ninguém declarou — dizer "declarado por quem disparou" seria mentira gravada');
  } finally {
    seamless.setJobSpawner(null);
    if (anterior == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = anterior;
    if (raizAnterior == null) delete process.env.MOOTER_WORKTREE_ROOT;
    else process.env.MOOTER_WORKTREE_ROOT = raizAnterior;
    // NÃO se apaga o HOME10: o job simulado ainda tem streams abertos sobre
    // out.log/err.log, e apagar a pasta debaixo deles dava um ENOENT assíncrono
    // DEPOIS do teste acabar — verde no teste, uncaughtException no ficheiro.
    // É um tmpdir do SO; deixá-lo é mais barato do que uma corrida.
  }
});

test('A11 — a imutabilidade do dono sobrevive a um REINÍCIO', () => {
  // O ALTO #1 do crítico: a regra "o job é de quem o pediu" só vivia no mapa em
  // memória. Um processo novo relia o ledger, encontrava o evento MAIS RECENTE e
  // adoptava-o como dono — bastava reiniciar para o último a falar ganhar.
  // Estes eventos vão DIRECTOS ao ficheiro: é o que outro processo veria.
  const base = { cargo: null, local: false };
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T09:00:00.000Z', event: 'dispatched', job_id: 'job-a11', ...base,
    actor: { type: 'human', id: 'ana', origem: null }, actor_porque: actorMod.PORQUE_DECLARADO,
  }) + '\n');
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T09:05:00.000Z', event: 'step', job_id: 'job-a11', ...base,
    actor: { type: 'human', id: 'paulo', origem: null }, actor_porque: actorMod.PORQUE_DECLARADO,
  }) + '\n');

  seamless.ledgerAppend({ event: 'done', job_id: 'job-a11', exit_code: 0 });
  assert.equal(eventoDoTipo('job-a11', 'done').actor.id, 'ana',
    'quem herda continua a ser quem PEDIU, mesmo vindo do ficheiro e não da memória');
});

test('A12 — uma linha ilegível não APAGA o ator válido que veio antes', () => {
  // MÉDIO do G4 #2: o saneamento parava no evento estragado mais recente, e o job
  // caía em system/default apesar de ter um ator válido antes. Trocar um crash
  // por uma mentira é a pior das duas — a procura tem de SALTAR a linha má.
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T09:00:00.000Z', event: 'dispatched', job_id: 'job-a12', cargo: null, local: false,
    actor: { type: 'human', id: 'ana', origem: null }, actor_porque: actorMod.PORQUE_DECLARADO,
  }) + '\n');
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T09:05:00.000Z', event: 'step', job_id: 'job-a12', cargo: null, local: false,
    actor: { id: 'estragado-sem-type' },
  }) + '\n');

  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a12' });
  const ev = eventoDoTipo('job-a12', 'collected');
  assert.equal(ev.actor.id, 'ana', 'o ator válido anterior tem de sobreviver à linha estragada');
  assert.equal(ev.actor_porque, actorMod.PORQUE_DECLARADO);
});

test('A13 — o porque só existe ao lado de um ator LEGÍVEL', () => {
  // MÉDIO do G4 #2: as seis projecções guardavam com `actor == null`, e um ator
  // presente mas malformado não é null — passava o porque enquanto o ator
  // degradava para legacy. "declarado por quem disparou" ao lado de `legacy`.
  assert.equal(actorMod.porqueDoEvento({ actor_porque: actorMod.PORQUE_DECLARADO }), null,
    'sem ator não há porque');
  assert.equal(actorMod.porqueDoEvento({
    actor: { id: 'sem-type' }, actor_porque: actorMod.PORQUE_DECLARADO }), null,
  'ator ilegível degrada para legacy — o porque tem de cair com ele');
  assert.equal(actorMod.porqueDoEvento({
    actor: { type: 'human', id: 'ana' }, actor_porque: actorMod.PORQUE_DECLARADO }),
  actorMod.PORQUE_DECLARADO);
});

// ── ronda 4 · a regra de propriedade passa a ter UMA casa ─────────────────
test('A14 — substituiDono: promove, prefere o mais antigo, e não se deixa roubar', () => {
  const ana = { actor: { type: 'human', id: 'ana' }, porque: actorMod.PORQUE_DECLARADO, ts: 1000 };
  const paulo = { actor: { type: 'human', id: 'paulo' }, porque: actorMod.PORQUE_DECLARADO, ts: 2000 };
  const sistema = { actor: actorMod.ACTOR_SYSTEM, porque: actorMod.PORQUE_DEFAULT, ts: 500 };

  assert.equal(actorMod.substituiDono(null, ana), true, 'sem dono, o primeiro fica');
  assert.equal(actorMod.substituiDono(sistema, ana), true, 'declarado PROMOVE um default, mesmo sendo posterior');
  assert.equal(actorMod.substituiDono(ana, sistema), false, 'nunca se despromove um declarado');
  assert.equal(actorMod.substituiDono(paulo, ana), true, 'entre iguais ganha o mais ANTIGO');
  assert.equal(actorMod.substituiDono(ana, paulo), false, 'o job é de quem o pediu');
});

test('A14b — um timestamp inválido NÃO rouba o job, e o empate é determinístico', () => {
  const ana = { actor: { type: 'human', id: 'ana' }, porque: actorMod.PORQUE_DECLARADO, ts: 1000 };
  const semRelogio = { actor: { type: 'human', id: 'x' }, porque: actorMod.PORQUE_DECLARADO, ts: null };
  const empate = { actor: { type: 'human', id: 'y' }, porque: actorMod.PORQUE_DECLARADO, ts: 1000 };

  // `Date.parse(x) || 0` punha o lixo em 0 — antes de qualquer ISO válido
  assert.equal(actorMod.tsDoEvento({ ts: 'not-a-date' }), null, 'lixo não é um relógio');
  assert.equal(actorMod.tsDoEvento({}), null);
  assert.equal(actorMod.substituiDono(ana, semRelogio), false, 'sem relógio não se rouba a quem o tem');
  assert.equal(actorMod.substituiDono(semRelogio, ana), true, 'mas um relógio válido ganha a quem não tem');
  assert.equal(actorMod.substituiDono(ana, empate), false,
    'empate real => fica o incumbente; é isto que torna o resultado imune à ordem de leitura');
});

test('A15 — fleet, aprender e a releitura concordam sobre o dono do MESMO job', () => {
  // Era este o ALTO 2: cada sítio tinha a sua regra, e o mesmo job podia
  // aparecer com donos diferentes conforme quem o projectava. Agora todos
  // chamam a mesma função — e este teste é a prova, não a promessa.
  const fleet = require('./fleet.js');
  const aprender = require('./aprender.js');
  const ana = { type: 'human', id: 'ana', origem: null };
  const paulo = { type: 'human', id: 'paulo', origem: null };
  const D = actorMod.PORQUE_DECLARADO;

  // de propósito FORA de ordem: o dispatched é anterior mas vem depois no array
  const eventos = [
    { job_id: 'j-cross', event: 'step', ts: '2026-08-15T10:05:00.000Z', actor: paulo, actor_porque: D },
    { job_id: 'j-cross', event: 'dispatched', ts: '2026-08-15T10:00:00.000Z', actor: ana, actor_porque: D },
    { job_id: 'j-cross', event: 'done', ts: '2026-08-15T10:09:00.000Z', exit_code: 0, actor: paulo, actor_porque: D },
  ];

  const doFleet = fleet.foldJobs(eventos)[0].actor;
  const doAprender = aprender._jobRecords({ ledger: eventos })
    .find((r) => r.job_id === 'j-cross').actor;

  for (const ev of eventos) fs.appendFileSync(LEDGER, JSON.stringify(ev) + '\n');
  seamless.ledgerAppend({ event: 'collected', job_id: 'j-cross' });
  const daReleitura = eventoDoTipo('j-cross', 'collected').actor;

  assert.equal(doFleet.id, 'ana', 'fleet');
  assert.equal(doAprender.id, 'ana', 'aprender — era aqui que o último a falar ainda ganhava');
  assert.equal(daReleitura.id, 'ana', 'releitura do ledger');
  assert.deepStrictEqual(doFleet, doAprender);
  assert.deepStrictEqual(doAprender, daReleitura);
});

// ── ronda 5 · os três ALTO do G4 #4 ───────────────────────────────────────
test('A16 — o relógio do dono SOBREVIVE ao reinício, e o ladrão seguinte falha', () => {
  // O A11 provava que o dono sobrevivia, mas não que o RELÓGIO dele sobrevivia:
  // o dimensoesPersistidas calculava o ts e não o devolvia, por isso o primeiro
  // evento pós-reinício com outro ator declarado ainda roubava o job.
  const D = actorMod.PORQUE_DECLARADO;
  const base = { cargo: null, local: false };
  fs.appendFileSync(LEDGER, JSON.stringify({
    ts: '2026-08-15T08:00:00.000Z', event: 'dispatched', job_id: 'job-a16', ...base,
    actor: { type: 'human', id: 'ana', origem: null }, actor_porque: D,
  }) + '\n');

  // primeiro evento depois do "reinício" declara OUTRO ator — é este o ladrão
  seamless.ledgerAppend({
    event: 'step', job_id: 'job-a16', actor: { type: 'human', id: 'paulo', origem: null } });
  seamless.ledgerAppend({ event: 'collected', job_id: 'job-a16' });

  assert.equal(eventoDoTipo('job-a16', 'collected').actor.id, 'ana',
    'o relógio da Ana veio do ficheiro; o Paulo é posterior e não leva o job');
});

test('A17 — um relógio legítimo de 0 (epoch) não é confundido com ausência', () => {
  const D = actorMod.PORQUE_DECLARADO;
  const epoch = { actor: { type: 'human', id: 'ana' }, porque: D, ts: 0 };
  const umMsDepois = { actor: { type: 'human', id: 'paulo' }, porque: D, ts: 1 };
  // `x || null` mandava o 0 para null e o dono passava a "sem relógio"
  assert.equal(actorMod.substituiDono(epoch, umMsDepois), false,
    '1970 é um instante válido, não uma ausência de instante');
  assert.equal(actorMod.substituiDono(umMsDepois, epoch), true, 'e continua a ser o mais antigo');
});

test('A18 — `legacy` não é um dono: qualquer identidade conhecida ganha-lhe', () => {
  // As projecções semeiam legacy a partir do primeiro evento do job. Sem esta
  // regra, o legacy semeado ganhava a um ator real que chegasse depois sem
  // relógio — e o fleet dizia `legacy` onde a releitura dizia `system/default`.
  const legacy = { actor: actorMod.ACTOR_LEGACY, porque: null, ts: null };
  const defaultSemRelogio = { actor: actorMod.ACTOR_SYSTEM, porque: actorMod.PORQUE_DEFAULT, ts: null };
  assert.equal(actorMod.substituiDono(legacy, defaultSemRelogio), true,
    'uma ausência confessada perde para qualquer coisa que se saiba');
});

test('A18b — a divergência que o crítico construiu deixa de existir', () => {
  const fleet = require('./fleet.js');
  const aprender = require('./aprender.js');
  // histórico sem actor nem ts, seguido de um default também sem ts
  const eventos = [
    { job_id: 'j-div', event: 'dispatched' },
    { job_id: 'j-div', event: 'done', exit_code: 0,
      actor: actorMod.ACTOR_SYSTEM, actor_porque: actorMod.PORQUE_DEFAULT },
  ];
  const doFleet = fleet.foldJobs(eventos)[0].actor;
  const doAprender = aprender._jobRecords({ ledger: eventos }).find((r) => r.job_id === 'j-div').actor;

  for (const ev of eventos) fs.appendFileSync(LEDGER, JSON.stringify(ev) + '\n');
  seamless.ledgerAppend({ event: 'collected', job_id: 'j-div' });
  const daReleitura = eventoDoTipo('j-div', 'collected').actor;

  assert.deepStrictEqual(doFleet, doAprender, 'fleet e aprender têm de concordar');
  assert.deepStrictEqual(doAprender, daReleitura, 'e a releitura tem de concordar com eles');
  assert.equal(doFleet.id, 'system', 'há um ator conhecido no job — nenhum dos três pode dizer legacy');
});

test('A18c — ator malformado não entra em NENHUMA das três projecções', () => {
  const fleet = require('./fleet.js');
  const aprender = require('./aprender.js');
  const eventos = [
    { job_id: 'j-mal', event: 'dispatched', ts: '2026-08-15T08:00:00.000Z',
      actor: { id: 'sem-type' }, actor_porque: actorMod.PORQUE_DECLARADO },
  ];
  const doFleet = fleet.foldJobs(eventos)[0];
  const doAprender = aprender._jobRecords({ ledger: eventos }).find((r) => r.job_id === 'j-mal');

  assert.equal(doFleet.actor.id, 'legacy', 'ilegível degrada — não se promove a dono');
  assert.equal(doFleet.actor_porque, null, 'e o porque cai com ele');
  assert.equal(doAprender.actor.id, 'legacy');
  assert.equal(doAprender.actor_porque, null);
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
