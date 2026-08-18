import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildAlignment,
  parseAheadBehind,
  parseCanonSha,
  checkClassifySha,
  vaultLastWrite,
  sha256,
} from './alignment.mjs';
import { buildFleetState } from './fleet-state.mjs';

const CANON_LINE =
  '- **`tools/router/classify.js` is FROZEN** — CI-enforced sha256:\n' +
  '  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`\n';

function repoWith(classifyBody, canon = CANON_LINE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-align-'));
  fs.mkdirSync(path.join(root, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'router', 'classify.js'), classifyBody);
  if (canon !== null) fs.writeFileSync(path.join(root, 'CLAUDE.md'), canon);
  return root;
}

// ---------------------------------------------------------------- ahead/behind

test('parseAheadBehind le a contagem do git', () => {
  assert.deepEqual(parseAheadBehind('2\t5'.replace('\t', ' ')), { behind: 2, ahead: 5 });
  assert.deepEqual(parseAheadBehind('0 0'), { behind: 0, ahead: 0 });
});

test('parseAheadBehind devolve null quando o git nao respondeu — nunca zero', () => {
  for (const bad of [null, undefined, '', 'fatal: no upstream', 'lixo']) {
    assert.deepEqual(parseAheadBehind(bad), { ahead: null, behind: null }, `falhou em ${bad}`);
  }
});

// ---------------------------------------------------------------- sha

test('parseCanonSha extrai o sha declarado no canon', () => {
  assert.equal(
    parseCanonSha(CANON_LINE),
    '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f',
  );
});

test('parseCanonSha devolve null quando o canon nao declara nada', () => {
  assert.equal(parseCanonSha('# sem sha nenhum'), null);
  assert.equal(parseCanonSha(''), null);
});

test('checkClassifySha confirma quando codigo e canon batem', () => {
  const body = 'const x = 1;\n';
  const canon = `sha256 CI-enforced classify.js: \`${sha256(Buffer.from(body))}\`\n`;
  const root = repoWith(body, canon);
  const r = checkClassifySha(root);
  assert.equal(r.ok, true);
  assert.equal(r.declarado, r.medido);
});

test('checkClassifySha denuncia divergencia entre doc e codigo', () => {
  const root = repoWith('const x = 2;\n', CANON_LINE);
  const r = checkClassifySha(root);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /diverge do canon/);
  assert.notEqual(r.declarado, r.medido);
});

test('invariante desconhecida e null, nunca satisfeita', () => {
  const semCanon = repoWith('const x = 1;\n', null);
  assert.equal(checkClassifySha(semCanon).ok, null);

  const semCodigo = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-align-vazio-'));
  const r = checkClassifySha(semCodigo);
  assert.equal(r.ok, null);
  assert.match(r.motivo, /ilegivel/);
});

// ---------------------------------------------------------------- vault

test('vaultLastWrite encontra a escrita mais recente', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-vault-'));
  fs.mkdirSync(path.join(vault, '30-learnings'));
  fs.writeFileSync(path.join(vault, '30-learnings', 'antigo.md'), 'a');
  fs.writeFileSync(path.join(vault, '30-learnings', 'recente.md'), 'b');
  const past = new Date(Date.now() - 86_400_000);
  fs.utimesSync(path.join(vault, '30-learnings', 'antigo.md'), past, past);

  const r = vaultLastWrite(vault);
  assert.match(r.ficheiro, /recente\.md$/);
  assert.equal(r.motivo, null);
  assert.equal(r.fonte, 'VAULT_PATH');
});

test('vault nao montado diz porque, nao finge vazio-igual-limpo', () => {
  const r = vaultLastWrite('/caminho/que/nao/existe');
  assert.match(r.motivo, /nao montado/);
  assert.equal(r.ts, null);
});

test('sem VAULT_PATH cai na convencao mas declara que foi convencao', () => {
  const r = vaultLastWrite(null);
  assert.equal(r.fonte, 'convencao', 'a proveniencia tem de viajar com o valor');
  assert.match(r.caminho, /paulo-vault$/);
});

// ---------------------------------------------------------------- bloco todo

test('buildAlignment separa sujeira rastreada de untracked', async () => {
  const root = repoWith('const x = 1;\n');
  const gitFake = async (_r, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args.length === 3) return 'main';
    if (args[0] === 'status') return ' M src/a.js\n?? rascunho.command\n?? outro.md';
    if (args[0] === 'rev-parse') return 'origin/main';
    if (args[0] === 'rev-list') return '3 1';
    return null;
  };
  const a = await buildAlignment({ repoRoot: root, gitImpl: gitFake, vaultPath: null });
  assert.equal(a.repo_branch, 'main');
  assert.equal(a.repo_clean, false);
  assert.equal(a.repo_sujo_rastreado, 1);
  assert.equal(a.repo_untracked, 2);
  assert.equal(a.behind, 3);
  assert.equal(a.ahead, 1);
});

test('so untracked conta como repo limpo — senao o campo perde valor', async () => {
  const root = repoWith('const x = 1;\n');
  const gitFake = async (_r, args) => {
    if (args[0] === 'status') return '?? rascunho.command';
    if (args[0] === 'rev-parse' && args.length === 3) return 'main';
    return null;
  };
  const a = await buildAlignment({ repoRoot: root, gitImpl: gitFake, vaultPath: null });
  assert.equal(a.repo_clean, true);
  assert.equal(a.repo_untracked, 1);
});

test('sem git nenhum, tudo fica null e nada fica verde', async () => {
  const root = repoWith('const x = 1;\n');
  const a = await buildAlignment({ repoRoot: root, gitImpl: async () => null, vaultPath: null });
  assert.equal(a.repo_branch, null);
  assert.equal(a.repo_clean, null);
  assert.equal(a.ahead, null);
  assert.equal(a.behind, null);
  assert.equal(a.upstream, null);
  assert.match(a.comparacao, /sem upstream/);
});

test('sem upstream a comparacao e declarada, nao inventada', async () => {
  const root = repoWith('const x = 1;\n');
  const gitFake = async (_r, args) => {
    if (args[0] === 'rev-parse' && args.includes('@{upstream}')) return null;
    if (args[0] === 'rev-parse') return 'feat/x';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') throw new Error('nao devia ser chamado sem upstream');
    return null;
  };
  const a = await buildAlignment({ repoRoot: root, gitImpl: gitFake, vaultPath: null });
  assert.equal(a.ahead, null);
  assert.match(a.comparacao, /sem upstream configurado/);
});

test('o alinhamento entra no /fleet.json e sobrevive a nao ser calculavel', () => {
  const files = { '/ledger': '', '/state': '{}' };
  const read = (p) => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p];
  };
  const semAlinhamento = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    readImpl: read,
    existsImpl: (p) => p in files,
  });
  assert.equal(semAlinhamento.projeto, null, 'nao calculavel => null, nunca um verde por omissao');

  const comAlinhamento = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    readImpl: read,
    existsImpl: (p) => p in files,
    alignment: { repo_branch: 'main', repo_clean: true },
  });
  assert.equal(comAlinhamento.projeto.repo_branch, 'main');
});
