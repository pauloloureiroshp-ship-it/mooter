'use strict';

/**
 * A VÁLVULA, INTEGRADA — que a decisão chegue mesmo ao dispatch.
 *
 * ⚠️ Este ficheiro existe por causa do que a frente `contrato-sandbox` custou:
 * cinco rondas de G4 para descobrir que nove testes verdes não mordiam a
 * remoção do contrato, porque testavam o construtor da decisão em vez do
 * enforcement. `kimi-valvula.test.js` prova que a função decide bem; ISTO prova
 * que o `toolWork` obedece.
 *
 * Sandbox completo antes dos require, pela mesma razão que lá: um teste que
 * despacha sem isolamento escreve no ledger real e lança processos a sério.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-kimival-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
const GIT_ENV_LIMPO = {};
for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k)) GIT_ENV_LIMPO[k] = v;
GIT_ENV_LIMPO.GIT_CONFIG_NOSYSTEM = '1';
GIT_ENV_LIMPO.GIT_CONFIG_GLOBAL = path.join(HOME, 'gitconfig-inexistente');
try {
  require('node:child_process').execFileSync('git', ['-C', WT, 'init', '-q'],
    { stdio: 'ignore', env: GIT_ENV_LIMPO });
} catch { /* o guard recusará e os asserts mostram-no */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
process.env.OLLAMA_HOST = '127.0.0.1:1';
process.env.MOOTER_DECISIONS_LOG = path.join(HOME, 'decisions.log');
process.env.MOOTER_BUNDLE_DIR = path.join(HOME, 'bundle-inexistente');
// a válvula é opt-in (ver o veto 0 em kimi-valvula.js). Estes testes ligam-na
// de propósito: são o único sítio que a exercita.
process.env.MOOTER_VALVULA_KIMI = '1';

const seam = require('./seamless.js');
const quota = require('./quota.js');
const kimi = require('./kimi-adapter.js');

seam.setJobSpawner((cmd, cwd, out) => {
  const em = new EventEmitter();
  setImmediate(() => {
    out.write('{"type":"result","subtype":"success","result":"feito","total_cost_usd":0}\n');
    out.end(); em.emit('spawn');
    setTimeout(() => em.emit('close', 0), 20);
  });
  em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
  return em;
});

async function livre(ondeE) {
  const fim = Date.now() + 8000;
  for (;;) {
    let n = 0;
    try { n = (seam.activeJobsByWorktree(WT) || []).length; } catch { n = 0; }
    if (!n) return;
    assert.ok(Date.now() <= fim, 'a worktree não ficou livre antes de ' + ondeE);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Finge a leitura de quota. Devolve a função para restaurar. */
function comPressao(nivel) {
  const orig = quota.estado;
  quota.estado = () => ({
    pressao: { valor: nivel === 'critico' ? 1 : 0.7, nivel },
    calibragem: {
      politica: 'local-primeiro', forcar_local: false,
      tecto: 'haiku', porque: 'stub de teste',
    },
  });
  return () => { quota.estado = orig; };
}

// ⚠️ O kimi corre IN-PROCESS (`seamless.js:2257` chama `kimi.runKimi`), portanto
// o `setJobSpawner` acima NÃO o cobre. Sem este stub, o I1 fazia uma chamada
// verdadeira à API Moonshot — dinheiro real do dono numa suite de testes, e o
// resultado a depender da rede. As convenções do repo permitem mock de APIs
// externas, e é exactamente este o caso.
// Descoberto porque o I1 estourou o tecto de 8s do `livre()`: o job nunca
// fechava. O teste que eu escrevi apanhou o problema do teste que eu escrevi.
const runKimiOriginal = kimi.runKimi;
kimi.runKimi = (opts) => {
  const em = new EventEmitter();
  const out = opts && opts.outStream;
  setImmediate(() => {
    if (out) {
      out.write(JSON.stringify({
        type: 'result', subtype: 'success',
        result: 'feito pelo kimi falso', total_cost_usd: 0,
      }) + '\n');
      out.end();
    }
    em.emit('spawn');
    setTimeout(() => em.emit('close', 0), 20);
  });
  em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
  return em;
};

/** Finge a presença/ausência da chave Moonshot. */
function comChave(tem) {
  const orig = kimi.configuredApiKey;
  kimi.configuredApiKey = () => tem;
  return () => { kimi.configuredApiKey = orig; };
}

test('I1 — sob pressão crítica, um job inferido vai mesmo para o kimi', async () => {
  const restaurarQ = comPressao('critico');
  const restaurarK = comChave(true);
  try {
    await livre('I1');
    const r = await seam.toolWork({
      goal: 'diz três cores', worktree: WT, prepare: false, wave: 'I1',
    });
    assert.equal(r.agent, 'kimi', 'a válvula não chegou ao dispatch: ' + JSON.stringify(r.valvula_kimi));
    assert.equal(r.model, kimi.MODEL, 'o kimi só aceita o seu próprio modelo');
    assert.equal(r.routed_by, 'valvula-de-quota', 'o recibo não diz quem decidiu');
    await livre('fim de I1');
  } finally { restaurarK(); restaurarQ(); }
});

test('I0 — sem o opt-in, a válvula não desvia nada, nem sob pressão crítica', async () => {
  const restaurarQ = comPressao('critico');
  const restaurarK = comChave(true);
  const antes = process.env.MOOTER_VALVULA_KIMI;
  delete process.env.MOOTER_VALVULA_KIMI;
  try {
    await livre('I0');
    const r = await seam.toolWork({
      goal: 'diz três cores', worktree: WT, prepare: false, wave: 'I0',
    });
    assert.notEqual(r.agent, 'kimi', 'desviou sem o opt-in: ' + JSON.stringify(r.valvula_kimi));
    assert.match(String(r.valvula_kimi && r.valvula_kimi.porque), /MOOTER_VALVULA_KIMI/);
    await livre('fim de I0');
  } finally {
    if (antes !== undefined) process.env.MOOTER_VALVULA_KIMI = antes;
    restaurarK(); restaurarQ();
  }
});

test('I2 — sem pressão, o mesmo job NÃO vai para o kimi', async () => {
  const restaurarQ = comPressao('baixo');
  const restaurarK = comChave(true);
  try {
    await livre('I2');
    const r = await seam.toolWork({
      goal: 'diz três cores', worktree: WT, prepare: false, wave: 'I2',
    });
    assert.notEqual(r.agent, 'kimi',
      'gastou USD com a subscrição disponível: ' + JSON.stringify(r.valvula_kimi));
    await livre('fim de I2');
  } finally { restaurarK(); restaurarQ(); }
});

test('I3 — sem chave, a válvula não escolhe um motor que não arranca', async () => {
  const restaurarQ = comPressao('critico');
  const restaurarK = comChave(false);
  try {
    await livre('I3');
    const r = await seam.toolWork({
      goal: 'diz três cores', worktree: WT, prepare: false, wave: 'I3',
    });
    assert.notEqual(r.agent, 'kimi');
    assert.match(String(r.valvula_kimi && r.valvula_kimi.porque), /MOONSHOT_API_KEY/);
    await livre('fim de I3');
  } finally { restaurarK(); restaurarQ(); }
});

test('I4 — uma escolha EXPLÍCITA nunca é trocada pela válvula', async () => {
  // é a regra que a onda-a3 estabeleceu, e vale para os dois sentidos
  const restaurarQ = comPressao('critico');
  const restaurarK = comChave(true);
  try {
    await livre('I4');
    const r = await seam.toolWork({
      goal: 'diz três cores', agent: 'cc', worktree: WT, prepare: false, wave: 'I4',
    });
    assert.equal(r.agent, 'cc', 'a válvula passou por cima de quem pediu cc');
    await livre('fim de I4');
  } finally { restaurarK(); restaurarQ(); }
});

test('I5 — o recibo explica a decisão mesmo quando a válvula NÃO abre', async () => {
  const restaurarQ = comPressao('baixo');
  const restaurarK = comChave(true);
  try {
    await livre('I5');
    const r = await seam.toolWork({
      goal: 'diz três cores', worktree: WT, prepare: false, wave: 'I5',
    });
    assert.ok(r.valvula_kimi, 'a válvula não deixou rasto no recibo');
    assert.equal(r.valvula_kimi.usar, false);
    assert.ok(r.valvula_kimi.porque.length > 20,
      'saber porque NÃO foi escolhido vale tanto como saber porque foi');
    await livre('fim de I5');
  } finally { restaurarK(); restaurarQ(); }
});

test('I6 — trabalho de escrita não é desviado, mesmo sob pressão crítica', async () => {
  const restaurarQ = comPressao('critico');
  const restaurarK = comChave(true);
  try {
    await livre('I6');
    const r = await seam.toolWork({
      goal: 'diz três cores', write: true, worktree: WT, prepare: false, wave: 'I6',
    });
    assert.notEqual(r.agent, 'kimi', 'mandou escrita para um motor sem ferramentas');
    await livre('fim de I6');
  } finally { restaurarK(); restaurarQ(); }
});

test.after(async () => {
  kimi.runKimi = runKimiOriginal;
  for (const espera of [250, 500, 1000, 2000]) {
    await new Promise((r) => setTimeout(r, espera));
    try { fs.rmSync(HOME, { recursive: true, force: true }); return; } catch { /* tenta outra vez */ }
  }
  console.warn('[kimi-valvula-integrada] não removi ' + HOME + ' — rm -rf "' + HOME + '"');
});
