'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Testes da porta de despacho.
 *
 * `toolWork` entra injectado — e o ponto: em MODO CONSTRUCAO nenhum destes
 * testes despacha nada a serio, e mesmo assim provam-se as barreiras que so
 * importam quando ha dinheiro em jogo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { criarDespachador, CAMPOS_PARA_O_MOTOR } = require('./despacho.js');
const gate = require('./gate.js');
const { criarPublicador } = require('./publicar.js');

function comSync(conteudo) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-desp-'));
  const p = path.join(d, 'SYNC.md');
  fs.writeFileSync(p, conteudo);
  return p;
}
const DESTRAVADO = () => comSync('# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n');
/** Spike destravado E o kimi readmitido — as DUAS linhas, que sao independentes. */
const KIMI_READMITIDO = () => comSync(
  '# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n' + gate.LINHA_KIMI + '\n');
const TRANCADO = () => comSync('# SYNC\n\na kimi-egress ainda manda.\n');

const PEDIDO = { goal: 'arruma os testes', agent: 'cc', wave: 'slack-spike',
  actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' } };

test('despachar · com o SYNC.md trancado NAO chama o motor (o gate e por despacho, nao por processo)', async () => {
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: TRANCADO(),
    toolWork: async () => { chamou = true; return { job_id: 'job-1' }; } });
  const r = await despachar(PEDIDO);
  assert.equal(chamou, false);
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /trancado/i);
});

test('despachar · destravado, chama o motor UMA vez e devolve o job_id', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'job-42' }; } });
  assert.equal((await despachar(PEDIDO)).job_id, 'job-42');
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].actor.id, 'slack:U_PAULO');
});

test('despachar · o gate reabre: um SYNC.md que perde a linha volta a trancar', async () => {
  const syncPath = DESTRAVADO();
  const { despachar } = criarDespachador({ syncPath, toolWork: async () => ({ job_id: 'job-1' }) });
  assert.equal((await despachar(PEDIDO)).job_id, 'job-1');
  fs.writeFileSync(syncPath, '# SYNC\n\nreabri a frente.\n');
  assert.equal((await despachar(PEDIDO)).job_id, null);
});

test('despachar · thread_context nao chega ao motor: morre na allowlist de saida', async () => {
  let recebido = null;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { recebido = a; return { job_id: 'job-1' }; } });
  const r = await despachar(Object.assign({}, PEDIDO, {
    thread_context: ['o que se disse no canal antes'] }));
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /thread_context/);
  assert.equal(recebido, null, 'o motor nem foi chamado');
});

test('despachar · a allowlist de saida e a simetrica da de publicacao', () => {
  assert.deepEqual([...CAMPOS_PARA_O_MOTOR].sort(), ['actor', 'agent', 'goal', 'wave']);
});

test('despachar · o erro do motor sai em porque_local, e o publicar RECUSA publica-lo', async () => {
  const goalSecreto = 'migra a base de dados de producao';
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => ({ error: 'recusado: "' + goalSecreto + '" tem um caracter reservado' }) });
  const r = await despachar(PEDIDO);
  assert.equal(r.job_id, null);
  assert.ok(r.porque_local.includes(goalSecreto), 'o erro do motor cita o goal — e o problema');

  // e e por isso que o nome do campo importa: a porta de saida recusa-o
  const pub = criarPublicador({ dryRun: true });
  const p = pub.publicar({ tipo: 'estado', job_id: 'j', porque_local: r.porque_local });
  assert.equal(p.publicado, false);
  assert.match(p.porque, /fora da allowlist/);
});

test('despachar · toolWork que rebenta nao rebenta o handler', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { throw new Error('o motor caiu'); } });
  const r = await despachar(PEDIDO);
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /o motor caiu/);
});

test('despachar · toolWork sem job_id nao inventa um', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(), toolWork: async () => ({}) });
  assert.equal((await despachar(PEDIDO)).job_id, null);
});

test('despachar · goal vazio nao chega ao motor', async () => {
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { chamou = true; return { job_id: 'j' }; } });
  assert.equal((await despachar({ goal: '   ', agent: 'cc', wave: 'w', actor: null })).job_id, null);
  assert.equal(chamou, false);
});

test('criarDespachador · sem toolWork ou sem syncPath nao se monta', () => {
  assert.throws(() => criarDespachador({ syncPath: DESTRAVADO() }), /toolWork/);
  assert.throws(() => criarDespachador({ toolWork: async () => ({}) }), /syncPath/);
});

// ── CONDICAO DURA DO GO CONDICIONADO (Cowork, 2026-08-17) ─────────────────
// O ALTO de CODIGO aberto da kimi-egress vive so no caminho kimi/Moonshot. A
// condicao do GO e que o spike o exclua POR CONSTRUCAO, com prova. Estes testes
// SAO essa prova: se alguem tirar a barreira, a suite fica vermelha.
const { MOTORES_PERMITIDOS, MOTORES_EXCLUIDOS, MOTORES_CONDICIONADOS,
  validarMotor } = require('./despacho.js');

test('A6a · agent:"kimi" e recusado enquanto a CONDICAO nao estiver escrita, e o motor NUNCA e chamado', async () => {
  // A barreira mudou de forma, nao desapareceu. A linha de destrave do spike
  // esta no SYNC (`DESTRAVADO`) e NAO chega: sao condicoes independentes, e
  // reutilizar aquela seria chamar condicional a uma aceitacao incondicional.
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { chamou = true; return { job_id: 'job-kimi' }; } });
  const r = await despachar(Object.assign({}, PEDIDO, { agent: 'kimi' }));
  assert.equal(r.job_id, null);
  assert.equal(chamou, false, 'o kimi nao pode chegar ao toolWork — o ALTO vive la dentro');
  assert.match(r.porque_local, /CONDICIONADO/);
  assert.match(r.porque_local, /kimi-egress/);
  assert.match(r.porque_local, /veto em main/i, 'a recusa tem de NOMEAR o gesto que a levanta');
});

test('A6a · ACEITACAO: com a linha de readmissao no SYNC, o kimi passa e chega ao motor', async () => {
  // Este e o teste que faltava. Sem ele, "aceitacao condicionada" seria so uma
  // recusa com prosa nova — e nada provaria que a condicao alguma vez abre.
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: KIMI_READMITIDO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'job-kimi' }; } });
  const r = await despachar(Object.assign({}, PEDIDO, { agent: 'kimi' }));
  assert.equal(r.job_id, 'job-kimi');
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].agent, 'kimi');
});

test('A6a · as duas condicoes sao INDEPENDENTES nos dois sentidos', async () => {
  // So a linha do kimi, sem o destrave do spike: o gate do MODO VIVO manda
  // primeiro e o despacho morre la — fechar uma frente nao destrava a outra.
  const soKimi = comSync('# SYNC\n\n' + gate.LINHA_KIMI + '\n');
  const { despachar } = criarDespachador({ syncPath: soKimi,
    toolWork: async () => { throw new Error('nunca devia ser chamado'); } });
  const r = await despachar(Object.assign({}, PEDIDO, { agent: 'kimi' }));
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /MODO VIVO trancado/);
});

test('A6a · fail-closed: sem gate/syncPath, ou com a condicao a rebentar, o kimi fica fora', () => {
  assert.equal(validarMotor('kimi').ok, false, 'sem contexto nao ha como verificar — recusa');
  const rebenta = { kimiReadmitido: () => { throw new Error('boom'); } };
  const r = validarMotor('kimi', { gate: rebenta, syncPath: '/qualquer' });
  assert.equal(r.ok, false);
  assert.match(r.porque, /rebentou/, 'uma condicao que rebenta e uma condicao NAO cumprida');
  // Um motor sem condicao nao paga o preco de existir condicoes.
  assert.equal(validarMotor('cc').ok, true);
});

test('A6a · a condicao nao se contorna com maiusculas nem espacos — nos dois sentidos', async () => {
  const trancado = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { throw new Error('nunca devia ser chamado'); } });
  for (const v of ['KIMI', ' kimi ', 'Kimi', 'kImI']) {
    const r = await trancado.despachar(Object.assign({}, PEDIDO, { agent: v }));
    assert.equal(r.job_id, null, 'passou sem condicao: ' + JSON.stringify(v));
    assert.match(r.porque_local, /CONDICIONADO/);
  }
  // E com a condicao cumprida, a normalizacao tambem nao pode inventar recusas.
  const aberto = criarDespachador({ syncPath: KIMI_READMITIDO(),
    toolWork: async () => ({ job_id: 'job-kimi' }) });
  for (const v of ['KIMI', ' kimi ', 'Kimi', 'kImI']) {
    const r = await aberto.despachar(Object.assign({}, PEDIDO, { agent: v }));
    assert.equal(r.job_id, 'job-kimi', 'recusou com condicao cumprida: ' + JSON.stringify(v));
  }
});

test('GO · e uma ALLOWLIST: um vendor novo e recusado sem alguem o ter de proibir', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { throw new Error('nunca devia ser chamado'); } });
  const r = await despachar(Object.assign({}, PEDIDO, { agent: 'vendor-novo-qualquer' }));
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /fora da allowlist de motores/);
});

test('GO · motor ausente e recusado (um default e por onde um vendor entra amanha)', async () => {
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async () => { throw new Error('nunca devia ser chamado'); } });
  for (const p of [{ agent: undefined }, { agent: null }, { agent: '  ' }]) {
    const r = await despachar(Object.assign({}, PEDIDO, p));
    assert.equal(r.job_id, null);
    assert.match(r.porque_local, /sem motor declarado/);
  }
});

test('GO · o motor que a demo usa (cc) passa, e chega normalizado ao nucleo', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'job-cc' }; } });
  assert.equal((await despachar(Object.assign({}, PEDIDO, { agent: ' CC ' }))).job_id, 'job-cc');
  assert.equal(vistos[0].agent, 'cc');
});

test('A6a · "kimi" e CONDICIONADO em codigo, nao num comentario', () => {
  assert.ok(MOTORES_PERMITIDOS.includes('kimi'), 'foi readmitido na allowlist por decisao do dono');
  assert.ok(!Object.prototype.hasOwnProperty.call(MOTORES_EXCLUIDOS, 'kimi'),
    'deixou de ser exclusao dura — se voltasse aqui, a condicao nunca chegaria a ser lida');
  const c = MOTORES_CONDICIONADOS.kimi;
  assert.ok(c && typeof c.verificar === 'function', 'a condicao tem de ser codigo executavel');
  assert.match(c.contexto, /kimi-egress/, 'a condicao tem de dizer o que a levanta');
  assert.equal(validarMotor('cc').ok, true);
});

test('A6a · a mecanica de exclusao DURA continua de pe para o proximo vendor', () => {
  // O `MOTORES_EXCLUIDOS` ficou vazio. Um objecto vazio e indistinguivel de um
  // mecanismo apagado, e o proximo vendor que precise dele merece encontra-lo a
  // funcionar — nao descobri-lo partido no dia em que for preciso.
  assert.deepEqual(Object.keys(MOTORES_EXCLUIDOS), [], 'nenhum motor esta hoje excluido a duro');
  assert.equal(validarMotor('vendor-desconhecido').ok, false,
    'a allowlist continua a recusar quem nao esta la — e isso nao depende do MOTORES_EXCLUIDOS');
});

// ── onde o agente escreve ─────────────────────────────────────────────────
// O 1o despacho real falhou em «worktree fora da raiz permitida»: o toolWork
// resolve `(ctx && ctx.folder) || REPO` e herdou uma pasta ambiente. O spike passou
// a dizer onde quer trabalhar — por CONFIGURACAO, nunca pelo pedido.
test('worktree · vai por configuracao para o motor', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(), worktree: 'C:\\wt\\demo',
    toolWork: async (a) => { vistos.push(a); return { job_id: 'j' }; } });
  await despachar(PEDIDO);
  assert.equal(vistos[0].worktree, 'C:\\wt\\demo');
});

test('worktree · NAO se aceita do pedido: quem menciona nao escolhe onde se escreve', async () => {
  let chamou = false;
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(), worktree: 'C:\\wt\\demo',
    toolWork: async () => { chamou = true; return { job_id: 'j' }; } });
  const r = await despachar(Object.assign({}, PEDIDO, { worktree: 'C:\\Users\\Paulo\\paulo-vault' }));
  assert.equal(r.job_id, null);
  assert.match(r.porque_local, /fora da allowlist de despacho/);
  assert.equal(chamou, false, 'nem chegou ao motor');
});

test('worktree · sem configuracao nao se inventa uma (o motor mantem o seu default)', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'j' }; } });
  await despachar(PEDIDO);
  assert.ok(!('worktree' in vistos[0]));
});

// ── matar os 20s (decisao de maestro: matar, nunca decorar) ────────────────
// A preparacao local expirou em TODOS os despachos T2/T3 medidos: 20 segundos em
// que o sistema nao trabalha, esta a desistir. Verificado em seamless.js que
// `wantsPrepare = pre_digest && agent !== 'moo'` — logo o skip so afecta T2/T3,
// e o caminho local (T0) nunca teve prep para perder.
test('prep · o despacho do Slack manda pre_digest:false (mata os 20s)', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(), preDigest: false,
    toolWork: async (a) => { vistos.push(a); return { job_id: 'j' }; } });
  await despachar(PEDIDO);
  assert.equal(vistos[0].pre_digest, false, 'sem isto voltam os 20 segundos de espera');
});

test('prep · por omissao NAO se mexe no comportamento do motor', async () => {
  const vistos = [];
  const { despachar } = criarDespachador({ syncPath: DESTRAVADO(),
    toolWork: async (a) => { vistos.push(a); return { job_id: 'j' }; } });
  await despachar(PEDIDO);
  assert.ok(!('pre_digest' in vistos[0]), 'o default do motor manda quando ninguem decide');
});
