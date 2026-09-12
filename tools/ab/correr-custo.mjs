#!/usr/bin/env node
/**
 * correr-custo.mjs — o controlador do «Teste besta custo» (custo-2026-09-10).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ISTO É, E O QUE NÃO É
 *
 * O pré-registo (`custo-prereg.json`, congelado em main via #495) é a
 * INTENÇÃO. A análise (`custo-analise.mjs`, congelada em main via #502,
 * 63 interpretações) é o JUIZ. Este ficheiro é o TRATAMENTO: prepara os
 * worktrees, chama os executores, escreve o ledger. Não decide nada sobre o
 * resultado — nem sequer o lê. O que escreve é o que a análise julga, e a
 * análise foi construída durante 24 rondas adversariais a partir de ledgers
 * que um controlador defeituoso produziria. Os 133 pontos do brief dessas
 * rondas (mensagens de commit de #502) são o contrato deste ficheiro; os que
 * importam estão citados no sítio onde se cumprem, pelo número.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE FICHEIRO GARANTE
 *
 * 1. UMA corrida, sem retoma (prereg `regra_de_paragem`). Recusa-se a
 *    arrancar se o ledger já existir; nunca lê o ledger para «continuar»
 *    (brief 7.º/3, 76). Uma morte a meio escreve `paragem` num `finally`
 *    (75) e o que ficou é um prefixo publicado, nunca uma alegação.
 *
 * 2. NADA É INVENTADO. Cada linha `tentativa_fim` carrega as 31 chaves do
 *    prereg (12); ausente é `null`, nunca omitido, nunca `{}` (115, 121);
 *    `usage`/`modelUsage`/`total_cost_usd`/`session_id`/`num_turns` copiados
 *    do JSON do CLI tal como vêm (66, 71, 106); contagens parseadas do sumário
 *    do `node --test` (91, 82), nunca copiadas do histórico; `exit_code`
 *    numérico sempre que a aceitação correu, `-1` quando morta por sinal (8.º/1).
 *
 * 3. ARRANCOU É POR EVIDÊNCIA, NUNCA POR AFIRMAÇÃO (22, 56, 58). Com JSON →
 *    `arrancou: true` e o `session_id` do JSON. Sem JSON → procura-se o
 *    transcript do `--session-id` pré-gerado (98); ≥ 1000 tokens de Opus →
 *    `arrancou: true` com `tokens_transcript`; senão `arrancou: false` com o
 *    motivo (`timeout` | `spawn:<code>` | `cli_morreu:<exit>`) e `session_id`
 *    null (102). `tokens_transcript` está em TODA a claude-p (99, 103): `0` é
 *    «procurado, não encontrado».
 *
 * 4. O TECTO É 900 s POR TENTATIVA e «estourar o tecto = não aceite» (prereg
 *    `aceitacao.tecto_e_criterio`): o processo é morto, a aceitação corre na
 *    mesma para haver prova (8.º/1), e `aceite := false` com
 *    `tecto_estourado: true`. Ver a NOTA DO TECTO no fim deste cabeçalho.
 *
 * 5. O TRATAMENTO É O DO PRÉ-REGISTO, byte a byte. A: o executor literal do
 *    prereg mais `--session-id <uuid>` (instrumentação de evidência, não
 *    tratamento — ver 3). B: `classify.js` do RUNTIME (`~/.claude/tools/router`,
 *    sha congelado 427d8c0b…) sobre o prompt; T0/T1 → `router-execute
 *    --pin-provider=ollama` A SECO — o executor literal do prereg, com o
 *    modelo «resolvido em tempo de corrida por router-execute
 *    (OLLAMA_OPTION_A_MODEL, senão qwen2.5:3b)», que é exactamente a regra
 *    de `providers/ollama-api.js` — texto guardado fora do worktree, aceitação
 *    corrida, `aceite: false` com prova (7.º/5), depois UMA escalação com o
 *    executor de A no MESMO worktree, sem passar o texto (prereg
 *    `bracos.B.escalacao`); T2/T3 → o executor de A. O `recommended_model`
 *    do classify (qwen2.5-coder:14b nesta máquina) NÃO é o default: é o que
 *    o hook do produto escolheria, mas o prereg pinou o router-execute a
 *    seco, e trocar isso é AMENDMENT (`--modelo-local` + `--emenda`), não
 *    um default do código (2.º revisor do controlador). O classify fica
 *    registado no manifesto para a decisão. `modelo_reportado` =
 *    nome@sha256:digest do `/api/tags` do Ollama, lido depois de cada
 *    chamada; se o digest mudar a meio, `paragem` (prereg `modelo_local`).
 *
 * 6. O AMBIENTE É O DO PRÉ-REGISTO: sem `ANTHROPIC_*` (R7 — com a chave o
 *    tier muda e a corrida é INVÁLIDA por `tier_divergente`, 13.º/1), sem
 *    `CLAUDE_CODE_*`/`MOOTER_*` (`envDaCorrida` do R-24), fora de uma sessão
 *    Claude Code (`ambienteApto`), com o sentinela D15 posto antes da primeira
 *    tentativa e retirado depois da última, `estado_vivo_sha` e
 *    `sentinela_presente` lidos do disco A CADA linha (7.º/2), `tecto_do_orcamento`
 *    do cache congelado (número, ou «null=sem tecto» — um facto, nunca invisível).
 *
 * 7. AS DECISÕES DO DONO NÃO SE ESCONDEM NUM DEFAULT. O que o prereg pina
 *    (sha do `router-execute`, modelo local, corpus) só muda com `--emenda
 *    <AMENDMENT-n.md>`: o ficheiro tem de existir, o seu sha vai para o
 *    manifesto de execução, e sem ele qualquer flag de override é recusada.
 *    Sem emenda, o pré-voo recusa-se a arrancar com um `router-execute` que
 *    não seja o pinado — hoje (2026-09-11) o runtime já tem o de #498
 *    (`d30ce17c…`), portanto a corrida NÃO arranca sem uma decisão escrita.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTA DO TECTO (uma lacuna DECLARADA entre o prereg e a análise)
 *
 * O prereg diz «estourar o tecto = não aceite». A análise (interpretação 19)
 * diz que `aceite: false` com todas as provas verdes é contraditório e
 * INVÁLIDA a corrida. Uma claude-p SEM JSON (`usage`/`modelUsage` null) —
 * morta aos 900 s, ou o CLI a sair ≠ 0 com o transcript a provar que correu
 * — que deixou o worktree verde cai nas duas: este controlador escreve
 * `aceite: false` («sem JSON = não aceite», a metade que lhe cabe; a 19 já
 * afirma que `aceite: true` sem JSON é contraditório), as provas como
 * medidas e `tecto_estourado`, e a corrida sai INVÁLIDA pela 19 se isso
 * acontecer. O P7 mediu 872 s num braço em 46: não é raro o suficiente. A
 * solução é uma interpretação 64 na análise ANTES da corrida (`aceite: false`
 * com provas verdes não é contraditório numa claude-p sem JSON) — decisão do
 * dono, registada por AMENDMENT, não deste ficheiro.
 *
 * Da mesma classe, declarado: uma aceitação de A morta pelo tecto de 600 s
 * (`aceitacao_sinal: SIGTERM`, contagens null) é 27c na análise («aceite:
 * false em A sem prova») → INVÁLIDA; exige que a reparação deixe a suite
 * pendurada — raro, e visível na linha.
 *
 * Declarado também: `tokens_transcript` soma só o ficheiro do `session_id`;
 * subagentes em Opus vivem noutro ficheiro e o JSON agrega-os — a
 * `divergencia_json_vs_transcript` (só marca) vai disparar nessas linhas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Uso (na raiz do repositório, num terminal NORMAL — não dentro do Claude Code):
 *
 *   node tools/ab/correr-custo.mjs --verificar
 *       $0. Pré-voo completo: shas, CLI, Ollama, classify das 25, os 20+5
 *       worktrees (o teste falha no pai e passa no filho). Não escreve ledger.
 *
 *   node tools/ab/correr-custo.mjs --correr
 *       A corrida. Sonda paga no arranque (1 chamada), manifesto de execução,
 *       sentinela, 20 tarefas pela `ordem`, análise no fim. UMA vez.
 *
 *   node tools/ab/correr-custo.mjs --correr --so 2 --ledger <caminho novo>
 *       Fumo: as N ≤ 2 primeiras tarefas para um ledger à parte. NÃO é a
 *       corrida e nunca a fecha (N é limitado a `SO_MAXIMO`; o manifesto diz
 *       `so: N`; a análise dá «NAO fechou»).
 *
 *   Overrides (todos exigem --emenda <AMENDMENT-n.md>):
 *     --router-execute-sha <sha>   aceitar outro router-execute no runtime
 *     --modelo-local <nome>        pinar outro modelo no passo local
 *     --excluir <task_id>          excluir uma tarefa antes do pré-voo (suplente)
 *     --sem-subagentes             `--disallowedTools Task` nas claude-p (68)
 *   --repo <dir>   o checkout com os commits (por omissão a raiz deste ficheiro)
 *   --raiz <dir>   onde vivem worktrees, cache e saídas (por omissão <tmp>/custo-2026-09-10)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ambienteApto, instalarTesteDeAceitacao } from './mooter-use-ab.mjs';
import { dividirComando, resolverClaude, prepararSnapshot, testeDoFilho, prepararCacheNodeModules } from './correr-r24.mjs';
import { envDaCorrida, shaDoEnv, shaDoEstadoVivo, FICHEIROS_DE_ESTADO } from './r24-exposicao.mjs';
import { CHAVES_OBRIGATORIAS, SUPLENTES_ESPERADOS, TRANSCRIPT_MINIMO, SONDA_CACHE_OPUS } from './custo-analise.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const EXPERIMENT_ID = 'custo-2026-09-10';
export const SENTINELA_CONTEUDO = 'custo-2026-09-10';   // prereg pre_condicoes.D15
export const MODELO_OPUS = 'claude-opus-5';             // prereg bracos.A.executor; 14.º/1
export const TECTO_ACEITACAO_S = 600;                   // a aceitação não é a tentativa (93); 600 s chega para qualquer suite do corpus
export const SONDA_PROMPT = 'Responde apenas: OK';      // custo-fixture-sonda.json
export const SO_MAXIMO = 2;                             // 4.º revisor: um fumo NUNCA fecha a corrida — com N ≥ 20 era uma corrida inteira com veredicto, repetível sem limite

// ───────────────────────────────────────────────────────────────────────────
// Utilitários sem estado.
// ───────────────────────────────────────────────────────────────────────────

export const sha256 = (dados) => crypto.createHash('sha256').update(dados).digest('hex');
export const sha256Ficheiro = (p) => sha256(fs.readFileSync(p));
export const agora = () => new Date().toISOString();   // 11.º/1, 12.º/1: sempre esta forma
export const lerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * O sumário do `node --test` — a ÚNICA fonte das contagens (91, 82, 6.º).
 * O reporter `spec` escreve `ℹ tests N`; o `tap` escreve `# tests N`. Fica o
 * ÚLTIMO bloco (um teste que lança `node --test` por dentro imprime dois).
 * `tests_corridos` = a linha `tests` (o total), NUNCA `pass + fail` (91);
 * `skips` = `skipped + todo` (82). Sem sumário → null (o runner morreu).
 */
export function parseSumarioNodeTest(texto) {
  const chaves = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const re = /^(?:ℹ|#)\s+(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/;
  const linhas = String(texto || '').split(/\r?\n/);
  const out = {};
  const vistos = new Set();
  for (let i = linhas.length - 1; i >= 0 && vistos.size < chaves.length; i--) {
    const m = re.exec(linhas[i]);
    if (!m || vistos.has(m[1])) continue;
    vistos.add(m[1]); out[m[1]] = Number(m[2]);
    if (m[1] === 'tests' && vistos.has('pass')) break;   // o bloco começa em `tests`; com `pass` já visto, está completo
  }
  if (!Number.isFinite(out.tests) || !Number.isFinite(out.pass)) return null;
  return {
    tests_corridos: out.tests,
    tests_passados: out.pass,
    fail: Number.isFinite(out.fail) ? out.fail : null,
    cancelled: Number.isFinite(out.cancelled) ? out.cancelled : null,
    skips: (Number.isFinite(out.skipped) ? out.skipped : 0) + (Number.isFinite(out.todo) ? out.todo : 0),
  };
}

/**
 * A listagem do worktree (10.º/7, semântica DECLARADA): caminhos relativos e
 * tamanho em bytes de todos os ficheiros regulares, ordenados, sem
 * `node_modules` (é uma junção para o cache partilhado) nem `.git` (não
 * existe — `git archive`); não inclui conteúdo nem mtime. Apanha ficheiros
 * criados/apagados/reescritos com tamanho diferente; não apanha uma edição
 * do mesmo tamanho — e diz-se.
 */
export function listagemSha(raiz) {
  const linhas = [];
  (function andar(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) andar(p);
      else if (e.isFile()) { let s = 0; try { s = fs.statSync(p).size; } catch { s = -1; } linhas.push(`${path.relative(raiz, p).split(path.sep).join('/')}\t${s}`); }
    }
  })(raiz);
  linhas.sort();
  return sha256(linhas.join('\n'));
}

export const shaDoTestFile = (snapshot, testFile) => { try { return sha256Ficheiro(path.join(snapshot, testFile)); } catch { return null; } };

/** O modelo local do prereg (`pre_condicoes.modelo_local`): a regra de `providers/ollama-api.js:73` — `OLLAMA_OPTION_A_MODEL`, senão `qwen2.5:3b`. Com `--modelo-local` (emenda) é esse. */
export const MODELO_LOCAL_DEFAULT = 'qwen2.5:3b';
export const modeloLocalDoPrereg = (env, override = null) => override || (typeof env.OLLAMA_OPTION_A_MODEL === 'string' && env.OLLAMA_OPTION_A_MODEL.trim()) || MODELO_LOCAL_DEFAULT;

/** O sentinela D15 (prereg pre_condicoes.D15): `~/.claude/tools/router/.budget-freeze`. */
export const caminhoDoSentinela = (routerDirVivo) => path.join(routerDirVivo, '.budget-freeze');
export const sentinelaPresente = (routerDirVivo) => { try { return fs.existsSync(caminhoDoSentinela(routerDirVivo)); } catch { return null; } };

/**
 * `tecto_do_orcamento` (prereg pre_condicoes.estado_vivo.tecto_de_orcamento):
 * com o sentinela posto, o `getBudget` do hook devolve o cache FIXO, ou null se
 * o cache estiver em erro. O número registado é `data.five_hour.utilization`
 * (0–100) desse cache — a grandeza que o hook usa para baixar tiers — e a
 * string «null=sem tecto» quando não há cache utilizável. Um valor por linha,
 * lido do disco na altura (7.º/2); com o sentinela posto é o mesmo em todas.
 */
export function tectoDoOrcamento(routerDirVivo) {
  try {
    const j = lerJson(path.join(routerDirVivo, '.budget-cache.json'));
    const d = j && j.data;
    if (!d || typeof d !== 'object' || d.type === 'error') return 'null=sem tecto';
    const u = Number(d.five_hour && d.five_hour.utilization);
    return Number.isFinite(u) ? u : 'null=sem tecto';
  } catch { return 'null=sem tecto'; }
}

/** `~/.mooter/preferences.json` → `context_bridge` (session-context.js do router): lê-se e regista-se, não se muda. */
export function contextBridge(home) {
  try { const p = JSON.parse(fs.readFileSync(path.join(home, '.mooter', 'preferences.json'), 'utf8')); return { ficheiro: true, context_bridge: p.context_bridge === true }; } catch { return { ficheiro: false, context_bridge: false }; }
}

/** O estado vivo (prereg pre_condicoes.estado_vivo): os 4 ficheiros, sha de cada um e o sha agregado (`shaDoEstadoVivo`, o mesmo do R-24; 13.º/5). */
export function estadoVivo(routerDirVivo) {
  const ficheiros = {};
  for (const nome of FICHEIROS_DE_ESTADO) { try { ficheiros[nome] = sha256Ficheiro(path.join(routerDirVivo, nome)); } catch { ficheiros[nome] = 'AUSENTE'; } }
  return { sha: shaDoEstadoVivo(routerDirVivo), ficheiros };
}

/** Nome → digest dos modelos do Ollama (`/api/tags`). Nunca lança: `{ ok:false, motivo }` se o serviço não responder (79). */
export async function ollamaTags(host) {
  try {
    const r = await fetch(`${host}/api/tags`);
    if (!r.ok) return { ok: false, motivo: `tags http ${r.status}` };
    const j = await r.json();
    const modelos = new Map();
    for (const m of (j && j.models) || []) modelos.set(m.name, String(m.digest || ''));
    return { ok: true, modelos };
  } catch (e) { return { ok: false, motivo: `tags: ${e && e.message}` }; }
}

/**
 * 139: depois de um tecto, `TerminateProcess` matou só o filho directo — um
 * `node --test` ou um servidor lançado pelo agente pode continuar a escrever
 * no worktree ou a segurar ficheiros. Mata os descendentes pelo
 * `ParentProcessId` (que sobrevive à morte do pai). Só win32; nunca lança.
 */
export function matarArvore(pid, { spawnImpl = spawnSync, plataforma = process.platform } = {}) {
  if (!Number.isInteger(pid) || plataforma !== 'win32') return { tentado: false };
  const script = `$ErrorActionPreference='SilentlyContinue'; function K($p){ Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" | ForEach-Object { K $_.ProcessId; Stop-Process -Id $_.ProcessId -Force } }; K ${pid}`;
  const r = spawnImpl('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60_000, input: '' });
  return { tentado: true, ok: !r.error && r.status === 0 };
}

/** `/api/tags` com 3 tentativas (1 s entre elas): um `null` no `modelo_reportado` custa a validade da corrida (30), não se dá ao primeiro soluço. */
export async function ollamaTagsComRetry(host, { tentativas = 3, esperaMs = 1000, tagsImpl = ollamaTags } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    ultimo = await tagsImpl(host);
    if (ultimo.ok) return ultimo;
    if (i + 1 < tentativas) await new Promise((r) => setTimeout(r, esperaMs));
  }
  return ultimo;
}

/** 140: aquecer o modelo local ($0, 1 token) antes da primeira acção paga — o cold-load de 9 GB não cabe de certeza nos 240 s do pin. */
export async function aquecerModeloLocal(host, modelo, { tectoMs = 300_000 } = {}) {
  try {
    const t0 = Date.now();
    const r = await fetch(`${host}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: modelo, prompt: 'OK', stream: false, options: { num_predict: 1 } }), signal: AbortSignal.timeout(tectoMs) });
    return { ok: r.ok, ms: Date.now() - t0, http: r.status };
  } catch (e) { return { ok: false, motivo: e && e.message }; }
}

/** `OLLAMA_HOST` com esquema (a mesma regra de `tools/router/ollama-host.js`, sem o importar: é CJS e este ficheiro é ESM). */
export function ollamaHost(env = process.env) {
  const raw = String(env.OLLAMA_HOST || '').trim().replace(/\/+$/, '');
  if (!raw) return 'http://localhost:11434';
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}

/** O transcript `<session_id>.jsonl` em `~/.claude/projects/**` (profundidade ≤ 3). null se não existir. */
export function encontrarTranscript(sessionId, home = os.homedir()) {
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const raiz = path.join(home, '.claude', 'projects');
  let achado = null;
  (function andar(d, prof) {
    if (achado || prof > 3) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (achado) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p, prof + 1);
      else if (e.name === `${sessionId}.jsonl`) achado = p;
    }
  })(raiz, 0);
  return achado;
}

/**
 * Tokens de Opus de UM transcript (prereg secundaria.cruzamento): soma das 4
 * categorias, UMA VEZ POR RESPOSTA DA API. O Claude Code escreve uma linha por
 * bloco de conteúdo da mesma resposta (thinking + text, text + tool_use), cada
 * uma a repetir o mesmo `message.id` — somar linhas dava 1,4×–2,4× o facturado
 * (3.º revisor do controlador, medido em transcripts reais deste corpus: 2715
 * linhas / 1541 ids = 1,75×). A chave é `message.id` (fallback `requestId`,
 * depois `uuid`); `linhas_repetidas` fica no objecto.
 *
 * E o `usage` de cada resposta é o MÁXIMO por campo das suas linhas, não a 1.ª:
 * nos transcripts de subagentes (`<sessão>/subagents/agent-*.jsonl`) o
 * `output_tokens` das primeiras linhas é o contador em streaming (1–7) e só a
 * última traz o total — first-wins subcontava o output em 18,3% na janela dos
 * 40 (final-reviewer do #509, 2026-09-12; o mesmo defeito corrigido em
 * `tools/router/recibo.js`). Nos transcripts principais — os únicos que esta
 * função lê — mediram-se 0 desvios entre linhas do mesmo id (2026-09-12: 0 em
 * 442 principais, 1.551 em 99 de subagentes), portanto hoje o número não muda
 * — a correcção é para o formato não nos apanhar quando mudar. Só ESTE
 * ficheiro — subagentes noutro ficheiro não entram (declarado; o JSON é a
 * fonte primária, isto é o cruzamento).
 */
export function tokensDoTranscript(ficheiro) {
  let bruto = '';
  try { bruto = fs.readFileSync(ficheiro, 'utf8'); } catch { return null; }
  const t = { input: 0, output: 0, cache_creation: 0, cache_read: 0, registos: 0, registos_opus: 0, respostas_opus: 0, linhas_repetidas: 0, linhas_ilegiveis: 0 };
  const respostas = new Map();   // chave → máximo por campo das linhas da mesma resposta
  for (const l of bruto.split('\n')) {
    if (!l.trim()) continue;
    let o; try { o = JSON.parse(l); } catch { t.linhas_ilegiveis++; continue; }
    const u = o && o.message && o.message.usage;
    if (!u) continue;
    t.registos++;
    if (!/^claude-opus/i.test(String(o.message.model || ''))) continue;
    t.registos_opus++;
    const chave = (o.message && o.message.id) || o.requestId || o.uuid || `linha:${t.registos}`;
    const n = { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0, cache_creation: Number(u.cache_creation_input_tokens) || 0, cache_read: Number(u.cache_read_input_tokens) || 0 };
    const r = respostas.get(chave);
    if (!r) { respostas.set(chave, n); continue; }
    t.linhas_repetidas++;
    for (const k of Object.keys(n)) if (n[k] > r[k]) r[k] = n[k];
  }
  for (const r of respostas.values()) {
    t.respostas_opus++;
    t.input += r.input; t.output += r.output; t.cache_creation += r.cache_creation; t.cache_read += r.cache_read;
  }
  t.total = t.input + t.output + t.cache_creation + t.cache_read;
  return t;
}

/** O JSON do `--output-format json`: o stdout inteiro, ou a última linha que parseie (o resto é ruído de hooks). */
export function parseJsonDoCli(stdout) {
  const s = String(stdout || '');
  try { const j = JSON.parse(s); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* tenta por linha */ }
  const linhas = s.split(/\r?\n/).filter((l) => l.trim());
  for (let i = linhas.length - 1; i >= 0; i--) {
    try { const j = JSON.parse(linhas[i]); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* segue */ }
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// O ledger — escritor único, append-only, UTF-8 sem BOM, uma linha por evento.
// ───────────────────────────────────────────────────────────────────────────

export class Ledger {
  constructor(caminho) { this.caminho = caminho; this.fechado = false; this.n = 0; this.tarefasComLinha = new Set(); this.ultimaTarefa = null; }
  escrever(evento) {
    if (this.fechado) throw new Error(`ledger fechado por paragem — nada se escreve depois (76): ${evento.evento}`);
    fs.mkdirSync(path.dirname(this.caminho), { recursive: true });
    fs.appendFileSync(this.caminho, JSON.stringify(evento) + '\n', 'utf8');   // 61, 84: Node, sem BOM
    this.n++;
    // 134: `paragem.n`/`ultima_tarefa` contam o que a análise conta — tarefas com QUALQUER tentativa_fim/par_invalido no disco
    if ((evento.evento === 'tentativa_fim' || evento.evento === 'par_invalido') && typeof evento.task_id === 'string') { this.tarefasComLinha.add(evento.task_id); this.ultimaTarefa = evento.task_id; }
    return evento;
  }
  paragem(motivo, extra = {}) {
    if (this.fechado) return null;
    const e = this.escrever({ evento: 'paragem', ts: agora(), motivo, ultima_tarefa: this.ultimaTarefa, n: this.tarefasComLinha.size, ...extra });   // 116: sempre com motivo
    this.fechado = true;
    return e;
  }
}

/** A linha `tentativa_fim` com TODAS as chaves do prereg, a null por omissão (12.º/3: nunca omitir a chave). */
export function linhaVazia() {
  const l = {};
  for (const k of CHAVES_OBRIGATORIAS) l[k] = null;
  return l;
}

// ───────────────────────────────────────────────────────────────────────────
// A aceitação com prova (prereg aceitacao.definicao; 12/19; 8.º/1; 93).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Corre o `acceptance_cmd` pré-registado (64) e devolve as provas. Nunca decide
 * `aceite` — isso é do chamador, que tem o histórico e o pré-voo. Um runner que
 * não arranca (`spawn:*`) é ambiente partido: o chamador pára (9.º/4).
 */
export function correrAceitacaoComProva({ cwd, comando, args, env, tectoS = TECTO_ACEITACAO_S, spawnImpl = spawnSync }) {
  const exe = comando === 'node' ? process.execPath : comando;   // o mesmo Node que corre isto
  const t0 = Date.now();
  const r = spawnImpl(exe, args, { cwd, env, encoding: 'utf8', timeout: tectoS * 1000, maxBuffer: 64 * 1024 * 1024, input: '' });
  const aceitacao_duration_ms = Date.now() - t0;
  if (r.error && !r.signal) return { erro: `spawn:${r.error.code || r.error.message}`, aceitacao_duration_ms };
  const sumario = parseSumarioNodeTest(String(r.stdout || '') + '\n' + String(r.stderr || ''));
  return {
    erro: null,
    exit_code: r.signal ? -1 : (Number.isInteger(r.status) ? r.status : -1),   // 8.º/1: nunca null quando correu
    aceitacao_sinal: r.signal || null,
    aceitacao_duration_ms,
    tests_corridos: sumario ? sumario.tests_corridos : null,
    tests_passados: sumario ? sumario.tests_passados : null,
    skips: sumario ? sumario.skips : null,
    sumario_ok: !!sumario,
    stdout_sha256: sha256(String(r.stdout || '')),
  };
}

/** As 3 condições do prereg (mais a base de skips do pré-voo, 10.º/4) — `true` só com tudo; nunca com o tecto estourado. */
export function decidirAceite({ prova, shaAntes, shaDepois, historico, skipsBase, tectoEstourado }) {
  if (tectoEstourado) return false;
  if (!prova || prova.erro) return false;
  return prova.exit_code === 0
    && typeof shaAntes === 'string' && shaAntes === shaDepois
    && Number.isFinite(prova.tests_corridos) && prova.tests_corridos >= historico
    && Number.isFinite(prova.tests_passados) && prova.tests_passados >= historico
    && Number.isFinite(prova.skips) && Number.isFinite(skipsBase) && prova.skips <= skipsBase;
}

// ───────────────────────────────────────────────────────────────────────────
// Os executores.
// ───────────────────────────────────────────────────────────────────────────

/** Os argumentos do executor de A, na ordem literal do prereg, mais `--session-id` (98) e, com emenda, `--disallowedTools Task` (68). */
export function argsClaudeP(prompt, sessionId, { semSubagentes = false } = {}) {
  const a = ['-p', prompt, '--output-format', 'json', '--model', MODELO_OPUS, '--permission-mode', 'bypassPermissions', '--allow-dangerously-skip-permissions', '--session-id', sessionId];
  if (semSubagentes) a.push('--disallowedTools', 'Task');
  return a;
}

/**
 * Uma invocação `claude -p`. `ts_inicio` ANTES do spawn, `ts_fim` DEPOIS de o
 * processo morrer (8.º/4, 12.º/4); o tecto é o do prereg (900 s); `r.signal`
 * lido ANTES de `r.error` (8.º/3). Devolve o envelope sempre que parseia,
 * independentemente de `is_error` (9.º/1).
 */
export function correrClaudeP({ caminhoClaude, prompt, cwd, sessionId, env, tectoS, semSubagentes = false, spawnImpl = spawnSync }) {
  const ts_inicio = agora();
  const r = spawnImpl(caminhoClaude, argsClaudeP(prompt, sessionId, { semSubagentes }), {
    cwd, env, encoding: 'utf8', timeout: tectoS * 1000, killSignal: 'SIGTERM', maxBuffer: 256 * 1024 * 1024, input: '',
  });
  const ts_fim = agora();
  const json = parseJsonDoCli(r.stdout);
  let motivo = null;
  if (r.signal) motivo = 'timeout';
  else if (r.error) motivo = `spawn:${r.error.code || r.error.message}`;
  else if (!json) motivo = `cli_morreu:${Number.isInteger(r.status) ? r.status : 'n/d'}`;
  return {
    ts_inicio, ts_fim, json, motivo, pid: Number.isInteger(r.pid) ? r.pid : null,
    exit_status: Number.isInteger(r.status) ? r.status : null,
    sinal: r.signal || null,
    stdout: String(r.stdout || ''),
    stderr_tail: String(r.stderr || '').slice(-400),
    parede_ms: Date.parse(ts_fim) - Date.parse(ts_inicio),
  };
}

/** O passo local: `router-execute --pin-provider=ollama` do RUNTIME, a seco (o executor literal do prereg); `--pin-model` SÓ com a emenda `--modelo-local`. O texto NUNCA vai para o ledger (prereg ledger.campos). */
export function correrLocal({ routerExecute, prompt, cwd, env, pinModel = null, tectoS, spawnImpl = spawnSync }) {
  const ts_inicio = agora();
  const r = spawnImpl(process.execPath, [routerExecute, `--pin-provider=ollama`, ...(pinModel ? [`--pin-model=${pinModel}`] : []), prompt], {
    cwd, env, encoding: 'utf8', timeout: tectoS * 1000, killSignal: 'SIGTERM', maxBuffer: 64 * 1024 * 1024, input: '',
  });
  const ts_fim = agora();
  const json = parseJsonDoCli(r.stdout);
  let motivo = null;
  if (r.signal) motivo = 'timeout';
  else if (r.error) motivo = `spawn:${r.error.code || r.error.message}`;
  else if (!json) motivo = `router_execute_morreu:${Number.isInteger(r.status) ? r.status : 'n/d'}`;
  else if (json.ok !== true) motivo = `ollama:${(json.error && json.error.code) || 'no_output'}${json.error && json.error.message ? ':' + String(json.error.message).slice(0, 120) : ''}`;
  return { ts_inicio, ts_fim, json, motivo, texto: json && json.ok === true ? String(json.text || '') : null, stderr_tail: String(r.stderr || '').slice(-400), parede_ms: Date.parse(ts_fim) - Date.parse(ts_inicio) };
}

/** O classify congelado do runtime sobre o prompt, no ambiente da corrida (13.º/1). */
export function classificar({ classifyPath, prompt, env, spawnImpl = spawnSync }) {
  const r = spawnImpl(process.execPath, [classifyPath, prompt], { env, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024, input: '' });
  const j = parseJsonDoCli(r.stdout);
  if (!j || typeof j.tier !== 'string') return { ok: false, motivo: `classify:${r.error ? r.error.code : r.status}:${String(r.stderr || '').slice(0, 120)}` };
  return { ok: true, tier: j.tier, recommended_model: j.recommended_model ?? null, recommended_backend: j.recommended_backend ?? null, confidence: j.confidence ?? null };
}

// ───────────────────────────────────────────────────────────────────────────
// O contexto da corrida.
// ───────────────────────────────────────────────────────────────────────────

function flag(argv, nome) { const i = argv.indexOf(`--${nome}`); if (i < 0) return undefined; const v = argv[i + 1]; return v === undefined || String(v).startsWith('--') ? true : v; }   // 162: `--ledger --so 2` nao e um ledger chamado «--so»
function flagsTodas(argv, nome) { const out = []; for (let i = 0; i < argv.length; i++) if (argv[i] === `--${nome}` && argv[i + 1]) out.push(argv[i + 1]); return out; }

export function construirContexto(argv, { env = process.env, home = os.homedir(), log = console.log } = {}) {
  const repo = path.resolve(flag(argv, 'repo') || path.join(AQUI, '..', '..'));
  const raiz = path.resolve(flag(argv, 'raiz') || path.join(os.tmpdir(), EXPERIMENT_ID));
  const preregPath = path.join(repo, 'tools', 'ab', 'custo-prereg.json');
  const manifestPath = path.join(repo, 'tools', 'ab', 'r24-manifest.json');
  const analisePath = path.join(repo, 'tools', 'ab', 'custo-analise.mjs');
  const so = flag(argv, 'so') !== undefined ? (flag(argv, 'so') === true ? NaN : Number(flag(argv, 'so'))) : null;   // 151: `--so` sem valor nao e 1
  const ledgerFlag = flag(argv, 'ledger') === true ? null : flag(argv, 'ledger');   // 162: sem valor e como se nao existisse (o pre-voo acusa `--so` sem `--ledger`)
  const ledgerPath = ledgerFlag ? path.resolve(String(ledgerFlag)) : path.join(repo, 'tools', 'ab', 'custo-ledger.jsonl');
  const manifestoPath = ledgerFlag ? ledgerPath.replace(/\.jsonl$/i, '') + '-manifesto-de-execucao.json' : path.join(repo, 'tools', 'ab', 'custo-manifesto-de-execucao.json');
  const analysisPath = ledgerFlag ? ledgerPath.replace(/\.jsonl$/i, '') + '-analysis.json' : path.join(repo, 'tools', 'ab', 'custo-analysis.json');
  const routerDirVivo = path.join(home, '.claude', 'tools', 'router');
  const emendaPath = flag(argv, 'emenda') ? path.resolve(String(flag(argv, 'emenda'))) : null;
  const overrides = {
    router_execute_sha: flag(argv, 'router-execute-sha') || null,
    modelo_local: flag(argv, 'modelo-local') || null,
    excluir: flagsTodas(argv, 'excluir'),
    sem_subagentes: argv.includes('--sem-subagentes'),
  };
  return {
    argv, repo, raiz, preregPath, manifestPath, analisePath, so, ledgerFlag: !!ledgerFlag, ledgerPath, manifestoPath, analysisPath,
    routerDirVivo, home, emendaPath, overrides, log,
    env: envDaCorrida(env),   // 6: sem ANTHROPIC_/CLAUDE_CODE_/MOOTER_/CLAUDECODE
    envBruto: env,
    snapshots: path.join(raiz, 'worktrees', ledgerFlag ? path.basename(ledgerPath, '.jsonl') : 'corrida'), cache: path.join(raiz, 'cache'), saidas: path.join(raiz, 'saidas', ledgerFlag ? path.basename(ledgerPath, '.jsonl') : 'corrida'),   // 156: o fumo nao sobrescreve a corrida
    prereg: null, manifest: null, tarefasPorId: null, claude: null, modelos: null,
  };
}

/** Carrega prereg + manifesto e verifica os shas que o prereg declara sobre eles. */
export function carregarProtocolo(ctx) {
  const falhas = [];
  ctx.prereg = lerJson(ctx.preregPath);
  ctx.preregSha = sha256Ficheiro(ctx.preregPath);
  ctx.manifest = lerJson(ctx.manifestPath);
  const manifestoSha = sha256Ficheiro(ctx.manifestPath);
  if (manifestoSha !== ctx.prereg.corpus.manifesto_sha256) falhas.push(`r24-manifest.json ${manifestoSha.slice(0, 12)} != prereg corpus.manifesto_sha256 ${String(ctx.prereg.corpus.manifesto_sha256).slice(0, 12)}`);
  const tplSha = sha256(ctx.manifest.prompt_template || '');
  if (tplSha !== ctx.prereg.corpus.prompt_template_sha256) falhas.push(`prompt_template ${tplSha.slice(0, 12)} != prereg ${String(ctx.prereg.corpus.prompt_template_sha256).slice(0, 12)}`);
  ctx.tarefasPorId = new Map(ctx.manifest.tarefas.map((t) => [t.task_id, t]));
  for (const t of ctx.prereg.corpus.tarefas) if (!ctx.tarefasPorId.has(t.task_id)) falhas.push(`${t.task_id} do prereg não está no manifesto`);
  for (const s of ctx.prereg.corpus.suplentes) if (!ctx.tarefasPorId.has(s)) falhas.push(`suplente ${s} não está no manifesto`);
  return falhas;
}

/** A tarefa completa: meta do prereg (ou do manifesto + tabela pinada, para suplentes) + prompt do manifesto. */
export function tarefaCompleta(ctx, taskId, { slot = null } = {}) {
  const m = ctx.tarefasPorId.get(taskId);
  const p = ctx.prereg.corpus.tarefas.find((t) => t.task_id === taskId) || null;
  const sup = !p && SUPLENTES_ESPERADOS[taskId] ? SUPLENTES_ESPERADOS[taskId] : null;
  if (!m || (!p && !sup)) return null;
  return {
    task_id: taskId, commit: m.commit, parent: m.parent, test_file: m.test_file, acceptance_cmd: m.acceptance_cmd, acceptance_cwd: m.acceptance_cwd,
    prompt: m.prompt, prompt_sha256: m.prompt_sha256,
    tier_classificado: p ? p.tier_classificado : sup.tier_classificado,
    tests_total_historico: p ? p.tests_total_historico : (m.proof && m.proof.passes_at_child && m.proof.passes_at_child.tests_total) ?? sup.tests_total_historico,
    ordem_dos_bracos: p ? p.ordem_dos_bracos : (slot ? slot.ordem_dos_bracos : null),   // 14.º/4: o suplente herda a ordem do slot
    ordem: p ? p.ordem : (slot ? slot.ordem : null),
    suplente: !p,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// O pré-voo da corrida ($0): tudo o que tem de estar certo ANTES da primeira chamada.
// ───────────────────────────────────────────────────────────────────────────

export async function preVooDaCorrida(ctx, { comModelo = true } = {}) {
  const log = ctx.log;
  const falhas = [];
  const avisos = [];
  const pc = ctx.prereg.pre_condicoes;

  // 1. congelados no runtime E no repo (R4)
  for (const [nome, esperado] of [['classify.js', pc.congelados['classify.js']], ['patterns.js', pc.congelados['patterns.js']]]) {
    for (const dir of [ctx.routerDirVivo, path.join(ctx.repo, 'tools', 'router')]) {
      let real = null; try { real = sha256Ficheiro(path.join(dir, nome)); } catch { real = 'AUSENTE'; }
      if (real !== esperado) falhas.push(`${nome} em ${dir}: ${real.slice(0, 12)} != congelado ${esperado.slice(0, 12)}`);
    }
  }
  // 2. o runtime que o braço B chama (prereg manifesto_de_execucao: RUNTIME, não repo)
  ctx.routerExecutePath = path.join(ctx.routerDirVivo, 'router-execute.js');
  ctx.classifyPath = path.join(ctx.routerDirVivo, 'classify.js');
  let reSha = null; try { reSha = sha256Ficheiro(ctx.routerExecutePath); } catch { reSha = 'AUSENTE'; }
  let icSha = null; try { icSha = sha256Ficheiro(path.join(ctx.routerDirVivo, 'inject_context.js')); } catch { icSha = 'AUSENTE'; }
  ctx.runtime = { router_execute_sha256: reSha, inject_context_sha256: icSha };
  const reEsperado = ctx.overrides.router_execute_sha || pc.router_execute_sha256;
  if (reSha !== reEsperado) falhas.push(`router-execute.js no runtime é ${reSha.slice(0, 12)}, o prereg pina ${String(pc.router_execute_sha256).slice(0, 12)}${ctx.overrides.router_execute_sha ? ` (emenda: ${ctx.overrides.router_execute_sha.slice(0, 12)})` : ' — decisão do dono: emenda (--router-execute-sha + --emenda) ou repor o runtime'}`);
  if (icSha !== pc.inject_context_sha256) avisos.push(`inject_context.js no runtime é ${icSha.slice(0, 12)}, o prereg registou ${String(pc.inject_context_sha256).slice(0, 12)} (registado no manifesto; não é pino)`);
  // 3. emenda: qualquer override exige o ficheiro (7 do cabeçalho)
  const temOverride = ctx.overrides.router_execute_sha || ctx.overrides.modelo_local || ctx.overrides.excluir.length || ctx.overrides.sem_subagentes;
  if (temOverride && !ctx.emendaPath) falhas.push('overrides (--router-execute-sha/--modelo-local/--excluir/--sem-subagentes) exigem --emenda <AMENDMENT-n.md>');
  if (ctx.emendaPath) { try { ctx.emendaSha = sha256Ficheiro(ctx.emendaPath); } catch { falhas.push(`--emenda ${ctx.emendaPath} ilegível`); } }
  for (const id of ctx.overrides.excluir) if (!ctx.prereg.corpus.tarefas.some((t) => t.task_id === id) && !ctx.prereg.corpus.suplentes.includes(id)) falhas.push(`--excluir ${id}: não é tarefa do corpus nem suplente`);   // 159: um suplente morto no filho exclui-se por emenda
  // 4. anterioridade: o prereg em disco é o de origin/main (prereg anterioridade.ancora_externa)
  const om = spawnSync('git', ['show', 'origin/main:tools/ab/custo-prereg.json'], { cwd: ctx.repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (om.status !== 0) falhas.push(`git show origin/main:tools/ab/custo-prereg.json falhou: ${String(om.stderr || '').slice(0, 120)}`);
  else if (sha256(om.stdout) !== ctx.preregSha) falhas.push(`custo-prereg.json em disco (${ctx.preregSha.slice(0, 12)}) != origin/main (${sha256(om.stdout).slice(0, 12)})`);
  const omRef = spawnSync('git', ['rev-parse', 'origin/main'], { cwd: ctx.repo, encoding: 'utf8' });
  ctx.originMain = om.status === 0 && omRef.status === 0 ? String(omRef.stdout).trim() : null;
  // 5. a análise e este controlador commitados (prereg analise_congelada.script)
  const st = spawnSync('git', ['status', '--porcelain', '--', 'tools/ab/custo-analise.mjs', 'tools/ab/correr-custo.mjs', 'tools/ab/custo-prereg.json'], { cwd: ctx.repo, encoding: 'utf8' });
  if (st.status === 0 && String(st.stdout).trim()) falhas.push(`ficheiros do protocolo com alterações por commitar:\n${st.stdout}`);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ctx.repo, encoding: 'utf8' });
  ctx.head = head.status === 0 ? String(head.stdout).trim() : null;
  ctx.analiseSha = sha256Ficheiro(ctx.analisePath);
  const omAn = spawnSync('git', ['show', 'origin/main:tools/ab/custo-analise.mjs'], { cwd: ctx.repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });   // 168: «congelada em main via #502» confronta-se, nao se assume
  if (omAn.status !== 0) falhas.push(`git show origin/main:tools/ab/custo-analise.mjs falhou: ${String(omAn.stderr || '').slice(0, 120)}`);
  else if (sha256(omAn.stdout) !== ctx.analiseSha) falhas.push(`custo-analise.mjs em disco (${ctx.analiseSha.slice(0, 12)}) != origin/main (${sha256(omAn.stdout).slice(0, 12)}) — a analise que julga tem de ser a congelada em main`);
  ctx.controladorSha = sha256Ficheiro(fileURLToPath(import.meta.url));
  // 6. CLI pinado (prereg pre_condicoes.claude_cli) e ambiente
  if (comModelo) {
    const apto = ambienteApto(ctx.envBruto);
    if (!apto.apto) falhas.push(apto.motivo);
    if (ctx.envBruto.ANTHROPIC_API_KEY) avisos.push('ANTHROPIC_API_KEY está no terminal — é RETIRADA do ambiente da corrida (R7, 13.º/1)');
  }
  const cli = resolverClaude({ env: ctx.envBruto });
  if (!cli.ok) falhas.push(`claude: ${cli.motivo} (${cli.tentados.join(', ')})`);
  else {
    ctx.claude = cli;
    if (!cli.versao.startsWith(String(pc.claude_cli).split(' ')[0])) falhas.push(`claude --version «${cli.versao}» != pinado «${pc.claude_cli}»`);
  }
  // 7. Ollama e o modelo local (79; prereg modelo_local)
  ctx.ollama = ollamaHost(ctx.envBruto);
  const tags = await ollamaTags(ctx.ollama);
  if (!tags.ok) falhas.push(`Ollama em ${ctx.ollama}: ${tags.motivo} — 7 locais sem arrancar são INVÁLIDA por 45 (79)`);
  ctx.modelos = tags.ok ? tags.modelos : new Map();
  // 8. classify das 20 + 5 no ambiente da corrida: o tier tem de ser o pré-registado (8; 13.º/1-2)
  ctx.classificacoes = {};
  const ids = [...ctx.prereg.corpus.tarefas.map((t) => t.task_id), ...ctx.prereg.corpus.suplentes];
  for (const id of ids) {
    const t = tarefaCompleta(ctx, id);
    const c = classificar({ classifyPath: ctx.classifyPath, prompt: t.prompt, env: ctx.env });
    ctx.classificacoes[id] = c;
    if (!c.ok) { falhas.push(`${id}: ${c.motivo}`); continue; }
    if (c.tier !== t.tier_classificado) falhas.push(`${id}: classify diz ${c.tier}, o prereg pina ${t.tier_classificado} — a corrida seria INVÁLIDA por tier_divergente`);
  }
  // o modelo local e o do prereg (router-execute a seco), UM para a corrida inteira (a 5 exige unanimidade entre todos os locais); o classify fica registado para a decisao do dono
  ctx.modeloLocal = modeloLocalDoPrereg(ctx.env, ctx.overrides.modelo_local);
  ctx.modeloLocalDigest = ctx.modelos.has(ctx.modeloLocal) ? ctx.modelos.get(ctx.modeloLocal) : null;
  if (tags.ok && !ctx.modeloLocalDigest) falhas.push(`o modelo local ${ctx.modeloLocal} (${ctx.overrides.modelo_local ? 'emenda' : 'prereg: OLLAMA_OPTION_A_MODEL || qwen2.5:3b'}) não está no Ollama (${[...ctx.modelos.keys()].join(', ')})`);
  const recomendados = new Set(Object.values(ctx.classificacoes).filter((c) => c.ok && (c.tier === 'T0' || c.tier === 'T1')).map((c) => c.recommended_model));
  ctx.classifyRecomenda = [...recomendados];
  if (recomendados.size && !recomendados.has(ctx.modeloLocal)) avisos.push(`o classify recomendaria ${[...recomendados].join(', ')} para o passo local; o prereg pina o router-execute a seco (${ctx.modeloLocal}) — trocar e AMENDMENT (--modelo-local + --emenda)`);
  // 9. sentinela e ledger: uma corrida
  if (sentinelaPresente(ctx.routerDirVivo)) { let c = ''; try { c = fs.readFileSync(caminhoDoSentinela(ctx.routerDirVivo), 'utf8').trim(); } catch { /* n/d */ } falhas.push(`o sentinela ${caminhoDoSentinela(ctx.routerDirVivo)} já existe («${c}») — outra corrida, ou uma que morreu; o prereg diz «não é retomado». Retira-o à mão se tiveres a certeza.`); }
  if (fs.existsSync(ctx.ledgerPath)) falhas.push(`o ledger ${ctx.ledgerPath} já existe — UMA corrida (prereg regra_de_paragem); um fumo usa --ledger <caminho novo>`);
  if (ctx.so !== null && !ctx.ledgerFlag) falhas.push('--so exige --ledger <caminho novo> — o fumo não escreve no ledger da corrida');
  if (ctx.ledgerFlag && ctx.so === null) falhas.push('--ledger só com --so — a corrida escreve no ledger do prereg (tools/ab/custo-ledger.jsonl), nunca noutro caminho (155)');
  if (ctx.so !== null && !(Number.isInteger(ctx.so) && ctx.so > 0 && ctx.so <= SO_MAXIMO)) falhas.push(`--so N: N inteiro em 1..${SO_MAXIMO} — um fumo nunca fecha a corrida (prereg regra_de_paragem: UMA corrida, sem segunda)`);
  // 10. o estado vivo hoje vs o do congelamento (informativo: a regra é «não muda ENTRE a primeira e a última tentativa»)
  ctx.estadoVivo0 = estadoVivo(ctx.routerDirVivo);
  if (contextBridge(ctx.home).context_bridge) avisos.push('context_bridge LIGADO em ~/.mooter/preferences.json — o router-execute prefixa contexto da sessao do dono ao prompt local (169); e «o router como esta», mas contamina o passo local: registado no manifesto');
  for (const [nome, sha] of Object.entries(pc.estado_vivo.sha256_no_congelamento)) if (ctx.estadoVivo0.ficheiros[nome] !== sha) avisos.push(`estado vivo ${nome}: hoje ${String(ctx.estadoVivo0.ficheiros[nome]).slice(0, 12)}, no congelamento ${sha.slice(0, 12)} (informativo)`);
  for (const f of falhas) log(`  ✖ ${f}`);
  for (const a of avisos) log(`  · ${a}`);
  return { ok: falhas.length === 0, falhas, avisos };
}

// ───────────────────────────────────────────────────────────────────────────
// Worktrees.
// ───────────────────────────────────────────────────────────────────────────

/** Os TRÊS worktrees de uma tarefa (pré-voo, A, B) antes de qualquer pré-voo (70) — com o teste do filho instalado e o sha conferido igual nos três (10.º/5). */
export function prepararWorktrees(ctx, tarefa, { nomes = ['pv', 'A', 'B'] } = {}) {
  const t = testeDoFilho({ repo: ctx.repo, commit: tarefa.commit, testFile: tarefa.test_file });
  if (!t.ok) return { ok: false, motivo: t.motivo };
  const { comando, args } = dividirComando(tarefa.acceptance_cmd);
  const dirs = {};
  let sha = null;
  for (const nome of nomes) {
    const destino = path.join(ctx.snapshots, `${tarefa.task_id}-${nome}`);
    const s = prepararSnapshot({ repo: ctx.repo, parent: tarefa.parent, destino, acceptanceCwd: tarefa.acceptance_cwd, cacheNm: ctx.cache });
    if (!s.ok) return { ok: false, motivo: `${nome}:${s.motivo}` };
    const shaI = instalarTesteDeAceitacao({ snapshotDir: destino, ficheiroTeste: tarefa.test_file, conteudo: t.conteudo });
    const shaLido = shaDoTestFile(destino, tarefa.test_file);
    if (sha === null) sha = shaI;
    if (shaI !== sha || shaLido !== sha) return { ok: false, motivo: `test_file_sha divergente em ${nome}: ${shaI} / ${shaLido} vs ${sha}` };
    dirs[nome] = destino;
  }
  return { ok: true, dirs, sha_teste: sha, conteudo_teste: t.conteudo, comando, args };
}

// ───────────────────────────────────────────────────────────────────────────
// A corrida.
// ───────────────────────────────────────────────────────────────────────────

/** O envelope comum a todas as linhas da tarefa, lido do disco na altura (7.º/2). */
function ambienteDaLinha(ctx) {
  return { estado_vivo_sha: estadoVivo(ctx.routerDirVivo).sha, tecto_do_orcamento: tectoDoOrcamento(ctx.routerDirVivo), sentinela_presente: sentinelaPresente(ctx.routerDirVivo) };
}

class Paragem extends Error { constructor(motivo) { super(motivo); this.name = 'Paragem'; } }

/** O pré-voo de uma tarefa: o teste do filho tem de FALHAR no pai (prereg aceitacao.pre_voo_por_tarefa; 11.º/2; 63; 90; 100). */
export function preVooDaTarefa(ctx, tarefa, prep, ledger) {
  const ts = agora();   // 90/51: antes de qualquer tentativa_inicio da tarefa
  const amb = ambienteDaLinha(ctx);
  const prova = correrAceitacaoComProva({ cwd: path.join(prep.dirs.pv, tarefa.acceptance_cwd), comando: prep.comando, args: prep.args, env: ctx.env, spawnImpl: ctx.spawnImpl || spawnSync });
  const ts_fim = agora();
  if (prova.erro) throw new Paragem(`pre_voo de ${tarefa.task_id}: o runner da aceitacao nao arranca (${prova.erro}) — ambiente partido (9.º/4)`);
  if (!prova.sumario_ok) throw new Paragem(`pre_voo de ${tarefa.task_id}: sem sumario do node --test (exit ${prova.exit_code}) — runner morto, nao «pre-voo falhou» (11.º/2)`);
  const falhou = prova.exit_code !== 0;
  ledger.escrever({
    evento: 'pre_voo', ts, ts_inicio: ts, ts_fim, task_id: tarefa.task_id,
    exit_code: prova.exit_code, falhou, tests_corridos: prova.tests_corridos, tests_passados: prova.tests_passados, skips: prova.skips,
    aceitacao_sinal: prova.aceitacao_sinal, aceitacao_duration_ms: prova.aceitacao_duration_ms,
    test_file_sha: prep.sha_teste, tests_total_historico: tarefa.tests_total_historico,
    ...amb, worktree: prep.dirs.pv,
  });
  return { falhou, skips: prova.skips, exit_code: prova.exit_code, tests_corridos: prova.tests_corridos };
}

/**
 * Uma tentativa `claude -p` (A, B em T2/T3, ou a escalação de B), com
 * `tentativa_inicio` imediatamente antes do spawn (67, 73) e a linha
 * `tentativa_fim` SEMPRE (8.º/2), mesmo no spawn falhado.
 */
export function tentativaClaudeP(ctx, { tarefa, braco, tentativa, snapshot, prep, skipsBase, ledger, e_escalacao }) {
  const sessionId = crypto.randomUUID();   // 98
  const shaAntes = shaDoTestFile(snapshot, tarefa.test_file);
  if (shaAntes !== prep.sha_teste) throw new Paragem(`${tarefa.task_id}/${braco}: test_file_sha_antes ${shaAntes} != instalado ${prep.sha_teste} (10.º/5)`);
  const listAntes = listagemSha(snapshot);
  const amb = ambienteDaLinha(ctx);
  ledger.escrever({ evento: 'tentativa_inicio', ts_inicio: agora(), task_id: tarefa.task_id, braco, tentativa, e_escalacao, executor: 'claude-p', session_id_pedido: sessionId });
  const spawnImpl = ctx.spawnImpl || spawnSync;
  const r = correrClaudeP({ caminhoClaude: ctx.claude.caminho, prompt: tarefa.prompt, cwd: snapshot, sessionId, env: ctx.env, tectoS: ctx.prereg.aceitacao.tecto_por_tentativa_s, semSubagentes: ctx.overrides.sem_subagentes, spawnImpl });
  let saidaErro = null;   // 161: entre o spawn pago e a linha nada pode lançar — o usage tem de chegar ao ledger
  try {
    fs.mkdirSync(ctx.saidas, { recursive: true });
    fs.writeFileSync(path.join(ctx.saidas, `${tarefa.task_id}-${braco}-t${tentativa}.stdout.txt`), r.stdout, 'utf8');
    if (r.stderr_tail) fs.writeFileSync(path.join(ctx.saidas, `${tarefa.task_id}-${braco}-t${tentativa}.stderr-tail.txt`), r.stderr_tail, 'utf8');
  } catch (e) { saidaErro = `saidas:${e.code || e.message}`; }

  const j = r.json;
  // 3 do cabeçalho: arrancou por evidência; se o CLI ignorou o --session-id, procura-se tambem pelo id do JSON (165) e fica registado
  const sessionIdDivergente = !!(j && typeof j.session_id === 'string' && j.session_id !== sessionId);
  const transcriptPath = encontrarTranscript(sessionId, ctx.home) || (sessionIdDivergente ? encontrarTranscript(j.session_id, ctx.home) : null);
  const tr = transcriptPath ? tokensDoTranscript(transcriptPath) : null;
  const tokens_transcript = tr ? tr.total : 0;   // 99/103: 0 = procurado, não encontrado
  let arrancou, motivo_se_nao, session_id;
  if (j) { arrancou = true; motivo_se_nao = null; session_id = typeof j.session_id === 'string' ? j.session_id : sessionId; }
  else if (tr && tr.total >= TRANSCRIPT_MINIMO) { arrancou = true; motivo_se_nao = null; session_id = sessionId; }
  else { arrancou = false; motivo_se_nao = r.motivo || 'sem_json_sem_transcript'; session_id = null; }   // 102: null quando não há evidência
  // 2.º revisor: com JSON, o CLI provou quando acabou — o tecto mede-se pelo `duration_ms` do JSON (48); um sinal DEPOIS do JSON e o pipe herdado por um descendente, nao a tentativa. Sem JSON, o sinal ou a parede.
  const tectoMs = ctx.prereg.aceitacao.tecto_por_tentativa_s * 1000;
  const tectoEstourado = j ? (Number.isFinite(j.duration_ms) && j.duration_ms >= tectoMs) : (r.sinal !== null || r.parede_ms >= tectoMs);
  const arvoreMorta = r.sinal !== null ? matarArvore(r.pid, { spawnImpl }) : null;   // 139: os descendentes do agente não podem tocar no worktree durante a aceitação

  // D5: o sha DEPOIS do agente e ANTES do reinstall (6.º); a aceitação corre sempre que o CLI chegou (8.º/1)
  const shaDepois = shaDoTestFile(snapshot, tarefa.test_file);
  let prova = null;
  const spawnPuro = !arrancou && typeof motivo_se_nao === 'string' && motivo_se_nao.startsWith('spawn:');
  if (!spawnPuro) {
    try { instalarTesteDeAceitacao({ snapshotDir: snapshot, ficheiroTeste: tarefa.test_file, conteudo: prep.conteudo_teste }); prova = correrAceitacaoComProva({ cwd: path.join(snapshot, tarefa.acceptance_cwd), comando: prep.comando, args: prep.args, env: ctx.env, spawnImpl }); }
    catch (e) { prova = { erro: `reinstall:${e.code || e.message}`, aceitacao_duration_ms: null }; }   // 161: a linha sai na mesma; a paragem vem depois
  }
  // 138: sem JSON não há aceitação («estourar o tecto / morrer sem resultado = não aceite»; a 19 afirma o mesmo de `aceite: true` sem JSON)
  const aceite = (spawnPuro || tectoEstourado || !j || (prova && prova.erro)) ? false : decidirAceite({ prova, shaAntes, shaDepois, historico: tarefa.tests_total_historico, skipsBase, tectoEstourado });
  const chavesOpus = j && j.modelUsage && typeof j.modelUsage === 'object' ? Object.keys(j.modelUsage).filter((k) => /^claude-opus/i.test(k)) : [];

  const linha = {
    ...linhaVazia(), evento: 'tentativa_fim',
    ts_inicio: r.ts_inicio, ts_fim: r.ts_fim, task_id: tarefa.task_id, braco, tentativa, e_escalacao,
    tier_classificado: tarefa.tier_classificado, executor: 'claude-p', modelo_pedido: MODELO_OPUS,
    modelo_reportado: chavesOpus.length ? chavesOpus[0] : null,   // 137: UMA chave do modelUsage (a Opus); um subagente Haiku não entra aqui
    arrancou, motivo_se_nao,
    aceite,
    exit_code: prova && !prova.erro ? prova.exit_code : null, tests_corridos: prova && !prova.erro ? prova.tests_corridos : null, tests_passados: prova && !prova.erro ? prova.tests_passados : null, skips: prova && !prova.erro ? prova.skips : null,
    test_file_sha_antes: shaAntes, test_file_sha_depois: shaDepois,
    usage: j && j.usage && typeof j.usage === 'object' ? j.usage : null,          // 66: integral
    modelUsage: j && j.modelUsage && typeof j.modelUsage === 'object' ? j.modelUsage : null,
    total_cost_usd: j && Number.isFinite(j.total_cost_usd) ? j.total_cost_usd : null,
    duration_ms: j && Number.isFinite(j.duration_ms) ? j.duration_ms : r.parede_ms,   // 9.º/3: JSON quando existe, parede quando não
    session_id,
    tokens_locais: null, texto_local_sha256: null,
    ...amb,
    worktree_listagem_sha_antes: listAntes, worktree_listagem_sha_depois: listagemSha(snapshot),
    // extras (nenhuma é obrigatória; nenhuma substitui uma obrigatória)
    tokens_transcript, transcript: transcriptPath, session_id_pedido: sessionId, session_id_divergente: sessionIdDivergente, num_turns: j && Number.isInteger(j.num_turns) ? j.num_turns : null,
    is_error: j ? j.is_error === true : null, subtype: j && typeof j.subtype === 'string' ? j.subtype : null, cli_exit: r.exit_status, cli_sinal: r.sinal,
    tecto_estourado: tectoEstourado, parede_ms: r.parede_ms, sinal_depois_do_json: !!(j && r.sinal), arvore_morta: arvoreMorta, aceitacao_sinal: prova && !prova.erro ? prova.aceitacao_sinal : null, aceitacao_duration_ms: prova ? prova.aceitacao_duration_ms : null, aceitacao_erro: prova && prova.erro ? prova.erro : null,
    motivo_cli: j ? null : r.stderr_tail.slice(-200) || null,   // 86: distinguir crash de tecto
    tecto_por_tentativa_s: ctx.prereg.aceitacao.tecto_por_tentativa_s, worktree: snapshot, saidas_erro: saidaErro,
    estado_vivo_sha_depois: estadoVivo(ctx.routerDirVivo).sha, sentinela_presente_depois: sentinelaPresente(ctx.routerDirVivo),   // 153: uma mudanca DURANTE a ultima tentativa nao escapa
  };
  ledger.escrever(linha);   // 135: a linha com o consumo fica no ledger ANTES de qualquer paragem
  // 9.º/2: a saída (a) só para o spawn puro, depois da tentativa_fim, com braço e motivo copiados
  if (spawnPuro) ledger.escrever({ evento: 'par_invalido', ts: agora(), task_id: tarefa.task_id, braco, motivo: motivo_se_nao });
  if (prova && prova.erro) throw new Paragem(`${tarefa.task_id}/${braco}: o runner da aceitacao nao arranca (${prova.erro}) depois de um pre_voo que correu — ambiente mudado (9.º/4)`);
  return linha;
}

/** O passo local de B em T0/T1 (prereg bracos.B.passo_2_T0_T1): texto guardado FORA do worktree, aceitação corrida, `aceite: false` com prova (7.º/5, 82, 83, 85, 97). */
export async function tentativaLocal(ctx, { tarefa, snapshot, prep, skipsBase, ledger, classificacao }) {
  const modelo = ctx.modeloLocal;   // prereg: OLLAMA_OPTION_A_MODEL || qwen2.5:3b; com emenda, o --modelo-local
  void classificacao;   // o classify decidiu o TIER; o modelo do passo local e o do prereg, e o que o classify recomendaria esta no manifesto
  const shaAntes = shaDoTestFile(snapshot, tarefa.test_file);
  if (shaAntes !== prep.sha_teste) throw new Paragem(`${tarefa.task_id}/B local: test_file_sha_antes ${shaAntes} != instalado ${prep.sha_teste} (10.º/5)`);
  const listAntes = listagemSha(snapshot);
  const amb = ambienteDaLinha(ctx);
  ledger.escrever({ evento: 'tentativa_inicio', ts_inicio: agora(), task_id: tarefa.task_id, braco: 'B', tentativa: 1, e_escalacao: false, executor: 'router-execute', modelo_pedido: modelo });
  const spawnImpl = ctx.spawnImpl || spawnSync;
  const r = correrLocal({ routerExecute: ctx.routerExecutePath, prompt: tarefa.prompt, cwd: snapshot, env: ctx.env, pinModel: ctx.overrides.modelo_local || null, tectoS: ctx.prereg.aceitacao.tecto_por_tentativa_s, spawnImpl });
  let saidaErro = null;   // 161
  try {
    fs.mkdirSync(ctx.saidas, { recursive: true });
    fs.writeFileSync(path.join(ctx.saidas, `${tarefa.task_id}-B-t1.local.json`), JSON.stringify({ ...(r.json || {}), motivo: r.motivo, stderr_tail: r.stderr_tail }, null, 2) + '\n', 'utf8');
    if (r.texto !== null) fs.writeFileSync(path.join(ctx.saidas, `${tarefa.task_id}-B-t1.local.txt`), r.texto, 'utf8');   // nunca no ledger (prereg ledger.campos)
  } catch (e) { saidaErro = `saidas:${e.code || e.message}`; }
  const arrancou = r.texto !== null;
  // prereg modelo_local: nome E digest lidos DEPOIS da chamada, ARRANCADO OU NÃO (1.º revisor do controlador: um null aqui tira a validade à corrida inteira, 30 — e a 2 só é alcançável com o campo preenchido)
  const tags = await ollamaTagsComRetry(ctx.ollama, { tagsImpl: ctx.tagsImpl || ollamaTags });
  const modeloUsado = r.json && r.json.ok === true ? String(r.json.model_used || modelo) : modelo;
  const digest = tags.ok && tags.modelos.has(modeloUsado) ? tags.modelos.get(modeloUsado) : null;
  const digestMudou = arrancou && ctx.modelos.has(modeloUsado) && digest !== null && ctx.modelos.get(modeloUsado) !== digest;
  const shaDepois = shaDoTestFile(snapshot, tarefa.test_file);
  let prova;
  try { instalarTesteDeAceitacao({ snapshotDir: snapshot, ficheiroTeste: tarefa.test_file, conteudo: prep.conteudo_teste }); prova = correrAceitacaoComProva({ cwd: path.join(snapshot, tarefa.acceptance_cwd), comando: prep.comando, args: prep.args, env: ctx.env, spawnImpl }); }
  catch (e) { prova = { erro: `reinstall:${e.code || e.message}`, aceitacao_duration_ms: null }; }   // 161
  // 136: um local com a aceitação verde é `local_verde_rejeitado` (só marca na análise) e escala na mesma — um teste instável não mata a corrida única; fica registado e visível
  const verde = !prova.erro && decidirAceite({ prova, shaAntes, shaDepois, historico: tarefa.tests_total_historico, skipsBase, tectoEstourado: false });
  const linha = {
    ...linhaVazia(), evento: 'tentativa_fim',
    ts_inicio: r.ts_inicio, ts_fim: r.ts_fim, task_id: tarefa.task_id, braco: 'B', tentativa: 1, e_escalacao: false,
    tier_classificado: tarefa.tier_classificado, executor: 'router-execute', modelo_pedido: modelo,
    modelo_reportado: digest !== null ? `${modeloUsado}@sha256:${digest}` : null,   // null SÓ sem /api/tags — aí o n/d é honesto
    arrancou, motivo_se_nao: arrancou ? null : (r.motivo || 'sem_texto'),   // 83: explícito
    aceite: false,   // 12.º/2: booleano; por construção (DECLARACAO_DE_DEGENERESCENCIA); verde fica como `local_verde_rejeitado`
    exit_code: prova.erro ? null : prova.exit_code, tests_corridos: prova.erro ? null : prova.tests_corridos, tests_passados: prova.erro ? null : prova.tests_passados, skips: prova.erro ? null : prova.skips,
    test_file_sha_antes: shaAntes, test_file_sha_depois: shaDepois,
    usage: null, modelUsage: null, total_cost_usd: null, session_id: null,   // 11.º/4, 121
    duration_ms: r.json && r.json.ok === true && Number.isFinite(r.json.duration_ms) ? r.json.duration_ms : r.parede_ms,
    tokens_locais: arrancou ? (Number.isInteger(r.json.tokens_out) ? r.json.tokens_out : null) : null,   // 82: eval_count
    texto_local_sha256: arrancou ? sha256(r.texto) : null,
    ...amb,
    worktree_listagem_sha_antes: listAntes, worktree_listagem_sha_depois: listagemSha(snapshot),
    tokens_locais_in: arrancou && Number.isInteger(r.json.tokens_in) ? r.json.tokens_in : null, texto_local_bytes: arrancou ? Buffer.byteLength(r.texto, 'utf8') : null,   // 92
    aceitacao_sinal: prova.erro ? null : prova.aceitacao_sinal, aceitacao_duration_ms: prova.aceitacao_duration_ms, aceitacao_erro: prova.erro || null, aceitacao_verde: verde, ollama_host: ctx.ollama, ollama_tags_ok: tags.ok, worktree: snapshot, saidas_erro: saidaErro,
    estado_vivo_sha_depois: estadoVivo(ctx.routerDirVivo).sha, sentinela_presente_depois: sentinelaPresente(ctx.routerDirVivo),   // 153
  };
  ledger.escrever(linha);   // 135: a linha fica no ledger ANTES de qualquer paragem
  if (verde) ctx.log(`  · ${tarefa.task_id}/B local: aceitacao VERDE depois de um passo que nao edita (teste instavel ou ambiente) — registado, escala na mesma (136)`);
  if (prova.erro) throw new Paragem(`${tarefa.task_id}/B local: o runner da aceitacao nao arranca (${prova.erro}) — ambiente mudado (9.º/4)`);
  if (arrancou && digest === null) throw new Paragem(`${tarefa.task_id}/B local: sem digest para ${modeloUsado} no Ollama (${tags.ok ? 'modelo ausente' : tags.motivo}) — modelo_reportado nunca null numa chamada que correu (11.º/3)`);
  if (digestMudou) throw new Paragem(`${tarefa.task_id}/B local: o digest de ${modeloUsado} mudou a meio da corrida (${ctx.modelos.get(modeloUsado).slice(0, 12)} → ${String(digest).slice(0, 12)}) — INVALIDA (prereg modelo_local)`);
  return linha;
}

/** Uma tarefa inteira: pré-voo, depois os braços pela `ordem_dos_bracos` (prereg bracos.ordem; 11.º/6; 13.º/3). */
export async function correrTarefa(ctx, tarefa, ledger) {
  const prep = (ctx.prepararImpl || prepararWorktrees)(ctx, tarefa);
  if (!prep.ok) return { ok: false, motivo: `worktree:${prep.motivo}` };   // (a) do prereg: antes do pré-voo, suplente
  const pv = preVooDaTarefa(ctx, tarefa, prep, ledger);
  if (!pv.falhou) return { ok: false, motivo: 'ja verde', pre_voo: pv };   // (b) do prereg
  const skipsBase = pv.skips;
  const ordem = tarefa.ordem_dos_bracos === 'B-depois-A' ? ['A', 'B'] : ['B', 'A'];
  const linhas = [];
  for (const braco of ordem) {
    if (braco === 'A') { linhas.push(tentativaClaudeP(ctx, { tarefa, braco: 'A', tentativa: 1, snapshot: prep.dirs.A, prep, skipsBase, ledger, e_escalacao: false })); continue; }
    // B: o router como está — classify no ambiente da corrida, na altura (8; o pré-voo da corrida já conferiu os 25)
    const c = classificar({ classifyPath: ctx.classifyPath, prompt: tarefa.prompt, env: ctx.env, spawnImpl: ctx.spawnImpl || spawnSync });
    if (!c.ok) throw new Paragem(`${tarefa.task_id}/B: ${c.motivo}`);
    if (c.tier !== tarefa.tier_classificado) throw new Paragem(`${tarefa.task_id}/B: classify diz ${c.tier} e o prereg pina ${tarefa.tier_classificado} — o tratamento mudou a meio (8, 13.º/1)`);
    if (c.tier === 'T0' || c.tier === 'T1') {
      const local = await tentativaLocal(ctx, { tarefa, snapshot: prep.dirs.B, prep, skipsBase, ledger, classificacao: c });
      linhas.push(local);
      linhas.push(tentativaClaudeP(ctx, { tarefa, braco: 'B', tentativa: 2, snapshot: prep.dirs.B, prep, skipsBase, ledger, e_escalacao: true }));   // prereg bracos.B.escalacao: UMA, mesmo worktree, sem o texto
    } else {
      linhas.push(tentativaClaudeP(ctx, { tarefa, braco: 'B', tentativa: 1, snapshot: prep.dirs.B, prep, skipsBase, ledger, e_escalacao: false }));
    }
  }
  return { ok: true, linhas };
}

/** O manifesto de execução (prereg pre_condicoes.manifesto_de_execucao, CUSTO-15): o tratamento tal como vai ser aplicado. */
export function escreverManifesto(ctx, { sonda = null } = {}) {
  const m = {
    schema: 'mooter/custo-manifesto-de-execucao/1', experiment_id: EXPERIMENT_ID, escrito_em: agora(),
    prereg: { caminho: path.relative(ctx.repo, ctx.preregPath), sha256: ctx.preregSha, origin_main: ctx.originMain },
    analise: { caminho: 'tools/ab/custo-analise.mjs', sha256: ctx.analiseSha }, controlador: { caminho: 'tools/ab/correr-custo.mjs', sha256: ctx.controladorSha }, head: ctx.head,
    emenda: ctx.emendaPath ? { caminho: ctx.emendaPath, sha256: ctx.emendaSha, overrides: ctx.overrides } : null,
    cli: { caminho: ctx.claude.caminho, versao: ctx.claude.versao }, node: process.version, plataforma: `${process.platform} ${os.release()}`,
    runtime: { dir: ctx.routerDirVivo, ...ctx.runtime, classify_sha256: sha256Ficheiro(ctx.classifyPath), patterns_sha256: sha256Ficheiro(path.join(ctx.routerDirVivo, 'patterns.js')) },
    modelo_local: { nome: ctx.modeloLocal, digest: ctx.modeloLocalDigest, origem: ctx.overrides.modelo_local ? 'emenda (--modelo-local, --pin-model no router-execute)' : 'prereg pre_condicoes.modelo_local: router-execute a seco — OLLAMA_OPTION_A_MODEL, senao qwen2.5:3b (providers/ollama-api.js:73)', OLLAMA_OPTION_A_MODEL_no_ambiente: ctx.env.OLLAMA_OPTION_A_MODEL ?? null, classify_recomendaria: ctx.classifyRecomenda || [] },
    ollama_host: ctx.ollama, modelos_no_ollama: Object.fromEntries(ctx.modelos),
    context_bridge: contextBridge(ctx.home),   // «o router como está»: com isto ligado o router-execute prefixa contexto de sessão ao prompt local
    classificacoes: ctx.classificacoes,
    estado_vivo: { sentinela: caminhoDoSentinela(ctx.routerDirVivo), sentinela_conteudo: SENTINELA_CONTEUDO, sentinela_presente: sentinelaPresente(ctx.routerDirVivo), ...estadoVivo(ctx.routerDirVivo), tecto_do_orcamento: tectoDoOrcamento(ctx.routerDirVivo), derivacao_estado_vivo_sha: `sha256 de "<nome> <sha256 do ficheiro | ausente>" por linha, na ordem ${FICHEIROS_DE_ESTADO.join(', ')} (shaDoEstadoVivo do R-24)` },
    ambiente: { env_keys_sha256: shaDoEnv(ctx.env), removidos: 'ANTHROPIC_*, CLAUDE_CODE_*, MOOTER_*, CLAUDECODE', anthropic_api_key_no_terminal: !!ctx.envBruto.ANTHROPIC_API_KEY },
    executor_A: `claude ${argsClaudeP('<prompt>', '<uuid>', { semSubagentes: ctx.overrides.sem_subagentes }).join(' ')}`,
    executor_B_local: `node ${ctx.routerExecutePath} --pin-provider=ollama${ctx.overrides.modelo_local ? ` --pin-model=${ctx.overrides.modelo_local}` : ''} <prompt>`,
    tecto_por_tentativa_s: ctx.prereg.aceitacao.tecto_por_tentativa_s, tecto_aceitacao_s: TECTO_ACEITACAO_S,
    listagem_semantica: 'sha256 das linhas "<caminho relativo>\\t<bytes>" ordenadas, sem node_modules nem .git; não inclui conteúdo nem mtime',
    tecto_do_orcamento_semantica: '.budget-cache.json data.five_hour.utilization (0-100) do cache congelado; «null=sem tecto» sem cache utilizável',
    so: ctx.so, ledger: ctx.ledgerPath, raiz: ctx.raiz, sonda,
    nota_do_tecto: 'estourar o tecto = aceite:false com as provas como medidas e tecto_estourado:true; se as provas saírem verdes a análise (19) invalida — lacuna declarada no cabeçalho do controlador',
  };
  fs.mkdirSync(path.dirname(ctx.manifestoPath), { recursive: true });
  fs.writeFileSync(ctx.manifestoPath, JSON.stringify(m, null, 2) + '\n', 'utf8');
  return m;
}

/** A sonda paga (62, 78, 101): a chave do modelUsage tem de ser literalmente `claude-opus-5` e o transcript do `--session-id` tem de aparecer. */
export function sondar(ctx) {
  const sessionId = crypto.randomUUID();
  const r = correrClaudeP({ caminhoClaude: ctx.claude.caminho, prompt: SONDA_PROMPT, cwd: ctx.raiz, sessionId, env: ctx.env, tectoS: 180, semSubagentes: ctx.overrides.sem_subagentes, spawnImpl: ctx.spawnImpl || spawnSync });
  const j = r.json;
  const falhas = [];
  if (!j) falhas.push(`a sonda não devolveu JSON (${r.motivo}; stderr: ${r.stderr_tail.slice(-200)})`);
  else {
    if (j.is_error === true) falhas.push(`a sonda devolveu is_error: ${String(j.result || '').slice(0, 160)}`);
    const chaves = j.modelUsage && typeof j.modelUsage === 'object' ? Object.keys(j.modelUsage) : [];
    if (!chaves.includes(MODELO_OPUS)) falhas.push(`modelUsage sem a chave literal «${MODELO_OPUS}» (tem: ${chaves.join(', ') || 'nada'}) — a 33 invalidaria todas as linhas (62)`);
    if (!j.usage || typeof j.usage !== 'object') falhas.push('a sonda devolveu JSON sem usage');
  }
  const transcript = encontrarTranscript(sessionId, ctx.home);
  if (!transcript) falhas.push(`o transcript da sonda (${sessionId}) não foi encontrado em ~/.claude/projects — sem transcript, um tecto sem JSON é INVÁLIDA (58, 98)`);
  const tr = transcript ? tokensDoTranscript(transcript) : null;
  // controlo positivo da CANALIZAÇÃO na mesma corrida (transcript encontrado, somas a bater ≤ 1 %); a sonda tem 1 resposta/1 linha, portanto NÃO prova o dedup por message.id — esse fica provado pelo teste unitário com a forma real (4.º revisor, 160)
  if (tr && j && j.usage && typeof j.usage === 'object') {
    const totalJson = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((a, c) => a + (Number(j.usage[c]) || 0), 0);
    const d = totalJson > 0 ? Math.abs(tr.total - totalJson) / totalJson : 1;
    if (d > 0.01) falhas.push(`tokens do transcript (${tr.total}, ${tr.respostas_opus} respostas, ${tr.linhas_repetidas} linhas repetidas) vs usage do JSON (${totalJson}): ${(d * 100).toFixed(1)} % — o cruzamento não bate; o instrumento mente antes da corrida`);
  }
  const cache = j && j.modelUsage && j.modelUsage[MODELO_OPUS] ? (Number(j.modelUsage[MODELO_OPUS].cacheCreationInputTokens) || 0) + (Number(j.modelUsage[MODELO_OPUS].cacheReadInputTokens) || 0) : null;
  const aviso = cache !== null && cache < SONDA_CACHE_OPUS ? `cache_creation + cache_read da sonda = ${cache} < ${SONDA_CACHE_OPUS} da fixture — as linhas vão marcar abaixo_da_sonda (78/101: refazer a fixture por AMENDMENT ou aceitar as marcas)` : null;
  return { ok: falhas.length === 0, falhas, aviso, session_id: sessionId, json: j, transcript, tokens_transcript: tr ? tr.total : 0, ts_inicio: r.ts_inicio, ts_fim: r.ts_fim, cache_opus: cache };
}

/** A corrida inteira, com `paragem` em qualquer saída anormal (75) e nunca num fim normal (58 do brief; 30). */
export async function correr(ctx) {
  const log = ctx.log;
  const ledger = new Ledger(ctx.ledgerPath);
  const pv = await (ctx.preVooImpl || preVooDaCorrida)(ctx);
  if (!pv.ok) { log(`pre-voo da corrida: ${pv.falhas.length} falha(s) — nao arranca`); return 2; }
  fs.mkdirSync(ctx.raiz, { recursive: true });
  const dirsNm = [...new Set([...ctx.prereg.corpus.tarefas, ...ctx.prereg.corpus.suplentes.map((s) => ({ task_id: s }))].map((t) => (ctx.tarefasPorId.get(t.task_id) || {}).acceptance_cwd).filter(Boolean).concat(['.']))];
  (ctx.cacheNmImpl || prepararCacheNodeModules)({ repo: ctx.repo, cache: ctx.cache, dirs: dirsNm, log });
  // 157: o controlo do filho ANTES de pagar — as tarefas em jogo (menos as excluidas por emenda) e os suplentes que podem entrar
  const idsControlo = [...ctx.prereg.corpus.tarefas.slice().sort((a, b) => a.ordem - b.ordem).slice(0, ctx.so !== null ? ctx.so : undefined).map((t) => t.task_id), ...ctx.prereg.corpus.suplentes].filter((id) => !ctx.overrides.excluir.includes(id));
  const fc = (ctx.controloImpl || controloDoFilho)(ctx, idsControlo);
  for (const f of fc) log(`  ✖ ${f}`);
  if (fc.length) { log(`controlo do filho: ${fc.length} tarefa(s) morta(s) por construcao — nao arranca (157)`); return 2; }

  // D15: o sentinela ANTES de qualquer chamada — o hook da sonda pode lançar o refresh do cache (145); retirado em qualquer saída
  const tirarSentinela = () => { try { fs.rmSync(caminhoDoSentinela(ctx.routerDirVivo), { force: true }); } catch { /* n/d */ } };
  // 154: o sentinela e tambem a TRANCA — `wx` e atomico; dois --correr a passar o pre-voo na mesma janela nao pagam duas sondas nem entrelacam o ledger
  try { fs.writeFileSync(caminhoDoSentinela(ctx.routerDirVivo), SENTINELA_CONTEUDO, { encoding: 'utf8', flag: 'wx' }); }
  catch (e) { log(`o sentinela ${caminhoDoSentinela(ctx.routerDirVivo)} apareceu entre o pre-voo e o arranque (${e.code}) — outra instancia? nao arranca`); return 2; }
  // 165: um Ctrl+C durante o aquecimento ou a sonda nao pode deixar o sentinela posto (o cache do dono ficava congelado ate remocao manual)
  const onSinalCedo = () => { tirarSentinela(); process.exit(130); };
  process.on('SIGINT', onSinalCedo); process.on('SIGTERM', onSinalCedo);
  const aq = await (ctx.aquecerImpl || aquecerModeloLocal)(ctx.ollama, ctx.modeloLocal);   // 140
  log(`aquecimento do modelo local ${ctx.modeloLocal}: ${aq.ok ? `ok em ${aq.ms} ms` : `FALHOU (${aq.motivo || aq.http})`}`);
  if (!aq.ok) { tirarSentinela(); process.removeListener('SIGINT', onSinalCedo); process.removeListener('SIGTERM', onSinalCedo); return 2; }
  log('sonda paga (1 chamada)…');
  const sonda = sondar(ctx);
  for (const f of sonda.falhas) log(`  ✖ ${f}`);
  if (sonda.aviso) log(`  · ${sonda.aviso}`);
  if (!sonda.ok) { tirarSentinela(); process.removeListener('SIGINT', onSinalCedo); process.removeListener('SIGTERM', onSinalCedo); return 2; }
  log(`  sonda ok: ${sonda.json.modelUsage[MODELO_OPUS].inputTokens}+${sonda.json.modelUsage[MODELO_OPUS].outputTokens}+cache ${sonda.cache_opus} tokens, ${sonda.json.total_cost_usd} USD, transcript ${sonda.tokens_transcript} tokens`);

  let manifesto;
  try { manifesto = escreverManifesto(ctx, { sonda: { session_id: sonda.session_id, ts_inicio: sonda.ts_inicio, ts_fim: sonda.ts_fim, usage: sonda.json.usage, modelUsage: sonda.json.modelUsage, total_cost_usd: sonda.json.total_cost_usd ?? null, duration_ms: sonda.json.duration_ms ?? null, num_turns: sonda.json.num_turns ?? null, transcript: sonda.transcript, tokens_transcript: sonda.tokens_transcript, cache_opus: sonda.cache_opus, aviso: sonda.aviso } }); }
  catch (e) { tirarSentinela(); process.removeListener('SIGINT', onSinalCedo); process.removeListener('SIGTERM', onSinalCedo); log(`manifesto de execucao nao escrito (${e.code || e.message}) — nao arranca (166)`); return 2; }
  log(`manifesto de execucao: ${ctx.manifestoPath} (modelo local ${manifesto.modelo_local.nome} @ ${String(manifesto.modelo_local.digest).slice(0, 12)})`);

  const tarefas = ctx.prereg.corpus.tarefas.slice().sort((a, b) => a.ordem - b.ordem);
  const alvo = ctx.so !== null ? tarefas.slice(0, ctx.so) : tarefas;
  const suplentes = ctx.prereg.corpus.suplentes.slice();   // pela ordem da lista (9.º/6); um suplente excluido por emenda (159) fica na lista e e REGISTADO como tarefa_excluida no momento em que seria consumido — a analise so o conta como indisponivel se o vir no ledger (5.º revisor)
  const excluidas = new Set();
  let terminouNormalmente = false;
  const pararCom = (motivo) => { if (!ledger.fechado) ledger.paragem(motivo); };   // 134: n/ultima_tarefa vêm do que o Ledger escreveu
  const onSinal = () => { pararCom('sinal: interrompido pelo operador'); tirarSentinela(); process.exit(130); };
  process.removeListener('SIGINT', onSinalCedo); process.removeListener('SIGTERM', onSinalCedo);
  process.on('SIGINT', onSinal); process.on('SIGTERM', onSinal);
  process.on('exit', () => { if (!terminouNormalmente) pararCom('processo terminou sem fim normal (exit handler, 75)'); });
  try {
    for (const slot of alvo) {
      // a tarefa do slot, ou o próximo suplente quando (a) worktree, (b) já verde, ou emenda (--excluir)
      let id = slot.task_id;
      let tarefa = tarefaCompleta(ctx, id, { slot });
      for (;;) {
        if (excluidas.has(tarefa.task_id)) throw new Paragem(`${tarefa.task_id} excluída duas vezes (105)`);
        let motivo = null;
        if (ctx.overrides.excluir.includes(tarefa.task_id)) motivo = `emenda:${String(ctx.emendaSha).slice(0, 12)} (--excluir)`;
        let res = null;
        if (!motivo) { log(`[${slot.ordem}/${tarefas.length}] ${tarefa.task_id} (${tarefa.tier_classificado}, ${tarefa.ordem_dos_bracos})${tarefa.suplente ? ' — suplente' : ''}`); res = await correrTarefa(ctx, tarefa, ledger); if (res.ok) break; motivo = res.motivo; }
        excluidas.add(tarefa.task_id);
        const sup = suplentes.shift() || null;
        ledger.escrever({ evento: 'tarefa_excluida', ts: agora(), task_id: tarefa.task_id, motivo, suplente_usado: sup, slot: slot.task_id });
        log(`  excluida (${motivo}) → suplente ${sup || 'NENHUM'}`);
        if (!sup) throw new Paragem(`sem suplentes para o slot ${slot.task_id} (${motivo})`);
        tarefa = tarefaCompleta(ctx, sup, { slot });
        id = sup;
      }
    }
    terminouNormalmente = true;
  } catch (e) {
    pararCom(e instanceof Paragem ? e.message : `excepcao: ${e && e.stack ? e.stack.slice(0, 600) : e}`);
    log(`PARAGEM: ${e && e.message}`);
  } finally {
    tirarSentinela();   // D15: retirado DEPOIS da última
    process.removeListener('SIGINT', onSinal); process.removeListener('SIGTERM', onSinal);
  }
  if (!terminouNormalmente) return 3;
  log(`corrida terminada: ${ledger.n} eventos em ${ctx.ledgerPath}`);
  const an = (ctx.spawnImpl || spawnSync)(process.execPath, [ctx.analisePath, '--prereg', ctx.preregPath, '--ledger', ctx.ledgerPath, '--out', ctx.analysisPath], { cwd: ctx.repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  log(String(an.stdout || '')); if (an.stderr) log(String(an.stderr));
  return an.status === 0 ? 0 : 4;
}

/**
 * 157: o CONTROLO do filho ($0) — o teste do commit humano tem de PASSAR com
 * `passados ≥ histórico` — corre também em `--correr`, antes de pagar: um par
 * morto por construção (t23: 3/19 com 16 skips sem Playwright) não gasta duas
 * chamadas Opus para nascer «nenhum». Falha → decisão do dono (`--excluir` +
 * `--emenda`).
 */
export function controloDoFilho(ctx, ids) {
  const falhas = [];
  for (const id of ids) {
    const t = tarefaCompleta(ctx, id);
    const tf = testeDoFilho({ repo: ctx.repo, commit: t.commit, testFile: t.test_file });
    if (!tf.ok) { falhas.push(`${id}: ${tf.motivo}`); continue; }
    const destino = path.join(ctx.snapshots, `${id}-controlo`);
    const s = prepararSnapshot({ repo: ctx.repo, parent: t.commit, destino, acceptanceCwd: t.acceptance_cwd, cacheNm: ctx.cache });
    if (!s.ok) { falhas.push(`${id}: controlo ${s.motivo}`); continue; }
    instalarTesteDeAceitacao({ snapshotDir: destino, ficheiroTeste: t.test_file, conteudo: tf.conteudo });
    const { comando, args } = dividirComando(t.acceptance_cmd);
    const p = correrAceitacaoComProva({ cwd: path.join(destino, t.acceptance_cwd), comando, args, env: ctx.env, spawnImpl: ctx.spawnImpl || spawnSync });
    const ok = !p.erro && p.sumario_ok && p.exit_code === 0 && p.tests_corridos >= t.tests_total_historico && p.tests_passados >= t.tests_total_historico;
    if (!ok) falhas.push(`${id}: no commit humano o teste da ${p.erro || `exit ${p.exit_code} · ${p.tests_passados}/${p.tests_corridos} · skips ${p.skips}`} com historico ${t.tests_total_historico} — par morto por construcao neste ambiente (157; brief 81): --excluir ${id} --emenda <AMENDMENT-n.md>`);
  }
  return falhas;
}

/** `--verificar`: $0 — o pré-voo da corrida e os worktrees (o teste falha no pai e passa no filho). */
export async function verificar(ctx, { semControlo = false } = {}) {
  const log = ctx.log;
  const pv = await preVooDaCorrida(ctx, { comModelo: false });
  log(pv.ok ? 'pre-voo da corrida: ok' : `pre-voo da corrida: ${pv.falhas.length} falha(s)`);
  const porTier = {}; for (const [id, c] of Object.entries(ctx.classificacoes)) if (c.ok) (porTier[c.tier] = porTier[c.tier] || []).push(id);
  log(`classify (runtime, ambiente da corrida): ${Object.entries(porTier).map(([t, ids]) => `${t} ${ids.length}`).join(' · ')} · modelo local ${ctx.modeloLocal || 'n/d'} @ ${ctx.modeloLocalDigest ? ctx.modeloLocalDigest.slice(0, 12) : 'n/d'}${ctx.overrides.modelo_local ? ' (emenda)' : ' (prereg: OLLAMA_OPTION_A_MODEL || qwen2.5:3b)'}${ctx.classifyRecomenda && ctx.classifyRecomenda.length ? ` · o classify recomendaria ${ctx.classifyRecomenda.join(', ')}` : ''}`);
  fs.mkdirSync(ctx.raiz, { recursive: true });
  const ids = [...ctx.prereg.corpus.tarefas.map((t) => t.task_id), ...ctx.prereg.corpus.suplentes];
  const dirsNm = [...new Set(ids.map((id) => ctx.tarefasPorId.get(id).acceptance_cwd).concat(['.']))];
  prepararCacheNodeModules({ repo: ctx.repo, cache: ctx.cache, dirs: dirsNm, log });
  let falhas = 0;
  for (const id of ids) {
    const t = tarefaCompleta(ctx, id);
    const prep = prepararWorktrees(ctx, t, { nomes: ['verificar'] });
    if (!prep.ok) { log(`  ✖ ${id}: ${prep.motivo}`); falhas++; continue; }
    const pai = correrAceitacaoComProva({ cwd: path.join(prep.dirs.verificar, t.acceptance_cwd), comando: prep.comando, args: prep.args, env: ctx.env });
    const okPai = !pai.erro && pai.sumario_ok && pai.exit_code !== 0;
    let filho = null;
    if (!semControlo) {
      const destino = path.join(ctx.snapshots, `${id}-controlo`);
      const s = prepararSnapshot({ repo: ctx.repo, parent: t.commit, destino, acceptanceCwd: t.acceptance_cwd, cacheNm: ctx.cache });
      if (s.ok) { instalarTesteDeAceitacao({ snapshotDir: destino, ficheiroTeste: t.test_file, conteudo: prep.conteudo_teste }); filho = correrAceitacaoComProva({ cwd: path.join(destino, t.acceptance_cwd), comando: prep.comando, args: prep.args, env: ctx.env }); }
      else filho = { erro: s.motivo };
    }
    const okFilho = semControlo || (filho && !filho.erro && filho.sumario_ok && filho.exit_code === 0 && filho.tests_corridos >= t.tests_total_historico && filho.tests_passados >= t.tests_total_historico);
    if (!okPai || !okFilho) falhas++;
    log(`  ${okPai && okFilho ? 'ok' : '✖ '} ${id} ${t.tier_classificado} hist ${t.tests_total_historico} · pai exit ${pai.erro || pai.exit_code} ${pai.sumario_ok ? `${pai.tests_passados}/${pai.tests_corridos} skips ${pai.skips}` : 'SEM SUMARIO'}${filho ? ` · filho exit ${filho.erro || filho.exit_code} ${filho.sumario_ok ? `${filho.tests_passados}/${filho.tests_corridos} skips ${filho.skips}` : 'SEM SUMARIO'}` : ''}${t.suplente ? ' (suplente)' : ''}`);
  }
  log(`verificar: ${ids.length - falhas}/${ids.length} tarefas ok · ${pv.falhas.length} falha(s) de pre-voo · ${pv.avisos.length} aviso(s)`);
  return pv.ok && falhas === 0 ? 0 : 2;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const log = io.log ?? console.log;
  const ctx = construirContexto(argv, { env: io.env ?? process.env, home: io.home ?? os.homedir(), log });
  const falhas = carregarProtocolo(ctx);
  if (falhas.length) { for (const f of falhas) log(`  ✖ ${f}`); return 2; }
  if (argv.includes('--verificar')) return verificar(ctx, { semControlo: argv.includes('--sem-controlo') });
  if (argv.includes('--correr')) return correr(ctx);
  log('uso: node tools/ab/correr-custo.mjs --verificar | --correr [--so N --ledger <novo>] [--emenda <AMENDMENT-n.md> --router-execute-sha <sha> --modelo-local <nome> --excluir <task_id> --sem-subagentes] [--repo <dir>] [--raiz <dir>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e && e.stack || e); process.exit(1); });
}
