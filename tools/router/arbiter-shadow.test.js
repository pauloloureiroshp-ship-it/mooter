// arbiter-shadow.test.js — F2-shadow (MP3 · 2026-09-21): o decisor tipado local em modo sombra
// regista e NUNCA roteia. Quatro casos pre-registados em protocol.json#mp3.frente_B.tests, mais
// duas guardas (kill-switch do arbiter; nunca lanca). Zero rede: tudo por _mockResponses/_mockTimeout.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { shadowDecisor, ollamaLogit } = require('./arbiter.js');
const HERE = __dirname;

// Resposta crua do /v1/chat/completions com top_logprobs na 1.a posicao (forma real do Ollama 0.34).
const chat = (top) => ({ choices: [{ message: { content: top[0][0] }, logprobs: { content: [{ token: top[0][0], top_logprobs: top.map(([token, p]) => ({ token, logprob: Math.log(p) })) }] } }] });
const lp = (pairs) => chat(pairs.map(([t, p]) => [t, p]));
// 4 respostas: tier (A=T0 B=T1 C=T2 D=T3), complexity (A/B/C), high_stakes (A=yes B=no), needs_repo (A=yes B=no)
const mockT2 = [lp([['C', 0.62], ['A', 0.20], ['B', 0.10], ['D', 0.05]]), lp([['B', 0.5], ['A', 0.3], ['C', 0.2]]), lp([['B', 0.8], ['A', 0.2]]), lp([['A', 0.7], ['B', 0.3]])];
const mockT0 = [lp([['A', 0.9], ['B', 0.05], ['C', 0.03], ['D', 0.02]]), lp([['A', 0.8], ['B', 0.2]]), lp([['B', 0.9], ['A', 0.1]]), lp([['B', 0.9], ['A', 0.1]])];

const freshLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-test-')), 'decisions.log');
const readEvents = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const withEnv = (patch, fn) => {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
  try { return fn(); } finally { for (const k of Object.keys(patch)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

test('(1) sem MOOTER_DECISOR_SHADOW: nenhum evento, devolve null, decision intacta', () => {
  const log = freshLog();
  const decision = Object.freeze({ tier: 'T1', confidence: 0.6, task_category: 'ambiguous_medium', escalation_rule: 'none' });
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: undefined, MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('explica este erro: TypeError x is not a function', decision, { _logPath: log, _mockResponses: mockT2 }));
  assert.strictEqual(ev, null);
  assert.deepStrictEqual(readEvents(log), []);
  assert.strictEqual(decision.tier, 'T1');
});

test('(2) com env + mock de logprobs: evento com o schema pre-registado e ROTA INALTERADA', () => {
  const log = freshLog();
  const decision = { tier: 'T0', confidence: 0.99, task_category: 'trivial_local', escalation_rule: 'none', recommended_backend: 'ollama', recommended_model: 'qwen2.5:3b' };
  const before = JSON.stringify(decision);
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('investiga porque e que o websocket reconnect falha as vezes', decision, { _logPath: log, _mockResponses: mockT2, session_id: 'sess-test' }));
  assert.ok(ev, 'evento devolvido');
  assert.strictEqual(ev.event, 'decisor_shadow');
  assert.strictEqual(ev.outcome, 'ok');
  assert.strictEqual(ev.backend, 'ollama-logit');
  assert.strictEqual(ev.session_id, 'sess-test');
  assert.strictEqual(ev.tier_regra, 'T0');
  assert.strictEqual(ev.confidence_regra, 0.99);
  assert.strictEqual(ev.task_category, 'trivial_local');
  assert.strictEqual(ev.tier_D, 'T2', 'o decisor sombra diria T2 (argmax do mock)');
  assert.ok(Math.abs(ev.p_max_D - 0.62 / 0.97) < 1e-9, 'p(T2) normalizada pela massa nas letras');
  assert.deepStrictEqual(Object.keys(ev.probs_D), ['T0', 'T1', 'T2', 'T3']);
  assert.strictEqual(ev.abstained_D, false);
  assert.strictEqual(ev.agree_regra, false);
  assert.ok(Math.abs(ev.aux_D.p_needs_repo - 0.7) < 1e-9);
  assert.ok(Math.abs(ev.aux_D.p_high_stakes - 0.2) < 1e-9);
  assert.strictEqual(typeof ev.prompt_sha12, 'string'); assert.strictEqual(ev.prompt_sha12.length, 12);
  for (const k of ['ts', 'ts_ms', 'hook_ts_ms', 'prompt_len', 'ms_D', 'model', 'tier_arbiter_haiku']) assert.ok(k in ev, `campo ${k}`);
  // sem texto do prompt: nem `prompt`, nem `prompt_preview` (round 3, A1) — o evento serializado nao contem nenhuma palavra do prompt
  const serial = JSON.stringify(ev);
  for (const word of ['investiga', 'websocket', 'reconnect']) assert.ok(!serial.includes(word), `o evento nao pode conter «${word}»`);
  assert.ok(!('prompt' in ev) && !('prompt_preview' in ev) && !('text' in ev), 'sem texto do prompt');
  // a rota nao mexe: nem tier, nem backend, nem modelo, nem campo novo
  assert.strictEqual(JSON.stringify(decision), before, 'decision byte-identica antes e depois');
  const events = readEvents(log);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].tier_D, 'T2');
});

test('(3) HIGH_RISK continua a ser da regra: o shadow diz T0 num prompt de push e a rota fica T3', () => {
  const log = freshLog();
  const decision = { tier: 'T3', confidence: 0.95, task_category: 'high_risk', escalation_rule: 'high_risk_floor', risk_level: 'high' };
  const before = JSON.stringify(decision);
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('git push --force origin main and deploy to prod now', decision, { _logPath: log, _mockResponses: mockT0 }));
  assert.strictEqual(ev.tier_D, 'T0', 'o decisor (mock) sub-roteia');
  assert.strictEqual(ev.tier_regra, 'T3');
  assert.strictEqual(ev.agree_regra, false);
  assert.strictEqual(decision.tier, 'T3', 'a regra manda: T3 intacto');
  assert.strictEqual(JSON.stringify(decision), before);
});

test('(9) MP8: prompt HIGH_RISK -> high_risk_hint true e risk_level_regra da regra; a regex e byte-igual a do hook', () => {
  const log = freshLog();
  const decision = { tier: 'T3', confidence: 0.95, task_category: 'high_risk', escalation_rule: 'high_risk_floor', risk_level: 'high' };
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('faz deploy disto para producao e roda a migration', decision, { _logPath: log, _mockResponses: mockT0 }));
  assert.strictEqual(ev.high_risk_hint, true);
  assert.strictEqual(ev.risk_level_regra, 'high');
  assert.strictEqual(typeof ev.high_risk_hint, 'boolean');
  // paridade: a copia em arbiter.js tem de ser byte-igual a linha do hook — se uma mudar sem a outra, isto morde
  const line = (f) => (fs.readFileSync(path.join(HERE, f), 'utf8').match(/^const HIGH_RISK_HINT = (\/.*\/i);\s*$/m) || [])[1];
  assert.ok(line('inject_context.js'), 'regex no hook'); assert.strictEqual(line('arbiter.js'), line('inject_context.js'), 'HIGH_RISK_HINT igual nos dois ficheiros');
  // e continua sem texto
  const serial = JSON.stringify(ev); for (const w of ['deploy', 'producao', 'migration']) assert.ok(!serial.includes(w), `sem «${w}»`);
  assert.strictEqual(readEvents(log)[0].high_risk_hint, true);
});

test('(10) MP8: prompt normal -> high_risk_hint false; risk_level invalido/ausente -> null', () => {
  const log = freshLog();
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('muda a cor do botao de login para azul', { tier: 'T0', confidence: 0.8, task_category: 'trivial_local', escalation_rule: 'none', risk_level: 'minimal' }, { _logPath: log, _mockResponses: mockT0 }));
  assert.strictEqual(ev.high_risk_hint, false);
  assert.strictEqual(ev.risk_level_regra, 'minimal');
  const ev2 = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('muda a cor do botao de login para azul', { tier: 'T0', confidence: 0.8, risk_level: 'nao-e-um-nivel' }, { _logPath: log, _mockResponses: mockT0 }));
  assert.strictEqual(ev2.risk_level_regra, null);
  const ev3 = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('muda a cor do botao de login para azul', { tier: 'T0', confidence: 0.8 }, { _logPath: log, _mockResponses: mockT0 }));
  assert.strictEqual(ev3.risk_level_regra, null); assert.strictEqual(ev3.high_risk_hint, false);
});

test('(4) timeout: evento outcome:"timeout", tier_D null, rota inalterada', () => {
  const log = freshLog();
  const decision = { tier: 'T2', confidence: 0.7, task_category: 'reasoning' };
  const before = JSON.stringify(decision);
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('compara as duas abordagens para o cache', decision, { _logPath: log, _mockTimeout: true }));
  assert.strictEqual(ev.outcome, 'timeout');
  assert.strictEqual(ev.tier_D, null);
  assert.strictEqual(ev.probs_D, null);
  assert.strictEqual(ev.agree_regra, null);
  assert.strictEqual(JSON.stringify(decision), before);
  assert.strictEqual(readEvents(log)[0].outcome, 'timeout');
});

test('(5) MOOTER_ARBITER_DISABLE=1 ganha ao MOOTER_DECISOR_SHADOW=1: zero comportamento novo', () => {
  const log = freshLog();
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: '1' }, () => shadowDecisor('qualquer coisa', { tier: 'T1' }, { _logPath: log, _mockResponses: mockT2 }));
  assert.strictEqual(ev, null);
  assert.deepStrictEqual(readEvents(log), []);
});

test('(6) nunca lanca: resposta sem logprobs -> outcome parse_failed; prompt vazio -> null', () => {
  const log = freshLog();
  const ev = withEnv({ MOOTER_DECISOR_SHADOW: '1', MOOTER_ARBITER_DISABLE: undefined }, () => shadowDecisor('x'.repeat(30), { tier: 'T1' }, { _logPath: log, _mockResponses: [{ choices: [{ message: { content: 'C' } }] }, {}, {}, {}] }));
  assert.strictEqual(ev.outcome, 'parse_failed');
  assert.strictEqual(ev.tier_D, null);
  assert.strictEqual(withEnv({ MOOTER_DECISOR_SHADOW: '1' }, () => shadowDecisor('', { tier: 'T1' }, { _logPath: log })), null);
  assert.strictEqual(ollamaLogit('', {}), null);
});

test('(7) inject_context.js: sem a env, o hook nao emite decisor_shadow; e o classify.js continua congelado', () => {
  const sha = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(HERE, 'classify.js'))).digest('hex');
  assert.strictEqual(sha, '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f', 'classify.js FROZEN');
  const src = fs.readFileSync(path.join(HERE, 'inject_context.js'), 'utf8');
  const lines = src.split('\n').filter((l) => /shadowDecisor/.test(l));
  assert.strictEqual(lines.length, 1, 'exactamente UMA linha nova no hook');
  assert.ok(/MOOTER_DECISOR_SHADOW === '1'/.test(lines[0]) && /^try \{/.test(lines[0].trim()) && /catch/.test(lines[0]), 'gated pela env, dentro de try/catch');
  assert.ok(src.indexOf('shadowDecisor') < src.indexOf('v0.8 HAIKU ARBITER'), 'antes da seccao do arbiter Haiku (apanha todos os prompts)');
  // Corre o hook real por stdin num HOME isolado (o hook escreve em ~/.claude/tools/router/decisions.log),
  // sem a env: nenhum evento decisor_shadow no log.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-hook-'));
  fs.mkdirSync(path.join(home, '.claude', 'tools', 'router'), { recursive: true });
  const log = path.join(home, '.claude', 'tools', 'router', 'decisions.log');
  const env = { ...process.env, HOME: home, USERPROFILE: home, MOOTER_DECISIONS_LOG: log, MOOTER_ARBITER_DISABLE: '1' };
  delete env.MOOTER_DECISOR_SHADOW; delete env.ANTHROPIC_API_KEY;
  const r = spawnSync(process.execPath, [path.join(HERE, 'inject_context.js')], { input: JSON.stringify({ session_id: 'shadow-hook-test', prompt: 'muda a cor do botao login para azul' }), encoding: 'utf8', env, timeout: 15000 });
  assert.strictEqual(r.status, 0, `hook exit 0 (stderr: ${(r.stderr || '').slice(0, 200)})`);
  assert.ok(!/decisor_shadow/.test(r.stdout || ''), 'nada de shadow no output do hook');
  assert.strictEqual(readEvents(log).filter((e) => e.event === 'decisor_shadow').length, 0);
});

test('(8) hook real COM env: rota (router-hint) identica a sem env, o hook nao espera pelo worker, e o evento chega depois (sem texto)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-hook-on-'));
  fs.mkdirSync(path.join(home, '.claude', 'tools', 'router'), { recursive: true });
  const log = path.join(home, '.claude', 'tools', 'router', 'decisions.log');
  const base = { ...process.env, HOME: home, USERPROFILE: home, MOOTER_DECISIONS_LOG: log };
  delete base.ANTHROPIC_API_KEY; delete base.MOOTER_ARBITER_DISABLE;
  const prompt = 'compara as duas abordagens para o cache e recomenda uma';
  const run = (env) => spawnSync(process.execPath, [path.join(HERE, 'inject_context.js')], { input: JSON.stringify({ session_id: 'shadow-hook-on', prompt }), encoding: 'utf8', env, timeout: 20000 });
  run({ ...base, MOOTER_DECISOR_SHADOW: undefined }); // 1.a chamada num HOME virgem emite <retomar-camada1>; descarta-se para comparar em igualdade de estado
  const off = run({ ...base, MOOTER_DECISOR_SHADOW: undefined });
  const t0 = Date.now(); const on = run({ ...base, MOOTER_DECISOR_SHADOW: '1' }); const onMs = Date.now() - t0;
  assert.strictEqual(on.status, 0);
  // o hook nao e byte-deterministico entre chamadas (o bloco <optimized-task> depende de cache); compara-se a ROTA: os campos do <router-hint>
  const route = (s) => (s.match(/^(tier|task_category|risk_level|recommended_backend|recommended_model|suggested_subagent|confidence|max_tier|escalation): .*$/gm) || []).join('\n');
  assert.ok(route(off.stdout).includes('tier: '), 'o hook emitiu um router-hint');
  assert.strictEqual(route(on.stdout), route(off.stdout), 'a rota (router-hint) e identica com e sem shadow');
  // o worker e desligado: o evento pode ainda nao existir quando o hook sai; espera ate 6 s
  let ev = null; for (let i = 0; i < 60 && !ev; i++) { ev = readEvents(log).find((e) => e.event === 'decisor_shadow'); if (!ev) await new Promise((r) => setTimeout(r, 100)); }
  assert.ok(ev, 'o worker desligado escreveu o evento');
  assert.strictEqual(ev.session_id, 'shadow-hook-on');
  assert.strictEqual(ev.prompt_len, prompt.length);
  assert.ok(['ok', 'timeout', 'failed', 'parse_failed'].includes(ev.outcome), 'outcome valido: ' + ev.outcome);
  assert.ok(!JSON.stringify(ev).includes('abordagens'), 'sem texto do prompt no evento');
  assert.ok(ev.tier_regra && /^T[0-3]$/.test(ev.tier_regra), 'tier da regra registado');
  // o hook nao esperou: o tempo do hook ON nao inclui os ~250-800 ms do decisor (folga generosa: +150 ms sobre o OFF, medido)
  const t1 = Date.now(); const off2 = run({ ...base, MOOTER_DECISOR_SHADOW: undefined }); const offMs = Date.now() - t1;
  assert.ok(off2.status === 0);
  assert.ok(onMs < offMs + 400, `hook ON (${onMs} ms) nao pode esperar pelo decisor (OFF ${offMs} ms)`);
});
