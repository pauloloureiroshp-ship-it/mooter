'use strict';
/**
 * path.test.js — testes do CAMINHO OBSERVÁVEL, não das funções.
 *
 * A lição que custou a v1.3.2: 57 asserts verdes, 4 bugs bloqueantes em
 * produção, zero apanhados. A suite testava as peças — `cliModelFor` tinha 6
 * asserts a provar o fix — e nunca testava a PASSAGEM `toolWork → cliModelFor
 * → spawn`, que era exactamente onde o bug vivia. Pior: um dos asserts protegia
 * o back-compat, ou seja, certificava a porta de trás por onde o bug entrava.
 *
 * Cada teste aqui percorre o caminho que o utilizador percorre.
 * Corre: node path.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

// ⚠️ A6 — TUDO ISTO TEM DE ACONTECER ANTES DOS `require`.
// `seamless.js` lê `MOOTER_REPO` no topo do módulo (`const REPO = …`). Definir a
// variável DEPOIS do require deixava o REPO a apontar para o repositório real do
// Paulo: em Windows, com 37 worktrees a sério, os testes escolhiam uma worktree
// real, escreviam no ledger real e falhavam com jobs que nada tinham a ver com
// eles ("posse: worktree já tem job ativo (job-ms0ik779-57b6)"). Uma suite que
// toca em produção não é uma suite — é um segundo utilizador.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-path-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
try { require('child_process').execFileSync('git', ['-C', WT, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
delete process.env.OLLAMA_HOST;

const seam = require('./seamless.js');
const plan = require('./plan.js');
const moo = require('./moo.js');

// prova de isolamento: se algum caminho apontar para fora do temp, parar já
for (const [k, v] of Object.entries(seam._paths || {})) {
  const val = typeof v === 'function' ? v() : v;
  if (typeof val === 'string' && !val.startsWith(HOME) && !val.startsWith(os.tmpdir())) {
    console.error('ABORTADO: ' + k + ' aponta para fora do sandbox: ' + val);
    process.exit(1);
  }
}

let pass = 0;
const okmsg = (n) => { console.log('  ok  ' + n); pass++; };
const bad = (n, e) => { console.log('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };

/** Spawner falso que regista o comando E escreve um stream à medida. */
function fakeSpawner(write) {
  const seen = [];
  seam.setJobSpawner((cmd, cwd, out) => {
    seen.push(cmd);
    const em = new EventEmitter();
    setImmediate(() => {
      if (write) write(out, cmd);
      out.end();
      em.emit('spawn');
      setTimeout(() => em.emit('close', 0), 40);
    });
    em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
    return em;
  });
  return seen;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\ncaminho observável — os 4 bugs que a suite anterior não viu');

  // ── T1 · toolWork NUNCA entrega vocabulário Anthropic a outro vendor ────
  try {
    const seen = fakeSpawner((out) => {
      out.write('{"type":"result","subtype":"success","result":"feito","total_cost_usd":0}\n');
    });
    // sem Ollama no sandbox, o work degrada para cc e DIZ que degradou
    const r = await seam.toolWork({ goal: 'resume isto em 3 linhas', agent: 'moo', worktree: WT, prepare: false, wave: 'T1' });
    assert.ok(!r.error, 'work recusou em vez de degradar: ' + JSON.stringify(r.reasons || r.error));
    assert.ok(r.downgraded, 'degradou em silêncio — o utilizador tem de saber que não foi para a GPU');
    await wait(150);
    const cmd = seen[0];
    if (cmd && cmd.args) {
      const i = cmd.args.indexOf('--model');
      const m = i >= 0 ? String(cmd.args[i + 1]) : null;
      assert.ok(!m || !/^(opus|sonnet|haiku)$/.test(m),
        'toolWork entregou "' + m + '" a um motor não-Anthropic — foi assim que o Ollama morreu em 0s');
    }
    okmsg('T1 · moo sem Ollama degrada para cc e explica-se');
  } catch (e) { bad('T1', e); }

  // ── T2 · o embedder nunca é escolhido, mesmo residente ──────────────────
  try {
    const r = await moo.pickModel(null, '127.0.0.1:1', [{ model: 'nomic-embed-text:latest' }], { free_mb: 20000 });
    assert.notStrictEqual(r, 'nomic-embed-text:latest');
    okmsg('T2 · pickModel rejeita embedder residente');
  } catch (e) { bad('T2', e); }

  // ── T3 · resultado entregue SEM telemetria continua a ser `done` ────────
  // Este é o achado nº1 da auditoria: 1,8 KB de análise correcta marcados
  // `failed / empty-output` porque o parser não extraiu tokens.
  try {
    fakeSpawner((out) => {
      // texto real, mas SEM usage e SEM type:"result" reconhecível como tal
      out.write('{"type":"assistant","message":{"content":[{"type":"text","text":"A análise completa do ficheiro, com 3 achados."}]}}\n');
    });
    const d = await seam.toolDispatch({
      agent: 'cc', worktree: WT, wave: 'T3', step: 'S1',
      masterprompt: '⇄ ROUTING / teste\nanalisa o ficheiro',
    });
    assert.ok(d.job_id, JSON.stringify(d.reasons || d.error));
    await wait(300);
    const st = await seam.toolStatus({ job_id: d.job_id });
    assert.strictEqual(st.jobs[0].last, 'done',
      'trabalho entregue foi marcado ' + st.jobs[0].last + ' — o produto disse que falhou com o resultado à frente');
    const col = await seam.toolCollect({ job_id: d.job_id });
    assert.ok(String(col.result).includes('3 achados'), 'o resultado não chegou ao collect');
    okmsg('T3 · resultado sem telemetria = done (não empty-output)');
  } catch (e) { bad('T3', e); }

  // ── T3b · sem resultado NENHUM continua a ser failed ────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"system","subtype":"init","model":"x"}\n'); });
    const d = await seam.toolDispatch({
      agent: 'cc', worktree: WT, wave: 'T3b', masterprompt: '⇄ ROUTING / teste\nfaz nada',
    });
    await wait(300);
    const st = await seam.toolStatus({ job_id: d.job_id });
    assert.strictEqual(st.jobs[0].last, 'failed', 'job que só emitiu init devia falhar');
    okmsg('T3b · só linha de init = failed');
  } catch (e) { bad('T3b', e); }

  // ── T4 · dois toolWork na mesma wave = duas etapas ──────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    await seam.toolWork({ goal: 'primeira tarefa da wave', worktree: WT, wave: 'T4', prepare: false });
    await wait(120);
    await seam.toolWork({ goal: 'segunda tarefa da wave', worktree: WT, wave: 'T4', prepare: false });
    await wait(120);
    const p = plan.summarize(plan.readPlan('T4'));
    assert.strictEqual(p.total, 2, 'o segundo work apagou a etapa do primeiro (total=' + p.total + ')');
    assert.ok(p.steps.some((s) => /primeira/.test(s.title)), 'a primeira etapa desapareceu do plano');
    okmsg('T4 · dois work na mesma wave = 2 etapas no plano');
  } catch (e) { bad('T4', e); }

  // ── T5 · await com custos desconhecidos devolve null, nunca 0 ───────────
  try {
    seam.ledgerAppend({ job_id: 'T5a', wave: 'T5', agent: 'codex', worktree: WT, event: 'dispatched' });
    seam.ledgerAppend({ job_id: 'T5a', wave: 'T5', agent: 'codex', worktree: WT, event: 'done', exit_code: 0 });
    const r = await seam.toolAwait({ wave: 'T5', timeout_s: 5 });
    assert.strictEqual(r.cost_usd, null, 'somou null e devolveu 0 — "0" é uma afirmação, "null" é uma abstenção');
    assert.strictEqual(r.cost_jobs_sem_medicao, 1);
    assert.ok(r.cost_note);
    okmsg('T5 · await sem custos medidos devolve null + nota');
  } catch (e) { bad('T5', e); }

  // ── T6 · status e fleet dão o MESMO tok_s para um job terminado ─────────
  try {
    const fleet = require('./fleet.js');
    fakeSpawner((out) => {
      out.write('{"type":"system","model":"m","session_id":"s"}\n');
      out.write('{"type":"result","result":"pronto","total_cost_usd":0.02,"usage":{"input_tokens":10,"output_tokens":300}}\n');
    });
    const d = await seam.toolDispatch({ agent: 'cc', worktree: WT, wave: 'T6', masterprompt: '⇄ ROUTING / teste\nfaz algo' });
    await wait(350);
    const st = await seam.toolStatus({ job_id: d.job_id });
    const snap = await fleet.toolFleet({ wave: 'T6', windowMinutes: 60 }, {});
    const jf = (snap.jobs || []).find((x) => x.job_id === d.job_id);
    const a = st.jobs[0].now ? st.jobs[0].now.tok_s : null;
    const b = jf ? jf.tok_s : null;
    assert.strictEqual(a, b, 'status disse ' + a + ' tok/s e fleet disse ' + b + ' para o mesmo facto imutável');
    okmsg('T6 · status e fleet concordam no tok/s (' + a + ')');
  } catch (e) { bad('T6', e); }

  // ── T7 · prepare que não corre EXPLICA-SE ──────────────────────────────
  try {
    const antes = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = '127.0.0.1:1';        // ninguém a ouvir
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    const r = await seam.toolWork({ goal: 'tarefa com preparação impossível', worktree: WT, wave: 'T7' });
    assert.ok(r.prepare_skipped, 'sem prepare_skipped. resposta: ' + JSON.stringify(r).slice(0,240));
    assert.ok(/Ollama|modelo local/.test(r.prepare_skipped));
    if (antes) process.env.OLLAMA_HOST = antes; else delete process.env.OLLAMA_HOST;
    okmsg('T7 · prepare impossível diz porquê: "' + r.prepare_skipped.slice(0, 48) + '…"');
  } catch (e) { bad('T7', e); }

  // ── T8 · a frase legível vive DENTRO do objecto ─────────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    await wait(250);   // o T7 acabou de despachar nesta worktree; o WIP guard é real
    const r = await seam.toolWork({ goal: 'ver se o resumo aparece', worktree: WT, wave: 'T8', prepare: false });
    assert.ok(r.resumo && /🐮/.test(r.resumo), 'sem resumo. resposta: ' + JSON.stringify(r).slice(0,240));
    assert.ok(Object.keys(r)[0] === 'resumo', 'o resumo tem de ser a PRIMEIRA chave');
    okmsg('T8 · resumo legível é a 1ª chave da resposta');
  } catch (e) { bad('T8', e); }


  // ── T9 · o prompt de arranque NUNCA tem quebras de linha ────────────────
  // Bug real de 2026-07-25: a v1.3.3 pôs o label numa linha própria e o cmd.exe
  // do Windows cortou o argumento aí. Três jobs receberam só o cabeçalho e
  // responderam a pedir o brief. Os testes não apanharam porque o spawner é
  // falso — por isso este teste olha para o COMANDO, não para a execução.
  try {
    const label = 'wave-x · S1 · uma frase\ncom newline\r\ne mais "aspas" e | pipes';
    const boot = seam.bootstrapPrompt('C:\\jobs\\x\\masterprompt.md', label);
    assert.ok(!/[\r\n]/.test(boot), 'o boot tem newline — a shell corta tudo a seguir');
    assert.ok(!/["`|&<>]/.test(boot), 'o boot tem metacaracteres de shell');
    assert.ok(boot.indexOf('masterprompt.md') > 0, 'o boot tem de apontar ao ficheiro');
    for (const ag of ['cc', 'codex', 'gemini']) {
      const cmd = seam.buildCommand(ag, 'C:\\jobs\\x', 'Read', null, label);
      for (const a of cmd.args) assert.ok(!/[\r\n]/.test(String(a)), ag + ' tem argumento multi-linha');
    }
    okmsg('T9 · boot e argumentos numa só linha (o bug que cortou 3 jobs)');
  } catch (e) { bad('T9', e); }

  console.log('\n' + pass + ' testes de caminho' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  // streams dos jobs falsos ainda podem estar a fechar; limpar sem barulho
  process.on('uncaughtException', () => {});
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 250);
})();
