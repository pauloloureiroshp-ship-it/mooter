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
const P6_DECISOES = process.env.P6_DECISIONS_LOG || path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const P6_LEDGER = process.env.P6_LEDGER || path.join(os.homedir(), '.mooter', 'ledger.jsonl');
// R4: estes dois ficheiros sao a maquina VIVA do dono e nao viajam com o pacote. Antes, `readJsonl` engolia o
// proprio erro (`catch { return null; }`) e o `|| []` transformava isso num array vazio — noutra maquina o corte A
// dizia «0 de 0 eventos com custo e origem» e parecia uma medicao. Falha agora alto, e diz que ficheiro falta.
const decisions = readJsonl(P6_DECISOES);
const ledger = readJsonl(P6_LEDGER);
for (const [nome, val, caminho, env] of [['decisions.log', decisions, P6_DECISOES, 'P6_DECISIONS_LOG'], ['ledger.jsonl', ledger, P6_LEDGER, 'P6_LEDGER']]) {
  if (val === null) {
    console.error(`P6: nao consegui ler ${nome} em ${caminho}`);
    console.error(`Este corte le a maquina viva do dono e esse ficheiro nao viaja com o pacote. Aponta ${env} para o teu, ou corre so o corte B (--proto).`);
    process.exit(2);
  }
}
const hasCost = (x) => x.cost_usd !== undefined && x.cost_usd !== null && x.cost_usd !== 'n/d';
const hasSource = (x) => typeof x.cost_source === 'string' && x.cost_source.length > 0;
const hasTokens = (x) => (Number(x.tokens_in) || 0) > 0 || (Number(x.tokens_out) || 0) > 0 || (Number(x.prompt_eval_count) || 0) > 0;
const summarize = (rows) => ({ total: rows.length, with_cost_field: rows.filter(hasCost).length, with_cost_gt0: rows.filter((x) => Number(x.cost_usd) > 0).length, with_cost_source: rows.filter(hasSource).length, with_cost_and_source: rows.filter((x) => hasCost(x) && hasSource(x)).length, with_tokens: rows.filter(hasTokens).length });
const A = {
  at: now(),
  note: 'protocolo: decisions.log (classified, executed) e ledger (done); o corte all do ledger e exploratorio',
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
const rec = reconcile(haikuLines, hostTotal, { basis: 'list' });
// AMENDMENT-1 (P6-04): tabela POR CHAMADA. ours = input/output do SSOT; reconstrucao EXPLORATORIA com a cache ao preco publicado
// da Anthropic para o Haiku 4.5 (leitura 0,10/M; escrita com TTL de 1 h 2,00/M — o claude -p usa 1 h). Esses multiplicadores NAO estao
// em pricing.js: sao declarados aqui, com a fonte, e nao entram em cost_usd. O 1,25x que a nota anterior dizia e o TTL de 5 min: errata.
const HAIKU_CACHE = { read_per_M: 0.10, write_1h_per_M: 2.00, source: 'platform.claude.com/docs/en/about-claude/pricing, lido pelo adversario (Codex) em 2026-09-09; NAO esta em tools/router/pricing.js' };
const perCall = haikuLines.map((l) => { const ours = l.list_price_input_output_usd; const host = l.host_reported_cost_usd; const cacheUsd = ((l.cache_read_input_tokens || 0) * HAIKU_CACHE.read_per_M + (l.cache_creation_input_tokens || 0) * HAIKU_CACHE.write_1h_per_M) / 1e6; const recon = typeof ours === 'number' ? ours + cacheUsd : 'n/d'; const num = (x) => typeof x === 'number'; return { id: l.id, model_key_used: l.model_key_used, prompt_eval_count: l.prompt_eval_count, eval_count: l.eval_count, cache_read: l.cache_read_input_tokens, cache_creation: l.cache_creation_input_tokens, ours_io_usd: ours, host_usd: host, delta_io_usd: (num(ours) && num(host)) ? +(ours - host).toFixed(9) : 'n/d', reconstructed_with_cache_1h_usd: num(recon) ? +recon.toFixed(9) : 'n/d', residual_usd: (num(recon) && num(host)) ? +(recon - host).toFixed(9) : 'n/d', completeness: l.completeness }; });
const reconTotal = perCall.reduce((a, r) => a + (typeof r.reconstructed_with_cache_1h_usd === 'number' ? r.reconstructed_with_cache_1h_usd : 0), 0);
const B_summary = { total: lines.length, with_cost_field: lines.filter(hasCost).length, with_cost_source: lines.filter(hasSource).length, with_cost_and_source: lines.filter((x) => hasCost(x) && hasSource(x)).length, with_tokens: lines.filter((x) => (x.prompt_eval_count || 0) > 0 || (x.eval_count || 0) > 0).length, nd: lines.filter((x) => x.cost_usd === 'n/d').length, by_source: lines.reduce((m, x) => (m[x.cost_source] = (m[x.cost_source] || 0) + 1, m), {}), by_completeness: lines.reduce((m, x) => (m[x.completeness] = (m[x.completeness] || 0) + 1, m), {}), note: 'P6-02: a presenca de cost_usd+cost_source e garantida pelo instrumento (formato); as 63 linhas rule tem 0/0 por politica, nao por contagem. O que se mede e COBERTURA nesta amostra, nao exactidao financeira.' };
const out = { at: now(), priced_at: PRICES_SNAPSHOT_DATE, A_ledger_actual: A, B_lines: B_summary, reconciliation_haiku_20: { ...rec, note: 'ours = preco de lista input/output do SSOT; host = total_cost_usd do CLI, que inclui cache_read (0,10/M) e cache_creation (2,00/M, TTL 1 h) — o Δ e esperado e fica impresso; a versao 1 desta nota dizia 1,25x (TTL 5 min), errado: AMENDMENT-1', cache_read_tokens_total: haikuLines.reduce((a, l) => a + (l.cache_read_input_tokens || 0), 0), cache_creation_tokens_total: haikuLines.reduce((a, l) => a + (l.cache_creation_input_tokens || 0), 0) }, reconciliation_haiku_20_per_call: { cache_pricing_declared: HAIKU_CACHE, rows: perCall, reconstructed_total_usd: +reconTotal.toFixed(9), host_total_usd: +hostTotal.toFixed(9), residual_total_usd: +(reconTotal - hostTotal).toFixed(9), status: 'EXPLORATORIO — nao pre-registado; a base pre-registada e reconciliation_haiku_20 (input/output do SSOT)' }, reconciliation_ollama: { note: 'a fonte das contagens e o proprio Ollama: Δ = 0 por construcao; nao e uma verificacao independente', lines: lines.filter((l) => l.cost_source === 'ollama_local').length } };
fs.writeFileSync(path.join(RES, 'analysis.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
