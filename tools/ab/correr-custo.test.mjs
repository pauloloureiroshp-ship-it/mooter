// correr-custo.test.mjs — o controlador do «Teste besta custo», sem modelo, sem Ollama, sem rede.
//
// O que se prova aqui é o que a análise congelada exige do ledger (as 63
// interpretações) — cada teste é um ponto do brief com o número. A costura é a
// mesma do R-24: `spawnImpl` injectado, ficheiros em directórios temporários.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  parseSumarioNodeTest, listagemSha, tectoDoOrcamento, encontrarTranscript, tokensDoTranscript, parseJsonDoCli,
  Ledger, linhaVazia, correrAceitacaoComProva, decidirAceite, argsClaudeP, correrClaudeP, correrLocal, classificar,
  construirContexto, carregarProtocolo, tarefaCompleta, ollamaHost, MODELO_OPUS, SENTINELA_CONTEUDO,
  correrTarefa, tentativaClaudeP, ollamaTagsComRetry, matarArvore, modeloLocalDoPrereg, MODELO_LOCAL_DEFAULT, correr, sondar, caminhoDoSentinela, SO_MAXIMO, verificar,
} from './correr-custo.mjs';
import { CHAVES_OBRIGATORIAS, TIPOS_OBRIGATORIOS, violacoesDeTipo, SUPLENTES_ESPERADOS, analisar, lerLedger, TRANSCRIPT_MINIMO } from './custo-analise.mjs';
import { relogio, anterioridadeDaEmenda } from './correr-custo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const criados = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'correr-custo-')); criados.push(d); return d; };
process.on('exit', () => { for (const d of criados) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 172: best-effort */ } } });

// ── o sumário do node --test (91, 82) ──────────────────────────────────────

test('parseSumarioNodeTest: spec (ℹ) e tap (#), o ULTIMO bloco, tests = total, skips = skipped + todo', () => {
  const spec = 'ℹ tests 55\nℹ suites 0\nℹ pass 54\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 12\n';
  assert.deepEqual(parseSumarioNodeTest(spec), { tests_corridos: 55, tests_passados: 54, fail: 1, cancelled: 0, skips: 0 });
  const tap = '# tests 19\n# suites 0\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 15\n# todo 0\n';
  assert.deepEqual(parseSumarioNodeTest(tap), { tests_corridos: 19, tests_passados: 4, fail: 0, cancelled: 0, skips: 15 });
  // dois blocos (um teste que lanca node --test por dentro): fica o ultimo
  assert.equal(parseSumarioNodeTest('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n...\nℹ tests 10\nℹ pass 9\nℹ fail 1\nℹ cancelled 0\nℹ skipped 1\nℹ todo 2\n').tests_corridos, 10);
  assert.equal(parseSumarioNodeTest('ℹ tests 10\nℹ pass 9\nℹ skipped 1\nℹ todo 2\n').skips, 3);
  // sem sumario (runner morto) -> null; e `tests_corridos` NUNCA e pass + fail
  assert.equal(parseSumarioNodeTest('node:internal/modules ... Error: Cannot find module'), null);
  assert.equal(parseSumarioNodeTest(''), null);
  assert.equal(parseSumarioNodeTest('ℹ pass 3\nℹ fail 1\n'), null, 'sem a linha tests nao ha total');
});

// ── a listagem do worktree (10.º/7) ─────────────────────────────────────────

test('listagemSha: caminhos + tamanho, ordenados, sem node_modules; muda com ficheiro novo e com tamanho, nao com mtime', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'a', 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'a', 'f.js'), 'abc');
  fs.writeFileSync(path.join(d, 'a', 'node_modules', 'x', 'y.js'), 'ignorado');
  const s1 = listagemSha(d);
  fs.utimesSync(path.join(d, 'a', 'f.js'), new Date(0), new Date(0));
  assert.equal(listagemSha(d), s1, 'mtime nao entra');
  fs.writeFileSync(path.join(d, 'a', 'node_modules', 'x', 'z.js'), 'tambem ignorado');
  assert.equal(listagemSha(d), s1, 'node_modules nao entra');
  fs.writeFileSync(path.join(d, 'a', 'f.js'), 'abcd');
  const s2 = listagemSha(d);
  assert.notEqual(s2, s1, 'tamanho entra');
  fs.writeFileSync(path.join(d, 'novo.txt'), '');
  assert.notEqual(listagemSha(d), s2, 'ficheiro novo entra');
  assert.match(s1, /^[0-9a-f]{64}$/);
});

// ── tecto do orcamento e sentinela ──────────────────────────────────────────

test('tectoDoOrcamento: five_hour.utilization do cache; erro/ausente/ilegivel -> «null=sem tecto» (nunca 0)', () => {
  const d = tmp();
  assert.equal(tectoDoOrcamento(d), 'null=sem tecto');
  fs.writeFileSync(path.join(d, '.budget-cache.json'), JSON.stringify({ ts: 1, data: { five_hour: { utilization: 4 }, seven_day: { utilization: 17 } } }));
  assert.equal(tectoDoOrcamento(d), 4);
  fs.writeFileSync(path.join(d, '.budget-cache.json'), JSON.stringify({ ts: 1, data: { type: 'error' } }));
  assert.equal(tectoDoOrcamento(d), 'null=sem tecto');
  fs.writeFileSync(path.join(d, '.budget-cache.json'), '{ nao e json');
  assert.equal(tectoDoOrcamento(d), 'null=sem tecto');
  fs.writeFileSync(path.join(d, '.budget-cache.json'), JSON.stringify({ ts: 1, data: { five_hour: { utilization: 0 } } }));
  assert.equal(tectoDoOrcamento(d), 0, '0 e um numero, nao «sem tecto»');
});

// ── transcript (98, 99, 103) ────────────────────────────────────────────────

test('encontrarTranscript + tokensDoTranscript: só o ficheiro do session_id, só registos Opus, as 4 categorias; 0 quando não há', () => {
  const home = tmp();
  const sid = crypto.randomUUID();
  const dir = path.join(home, '.claude', 'projects', 'C--x-y');
  fs.mkdirSync(dir, { recursive: true });
  // a forma REAL do Claude Code: uma linha por bloco de conteudo (thinking + text) da MESMA resposta, com o mesmo message.id e o mesmo usage completo — conta UMA vez (3.º revisor do controlador; medido 1,75x em transcripts reais)
  const u1 = { input_tokens: 2, output_tokens: 4, cache_creation_input_tokens: 58964, cache_read_input_tokens: 0 };
  const u3 = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 58964 };
  const linhas = [
    JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'x' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', requestId: 'req_1', message: { id: 'msg_01A', model: 'claude-opus-5', content: [{ type: 'thinking', thinking: '…' }], usage: u1 } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1b', parentUuid: 'a1', requestId: 'req_1', message: { id: 'msg_01A', model: 'claude-opus-5', content: [{ type: 'text', text: 'ok' }], usage: u1 } }),
    JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'a1b', requestId: 'req_2', message: { id: 'msg_01B', model: 'claude-haiku-4-5', usage: { input_tokens: 1000, output_tokens: 10 } } }),
    JSON.stringify({ type: 'assistant', uuid: 'a3', parentUuid: 'a2', requestId: 'req_3', message: { id: 'msg_01C', model: 'claude-opus-5', content: [{ type: 'text', text: 'a' }], usage: u3 } }),
    JSON.stringify({ type: 'assistant', uuid: 'a3b', parentUuid: 'a3', requestId: 'req_3', message: { id: 'msg_01C', model: 'claude-opus-5', content: [{ type: 'tool_use', name: 'Bash' }], usage: u3 } }),
    JSON.stringify({ type: 'assistant', uuid: 'a4', parentUuid: 'a3b', message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),   // sem id nem requestId: conta pelo uuid
    '{ truncada',
  ];
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), linhas.join('\n') + '\n');
  const p = encontrarTranscript(sid, home);
  assert.equal(p, path.join(dir, `${sid}.jsonl`));
  const t = tokensDoTranscript(p);
  assert.equal(t.total, 2 + 4 + 58964 + 10 + 20 + 58964 + 2, 'cada resposta uma vez; somar linhas daria o dobro');
  assert.equal(t.registos, 6); assert.equal(t.registos_opus, 5); assert.equal(t.respostas_opus, 3); assert.equal(t.linhas_repetidas, 2); assert.equal(t.linhas_ilegiveis, 1);
  assert.equal(encontrarTranscript(crypto.randomUUID(), home), null, 'nao encontrado -> null (o chamador escreve tokens_transcript 0)');
  assert.equal(encontrarTranscript('nao-e-uuid', home), null);
  assert.equal(tokensDoTranscript(path.join(home, 'nao-existe.jsonl')), null);
});

test('tokensDoTranscript: a 1.ª linha de uma resposta traz o output em streaming — vence o máximo por campo, não a 1.ª (final-reviewer do #509)', () => {
  // A forma REAL de um subagente (trio de `agent-a1e48c918b5d5a121.jsonl` desta máquina a 2026-09-12, conteúdo retirado): o mesmo message.id em 3 linhas, output_tokens 7 / 7 / 275 — só a última tem o total; input e cache iguais nas três
  const d = tmp();
  const f = path.join(d, 'agent-x.jsonl');
  const u = (out) => ({ input_tokens: 2, cache_creation_input_tokens: 40901, cache_read_input_tokens: 0, output_tokens: out, cache_creation: { ephemeral_5m_input_tokens: 40901, ephemeral_1h_input_tokens: 0 } });
  const linha = (uuid, parentUuid, bloco, i, out) => JSON.stringify({ type: 'assistant', uuid, parentUuid, apiBlockIndex: i, requestId: 'req_011CeyNBcmQ4LQNEeYjV52j8', message: { id: 'msg_011CeyNBdYGzvuwZh8FzuzVP', model: 'claude-opus-5', content: [{ type: bloco }], usage: u(out) } });
  fs.writeFileSync(f, [
    JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'x' } }),
    linha('a1', 'u1', 'thinking', 0, 7),
    linha('a2', 'a1', 'text', 1, 7),
    linha('a3', 'a2', 'tool_use', 2, 275),
  ].join('\n') + '\n');
  const t = tokensDoTranscript(f);
  assert.equal(t.respostas_opus, 1); assert.equal(t.linhas_repetidas, 2);
  assert.equal(t.output, 275, 'a 1.ª linha diz 7; o total está na última');
  assert.equal(t.cache_creation, 40901, 'os campos iguais não se somam entre linhas');
  assert.equal(t.total, 2 + 275 + 40901);
});

test('parseJsonDoCli: o stdout inteiro, ou a ultima linha JSON (ruido de hooks); nunca um array', () => {
  assert.deepEqual(parseJsonDoCli('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonDoCli('ruido\n[mooter] x\n{"session_id":"s","usage":{}}\n'), { session_id: 's', usage: {} });
  assert.equal(parseJsonDoCli('[1,2]'), null);
  assert.equal(parseJsonDoCli(''), null);
  assert.equal(parseJsonDoCli('nada'), null);
});

// ── o ledger (61, 75, 76, 84, 116) ──────────────────────────────────────────

test('Ledger: append UTF-8 sem BOM, uma linha por evento; depois de paragem nada se escreve; paragem so uma vez e sempre com motivo', () => {
  const d = tmp();
  const L = new Ledger(path.join(d, 'sub', 'l.jsonl'));
  L.escrever({ evento: 'pre_voo', task_id: 't1' });
  L.escrever({ evento: 'tentativa_inicio', task_id: 't1', braco: 'A' });
  const bytes = fs.readFileSync(L.caminho);
  assert.notEqual(bytes[0], 0xef, 'sem BOM');
  assert.equal(bytes.toString('utf8').split('\n').filter(Boolean).length, 2);
  const p = L.paragem('teste', { ultima_tarefa: 't1', n: 1 });
  assert.equal(p.motivo, 'teste'); assert.ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.ts), 'ts canonico com ms (12.º/1)');
  assert.equal(L.paragem('outra'), null, 'uma so');
  assert.throws(() => L.escrever({ evento: 'tentativa_fim' }), /ledger fechado/);
  assert.equal(fs.readFileSync(L.caminho, 'utf8').split('\n').filter(Boolean).length, 3);
});

test('linhaVazia: TODAS as chaves do prereg presentes, a null (12.º/3: nunca omitir); e uma linha cheia passa o contrato de tipo da analise', () => {
  const l = linhaVazia();
  for (const k of CHAVES_OBRIGATORIAS) assert.ok(k in l && l[k] === null, k);
  assert.equal(Object.keys(l).length, CHAVES_OBRIGATORIAS.length);
  assert.deepEqual(violacoesDeTipo({ ...l, ts_inicio: '2026-09-11T00:00:00.000Z', ts_fim: '2026-09-11T00:00:05.000Z', task_id: 't1', braco: 'A', tentativa: 1, e_escalacao: false, executor: 'claude-p', aceite: false, exit_code: -1 }), [], 'o que o controlador escreve e o que a analise le');
  for (const k of Object.keys(TIPOS_OBRIGATORIOS)) assert.ok(CHAVES_OBRIGATORIAS.includes(k), `${k} tipado mas nao obrigatorio?`);
});

// ── a aceitacao com prova (8.º/1, 9.º/4, 93) ────────────────────────────────

test('correrAceitacaoComProva: exit numerico, -1 com sinal, contagens do sumario, spawn:* como erro do ambiente; `node` e o process.execPath', () => {
  const chamadas = [];
  const spawnImpl = (exe, args, opts) => { chamadas.push({ exe, args, cwd: opts.cwd }); return { status: 1, signal: null, stdout: 'ℹ tests 10\nℹ pass 9\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n', stderr: '' }; };
  const p = correrAceitacaoComProva({ cwd: 'C:/x', comando: 'node', args: ['--test', 'a.test.js'], env: {}, spawnImpl });
  assert.equal(chamadas[0].exe, process.execPath); assert.deepEqual(chamadas[0].args, ['--test', 'a.test.js']);
  assert.equal(p.erro, null); assert.equal(p.exit_code, 1); assert.equal(p.tests_corridos, 10); assert.equal(p.tests_passados, 9); assert.equal(p.skips, 0); assert.ok(p.sumario_ok); assert.ok(Number.isFinite(p.aceitacao_duration_ms));
  const morto = correrAceitacaoComProva({ cwd: 'C:/x', comando: 'node', args: [], env: {}, spawnImpl: () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' }) });
  assert.equal(morto.exit_code, -1, '8.º/1: sentinela, nunca null'); assert.equal(morto.aceitacao_sinal, 'SIGTERM'); assert.equal(morto.tests_corridos, null); assert.equal(morto.sumario_ok, false);
  const enoent = correrAceitacaoComProva({ cwd: 'C:/x', comando: 'node', args: [], env: {}, spawnImpl: () => ({ status: null, signal: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' }) });
  assert.equal(enoent.erro, 'spawn:ENOENT', '9.º/4: o chamador para');
  // NTSTATUS assinado do Windows fica como esta (42)
  assert.equal(correrAceitacaoComProva({ cwd: 'C:/x', comando: 'node', args: [], env: {}, spawnImpl: () => ({ status: -1073741819, signal: null, stdout: '', stderr: '' }) }).exit_code, -1073741819);
});

test('decidirAceite: as 3 condicoes do prereg + skips do pre-voo; tecto estourado nunca aceita; prova em falta nunca aceita', () => {
  const ok = { erro: null, exit_code: 0, tests_corridos: 12, tests_passados: 12, skips: 0 };
  const base = { prova: ok, shaAntes: 'a', shaDepois: 'a', historico: 10, skipsBase: 0, tectoEstourado: false };
  assert.equal(decidirAceite(base), true);
  assert.equal(decidirAceite({ ...base, tectoEstourado: true }), false, 'estourar o tecto = nao aceite');
  assert.equal(decidirAceite({ ...base, shaDepois: 'b' }), false, 'test_file mudou');
  assert.equal(decidirAceite({ ...base, prova: { ...ok, exit_code: 1 } }), false);
  assert.equal(decidirAceite({ ...base, prova: { ...ok, tests_corridos: 9, tests_passados: 9 } }), false, 'abaixo do historico');
  assert.equal(decidirAceite({ ...base, prova: { ...ok, tests_passados: 9 } }), false, 'passados abaixo do historico');
  assert.equal(decidirAceite({ ...base, prova: { ...ok, skips: 1 } }), false, 'skips acima do pre-voo');
  assert.equal(decidirAceite({ ...base, skipsBase: 2, prova: { ...ok, skips: 1 } }), true, 'skips abaixo da base passa');
  assert.equal(decidirAceite({ ...base, prova: { ...ok, skips: null } }), false, 'sem skips nao se afirma');
  assert.equal(decidirAceite({ ...base, prova: null }), false);
  assert.equal(decidirAceite({ ...base, prova: { erro: 'spawn:ENOENT' } }), false);
  assert.equal(decidirAceite({ ...base, skipsBase: null }), false, 'sem base de skips (pre-voo sem sumario) nao se afirma');
});

// ── os executores (98, 8.º/3-4, 9.º/1, 12.º/4) ──────────────────────────────

test('argsClaudeP: o executor literal do prereg, mais --session-id; --disallowedTools so com a emenda', () => {
  const a = argsClaudeP('P', 'sid');
  assert.deepEqual(a, ['-p', 'P', '--output-format', 'json', '--model', 'claude-opus-5', '--permission-mode', 'bypassPermissions', '--allow-dangerously-skip-permissions', '--session-id', 'sid']);
  assert.equal(MODELO_OPUS, 'claude-opus-5');
  assert.deepEqual(argsClaudeP('P', 'sid', { semSubagentes: true }).slice(-2), ['--disallowedTools', 'Task']);
  // conferido contra o prereg REAL
  const prereg = JSON.parse(fs.readFileSync(path.join(AQUI, 'custo-prereg.json'), 'utf8'));
  assert.equal(`claude ${a.slice(0, -2).join(' ').replace(' P ', ' <prompt> ')}`, prereg.bracos.A.executor, 'o executor de A e byte a byte o do prereg (antes do --session-id)');
});

test('correrClaudeP: ts antes/depois do spawn, sinal antes de erro, envelope sempre que parseia (is_error incluido), motivo por classe', () => {
  const json = { session_id: 's1', usage: { input_tokens: 2 }, modelUsage: { 'claude-opus-5': {} }, total_cost_usd: 0.5, duration_ms: 4000, is_error: true, num_turns: 3 };
  let visto = null;
  const spawnImpl = (exe, args, opts) => { visto = { exe, args, opts }; return { status: 0, signal: null, stdout: JSON.stringify(json), stderr: '[mooter] hook' }; };
  const r = correrClaudeP({ caminhoClaude: 'C:/claude.exe', prompt: 'P', cwd: 'C:/w', sessionId: 'sid', env: { A: '1' }, tectoS: 900, spawnImpl });
  assert.equal(visto.exe, 'C:/claude.exe'); assert.equal(visto.opts.timeout, 900000); assert.equal(visto.opts.cwd, 'C:/w'); assert.deepEqual(visto.opts.env, { A: '1' }); assert.equal(visto.opts.input, '');
  assert.deepEqual(r.json, json, '9.º/1: o envelope chega mesmo com is_error'); assert.equal(r.motivo, null);
  assert.ok(Date.parse(r.ts_fim) >= Date.parse(r.ts_inicio)); assert.ok(r.parede_ms >= 0);
  const to = correrClaudeP({ caminhoClaude: 'c', prompt: 'P', cwd: 'w', sessionId: 's', env: {}, tectoS: 1, spawnImpl: () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' }) });
  assert.equal(to.motivo, 'timeout', '8.º/3: o sinal manda sobre o erro'); assert.equal(to.json, null); assert.equal(to.sinal, 'SIGTERM');
  const sp = correrClaudeP({ caminhoClaude: 'c', prompt: 'P', cwd: 'w', sessionId: 's', env: {}, tectoS: 1, spawnImpl: () => ({ status: null, signal: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' }) });
  assert.equal(sp.motivo, 'spawn:ENOENT');
  const morreu = correrClaudeP({ caminhoClaude: 'c', prompt: 'P', cwd: 'w', sessionId: 's', env: {}, tectoS: 1, spawnImpl: () => ({ status: 1, signal: null, stdout: 'nao e json', stderr: 'boom' }) });
  assert.equal(morreu.motivo, 'cli_morreu:1'); assert.equal(morreu.stderr_tail, 'boom'); assert.equal(morreu.erro, null);
  // 3.o revisor da v25: o Kill() do spawnSync nao envia sinal a um filho que ja saiu — status N + signal null + error ETIMEDOUT e o pipe herdado por um descendente a segurar a parede; nao e um spawn falhado
  const pipe = correrClaudeP({ caminhoClaude: 'c', prompt: 'P', cwd: 'w', sessionId: 's', env: {}, tectoS: 1, spawnImpl: () => ({ status: 1, signal: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: 'x' }) });
  assert.equal(pipe.motivo, 'pipe_timeout:1'); assert.equal(pipe.erro, 'ETIMEDOUT'); assert.equal(pipe.exit_status, 1); assert.equal(pipe.sinal, null);
  assert.equal(correrClaudeP({ caminhoClaude: 'c', prompt: 'P', cwd: 'w', sessionId: 's', env: {}, tectoS: 1, spawnImpl: () => ({ status: 0, signal: null, error: { code: 'ETIMEDOUT' }, stdout: JSON.stringify(json), stderr: '' }) }).motivo, null, 'com JSON o pipe segurado depois do envelope nao e motivo nenhum (o 2.o revisor do controlador)');
  assert.equal(to.erro, 'ETIMEDOUT'); assert.equal(sp.erro, 'ENOENT');
});

test('correrLocal: o executor literal do prereg (--pin-provider=ollama A SECO); --pin-model so com a emenda; texto so com ok:true; motivos por classe', () => {
  let visto = null;
  const okJson = { ok: true, text: 'resposta', model_used: 'qwen2.5:3b', tokens_in: 100, tokens_out: 42, duration_ms: 1234 };
  const r = correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, tectoS: 900, spawnImpl: (exe, args, opts) => { visto = { exe, args, opts }; return { status: 0, signal: null, stdout: JSON.stringify(okJson) + '\n', stderr: '' }; } });
  assert.equal(visto.exe, process.execPath); assert.deepEqual(visto.args, ['R', '--pin-provider=ollama', 'P'], '2.º revisor: o prereg pina o router-execute a seco — o modelo e resolvido por ele (OLLAMA_OPTION_A_MODEL || qwen2.5:3b)');
  assert.equal(r.texto, 'resposta'); assert.equal(r.motivo, null); assert.equal(r.json.tokens_out, 42);
  correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, pinModel: 'qwen2.5-coder:14b', tectoS: 900, spawnImpl: (exe, args) => { visto = { args }; return { status: 0, signal: null, stdout: JSON.stringify(okJson), stderr: '' }; } });
  assert.deepEqual(visto.args, ['R', '--pin-provider=ollama', '--pin-model=qwen2.5-coder:14b', 'P'], 'com --modelo-local (emenda) o pin e explicito');
  const semQuota = correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, tectoS: 1, spawnImpl: () => ({ status: 0, signal: null, stdout: JSON.stringify({ ok: false, error: { code: 'no_quota', message: 'ollama is not available' } }), stderr: '' }) });
  assert.equal(semQuota.texto, null); assert.match(semQuota.motivo, /^ollama:no_quota/);
  assert.equal(correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, tectoS: 1, spawnImpl: () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }) }).motivo, 'timeout');
  assert.equal(correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, tectoS: 1, spawnImpl: () => ({ status: 2, signal: null, stdout: '', stderr: '' }) }).motivo, 'router_execute_morreu:2');
  // a regra do modelo e a do providers/ollama-api.js:73
  assert.equal(MODELO_LOCAL_DEFAULT, 'qwen2.5:3b');
  assert.equal(modeloLocalDoPrereg({}), 'qwen2.5:3b'); assert.equal(modeloLocalDoPrereg({ OLLAMA_OPTION_A_MODEL: 'gemma3:12b' }), 'gemma3:12b'); assert.equal(modeloLocalDoPrereg({ OLLAMA_OPTION_A_MODEL: ' ' }), 'qwen2.5:3b'); assert.equal(modeloLocalDoPrereg({ OLLAMA_OPTION_A_MODEL: 'x' }, 'emenda:14b'), 'emenda:14b');
});

test('classificar: tier e recommended_model do JSON do classify; sem tier e falha', () => {
  const c = classificar({ classifyPath: 'C', prompt: 'P', env: {}, spawnImpl: (exe, args) => { assert.equal(exe, process.execPath); assert.deepEqual(args, ['C', 'P']); return { status: 0, stdout: JSON.stringify({ tier: 'T0', recommended_model: 'qwen2.5-coder:14b', confidence: 0.6 }), stderr: '' }; } });
  assert.deepEqual({ ok: c.ok, tier: c.tier, m: c.recommended_model }, { ok: true, tier: 'T0', m: 'qwen2.5-coder:14b' });
  assert.equal(classificar({ classifyPath: 'C', prompt: 'P', env: {}, spawnImpl: () => ({ status: 1, stdout: '', stderr: 'x' }) }).ok, false);
});

test('ollamaHost: sem esquema ganha http://; com esquema fica; vazio e o default', () => {
  assert.equal(ollamaHost({ OLLAMA_HOST: '127.0.0.1:11434' }), 'http://127.0.0.1:11434');
  assert.equal(ollamaHost({ OLLAMA_HOST: 'https://gpu:11434/' }), 'https://gpu:11434');
  assert.equal(ollamaHost({}), 'http://localhost:11434');
});

// ── o contexto e o protocolo real ───────────────────────────────────────────

test('construirContexto + carregarProtocolo: o prereg e o manifesto REAIS batem nos shas; sem ANTHROPIC_/CLAUDE_CODE_/MOOTER_ no ambiente; overrides e emenda', () => {
  const ctx = construirContexto(['--correr', '--so', '2', '--ledger', 'C:/x/l.jsonl', '--excluir', 't23-1b929f35f1', '--emenda', 'C:/x/AMENDMENT-1.md', '--sem-subagentes'], { env: { PATH: 'p', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_SESSION_ID: 's', MOOTER_MODE: '1', OLLAMA_HOST: 'h', CLAUDECODE: '1' }, home: 'C:/home', log: () => {} });
  assert.deepEqual(Object.keys(ctx.env).sort(), ['OLLAMA_HOST', 'PATH']);
  assert.equal(ctx.so, 2); assert.equal(ctx.ledgerFlag, true); assert.equal(ctx.ledgerPath, path.resolve('C:/x/l.jsonl'));
  assert.equal(ctx.manifestoPath, path.resolve('C:/x/l') + '-manifesto-de-execucao.json'); assert.equal(ctx.analysisPath, path.resolve('C:/x/l') + '-analysis.json');
  assert.deepEqual(ctx.overrides, { router_execute_sha: null, modelo_local: null, excluir: ['t23-1b929f35f1'], sem_subagentes: true });
  assert.equal(ctx.emendaPath, path.resolve('C:/x/AMENDMENT-1.md'));
  assert.equal(ctx.routerDirVivo, path.join('C:/home', '.claude', 'tools', 'router'));
  const falhas = carregarProtocolo(ctx);
  assert.deepEqual(falhas, [], 'manifesto_sha256 e prompt_template_sha256 do prereg batem com os ficheiros');
  assert.equal(ctx.prereg.corpus.tarefas.length, 20); assert.equal(ctx.tarefasPorId.size, 25);
  // por omissao: o ledger do prereg, o manifesto do prereg
  const d = construirContexto([], { env: {}, log: () => {} });
  assert.equal(path.basename(d.ledgerPath), 'custo-ledger.jsonl'); assert.equal(path.basename(d.manifestoPath), 'custo-manifesto-de-execucao.json'); assert.equal(d.so, null);
  // 162: uma flag sem valor nao come a seguinte
  const f = construirContexto(['--correr', '--ledger', '--so', '2'], { env: {}, log: () => {} });
  assert.equal(f.ledgerFlag, false); assert.equal(path.basename(f.ledgerPath), 'custo-ledger.jsonl'); assert.equal(f.so, 2);
  assert.ok(Number.isNaN(construirContexto(['--so'], { env: {}, log: () => {} }).so), '151: --so sem valor nao e 1');
  assert.equal(SO_MAXIMO, 2, '4.º revisor: um fumo nunca fecha a corrida');
});

test('tarefaCompleta: as 20 com meta do prereg e prompt do manifesto; os 5 suplentes com a tabela pinada e a ordem do slot', () => {
  const ctx = construirContexto([], { env: {}, log: () => {} });
  carregarProtocolo(ctx);
  const t1 = ctx.prereg.corpus.tarefas[0];
  const t = tarefaCompleta(ctx, t1.task_id);
  assert.equal(t.tier_classificado, t1.tier_classificado); assert.equal(t.tests_total_historico, t1.tests_total_historico); assert.equal(t.ordem_dos_bracos, t1.ordem_dos_bracos); assert.equal(t.suplente, false);
  assert.ok(t.prompt.includes(t.test_file), 'o prompt do manifesto nomeia o test_file'); assert.equal(crypto.createHash('sha256').update(t.prompt).digest('hex'), t.prompt_sha256);
  for (const [id, esperado] of Object.entries(SUPLENTES_ESPERADOS)) {
    const s = tarefaCompleta(ctx, id, { slot: t1 });
    assert.equal(s.suplente, true); assert.equal(s.tier_classificado, esperado.tier_classificado); assert.equal(s.tests_total_historico, esperado.tests_total_historico, `${id}: o manifesto e a tabela pinada da analise concordam`);
    assert.equal(s.ordem_dos_bracos, t1.ordem_dos_bracos, '14.º/4'); assert.equal(s.ordem, t1.ordem);
  }
  assert.equal(tarefaCompleta(ctx, 'nao-existe'), null);
});

test('o executor de B local e o classify sao os do RUNTIME (~/.claude/tools/router), nunca os do repo', () => {
  const src = fs.readFileSync(path.join(AQUI, 'correr-custo.mjs'), 'utf8');
  assert.match(src, /ctx\.routerExecutePath = path\.join\(ctx\.routerDirVivo, 'router-execute\.js'\)/);
  assert.match(src, /ctx\.classifyPath = path\.join\(ctx\.routerDirVivo, 'classify\.js'\)/);
  assert.equal(SENTINELA_CONTEUDO, 'custo-2026-09-10');
});

// ── ponta a ponta: o ledger que o controlador ESCREVE, passado pela análise REAL ──────────────
//
// O 1.º revisor do controlador virou o método das 24 rondas ao contrário: em vez de
// perguntar que ledger desonesto a análise aceita, perguntou que ledger este código
// produz em cada caminho de falha, e se a análise lhe dá o que o prereg manda.
// Aqui fica o harness: spawn/tags/worktrees injectados, uma tarefa T0 REAL do prereg,
// e `analisar()` a julgar o ficheiro que ficou no disco.

const SONDA = JSON.parse(fs.readFileSync(path.join(AQUI, 'custo-fixture-sonda.json'), 'utf8'));
const espera = (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { /* 31: ts_fim tem de ser > ts_inicio */ } };
// o relogio do controlador, com um desvio que o harness avanca dentro do spawn do timeout (so no modo 'timeout'); monotono para todos os agora() do ficheiro
const desvioDoRelogio = { ms: 0 };
relogio.agora = () => new Date(Date.now() + desvioDoRelogio.ms).toISOString();

/** Um contexto de corrida hermético para DUAS tarefas T0 do prereg real (t22 B primeiro, t21 A primeiro). `local`/`claudeA` aceitam um valor ou um mapa por task_id. */
function harness({ local = 'ok', aceitacaoA = 'verde', aceitacaoEsc = 'verde', tags = 'ok', claudeA = 'json', argv = [], env = {} } = {}) {
  const home = tmp();
  const ctx = construirContexto(argv, { env: { PATH: 'x', ...env }, home, log: () => {} });
  carregarProtocolo(ctx);
  const t22 = ctx.prereg.corpus.tarefas.find((x) => x.task_id === 't22-11f81c79b7');
  const t21 = ctx.prereg.corpus.tarefas.find((x) => x.task_id === 't21-96171ef138');
  ctx.prereg = { ...ctx.prereg, corpus: { ...ctx.prereg.corpus, tarefas: [t22, t21], suplentes: [] } };
  const idDe = (cwd) => (String(cwd).includes('t21-') ? 't21-96171ef138' : 't22-11f81c79b7');
  const opcao = (o, cwd) => (o && typeof o === 'object' ? (o[idDe(cwd)] || 'ok') : o);
  ctx.routerDirVivo = path.join(home, '.claude', 'tools', 'router');
  fs.mkdirSync(ctx.routerDirVivo, { recursive: true });
  fs.writeFileSync(path.join(ctx.routerDirVivo, '.budget-cache.json'), JSON.stringify({ ts: 1, data: { five_hour: { utilization: 4 } } }));
  fs.writeFileSync(path.join(ctx.routerDirVivo, '.budget-freeze'), SENTINELA_CONTEUDO);
  ctx.claude = { caminho: 'claude.exe', versao: '2.1.224 (Claude Code)' };
  ctx.routerExecutePath = 'RE.js'; ctx.classifyPath = 'CL.js'; ctx.ollama = 'http://o:11434';
  const digest = '357c53fb659c50760000000000000000000000000000000000000000000000ab';
  ctx.modelos = new Map([['qwen2.5:3b', digest], ['qwen2.5-coder:14b', '9ec8897f747e246e0000000000000000000000000000000000000000000000ab']]);
  ctx.modeloLocal = modeloLocalDoPrereg(ctx.env, ctx.overrides.modelo_local); ctx.modeloLocalDigest = ctx.modelos.get(ctx.modeloLocal) || null;
  let ultimoCwdLocal = null;
  ctx.tagsImpl = async () => (opcao(tags, ultimoCwdLocal) === 'ok' ? { ok: true, modelos: ctx.modelos } : { ok: false, motivo: 'tags: ECONNREFUSED' });
  ctx.saidas = path.join(home, 'saidas'); ctx.snapshots = path.join(home, 'wt');
  const conteudo = 'export {};\n';
  const shaTeste = crypto.createHash('sha256').update(conteudo).digest('hex');
  ctx.prepararImpl = (c, tarefa) => {
    const dirs = {};
    for (const n of ['pv', 'A', 'B']) { const d = path.join(ctx.snapshots, `${tarefa.task_id}-${n}`); fs.mkdirSync(path.join(d, path.dirname(tarefa.test_file)), { recursive: true }); fs.writeFileSync(path.join(d, tarefa.test_file), conteudo); dirs[n] = d; }
    return { ok: true, dirs, sha_teste: shaTeste, conteudo_teste: conteudo, comando: 'node', args: ['--test', tarefa.test_file] };
  };
  const chamadas = [];
  const sumario = (verde, hist) => (verde ? `ℹ tests ${hist}\nℹ pass ${hist}\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n` : `ℹ tests ${hist}\nℹ pass ${hist - 1}\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n`);
  const nB = {};
  ctx.spawnImpl = (exe, args, opts) => {
    chamadas.push({ exe, args: args.slice(0, 3), cwd: opts && opts.cwd });
    espera(2);
    if (exe === 'powershell') return { status: 0, signal: null, stdout: '', stderr: '' };
    if (args[0] === 'CL.js' || String(args[0]).endsWith('classify.js')) { const tm = ctx.manifest.tarefas.find((x) => x.prompt === args[1]); const tier = tm ? tarefaCompleta(ctx, tm.task_id).tier_classificado : 'T0'; return { status: 0, signal: null, stdout: JSON.stringify({ tier, recommended_model: tier === 'T0' ? 'qwen2.5-coder:14b' : 'claude-opus-4-6', confidence: 0.6 }), stderr: '' }; }
    if (args[1] === '--pin-provider=ollama') {
      ultimoCwdLocal = opts.cwd;
      const modo = opcao(local, opts.cwd);
      const modeloPedido = (args.find((a) => a.startsWith('--pin-model=')) || '').slice('--pin-model='.length) || 'qwen2.5:3b';   // como o router-execute: o pin, senao o default do provider
      if (modo === 'ok') return { status: 0, signal: null, stdout: JSON.stringify({ ok: true, text: 'Corre o teste e corrige a asserção.', model_used: modeloPedido, tokens_in: 900, tokens_out: 42, duration_ms: 1234 }) + '\n', stderr: '' };
      if (modo === 'timeout') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };
      return { status: 0, signal: null, stdout: JSON.stringify({ ok: false, error: { code: 'no_output', message: 'provider returned no usable text (http 500)' } }) + '\n', stderr: '' };
    }
    if (args[0] === '-p') {
      const sid = args[args.indexOf('--session-id') + 1];
      const ehA = path.basename(String(opts.cwd)).endsWith('-A');
      const modoA = opcao(claudeA, opts.cwd);
      if (ehA && modoA === 'timeout') { desvioDoRelogio.ms += ctx.prereg.aceitacao.tecto_por_tentativa_s * 1000; return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, pid: 4242, stdout: '', stderr: '' }; }   // o tecto REAL: o spawnSync so devolve SIGTERM depois de `timeout` ms — o relogio avanca o mesmo
      if (ehA && modoA === 'kill-cedo') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, pid: 4242, stdout: '', stderr: '' };   // a impressao digital do controlador que mata cedo: SIGTERM aos 2 ms
      if (ehA && modoA === 'morte') return { status: 1, signal: null, pid: 4242, stdout: 'nao e json', stderr: 'boom' };
      if (ehA && modoA === 'pipe-timeout') { desvioDoRelogio.ms += ctx.prereg.aceitacao.tecto_por_tentativa_s * 1000; return { status: 1, signal: null, error: { code: 'ETIMEDOUT' }, pid: 4242, stdout: '', stderr: 'crash' }; }   // H8 do 3.o revisor: o CLI saiu 1, um descendente segurou o pipe ate ao tecto
      if (ehA && modoA === 'envelope-sem-uso') return { status: 0, signal: null, pid: 4242, stdout: JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: sid, num_turns: 0, result: 'x' }), stderr: '' };   // 65/achado 6: parseia, mas nao tem usage nem modelUsage
      if (ehA && modoA === 'spawn') return { status: null, signal: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' };
      if (ehA && modoA === 'json-e-sinal') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, pid: 4242, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: sid, usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd, duration_ms: 120000, num_turns: 4, result: 'ok' }), stderr: '' };
      return { status: 0, signal: null, pid: 4242, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: sid, usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd, duration_ms: SONDA.duration_ms + chamadas.length, num_turns: 4, result: 'ok' }), stderr: '[mooter] hook\n' };
    }
    if (args[0] === '--test') {
      const cwd = String(opts.cwd);
      const hist = (idDe(cwd) === 't21-96171ef138' ? t21 : t22).tests_total_historico;
      const wt = path.basename(path.relative(ctx.snapshots, cwd).split(path.sep)[0] || '');   // 152: o sufixo do mkdtemp podia comecar por «A»
      if (wt.endsWith('-pv')) return { status: 1, signal: null, stdout: sumario(false, hist), stderr: '' };
      if (wt.endsWith('-A')) return { status: aceitacaoA === 'verde' ? 0 : 1, signal: null, stdout: sumario(aceitacaoA === 'verde', hist), stderr: '' };
      nB[idDe(cwd)] = (nB[idDe(cwd)] || 0) + 1;   // 1.ª chamada em B = depois do local (vermelha por construção), 2.ª = depois da escalação
      const verde = nB[idDe(cwd)] >= 2 && aceitacaoEsc === 'verde';
      return { status: verde ? 0 : 1, signal: null, stdout: sumario(verde, hist), stderr: '' };
    }
    throw new Error(`spawn inesperado: ${exe} ${args.join(' ')}`);
  };
  const ledger = new Ledger(path.join(home, 'ledger.jsonl'));
  const tarefa = tarefaCompleta(ctx, 't22-11f81c79b7');
  const tarefa2 = tarefaCompleta(ctx, 't21-96171ef138');
  const julgar = () => { const { eventos, linhasInvalidas } = lerLedger(fs.readFileSync(ledger.caminho, 'utf8')); return analisar(ctx.prereg, eventos, { linhasInvalidas }); };
  const correrAsDuas = async () => { await correrTarefa(ctx, tarefa, ledger); await correrTarefa(ctx, tarefa2, ledger); };
  return { ctx, ledger, tarefa, tarefa2, chamadas, julgar, correrAsDuas, linhas: () => lerLedger(fs.readFileSync(ledger.caminho, 'utf8')).eventos };
}

test('ponta a ponta (honesto): duas T0 com local ok + escalacao aceite + A aceite -> a analise da «cumprido · valida · marcas 0»; a forma e a ordem sao as do prereg', async () => {
  const h = harness();
  const res = await correrTarefa(h.ctx, h.tarefa, h.ledger);
  assert.equal(res.ok, true);
  const res2 = await correrTarefa(h.ctx, h.tarefa2, h.ledger);
  assert.equal(res2.ok, true);
  const ev = h.linhas();
  assert.deepEqual(ev.slice(0, 7).map((e) => `${e.evento}${e.braco ? ':' + e.braco + e.tentativa : ''}`), ['pre_voo', 'tentativa_inicio:B1', 'tentativa_fim:B1', 'tentativa_inicio:B2', 'tentativa_fim:B2', 'tentativa_inicio:A1', 'tentativa_fim:A1'], 'A-depois-B: B primeiro; local antes da escalacao; inicio antes de cada fim (67, 73, 85)');
  assert.deepEqual(ev.slice(7).map((e) => `${e.evento}${e.braco ? ':' + e.braco + e.tentativa : ''}`), ['pre_voo', 'tentativa_inicio:A1', 'tentativa_fim:A1', 'tentativa_inicio:B1', 'tentativa_fim:B1', 'tentativa_inicio:B2', 'tentativa_fim:B2'], 'B-depois-A: A primeiro (13.º/3)');
  assert.ok(Date.parse(ev[6].ts_fim) <= Date.parse(ev[7].ts), '14.º/5: a tarefa seguinte so depois do ultimo ts_fim');
  const pv = ev[0];
  assert.equal(pv.falhou, true); assert.equal(pv.exit_code, 1); assert.equal(pv.tests_corridos, 55); assert.equal(pv.skips, 0); assert.ok(pv.ts && pv.ts_inicio && pv.ts_fim); assert.equal(pv.test_file_sha, h.linhas()[2].test_file_sha_antes, '100');
  const local = ev[2], esc = ev[4], A = ev[6];
  for (const l of [local, esc, A]) for (const k of CHAVES_OBRIGATORIAS) assert.ok(k in l, `${l.braco}${l.tentativa}: ${k} presente`);
  assert.equal(local.executor, 'router-execute'); assert.equal(local.aceite, false); assert.equal(local.arrancou, true); assert.equal(local.tokens_locais, 42); assert.match(local.modelo_reportado, /^qwen2\.5:3b@sha256:357c53fb/); assert.equal(local.modelo_pedido, 'qwen2.5:3b', 'o prereg: router-execute a seco');
  assert.deepEqual(h.chamadas.filter((c) => c.args[1] === '--pin-provider=ollama').map((c) => c.args.length), [3, 3], 'sem --pin-model'); assert.equal(local.usage, null); assert.equal(local.session_id, null); assert.equal(local.e_escalacao, false); assert.equal(local.tentativa, 1); assert.equal(local.exit_code, 1);
  assert.equal(esc.executor, 'claude-p'); assert.equal(esc.e_escalacao, true); assert.equal(esc.tentativa, 2); assert.equal(esc.aceite, true); assert.equal(esc.modelo_pedido, MODELO_OPUS); assert.equal(esc.modelo_reportado, MODELO_OPUS); assert.equal(esc.arrancou, true); assert.deepEqual(esc.usage, SONDA.usage); assert.equal(esc.num_turns, 4); assert.equal(esc.tokens_transcript, 0, '99: procurado, nao encontrado'); assert.equal(esc.tecto_estourado, false);
  assert.equal(A.braco, 'A'); assert.equal(A.tentativa, 1); assert.equal(A.aceite, true); assert.notEqual(A.session_id, esc.session_id, '22: session_id unico');
  assert.ok(Date.parse(local.ts_fim) <= Date.parse(esc.ts_inicio) && Date.parse(esc.ts_fim) <= Date.parse(A.ts_inicio), '11.º/6: intervalos nao sobrepostos');
  assert.ok(Date.parse(pv.ts) <= Date.parse(ev[1].ts_inicio), '51: pre_voo antes do primeiro inicio');
  assert.equal(A.tecto_do_orcamento, 4); assert.equal(A.sentinela_presente, true); assert.ok(typeof A.estado_vivo_sha === 'string');
  // o texto local nunca esta no ledger, mas o sha esta e bate com o ficheiro guardado fora
  assert.ok(!JSON.stringify(ev).includes('Corre o teste e corrige'));
  assert.equal(local.texto_local_sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(h.ctx.saidas, 't22-11f81c79b7-B-t1.local.txt'))).digest('hex'));
  // a escalacao nao leva o texto local (prereg bracos.B.escalacao)
  const chamadasClaude = h.chamadas.filter((c) => c.args[0] === '-p');
  assert.equal(chamadasClaude.length, 4); for (const c of chamadasClaude.slice(0, 2)) assert.equal(c.args[1], h.tarefa.prompt);
  const r = h.julgar();
  assert.equal(r.corrida_valida, true); assert.equal(r.primaria.n_pares_validos, 2); assert.equal(r.primaria.aceites_A, 2); assert.equal(r.primaria.aceites_B, 2); assert.equal(r.primaria.limiar_descritivo_cumprido, true);
  assert.deepEqual(r.marcas_por_tipo, {}, 'marcas 0 num caminho honesto');
});

test('ponta a ponta (achado 1 do 1.º revisor): local que NAO arrancou escreve modelo_reportado = nome@sha256:digest na mesma -> a analise da valida com local_nao_arrancou; sem /api/tags fica null e a validade e n/d (honesto)', async () => {
  const h = harness({ local: { 't22-11f81c79b7': 'falha' } });
  await h.correrAsDuas();
  const local = h.linhas()[2];
  assert.equal(local.arrancou, false); assert.match(local.motivo_se_nao, /^ollama:no_output/); assert.equal(local.tokens_locais, null); assert.equal(local.texto_local_sha256, null);
  assert.match(local.modelo_reportado, /^qwen2\.5:3b@sha256:357c53fb/, 'o digest vem das tags, arrancado ou nao');
  const r = h.julgar();
  assert.equal(r.corrida_valida, true, 'a 2: o local que nao arrancou e escalou nao invalida o par');
  assert.equal(r.primaria.n_pares_validos, 2); assert.equal(r.marcas_por_tipo.local_nao_arrancou, 1);
  // sem tags NESSA tarefa: null honesto, e a analise diz n/d — e por isso que o retry existe
  const h2 = harness({ local: { 't22-11f81c79b7': 'falha' }, tags: { 't22-11f81c79b7': 'falha' } });
  await h2.correrAsDuas();
  assert.equal(h2.linhas()[2].modelo_reportado, null); assert.equal(h2.linhas()[2].ollama_tags_ok, false);
  assert.equal(h2.julgar().corrida_valida, null, '30: um null nao prova que o modelo local nao mudou');
  // um local que CORREU sem tags: a linha fica no ledger (135) e SO DEPOIS a paragem (11.º/3)
  const h2b = harness({ tags: { 't22-11f81c79b7': 'falha' } });
  await assert.rejects(() => correrTarefa(h2b.ctx, h2b.tarefa, h2b.ledger), /sem digest para qwen2\.5:3b/);
  const l2b = h2b.linhas()[2];
  assert.equal(l2b.evento, 'tentativa_fim'); assert.equal(l2b.arrancou, true); assert.equal(l2b.tokens_locais, 42); assert.equal(l2b.modelo_reportado, null);
  // um local em timeout (240 s do pin, 900 s do tecto) e a mesma classe
  const h3 = harness({ local: { 't22-11f81c79b7': 'timeout' } });
  await h3.correrAsDuas();
  assert.equal(h3.linhas()[2].motivo_se_nao, 'timeout'); assert.equal(h3.julgar().corrida_valida, true);
  // e TODOS os locais a falhar e a 45: INVALIDA — B nunca foi aplicado
  const h4 = harness({ local: 'falha' });
  await h4.correrAsDuas();
  const r4 = h4.julgar();
  assert.equal(r4.corrida_valida, false); assert.ok(r4.corrida_invalida_por.some((x) => /nenhum passo local arrancou/.test(x.motivo)));
});

test('ponta a ponta (NOTA DO TECTO, fechada pela 64): A morta aos 900 s COM transcript que deixa o worktree verde escreve aceite:false com provas verdes -> a analise marca rejeicao_sem_json_verde, A perde o par, corrida VALIDA; sem transcript e a 22 (timeout tem transcript); A morta com o worktree vermelho e um tecto honesto (27c so se faltar prova)', async () => {
  // o caso real da NOTA: o CLI escreveu o transcript do --session-id antes de ser morto -> arrancou por evidencia, sem JSON
  const h64 = harness({ claudeA: { 't22-11f81c79b7': 'timeout' }, aceitacaoA: 'verde' });
  const inner64 = h64.ctx.spawnImpl;
  h64.ctx.spawnImpl = (exe, args, opts) => { if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(h64.ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { id: 'msg_64', model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return inner64(exe, args, opts); };
  await correrTarefa(h64.ctx, h64.tarefa, h64.ledger);
  const A64 = h64.linhas()[6];
  assert.equal(A64.arrancou, true, 'arrancou por evidencia (transcript >= piso)'); assert.equal(A64.motivo_se_nao, null); assert.equal(A64.tecto_estourado, true); assert.equal(A64.aceite, false, '138: sem JSON = nao aceite'); assert.equal(A64.exit_code, 0); assert.equal(A64.usage, null); assert.equal(A64.modelUsage, null); assert.ok(A64.tokens_transcript >= TRANSCRIPT_MINIMO); assert.equal(A64.session_id, A64.session_id_pedido);
  assert.ok(A64.parede_ms >= 900000 && A64.duration_ms === A64.parede_ms, `o tecto real pelo relogio: parede ${A64.parede_ms} ms (9.o/3: sem JSON o duration_ms e a parede)`); assert.equal(A64.cli_sinal, 'SIGTERM'); assert.equal(A64.cli_exit, null);
  const r64 = h64.julgar();
  assert.equal(r64.corrida_valida, true, JSON.stringify(r64.corrida_invalida_por));
  assert.equal(r64.marcas_por_tipo.rejeicao_sem_json_verde, 1); assert.equal(r64.marcas_por_tipo.aceite_contraditorio, undefined); assert.equal(r64.marcas_por_tipo.tecto_estourado_incoerente, undefined, '65: a flag concorda com o relogio'); assert.equal(r64.marcas_por_tipo.campo_do_json_sem_json, undefined, '65: num_turns/subtype/is_error null sem JSON');
  assert.match(r64.marcas.find((m) => m.tipo === 'rejeicao_sem_json_verde').motivo, /tecto sem resultado .*conta contra o braco A \(64\) · tecto \(SIGTERM do protocolo; duration_ms 90\d{4}, ts 90\d(\.\d+)?s >= 900s - 1s\)/, 'o ramo TECTO, ponta a ponta');
  assert.equal(r64.marcas_por_tipo.linha_impossivel_sem_json, undefined, '65: a linha real do tecto e possivel (SIGTERM, exit null, parede = ts)');
  assert.equal(r64.por_tarefa.find((x) => x.task_id === 't22-11f81c79b7').A.aceite, false, 'R3: A perde o par');
  assert.deepEqual(r64.primaria.sensibilidade_64.por_braco, { A: 1, B: 0 });
  // o kill precoce (SIGTERM aos 2 ms, tecto_estourado:true pela regra do controlador «o timer disparou» (sinal)): o relogio desmente — 19 (nao e o SIGTERM do protocolo) e 65 (a flag contradiz o relogio), INVALIDA
  const hK = harness({ claudeA: { 't22-11f81c79b7': 'kill-cedo' }, aceitacaoA: 'verde' });
  const innerK = hK.ctx.spawnImpl;
  hK.ctx.spawnImpl = (exe, args, opts) => { if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(hK.ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { id: 'msg_k', model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return innerK(exe, args, opts); };
  await correrTarefa(hK.ctx, hK.tarefa, hK.ledger);
  const AK = hK.linhas()[6];
  assert.equal(AK.tecto_estourado, true, 'a regra do controlador: o timer disparou (sinal)'); assert.ok(AK.parede_ms < 900000); assert.equal(AK.aceite, false);
  const rK = hK.julgar();
  assert.equal(rK.corrida_valida, false, 'C2 do 1.o revisor da v25: o kill precoce nao passa');
  assert.ok(rK.marcas.some((m) => m.tipo === 'aceite_contraditorio')); assert.ok(rK.marcas.some((m) => m.tipo === 'linha_impossivel_sem_json' && /kill precoce/.test(m.motivo))); assert.equal(rK.marcas_por_tipo.rejeicao_sem_json_verde, undefined);
  // a morte: o CLI sai 1 sem JSON (cli_morreu:1), transcript encontrado, worktree verde -> 64 «morte ANTES do tecto», VALIDA, A perde
  const hM = harness({ claudeA: { 't22-11f81c79b7': 'morte' }, aceitacaoA: 'verde' });
  const innerM = hM.ctx.spawnImpl;
  hM.ctx.spawnImpl = (exe, args, opts) => { if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(hM.ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { id: 'msg_m', model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return innerM(exe, args, opts); };
  await correrTarefa(hM.ctx, hM.tarefa, hM.ledger);
  const AM = hM.linhas()[6];
  assert.equal(AM.arrancou, true); assert.equal(AM.cli_exit, 1); assert.equal(AM.cli_sinal, null); assert.equal(AM.tecto_estourado, false); assert.equal(AM.aceite, false); assert.equal(AM.motivo_cli, 'boom', '86: distinguir crash de tecto');
  const rM = hM.julgar();
  assert.equal(rM.corrida_valida, true, JSON.stringify(rM.corrida_invalida_por));
  assert.match(rM.marcas.find((m) => m.tipo === 'rejeicao_sem_json_verde').motivo, /morte sem resultado .*morte ANTES do tecto \(duration_ms \d+, ts [\d.]+s, tecto 900s, cli_exit 1, cli_sinal null\)/, 'o ramo MORTE, ponta a ponta');
  assert.equal(rM.primaria.aceites_A, 0, 'R3: A perde o par'); assert.equal(rM.primaria.aceites_B, 1); assert.equal(rM.primaria.n_pares_validos, 1);
  // H8 (3.o revisor): o CLI saiu 1 sem JSON e um descendente segurou o pipe ate ao tecto — status 1, signal null, ETIMEDOUT, parede >= 900 s: a linha leva cli_erro, a arvore e morta (ha um descendente vivo), a analise le morte (64), VALIDA
  const hP = harness({ claudeA: { 't22-11f81c79b7': 'pipe-timeout' }, aceitacaoA: 'verde' });
  const innerP = hP.ctx.spawnImpl;
  hP.ctx.spawnImpl = (exe, args, opts) => { if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(hP.ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { id: 'msg_p', model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return innerP(exe, args, opts); };
  await correrTarefa(hP.ctx, hP.tarefa, hP.ledger);
  const AP = hP.linhas()[6];
  assert.equal(AP.cli_exit, 1); assert.equal(AP.cli_sinal, null); assert.equal(AP.cli_erro, 'ETIMEDOUT'); assert.ok(AP.parede_ms >= 900000); assert.equal(AP.tecto_estourado, true, 'a regra do controlador: o timer disparou (ETIMEDOUT com o pipe)'); assert.equal(AP.aceite, false); assert.equal(AP.arrancou, true); assert.equal(AP.motivo_se_nao, null);
  if (process.platform === 'win32') assert.ok(hP.chamadas.some((c) => c.exe === 'powershell'), 'a arvore e morta tambem com ETIMEDOUT sem sinal (ha um descendente vivo a segurar o pipe)');
  const rP = hP.julgar();
  assert.equal(rP.corrida_valida, true, JSON.stringify(rP.corrida_invalida_por));
  assert.match(rP.marcas.find((m) => m.tipo === 'rejeicao_sem_json_verde').motivo, /morte sem resultado .*cli_exit 1, cli_sinal null/); assert.equal(rP.marcas_por_tipo.linha_impossivel_sem_json, undefined); assert.equal(rP.marcas_por_tipo.tecto_estourado_incoerente, undefined);
  assert.deepEqual(rP.primaria.sensibilidade_64.por_classe, { A: { tecto: 0, morte: 1 }, B: { tecto: 0, morte: 0 } });
  // e sem transcript: pipe_timeout:1 com arrancou:false nao e spawn puro (nao ha par_invalido) e a 22 invalida — o CLI correu e ninguem sabe quanto custou
  const hP2 = harness({ claudeA: { 't22-11f81c79b7': 'pipe-timeout' }, aceitacaoA: 'verde' });
  await correrTarefa(hP2.ctx, hP2.tarefa, hP2.ledger);
  const AP2 = hP2.linhas()[6];
  assert.equal(AP2.arrancou, false); assert.equal(AP2.motivo_se_nao, 'pipe_timeout:1'); assert.equal(hP2.linhas().filter((e) => e.evento === 'par_invalido').length, 0, 'nao e spawn puro');
  assert.equal(hP2.julgar().corrida_valida, false);
  // 65/achado 6 do 2.o revisor: um envelope que parseia SEM usage nem modelUsage e «sem JSON» para o controlador tambem — campos do envelope null, duration_ms = parede, aceite:false, o envelope descrito em motivo_cli; sem transcript nao ha evidencia (arrancou:false, sem_json_sem_transcript) e a 22 invalida
  const hE = harness({ claudeA: { 't22-11f81c79b7': 'envelope-sem-uso' }, aceitacaoA: 'verde' });
  await correrTarefa(hE.ctx, hE.tarefa, hE.ledger);
  const AE = hE.linhas()[6];
  assert.equal(AE.usage, null); assert.equal(AE.modelUsage, null); assert.equal(AE.num_turns, null); assert.equal(AE.subtype, null); assert.equal(AE.is_error, null); assert.equal(AE.aceite, false); assert.equal(AE.tecto_estourado, false); assert.equal(AE.duration_ms, AE.parede_ms); assert.equal(AE.cli_exit, 0);
  assert.match(AE.motivo_cli, /envelope sem usage\/modelUsage: subtype="error_during_execution" is_error=true session_id="[0-9a-f-]{36}"/);
  assert.equal(AE.arrancou, false, 'sem usage e sem transcript nao ha evidencia'); assert.equal(AE.motivo_se_nao, 'sem_json_sem_transcript');
  assert.equal(hE.julgar().corrida_valida, false, '22: nao-arrancou fora da definicao — o CLI respondeu e ninguem sabe quanto custou');
  // o mesmo tecto SEM transcript encontravel: arrancou:false com motivo timeout -> 22 (um timeout tem transcript) — INVALIDA, como antes
  const h = harness({ claudeA: { 't22-11f81c79b7': 'timeout' }, aceitacaoA: 'verde' });
  await correrTarefa(h.ctx, h.tarefa, h.ledger);
  const A = h.linhas()[6];
  assert.equal(A.arrancou, false, 'sem JSON e sem transcript encontravel'); assert.equal(A.motivo_se_nao, 'timeout'); assert.equal(A.tecto_estourado, true); assert.equal(A.aceite, false, '138: sem JSON = nao aceite'); assert.equal(A.exit_code, 0); assert.equal(A.session_id, null, '102'); assert.equal(A.tokens_transcript, 0);
  if (process.platform === 'win32') assert.ok(h.chamadas.some((c) => c.exe === 'powershell'), '139: a arvore do processo e morta depois do tecto');
  else assert.deepEqual(A.arvore_morta, { tentado: false }, '139: matarArvore e win32 por desenho (CI corre em ubuntu)');
  const r = h.julgar();
  assert.equal(r.corrida_valida, false, '22: timeout sem transcript esta fora da definicao de nao-arrancou — a 64 nao toca nisto');
  assert.ok(r.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao')); assert.equal(r.marcas_por_tipo.aceite_contraditorio, 1, 'e a 19 fica: uma linha que nao chegou nao e tecto nem morte (64 estreita)'); assert.equal(r.marcas_por_tipo.rejeicao_sem_json_verde, undefined);
  // o mesmo tecto com o worktree vermelho: aceite:false com provas vermelhas — a linha e honesta; sem transcript a 22 invalida na mesma (brief 7.º/1: «e o correcto»)
  const h2 = harness({ claudeA: { 't22-11f81c79b7': 'timeout' }, aceitacaoA: 'vermelha' });
  await correrTarefa(h2.ctx, h2.tarefa, h2.ledger);
  const A2 = h2.linhas()[6];
  assert.equal(A2.aceite, false); assert.equal(A2.exit_code, 1);
  assert.equal(h2.julgar().corrida_valida, false, '22: timeout sem transcript esta fora da definicao de nao-arrancou');
});

test('ponta a ponta (spawn puro em A): linha com envelope null + par_invalido a seguir, com braco e motivo copiados (9.º/2, 28); a analise trata-o como saida (a)', async () => {
  const h = harness({ claudeA: { 't22-11f81c79b7': 'spawn' } });
  await h.correrAsDuas();
  const ev = h.linhas();
  const A = ev.find((e) => e.evento === 'tentativa_fim' && e.braco === 'A');
  const pi = ev.find((e) => e.evento === 'par_invalido');
  assert.equal(A.arrancou, false); assert.equal(A.motivo_se_nao, 'spawn:ENOENT'); assert.equal(A.session_id, null); assert.equal(A.usage, null); assert.equal(A.total_cost_usd, null); assert.equal(A.exit_code, null, 'sem aceitacao num spawn puro'); assert.equal(A.aceite, false);
  assert.ok(pi && pi.braco === 'A' && pi.motivo === 'spawn:ENOENT'); assert.ok(ev.indexOf(pi) > ev.indexOf(A), 'depois da tentativa_fim');
  const r = h.julgar();
  assert.equal(r.primaria.n_pares_validos, 1, 'o par de t22 sai pela saida (a); t21 conta'); assert.ok(r.fiabilidade.pares_invalidos.some((x) => x.task_id === 't22-11f81c79b7' && /spawn:ENOENT/.test(x.motivo)));
  assert.equal(r.corrida_valida, true, '28: a saida (a) e verificavel — spawn puro, curto, sem evidencia');
});

test('Ledger.paragem: n e ultima_tarefa vem do que ficou no disco (134) — a analise nao marca paragem_incoerente', async () => {
  const h = harness();
  await correrTarefa(h.ctx, h.tarefa, h.ledger);
  h.ledger.paragem('teste de paragem a meio');
  const p = h.linhas().at(-1);
  assert.equal(p.evento, 'paragem'); assert.equal(p.n, 1); assert.equal(p.ultima_tarefa, 't22-11f81c79b7'); assert.equal(p.motivo, 'teste de paragem a meio');
  const r = h.julgar();
  assert.equal(r.marcas_por_tipo.paragem_incoerente, undefined);
});

test('ollamaTagsComRetry: 3 tentativas antes de desistir; matarArvore so em win32 e nunca lanca', async () => {
  let n = 0;
  const r = await ollamaTagsComRetry('h', { esperaMs: 1, tagsImpl: async () => { n++; return n < 3 ? { ok: false, motivo: 'x' } : { ok: true, modelos: new Map() }; } });
  assert.equal(r.ok, true); assert.equal(n, 3);
  n = 0;
  assert.equal((await ollamaTagsComRetry('h', { esperaMs: 1, tagsImpl: async () => { n++; return { ok: false, motivo: 'x' }; } })).ok, false); assert.equal(n, 3);
  assert.deepEqual(matarArvore(123, { plataforma: 'linux' }), { tentado: false });
  assert.deepEqual(matarArvore(null), { tentado: false });
  let visto = null;
  assert.deepEqual(matarArvore(123, { plataforma: 'win32', spawnImpl: (exe, args) => { visto = { exe, args }; return { status: 0 }; } }), { tentado: true, ok: true });
  assert.equal(visto.exe, 'powershell'); assert.match(visto.args.at(-1), /ParentProcessId=\$p.*K 123$/);
});

test('ponta a ponta (emenda --modelo-local): com --emenda o pin e explicito e o modelo_pedido e o da emenda; sem --emenda a flag e recusada no pre-voo (nao aqui: o contexto so a regista)', async () => {
  const h = harness({ argv: ['--modelo-local', 'qwen2.5-coder:14b', '--emenda', 'C:/x/AMENDMENT-1.md'] });
  await h.correrAsDuas();
  const local = h.linhas()[2];
  assert.equal(local.modelo_pedido, 'qwen2.5-coder:14b'); assert.match(local.modelo_reportado, /^qwen2\.5-coder:14b@sha256:9ec8897f/);
  assert.deepEqual(h.chamadas.find((c) => c.args[1] === '--pin-provider=ollama').args, ['RE.js', '--pin-provider=ollama', '--pin-model=qwen2.5-coder:14b']);
  assert.equal(h.julgar().corrida_valida, true);
  // e OLLAMA_OPTION_A_MODEL no ambiente e a regra do prereg sem emenda
  const h2 = harness({ env: { OLLAMA_OPTION_A_MODEL: 'qwen2.5-coder:14b' } });
  await h2.correrAsDuas();
  assert.equal(h2.linhas()[2].modelo_pedido, 'qwen2.5-coder:14b'); assert.equal(h2.chamadas.find((c) => c.args[1] === '--pin-provider=ollama').args.length, 3, 'a seco: e o router-execute que le a env');
});

test('ponta a ponta (achado 2 do 2.º revisor): JSON completo + sinal do spawnSync (pipe herdado por um descendente) NAO e tecto — o CLI provou que acabou; a analise da valida', async () => {
  const h = harness({ claudeA: { 't22-11f81c79b7': 'json-e-sinal' }, aceitacaoA: 'verde' });
  await h.correrAsDuas();
  const A = h.linhas()[6];
  assert.equal(A.arrancou, true); assert.equal(A.tecto_estourado, false, 'o tecto mede-se pelo duration_ms do JSON (48)'); assert.equal(A.duration_ms, 120000); assert.equal(A.sinal_depois_do_json, true); assert.equal(A.cli_sinal, 'SIGTERM'); assert.equal(A.aceite, true);
  assert.ok(A.arvore_morta && A.arvore_morta.tentado === (process.platform === 'win32'), '139: a arvore e morta na mesma (win32); noutras plataformas fica declarado tentado:false');
  const r = h.julgar();
  assert.equal(r.corrida_valida, true); assert.equal(r.primaria.aceites_A, 2);
  // e um JSON cujo proprio duration_ms diz >= 900 s e tecto (48), com ou sem sinal
  const h2 = harness();
  h2.ctx.spawnImpl = ((orig) => (exe, args, opts) => { const r = orig(exe, args, opts); if (args[0] === '-p' && String(opts.cwd).endsWith('t22-11f81c79b7-A')) { const j = JSON.parse(r.stdout); j.duration_ms = 900000; return { ...r, stdout: JSON.stringify(j) }; } return r; })(h2.ctx.spawnImpl);
  await correrTarefa(h2.ctx, h2.tarefa, h2.ledger);
  assert.equal(h2.linhas()[6].tecto_estourado, true); assert.equal(h2.linhas()[6].aceite, false);
});

test('correr(): ponta a ponta com tudo injectado — sentinela posto antes da sonda e retirado no fim, manifesto escrito, 2 tarefas + suplente, analise chamada; sonda a falhar retira o sentinela sem ledger', async () => {
  const h = harness();
  const ctx = h.ctx;
  ctx.raiz = path.join(ctx.home, 'raiz'); ctx.cache = path.join(ctx.raiz, 'cache');
  ctx.ledgerPath = path.join(ctx.home, 'custo-ledger.jsonl'); ctx.manifestoPath = path.join(ctx.home, 'manifesto.json'); ctx.analysisPath = path.join(ctx.home, 'analysis.json');
  ctx.preregSha = 'p'.repeat(64); ctx.analiseSha = 'a'.repeat(64); ctx.controladorSha = 'c'.repeat(64); ctx.head = 'h'; ctx.originMain = 'o'; ctx.runtime = { router_execute_sha256: 'r', inject_context_sha256: 'i' }; ctx.classificacoes = {}; ctx.classifyRecomenda = ['qwen2.5-coder:14b'];
  fs.rmSync(path.join(ctx.routerDirVivo, '.budget-freeze'), { force: true });
  fs.writeFileSync(path.join(ctx.routerDirVivo, 'classify.js'), ''); fs.writeFileSync(path.join(ctx.routerDirVivo, 'patterns.js'), ''); ctx.classifyPath = path.join(ctx.routerDirVivo, 'classify.js');
  ctx.preVooImpl = async () => ({ ok: true, falhas: [], avisos: [] });
  ctx.cacheNmImpl = () => [];
  const controlados = []; ctx.controloImpl = (c, ids) => { controlados.push(...ids); return []; };   // 157
  const sentinelaVisto = [];
  ctx.aquecerImpl = async () => { sentinelaVisto.push(fs.existsSync(caminhoDoSentinela(ctx.routerDirVivo))); return { ok: true, ms: 1 }; };
  // a sonda passa pelo spawn injectado do harness (args[0] === '-p'); a analise no fim tambem (args[0] termina em custo-analise.mjs)
  const spawnHarness = ctx.spawnImpl;
  const analises = [];
  ctx.spawnImpl = (exe, args, opts) => { if (String(args[0]).endsWith('custo-analise.mjs')) { analises.push(args); return { status: 0, stdout: 'analise ok', stderr: '' }; } return spawnHarness(exe, args, opts); };
  // o 2.º slot (t21) falha o worktree -> suplente t02 (T3)
  ctx.prereg = { ...ctx.prereg, corpus: { ...ctx.prereg.corpus, suplentes: ['t02-7bb45751d8'] } };
  const prepOrig = ctx.prepararImpl;
  ctx.prepararImpl = (c, tarefa) => (tarefa.task_id === 't21-96171ef138' ? { ok: false, motivo: 'A:git_archive:128' } : prepOrig(c, tarefa));
  // transcript da sonda encontravel: o harness nao escreve transcripts -> a sonda falharia; escrevemos um para o session_id que a sonda pedir
  const sondaOrig = spawnHarness;
  ctx.spawnImpl = ((inner) => (exe, args, opts) => { const r = inner(exe, args, opts); if (args[0] === '-p' && args[1] === 'Responde apenas: OK') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return r; })(ctx.spawnImpl);
  void sondaOrig;
  const logs = []; ctx.log = (m) => logs.push(String(m));
  const codigo = await correr(ctx);
  assert.equal(codigo, 0, logs.join(' | '));
  assert.deepEqual(controlados, ['t22-11f81c79b7', 't21-96171ef138', 't02-7bb45751d8'], '157: o controlo do filho corre antes de pagar, tarefas em jogo + suplentes');
  assert.deepEqual(sentinelaVisto, [true], '145: o sentinela ja esta posto quando o modelo aquece (antes da sonda)');
  assert.equal(fs.existsSync(caminhoDoSentinela(ctx.routerDirVivo)), false, 'retirado no fim');
  const m = JSON.parse(fs.readFileSync(ctx.manifestoPath, 'utf8'));
  assert.equal(m.modelo_local.nome, 'qwen2.5:3b'); assert.deepEqual(m.modelo_local.classify_recomendaria, ['qwen2.5-coder:14b']); assert.equal(m.sonda.tokens_transcript, SONDA.usage.input_tokens + SONDA.usage.output_tokens + SONDA.usage.cache_creation_input_tokens + SONDA.usage.cache_read_input_tokens); assert.equal(m.estado_vivo.sentinela_presente, true); assert.ok(m.executor_A.startsWith('claude -p <prompt> --output-format json --model claude-opus-5'));
  const ev = lerLedger(fs.readFileSync(ctx.ledgerPath, 'utf8')).eventos;   // correr() escreve no ledger da corrida, nao no do harness
  const tipos = ev.map((e) => e.evento);
  assert.equal(tipos.filter((x) => x === 'paragem').length, 0, '58 do brief: sem paragem num fim normal');
  const ex = ev.find((e) => e.evento === 'tarefa_excluida');
  assert.equal(ex.task_id, 't21-96171ef138'); assert.equal(ex.suplente_usado, 't02-7bb45751d8'); assert.match(ex.motivo, /^worktree:A:git_archive/);
  assert.ok(ev.some((e) => e.evento === 'tentativa_fim' && e.task_id === 't02-7bb45751d8' && e.braco === 'A'), 'o suplente correu');
  assert.deepEqual(analises[0].slice(1), ['--prereg', ctx.preregPath, '--ledger', ctx.ledgerPath, '--out', ctx.analysisPath]);
  // 166: o manifesto a falhar (o pai do caminho e um ficheiro) -> sentinela retirado, codigo 2, sem ledger
  const h166 = harness();
  const d166 = driverCorrer(h166, { suplentes: [] });
  fs.writeFileSync(path.join(d166.ctx.home, 'bloqueio'), ''); d166.ctx.manifestoPath = path.join(d166.ctx.home, 'bloqueio', 'm.json');
  assert.equal(await correr(d166.ctx), 2, d166.logs.join(' | '));
  assert.equal(fs.existsSync(caminhoDoSentinela(d166.ctx.routerDirVivo)), false, '166: nunca orfao por excepcao'); assert.equal(fs.existsSync(d166.ctx.ledgerPath), false);
  // a sonda a falhar (sem modelUsage Opus): nada no ledger, sentinela retirado, codigo 2
  const h2 = harness();
  const c2 = h2.ctx;
  c2.raiz = path.join(c2.home, 'raiz'); c2.ledgerPath = path.join(c2.home, 'l.jsonl'); c2.manifestoPath = path.join(c2.home, 'm.json'); c2.analysisPath = path.join(c2.home, 'a.json');
  fs.rmSync(path.join(c2.routerDirVivo, '.budget-freeze'), { force: true });
  c2.preVooImpl = async () => ({ ok: true, falhas: [], avisos: [] }); c2.cacheNmImpl = () => []; c2.aquecerImpl = async () => ({ ok: true, ms: 1 }); c2.controloImpl = () => [];
  const inner2 = c2.spawnImpl;
  c2.spawnImpl = (exe, args, opts) => { if (args[0] === '-p') return { status: 0, signal: null, stdout: JSON.stringify({ session_id: 's', usage: SONDA.usage, modelUsage: { 'claude-opus-4-1': SONDA.modelUsage['claude-opus-5'] } }), stderr: '' }; return inner2(exe, args, opts); };
  assert.equal(await correr(c2), 2);
  assert.equal(fs.existsSync(c2.ledgerPath), false); assert.equal(fs.existsSync(caminhoDoSentinela(c2.routerDirVivo)), false);
});

test('sondar: exige a chave literal claude-opus-5, usage, e o transcript do session_id; avisa abaixo da cache da fixture', () => {
  const h = harness();
  const ctx = h.ctx; ctx.raiz = ctx.home;
  const inner = ctx.spawnImpl;
  ctx.spawnImpl = (exe, args, opts) => { const r = inner(exe, args, opts); if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ message: { model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return r; };
  const s = sondar(ctx);
  assert.equal(s.ok, true); assert.equal(s.aviso, null); assert.equal(s.cache_opus, 58964); assert.ok(s.transcript);
  const semTranscript = harness(); semTranscript.ctx.raiz = semTranscript.ctx.home;
  const s2 = sondar(semTranscript.ctx);
  assert.equal(s2.ok, false); assert.ok(s2.falhas.some((f) => /transcript da sonda/.test(f)));
  // o controlo positivo do instrumento: um transcript que nao bate com o JSON (aqui, o dobro — duas respostas com ids DIFERENTES) reprova a sonda
  const h3 = harness(); h3.ctx.raiz = h3.ctx.home;
  const inner3 = h3.ctx.spawnImpl;
  h3.ctx.spawnImpl = (exe, args, opts) => { const r = inner3(exe, args, opts); if (args[0] === '-p') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(h3.ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), [1, 2].map((i) => JSON.stringify({ message: { id: `msg_${i}`, model: 'claude-opus-5', usage: SONDA.usage } })).join('\n') + '\n'); } return r; };
  const s3 = sondar(h3.ctx);
  assert.equal(s3.ok, false); assert.ok(s3.falhas.some((f) => /cruzamento n.o bate/.test(f)), s3.falhas.join(' | '));
});

test('pre-voo da corrida (regras 9, sem git/CLI/rede): --so acima de SO_MAXIMO, --ledger sem --so, --so sem --ledger, sentinela orfao, ledger existente — cada um e uma falha nomeada', async () => {
  // o pre-voo real chama git/claude/fetch; aqui isola-se a regra 9 pela sua forma no codigo (a mesma condicao que corre em --verificar)
  const src = fs.readFileSync(path.join(AQUI, 'correr-custo.mjs'), 'utf8');
  assert.match(src, /ctx\.so <= SO_MAXIMO/, 'o tecto do fumo esta no pre-voo');
  assert.match(src, /if \(ctx\.ledgerFlag && ctx\.so === null\) falhas\.push/, '155');
  assert.match(src, /if \(ctx\.so !== null && !ctx\.ledgerFlag\) falhas\.push/, '--so exige --ledger');
  assert.match(src, /if \(sentinelaPresente\(ctx\.routerDirVivo\)\) \{/, 'sentinela orfao e falha, nunca apagado em silencio');
  assert.match(src, /if \(fs\.existsSync\(ctx\.ledgerPath\)\) falhas\.push/, 'UMA corrida');
  assert.match(src, /flag: 'wx'/, '154: o sentinela e a tranca');
  // 3b: a emenda tem a mesma ancora do prereg — o pre-voo chama anterioridadeDaEmenda (mordida real no teste seguinte)
  assert.match(src, /if \(ctx\.emendaPath && ctx\.emendaSha\) falhas\.push\(\.\.\.anterioridadeDaEmenda\(/, 'o pre-voo confronta a emenda com origin/main');
  // e a exclusao de um suplente por emenda retira-o do CONTROLO do filho, mas NAO da lista: fica registada no ledger quando seria consumido (5.º revisor)
  assert.match(src, /const suplentes = ctx\.prereg\.corpus\.suplentes\.slice\(\)/);
  assert.match(src, /\.filter\(\(id\) => !ctx\.overrides\.excluir\.includes\(id\)\);\n  const fc = /, 'o controlo do filho salta o excluido');
});

test('anterioridadeDaEmenda (3b): num repo git temporario com origin/main — commitada e igual passa; so em HEAD (nao empurrada), editada por commitar, commitada mas nao empurrada, fora do repo, e um sha que nao e o do disco reprovam', () => {
  const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x' } }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`); return r.stdout; };
  const base = tmp();
  const bare = path.join(base, 'origin.git'); const repo = path.join(base, 'repo');
  git(base, 'init', '-q', '--bare', '-b', 'main', bare);
  git(base, 'clone', '-q', bare, repo);
  git(repo, 'checkout', '-q', '-B', 'main');
  fs.mkdirSync(path.join(repo, 'tools', 'ab'), { recursive: true });
  const em = path.join(repo, 'tools', 'ab', 'AMENDMENT-1.md');
  fs.writeFileSync(em, '# emenda\n');
  git(repo, 'add', 'tools/ab/AMENDMENT-1.md'); git(repo, 'commit', '-q', '-m', 'emenda');
  const shaDe = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  // so em HEAD, ainda nao em origin/main: falha (nao empurrada)
  let f = anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: shaDe(em) });
  assert.equal(f.length, 1, f.join(' | ')); assert.match(f[0], /git show origin\/main:tools\/ab\/AMENDMENT-1\.md falhou/);
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  // empurrada e igual: passa — com caminho absoluto e com o relativo resolvido da raiz (o comando documentado corre da raiz)
  assert.deepEqual(anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: shaDe(em) }), []);
  assert.deepEqual(anterioridadeDaEmenda({ repo, emendaPath: path.resolve(repo, 'tools/ab/AMENDMENT-1.md'), emendaSha: shaDe(em) }), []);
  // editada em disco (por commitar): duas falhas — sha != origin/main e alteracoes por commitar
  fs.writeFileSync(em, '# emenda editada a meio\n');
  f = anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: shaDe(em) });
  assert.equal(f.length, 2, f.join(' | ')); assert.match(f[0], /em disco \(\w{12}\) != origin\/main/); assert.match(f[1], /emenda com altera/);
  // editada e commitada mas nao empurrada: origin/main tem a antiga -> sha != origin/main (uma so falha)
  git(repo, 'commit', '-q', '-am', 'edita');
  f = anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: shaDe(em) });
  assert.equal(f.length, 1, f.join(' | ')); assert.match(f[0], /!= origin\/main/);
  git(repo, 'push', '-q', 'origin', 'main');
  assert.deepEqual(anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: shaDe(em) }), []);
  // fora do repo: falha fechada, sem chamar o git
  const fora = path.join(base, 'AMENDMENT-1.md'); fs.writeFileSync(fora, '# fora\n');
  f = anterioridadeDaEmenda({ repo, emendaPath: fora, emendaSha: shaDe(fora), spawnImpl: () => { throw new Error('nao devia chamar o git'); } });
  assert.equal(f.length, 1); assert.match(f[0], /fora do repo/);
  // o sha passado e o que se confronta: um sha que nao e o do ficheiro em disco reprova (o pre-voo passa o do ficheiro)
  f = anterioridadeDaEmenda({ repo, emendaPath: em, emendaSha: 'f'.repeat(64) });
  assert.equal(f.length, 1); assert.match(f[0], /!= origin\/main/);
});

/** Um `correr()` hermetico: tudo injectado, so o loop de tarefas/suplentes e real. */
function driverCorrer(h, { suplentes, prepararFalhaEm = [] }) {
  const ctx = h.ctx;
  ctx.raiz = path.join(ctx.home, 'raiz'); ctx.cache = path.join(ctx.raiz, 'cache');
  ctx.ledgerPath = path.join(ctx.home, 'custo-ledger.jsonl'); ctx.manifestoPath = path.join(ctx.home, 'manifesto.json'); ctx.analysisPath = path.join(ctx.home, 'analysis.json');
  ctx.preregSha = 'p'.repeat(64); ctx.analiseSha = 'a'.repeat(64); ctx.controladorSha = 'c'.repeat(64); ctx.head = 'h'; ctx.originMain = 'o'; ctx.runtime = { router_execute_sha256: 'r', inject_context_sha256: 'i' }; ctx.classificacoes = {}; ctx.classifyRecomenda = [];
  fs.rmSync(path.join(ctx.routerDirVivo, '.budget-freeze'), { force: true });
  fs.writeFileSync(path.join(ctx.routerDirVivo, 'classify.js'), ''); fs.writeFileSync(path.join(ctx.routerDirVivo, 'patterns.js'), ''); ctx.classifyPath = path.join(ctx.routerDirVivo, 'classify.js');
  ctx.preVooImpl = async () => ({ ok: true, falhas: [], avisos: [] }); ctx.cacheNmImpl = () => []; ctx.controloImpl = () => []; ctx.aquecerImpl = async () => ({ ok: true, ms: 1 });
  ctx.emendaSha = 'e'.repeat(64);
  ctx.prereg = { ...ctx.prereg, corpus: { ...ctx.prereg.corpus, suplentes } };
  const prepOrig = ctx.prepararImpl;
  ctx.prepararImpl = (c, tarefa) => (prepararFalhaEm.includes(tarefa.task_id) ? { ok: false, motivo: 'A:git_archive:128' } : prepOrig(c, tarefa));
  const inner = ctx.spawnImpl;
  ctx.spawnImpl = (exe, args, opts) => { if (String(args[0]).endsWith('custo-analise.mjs')) return { status: 0, stdout: '', stderr: '' }; const r = inner(exe, args, opts); if (args[0] === '-p' && args[1] === 'Responde apenas: OK') { const sid = args[args.indexOf('--session-id') + 1]; const d = path.join(ctx.home, '.claude', 'projects', 'x'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'a', message: { id: 'msg_s', model: 'claude-opus-5', usage: SONDA.usage } }) + '\n'); } return r; };
  const logs = []; ctx.log = (m) => logs.push(String(m));
  return { ctx, logs, eventos: () => lerLedger(fs.readFileSync(ctx.ledgerPath, 'utf8')).eventos, julgar: () => { const { eventos, linhasInvalidas } = lerLedger(fs.readFileSync(ctx.ledgerPath, 'utf8')); return analisar(ctx.prereg, eventos, { linhasInvalidas }); } };
}

test('correr() com --excluir de um SUPLENTE por emenda: fica na lista e e registado como tarefa_excluida quando seria consumido; a analise da valida (5.º revisor) — e a mordida: o pre-filtro silencioso dava suplente_fora_do_protocolo', async () => {
  const h = harness({ argv: ['--correr', '--excluir', 't02-7bb45751d8', '--emenda', 'C:/x/AMENDMENT-1.md'] });
  const d = driverCorrer(h, { suplentes: ['t02-7bb45751d8', 't09-07bdf37783'], prepararFalhaEm: ['t21-96171ef138'] });
  assert.equal(await correr(d.ctx), 0, d.logs.join(' | '));
  const ex = d.eventos().filter((e) => e.evento === 'tarefa_excluida');
  assert.deepEqual(ex.map((e) => [e.task_id, e.suplente_usado, e.motivo.split(':')[0]]), [['t21-96171ef138', 't02-7bb45751d8', 'worktree'], ['t02-7bb45751d8', 't09-07bdf37783', 'emenda']], 'o salto do suplente excluido fica no ledger');
  assert.ok(d.eventos().some((e) => e.evento === 'tentativa_fim' && e.task_id === 't09-07bdf37783'), 't09 correu no slot');
  const r = d.julgar();
  assert.equal(r.corrida_valida, true, JSON.stringify(r.corrida_invalida_por)); assert.equal(r.marcas_por_tipo.tarefa_substituida, 2); assert.equal(r.marcas_por_tipo.suplente_fora_do_protocolo, undefined);
  // mordida: o mesmo ledger SEM a linha da exclusao do t02 (o pre-filtro da 4.ª ronda) — a analise invalida
  const semRegisto = d.eventos().filter((e) => !(e.evento === 'tarefa_excluida' && e.task_id === 't02-7bb45751d8')).map((e) => (e.evento === 'tarefa_excluida' && e.task_id === 't21-96171ef138' ? { ...e, suplente_usado: 't09-07bdf37783' } : e));
  const rm = analisar(d.ctx.prereg, semRegisto, { linhasInvalidas: [] });
  assert.equal(rm.corrida_valida, false); assert.ok(rm.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /t02-7bb45751d8/.test(m.motivo)));
  // e o unico suplente excluido + slot a cair: paragem «sem suplentes», sem veredicto (honesto)
  const h2 = harness({ argv: ['--correr', '--excluir', 't02-7bb45751d8', '--emenda', 'C:/x/AMENDMENT-1.md'] });
  const d2 = driverCorrer(h2, { suplentes: ['t02-7bb45751d8'], prepararFalhaEm: ['t21-96171ef138'] });
  assert.equal(await correr(d2.ctx), 3);
  const p = d2.eventos().at(-1);
  assert.equal(p.evento, 'paragem'); assert.match(p.motivo, /sem suplentes/); assert.equal(fs.existsSync(caminhoDoSentinela(d2.ctx.routerDirVivo)), false);
  assert.equal(d2.julgar().primaria.limiar_descritivo_cumprido, null);
});

// ── `--verificar` e o 157: uma tarefa em `overrides.excluir` nao pode contar como falha ──────

/** Um `verificar()` hermetico sobre o harness de 2 tarefas (t22, t21): pai a falhar por
 * construcao (esperado), filho a passar — excepto quando `falharFilhoPara` nomeia o id
 * cujo filho deve falhar (mordida do controlo negativo). */
function construirCtxDeVerificar({ excluir = [], falharFilhoPara = null } = {}) {
  const h = harness();
  const ctx = h.ctx;
  ctx.raiz = path.join(ctx.home, 'raiz');
  ctx.classificacoes = {};   // preVooDaCorrida normalmente preenche isto; aqui e mockado
  ctx.overrides.excluir = excluir;
  ctx.preVooImpl = async () => ({ ok: true, falhas: [], avisos: [] });
  ctx.cacheNmImpl = () => [];
  ctx.snapshotImpl = () => ({ ok: true });
  ctx.instalarTesteImpl = () => {};
  const idsVistos = [];
  ctx.prepararImpl = (c, tarefa) => {
    idsVistos.push(tarefa.task_id);
    const d = path.join(ctx.snapshots, `${tarefa.task_id}-verificar`);
    fs.mkdirSync(d, { recursive: true });
    return { ok: true, dirs: { verificar: d }, comando: 'node', args: ['--test', tarefa.test_file], conteudo_teste: 'export {};\n' };
  };
  const sumario = (verde, hist) => (verde ? `ℹ tests ${hist}\nℹ pass ${hist}\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n` : `ℹ tests ${hist}\nℹ pass ${hist - 1}\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n`);
  ctx.spawnImpl = (exe, args, opts) => {
    const cwd = String(opts.cwd);
    const idAlvo = cwd.includes('t22-') ? 't22-11f81c79b7' : 't21-96171ef138';
    const hist = idAlvo === 't22-11f81c79b7' ? 55 : 26;
    if (cwd.includes('-verificar')) return { status: 1, signal: null, stdout: sumario(false, hist), stderr: '' };   // pai: falha por construcao (o esperado)
    if (cwd.includes('-controlo')) { const falha = idAlvo === falharFilhoPara; return { status: falha ? 1 : 0, signal: null, stdout: sumario(!falha, hist), stderr: '' }; }
    throw new Error(`spawn inesperado em verificar(): ${cwd}`);
  };
  const logs = []; ctx.log = (m) => logs.push(String(m));
  return { ctx, idsVistos, logs };
}

test('verificar(): --excluir por emenda fica «excluida por emenda», nao chama prepararImpl e nao conta como falha (157 no --verificar); sem excluir, um filho que falha da ✖ e exit 2 — a exclusao nao tapa tudo', async () => {
  // o filho da excluida FALHA (como a t23, morta por construcao): e exactamente o caso que dava exit 2 com «pre-voo da corrida: ok»
  const c1 = construirCtxDeVerificar({ excluir: ['t21-96171ef138'], falharFilhoPara: 't21-96171ef138' });
  const codigo1 = await verificar(c1.ctx);
  assert.equal(codigo1, 0, c1.logs.join(' | '));
  assert.ok(!c1.idsVistos.includes('t21-96171ef138'), 'a tarefa excluida nunca chega ao prepararImpl');
  assert.ok(c1.logs.some((l) => /^\s+—\s+t21-96171ef138.*excluida por emenda/.test(l)), c1.logs.join(' | '));
  assert.ok(c1.logs.some((l) => /^verificar: 1\/1 tarefas ok.*1 excluida por emenda/.test(l)), c1.logs.at(-1));

  // controlo negativo: sem --excluir, o filho de t21 falha -> nao passa a mensagem por baixo do tapete
  const c2 = construirCtxDeVerificar({ excluir: [], falharFilhoPara: 't21-96171ef138' });
  const codigo2 = await verificar(c2.ctx);
  assert.equal(codigo2, 2, c2.logs.join(' | '));
  assert.ok(c2.idsVistos.includes('t21-96171ef138'), 'sem exclusao a tarefa corre na mesma');
  assert.ok(c2.logs.some((l) => /^\s+✖\s+t21-96171ef138\b/.test(l)), c2.logs.join(' | '));
  assert.ok(!c2.logs.some((l) => /excluida por emenda/.test(l)), 'sem overrides.excluir nao ha linha de exclusao');
});
