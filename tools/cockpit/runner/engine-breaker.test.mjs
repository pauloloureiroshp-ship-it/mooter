/**
 * engine-breaker.test.mjs — o apagao de 11 horas, reproduzido em milissegundos.
 *
 * O caso real: 1767 recibos consecutivos de `motor local indisponivel: fetch
 * failed`, de 2026-08-16T23:18:40Z a 2026-08-17T10:18:49Z. Cada um foi contado
 * como uma ronda. Estes testes existem para que essa forma de mentir ao ledger
 * nao possa voltar sem partir a suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createEngineBreaker,
  backoffSeconds,
  ENGINE_DOWN_AFTER,
  BACKOFF_BASE_S,
  BACKOFF_CAP_S,
} from './engine-breaker.mjs';

const iso = (s) => new Date(Date.UTC(2026, 7, 18, 0, 0, 0) + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const falha = (s) => ({ falha_motor: true, ts: iso(s), verdict: 'sem-achado', resultado_resumo: 'motor local indisponivel: fetch failed' });
// `motor_ok` e prova POSITIVA de que o motor respondeu. Um recibo sem ela nao
// fecha o disjuntor — ver o teste 'uma ronda que rebenta nao e um motor de volta'.
const boa = (s) => ({ motor_ok: true, ts: iso(s), verdict: 'citacao-ok', resultado_resumo: 'ACHADO: ...' });

test('backoff sobe em potencias de dois e para no tecto', () => {
  assert.equal(backoffSeconds(0), 0, 'sem falhas nao ha espera extra');
  assert.equal(backoffSeconds(1), BACKOFF_BASE_S);
  assert.equal(backoffSeconds(2), BACKOFF_BASE_S * 2);
  assert.equal(backoffSeconds(3), BACKOFF_BASE_S * 4);
  assert.equal(backoffSeconds(99), BACKOFF_CAP_S, 'um apagao longo nunca dorme mais do que o tecto');
  assert.ok(BACKOFF_CAP_S <= 15 * 60, 'o tecto e 15 minutos: acima disso o dono deixa de ver o regresso');
});

test('uma falha isolada continua a ser sinal — o ledger regista o blip', () => {
  const b = createEngineBreaker();
  const r = b.observe(falha(0), iso(0));
  assert.equal(r.recibos.length, 1);
  assert.equal(r.recibos[0].falha_motor, true, 'abaixo do limiar passa o recibo tal e qual');
  assert.equal(r.aberto, false);
  assert.equal(r.backoffS, BACKOFF_BASE_S, 'mesmo um blip abranda o martelo');
});

test('ACEITACAO: 200 rondas com o motor em baixo dao 3 linhas, nao 200', () => {
  const b = createEngineBreaker();
  const ledger = [];
  for (let n = 0; n < 200; n += 1) ledger.push(...b.observe(falha(n * 30), iso(n * 30)).recibos);

  assert.equal(ledger.length, ENGINE_DOWN_AFTER,
    `um apagao tem de custar ${ENGINE_DOWN_AFTER} linhas, aconteca ele 200 vezes ou 1767`);
  const evento = ledger.at(-1);
  assert.equal(evento.evento, 'engine:down');
  assert.equal(evento.inicio, iso(0), 'o engine:down carrega o instante em que o apagao COMECOU');
  assert.equal(evento.usd, 0);
  assert.ok(!ledger.some((r) => r.evento === 'engine:down' && r !== evento), 'so um engine:down por apagao');
});

test('o disjuntor aberto poe o ledger em silencio, nao o processo', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 50; n += 1) b.observe(falha(n * 30), iso(n * 30));
  const depois = b.observe(falha(9999), iso(9999));
  assert.deepEqual(depois.recibos, [], 'com o disjuntor aberto nao se grava mais nada');
  assert.equal(depois.aberto, true);
  assert.equal(depois.backoffS, BACKOFF_CAP_S, 'mas continua a tentar, devagar');
  assert.equal(b.estado.falhas, 51, 'e continua a CONTAR — o silencio nao e amnesia');
});

test('ACEITACAO: ao voltar, o engine:up traz a duracao real do apagao', () => {
  const b = createEngineBreaker();
  const ONZE_HORAS = 11 * 3600;
  for (let t = 0; t < ONZE_HORAS; t += 900) b.observe(falha(t), iso(t));
  const volta = b.observe(boa(ONZE_HORAS), iso(ONZE_HORAS));

  assert.equal(volta.recibos.length, 2, 'o engine:up e a ronda boa, por esta ordem');
  const [up, ronda] = volta.recibos;
  assert.equal(up.evento, 'engine:up');
  assert.equal(up.apagao_s, ONZE_HORAS, 'a duracao e medida do inicio ao regresso, nao estimada');
  assert.equal(up.inicio, iso(0));
  assert.ok(up.rondas_engolidas > 40, 'diz quantas rondas nao foram gravadas — o silencio e declarado');
  assert.equal(ronda.verdict, 'citacao-ok', 'a primeira ronda boa entra normalmente');
  assert.equal(volta.backoffS, 0, 'motor de volta, ritmo normal de volta');
  assert.equal(b.estado.aberto, false);
});

test('duas falhas separadas por sucesso NAO abrem o disjuntor', () => {
  const b = createEngineBreaker();
  const ledger = [];
  for (const r of [falha(0), boa(30), falha(60), boa(90), falha(120), boa(150)]) {
    ledger.push(...b.observe(r, r.ts).recibos);
  }
  assert.equal(ledger.length, 6, 'sem sequencia nao ha apagao: todos os recibos passam');
  assert.ok(!ledger.some((r) => r.evento), 'e nenhum evento de disjuntor e emitido');
  assert.equal(b.estado.falhas, 0);
});

test('um STOP do dono nao e um motor em baixo', () => {
  const b = createEngineBreaker();
  // runner-core so poe falha_motor quando NAO fomos nos a abortar por STOP.
  // `parado_pelo_dono` e agora a UNICA bandeira neutra. A versao anterior
  // tratava como neutro qualquer recibo sem bandeira — e media-se que uma
  // ronda sem contexto (pack.ok === false) escrevia 200 linhas com backoff
  // zero. O disjuntor passou a ser fail-closed: quem nao prova sucesso, falha.
  const abortadoPorStop = { parado_pelo_dono: true, ts: iso(0), verdict: 'sem-achado', resultado_resumo: 'STOP durante a geracao — ronda abortada' };
  const ledger = [];
  for (let n = 0; n < 20; n += 1) ledger.push(...b.observe(abortadoPorStop, iso(n)).recibos);
  assert.equal(ledger.length, 20, 'parar por vontade do dono e trabalho registado, nao avaria');
  assert.equal(b.estado.aberto, false);
});

test('a duracao do apagao usa UM relogio — nunca mistura o ts do recibo com o do ciclo', () => {
  const b = createEngineBreaker();
  // O recibo traz um ts de OUTRO relogio (no runner real vem do clock do
  // runRound). O disjuntor tem de ignorar esse e medir-se a si proprio.
  const doOutroRelogio = { falha_motor: true, ts: '2031-01-01T00:00:00Z' };
  for (let n = 0; n < 5; n += 1) b.observe(doOutroRelogio, iso(n * 60));
  const up = b.observe(boa(600), iso(600)).recibos[0];
  assert.equal(up.inicio, iso(0), 'o inicio e o instante em que o DISJUNTOR viu a primeira falha');
  assert.equal(up.apagao_s, 600);
});

test('duracao impossivel diz n/d em vez de zero — clampar a 0 e mentir com um numero', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 5; n += 1) b.observe(falha(n * 60), iso(600));
  const up = b.observe(boa(0), iso(0)).recibos[0]; // "fim" antes do "inicio"
  assert.equal(up.apagao_s, null);
  assert.match(up.resultado_resumo, /n\/d/);
});


test('uma ronda que REBENTA nao fecha o disjuntor nem inventa um engine:up', () => {
  // 12 crashes seguidos escreviam 12 recibos sem backoff nenhum, e um crash
  // durante um apagao emitia `engine:up` com `apagao_s` inventado enquanto o
  // motor continuava morto. Fabricar uma metrica e o unico pecado que a
  // doutrina nomeia pelo nome.
  const b = createEngineBreaker();
  const crash = (s) => ({ falha_ronda: true, ts: iso(s), resultado_resumo: 'ronda rebentou: ReferenceError' });
  const ledger = [];
  for (let n = 0; n < 12; n += 1) ledger.push(...b.observe(crash(n * 30), iso(n * 30)).recibos);
  assert.equal(ledger.length, ENGINE_DOWN_AFTER, 'um ciclo de crashes tem de ser travado como um apagao');
  assert.equal(b.observe(crash(999), iso(999)).backoffS, BACKOFF_CAP_S, 'e tem de abrandar, nao martelar');
  assert.ok(!ledger.some((r) => r.evento === 'engine:up'), 'nunca um regresso que nao aconteceu');
});

test('um STOP em voo nao fecha um disjuntor aberto', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 5; n += 1) b.observe(falha(n * 30), iso(n * 30));
  const abortado = { parado_pelo_dono: true, ts: iso(600), verdict: 'sem-achado', resultado_resumo: 'STOP durante a geracao' };
  const r = b.observe(abortado, iso(600));
  assert.ok(!r.recibos.some((x) => x.evento === 'engine:up'), 'nao provou que o motor voltou');
  assert.equal(b.estado.aberto, true);
});

test('uma violacao do $0 NUNCA e silenciada, nem com o disjuntor aberto', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 20; n += 1) b.observe(falha(n * 30), iso(n * 30));
  assert.equal(b.estado.aberto, true);
  const violacao = { violacao_zero: true, ts: iso(700), resultado_resumo: 'VIOLACAO $0: motor tem de ser http loopback' };
  const r = b.observe(violacao, iso(700));
  assert.deepEqual(r.recibos, [violacao], 'a promessa central do runner nunca sai calada');
});

test('rondas_engolidas conta o que NAO foi gravado, nao o total de falhas', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 5; n += 1) b.observe(falha(n * 30), iso(n * 30));
  const up = b.observe(boa(600), iso(600)).recibos[0];
  // 5 falhas: 2 gravadas + 1 engine:down + 2 engolidas de facto.
  assert.equal(b.estado.falhas, 0, 'reset apos o regresso');
  assert.equal(up.rondas_engolidas, 2, 'inflacionar o numero no proprio recibo que o publica seria o pecado do ficheiro ao lado');
});

test('ACEITACAO: um recibo SEM bandeira nenhuma e travado, nao ignorado', () => {
  // Medido a 2026-08-18: 200 rondas com `falha_motor` davam 3 linhas, e 200
  // rondas SEM bandeira davam 200 linhas com backoff ZERO. O B8 fazia o que
  // prometia e a porta ao lado estava aberta — uma ronda sem contexto
  // (`pack.ok === false`) inundava o ledger exactamente como o apagao.
  const b = createEngineBreaker();
  const ledger = [];
  for (let n = 0; n < 200; n += 1) {
    ledger.push(...b.observe({ ts: iso(n * 30), verdict: 'sem-citacao', resultado_resumo: 'sem contexto' }, iso(n * 30)).recibos);
  }
  assert.equal(ledger.length, ENGINE_DOWN_AFTER, 'quem nao prova sucesso, falha — fail-closed como o isStopped');
  assert.equal(b.observe({ ts: iso(9999) }, iso(9999)).backoffS, BACKOFF_CAP_S);
});
test('ACEITACAO: o evento diz de QUE morreu a ronda — nao chama motor a tudo', () => {
  // Medido no ledger vivo a 2026-08-18, com o motor a responder HTTP 200 e dois
  // pilares com o poco seco: saiu `engine:down — motor local em baixo`. Travar
  // era certo; o rotulo era uma mentira, e da mesma familia das que este runner
  // existe para caçar. Um disjuntor que trava bem e mente no nome so troca uma
  // inundacao por uma acusacao falsa.
  const casos = [
    [{ falha_motor: true }, 'engine:down', 'engine:up'],
    [{ esgotado: true, falha_ronda: true }, 'pilar:esgotado', 'pilar:retomado'],
    [{ falha_ronda: true }, 'ronda:falha', 'ronda:ok'],
  ];
  for (const [receipt, baixo, cima] of casos) {
    const b = createEngineBreaker();
    let evento = null;
    for (let n = 0; n < 10; n += 1) {
      for (const r of b.observe({ ...receipt, ts: iso(n * 30) }, iso(n * 30)).recibos) if (r.evento) evento = r;
    }
    assert.equal(evento.evento, baixo, JSON.stringify(receipt));
    assert.ok(!/motor local em baixo/.test(evento.resultado_resumo) || baixo === 'engine:down',
      'so o motor pode ser acusado de estar em baixo');
    const volta = b.observe(boa(600), iso(600)).recibos[0];
    assert.equal(volta.evento, cima);
    assert.equal(volta.classe, receipt.falha_motor ? 'motor' : (receipt.esgotado ? 'esgotado' : 'ronda'));
  }
});

test('a classe reinicia entre sequencias — um poco seco nao contamina o apagao seguinte', () => {
  const b = createEngineBreaker();
  for (let n = 0; n < 5; n += 1) b.observe({ esgotado: true, falha_ronda: true, ts: iso(n) }, iso(n));
  b.observe(boa(100), iso(100));
  let evento = null;
  for (let n = 0; n < 5; n += 1) {
    for (const r of b.observe(falha(200 + n), iso(200 + n)).recibos) if (r.evento) evento = r;
  }
  assert.equal(evento.evento, 'engine:down', 'a sequencia nova e do motor, e diz isso');
});

/**
 * Produzir `pilar:esgotado` no ledger nao e vigia-lo. Sem um consumidor que lhe
 * atribua consequencia, "o poco secou e alguem vai reagir" e indistinguivel de
 * "ha mais uma linha no feed". O teste pede deliberadamente um consumidor fora
 * do produtor; qual deve ser a consequencia e uma decisao de desenho.
 */
test.todo('F5/6: pilar:esgotado tem pelo menos um vigia fora do produtor', () => {
  const raiz = fileURLToPath(new URL('../../..', import.meta.url));
  const encontrados = execFileSync('git', ['grep', '-l', 'pilar:esgotado', '--', 'tools/cockpit'], {
    cwd: raiz, encoding: 'utf8',
  }).trim().split(/\r?\n/).filter(Boolean);
  const vigias = encontrados.filter((f) => !/engine-breaker(?:\.test)?\.mjs$/.test(f));
  assert.ok(vigias.length > 0, `so existe o produtor; nenhum vigia: ${encontrados.join(', ')}`);
});
