#!/usr/bin/env node
// 09-shadow-report.mjs — MP3 B1: le os eventos `decisor_shadow` do decisions.log (o que o F2-shadow acumulou),
// junta-os ao evento `classified` da mesma sessao (mesmo prompt_len, ts a <= 10 s) para saber o tier FINAL da rota,
// e imprime: n, outcomes, concordancia regra x D, distribuicao, p50 do decisor. Nunca imprime texto de prompt.
//   node 09-shadow-report.mjs [--log <decisions.log>] [--since 2026-09-21] [--json]
// Daqui a 1-2 semanas: os prompts acumulados sao o corpus 60d (rotular as cegas pelo mesmo metodo dos 40/57/37).
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LOG = opt('--log', process.env.MOOTER_DECISIONS_LOG || path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'));
const SINCE = Date.parse(opt('--since', '2026-09-21T00:00:00Z')) || 0;
const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const shadow = lines.filter((e) => e.event === 'decisor_shadow' && Date.parse(e.ts) >= SINCE);
const classified = lines.filter((e) => e.event === 'classified' && Date.parse(e.ts) >= SINCE);
const join = (s) => classified.find((c) => c.session_id === s.session_id && c.prompt_len === s.prompt_len && Math.abs((c.ts_ms || Date.parse(c.ts)) - s.ts_ms) <= 10000) || null;
const rows = shadow.map((s) => { const c = join(s); return { ...s, tier_final: c ? c.tier : null, arbiter_honored: c ? c.arbiter_honored : null }; });
const ok = rows.filter((r) => r.outcome === 'ok');
const count = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
const p50 = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const T = ['T0', 'T1', 'T2', 'T3']; const conf = {}; for (const r of ok) { const k = `${r.tier_regra}->${r.tier_D}`; conf[k] = (conf[k] || 0) + 1; }
const out = {
  log: LOG, since: new Date(SINCE).toISOString(), n_shadow_events: rows.length, sessions: new Set(rows.map((r) => r.session_id)).size, unique_prompts_sha12: new Set(rows.map((r) => r.prompt_sha12)).size,
  outcomes: count(rows, (r) => r.outcome), ms_D: { p50: p50(ok.map((r) => r.ms_D)), max: Math.max(0, ...ok.map((r) => r.ms_D)) },
  agree_regra_x_D: ok.length ? `${ok.filter((r) => r.agree_regra).length}/${ok.length} = ${(ok.filter((r) => r.agree_regra).length / ok.length).toFixed(3)}` : 'n/d',
  dist_regra: count(rows, (r) => r.tier_regra), dist_D: count(ok, (r) => r.tier_D), dist_final_joined: count(rows.filter((r) => r.tier_final), (r) => r.tier_final), joined_with_classified: rows.filter((r) => r.tier_final).length,
  regra_to_D: conf, abstained_D: ok.filter((r) => r.abstained_D).length, p_max_D_p50: p50(ok.map((r) => r.p_max_D)), model: count(rows, (r) => r.model),
  corpus_60d_hint: `${new Set(rows.map((r) => r.prompt_sha12)).size} prompts unicos acumulados; para o 60d: 1 por sessao estrito, 20-500 chars, rotular as cegas (Codex+Sonnet+Kimi) ANTES de olhar para tier_D`,
};
if (args.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
console.log(`F2-shadow · ${out.n_shadow_events} eventos desde ${out.since} em ${out.sessions} sessões (${out.unique_prompts_sha12} prompts únicos) · log ${LOG}`);
console.log(`outcomes ${JSON.stringify(out.outcomes)} · p50 decisor ${out.ms_D.p50 ?? 'n/d'} ms (max ${out.ms_D.max}) · abstém ${out.abstained_D} · p_max p50 ${out.p_max_D_p50?.toFixed?.(2) ?? 'n/d'}`);
console.log(`concordância regra×D (só ok): ${out.agree_regra_x_D} · regra ${JSON.stringify(out.dist_regra)} · D ${JSON.stringify(out.dist_D)} · final (join classified, ${out.joined_with_classified}) ${JSON.stringify(out.dist_final_joined)}`);
console.log(`regra→D: ${T.map((a) => T.map((b) => `${a}→${b}:${conf[`${a}->${b}`] || 0}`).join(' ')).join(' | ')}`);
console.log(`60d: ${out.corpus_60d_hint}`);
