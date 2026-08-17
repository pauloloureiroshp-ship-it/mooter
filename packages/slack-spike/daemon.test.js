'use strict';
/** ⚠️ THROWAWAY — spike Slack. Ver README.md e morte.js. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const daemon = require('./daemon.js');
const { LINHA_DESTRAVE } = require('./gate.js');
const { SPIKE_MORRE_EM } = require('./morte.js');

function sync(comLinha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-daemon-'));
  const p = path.join(dir, 'SYNC.md');
  fs.writeFileSync(p, comLinha ? '# SYNC\n\n' + LINHA_DESTRAVE + '\n' : '# SYNC\n\nnada.\n', 'utf8');
  return p;
}

const ENV_OK = () => ({ ignorado: true, porque: 'duplo de ensaio' });

test('daemon · SEM a linha no SYNC.md o daemon RECUSA arrancar', () => {
  const r = daemon.arrancar({ syncPath: sync(false), verificarEnv: ENV_OK, lerToken: () => 'xoxb-x' });
  assert.equal(r.arrancou, false);
  assert.equal(r.passo, 'modo_vivo');
  assert.match(r.porque, /MODO VIVO trancado/);
});

test('daemon · COM a linha, .env ignorado e token, arranca', () => {
  const r = daemon.arrancar({ syncPath: sync(true), verificarEnv: ENV_OK, lerToken: () => 'xoxb-x' });
  assert.equal(r.arrancou, true);
  assert.equal(r.morre_em, SPIKE_MORRE_EM);
});

test('daemon · passado o prazo nao arranca, mesmo com tudo o resto em ordem', () => {
  const r = daemon.arrancar({ syncPath: sync(true), agora: new Date('2099-01-01T00:00:00Z'),
    verificarEnv: ENV_OK, lerToken: () => 'xoxb-x' });
  assert.equal(r.arrancou, false);
  assert.equal(r.passo, 'morte');
});

test('daemon · kimi #7 · o token NAO chega a ser lido se o .env nao estiver ignorado', () => {
  let leuToken = 0;
  const r = daemon.arrancar({
    syncPath: sync(true),
    verificarEnv: () => ({ ignorado: false, porque: 'nao esta ignorado' }),
    lerToken: () => { leuToken++; return 'xoxb-x'; },
  });
  assert.equal(r.arrancou, false);
  assert.equal(r.passo, 'env_nao_ignorado');
  assert.equal(leuToken, 0, 'leu o token antes de provar que o ficheiro estava ignorado');
});

// ── a verificacao REAL do git, num repo REAL de ensaio ────────────────────
function repoDeEnsaio(comGitignore) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-repo-'));
  execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  if (comGitignore) fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n*.env\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.env'), 'SLACK_BOT_TOKEN=xoxb-de-ensaio\n', 'utf8');
  return dir;
}

test('daemon · git check-ignore CONFIRMA quando o .gitignore cobre o .env', () => {
  const repo = repoDeEnsaio(true);
  const r = daemon.envEstaIgnoradoPorOmissao({ repo, envPath: path.join(repo, '.env') });
  assert.equal(r.ignorado, true);
});

test('daemon · git check-ignore RECUSA quando o .env nao esta coberto', () => {
  const repo = repoDeEnsaio(false);
  const r = daemon.envEstaIgnoradoPorOmissao({ repo, envPath: path.join(repo, '.env') });
  assert.equal(r.ignorado, false);
  assert.match(r.porque, /NAO esta ignorado/);
});

test('daemon · .env inexistente e recusa (nao se assume que aparece depois)', () => {
  const repo = repoDeEnsaio(true);
  fs.unlinkSync(path.join(repo, '.env'));
  const r = daemon.envEstaIgnoradoPorOmissao({ repo, envPath: path.join(repo, '.env') });
  assert.equal(r.ignorado, false);
});

// ── o repo REAL deste spike ───────────────────────────────────────────────
test('kimi #7 · o .gitignore deste repo ja cobre um .env dentro do spike', () => {
  const repo = path.resolve(__dirname, '..', '..');
  const alvo = path.join(__dirname, '.env');
  let criado = false;
  if (!fs.existsSync(alvo)) { fs.writeFileSync(alvo, '# ensaio\n', 'utf8'); criado = true; }
  try {
    const r = daemon.envEstaIgnoradoPorOmissao({ repo, envPath: alvo });
    assert.equal(r.ignorado, true, 'o .env do spike NAO esta ignorado: ' + r.porque);
  } finally {
    if (criado) fs.unlinkSync(alvo);
  }
});
