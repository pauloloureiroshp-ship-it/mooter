/**
 * refresh-budget-congela.test.js — o D15, e os dois escritores do cache.
 *
 * D15 (medido 2026-09-10): `.budget-cache.json` entra no `estado_vivo_sha` de
 * qualquer A/B nesta máquina. Matou a corrida 3 do R-24 a meio.
 *
 * A PRIMEIRA versão desta correcção tapou UM escritor e uma revisão adversarial
 * mostrou que isso **tornava o outro inevitável**: sem refresh o cache nunca
 * rejuvenesce, passa as 4 h, e o `fetchBudgetSyncLegacy()` do `inject_context`
 * passa a reescrevê-lo em cada prompt HIGH_RISK. Fechava-se a porta das 2 h e
 * abria-se a das 4 h.
 *
 * Estes testes cobrem os dois escritores, e o estado de PRODUÇÃO — com um
 * `.budget-cache.json` já lá. A primeira versão criava uma casa vazia, onde
 * «não escreveu» é indistinguível de «não tinha nada que escrever»: uma mutação
 * que só congelasse quando o cache não existe passava limpa.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REFRESH = path.join(__dirname, 'refresh-budget.js');
const HOOK = path.join(__dirname, 'inject_context.js');
const congelamento = require('./budget-freeze.js');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

/**
 * Um HOME de mentira no estado de PRODUÇÃO: credenciais presentes (para o
 * script não ter desculpa para parar antes) e um cache já escrito, com a idade
 * pedida.
 */
function casaFalsa({ congelado, conteudoDoSentinela = '', idadeCacheH = 9 }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'd15-'));
  const router = path.join(raiz, '.claude', 'tools', 'router');
  fs.mkdirSync(router, { recursive: true });
  fs.writeFileSync(
    path.join(raiz, '.claude', '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'falso-de-proposito', expiresAt: Date.now() + 3600e3 } }),
  );
  const cache = path.join(router, '.budget-cache.json');
  fs.writeFileSync(cache, JSON.stringify({
    ts: Date.now() - idadeCacheH * 3_600_000,
    data: { five_hour: { utilization: 42, resets_at: '2026-09-10T20:00:00Z' } },
  }));
  if (congelado) fs.writeFileSync(path.join(router, '.budget-freeze'), conteudoDoSentinela);
  return { raiz, router, cache, lock: path.join(router, '.budget-refresh.lock') };
}

const ambiente = (casa, extra = {}) => ({
  ...process.env, HOME: casa.raiz, USERPROFILE: casa.raiz, HOMEDRIVE: '', HOMEPATH: '', ...extra,
});

const correrRefresh = (casa, extra) =>
  spawnSync(process.execPath, [REFRESH], { encoding: 'utf8', timeout: 20_000, env: ambiente(casa, extra) });

const correrHook = (casa, prompt, extra) =>
  spawnSync(process.execPath, [HOOK], {
    encoding: 'utf8', timeout: 25_000, input: JSON.stringify({ prompt }), env: ambiente(casa, extra),
  });

// ── o módulo, em unidade ───────────────────────────────────────────────────

test('D15 · presenca basta — o conteudo do sentinela nao desliga a guarda', () => {
  const casa = casaFalsa({ congelado: true, conteudoDoSentinela: 'R-24 corrida 4' });
  assert.equal(congelamento.congelado({ home: casa.raiz }), true,
    'um sentinela COM texto continua a congelar — senao bastava escrever uma nota para o desligar');
  assert.equal(congelamento.motivo({ home: casa.raiz }), 'R-24 corrida 4');
  const vazio = casaFalsa({ congelado: true });
  assert.equal(congelamento.congelado({ home: vazio.raiz }), true, 'e vazio tambem congela');
  const sem = casaFalsa({ congelado: false });
  assert.equal(congelamento.congelado({ home: sem.raiz }), false);
});

test('D15 · o aviso leva idade e motivo — e a visibilidade que substitui o TTL', () => {
  const casa = casaFalsa({ congelado: true, conteudoDoSentinela: 'experiencia X' });
  const l = congelamento.linhaDeAviso({ home: casa.raiz });
  assert.match(l, /CONGELADO/);
  assert.match(l, /posto ha \d+\.\d+h/, 'sem idade, um sentinela esquecido e invisivel');
  assert.match(l, /experiencia X/);
});

// ── escritor 1 · refresh-budget.js ─────────────────────────────────────────

test('D15 · escritor 1 — com sentinela, o cache EXISTENTE fica byte-a-byte igual', () => {
  const casa = casaFalsa({ congelado: true });
  const antes = sha(casa.cache);
  const r = correrRefresh(casa);
  assert.match(String(r.stderr), /CONGELADO/, 'tem de dizer porque parou');
  assert.equal(sha(casa.cache), antes,
    'o cache ja existia: «nao escreveu» tem de ser medido contra o conteudo, nao contra a ausencia');
  assert.equal(r.status, 0, 'congelar nao e falha');
});

test('D15 · escritor 1 · CONTROLO NEGATIVO — sem sentinela, a linha nao aparece', () => {
  const casa = casaFalsa({ congelado: false });
  const r = correrRefresh(casa);
  assert.ok(!String(r.stderr).includes('CONGELADO'),
    'sem sentinela o ramo do congelamento nao pode ser tomado');
});

test('D15 · escritor 1 — o sentinela e do disco, nao do ambiente', () => {
  // O processo real e lancado DESTACADO pelo hook: uma env var da shell da
  // experiencia nunca la chegaria.
  const casa = casaFalsa({ congelado: false });
  const r = correrRefresh(casa, { MOOTER_BUDGET_FREEZE: '1', BUDGET_FREEZE: '1' });
  assert.ok(!String(r.stderr).includes('CONGELADO'));
});

// ── escritor 2 · inject_context.js (o que a 1.ª correccao tornava inevitavel)

test('D15 · escritor 2 — congelado, o hook nao pede refresh nenhum', () => {
  // Sem rede: a prova e o ficheiro de lock. O `spawnBudgetRefresh()` escreve-o
  // ANTES de lancar o filho, portanto a sua ausencia diz que nem se tentou.
  const casa = casaFalsa({ congelado: true, idadeCacheH: 9 });
  const antes = sha(casa.cache);
  correrHook(casa, 'resume este ficheiro em duas linhas');
  assert.equal(fs.existsSync(casa.lock), false,
    'congelado, o hook nem pode tentar refrescar');
  assert.equal(sha(casa.cache), antes, 'e nao pode tocar no cache');
});

test('D15 · escritor 2 · CONTROLO POSITIVO — sem sentinela, o hook TENTA', () => {
  // Se este teste nao passasse, o de cima estaria a medir um hook que nunca
  // refresca — e provaria coisa nenhuma.
  const casa = casaFalsa({ congelado: false, idadeCacheH: 9 });
  correrHook(casa, 'resume este ficheiro em duas linhas');
  assert.equal(fs.existsSync(casa.lock), true,
    'sem sentinela e com cache velho, o hook tem de lancar o refresh');
});

test('D15 · escritor 2 — HIGH_RISK com cache MUITO velho tambem nao escreve', () => {
  // Este e o caminho que a primeira correccao tornava inevitavel: passadas as
  // 4h, um prompt de deploy caia no fetch sincrono e reescrevia o ficheiro.
  const casa = casaFalsa({ congelado: true, idadeCacheH: 9 });
  const antes = sha(casa.cache);
  const r = correrHook(casa, 'faz deploy para producao e corre a migracao da base de dados');
  assert.equal(sha(casa.cache), antes,
    'o fetch sincrono de HIGH_RISK tambem tem de respeitar o congelamento');
  // A asercao que aqui estava — `lock === false` — era VAZIA: neste caminho o
  // lock nunca aparece, com ou sem sentinela, porque o ramo sincrono nem passa
  // pelo `spawnBudgetRefresh()`. Uma asercao que nao consegue falhar nao e uma
  // asercao. O que distingue os dois mundos e o aviso.
  assert.match(String(r.stderr), /CONGELADO/,
    'congelado, o hook tem de o DIZER — a visibilidade e o que substitui o TTL');
});

test('D15 · o aviso do hook nao aparece quando NAO esta congelado', () => {
  // Controlo negativo do teste acima. Sem ele, a asercao do `CONGELADO`
  // passaria por qualquer linha que contivesse a palavra.
  const casa = casaFalsa({ congelado: false, idadeCacheH: 9 });
  const r = correrHook(casa, 'faz deploy para producao e corre a migracao da base de dados');
  assert.ok(!String(r.stderr).includes('CONGELADO'));
});

test('D15 · escritor 2 — o kill-switch nao passa por cima do congelamento', () => {
  // `MOOTER_V07_DISABLE=1` entrava directo no caminho legado, que escreve.
  const casa = casaFalsa({ congelado: true, idadeCacheH: 9 });
  const antes = sha(casa.cache);
  correrHook(casa, 'faz deploy para producao', { MOOTER_V07_DISABLE: '1', FRUGAL_V07_DISABLE: '1' });
  assert.equal(sha(casa.cache), antes,
    'o congelamento tem de vir antes do kill-switch, senao ha sempre uma porta aberta');
});

// ── ordem no codigo-fonte, que e o que faz o resto medir o que diz ─────────

test('D15 · a guarda vem antes das credenciais e antes do kill-switch', () => {
  // `indexOf` devolve -1 quando NAO encontra, e -1 e menor do que tudo: a
  // versao anterior destas asercoes passava com a guarda AUSENTE. Ordem so se
  // compara depois de a presenca estar provada.
  const refresh = fs.readFileSync(REFRESH, 'utf8');
  const iGuarda = refresh.indexOf('congelamento.congelado()');
  const iCreds = refresh.search(/readFileSync\(\s*CREDS_PATH/);
  assert.notEqual(iGuarda, -1, 'a guarda do refresh tem de existir');
  assert.notEqual(iCreds, -1, 'a leitura de credenciais tem de existir');
  assert.ok(iGuarda < iCreds,
    'no refresh, a guarda tem de vir antes de ler credenciais — senao o teste passa por falta delas');

  const hook = fs.readFileSync(HOOK, 'utf8');
  const bruto = /function getBudget\([\s\S]*?\n}/.exec(hook)[0];
  // Sem comentarios. A primeira versao desta asercao procurava a chamada ao
  // fetch sincrono antes da guarda e encontrava-a no COMENTARIO que explica a
  // guarda — o texto a disparar a verificacao que estava a descrever. Mede-se
  // codigo, portanto tira-se a prosa primeiro.
  const corpo = bruto.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const iFreeze = corpo.indexOf('budgetFreeze.congelado()');
  const iV07 = corpo.indexOf('V07_DISABLED');
  assert.notEqual(iFreeze, -1, 'a guarda do hook tem de existir');
  assert.notEqual(iV07, -1, 'o kill-switch tem de existir');
  assert.ok(iFreeze < iV07, 'no hook, a guarda tem de vir antes do kill-switch');
  assert.ok(!/fetchBudgetSyncLegacy\(\)/.test(corpo.slice(0, corpo.indexOf('budgetFreeze.congelado()'))),
    'nada pode escrever antes de a guarda ser consultada');
});

test('D15 · os dois escritores usam a MESMA definicao', () => {
  // Quatro ficheiros ja definiam o caminho do cache cada um por si. O sentinela
  // nao repete isso: se algum deles reimplementar a verificacao, isto reprova.
  for (const [nome, p] of [['refresh-budget', REFRESH], ['inject_context', HOOK]]) {
    const s = fs.readFileSync(p, 'utf8');
    assert.match(s, /require\('\.\/budget-freeze\.js'\)/, `${nome} tem de usar o modulo partilhado`);
    assert.ok(!/existsSync\([^)]*\.budget-freeze/.test(s),
      `${nome} nao pode reimplementar a verificacao a mao`);
  }
});
