/**
 * smoke.test.mjs — o teste que faltava: o CICLO e o ENDPOINT, a serio.
 *
 * Os 161 testes que existiam cobriam pecas. Nenhum levantava o loop nem o
 * servidor, porque `moo-runner.mjs` chamava `main()` no topo sem guarda e
 * importa-lo arrancava um ciclo perpetuo dentro do processo de teste. O
 * resultado medido: um TDZ no modo diff passou a suite inteira e rebentou
 * TODAS as rondas em producao.
 *
 * Aqui o motor e falso (nunca ha rede), o relogio e falso (um apagao de horas
 * corre em milissegundos) e o MOOTER_HOME e temporario — mas o ledger, o
 * context-pack, o verificador de evidencia e o disjuntor sao os reais.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// TEM de vir antes do import do runner: os caminhos sao resolvidos ao carregar
// o modulo. Cada ficheiro de teste corre no seu processo (`node --test`), por
// isso isto nao contamina mais ninguem.
const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-smoke-home-'));
process.env.MOOTER_HOME = HOME_TMP;

const { createServer, originAllowed } = await import('./f10-server.mjs');
const runner = await import('./moo-runner.mjs');
const { runRound } = await import('./runner-core.mjs');

const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

/** Levanta o F10 numa porta efemera e devolve a base + um fecho. */
async function servidorEfemero({ fetchImpl } = {}) {
  const srv = createServer({
    repoRoot: REPO,
    mooDir: HOME_TMP,
    device: 'smoke-device',
    fetchImpl: fetchImpl || (async () => ({ ok: false, json: async () => ({}) })),
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  return { base: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => srv.close(r)) };
}

// ------------------------------------------------------------- o endpoint F10

test('smoke: GET /fleet.json responde 200 com o estado real deste device', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/fleet.json`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.device, 'smoke-device');
    assert.ok('frescura' in body || 'pilares' in body, `payload sem forma conhecida: ${Object.keys(body)}`);
  } finally {
    await fechar();
  }
});

test('smoke ACEITACAO: POST /stop de uma origem externa leva 403', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/stop`, {
      method: 'POST',
      headers: { Origin: 'https://site-qualquer.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 403, 'qualquer site que o dono visite nao pode parar a maquina dele');
    assert.equal(fs.existsSync(path.join(HOME_TMP, 'STOP')), false, 'e nao pode deixar rasto nenhum');

    // `null` e a origem de um iframe sandboxed — tambem nao entra.
    assert.equal(originAllowed('null'), false);
    const sandboxed = await fetch(`${base}/stop`, { method: 'POST', headers: { Origin: 'null' }, body: '{}' });
    assert.equal(sandboxed.status, 403);
  } finally {
    await fechar();
  }
});

test('smoke: o kill-switch local continua a funcionar (sem Origin = CLI desta maquina)', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const stop = await fetch(`${base}/stop`, { method: 'POST', body: '{}' });
    assert.equal(stop.status, 200);
    assert.equal(fs.existsSync(path.join(HOME_TMP, 'STOP')), true);
    const play = await fetch(`${base}/play`, { method: 'POST', body: '{}' });
    assert.equal(play.status, 200);
    assert.equal(fs.existsSync(path.join(HOME_TMP, 'STOP')), false);
  } finally {
    await fechar();
  }
});

// ------------------------------------------------------------------ o ciclo

/**
 * `claimLock` faz `process.kill(pid, 0)` — que ACERTA quando o pid e o nosso.
 * Duas chamadas a `main()` no mesmo processo fariam a segunda sair com
 * `process.exit(0)` e o resto da suite desaparecia sem uma unica falha. Em
 * producao o `main()` corre uma vez por processo, por isso nao mudamos o
 * comportamento — limpamos o lock entre rondas de teste, e deixamos isto
 * escrito para nao se descobrir outra vez pelo caminho caro.
 */
function limparLock() {
  fs.rmSync(runner.PATHS.LOCK, { force: true });
  fs.rmSync(runner.PATHS.STOP_FILE, { force: true });
}

const ollamaFalso = (resposta, tokens = 12) => async (url) => {
  assert.match(url, /^http:\/\/127\.0\.0\.1:11434\//, '$0 duro: o ciclo nunca pode falar para fora do loopback');
  return { ok: true, json: async () => ({ response: resposta, eval_count: tokens }) };
};

test('smoke E2E: uma ronda com Ollama falso escreve um recibo real no ledger', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });
  fs.rmSync(runner.PATHS.CURSOR, { force: true });

  await runner.main({
    argv: ['--once'],
    logImpl: () => {},
    publishBeaconImpl: async () => {},
    sleepImpl: async () => {},
    runRoundImpl: (opts) => runRound({
      ...opts,
      stopPollMs: 60_000,
      fetchImpl: ollamaFalso('ACHADO: nada de especial QUANDO nunca ENTAO nada\nPROVA: package.json:1'),
    }),
  });

  const linhas = fs.readFileSync(runner.PATHS.LEDGER, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(linhas.length, 1, 'uma ronda, um recibo');
  const r = JSON.parse(linhas[0]);
  assert.equal(r.usd, 0, '$0 duro tem de estar no recibo, nao so no README');
  assert.equal(r.engine, 'ollama-local');
  assert.ok(r.verdict, 'todo o recibo declara um veredicto');
  assert.ok(r.ficheiro, 'e diz que ficheiro reviu');
  assert.equal(fs.existsSync(runner.PATHS.CURSOR), true, 'a ronda avancou o cursor');
});

test('smoke E2E ACEITACAO: 20 rondas com o motor em baixo dao 3 linhas, nao 20', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });

  let t = Date.parse('2026-08-16T23:18:40Z');
  const out = await runner.main({
    argv: [],
    maxRounds: 20,
    logImpl: () => {},
    publishBeaconImpl: async () => {},
    // Sem isto o teste dormiria 30+60+120+...: o backoff e real, o tempo e que nao.
    sleepImpl: async (s) => { t += s * 1000; },
    nowIso: () => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    runRoundImpl: (opts) => runRound({
      ...opts,
      stopPollMs: 60_000,
      fetchImpl: async () => { throw new Error('fetch failed'); },
    }),
  });

  const linhas = fs.readFileSync(runner.PATHS.LEDGER, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(linhas.length, 3,
    'foi assim que 1767 recibos de um apagao de 11h entraram no ledger como se fossem trabalho');
  assert.equal(linhas.at(-1).evento, 'engine:down');
  assert.ok(linhas.at(-1).inicio, 'o apagao declara quando comecou');
  assert.equal(out.breaker.aberto, true);
  assert.equal(out.breaker.falhas, 20, 'o silencio no ledger nao e amnesia no processo');
});

test('smoke E2E: quando o motor volta, o ledger diz quanto tempo esteve em baixo', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });

  let t = Date.parse('2026-08-16T23:18:40Z');
  let rondas = 0;
  await runner.main({
    argv: [],
    maxRounds: 12,
    logImpl: () => {},
    publishBeaconImpl: async () => {},
    sleepImpl: async (s) => { t += s * 1000; },
    nowIso: () => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    runRoundImpl: (opts) => {
      rondas += 1;
      return runRound({
        ...opts,
        stopPollMs: 60_000,
        fetchImpl: rondas <= 8
          ? async () => { throw new Error('fetch failed'); }
          : ollamaFalso('SEM ACHADO'),
      });
    },
  });

  const linhas = fs.readFileSync(runner.PATHS.LEDGER, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const up = linhas.find((r) => r.evento === 'engine:up');
  assert.ok(up, 'o regresso do motor tem de ficar registado');
  assert.ok(up.apagao_s > 0, `duracao do apagao medida, nao estimada: ${JSON.stringify(up)}`);
  // 8 rondas falhadas: 2 gravadas + 1 `engine:down` + 5 que o ledger NAO
  // registou. Dizer 8 era inflacionar o numero no proprio recibo que o publica.
  assert.equal(up.rondas_engolidas, 5, 'conta o que nao foi gravado, nao o total de falhas');
  assert.equal(up.apagao_s > 0, true, 'e a duracao continua medida');
  assert.ok(linhas.filter((r) => !r.evento).length >= 1, 'e as rondas boas voltam a entrar normalmente');
});

test('smoke: STOP presente trava o ciclo sem gravar trabalho nenhum', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });
  fs.writeFileSync(runner.PATHS.STOP_FILE, '1');

  await runner.main({
    argv: [],
    maxRounds: 5,
    logImpl: () => {},
    publishBeaconImpl: async () => {},
    sleepImpl: async () => {},
    runRoundImpl: () => { throw new Error('o ciclo despachou com STOP presente'); },
  });

  assert.equal(fs.existsSync(runner.PATHS.LEDGER), false, 'parado e parado: nem uma linha');
  fs.rmSync(runner.PATHS.STOP_FILE, { force: true });
});
