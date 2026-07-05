'use strict';
// dispatch.js — ⇄ Moo Dispatch F0 (pós-red-team v2).
// PURE, host-agnostic core for the cockpit's "⇄ Dispatch" section: masterprompts em
// `_handoff/dispatch/*.md` viram cartões; um clique → valida → cria a worktree → grava o
// prompt → abre um TERMINAL INTEGRADO do VS Code com `claude` e o bootstrap PRÉ-PREENCHIDO
// (sem newline — o Enter é do Paulo). Nada aqui toca no vscode nem faz I/O directo: parsing,
// validações e a sequência de launch recebem TODOS os seams por injecção (execFile,
// createTerminal, openExternal, writeFile, session-list, sleep) → 100% testável em node.
//
// Contrato de segurança (espelha o GUARD do masterprompt):
//   • NUNCA executa o conteúdo do masterprompt — só o faz parse e grava em disco.
//   • O texto digitado no REPL é uma CONSTANTE (buildBootstrap) — nunca conteúdo do MP.
//   • O prefill só acontece DEPOIS de detectar o .jsonl da sessão (nunca digitar às cegas
//     para o shell — o red-team F2: texto antes do CC arrancar vai para o PowerShell).
//   • host-side git = APENAS `git worktree add` (cria) — zero merge/push/rm/-f.
//
// Serialização webview: renderDispatch() é concat-only (sem template literals — o getHtml de
// extension.js é um template literal e uma backtick aqui parti-lo-ia) e chama `esc` como
// variável livre (resolvida ao esc global do webview; em node resolve ao esc de módulo abaixo).

const path = require('path');

// ── esc() — mesma disciplina de row-renderer.js / live-preview-view.js: módulo-scope, chamada
// como variável livre por renderDispatch() para que a serialização por .toString() a resolva
// contra o esc() de topo do webview (já lá definido), e os testes node a resolvam por closure.
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 1. PARSER — front-matter canónico (preferido) → regex (fallback retrocompat) → needsInput
// ════════════════════════════════════════════════════════════════════════════════════════

// Extrai o valor de uma chave da linha `dispatch: { worktree: x, base: y, model: z, mode: w }`.
// Tolerante a espaços e a aspas opcionais. Devolve null quando a chave falta.
function _kv(dispatchLine, key) {
  // Ancora a chave a um limite ({ , espaço ou início) para uma chave mais longa (ex.: `myworktree:`)
  // não poder capturar o valor de `worktree:`. Sem impacto de segurança (o valor passa por sanitize
  // + rev-parse), mas correcto.
  const re = new RegExp('(?:^|[\\s{,])' + key + '\\s*:\\s*([^,}\\n]+)');
  const m = dispatchLine.match(re);
  if (!m) return null;
  const v = m[1].trim().replace(/^["']|["']$/g, '').trim();
  return v || null;
}

// Lê o bloco front-matter no topo (--- … ---) e devolve a linha `dispatch:` interna, ou null.
function _frontMatterDispatchLine(text) {
  const t = String(text || '');
  // front-matter só conta quando abre no início (após BOM/espaços em branco iniciais).
  const m = t.match(/^﻿?\s*---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  for (const line of block.split(/\r?\n/)) {
    if (/^\s*dispatch\s*:/.test(line)) return line;
  }
  return null;
}

// parseMasterprompt(text) → { worktree, base, model, mode, source, needsInput, title, raw }
//   source ∈ 'front-matter' | 'regex' | 'none'
//   needsInput=true quando nem front-matter nem regex encontraram worktree+base → o cartão
//   PERGUNTA (nunca infere). model/mode ficam null quando ausentes (honest — o renderer mostra
//   "sonnet · default" sem fingir que o MP o declarou).
function parseMasterprompt(text) {
  const raw = String(text || '');
  const title = _firstTitle(raw);
  const out = { worktree: null, base: null, model: null, mode: null, source: 'none', needsInput: true, title, raw };

  const fm = _frontMatterDispatchLine(raw);
  if (fm) {
    out.worktree = _kv(fm, 'worktree');
    out.base = _kv(fm, 'base');
    out.model = _kv(fm, 'model');
    out.mode = _kv(fm, 'mode');
    if (out.worktree && out.base) { out.source = 'front-matter'; out.needsInput = false; return out; }
  }

  // Fallback regex — validado contra os cabeçalhos reais do MP5 spec, incl. "(depois de MP3)".
  //   "Worktree ../frugal-mp3 from main." → worktree=frugal-mp3, base=main
  const rx = raw.match(/Worktree\s+\.\.\/([A-Za-z0-9._-]+)\s+from\s+([A-Za-z0-9._/-]+?)(?:[.\s]|$)/);
  if (rx) {
    out.worktree = out.worktree || rx[1];
    out.base = out.base || rx[2];
    out.source = fm ? 'front-matter' : 'regex';
    out.needsInput = !(out.worktree && out.base);
    return out;
  }

  // Nada de worktree/base — mas o front-matter pode ter dado model/mode; mantém-nos e pede input.
  out.needsInput = !(out.worktree && out.base);
  if (out.worktree && out.base) out.source = fm ? 'front-matter' : 'regex';
  return out;
}

// Primeiro título markdown (# …) ou primeira linha não-vazia fora do front-matter, saneado.
function _firstTitle(raw) {
  const body = String(raw || '').replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    return t.replace(/^#+\s*/, '').slice(0, 120);
  }
  return '';
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 2. VALIDAÇÕES — nome saneado (sem traversal), encoding do projects-dir, comparação de paths
// ════════════════════════════════════════════════════════════════════════════════════════

// sanitizeWorktreeName(name) → { ok, name, reason }. Aceita só [A-Za-z0-9._-], rejeita traversal
// (`..`), separadores, vazio e nomes absurdamente longos. NUNCA reescreve silenciosamente — ou
// passa exactamente igual, ou rejeita com razão honesta.
function sanitizeWorktreeName(name) {
  const n = String(name == null ? '' : name).trim();
  if (!n) return { ok: false, name: '', reason: 'nome vazio' };
  if (n.length > 64) return { ok: false, name: n, reason: 'nome > 64 chars' };
  if (n.indexOf('..') >= 0) return { ok: false, name: n, reason: 'traversal (..) não permitido' };
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return { ok: false, name: n, reason: 'só [A-Za-z0-9._-] permitido' };
  if (n === '.' || n === '..') return { ok: false, name: n, reason: 'nome reservado' };
  return { ok: true, name: n, reason: null };
}

// encodeProjectDir(cwd) → nome do dir em ~/.claude/projects (cwd com [\/:. espaço] → '-').
// Ex.: "C:\\Users\\Paulo Loureiro\\frugal" → "C--Users-Paulo-Loureiro-frugal".
// NOTA: o Claude Code na prática minúscula a letra do drive no disco (c--Users-…). Por isso o
// poll/ocupação NÃO dependem desta string — usam samePath() sobre o cwd real lido do transcript
// (a mesma ground truth que recentSessions()). Esta função existe só como pista/rótulo legível.
function encodeProjectDir(cwd) {
  return String(cwd || '').replace(/[\\/:.\s]/g, '-');
}

// Comparação de paths robusta em Windows (case-insensitive, normaliza separadores/., resolve).
function samePath(a, b) {
  if (!a || !b) return false;
  try {
    const na = path.resolve(String(a)).replace(/[\\/]+$/, '');
    const nb = path.resolve(String(b)).replace(/[\\/]+$/, '');
    return na.toLowerCase() === nb.toLowerCase();
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 3. OCUPAÇÃO (1w=1s) + PLANO DE LAUNCH — pura, sobre listas injectadas
// ════════════════════════════════════════════════════════════════════════════════════════

const OCCUPIED_MS = 30 * 60 * 1000; // <30min de mtime = sessão viva (mesma heurística de recentSessions)

// isWorktreeOccupied({ files, targetCwd, now, thresholdMs }) → { occupied, file, ageMs }
// files: [{ file, mtime, cwd }] — o host resolve o cwd de cada .jsonl (via _sessionCwd) para os
// que interessam. Ocupada = existe um .jsonl cujo cwd == targetCwd e mtime dentro do threshold.
function isWorktreeOccupied(opts) {
  const files = (opts && Array.isArray(opts.files)) ? opts.files : [];
  const targetCwd = opts && opts.targetCwd;
  const now = (opts && typeof opts.now === 'number') ? opts.now : 0;
  const thr = (opts && typeof opts.thresholdMs === 'number') ? opts.thresholdMs : OCCUPIED_MS;
  for (const f of files) {
    if (!f || !samePath(f.cwd, targetCwd)) continue;
    const age = now - (Number(f.mtime) || 0);
    if (age >= 0 && age < thr) return { occupied: true, file: f.file, ageMs: age };
  }
  return { occupied: false, file: null, ageMs: null };
}

// planLaunch(inputs) → { plan, reason, blocked }
//   blocked=true (plan null) quando a worktree está OCUPADA por uma sessão viva → BLOQUEIA
//   (GATE). Caso contrário escolhe a escada de degradação honesta:
//     A = terminal integrado (default, quando `claude` está no PATH)
//     B = deep-link claude-cli:// (externo, quando registado mas claude fora do PATH)
//     C = clipboard + nova sessão (nunca falha)
function planLaunch(inputs) {
  const i = inputs || {};
  if (i.occupied) {
    return { plan: null, blocked: true, reason: 'worktree ocupada por uma sessão viva (<30min) — Enter noutra worktree evita pisar trabalho' };
  }
  if (i.claudeOnPath) {
    return { plan: 'A', blocked: false, reason: 'terminal integrado do VS Code (claude no PATH) — sessão fica DENTRO do IDE' };
  }
  if (i.deepLinkAvailable) {
    return { plan: 'B', blocked: false, reason: 'claude fora do PATH — deep-link claude-cli:// (abre externo)' };
  }
  return { plan: 'C', blocked: false, reason: 'claude fora do PATH e sem deep-link — clipboard + nova sessão (fallback que nunca falha)' };
}

// buildBootstrap() → a CONSTANTE que se escreve no REPL depois de a sessão arrancar. Nunca
// embebe conteúdo do masterprompt (o GUARD). É a única coisa "digitada" — e sem newline.
function buildBootstrap() {
  return 'Lê e executa _dispatch/MASTERPROMPT.md. GUARD: classify.js FROZEN · selective add · sem push/merge sem OK do Paulo.';
}

// buildDeepLink(worktreeAbs, bootstrap) → URL do Plano B. cwd + q ambos url-encoded.
function buildDeepLink(worktreeAbs, bootstrap) {
  return 'claude-cli://open?cwd=' + encodeURIComponent(String(worktreeAbs || '')) +
    '&q=' + encodeURIComponent(String(bootstrap || ''));
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 4. PRÉ-VOO — monta o cartão honesto (título · worktree · base · modelo · plano · avisos)
// ════════════════════════════════════════════════════════════════════════════════════════

// buildPreflight(parsed, ctx) → cartão. ctx = { worktreeExists, occupied, occupiedAgeMs,
//   claudeOnPath, deepLinkAvailable }. Determinístico e barato (sync) — o render usa isto tal e qual.
function buildPreflight(parsed, ctx) {
  const c = ctx || {};
  const san = parsed.worktree ? sanitizeWorktreeName(parsed.worktree) : { ok: false, name: '', reason: 'sem worktree' };
  const warnings = [];
  let plan = null, planReason = '', blocked = false;

  if (parsed.needsInput) {
    planReason = 'masterprompt sem worktree/base — o cartão pergunta, nunca adivinha';
  } else if (!san.ok) {
    blocked = true;
    planReason = 'nome de worktree inválido: ' + san.reason;
  } else {
    const p = planLaunch({
      occupied: !!c.occupied,
      claudeOnPath: !!c.claudeOnPath,
      deepLinkAvailable: !!c.deepLinkAvailable,
      worktreeExists: !!c.worktreeExists,
    });
    plan = p.plan; planReason = p.reason; blocked = p.blocked;
  }

  if (!parsed.needsInput && san.ok && !c.worktreeExists) {
    warnings.push('worktree nova → corre `npm install` em packages/cli E packages/router antes dos testes');
  }
  if (!parsed.needsInput && san.ok && c.worktreeExists && !c.occupied) {
    warnings.push('worktree já existe e está livre → vai ser REUSADA');
  }

  return {
    id: parsed.id || null,           // preenchido pelo host (basename do ficheiro)
    file: parsed.file || null,       // preenchido pelo host (path absoluto)
    title: parsed.title || (parsed.worktree || 'masterprompt'),
    worktree: san.ok ? san.name : (parsed.worktree || null),
    base: parsed.base || null,
    model: parsed.model || null,
    modelLabel: parsed.model ? parsed.model : 'sonnet',
    modelDefaulted: !parsed.model,
    mode: parsed.mode || null,
    source: parsed.source,
    needsInput: parsed.needsInput,
    sanitized: san.ok,
    sanitizeReason: san.ok ? null : san.reason,
    worktreeExists: !!c.worktreeExists,
    occupied: !!c.occupied,
    occupiedAgeMin: c.occupied && typeof c.occupiedAgeMs === 'number' ? Math.round(c.occupiedAgeMs / 60000) : null,
    plan, planReason, blocked,
    warnings,
    guard: 'nada corre até carregares Enter no terminal',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 5. REGISTO — linha para _handoff/dispatch/dispatch.jsonl (o Doctor/F1 colhem daqui)
// ════════════════════════════════════════════════════════════════════════════════════════

function buildRegistryEntry(opts) {
  const o = opts || {};
  return {
    ts: (typeof o.now === 'number') ? o.now : 0,
    title: o.title || null,
    worktree: o.worktree || null,
    base: o.base || null,
    plan: o.plan || null,
    prefilled: o.prefilled === true,
    timedOut: o.timedOut === true,
    promptFile: o.promptFile || null,
    status: o.status || 'dispatched',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 6. LAUNCH — orquestrador da escada A→B→C. Todos os seams injectados (testável, sem vscode).
// ════════════════════════════════════════════════════════════════════════════════════════
//
// deps = {
//   worktreeAbs, base, worktreeExists, claudeOnPath, deepLinkAvailable,
//   listSessionCwds: () => [{ file, cwd, mtime }],     // sessões actuais (host resolve cwd)
//   worktreeAdd: async (name, base) => { ok, out },     // `git worktree add ../name base` (nunca -f)
//   writeMasterprompt: async () => { ok, out },         // grava <worktree>/_dispatch/MASTERPROMPT.md
//   createTerminal: ({ cwd, name }) => ({ show(), sendText(text, addNewline) }),
//   openExternal: (url) => void,                        // Plano B
//   planC: async () => void,                            // clipboard + nova sessão (Plano C)
//   record: (entry) => void,                            // appenda a dispatch.jsonl
//   status: (msg) => void,                              // statusbar honesto
//   sleep: async (ms) => void,                          // injectável (testes = no-op)
//   now: () => number,
//   timeoutMs = 15000, pollMs = 700,
// }
async function orchestrateLaunch(card, deps) {
  const d = deps || {};
  const now = () => (typeof d.now === 'function' ? d.now() : 0);
  const bootstrap = buildBootstrap();
  const rec = (extra) => { try { d.record && d.record(buildRegistryEntry(Object.assign({
    now: now(), title: card.title, worktree: card.worktree, base: card.base,
    promptFile: card.file, plan: extra.plan,
  }, extra))); } catch { /* rasto best-effort, nunca rebenta o launch */ } };

  // (0) needsInput / nome inválido → nunca lança.
  if (card.needsInput) return { ok: false, reason: 'needsInput', plan: null };
  const san = sanitizeWorktreeName(card.worktree);
  if (!san.ok) return { ok: false, reason: 'invalid-name: ' + san.reason, plan: null };

  // (1) RE-CHECK de ocupação no momento do clique (a snapshot do cartão pode estar stale).
  const files = (typeof d.listSessionCwds === 'function') ? (d.listSessionCwds() || []) : [];
  const occ = isWorktreeOccupied({ files, targetCwd: d.worktreeAbs, now: now() });
  if (occ.occupied) {
    d.status && d.status('🐮 worktree ocupada por sessão viva (' + Math.round(occ.ageMs / 60000) + 'min) — bloqueado');
    rec({ plan: null, status: 'blocked' });
    return { ok: false, blocked: true, reason: 'occupied', plan: null };
  }

  const plan = planLaunch({
    occupied: false, claudeOnPath: !!d.claudeOnPath,
    deepLinkAvailable: !!d.deepLinkAvailable, worktreeExists: !!d.worktreeExists,
  }).plan;

  // ── Plano C ── clipboard + nova sessão (nunca falha).
  if (plan === 'C') {
    try { d.planC && (await d.planC()); } catch { /* host trata */ }
    rec({ plan: 'C', status: 'dispatched' });
    return { ok: true, plan: 'C', prefilled: false };
  }

  // ── Plano B ── deep-link externo.
  if (plan === 'B') {
    d.openExternal && d.openExternal(buildDeepLink(d.worktreeAbs, bootstrap));
    d.status && d.status('🐮 abri o deep-link claude-cli:// — a sessão abre externa ao VS Code');
    rec({ plan: 'B', status: 'dispatched' });
    return { ok: true, plan: 'B', prefilled: false };
  }

  // ── Plano A ── terminal integrado + poll do .jsonl + prefill sendText(_, false).
  // (a) cria a worktree se não existir (nunca -f). Falha → oferece C, não rebenta.
  if (!d.worktreeExists) {
    const wr = await d.worktreeAdd(san.name, d.base);
    if (!wr || !wr.ok) {
      d.status && d.status('🐮 `git worktree add` falhou: ' + String((wr && wr.out) || 'erro').slice(0, 160));
      rec({ plan: 'A', status: 'error' });
      return { ok: false, plan: 'A', reason: 'worktree-add-failed', out: wr && wr.out };
    }
  }
  // (b) grava o masterprompt COMPLETO em <worktree>/_dispatch/MASTERPROMPT.md.
  const mw = await d.writeMasterprompt();
  if (!mw || !mw.ok) {
    d.status && d.status('🐮 não consegui gravar o MASTERPROMPT.md na worktree');
    rec({ plan: 'A', status: 'error' });
    return { ok: false, plan: 'A', reason: 'write-failed' };
  }
  // (c) snapshot dos .jsonl que JÁ apontam para a worktree (para detectar o NOVO).
  const before = new Set((d.listSessionCwds() || [])
    .filter((f) => samePath(f.cwd, d.worktreeAbs)).map((f) => f.file));
  // (d) abre o terminal integrado nomeado e escreve `claude` (COM newline — é um comando de shell real).
  const term = d.createTerminal({ cwd: d.worktreeAbs, name: '🐮 ' + san.name });
  try { term.show && term.show(); } catch { /* best-effort */ }
  term.sendText('claude');
  // (e) poll ≤timeout por um .jsonl NOVO cujo cwd == worktree → SÓ AÍ prefill (nunca às cegas).
  const timeoutMs = (typeof d.timeoutMs === 'number') ? d.timeoutMs : 15000;
  const pollMs = (typeof d.pollMs === 'number') ? d.pollMs : 700;
  const t0 = now();
  while ((now() - t0) < timeoutMs) {
    if (d.sleep) await d.sleep(pollMs);
    const fresh = (d.listSessionCwds() || [])
      .find((f) => samePath(f.cwd, d.worktreeAbs) && !before.has(f.file));
    if (fresh) {
      // Prefill DENTRO do REPL, sem newline → o Enter continua a ser do Paulo.
      term.sendText(bootstrap, false);
      d.status && d.status('🐮 sessão detectada — bootstrap pré-preenchido; carrega Enter para arrancar');
      rec({ plan: 'A', status: 'dispatched', prefilled: true });
      return { ok: true, plan: 'A', prefilled: true, sessionFile: fresh.file };
    }
  }
  // (f) timeout → NÃO digita nada. Honesto + oferece o fallback.
  d.status && d.status('🐮 sessão não detectada em ' + Math.round(timeoutMs / 1000) + 's — NÃO escrevi nada; carrega Enter tu, ou usa o deep-link/clipboard');
  rec({ plan: 'A', status: 'timeout', prefilled: false, timedOut: true });
  return { ok: true, plan: 'A', prefilled: false, timedOut: true };
}

// ════════════════════════════════════════════════════════════════════════════════════════
// 7. RENDER — concat-only, chama esc() como variável livre (webview global / módulo em node)
// ════════════════════════════════════════════════════════════════════════════════════════

// renderDispatch(d) → HTML da secção. d = { cards, dispatchDir, claudeOnPath }.
// _card é NESTED (mesmo padrão de clock() dentro de renderDirectorsCut) para que .toString()
// o carregue para o webview; chama esc() como variável livre (esc global do webview / módulo em node).
function renderDispatch(d) {
  var data = d || {};
  var cards = (data && data.cards) || [];
  function _card(c) {
    var chip = 'font-size:9px;padding:2px 8px;border-radius:999px;white-space:nowrap;font-weight:600;';
    var planTag = c.blocked
      ? '<span class="dchip" style="' + chip + 'color:var(--bad);background:rgba(220,80,80,.14)">🛑 bloqueado</span>'
      : (c.needsInput
        ? '<span class="dchip" style="' + chip + 'color:var(--acc-warm);background:rgba(210,150,60,.16)">❔ precisa de input</span>'
        : '<span class="dchip" style="' + chip + 'background:rgba(127,127,127,.18)">Plano ' + esc(c.plan || 'C') + '</span>');

    var meta = [];
    if (c.worktree) meta.push((c.worktreeExists ? '♻ ' : '✦ ') + esc(c.worktree) + (c.worktreeExists ? ' (reusada)' : ' (nova)'));
    if (c.base) meta.push('base ' + esc(c.base));
    meta.push('modelo ' + esc(c.modelLabel) + (c.modelDefaulted ? ' · default' : ''));
    if (c.source && c.source !== 'none') meta.push(esc(c.source));

    var warn = (c.warnings || []).map(function (w) {
      return '<div class="sub" style="color:var(--acc-warm);margin-top:3px">⚠ ' + esc(w) + '</div>';
    }).join('');

    var occ = c.occupied
      ? '<div class="sub" style="color:var(--bad);margin-top:3px">🛑 sessão viva na worktree (~' + esc(c.occupiedAgeMin) + 'min) — dispatch bloqueado</div>'
      : '';

    var actions;
    if (c.needsInput) {
      actions = '<button class="btn" data-dcmd="ask" data-dfile="' + esc(c.file || '') + '">Indicar worktree + base…</button>';
    } else if (c.blocked) {
      actions = '<button class="btn" disabled title="' + esc(c.planReason) + '">Dispatch</button>';
    } else {
      actions = '<button class="btn" style="font-weight:600" data-dcmd="run" data-dfile="' + esc(c.file || '') + '">⇄ Dispatch</button>'
        + '<button class="btn" data-dcmd="dismiss" data-dfile="' + esc(c.file || '') + '" title="Remover o cartão da fila (não apaga o ficheiro)">Cancelar</button>';
    }

    return '<div class="card dcard" style="margin:0 2px 10px">'
      + '<div class="drow1" style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
      + '<b style="font-size:12px">' + esc(c.title) + '</b>' + planTag + '</div>'
      + '<div class="sub" style="margin-top:4px">' + meta.join(' · ') + '</div>'
      + '<div class="sub" style="margin-top:3px;opacity:.85">' + esc(c.planReason || '') + '</div>'
      + occ + warn
      + '<div class="sub" style="margin-top:5px;opacity:.7">🖐 ' + esc(c.guard || 'nada corre até Enter') + '</div>'
      + '<div class="dactions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' + actions + '</div>'
      + '</div>';
  }

  var head = '<div class="lbl" style="margin:2px 2px 8px">⇄ Dispatch <span class="sub" style="font-weight:400">— masterprompts → sessão certa</span></div>';
  var bar = '<div class="dspbar" style="margin:0 2px 10px;display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn" data-dcmd="import" title="Listar *MASTERPROMPT*.md em _handoff/ e importar para a fila">📥 Importar de _handoff/</button>'
    + '<button class="btn" data-dcmd="paste" title="Colar um masterprompt do clipboard para a fila">📋 Colar da área de transferência</button>'
    + '</div>';

  if (!cards.length) {
    return head + bar + '<div class="empty">Larga um masterprompt em <code>_handoff/dispatch/</code> — o cartão aparece sozinho.'
      + (data.claudeOnPath === false ? '<div class="sub" style="margin-top:6px;color:var(--acc-warm)">⚠ o <code>claude</code> não está no PATH — os cartões vão usar o Plano C (clipboard + nova sessão).</div>' : '')
      + '</div>';
  }

  return head + bar + cards.map(_card).join('');
}

module.exports = {
  esc,
  parseMasterprompt,
  sanitizeWorktreeName,
  encodeProjectDir,
  samePath,
  isWorktreeOccupied,
  planLaunch,
  buildBootstrap,
  buildDeepLink,
  buildPreflight,
  buildRegistryEntry,
  orchestrateLaunch,
  renderDispatch,
  OCCUPIED_MS,
};
