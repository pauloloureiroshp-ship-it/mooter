#!/usr/bin/env node
// 02-arm-D-logit.mjs — braco D: decisor tipado sobre o modelo Ollama JA residente (padrao mini-jev/jevlike).
// 4 perguntas tipadas, resposta = 1 letra, probabilidade lida dos top_logprobs da 1a letra. $0, zero egress.
//   node 02-arm-D-logit.mjs --model qwen2.5:14b [--corpus <path>|gold|valset] [--labels <path>] [--fallback-n 5] [--tta-letters 4]
// MP6 (protocol.json#mp6.harness): --tta-letters 4 faz a pergunta do TIER 4x com as 4 rotacoes ciclicas de
// (T0,T1,T2,T3) sobre (A,B,C,D) e tira a MEDIA das 4 distribuicoes em espaco de PROBABILIDADE (nao logits);
// as 3 perguntas auxiliares ficam a 1x. Sem a flag, os campos de decisao sao byte-identicos ao harness anterior.
// Regra no-letter (mp6): se o 1.o token gerado (lp.token, temperatura 0) nao for uma letra da pergunta, a resposta
// e mode:no-letter, value:null, p_max:null — sem fallback (modelos que «pensam» antes da letra ficam declarados).
import fs from 'node:fs'; import path from 'node:path';
import { HERE, TIERS, opt, args, loadCorpus, summarise, OLLAMA_HOST } from './lib-common.mjs';
const HOST = OLLAMA_HOST;
const MODEL = opt('--model', 'qwen2.5:3b');
const FALLBACK_N = Number(opt('--fallback-n', 5));
const TTA = Number(opt('--tta-letters', 0)); // 0 = desligado (comportamento anterior); 4 = rotacoes ciclicas
const FETCH_TIMEOUT_MS = 60_000; // round 7 A17: nenhum pedido fica pendurado; redirect:'error' em ambos os caminhos (loopback-only vem do OLLAMA_HOST canonico)
const NATIVE = args.includes('--native-chat'); // MP7 (i): /api/chat nativo com think:false + logprobs; sem a flag o caminho /v1 nao muda
if (TTA && TTA !== 4) { console.error('--tta-letters so aceita 4 (rotacoes ciclicas de 4 letras) ou 0'); process.exit(2); }
const RUBRIC = fs.readFileSync(path.join(HERE, '..', 'provas-v1-2026-09-09', 'P1-decidir-custa-zero', 'label-rubric.txt'), 'utf8');

// Primitivas (mesmo contrato choice/score/noul do Jev/Laya). A letra e o unico token gerado.
const QUESTIONS = {
  tier:        { kind: 'choice', options: { A: 'T0', B: 'T1', C: 'T2', D: 'T3' }, text: 'Which tier does this prompt need? A) T0 B) T1 C) T2 D) T3' },
  complexity:  { kind: 'score',  options: { A: 0, B: 1, C: 2 }, text: 'How complex is the task? A) simple, one step B) moderate, a few steps C) demanding, needs investigation or design' },
  high_stakes: { kind: 'noul',   options: { A: true, B: false }, text: 'Would a wrong or sloppy answer be costly (security, data loss, production, architecture)? A) yes B) no' },
  needs_repo:  { kind: 'noul',   options: { A: true, B: false }, text: 'Does answering well require reading or changing several files of the repository? A) yes B) no' },
};
// Rotacao r da pergunta do tier: letra k -> TIERS[(k + r) % 4]. r = 0 e exactamente QUESTIONS.tier.
function tierQuestionRotated(r) {
  const letters = ['A', 'B', 'C', 'D'];
  const options = Object.fromEntries(letters.map((L, k) => [L, TIERS[(k + r) % 4]]));
  return { kind: 'choice', options, text: `Which tier does this prompt need? ${letters.map((L) => `${L}) ${options[L]}`).join(' ')}` };
}
const normTok = (t) => String(t).trim().toUpperCase().replace(/[^A-Z]/g, '');
let logprobsOK = null;
async function ask(prompt, q) {
  const messages = [
    { role: 'system', content: `You are a routing decision head. Use this ladder:\n${RUBRIC}\nAnswer with exactly ONE letter and nothing else.` },
    { role: 'user', content: `PROMPT:\n<<<\n${prompt.slice(0, 4000)}\n>>>\n\nQUESTION: ${q.text}\nAnswer:` },
  ];
  const letters = Object.keys(q.options);
  const t0 = process.hrtime.bigint();
  const call = async (temperature, want) => {
    if (NATIVE) {
      // MP7 (i): /api/chat nativo — think:false (o /v1 ignora-o no Ollama 0.34.2), logprobs ao nivel de topo da resposta.
      const r = await fetch(`${HOST}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({ model: MODEL, stream: false, think: false, logprobs: want, top_logprobs: want ? 10 : undefined, options: { temperature, num_predict: 1 }, messages }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(`ollama ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`);
      // adapta a forma nativa a forma OpenAI que o resto do ask() le
      return { choices: [{ message: { content: j.message?.content ?? '' }, logprobs: { content: Array.isArray(j.logprobs) ? j.logprobs : [] } }] };
    }
    const r = await fetch(`${HOST}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL, temperature, max_tokens: 1, logprobs: want, top_logprobs: want ? 10 : undefined, messages }) });
    const j = await r.json();
    // round 6 A2: um erro HTTP / JSON de erro NAO pode cair em silencio no fallback por amostragem — falha alto.
    if (!r.ok || j.error) throw new Error(`ollama ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`);
    return j;
  };
  let probs = {}, mode = 'logprobs', first_token = null;
  const j = await call(0, true);
  const lp = j.choices?.[0]?.logprobs?.content?.[0];
  if (lp && Array.isArray(lp.top_logprobs) && lp.top_logprobs.length) {
    logprobsOK = true;
    first_token = lp.token;
    for (const t of lp.top_logprobs) { const L = normTok(t.token); if (letters.includes(L)) probs[L] = (probs[L] || 0) + Math.exp(t.logprob); }
    // mp6.no_letter_rule: o token gerado nao e uma letra da pergunta -> sem previsao, sem fallback.
    if (!letters.includes(normTok(lp.token))) mode = 'no-letter';
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
  const out = { mode, mass_on_letters: mass, probs: Object.fromEntries(letters.map((L) => [String(q.options[L]), norm[L]])), value: q.options[best], p_max: norm[best], ms };
  if (mode === 'no-letter') { out.value = null; out.p_max = null; out.first_token = first_token; }
  return out;
}
// TTA por permutacao de letras (mp6.C1): 4 rotacoes, media das 4 distribuicoes em espaco de probabilidade (tier).
async function askTierTTA(prompt) {
  const rotations = [];
  for (let r = 0; r < 4; r++) { const q = tierQuestionRotated(r); const a = await ask(prompt, q); rotations.push({ rotation: r, options: q.options, ...a }); }
  const ms = rotations.reduce((s, a) => s + a.ms, 0);
  const noLetter = rotations.filter((a) => a.mode === 'no-letter').length;
  if (noLetter) return { mode: 'no-letter', mass_on_letters: Math.min(...rotations.map((a) => a.mass_on_letters)), probs: null, value: null, p_max: null, ms, tta: { rotations, mean: null, no_letter_rotations: noLetter } };
  const mean = Object.fromEntries(TIERS.map((t) => [t, rotations.reduce((s, a) => s + (a.probs[t] || 0), 0) / rotations.length]));
  const best = TIERS.reduce((a, b) => (mean[a] >= mean[b] ? a : b));
  // round 6 A2: o agregado so se chama logprobs-tta4 se as 4 rotacoes vieram de logprobs; senao carrega os modos.
  const modes = [...new Set(rotations.map((a) => a.mode))];
  const mode = modes.length === 1 && modes[0] === 'logprobs' ? 'logprobs-tta4' : `tta4-mixed[${modes.join(',')}]`;
  return { mode, mass_on_letters: Math.min(...rotations.map((a) => a.mass_on_letters)), probs: mean, value: best, p_max: mean[best], ms, tta: { rotations, mean, no_letter_rotations: 0 } };
}
// Politica v0: argmax do tier. (v1, depois de rotulos: regressao logistica sobre as 4 respostas — ver README)
function policyV0(a) { const v = a.tier.value; return { tier: v == null ? null : String(v), p_max: a.tier.p_max, abstain: a.tier.p_max == null || a.tier.p_max < 0.4 }; }

const corpus = loadCorpus();
const rows = [];
console.error(`braco D · ${MODEL} · corpus ${corpus.name} · ${corpus.items.length} prompts${TTA ? ` · TTA letras x${TTA}` : ''}${NATIVE ? ' · /api/chat nativo think:false' : ''}`);
// aquecer
await fetch(`${HOST}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, prompt: 'hi', stream: false, keep_alive: '30m' }) }).catch(() => {});
for (const it of corpus.items) {
  const t0 = process.hrtime.bigint(); const answers = {};
  for (const [k, q] of Object.entries(QUESTIONS)) answers[k] = (k === 'tier' && TTA) ? await askTierTTA(it.prompt) : await ask(it.prompt, q);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const pol = policyV0(answers);
  rows.push({ id: it.id, tier: pol.tier, p_max: pol.p_max, abstain: pol.abstain, ms, ms_tier_only: answers.tier.ms, answers });
  process.stderr.write(`${it.id} ${pol.tier ?? 'no-letter'} p=${pol.p_max == null ? 'n/d' : pol.p_max.toFixed(2)} ${ms.toFixed(0)}ms\n`);
}
const summary = summarise(rows, corpus.labels);
const noLetterItems = rows.filter((r) => r.answers.tier.mode === 'no-letter').length;
const out = { arm: 'D-logit', model: MODEL, host: HOST, endpoint: NATIVE ? '/api/chat (think:false)' : '/v1/chat/completions', logprobs_used: logprobsOK, corpus: corpus.name, labels: corpus.labels_path || 'gold', questions: QUESTIONS, tta_letters: TTA || 0, policy: TTA ? 'v0-argmax-tier-tta4-mean' : 'v0-argmax-tier', at: new Date().toISOString(), summary: { ...summary, rows: undefined, no_letter_items: noLetterItems }, rows: summary.rows };
const f = path.join(HERE, 'results', `D-${MODEL.replace(/[^\w.-]/g, '_')}-${NATIVE ? 'native-' : ''}${TTA ? `tta${TTA}-` : ''}${corpus.name.split(' ')[0]}.json`);
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ arm: out.arm, model: MODEL, tta_letters: out.tta_letters, logprobs_used: logprobsOK, no_letter_items: noLetterItems, acc: summary.p, ci95: summary.ci95, n: summary.n, ece: summary.calibration.ece, p50_ms: summary.latency_ms.p50, p50_ms_tier_only: rows.map(r=>r.ms_tier_only).sort((a,b)=>a-b)[Math.floor(rows.length/2)], abstain: summary.abstain, file: path.basename(f) }, null, 1));
