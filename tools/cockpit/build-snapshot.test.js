'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  generateSnapshot,
  runCli,
  REPO,
  SNAPSHOT_BEGIN,
  SNAPSHOT_END,
} = require('./build-snapshot.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-snapshot-'));
  const sourcePath = path.join(dir, 'cockpit.html');
  const outputPath = path.join(dir, 'cockpit-snapshot.html');
  fs.writeFileSync(sourcePath, '<!doctype html><script>window.live = true;</script>', 'utf8');
  return { sourcePath, outputPath, _dir: dir };
}

function readers(overrides = {}) {
  const views = {
    jobs: {
      resumo: '1 job', jobs: [{ job_id: 'job-real' }],
      totais: { cost_usd: { valor: 0.25, jobs_medidos: 1 } },
    },
    board: { scorecard: { metricas: { entregas: { valor: 1 } } } },
    recibo: { gerado_em: '2026-08-04T00:00:00.000Z' },
    pastas: { repo: REPO, pastas: [{ nome: 'frugal' }] },
    ...overrides,
  };
  return {
    readView: async (view) => views[view],
    readSetup: async () => ({ contexto: { project: 'frugal' } }),
    readPreview: async () => ({
      candidatas: [{ url: 'http://localhost:5173', porta: 5173, peso: 100, confianca: 'alta' }],
      escolhida: { url: 'http://localhost:5173', porta: 5173, peso: 100, confianca: 'alta' },
      sondadas: 1,
      portas: [5173],
      nota: 'preview de teste',
    }),
  };
}

function embeddedSnapshot(file) {
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf(SNAPSHOT_BEGIN);
  const end = html.indexOf(SNAPSHOT_END, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = html.slice(start, end);
  const match = block.match(/window\.__MOOTER_SNAPSHOT__ = (.*);<\/script>/s);
  assert.ok(match);
  return JSON.parse(match[1]);
}

test('duas ou mais vistas vazias terminam com 1 e não escrevem snapshot', async (t) => {
  const files = fixture();
  try {
    const empty = readers({
      jobs: {
        resumo: 'frota parada',
        totais: {
          cloud_in: { valor: null, jobs_medidos: 0 },
          jobs_cloud: { valor: 0, jobs_medidos: 0 },
        },
      },
      board: { scorecard: { metricas: { entregas: { valor: null } } } },
      pastas: { repo: '/sessions/rcw-empty/mnt/frugal', pastas: [] },
    });
    empty.readSetup = async () => ({ contexto: null });
    const errors = [];

    const code = await runCli({
      ...files,
      ...empty,
      homeDir: '/sessions/rcw-empty',
      mooterHome: '/sessions/rcw-empty/.mooter',
      logger: () => {},
      errorLogger: (line) => errors.push(line),
    });

    assert.equal(code, 1);
    assert.equal(fs.existsSync(files.outputPath), false);
    assert.match(errors[0], /vistas vazias: jobs, board, pastas, setup/);
    assert.match(errors[0], /HOME resolvido: \/sessions\/rcw-empty/);
    assert.match(errors[0], /\.mooter tentado: \/sessions\/rcw-empty\/\.mooter/);
    assert.match(errors[0], /snapshot NÃO escrito — uma fotografia vazia lê-se como facto/);
  } finally {
    fs.rmSync(files._dir, { recursive: true, force: true });
  }
});

test('vistas cheias escrevem snapshot e relatam bytes mais conteúdo por vista', async (t) => {
  const files = fixture();
  try {
    const logs = [];

    const code = await runCli({
      ...files,
      ...readers(),
      now: new Date('2026-08-04T15:30:00.000Z'),
      logger: (line) => logs.push(line),
      errorLogger: (line) => logs.push(line),
    });

    assert.equal(code, 0);
    assert.equal(fs.existsSync(files.outputPath), true);
    const snapshot = embeddedSnapshot(files.outputPath);
    assert.equal(snapshot.jobs.jobs[0].job_id, 'job-real');
    assert.equal(snapshot.preview.escolhida.url, 'http://localhost:5173');
    assert.equal(logs.length, 7);
    assert.match(logs[0], /^cockpit snapshot · jobs: \d+ bytes · 1 ids$/);
    assert.match(logs[1], /^cockpit snapshot · board: \d+ bytes · 1 métricas com valor$/);
    assert.match(logs[2], /^cockpit snapshot · recibo: \d+ bytes · \d+ campos$/);
    assert.match(logs[3], /^cockpit snapshot · pastas: \d+ bytes · 1 pastas$/);
    assert.match(logs[4], /^cockpit snapshot · setup: \d+ bytes · contexto=sim$/);
    assert.match(logs[5], /^cockpit snapshot · preview: \d+ bytes · 1 candidatas$/);
    assert.match(logs[6], /^cockpit snapshot escrito: \d+ bytes · 2026-08-04T15:30:00\.000Z · /);
    assert.equal(logs.some((line) => line.includes('views read')), false);
  } finally {
    fs.rmSync(files._dir, { recursive: true, force: true });
  }
});

test('uma única vista vazia é escrita com marca e motivo explícitos', async (t) => {
  const files = fixture();
  try {
    const full = readers();
    full.readSetup = async () => ({ contexto: null, resumo: 'não configurada' });

    const result = await generateSnapshot({
      ...files,
      ...full,
      logger: () => {},
    });

    const snapshot = embeddedSnapshot(files.outputPath);
    assert.equal(result.emptyViews.length, 1);
    assert.equal(result.emptyViews[0].view, 'setup');
    assert.equal(snapshot.setup.vazia, true);
    assert.equal(snapshot.setup.motivo, 'contexto null');
  } finally {
    fs.rmSync(files._dir, { recursive: true, force: true });
  }
});

test('preview sem candidatas é medição vazia com motivo explícito', async () => {
  const files = fixture();
  try {
    const full = readers();
    full.readPreview = async () => ({
      candidatas: [],
      escolhida: null,
      sondadas: 3,
      portas: [3000, 5173, 8080],
      nota: 'sondei 3 portas e nenhuma devolveu HTML utilizável',
    });

    await generateSnapshot({
      ...files,
      ...full,
      logger: () => {},
    });

    const preview = embeddedSnapshot(files.outputPath).preview;
    assert.deepEqual(preview.candidatas, []);
    assert.equal(preview.vazia, true);
    assert.match(preview.motivo, /nenhuma candidata/);
    assert.deepEqual(preview.portas, [3000, 5173, 8080]);
  } finally {
    fs.rmSync(files._dir, { recursive: true, force: true });
  }
});

// ── validar-e-depois-substituir (achado da triagem de 2026-08-25) ───────────
//
// Quando o HTML passa o tecto de bytes, o preview e TROCADO por um compacto —
// depois de o preview original ja ter sido validado. O que se escrevia nao era
// o que tinha sido validado, e isso corria so nos snapshots GRANDES, que sao
// os que mais gente ve.

/** Enche o preview ate o HTML passar `SNAPSHOT_MAX_BYTES`. */
function previewGordo() {
  const candidatas = [];
  // Just enough to clear SNAPSHOT_MAX_BYTES (2 MB) — nao mais: cada MB extra
  // e tempo de suite pago em todas as corridas, para provar o mesmo ramo.
  for (let i = 0; i < 7000; i += 1) {
    candidatas.push({ url: 'http://localhost:' + (3000 + i), porta: 3000 + i, peso: 1,
      confianca: 'baixa', nota: 'x'.repeat(300) });
  }
  return { candidatas, escolhida: candidatas[0], sondadas: candidatas.length, portas: [], nota: 'gordo' };
}

test('um preview compacto VAZIO nao entra no snapshot sem ser marcado', async () => {
  const files = fixture();
  try {
    const r = readers();
    r.readPreview = async () => previewGordo();
    // O compacto vem VAZIO — e o caso que o guarda existe para apanhar, e que
    // ate aqui passava porque a validacao corria antes da substituicao.
    r.readPreviewCompact = async () => ({ candidatas: [], nota: 'compacto sem candidatas' });
    // Os readers ESPALHAM-SE, nao vao numa chave `readers`: o `generateSnapshot`
    // decide se os aceita por `options.readView && options.readSetup &&
    // options.readPreview`. Passa-los como `{readers: r}` fazia-o cair
    // silenciosamente nos `defaultReaders()` — o teste corria contra a maquina
    // real e ficava verde pela razao errada. Custou-me uma corrida a perceber.
    const res = await generateSnapshot({ ...files, ...r, logger: () => {} });
    assert.ok(res.bytes > 0);
    assert.equal(res.snapshot.preview.vazia, true,
      'o preview compacto vazio foi injectado como se fosse bom — uma fotografia vazia le-se como facto');
    assert.match(res.snapshot.preview.motivo, /nenhuma candidata/);
    assert.ok(res.emptyViews.some((f) => f.view === 'preview'),
      'e tem de aparecer no relatorio, senao ninguem sabe que aconteceu');
  } finally { fs.rmSync(files._dir, { recursive: true, force: true }); }
});

// O caso inverso — original vazio (marcado) e compacto com candidatas — NAO
// tem teste porque e inalcancavel: medido, um preview sem candidatas rende
// ~36 KB e nunca aciona o ramo dos 2 MB. Um teste que semeasse esse estado a
// mao provaria codigo que a producao nunca corre.
