import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarReceptor, sanear } from '../otel-receptor.mjs';
import { agregarLogs, agregarMetricas, attrs } from '../otel-agregar.mjs';

const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: typeof v === 'number' ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) } }));

test('attrs converte a lista OTLP', () => {
  assert.deepEqual(attrs(kv({ a: 'x', b: 3 })), { a: 'x', b: '3' });
});

test('receptor: só loopback, grava json, recusa protobuf, respeita tecto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-'));
  const { servidor, estado } = criarReceptor({ dir, tectoBytesDia: 400 });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port, address } = servidor.address();
  assert.equal(address, '127.0.0.1');
  const post = (url, body, ct = 'application/json') => fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: { 'content-type': ct }, body });
  assert.equal((await post('/v1/logs', JSON.stringify({ resourceLogs: [] }))).status, 200);
  assert.equal((await post('/v1/metrics', 'binário', 'application/x-protobuf')).status, 415);
  assert.equal((await post('/v1/logs', '{mau')).status, 400);
  assert.equal((await post('/v1/nada', '{}')).status, 404);
  // excede o tecto → descartado com 200 (tem de ser conteúdo que sobrevive à allowlist: lixo é tirado antes)
  const grande = { resourceLogs: [{ scopeLogs: [{ logRecords: Array.from({ length: 20 }, () => ({ attributes: kv({ 'event.name': 'api_request', model: 'claude-opus-5-5' }) })) }] }] };
  await post('/v1/logs', JSON.stringify(grande));
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  servidor.close();
  assert.equal(h.recebidos.logs, 1); assert.equal(h.rejeitados_protobuf, 1); assert.equal(h.invalidos, 1); assert.equal(h.rejeitados_tecto, 1);
  const ficheiros = fs.readdirSync(dir);
  assert.equal(ficheiros.length, 1); assert.match(ficheiros[0], /^logs-\d{4}-\d{2}-\d{2}\.jsonl$/);
  assert.equal(estado.recebidos.logs, 1);
});

test('agregarLogs soma api_request por modelo e query_source', () => {
  const rec = (o) => ({ attributes: kv(o) });
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [
    rec({ 'event.name': 'api_request', model: 'claude-opus-5-5', query_source: 'main', input_tokens: 2, output_tokens: 10, cache_read_tokens: 100, cache_creation_tokens: 5, cost_usd: 0.01, 'prompt.id': 'p1' }),
    rec({ 'event.name': 'api_request', model: 'claude-haiku-4-5', query_source: 'subagent', input_tokens: 1, output_tokens: 4, cache_read_tokens: 0, cache_creation_tokens: 7000, 'prompt.id': 'p1' }),
    rec({ 'event.name': 'user_prompt', 'prompt.id': 'p1' }),
  ] }] }] };
  const r = agregarLogs([payload]);
  assert.equal(r.eventos_api_request, 2);
  assert.equal(r.prompts_distintos, 1);
  assert.equal(r.por_query_source.subagent.cache_creation, 7000);
  assert.equal(r.por_modelo['claude-opus-5-5'].output, 10);
});

test('agregarMetricas soma token.usage por dimensões', () => {
  const payload = { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [
    { attributes: kv({ type: 'cacheRead', model: 'claude-opus-5-5', query_source: 'main' }), asInt: '50' },
    { attributes: kv({ type: 'cacheRead', model: 'claude-opus-5-5', query_source: 'main' }), asInt: '25' },
  ] } }] }] }] };
  const r = agregarMetricas([payload]);
  assert.equal(r.token_usage['cacheRead|claude-opus-5-5|main|n/d'], 75);
});

test('receptor: recusa Origin (CSRF de browser) e text/plain', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otel2-'));
  const { servidor } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  const r1 = await fetch(`http://127.0.0.1:${port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://mau.example' }, body: '{}' });
  const r2 = await fetch(`http://127.0.0.1:${port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'text/plain; x=json' }, body: '{}' });
  const r3 = await fetch(`http://127.0.0.1:${port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{}' });
  servidor.close();
  assert.equal(r1.status, 403); assert.equal(r2.status, 415); assert.equal(r3.status, 200);
});

test('sanear tira email e ids de conta, mantém o resto', () => {
  const corpo = { resourceLogs: [{ resource: { attributes: kv({ 'user.email': 'a@b.c', 'user.account_uuid': 'u', 'organization.id': 'o', 'service.name': 'claude-code' }) } }] };
  const { corpo: limpo, descartados } = sanear(corpo, 'logs');
  const ks = limpo.resourceLogs[0].resource.attributes.map((a) => a.key);
  assert.deepEqual(ks, ['service.name']);
  assert.equal(descartados, 3);
});
