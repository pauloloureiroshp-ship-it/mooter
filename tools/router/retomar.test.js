'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const retomar = require('./retomar.js');
const harness = require('./retomar-harness.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'retomar-test-'));
}

function writeTranscript(dir, name = 'session.jsonl') {
  const file = path.join(dir, name);
  const base = { cwd: 'C:\\repo-antigo', gitBranch: 'feat/old', sessionId: 'session-1' };
  const lines = [
    { ...base, type: 'assistant', message: { content: [{ type: 'tool_use', id: 'edit-1', name: 'Edit', input: { file_path: 'src/a.js' } }] } },
    { ...base, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'edit-1', content: 'ok', is_error: false }] } },
    { ...base, type: 'assistant', message: { content: [{ type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'node broken.js' } }] } },
    { ...base, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'bash-1', content: 'Exit code 2', is_error: true }] } },
    { ...base, type: 'assistant', message: { content: [{ type: 'tool_use', id: 'test-1', name: 'Bash', input: { command: 'node --test sample.test.js' } }] } },
    { ...base, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'test-1', content: '✖ sample.test.js\nℹ tests 4\nℹ pass 2\nℹ fail 2', is_error: false }] } },
  ];
  fs.writeFileSync(file, `${lines.map(JSON.stringify).join('\n')}\n`);
  return file;
}

function gitFacts(overrides = {}) {
  return {
    git_unpushed_commits: retomar.measured(0, 'test'),
    git_uncommitted_files: retomar.measured([], 'test'),
    git_branch: retomar.measured('wave/retomar', 'test'),
    git_worktree: retomar.measured('C:\\repo-atual', 'test'),
    ...overrides,
  };
}

test('transcript produz arquivos, comandos falhos, testes vermelhos e localização sem modelo', () => {
  const dir = tempDir();
  const report = retomar.analyzeTranscript(writeTranscript(dir));
  assert.deepEqual(report.facts.session_files_touched.value, ['src/a.js']);
  assert.equal(report.facts.session_failed_commands.value.length, 1);
  assert.equal(report.facts.session_failed_commands.value[0].exit_code, 'nonzero');
  assert.equal(report.facts.session_red_tests.value, 2);
  assert.equal(report.facts.session_red_test_file.value, 'sample.test.js');
  assert.equal(report.facts.session_branch.value, 'feat/old');
  // O `cwd` vem do transcript e e sempre mensuravel. A RAIZ do worktree so o e
  // se o caminho ainda existir no disco — e `C:\repo-antigo` nao existe. Entao a
  // raiz e `n/d` VISIVEL, nunca um palpite, e o `cwd` continua la para quem o
  // queira. Sao dois factos diferentes e o codigo deixou de os confundir.
  assert.equal(report.facts.session_cwd.value, 'C:\\repo-antigo');
  assert.equal(report.facts.session_worktree.status, 'n/d');
});

// O teste acima passava no Windows e falhava em Linux/macOS — e a diferenca NAO
// era do teste: `C:\\repo-antigo` e absoluto no Windows (sobe ate `C:\\`, nao ha
// `.git`, da n/d) e RELATIVO em POSIX, onde o `path.resolve` o colava ao
// `process.cwd()` do runner e a subida encontrava o `.git` do proprio repo. O
// Retomar dizia entao «estavas em <este repo>» com `status: measured`. Este
// teste fixa a regra sem depender do sistema que o corre: um cwd que esta
// plataforma nao sabe resolver da n/d, e nunca o worktree onde o teste corre.
test('cwd de outra maquina nunca vira o worktree LOCAL disfarcado de facto medido', () => {
  const dir = tempDir();
  const file = path.join(dir, 'alheio.jsonl');
  const alheio = path.sep === '\\' ? '/media/outro/repo' : 'C:\\repo-antigo';
  const linhas = [
    { cwd: alheio, gitBranch: 'x', sessionId: 's', type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'src/a.js' } }] } },
    { cwd: alheio, gitBranch: 'x', sessionId: 's', type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok', is_error: false }] } },
  ];
  fs.writeFileSync(file, `${linhas.map(JSON.stringify).join('\n')}\n`);
  const report = retomar.analyzeTranscript(file);
  assert.equal(report.facts.session_cwd.value, alheio, 'o cwd continua a ser um facto — e o que se tem');
  assert.equal(report.facts.session_worktree.status, 'n/d');
  assert.equal(report.facts.session_worktree.value, null, 'n/d nao carrega valor nenhum');
  assert.notEqual(report.facts.session_worktree.value, process.cwd());
});

test('última corrida sem resumo numérico é n/d visível, nunca zero', () => {
  const dir = tempDir();
  const file = path.join(dir, 'unknown.jsonl');
  const lines = [
    { cwd: dir, gitBranch: 'x', sessionId: 's', type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'npm test' } }] } },
    { cwd: dir, gitBranch: 'x', sessionId: 's', type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'acabou', is_error: false }] } },
  ];
  fs.writeFileSync(file, lines.map(JSON.stringify).join('\n'));
  const report = retomar.reportForTranscript(file, { gitFacts: gitFacts(), pendingChips: retomar.unavailable('sem snapshot', 'test') });
  assert.equal(report.facts.session_red_tests.status, 'n/d');
  assert.match(retomar.renderContext(report), /session_red_tests: n\/d/);
  assert.doesNotMatch(retomar.renderContext(report), /session_red_tests: 0/);
});

test('uma linha JSONL quebrada invalida fatos parciais em vez de fabricar zero', () => {
  const dir = tempDir();
  const file = writeTranscript(dir, 'broken.jsonl');
  fs.appendFileSync(file, '{quebrado\n');
  const diagnostics = [];
  const result = retomar.analyzeTranscript(file, { diagnostics });
  assert.equal(result.meta.malformed_lines, 1);
  assert.ok(Object.values(result.facts).every((fact) => fact.status === 'n/d'));
  assert.equal(diagnostics.length, 1);
});

test('tabela de regras mantém a ordem declarada no MP', () => {
  const facts = {
    session_red_tests: retomar.measured(3, 'test'),
    session_red_test_file: retomar.measured('x.test.js', 'test'),
    session_worktree: retomar.measured('C:\\old', 'test'),
    git_unpushed_commits: retomar.measured(2, 'test'),
    git_uncommitted_files: retomar.measured([{ status: ' M', path: 'x.js' }], 'test'),
    git_branch: retomar.measured('wave/retomar', 'test'),
    git_worktree: retomar.measured('C:\\new', 'test'),
    pending_chips: retomar.measured(['chip B', 'chip A'], 'test'),
  };
  assert.deepEqual(retomar.buildSuggestions(facts).map((item) => item.rule), [
    'unpushed_commits', 'red_tests', 'uncommitted_files', 'pending_chip', 'pending_chip', 'different_worktree',
  ]);
});

test('git facts preservam n/d quando upstream não pode ser medido', () => {
  const fakeExec = (_command, args) => {
    const key = args.join(' ');
    if (key === 'rev-parse --show-toplevel') return 'C:/repo\n';
    if (key === 'branch --show-current') return 'wave/retomar\n';
    if (key === 'status --porcelain=v1 --untracked-files=normal') return ' M src/a.js\n?? src/b.js\n';
    throw Object.assign(new Error('no upstream'), { code: 'ENOUPSTREAM' });
  };
  const diagnostics = [];
  const facts = retomar.collectGitFacts('C:/repo', { execFileSync: fakeExec, diagnostics });
  assert.equal(facts.git_unpushed_commits.status, 'n/d');
  assert.equal(facts.git_uncommitted_files.value.length, 2);
  assert.equal(facts.git_branch.value, 'wave/retomar');
  assert.equal(diagnostics.length, 1);
});

test('chips só entram de arquivo explícito e estado pendente', () => {
  const dir = tempDir();
  const state = path.join(dir, 'retomar-chips.json');
  fs.writeFileSync(state, JSON.stringify({ chips: [
    { title: 'abrir PR', state: 'pending' },
    { title: 'feito', state: 'done' },
  ] }));
  assert.deepEqual(retomar.readPendingChips({ stateFile: state }).value, ['abrir PR']);
  assert.equal(retomar.readPendingChips({ stateFile: path.join(dir, 'missing.json') }).status, 'n/d');
});

test('hook injeta uma vez por session_id e não bloqueia o segundo prompt', () => {
  const dir = tempDir();
  const transcript = writeTranscript(dir);
  const options = {
    transcriptPath: transcript,
    mooterHome: path.join(dir, '.mooter'),
    gitFacts: gitFacts(),
    pendingChips: retomar.unavailable('sem estado', 'test'),
    diagnostics: [],
  };
  const payload = { session_id: 'hook-session', cwd: dir, transcript_path: transcript };
  const first = retomar.hookContext(payload, options);
  const second = retomar.hookContext(payload, options);
  assert.match(first, /<retomar-camada1>/);
  assert.match(first, /estavas em/);
  assert.equal(second, '');
});

test('hook fresco escolhe a sessão anterior; sessão retomada usa o próprio transcript', () => {
  const dir = tempDir();
  const previous = writeTranscript(dir, 'previous.jsonl');
  const current = path.join(dir, 'current.jsonl');
  fs.writeFileSync(current, `${JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'oi' }] } })}\n`);
  assert.equal(retomar.selectTranscript({ transcript_path: current }), previous);
  fs.appendFileSync(current, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Read', input: {} }] } })}\n`);
  assert.equal(retomar.selectTranscript({ transcript_path: current }), current);
});

test('amostra por hash é determinista, única e espalhada', () => {
  const root = path.resolve('C:/sessions');
  const files = Array.from({ length: 100 }, (_, index) => path.join(root, `session-${index}.jsonl`));
  const first = harness.deterministicSpread(files, 20, root);
  const second = harness.deterministicSpread([...files].reverse(), 20, root);
  assert.deepEqual(first.map((item) => item.relative), second.map((item) => item.relative));
  assert.equal(new Set(first.map((item) => item.relative)).size, 20);
  const hashes = first.map((item) => BigInt(`0x${item.hash.slice(0, 12)}`));
  assert.ok(hashes[hashes.length - 1] - hashes[0] > 0x800000000000n);
});
