// moo-loop.js — 🔁🖥️ Moo Loop Sessions · the typed-masterprompt contract.
//
// Brings the Cowork orchestration experience INTO the plugin: instead of pasting a raw
// prompt, the cockpit generates a *typed* masterprompt so a Claude Code session is BORN
// already knowing its mode (once / loop / schedule) — with the mode declared at the head
// and, for loops/schedules, the 5 mechanical declarations (TRIGGER/CHECK/ACTION/STOP/
// ESCALATE) validated up front. A loop without stop-conditions is REJECTED mechanically.
//
// 100% ADDITIVE + PURE: no vscode import, no side effects on require, zero deps. Does NOT
// touch classify.js (FROZEN) nor any engine file. Consumed host-side by extension.js and
// by moo-loop-runner.mjs. Every guardrail (H1-H8) is inherited, never re-invented here.
'use strict';

// ── The 3 session modes (the plugin gains 2 buttons next to "New Claude Code Session") ──
const MODES = {
  once: {
    id: 'once', emoji: '▶️', label: 'Once',
    button: 'New Claude Code Session',
    stop: 'fim da tarefa · pára no gate',
    needsContract: false,
  },
  loop: {
    id: 'loop', emoji: '🔁', label: 'Moo Loop',
    button: 'New Claude Code Moo Loop Session',
    stop: 'stopping-conditions (max-iter · budget · no-progress · goal)',
    needsContract: true,
  },
  schedule: {
    id: 'schedule', emoji: '⏰', label: 'Moo Schedule',
    button: 'New Claude Code Moo Schedule Session',
    stop: 'cada disparo = 1 ciclo bounded · wake-work-sleep',
    needsContract: true,
  },
};

// ── The 4 canonical trigger patterns (SOTA 2026 loop engineering) ──
const TRIGGERS = {
  heartbeat: { id: 'heartbeat', label: 'heartbeat', hint: 'corre a cada N (VRAM ociosa)' },
  cron: { id: 'cron', label: 'cron', hint: 'dispara num horário (ex.: 0 2 * * *)' },
  hook: { id: 'hook', label: 'hook', hint: 'reage a um evento (commit, PR, ficheiro)' },
  goal: { id: 'goal', label: 'goal', hint: 'corre até a meta ser atingida' },
};

// ── The Moo aggressiveness modes (regulate GPU/agressividade) ──
const MOO_MODES = {
  lazy: { id: 'lazy', emoji: '🐢', label: 'Lazy', note: 'cauteloso · GPU mínima' },
  moo: { id: 'moo', emoji: '🐮', label: 'Moo', note: 'equilibrado (default)' },
  crazy: { id: 'crazy', emoji: '🔥', label: 'Crazy', note: 'agressivo · GPU no talo' },
};

const RULE = '━'.repeat(60);

function _s(v) { return v == null ? '' : String(v).trim(); }
function _int(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }

// Normalize a raw spec into the canonical shape (fills safe defaults; never invents a STOP).
function normalizeSpec(raw) {
  raw = raw || {};
  const mode = MODES[raw.mode] ? raw.mode : 'once';
  const trig = raw.trigger || {};
  const stop = raw.stop || {};
  const budget = stop.budget || {};
  return {
    mode,
    task: _s(raw.task),
    worktree: _s(raw.worktree),
    mooMode: MOO_MODES[raw.mooMode] ? raw.mooMode : 'moo',
    trigger: {
      kind: TRIGGERS[trig.kind] ? trig.kind : (mode === 'schedule' ? 'cron' : 'heartbeat'),
      detail: _s(trig.detail),
    },
    check: _s(raw.check),
    action: _s(raw.action),
    stop: {
      maxIterations: _int(stop.maxIterations),
      budget: { gpuMin: _int(budget.gpuMin), usd: Number(budget.usd) > 0 ? Number(budget.usd) : 0 },
      noProgressCycles: _int(stop.noProgressCycles),
      goal: _s(stop.goal),
    },
    escalate: _s(raw.escalate),
  };
}

// A STOP is "real" iff at least ONE bounded condition exists. This is the mechanical gate
// that makes "a loop without stop-conditions is rejected" a fact, not a guideline.
function hasRealStop(stop) {
  if (!stop) return false;
  const b = stop.budget || {};
  return _int(stop.maxIterations) > 0 || _int(stop.noProgressCycles) > 0
    || _int(b.gpuMin) > 0 || Number(b.usd) > 0 || _s(stop.goal).length > 0;
}

// Mechanical validation of the loop contract. once → only needs a task. loop/schedule →
// the 5 declarations must all be present AND STOP must be real. Returns {ok, errors, spec}.
function validateLoopContract(raw) {
  const spec = normalizeSpec(raw);
  const errors = [];
  if (!spec.task) errors.push('task em falta (o que a sessão faz)');
  if (MODES[spec.mode].needsContract) {
    if (!TRIGGERS[spec.trigger.kind]) errors.push('TRIGGER inválido (usa heartbeat/cron/hook/goal)');
    if (!spec.check) errors.push('CHECK em falta (o que observa a cada ciclo)');
    if (!spec.action) errors.push('ACTION em falta (a mão-de-obra $0 de um ciclo)');
    if (!spec.escalate) errors.push('ESCALATE em falta (quando pára e chama o humano)');
    if (!hasRealStop(spec.stop)) {
      errors.push('STOP sem condições reais — um loop sem stopping-conditions é REJEITADO ' +
        '(define pelo menos uma: max-iterações · budget · no-progress · goal)');
    }
    if (spec.mode === 'schedule' && !spec.trigger.detail && spec.trigger.kind === 'cron') {
      errors.push('SCHEDULE cron sem horário (trigger.detail, ex.: "0 2 * * *")');
    }
  }
  return { ok: errors.length === 0, errors, spec };
}

// Human-readable summary of every STOP condition that is set (for the header + Console).
function stopSummary(stop) {
  const out = [];
  const b = (stop && stop.budget) || {};
  if (_int(stop && stop.maxIterations) > 0) out.push('max ' + stop.maxIterations + ' iter');
  if (_int(b.gpuMin) > 0) out.push(b.gpuMin + ' GPU-min');
  if (Number(b.usd) > 0) out.push('$' + Number(b.usd).toFixed(2));
  if (_int(stop && stop.noProgressCycles) > 0) out.push('no-progress ×' + stop.noProgressCycles);
  if (_s(stop && stop.goal)) out.push('goal: ' + stop.goal);
  return out.length ? out.join(' · ') : '(nenhuma — inválido)';
}

// The MODE HEADER the CC reads FIRST — the session never stays unsure of what it is.
// This is the opposite of the handoff that used to lie: the mode is declared at the head.
function buildModeHeader(raw) {
  const spec = normalizeSpec(raw);
  const M = MODES[spec.mode];
  const moo = MOO_MODES[spec.mooMode];
  const lines = [
    RULE,
    `${M.emoji} MOO ${M.label.toUpperCase()} SESSION · modo=${spec.mode} · ${moo.emoji} ${moo.label}`,
    'Esta sessão SABE o que é. Lê este cabeçalho ANTES de agir.',
  ];
  if (M.needsContract) {
    lines.push(`• TRIGGER:  ${spec.trigger.kind}${spec.trigger.detail ? ' · ' + spec.trigger.detail : ''}`);
    lines.push(`• STOP:     ${stopSummary(spec.stop)}  (pára quando QUALQUER condição dispara)`);
  } else {
    lines.push(`• STOP:     ${M.stop}`);
  }
  lines.push('• Guardrails: H1-H8 · classify.js FROZEN · main read-only · gate humano no irreversível');
  lines.push('• NUNCA fazes o irreversível — propões e PÁRAS (H1: fricção assimétrica).');
  lines.push(RULE);
  return lines.join('\n');
}

// The full typed masterprompt: header (mode declared) + task + (loop/schedule) the 5
// declarations + Cowork-mirroring behaviour + the gate. This is what the button generates.
function buildMasterprompt(raw) {
  const spec = normalizeSpec(raw);
  const M = MODES[spec.mode];
  const parts = [buildModeHeader(spec), ''];

  parts.push('## Tarefa');
  parts.push(spec.task || '(por preencher)');
  if (spec.worktree) {
    parts.push('');
    parts.push('## Worktree (isolamento obrigatório)');
    parts.push('`git worktree add ../' + spec.worktree + ' -b feat/' + spec.worktree + ' main`');
    parts.push('Trabalha SÓ neste worktree. Nunca em `main`, nunca no worktree de outra sessão.');
  }

  if (M.needsContract) {
    parts.push('');
    parts.push('## Contrato do loop (as 5 declarações — mecânicas, validadas à cabeça)');
    parts.push('- **TRIGGER:** ' + spec.trigger.kind + (spec.trigger.detail ? ' · ' + spec.trigger.detail : '')
      + ' — ' + (TRIGGERS[spec.trigger.kind] || {}).hint);
    parts.push('- **CHECK:** ' + spec.check + '  _(observa do Ledger/git/telemetria — nunca inventa estado)_');
    parts.push('- **ACTION:** ' + spec.action + '  _(mão-de-obra $0 de UM ciclo: plan→act→observe→decide)_');
    parts.push('- **STOP:** ' + stopSummary(spec.stop)
      + '  _(múltiplas · a sessão pára quando qualquer uma dispara)_');
    parts.push('- **ESCALATE:** ' + spec.escalate + '  _(pára e chama o humano no irreversível/incerto)_');
    parts.push('');
    parts.push('## Espelha o Cowork (comporta-te como ele orquestra)');
    parts.push('- Mantém uma **task-list** viva; usa **AskUserQuestion** no gate (não diálogos soltos).');
    parts.push('- Emite o **Perfect Handoff** a cada pausa (STATE/GATE/PENDING verdadeiros, PARA TI).');
    parts.push('- A cada ciclo termina com um bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE).');
    parts.push('- Respeita o modo Moo (' + MOO_MODES[spec.mooMode].emoji + ' ' + MOO_MODES[spec.mooMode].label
      + ') — regula a agressividade/uso de GPU.');
  }

  parts.push('');
  parts.push('## Gate (herda tudo)');
  parts.push('`classify.js` sha `427d8c0b…4bc48f` intacta · `node --test` · `git add` selectivo · **sem push sem OK**.');
  parts.push('No irreversível: propõe e pára — o humano carrega no botão (H1).');
  return parts.join('\n');
}

// Parse the ```status``` block a loop cycle emits: DID/TESTS/BLOCKERS/NEXT/DONE.
// Tolerant: missing block → all-empty, done:false. Never throws.
function parseStatusBlock(text) {
  const out = { did: '', tests: '', blockers: '', next: '', done: false, found: false };
  const raw = _s(text);
  if (!raw) return out;
  let body = raw;
  const fence = raw.match(/```[ \t]*status[ \t]*\r?\n([\s\S]*?)```/i);
  if (fence) { body = fence[1]; out.found = true; }
  const field = (key) => {
    const re = new RegExp('^[ \\t]*' + key + '[ \\t]*:[ \\t]*(.*)$', 'im');
    const m = body.match(re);
    return m ? m[1].trim() : '';
  };
  out.did = field('DID');
  out.tests = field('TESTS');
  out.blockers = field('BLOCKERS');
  out.next = field('NEXT');
  const done = field('DONE');
  out.done = /^(yes|y|true|done|sim|✓)$/i.test(done);
  if (!out.found && (out.did || out.next || done)) out.found = true;
  return out;
}

// Evaluate STOP against live cycle state. Ordered so goal/human intent wins, then hard
// caps (iter/budget), then the no-progress hibernation. Returns {stop, reason}.
// state = { iteration, noProgressStreak, gpuMinUsed, usdUsed, goalMet, escalated }
function evaluateStop(raw, state) {
  const spec = normalizeSpec(raw);
  const st = state || {};
  const stop = spec.stop;
  const b = stop.budget || {};
  if (st.escalated) return { stop: true, reason: 'escalate (gate humano — irreversível/incerto)' };
  if (st.goalMet || (_s(stop.goal) && st.goalMet)) return { stop: true, reason: 'goal-achievement (meta atingida)' };
  if (_int(stop.maxIterations) > 0 && _int(st.iteration) >= stop.maxIterations) {
    return { stop: true, reason: 'max-iterations (' + stop.maxIterations + ')' };
  }
  if (_int(b.gpuMin) > 0 && Number(st.gpuMinUsed) >= b.gpuMin) {
    return { stop: true, reason: 'budget GPU-min (' + b.gpuMin + ')' };
  }
  if (Number(b.usd) > 0 && Number(st.usdUsed) >= Number(b.usd)) {
    return { stop: true, reason: 'budget $ ($' + Number(b.usd).toFixed(2) + ')' };
  }
  if (_int(stop.noProgressCycles) > 0 && _int(st.noProgressStreak) >= stop.noProgressCycles) {
    return { stop: true, reason: 'no-progress ×' + stop.noProgressCycles + ' → hiberna' };
  }
  return { stop: false, reason: null };
}

// A sensible, VALID default spec so a button can generate a runnable masterprompt instantly.
function defaultSpec(mode, task) {
  const m = MODES[mode] ? mode : 'once';
  const base = { mode: m, task: _s(task) || 'Descreve aqui o objectivo da sessão.', mooMode: 'moo' };
  if (m === 'once') return base;
  if (m === 'schedule') {
    return Object.assign(base, {
      trigger: { kind: 'cron', detail: '0 2 * * *' },
      check: 'lê o Ledger/git desde o último disparo (o que mudou)',
      action: 'corre UM ciclo bounded de trabalho $0 local, depois dorme',
      stop: { maxIterations: 1, budget: { gpuMin: 30, usd: 0 }, noProgressCycles: 0, goal: '' },
      escalate: 'qualquer proposta irreversível → pára e regista para o humano',
    });
  }
  return Object.assign(base, { // loop
    trigger: { kind: 'heartbeat', detail: 'VRAM ociosa' },
    check: 'observa o sinal do pilar no Ledger/git (nunca inventa estado)',
    action: 'plan→act→observe→decide uma proposta-com-prova ($0 local)',
    stop: { maxIterations: 3, budget: { gpuMin: 60, usd: 0 }, noProgressCycles: 2, goal: '' },
    escalate: 'no irreversível/incerto propõe e pára — o humano decide (H1)',
  });
}

module.exports = {
  MODES, TRIGGERS, MOO_MODES,
  normalizeSpec, hasRealStop, validateLoopContract, stopSummary,
  buildModeHeader, buildMasterprompt, parseStatusBlock, evaluateStop, defaultSpec,
};
