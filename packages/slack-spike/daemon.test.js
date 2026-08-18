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

test('silencio · SLACK_IGNORAR_JOBS no .env FUNCIONA (era lido antes de o .env existir)', async () => {
  // ⚠️ Achado do final-reviewer. A lista era lida no topo do modulo — ou seja, no
  // instante em que o ficheiro carregava, ANTES do `carregarEnv`. Punha-se a
  // variavel no `.env`, que e o sitio natural (todas as outras SLACK_* vivem la),
  // e nao acontecia NADA: o cartao continuava a anunciar-se e com o [Aprovar]
  // quente. Um guarda que se desliga em silencio quando o pomos no sitio obvio da
  // sensacao de proteccao sem a dar — e este guarda existe por causa de um clique
  // que custou US$ 1,24.
  const correr = require('./correr.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-env-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, [
    'SLACK_BOT_TOKEN=xoxb-de-ensaio',
    'SLACK_APP_TOKEN=xapp-123',
    'SLACK_CANAL=C1',
    'SLACK_BOT_USER_ID=U_BOT',
    'SLACK_ALLOW_USER_ID=U_PAULO',
    'SLACK_IGNORAR_JOBS=job-do-ciclo-mau',
  ].join('\n'), 'utf8');
  delete process.env.SLACK_IGNORAR_JOBS;      // so o .env o traz

  const m = await correr.montar({ seco: true, envPath, syncPath: sync(true) });
  assert.equal(m.montado, true, m.porque || 'nao montou');
  const r = await m.adaptador.receberInteraccao({
    user_id: 'U_PAULO', request_id: 'job-do-ciclo-mau', accao: 'aprovar' });
  assert.equal(r.estado, 'SILENCIADO',
    'a variavel estava no .env e o guarda nao a viu — [Aprovar] ficou quente');
});

test('arranque · `principal()` corre mesmo (a funcao que nenhum teste chamava)', async () => {
  // ⚠️ SETIMA instancia do mesmo padrao, e a mais cara em vergonha: 242 testes
  // verdes e o daemon a rebentar na primeira linha com `SILENCIADOS is not
  // defined`. Movi a leitura do silencio para dentro do `montar()` — que e o que
  // os testes chamam — e o `principal()`, que e o que o daemon a serio corre,
  // continuou a referi-la. Nenhum teste tocava no `principal()`.
  //
  // Isto nao verifica comportamento nenhum: verifica que a porta de entrada ABRE.
  // E o teste mais burro do ficheiro e teria poupado um arranque falhado.
  const correr = require('./correr.js');
  const erros = [];
  const log = console.error;
  console.error = () => {};
  try {
    const r = await correr.principal(['--seco']);
    assert.ok(r && typeof r === 'object', '`principal` nao devolveu nada');
    if (r.montado) {
      assert.ok(r.silenciados instanceof Set,
        '`montar` nao devolve `silenciados` — o `principal` volta a ter a sua propria copia');
    }
  } catch (e) {
    erros.push(e);
  } finally {
    console.error = log;
    process.exitCode = 0;
  }
  assert.deepEqual(erros.map((e) => e.message), [], 'o arranque rebentou');
});

test('arranque · a LIGACAO do poller ao daemon corre sem socket nenhum', async () => {
  // ⚠️ Este e o teste que faltava. `principal(--seco)` retorna ANTES do poller, por
  // isso nao tocava na linha que rebentou (`SILENCIADOS is not defined`) — e essa
  // linha so era alcancavel com tokens, socket e gate abertos. Dar NOME a ligacao
  // (`ligarPollerAoDaemon`) e o que a torna alcancavel a um teste. Terceira vez que
  // este ficheiro aprende a mesma coisa.
  const correr = require('./correr.js');
  const regs = [];
  let batimentos = 0;
  const m = {
    adaptador: { publicarFechos: async () => [], publicarPendentes: async () => [],
      publicarBatimentos: async () => { batimentos += 1; return []; },
      jobsNossos: () => new Set() },
    transporte: { threads: new Map() },
    broker: { listPending: () => [] },
    silenciados: new Set(['job-mau']),
    lerLedger: () => [],
  };
  const lig = correr.ligarPollerAoDaemon(m, (x) => regs.push(x));
  try {
    assert.equal(lig.poller.ignorados.has('job-mau'), true,
      'a ligacao nao passou a lista de silenciados ao poller');
    assert.ok(regs.some((x) => x.tipo === 'jobs_silenciados'),
      'arrancou com jobs silenciados e nao o disse');
    await lig.poller.tique();          // e o tique corre mesmo
    assert.equal(batimentos, 1, 'a ligacao do daemon perdeu o heartbeat');
  } finally { clearInterval(lig.relogio); }
});

test('arranque · a ligacao do poller LE O LEDGER a serio quando nao lhe injectam um', async () => {
  // ⚠️ Achado BAIXO do codex, e e a oitava vez que o padrao aparece: o teste
  // anterior injectava SEMPRE `m.lerLedger`, portanto apagar o fallback de
  // producao (`|| lerLedgerPorOmissao`) deixava-o VERDE. Producao nunca injecta.
  const correr = require('./correr.js');
  const m = {
    adaptador: { publicarFechos: async () => [], publicarPendentes: async () => [],
      publicarBatimentos: async () => [],
      jobsNossos: () => new Set() },
    transporte: { threads: new Map() },
    broker: { listPending: () => [] },
    silenciados: new Set(),
    // repare-se: SEM `lerLedger` — como o `montar()` o devolve de facto
  };
  const lig = correr.ligarPollerAoDaemon(m, () => {});
  try {
    await lig.poller.tique();      // rebenta se o fallback nao existir
  } finally { clearInterval(lig.relogio); }
});
