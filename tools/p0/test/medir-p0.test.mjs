// Testes do medir-p0.mjs — node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { medir, listarTranscripts, parseRouterHint, isHumanPrompt, modelToTier, classificarTurno, resumoMarkdown, sondar } from '../medir-p0.mjs';

const SEGREDO = 'SEGREDO-PROMPT-NAO-PODE-SAIR';

function hintTxt({ tier, sub, conf = 0.8 }) {
  return ['<router-hint>', 'task_category: x', 'risk_level: low', `tier: ${tier}`, 'recommended_backend: anthropic', 'recommended_model: m', `suggested_subagent: ${sub}`, `confidence: ${conf}`, '', 'Routing policy: see ~/.claude/docs/ROUTING_POLICY.md', '</router-hint>'].join('\n');
}
let seq = 0;
const ts = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
const user = (s, text, extra = {}) => ({ type: 'user', sessionId: 'S1', version: '2.1.224', timestamp: ts(s), uuid: 'u' + seq++, isSidechain: false, message: { role: 'user', content: text }, ...extra });
const att = (s, text) => ({ type: 'attachment', sessionId: 'S1', timestamp: ts(s), uuid: 'a' + seq++, isSidechain: false, attachment: { type: 'hook_additional_context', content: [text], hookName: 'UserPromptSubmit' } });
const asst = (s, { model = 'claude-opus-4-6', id = 'm' + seq, req = 'r' + seq, tools = [], usage, side = false } = {}) => ({
  type: 'assistant', sessionId: 'S1', timestamp: ts(s), uuid: 'x' + seq++, isSidechain: side, requestId: req,
  message: { id, model, role: 'assistant', content: [{ type: 'text', text: 'ok' }, ...tools.map((t) => ({ type: 'tool_use', id: 't' + seq, name: t.name, input: t.input }))], usage: usage || { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 } } },
});
const toolResult = (s, text) => ({ type: 'user', sessionId: 'S1', timestamp: ts(s), uuid: 'tr' + seq++, isSidechain: false, toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: text }] } });

function escrever(dir, rel, linhas) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return f;
}

function montarFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-'));
  const proj = 'C--Users-Paulo-frugal';
  const main = [
    // 1) T1 cheap-triage, host opus, delegou cheap-triage → seguiu (exacto)
    user(0, `${SEGREDO} resume isto`), att(1, hintTxt({ tier: 'T1', sub: 'cheap-triage' })),
    asst(2, { tools: [{ name: 'Agent', input: { subagent_type: 'cheap-triage', prompt: SEGREDO } }] }),
    // duplicado do mesmo pedido (streaming por blocos) → tokens contados 1×
    asst(2, { id: 'm-dup', req: 'r-dup' }), asst(2, { id: 'm-dup', req: 'r-dup' }),
    // 2) T3 model-architect, host opus, sem delegação → ja_no_tier
    user(10, 'refactor crítico'), att(11, hintTxt({ tier: 'T3', sub: 'model-architect' })), asst(12, {}),
    // 3) T0 local-summarizer, host sonnet, sem delegação → ignorou
    user(20, 'resume ficheiro'), att(21, hintTxt({ tier: 'T0', sub: 'local-summarizer' })), asst(22, { model: 'claude-sonnet-4-6' }),
    // 4) T2 model-reasoner, host opus, delegou general-purpose → delegou_outro
    user(30, 'investiga bug'), att(31, hintTxt({ tier: 'T2', sub: 'model-reasoner' })), asst(32, { tools: [{ name: 'Task', input: { subagent_type: 'general-purpose' } }] }),
    // 5) tool_result com código-fonte do hint (template) → NÃO é hint nem prompt
    toolResult(33, "'<router-hint>',\n`tier: ${decision.tier}`,\n`suggested_subagent: ${decision.suggested_subagent}`,\n'</router-hint>'"),
    // 6) prompt sem hint (abaixo do gate)
    user(40, 'olá'), asst(41, {}),
    // 7) pin local: router-execute via Bash → seguiu
    user(50, 'usa o local'), att(51, hintTxt({ tier: 'T0', sub: 'local-transformer' }) + '\n<pinned-local-execution model="qwen2.5:14b">x</pinned-local-execution>'),
    asst(52, { tools: [{ name: 'Bash', input: { command: 'node "C:/x/router-execute.js" --pin-provider=ollama' } }] }),
    // lembrete de sistema isolado → não é prompt
    user(55, '<system-reminder>nada</system-reminder>'),
  ];
  escrever(dir, `${proj}/S1.jsonl`, main);
  // subagente formato novo: ficheiro + meta
  const sub = [
    asst(3, { model: 'claude-haiku-4-5', id: 'sa1', req: 'sr1', usage: { input_tokens: 5, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 10 } }),
    asst(4, { model: 'claude-haiku-4-5', id: 'sa2', req: 'sr2', usage: { input_tokens: 3, cache_creation_input_tokens: 500, cache_read_input_tokens: 20000, output_tokens: 200 } }),
  ].map((l) => ({ ...l, isSidechain: true, agentId: 'abc' }));
  const fsub = escrever(dir, `${proj}/S1/subagents/agent-abc.jsonl`, sub);
  fs.writeFileSync(fsub.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'cheap-triage', toolUseId: 't1' }));
  // formato antigo: hook dentro do texto do prompt + sidechain no ficheiro principal
  const antigo = [
    user(60, `faz x\n<user-prompt-submit-hook>${hintTxt({ tier: 'T2', sub: 'model-reasoner' })}</user-prompt-submit-hook>`, { version: '2.0.10', sessionId: 'S2' }),
    asst(61, { model: 'claude-opus-4-1', tools: [{ name: 'Task', input: { subagent_type: 'model-reasoner' } }] }),
    asst(62, { model: 'claude-sonnet-4-5', side: true, id: 'old1', req: 'o1', usage: { input_tokens: 7, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 30 } }),
    asst(63, { model: 'claude-sonnet-4-5', side: true, id: 'old2', req: 'o2' }),
    asst(64, { model: 'claude-opus-4-1', id: 'old3', req: 'o3' }),
  ];
  escrever(dir, `${proj}/S2.jsonl`, antigo);
  // projecto não-frugal
  escrever(dir, 'C--Users-Paulo-outro/S3.jsonl', [user(70, 'x'), asst(71, {})]);
  return dir;
}

test('parseRouterHint aceita hint real e rejeita código-fonte', () => {
  const h = parseRouterHint(hintTxt({ tier: 'T1', sub: 'cheap-triage', conf: 0.7 }));
  assert.equal(h.tier, 'T1'); assert.equal(h.sub, 'cheap-triage'); assert.equal(h.confidence, 0.7);
  assert.equal(parseRouterHint("'<router-hint>',\n`tier: ${decision.tier}`,\n'</router-hint>'"), null);
  assert.equal(parseRouterHint('sem hint'), null);
  assert.equal(parseRouterHint(hintTxt({ tier: 'T2', sub: 'none' })).sub, null);
});

test('modelToTier', () => {
  assert.equal(modelToTier('claude-opus-5-5'), 'T3');
  assert.equal(modelToTier('claude-fable-5-1'), 'T3');
  assert.equal(modelToTier('claude-sonnet-4-6'), 'T2');
  assert.equal(modelToTier('claude-haiku-4-5'), 'T1');
  assert.equal(modelToTier('qwen2.5-coder:14b'), 'T0');
  assert.equal(modelToTier('<synthetic>'), null);
});

test('isHumanPrompt exclui tool_result, lembretes e comandos locais', () => {
  assert.equal(isHumanPrompt(user(0, 'olá')), true);
  assert.equal(isHumanPrompt(user(0, '<system-reminder>x</system-reminder>')), false);
  assert.equal(isHumanPrompt(toolResult(0, 'x')), false);
  assert.equal(isHumanPrompt(user(0, '<local-command-stdout>x</local-command-stdout>')), false);
  assert.equal(isHumanPrompt(user(0, 'x', { turnOrigin: 'system' })), false);
  assert.equal(isHumanPrompt(user(0, 'x', { isSidechain: true })), false);
});

test('medir: aderência, tokens deduplicados e custo de delegar', async () => {
  const dir = montarFixture();
  const r = await medir(listarTranscripts(dir, { soFrugal: true }));
  const a = r.aderencia;
  assert.equal(a.prompts_humanos, 7, 'prompts humanos (6 no S1 + 1 no S2)');
  assert.equal(a.prompts_com_hint, 6);
  assert.deepEqual(a.categorias, { seguiu: 3, ja_no_tier: 1, delegou_outro: 1, ignorou: 1, sem_modelo_host: 0 });
  assert.equal(a.exigiam_accao, 5);
  assert.equal(a.aderencia_pct, 60);
  assert.equal(a.seguiu_subagente_exacto, 2);
  assert.equal(a.pinned_local.n, 1); assert.equal(a.pinned_local.executou_router_execute, 1);
  // tokens: m-dup contado 1×
  const pedidosMain = r.tokens.conversa_principal.pedidos;
  const pedidosSub = r.tokens.subagentes.pedidos;
  assert.equal(pedidosSub, 4, '2 do ficheiro de subagente + 2 sidechain antigos');
  assert.equal(r.tokens.total.pedidos, pedidosMain + pedidosSub);
  assert.equal(pedidosMain, 9, '7 no S1 (m-dup 1×) + 2 no S2');
  // delegação
  assert.equal(r.delegacao.execucoes, 2);
  assert.equal(r.delegacao.por_tipo['cheap-triage'].contexto_1o_pedido.p50, 20005);
  assert.equal(r.delegacao.por_tipo['cheap-triage'].escrita_cache_1o_pedido.p50, 20000);
  assert.equal(r.delegacao.por_tipo['n/d'].contexto_1o_pedido.p50, 9007);
  assert.ok(r.fonte.versoes_cc['2.1.224'] > 0 && r.fonte.versoes_cc['2.0.10'] > 0);
});

test('privacidade: nenhum texto de prompt sai no relatório nem no markdown', async () => {
  const dir = montarFixture();
  const r = await medir(listarTranscripts(dir, {}));
  const s = JSON.stringify(r) + resumoMarkdown(r, 't');
  assert.ok(!s.includes(SEGREDO));
  assert.ok(!s.includes('Paulo'), 'nomes de projecto/caminhos não saem');
  assert.ok(!/"S1"|"S2"/.test(s), 'sessionId cru não sai');
});

test('janela --desde/--ate filtra prompts e tokens', async () => {
  const dir = montarFixture();
  const desdeMs = Date.parse(ts(45));
  const r = await medir(listarTranscripts(dir, { soFrugal: true }), { desdeMs });
  assert.equal(r.aderencia.prompts_humanos, 2);
  assert.equal(r.aderencia.categorias.seguiu, 2);
});

test('classificarTurno: host sem modelo', () => {
  const c = classificarTurno({ hint: { tier: 'T2', sub: 'model-reasoner' }, hostModel: null, delegs: [] });
  assert.equal(c.cat, 'sem_modelo_host');
});

test('sonda devolve só formas, sem valores', async () => {
  const dir = montarFixture();
  const s = await sondar(listarTranscripts(dir, {}));
  const txt = JSON.stringify(s);
  assert.ok(!txt.includes(SEGREDO));
  assert.ok(s.hint_aceite_em['attachment:hook_additional_context'] >= 5);
  assert.ok(s.hint_aceite_em['user:texto'] >= 1);
});

test('usage que cresce entre linhas do mesmo pedido: conta o máximo, 1 pedido', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0g-'));
  const base = { input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 };
  escrever(dir, 'frugal/S9.jsonl', [
    user(0, 'x'),
    asst(1, { id: 'g1', req: 'rg1', usage: { ...base, output_tokens: 8 } }),
    asst(1, { id: 'g1', req: 'rg1', usage: { ...base, output_tokens: 8 } }),
    asst(2, { id: 'g1', req: 'rg1', usage: { ...base, output_tokens: 777 } }),
  ]);
  const r = await medir(listarTranscripts(dir, {}));
  assert.equal(r.tokens.total.pedidos, 1);
  assert.equal(r.tokens.total.output, 777);
  assert.equal(r.tokens.total.cache_creation, 100);
});
