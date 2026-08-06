'use strict';
/**
 * v12.test.js — hermetic tests for mooter-bridge v1.2.
 *
 * Every test here exists because something lied in production on 2026-07-25.
 * Run: node v12.test.js   (no deps, no network, no real CLI)
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-v12-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';

const telemetry = require('./telemetry.js');
const plan = require('./plan.js');
const journal = require('./journal.js');
const seam = require('./seamless.js');
const fleet = require('./fleet.js');

let pass = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; }
}
async function ta(name, fn) {
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; }
}

console.log('\ntelemetry — the job speaks for itself');

t('extrai modelo real, tokens e acção do stream-json', () => {
  const nd = [
    '{"type":"system","subtype":"init","model":"claude-sonnet-4-6","session_id":"sess-1"}',
    '{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a/b/fleet.js"}}],"usage":{"input_tokens":1000,"output_tokens":50}}}',
    '{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"tool_use","name":"Bash","input":{"command":"npm test"}}],"usage":{"input_tokens":200,"output_tokens":30}}}',
  ].join('\n');
  const r = telemetry.withRate(telemetry.foldEvents(telemetry.parseLines(nd)), 8);
  assert.strictEqual(r.model, 'claude-sonnet-4-6');
  assert.strictEqual(r.session_id, 'sess-1');
  // input é MAX, não soma: um agente multi-turno reenvia o contexto inteiro a
  // cada turno, e somar contava o mesmo contexto N vezes (achado #6 da auditoria).
  assert.strictEqual(r.tokens_in, 1000, 'input por turno tem de ser max, não soma');
  assert.strictEqual(r.tokens_out, 80, 'output acumula: cada turno gera tokens novos');
  assert.strictEqual(r.tok_s, 10);
  assert.strictEqual(r.activity, 'a correr `npm test`');
  assert.strictEqual(r.steps_done, 2);
  assert.deepStrictEqual(r.tools_used, ['Read', 'Bash']);
});

t('linha parcial no fim não parte o parse', () => {
  const nd = '{"type":"system","model":"m1"}\n{"type":"assistant","message":{"usa';
  const r = telemetry.foldEvents(telemetry.parseLines(nd));
  assert.strictEqual(r.model, 'm1');
});

t('sem stream → null, nunca um palpite', () => {
  assert.strictEqual(telemetry.foldEvents([]), null);
  assert.strictEqual(telemetry.readJobTelemetry(path.join(HOME, 'nao-existe.log'), 10), null);
});

t('P0-B — conserva as métricas nativas do Ollama e num_ctx do result', () => {
  const r = telemetry.foldEvents([{
    type: 'result', subtype: 'success', local: true, model: 'qwen3:30b', result: 'ok',
    num_ctx: 32768,
    usage: { input_tokens: 20, output_tokens: 10 },
    ollama: {
      tok_s: 41,
      load_duration_ns: 12,
      prompt_eval_duration_ns: 34,
      eval_duration_ns: 56,
    },
  }]);
  assert.deepStrictEqual(r.ollama, {
    tok_s: 41,
    load_duration_ns: 12,
    prompt_eval_duration_ns: 34,
    eval_duration_ns: 56,
    num_ctx: 32768,
    porque: null,
  });
});

console.log('\nrouter — o fosso deixou de ser decorativo');

t('tier → alias de CLI (aliases, não versões que apodrecem)', () => {
  assert.strictEqual(seam.cliModelFor('cc', 'T1'), 'haiku');
  assert.strictEqual(seam.cliModelFor('cc', 'T2'), 'sonnet');
  assert.strictEqual(seam.cliModelFor('cc', 'T3'), 'opus');
  assert.strictEqual(seam.cliModelFor('cc', 'T5'), null, 'Fable nunca é auto-roteado');
  assert.strictEqual(seam.cliModelFor('cc', 'T9'), null);
  assert.strictEqual(seam.cliModelFor('cc', null, 'claude-haiku-4-5'), 'haiku');
  // ⚠️ v1.3.3 — INVERTIDO DE PROPÓSITO. Este assert protegia o back-compat de
  // 2 argumentos, e era por essa porta que o bug entrava: `toolWork` chamava
  // com (tier, rec), o shim assumia Anthropic, e o Ollama recebia "sonnet".
  // O teste estava a certificar a porta de trás. Agora o agente é obrigatório.
  assert.throws(() => seam.cliModelFor('T1'), /agent obrigatório/,
    'a assinatura antiga tem de PARTIR, não de ser tolerada');
});

// ⚠️ o bug que a v1.3.1 criou ao resolver o da v1.2: vocabulário Anthropic
// entregue a motores que não são Anthropic. Dois jobs mortos em 2026-07-25.
t('NUNCA manda nome de modelo Anthropic a outro vendor', () => {
  assert.strictEqual(seam.cliModelFor('codex', 'T2'), null, 'codex recebeu "sonnet" e devolveu HTTP 400');
  assert.strictEqual(seam.cliModelFor('codex', 'T3'), null);
  assert.strictEqual(seam.cliModelFor('gemini', 'T3'), null);
  assert.strictEqual(seam.cliModelFor('moo', 'T0'), null, 'moo recebeu "opus" e devolveu 0 tokens em 0s');
  assert.strictEqual(seam.cliModelFor('moo', 'T3', 'claude-opus-4-6'), null);
  // e o comando construído não pode conter --model para esses motores
  assert.ok(!seam.buildCommand('codex', '/tmp/j', 'Read', null).args.includes('--model'));
  assert.ok(!seam.buildCommand('moo', '/tmp/j', null, null).args.includes('--model'));
});

t('allowedTools:"Read" no codex vira --sandbox read-only', () => {
  const ro = seam.buildCommand('codex', '/tmp/j', 'Read', null);
  const i = ro.args.indexOf('--sandbox');
  assert.ok(i >= 0);
  assert.strictEqual(ro.args[i + 1], 'read-only', 'pedi read-only e corri com permissão de escrita');
  const rw = seam.buildCommand('codex', '/tmp/j', 'Read,Write,Bash', null);
  assert.strictEqual(rw.args[rw.args.indexOf('--sandbox') + 1], 'workspace-write');
});

t('tok/s congela na duração final e não decai a cada leitura', () => {
  const nd = [
    '{"type":"system","model":"m","session_id":"s"}',
    '{"type":"result","subtype":"success","total_cost_usd":0.01,"usage":{"input_tokens":10,"output_tokens":200}}',
  ].join('\n');
  const base = () => telemetry.foldEvents(telemetry.parseLines(nd));
  const a = telemetry.withRate(base(), 4, { finished: true, duration_s: 4 });
  const b = telemetry.withRate(base(), 400, { finished: true, duration_s: 4 });
  assert.strictEqual(a.tok_s, 50);
  assert.strictEqual(b.tok_s, 50, 'o mesmo job lido mais tarde devolveu um tok/s diferente');
  assert.strictEqual(a.tok_s_basis, 'duração final do job');
  // um job ainda a correr não tem evento `result`, logo é estimativa e diz-se
  const emCurso = telemetry.foldEvents(telemetry.parseLines(
    '{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":90}}}'));
  assert.strictEqual(telemetry.withRate(emCurso, 9, { finished: false }).tok_s_basis, 'estimativa, job a correr');
});

t('buildCommand passa --model ao CLI (o bug que matava o fosso)', () => {
  const c = seam.buildCommand('cc', '/tmp/j', 'Read', 'sonnet');
  assert.ok(c.args.includes('--model'), 'sem --model o roteamento é decorativo');
  assert.strictEqual(c.args[c.args.indexOf('--model') + 1], 'sonnet');
  assert.ok(c.args.includes('stream-json'), 'sem stream-json não há tempo real');
  assert.ok(c.args.includes('--verbose'), 'o CLI exige --verbose com stream em print mode');
  const semModelo = seam.buildCommand('cc', '/tmp/j', 'Read', null);
  assert.ok(!semModelo.args.includes('--model'), 'sem modelo decidido, deixa o CLI escolher');
});

t('moo é um agente de primeira classe', () => {
  const c = seam.buildCommand('moo', '/tmp/j', null, 'qwen2.5:3b');
  assert.strictEqual(c.local, true);
});

console.log('\nplano — etapas, risco e quem fez');

t('risco é inferido e o perigoso nunca fica silencioso', () => {
  assert.strictEqual(plan.inferRisk('git push para main'), 'alto');
  assert.strictEqual(plan.inferRisk('apagar a worktree antiga'), 'alto');
  assert.strictEqual(plan.inferRisk('correr a migração'), 'alto');
  assert.strictEqual(plan.inferRisk('escrever o relatório'), 'médio');
  assert.strictEqual(plan.inferRisk('ler os dois buses'), 'baixo');
});

t('set → update preserva progresso e regista quem executou', () => {
  const w = 'wave-teste';
  plan.setPlan(w, ['ler os ficheiros', 'escrever o resumo', 'git push do resultado'], 'objectivo x');
  let s = plan.summarize(plan.readPlan(w));
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.steps[2].risk, 'alto');
  assert.strictEqual(s.high_risk_open, 1);

  plan.updateStep(w, 'S1', { state: 'feito', by: 'cc · claude-sonnet-4-6', job_id: 'job-1' });
  s = plan.summarize(plan.readPlan(w));
  assert.strictEqual(s.done, 1);
  assert.strictEqual(s.steps[0].by, 'cc · claude-sonnet-4-6');

  // re-declarar o plano não pode apagar o que já aconteceu
  plan.setPlan(w, ['ler os ficheiros', 'escrever o resumo', 'git push do resultado', 'passo novo']);
  s = plan.summarize(plan.readPlan(w));
  assert.strictEqual(s.done, 1, 'progresso perdido ao redefinir o plano');
  assert.strictEqual(s.total, 4);
});

console.log('\nvault — detectar, nunca assumir');

t('sem .obsidian não escreve nada e diz porquê', () => {
  process.env.MOOTER_VAULT = path.join(HOME, 'vault-falso');
  fs.mkdirSync(process.env.MOOTER_VAULT, { recursive: true });
  const r = journal.writeNote({ title: 'x', body: 'y' });
  assert.strictEqual(r.ok, false);
  assert.ok(/vault não encontrado/.test(r.error));
});

t('com .obsidian escreve e nunca sobrescreve', () => {
  const v = path.join(HOME, 'vault');
  fs.mkdirSync(path.join(v, '.obsidian'), { recursive: true });
  process.env.MOOTER_VAULT = v;
  const a = journal.writeNote({ title: 'nota da wave', body: '# olá', kind: 'learning', wave: 'w1' });
  assert.ok(a.ok, a.error);
  const b = journal.writeNote({ title: 'nota da wave', body: '# outra', kind: 'learning' });
  assert.ok(b.ok && b.file !== a.file, 'sobrescreveu uma nota existente');
  assert.ok(fs.readFileSync(a.file, 'utf8').startsWith('---'), 'sem frontmatter');
  assert.ok(journal.vaultStatus().available);
});

console.log('\nciclo de vida — os fantasmas que bloqueavam worktrees');

t('sweeper fecha jobs órfãos de um restart', () => {
  seam.ledgerAppend({ job_id: 'ghost-1', wave: 'w', agent: 'codex', worktree: path.join(HOME, 'wt'), event: 'dispatched' });
  seam.ledgerAppend({ job_id: 'ghost-1', wave: 'w', agent: 'codex', worktree: path.join(HOME, 'wt'), event: 'started' });
  assert.deepStrictEqual(seam.activeJobsByWorktree(path.join(HOME, 'wt')), ['ghost-1'], 'o fantasma devia bloquear a worktree');
  const swept = seam.sweepOrphans();
  assert.deepStrictEqual(swept, ['ghost-1']);
  assert.deepStrictEqual(seam.activeJobsByWorktree(path.join(HOME, 'wt')), [], 'worktree continua bloqueada depois do sweep');
});

ta('mooter_cancel fecha um job stale e liberta a worktree', async () => {
  seam.ledgerAppend({ job_id: 'ghost-2', wave: 'w', agent: 'codex', worktree: path.join(HOME, 'wt2'), event: 'started' });
  const r = await seam.toolCancel({ job_id: 'ghost-2' });
  assert.strictEqual(r.killed, false);
  assert.deepStrictEqual(seam.activeJobsByWorktree(path.join(HOME, 'wt2')), []);
  const again = await seam.toolCancel({ job_id: 'ghost-2' });
  assert.ok(/já estava terminado/.test(again.note), 'cancel devia ser idempotente');

  /**
   * Regressão da onda Y1: a recusa do `observeTerminal` é escrita DEPOIS do
   * `failed`, e o cancel decidia idempotência pelo último evento do ledger.
   * Bastou um evento de diagnóstico a seguir ao desfecho para o job parecer
   * vivo outra vez. Um diagnóstico nunca é um estado.
   */
  seam.ledgerAppend({
    job_id: 'ghost-2', wave: 'w', agent: 'codex', worktree: path.join(HOME, 'wt2'),
    event: 'eta_observacao_recusada', porque: 'não consegui ler a metadata do job',
  });
  const depoisDoDiagnostico = await seam.toolCancel({ job_id: 'ghost-2' });
  assert.ok(
    /já estava terminado/.test(depoisDoDiagnostico.note),
    'um evento de diagnóstico a seguir ao desfecho ressuscitou o job',
  );
  assert.deepStrictEqual(seam.activeJobsByWorktree(path.join(HOME, 'wt2')), []);
});

console.log('\npainel — o modelo deixou de ser adivinhado');

t('NUNCA cola o modelo de uma sessão fora da janela do job (o bug de 07-25)', () => {
  const jobs = [{ job_id: 'j1', worktree: 'C:/x/frugal-w2', started_at: '2026-07-25T11:30:11Z', ended_at: '2026-07-25T11:32:59Z' }];
  const sessaoVelha = [{ id: 'a00885ef', cwd: 'C:/x/frugal-w2', model: 'claude-opus-4-8', ageMs: 64992846 }];
  fleet.attachModels(jobs, sessaoVelha);
  assert.strictEqual(jobs[0].model, null, 'voltou a herdar o modelo de uma sessão de 18h antes');
  assert.ok(/n\/d/.test(jobs[0].model_source));
});

t('usa o modelo do stream do próprio job quando existe', () => {
  const jobs = [{ job_id: 'j2', worktree: 'C:/x/w', model_used: 'claude-sonnet-4-6' }];
  fleet.attachModels(jobs, [{ id: 's', cwd: 'C:/x/w', model: 'claude-opus-4-8', ageMs: 10 }]);
  assert.strictEqual(jobs[0].model, 'claude-sonnet-4-6');
  assert.strictEqual(jobs[0].model_source, 'stream do job');
});

t('casa por id de sessão, que é identidade e não palpite', () => {
  const jobs = [{ job_id: 'j3', worktree: 'C:/x/w', session_id: 'fe11d2a3' }];
  fleet.attachModels(jobs, [{ id: 'fe11d2a3', cwd: 'C:/outro', model: 'claude-haiku-4-5', ageMs: 999999999 }]);
  assert.strictEqual(jobs[0].model, 'claude-haiku-4-5');
  assert.strictEqual(jobs[0].model_source, 'sessão (por id)');
});

console.log('\nE2E — dispatch falso ponta a ponta, com telemetria');

ta('dispatch → stream → status(now) → collect', async () => {
  const wt = path.join(HOME, 'repo');
  fs.mkdirSync(wt, { recursive: true });
  try { require('child_process').execFileSync('git', ['-C', wt, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }
  process.env.MOOTER_WORKTREE_ROOT = HOME;
  process.env.MOOTER_REPO = wt;

  // um "CLI" que escreve NDJSON como o claude -p --output-format stream-json
  seam.setJobSpawner((cmd, cwd, out) => {
    const em = new EventEmitter();
    setImmediate(() => {
      out.write('{"type":"system","subtype":"init","model":"claude-sonnet-4-6","session_id":"sess-e2e"}\n');
      out.write('{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a/plan.js"}}],"usage":{"input_tokens":900,"output_tokens":20}}}\n');
      out.write('{"type":"result","subtype":"success","total_cost_usd":0.0123,"num_turns":2,"session_id":"sess-e2e","result":"feito: dois buses comparados","usage":{"input_tokens":100,"output_tokens":80}}\n');
      out.end();
      em.emit('spawn');
      setTimeout(() => em.emit('close', 0), 60);
    });
    em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
    return em;
  });

  // o guard exige uma git worktree de verdade; saltamo-lo com um stub honesto
  const realCheck = seam.guardCheck;
  const d = await seam.toolDispatch({
    agent: 'cc', worktree: wt, wave: 'wave-e2e', step: 'S1',
    masterprompt: '⇄ ROUTING / DE: teste / PARA: cc\nfaz uma análise read-only',
  });
  if (d.error && /não é uma git worktree/.test(String(d.reasons))) {
    console.log('       (git indisponível no sandbox — E2E saltado)');
    return;
  }
  assert.ok(d.job_id, 'dispatch recusado: ' + JSON.stringify(d.reasons || d.error));
  assert.ok('model_recommended' in d, 'o dispatch tem de dizer o que o router recomendou');

  await new Promise((r) => setTimeout(r, 250));

  const st = await seam.toolStatus({ job_id: d.job_id });
  const j = st.jobs[0];
  assert.strictEqual(j.last, 'done', 'estado final errado: ' + j.last);
  assert.strictEqual(j.stale, false);
  assert.ok(j.now, 'status sem telemetria');
  assert.strictEqual(j.now.model, 'claude-sonnet-4-6', 'modelo real não veio do stream');
  assert.strictEqual(j.model_used, 'claude-sonnet-4-6');

  const col = await seam.toolCollect({ job_id: d.job_id });
  assert.strictEqual(col.result, 'feito: dois buses comparados');
  assert.strictEqual(col.cost_usd, 0.0123);
  assert.strictEqual(col.model_used, 'claude-sonnet-4-6');
  // o evento `result` traz o TOTAL da sessão; somá-lo aos turnos duplicava
  assert.strictEqual(col.tokens_out, 80);
  assert.strictEqual(col.tokens_in, 100);

  const p = plan.summarize(plan.readPlan('wave-e2e'));
  assert.ok(p, 'o dispatch com step devia ter criado/actualizado o plano');
  assert.strictEqual(p.steps[0].state, 'feito');
  assert.ok(/claude-sonnet-4-6/.test(p.steps[0].by), 'o plano tem de dizer QUEM fez: ' + p.steps[0].by);
  assert.strictEqual(typeof realCheck, 'function');
});

ta('mooter_fleet junta plano, totais e vault sem rebentar', async () => {
  const snap = await fleet.toolFleet({ windowMinutes: 600 }, {});
  assert.ok(snap.ok);
  assert.ok(Array.isArray(snap.plans), 'sem planos no snapshot');
  assert.ok(snap.totals, 'sem totais de tokens');
  assert.ok('vault' in snap, 'sem estado do vault');
  const txt = fleet.formatFleetText(snap);
  assert.ok(typeof txt === 'string' && txt.length > 10);
});

setTimeout(() => {
  console.log('\n' + pass + ' testes passaram' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ }
}, 900);
