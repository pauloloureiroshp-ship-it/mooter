#!/usr/bin/env node
// label-kimi.mjs — MP3 A2 · R3: rotulos CEGOS por Kimi k3 (Moonshot, familia diferente de Codex e Sonnet),
// mesma rubrica do P1 (sha verificado), lotes <= 13, response_format json_object. A API so aceita
// temperature=1 (nao deterministico) — declarado. Saida: results/labels-<corpus>-kimi.json (NAO commitar).
//   node label-kimi.mjs --corpus 60c
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { HERE, P1, opt } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const CORPUS = opt('--corpus', '60c');
const rubric = fs.readFileSync(path.join(P1, 'label-rubric.txt'), 'utf8');
const rubricSha = crypto.createHash('sha256').update(rubric).digest('hex');
if (rubricSha !== 'f95958dd6e4b40a7caa1bc4b9d7659f90a3c92a9ec7127ddb6469f88fd5c7091') { console.error('rubrica com sha inesperado'); process.exit(2); }
const corpus = JSON.parse(fs.readFileSync(path.join(RES, `corpus-${CORPUS}.json`), 'utf8'));
for (const f of fs.readdirSync(RES)) if (f.includes(CORPUS) && /^(D-|A-|policy-)/.test(f)) { console.error(`ABORTA: ja existe predicao sobre os ${CORPUS} (${f})`); process.exit(3); }
const KEY = process.env.MOONSHOT_API_KEY; if (!KEY) { console.error('MOONSHOT_API_KEY ausente'); process.exit(4); }
const MODEL = 'kimi-k3', URL = 'https://api.moonshot.ai/v1/chat/completions';
const nB = Math.ceil(corpus.items.length / 13); const size = Math.ceil(corpus.items.length / nB);
const batches = []; for (let i = 0; i < corpus.items.length; i += size) batches.push(corpus.items.slice(i, i + size));
const TX = path.join(RES, `labels-${CORPUS}-transcript`); fs.mkdirSync(TX, { recursive: true });
const labels = [], log = []; const startedAt = new Date().toISOString();
for (const [bi, batch] of batches.entries()) {
  const n = bi + 1;
  const prompt = `${rubric}\nPROMPTS:\n${batch.map((it) => `--- id: ${it.id}\n${it.prompt}\n`).join('\n')}\n\nReturn a JSON object of the form {"labels":[{"id":"...","tier":"T0|T1|T2|T3","reason":"..."}]} with every id above.`;
  fs.writeFileSync(path.join(TX, `kimi-batch-${n}.txt`), prompt);
  const t0 = Date.now(); let got = [], err = null, model = null;
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, stream: false }), signal: AbortSignal.timeout(180000) });
    const j = await r.json(); model = j.model || null;
    const text = j.choices?.[0]?.message?.content || ''; fs.writeFileSync(path.join(TX, `kimi-batch-${n}.out`), text || JSON.stringify(j));
    if (!r.ok) err = `http ${r.status}: ${JSON.stringify(j).slice(0, 200)}`; else { const parsed = JSON.parse(text); got = parsed.labels || (Array.isArray(parsed) ? parsed : []); }
  } catch (e) { err = e.message; }
  const ms = Date.now() - t0; const ids = new Set(batch.map((b) => b.id)); const seen = new Set();
  for (const l of got) if (ids.has(l.id) && /^T[0-3]$/.test(l.tier) && !seen.has(l.id)) { seen.add(l.id); labels.push({ id: l.id, tier: l.tier, reason: String(l.reason || '').slice(0, 200), batch: n }); }
  const missing = [...ids].filter((i) => !seen.has(i)); log.push({ batch: n, n: batch.length, labeled: seen.size, missing, ms, err, model });
  console.error(`lote ${n}/${batches.length}: ${seen.size}/${batch.length}, ${ms} ms${err ? ' ERRO ' + err : ''}${missing.length ? ' FALTAM ' + missing.join(',') : ''}`);
}
const dist = {}; for (const l of labels) dist[l.tier] = (dist[l.tier] || 0) + 1;
const missing = corpus.items.map((i) => i.id).filter((id) => !labels.some((l) => l.id === id));
const out = { _schema: `decisor-shadow/labels-${CORPUS}-kimi`, _corpus: `corpus-${CORPUS}.json`, _labeler: `Kimi ${MODEL} via api.moonshot.ai/v1 (chat/completions, response_format json_object, temperature fixa a 1 pela API — nao deterministico, ${batches.length} lotes de <= 13)`, _rubric_sha256: rubricSha, _blind: `rotulado ANTES de qualquer predicao sobre os ${CORPUS} (guarda no script)`, _started_at: startedAt, _labeled_at: new Date().toISOString(), _distribution: dist, _missing: missing, _batches: log, labels };
fs.writeFileSync(path.join(RES, `labels-${CORPUS}-kimi.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ labeled: labels.length, of: corpus.items.length, distribution: dist, missing, batches: log.map((b) => [b.batch, `${b.labeled}/${b.n}`, `${b.ms}ms`, b.err || 'ok']) }, null, 1));
