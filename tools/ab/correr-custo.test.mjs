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
import { fileURLToPath } from 'node:url';

import {
  parseSumarioNodeTest, listagemSha, tectoDoOrcamento, encontrarTranscript, tokensDoTranscript, parseJsonDoCli,
  Ledger, linhaVazia, correrAceitacaoComProva, decidirAceite, argsClaudeP, correrClaudeP, correrLocal, classificar,
  construirContexto, carregarProtocolo, tarefaCompleta, ollamaHost, MODELO_OPUS, SENTINELA_CONTEUDO,
  correrTarefa, tentativaClaudeP, ollamaTagsComRetry, matarArvore,
} from './correr-custo.mjs';
import { CHAVES_OBRIGATORIAS, TIPOS_OBRIGATORIOS, violacoesDeTipo, SUPLENTES_ESPERADOS, analisar, lerLedger } from './custo-analise.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'correr-custo-'));

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
  const linhas = [
    JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'x' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { model: 'claude-opus-5', usage: { input_tokens: 2, output_tokens: 4, cache_creation_input_tokens: 58964, cache_read_input_tokens: 0 } } }),
    JSON.stringify({ type: 'assistant', uuid: 'a2', parentUuid: 'a1', message: { model: 'claude-haiku-4-5', usage: { input_tokens: 1000, output_tokens: 10 } } }),
    JSON.stringify({ type: 'assistant', uuid: 'a3', parentUuid: 'a2', message: { model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 58964 } } }),
    '{ truncada',
  ];
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), linhas.join('\n') + '\n');
  const p = encontrarTranscript(sid, home);
  assert.equal(p, path.join(dir, `${sid}.jsonl`));
  const t = tokensDoTranscript(p);
  assert.equal(t.total, 2 + 4 + 58964 + 10 + 20 + 58964);
  assert.equal(t.registos, 3); assert.equal(t.registos_opus, 2); assert.equal(t.linhas_ilegiveis, 1);
  assert.equal(encontrarTranscript(crypto.randomUUID(), home), null, 'nao encontrado -> null (o chamador escreve tokens_transcript 0)');
  assert.equal(encontrarTranscript('nao-e-uuid', home), null);
  assert.equal(tokensDoTranscript(path.join(home, 'nao-existe.jsonl')), null);
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
  assert.equal(morreu.motivo, 'cli_morreu:1'); assert.equal(morreu.stderr_tail, 'boom');
});

test('correrLocal: pin do runtime com --pin-model, texto so com ok:true, motivos por classe', () => {
  let visto = null;
  const okJson = { ok: true, text: 'resposta', model_used: 'qwen2.5-coder:14b', tokens_in: 100, tokens_out: 42, duration_ms: 1234 };
  const r = correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, modelo: 'qwen2.5-coder:14b', tectoS: 900, spawnImpl: (exe, args, opts) => { visto = { exe, args, opts }; return { status: 0, signal: null, stdout: JSON.stringify(okJson) + '\n', stderr: '' }; } });
  assert.equal(visto.exe, process.execPath); assert.deepEqual(visto.args, ['R', '--pin-provider=ollama', '--pin-model=qwen2.5-coder:14b', 'P']);
  assert.equal(r.texto, 'resposta'); assert.equal(r.motivo, null); assert.equal(r.json.tokens_out, 42);
  const semQuota = correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, modelo: 'm', tectoS: 1, spawnImpl: () => ({ status: 0, signal: null, stdout: JSON.stringify({ ok: false, error: { code: 'no_quota', message: 'ollama is not available' } }), stderr: '' }) });
  assert.equal(semQuota.texto, null); assert.match(semQuota.motivo, /^ollama:no_quota/);
  assert.equal(correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, modelo: 'm', tectoS: 1, spawnImpl: () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }) }).motivo, 'timeout');
  assert.equal(correrLocal({ routerExecute: 'R', prompt: 'P', cwd: 'w', env: {}, modelo: 'm', tectoS: 1, spawnImpl: () => ({ status: 2, signal: null, stdout: '', stderr: '' }) }).motivo, 'router_execute_morreu:2');
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

/** Um contexto de corrida hermético para DUAS tarefas T0 do prereg real (t22 B primeiro, t21 A primeiro). `local`/`claudeA` aceitam um valor ou um mapa por task_id. */
function harness({ local = 'ok', aceitacaoA = 'verde', aceitacaoEsc = 'verde', tags = 'ok', claudeA = 'json' } = {}) {
  const home = tmp();
  const ctx = construirContexto([], { env: { PATH: 'x' }, home, log: () => {} });
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
  const digest = '9ec8897f747e246e0000000000000000000000000000000000000000000000ab';
  ctx.modelos = new Map([['qwen2.5-coder:14b', digest]]);
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
    if (args[0] === 'CL.js') return { status: 0, signal: null, stdout: JSON.stringify({ tier: 'T0', recommended_model: 'qwen2.5-coder:14b', confidence: 0.6 }), stderr: '' };
    if (args[1] === '--pin-provider=ollama') {
      ultimoCwdLocal = opts.cwd;
      const modo = opcao(local, opts.cwd);
      if (modo === 'ok') return { status: 0, signal: null, stdout: JSON.stringify({ ok: true, text: 'Corre o teste e corrige a asserção.', model_used: 'qwen2.5-coder:14b', tokens_in: 900, tokens_out: 42, duration_ms: 1234 }) + '\n', stderr: '' };
      if (modo === 'timeout') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };
      return { status: 0, signal: null, stdout: JSON.stringify({ ok: false, error: { code: 'no_output', message: 'provider returned no usable text (http 500)' } }) + '\n', stderr: '' };
    }
    if (args[0] === '-p') {
      const sid = args[args.indexOf('--session-id') + 1];
      const ehA = String(opts.cwd).endsWith('-A');
      const modoA = opcao(claudeA, opts.cwd);
      if (ehA && modoA === 'timeout') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, pid: 4242, stdout: '', stderr: '' };
      if (ehA && modoA === 'spawn') return { status: null, signal: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' };
      return { status: 0, signal: null, pid: 4242, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: sid, usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd, duration_ms: SONDA.duration_ms + chamadas.length, num_turns: 4, result: 'ok' }), stderr: '[mooter] hook\n' };
    }
    if (args[0] === '--test') {
      const cwd = String(opts.cwd);
      const hist = (idDe(cwd) === 't21-96171ef138' ? t21 : t22).tests_total_historico;
      if (cwd.includes('-pv')) return { status: 1, signal: null, stdout: sumario(false, hist), stderr: '' };
      if (cwd.includes('-A')) return { status: aceitacaoA === 'verde' ? 0 : 1, signal: null, stdout: sumario(aceitacaoA === 'verde', hist), stderr: '' };
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
  assert.equal(local.executor, 'router-execute'); assert.equal(local.aceite, false); assert.equal(local.arrancou, true); assert.equal(local.tokens_locais, 42); assert.match(local.modelo_reportado, /^qwen2\.5-coder:14b@sha256:9ec8897f/); assert.equal(local.modelo_pedido, 'qwen2.5-coder:14b'); assert.equal(local.usage, null); assert.equal(local.session_id, null); assert.equal(local.e_escalacao, false); assert.equal(local.tentativa, 1); assert.equal(local.exit_code, 1);
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
  assert.match(local.modelo_reportado, /^qwen2\.5-coder:14b@sha256:9ec8897f/, 'o digest vem das tags, arrancado ou nao');
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
  await assert.rejects(() => correrTarefa(h2b.ctx, h2b.tarefa, h2b.ledger), /sem digest para qwen2\.5-coder:14b/);
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

test('ponta a ponta (NOTA DO TECTO, declarada): A morta aos 900 s que deixa o worktree verde escreve aceite:false com provas verdes -> a analise (19) INVALIDA; A morta com o worktree vermelho e um tecto honesto (27c so se faltar prova)', async () => {
  const h = harness({ claudeA: { 't22-11f81c79b7': 'timeout' }, aceitacaoA: 'verde' });
  await correrTarefa(h.ctx, h.tarefa, h.ledger);
  const A = h.linhas()[6];
  assert.equal(A.arrancou, false, 'sem JSON e sem transcript encontravel'); assert.equal(A.motivo_se_nao, 'timeout'); assert.equal(A.tecto_estourado, true); assert.equal(A.aceite, false, '138: sem JSON = nao aceite'); assert.equal(A.exit_code, 0); assert.equal(A.session_id, null, '102'); assert.equal(A.tokens_transcript, 0);
  assert.ok(h.chamadas.some((c) => c.exe === 'powershell'), '139: a arvore do processo e morta depois do tecto');
  const r = h.julgar();
  assert.equal(r.corrida_valida, false, 'a lacuna declarada no cabecalho: precisa da interpretacao 64');
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
