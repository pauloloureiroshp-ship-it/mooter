#!/usr/bin/env node
// 04-analyse.mjs — junta results/*.json (bracos C e D) com a referencia P1 (A regra, B juiz) e imprime a tabela.
// McNemar unilateral braco > regra so quando existe o MESMO corpus com predicoes por item da regra (P1 results/A-*.json).
import fs from 'node:fs'; import path from 'node:path';
import { HERE, P1, TIERS } from './lib-common.mjs';
const RES = path.join(HERE, 'results');
const files = fs.readdirSync(RES).filter((f) => /^[CD]-.*\.json$/.test(f));
const base = JSON.parse(fs.readFileSync(path.join(RES, '00-baseline.json'), 'utf8'));
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8'));
let ruleByItem = null;
try { const A = JSON.parse(fs.readFileSync(path.join(P1, 'results', 'A-nokey.json'), 'utf8')); ruleByItem = {}; for (const r of A.rows || []) if (r.run === 1 || r.run === undefined) ruleByItem[r.id] = r.tier; } catch {}
function mcnemar(rowsArm, labels) {
  if (!ruleByItem) return null; let b = 0, c = 0;
  for (const r of rowsArm) { const exp = labels[r.id]; const ru = ruleByItem[r.id]; if (!exp || !ru) continue; const armOK = r.tier === exp, ruleOK = ru === exp; if (armOK && !ruleOK) b++; if (!armOK && ruleOK) c++; }
  const n = b + c; if (!n) return { b, c, p: null };
  // binomial exacto unilateral P(X >= b | n, .5)
  let p = 0; for (let x = b; x <= n; x++) { let comb = 1; for (let i = 1; i <= x; i++) comb = comb * (n - x + i) / i; p += comb / 2 ** n; }
  return { b, c, p };
}
const lines = ['| Braço | Modelo | Corpus | acc | IC95 | ECE | p50 ms | abstém | McNemar > regra (b/c, p) | Gate |', '|---|---|---|---|---|---|---|---|---|---|'];
const P1r = base.P1_reference || {};
lines.push(`| A regra | classify.js ${base.classify_sha256?.slice(0, 8)} | 40 reais | ${P1r.A_key?.acc40 ?? 'n/d'} | [0,22, 0,51] | n/d (conf fixa) | ~0,002 in-proc / 207 hook | 0 | — | referência |`);
lines.push(`| B juiz | qwen2.5-coder:14b | 40 reais | ${P1r.B_juiz?.acc40 ?? 'n/d'} | [0,38, 0,67] | n/d | n/d | 0 | — | referência |`);
const verdicts = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); const s = j.summary; const labels = Object.fromEntries((j.rows || []).map((r) => [r.id, r.expected]));
  const mc = mcnemar(j.rows || [], labels);
  const isTrain = /gold|TREINO/.test(j.corpus);
  const gate = isTrain ? 'TREINO — não conta' : [s.p >= proto.success_criteria.acc40_min_to_beat_rule ? '✅ >regra' : '❌ ≤regra', s.calibration?.ece != null && s.calibration.ece <= proto.success_criteria.ece_max ? '✅ ECE' : '❌ ECE', s.latency_ms?.p50 <= proto.success_criteria.p50_ms_max_decisor_quente ? '✅ p50' : '❌ p50'].join(' ');
  lines.push(`| ${j.arm} | ${j.model}${j.subfolder ? '/' + j.subfolder : ''}${j.logprobs_used === false ? ' (amostragem!)' : ''} | ${j.corpus} (n=${s.n}) | ${s.p?.toFixed(3)} | [${s.ci95?.map((x) => x.toFixed(2)).join(', ')}] | ${s.calibration?.ece?.toFixed(3) ?? 'n/d'} | ${s.latency_ms?.p50?.toFixed(0)} | ${s.abstain} | ${mc ? `${mc.b}/${mc.c}, p=${mc.p?.toFixed(3) ?? 'n/d'}` : 'n/d (corpus ≠ P1)'} | ${gate} |`);
  verdicts.push({ file: f, arm: j.arm, model: j.model, corpus: j.corpus, acc: s.p, ece: s.calibration?.ece, p50: s.latency_ms?.p50, mcnemar: mc, confusion: s.confusion, train: isTrain });
}
const md = `# decisor-shadow — análise ${new Date().toISOString()}\n\nProtocolo: ${proto._status}\n\n${lines.join('\n')}\n\nBaseline sha ok: ${base.sha_matches_protocol} · ECE proxy do ledger: ${base.decisions_log?.ece?.toFixed?.(3) ?? 'n/d'} (${base.decisions_log?.executed ?? 'n/d'} executados)\n\n⚠️ Nada aqui é decisão: o adversário (codex) ataca esta tabela antes de qualquer PR em arbiter.js.\n`;
fs.writeFileSync(path.join(RES, '04-analysis.md'), md); fs.writeFileSync(path.join(RES, '04-analysis.json'), JSON.stringify({ at: new Date().toISOString(), baseline: base, arms: verdicts }, null, 1));
console.log(md);
