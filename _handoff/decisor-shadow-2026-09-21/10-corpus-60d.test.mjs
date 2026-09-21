// 10-corpus-60d.test.mjs — o recuperador do 60d testado em eventos do HARNESS (nunca nos vivos):
// os eventos são escritos pelo próprio tools/router/arbiter.js#shadowDecisor (mocks de logprobs, _inline), as
// transcrições são sintéticas num tmpdir, e a pergunta do adversário («pode fugir texto para o git?») é uma asserção.
//   node --test 10-corpus-60d.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
import { HERE, ROOT } from './lib-common.mjs';
import { readShadowEvents, indexTranscripts, buildCorpus, eligible, sha12 } from './10-corpus-60d.mjs';
const require = createRequire(import.meta.url);
const { shadowDecisor } = require(path.join(ROOT, 'tools', 'router', 'arbiter.js'));

const chat = (top) => ({ choices: [{ message: { content: top[0][0] }, logprobs: { content: [{ token: top[0][0], top_logprobs: top.map(([token, p]) => ({ token, logprob: Math.log(p) })) }] } }] });
const mockT2 = [chat([['C', 0.62], ['A', 0.20], ['B', 0.10], ['D', 0.05]]), chat([['B', 0.5], ['A', 0.3], ['C', 0.2]]), chat([['B', 0.8], ['A', 0.2]]), chat([['A', 0.7], ['B', 0.3]])];
const decision = { tier: 'T0', confidence: 0.9, task_category: 'trivial_local', escalation_rule: 'none', recommended_backend: 'ollama', recommended_model: 'qwen2.5:3b' };
const OWNER = path.basename(os.homedir());

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-60d-'));
  const log = path.join(dir, 'decisions.log'); const tx = path.join(dir, 'projects'); fs.mkdirSync(path.join(tx, 'C--proj-a'), { recursive: true }); fs.mkdirSync(path.join(tx, 'C--Users-x-AppData-Local-Temp-y'), { recursive: true });
  // 6 prompts «humanos» em 4 sessões + ruído. O dono aparece no texto para provar a anonimização.
  const P = {
    s1a: `muda a cor do botão de login para azul no ${OWNER} dashboard`,
    s1b: 'porque é que o websocket reconnect falha às vezes depois do deploy',
    s2a: 'compara as duas abordagens para o cache e recomenda uma com prós e contras',
    s3a: 'gera uma commit message para as alterações do retry.ts e do logger',
    s4a: 'explica este erro: TypeError: x is not a function no módulo de sync',
    s4b: 'resume o ficheiro hub/src/llm.ts em três linhas para o README',
    curto: 'ok faz isso',
    colagem: 'lê e executa integralmente o plano <pasted_content id="1">cola enorme</pasted_content id="1">', // a tag no início cairia como tag_pasted_content (mesma ordem do 60c)
    comando: '/mooter-update agora',
    temp: 'este prompt vive num projecto de scratchpad e não conta para nada',
  };
  const ev = (prompt, session_id) => shadowDecisor(prompt, decision, { _inline: true, _force: true, _logPath: log, _mockResponses: mockT2, session_id }); // hook_ts_ms = Date.now() real, crescente
  const t0 = Date.parse('2026-09-21T12:00:00Z'); // o since do pré-registo; os eventos do harness nascem depois
  const events = [ev(P.s1a, 's1'), ev(P.s1b, 's1'), ev(P.s2a, 's2'), ev(P.s3a, 's3'), ev(P.s4a, 's4'), ev(P.s4b, 's4'), ev(P.curto, 's5'), ev(P.colagem, 's6'), ev(P.comando, 's7'), ev(P.temp, 's8')];
  assert.ok(events.every((e) => e && e.event === 'decisor_shadow' && e.outcome === 'ok'), 'o harness escreveu 10 eventos ok');
  // transcrições: uma linha type:user por prompt (o texto CRU), mais ruído (tool_result, sidechain), e o «temp» num projecto Temp
  const line = (text, extra = {}) => JSON.stringify({ type: 'user', timestamp: '2026-09-21T13:00:01.000Z', message: { role: 'user', content: text }, ...extra }) + '\n';
  const noise = JSON.stringify({ type: 'user', timestamp: '2026-09-21T13:00:01.000Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }) + '\n';
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's1.jsonl'), line(P.s1a) + noise + line(P.s1b));
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's2.jsonl'), line(P.s2a) + line('linha sidechain que não conta', { isSidechain: true }));
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's3.jsonl'), line(P.s3a));
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's4.jsonl'), line(P.s4a) + line(P.s4b));
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's5.jsonl'), line(P.curto)); fs.writeFileSync(path.join(tx, 'C--proj-a', 's6.jsonl'), line(P.colagem)); fs.writeFileSync(path.join(tx, 'C--proj-a', 's7.jsonl'), line(P.comando));
  // A10: o mesmo texto do s3a numa OUTRA sessão — o evento s3 tem de ir buscar a ocorrência da sessão s3, não a primeira
  fs.writeFileSync(path.join(tx, 'C--proj-a', 's0.jsonl'), line(P.s3a));
  fs.writeFileSync(path.join(tx, 'C--Users-x-AppData-Local-Temp-y', 's8.jsonl'), line(P.temp));
  // um 11.º evento cujo texto NÃO está em transcrição nenhuma (sha órfão) e um 12.º com outcome != ok
  const orphan = ev('este prompt não aparece em nenhuma transcrição do harness', 's9');
  fs.appendFileSync(log, JSON.stringify({ ...orphan, prompt_sha12: 'ffffffffffff', session_id: 's10', outcome: 'timeout', tier_D: null, probs_D: null, hook_ts_ms: Date.now() }) + '\n');
  return { dir, log, tx, P, t0 };
}

test('(1) recupera o texto por sha256[0..12] do texto cru e aplica as exclusões do 60c', () => {
  const { log, tx, P, t0 } = harness();
  const events = readShadowEvents(log, t0);
  assert.equal(events.length, 12, '10 + órfão + timeout');
  const { idx } = indexTranscripts(tx);
  assert.ok(idx.has(sha12(P.s1a)) && idx.has(sha12(P.s4b)), 'índice por sha do texto cru');
  const { meta, items } = buildCorpus({ events, idx, known: new Set(), n: 60, cap: 1, seed: 20260921 });
  assert.equal(meta._events, 12); assert.equal(meta._events_not_ok, 1); assert.equal(meta._unrecovered, 1);
  assert.equal(meta._dropped.lt20, 1); assert.equal(meta._dropped.colagem, 1); assert.equal(meta._dropped['comando_/'], 1); assert.equal(meta._dropped.scratchpad_Temp, 1);
  assert.equal(meta._eligible, 6, 's1a s1b s2a s3a s4a s4b');
  assert.equal(items.length, 4, '1 por sessão ESTRITO: s1, s2, s3, s4');
  assert.equal(new Set(items.map((i) => i._session_sha8)).size, 4);
  assert.ok(items.every((i) => /^d\d\d$/.test(i.id) && i._event_sha12 && i.prompt.length >= 20));
});

test('(2) anonimiza como o 60c e o ficheiro não leva previsões nem o nome do dono', () => {
  const { log, tx, P, t0 } = harness();
  const { idx } = indexTranscripts(tx);
  const { items, predictions } = buildCorpus({ events: readShadowEvents(log, t0), idx, known: new Set(), n: 60, cap: 1, seed: 20260921 });
  const s1 = items.find((i) => i._event_sha12 === sha12(P.s1a) || i._event_sha12 === sha12(P.s1b));
  assert.ok(s1, 'a sessão s1 está representada');
  const corpusText = JSON.stringify(items);
  assert.ok(!corpusText.includes(OWNER), 'o nome do dono não está no corpus');
  for (const k of ['tier_D', 'probs_D', 'p_max_D', 'tier_regra', 'aux_D']) assert.ok(!corpusText.includes(k), `sem ${k} no corpus (cegueira)`);
  assert.equal(predictions.length, items.length); assert.ok(predictions.every((p) => p.tier === 'T2' && p.probs && p.aux), 'as previsões DO EVENTO vêm à parte, do mock T2');
});

test('(3) sha conhecido (corpus anterior) e 1/sessão com seed estável', () => {
  const { log, tx, P, t0 } = harness();
  const { idx } = indexTranscripts(tx);
  const known = new Set([sha12(P.s2a)]);
  const a = buildCorpus({ events: readShadowEvents(log, t0), idx, known, n: 60, cap: 1, seed: 20260921 });
  assert.equal(a.meta._dropped.sha_conhecido, 1); assert.equal(a.items.length, 3, 's2 sai por sha conhecido');
  const b = buildCorpus({ events: readShadowEvents(log, t0), idx, known, n: 60, cap: 1, seed: 20260921 });
  assert.deepEqual(a.items.map((i) => i._event_sha12), b.items.map((i) => i._event_sha12), 'determinístico com a mesma seed');
  const c = buildCorpus({ events: readShadowEvents(log, t0), idx, known: new Set(), n: 2, cap: 1, seed: 20260921 });
  assert.equal(c.items.length, 2); assert.equal(c.meta._target_reached, true);
});

test('(4) sha igual com comprimento diferente é rejeitado; elegibilidade de tags', () => {
  const rec = { text: 'x'.repeat(30), proj: 'C--p', sess: 's', ts: null, toolResult: false, sidechain: false, meta: false };
  assert.equal(eligible({ ...rec, text: '<task-notification> ' + 'y'.repeat(30) }, new Set()), 'tag_task-notification');
  assert.equal(eligible({ ...rec, text: '<system-reminder>a</system-reminder>' + 'z'.repeat(30) }, new Set()), null, 'system-reminder é limpo, não excluído');
  const { log, tx, P, t0 } = harness();
  const { idx } = indexTranscripts(tx);
  const events = readShadowEvents(log, t0).map((e) => (e.prompt_sha12 === sha12(P.s3a) ? { ...e, prompt_len: e.prompt_len + 1 } : e));
  const { meta } = buildCorpus({ events, idx, known: new Set(), n: 60, cap: 1, seed: 20260921 });
  assert.equal(meta._dropped.len_diferente, 1);
});

test('(5) o adversário (round 5, A7/A8/A11): saídas gitignoradas, --out fora do gitignore recusado, sem n_target não fecha, previsões só ligadas ao corpus congelado e a rótulos completos', () => {
  for (const f of ['results/corpus-60d.json', 'results/labels-60d.json', 'results/labels-60d-codex.json', 'results/D-shadow-corpus-60d.json', 'results/policy-60d.json', 'results/labels-60d-transcript/x.txt', 'results/nettap-worker-60d.jsonl']) {
    let ignored = false; try { execFileSync('git', ['check-ignore', '-q', path.join(HERE, f)], { cwd: HERE, stdio: 'ignore' }); ignored = true; } catch { ignored = false; }
    assert.ok(ignored, `${f} tem de estar no .gitignore do pacote`);
  }
  const { log, tx, dir } = harness();
  const run = (extra) => { try { const out = execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', log, '--transcripts', tx, '--since', '2026-09-21T12:00:00Z', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0, out }; } catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') }; } };
  // A7: um --out dentro do repo que NÃO está gitignorado é recusado antes de ler seja o que for
  const bad = path.join(HERE, 'results', 'corpus-60d-copia.json');
  const r7 = run(['--out', bad]); assert.notEqual(r7.code, 0, 'recusa --out não ignorado'); assert.ok(!fs.existsSync(bad));
  // A11: 4 itens < n_target → NÃO FECHADO (exit 5), nada escrito; --partial escreve marcado
  const out = path.join(dir, 'results', 'corpus-60d.json'); fs.mkdirSync(path.dirname(out));
  const r11 = run(['--out', out]); assert.equal(r11.code, 5); assert.ok(!fs.existsSync(out), 'sem n_target não escreve');
  assert.ok(/ESPERAR/.test(r11.err), 'diz que se espera, não se baixa n');
  const rp = run(['--out', out, '--partial']); assert.equal(rp.code, 0);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.items.length, 4); assert.equal(written._partial, true); assert.ok(!JSON.stringify(written).includes('probs_D'));
  assert.ok(written._known_sources && Object.keys(written._known_sources).length === 4, 'as 4 fontes de exclusão contabilizadas');
  // A8: --predictions recusa sem rótulos, recusa com rótulos incompletos, e só escreve ligado ao corpus congelado
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'sem labels-60d.json');
  const labelsPath = path.join(dir, 'results', 'labels-60d.json');
  fs.writeFileSync(labelsPath, JSON.stringify({ labels: written.items.slice(1).map((it) => ({ id: it.id, tier: 'T2' })) }));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'rótulos incompletos (falta 1 id)');
  fs.writeFileSync(labelsPath, JSON.stringify({ labels: written.items.map((it) => ({ id: it.id, tier: 'T2' })) }));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'corpus parcial (n_target não atingido) também recusa');
  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false })); // simula um corpus completo congelado
  const ok = run(['--out', out, '--predictions']); assert.equal(ok.code, 0, ok.err);
  const pred = JSON.parse(fs.readFileSync(path.join(dir, 'results', 'D-shadow-corpus-60d.json'), 'utf8'));
  assert.equal(pred.rows.length, 4); assert.ok(pred.rows.every((r) => r.tier === 'T2' && typeof r.probs.T2 === 'number' && typeof r.aux.p_needs_repo === 'number'));
  assert.ok(pred._corpus_sha256 && pred._labels_sha256, 'previsões ligadas por sha ao corpus e aos rótulos');
  // A9: nada além de escalares — nenhum valor de string longa nas previsões
  const strings = JSON.stringify(pred.rows).match(/"[^"]{25,}"/g) || []; assert.deepEqual(strings, [], 'sem strings longas nas previsões');
});
