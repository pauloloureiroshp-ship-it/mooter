#!/usr/bin/env node
// 01-probe-ollama.mjs — o braco D depende de logprobs no /v1/chat/completions do Ollama.
// A doc oficial marca "[ ] Logprobs" mas a issue #16117 mostra a funcionar. Medir, nao assumir.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, opt } from './lib-common.mjs';
const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = opt('--model', 'qwen2.5:3b');
const out = { at: new Date().toISOString(), host: HOST, model: MODEL };
try { const r = await fetch(`${HOST}/api/version`); out.version = (await r.json()).version; } catch (e) { out.version_error = String(e.message); }
try { const r = await fetch(`${HOST}/api/tags`); out.models = ((await r.json()).models || []).map((m) => `${m.name} (${(m.size / 1e9).toFixed(1)} GB)`); } catch (e) { out.tags_error = String(e.message); }
try {
  const body = { model: MODEL, temperature: 0, max_tokens: 1, logprobs: true, top_logprobs: 8,
    messages: [{ role: 'system', content: 'Answer with exactly one letter.' }, { role: 'user', content: 'Is 2+2=4? A) yes B) no\nAnswer:' }] };
  const t0 = Date.now();
  const r = await fetch(`${HOST}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); out.probe_ms = Date.now() - t0;
  const lp = j.choices?.[0]?.logprobs?.content?.[0];
  out.logprobs_supported = !!(lp && Array.isArray(lp.top_logprobs) && lp.top_logprobs.length > 0);
  out.probe_answer = j.choices?.[0]?.message?.content; out.top_logprobs_sample = lp?.top_logprobs?.slice(0, 5);
  if (!out.logprobs_supported) out.raw_choice0 = j.choices?.[0];
} catch (e) { out.probe_error = String(e.message); out.logprobs_supported = false; }
out.verdict = out.logprobs_supported ? 'D pode ler probabilidade real (logit-head)' : 'SEM logprobs: D corre em modo amostragem (n=5, marcado como fallback) — ou instalar llama.cpp server (n_probs) / actualizar Ollama';
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', '01-probe-ollama.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
