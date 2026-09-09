// amend.mjs — respostas ao adversario (adversary.md) que sao CALCULOS sobre o
// bruto ja existente, nunca novas corridas: baselines constantes, kappa so nos
// 40, caudas (p95/media) do hook, distribuicao real da regra nos 23 do R-24,
// precisao do tier EMITIDO pelo hook, contagem de prompts alterados pela
// anonimizacao. Escreve results/analysis-extra.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RES = path.join(HERE, 'results');
const { wilson, cohenKappa, summary } = await import('file:///' + path.join(HERE, '..', 'lib', 'stats.mjs').replace(/\\/g, '/'));
const load = (n) => JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8'));
const L = {}; for (const l of JSON.parse(fs.readFileSync(path.join(HERE, 'labels-63.json'), 'utf8')).labels) L[l.id] = l.tier;
const ids63 = Object.keys(L), ids40 = ids63.filter((i) => i.startsWith('n')), ids23 = ids63.filter((i) => i.startsWith('r'));
const count = (a) => { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return m; };
const accOf = (pred, ids) => { let k = 0, n = 0; for (const id of ids) { if (pred[id] == null) continue; n++; if (pred[id] === L[id]) k++; } return { k, n, ...wilson(k, n) }; };

const A = load('A-key.json'); const a1 = {}; for (const r of A.rows) if (r.run === 1) a1[r.id] = r.tier;
const B = load('B.json'); const b1 = {}; for (const r of B.rows) if (r.run === 1) b1[r.id] = r.tier;
const H = load('A-hook.json');
const R2 = load('rater2-local.json'); const r2 = {}; for (const r of R2.rows) r2[r.id] = r.tier;

// W1: a distribuicao REAL da regra nos 23 do R-24, derivada do artefacto
const rule_on_r24 = count(ids23.map((id) => a1[id]));
const llm_on_r24 = count(ids23.map((id) => b1[id]));

// S3: baselines constantes e classe maioritaria do treino
const constant = {};
for (const t of ['T0', 'T1', 'T2', 'T3']) { const pred = {}; for (const id of ids63) pred[id] = t; constant[`always_${t}`] = { on63: accOf(pred, ids63), on40: accOf(pred, ids40), on23: accOf(pred, ids23) }; }
const label_dist = { on63: count(ids63.map((i) => L[i])), on40: count(ids40.map((i) => L[i])) };

// L4: kappa so nos 40 (o bloco R-24 inflaciona o acordo agregado)
const ka = [], kb = []; for (const id of ids40) if (r2[id]) { ka.push(L[id]); kb.push(r2[id]); }
const kappa40 = cohenKappa(ka, kb, ['T0', 'T1', 'T2', 'T3']);
const raters_agree_40 = ka.filter((x, i) => x === kb[i]).length;
// desacordos entre rotuladores: quantos a regra acerta contra CADA um
const disagree40 = ids40.filter((id) => r2[id] && r2[id] !== L[id]);
const rule_matches_rater2_on_disagreements = disagree40.filter((id) => a1[id] === r2[id]).length;
const rule_matches_codex_on_disagreements = disagree40.filter((id) => a1[id] === L[id]).length;
const rule_acc40_vs_rater2 = (() => { let k = 0, n = 0; for (const id of ids40) if (r2[id]) { n++; if (a1[id] === r2[id]) k++; } return { k, n, ...wilson(k, n) }; })();
const llm_acc40_vs_rater2 = (() => { let k = 0, n = 0; for (const id of ids40) if (r2[id]) { n++; if (b1[id] === r2[id]) k++; } return { k, n, ...wilson(k, n) }; })();
const rule_acc40_both_agree = (() => { const ids = ids40.filter((id) => r2[id] === L[id]); return { ...accOf(a1, ids), note: 'so nos prompts em que os dois rotuladores concordam' }; })();
const llm_acc40_both_agree = (() => { const ids = ids40.filter((id) => r2[id] === L[id]); return accOf(b1, ids); })();

// M4: caudas do hook, por corrida e por caminho (o log interno diz o caminho)
const byRun = {}; for (const r of H.rows) (byRun[r.run] ||= []).push(r.ms);
const hook_by_run = Object.fromEntries(Object.entries(byRun).map(([k, v]) => [k, summary(v)]));
const hook_all = summary(H.rows.map((r) => r.ms));
// F4: o tier EMITIDO pelo hook (com safety_boost, vetos, etc.) vs rotulo
const h1 = {}; for (const r of H.rows) if (r.run === 1) h1[r.id] = r.tier;
const hook_tier_acc = { on63: accOf(h1, ids63), on40: accOf(h1, ids40), on23: accOf(h1, ids23), differs_from_classify: ids63.filter((id) => h1[id] && a1[id] && h1[id] !== a1[id]).length, escalations_run1: count(H.rows.filter((r) => r.run === 1).map((r) => r.escalation)) };

// C2: quantos dos 40 foram alterados pela anonimizacao (marcadores presentes)
const corpus = JSON.parse(fs.readFileSync(path.join(HERE, 'corpus-40.json'), 'utf8')).items;
const redacted = corpus.filter((c) => /<owner>|<email>|<redacted>|(^|[^\w])~[\\/]/.test(c.prompt)).map((c) => c.id);

// S4: composicao por tier do treino vs 40
const train = (() => { const v = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'tools', 'router', 'validation-set.json'), 'utf8')); const t = []; for (const sec of ['canonical', 'adversarial']) for (const a of v[sec]) if (!/^mooter_review/.test(a.confidence_source || '')) t.push(a.expected_tier); return count(t); })();

// M1: o que o hook EMITE para a conversa (bytes de contexto que o modelo seguinte le)
const hook_stdout_bytes = summary(H.rows.map((r) => r.stdout_bytes));

const out = {
  at: new Date().toISOString(),
  W1_rule_on_r24: rule_on_r24, W1_llm_on_r24: llm_on_r24,
  S3_constant_baselines: constant, S3_label_distribution: label_dist,
  L4_kappa_40_only: { kappa: kappa40, raw_agreement: raters_agree_40 + '/' + ka.length, disagreements_40: disagree40.length, rule_matches_rater2_on_those: rule_matches_rater2_on_disagreements, rule_matches_codex_on_those: rule_matches_codex_on_disagreements, rule_acc40_vs_rater2, llm_acc40_vs_rater2, rule_acc40_where_raters_agree: rule_acc40_both_agree, llm_acc40_where_raters_agree: llm_acc40_both_agree },
  M4_hook_latency_full: { all: hook_all, by_run: hook_by_run, internal_classify_ms: H.hook_internal_classify_ms, path_counts: H.classify_path_counts, note: 'corrida 1 tem 63 prompts mas so 57 spawns: 6 prompts dos 40 partilham a chave de cache normalizada do hook (mesmo texto apos normalizacao) e foram hit logo na corrida 1' },
  F4_hook_emitted_tier: hook_tier_acc,
  C2_redaction: { changed: redacted.length, of: corpus.length, ids: redacted },
  S4_composition: { train35_by_tier: train, real40_by_tier: label_dist.on40 },
  M1_hook_context_bytes_per_prompt: hook_stdout_bytes,
};
fs.writeFileSync(path.join(RES, 'analysis-extra.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
