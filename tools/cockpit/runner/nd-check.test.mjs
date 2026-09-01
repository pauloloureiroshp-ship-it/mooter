/**
 * nd-check.test.mjs — o registo nao pode virar a segunda verdade.
 *
 * Um `n/d` sem prazo e uma divida sem credor; mas um REGISTO de dividas que
 * ninguem re-mede e pior — envelhece ao lado do mundo e passa a afirmar coisas
 * que ja nao sao verdade, no ficheiro cuja unica razao de existir e nao
 * afirmar o que nao mediu.
 *
 * Por isso os testes que interessam aqui sao dois: o verificador MEDE (nao le
 * um campo do proprio registo), e "nao consegui medir" NUNCA se converte em
 * "vencido".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const {
  lerRegisto, avaliar, diasAte, VERIFICADORES, podeAbrirIssue, corpoDaIssue,
  SEMANA_MS, REGISTO, REPO,
} = await import('./nd-check.mjs');

const AGORA = Date.parse('2026-09-01T12:00:00Z');

// ── o registo comitado ──────────────────────────────────────────────────────

test('o registo existe, e tem os quatro n/d que o kickoff nomeou', () => {
  const r = lerRegisto();
  const ids = r.entradas.map((e) => e.id).sort();
  assert.deepEqual(ids, [
    'ci-prs-no-ledger', 'eta-index-fora-das-2-chaves',
    'poupanca-por-tarefa', 'ttv-terceiro-humano',
  ]);
});

test('TODA entrada tem dono e data-limite — um n/d sem credor nao entra', () => {
  for (const e of lerRegisto().entradas) {
    assert.ok(e.dono, `${e.id} sem dono`);
    assert.match(e.data_limite, /^\d{4}-\d{2}-\d{2}$/, `${e.id} sem data-limite`);
    assert.ok(e.porque_nd && e.porque_nd.length > 20, `${e.id} sem razao escrita`);
    assert.ok(e.como_deixa_de_ser_nd, `${e.id} nao diz o que o fecha`);
    assert.ok(e.visivel_em, `${e.id} nao diz onde e visivel`);
  }
});

test('o cap e de UMA issue por semana — nunca uma por entrada (M19)', () => {
  assert.equal(lerRegisto().cap_issues_por_semana, 1);
});

// ── o verificador mede o MUNDO ──────────────────────────────────────────────

test('eta-index: le o indice de verdade e conta as chaves com p50', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'nd-'));
  fs.writeFileSync(path.join(dir, 'eta-index.json'), JSON.stringify({
    chaves: { a: { p50: 12 }, b: { p50: null }, c: { p50: 3 } },
  }));
  const r = VERIFICADORES['eta-index-cobertura']({ mooDir: dir });
  assert.equal(r.resolvido, false);
  assert.match(r.porque, /2 de 3/);
  fs.writeFileSync(path.join(dir, 'eta-index.json'), JSON.stringify({
    chaves: { a: { p50: 12 }, b: { p50: 9 }, c: { p50: 3 } },
  }));
  assert.equal(VERIFICADORES['eta-index-cobertura']({ mooDir: dir }).resolvido, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('eta-index: nao conseguir ler NAO e "por resolver" — e n/d', () => {
  const r = VERIFICADORES['eta-index-cobertura']({ mooDir: '/nao/existe' });
  assert.equal(r.resolvido, null);
  assert.match(r.porque, /^n\/d/);
});

test('ci-no-snapshot: mede o construtor real, nao um campo do registo', () => {
  const semCi = VERIFICADORES['ci-no-snapshot']({ readImpl: () => 'export const x = 1;\n' });
  assert.equal(semCi.resolvido, false);
  const comCi = VERIFICADORES['ci-no-snapshot']({ readImpl: () => 'return {\n    ci: algo,\n  };\n' });
  assert.equal(comCi.resolvido, true);
});

// ── nunca fabricar urgencia ─────────────────────────────────────────────────

const REG = (extra) => ({
  vence_apos_dias: 14, cap_issues_por_semana: 1,
  entradas: [Object.assign({
    id: 'x', o_que: 'algo', dono: 'CC', data_limite: '2026-08-01',
    visivel_em: 'algures', como_deixa_de_ser_nd: 'medir',
  }, extra)],
});

test('SEM VERIFICADOR nunca conta como vencido, por mais antigo que seja', () => {
  const l = avaliar(REG({ verificador: null }), { agora: AGORA })[0];
  assert.equal(l.estado, 'sem-verificador');
  assert.ok(l.dias_para_o_limite < 0, 'o prazo passou mesmo — e mesmo assim nao e vencido');
});

test('verificador que REBENTA tambem nao carimba divida', () => {
  const l = avaliar(REG({ verificador: 'eta-index-cobertura' }), {
    agora: AGORA, ambiente: { mooDir: '/nao/existe' },
  })[0];
  assert.equal(l.estado, 'sem-verificador');
});

test('medido por resolver + prazo passado = vencido', () => {
  const l = avaliar(REG({ verificador: 'ci-no-snapshot' }), {
    agora: AGORA, ambiente: { readImpl: () => 'nada' },
  })[0];
  assert.equal(l.estado, 'vencido');
});

test('medido por resolver mas ainda em prazo = em-prazo', () => {
  const l = avaliar(REG({ verificador: 'ci-no-snapshot', data_limite: '2026-12-01' }), {
    agora: AGORA, ambiente: { readImpl: () => 'nada' },
  })[0];
  assert.equal(l.estado, 'em-prazo');
});

test('uma entrada JA RESOLVIDA sai sozinha, sem ninguem a apagar', () => {
  const l = avaliar(REG({ verificador: 'ci-no-snapshot' }), {
    agora: AGORA, ambiente: { readImpl: () => '\n    ci: medido,\n' },
  })[0];
  assert.equal(l.estado, 'resolvido');
  assert.equal(corpoDaIssue([l]), null, 'nada resolvido pode gerar issue');
});

test('diasAte: negativo depois do limite, nulo se a data nao presta', () => {
  assert.equal(diasAte('2026-08-01', AGORA), -31);
  assert.equal(diasAte('2026-10-01', AGORA), 30);
  assert.equal(diasAte('nao-e-data', AGORA), null);
});

// ── o cap ───────────────────────────────────────────────────────────────────

test('sem historico, abre; dentro da semana, nao abre', () => {
  assert.equal(podeAbrirIssue({ ultima_issue_ms: null }, { agora: AGORA }).pode, true);
  assert.equal(podeAbrirIssue({ ultima_issue_ms: AGORA - 1000 }, { agora: AGORA }).pode, false);
  assert.equal(podeAbrirIssue({ ultima_issue_ms: AGORA - SEMANA_MS - 1 }, { agora: AGORA }).pode, true);
});

test('um estado corrompido nao cala o relatorio — abre em vez de se calar', () => {
  assert.equal(podeAbrirIssue({ ultima_issue_ms: 'ontem' }, { agora: AGORA }).pode, true);
});

// ── a issue ─────────────────────────────────────────────────────────────────

test('UMA issue agregada, com todos os vencidos numa tabela', () => {
  const linhas = [
    { id: 'a', dono: 'CC', data_limite: '2026-08-01', dias_para_o_limite: -31, estado: 'vencido', como_deixa_de_ser_nd: 'medir a', medido: 'x' },
    { id: 'b', dono: 'CC', data_limite: '2026-08-10', dias_para_o_limite: -22, estado: 'vencido', como_deixa_de_ser_nd: 'medir b', medido: 'y' },
    { id: 'c', dono: 'dono', data_limite: '2026-12-01', dias_para_o_limite: 91, estado: 'em-prazo', como_deixa_de_ser_nd: 'medir c', medido: 'z' },
  ];
  const corpo = corpoDaIssue(linhas, { agora: AGORA });
  assert.match(corpo, /2 `n\/d` passaram da data-limite/);
  assert.match(corpo, /`a`/); assert.match(corpo, /`b`/);
  assert.match(corpo, /nao sao pedidos/, 'os que estao em prazo entram como contexto, nao como pedido');
});

test('sem vencidos nao ha issue nenhuma', () => {
  assert.equal(corpoDaIssue([{ id: 'a', estado: 'em-prazo' }], { agora: AGORA }), null);
});

// ── o agendamento ───────────────────────────────────────────────────────────

test('o molde do launchd e semanal, corre --issue, e NAO tem RunAtLoad', () => {
  const p = fs.readFileSync(path.join(REPO, 'tools', 'ops', 'moo', 'launchd', 'ai.mooter.nd-check.plist'), 'utf8');
  assert.match(p, /StartCalendarInterval/);
  assert.match(p, /<key>Weekday<\/key><integer>1<\/integer>/);
  assert.match(p, /--issue/);
  assert.doesNotMatch(p, /<key>RunAtLoad<\/key>\s*<true\/>/,
    'um reboot a segunda-feira nao e uma semana nova');
  assert.doesNotMatch(p, /<key>KeepAlive<\/key>/, 'isto e uma tarefa que acaba, nao um servidor');
  assert.match(p, /__NODE__/, 'tem de continuar a ser um MOLDE — um caminho absoluto commitado falha em silencio');
});

test('o registo comitado nao esta a mentir sobre o mundo agora', () => {
  const linhas = avaliar(lerRegisto(), { agora: AGORA });
  for (const l of linhas) {
    assert.notEqual(l.estado, 'vencido',
      `${l.id} ja nasceu vencido — a data-limite foi escrita no passado`);
  }
  assert.ok(fs.existsSync(REGISTO));
});
