#!/usr/bin/env node
// A-60b.mjs — MP2 passo 4: a REGRA (classify.js FROZEN, so lida) no corpus 60b, ambiente nokey (= A-nokey do P1).
// MP3: --corpus results/corpus-60c.json --out results/A-60c.json
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { HERE, ROOT, opt } from './lib-common.mjs';
const CLASSIFY = path.join(ROOT, 'tools', 'router', 'classify.js');
const sha = crypto.createHash('sha256').update(fs.readFileSync(CLASSIFY)).digest('hex');
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8'));
if (sha !== proto.classifier_sha256_expected) { console.error(`classify.js sha ${sha} != protocolo`); process.exit(2); }
// stub 503 no loopback: a regra nunca fala com o Ollama real nem com a rede (mesmo desenho do P1 armA)
const stub = http.createServer((_, res) => { res.statusCode = 503; res.end('stub'); }); let hits = 0; stub.on('request', () => hits++);
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
process.env.OLLAMA_HOST = `127.0.0.1:${stub.address().port}`; process.env.MOOTER_ARBITER_DISABLE = '1';
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];
const { classify } = createRequire(import.meta.url)(CLASSIFY);
const corpus = JSON.parse(fs.readFileSync(opt('--corpus', path.join(HERE, 'results', 'corpus-60b.json')), 'utf8'));
for (let i = 0; i < 5; i++) classify('aquecimento do processo');
const rows = corpus.items.map((it) => { const t0 = process.hrtime.bigint(); const d = classify(it.prompt); return { id: it.id, run: 1, tier: d.tier, task_category: d.task_category, risk_level: d.risk_level, confidence: d.confidence, escalation_rule: d.escalation_rule, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; });
stub.close();
const out = { arm: 'A', env: 'nokey', runs: 1, at: new Date().toISOString(), classify_sha256: sha, node: process.version, ollama_stub_hits: hits, n_items: rows.length, rows };
fs.writeFileSync(opt('--out', path.join(HERE, 'results', 'A-60b.json')), JSON.stringify(out, null, 1));
const dist = rows.reduce((a, r) => ((a[r.tier] = (a[r.tier] || 0) + 1), a), {}); const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ arm: 'A-' + path.basename(opt('--out', 'A-60b.json'), '.json').replace(/^A-/, ''), env: 'nokey', n: rows.length, pred_dist: dist, p50_ms: lat[Math.floor(lat.length / 2)], stub_hits: hits, sha_ok: true }));
