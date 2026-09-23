// 10-corpus-60d.test.mjs — o recuperador do 60d testado em eventos do HARNESS (nunca nos vivos):
// os eventos são escritos pelo próprio tools/router/arbiter.js#shadowDecisor (mocks de logprobs, _inline), as
// transcrições são sintéticas num tmpdir, e a pergunta do adversário («pode fugir texto para o git?») é uma asserção.
//   node --test 10-corpus-60d.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
import { HERE, ROOT } from './lib-common.mjs';
import { readShadowEvents, indexTranscripts, buildCorpus, eligible, sha12, SINCE_CONFIRMATORY } from './10-corpus-60d.mjs';
const require = createRequire(import.meta.url);
const { shadowDecisor } = require(path.join(ROOT, 'tools', 'router', 'arbiter.js'));

const chat = (top) => ({ choices: [{ message: { content: top[0][0] }, logprobs: { content: [{ token: top[0][0], top_logprobs: top.map(([token, p]) => ({ token, logprob: Math.log(p) })) }] } }] });
const mockT2 = [chat([['C', 0.62], ['A', 0.20], ['B', 0.10], ['D', 0.05]]), chat([['B', 0.5], ['A', 0.3], ['C', 0.2]]), chat([['B', 0.8], ['A', 0.2]]), chat([['A', 0.7], ['B', 0.3]])];
const decision = { tier: 'T0', confidence: 0.9, task_category: 'trivial_local', escalation_rule: 'none', recommended_backend: 'ollama', recommended_model: 'qwen2.5:3b' };
const OWNER = path.basename(os.homedir());
// round 8c A1: labels-60d.json leva _corpus_sha256 dos bytes do corpus que rotula
const relabel = (out, labelsPath, rows) => fs.writeFileSync(labelsPath, JSON.stringify({ _corpus_sha256: crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'), labels: rows }));

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
  const run = (extra) => { try { const out = execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', log, '--transcripts', tx, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0, out }; } catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') }; } };
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
  relabel(out, labelsPath, written.items.slice(1).map((it) => ({ id: it.id, tier: 'T2' })));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'rótulos incompletos (falta 1 id)');
  relabel(out, labelsPath, written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'corpus parcial (n_target não atingido) também recusa');
  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false })); // simula um corpus completo congelado
  relabel(out, labelsPath, written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  fs.writeFileSync(labelsPath, JSON.stringify({ _corpus_sha256: 'f'.repeat(64), labels: written.items.map((it) => ({ id: it.id, tier: 'T2' })) }));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'round 8c A1: rótulos ligados a outro corpus');
  relabel(out, labelsPath, [...written.items.map((it) => ({ id: it.id, tier: 'T2' })), { id: written.items[0].id, tier: 'T0' }]);
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'round 8d: rótulo duplicado e contraditório');
  relabel(out, labelsPath, written.items.map((it, i) => ({ id: it.id, tier: i ? 'T2' : 'T9' })));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'round 8d: tier inválido');
  relabel(out, labelsPath, written.items.map((it, i) => ({ id: it.id, tier: i ? 'T2' : ['T0'] })));
  assert.equal(run(['--out', out, '--predictions']).code, 3, 'round 8e: tier em array passa a regex por coerção, não o includes');
  relabel(out, labelsPath, written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  const ok = run(['--out', out, '--predictions']); assert.equal(ok.code, 0, ok.err);
  const pred = JSON.parse(fs.readFileSync(path.join(dir, 'results', 'D-shadow-corpus-60d.json'), 'utf8'));
  assert.equal(pred.rows.length, 4); assert.ok(pred.rows.every((r) => r.tier === 'T2' && typeof r.probs.T2 === 'number' && typeof r.aux.p_needs_repo === 'number'));
  assert.ok(pred._corpus_sha256 && pred._labels_sha256, 'previsões ligadas por sha ao corpus e aos rótulos');
  // A9: nada além de escalares — nenhum valor de string longa nas previsões
  const strings = JSON.stringify(pred.rows).match(/"[^"]{25,}"/g) || []; assert.deepEqual(strings, [], 'sem strings longas nas previsões');
});

test('(6) MP9 · janela confirmatória A10: default 14:25:20Z, evento de 14:25:19Z fora e contado, --since anterior recusado', () => {
  assert.equal(SINCE_CONFIRMATORY, '2026-09-21T14:25:20Z');
  const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8'));
  assert.ok(JSON.stringify(proto.mp4).includes('since_utc_confirmatory = ' + SINCE_CONFIRMATORY), 'a constante é a do protocol.json A10');
  const { log, tx, dir, P } = harness();
  // dois eventos «à mão» colados à fronteira: 14:25:19Z (diagnóstico) e 14:25:20Z (primeiro confirmatório)
  const base = readShadowEvents(log, 0).find((e) => e.prompt_sha12 === sha12(P.s2a));
  const pre = { ...base, session_id: 'pre', hook_ts_ms: Date.parse('2026-09-21T14:25:19Z'), ts: '2026-09-21T14:25:19Z' };
  const at = { ...base, session_id: 's2', hook_ts_ms: Date.parse('2026-09-21T14:25:20Z'), ts: '2026-09-21T14:25:20Z' };
  const log2 = path.join(dir, 'decisions-2.log');
  fs.writeFileSync(log2, [pre, at].map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(path.join(tx, 'C--proj-a', 'pre.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: P.s2a } }) + '\n');
  const evs = readShadowEvents(log2, Date.parse(SINCE_CONFIRMATORY));
  assert.equal(evs.length, 1); assert.equal(evs.diagnostic_excluded, 1, '14:25:19Z fica fora e é contado');
  const { idx } = indexTranscripts(tx);
  const a = buildCorpus({ events: evs, idx, known: new Set(), n: 60, cap: 1, seed: 20260921, since: Date.parse(SINCE_CONFIRMATORY) });
  assert.equal(a.meta._since_utc, '2026-09-21T14:25:20.000Z'); assert.equal(a.meta._since_confirmatory, SINCE_CONFIRMATORY); assert.equal(a.meta._diagnostic_excluded, 1);
  assert.equal(a.items.length, 1, 'o de 14:25:20Z entra');
  // defesa em profundidade: pela biblioteca com since 12:00Z, o de 14:25:19Z passa o filtro mas o buildCorpus larga-o (sem duplicar a conta)
  const early = readShadowEvents(log2, Date.parse('2026-09-21T12:00:00Z'));
  assert.equal(early.length, 2); assert.equal(early.diagnostic_excluded, 0);
  const b = buildCorpus({ events: early, idx, known: new Set(), n: 60, cap: 1, seed: 20260921, since: Date.parse('2026-09-21T12:00:00Z') });
  assert.equal(b.meta._diagnostic_excluded, 1); assert.equal(b.meta._events, 1); assert.equal(b.items.length, 1);
  assert.equal(b.meta._since_utc, '2026-09-21T14:25:20.000Z', 'o meta diz a janela efectiva, nunca a pedida');
  // CLI: --since 12:00Z recusado (exit 4) antes de ler ou escrever; sem --since o default é a janela A10
  const cli = (extra) => { try { return { code: 0, out: execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', log2, '--transcripts', tx, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') }; } };
  const r = cli(['--since', '2026-09-21T12:00:00Z', '--dry']); assert.equal(r.code, 4); assert.ok(/RECUSADO/.test(r.err) && /14:25:20Z/.test(r.err));
  assert.equal(cli(['--since', 'lixo', '--dry']).code, 4, 'since inválido também recusa');
  assert.equal(cli(['--since', '2026-09-21T14:25:19.999Z', '--dry']).code, 4, '1 ms antes recusa');
  const d = cli(['--dry']); assert.equal(d.code, 0, d.err); const m = JSON.parse(d.out);
  assert.equal(m._since_utc, '2026-09-21T14:25:20.000Z'); assert.equal(m._diagnostic_excluded, 1);
});

test('(7) MP9 · round 8 A3/A4/A5: janela efectiva max(since, A10), ts inválido à parte, _t_utc por item, --predictions recusa corpus fora da janela', () => {
  const { log, tx, dir, P } = harness();
  const evs = readShadowEvents(log, Date.parse(SINCE_CONFIRMATORY));
  const s2 = evs.find((e) => e.prompt_sha12 === sha12(P.s2a)); const s3 = evs.find((e) => e.prompt_sha12 === sha12(P.s3a));
  const { idx } = indexTranscripts(tx);
  // A4: since posterior a A10 — um evento entre A10 e o since NÃO entra e o meta diz o since pedido
  const mid = { ...s2, hook_ts_ms: Date.parse('2026-09-22T00:00:00Z') }; const late = { ...s3, hook_ts_ms: Date.parse('2026-09-23T00:00:00Z') };
  const a = buildCorpus({ events: [mid, late], idx, known: new Set(), n: 60, cap: 1, seed: 20260921, since: Date.parse('2026-09-22T12:00:00Z'), diagnostic_upstream: 0 });
  assert.equal(a.meta._since_utc, '2026-09-22T12:00:00.000Z'); assert.equal(a.meta._before_since_excluded, 1); assert.equal(a.meta._diagnostic_excluded, 0);
  assert.deepEqual(a.items.map((i) => i._event_sha12), [sha12(P.s3a)]); assert.equal(a.items[0]._t_utc, '2026-09-23T00:00:00.000Z', 'cada item leva a hora do evento');
  // A5: ts inválido conta à parte, não como diagnóstico; a cópia do array perde o contador mas o parâmetro explícito não
  const bad = { ...s2, hook_ts_ms: null, ts: 'lixo' };
  const b = buildCorpus({ events: [bad, late], idx, known: new Set(), n: 60, cap: 1, seed: 20260921, since: Date.parse(SINCE_CONFIRMATORY), diagnostic_upstream: 3, invalid_upstream: 0 });
  assert.equal(b.meta._invalid_ts_excluded, 1); assert.equal(b.meta._diagnostic_excluded, 3); assert.equal(b.items.length, 1);
  // A3: --predictions recusa um corpus congelado sem o carimbo do MP9 e um com um item diagnóstico, mesmo com rótulos completos
  const cli = (extra) => { try { execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', log, '--transcripts', tx, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0 }; } catch (e) { return { code: e.status, err: String(e.stderr || '') }; } };
  const out = path.join(dir, 'res', 'corpus-60d.json'); fs.mkdirSync(path.dirname(out));
  assert.equal(cli(['--out', out, '--partial']).code, 0); const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(written.items.every((it) => Date.parse(it._t_utc) >= Date.parse(SINCE_CONFIRMATORY)), 'o corpus escrito leva _t_utc em cada item');

  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false, _since_confirmatory: undefined }));
  relabel(out, path.join(dir, 'res', 'labels-60d.json'), written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  const r1 = cli(['--out', out, '--predictions']); assert.equal(r1.code, 3); assert.ok(/_since_confirmatory/.test(r1.err), r1.err);
  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false, items: written.items.map((it, i) => (i === 0 ? { ...it, _t_utc: '2026-09-21T14:00:00.000Z' } : it)) }));
  relabel(out, path.join(dir, 'res', 'labels-60d.json'), written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  const r2 = cli(['--out', out, '--predictions']); assert.equal(r2.code, 3); assert.ok(/anteriores à janela/.test(r2.err), r2.err);
  // A3: hora do item que não bate com a do evento (evento repetido/trocado) → sem evento único → recusa
  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false, items: written.items.map((it, i) => (i === 0 ? { ...it, _t_utc: new Date(Date.parse(it._t_utc) + 1).toISOString() } : it)) }));
  relabel(out, path.join(dir, 'res', 'labels-60d.json'), written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  const r3 = cli(['--out', out, '--predictions']); assert.equal(r3.code, 3); assert.ok(/sem evento único/.test(r3.err), r3.err);
  fs.writeFileSync(out, JSON.stringify({ ...written, _target_reached: true, _partial: false }));
  relabel(out, path.join(dir, 'res', 'labels-60d.json'), written.items.map((it) => ({ id: it.id, tier: 'T2' })));
  assert.equal(cli(['--out', out, '--predictions']).code, 0, 'o corpus íntegro passa');
});

test('(8) MP9 · round 8b A5: contadores honestos — ts inválido contado no leitor, cópia do array dá null (n/d), nunca 0', () => {
  const { log, tx, dir } = harness();
  const log2 = path.join(dir, 'decisions-inv.log');
  const good = readShadowEvents(log, Date.parse(SINCE_CONFIRMATORY))[0];
  fs.writeFileSync(log2, [{ ...good, hook_ts_ms: null, ts: 'lixo' }, { ...good, hook_ts_ms: Date.parse('2026-09-21T14:00:00Z') }, good].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const evs = readShadowEvents(log2, Date.parse(SINCE_CONFIRMATORY));
  assert.equal(evs.length, 1); assert.equal(evs.invalid_ts_excluded, 1); assert.equal(evs.diagnostic_excluded, 1);
  const { idx } = indexTranscripts(tx);
  const a = buildCorpus({ events: evs, idx, known: new Set(), n: 60, cap: 1, seed: 20260921 });
  assert.equal(a.meta._invalid_ts_excluded, 1); assert.equal(a.meta._diagnostic_excluded, 1);
  const b = buildCorpus({ events: [...evs], idx, known: new Set(), n: 60, cap: 1, seed: 20260921 });
  assert.equal(b.meta._invalid_ts_excluded, null); assert.equal(b.meta._diagnostic_excluded, null, 'a cópia perde o contador → n/d, não 0');
});
