#!/usr/bin/env node
// label-60b.mjs — MP2 passo 3: rotulos CEGOS do corpus 60b pelo Codex CLI (motor diferente do braco D),
// com a rubrica do P1 (sha f95958dd...), lotes <= 13, JSON forcado, cwd isolado sem o repo.
// Corre ANTES de qualquer predicao sobre os 60b. Saida: results/labels-60b.json (NAO commitar).
//   node label-60b.mjs [--sandbox read-only|danger-full-access] [--corpus 60b|60c] [--out <ficheiro>]
// MP3: --corpus 60c le results/corpus-60c.json, transcricao em results/labels-60c-transcript/, saida --out (default results/labels-60c-codex.json)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HERE, P1, opt } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const CORPUS = opt('--corpus', '60b'); const TX = path.join(RES, `labels-${CORPUS}-transcript`); fs.mkdirSync(TX, { recursive: true });
const OUT = opt('--out', CORPUS === '60b' ? path.join(RES, 'labels-60b.json') : path.join(RES, `labels-${CORPUS}-codex.json`));
const rubricPath = path.join(P1, 'label-rubric.txt'); const rubric = fs.readFileSync(rubricPath, 'utf8');
const rubricSha = crypto.createHash('sha256').update(rubric).digest('hex');
const EXPECTED_SHA = 'f95958dd6e4b40a7caa1bc4b9d7659f90a3c92a9ec7127ddb6469f88fd5c7091';
if (rubricSha !== EXPECTED_SHA) { console.error(`rubrica com sha inesperado: ${rubricSha}`); process.exit(2); }
const corpus = JSON.parse(fs.readFileSync(path.join(RES, `corpus-${CORPUS}.json`), 'utf8'));
// guarda: nenhuma predicao sobre os 60b pode existir antes dos rotulos
for (const f of fs.readdirSync(RES)) if (f.includes(CORPUS) && /^(D-|A-|policy-)/.test(f)) { console.error(`ABORTA: ja existe predicao sobre os ${CORPUS} (${f}) — os rotulos deixariam de ser cegos`); process.exit(3); }
const SANDBOX = opt('--sandbox', 'read-only');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-60b-')); // cwd isolado, vazio, sem o repo
const schemaPath = path.join(TX, 'schema.json');
fs.writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: { labels: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, tier: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3'] }, reason: { type: 'string' } }, required: ['id', 'tier', 'reason'], additionalProperties: false } } }, required: ['labels'], additionalProperties: false }, null, 1));
const B = 13; const batches = []; for (let i = 0; i < corpus.items.length; i += B) batches.push(corpus.items.slice(i, i + B));
// 57 -> 5 lotes de 12/12/11/11/11 em vez de 13/13/13/13/5: lotes equilibrados, todos <= 13
const nB = Math.ceil(corpus.items.length / B); const size = Math.ceil(corpus.items.length / nB); batches.length = 0; for (let i = 0; i < corpus.items.length; i += size) batches.push(corpus.items.slice(i, i + size));
const labels = []; const log = [];
const startedAt = new Date().toISOString();
for (const [bi, batch] of batches.entries()) {
  const n = bi + 1;
  const prompt = `${rubric}\nPROMPTS:\n${batch.map((it) => `--- id: ${it.id}\n${it.prompt}\n`).join('\n')}`;
  const pFile = path.join(TX, `label-batch-${n}.txt`); fs.writeFileSync(pFile, prompt);
  const outFile = path.join(TX, `batch-${n}.out`);
  const t0 = Date.now();
  // Windows: `codex` e um shim .cmd -> precisa de shell; com shell, args com espacos ("Paulo Loureiro") tem de ir entre aspas
  const q = (s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const argv = ['exec', '-C', cwd, '-s', SANDBOX, '--skip-git-repo-check', '--ephemeral', '--output-schema', schemaPath, '-o', outFile, '-'];
  const r = spawnSync(`codex ${argv.map(q).join(' ')}`, { input: prompt, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  fs.writeFileSync(path.join(TX, `batch-${n}.stderr.txt`), r.stderr || '');
  let parsed = null; try { parsed = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { log.push({ batch: n, error: `parse: ${e.message}`, exit: r.status }); }
  const got = parsed?.labels || []; const ids = new Set(batch.map((b) => b.id)); const seen = new Set();
  for (const l of got) if (ids.has(l.id) && /^T[0-3]$/.test(l.tier) && !seen.has(l.id)) { seen.add(l.id); labels.push({ id: l.id, tier: l.tier, reason: String(l.reason || '').slice(0, 200), batch: n }); }
  const missing = [...ids].filter((i) => !seen.has(i));
  fs.writeFileSync(path.join(TX, `batch-${n}.json`), JSON.stringify({ labels: got }, null, 0));
  log.push({ batch: n, n: batch.length, labeled: seen.size, missing, exit: r.status, ms });
  console.error(`lote ${n}/${batches.length}: ${seen.size}/${batch.length} rotulados, exit ${r.status}, ${ms} ms${missing.length ? ' FALTAM ' + missing.join(',') : ''}`);
}
const dist = {}; for (const l of labels) dist[l.tier] = (dist[l.tier] || 0) + 1;
const missing = corpus.items.map((i) => i.id).filter((id) => !labels.some((l) => l.id === id));
const out = { _schema: `decisor-shadow/labels-${CORPUS}`, _corpus: `corpus-${CORPUS}.json`, _labeler: `Codex CLI ${(spawnSync('codex', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout || '').trim()} (codex exec, sandbox ${SANDBOX}, cwd isolado ${path.basename(cwd)} sem acesso ao repo, --ephemeral, ${batches.length} lotes de <= 13, --output-schema JSON forcado)`, _rubric: path.relative(HERE, rubricPath), _rubric_sha256: rubricSha, _corpus_sampled_at: corpus._sampled_at, _blind: `rotulado ANTES de qualquer predicao sobre os ${CORPUS} por qualquer braco (guarda no proprio script: aborta se existir D-/A-/policy- *${CORPUS}*)`, _labeled_at: new Date().toISOString(), _started_at: startedAt, _distribution: dist, _missing: missing, _batches: log, labels };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ labeled: labels.length, of: corpus.items.length, distribution: dist, missing, batches: log.map((b) => [b.batch, b.labeled + '/' + b.n, b.exit, b.ms + 'ms']) }, null, 1));
