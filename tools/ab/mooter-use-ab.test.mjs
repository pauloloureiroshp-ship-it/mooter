/**
 * Testes do controlador do R-24.
 *
 * Regra desta suite: cada teste tem de MORDER. Um teste que passa contra o
 * defeito que diz impedir não é um teste — é decoração. Os quatro casos
 * centrais correspondem às quatro guardas do controlador, e cada um cita o
 * defeito medido que o originou.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coeficiente, caudaSuperior, limiarMinimo, potencia,
  zDaTarefa, atribuicao, validarCorrida, ambienteApto,
  correrBraco, correrAceitacao, instalarTesteDeAceitacao, analisar,
  TECTO_S, RATIO_Z,
} from './mooter-use-ab.mjs';

const perto = (a, b, casas = 5) => assert.equal(a.toFixed(casas), b.toFixed(casas));

// ── A estatística bate com o pré-registo, à quinta casa ───────────────────

test('a binomial reproduz os números do pré-registo', () => {
  perto(caudaSuperior(16, 23, 0.5), 0.04657);
  perto(caudaSuperior(15, 23, 0.5), 0.10502);
  perto(caudaSuperior(17, 23, 0.5), 0.01734);
  perto(potencia(16, 23, 0.75), 0.80370);
});

test('16 é o MENOR limiar admissível — 15 viola o alfa', () => {
  assert.equal(limiarMinimo(23, 0.5, 0.05), 16);
  assert.ok(caudaSuperior(15, 23, 0.5) > 0.05, '15 tinha de violar o alfa, senão o limiar estava mal escolhido');
  assert.ok(caudaSuperior(16, 23, 0.5) <= 0.05);
});

test('coeficiente binomial exacto', () => {
  assert.equal(coeficiente(23, 0), 1);
  assert.equal(coeficiente(23, 23), 1);
  assert.equal(coeficiente(23, 11), 1352078);
  assert.equal(coeficiente(23, 12), 1352078);
});

/**
 * MORDIDA nº 1 — a direcção.
 *
 * A mcnemar() do harness antigo (mooter-vs-sem.mjs:444) devolve o MESMO p para
 * 16-7 (vitória) e 7-16 (derrota), porque usa k = Math.min(soA, soB) e duplica
 * a cauda. O atalho de dividir por dois declara vitória numa derrota. Este
 * teste falha contra qualquer implementação bilateral.
 */
test('MORDE: uma derrota de 7-16 não pode dar o mesmo p que uma vitória de 16-7', () => {
  const pVitoria = caudaSuperior(16, 23, 0.5);
  const pDerrota = caudaSuperior(7, 23, 0.5);
  assert.ok(pVitoria < 0.05, `vitória tem de ser significativa: ${pVitoria}`);
  assert.ok(pDerrota > 0.9, `derrota tem de ser altamente não-significativa: ${pDerrota}`);
  assert.notEqual(pVitoria.toFixed(5), pDerrota.toFixed(5));
});

// ── Z: a conjunção é obrigatória ──────────────────────────────────────────

test('Z=1 só quando o ON é mais rápido E passa mecanicamente', () => {
  assert.equal(zDaTarefa({ on: { tva_s: 100, aceite: true }, off: { tva_s: 200, aceite: true } }).z, 1);
});

/**
 * MORDIDA nº 2 — o ON rápido-e-errado.
 *
 * Sem a conjunção, um braço que desiste depressa e falha o teste marcava
 * sucesso, porque 10 <= 0,8 × 200. É o modo de falha mais provável de um
 * agente com pressa.
 */
test('MORDE: um ON rapidíssimo que NÃO passa o teste marca 0, não 1', () => {
  const r = zDaTarefa({ on: { tva_s: 10, aceite: false }, off: { tva_s: 200, aceite: true } });
  assert.equal(r.z, 0);
  assert.equal(r.motivo, 'on_nao_passou');
});

test('o limiar dos 20% é exacto, não aproximado', () => {
  assert.equal(zDaTarefa({ on: { tva_s: 80, aceite: true }, off: { tva_s: 100, aceite: true } }).z, 1, '80 = 0,8×100 conta');
  assert.equal(zDaTarefa({ on: { tva_s: 80.1, aceite: true }, off: { tva_s: 100, aceite: true } }).z, 0);
  assert.equal(RATIO_Z, 0.8);
});

test('um par com corrida inválida não vira zero — vira null', () => {
  const r = zDaTarefa({ on: { invalido: true }, off: { tva_s: 100, aceite: true } });
  assert.equal(r.z, null, 'inválido tem de ser distinguível de derrota');
});

// ── Validação de corrida ──────────────────────────────────────────────────

/**
 * MORDIDA nº 3 — a corrida que nunca chegou ao modelo.
 *
 * Medido 2026-09-03: `claude -p` de dentro de uma sessão devolve is_error:true
 * com duration_api_ms:0, input_tokens:0 — e o processo sai com 0. Contar isto
 * como TVA=1800 enviesaria o braço em que a autenticação partiu.
 */
test('MORDE: o JSON real de uma falha de autenticação é INVÁLIDO, não uma falha', () => {
  const real = {
    is_error: true, duration_api_ms: 0, num_turns: 1,
    usage: { input_tokens: 0, output_tokens: 0 },
    terminal_reason: 'api_error', subtype: 'success',
    result: 'Failed to authenticate: OAuth session expired',
  };
  const v = validarCorrida(real);
  assert.equal(v.invalido, true);
  assert.match(v.motivo, /cli_is_error/);
});

test('uma corrida sem tempo de API é inválida mesmo sem is_error', () => {
  assert.equal(validarCorrida({ is_error: false, duration_api_ms: 0, usage: { input_tokens: 500 } }).motivo, 'duration_api_ms_zero');
});

test('uma corrida sem tokens de entrada é inválida', () => {
  assert.equal(validarCorrida({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 0 } }).motivo, 'input_tokens_zero');
});

test('uma corrida boa passa', () => {
  assert.equal(validarCorrida({ is_error: false, duration_api_ms: 4200, usage: { input_tokens: 1200 } }).invalido, false);
});

// ── Ambiente ──────────────────────────────────────────────────────────────

/**
 * MORDIDA nº 4 — correr dentro de uma sessão Claude Code.
 *
 * É o cenário que produziria 46 corridas vazias que se parecem com dados.
 */
test('MORDE: recusa correr dentro de uma sessão Claude Code', () => {
  const r = ambienteApto({ CLAUDE_CODE_CHILD_SESSION: '1', PATH: '/x' });
  assert.equal(r.apto, false);
  assert.match(r.motivo, /CLAUDE_CODE_CHILD_SESSION/);
});

test('um terminal normal é apto', () => {
  assert.equal(ambienteApto({ PATH: '/x', HOME: '/h' }).apto, true);
});

// ── Atribuição ────────────────────────────────────────────────────────────

test('a seed é obrigatória — não há default escondido', () => {
  assert.throws(() => atribuicao(['a', 'b'], undefined), /seed obrigatória/);
  assert.throws(() => atribuicao(['a', 'b'], null), /seed obrigatória/);
});

test('a atribuição é determinística e equilibrada', () => {
  const ids = Array.from({ length: 23 }, (_, i) => `t${i}`);
  const a = atribuicao(ids, 42);
  const b = atribuicao(ids, 42);
  assert.deepEqual(a, b, 'mesma seed, mesma atribuição');
  const on = a.filter((x) => x.primeiro === 'ON').length;
  assert.equal(on, 12, '12 ON-primeiro / 11 OFF-primeiro, como o desenho fixa');
  assert.notDeepEqual(atribuicao(ids, 43), a, 'seed diferente, atribuição diferente');
});

// ── Braços, com costura de injecção (nenhum processo real é lançado) ──────

test('o braço OFF filtra as fontes de definições; o ON não', () => {
  const vistos = [];
  const spawnImpl = (cmd, args) => { vistos.push(args); return { status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 100, usage: { input_tokens: 10 }, session_id: 's' }) }; };
  let t = 0n; const clockImpl = () => (t += 1_000_000_000n);
  correrBraco({ braco: 'ON', prompt: 'p', cwd: '.', spawnImpl, clockImpl });
  correrBraco({ braco: 'OFF', prompt: 'p', cwd: '.', spawnImpl, clockImpl });
  assert.ok(!vistos[0].includes('--setting-sources'), 'o braço ON não filtra');
  assert.ok(vistos[1].includes('--setting-sources'), 'o braço OFF filtra');
  assert.ok(vistos[1].includes('project,local'));
});

test('um timeout do braço conta como TVA no tecto, e não como inválido', () => {
  const spawnImpl = () => ({ signal: 'SIGTERM', status: null, stdout: '' });
  let t = 0n; const clockImpl = () => (t += 5_000_000_000n);
  const r = correrBraco({ braco: 'ON', prompt: 'p', cwd: '.', spawnImpl, clockImpl });
  assert.equal(r.tva_s, TECTO_S);
  assert.equal(r.invalido, false, 'timeout é falha observada, não run inválido');
  assert.equal(r.motivo, 'timeout');
});

test('o relógio é o injectado, não o do sistema', () => {
  const spawnImpl = () => ({ status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 1, usage: { input_tokens: 1 } }) });
  let t = 0n; const clockImpl = () => { const v = t; t += 7_000_000_000n; return v; };
  const r = correrBraco({ braco: 'ON', prompt: 'p', cwd: '.', spawnImpl, clockImpl });
  assert.equal(r.tva_s, 7);
});

// ── Aceitação ─────────────────────────────────────────────────────────────

test('só exit 0 é aceite', () => {
  assert.equal(correrAceitacao({ cwd: '.', comando: 'x', args: [], spawnImpl: () => ({ status: 0 }) }).aceite, true);
  assert.equal(correrAceitacao({ cwd: '.', comando: 'x', args: [], spawnImpl: () => ({ status: 1 }) }).aceite, false);
  assert.equal(correrAceitacao({ cwd: '.', comando: 'x', args: [], spawnImpl: () => ({ signal: 'SIGTERM', status: null }) }).aceite, false);
});

/**
 * MORDIDA nº 5 — o PASSA falso.
 *
 * 268 de 379 candidatos MODIFICAM um teste já existente. O snapshot do pai traz
 * a versão fraca; sem substituição pelo teste do filho, o controlador declara
 * PASSA onde não há.
 */
test('MORDE: o teste de aceitação instalado é o do filho, e o seu sha vai para o ledger', () => {
  const escritos = [];
  const sha = instalarTesteDeAceitacao({
    snapshotDir: '/snap', ficheiroTeste: 'a/b.test.js', conteudo: 'assert(forte)',
    writeImpl: (p, c) => escritos.push({ p, c }), mkdirImpl: () => {},
  });
  assert.equal(escritos.length, 1);
  assert.match(escritos[0].p, /b\.test\.js$/);
  assert.equal(escritos[0].c, 'assert(forte)');
  assert.equal(sha.length, 64);
  assert.notEqual(sha, instalarTesteDeAceitacao({
    snapshotDir: '/snap', ficheiroTeste: 'a/b.test.js', conteudo: 'assert(fraco)',
    writeImpl: () => {}, mkdirImpl: () => {},
  }), 'shas diferentes para conteúdos diferentes');
});

// ── Análise ───────────────────────────────────────────────────────────────

test('16 vitórias em 23 ganham; 15 perdem', () => {
  const par = (z) => ({ on: { tva_s: z ? 10 : 100, aceite: true }, off: { tva_s: 100, aceite: true } });
  const ganha = analisar(Array.from({ length: 23 }, (_, i) => par(i < 16)));
  assert.equal(ganha.veredicto, 'GANHOU');
  assert.equal(ganha.X, 16);
  const perde = analisar(Array.from({ length: 23 }, (_, i) => par(i < 15)));
  assert.equal(perde.veredicto, 'PERDEU');
  assert.match(perde.motivo, /evidência simétrica/);
});

test('menos de 23 pares válidos é ENSAIO INVALIDO, nunca uma vitória', () => {
  const par = { on: { tva_s: 10, aceite: true }, off: { tva_s: 100, aceite: true } };
  const r = analisar(Array.from({ length: 22 }, () => par));
  assert.equal(r.veredicto, 'ENSAIO INVALIDO');
  assert.match(r.motivo, /subpotenciado/);
});

/**
 * MORDIDA nº 6 — não se reduz o n para ganhar.
 *
 * O desenho é explícito: «se não houver 23 pares válidos até ao dia 30, o único
 * resultado honesto é subpotenciado». 20 vitórias em 20 pares continuam a ser
 * um ensaio inválido, não uma vitória esmagadora.
 */
test('MORDE: 20 vitórias em 20 pares NÃO é vitória — é ensaio inválido', () => {
  const par = { on: { tva_s: 10, aceite: true }, off: { tva_s: 100, aceite: true } };
  const r = analisar(Array.from({ length: 20 }, () => par));
  assert.equal(r.veredicto, 'ENSAIO INVALIDO');
  assert.equal(r.X, 20);
});
