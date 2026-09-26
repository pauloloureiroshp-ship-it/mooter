#!/usr/bin/env node
// medir-p0.mjs — Mooter P0 · instrumento L0 (zero LLM, zero dependências, só leitura).
//
// Lê os transcripts do Claude Code (~/.claude/projects/**/*.jsonl) e mede, retroactivamente:
//   (1) ADERÊNCIA ao <router-hint>: por prompt humano, o host ficou no tier, delegou ao subagente
//       sugerido, delegou a outro, ou ignorou?
//   (2) TOKENS MEDIDOS por modelo, por dia e por âmbito (conversa principal vs subagente),
//       com cache_read / cache_creation (5m/1h) — deduplicados por message.id+requestId, com o
//       MÁXIMO de cada campo (o usage cresce ao longo das linhas do mesmo pedido).
//   (3) CUSTO DE DELEGAR: por execução de subagente, contexto do 1.º pedido (tamanho total e
//       quanto dele foi escrita de cache) e totais, agregado por tipo.
//   (+) CROSS-CHECK com as linhas `cost-state` (inclui chamadas de fundo que não vão ao transcript).
//
// Privacidade: nunca escreve texto de prompts, respostas, comandos ou caminhos. Ids de sessão e
// de projecto saem como sha256[:12]. Não escreve nada fora de --out. Não toca em tools/router,
// no decisions.log, no Ollama nem na GPU.
//
// Uso:  node medir-p0.mjs [--dir <projects>] [--desde ISO] [--ate ISO] [--out <dir>]
//                         [--so-frugal] [--probe] [--stdout]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const VERSAO = 'medir-p0/1.1.0 (2026-09-26)';
export const JANELA_HINT_MS = 30_000;

/** Subagentes do Mooter → tier efectivo (frontmatter `model:` dos agents/*.md, lido a 26/09). */
export const AGENTE_TIER = Object.freeze({
  'local-summarizer': 'T0', // model: haiku a orquestrar Ollama → conta como tentativa T0
  'local-transformer': 'T0',
  'cheap-triage': 'T1',
  'mooter-dispatch': 'T1',
  'model-reasoner': 'T2',
  'model-architect': 'T3',
  'final-reviewer': 'T3',
});

const VAZIOS = new Set(['', 'none', 'null', 'undefined', 'n/a', '-']);

export function sha12(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
}

/** Tira o prefixo de plugin (`mooter:cheap-triage` → `cheap-triage`). */
export function semPrefixo(nome) {
  return String(nome || '').replace(/^[^:]+:/, '');
}

/** Mapa sem protótipo: uma chave vinda dos dados (`constructor`, `__proto__`) é só uma chave. */
export const dict = () => Object.create(null);

/**
 * Rótulos que podem sair no relatório. O que não tem a forma esperada sai como `outro` — nunca um
 * hash, que com um dicionário de candidatos (caminhos, nomes de projecto) seria reversível.
 *  - rotuloSeguro: identificador curto sem espaços, @, nem separadores de caminho (chaves da sonda, tools).
 *  - rotuloModelo: só nomes com a forma de um id de modelo de uma família conhecida.
 *  - rotuloVersao: só versões semver.
 *  - rotuloAgente: só nomes kebab-case em minúsculas (forma dos agents/*.md).
 */
// `--` é como o ~/.claude/projects codifica um caminho (C--Users-…): nenhum rótulo o pode ter.
export function rotuloSeguro(s) {
  const t = String(s);
  if (t === 'n/d') return t;
  return /^(?!.*--)[A-Za-z0-9][A-Za-z0-9._:+*[\]-]{0,63}$/.test(t) ? t : 'outro';
}
/** Chave de topo de um registo (sonda): camelCase/snake_case, como as do esquema do Claude Code. */
export function rotuloChave(s) {
  const t = String(s);
  return /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(t) ? t : 'outro';
}
/**
 * Id de modelo pela FORMA de cada família, não só pelo prefixo: `claude-C--Users-…` não passa.
 * Resíduo declarado: um nome local em minúsculas com a forma de uma tag (`qwen-algo:7b`) passa.
 */
export const RE_MODELO = new RegExp('^(?:' + [
  String.raw`(?:(?:us|eu|apac)\.)?(?:anthropic\.)?claude-(?:\d(?:-\d)?-)?(?:opus|sonnet|haiku|fable|instant)(?:-\d{1,2}){0,2}(?:-\d{8})?(?:-v\d:\d)?(?:\[1m\])?`,
  String.raw`gpt-\d(?:\.\d)?(?:-(?:mini|nano|pro|turbo|codex|preview|\d{4}-\d{2}-\d{2})){0,3}`,
  String.raw`o\d(?:-(?:mini|pro|preview|high|low))?(?:-\d{4}-\d{2}-\d{2})?`,
  String.raw`(?:gpt-\d(?:\.\d)?-)?codex(?:-(?:mini|max|\d(?:\.\d)?))?`,
  String.raw`gemini-\d(?:\.\d)?-(?:pro|flash|ultra)(?:-(?:lite|preview|exp|\d{2}-\d{2}))*`,
  String.raw`(?:qwen|llama|gemma|deepseek|mistral|mixtral|phi|granite|glm|minimax|kimi|moonshot|nomic)[a-z0-9.]{0,12}(?:-[a-z0-9.]{1,16}){0,4}(?::[a-z0-9.]{1,16})?`,
].join('|') + ')$');
export function rotuloModelo(s) {
  const t = String(s);
  return t === 'n/d' ? t : RE_MODELO.test(t) ? t : 'outro';
}
export function rotuloVersao(s) {
  const t = String(s);
  return /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[.-][A-Za-z0-9.]{1,20})?$/.test(t) ? t : 'outro';
}
/**
 * Tipo de agente: só nomes CONHECIDOS (os do Mooter e os que vêm com o Claude Code). Um agente definido
 * pelo utilizador sai como `outro` — a forma de um nome não prova que ele não é privado.
 */
export const AGENTES_CONHECIDOS = new Set([
  ...Object.keys(AGENTE_TIER),
  'general-purpose', 'Explore', 'Plan', 'statusline-setup', 'claude-code-guide', 'output-style-setup',
]);
export function rotuloAgente(s) {
  const t = String(s);
  return t === 'n/d' ? t : AGENTES_CONHECIDOS.has(t) ? t : 'outro';
}

/** Modelo → tier. Fable e Opus contam como T3 (topo). null quando não reconhecido. */
export function modelToTier(model) {
  const m = String(model || '').toLowerCase();
  if (!m || m === '<synthetic>') return null;
  if (m.includes('opus') || m.includes('fable')) return 'T3';
  if (m.includes('sonnet')) return 'T2';
  if (m.includes('haiku')) return 'T1';
  if (/qwen|ollama|local|gemma|deepseek|granite|llama|mistral|phi/.test(m)) return 'T0';
  return null;
}

/** Extrai o bloco <router-hint> de um texto. Rejeita cópias de código-fonte (template literals). */
export function parseRouterHint(text) {
  if (typeof text !== 'string' || !text.includes('<router-hint>')) return null;
  const m = text.match(/<router-hint>([\s\S]*?)<\/router-hint>/);
  if (!m) return null;
  const body = m[1];
  const get = (k) => {
    const r = body.match(new RegExp('^\\s*' + k + ':\\s*([^\\r\\n]*)$', 'm'));
    return r ? r[1].trim() : null;
  };
  const tier = get('tier');
  if (!/^T[0-3]$/.test(tier || '')) return null; // `${decision.tier}` e afins não passam
  let sub = get('suggested_subagent');
  if (sub != null) {
    sub = semPrefixo(sub);
    if (VAZIOS.has(sub.toLowerCase()) || !/^[a-z0-9][a-z0-9_-]*$/i.test(sub)) sub = null;
  }
  const conf = Number.parseFloat(get('confidence'));
  return {
    tier,
    sub,
    confidence: Number.isFinite(conf) ? conf : null,
    forced: /^\s*FORCED:\s*true/m.test(body),
    override: /USER OVERRIDE ACTIVE/.test(body),
    pinned_local: text.includes('<pinned-local-execution'),
  };
}

/** Todas as strings de um valor (recursivo), com tecto. */
function coletarStrings(v, out = [], budget = { n: 0 }) {
  if (budget.n > 2_000_000) return out;
  if (typeof v === 'string') { out.push(v); budget.n += v.length; return out; }
  if (Array.isArray(v)) { for (const x of v) coletarStrings(x, out, budget); return out; }
  if (v && typeof v === 'object') { for (const x of Object.values(v)) coletarStrings(x, out, budget); }
  return out;
}

function textoDoUser(d) {
  const c = d.message && d.message.content;
  if (typeof c === 'string') return { texto: c, temToolResult: false };
  if (Array.isArray(c)) {
    return {
      texto: c.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n'),
      temToolResult: c.some((b) => b && b.type === 'tool_result'),
    };
  }
  return { texto: '', temToolResult: false };
}

const RE_HOOK_TAG = /<user-prompt-submit-hook>([\s\S]*?)<\/user-prompt-submit-hook>/g;

/**
 * Texto de onde um hint LEGÍTIMO (saída do hook UserPromptSubmit) pode vir. Fontes aceites:
 *  - attachment cujo type contém "hook" (ex.: hook_additional_context) e, se trouxer nome de evento,
 *    que seja UserPromptSubmit;
 *  - system com hookAdditionalContext cujo subtype não é de Stop/SubagentStop;
 *  - user isMeta (injecção do harness);
 *  - formato antigo: só o que está DENTRO de <user-prompt-submit-hook>…</user-prompt-submit-hook>.
 * Nunca: texto colado pelo utilizador, tool_result, ficheiros editados, memória, assistant.
 */
export function textoHintLegitimo(d) {
  if (!d || typeof d !== 'object') return '';
  if (d.type === 'attachment' && d.attachment) {
    const tipo = String(d.attachment.type || '');
    if (!/hook/i.test(tipo)) return '';
    const evento = String(d.attachment.hookEvent || d.attachment.hookName || d.attachment.hook_event_name || '');
    if (evento && !/UserPromptSubmit/i.test(evento)) return '';
    return coletarStrings(d.attachment).join('\n');
  }
  if (d.type === 'system' && d.hookAdditionalContext) {
    if (/stop/i.test(String(d.subtype || ''))) return '';
    return coletarStrings(d.hookAdditionalContext).join('\n');
  }
  if (d.type === 'user') {
    const { texto, temToolResult } = textoDoUser(d);
    if (temToolResult) return '';
    if (d.isMeta) return texto;
    // Formato antigo: o harness ACRESCENTAVA a saída do hook no fim do prompt. Um invólucro no meio
    // do texto é citação do utilizador e não conta; só o último, e só se nada vier depois dele.
    const todas = [...texto.matchAll(RE_HOOK_TAG)];
    const ultima = todas[todas.length - 1];
    if (!ultima || texto.slice(ultima.index + ultima[0].length).trim()) return '';
    return ultima[1];
  }
  return '';
}

/** Candidatos em QUALQUER fonte (só para a sonda: diz onde aparecem, aceites ou não). */
function textoHintQualquer(d) {
  if (!d || typeof d !== 'object' || d.type === 'assistant') return '';
  if (d.type === 'user') { const { texto, temToolResult } = textoDoUser(d); return temToolResult ? '' : texto; }
  return coletarStrings([d.attachment, d.hookAdditionalContext, d.content]).join('\n');
}

/** Prompt humano real (não tool_result, meta, compactação, notificação ou lembrete). */
export function isHumanPrompt(d) {
  if (!d || d.type !== 'user' || d.isSidechain || d.isMeta || d.toolUseResult !== undefined) return false;
  if (d.isCompactSummary || d.isVisibleInTranscriptOnly) return false;
  if (d.turnOrigin && d.turnOrigin !== 'human') return false;
  if (d.origin && typeof d.origin === 'object' && d.origin.kind && d.origin.kind !== 'human') return false;
  if (textoDoUser(d).temToolResult) return false;
  const limpo = textoLimpo(d);
  if (!limpo) return false;
  if (/^(<local-command-stdout>|<local-command-caveat>|<local-command-stderr>|<task-notification>|<bash-input>|<bash-stdout>|<bash-stderr>|Caveat:|\[Request interrupted|This session is being continued from a previous conversation)/.test(limpo)) return false;
  return true;
}

/**
 * O comando INVOCA o router-execute com node (não basta mencioná-lo: echo, cat, grep, comentário).
 * Resíduo declarado: uma string entre aspas que imite a invocação (`echo "node …router-execute.js"`).
 */
const RE_INVOCA_ROUTER_EXECUTE = new RegExp(
  // node em posição de comando (início de linha ou depois de ; & | ( ou do & do PowerShell) …
  // (admite prefixos de ambiente `VAR=valor` e `timeout N`, vistos em invocações reais)
  String.raw`(?:^|[;&|(])\s*(?:&\s*)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:timeout\s+\S+\s+)?node(?:\.exe)?["']?\s+` +
  // … e o 1.º argumento é um ficheiro chamado EXACTAMENTE router-execute(.js), com ou sem aspas
  String.raw`(?:"(?:[^"]*[\\/])?router-execute(?:\.js)?"|'(?:[^']*[\\/])?router-execute(?:\.js)?'|(?:[^\s"';&|]*[\\/])?router-execute(?:\.js)?)(?=\s|$|[;&|)])`,
  'm',
);

/**
 * O comando INVOCA o router-execute com node (não basta mencioná-lo: echo, cat, grep, comentário).
 * Resíduo declarado: uma invocação dentro de uma string multi-linha que o shell não executa.
 */
export function invocaRouterExecute(cmd) {
  const semComentarios = String(cmd || '').split(/\r?\n/).map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
  return RE_INVOCA_ROUTER_EXECUTE.test(semComentarios);
}

/** Tier que o próprio pedido de delegação declara (Agent.model, mooter_work model/agent moo). */
function tierDeclarado(input) {
  return modelToTier(input.model); // Agent.model: sonnet|opus|haiku|fable; mooter_work.model: id completo
}

/** Delegações num bloco assistant: [{id, tipo, via, tier}] (tier = o declarado no pedido, se houver). */
export function delegacoesDe(d) {
  const out = [];
  const c = d && d.message && d.message.content;
  if (!Array.isArray(c)) return out;
  c.forEach((b, i) => {
    if (!b || b.type !== 'tool_use') return;
    const nome = String(b.name || '');
    const input = b.input || {};
    const id = b.id || `${(d.message && d.message.id) || d.uuid || '?'}#${i}`;
    if (nome === 'Task' || nome === 'Agent') out.push({ id, tipo: semPrefixo(input.subagent_type || 'general-purpose'), via: 'subagente', tier: tierDeclarado(input) });
    else if ((nome === 'Bash' || nome === 'PowerShell') && invocaRouterExecute(input.command)) out.push({ id, tipo: 'local-exec', via: 'router-execute', tier: null });
    else if (/mooter_work$/.test(nome)) {
      // agent ∈ cc|codex|gemini|moo|kimi (motor, não subagente); `moo` é a GPU local.
      const agente = String(input.agent || 'auto');
      out.push({ id, tipo: 'mooter_work:' + agente, via: 'mcp', tier: tierDeclarado(input) || (agente === 'moo' ? 'T0' : null) });
    }
  });
  return out;
}

function tsMs(d) {
  const t = Date.parse(d && d.timestamp);
  return Number.isFinite(t) ? t : null;
}

function quantis(arr) {
  if (!arr.length) return { n: 0, p50: null, p90: null, soma: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return { n: s.length, p50: q(0.5), p90: q(0.9), soma: s.reduce((a, b) => a + b, 0) };
}

function novoRun(tipo) {
  return { tipo, modelos: dict(), primeiro: null, in_total: 0, out_total: 0, pedidos: 0, seq: 0, lista: [] };
}

// Donos de linha que não são um turno contável.
const NAO_HUMANO = Object.freeze({ dono: 'turno aberto por notificação, compactação ou origem não humana' });
const SEM_DONO = Object.freeze({ dono: 'cadeia parentUuid partida, cíclica ou sem prompt' });
const FORA = Object.freeze({ dono: 'prompt fora da janela' });
const eTurno = (x) => x != null && Array.isArray(x.delegs) && x.toolIds instanceof Set;

/** Texto do user sem lembretes de sistema nem invólucro de hook. */
function textoLimpo(d) {
  return textoDoUser(d).texto
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(RE_HOOK_TAG, '')
    .trim();
}

/** Linha user que abre um turno NÃO humano: notificação de tarefa, compactação, origem não humana. */
export function abreTurnoNaoHumano(d) {
  if (!d || d.type !== 'user' || d.isSidechain || d.isMeta || d.toolUseResult !== undefined) return false;
  if (textoDoUser(d).temToolResult) return false;
  if (d.isCompactSummary) return true;
  if (d.turnOrigin && d.turnOrigin !== 'human') return true;
  if (d.origin && typeof d.origin === 'object' && d.origin.kind && d.origin.kind !== 'human') return true;
  return /^(<task-notification>|This session is being continued from a previous conversation)/.test(textoLimpo(d));
}

/** Funde `u` em `acc` guardando o máximo de cada campo numérico (inclui cache_creation.*). */
export function maxUsage(acc, u) {
  if (!u || typeof u !== 'object') return acc;
  for (const k of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']) {
    const v = Number(u[k]) || 0;
    if (!(k in acc) || v > acc[k]) acc[k] = v;
  }
  const cc = u.cache_creation || {};
  acc.cache_creation ??= { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 };
  for (const k of ['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens']) {
    const v = Number(cc[k]) || 0;
    if (v > acc.cache_creation[k]) acc.cache_creation[k] = v;
  }
  return acc;
}

function zeroTok() {
  return { pedidos: 0, input: 0, cache_creation: 0, cache_creation_5m: 0, cache_creation_1h: 0, cache_read: 0, output: 0 };
}
function somaTok(acc, u) {
  acc.pedidos += 1;
  if (!u) return;
  acc.input += u.input_tokens || 0;
  acc.cache_creation += u.cache_creation_input_tokens || 0;
  const cc = u.cache_creation || {};
  acc.cache_creation_5m += cc.ephemeral_5m_input_tokens || 0;
  acc.cache_creation_1h += cc.ephemeral_1h_input_tokens || 0;
  acc.cache_read += u.cache_read_input_tokens || 0;
  acc.output += u.output_tokens || 0;
}

/** Lista recursiva de .jsonl sob o dir de projectos. */
export function listarTranscripts(dir, { desdeMs = null, soFrugal = false } = {}) {
  const out = [];
  let projectos;
  try { projectos = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const p of projectos) {
    if (!p.isDirectory()) continue;
    if (soFrugal && !/frugal|mooter/i.test(p.name)) continue;
    const walk = (d, depth) => {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (depth < 4) walk(f, depth + 1); continue; }
        if (!e.name.endsWith('.jsonl')) continue;
        if (desdeMs != null) { try { if (fs.statSync(f).mtimeMs < desdeMs) continue; } catch { continue; } }
        out.push({ ficheiro: f, projecto: p.name, subagente: /[\\/]subagents[\\/]/.test(f) });
      }
    };
    walk(path.join(dir, p.name), 0);
  }
  // principais antes dos subagentes (o host model e os turnos vêm dos principais)
  out.sort((a, b) => Number(a.subagente) - Number(b.subagente));
  return out;
}

function lerMeta(ficheiroJsonl) {
  const meta = ficheiroJsonl.replace(/\.jsonl$/, '.meta.json');
  try { return JSON.parse(fs.readFileSync(meta, 'utf8')); } catch { return null; }
}

/**
 * Processa um conjunto de transcripts e devolve o relatório agregado (sem texto).
 * @param {{ficheiro:string, projecto:string, subagente:boolean}[]} ficheiros
 */
/** Linhas de um ficheiro JSONL, já parseadas (inválidas contadas à parte). */
async function* lerLinhas(ficheiro, onInvalida) {
  const rl = readline.createInterface({ input: fs.createReadStream(ficheiro, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha) continue;
    let d;
    try { d = JSON.parse(linha); } catch { if (onInvalida) onInvalida(); continue; }
    if (d && typeof d === 'object') yield d;
  }
}

const numOuZero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export async function medir(ficheiros, { desdeMs = null, ateMs = null } = {}) {
  const dentro = (t) => t == null || ((desdeMs == null || t >= desdeMs) && (ateMs == null || t < ateMs));
  const pedidos = new Map(); // chave → {u, modelo, lateral, dia, cands:[{run, seq}]}
  const aliasPedido = new Map(); // requestId → message.id (quando uma linha traz os dois)
  const turnoDoPrompt = new Map(); // id do prompt → turno | null — dedup de turnos copiados entre ficheiros (resume/fork)
  const runPorAgente = new Map(); // agentId → run (cópias do mesmo subagente em ficheiros diferentes = 1 execução)
  const costState = new Map(); // sessionId → último modelUsage
  const fonte = { ficheiros: ficheiros.length, ilegiveis: 0, linhas: 0, linhas_invalidas: 0, versoes_cc: dict(), projectos: new Set(), sessoes: new Set(), turnos_duplicados: 0, hints_sem_dono: 0, hints_de_turno_nao_humano: 0, linhas_assistant_sem_id_de_pedido: 0 };
  const tokens = { total: zeroTok(), main: zeroTok(), subagente: zeroTok(), por_modelo: dict(), por_dia: dict() };
  const turnos = [];
  const todosRuns = [];
  const criarRun = (tipo) => { const r = novoRun(tipo); todosRuns.push(r); return r; };
  const runDoAgente = (agentId, tipo) => {
    if (!agentId) return criarRun(tipo);
    let r = runPorAgente.get(agentId);
    if (!r) { r = criarRun(tipo); runPorAgente.set(agentId, r); } else if (r.tipo === 'n/d' && tipo !== 'n/d') r.tipo = tipo;
    return r;
  };

  /** Aplica a um dono o que uma linha diz sobre o turno (hint e/ou resposta). */
  const aplicar = (dono, ev) => {
    if (ev.hint) {
      if (dono === SEM_DONO) fonte.hints_sem_dono++;
      else if (dono === NAO_HUMANO) fonte.hints_de_turno_nao_humano++;
      else if (eTurno(dono) && !dono.hint) dono.hint = ev.hint;
    }
    if (ev.resposta && eTurno(dono)) {
      const { modelo, t, delegs } = ev.resposta;
      dono.respondido = true; // mesmo sem modelo utilizável (<synthetic>): o turno já teve resposta
      // host = modelo do 1.º pedido do turno, por tempo (não pela ordem de leitura dos ficheiros)
      if (modelo && modelo !== '<synthetic>' && (dono.hostModel == null || (t != null && (dono.hostTs == null || t < dono.hostTs)))) { dono.hostModel = modelo; dono.hostTs = t; }
      for (const x of delegs) if (!dono.toolIds.has(x.id)) { dono.toolIds.add(x.id); dono.delegs.push(x); }
    }
  };

  for (const f of ficheiros) {
    fonte.projectos.add(sha12(f.projecto));
    const meta = f.subagente ? lerMeta(f.ficheiro) : null;
    const agenteDoFicheiro = f.subagente ? (path.basename(f.ficheiro).match(/^agent-(.+)\.jsonl$/) || [])[1] || null : null;
    const runFicheiro = f.subagente ? runDoAgente(agenteDoFicheiro && 'ag:' + agenteDoFicheiro, rotuloAgente(semPrefixo((meta && meta.agentType) || 'n/d'))) : null;
    const runsBloco = new Map(); // formato antigo sem agentId: bloco contíguo → run
    let blocoSidechain = 0;

    // ── 1.ª passagem (só conversa principal): cadeia e raízes de turno ─────────────────────────
    // Há hints gravados ANTES do prompt a que pertencem (medido: 33 `hook_success ← user` em 419
    // transcripts); sem esta passagem, «pai ainda não lido» confundia-se com «pai fora do ficheiro».
    const paiDe = new Map(); // uuid → parentUuid
    const raizTipo = new Map(); // uuid → 'humano' | 'nao_humano' | 'lateral'
    if (!f.subagente) {
      try {
        for await (const d of lerLinhas(f.ficheiro)) {
          if (!d.uuid) continue;
          paiDe.set(d.uuid, d.parentUuid ?? null);
          if (d.isSidechain) raizTipo.set(d.uuid, 'lateral');
          else if (isHumanPrompt(d)) raizTipo.set(d.uuid, 'humano');
          else if (abreTurnoNaoHumano(d)) raizTipo.set(d.uuid, 'nao_humano');
        }
      } catch { /* a 2.ª passagem conta o ilegível */ }
    }
    const raizMemo = new Map(); // uuid → uuid da raiz | null
    /** Raiz de turno de uma linha pela cadeia; undefined quando a linha não traz cadeia. */
    const raizDe = (d) => {
      if (d.parentUuid == null) return undefined;
      const caminho = []; let u = d.parentUuid; let r = null;
      const vistos = new Set();
      while (u) {
        if (raizTipo.has(u)) { r = u; break; }
        if (raizMemo.has(u)) { r = raizMemo.get(u); break; }
        if (vistos.has(u) || !paiDe.has(u)) { r = null; break; } // ciclo, ou antepassado fora do ficheiro
        vistos.add(u); caminho.push(u); u = paiDe.get(u);
      }
      for (const c of caminho) raizMemo.set(c, r);
      return r;
    };
    const donoDaRaiz = new Map(); // uuid da raiz → turno | NAO_HUMANO | FORA (preenchido ao ler a raiz)
    const adiados = new Map(); // uuid da raiz ainda por ler → [ev]

    let turno = null; // turno corrente por sequência (só para linhas sem cadeia: formato antigo)
    let turnoTemAssistant = false;
    let hintPendente = null;
    const descartarPendente = () => { if (hintPendente) fonte.hints_sem_dono++; hintPendente = null; };

    const fixarRaiz = (uuid, dono) => {
      if (!uuid) return;
      donoDaRaiz.set(uuid, dono);
      for (const ev of adiados.get(uuid) || []) aplicar(dono, ev);
      adiados.delete(uuid);
    };

    // ── 2.ª passagem ─────────────────────────────────────────────────────────────────────────
    try {
      for await (const d of lerLinhas(f.ficheiro, () => { fonte.linhas++; fonte.linhas_invalidas++; })) {
        fonte.linhas++;
        if (d.version) { const v = rotuloVersao(d.version); fonte.versoes_cc[v] = (fonte.versoes_cc[v] || 0) + 1; }
        if (d.sessionId) fonte.sessoes.add(sha12(d.sessionId));
        const t = tsMs(d);
        const lateral = f.subagente || d.isSidechain === true;

        if (d.type === 'cost-state' && d.sessionId && d.modelUsage && typeof d.modelUsage === 'object') { costState.set(d.sessionId, d.modelUsage); continue; }

        // ── tokens ────────────────────────────────────────────────────────────────────
        if (d.type === 'assistant' && d.message && d.message.usage && dentro(t) && d.message.model !== '<synthetic>') {
          // Um pedido à API = um message.id (msg_…); sem ele, o requestId (req_…), reconciliado com o
          // message.id assim que uma linha traga os dois.
          const mid = d.message.id || null; const rid = d.requestId || null;
          if (!mid && !rid) fonte.linhas_assistant_sem_id_de_pedido++;
          if (mid && rid && !aliasPedido.has(rid)) {
            aliasPedido.set(rid, mid);
            const orfao = pedidos.get('r:' + rid);
            if (orfao) { // o mesmo pedido já tinha entrado só pelo requestId: funde
              pedidos.delete('r:' + rid);
              const alvoM = pedidos.get('m:' + mid);
              if (alvoM) {
                maxUsage(alvoM.u, orfao.u); alvoM.lateral ||= orfao.lateral;
                if (orfao.t != null && (alvoM.t == null || orfao.t < alvoM.t)) alvoM.t = orfao.t; // fica a ocorrência mais antiga
                for (const c of orfao.cands) if (!alvoM.cands.some((x) => x.run === c.run)) alvoM.cands.push(c);
              }
              else pedidos.set('m:' + mid, orfao);
            }
          }
          const chave = mid ? 'm:' + mid : rid ? (aliasPedido.has(rid) ? 'm:' + aliasPedido.get(rid) : 'r:' + rid) : 'u:' + (d.uuid || `${f.ficheiro}:${fonte.linhas}`);
          let alvo = null;
          if (f.subagente) alvo = runFicheiro;
          else if (d.isSidechain) {
            if (d.agentId) alvo = runDoAgente('ag:' + d.agentId, 'n/d'); // mesma identidade que o ficheiro agent-<id>.jsonl
            else { const k = 'b:' + blocoSidechain; if (!runsBloco.has(k)) runsBloco.set(k, criarRun('n/d')); alvo = runsBloco.get(k); }
          }
          const existente = pedidos.get(chave);
          if (existente) {
            maxUsage(existente.u, d.message.usage);
            existente.lateral ||= lateral;
            if (t != null && (existente.t == null || t < existente.t)) existente.t = t; // cópias lidas em qualquer ordem
            if (alvo && !existente.cands.some((c) => c.run === alvo)) existente.cands.push({ run: alvo, seq: alvo.seq++, t });
          } else {
            const dia = t != null ? new Date(t).toISOString().slice(0, 10) : 'n/d';
            pedidos.set(chave, { u: maxUsage({}, d.message.usage), modelo: rotuloModelo(d.message.model || 'n/d'), lateral, dia, t, cands: alvo ? [{ run: alvo, seq: alvo.seq++, t }] : [] });
          }
        }
        if (f.subagente) continue;
        if (d.isSidechain) continue; // e na cadeia é raiz 'lateral': nada que descenda daqui conta
        if (d.type === 'assistant' || d.type === 'user') blocoSidechain++; // separa blocos sidechain sem agentId

        // ── aderência (só conversa principal) ────────────────────────────────────────
        const hint = parseRouterHint(textoHintLegitimo(d));
        if (isHumanPrompt(d)) {
          const idPrompt = d.uuid || (d.promptId ? d.promptId + '@' + d.timestamp : null);
          if (idPrompt && turnoDoPrompt.has(idPrompt)) {
            // Cópia de um turno já lido (resume/fork): não conta outra vez, mas o que este ficheiro
            // acrescentar a seguir continua a ser desse turno, em qualquer ordem de leitura.
            fonte.turnos_duplicados++;
            turno = turnoDoPrompt.get(idPrompt);
            if (hint && turno && !turno.hint) turno.hint = hint; // a cópia pode trazer o hook (formato antigo) que o original não tinha
            fixarRaiz(d.uuid, turno || FORA);
            turnoTemAssistant = !!(turno && turno.respondido);
            descartarPendente();
            continue;
          }
          let novo = null;
          if (dentro(t)) {
            novo = { ts: t, hint: null, hostModel: null, hostTs: null, delegs: [], toolIds: new Set() };
            turnos.push(novo);
            if (hint) novo.hint = hint; // formato antigo: hook no fim do próprio prompt
            // pendente (formato antigo): só para um prompt que também não traz cadeia
            else if (hintPendente && d.parentUuid == null && t != null && hintPendente.ts != null && t - hintPendente.ts <= JANELA_HINT_MS && t >= hintPendente.ts) { novo.hint = hintPendente.hint; hintPendente = null; }
          }
          if (idPrompt) turnoDoPrompt.set(idPrompt, novo);
          fixarRaiz(d.uuid, novo || FORA);
          turno = novo;
          turnoTemAssistant = !!(novo && novo.respondido); // respostas adiadas já aplicadas contam
          descartarPendente();
          continue;
        }
        if (abreTurnoNaoHumano(d)) {
          // Barreira na cadeia: o hint e as respostas que descendem daqui não são do prompt humano
          // anterior. Sem cadeia (formato antigo) o turno por sequência continua — ver limites.
          fixarRaiz(d.uuid, NAO_HUMANO);
          continue;
        }

        const ev = {
          hint,
          resposta: d.type === 'assistant' ? { modelo: d.message && d.message.model, t, delegs: delegacoesDe(d) } : null,
        };
        const raiz = raizDe(d);
        if (raiz === undefined) {
          // formato antigo, sem cadeia: sequência
          if (hint) {
            if (turno && !turno.hint && !turnoTemAssistant) turno.hint = hint; // antes de qualquer resposta
            else { descartarPendente(); hintPendente = { hint, ts: t }; }
          }
          if (ev.resposta && turno) { turnoTemAssistant = true; aplicar(turno, { resposta: ev.resposta }); }
        } else if (raiz === null || raizTipo.get(raiz) === 'lateral') {
          aplicar(SEM_DONO, ev);
        } else if (donoDaRaiz.has(raiz)) {
          const dono = donoDaRaiz.get(raiz);
          aplicar(dono, ev);
          if (ev.resposta && dono === turno) turnoTemAssistant = true;
        } else {
          if (!adiados.has(raiz)) adiados.set(raiz, []);
          adiados.get(raiz).push(ev); // o prompt deste hint/resposta vem mais abaixo no ficheiro
        }
        if (d.type === 'assistant') descartarPendente(); // nunca atravessa uma resposta
      }
    } catch {
      fonte.ilegiveis++;
    }
    descartarPendente(); // pendente que chegou ao fim do ficheiro sem prompt
    for (const evs of adiados.values()) for (const ev of evs) aplicar(SEM_DONO, ev); // raiz nunca lida (não devia acontecer)
  }

  // agregação dos pedidos (depois de todas as linhas: usage já no máximo)
  for (const p of pedidos.values()) {
    somaTok(tokens.total, p.u);
    somaTok(p.lateral ? tokens.subagente : tokens.main, p.u);
    tokens.por_modelo[p.modelo] ??= { main: zeroTok(), subagente: zeroTok() };
    somaTok(tokens.por_modelo[p.modelo][p.lateral ? 'subagente' : 'main'], p.u);
    tokens.por_dia[p.dia] ??= zeroTok();
    somaTok(tokens.por_dia[p.dia], p.u);
    // O mesmo pedido pode ter sido visto em mais de uma execução (sidechain antigo + ficheiro de
    // subagente): fica na execução com tipo conhecido, não na primeira que apareceu.
    const c = p.cands.find((x) => x.run.tipo !== 'n/d') || p.cands[0];
    if (c) c.run.lista.push({ seq: c.seq, t: p.t, u: p.u, modelo: p.modelo });
  }
  const runs = [];
  for (const r of todosRuns) {
    if (!r.lista.length) continue;
    // 1.º pedido por tempo (cópias parciais lidas em qualquer ordem); sem tempo, pela ordem de leitura
    r.lista.sort((a, b) => (a.t != null && b.t != null && a.t !== b.t ? a.t - b.t : a.seq - b.seq));
    r.lista.forEach(({ u, modelo }, i) => {
      const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      if (i === 0) r.primeiro = { contexto: ctx, escrita_cache: u.cache_creation_input_tokens || 0 };
      r.in_total += ctx;
      r.out_total += u.output_tokens || 0;
      r.modelos[modelo] = (r.modelos[modelo] || 0) + 1;
    });
    r.pedidos = r.lista.length;
    runs.push(r);
  }

  // cross-check: último cost-state por sessão (só números: um valor que não é número conta 0)
  const custoEstado = dict();
  for (const mu of costState.values()) {
    for (const [modeloCru, x] of Object.entries(mu)) {
      if (!x || typeof x !== 'object') continue;
      const modelo = rotuloModelo(modeloCru);
      custoEstado[modelo] ??= { input: 0, output: 0, cache_read: 0, cache_creation: 0, sessoes: 0 };
      const c = custoEstado[modelo];
      c.input += numOuZero(x.inputTokens); c.output += numOuZero(x.outputTokens);
      c.cache_read += numOuZero(x.cacheReadInputTokens); c.cache_creation += numOuZero(x.cacheCreationInputTokens); c.sessoes++;
    }
  }

  return montarRelatorio({ fonte, tokens, turnos, runs, custoEstado, desdeMs, ateMs });
}

/** Classifica um turno com hint. */
export function classificarTurno(tn) {
  const rec = tn.hint.tier;
  const host = modelToTier(tn.hostModel);
  const tipos = tn.delegs.map((x) => x.tipo);
  const seguiuExacto = tn.hint.sub != null && tipos.includes(tn.hint.sub);
  // O tier que o pedido declara (Agent.model, mooter_work) manda sobre o tier nominal do agente.
  const tierDeleg = tn.delegs.map((x) => x.tier || (x.tipo === 'local-exec' ? 'T0' : AGENTE_TIER[x.tipo] || null)).filter(Boolean);
  if (seguiuExacto || tierDeleg.includes(rec)) return { cat: 'seguiu', exacto: seguiuExacto, host };
  if (tipos.length > 0) return { cat: 'delegou_outro', exacto: false, host };
  if (host == null) return { cat: 'sem_modelo_host', exacto: false, host };
  if (host === rec) return { cat: 'ja_no_tier', exacto: false, host };
  return { cat: 'ignorou', exacto: false, host };
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }

export function montarRelatorio({ fonte, tokens, turnos, runs, custoEstado = {}, desdeMs, ateMs }) {
  const comHint = turnos.filter((t) => t.hint);
  const cats = { seguiu: 0, ja_no_tier: 0, delegou_outro: 0, ignorou: 0, sem_modelo_host: 0 };
  const porTier = dict();
  const matriz = dict();
  let exactos = 0; let forced = 0; let override = 0; let pinned = 0; let pinnedExec = 0;
  for (const tn of comHint) {
    const c = classificarTurno(tn);
    cats[c.cat]++;
    if (c.exacto) exactos++;
    const r = tn.hint.tier;
    porTier[r] ??= { n: 0, seguiu: 0, ja_no_tier: 0, delegou_outro: 0, ignorou: 0, sem_modelo_host: 0 };
    porTier[r].n++; porTier[r][c.cat]++;
    matriz[r] ??= dict(); const h = c.host || 'n/d'; matriz[r][h] = (matriz[r][h] || 0) + 1;
    if (tn.hint.forced) forced++;
    if (tn.hint.override) override++;
    if (tn.hint.pinned_local) { pinned++; if (tn.delegs.some((x) => x.tipo === 'local-exec')) pinnedExec++; }
  }
  const exigiamAccao = cats.seguiu + cats.delegou_outro + cats.ignorou;
  for (const v of Object.values(porTier)) v.aderencia_pct = pct(v.seguiu, v.seguiu + v.delegou_outro + v.ignorou);

  const porTipo = dict();
  for (const r of runs) {
    porTipo[r.tipo] ??= { ctx: [], escrita: [], ins: [], outs: [], modelos: dict() };
    const p = porTipo[r.tipo];
    p.ctx.push(r.primeiro ? r.primeiro.contexto : 0);
    p.escrita.push(r.primeiro ? r.primeiro.escrita_cache : 0);
    p.ins.push(r.in_total); p.outs.push(r.out_total);
    for (const [m, n] of Object.entries(r.modelos)) p.modelos[m] = (p.modelos[m] || 0) + n;
  }
  const delegacao = {
    nota: 'contexto_1o_pedido = tamanho total do contexto com que o subagente arranca; escrita_cache_1o_pedido = parte que teve de ser escrita (o resto foi lido de cache de um subagente paralelo)',
    execucoes: runs.length,
    contexto_1o_pedido_soma: runs.reduce((a, r) => a + (r.primeiro ? r.primeiro.contexto : 0), 0),
    escrita_cache_1o_pedido_soma: runs.reduce((a, r) => a + (r.primeiro ? r.primeiro.escrita_cache : 0), 0),
    por_tipo: dict(),
  };
  for (const [k, p] of Object.entries(porTipo)) {
    delegacao.por_tipo[k] = { contexto_1o_pedido: quantis(p.ctx), escrita_cache_1o_pedido: quantis(p.escrita), input_total: quantis(p.ins), output_total: quantis(p.outs), pedidos_por_modelo: p.modelos };
  }

  const m = tokens.main;
  return {
    schema: 'mooter.p0.medicao/v1.1',
    versao_script: VERSAO,
    gerado_em: new Date().toISOString(),
    janela: { desde: desdeMs != null ? new Date(desdeMs).toISOString() : null, ate: ateMs != null ? new Date(ateMs).toISOString() : null },
    privacidade: 'sem texto de prompts, respostas, comandos ou caminhos; ids em sha256[:12]',
    fonte: {
      ficheiros: fonte.ficheiros, ilegiveis: fonte.ilegiveis, linhas: fonte.linhas, linhas_invalidas: fonte.linhas_invalidas,
      projectos: fonte.projectos.size, sessoes: fonte.sessoes.size, turnos_duplicados_ignorados: fonte.turnos_duplicados, versoes_cc: fonte.versoes_cc,
      hints_sem_dono: fonte.hints_sem_dono ?? 0, hints_de_turno_nao_humano: fonte.hints_de_turno_nao_humano ?? 0,
      linhas_assistant_sem_id_de_pedido: fonte.linhas_assistant_sem_id_de_pedido ?? 0,
    },
    aderencia: {
      metodo: 'por prompt humano: hint do hook UserPromptSubmit e respostas atribuídos pela cadeia parentUuid (cadeia partida ou cíclica = sem dono, não conta); só linhas sem cadeia (formato antigo) caem na sequência: antes da 1.ª resposta ou ≤30 s antes do prompt. Tier do host = 1.º pedido do turno; delegações do turno = Task/Agent (com Agent.model), invocação node de router-execute, mooter_work',
      prompts_humanos: turnos.length,
      prompts_com_hint: comHint.length,
      cobertura_hint_pct: pct(comHint.length, turnos.length),
      categorias: cats,
      exigiam_accao: exigiamAccao,
      aderencia_pct: pct(cats.seguiu, exigiamAccao),
      seguiu_subagente_exacto: exactos,
      por_tier_recomendado: porTier,
      matriz_recomendado_x_host: matriz,
      forced, override,
      pinned_local: { n: pinned, executou_router_execute: pinnedExec },
    },
    tokens: {
      nota: 'medidos (usage da API gravado no transcript); dedup por message.id+requestId, máximo por campo; sem preços',
      total: tokens.total,
      conversa_principal: tokens.main,
      subagentes: tokens.subagente,
      cache_hit_conversa_principal_pct: pct(m.cache_read, m.cache_read + m.cache_creation + m.input),
      por_modelo: tokens.por_modelo,
      por_dia: tokens.por_dia,
    },
    cross_check_cost_state: {
      nota: 'último cost-state por sessão (só versões recentes do CC); inclui chamadas de fundo (ex.: Haiku) que NÃO aparecem como linhas assistant. Não filtra por janela.',
      por_modelo: custoEstado,
    },
    delegacao,
    limites: [
      'Aderência só existe onde o hint ficou gravado no transcript; prompts abaixo do gate de confiança (0,6) não têm hint e não contam.',
      'Tier do host = modelo do 1.º pedido do turno; T0 via subagente local-* conta como seguiu mesmo que o Ollama tenha falhado.',
      'Subagente em segundo plano cuja chamada aparece num turno posterior conta nesse turno.',
      'Turno aberto por <task-notification>, compactação ou origem não humana não conta, e o que descende dele pela cadeia também não; em transcripts sem parentUuid (formato antigo) as respostas continuam no turno humano anterior.',
      'router-execute conta quando o comando o invoca com node; uma string entre aspas que imite a invocação (echo "node …router-execute.js") ainda passa. Não se verifica se a execução teve êxito.',
      'mooter_work sem model nem agent=moo não declara tier e conta como delegou a outro.',
      'Formato antigo do hook (<user-prompt-submit-hook> no texto do prompt): só conta se for o último bloco do texto; um colado exactamente no fim do prompt ainda passa.',
      'Dedup de tokens: message.id, ou requestId quando falta; uma linha só com um e outra só com o outro do mesmo pedido contam como dois.',
      'Formato antigo (sidechain no ficheiro principal): execuções agrupadas por agentId ou por bloco contíguo; tipo n/d.',
      'Tokens das linhas assistant não incluem chamadas de fundo; ver cross_check_cost_state.',
      'Tokens = usage reportado pela API. Na subscription isto é quota, não fatura; preço de lista não é calculado aqui.',
      'Transcripts apagados ou fora do disco não entram.',
    ],
  };
}

export function resumoMarkdown(r, rotulo) {
  const a = r.aderencia; const t = r.tokens; const d = r.delegacao;
  const f = (n) => (n == null ? 'n/d' : typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n));
  const linhas = [
    `# Medição P0 — ${rotulo}`,
    '',
    `Gerado ${r.gerado_em} · ${r.versao_script} · janela ${r.janela.desde || 'início'} → ${r.janela.ate || 'agora'}`,
    `Fonte: ${f(r.fonte.ficheiros)} ficheiros (${f(r.fonte.ilegiveis)} ilegíveis) · ${f(r.fonte.sessoes)} sessões · ${f(r.fonte.projectos)} projectos · ${f(r.fonte.linhas_invalidas)} linhas inválidas · ${f(r.fonte.turnos_duplicados_ignorados)} turnos duplicados ignorados`,
    '',
    '## Aderência ao hint',
    '',
    '| Métrica | Valor |', '|---|---|',
    `| Prompts humanos | ${f(a.prompts_humanos)} |`,
    `| Com hint | ${f(a.prompts_com_hint)} (${f(a.cobertura_hint_pct)} %) |`,
    `| Já no tier | ${f(a.categorias.ja_no_tier)} |`,
    `| Seguiu | ${f(a.categorias.seguiu)} (exacto: ${f(a.seguiu_subagente_exacto)}) |`,
    `| Delegou a outro | ${f(a.categorias.delegou_outro)} |`,
    `| Ignorou | ${f(a.categorias.ignorou)} |`,
    `| Sem modelo do host | ${f(a.categorias.sem_modelo_host)} |`,
    `| **Aderência** (seguiu / exigiam acção) | **${f(a.aderencia_pct)} %** de ${f(a.exigiam_accao)} |`,
    '',
    '## Tokens medidos',
    '',
    '| Âmbito | Pedidos | Input | Cache write | Cache read | Output |', '|---|---|---|---|---|---|',
    ...[['Principal', t.conversa_principal], ['Subagentes', t.subagentes], ['Total', t.total]].map(([n, x]) => `| ${n} | ${f(x.pedidos)} | ${f(x.input)} | ${f(x.cache_creation)} | ${f(x.cache_read)} | ${f(x.output)} |`),
    '',
    `Cache hit da conversa principal: **${f(t.cache_hit_conversa_principal_pct)} %**`,
    '',
    '## Custo de delegar',
    '',
    '| Tipo | Execuções | Contexto 1.º pedido p50 | p90 | Escrita cache 1.º p50 | Input total p50 | Output p50 |', '|---|---|---|---|---|---|---|',
    ...Object.entries(d.por_tipo).sort((x, y) => y[1].contexto_1o_pedido.n - x[1].contexto_1o_pedido.n)
      .map(([k, v]) => `| ${k} | ${f(v.contexto_1o_pedido.n)} | ${f(v.contexto_1o_pedido.p50)} | ${f(v.contexto_1o_pedido.p90)} | ${f(v.escrita_cache_1o_pedido.p50)} | ${f(v.input_total.p50)} | ${f(v.output_total.p50)} |`),
    '',
    `Escrita de cache no arranque, somada: ${f(d.escrita_cache_1o_pedido_soma)} tokens em ${f(d.execucoes)} execuções.`,
    '',
    '## Cross-check (cost-state)',
    '',
    '| Modelo | Sessões | Input | Output | Cache read | Cache write |', '|---|---|---|---|---|---|',
    ...Object.entries(r.cross_check_cost_state.por_modelo).map(([k, v]) => `| ${k} | ${f(v.sessoes)} | ${f(v.input)} | ${f(v.output)} | ${f(v.cache_read)} | ${f(v.cache_creation)} |`),
    '',
    '## Limites',
    '',
    ...r.limites.map((x) => `- ${x}`),
    '',
  ];
  return linhas.join('\n');
}

/** Modo sonda: forma dos dados (chaves, tipos, versões) e ONDE aparecem hints, aceites ou não. Sem valores. */
export async function sondar(ficheiros, maxFicheiros = 40) {
  const out = { schema: 'mooter.p0.sonda/v1.1', ficheiros_lidos: 0, ilegiveis: 0, tipos: dict(), chaves_por_tipo: dict(), anexos: dict(), subtypes_system: dict(), tools: dict(), versoes_cc: dict(), hint_aceite_em: dict(), hint_rejeitado_em: dict(), meta_subagente: 0 };
  const principais = ficheiros.filter((x) => !x.subagente);
  const amostra = [...principais.slice(-maxFicheiros), ...ficheiros.filter((x) => x.subagente).slice(-5)];
  for (const f of amostra) {
    out.ficheiros_lidos++;
    if (f.subagente && lerMeta(f.ficheiro)) out.meta_subagente++;
    try {
      const rl = readline.createInterface({ input: fs.createReadStream(f.ficheiro, { encoding: 'utf8' }), crlfDelay: Infinity });
      for await (const linha of rl) {
        let d; try { d = JSON.parse(linha); } catch { continue; }
        if (!d || typeof d !== 'object') continue;
        // Tudo o que sai da sonda passa por rotuloSeguro: tipos, chaves, versões, anexos, tools.
        const t = rotuloSeguro(d.type);
        out.tipos[t] = (out.tipos[t] || 0) + 1;
        out.chaves_por_tipo[t] ??= dict();
        for (const k0 of Object.keys(d)) { const k = rotuloChave(k0); out.chaves_por_tipo[t][k] = (out.chaves_por_tipo[t][k] || 0) + 1; }
        if (d.version) { const v = rotuloVersao(d.version); out.versoes_cc[v] = (out.versoes_cc[v] || 0) + 1; }
        const anexo = t === 'attachment' && d.attachment ? rotuloSeguro(d.attachment.type) : null;
        if (anexo) out.anexos[anexo] = (out.anexos[anexo] || 0) + 1;
        const subtipo = t === 'system' ? rotuloSeguro(d.subtype) : null;
        if (subtipo) out.subtypes_system[subtipo] = (out.subtypes_system[subtipo] || 0) + 1;
        if (t === 'assistant' && Array.isArray(d.message && d.message.content)) for (const b of d.message.content) if (b && b.type === 'tool_use') { const n = /^mcp__/.test(b.name) ? 'mcp__*' : rotuloSeguro(b.name); out.tools[n] = (out.tools[n] || 0) + 1; }
        const onde = t + (anexo ? ':' + anexo : subtipo ? ':' + subtipo : t === 'user' ? (d.isMeta ? ':meta' : ':texto') : '');
        if (parseRouterHint(textoHintLegitimo(d))) out.hint_aceite_em[onde] = (out.hint_aceite_em[onde] || 0) + 1;
        else if (parseRouterHint(textoHintQualquer(d))) out.hint_rejeitado_em[onde] = (out.hint_rejeitado_em[onde] || 0) + 1;
      }
    } catch { out.ilegiveis++; }
  }
  return out;
}

function args(argv) {
  const o = { dir: null, desde: null, ate: null, out: null, soFrugal: false, probe: false, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--desde') o.desde = argv[++i];
    else if (a === '--ate') o.ate = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--so-frugal') o.soFrugal = true;
    else if (a === '--probe') o.probe = true;
    else if (a === '--stdout') o.stdout = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help) { console.log('node medir-p0.mjs [--dir <projects>] [--desde ISO] [--ate ISO] [--out <dir>] [--so-frugal] [--probe] [--stdout]'); return; }
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const dir = o.dir || path.join(base, 'projects');
  const desdeMs = o.desde ? Date.parse(o.desde) : null;
  const ateMs = o.ate ? Date.parse(o.ate) : null;
  if ((o.desde && !Number.isFinite(desdeMs)) || (o.ate && !Number.isFinite(ateMs))) { console.error('data inválida'); process.exitCode = 2; return; }
  const ficheiros = listarTranscripts(dir, { desdeMs, soFrugal: o.soFrugal });
  if (!ficheiros.length) { console.error('nenhum transcript encontrado no dir de projectos do Claude Code'); process.exitCode = 1; return; }
  const outDir = o.out || path.join(os.homedir(), '.mooter', 'p0', 'results');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  if (o.probe) {
    const s = await sondar(ficheiros);
    if (o.stdout) { console.log(JSON.stringify(s, null, 2)); return; }
    fs.mkdirSync(outDir, { recursive: true });
    const nome = `sonda-${carimbo}.json`;
    fs.writeFileSync(path.join(outDir, nome), JSON.stringify(s, null, 2));
    console.log(`sonda: ${s.ficheiros_lidos} ficheiros · versões ${Object.keys(s.versoes_cc).slice(-3).join(', ')} · hint aceite ${JSON.stringify(s.hint_aceite_em)} · rejeitado ${JSON.stringify(s.hint_rejeitado_em)}`);
    console.log(`escrito: results/${nome}`);
    return;
  }
  const r = await medir(ficheiros, { desdeMs, ateMs });
  if (o.stdout) { console.log(JSON.stringify(r, null, 2)); return; }
  fs.mkdirSync(outDir, { recursive: true });
  const rotulo = o.desde ? `desde-${o.desde.slice(0, 10)}` : 'historico';
  const base_ = `medicao-${rotulo}-${carimbo}`;
  fs.writeFileSync(path.join(outDir, base_ + '.json'), JSON.stringify(r, null, 2));
  fs.writeFileSync(path.join(outDir, base_ + '.md'), resumoMarkdown(r, rotulo));
  const a = r.aderencia;
  console.log(`[${rotulo}] prompts ${a.prompts_humanos} · com hint ${a.prompts_com_hint} · aderência ${a.aderencia_pct ?? 'n/d'} % · pedidos ${r.tokens.total.pedidos} · subagentes ${r.delegacao.execucoes} · ilegíveis ${r.fonte.ilegiveis}`);
  console.log(`escrito: results/${base_}.json (+ .md)`);
}

const correDirecto = (() => {
  try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1] || '')); } catch { return false; }
})();
if (correDirecto) main().catch((e) => { console.error('falhou:', e && (e.code || e.name || 'erro')); process.exitCode = 1; });
