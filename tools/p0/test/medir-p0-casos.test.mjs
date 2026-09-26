// Casos levantados pela revisão adversária de 26/09 (resume, hints falsos, hook lento, compactação, plugins).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { medir, listarTranscripts } from '../medir-p0.mjs';

const hint = (tier, sub) => `<router-hint>\ntier: ${tier}\nsuggested_subagent: ${sub}\nconfidence: 0.8\n</router-hint>`;
const T = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
let n = 0;
const P = (s, text, extra = {}) => { const uuid = 'p' + n++; return { type: 'user', uuid, parentUuid: extra.parent || null, sessionId: 'S', timestamp: T(s), isSidechain: false, message: { content: text }, ...extra }; };
const A = (s, parent, text, tipo = 'hook_additional_context', evento = 'UserPromptSubmit') => ({ type: 'attachment', uuid: 'a' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, attachment: { type: tipo, hookEvent: evento, content: [text] } });
const R = (s, { model = 'claude-opus-5-5', tools = [] } = {}) => ({ type: 'assistant', uuid: 'r' + n++, sessionId: 'S', timestamp: T(s), isSidechain: false, requestId: 'q' + n, message: { id: 'm' + n, model, content: tools.map((t) => ({ type: 'tool_use', name: t.name, input: t.input })), usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
function dirCom(ficheiros) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0c-'));
  for (const [rel, linhas] of Object.entries(ficheiros)) {
    const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, linhas.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  }
  return dir;
}

test('sessão copiada (resume/fork) não conta prompts nem delegações duas vezes', async () => {
  const p = P(0, 'x'); const linhas = [p, A(1, p.uuid, hint('T1', 'cheap-triage')), R(2, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] })];
  const dir = dirCom({ 'proj/S.jsonl': linhas, 'proj/S-fork.jsonl': linhas });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.equal(r.aderencia.categorias.seguiu, 1);
  assert.equal(r.fonte.turnos_duplicados_ignorados, 1);
  assert.equal(r.tokens.total.pedidos, 1);
});

test('hint colado pelo utilizador ou num ficheiro editado NÃO conta', async () => {
  const p1 = P(0, 'olha isto:\n' + hint('T0', 'local-summarizer'));
  const p2 = P(10, 'edita o router');
  const dir = dirCom({ 'proj/S.jsonl': [p1, R(1, { model: 'claude-sonnet-4-6' }), p2, A(11, p2.uuid, hint('T0', 'local-summarizer'), 'edited_text_file', ''), R(12, { model: 'claude-sonnet-4-6' })] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.prompts_humanos, 2);
  assert.equal(r.aderencia.prompts_com_hint, 0);
});

test('hook lento (35 s) fica no SEU prompt pela cadeia parentUuid, não no seguinte', async () => {
  const p1 = P(0, 'primeiro');
  const a1 = A(35, p1.uuid, hint('T0', 'local-summarizer'));
  const p2 = P(50, 'segundo');
  const dir = dirCom({ 'proj/S.jsonl': [p1, a1, R(36, { model: 'claude-sonnet-4-6', tools: [{ name: 'Task', input: { subagent_type: 'local-summarizer' } }] }), p2, R(51, {})] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.prompts_com_hint, 1);
  assert.equal(r.aderencia.categorias.seguiu, 1);
  assert.equal(r.aderencia.categorias.ignorou, 0);
});

test('hint pendente nunca atravessa uma resposta', async () => {
  const p1 = P(0, 'um'); const p2 = P(20, 'dois');
  const orfao = { ...A(10, null, hint('T0', 'local-summarizer')), parentUuid: 'desconhecido' };
  const dir = dirCom({ 'proj/S.jsonl': [p1, R(1, {}), orfao, R(15, {}), p2, R(21, {})] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.prompts_com_hint, 0);
});

test('compactação, notificações e bash-input não abrem turno', async () => {
  const p = P(0, 'real'); const a = A(1, p.uuid, hint('T1', 'cheap-triage'));
  const comp = P(3, 'resumo da conversa', { isCompactSummary: true });
  const notif = P(4, '<task-notification>feito</task-notification>');
  const bash = P(5, '<bash-input>ls</bash-input>');
  const origem = P(6, 'x', { origin: { kind: 'task' } });
  const dir = dirCom({ 'proj/S.jsonl': [p, a, R(2, {}), comp, notif, bash, origem, R(7, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage' } }] })] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.equal(r.aderencia.categorias.seguiu, 1);
});

test('nomes de agente com prefixo de plugin e router-execute via PowerShell', async () => {
  const p1 = P(0, 'a'); const p2 = P(10, 'b');
  const dir = dirCom({ 'proj/S.jsonl': [
    p1, A(1, p1.uuid, hint('T1', 'mooter:cheap-triage')), R(2, { tools: [{ name: 'Agent', input: { subagent_type: 'mooter:cheap-triage' } }] }),
    p2, A(11, p2.uuid, hint('T0', 'local-transformer')), R(12, { model: 'claude-sonnet-4-6', tools: [{ name: 'PowerShell', input: { command: 'node C:\\x\\router-execute.js --pin-model=q' } }] }),
  ] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.aderencia.categorias.seguiu, 2);
  assert.equal(r.aderencia.seguiu_subagente_exacto, 1);
});

test('ficheiro ilegível não aborta a corrida e não imprime caminho', async () => {
  const p = P(0, 'x');
  const dir = dirCom({ 'proj/S.jsonl': [p, R(1, {})] });
  const fantasma = { ficheiro: path.join(dir, 'proj', 'nao-existe.jsonl'), projecto: 'proj', subagente: false };
  const r = await medir([...listarTranscripts(dir), fantasma]);
  assert.equal(r.fonte.ilegiveis, 1);
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.ok(!JSON.stringify(r).includes(dir));
});

test('cost-state entra no cross-check (último por sessão)', async () => {
  const p = P(0, 'x');
  const cs = (inp) => ({ type: 'cost-state', sessionId: 'S', modelUsage: { 'claude-haiku-4-5': { inputTokens: inp, outputTokens: 1 } } });
  const dir = dirCom({ 'proj/S.jsonl': [p, R(1, {}), cs(10), cs(900)] });
  const r = await medir(listarTranscripts(dir));
  assert.equal(r.cross_check_cost_state.por_modelo['claude-haiku-4-5'].input, 900);
});
