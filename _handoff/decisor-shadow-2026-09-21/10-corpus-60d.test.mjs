// 10-corpus-60d.test.mjs — o recuperador do 60d testado em eventos do HARNESS (nunca nos vivos):
// os eventos são escritos pelo próprio tools/router/arbiter.js#shadowDecisor (mocks de logprobs, _inline), as
// transcrições são sintéticas num tmpdir, e a pergunta do adversário («pode fugir texto para o git?») é uma asserção.
//   node --test 10-corpus-60d.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
import { HERE, ROOT } from './lib-common.mjs';
import { readShadowEvents, indexTranscripts, buildCorpus, eligible, sha12, SINCE_CONFIRMATORY, isSessionUuid } from './10-corpus-60d.mjs';
const require = createRequire(import.meta.url);
const { shadowDecisor } = require(path.join(ROOT, 'tools', 'router', 'arbiter.js'));

const chat = (top) => ({ choices: [{ message: { content: top[0][0] }, logprobs: { content: [{ token: top[0][0], top_logprobs: top.map(([token, p]) => ({ token, logprob: Math.log(p) })) }] } }] });
const mockT2 = [chat([['C', 0.62], ['A', 0.20], ['B', 0.10], ['D', 0.05]]), chat([['B', 0.5], ['A', 0.3], ['C', 0.2]]), chat([['B', 0.8], ['A', 0.2]]), chat([['A', 0.7], ['B', 0.3]])];
const decision = { tier: 'T0', confidence: 0.9, task_category: 'trivial_local', escalation_rule: 'none', recommended_backend: 'ollama', recommended_model: 'qwen2.5:3b' };
const OWNER = path.basename(os.homedir());
// mp4-4 (i): session_id não-UUID = teste, fora do universo — o harness usa UUIDs determinísticos (como o Claude Code)
const U = (k) => { const h = crypto.createHash('sha256').update(String(k)).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
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
  const events = [ev(P.s1a, U('s1')), ev(P.s1b, U('s1')), ev(P.s2a, U('s2')), ev(P.s3a, U('s3')), ev(P.s4a, U('s4')), ev(P.s4b, U('s4')), ev(P.curto, U('s5')), ev(P.colagem, U('s6')), ev(P.comando, U('s7')), ev(P.temp, U('s8'))];
  assert.ok(events.every((e) => e && e.event === 'decisor_shadow' && e.outcome === 'ok'), 'o harness escreveu 10 eventos ok');
  // transcrições: uma linha type:user por prompt (o texto CRU), mais ruído (tool_result, sidechain), e o «temp» num projecto Temp
  const line = (text, extra = {}) => JSON.stringify({ type: 'user', timestamp: '2026-09-21T13:00:01.000Z', message: { role: 'user', content: text }, ...extra }) + '\n';
  const noise = JSON.stringify({ type: 'user', timestamp: '2026-09-21T13:00:01.000Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }) + '\n';
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s1') + '.jsonl'), line(P.s1a) + noise + line(P.s1b));
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s2') + '.jsonl'), line(P.s2a) + line('linha sidechain que não conta', { isSidechain: true }));
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s3') + '.jsonl'), line(P.s3a));
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s4') + '.jsonl'), line(P.s4a) + line(P.s4b));
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s5') + '.jsonl'), line(P.curto)); fs.writeFileSync(path.join(tx, 'C--proj-a', U('s6') + '.jsonl'), line(P.colagem)); fs.writeFileSync(path.join(tx, 'C--proj-a', U('s7') + '.jsonl'), line(P.comando));
  // A10: o mesmo texto do s3a numa OUTRA sessão — o evento s3 tem de ir buscar a ocorrência da sessão s3, não a primeira
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('s0') + '.jsonl'), line(P.s3a));
  fs.writeFileSync(path.join(tx, 'C--Users-x-AppData-Local-Temp-y', U('s8') + '.jsonl'), line(P.temp));
  // um 11.º evento cujo texto NÃO está em transcrição nenhuma (sha órfão) e um 12.º com outcome != ok
  const orphan = ev('este prompt não aparece em nenhuma transcrição do harness', U('s9'));
  fs.appendFileSync(log, JSON.stringify({ ...orphan, prompt_sha12: 'ffffffffffff', session_id: U('s10'), outcome: 'timeout', tier_D: null, probs_D: null, hook_ts_ms: Date.now() }) + '\n');
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
  const pre = { ...base, session_id: U('pre'), hook_ts_ms: Date.parse('2026-09-21T14:25:19Z'), ts: '2026-09-21T14:25:19Z' };
  const at = { ...base, session_id: U('s2'), hook_ts_ms: Date.parse('2026-09-21T14:25:20Z'), ts: '2026-09-21T14:25:20Z' };
  const log2 = path.join(dir, 'decisions-2.log');
  fs.writeFileSync(log2, [pre, at].map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('pre') + '.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: P.s2a } }) + '\n');
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

test('(9) MP10 · AMENDMENT mp4-4: session_id não-UUID fora antes de qualquer taxa corrigida; prompt_len > 500 fora da taxa de recuperação (não da elegibilidade); cruas e corrigidas no meta e no fecho', () => {
  const am = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp4._amendments.find((a) => a.id === 'mp4-4');
  assert.ok(am && am.outcome_known === false, 'a emenda mp4-4 existe no protocol.json, com outcome_known:false');
  assert.equal(isSessionUuid(U('x')), true); assert.equal(isSessionUuid('64FF4030-0104-4AC3-9E8F-DA65280E08ED'), true);
  for (const s of ['test-inject-pin', 'badge-test', 'test-reasoning-effort', '', null, undefined, 's1', '3c9eb831', U('x') + 'a', ' ' + U('x')]) assert.equal(isSessionUuid(s), false, String(s));

  const { log, tx, dir } = harness();
  const { idx } = indexTranscripts(tx);
  const base = readShadowEvents(log, Date.parse(SINCE_CONFIRMATORY));
  const opts = { idx, known: new Set(), n: 60, cap: 1, seed: 20260921, diagnostic_upstream: 0, invalid_upstream: 0 };
  const ref = buildCorpus({ events: base, ...opts });
  assert.equal(ref.meta._non_uuid_session_excluded, 0); assert.equal(ref.meta._not_ok_rate_raw, ref.meta._not_ok_rate_corrected);
  const tpl = base.find((e) => e.outcome === 'ok');

  // (i) 4 eventos de teste: ok com texto recuperável (sha de um prompt real), ok sem texto, timeout, e sem session_id
  const tests = [{ ...tpl, session_id: 'test-inject-pin' }, { ...tpl, session_id: 'badge-test', prompt_sha12: 'aaaaaaaaaaaa' }, { ...tpl, session_id: 'test-reasoning-effort', outcome: 'timeout' }, { ...tpl, session_id: undefined }];
  const a = buildCorpus({ events: [...base, ...tests], ...opts });
  assert.equal(a.meta._non_uuid_session_excluded, 4);
  assert.deepEqual(a.meta._non_uuid_session_ids, { 'test-inject-pin': 1, 'badge-test': 1, 'test-reasoning-effort': 1, '(ausente)': 1 });
  assert.equal(a.meta._non_uuid_session_unknown, 1, 'round 9 A2: «(ausente)» não é um literal de teste provado — sai, mas é contado à parte');
  const proto = buildCorpus({ events: [...base, { ...tpl, session_id: '__proto__' }], ...opts }).meta;
  assert.equal(proto._non_uuid_session_excluded, 1); assert.equal(proto._non_uuid_session_unknown, 1, 'round 9b: "__proto__" não se perde no acumulador');
  assert.equal(Object.getOwnPropertyDescriptor(proto._non_uuid_session_ids, '__proto__')?.value, 1); assert.ok(JSON.stringify(proto._non_uuid_session_ids).includes('"__proto__":1'), 'e chega ao JSON do meta');
  assert.equal(a.meta._events, ref.meta._events + 4, 'o bruto conta tudo'); assert.equal(a.meta._events_uuid, ref.meta._events);
  assert.equal(a.meta._not_ok_rate_raw, +((ref.meta._events_not_ok + 1) / (ref.meta._events + 4)).toFixed(3), 'crua inclui o timeout de teste');
  assert.equal(a.meta._not_ok_rate, a.meta._not_ok_rate_raw, '_not_ok_rate mantém a definição crua');
  assert.equal(a.meta._not_ok_rate_corrected, ref.meta._not_ok_rate_corrected, 'corrigida ignora os testes');
  assert.equal(a.meta._unrecovered, ref.meta._unrecovered + 1, 'crua conta o badge-test sem texto'); assert.equal(a.meta._unrecovered_rate_corrected, ref.meta._unrecovered_rate_corrected);
  assert.deepEqual(a.items.map((i) => [i._event_sha12, i._session_sha8]), ref.items.map((i) => [i._event_sha12, i._session_sha8]), 'nenhum evento de teste entra no corpus');
  assert.deepEqual(a.meta._dropped, ref.meta._dropped, 'os testes saem ANTES de qualquer razão de exclusão');

  // (ii) prompt_len: 501 sem texto sai da taxa; 500 sem texto fica; 501 cru com lembrete e <= 500 limpo continua elegível
  const body = 'explica passo a passo como o retry com backoff exponencial funciona neste módulo de sync';
  const raw501 = '<system-reminder>' + 'r'.repeat(501 - body.length - 35) + '</system-reminder>' + body;
  assert.equal(raw501.length, 501);
  fs.writeFileSync(path.join(tx, 'C--proj-a', U('x501b') + '.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: raw501 } }) + '\n');
  const { idx: idx2 } = indexTranscripts(tx);
  const e501 = { ...tpl, session_id: U('x501'), prompt_sha12: 'dddddddddddd', prompt_len: 501 };
  const e500 = { ...tpl, session_id: U('x500'), prompt_sha12: 'eeeeeeeeeeee', prompt_len: 500 };
  const eLong = { ...tpl, session_id: U('x501b'), prompt_sha12: sha12(raw501), prompt_len: 501, hook_ts_ms: tpl.hook_ts_ms + 1 };
  const refB = buildCorpus({ events: base, ...opts, idx: idx2 });
  const b = buildCorpus({ events: [...base, e501, e500, eLong], ...opts, idx: idx2 });
  assert.equal(b.meta._prompt_len_gt500_out_of_recovery_rate, 2, 'e501 e eLong');
  assert.equal(b.meta._recovery_rate_denominator, refB.meta._recovery_rate_denominator + 1, 'só o de 500 entra no denominador');
  assert.equal(b.meta._unrecovered_corrected, refB.meta._unrecovered_corrected + 1, 'só o de 500 entra no numerador — LIMITE DECLARADO (round 9 A1): o e501 sem texto não conta, mesmo que, limpo, pudesse ser elegível');
  assert.equal(b.meta._unrecovered, refB.meta._unrecovered + 2, 'crua conta os dois sem texto');
  assert.equal(b.meta._unrecovered_rate_raw, +((refB.meta._unrecovered + 2) / (refB.meta._events_ok + 3)).toFixed(3));
  assert.equal(b.meta._unrecovered_rate_corrected, +((refB.meta._unrecovered_corrected + 1) / (refB.meta._recovery_rate_denominator + 1)).toFixed(3));
  assert.ok(b.items.some((i) => i._event_sha12 === sha12(raw501)), 'a elegibilidade do 60c não mudou: 501 cru, <= 500 limpo, entra');
  for (const k of ['_not_ok_rate_raw', '_not_ok_rate_corrected', '_unrecovered_rate_raw', '_unrecovered_rate_corrected']) assert.ok(k in b.meta, k);

  // fecho: os tectos de 10 % olham para as CORRIGIDAS e a recusa imprime as duas
  const cli = (logPath) => { try { execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', logPath, '--transcripts', tx, '--out', path.join(dir, 'res9', 'corpus-60d.json')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0, err: '' }; } catch (e) { return { code: e.status, err: String(e.stderr || '') }; } };
  fs.mkdirSync(path.join(dir, 'res9'));
  const noisy = path.join(dir, 'decisions-testes.log');
  const junk = [...Array.from({ length: 20 }, (_, i) => ({ ...tpl, session_id: 'test-inject-pin', outcome: 'timeout', prompt_sha12: 'cccccccccccc', hook_ts_ms: tpl.hook_ts_ms + 10 + i })),
    ...Array.from({ length: 5 }, (_, i) => ({ ...tpl, session_id: 'badge-test', prompt_sha12: 'aaaaaaaaaaaa', hook_ts_ms: tpl.hook_ts_ms + 30 + i }))]; // ok sem texto: crua de recuperação > 10 %
  fs.writeFileSync(noisy, [...base, ...junk].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r1 = cli(noisy); assert.equal(r1.code, 5, r1.err);
  assert.ok(/ESPERAR/.test(r1.err) && !/não-ok/.test(r1.err) && !/recuperável/.test(r1.err), 'crua > 10 % só por testes não impede o fecho: ' + r1.err);
  assert.ok(!/AVISO/.test(r1.err), 'só literais de teste conhecidos: sem aviso');
  const real = [...Array.from({ length: 3 }, (_, i) => ({ ...tpl, session_id: U('t' + i), outcome: 'timeout', hook_ts_ms: tpl.hook_ts_ms + 40 + i })),
    ...Array.from({ length: 3 }, (_, i) => ({ ...tpl, session_id: U('u' + i), prompt_sha12: 'bbbbbbbbbbb' + i, prompt_len: 120, hook_ts_ms: tpl.hook_ts_ms + 50 + i })),
    { ...tpl, session_id: '__proto__', outcome: 'timeout', hook_ts_ms: tpl.hook_ts_ms + 60 }]; // round 9b: o caso patológico do acumulador
  fs.writeFileSync(noisy, [...base, ...junk, ...real].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r2 = cli(noisy); assert.equal(r2.code, 5);
  assert.ok(/não-ok corrigida \d+\.\d % > 10 %.*crua \d+\.\d %/.test(r2.err), 'corrigida > 10 % recusa e imprime crua e corrigida: ' + r2.err);
  assert.ok(/recuperável corrigida \d+\.\d % > 10 %.*crua \d+\.\d %/.test(r2.err), 'idem para a recuperação: ' + r2.err);
  assert.ok(/AVISO.*1 evento\(s\) com session_id não-UUID fora dos literais/.test(r2.err), 'round 9 A2: um não-UUID desconhecido é avisado: ' + r2.err);
});

test('(10) MP10 · round 9 A5: o corpus FECHA com n = 60 num log poluído por testes e hand-backs > 500; as cruas ficam acima de 10 % no ficheiro escrito', () => {
  const { log, tx, dir } = harness();
  const tpl = readShadowEvents(log, Date.parse(SINCE_CONFIRMATORY)).find((e) => e.outcome === 'ok');
  const t0 = tpl.hook_ts_ms; const evs = [];
  for (let i = 0; i < 60; i++) {
    const text = `pergunta sintética número ${i} sobre o módulo ${i % 7} e a cache de sessão ${i * 13}`; const sid = U('c' + i);
    fs.writeFileSync(path.join(tx, 'C--proj-a', sid + '.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n');
    evs.push({ ...tpl, session_id: sid, prompt_sha12: sha12(text), prompt_len: text.length, hook_ts_ms: t0 + i });
  }
  for (let i = 0; i < 20; i++) evs.push({ ...tpl, session_id: 'test-inject-pin', outcome: 'timeout', hook_ts_ms: t0 + 100 + i });
  for (let i = 0; i < 5; i++) evs.push({ ...tpl, session_id: 'badge-test', prompt_sha12: 'aaaaaaaaaaaa', hook_ts_ms: t0 + 200 + i });
  for (let i = 0; i < 2; i++) evs.push({ ...tpl, session_id: U('c' + i), prompt_sha12: 'abababababa' + i, prompt_len: 890 + i, hook_ts_ms: t0 + 300 + i }); // hand-backs sem type:user
  const L = path.join(dir, 'decisions-60.log'); fs.writeFileSync(L, evs.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const out = path.join(dir, 'r10', 'corpus-60d.json'); fs.mkdirSync(path.dirname(out));
  try { execFileSync(process.execPath, [path.join(HERE, '10-corpus-60d.mjs'), '--log', L, '--transcripts', tx, '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { assert.fail('o fecho recusou: ' + String(e.stderr)); }
  const w = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(w.items.length, 60); assert.equal(w._partial, false); assert.deepEqual(w._problems, []); assert.equal(w._target_reached, true); assert.equal(w._picked_sessions, 60);
  assert.ok(w._not_ok_rate_raw > 0.10 && w._unrecovered_rate_raw > 0.10, `as cruas ficam acima de 10 % e impressas (${w._not_ok_rate_raw}, ${w._unrecovered_rate_raw})`);
  assert.equal(w._not_ok_rate_corrected, 0); assert.equal(w._unrecovered_rate_corrected, 0);
  assert.equal(w._prompt_len_gt500_out_of_recovery_rate, 2); assert.equal(w._non_uuid_session_excluded, 25); assert.equal(w._non_uuid_session_unknown, 0);
});
