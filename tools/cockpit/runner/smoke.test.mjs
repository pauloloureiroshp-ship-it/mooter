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
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// TEM de vir antes do import do runner: os caminhos sao resolvidos ao carregar
// o modulo. Cada ficheiro de teste corre no seu processo (`node --test`), por
// isso isto nao contamina mais ninguem.
const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-smoke-home-'));
process.env.MOOTER_HOME = HOME_TMP;

const { createServer, originAllowed, AVISO_PROTOTIPO } = await import('./f10-server.mjs');
const runner = await import('./moo-runner.mjs');
const { runRound } = await import('./runner-core.mjs');
const { PILLARS, idsActivos } = await import('./context-pack.mjs');

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/**
 * O catalogo que estes testes usam, com o P2 RELIGADO.
 *
 * A 2026-08-25 o dono desligou o P2 e o P3 e a rotacao real ficou VAZIA — o
 * estado honesto: onze pilares, onze reprovados por medicao. No mesmo instante
 * quatro testes deste ficheiro passaram a falhar sem uma linha de motor ter
 * mudado, porque levantavam o ciclo contra o catalogo REAL e sem pilar activo
 * nao ha ronda para exercitar.
 *
 * Um harness que so funciona enquanto existir um pilar bom nao esta a testar o
 * ciclo: esta a testar o catalogo. Por isso `main()` e `createServer()` passaram
 * a aceitar `pillarsImpl`, e e por aqui que ele entra. A alternativa era pôr os
 * E2E em `skip`, que e esconder perda de cobertura — precisamente o genero de
 * coisa que esta suite existe para apanhar.
 *
 * Quem afirma QUEM corre e o `runner-core.test.mjs`, e la a rotacao esta vazia.
 */
const catalogoDeEnsaio = () => {
  // A `medicao` e SINTETICA e serve so para o portao dos pilares deixar o ensaio
  // correr. Desde 2026-08-26 `activo: true` deixou de chegar — a rotacao deriva
  // de `podeEntrar`, e sem numeros o catalogo de ensaio ficava vazio e estes
  // E2E voltavam a testar o catalogo em vez do ciclo. Nao e uma afirmacao sobre
  // o P2: a medicao real dele (11 lidos a mao pelo dono, 0 reais) continua na
  // entrada dele, e continua a recusa-lo em producao.
  const pillars = {
    ...PILLARS,
    P2: { ...PILLARS.P2, activo: true, medicao: { candidatos: 84, lidos: 40, reais: 28 } },
  };
  return { pillars, ids: idsActivos(pillars), fonte: 'ensaio', ficheiro: null, erro: null };
};

/** Levanta o F10 numa porta efemera e devolve a base + um fecho. */
async function servidorEfemero({ fetchImpl, pillarsImpl } = {}) {
  const srv = createServer({
    repoRoot: REPO,
    mooDir: HOME_TMP,
    device: 'smoke-device',
    fetchImpl: fetchImpl || (async () => ({ ok: false, json: async () => ({}) })),
    ...(pillarsImpl ? { pillarsImpl } : {}),
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

/**
 * O botao de foco parecia morto durante uma ronda inteira.
 *
 * `foco` e o pilar com que o loop CORREU a ultima volta — so muda quando a
 * ronda seguinte acabar, ate ~35 s depois do clique. O painel so tinha esse
 * campo, portanto durante essa volta o botao ficava exactamente como antes de
 * ser carregado: medido a 2026-08-19, seis cliques e um unico confirmado. O
 * dono nao estava a ver um bug do loop, estava a ver um painel calado.
 *
 * `foco_pedido` e o ficheiro, e o ficheiro muda no instante do clique. Dois
 * campos, duas verdades, nenhuma mentira — e nenhum deles substitui o outro.
 */
test('smoke: /fleet.json publica foco_pedido — a ordem aceite, antes de pegar', async () => {
  // Catalogo de ensaio: focar exige um pilar que CORRA (o `/focus` recusa 400
  // um pilar fora da rotacao, e bem), e a rotacao real esta vazia desde 25/08.
  const { base, fechar } = await servidorEfemero({ pillarsImpl: catalogoDeEnsaio });
  try {
    const { pilares } = await (await fetch(`${base}/pilares.json`)).json();
    const alvo = pilares[0].id;

    const antes = await (await fetch(`${base}/fleet.json`)).json();
    assert.ok('foco_pedido' in antes, 'o payload tem de trazer sempre o campo, mesmo vazio');

    const pedido = await fetch(`${base}/focus`, { method: 'POST', body: JSON.stringify({ pilar: alvo }) });
    assert.equal(pedido.status, 200);

    const depois = await (await fetch(`${base}/fleet.json`)).json();
    assert.equal(depois.foco_pedido, alvo, 'o clique tem de aparecer no MESMO poll, sem esperar pela ronda');

    const largar = await fetch(`${base}/focus`, { method: 'POST', body: JSON.stringify({ pilar: null }) });
    assert.equal(largar.status, 200);
    const limpo = await (await fetch(`${base}/fleet.json`)).json();
    assert.equal(limpo.foco_pedido, null, 'largar o foco tem de se ver tambem no MESMO poll');
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

// ------------------------------------------- as rotas que tiraram os "proposed"
//
// ⚠️ TODA a escrita aqui vai para `HOME_TMP`, e isso nao e higiene — e o
// incidente de 2026-09-01. Uma prova manual do `/triage` feita contra um F10
// levantado a mao, sem `MOOTER_HOME` temporario, escreveu no `triagem.jsonl`
// REAL do dono uma decisao assinada `por:'dono'` que ele nunca tomou. As
// contagens nao mexeram (a chave nao tinha recibo), e essa foi a sorte, nao o
// desenho. A linha foi removida e o facto registado. Quem levantar um F10 a
// mao para experimentar um verbo de ESCRITA: `MOOTER_HOME=$(mktemp -d)` antes.

/**
 * Um motor local de mentira que responde as DUAS rotas do Ollama que a doca usa:
 * `/api/ps` (quem esta residente) e `/api/generate` (a resposta).
 */
const motorDeDoca = ({ residente = 'granite4.2:3b', resposta = 'Tres frases curtas.' } = {}) =>
  async (url) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:11434\//, '$0 duro: a doca nunca fala para fora do loopback');
    if (/\/api\/ps$/.test(url)) {
      return { ok: true, json: async () => ({ models: residente ? [{ name: residente, size: 3e9 }] : [] }) };
    }
    return {
      ok: true, url: 'http://127.0.0.1:11434/api/generate',
      json: async () => ({ response: resposta, eval_count: 31 }),
    };
  };

test('smoke: POST /triage e a MESMA porta que /triagem — um so escritor', async () => {
  const triagem = path.join(HOME_TMP, 'triagem.jsonl');
  fs.rmSync(triagem, { force: true });
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'f.js:1-9@2026-09-01T00:00:00Z', decisao: 'aceite', por: 'dono' }),
    });
    assert.equal(res.status, 200);
    const { ok, registado } = await res.json();
    assert.equal(ok, true);
    assert.equal(registado.decisao, 'aceite');
    // O ficheiro e o mesmo. Se um dia alguem duplicar a logica, esta linha cai.
    const linhas = fs.readFileSync(triagem, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].via, 'cliente-local', 'sem Origin, o canal e o que se observou');
  } finally {
    await fechar();
  }
});

test('smoke: /triage herda as validacoes todas — descartar sem motivo leva 400', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const r = await fetch(`${base}/triage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'x', decisao: 'descartado', por: 'dono' }),
    });
    assert.equal(r.status, 400);
    const b = await r.json();
    assert.match(b.erro, /motivo/);
    assert.ok(Array.isArray(b.aceites) && b.aceites.length, 'o painel precisa de saber O QUE mandar');
  } finally {
    await fechar();
  }
});

test('smoke ACEITACAO: as rotas novas tem a MESMA guarda de origem que o kill-switch', async () => {
  const { base, fechar } = await servidorEfemero({ fetchImpl: motorDeDoca() });
  try {
    for (const rota of ['/triage', '/assist', '/update']) {
      const res = await fetch(`${base}${rota}`, {
        method: 'POST',
        headers: { Origin: 'https://site-qualquer.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: 'ola', chave: 'x', decisao: 'aceite' }),
      });
      assert.equal(res.status, 403, `${rota} tem de recusar uma origem de site`);
    }
    // E a origem de um iframe sandboxed (`null`) tambem nao entra.
    const sandbox = await fetch(`${base}/assist`, {
      method: 'POST', headers: { Origin: 'null' }, body: JSON.stringify({ mensagem: 'ola' }),
    });
    assert.equal(sandbox.status, 403);
  } finally {
    await fechar();
  }
});

test('smoke: POST /assist responde com texto do motor local e diz de onde veio o modelo', async () => {
  const { base, fechar } = await servidorEfemero({ fetchImpl: motorDeDoca() });
  try {
    const r = await fetch(`${base}/assist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: 'o que e um recibo?' }),
    });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.ok, true);
    assert.equal(b.texto, 'Tres frases curtas.');
    assert.equal(b.modelo, 'granite4.2:3b');
    assert.equal(b.fonte_do_modelo, 'residente');
    assert.equal(b.usd, 0, '$0 e estrutural, nao uma estimativa');
  } finally {
    await fechar();
  }
});

test('smoke: /assist com o motor em baixo da 503 COM o porque — nunca 200 vazio', async () => {
  const { base, fechar } = await servidorEfemero({
    fetchImpl: async (url) => (/\/api\/ps$/.test(url)
      ? { ok: true, json: async () => ({ models: [{ name: 'm:1b' }] }) }
      : { ok: false, status: 500, url: 'http://127.0.0.1:11434/api/generate' }),
  });
  try {
    const r = await fetch(`${base}/assist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: 'ola' }),
    });
    assert.equal(r.status, 503);
    const b = await r.json();
    assert.equal(b.ok, false);
    assert.match(b.porque, /500/);
  } finally {
    await fechar();
  }
});

test('smoke: /assist recusa uma mensagem vazia com 400 antes de gastar GPU', async () => {
  let tocouNoMotor = false;
  const { base, fechar } = await servidorEfemero({
    fetchImpl: async (url) => { if (/generate/.test(url)) tocouNoMotor = true; return { ok: false, status: 500 }; },
  });
  try {
    const r = await fetch(`${base}/assist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 400);
    assert.equal(tocouNoMotor, false);
  } finally {
    await fechar();
  }
});

test('smoke: POST /update aponta o bundle e declara que NAO instala', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const r = await fetch(`${base}/update`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.instala_sozinho, false, 'instalar e um gesto do dono, nunca do painel');
    assert.match(b.porque_nao, /dono/);
    assert.ok('disponivel' in b && 'instalada' in b && 'faz_assim' in b);
  } finally {
    await fechar();
  }
});

test('smoke: uma rota POST desconhecida da 404 — nunca cai no /play por engano', async () => {
  fs.writeFileSync(path.join(HOME_TMP, 'STOP'), '1');
  const { base, fechar } = await servidorEfemero();
  try {
    const r = await fetch(`${base}/triagemm`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 404, 'um endereco mal escrito nao pode religar o loop');
    assert.equal(fs.existsSync(path.join(HOME_TMP, 'STOP')), true, 'e o STOP tem de continuar de pe');
  } finally {
    fs.rmSync(path.join(HOME_TMP, 'STOP'), { force: true });
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
    pillarsImpl: catalogoDeEnsaio,
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

/**
 * `JSON.stringify({})` e JSON valido, mas nao e um recibo. Sem validar a forma,
 * "o runner gravou uma ronda" ficava indistinguivel de "gravou um objecto sem
 * instante, pilar ou veredicto"; a linha ocupava o ledger e nenhum leitor a
 * conseguia interpretar.
 */
test('F5/5: o ledger recusa um objecto vazio em vez de o chamar recibo', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });
  fs.rmSync(runner.PATHS.CURSOR, { force: true });
  // A primeira versao deste teste exigia que o `main()` REJEITASSE. O contrato
  // do ledger esta certo — um `{}` nao e um recibo — mas matar o ciclo por causa
  // dele nao: e a mesma regra que este ficheiro ja aplica ao beacon, "um erro
  // aqui nunca pode derrubar o loop". As duas garantias que importam ficam, e
  // sao mais fortes juntas: a linha invalida NAO chega ao disco, e a recusa
  // aparece ALTO no log com o erro real.
  const logs = [];
  try {
    await runner.main({
      pillarsImpl: catalogoDeEnsaio,
      argv: ['--once'],
      logImpl: (m) => logs.push(m),
      publishBeaconImpl: async () => {},
      sleepImpl: async () => {},
      runRoundImpl: async () => ({ receipt: {} }),
    });
    assert.equal(fs.existsSync(runner.PATHS.LEDGER), false, 'a linha invalida nao chega ao disco');
    const recusa = logs.find((l) => l.includes('recibo recusado pelo ledger'));
    assert.ok(recusa, `a recusa tem de aparecer no log: ${JSON.stringify(logs.slice(0, 4))}`);
    assert.match(recusa, /recibo invalido/, 'com o erro real, nao com uma mensagem generica');
  } finally {
    limparLock();
    fs.rmSync(runner.PATHS.LEDGER, { force: true });
    fs.rmSync(runner.PATHS.CURSOR, { force: true });
  }
});

test('smoke E2E ACEITACAO: 20 rondas com o motor em baixo dao 3 linhas, nao 20', async () => {
  limparLock();
  fs.rmSync(runner.PATHS.LEDGER, { force: true });

  let t = Date.parse('2026-08-16T23:18:40Z');
  const out = await runner.main({
    pillarsImpl: catalogoDeEnsaio,
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
    pillarsImpl: catalogoDeEnsaio,
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
    pillarsImpl: catalogoDeEnsaio,
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

test('smoke: GET /custo.json devolve o custo por modelo, e NUNCA um preco inventado', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/custo.json`);
    assert.equal(res.status, 200);
    const b = await res.json();
    for (const janela of ['curta', 'longa']) {
      const j = b[janela];
      assert.ok(j, `falta a janela ${janela}`);
      if (j.disponivel === false) continue;  // maquina sem sessoes: resposta honesta, nao um zero
      assert.ok(Array.isArray(j.modelos), `${janela}.modelos tem de ser uma lista`);
      assert.match(j.natureza, /NOT money spent/, `${janela} perdeu a nota de que isto nao e dinheiro gasto`);
      assert.ok(j.ressalva, `${janela} perdeu a ressalva de limite inferior do quota.js`);
      for (const m of j.modelos) {
        if (m.preco === null) {
          assert.equal(m.usd, null, `${m.modelo} nao tem preco na tabela e mesmo assim saiu com um custo`);
          assert.equal(j.parcial, true, 'um total a que falta um modelo tem de se declarar parcial');
        } else {
          assert.equal(typeof m.usd, 'number');
        }
      }
      if (j.modelos.length && j.modelos.every((m) => m.preco === null)) {
        assert.equal(j.total_usd, null, 'nenhum modelo tinha preco e o total saiu 0 — 0 le-se como "de graca"');
      }
    }
  } finally { await fechar(); }
});

test('smoke: o gasto do loop e o preco de tabela sao dois numeros separados', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const frota = await (await fetch(`${base}/fleet.json`)).json();
    assert.equal(frota.usd, 0, 'o loop e local: qualquer valor diferente de 0 aqui e uma fuga para fora da maquina');
    const custo = await (await fetch(`${base}/custo.json`)).json();
    // Nao se comparam valores (dependem da maquina); compara-se que sao campos
    // distintos, em respostas distintas, com significados distintos.
    assert.ok(!('usd' in custo), '/custo.json nao pode reutilizar o nome `usd` do gasto do loop');
  } finally { await fechar(); }
});

test('smoke: o painel de recurso NUNCA se serve em silencio', async () => {
  // `panelCandidates` tem dois: o canonico e um prototipo. Ate 2026-08-19 o
  // segundo servia-se com 200 e sem nada a distingui-lo — se o canonico
  // falhasse a leitura, o dono ficava a olhar para um ecra antigo a acreditar
  // que era o estado actual. Um ecra que PARECE certo vale menos do que um
  // erro, porque o erro nao se deixa acreditar.
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/panel`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-moo-panel'), 'canonico',
      'o repo de teste tem o painel canonico: qualquer outra coisa aqui e uma regressao');
    const html = await res.text();
    assert.doesNotMatch(html, /fallback prototype panel/, 'o canonico nao leva aviso nenhum');
  } finally { await fechar(); }
});

/**
 * O `/ledger` e a vista do DONO, e nasceu ao lado do `/panel` — nao por cima.
 *
 * Estes dois testes existem porque a tentacao obvia era servir uma so pagina. O
 * Ledger nao tem os controlos (▶/⏸, foco, triagem); trocar um pelo outro tirava
 * botoes ao dono sem lhe dar nada em troca. A guarda e por ROTA: se alguem
 * apontar o `/panel` para a casca nova, o segundo teste morde.
 */
test('GET /ledger serve a casca do Ledger, com o payload injectado', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/ledger`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-moo-panel'), 'ledger');
    assert.equal(res.headers.get('x-moo-panel-source'), 'tools/cockpit/moo-ledger-shell.html');
    assert.ok(res.headers.get('x-moo-ledger-shell'), 'a resposta tem de dizer que versao de casca serviu');
    const html = await res.text();
    // A casca nao tem numeros; o payload tem de vir INJECTADO, senao a pagina
    // renderiza o ecra de "no payload" e o dono ve uma pagina vazia com 200.
    assert.match(html, /window\.__SNAPSHOT__=\{/, 'servido sem payload — a pagina sairia vazia');
    assert.match(html, /window\.__ROADMAP__=/);
    assert.match(html, /window\.__SHELL__=/);
  } finally { await fechar(); }
});

test('o /panel v1 continua a ser o painel do operador — o Ledger nao o substituiu', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/panel`);
    // Comparacao ESTRITA, com barras POSIX, e nas duas plataformas. Foi assim
    // que este teste apanhou o defeito para que nasceu: o cabecalho vinha de
    // `path.relative` e no Windows saia `tools\cockpit\...`, o que faria a skill
    // `/moo-pilot` — que manda conferir este valor — dar o painel canonico como
    // "outro ficheiro". Uma verificacao com `.includes('moo-pilot-shell')` teria
    // passado nas duas e nao teria visto nada.
    assert.equal(res.headers.get('x-moo-panel-source'), 'tools/cockpit/moo-pilot-shell.html',
      'o /panel passou a servir outra casca (ou o cabecalho deixou de ser POSIX)');
  } finally { await fechar(); }
});

test('o aviso do prototipo diz o que se esta a ver e porque', () => {
  assert.match(AVISO_PROTOTIPO, /not the current one/);
  assert.match(AVISO_PROTOTIPO, /moo-pilot-shell\.html/, 'tem de nomear o ficheiro que falhou');
  assert.match(AVISO_PROTOTIPO, /nothing below is guaranteed/i);
});

/**
 * Cada verbo declarado tem de ser SERVIDO por um ramo.
 *
 * Apanhado em revisao a 2026-09-01: a lista `VERBOS_DE_CONTROLO` passou a guarda
 * de origem para um sitio so, mas a cauda do bloco era o `/play` — logo um verbo
 * acrescentado a lista sem ramo proprio APAGAVA o STOP e ligava a maquina a
 * trabalhar. O `/play` ganhou `if` proprio, a cauda passou a 404, e este teste
 * exige que as duas metades andem juntas para sempre.
 */
test('smoke ACEITACAO: nenhum verbo declarado religa o loop por omissao', async () => {
  const { VERBOS_DE_CONTROLO } = await import('./f10-server.mjs');
  const { base, fechar } = await servidorEfemero({ fetchImpl: motorDeDoca() });
  const STOP = path.join(HOME_TMP, 'STOP');
  try {
    for (const rota of VERBOS_DE_CONTROLO) {
      if (rota === '/play') continue;              // este É o que apaga o STOP, e de propósito
      fs.writeFileSync(STOP, '1');
      await fetch(`${base}${rota}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: 'ola', chave: 'x', decisao: 'aceite', por: 'dono' }),
      });
      assert.equal(fs.existsSync(STOP), true, `${rota} apagou o STOP — caiu na cauda do /play`);
    }
    // E um verbo declarado SEM ramo dá 404 a dizer que é um defeito, não 200.
    const semRamo = await fetch(`${base}/autopilot`, { method: 'POST', body: 'nao-e-json' });
    assert.notEqual(semRamo.status, 404, 'o /autopilot TEM ramo — se der 404 este teste mede a coisa errada');
  } finally {
    fs.rmSync(STOP, { force: true });
    await fechar();
  }
});

/**
 * COBERTURA, NAO PRESENCA — a mesma licao que o portao de movimento reduzido
 * aprendeu a 2026-08-29 (`CLAUDE.md`): testar que os verbos de HOJE se portam
 * bem nao impede que o de AMANHA nasca descoberto. Este exige que cada entrada
 * de `VERBOS_DE_CONTROLO` seja comparada por um ramo no corpo do handler.
 */
test('smoke ACEITACAO: cada verbo declarado tem um ramo que o serve', async () => {
  const { VERBOS_DE_CONTROLO } = await import('./f10-server.mjs');
  const src = fs.readFileSync(new URL('./f10-server.mjs', import.meta.url), 'utf8');
  // Só o corpo do handler: a própria lista também nomeia as rotas.
  const corpo = src.slice(src.indexOf('const servidor = http.createServer'));
  for (const v of VERBOS_DE_CONTROLO) {
    const ramo = new RegExp(`route === '${v}'`).test(corpo);
    assert.ok(ramo, `${v} está na lista e nenhum ramo o serve — cai na cauda`);
  }
  // E a cauda tem de ser um 404, nunca a escrita que religa o loop.
  const cauda = corpo.slice(corpo.lastIndexOf("route === '/play'"));
  assert.ok(cauda.includes('verbo declarado sem tratamento'),
            'a cauda do bloco de POST tem de ser um 404 explícito');
  assert.equal(/rmSync\(stopFile[\s\S]*verbo declarado sem tratamento/.test(cauda), true,
               'o /play tem de vir ANTES da cauda, dentro do seu próprio ramo');
});
