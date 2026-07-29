'use strict';
/**
 * ondaA.test.js — um teste por achado da auditoria v1.3.5.
 *
 * Regra desta onda, herdada do relatório: nenhum commit passa sem um teste que
 * falhava antes e passa depois. Cada bloco cita a prova original.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

// ⚠️ A6 — env antes dos requires, sempre. Ver path.test.js.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-A-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
try { require('child_process').execFileSync('git', ['-C', WT, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
process.env.MOOTER_AWAIT_MAX_S = '3';   // o clamp prova-se em 3s, não em 45
// ⚠️ HERMETICIDADE — apagar OLLAMA_HOST não isola nada: o código cai para
// `127.0.0.1:11434`, que na máquina do Paulo TEM um daemon a responder. O gate
// no Windows falhou por isto — T1/T7 e A4b/A5 assumiam "sem modelo local" e
// encontraram um. Apontar para uma porta morta é a única forma de a suite dar
// o mesmo resultado com e sem GPU.
process.env.OLLAMA_HOST = '127.0.0.1:1';

const seam = require('./seamless.js');
const plan = require('./plan.js');
const wt = require('./worktrees.js');

let pass = 0;
const okmsg = (n) => { console.log('  ok  ' + n); pass++; };
const bad = (n, e) => { console.log('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ Esperar por TEMPO é a origem das falhas intermitentes que o gate no
 * Windows apanhou: `await wait(120)` chega numa máquina rápida e não chega
 * noutra, e o teste seguinte bate no guard de posse com
 * "worktree já tem job ativo". O guard está certo — a suite é que estava a
 * adivinhar. Esperamos pelo FACTO (a worktree ficar livre), com um tecto.
 */
async function livre(seamMod, worktree, maxMs) {
  const fim = Date.now() + (maxMs || 8000);
  for (;;) {
    let n = 0;
    try { n = (seamMod.activeJobsByWorktree(worktree) || []).length; } catch { n = 0; }
    if (!n) return true;
    if (Date.now() > fim) return false;
    await wait(25);
  }
}

function fakeSpawner(write, pid) {
  seam.setJobSpawner((cmd, cwd, out) => {
    const em = new EventEmitter();
    em.pid = pid || (10000 + Math.floor(Math.random() * 1000));
    setImmediate(() => {
      if (write) write(out, cmd);
      out.end(); em.emit('spawn');
      setTimeout(() => em.emit('close', 0), 40);
    });
    em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
    return em;
  });
}

(async () => {
  console.log('\nonda A — um teste por achado');

  // ── A1 · o await não pode durar mais do que o host aguenta ──────────────
  // Prova: job-ms0iggqi-882b morreu `orphaned-by-restart` aos 79s porque
  // alguém seguiu a nota da tool e pediu timeout_s: 600.
  try {
    seam.ledgerAppend({ job_id: 'A1-vivo', wave: 'A1', agent: 'cc', worktree: WT, event: 'started' });
    const t0 = Date.now();
    const r = await seam.toolAwait({ wave: 'A1', timeout_s: 600 });
    const dur = (Date.now() - t0) / 1000;
    assert.ok(dur <= 8, 'esperou ' + Math.round(dur) + 's com tecto de 3s — o clamp não pegou');
    assert.ok(r.timed_out);
    assert.ok(!/aumenta o timeout/i.test(JSON.stringify(r)), 'a nota ainda manda aumentar o timeout — foi isso que matou o job');
    assert.ok(/volta a chamar/i.test(r.note + r.resumo));
    assert.ok(r.pedido_ajustado, 'não disse que ajustou o pedido de 600s');
    okmsg('A1 · await com 600s responde em ' + Math.round(dur) + 's e manda voltar');
  } catch (e) { bad('A1', e); }
  // fechar o job de teste: o WIP guard é real e bloquearia os testes seguintes
  seam.ledgerAppend({ job_id: 'A1-vivo', wave: 'A1', agent: 'cc', worktree: WT, event: 'failed', exit_code: 'fim-do-teste' });

  // ── A2 · o pid do TRABALHO vai para o ledger ────────────────────────────
  // Prova: um commit de 15 ficheiros sem dono; o job estava no WIP guard e
  // ausente do ledger, e `orphaned-by-restart` marcava morto sem matar.
  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); }, 424242);
    await wait(200);
    const d = await seam.toolDispatch({ agent: 'cc', worktree: WT, wave: 'A2', masterprompt: '⇄ ROUTING / teste\nfaz algo' });
    assert.ok(d.job_id, JSON.stringify(d));
    const owner = JSON.parse(fs.readFileSync(path.join(HOME, 'jobs', d.job_id, 'owner.json'), 'utf8'));
    assert.strictEqual(owner.child_pid, 424242, 'o ledger não sabe o pid do trabalho, só o do servidor');
    await wait(200);
    // sweeper: um pid inexistente é órfão, e o evento diz que foi verificado
    seam.ledgerAppend({ job_id: 'A2-fantasma', wave: 'A2', agent: 'cc', worktree: WT, event: 'started' });
    fs.mkdirSync(path.join(HOME, 'jobs', 'A2-fantasma'), { recursive: true });
    fs.writeFileSync(path.join(HOME, 'jobs', 'A2-fantasma', 'owner.json'), JSON.stringify({ pid: 999999, child_pid: 999998 }));
    const swept = seam.sweepOrphans();
    assert.ok(swept.includes('A2-fantasma'));
    const ev = seam.ledgerRead().filter((e) => e.job_id === 'A2-fantasma').pop();
    assert.strictEqual(ev.pid_verificado, true, 'declarou órfão sem dizer que verificou o pid');
    okmsg('A2 · pid do trabalho no ledger e órfão só com pid verificado');
  } catch (e) { bad('A2', e); }

  // ── A3 · não despachar leitura para quem não lê ─────────────────────────
  // Prova: goal "lê o packages/mooter-bridge/worktrees.js" → moo → `done` com
  // createWorktree/removeWorktree/updateWorktree, que não existem.
  try {
    // v1.4.1 — CONTRATO NOVO: em vez de recusar, o conector LÊ o ficheiro pelo
    // modelo local. Só recusa quando nem ele consegue ler.
    const r = await seam.toolWork({
      goal: 'lê o inexistente-nesta-pasta.js e diz o que faz',
      agent: 'moo', worktree: WT, wave: 'A3', prepare: false,
    });
    assert.strictEqual(r.erro, 'sem_contexto_para_o_local', 'despachou leitura sem contexto nenhum');
    assert.ok(Array.isArray(r.faz_assim) && r.faz_assim.length >= 2, 'erro sem saída accionável');
    assert.ok(/force/.test(JSON.stringify(r.faz_assim)), 'não oferece a via de escape explícita');
    okmsg('A3 · leitura impossível para o local é recusada com saída');
  } catch (e) { bad('A3', e); }

  try {
    // o ficheiro EXISTE na worktree de teste → o conector lê-o e injecta-o
    fs.writeFileSync(path.join(WT, 'alvo.js'), 'function realmenteExiste() { return 42; }\n');
    fakeSpawner((out) => { out.write('{"type":"result","result":"analisei o ficheiro real","total_cost_usd":0}\n'); });
    await livre(seam, WT);
    const r = await seam.toolWork({
      goal: 'analisa o alvo.js', agent: 'moo',
      worktree: WT, wave: 'A3b', prepare: false,
    });
    assert.ok(!r.erro, 'devia ter lido o ficheiro pelo modelo: ' + JSON.stringify(r.erro || ''));
    assert.deepStrictEqual(r.ficheiros_lidos, ['alvo.js'], 'não leu o ficheiro pelo modelo local');
    assert.ok(r.contexto_chars > 0);
    const mp = fs.readFileSync(path.join(HOME, 'jobs', r.job_id, 'masterprompt.md'), 'utf8');
    assert.ok(mp.includes('realmenteExiste'), 'o conteúdo real não chegou ao prompt do modelo');
    assert.ok(/não inventes/i.test(mp), 'sem a instrução anti-fabricação o modelo continua a inventar');
    okmsg('A3b · o conector lê o ficheiro PELO modelo local ($0)');
  } catch (e) { bad('A3b', e); }
  await livre(seam, WT);   // o WIP guard é real: um job por worktree de cada vez

  // ── A4 · um número, um significado ──────────────────────────────────────
  // Prova: tier T3 num job local grátis, T0 num Opus, e o mesmo job com T2 e T3.
  try {
    assert.strictEqual(seam.tierDoMotor('moo', 'qwen2.5:3b'), 'T0', 'local tem de ser sempre T0');
    assert.strictEqual(seam.tierDoMotor('moo', 'opus'), 'T0', 'nem com um nome de modelo pago o local deixa de ser T0');
    assert.strictEqual(seam.tierDoMotor('cc', 'claude-opus-4-8'), 'T3');
    assert.strictEqual(seam.tierDoMotor('cc', 'claude-sonnet-4-6'), 'T2');
    assert.strictEqual(seam.tierDoMotor('cc', 'claude-haiku-4-5'), 'T1');
    assert.strictEqual(seam.tierDoMotor('codex', null), null, 'sem modelo conhecido é n/d, nunca um palpite');
    okmsg('A4 · tier_motor deriva do que correu, não do que se pediu');
  } catch (e) { bad('A4', e); }

  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"pronto","total_cost_usd":0.02}\n'); });
    await livre(seam, WT);
    const r = await seam.toolWork({ goal: 'faz um resumo curto', worktree: WT, wave: 'A4b', prepare: false });
    assert.ok('tier_pedido' in r && 'tier_motor' in r, 'os dois tiers têm de vir separados');
    assert.ok(!('tier' in r), 'o campo ambíguo `tier` continua a existir');
    okmsg('A4b · work devolve tier_pedido e tier_motor, nunca `tier`');
  } catch (e) { bad('A4b', e); }
  await livre(seam, WT);

  // ── A5 · o picker vê o conteúdo e declara a mudança ─────────────────────
  // Prova: pedi frugal-fleet (ocupada) e o job correu numa worktree em %TEMP%,
  // em detached HEAD, onde o ficheiro pedido não existia. Nada o disse.
  try {
    assert.strictEqual(wt.isTemp(os.tmpdir()), true);
    assert.strictEqual(wt.isTemp('C:/Users/x/frugal'), false);
    // worktree em %TEMP% com o repo fora dele = suspeita (o caso real)
    assert.strictEqual(wt.suspeita({ path: path.join(os.tmpdir(), 'wt') }, 'C:/Users/x/frugal'), true);
    // mas se o próprio repo vive em %TEMP% (as suites), não há nada de estranho
    assert.strictEqual(wt.suspeita({ path: path.join(os.tmpdir(), 'wt') }, os.tmpdir()), false);
    const escolhida = wt.firstFree(WT, () => [], null, ['nao-existe-em-lado-nenhum.js']);
    assert.strictEqual(escolhida, null, 'escolheu uma pasta que não tem o ficheiro pedido');
    okmsg('A5 · picker recusa %TEMP%, detached e pastas sem os ficheiros');
  } catch (e) { bad('A5', e); }

  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    const r = await seam.toolWork({ goal: 'tarefa qualquer sem ficheiros', worktree: WT, wave: 'A5b', prepare: false });
    assert.ok('worktree_pedida' in r && 'worktree_usada' in r && 'relocated' in r,
      'a relocação tem de ser declarada mesmo quando não acontece');
    okmsg('A5b · worktree_pedida/usada/relocated vêm sempre');
  } catch (e) { bad('A5b', e); }

  // ── A7 · o plano casa por job_id e reconcilia com o ledger ──────────────
  // Prova: plan get → running:4 com live:0; S1 exibia o job_id e o custo do S5.
  try {
    plan.setPlan('A7', [{ id: 'S1', title: 'um' }, { id: 'S2', title: 'dois' }]);
    plan.updateStep('A7', 'S1', { state: 'a-correr', job_id: 'job-A7-1' });
    plan.updateStep('A7', 'S2', { state: 'a-correr', job_id: 'job-A7-2' });
    const estados = new Map([['job-A7-1', 'done'], ['job-A7-2', 'started']]);
    const s = plan.summarize(plan.reconcile(plan.readPlan('A7'), estados));
    assert.strictEqual(s.running, 1, 'não reconciliou: ' + s.running + ' a correr');
    assert.strictEqual(s.done, 1);
    assert.ok(s.steps[0].reconciliado, 'corrigiu sem dizer que corrigiu');
    okmsg('A7 · passo cujo job terminou deixa de estar a-correr');
  } catch (e) { bad('A7', e); }

  try {
    plan.setPlan('A7b', [{ id: 'S1', title: 'sem job' }]);
    plan.updateStep('A7b', 'S1', { state: 'a-correr' });     // sem job_id
    const s = plan.summarize(plan.reconcile(plan.readPlan('A7b'), new Map()));
    assert.strictEqual(s.running, 0, 'um passo sem job não pode estar a correr');
    okmsg('A7b · passo sem job_id volta a pendente');
  } catch (e) { bad('A7b', e); }

  // ── A8 · títulos de sessão legíveis ─────────────────────────────────────
  // Prova: 5 de 10 sessões com o mesmo título, truncado a meio de um path.
  try {
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const fn = src.match(/function cleanTitle[\s\S]*?\n}/)[0];
    // eslint-disable-next-line no-eval
    const cleanTitle = eval('(' + fn.replace('function cleanTitle', 'function') + ')');
    assert.strictEqual(cleanTitle('[wave-x · S2 · auditar o seamless] Le o ficheiro C:\\x\\mp.md'), 'wave-x · S2 · auditar o seamless');
    const semRotulo = cleanTitle('Lê o ficheiro C:\\Users\\Paulo Loureiro\\.mooter\\jobs\\j');
    assert.ok(!/mooter\\jobs/.test(semRotulo), 'o path continua no título: ' + semRotulo);
    assert.strictEqual(cleanTitle(null), null);
    okmsg('A8 · título sem caminho de máquina ("' + semRotulo + '")');
  } catch (e) { bad('A8', e); }

  console.log('\n' + pass + ' testes da onda A' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  process.on('uncaughtException', () => {});
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 250);
})();
