// Um teste por ataque aplicado da ronda 1 do adversário codex (tools/p0/adversario-codex-r1.md).
// Cada caso reproduz o cenário do ataque e falha contra o código anterior à correcção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { medir, listarTranscripts, resumoMarkdown, sondar, invocaRouterExecute, delegacoesDe, classificarTurno } from '../medir-p0.mjs';
import { criarReceptor, sanear } from '../otel-receptor.mjs';
import { agregarLogs, agregarMetricas } from '../otel-agregar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const hint = (tier, sub) => `<router-hint>\ntier: ${tier}\nsuggested_subagent: ${sub}\nconfidence: 0.8\n</router-hint>`;
const T = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
let n = 0;
const P = (s, text, extra = {}) => ({ type: 'user', uuid: 'p' + n++, parentUuid: null, sessionId: 'S', timestamp: T(s), isSidechain: false, message: { content: text }, ...extra });
const H = (s, parent, text) => ({ type: 'attachment', uuid: 'h' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, attachment: { type: 'hook_additional_context', hookEvent: 'UserPromptSubmit', content: [text] } });
const R = (s, parent, { model = 'claude-opus-5-5', tools = [], id, req, usage, extra = {} } = {}) => {
  const k = n++;
  return { type: 'assistant', uuid: 'r' + k, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, requestId: req === undefined ? 'q' + k : req,
    message: { id: id === undefined ? 'm' + k : id, model, content: tools.map((t, i) => ({ type: 'tool_use', id: 'tu' + k + '_' + i, name: t.name, input: t.input })), usage: usage || { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, ...extra };
};
const TR = (s, parent) => ({ type: 'user', uuid: 'tr' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, toolUseResult: {}, message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
function dirCom(ficheiros) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0r1-'));
  for (const [rel, linhas] of Object.entries(ficheiros)) {
    const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  return dir;
}
const medirDir = async (dir) => medir(listarTranscripts(dir));

// ── (a) ligação hint→prompt ───────────────────────────────────────────────────────────────────
test('A1: resposta atrasada vai para o SEU prompt pela cadeia, não para o último', async () => {
  const p1 = P(0, 'um'); const h1 = H(1, p1.uuid, hint('T1', 'cheap-triage'));
  const p2 = P(2, 'dois'); const h2 = H(3, p2.uuid, hint('T2', 'model-reasoner'));
  const r1 = R(4, h1.uuid, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] });
  const r2 = R(5, h2.uuid, {});
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, h1, p2, h2, r1, r2] }));
  assert.deepEqual(r.aderencia.categorias, { seguiu: 1, ja_no_tier: 0, delegou_outro: 0, ignorou: 1, sem_modelo_host: 0 });
});

test('A2: hint que descende de P1 não passa para P2 por sequência', async () => {
  const p1 = P(0, 'um'); const p2 = P(1, 'dois', { parentUuid: null });
  const h1 = H(2, p1.uuid, hint('T1', 'cheap-triage')); const h2 = H(3, h1.uuid, hint('T2', 'model-reasoner'));
  const r2 = R(4, p2.uuid, { tools: [{ name: 'Agent', input: { subagent_type: 'model-reasoner' } }] });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, p2, h1, h2, r2] }));
  assert.equal(r.aderencia.prompts_com_hint, 1, 'só P1 tem hint');
  assert.equal(r.aderencia.categorias.seguiu, 0, 'P2 não pode seguir um hint alheio');
});

test('A2b: hint de uma <task-notification> não cola ao prompt humano anterior', async () => {
  const p1 = P(0, 'humano sem hint'); const r1 = R(1, p1.uuid, {});
  const nt = P(2, '<task-notification>feito</task-notification>', { parentUuid: r1.uuid });
  const h = H(3, nt.uuid, hint('T1', 'cheap-triage'));
  const r2 = R(4, h.uuid, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, nt, h, r2] }));
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.equal(r.aderencia.prompts_com_hint, 0);
  assert.equal(r.fonte.hints_de_turno_nao_humano, 1);
});

test('A3: hint órfão (pai fora do ficheiro) não passa ao prompt seguinte', async () => {
  const p1 = P(0, 'um'); const r1 = R(1, p1.uuid, {});
  const orfao = H(2, 'ausente', hint('T1', 'cheap-triage'));
  const p2 = P(3, 'dois'); const r2 = R(4, p2.uuid, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, orfao, p2, r2] }));
  assert.equal(r.aderencia.prompts_com_hint, 0);
  assert.equal(r.fonte.hints_sem_dono, 1);
});

test('A4: cadeia cíclica não vira associação; cadeia longa (60) chega ao prompt', async () => {
  const x = { ...R(0, 'Y'), uuid: 'X' }; const y = { ...R(0, 'X'), uuid: 'Y' };
  const p2 = P(1, 'dois'); const h = H(2, 'X', hint('T1', 'cheap-triage')); const r2 = R(3, p2.uuid, {});
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [x, y, p2, h, r2] }));
  assert.equal(r.aderencia.prompts_com_hint, 0);
  assert.equal(r.fonte.hints_sem_dono, 1);

  const p1 = P(0, 'longo'); const cadeia = [p1]; let pai = p1.uuid;
  for (let i = 0; i < 60; i++) { const l = i % 2 ? TR(1, pai) : R(1, pai, {}); cadeia.push(l); pai = l.uuid; }
  cadeia.push(H(2, pai, hint('T3', 'model-architect')));
  const r3 = await medirDir(dirCom({ 'proj/S.jsonl': cadeia }));
  assert.equal(r3.aderencia.prompts_com_hint, 1);
  assert.equal(r3.aderencia.categorias.ja_no_tier, 1);
});

test('A5: continuação nova de um turno copiado conta, em qualquer ordem de leitura', async () => {
  const p = P(0, 'x'); const h = H(1, p.uuid, hint('T1', 'cheap-triage'));
  const a = [p, h, R(2, h.uuid, {})];
  const b = [p, h, R(3, h.uuid, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] })];
  const dir = dirCom({ 'proj/A.jsonl': a, 'proj/B.jsonl': b });
  const fs_ = listarTranscripts(dir);
  const ab = await medir(fs_); const ba = await medir([...fs_].reverse());
  for (const r of [ab, ba]) {
    assert.equal(r.aderencia.prompts_humanos, 1);
    assert.equal(r.aderencia.categorias.seguiu, 1);
  }
});

test('A6: invólucro de hook colado no MEIO do prompt não conta como hint', async () => {
  const meio = { ...P(0, `analisa este exemplo: <user-prompt-submit-hook>${hint('T1', 'cheap-triage')}</user-prompt-submit-hook> e diz-me`), parentUuid: undefined };
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [meio, R(1, undefined, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] })] }));
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.equal(r.aderencia.prompts_com_hint, 0);
});

test('A7: mencionar router-execute não é executá-lo', async () => {
  for (const c of ['echo router-execute.js', '# node router-execute.js', 'cat ~/.claude/tools/router/router-execute.js', 'grep -n pin router-execute.js'])
    assert.equal(invocaRouterExecute(c), false, c);
  for (const c of ['node ~/.claude/tools/router/router-execute.js \\\n  --pin-model=x', 'node "C:/x/router-execute.js" --pin-provider=ollama', 'cd x && node C:\\x\\router-execute.js --a'])
    assert.equal(invocaRouterExecute(c), true, c);
  const p = P(0, 'x'); const h = H(1, p.uuid, hint('T0', 'local-transformer') + '\n<pinned-local-execution model="q">x</pinned-local-execution>');
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p, h, R(2, h.uuid, { tools: [{ name: 'Bash', input: { command: 'echo router-execute.js' } }] })] }));
  assert.equal(r.aderencia.categorias.ignorou, 1);
  assert.equal(r.aderencia.pinned_local.executou_router_execute, 0);
});

test('A8/A9: o tier declarado no pedido (Agent.model, mooter_work) conta', () => {
  const d = (tools) => delegacoesDe(R(0, null, { tools }));
  const gp = { hint: { tier: 'T2', sub: 'model-reasoner' }, hostModel: 'claude-opus-5-5', delegs: d([{ name: 'Agent', input: { subagent_type: 'general-purpose', model: 'sonnet' } }]) };
  assert.equal(classificarTurno(gp).cat, 'seguiu');
  const moo = { hint: { tier: 'T0', sub: 'local-summarizer' }, hostModel: 'claude-opus-5-5', delegs: d([{ name: 'mcp__mooter__mooter_work', input: { goal: 'x', agent: 'moo' } }]) };
  assert.equal(classificarTurno(moo).cat, 'seguiu');
  const haiku = { hint: { tier: 'T1', sub: 'cheap-triage' }, hostModel: 'claude-opus-5-5', delegs: d([{ name: 'mcp__mooter__mooter_work', input: { goal: 'x', model: 'claude-haiku-4-5' } }]) };
  assert.equal(classificarTurno(haiku).cat, 'seguiu');
  const codex = { hint: { tier: 'T1', sub: 'cheap-triage' }, hostModel: 'claude-opus-5-5', delegs: d([{ name: 'mcp__mooter__mooter_work', input: { goal: 'x', agent: 'codex' } }]) };
  assert.equal(classificarTurno(codex).cat, 'delegou_outro');
});

// ── (b) dedup de tokens ───────────────────────────────────────────────────────────────────────
test('A10/A11: requestId em falta numa linha, ou message.id em falta, não duplica o pedido', async () => {
  const p = P(0, 'x');
  const u = (o) => ({ input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: o });
  const dir = dirCom({ 'proj/S.jsonl': [p,
    R(1, p.uuid, { id: 'msgA', req: null, usage: u(8) }), R(2, p.uuid, { id: 'msgA', req: 'reqA', usage: u(10) }),
    R(3, p.uuid, { id: null, req: 'reqB', usage: u(8) }), R(4, p.uuid, { id: null, req: 'reqB', usage: u(10) }),
  ] });
  const r = await medirDir(dir);
  assert.equal(r.tokens.total.pedidos, 2);
  assert.equal(r.tokens.total.output, 20);
});

test('A12: o mesmo pedido em sidechain antigo e em ficheiro de subagente fica na execução tipada', async () => {
  const p = P(0, 'x');
  const usage = { input_tokens: 5, cache_creation_input_tokens: 700, cache_read_input_tokens: 0, output_tokens: 3 };
  const lado = R(1, p.uuid, { id: 'msgS', req: 'reqS', model: 'claude-haiku-4-5', usage, extra: { isSidechain: true } });
  const dir = dirCom({ 'proj/S.jsonl': [p, lado], 'proj/S/subagents/agent-z.jsonl': [{ ...lado, agentId: 'z' }] });
  fs.writeFileSync(path.join(dir, 'proj/S/subagents/agent-z.meta.json'), JSON.stringify({ agentType: 'cheap-triage' }));
  const r = await medirDir(dir);
  assert.equal(r.tokens.total.pedidos, 1);
  assert.equal(r.tokens.subagentes.pedidos, 1);
  assert.equal(r.delegacao.execucoes, 1);
  assert.deepEqual(Object.keys(r.delegacao.por_tipo), ['cheap-triage']);
  assert.equal(r.delegacao.por_tipo['cheap-triage'].escrita_cache_1o_pedido.p50, 700);
});

// ── (c) privacidade ───────────────────────────────────────────────────────────────────────────
const CAMINHO = 'C:\\Users\\Fulano\\projecto-secreto';
const FRASE = 'SEGREDO frase do prompt';

test('A13: campos livres (modelo, versão, agentType, cost-state) não levam caminhos nem frases', async () => {
  const p = P(0, 'x', { version: CAMINHO });
  const dir = dirCom({
    'proj/S.jsonl': [p, R(1, p.uuid, { model: FRASE }), { type: 'cost-state', sessionId: 'S', modelUsage: { [CAMINHO]: { inputTokens: 1 } } }],
    'proj/S/subagents/agent-q.jsonl': [{ ...R(2, null, { model: 'claude-haiku-4-5' }), isSidechain: true }],
  });
  fs.writeFileSync(path.join(dir, 'proj/S/subagents/agent-q.meta.json'), JSON.stringify({ agentType: FRASE }));
  const r = await medirDir(dir);
  const s = JSON.stringify(r) + resumoMarkdown(r, 't');
  for (const m of [CAMINHO, JSON.stringify(CAMINHO).slice(1, -1), FRASE, 'Fulano', 'SEGREDO']) assert.ok(!s.includes(m), m);
});

test('A14: a sonda não exporta nomes de tool, anexos nem chaves com caminhos ou frases', async () => {
  const p = P(0, 'x', { [FRASE]: 1 });
  const dir = dirCom({ 'proj/S.jsonl': [p, { type: 'attachment', uuid: 'at', attachment: { type: 'hook ' + FRASE } }, R(1, p.uuid, { tools: [{ name: CAMINHO, input: {} }] })] });
  const s = JSON.stringify(await sondar(listarTranscripts(dir)));
  for (const m of ['Fulano', 'SEGREDO']) assert.ok(!s.includes(m), m);
});

test('A15: o receptor só grava atributos da allowlist — nada de texto, cwd, comando ou email', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA15-'));
  const { servidor } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const corpo = { resourceLogs: [{ resource: { attributes: [...kv({ 'user.email': 'fulano@x.pt', 'service.name': 'claude-code' }), { key: 'user', value: { kvlistValue: { values: kv({ 'user.email': 'fulano@x.pt' }) } } }] },
    scopeLogs: [{ logRecords: [{ body: { stringValue: FRASE }, attributes: kv({ 'event.name': 'api_request', model: 'claude-opus-5-5', cwd: CAMINHO, gitBranch: 'feat/SEGREDO', 'process.command_line': 'node SEGREDO', prompt: FRASE, tool_name: CAMINHO }) }] }] }] };
  const res = await fetch(`http://127.0.0.1:${servidor.address().port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  servidor.close();
  assert.equal(res.status, 200);
  const gravado = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  for (const m of ['fulano@x.pt', 'SEGREDO', 'Fulano', 'projecto-secreto']) assert.ok(!gravado.includes(m), m);
  assert.ok(gravado.includes('claude-opus-5-5') && gravado.includes('api_request'), 'o que a allowlist permite fica');
});

test('A16: o agregador OTel não publica dimensões com caminhos ou frases', () => {
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const logs = agregarLogs([{ resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: kv({ 'event.name': 'api_request', model: CAMINHO, query_source: FRASE }) }] }] }] }]);
  const met = agregarMetricas([{ resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [{ attributes: kv({ type: 'input', model: 'm', 'agent.name': FRASE }), asInt: '1' }] } }] }] }] }]);
  const s = JSON.stringify(logs) + JSON.stringify(met);
  for (const m of ['Fulano', 'SEGREDO']) assert.ok(!s.includes(m), m);
});

test('A17: receptor e agregador não imprimem caminhos nem stack', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA17-'));
  // --dir a apontar para um ficheiro: mkdir falha
  const ficheiro = path.join(tmp, 'sou-um-ficheiro'); fs.writeFileSync(ficheiro, 'x');
  const r1 = spawnSync(process.execPath, [path.join(AQUI, '..', 'otel-receptor.mjs'), '--porta', '0', '--dir', ficheiro], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(r1.status, 0);
  assert.ok(!(r1.stderr + r1.stdout).includes(tmp) && !/\n\s+at /.test(r1.stderr), 'sem caminho nem stack');
  // arranque normal: stdout sem o dir
  const dirOk = path.join(tmp, 'otel');
  const filho = spawn(process.execPath, [path.join(AQUI, '..', 'otel-receptor.mjs'), '--porta', '0', '--dir', dirOk]);
  const linha = await new Promise((res) => { let b = ''; filho.stdout.on('data', (c) => { b += c; if (b.includes('\n')) res(b); }); setTimeout(() => res(b), 5000); });
  filho.kill();
  assert.match(linha, /receptor OTel/);
  assert.ok(!linha.includes(tmp));
  // agregador com resourceLogs que não é lista
  const agdir = path.join(tmp, 'ag'); fs.mkdirSync(agdir);
  fs.writeFileSync(path.join(agdir, 'logs-2026-09-26.jsonl'), JSON.stringify({ corpo: { resourceLogs: {} } }) + '\n');
  const r2 = spawnSync(process.execPath, [path.join(AQUI, '..', 'otel-agregar.mjs'), '--dir', agdir], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r2.status, 0);
  assert.ok(!/\n\s+at /.test(r2.stderr));
});

// ── (d) receptor OTel ─────────────────────────────────────────────────────────────────────────
function pedido(port, { method = 'POST', rota = '/v1/logs', headers = {}, body = '{}' } = {}) {
  return new Promise((res, rej) => {
    const q = http.request({ host: '127.0.0.1', port, method, path: rota, headers: { 'content-type': 'application/json', ...headers } }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); });
    q.on('error', rej); q.end(method === 'GET' ? undefined : body);
  });
}

test('A18/A19: Host que não é loopback e Origin presente (mesmo vazio) são recusados, /health incluído', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA18-'));
  const { servidor, estado } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  assert.equal(await pedido(port, { headers: { host: 'atacante.example' } }), 403);
  assert.equal(await pedido(port, { method: 'GET', rota: '/health', headers: { host: 'atacante.example:' + port } }), 403);
  assert.equal(await pedido(port, { method: 'GET', rota: '/health', headers: { origin: 'https://mau.example' } }), 403);
  assert.equal(await pedido(port, { headers: { origin: '' } }), 403);
  assert.equal(await pedido(port, { headers: { host: 'localhost:' + port } }), 200);
  assert.equal(await pedido(port, { method: 'GET', rota: '/health' }), 200);
  servidor.close();
  assert.equal(estado.recusados_host, 2);
  assert.equal(estado.recusados_origem, 2);
  assert.equal(estado.recebidos.logs, 1);
});

test('A20: JSON muito aninhado não derruba o receptor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA20-'));
  const { servidor } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  const fundo = 100_000;
  const corpo = '{"resourceLogs":[' + '['.repeat(fundo) + ']'.repeat(fundo) + '],"x":' + '{"a":'.repeat(fundo) + '1' + '}'.repeat(fundo) + '}';
  const st = await pedido(port, { body: corpo });
  assert.ok(st === 200 || st === 400, String(st));
  assert.equal(await pedido(port, { method: 'GET', rota: '/health' }), 200, 'continua vivo');
  servidor.close();
});

test('A21: o ficheiro do dia nunca passa o tecto em bytes; texto não-ASCII nem chega ao disco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA21-'));
  const agora = () => new Date('2026-09-26T12:00:00.000Z');
  // desde a r1b só passam valores ASCII de um token: o '€' é descartado antes de medir o tecto
  const multibyte = { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: [{ key: 'model', value: { stringValue: '€'.repeat(150) } }] }] }] }] };
  assert.ok(!JSON.stringify(sanear(multibyte, 'logs').corpo).includes('€')); // sai como «outro» (desde a r1d)
  const payload = { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: [{ key: 'model', value: { stringValue: 'claude-opus-5-5' } }] }] }] }] };
  const linha = JSON.stringify({ recebido_em: agora().toISOString(), corpo: sanear(payload, 'logs').corpo }) + '\n';
  const tecto = Buffer.byteLength(linha) * 3 + 10; // cabem exactamente 3
  const { servidor, estado } = criarReceptor({ dir, agora, tectoBytesDia: tecto });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  for (let i = 0; i < 5; i++) assert.equal(await pedido(servidor.address().port, { body: JSON.stringify(payload) }), 200);
  servidor.close();
  const [f] = fs.readdirSync(dir);
  assert.ok(fs.statSync(path.join(dir, f)).size <= tecto);
  assert.equal(estado.recebidos.logs, 3);
  assert.equal(estado.rejeitados_tecto, 2);
});
