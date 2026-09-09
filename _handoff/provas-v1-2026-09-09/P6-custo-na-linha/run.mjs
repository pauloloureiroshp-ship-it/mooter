#!/usr/bin/env node
// run.mjs — P6: custo na linha, com origem. Ver protocol.json (congelado).
//   node run.mjs            -> results/ledger-actual.json, results/linhas-2.jsonl, results/analysis.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RES = path.join(HERE, 'results');
const require = createRequire(import.meta.url);
const { costLine, reconcile, PRICES_SNAPSHOT_DATE } = require(path.join(ROOT, 'tools', 'router', 'cost-line.js'));
const now = () => new Date().toISOString();
fs.mkdirSync(RES, { recursive: true });
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')); if (proto.estado !== 'CONGELADO') throw new Error('nao congelado');

// ── A: o ledger actual, tal como esta ───────────────────────────────────────
function readJsonl(f) { try { return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return null; } }
const decisions = readJsonl(path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log')) || [];
const ledger = readJsonl(path.join(os.homedir(), '.mooter', 'ledger.jsonl')) || [];
const hasCost = (x) => x.cost_usd !== undefined && x.cost_usd !== null && x.cost_usd !== 'n/d';
const hasSource = (x) => typeof x.cost_source === 'string' && x.cost_source.length > 0;
const hasTokens = (x) => (Number(x.tokens_in) || 0) > 0 || (Number(x.tokens_out) || 0) > 0 || (Number(x.prompt_eval_count) || 0) > 0;
const summarize = (rows) => ({ total: rows.length, with_cost_field: rows.filter(hasCost).length, with_cost_gt0: rows.filter((x) => Number(x.cost_usd) > 0).length, with_cost_source: rows.filter(hasSource).length, with_cost_and_source: rows.filter((x) => hasCost(x) && hasSource(x)).length, with_tokens: rows.filter(hasTokens).length });
const A = {
  at: now(),
  decisions_log: { classified: summarize(decisions.filter((x) => x.event === 'classified')), executed: summarize(decisions.filter((x) => x.event === 'executed')), executed_outcomes: decisions.filter((x) => x.event === 'executed').reduce((m, x) => (m[x.outcome] = (m[x.outcome] || 0) + 1, m), {}) },
  mooter_ledger: { all: summarize(ledger), done: summarize(ledger.filter((x) => x.event === 'done')) },
};
fs.writeFileSync(path.join(RES, 'ledger-actual.json'), JSON.stringify(A, null, 1));

// ── B: as linhas 2 desta corrida ────────────────────────────────────────────
const lines = [];
const P1 = path.join(HERE, '..', 'P1-decidir-custa-zero', 'results'); const P2 = path.join(HERE, '..', 'P2-o-tier-vale-alguma-coisa', 'results');
const Akey = JSON.parse(fs.readFileSync(path.join(P1, 'A-key.json'), 'utf8')).rows.filter((r) => r.run === 1 && !r.id.startsWith('train:'));
for (const r of Akey) lines.push({ prova: 'P1', id: r.id, decision: { tier: r.tier, category: r.task_category }, ...costLine({ engine: 'rule' }) });
const B = JSON.parse(fs.readFileSync(path.join(P1, 'B.json'), 'utf8')).rows.filter((r) => r.run === 1 && !r.id.startsWith('train:'));
for (const r of B) lines.push({ prova: 'P1', id: r.id, decision: { tier: r.tier }, ...costLine({ engine: 'ollama', model: 'qwen2.5-coder:14b', prompt_eval_count: r.tokens_in, eval_count: r.tokens_out }) });
const H = JSON.parse(fs.readFileSync(path.join(P2, 'cloud-haiku.json'), 'utf8')).rows;
const haikuLines = [];
for (const r of H) { const u = r.usage || {}; const l = { prova: 'P2', id: r.id, ...costLine({ engine: 'subscription', model: r.model_reported || 'claude-haiku-4-5-20251001', prompt_eval_count: u.input_tokens, eval_count: u.output_tokens, cache_read_input_tokens: u.cache_read_input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens, host_reported_cost_usd: r.total_cost_usd_reported }) }; lines.push(l); haikuLines.push(l); }
const L = JSON.parse(fs.readFileSync(path.join(P2, 'local-holdout.json'), 'utf8')).rows;
for (const r of L) lines.push({ prova: 'P2', id: r.id, ...costLine({ engine: 'ollama', model: r.model, prompt_eval_count: r.tokens_in, eval_count: r.tokens_out }) });
fs.writeFileSync(path.join(RES, 'linhas-2.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

const hostTotal = H.reduce((a, r) => a + (Number(r.total_cost_usd_reported) || 0), 0);
const rec = reconcile(haikuLines, hostTotal);
// reconciliacao alternativa: com cache_read e cache_creation ao preco de lista de input (o CLI precifica cache_read a 10 % e cache_creation a 125 % do input — declarado, nao aplicado: o SSOT nao tem esses multiplicadores)
const B_summary = { total: lines.length, with_cost_field: lines.filter(hasCost).length, with_cost_source: lines.filter(hasSource).length, with_cost_and_source: lines.filter((x) => hasCost(x) && hasSource(x)).length, nd: lines.filter((x) => x.cost_usd === 'n/d').length, by_source: lines.reduce((m, x) => (m[x.cost_source] = (m[x.cost_source] || 0) + 1, m), {}) };
const out = { at: now(), priced_at: PRICES_SNAPSHOT_DATE, A_ledger_actual: A, B_lines: B_summary, reconciliation_haiku_20: { ...rec, note: 'ours = preco de lista input/output do SSOT; host = total_cost_usd do CLI, que inclui cache_read (0,1x) e cache_creation (1,25x) — o Δ e esperado e fica impresso', cache_read_tokens_total: haikuLines.reduce((a, l) => a + (l.cache_read_input_tokens || 0), 0), cache_creation_tokens_total: haikuLines.reduce((a, l) => a + (l.cache_creation_input_tokens || 0), 0) }, reconciliation_ollama: { note: 'a fonte das contagens e o proprio Ollama: Δ = 0 por construcao; nao e uma verificacao independente', lines: lines.filter((l) => l.cost_source === 'ollama_local').length } };
fs.writeFileSync(path.join(RES, 'analysis.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
