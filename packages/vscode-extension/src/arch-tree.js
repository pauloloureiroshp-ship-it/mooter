// arch-tree.js — Frente E · Aba "Arquitectura Viva" (Mission Control backend integration).
//
// renderArchTree(snapshot, mode) renders ONE MissionControlSnapshot (schema §6 of
// docs/strategy/MISSION_CONTROL_BACKEND_INTEGRATION.md) in 3 modes:
//   🌳 'tree' — per-session detail (cow · topic · model · tokens · ctx% · N/O · clickable)
//   📊 'ceo'  — portfolio, attention-first (who needs you on top) + KPIs from totals
//   🔌 'wt'   — working-tree: connections/dependencies (main→frentes · hub→devices · registo→N/O)
//
// Dual-use: required by tests (node:test) AND embedded into the webview via fn.toString().
// So it is CONCAT-ONLY — NO template literals, NO ${...} — and pure (no Node/VSCode APIs).
// It relies on a free `esc` (module-level here for tests; the webview global at runtime),
// exactly like row-renderer's renderLocalFleet. Every other helper is INLINE inside
// renderArchTree, so the serialised source carries everything it needs into the webview.
//
// Honesty rule (§6/§Gates): every field is nullable. Missing data → n/d / ⚪ / "sync pending".
// NEVER fabricate (remote/sync null is the normal state until Frente F lands).
'use strict';

// Mirror of the webview `esc` (single source of truth for tests). In the webview the global
// esc(1040) is used; behaviour is identical (escapes & < > ").
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

// Normalise the mode arg to one of the 3 canonical modes (accepts PT/EN aliases).
function archMode(mode) {
  var m = String(mode || '').toLowerCase();
  if (m === 'ceo') return 'ceo';
  if (m === 'wt' || m === 'working' || m === 'working-tree' || m === 'workingtree') return 'wt';
  return 'tree'; // default 🌳 (also 'arvore'/'árvore'/'')
}

// ── Main renderer ────────────────────────────────────────────────────────────────
// snapshot = MissionControlSnapshot | null. mode = 'tree' | 'ceo' | 'wt' (+ aliases).
// Returns an HTML string. Never throws on malformed input (concat + fail-soft).
function renderArchTree(snapshot, mode) {
  var s = snapshot || null;
  // Inline mode normalisation (NOT a call to the module-level archMode — the embedded
  // source must be self-contained; only esc is allowed as a free var, like renderLocalFleet).
  var _m = String(mode || '').toLowerCase();
  var cur = (_m === 'ceo') ? 'ceo'
    : ((_m === 'wt' || _m === 'working' || _m === 'working-tree' || _m === 'workingtree') ? 'wt' : 'tree');

  // ── Inline helpers (self-contained so fn.toString() carries them into the webview) ──
  var nd = '<span class="arch-nd" title="sem dados — honesto, nunca inventado">n/d</span>';

  function fmtTok(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    if (v >= 1000) return (Math.round(v / 100) / 10) + 'k';
    return String(v);
  }
  function fmtUsd(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return '$' + (Math.round(v * 100) / 100).toFixed(2);
  }
  function modelShort(model) {
    var x = String(model || '');
    if (!x) return null;
    return x.replace(/^claude-/, '').replace(/\[1m\]/, '').replace(/-/g, ' ').trim();
  }
  function famEmojiL(model) {
    var x = String(model || '').toLowerCase();
    if (x.indexOf('fable') >= 0) return '\u{1F31F}';
    if (/claude|opus|sonnet|haiku/.test(x)) return '✨';
    if (/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x) || x.indexOf(':') >= 0) return '🦙';
    if (x.indexOf('gemini') >= 0) return '💎';
    if (/gpt|codex|openai/.test(x)) return '🟢';
    return '🤖';
  }
  function tierColor(tier) {
    var t = String(tier || '');
    if (t === 'T0') return 'var(--t0)';
    if (t === 'T1') return 'var(--t1)';
    if (t === 'T2') return 'var(--t2)';
    if (t === 'T3') return 'var(--t3)';
    if (t === 'T5') return '#D4A05A';
    return 'var(--vscode-descriptionForeground)';
  }
  // Mood cow + animation class (reuses the global .livecow keyframes). loop > working > idle.
  function moodCow(sess) {
    if (sess && sess.loop && (sess.status === 'working' || (sess.loops && sess.loops.active))) {
      return { emoji: '🌀', cls: ' loop' };
    }
    if (sess && sess.status === 'working') return { emoji: '🐮', cls: ' working' };
    return { emoji: '😴', cls: '' };
  }
  // Topic → emoji (keyword map from the Frente E brief). Default neutral dot (never fabricate).
  function topicEmoji(topic) {
    var x = String(topic || '').toLowerCase();
    if (!x) return '·';
    if (/\bux\b|usab/.test(x)) return '🖌️';
    if (/\bui\b|interface|component|css|webview|cockpit/.test(x)) return '🎨';
    if (/\bqa\b|test|quality/.test(x)) return '🔍';
    if (/review|reviewer/.test(x)) return '👀';
    if (/algo|algorit|classif|routing|router/.test(x)) return '🧮';
    if (/secur|seguran|auth|vuln|crypt/.test(x)) return '🛡️';
    if (/site|web|landing|marketing|launch|growth/.test(x)) return /market|launch|growth/.test(x) ? '📣' : '🌐';
    if (/financ|cost|saving|budget|price|poupan/.test(x)) return '💰';
    if (/handoff/.test(x)) return '🤝';
    if (/devops|\bci\b|deploy|infra|pipeline/.test(x)) return '⚙️';
    if (/loop/.test(x)) return '🔁';
    return '·';
  }
  function statusBadge(sess) {
    var st = sess && sess.status;
    if (sess && sess.needsYou) return '<span class="arch-badge needs" title="esta sessão espera pela tua resposta">⬤ your turn</span>';
    if (st === 'working') return '<span class="arch-badge work" title="a gerar agora"><span class="livedot"></span>working</span>';
    return '<span class="arch-badge idle" title="ociosa">idle</span>';
  }
  // N/O sync chips — honest: lit only when a real timestamp exists; ⚪ when absent.
  function syncChips(sess) {
    var sync = (sess && sess.sync) || {};
    var n = sync.notion;
    var o = sync.obsidian;
    var nChip = n
      ? '<span class="arch-sync on" title="Notion · sincronizado">Ⓝ</span>'
      : '<span class="arch-sync" title="Notion · sem página ligada">⚪Ⓝ</span>';
    var oChip = o
      ? '<span class="arch-sync on" title="Obsidian · sincronizado">Ⓞ</span>'
      : '<span class="arch-sync" title="Obsidian · sem ficheiro ligado">⚪Ⓞ</span>';
    return nChip + oChip;
  }
  function flowChips(sess) {
    var out = '';
    if (sess && sess.loop) out += '<span class="arch-flow loop" title="LoopMoo armado/activo">🔁</span>';
    if (sess && sess.auto) out += '<span class="arch-flow auto" title="auto-pilot: Moo adapta o modelo à tarefa">⚡</span>';
    return out;
  }

  // ── One session leaf (shared by Árvore + CEO) — clickable → openSession ──
  function sessionLeaf(sess) {
    if (!sess) return '';
    var sid = sess.sid || '';
    var mc = moodCow(sess);
    var name = sess.topic || sess.name || ('session ' + (sid ? String(sid).slice(0, 8) : '?'));
    var temoji = topicEmoji(sess.topic || sess.name);
    var model = sess.model
      ? ('<span class="arch-model" title="modelo desta sessão">' + famEmojiL(sess.model) + ' ' + esc(modelShort(sess.model)) + (sess.tier ? '<span class="arch-tier" style="color:' + tierColor(sess.tier) + '"> ' + esc(sess.tier) + '</span>' : '') + '</span>')
      : ('<span class="arch-model">' + nd + '</span>');
    var tin = fmtTok(sess.tokIn);
    var tout = fmtTok(sess.tokOut);
    var tok = (tin != null || tout != null)
      ? ('<span class="arch-tok" title="tokens in/out desta sessão">' + (tin != null ? '↓' + tin : '↓' + 'n/d') + ' ' + (tout != null ? '↑' + tout : '↑' + 'n/d') + '</span>')
      : '';
    var ctx = (typeof sess.ctxPct === 'number')
      ? ('<span class="arch-ctx' + (sess.ctxPct >= 80 ? ' hot' : '') + '" title="janela de contexto preenchida (estimativa)">🧠 ' + sess.ctxPct + '%</span>')
      : '';
    var open = sid ? ' data-arch-sid="' + esc(sid) + '" role="button" tabindex="0"' : '';
    return '<div class="arch-leaf' + (sess.needsYou ? ' needs' : '') + '"' + open
      + ' aria-label="abrir sessão: ' + esc(name) + '" title="abrir esta sessão no Claude Code — ' + esc(name) + '">'
      + '<span class="arch-twig">└─</span>'
      + '<span class="livecow' + mc.cls + '" style="font-size:15px">' + mc.emoji + '</span>'
      + '<span class="arch-topic" title="tópico">' + temoji + '</span>'
      + '<span class="arch-name">' + esc(name) + '</span>'
      + statusBadge(sess)
      + model + tok + ctx
      + '<span class="arch-int">' + flowChips(sess) + syncChips(sess) + '</span>'
      + (sid ? '<span class="arch-open" title="abrir no Claude Code">↗</span>' : '')
      + '</div>';
  }

  // ── Mode switcher (segmented; active marked; client re-renders + persists) ──
  function switcher() {
    var modes = [['tree', '🌳 Árvore', 'detalhe por sessão'], ['ceo', '📊 CEO', 'portfolio · atenção primeiro'], ['wt', '🔌 Working-tree', 'ligações e dependências']];
    var out = '<div class="arch-seg" role="toolbar" aria-label="modo da arquitectura viva">';
    for (var i = 0; i < modes.length; i++) {
      var on = modes[i][0] === cur;
      out += '<button class="arch-mode' + (on ? ' on' : '') + '" data-arch-mode="' + modes[i][0] + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(modes[i][2]) + '">' + modes[i][1] + '</button>';
    }
    return out + '</div>';
  }

  // ── Honest empty state (no snapshot yet) ──
  if (!s) {
    return '<div class="arch-wrap">' + switcher()
      + '<div class="card" data-arch="empty" style="padding:14px 12px;text-align:center">'
      + '<div style="font-size:26px;line-height:1">🌳</div>'
      + '<div style="font-weight:600;margin-top:6px">Arquitectura viva — à espera do snapshot</div>'
      + '<div class="sub" style="margin-top:4px;opacity:.75">o Mission Control monta o snapshot host-side; abre uma sessão e espera o primeiro refresh.</div>'
      + '</div></div>';
  }

  var sessions = Array.isArray(s.sessions) ? s.sessions.filter(Boolean) : [];
  var projects = (s.scope && Array.isArray(s.scope.projects)) ? s.scope.projects : [];
  var totals = s.totals || {};
  var deviceOs = (s.device && s.device.os) ? s.device.os : null;
  var rootName = s.project || 'workspace';

  var body = '';

  if (cur === 'tree') {
    // 🌳 ÁRVORE — root → project branches (portfolio summary) → session leaves (detail).
    var projLine = '';
    if (projects.length) {
      var pchips = '';
      for (var pi = 0; pi < projects.length; pi++) {
        var p = projects[pi];
        var dot = p.status === 'active' ? 'var(--g)' : 'var(--vscode-descriptionForeground)';
        pchips += '<span class="arch-proj" title="projecto — ' + esc(String(p.status || 'idle')) + '"><span class="arch-dot" style="background:' + dot + '"></span>' + esc(p.name || p.id || '?') + ' <b>' + (p.sessions != null ? p.sessions : '?') + '</b></span>';
      }
      projLine = '<div class="arch-branchrow">├─ <span style="opacity:.7">projectos:</span> ' + pchips + '</div>';
    }
    var leaves = '';
    if (sessions.length) {
      for (var li = 0; li < sessions.length; li++) leaves += sessionLeaf(sessions[li]);
    } else {
      leaves = '<div class="arch-leaf" style="opacity:.7"><span class="arch-twig">└─</span> 😴 sem sessões vivas agora</div>';
    }
    body = '<div class="card" data-arch="tree" style="padding:10px 12px">'
      + '<div class="arch-root">🌳 <b>' + esc(rootName) + '</b>' + (deviceOs ? ' <span class="arch-dev" title="dispositivo">· ' + esc(deviceOs) + '</span>' : '') + '</div>'
      + projLine + leaves
      + '</div>';
  } else if (cur === 'ceo') {
    // 📊 CEO — KPIs from totals (honest n/d) + attention-first + portfolio.
    function kpi(label, val, tip) {
      return '<div class="arch-kpi" title="' + esc(tip) + '"><div class="arch-kpiv">' + (val != null ? val : nd) + '</div><div class="arch-kpik">' + esc(label) + '</div></div>';
    }
    var saved = fmtUsd(totals.savedToday);
    var pctLocal = (typeof totals.pctLocal === 'number') ? (totals.pctLocal + '%') : null;
    var toks = fmtTok(totals.tokensToday);
    var kpis = '<div class="arch-kpis">'
      + kpi('Saved today', saved, 'poupança vs all-Opus hoje (advisory)')
      + kpi('% local', pctLocal, 'fatia executada localmente ($0)')
      + kpi('Tokens', toks, 'tokens processados hoje (in+out)')
      + kpi('Need you', (typeof totals.needYou === 'number' ? String(totals.needYou) : null), 'sessões à espera da tua resposta')
      + kpi('To commit', (typeof totals.commitsPending === 'number' ? String(totals.commitsPending) : null), 'sessões com trabalho por guardar')
      + kpi('To push', (typeof totals.pushPending === 'number' ? String(totals.pushPending) : null), 'sessões com commits por enviar')
      + '</div>';

    var needs = [];
    for (var ni = 0; ni < sessions.length; ni++) if (sessions[ni] && sessions[ni].needsYou) needs.push(sessions[ni]);
    var attn = '';
    if (needs.length) {
      var arows = '';
      for (var ai = 0; ai < needs.length; ai++) arows += sessionLeaf(needs[ai]);
      attn = '<div class="arch-attn"><div class="lbl" style="color:#E5C07B">🎯 Precisam de ti · ' + needs.length + '</div>' + arows + '</div>';
    } else {
      attn = '<div class="arch-attn"><div class="lbl" style="color:var(--g)">✓ Ninguém à espera de ti</div><div class="sub" style="opacity:.7">toda a herd está a trabalhar ou ociosa.</div></div>';
    }

    var portfolio = '';
    if (projects.length) {
      var prows = '';
      for (var fi = 0; fi < projects.length; fi++) {
        var pf = projects[fi];
        var active = pf.status === 'active';
        prows += '<div class="arch-pfrow"><span class="arch-dot" style="background:' + (active ? 'var(--g)' : 'var(--vscode-descriptionForeground)') + '"></span>'
          + '<span class="arch-name">' + esc(pf.name || pf.id || '?') + '</span>'
          + '<span class="arch-badge ' + (active ? 'work' : 'idle') + '">' + (active ? 'active' : 'idle') + '</span>'
          + '<span style="margin-left:auto;opacity:.7">' + (pf.sessions != null ? pf.sessions : '?') + ' sess.</span></div>';
      }
      portfolio = '<div class="arch-portfolio"><div class="lbl">🗂 Portfolio · ' + projects.length + ' projecto' + (projects.length === 1 ? '' : 's') + '</div>' + prows + '</div>';
    } else {
      portfolio = '<div class="arch-portfolio"><div class="lbl">🗂 Portfolio</div><div class="sub" style="opacity:.7">sem projectos mapeados ainda.</div></div>';
    }

    body = '<div class="card" data-arch="ceo" style="padding:10px 12px">'
      + '<div class="arch-root">📊 <b>' + esc(rootName) + '</b> · command center</div>'
      + kpis + attn + portfolio
      + '</div>';
  } else {
    // 🔌 WORKING-TREE — connections/dependencies with animated dash-flow connectors.
    function conn(from, arrow, to, tip) {
      return '<div class="arch-conn" title="' + esc(tip || '') + '"><span class="arch-node">' + from + '</span>'
        + '<span class="arch-wire" aria-hidden="true">' + (arrow || '——') + '</span>'
        + '<span class="arch-node to">' + to + '</span></div>';
    }
    var mainFrentes = '';
    if (projects.length) {
      for (var wi = 0; wi < projects.length; wi++) {
        var wp = projects[wi];
        var lit = wp.status === 'active';
        mainFrentes += conn('🌳 ' + esc(rootName), '<span class="arch-dash' + (lit ? ' live' : '') + '"></span>', (lit ? '🟢 ' : '⚪ ') + esc(wp.name || wp.id || '?') + ' <span style="opacity:.6">(' + (wp.sessions != null ? wp.sessions : '?') + ')</span>', 'projecto ligado à raiz — ' + (lit ? 'activo' : 'idle'));
      }
    } else {
      mainFrentes = '<div class="sub" style="opacity:.7">sem frentes mapeadas.</div>';
    }

    // hub → devices (Frente F). null → honest "sync pending".
    var remoteBlock;
    if (s.remote && Array.isArray(s.remote.devices) && s.remote.devices.length) {
      var drows = '';
      for (var di = 0; di < s.remote.devices.length; di++) {
        var dv = s.remote.devices[di];
        drows += conn('🛰 hub', '<span class="arch-dash' + (dv.online ? ' live' : '') + '"></span>', (dv.online ? '🟢 ' : '⚪ ') + esc(dv.os || 'device') + ' <span style="opacity:.6">(' + (dv.sessions != null ? dv.sessions : '?') + ')</span>', 'dispositivo remoto via hub');
      }
      remoteBlock = drows;
    } else {
      remoteBlock = '<div class="arch-pending" title="o collector cross-machine (Frente F) ainda não escreveu o cache remote — estado normal até F aterrar">🔌 sync pending · hub→devices (Frente F)</div>';
    }

    // registo → Notion/Obsidian. Aggregate per-session sync; null top-level → pending.
    var nCount = 0, oCount = 0;
    for (var si = 0; si < sessions.length; si++) {
      var sy = sessions[si] && sessions[si].sync;
      if (sy && sy.notion) nCount++;
      if (sy && sy.obsidian) oCount++;
    }
    var regBlock;
    if (nCount || oCount || s.sync) {
      regBlock = conn('📝 registo', '<span class="arch-dash live"></span>', 'Ⓝ Notion <b>' + nCount + '</b> · Ⓞ Obsidian <b>' + oCount + '</b>', 'sessões com registo sincronizado (Notion/Obsidian)');
    } else {
      regBlock = '<div class="arch-pending" title="sem sincronização de registo detectada ainda (collector de sync — Frente F)">🔌 sync pending · registo→Notion/Obsidian</div>';
    }

    // loops (autopilot) as connections.
    var loopBlock = '';
    var loops = Array.isArray(s.loops) ? s.loops.filter(Boolean) : [];
    if (loops.length) {
      var lrows = '';
      for (var lpi = 0; lpi < loops.length; lpi++) {
        var lp = loops[lpi];
        var rnd = (typeof lp.round === 'number') ? (lp.round + (lp.maxRounds != null ? '/' + lp.maxRounds : '')) : 'n/d';
        lrows += conn('🔁 ' + esc(lp.kind || 'loop'), '<span class="arch-dash' + (lp.active ? ' live' : '') + '"></span>', (lp.active ? '🟢 round ' : '⚪ round ') + esc(rnd) + (lp.model ? ' · ' + esc(modelShort(lp.model)) : ''), 'loop-runner — ' + (lp.active ? 'activo' : 'inactivo'));
      }
      loopBlock = '<div class="arch-wtsec"><div class="lbl">🔁 Loops</div>' + lrows + '</div>';
    }

    body = '<div class="card" data-arch="wt" style="padding:10px 12px">'
      + '<div class="arch-root">🔌 <b>' + esc(rootName) + '</b> · working-tree</div>'
      + '<div class="arch-wtsec"><div class="lbl">main → frentes</div>' + mainFrentes + '</div>'
      + '<div class="arch-wtsec"><div class="lbl">hub → devices</div>' + remoteBlock + '</div>'
      + '<div class="arch-wtsec"><div class="lbl">registo → Notion / Obsidian</div>' + regBlock + '</div>'
      + loopBlock
      + '</div>';
  }

  return '<div class="arch-wrap">' + switcher() + body + '</div>';
}

module.exports = { renderArchTree, archMode, esc };
