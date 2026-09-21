#!/usr/bin/env node
// 02-arm-D-logit.mjs — braco D: decisor tipado sobre o modelo Ollama JA residente (padrao mini-jev/jevlike).
// 4 perguntas tipadas, resposta = 1 letra, probabilidade lida dos top_logprobs da 1a letra. $0, zero egress.
//   node 02-arm-D-logit.mjs --model qwen2.5:14b [--corpus <path>|gold] [--labels <path>] [--fallback-n 5]
import fs from 'node:fs'; import path from 'node:path';
import { HERE, TIERS, opt, loadCorpus, summarise } from './lib-common.mjs';
const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = opt('--model', 'qwen2.5:3b');
const FALLBACK_N = Number(opt('--fallback-n', 5));
const RUBRIC = fs.readFileSync(path.join(HERE, '..', 'provas-v1-2026-09-09', 'P1-decidir-custa-zero', 'label-rubric.txt'), 'utf8');

// Primitivas (mesmo contrato choice/score/noul do Jev/Laya). A letra e o unico token gerado.
const QUESTIONS = {
  tier:        { kind: 'choice', options: { A: 'T0', B: 'T1', C: 'T2', D: 'T3' }, text: 'Which tier does this prompt need? A) T0 B) T1 C) T2 D) T3' },
  complexity:  { kind: 'score',  options: { A: 0, B: 1, C: 2 }, text: 'How complex is the task? A) simple, one step B) moderate, a few steps C) demanding, needs investigation or design' },
  high_stakes: { kind: 'noul',   options: { A: true, B: false }, text: 'Would a wrong or sloppy answer be costly (security, data loss, production, architecture)? A) yes B) no' },
  needs_repo:  { kind: 'noul',   options: { A: true, B: false }, text: 'Does answering well require reading or changing several files of the repository? A) yes B) no' },
};
let logprobsOK = null;
async function ask(prompt, q) {
  const messages = [
    { role: 'system', content: `You are a routing decision head. Use this ladder:\n${RUBRIC}\nAnswer with exactly ONE letter and nothing else.` },
    { role: 'user', content: `PROMPT:\n<<<\n${prompt.slice(0, 4000)}\n>>>\n\nQUESTION: ${q.text}\nAnswer:` },
  ];
  const letters = Object.keys(q.options);
  const t0 = process.hrtime.bigint();
  const call = async (temperature, want) => {
    const r = await fetch(`${HOST}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature, max_tokens: 1, logprobs: want, top_logprobs: want ? 10 : undefined, messages }) });
    return r.json();
  };
  let probs = {}, mode = 'logprobs';
  const j = await call(0, true);
  const lp = j.choices?.[0]?.logprobs?.content?.[0];
  if (lp && Array.isArray(lp.top_logprobs) && lp.top_logprobs.length) {
    logprobsOK = true;
    for (const t of lp.top_logprobs) { const L = String(t.token).trim().toUpperCase().replace(/[^A-Z]/g, ''); if (letters.includes(L)) probs[L] = (probs[L] || 0) + Math.exp(t.logprob); }
  } else {
    // fallback: amostragem — NAO e logit real; marcado
    logprobsOK = false; mode = `sampling_n${FALLBACK_N}`;
    const counts = {}; for (let i = 0; i < FALLBACK_N; i++) { const s = await call(0.7, false); const L = String(s.choices?.[0]?.message?.content || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1); if (letters.includes(L)) counts[L] = (counts[L] || 0) + 1; }
    for (const L of letters) probs[L] = (counts[L] || 0) / FALLBACK_N;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const mass = Object.values(probs).reduce((a, b) => a + b, 0);
  const norm = {}; for (const L of letters) norm[L] = mass > 0 ? (probs[L] || 0) / mass : 1 / letters.length;
  const best = letters.reduce((a, b) => (norm[a] >= norm[b] ? a : b));
  return { mode, mass_on_letters: mass, probs: Object.fromEntries(letters.map((L) => [String(q.options[L]), norm[L]])), value: q.options[best], p_max: norm[best], ms };
}
// Politica v0: argmax do tier. (v1, depois de rotulos: regressao logistica sobre as 4 respostas — ver README)
function policyV0(a) { return { tier: String(a.tier.value), p_max: a.tier.p_max, abstain: a.tier.p_max < 0.4 }; }

const corpus = loadCorpus();
const rows = [];
console.error(`braco D · ${MODEL} · corpus ${corpus.name} · ${corpus.items.length} prompts`);
// aquecer
await fetch(`${HOST}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, prompt: 'hi', stream: false, keep_alive: '30m' }) }).catch(() => {});
for (const it of corpus.items) {
  const t0 = process.hrtime.bigint(); const answers = {};
  for (const [k, q] of Object.entries(QUESTIONS)) answers[k] = await ask(it.prompt, q);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const pol = policyV0(answers);
  rows.push({ id: it.id, tier: pol.tier, p_max: pol.p_max, abstain: pol.abstain, ms, ms_tier_only: answers.tier.ms, answers });
  process.stderr.write(`${it.id} ${pol.tier} p=${pol.p_max.toFixed(2)} ${ms.toFixed(0)}ms\n`);
}
const summary = summarise(rows, corpus.labels);
const out = { arm: 'D-logit', model: MODEL, host: HOST, logprobs_used: logprobsOK, corpus: corpus.name, labels: corpus.labels_path || 'gold', questions: QUESTIONS, policy: 'v0-argmax-tier', at: new Date().toISOString(), summary: { ...summary, rows: undefined }, rows: summary.rows };
const f = path.join(HERE, 'results', `D-${MODEL.replace(/[^\w.-]/g, '_')}-${corpus.name.split(' ')[0]}.json`);
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ arm: out.arm, model: MODEL, logprobs_used: logprobsOK, acc: summary.p, ci95: summary.ci95, n: summary.n, ece: summary.calibration.ece, p50_ms: summary.latency_ms.p50, p50_ms_tier_only: rows.map(r=>r.ms_tier_only).sort((a,b)=>a-b)[Math.floor(rows.length/2)], abstain: summary.abstain, file: path.basename(f) }, null, 1));
