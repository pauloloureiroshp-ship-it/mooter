'use strict';
// project-command-view.js — Delivery Cockpit · Frente B (🛩️ Project command tab).
//
// `renderProjectCommand(pc)` renders the WHOLE Project Command tab PURELY from the
// ProjectCommandSnapshot (pc-snapshot.js). It is the cabine: the roadmap's waves grouped by
// phase (now/next/frontier) with state·type·effort·deps + an HONEST forecast (P50/P90 work AND
// wall, or "a calibrar n/k", or "sem base comparável" — never a fake cone), a per-wave play that
// respects deps + confirms cost, an HONEST progress bar (fases-que-passaram-o-gate do Ledger,
// never decorative time), and sub-sessions that expand to the wave's real CC sessions
// (branch@sha7 · git chips · click-to-tab).
//
// It is **concat-only / CSP-safe**: no template literals, no `${}`, no inline handlers — every
// host action is a `<button data-a=… data-x=…>` (wired host-side) and the chevron is a
// `<button class="pc-chev" data-wave=…>` (wired client-side by wirePc). The host serialises this
// via `.toString()` straight INTO the getHtml() template literal; a backtick or `${` here would
// break the outer template and the webview-syntax test.
//
// Honesty rule: EVERY field is nullable → n/d. Cold-start (empty Ledger) renders every wave as
// calibrating/no_base with n/d progress — respected, never faked. Identity: 🐮 brand · sentence
// case · number-never-naked · dark-native · restraint (cada elemento é uma feature).

function renderProjectCommand(pc) {
  // ── self-contained helpers (serialised with the function — no module-scope refs) ──
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }
  function nd(v, suffix) {
    if (v == null || v === '') return '<span class="pc-nd">n/d</span>';
    return esc(v) + (suffix || '');
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  // ms → honest short human string (mirrors forecast.js _human so copy matches the engine).
  function human(ms) {
    var v = num(ms);
    if (v == null || v <= 0) return null;
    var m = v / 60000;
    if (m < 60) return Math.round(m) + 'm';
    var h = m / 60;
    if (h < 24) return (h < 10 ? h.toFixed(1) : String(Math.round(h))) + 'h';
    return (h / 24).toFixed(1) + 'd';
  }
  function effortDot(e) {
    var x = String(e || '').toUpperCase();
    if (x === 'S') return '🟢'; if (x === 'M') return '🟡'; if (x === 'L') return '🟠'; if (x === 'XL') return '🔴';
    return '·';
  }
  // Roadmap Modo → a compact type badge (CC-once / Loop / Schedule / dynamic-workflow).
  function typeBadge(t) {
    var x = String(t || '').toLowerCase();
    if (/schedule/.test(x)) return { icon: '⏰', label: 'schedule' };
    if (/dynamic|workflow/.test(x)) return { icon: '🌀', label: 'workflow' };
    if (/loop/.test(x)) return { icon: '🔁', label: 'loop' };
    if (/cc|once/.test(x)) return { icon: '🖥️', label: 'CC-once' };
    return { icon: '·', label: (t ? String(t).slice(0, 14) : 'n/d') };
  }
  // Per-wave state chip: running > cone > calibrating > no_base.
  function stateChip(w) {
    if (w.running) return '<span class="pc-st pc-run">▶ a correr</span>';
    var st = w.forecast && w.forecast.state;
    if (st === 'cone') return '<span class="pc-st pc-cone">● forecast</span>';
    if (st === 'calibrating') return '<span class="pc-st pc-cal">◐ a calibrar</span>';
    return '<span class="pc-st pc-nob">○ sem base</span>';
  }
  function topicEmoji(s) {
    var x = String((s && (s.topic || s.name)) || '').toLowerCase() + ' ' + String((s && s.branch) || '').toLowerCase();
    if (/\bui\b|\bux\b|cockpit|webview|css|render|design|lane/.test(x)) return '🎨';
    if (/router|algo|classif|council|adapter|forge|pastor|lora|fleet/.test(x)) return '🧮';
    if (/handoff|sync|bridge|infra|deploy|\bci\b|hub/.test(x)) return '🤝';
    if (/budget|cost|saving|observ/.test(x)) return '💰';
    if (/loop|schedule/.test(x)) return '🔁';
    return '·';
  }

  var s = pc || {};

  // ── forecast-missing: honest "run the CLI" state (never fabricate a cone) ──
  if (s.forecast_missing) {
    return '<div class="pc-wrap">'
      + '<div class="pc-head"><span class="pc-brand">🐮</span><span class="pc-title">🛩️ Project command</span></div>'
      + '<div class="pc-banner pc-warn">Ainda não há <b>forecast.json</b> — o motor ($0, local) ainda não correu para este âmbito. '
      + 'Corre o CLI e volta a abrir a aba:</div>'
      + '<div class="pc-cli">' + esc(s.cli_hint || 'node tools/router/forecast/forecast.js --out tools/router/forecast/forecast.json') + '</div>'
      + '</div>';
  }

  var out = '';
  out += '<div class="pc-wrap">';

  // ── header: 🐮 brand + title + honest scope band ──────────────────────────
  var counts = s.counts || {};
  out += '<div class="pc-head">'
    + '<span class="pc-brand" title="Mooter">🐮</span>'
    + '<span class="pc-title">🛩️ Project command</span>'
    + '<span class="pc-headcount">' + (num(counts.total) != null ? counts.total : 0) + ' waves</span>'
    + '<span class="pc-spacer"></span>'
    + '<button class="pc-btn pc-mini" data-a="refresh" title="regenera o snapshot (o forecast.json continua a ser a verdade base)">🔄</button>'
    + '</div>';

  // ── scope banner — the never-nu premise: distribution, not a promise ───────
  var scopeShort = s.scope_hash ? String(s.scope_hash).slice(0, 12) : null;
  var inj = num(s.injection_rate);
  var injTxt = (inj == null) ? null : ((1 + inj).toFixed(1) + '× do que planeias tende a acontecer');
  if (s.stale) {
    out += '<div class="pc-banner pc-stale">⚠️ <b>Forecast STALE</b> — o roadmap mudou desde que este forecast foi gerado (o âmbito moveu-se). '
      + 'Corre o CLI outra vez para reconciliar; até lá os cones abaixo são do âmbito antigo.</div>';
  }
  out += '<div class="pc-scope">'
    + '<span class="pc-sk">distribuição, não promessa</span>'
    + '<span class="pc-vr"></span>'
    + '<span class="pc-sk">âmbito congelado @ <b>' + (scopeShort ? esc(scopeShort) : '<span class="pc-nd">n/d</span>') + '</b></span>'
    + '<span class="pc-vr"></span>'
    + '<span class="pc-sk">gerado ' + nd(s.generated_ts ? String(s.generated_ts).slice(0, 16).replace('T', ' ') : null) + '</span>'
    + (injTxt ? '<span class="pc-vr"></span><span class="pc-sk" title="injection rate — waves não-planeadas históricas / planeadas">📈 ' + esc(injTxt) + '</span>' : '')
    + '</div>';

  // legend for the wave states (so a cold-start board reads honestly, not as "empty")
  out += '<div class="pc-legend">'
    + '<span class="pc-st pc-cone">● forecast</span> P50/P90 com base'
    + '<span class="pc-vr"></span><span class="pc-st pc-cal">◐ a calibrar</span> ' + (num(counts.calibrating) != null ? counts.calibrating : 0) + ' waves (n&lt;k eventos)'
    + '<span class="pc-vr"></span><span class="pc-st pc-nob">○ sem base</span> ' + (num(counts.no_base) != null ? counts.no_base : 0) + ' waves (classe não declarada)'
    + '</div>';

  // ── phases: NOW / NEXT / FRONTIER ─────────────────────────────────────────
  var phases = Array.isArray(s.phases) ? s.phases : [];
  if (!phases.length) {
    out += '<div class="pc-nd" style="padding:14px 2px">⚪ sem waves no roadmap (verifica docs/strategy/MOOTER_ROADMAP.md)</div>';
  }
  for (var pi = 0; pi < phases.length; pi++) {
    var ph = phases[pi] || {};
    var phEmoji = ph.key === 'NOW' ? '🎯' : (ph.key === 'NEXT' ? '🧱' : '🔭');
    out += '<div class="pc-phase"><div class="pc-phhd">' + phEmoji + ' <b>' + esc(ph.label || ph.key) + '</b>'
      + ' <span class="pc-phk">' + esc(ph.key || '') + '</span>'
      + ' <span class="pc-phcnt">' + (Array.isArray(ph.waves) ? ph.waves.length : 0) + '</span></div>';
    var waves = Array.isArray(ph.waves) ? ph.waves : [];
    for (var wi = 0; wi < waves.length; wi++) out += waveCard(waves[wi]);
    out += '</div>';
  }

  // ── unassigned sessions (honest: not every live session maps to a wave) ────
  var un = Array.isArray(s.unassigned_sessions) ? s.unassigned_sessions : [];
  if (un.length) {
    out += '<div class="pc-phase"><div class="pc-phhd">🗂️ <b>Sessões sem wave</b> <span class="pc-phcnt">' + un.length + '</span>'
      + ' <span class="pc-sub">— associam-se via masterprompt no Ledger (kind:intent) ou nome/worktree</span></div>';
    out += '<div class="pc-subs open">';
    for (var ui = 0; ui < un.length; ui++) out += sessionRow(un[ui]);
    out += '</div></div>';
  }

  // ── footer: git glossary + strategy actions ───────────────────────────────
  out += '<div class="pc-foot">'
    + '<div class="pc-gloss"><b>Glossário git:</b> '
    + '<span title="commits locais ainda não enviados ao remoto"><b>unpushed ↑</b> por enviar</span> · '
    + '<span title="alterações no working tree ainda não guardadas num commit — o ÚNICO que se perde se fechares"><b class="pc-red">uncommitted ✎</b> por guardar</span> · '
    + '<span title="pull request / integração contínua a correr"><b>PR/CI</b> em revisão</span> · '
    + '<span title="já integrado no main"><b>merged</b> aterrado</span></div>'
    + '<div class="pc-acts">'
    + '<button class="pc-btn" data-a="designWave" title="pede ao Cowork para desenhar + escrever o masterprompt de uma nova wave">✎ design a new wave</button>'
    + '<button class="pc-btn" data-a="reprioritise" title="reordena por performance-por-esforço e mostra o caminho crítico">⇅ re-prioritise</button>'
    + '</div></div>';

  out += '</div>';
  return out;

  // ── wave card ─────────────────────────────────────────────────────────────
  function waveCard(w) {
    if (!w) return '';
    var id = esc(w.wave_id || '?');
    var tb = typeBadge(w.type);
    var f = w.forecast || {};
    // deps chips (met ✓ / waiting ○)
    var depHtml = '';
    var deps = Array.isArray(w.deps) ? w.deps : [];
    if (deps.length) {
      var chips = [];
      for (var di = 0; di < deps.length; di++) {
        var d = deps[di] || {};
        chips.push('<span class="pc-dep ' + (d.met ? 'met' : 'wait') + '" title="' + (d.met ? 'concluída (prova no Ledger)' : 'sem prova de conclusão no Ledger') + '">' + (d.met ? '✓ ' : '○ ') + esc(d.id) + '</span>');
      }
      depHtml = '<span class="pc-deps"><span class="pc-depk">deps</span>' + chips.join('') + '</span>';
    } else {
      depHtml = '<span class="pc-deps"><span class="pc-depk">deps</span><span class="pc-dep none">— nenhuma</span></span>';
    }

    // forecast line — never a fake cone; honest calibrating / no_base.
    var fcLine;
    if (f.state === 'cone') {
      var workTxt = (f.human && f.human.work) ? esc(f.human.work)
        : ('P50 work ' + (human(f.p50_work) || 'n/d') + ' · P90 work ' + (human(f.p90_work) || 'n/d'));
      var wallTxt = (f.human && f.human.wall) ? esc(f.human.wall)
        : ('P50 wall ' + (human(f.p50_wall) || 'n/d') + ' · P90 wall ' + (human(f.p90_wall) || 'n/d'));
      var relTxt = (num(f.reliability) != null) ? (' <span class="pc-rel" title="cobertura empírica dos teus P90">· fiabilidade ' + Math.round(f.reliability * 100) + '%</span>') : '';
      fcLine = '<div class="pc-fc pc-fc-cone" title="' + (f.premises && f.premises.reading ? esc(f.premises.reading) : 'distribuição se as premissas se mantiverem') + '">'
        + '<span class="pc-fk">⏱ trabalho</span> ' + workTxt
        + ' <span class="pc-fk">🕰 relógio</span> ' + wallTxt
        + relTxt
        + '<div class="pc-await">o wall inclui a espera por ti; o work são só os moos activos</div></div>';
    } else if (f.state === 'calibrating') {
      fcLine = '<div class="pc-fc pc-fc-cal">📊 a calibrar <b>' + esc(f.calibrating_progress || ((num(f.samples_n) != null ? f.samples_n : 0) + '/' + (num(s.k) != null ? s.k : 8))) + '</b>'
        + ' — sem cone até haver base comparável <span class="pc-fk">(≥ k eventos da classe)</span></div>';
    } else {
      fcLine = '<div class="pc-fc pc-fc-nob">📉 sem base comparável — <span class="pc-fk">' + esc(f.note || 'classe não declarada; sem P50/P90') + '</span></div>';
    }

    // honest progress bar — only when the Ledger has gate outcomes for this wave.
    var progHtml = '';
    var pr = w.progress;
    if (pr && (num(pr.pct) != null || num(pr.passed) != null)) {
      if (num(pr.pct) != null && num(pr.total) != null) {
        progHtml = '<div class="pc-prog" title="fases do masterprompt que passaram o gate (Ledger kind:outcome) / total">'
          + '<span class="pc-progk">fase ' + (pr.currentPhase != null ? esc(pr.currentPhase) : esc(pr.passed)) + '/' + esc(pr.total) + '</span>'
          + '<span class="pc-progbar"><span class="pc-progfill" style="width:' + pr.pct + '%"></span></span>'
          + '<span class="pc-progpct">' + pr.pct + '%</span></div>';
      } else {
        progHtml = '<div class="pc-prog"><span class="pc-progk">' + esc(pr.passed) + ' fases passaram</span>'
          + '<span class="pc-progpct pc-nd">total n/d</span></div>';
      }
    } else if (w.running) {
      progHtml = '<div class="pc-prog"><span class="pc-progk pc-nd">a correr · sem outcomes no Ledger ainda</span></div>';
    }

    // play — respects deps: locked → cadeado + reason; else a cost-confirmed action.
    var playHtml;
    if (w.locked) {
      playHtml = '<span class="pc-lock" title="' + esc(w.lock_reason || 'wave bloqueada por dependência') + '">🔒 ' + esc(w.lock_reason ? ('espera ' + depsUnmet(w).join(', ')) : 'bloqueada') + '</span>';
    } else {
      playHtml = '<button class="pc-btn pc-play" data-a="playWave" data-x="' + id + '" title="lança o masterprompt desta wave — ⚠️ acção com custo (sessão CC / GPU); confirma primeiro">▶ play</button>';
    }

    // sub-sessions chevron (client-side toggle wired by wirePc)
    var sess = Array.isArray(w.sessions) ? w.sessions : [];
    var chev = '<button class="pc-chev" data-wave="' + id + '" aria-expanded="false" title="mostra as sessões CC desta wave">'
      + '<span class="pc-chevi">▸</span> ' + sess.length + ' ' + (sess.length === 1 ? 'sessão' : 'sessões') + '</button>';

    var subs = '<div class="pc-subs" data-wave-subs="' + id + '" hidden>';
    if (sess.length) { for (var si = 0; si < sess.length; si++) subs += sessionRow(sess[si]); }
    else subs += '<div class="pc-nd" style="padding:6px 8px">⚪ nenhuma sessão ligada — associa-se via masterprompt no Ledger (kind:intent) ou nome/worktree</div>';
    subs += '</div>';

    return '<div class="pc-wave' + (w.running ? ' running' : '') + (w.locked ? ' locked' : '') + '">'
      + '<div class="pc-wtop">'
      + '<span class="pc-wid">' + id + '</span>'
      + '<span class="pc-wname">' + nd(w.name) + '</span>'
      + '<span class="pc-wbadge pc-type" title="modo: ' + esc(w.type || w.mode || 'n/d') + '">' + tb.icon + ' ' + esc(tb.label) + '</span>'
      + '<span class="pc-wbadge pc-eff" title="esforço estimado">' + effortDot(w.effort) + ' ' + (w.effort ? esc(w.effort) : '<span class="pc-nd">n/d</span>') + '</span>'
      + '<span class="pc-spacer"></span>'
      + stateChip(w)
      + '</div>'
      + (w.goal ? '<div class="pc-wgoal">' + esc(w.goal) + '</div>' : '')
      + fcLine
      + '<div class="pc-wmeta">' + depHtml + '</div>'
      + progHtml
      + '<div class="pc-wacts">' + playHtml + chev + '</div>'
      + subs
      + '</div>';
  }

  function depsUnmet(w) {
    var out2 = [];
    var deps = Array.isArray(w.deps) ? w.deps : [];
    for (var i = 0; i < deps.length; i++) { if (deps[i] && !deps[i].met) out2.push(esc(deps[i].id)); }
    return out2.length ? out2 : ['dependência'];
  }

  // ── sub-session row: branch@sha7 · state · git chips · click-to-tab ────────
  function sessionRow(ss) {
    if (!ss) return '';
    var stCls = (ss.status === 'working') ? 'work' : (ss.status === 'needs-you' ? 'warn' : 'idle');
    var stTitle = (ss.status === 'working') ? 'a trabalhar' : (ss.status === 'needs-you' ? 'à tua espera' : 'inactiva');
    var dirty = num(ss.dirty), ahead = num(ss.ahead);
    var gitPin = (ss.branch != null)
      ? '<span class="pc-gitpin"><span class="pc-branch">' + esc(ss.branch) + '</span>' + (ss.sha ? '<span class="pc-sha">@' + esc(ss.sha) + '</span>' : '') + '</span>'
      : '<span class="pc-nd">sem branch</span>';
    // uncommitted (✎ > 0) a vermelho é o alerta-mãe (trabalho não salvo = o único que se perde).
    var chips = '<span class="pc-chip' + (dirty ? ' pc-red' : '') + '" title="uncommitted — alterações por guardar num commit">✎ ' + (dirty == null ? '<span class="pc-nd">n/d</span>' : dirty) + '</span>'
      + '<span class="pc-chip' + (ahead ? ' pc-amber' : '') + '" title="unpushed — commits por enviar ao remoto">↑ ' + (ahead == null ? '<span class="pc-nd">n/d</span>' : ahead) + '</span>';
    var tail = ss.sid
      ? '<span class="pc-open" title="abrir/focar esta sessão no VS Code">🔗</span>'
      : '<span class="pc-nd">🔗 n/d</span>';
    var attr = ss.sid ? (' data-a="openSession" data-x="' + esc(ss.sid) + '" role="button" tabindex="0"') : '';
    var cls = 'pc-srow' + (ss.sid ? ' link' : '') + (dirty ? ' dirty' : '');
    return '<div class="' + cls + '"' + attr + '>'
      + '<span class="pc-sdot ' + stCls + '" title="' + esc(stTitle) + '"></span>'
      + '<span class="pc-stopic">' + topicEmoji(ss) + '</span>'
      + '<span class="pc-sname">' + nd(ss.name) + '</span>'
      + gitPin
      + '<span class="pc-spacer"></span>'
      + chips + tail
      + '</div>';
  }
}

// Defensive wrapper: the host calls this; it must NEVER throw on the render path.
function renderProjectCommandSafe(pc) {
  try { return renderProjectCommand(pc); }
  catch (e) { return '<div class="pc-nd">Project command — erro de render (' + String(e && e.message || e) + ')</div>'; }
}

module.exports = { renderProjectCommand, renderProjectCommandSafe };
