'use strict';
// mooter-doctor — teste de mordida da honestidade da secção "Savings Summary".
//
// O defeito que estes testes plantam (e que a guarda tem de apanhar):
//
//   row(TICK, 'Savings % (advisory)', `${Math.round(m.saved_pct || 0)}%  ← ...`);
//
// Numa máquina sem dados medidos o tracker devolve `saved_pct: 0`
// (savings-tracker.js:555 — `naive_cost > 0 ? ... : 0`, ou seja 0/0), e o
// `|| 0` transformava a ausência de medição num número de poupança com selo
// de sucesso: `✓ Savings % (advisory)  0%`. Idem para `m.actual_cost`, uma
// chave que o /metrics do tracker NUNCA emitiu — imprimia `~$0.00` em todas
// as máquinas desde sempre.
//
// A regra que os testes fixam: medido-e-dá-zero mostra-se (é facto); não
// medido é `n/d` e NÃO leva o tick de sucesso.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DOCTOR = path.join(__dirname, 'mooter-doctor.js');
const TICK = '✓';

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * O que o tracker REAL devolve com o decisions.log vazio: tudo a zero, porque
 * `emptyMetrics()` inicializa a zero e `saved_pct` é 0/0 → 0.
 * (savings-tracker.js:437-470 e :555.)
 */
const EMPTY_WINDOW = {
  prompts: 0,
  naive_cost: 0,
  saved: 0,
  saved_pct: 0,
  guaranteed_saved: 0,
  advisory_saved: 0,
  pct_by_tier: { T0: 0, T1: 0, T2: 0, T3: 0 },
  executions: { total: 0, actual_cost_usd: 0 },
};

/** Janela real cujo resultado medido é zero — isso é um facto e mostra-se. */
const MEASURED_ZERO = {
  prompts: 12,
  naive_cost: 0.5,
  saved: 0,
  saved_pct: 0,
  guaranteed_saved: 0,
  pct_by_tier: { T0: 0, T1: 0, T2: 0, T3: 100 },
  // sem bloco `executions`: tracker antigo. O gasto continua por medir.
};

const MEASURED = {
  prompts: 10,
  naive_cost: 2,
  saved: 1,
  saved_pct: 50,
  guaranteed_saved: 0.25,
  pct_by_tier: { T0: 40, T1: 10, T2: 20, T3: 30 },
  executions: { total: 3, actual_cost_usd: 0.1234 },
};

/**
 * Põe o servidor a ouvir numa porta DENTRO da gama que o env.js aceita
 * ([1024, 49151]). A gama efémera do Windows começa em 49152: um `listen(0)`
 * seria rejeitado pelo schema, o doctor cairia de volta para a 7821 e o teste
 * passaria a falar com o tracker REAL da máquina — verde por acidente.
 */
function listenInValidRange(server) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const port = 20000 + Math.floor(Math.random() * 20000);
      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && ++tries < 25) { attempt(); return; }
        reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve(port));
    };
    attempt();
  });
}

/** Tracker de mentira: serve /health e /metrics; serve também de hub falso. */
async function withFakeTracker(metricsBody, fn) {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/health')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pid: 4242 }));
      return;
    }
    if (url.startsWith('/metrics')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(metricsBody);
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  const port = await listenInValidRange(server);
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

/**
 * Corre o doctor apontado ao tracker falso. MOOTER_HUB_URL vai para o mesmo
 * servidor só para o check do hub não gastar os 2 × 6s de timeout.
 *
 * spawn ASSÍNCRONO de propósito: com a variante síncrona o event loop deste
 * processo fica bloqueado, o tracker falso nunca chega a responder e o doctor
 * conclui "tracker not running" — o teste ficava verde sem nunca ter medido
 * coisa nenhuma.
 */
function runDoctor(port, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DOCTOR, ...args], {
      windowsHide: true,
      env: {
        ...process.env,
        MOOTER_TRACKER_PORT: String(port),
        MOOTER_HUB_URL: `http://127.0.0.1:${port}`,
      },
    });
    let out = '';
    const killer = setTimeout(() => child.kill(), 90000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    child.on('error', (e) => { clearTimeout(killer); reject(e); });
    child.on('close', () => { clearTimeout(killer); resolve(stripAnsi(out)); });
  });
}

function rowFor(out, label) {
  const line = out.split('\n').find((l) => l.includes(label));
  assert.ok(line, `o doctor não imprimiu nenhuma linha "${label}".\n--- stdout ---\n${out}`);
  return line;
}

function assertNotMeasured(line, label) {
  assert.match(line, /n\/d/, `"${label}" devia dizer n/d: ${line}`);
  assert.ok(!line.includes(TICK), `"${label}" não pode trazer tick de sucesso: ${line}`);
  assert.doesNotMatch(line, /\d+(\.\d+)?%/, `"${label}" não pode publicar percentagem: ${line}`);
  assert.doesNotMatch(line, /\$\d/, `"${label}" não pode publicar montante: ${line}`);
}

// ── A mordida: sem medição, nenhum número e nenhum tick ─────────────────────

test('janela vazia → poupança é n/d, nunca 0% com tick', async () => {
  await withFakeTracker(JSON.stringify(EMPTY_WINDOW), async (port) => {
    const out = await runDoctor(port);

    // O achado original, verbatim: imprimia "✓ Savings % (advisory)  0%".
    assertNotMeasured(rowFor(out, 'Savings % (advisory)'), 'Savings %');

    // Mesma classe — todos nasciam a zero por falta de dados.
    assertNotMeasured(rowFor(out, 'Saved (advisory ~)'), 'Saved (advisory ~)');
    assertNotMeasured(rowFor(out, 'Guaranteed saved'), 'Guaranteed saved');
    assertNotMeasured(rowFor(out, 'Actual spend'), 'Actual spend');
    assertNotMeasured(rowFor(out, 'T0 (Ollama/free)'), 'T0');
    assertNotMeasured(rowFor(out, 'T3 (Opus)'), 'T3');

    // Este imprimia "100% of total (0% verified)" — uma alegação de composição
    // sobre um total que não existe.
    const covers = rowFor(out, 'Advisory covers');
    assert.match(covers, /n\/d/, covers);
    assert.ok(!covers.includes(TICK), covers);
    assert.doesNotMatch(covers, /100% of total/, covers);

    // A contagem de prompts é medição a sério: 0 prompts é um facto.
    const decisions = rowFor(out, 'Total decisions');
    assert.ok(decisions.includes(TICK), decisions);
    assert.match(decisions, /\b0\b/, decisions);
  });
});

test('janela vazia em --json → nulls, nunca zeros', async () => {
  await withFakeTracker(JSON.stringify(EMPTY_WINDOW), async (port) => {
    const report = JSON.parse(await runDoctor(port, ['--json']));
    const s = report.checks.savings;
    assert.ok(s, 'checks.savings tem de existir mesmo sem medição');
    assert.strictEqual(s.pct, null, 'saved_pct sem baseline é n/d, não 0');
    assert.strictEqual(s.saved_usd, null);
    assert.strictEqual(s.guaranteed_usd, null);
    assert.strictEqual(s.spent_usd, null);
    assert.strictEqual(s.window_prompts, 0);
    // Valor medido traz FONTE — e prova que a porta do env foi mesmo honrada.
    assert.strictEqual(s.source, `http://127.0.0.1:${port}/metrics`);
  });
});

// ── O outro lado: medido é medido, mesmo quando dá zero ─────────────────────

test('janela real com resultado zero → mostra 0% com tick (é um facto)', async () => {
  await withFakeTracker(JSON.stringify(MEASURED_ZERO), async (port) => {
    const out = await runDoctor(port);

    const pct = rowFor(out, 'Savings % (advisory)');
    assert.ok(pct.includes(TICK), `zero medido é facto e leva tick: ${pct}`);
    assert.match(pct, /0%/, pct);
    assert.doesNotMatch(pct, /n\/d/, pct);
    assert.match(pct, /window 12 prompts/, `medição publica a janela: ${pct}`);

    // Mas o gasto continua por medir: sem bloco `executions` não há número.
    // Antes da correcção esta linha dizia "~$0.00" — de `m.actual_cost`, uma
    // chave que o tracker nunca emitiu.
    assertNotMeasured(rowFor(out, 'Actual spend'), 'Actual spend');
  });
});

test('janela real com poupança → publica valor, janela e gasto medido', async () => {
  await withFakeTracker(JSON.stringify(MEASURED), async (port) => {
    const report = JSON.parse(await runDoctor(port, ['--json']));
    const s = report.checks.savings;
    assert.strictEqual(s.pct, 50);
    assert.strictEqual(s.saved_usd, 1);
    assert.strictEqual(s.guaranteed_usd, 0.25);
    assert.strictEqual(s.spent_usd, 0.1234);
    assert.strictEqual(s.window_prompts, 10);
    assert.strictEqual(s.spent_window_runs, 3);
  });
});

// ── Tracker de pé mas sem resposta legível: silêncio não, n/d ───────────────

test('/metrics ilegível → linha n/d em vez de secção muda', async () => {
  await withFakeTracker('<html>nope</html>', async (port) => {
    const out = await runDoctor(port);
    const line = rowFor(out, 'Savings data');
    assert.match(line, /n\/d/, line);
    assert.ok(!line.includes(TICK), line);

    const report = JSON.parse(await runDoctor(port, ['--json']));
    assert.strictEqual(report.checks.savings, null);
  });
});
