#!/usr/bin/env node
// ledger-turn-io.js — Moo Ledger Spine L0: MECHANICAL intent + outcome capture.
//
// PORQUÊ ISTO EXISTE (2026-08-01)
// O `handoff-journal.js` declara oito `EVENT_KINDS` desde o L0, mas na prática
// só um era escrito de forma continuada: `kind:'decision'` (ledger-decision.js,
// via o Stop hook).
//
// Medido a 2026-08-01 em `~/.claude/tools/router/handoff/` — e o número corrige
// o que a Wave O-0 tinha dito («263 sessões, ZERO intent/outcome»), que era
// literalmente falso:
//   · 273 ficheiros `.jsonl` (273 sessões)
//   · `decision` — 56 eventos, espalhados por 24 ficheiros
//   · `intent`/`outcome` — 16 eventos num ÚNICO ficheiro, todos carimbados
//     `2026-07-01T02:28:13.013Z`: uma única rajada no dia em que o handoff v3/v4
//     foi desenhado, e nunca mais nada nas 272 sessões seguintes.
//
// Portanto não é «nunca existiu»: é «foi provado uma vez e nunca foi ligado».
// Sem estes eventos o journal sabe que houve um turno e não sabe o que foi
// PEDIDO nem o que foi ENTREGUE, e cada sessão nova volta a perguntar.
//
// Este módulo é PURO: DERIVA do transcript que o host já escreveu e NUNCA inventa.
//   • intent  — o prompt humano deste turno (não um tool_result, não uma injecção
//               de hook), com a sua identidade estável (`promptId`).
//   • outcome — o que o turno de facto fez: histograma de ferramentas, ficheiros
//               escritos, erros de ferramenta, uso de tokens medido, e o remate.
//
// A régua de honestidade é a do repo: o que não está no transcript sai `null`,
// nunca zero e nunca estimado. Um turno sem prompt humano no tail devolve `null`
// — não é um turno, é uma continuação. Nunca lança.

'use strict';

const PROMPT_MAX = 1200;   // o intent é a fonte da verdade do turno, não um snippet
const SNIPPET_MAX = 400;   // o remate do assistente: o suficiente para reconhecer
const PATH_MAX = 240;
const FILES_MAX = 40;      // um turno que toca >40 ficheiros conta-se, não se lista

// Ferramentas cuja invocação é, mecanicamente, uma ESCRITA de ficheiro. O caminho
// vive em `file_path` (Edit/Write) ou `notebook_path` (NotebookEdit).
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/**
 * ── PORQUE O TEXTO LIVRE PASSA POR AQUI ANTES DE IR PARA DISCO ────────────────
 *
 * O `intent` introduz no journal uma CATEGORIA DE CONTEÚDO NOVA: o prompt humano.
 * Até aqui o journal só guardava `assistant_snippet` — e o sítio onde as pessoas
 * colam uma chave de API é o prompt, não a resposta do modelo. O repo já tem a
 * doutrina escrita e o antídoto pronto: `session-context.js:14` declara-se
 * «opt-in (default OFF), sanitized (privacy.sanitize), 0600, local-only», e
 * `privacy.js` redige `sk-ant-…`, `sk-…`, `ghp_…`, `Bearer …`, emails, IPs,
 * strings de ligação e blobs base64.
 *
 * Este caminho está LIGADO por omissão (é um hook Stop), por isso não pode
 * também ser o único sem redacção. Sanitiza-se o texto livre — o `intent.text`
 * e o remate do assistente.
 *
 * O que NÃO se sanitiza, e porquê: `files_written`, `cwd` e `git_branch`. São
 * campos estruturais, não texto livre; a regra `<winpath>` do `privacy.js`
 * apagaria exactamente a informação que os torna úteis, e o journal já regista
 * o `cwd` da worktree noutros eventos (`handoff-journal.js`, `effectiveCwd`) —
 * redigi-los aqui daria privacidade nenhuma e custaria o campo todo.
 *
 * Degrada em silêncio: sem `privacy.js` o texto passa como está, exactamente
 * como `session-context.js:57` faz. Nunca lança.
 */
function _sanitize(text) {
  try {
    const pv = require('./privacy.js');
    if (pv && typeof pv.sanitize === 'function') return pv.sanitize(String(text));
  } catch { /* privacy é opcional — nunca partir o turno por causa dela */ }
  return String(text);
}

// PURE: deriva { intent, outcome } de um tail JSONL do transcript (linhas cruas OU
// objectos já parseados). Devolve `null` quando não há prompt humano no tail.
function deriveTurnIO(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const rows = [];
  for (const ln of arr) {
    const d = _parse(ln);
    if (d && typeof d === 'object') rows.push(d);
  }

  // O turno começa no ÚLTIMO prompt humano. Tudo o que vem depois é a resposta.
  let start = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (_isHumanPrompt(rows[i])) { start = i; break; }
  }
  if (start < 0) return null;

  const head = rows[start];
  const text = _messageText(head.message).trim();
  if (!text) return null;

  const turn_id = _turnId(head);
  // Sanitiza ANTES de cortar: um segredo a cavalo no limite dos 1200 chars não
  // pode escapar por metade — a régua do `privacy.js` precisa do padrão inteiro.
  const textoSeguro = _sanitize(text);
  const intent = {
    turn_id,
    text: textoSeguro.slice(0, PROMPT_MAX),
    truncated: textoSeguro.length > PROMPT_MAX,
    ts: head.timestamp || null,
    cwd: head.cwd || null,
    git_branch: head.gitBranch || null,
  };

  const tools = {};
  const files = [];
  const models = [];
  let tool_errors = 0;
  let snippet = '';
  let ended_at = null;
  // `usage` só existe se o host o escreveu. Fica `null` inteiro quando nenhuma
  // linha o traz — um zero aqui seria uma medição falsa, não uma medição vazia.
  let sawUsage = false;
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  for (let i = start + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.isSidechain) continue;               // subagentes têm o seu próprio journal
    if (r.timestamp) ended_at = r.timestamp;
    const msg = r.message;

    if (r.type === 'assistant' && msg) {
      if (typeof msg.model === 'string' && msg.model && !models.includes(msg.model)) {
        models.push(msg.model.slice(0, 64));
      }
      if (msg.usage && typeof msg.usage === 'object') {
        sawUsage = true;
        for (const k of Object.keys(usage)) {
          if (Number.isFinite(msg.usage[k])) usage[k] += msg.usage[k];
        }
      }
      const t = _messageText(msg).trim();
      if (t) snippet = t;                            // o último texto do assistente vence
    }

    const content = msg && Array.isArray(msg.content) ? msg.content : null;
    if (!content) continue;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_use' && typeof b.name === 'string') {
        tools[b.name] = (tools[b.name] || 0) + 1;
        if (WRITE_TOOLS.has(b.name)) {
          const p = b.input && (b.input.file_path || b.input.notebook_path);
          if (typeof p === 'string' && p) {
            const clipped = p.slice(0, PATH_MAX);
            if (!files.includes(clipped) && files.length < FILES_MAX) files.push(clipped);
          }
        }
      } else if (b.type === 'tool_result' && _isToolError(b)) {
        tool_errors++;
      }
    }
  }

  const outcome = {
    turn_id,
    tools,
    tool_calls: Object.values(tools).reduce((a, n) => a + n, 0),
    files_written: files,
    tool_errors,
    models,
    usage: sawUsage ? usage : null,                  // n/d, nunca zero inventado
    assistant_snippet: _sanitize(snippet).slice(0, SNIPPET_MAX),
    started_at: head.timestamp || null,
    ended_at,
  };

  return { intent, outcome };
}

// Um prompt HUMANO é uma linha `user` que não é o resultado de uma ferramenta, não
// é sidechain, e cujo texto não começa por `<` (as injecções de hook e os
// system-reminders entram por aí — a mesma convenção que `gsd-turn-end.js` já usa
// para o título da sessão).
function _isHumanPrompt(r) {
  if (!r || r.type !== 'user' || r.isSidechain) return false;
  if (r.toolUseResult !== undefined || r.sourceToolAssistantUUID) return false;
  const t = _messageText(r.message).trim();
  return !!t && t.charAt(0) !== '<';
}

// Identidade estável do turno. `promptId` é o que o host atribui ao prompt e é o
// que faz o `idem_key` sobreviver a re-varrimentos do tail em turnos seguintes.
// Sem ele, o `uuid` da linha serve; sem os dois, o turno não tem identidade e o
// chamador decide (devolvemos null em vez de fabricar uma).
function _turnId(r) {
  return (r && (r.promptId || r.uuid)) || null;
}

// Texto de uma mensagem, seja `content` string ou blocos. Ignora tool_use/result.
function _messageText(msg) {
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  let out = '';
  for (const b of c) {
    if (typeof b === 'string') out += b;
    else if (b && b.type === 'text' && typeof b.text === 'string') out += b.text;
  }
  return out;
}

// Mesma régua que `ledger-decision.js`: um erro de ferramenta é sinalizado por
// `is_error`, por um campo de erro, ou pelo texto do host. Contá-lo importa —
// foi um turno com 20 `tool_result is_error` que o oráculo apanhou a responder
// «tarefa concluída» sem ter escrito nada (commit b9ceec3).
function _isToolError(block) {
  if (!block || typeof block !== 'object') return false;
  if (block.is_error === true || block.error != null) return true;
  let text = '';
  if (typeof block.content === 'string') text = block.content;
  else if (Array.isArray(block.content)) {
    text = block.content.map((item) => {
      if (typeof item === 'string') return item;
      return item && typeof item.text === 'string' ? item.text : '';
    }).join(' ');
  }
  return /<tool_use_error>|InputValidationError|ToolUseError/i.test(text);
}

function _parse(ln) {
  if (ln && typeof ln === 'object') return ln;
  try { return JSON.parse(String(ln)); } catch { return null; }
}

module.exports = { deriveTurnIO, _isHumanPrompt, _turnId, _messageText, _isToolError, WRITE_TOOLS };
