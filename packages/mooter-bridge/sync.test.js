'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  HUMAN_START, HUMAN_END, extractHumanBlock, projectSync, runCli,
} = require('./sync.js');

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function fakeGit(args) {
  const command = args.join(' ');
  if (command === 'rev-parse HEAD') return COMMIT;
  if (command === 'rev-parse --abbrev-ref HEAD') return 'wave/sync-gerado';
  if (command === 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}') return 'origin/wave/sync-gerado';
  if (command === 'rev-list --left-right --count HEAD...origin/wave/sync-gerado') return '2 1';
  if (command.startsWith('log -n 1000 ')) {
    return [
      `${COMMIT}\x1f0123456\x1f2026-07-27T10:00:00.000Z\x1ffeat: ship v1.23.0\x1e`,
      `abcdefabcdefabcdefabcdefabcdefabcdefabcd\x1fabcdefa\x1f2026-07-26T10:00:00.000Z\x1ffeat: ship v1.20.0\x1e`,
    ].join('');
  }
  throw new Error(`comando git inesperado no teste: ${command}`);
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sync-'));
  const bridge = path.join(root, 'packages', 'mooter-bridge');
  const syncPath = path.join(root, 'SYNC.md');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.mkdirSync(bridge, { recursive: true });
  fs.writeFileSync(path.join(bridge, 'manifest.json'), JSON.stringify({ version: '1.23.0' }));
  fs.writeFileSync(
    path.join(bridge, 'entregas-por-versao.json'),
    JSON.stringify(options.deliveries || { '1.20': ['sentinela.js'], '1.23': ['board.js'] }),
  );
  fs.writeFileSync(
    ledgerPath,
    (options.ledger || [{
      ts: '2026-07-27T10:01:00.000Z', event: 'done', job_id: 'job-1',
      wave: 'sync-gerado', agent: 'codex', duration_s: 12, cost_usd: 0.25, desfecho: 'done',
    }]).map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
  if (Object.hasOwn(options, 'sync')) fs.writeFileSync(syncPath, options.sync);
  return { root, syncPath, ledgerPath, runGit: fakeGit };
}

function outputBuffer() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    },
    read: () => ({ stdout, stderr }),
  };
}

test('1. zona humana sobrevive a duas gerações consecutivas, byte a byte', () => {
  const human = `${HUMAN_START}\r\nDecisão: manter € e | sem normalizar.\r\nPróximo: medir.\r\n${HUMAN_END}`;
  const env = fixture({ sync: `texto gerado antigo\n\n${human}\n` });
  projectSync({ ...env });
  const first = fs.readFileSync(env.syncPath, 'utf8');
  projectSync({ ...env });
  const second = fs.readFileSync(env.syncPath, 'utf8');
  assert.equal(extractHumanBlock(first), human);
  assert.equal(extractHumanBlock(second), human);
});

test('2. versão sem commit correspondente aparece assinalada, não silenciada', () => {
  const env = fixture({ deliveries: { '1.20': ['sentinela.js'], '9.99': ['ainda-sem-commit.js'] } });
  projectSync({ ...env });
  const result = fs.readFileSync(env.syncPath, 'utf8');
  assert.match(result, /\| v9\.99 \| ainda-sem-commit\.js \|/);
  assert.match(result, /nenhum commit do branch menciona v9\.99/);
});

test('3. métricas ausentes saem n/d com porque, nunca 0', () => {
  const env = fixture({ ledger: [{
    ts: '2026-07-27T10:01:00.000Z', event: 'done', job_id: 'job-sem-metricas',
    wave: 'sync-gerado', agent: 'codex',
  }] });
  projectSync({ ...env });
  const result = fs.readFileSync(env.syncPath, 'utf8');
  assert.match(result, /duração=n\/d \(porque o ledger do job não contém duration_s\)/);
  assert.match(result, /custo=n\/d \(porque o ledger do job não contém cost_usd\)/);
  assert.doesNotMatch(result, /(?:duração|custo)=0(?:\D|$)/);
});

test('4. --check não escreve e devolve código diferente de zero quando está velho', () => {
  const env = fixture({ sync: 'SYNC velho, sem marcadores\n' });
  const before = fs.readFileSync(env.syncPath);
  const output = outputBuffer();
  const code = runCli(
    ['--check', '--root', env.root, '--ledger', env.ledgerPath],
    output.io,
    { runGit: env.runGit },
  );
  assert.notEqual(code, 0);
  assert.deepEqual(fs.readFileSync(env.syncPath), before);
  assert.match(output.read().stderr, /desactualizado/);
});

test('5. duas gerações sem factos novos produzem ficheiro idêntico', () => {
  const env = fixture({ sync: `${HUMAN_START}\nPróximo: S4.\n${HUMAN_END}\n` });
  const firstRun = projectSync({ ...env });
  const first = fs.readFileSync(env.syncPath);
  const secondRun = projectSync({ ...env });
  const second = fs.readFileSync(env.syncPath);
  assert.equal(firstRun.wrote, true);
  assert.equal(secondRun.wrote, false);
  assert.deepEqual(second, first);
});
