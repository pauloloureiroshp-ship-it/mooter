'use strict';
/**
 * plan.js — mooter-bridge v1.2 · CW4: the steps, who did them, and the risk.
 *
 * The panel could say "a job is running". It could not say WHAT THE PLAN IS,
 * which step we are on, who executed each one, or which of them can hurt you.
 * A vibe coder watching an agent work needs exactly those four things, and
 * needs them without opening an IDE.
 *
 * Storage: ~/.mooter/plans/<wave>.json — one small file per wave, rewritten
 * atomically. Not the ledger: the ledger is append-only truth about JOBS; a
 * plan is mutable intent about STEPS. Mixing them would corrupt both stories.
 *
 * Risk is INFERRED and then owned:
 *   alto  — push/merge/rebase/delete/deploy/secrets/migration/rm/force
 *   médio — writes, edits, installs, commits
 *   baixo — reads, analysis, tests, docs
 * The caller may override; the inference exists so nobody has to remember to
 * classify, and so a dangerous step is never quietly labelled safe.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MOOTER_DIR = () => process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const PLANS_DIR = () => path.join(MOOTER_DIR(), 'plans');

const RISK = { HIGH: 'alto', MED: 'médio', LOW: 'baixo' };
const STATES = ['pendente', 'a-correr', 'feito', 'falhou', 'saltado'];

const HIGH_RE = /\b(push|merge|rebase|force|delete|apagar|remover|rm\s|deploy|secret|token|api.?key|migration|migra[çc][aã]o|drop\s+table|prod(u[çc][aã]o)?|rota[çc][aã]o|revoke)\b/i;
const MED_RE = /\b(escrever|write|edit|editar|criar|create|commit|stage|install|instalar|refactor|renomear|rename|mover|move|patch|fix|corrigir|gerar)\b/i;

function inferRisk(title) {
  const t = String(title || '');
  if (HIGH_RE.test(t)) return RISK.HIGH;
  if (MED_RE.test(t)) return RISK.MED;
  return RISK.LOW;
}

function slug(w) { return String(w || 'adhoc').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }
function planPath(wave) { return path.join(PLANS_DIR(), slug(wave) + '.json'); }

function readPlan(wave) {
  try { return JSON.parse(fs.readFileSync(planPath(wave), 'utf8')); } catch { return null; }
}

function writePlan(plan) {
  fs.mkdirSync(PLANS_DIR(), { recursive: true });
  const p = planPath(plan.wave);
  // The tmp name must be unique per writer. A fixed `<wave>.json.tmp` meant two
  // concurrent writers (two connector processes, or two jobs of the same wave
  // finishing together) clobbered each other's temp file and one rename hit
  // ENOENT — swallowed by the caller's try/catch, so a step silently vanished.
  const tmp = p + '.' + process.pid + '.' + Math.random().toString(36).slice(2, 8) + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(plan, null, 2), 'utf8');
    fs.renameSync(tmp, p);   // atomic: the panel polls this file every 2-3s
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* */ }
    throw e;
  }
  return p;
}

function normStep(s, i) {
  const title = typeof s === 'string' ? s : String((s && s.title) || '');
  const o = typeof s === 'string' ? {} : (s || {});
  const risk = o.risk && Object.values(RISK).includes(o.risk) ? o.risk : inferRisk(title);
  return {
    id: o.id || 'S' + (i + 1),
    title,
    risk,
    risk_source: o.risk ? 'declarado' : 'inferido',
    agent: o.agent || null,          // who SHOULD do it
    state: STATES.includes(o.state) ? o.state : 'pendente',
    by: o.by || null,                // who ACTUALLY did it (agent + model)
    job_id: o.job_id || null,
    at: o.at || null,
    note: o.note || null,
  };
}

/** Create or replace the plan for a wave. Preserves progress on steps that survive. */
function setPlan(wave, steps, goal) {
  const prev = readPlan(wave);
  const prevById = new Map((prev && prev.steps || []).map((s) => [s.id, s]));
  const prevByTitle = new Map((prev && prev.steps || []).map((s) => [s.title, s]));
  const next = (Array.isArray(steps) ? steps : []).map(normStep).map((s) => {
    const old = prevById.get(s.id) || prevByTitle.get(s.title);
    if (old && old.state !== 'pendente') {
      return Object.assign({}, s, { state: old.state, by: old.by, job_id: old.job_id, at: old.at, note: old.note || s.note });
    }
    return s;
  });
  const plan = {
    wave: String(wave),
    goal: goal != null ? String(goal) : (prev && prev.goal) || null,
    created_at: (prev && prev.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    steps: next,
  };
  writePlan(plan);
  return plan;
}

/**
 * Acrescenta uma etapa sem destruir as que já existem.
 *
 * ⚠️ v1.3.3 — a razão de existir: `setPlan` substitui, e `mooter_work` chamava-o
 * a cada despacho. Três jobs na mesma wave davam um plano com UMA etapa, e o
 * painel — que desenha o plano como checklist — mostrava um terço do trabalho.
 */
function addStep(wave, step, goal) {
  const prev = readPlan(wave);
  if (!prev) return setPlan(wave, [step], goal);
  const norm = normStep(step, prev.steps.length);
  const existing = prev.steps.find((s) => s.id === norm.id);
  if (existing) { Object.assign(existing, { title: norm.title || existing.title, agent: norm.agent || existing.agent }); }
  else prev.steps.push(norm);
  if (goal && !prev.goal) prev.goal = String(goal);
  prev.updated_at = new Date().toISOString();
  writePlan(prev);
  return prev;
}

/** Move one step forward. `by` is who really did it — agent + concrete model. */
function updateStep(wave, stepId, patch) {
  let plan = readPlan(wave);
  const p0 = patch || {};
  // A dispatch that names a step must always become visible, even if nobody
  // wrote a plan first. Silently dropping it is how the panel ends up showing
  // a job with no context — the exact opacity this file exists to remove.
  if (!plan && p0.autocreate !== false) {
    plan = { wave: String(wave), goal: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), steps: [] };
  }
  if (!plan) return { error: 'sem plano para a wave "' + wave + '" — cria com mooter_plan action:"set"' };
  let s = plan.steps.find((x) => x.id === stepId || x.title === stepId);
  if (!s && p0.autocreate !== false) {
    s = normStep({ id: stepId, title: p0.title || stepId, agent: p0.agent }, plan.steps.length);
    plan.steps.push(s);
  }
  if (!s) return { error: 'etapa desconhecida: ' + stepId };
  const p = patch || {};
  if (p.state) {
    if (!STATES.includes(p.state)) return { error: 'estado inválido: ' + p.state + ' (esperado: ' + STATES.join('|') + ')' };
    s.state = p.state;
    s.at = new Date().toISOString();
  }
  if (p.by != null) s.by = String(p.by);
  if (p.job_id != null) s.job_id = String(p.job_id);
  if (p.note != null) s.note = String(p.note);
  if (p.risk && Object.values(RISK).includes(p.risk)) { s.risk = p.risk; s.risk_source = 'declarado'; }
  plan.updated_at = new Date().toISOString();
  writePlan(plan);
  return plan;
}

/** Everything the panel needs, already counted. */
function summarize(plan) {
  if (!plan) return null;
  const steps = plan.steps || [];
  const by = (st) => steps.filter((s) => s.state === st).length;
  const current = steps.find((s) => s.state === 'a-correr') || steps.find((s) => s.state === 'pendente') || null;
  return {
    wave: plan.wave,
    goal: plan.goal || null,
    updated_at: plan.updated_at,
    total: steps.length,
    done: by('feito'),
    failed: by('falhou'),
    running: by('a-correr'),
    pending: by('pendente'),
    skipped: by('saltado'),
    high_risk_open: steps.filter((s) => s.risk === RISK.HIGH && (s.state === 'pendente' || s.state === 'a-correr')).length,
    high_risk_done: steps.filter((s) => s.risk === RISK.HIGH && s.state === 'feito').length,
    current: current ? { id: current.id, title: current.title, risk: current.risk } : null,
    steps,
  };
}

function listPlans() {
  try {
    return fs.readdirSync(PLANS_DIR())
      .filter((f) => f.endsWith('.json'))
      .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(PLANS_DIR(), f), 'utf8')); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

module.exports = { setPlan, addStep, updateStep, readPlan, summarize, listPlans, inferRisk, planPath, RISK, STATES };
