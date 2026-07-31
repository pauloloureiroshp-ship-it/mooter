'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  mapaDoProjecto,
  resumoMapa,
  verificacaoCruzada,
} = require('./fosso.js');

const roots = [];

function temporaryRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-fosso-' + name + '-'));
  roots.push(root);
  return root;
}

function fakeGit() {
  return async (_bin, args) => ({
    stdout: args.includes('--oneline')
      ? 'abc123 primeiro\ndef456 segundo\n'
      : 'src/index.js\nsrc/index.js\npackage.json\n',
  });
}

function makeHead(root, text) {
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), text || 'ref: refs/heads/main\n');
}

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

test('mapa detecta stack e comando de teste reais', async () => {
  const root = temporaryRoot('stack');
  makeHead(root);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'instruções\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: 'node --test src/*.test.js' },
  }));

  const mapa = await mapaDoProjecto(root, { force: true, exec_file: fakeGit() });
  assert.deepStrictEqual(mapa.stack.value, [{ name: 'node', manifest: 'package.json' }]);
  assert.strictEqual(mapa.test_commands.value[0].command, 'node --test src/*.test.js');
  assert.strictEqual(mapa.test_commands.value[0].source, 'package.json#scripts.test');
  assert.deepStrictEqual(mapa.instruction_files.value, [
    { path: 'AGENTS.md', size_bytes: Buffer.byteLength('instruções\n') },
  ]);
  assert.ok(fs.existsSync(path.join(root, '.mooter', 'PROJECT_CONTEXT.json')));
  assert.match(fs.readFileSync(path.join(root, '.mooter', '.gitignore'), 'utf8'), /PROJECT_CONTEXT\.json/);
});

test('sem manifesto nem Git devolve n/d com porquê', async () => {
  const root = temporaryRoot('nd');
  fs.writeFileSync(path.join(root, 'nota.txt'), 'sem stack\n');
  const unavailableGit = async () => { throw Object.assign(new Error('sem git'), { code: 'ENOENT' }); };
  const mapa = await mapaDoProjecto(root, { force: true, exec_file: unavailableGit });
  assert.strictEqual(mapa.stack.value, 'n/d');
  assert.ok(mapa.stack.reason);
  assert.strictEqual(mapa.test_commands.value, 'n/d');
  assert.ok(mapa.test_commands.reason);
  assert.strictEqual(mapa.recent_changes.git_log.value, 'n/d');
  assert.match(mapa.recent_changes.git_log.reason, /Git indisponível|sem repositório/);
  assert.strictEqual(mapa.cache.head_mtime_ms, null);
  assert.ok(mapa.cache.head_reason);
});

test('resumo injectável nunca passa de 1200 chars', () => {
  const many = Array.from({ length: 300 }, (_, index) => ({
    path: 'packages/pacote-' + index + '/ficheiro-muito-longo.js',
    touches: index + 1,
  }));
  const mapa = {
    stack: { value: [{ name: 'node', manifest: 'package.json' }] },
    test_commands: { value: [{ invocation: 'npm test', command: 'node --test', source: 'package.json#scripts.test' }] },
    instruction_files: { value: many.map((item) => ({ path: item.path, size_bytes: 10 })) },
    top_structure: { value: many },
    recent_changes: { git_log: { value: many.map((item) => item.path) }, most_touched: { value: many } },
  };
  assert.ok(resumoMapa(mapa).length <= 1200);
  assert.strictEqual(resumoMapa(mapa).length, 1200);
});

test('cache respeita TTL e invalida quando HEAD muda', async () => {
  const root = temporaryRoot('cache');
  makeHead(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  let calls = 0;
  const git = async (...args) => { calls++; return fakeGit()(...args); };
  const baseNow = Date.now();
  const first = await mapaDoProjecto(root, { force: true, now: () => baseNow, exec_file: git });
  const afterFirst = calls;
  const hit = await mapaDoProjecto(root, { now: () => baseNow + 1000, exec_file: git });
  assert.strictEqual(hit.cache.status, 'hit');
  assert.strictEqual(calls, afterFirst, 'cache válido não voltou a executar Git');
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(root, '.git', 'HEAD'), future, future);
  const refreshed = await mapaDoProjecto(root, { now: () => baseNow + 2000, exec_file: git });
  assert.strictEqual(refreshed.cache.status, 'refreshed');
  assert.ok(calls > afterFirst, 'HEAD novo não invalidou o cache');
  assert.notStrictEqual(first.cache.head_mtime_ms, refreshed.cache.head_mtime_ms);
});

test('verificação cruzada apanha caminho citado que não existe', async () => {
  const root = temporaryRoot('missing');
  const result = await verificacaoCruzada({
    job_id: 'job-missing',
    resultado: 'A implementação está em src/nao-existe.js.',
    worktree: root,
  }, {
    runner: async () => ({ available: true, model: 'fake-local', text: '{"claims":[]}' }),
  });
  assert.strictEqual(result.disponivel, true);
  assert.strictEqual(result.custo_usd, 0);
  assert.strictEqual(result.divergencias.length, 1);
  assert.strictEqual(result.divergencias[0].path, 'src/nao-existe.js');
  assert.match(result.rotulo, /interpretação do moo local/i);
});

test('ficheiro real confirma símbolo e conta as verificações', async () => {
  const root = temporaryRoot('confirm');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'ok.js'), 'function realSymbol() { return 42; }\n');
  const result = await verificacaoCruzada({
    job_id: 'job-ok',
    resultado: 'A função realSymbol existe em src/ok.js.',
    worktree: root,
  }, {
    runner: async () => ({
      available: true,
      model: 'fake-local',
      text: '{"claims":[{"type":"symbol","path":"src/ok.js","symbol":"realSymbol"}]}',
    }),
  });
  assert.strictEqual(result.divergencias.length, 0);
  assert.ok(result.verificado >= 1);
  assert.match(result.nota, /verificadas/);
});

test('sem modelo local devolve indisponível sem inventar veredicto', async () => {
  const root = temporaryRoot('offline');
  const result = await verificacaoCruzada({
    job_id: 'job-offline',
    resultado: 'A implementação está em src/inexistente.js.',
    worktree: root,
  }, {
    runner: async () => ({ available: false, reason: 'GPU local indisponível' }),
  });
  assert.strictEqual(result.disponivel, false);
  assert.match(result.porque, /GPU local indisponível/);
  assert.deepStrictEqual(result.divergencias, []);
  assert.strictEqual(result.verificado, 0);
  assert.strictEqual(result.custo_usd, 0);
  assert.match(result.nota, /sem veredicto/);
});
