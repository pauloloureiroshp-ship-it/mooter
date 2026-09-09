#!/usr/bin/env node
// run.mjs — P3: obediencia medida. Ver protocol.json (congelado, commitado antes).
//
//   node run.mjs --corpus          fixa corpus-20.json (T0/T1 pelo A-key do P1, sem push/deploy/delete)
//   node run.mjs --arm A|B [--model sonnet] [--only n01,n02]
//   node run.mjs --analyse

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RES = path.join(HERE, 'results');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const now = () => new Date().toISOString();
const save = (n, o) => { fs.mkdirSync(RES, { recursive: true }); fs.writeFileSync(path.join(RES, n), JSON.stringify(o, null, 1)); console.log('->', path.join('results', n)); };
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8')); } catch { return null; } };
const CLAUDE_EXE = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');

function buildCorpus() {
  const c40 = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'P1-decidir-custa-zero', 'corpus-40.json'), 'utf8')).items;
  const A = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'P1-decidir-custa-zero', 'results', 'A-key.json'), 'utf8')).rows.filter((r) => r.run === 1);
  const tier = {}; for (const r of A) tier[r.id] = r.tier;
  const bad = /\b(push|deploy|delete|rm -rf|drop|force)\b/i;
  const items = c40.filter((x) => ['T0', 'T1'].includes(tier[x.id]) && !bad.test(x.prompt)).slice(0, 20).map((x) => ({ id: x.id, tier_key: tier[x.id], prompt: x.prompt }));
  const out = { _schema: 'provas-v1/p3-corpus-20', _generated: now(), _rule: 'primeiros 20 por id com tier T0/T1 (A-key corrida 1), sem push/deploy/delete/rm/drop/force', items };
  fs.writeFileSync(path.join(HERE, 'corpus-20.json'), JSON.stringify(out, null, 1));
  console.log('corpus-20', items.length, 'sha', crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, 'corpus-20.json'))).digest('hex'));
}

function snapshotRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p3-snap-'));
  const r = spawnSync('bash', ['-lc', `cd "${ROOT.split('\\').join('/')}" && git archive HEAD | tar -x -C "${dir.split('\\').join('/')}"`], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('snapshot falhou: ' + r.stderr);
  return dir;
}

// proxy de contagem para o Ollama: a linha do recibo (modelo, tokens) por chamada
async function ollamaCounter(upstream = 'http://127.0.0.1:11434') {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const up = new URL(upstream);
      const preq = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host } }, (pres) => {
        let rbody = ''; pres.on('data', (c) => { rbody += c; res.write(c); });
        pres.on('end', () => { let j = null; try { j = JSON.parse(rbody); } catch { /* stream ou nao-json */ } let model = null; try { model = JSON.parse(body).model; } catch { /* */ } calls.push({ at: now(), path: req.url, model: (j && j.model) || model, prompt_eval_count: j && j.prompt_eval_count, eval_count: j && j.eval_count, status: pres.statusCode, body_bytes: Buffer.byteLength(body) }); res.end(); });
        res.writeHead(pres.statusCode, pres.headers);
      });
      preq.on('error', (e) => { calls.push({ at: now(), path: req.url, error: e.message }); res.statusCode = 502; res.end(); });
      preq.end(body);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, calls, close: () => new Promise((r) => srv.close(() => r())) };
}

async function runArm(arm, model, only) {
  const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')); if (proto.estado !== 'CONGELADO') throw new Error('nao congelado');
  const corpus = JSON.parse(fs.readFileSync(path.join(HERE, 'corpus-20.json'), 'utf8')).items;
  const hookLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p3-')), 'hook.jsonl');
  const settings = { hooks: {} };
  if (arm === 'B') settings.hooks.PreToolUse = [{ matcher: 'Agent|Task', hooks: [{ type: 'command', command: `node "${path.join(HERE, 'pretooluse-route.js').split('\\').join('/')}"`, timeout: 10 }] }];
  const settingsPath = path.join(path.dirname(hookLog), 'settings.json'); fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const rows = []; let consecutiveFail = 0;
  for (const it of corpus) {
    if (only && !only.includes(it.id)) continue;
    const snap = snapshotRepo();
    const counter = await ollamaCounter();
    const t0 = Date.now();
    const env = { ...process.env, CLAUDECODE: '', OLLAMA_HOST: counter.url, P3_HOOK_LOG: hookLog, P3_ROUTER_DIR: ROUTER_DIR };
    const argv = ['-p', '--model', model, '--max-turns', '12', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--settings', settingsPath, '--allowedTools', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Agent', 'Bash(node *)', 'Bash(npm test*)', 'Bash(bash *ollama_call.sh*)'];
    const child = spawn(CLAUDE_EXE, argv, { cwd: snap, env, windowsHide: true });
    let out = '', err = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
    child.stdin.end(it.prompt);
    const exit = await new Promise((resolve) => { const t = setTimeout(() => { child.kill(); resolve('timeout'); }, 300000); child.on('close', (c) => { clearTimeout(t); resolve(c); }); });
    const ms = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 500));
    const msgs = out.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const agentCalls = [];
    for (const m of msgs) { const content = m.message && Array.isArray(m.message.content) ? m.message.content : []; for (const b of content) if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) agentCalls.push({ subagent_type: b.input && b.input.subagent_type, model: b.input && b.input.model, description: b.input && b.input.description, parent_tool_use_id: m.parent_tool_use_id || null }); }
    const result = msgs.find((m) => m.type === 'result');
    let lastDecision = null; try { lastDecision = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'last-subagent.json'), 'utf8')); } catch { /* */ }
    let hookLines = []; try { hookLines = fs.readFileSync(hookLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* */ }
    const myHook = hookLines.filter((h) => h.session === (result && result.session_id));
    const ollama = counter.calls.slice(); await counter.close();
    const row = { id: it.id, tier_key_p1: it.tier_key, arm, model, exit, ms, decision_at_spawn: lastDecision, agent_calls: agentCalls, delegations: agentCalls.length, hook_lines: myHook, ollama_calls: ollama, executed_local: ollama.filter((c) => c.eval_count != null).length, usage: result && result.usage ? { in: result.usage.input_tokens, out: result.usage.output_tokens, cache_read: result.usage.cache_read_input_tokens, cache_create: result.usage.cache_creation_input_tokens } : null, num_turns: result && result.num_turns, is_error: result && result.is_error, stderr: err.slice(0, 300), result_text: result && String(result.result || '').slice(0, 200) };
    rows.push(row);
    console.log(it.id, arm, 'exit', exit, Math.round(ms / 1000) + 's', 'delegations', agentCalls.length, agentCalls.map((a) => `${a.subagent_type}/${a.model || '-'}`).join(','), 'ollama', ollama.length, 'hook', myHook.map((h) => h.action).join(','));
    try { fs.rmSync(snap, { recursive: true, force: true }); } catch { /* */ }
    consecutiveFail = exit === 0 ? 0 : consecutiveFail + 1;
    save(`${arm}-${model}.json`, { arm, model, at: now(), hook_log: hookLog, rows });
    if (consecutiveFail >= 3) { console.error('regra de paragem: 3 falhas consecutivas'); break; }
  }
}

async function analyse() {
  const { wilson } = await import('file:///' + path.join(HERE, '..', 'lib', 'stats.mjs').split('\\').join('/'));
  const out = { at: now(), arms: {} };
  for (const f of fs.readdirSync(RES).filter((x) => /^(A|B)-.*\.json$/.test(x))) {
    const d = load(f); const n = d.rows.length;
    const deleg = d.rows.filter((r) => r.delegations > 0).length;
    const local = d.rows.filter((r) => r.executed_local > 0).length;
    const localSub = d.rows.filter((r) => r.agent_calls.some((a) => /local-summarizer|local-transformer/.test(a.subagent_type || ''))).length;
    // metrica do protocolo ('executed'): delegacao cujo subagente FEZ uma chamada ao Ollama — spawn local-* E chamada com eval_count na mesma sessao.
    // executed_local (acima) conta TODAS as chamadas Ollama da sessao, incluindo as do Option A do hook (qwen2.5:3b / 14b): e um proxy largo, nao a metrica.
    const executedDeleg = d.rows.filter((r) => r.agent_calls.some((a) => /local-summarizer|local-transformer/.test(a.subagent_type || '')) && r.ollama_calls.some((c) => c.eval_count != null)).length;
    // AMENDMENT-1 (adversario P3-01): ATRIBUICAO. O Option A do hook (ollama_call_node.js) usa num_predict 256 e prefere qwen3:30b;
    // o ollama_call.sh que o subagente local corre usa num_predict 512. Uma chamada com eval_count === 256 tem a assinatura do hook.
    // Estrito: sessao com spawn local-* E chamada SEM a assinatura do hook (e, em B, posterior ao rewrite do hook).
    const isHookSig = (c) => c.eval_count === 256 || c.model === 'gemma4:e4b' || c.model === 'qwen2.5:3b';
    const strict = d.rows.filter((r) => r.agent_calls.some((a) => /local-summarizer|local-transformer/.test(a.subagent_type || '')) && r.ollama_calls.some((c) => c.eval_count != null && !isHookSig(c) && (!r.hook_lines.length || r.hook_lines.every((h) => !h.ts || c.at > h.ts)))).length;
    const sigCounts = d.rows.reduce((m, r) => { for (const c of r.ollama_calls) { const k = isHookSig(c) ? 'assinatura_do_hook_option_a' : 'outra'; m[k] = (m[k] || 0) + 1; } return m; }, {});
    const ollamaByModel = d.rows.reduce((m, r) => { for (const c of r.ollama_calls) { const k = c.model || '?'; m[k] = m[k] || { calls: 0, with_eval: 0 }; m[k].calls++; if (c.eval_count != null) m[k].with_eval++; } return m; }, {});
    const cheap = d.rows.filter((r) => r.agent_calls.some((a) => /cheap-triage/.test(a.subagent_type || '') || a.model === 'haiku')).length;
    const hookReached = d.rows.filter((r) => r.hook_lines.length > 0).length;
    const rewrites = d.rows.reduce((a, r) => a + r.hook_lines.filter((h) => /rewrite/.test(h.action)).length, 0);
    const tiers = {}; for (const r of d.rows) { const t = r.decision_at_spawn && r.decision_at_spawn.tier; tiers[t] = (tiers[t] || 0) + 1; }
    out.arms[f.replace('.json', '')] = { n, exits: d.rows.map((r) => r.exit).join(' '), recommendations_by_tier: tiers, sessions_with_delegation: { k: deleg, ...wilson(deleg, n) }, sessions_with_any_ollama_call: { k: local, ...wilson(local, n), note: 'proxy largo: inclui as chamadas do Option A do hook' }, sessions_with_local_spawn_AND_any_ollama_call: { k: executedDeleg, ...wilson(executedDeleg, n), definicao: 'coocorrencia: spawn local-* E chamada Ollama com eval_count na mesma sessao — NAO atribui a chamada ao subagente (AMENDMENT-1)' }, sessions_with_EXECUTED_local_delegation_strict: { k: strict, ...wilson(strict, n), definicao: 'spawn local-* E chamada Ollama sem a assinatura do Option A do hook (eval_count != 256, modelo != gemma4/qwen2.5:3b) e, em B, posterior ao rewrite — a metrica do protocolo (executed)' }, ollama_calls_by_signature: sigCounts, decision_at_spawn_note: 'decision_at_spawn e lido no FIM da sessao de ~/.claude/tools/router/last-subagent.json, ficheiro partilhado que a sessao do operador tambem escreve: NAO e a decisao no instante do spawn (D10); recommendations_by_tier e n/d como medida', ollama_calls_by_model: ollamaByModel, sessions_spawning_local_subagent: localSub, sessions_spawning_cheap_or_haiku: cheap, hook_reached_sessions: hookReached, hook_rewrites: rewrites, ollama_calls_total: d.rows.reduce((a, r) => a + r.ollama_calls.length, 0), ollama_tokens: d.rows.reduce((a, r) => a + r.ollama_calls.reduce((b, c) => b + (c.prompt_eval_count || 0) + (c.eval_count || 0), 0), 0), usage_mean: (() => { const u = d.rows.filter((r) => r.usage); return u.length ? { in: u.reduce((a, r) => a + (r.usage.in || 0), 0) / u.length, out: u.reduce((a, r) => a + (r.usage.out || 0), 0) / u.length, cache_read: u.reduce((a, r) => a + (r.usage.cache_read || 0), 0) / u.length } : null; })(), mean_s: d.rows.reduce((a, r) => a + r.ms, 0) / n / 1000, per_prompt: d.rows.map((r) => `${r.id}:${(r.decision_at_spawn || {}).tier}:${r.delegations}:${r.executed_local}:${r.hook_lines.map((h) => h.action).join('|')}`) };
  }
  save('analysis.json', out); console.log(JSON.stringify(out, null, 1));
}

if (has('--corpus')) buildCorpus();
else if (has('--analyse')) await analyse();
else if (opt('--arm')) await runArm(opt('--arm'), opt('--model', 'sonnet'), opt('--only') ? opt('--only').split(',') : null);
else { console.error('uso: --corpus | --arm A|B [--model sonnet|opus] [--only ids] | --analyse'); process.exit(2); }
