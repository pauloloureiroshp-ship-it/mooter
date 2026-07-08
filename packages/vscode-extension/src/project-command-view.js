'use strict';
// project-command-view.js — Delivery Cockpit · Frente B (🛩️ Project command tab).
//
// `renderProjectCommand(pc, opts)` renders the WHOLE Project Command tab PURELY from the
// ProjectCommandSnapshot (pc-snapshot.js). It is the CTO cabin — the JOURNEY (the plan over
// time), the sibling of Mission Control (the live NOW). It answers three questions honestly:
//   · o que FAZER  — the backlog of waves, forecast (P50/P90 work+wall, or calibrating/no-base)
//   · o que ESTÁ a ser feito — flow/WIP from real signals, "precisa de ti", live sub-sessions
//   · o que VEM   — deps, locked play, the critical path
//
// TWO AXES over the same waves (client toggle): **por Fase** (now/next/frontier) and **por
// Squad** (Team Topologies lanes, each with health DERIVED from real signals — live sessions +
// git worktrees + recent commits — never a painted-green dot; no signal → 💤 dormant).
//
// **Concat-only / CSP-safe**: no template literals, no `${}`, no inline handlers — host actions
// are `<button data-a=… data-x=…>` (wired host-side); the chevron/axis toggle are `data-*`
// buttons wired client-side by wirePc. Serialised via `.toString()` into getHtml(); a backtick
// or `${` here would break the outer template and the webview-syntax test.
//
// Honesty rule: EVERY field nullable → n/d. Health/WIP ALWAYS from real signals (zero fabrication).
// Identity: 🐮 brand · 🐢/🐮/🔥 modes align · sentence case · number-never-naked · dark · restraint.

function renderProjectCommand(pc, opts) {
  var axis = (opts && opts.axis === 'squad') ? 'squad' : 'phase';

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
  function typeBadge(t) {
    var x = String(t || '').toLowerCase();
    if (/schedule/.test(x)) return { icon: '⏰', label: 'schedule' };
    if (/dynamic|workflow/.test(x)) return { icon: '🌀', label: 'workflow' };
    if (/loop/.test(x)) return { icon: '🔁', label: 'loop' };
    if (/cc|once/.test(x)) return { icon: '🖥️', label: 'CC-once' };
    return { icon: '·', label: (t ? String(t).slice(0, 14) : 'n/d') };
  }
  function stateChip(w) {
    if (w.running) return '<span class="pc-st pc-run">▶ a correr</span>';
    var st = w.forecast && w.forecast.state;
    if (st === 'cone') return '<span class="pc-st pc-cone">● forecast</span>';
    if (st === 'calibrating') return '<span class="pc-st pc-cal">◐ a calibrar</span>';
    return '<span class="pc-st pc-nob">○ sem base</span>';
  }
  function healthDot(level) {
    if (level === 'active') return { dot: '🟢', label: 'ativo' };
    if (level === 'warm') return { dot: '🟡', label: 'morno' };
    return { dot: '💤', label: 'dormente' };
  }
  function phaseChip(phase) {
    var p = String(phase || '').toUpperCase();
    var lbl = p === 'NOW' ? 'agora' : (p === 'NEXT' ? 'a seguir' : (p === 'FRONTIER' ? 'fronteira' : p.toLowerCase()));
    if (!lbl) return '';
    return '<span class="pc-phchip">' + esc(lbl) + '</span>';
  }
  function topicEmoji(s) {
    var x = String((s && (s.topic || s.name)) || '').toLowerCase() + ' ' + String((s && s.branch) || '').toLowerCase();
    if (/\bui\b|\bux\b|cockpit|webview|css|render|design|lane/.test(x)) return '🎨';
    if (/router|algo|classif|council|adapter|forge|pastor|lora|fleet/.test(x)) return '🧮';
    if (/handoff|sync|bridge|infra|deploy|\bci\b|hub|comms|comm/.test(x)) return '🤝';
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

  // ── header: 🐮 brand + title + axis toggle + refresh ──────────────────────
  var counts = s.counts || {};
  out += '<div class="pc-head">'
    + '<span class="pc-brand" title="Mooter">🐮</span>'
    + '<span class="pc-title">🛩️ Project command</span>'
    + '<span class="pc-headcount">' + (num(counts.total) != null ? counts.total : 0) + ' waves</span>'
    + '<span class="pc-spacer"></span>'
    + '<span class="pc-axis" role="tablist" aria-label="eixo de agrupamento">'
    + '<button class="pc-axbtn' + (axis === 'phase' ? ' on' : '') + '" data-axis="phase" title="agrupar por fase (now/next/frontier)">Fase</button>'
    + '<button class="pc-axbtn' + (axis === 'squad' ? ' on' : '') + '" data-axis="squad" title="agrupar por squad (Team Topologies)">Squad</button>'
    + '</span>'
    + '<button class="pc-btn pc-mini" data-a="refresh" title="regenera o snapshot (o forecast.json continua a ser a verdade base)">🔄</button>'
    + '</div>';

  // ── FRONTEIRA: a jornada, não o agora (não duplica o Mission Control) ──────
  // F2 · densidade — condensed to one dim line; the "→ Mission Control" cross-link moves into the title.
  out += '<div class="pc-frontier" title="para o agora vivo (sessões deste instante) → aba 🎛️ Mission Control">'
    + '🛩️ <b>A jornada</b> — o plano ao longo do tempo (waves · squads · forecast) · <span class="pc-dim">agora vivo → Mission Control</span></div>';

  // ── FLUXO / WIP band + "precisa de ti" (real signals) ─────────────────────
  out += flowBand(s.flow);

  // ── scope banner — the never-nu premise: distribution, not a promise ───────
  var scopeShort = s.scope_hash ? String(s.scope_hash).slice(0, 12) : null;
  var inj = num(s.injection_rate);
  var injTxt = (inj == null) ? null : ((1 + inj).toFixed(1) + '× do que planeias tende a acontecer');
  if (s.stale) {
    out += '<div class="pc-banner pc-stale">⚠️ <b>Forecast STALE</b> — o roadmap mudou desde que este forecast foi gerado (o âmbito moveu-se). '
      + 'Corre o CLI outra vez para reconciliar; até lá os cones abaixo são do âmbito antigo.</div>';
  }
  // F2 · n/d agrupado — scope_hash + generated_ts arrive together from forecast.json; when BOTH are absent
  // state it once ("forecast por gerar") instead of two adjacent n/d chips in the premise banner.
  var genTxt = s.generated_ts ? String(s.generated_ts).slice(0, 16).replace('T', ' ') : null;
  var scopeCells = (scopeShort == null && genTxt == null)
    ? '<span class="pc-sk"><span class="pc-nd">forecast por gerar — corre o CLI</span></span>'
    : '<span class="pc-sk">âmbito congelado @ <b>' + (scopeShort ? esc(scopeShort) : '<span class="pc-nd">n/d</span>') + '</b></span>'
      + '<span class="pc-vr"></span>'
      + '<span class="pc-sk">gerado ' + nd(genTxt) + '</span>';
  out += '<div class="pc-scope">'
    + '<span class="pc-sk">distribuição, não promessa</span>'
    + '<span class="pc-vr"></span>'
    + scopeCells
    + (injTxt ? '<span class="pc-vr"></span><span class="pc-sk" title="injection rate — waves não-planeadas históricas / planeadas">📈 ' + esc(injTxt) + '</span>' : '')
    + '</div>';

  // F2 · densidade — a 0-count legend entry ("◐ a calibrar 0 waves") reads as filler; show the quantifier
  // only when there is a real non-zero cohort. The cone forecast explainer lives here ONCE (was reprinted
  // on every cone card via pc-await).
  out += '<div class="pc-legend">'
    + '<span class="pc-st pc-cone">● forecast</span> P50/P90 com base'
    + '<span class="pc-vr"></span><span class="pc-st pc-cal">◐ a calibrar</span>' + (num(counts.calibrating) ? ' ' + counts.calibrating + ' waves (n&lt;k eventos)' : '')
    + '<span class="pc-vr"></span><span class="pc-st pc-nob">○ sem base</span>' + (num(counts.no_base) ? ' ' + counts.no_base + ' waves (classe não declarada)' : '')
    + '<span class="pc-vr"></span><span class="pc-dim">🕰 o wall inclui a espera por ti; o work são só os moos activos</span>'
    + '</div>';

  // ── AXIS: por Fase ↔ por Squad ─────────────────────────────────────────────
  if (axis === 'squad') out += renderSquadAxis(s);
  else out += renderPhaseAxis(s);

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

  // ══ FLOW / WIP band ═══════════════════════════════════════════════════════
  function flowBand(flow) {
    var f = flow || {};
    var html = '<div class="pc-flow">';

    // "precisa de ti" — awaiting-you sessions (Ledger). Attention-first.
    var ny = Array.isArray(f.need_you) ? f.need_you : [];
    html += '<div class="pc-flowrow">';
    html += '<span class="pc-flowk pc-need' + (ny.length ? ' on' : '') + '" title="sessões CC à tua espera (Ledger)">🍅 precisa de ti <b>' + ny.length + '</b></span>';

    // WIP chip — real worktrees; alert above the healthy ceiling.
    var wip = f.wip || {};
    var over = wip.over === true;
    html += '<span class="pc-flowk pc-wip' + (over ? ' alert' : '') + '" title="worktrees com commit &lt;7d (streams em voo) · limite saudável ' + (num(wip.limit) != null ? wip.limit : 3) + ' · baixar WIP é a régua nº1 do roadmap">'
      + '🌀 WIP <b>' + (num(wip.active) != null ? wip.active : '<span class="pc-nd">n/d</span>') + '</b>'
      + (num(wip.total) != null ? ' <span class="pc-dim">/ ' + wip.total + ' worktrees</span>' : '')
      + ' <span class="pc-dim">· limite ' + (num(wip.limit) != null ? wip.limit : 3) + '</span>'
      + (over ? ' <span class="pc-wipx">⚠ acima</span>' : '') + '</span>';

    // DORA-flavoured flow (real from git). F2 · n/d agrupado — show only the metrics that have a real value
    // as chips, and collapse the cold ones (merges-freq · cycle-time) into ONE trailing "n/d — Ledger a
    // calibrar" note instead of stamping a separate n/d chip per metric.
    var depF = num(f.deploy_freq_per_week), cyc = num(f.cycle_time);
    if (depF != null) html += '<span class="pc-flowk" title="merges no main por semana (últimos 30d)">🚀 <b>' + depF + '</b> <span class="pc-dim">merges/sem</span></span>';
    html += '<span class="pc-flowk" title="waves marcadas ✅ no roadmap">✅ <b>' + (num(f.waves_done) != null ? f.waves_done : 0) + '</b> <span class="pc-dim">entregues</span></span>';
    if (cyc != null) html += '<span class="pc-flowk" title="tempo de ciclo intent→gate">⏱ <span class="pc-dim">cycle</span> ' + esc(cyc) + '</span>';
    if (depF == null || cyc == null) {
      var miss = [];
      if (depF == null) miss.push('merges/sem');
      if (cyc == null) miss.push('cycle');
      html += '<span class="pc-flowk pc-dim" title="métricas DORA — chegam quando o Ledger tiver spans">📉 ' + esc(miss.join(' · ')) + ' <span class="pc-nd">n/d</span> — Ledger a calibrar</span>';
    }
    html += '</div>';

    // "precisa de ti" strip: the actual sessions, click-to-tab.
    if (ny.length) {
      html += '<div class="pc-needstrip">';
      for (var i = 0; i < ny.length; i++) html += sessionRow(ny[i]);
      html += '</div>';
    }
    if (num(wip.stale) != null && wip.stale > 0) {
      html += '<div class="pc-wiphint">' + wip.stale + ' worktrees sem commit recente — poda-as (W2 Housekeeping) para baixar o WIP.</div>';
    }
    html += '</div>';
    return html;
  }

  // ══ AXIS: por Fase ════════════════════════════════════════════════════════
  function renderPhaseAxis(sn) {
    var html = '';
    var phases = Array.isArray(sn.phases) ? sn.phases : [];
    if (!phases.length) return '<div class="pc-nd" style="padding:14px 2px">⚪ sem waves no roadmap (verifica docs/strategy/MOOTER_ROADMAP.md)</div>';
    for (var pi = 0; pi < phases.length; pi++) {
      var ph = phases[pi] || {};
      var phEmoji = ph.key === 'NOW' ? '🎯' : (ph.key === 'NEXT' ? '🧱' : '🔭');
      html += '<div class="pc-phase"><div class="pc-phhd">' + phEmoji + ' <b>' + esc(ph.label || ph.key) + '</b>'
        + ' <span class="pc-phk">' + esc(ph.key || '') + '</span>'
        + ' <span class="pc-phcnt">' + (Array.isArray(ph.waves) ? ph.waves.length : 0) + '</span></div>';
      var waves = Array.isArray(ph.waves) ? ph.waves : [];
      for (var wi = 0; wi < waves.length; wi++) html += waveCard(waves[wi], 'phase');
      html += '</div>';
    }
    return html;
  }

  // ══ AXIS: por Squad (lanes; health DERIVED, evidence attached) ═════════════
  function renderSquadAxis(sn) {
    var html = '';
    var squads = Array.isArray(sn.squads) ? sn.squads : [];
    if (!squads.length) return '<div class="pc-nd" style="padding:14px 2px">⚪ sem squads no roadmap (coluna Squad ausente)</div>';
    for (var si = 0; si < squads.length; si++) {
      var sq = squads[si] || {};
      var h = healthDot(sq.health && sq.health.level);
      var ev = (sq.health && sq.health.evidence) || {};
      html += '<div class="pc-lane pc-h-' + esc((sq.health && sq.health.level) || 'dormant') + '">';
      html += '<div class="pc-lanehd">'
        + '<span class="pc-lanedot" title="' + esc(h.label) + '">' + h.dot + '</span>'
        + '<span class="pc-lanename">' + esc(sq.emoji || '') + ' <b>' + esc(sq.label || 'squad') + '</b></span>'
        + (sq.type ? '<span class="pc-lanetype" title="Team Topologies">' + esc(sq.type) + '</span>' : '')
        + '<span class="pc-spacer"></span>'
        + '<span class="pc-laneev" title="saúde derivada de sinais reais — sessões vivas · worktrees · commits recentes">'
        + '🟢 ' + (num(ev.live) != null ? ev.live : 0) + ' <span class="pc-dim">vivas</span>'
        + ' · ⎇ ' + (num(ev.worktrees) != null ? ev.worktrees : 0) + ' <span class="pc-dim">wt</span>'
        + ' · ⟳ ' + (num(ev.recentCommits) != null ? ev.recentCommits : 0) + ' <span class="pc-dim">commits</span></span>'
        + '<span class="pc-phcnt">' + (Array.isArray(sq.waves) ? sq.waves.length : 0) + '</span>'
        + '</div>';
      if (sq.frente) html += '<div class="pc-lanefrente">' + esc(sq.frente) + '</div>';
      var waves = Array.isArray(sq.waves) ? sq.waves : [];
      for (var wi = 0; wi < waves.length; wi++) html += waveCard(waves[wi], 'squad');
      html += '</div>';
    }
    return html;
  }

  // ── wave card (shared by both axes) ────────────────────────────────────────
  function waveCard(w, ctx) {
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
      depHtml = ''; // F2 · densidade — a dependency-free wave spends no chip on "deps — nenhuma".
    }

    // forecast line — never a fake cone.
    var fcLine;
    if (f.state === 'cone') {
      var workTxt = (f.human && f.human.work) ? esc(f.human.work)
        : ('P50 work ' + (human(f.p50_work) || 'n/d') + ' · P90 work ' + (human(f.p90_work) || 'n/d'));
      var wallTxt = (f.human && f.human.wall) ? esc(f.human.wall)
        : ('P50 wall ' + (human(f.p50_wall) || 'n/d') + ' · P90 wall ' + (human(f.p90_wall) || 'n/d'));
      var relTxt = (num(f.reliability) != null) ? (' <span class="pc-rel" title="cobertura empírica dos teus P90">· fiabilidade ' + Math.round(f.reliability * 100) + '%</span>') : '';
      // F2 · densidade — the wall-vs-work explainer is printed ONCE in the legend, not per cone card.
      fcLine = '<div class="pc-fc pc-fc-cone" title="' + (f.premises && f.premises.reading ? esc(f.premises.reading) : 'distribuição se as premissas se mantiverem') + '">'
        + '<span class="pc-fk">⏱ trabalho</span> ' + workTxt
        + ' <span class="pc-fk">🕰 relógio</span> ' + wallTxt + relTxt + '</div>';
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
    if (sess.length) { for (var xi = 0; xi < sess.length; xi++) subs += sessionRow(sess[xi]); }
    else subs += '<div class="pc-nd" style="padding:6px 8px" title="associa-se via masterprompt no Ledger (kind:intent) ou nome/worktree">⚪ nenhuma sessão ligada</div>';
    subs += '</div>';

    // squad chip (phase axis) / phase chip (squad axis) — the wave↔squad↔phase linkage, visible.
    var ctxChip = (ctx === 'squad') ? phaseChip(w.phase)
      : (w.squad ? '<span class="pc-sqchip" title="squad: ' + esc(w.squad) + '">' + esc(w.squad_emoji || '🗂️') + '</span>' : '');
    var estadoLine = w.estado
      ? '<div class="pc-estado" title="estado declarado no roadmap (humano) — distinto do forecast derivado"><span class="pc-fk">estado</span> ' + esc(w.estado) + '</div>'
      : '';

    return '<div class="pc-wave' + (w.running ? ' running' : '') + (w.locked ? ' locked' : '') + '">'
      + '<div class="pc-wtop">'
      + '<span class="pc-wid">' + id + '</span>'
      + '<span class="pc-wname">' + nd(w.name) + '</span>'
      + ctxChip
      + '<span class="pc-wbadge pc-type" title="modo: ' + esc(w.type || w.mode || 'n/d') + '">' + tb.icon + ' ' + esc(tb.label) + '</span>'
      + '<span class="pc-wbadge pc-eff" title="esforço estimado">' + effortDot(w.effort) + ' ' + (w.effort ? esc(w.effort) : '<span class="pc-nd">n/d</span>') + '</span>'
      + '<span class="pc-spacer"></span>'
      + stateChip(w)
      + '</div>'
      + (w.goal ? '<div class="pc-wgoal">' + esc(w.goal) + '</div>' : '')
      + estadoLine
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
    // F2 · n/d agrupado — a session with zero git signals (no branch/dirty/ahead/sid) states it ONCE
    // instead of scattering four separate n/d tokens (sem branch · ✎ n/d · ↑ n/d · 🔗 n/d) across the row.
    var gitRegion;
    if (ss.branch == null && dirty == null && ahead == null && !ss.sid) {
      gitRegion = '<span class="pc-spacer"></span><span class="pc-nd">n/d — sessão sem sinais git</span>';
    } else {
      var gitPin = (ss.branch != null)
        ? '<span class="pc-gitpin"><span class="pc-branch">' + esc(ss.branch) + '</span>' + (ss.sha ? '<span class="pc-sha">@' + esc(ss.sha) + '</span>' : '') + '</span>'
        : '<span class="pc-nd">sem branch</span>';
      var chips = '<span class="pc-chip' + (dirty ? ' pc-red' : '') + '" title="uncommitted — alterações por guardar num commit">✎ ' + (dirty == null ? '<span class="pc-nd">n/d</span>' : dirty) + '</span>'
        + '<span class="pc-chip' + (ahead ? ' pc-amber' : '') + '" title="unpushed — commits por enviar ao remoto">↑ ' + (ahead == null ? '<span class="pc-nd">n/d</span>' : ahead) + '</span>';
      var tail = ss.sid
        ? '<span class="pc-open" title="abrir/focar esta sessão no VS Code">🔗</span>'
        : '<span class="pc-nd">🔗 n/d</span>';
      gitRegion = gitPin + '<span class="pc-spacer"></span>' + chips + tail;
    }
    var attr = ss.sid ? (' data-a="openSession" data-x="' + esc(ss.sid) + '" role="button" tabindex="0"') : '';
    var cls = 'pc-srow' + (ss.sid ? ' link' : '') + (dirty ? ' dirty' : '');
    return '<div class="' + cls + '"' + attr + '>'
      + '<span class="pc-sdot ' + stCls + '" title="' + esc(stTitle) + '"></span>'
      + '<span class="pc-stopic">' + topicEmoji(ss) + '</span>'
      + '<span class="pc-sname">' + nd(ss.name) + '</span>'
      + gitRegion
      + '</div>';
  }
}

// Defensive wrapper: the host calls this; it must NEVER throw on the render path.
function renderProjectCommandSafe(pc, opts) {
  try { return renderProjectCommand(pc, opts); }
  catch (e) { return '<div class="pc-nd">Project command — erro de render (' + String(e && e.message || e) + ')</div>'; }
}

module.exports = { renderProjectCommand, renderProjectCommandSafe };
