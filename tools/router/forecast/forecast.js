#!/usr/bin/env node
// forecast.js — the brain. Joins the OBSERVED past (ledger) to the DECLARED plan
// (roadmap) and emits forecast.json, applying ALL 11 honesty invariants:
//
//  1  per-CLASS distributions; a class-less wave → "sem base comparável", no cone
//  2  sliding window + CUSUM regime-break (stats.js)
//  3  blocker as a separate component, conditioned on the wave's env (DC-03)
//  4  never-nu number: P50 AND P90 together + premises + half-life
//  5  cold-start gate: n<k → calibrating "n/k", NO cone (montecarlo firewall)
//  6  DAG makespan, never summed P90s (montecarlo + dag)
//  7  work-time vs wall-time, both reported (ledger-read two clocks)
//  8/9/10  anti-gaming: substantive-work unit; remaining hard work; quality coupling
//  11 explainability: drivers[] traceable to sids/event-ids
//  + calibration auto-widen & reliability (DC-16); scope_hash & staleness (DC-14/15);
//    injection rate (DC-17).
//
// Backend is $0: pure Node, no cloud, no deps beyond the ledger spine's provHash.
// The CLI writes forecast.json; the UI (Frente B) only READS it.

'use strict';

const fs = require('fs');
const path = require('path');

const { provHash } = require('../ledger-prov.js');
const { parseRoadmap } = require('./roadmap.js');
const ledgerRead = require('./ledger-read.js');
const { classifyWave, bucketKey } = require('./class-taxonomy.js');
const stats = require('./stats.js');
const { simulate } = require('./montecarlo.js');
const calibration = require('./calibration.js');

const HALF_LIFE = 'válido até uma nova wave fechar (o âmbito muda → STALE)';
const BLOCKER_CAUSES = ['oauth', 'worktree_lock', 'mount_windows'];

function _median(a) { return stats.percentile(a, 0.5); }

// --- class sample (paired work+wall), window + regime-break aware -----------
// Returns { pairs:[{work_ms,wall_ms}], n, calibrating, regimeBreakAt, firstTs,
// lastTs, sids }. Ordering by first_ts is essential for the regime logic.
function classSample(sessions, opts) {
  const o = opts || {};
  const k = o.k != null ? o.k : stats.DEFAULT_K;
  const window = o.window != null ? o.window : stats.DEFAULT_WINDOW;
  const sorted = (sessions || []).slice().sort((a, b) => (a.first_ts || 0) - (b.first_ts || 0));
  let kept = sorted.length > window ? sorted.slice(sorted.length - window) : sorted.slice();
  // regime break on the WALL series (the clock the human feels), then slice sessions.
  let regimeBreakAt = -1;
  const wall = kept.map((s) => s.wall_ms);
  const cp = stats.cusumBreak(wall);
  if (cp > 0) { regimeBreakAt = cp; kept = kept.slice(cp); }
  const pairs = kept.map((s) => ({ work_ms: s.work_ms, wall_ms: s.wall_ms }));
  return {
    pairs, n: pairs.length, k, window,
    calibrating: pairs.length < k,
    regimeBreakAt,
    firstTs: kept.length ? kept[0].first_ts : null,
    lastTs: kept.length ? kept[kept.length - 1].last_ts : null,
    sids: kept.map((s) => s.sid),
  };
}

// Build every class×mode bucket sample once.
function buildBuckets(bucketed, opts) {
  const buckets = {};
  for (const key of Object.keys(bucketed)) buckets[key] = classSample(bucketed[key], opts);
  return buckets;
}

// env a wave runs in — decides which blockers can even happen (DC-03).
function envOf(wave) {
  const t = [wave.name, wave.goal].filter(Boolean).join(' ');
  return {
    oauth: /\b(oauth|auth|notion|github|linear|slack|mcp|token|hub|federat|adapter)\b/i.test(t),
    worktree_lock: true,     // every wave runs in a git worktree
    mount_windows: true,     // Windows host — always a possible surface
  };
}

// Blocker model from OBSERVED per-class blocker frequency. Duration is a
// CONSERVATIVE fraction of the class's wall (a proxy — we don't have isolated
// block spans; labelled as such). Conditioned on env so a no-OAuth wave never
// inherits the OAuth tail.
function buildBlocker(bucketed) {
  const table = {};
  for (const [key, sessions] of Object.entries(bucketed)) {
    const byCause = {};
    for (const cause of BLOCKER_CAUSES) {
      const hits = sessions.filter((s) => s.blocker_cause === cause);
      if (!hits.length) continue;
      const walls = hits.map((s) => s.wall_ms);
      byCause[cause] = {
        p: hits.length / sessions.length,
        p50_ms: 0.2 * (_median(walls) || 0),   // proxy fraction
        p90_ms: 0.4 * (stats.percentile(walls, 0.9) || 0),
        proxy: true,
      };
    }
    if (Object.keys(byCause).length) table[key] = byCause;
  }
  return {
    table,
    extra(rng, node) {
      const byCause = table[node.bucket];
      if (!byCause) return { work_ms: 0, wall_ms: 0 };
      const env = envOf(node);
      let work = 0, wall = 0;
      for (const cause of Object.keys(byCause)) {
        if (env[cause] === false) continue;
        const c = byCause[cause];
        if (rng() < c.p) {
          const draw = c.p50_ms + Math.max(0, (c.p90_ms - c.p50_ms)) * rng();
          wall += draw; work += draw * 0.5;
        }
      }
      return { work_ms: work, wall_ms: wall };
    },
    profileFor(bucket) { return table[bucket] || null; },
  };
}

// injection rate (DC-17): historical unplanned / planned. Proxy = decimal-insert
// waves (W72.1-style, created by gsd-insert-phase for urgent unplanned work) over
// integer waves. Deterministic, roadmap-derived, conservative (0 when none).
function injectionRate(waves) {
  let inserted = 0, planned = 0;
  for (const w of waves) {
    if (/\.\d+$/.test(w.wave_id)) inserted++; else planned++;
  }
  return planned > 0 ? inserted / planned : 0;
}

// Transitive dependency closure of a wave WITHIN the roadmap (the sub-DAG to
// simulate). Absent/completed deps naturally contribute finish=0 in dag.js.
function transitiveScope(wave, byId) {
  const scope = new Map();
  const stack = [wave.wave_id];
  while (stack.length) {
    const id = stack.pop();
    if (scope.has(id)) continue;
    const w = byId.get(id);
    if (!w) continue; // out-of-scope dep → excluded (finish 0)
    scope.set(id, w);
    for (const d of (w.deps || [])) if (!scope.has(d)) stack.push(d);
  }
  return [...scope.values()];
}

// ms → honest human string (for premises / drivers copy).
function _human(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const m = ms / 60000;
  if (m < 60) return Math.round(m) + 'm';
  const h = m / 60;
  if (h < 24) return (h < 10 ? h.toFixed(1) : Math.round(h)) + 'h';
  return (h / 24).toFixed(1) + 'd';
}

// Forecast ONE wave into a contract record.
function forecastWave(wave, ctx) {
  const { buckets, bucketed, byId, blocker, injRate, calEntries, iterations, seed } = ctx;
  const { class: cls, mode } = classifyWave(wave);
  const bucket = bucketKey(cls, mode);
  const base = {
    wave_id: wave.wave_id,
    name: wave.name || null,
    phase: wave.phase || null,
    class: cls,
    mode,
    deps: wave.deps || [],
    p50_work: null, p90_work: null, p50_wall: null, p90_wall: null,
    samples_n: 0,
    calibrating: false,
    stale: false,
    scope_hash: ctx.scopeHash,
    drivers: [],
    reliability: null,
    premises: null,
    half_life: HALF_LIFE,
    injection_rate: Number(injRate.toFixed(3)),
  };

  // Invariant 1: no comparable class → no cone, ever.
  if (!cls || !bucket) {
    return Object.assign(base, { no_base: true, note: 'sem base comparável (classe não declarada)' });
  }

  const own = buckets[bucket] || { pairs: [], n: 0, calibrating: true, k: stats.DEFAULT_K };
  base.samples_n = own.n;

  // Invariant 5: cold-start / no-sample → calibrating "n/k", NO cone.
  if (own.calibrating || own.n === 0) {
    return Object.assign(base, {
      calibrating: true,
      calibrating_progress: own.n + '/' + own.k,
      note: 'a calibrar (' + own.n + '/' + own.k + ') — sem cone até haver base',
    });
  }

  // The sub-DAG: this wave + its uncompleted dependency chain (Invariant 6).
  const scope = transitiveScope(wave, byId);
  const sim = simulate({
    nodes: scope,
    idOf: (n) => n.wave_id,
    bucketOf: (n) => { const c = classifyWave(n); return bucketKey(c.class, c.mode); },
    prereqsOf: (n) => n.deps || [],
    buckets,
    blocker,
    injectionRate: injRate,
    iterations,
    seed: seed != null ? seed : (ctx.scopeHash + ':' + wave.wave_id),
  });

  // A dep still calibrating poisons the whole makespan → the wave is calibrating.
  if (sim.calibrating) {
    return Object.assign(base, {
      calibrating: true,
      calibrating_progress: own.n + '/' + own.k,
      note: 'a calibrar — ' + sim.reason,
    });
  }

  // Invariant 16: auto-widen the P90 from measured coverage; reliability score.
  const widen = calibration.autoWidenFactor(calEntries, cls);
  const rel = calibration.reliability(calEntries, cls);

  // Invariant 4: never-nu — P50 and P90 are set TOGETHER, both clocks.
  base.p50_work = Math.round(sim.p50_work);
  base.p90_work = Math.round(sim.p90_work * widen);
  base.p50_wall = Math.round(sim.p50_wall);
  base.p90_wall = Math.round(sim.p90_wall * widen);
  base.auto_widen = Number(widen.toFixed(3));
  base.reliability = rel;

  // Invariant 11: drivers[] — top uncertainty by critical-path frequency,
  // each traceable to the class sids/event-ids.
  const total = sim.iterations || 1;
  base.drivers = Object.entries(sim.criticalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, cnt]) => {
      const w = byId.get(id) || { wave_id: id };
      const c = classifyWave(w); const bk = bucketKey(c.class, c.mode);
      const bs = buckets[bk] || { sids: [], n: 0 };
      return {
        wave_id: id,
        class: c.class, mode: c.mode,
        on_critical_path_pct: Math.round((cnt / total) * 100),
        samples_n: bs.n,
        event_refs: (bs.sids || []).slice(0, 3), // traceable to real sessions
      };
    });

  // Invariant 3 (surfaced): the blocker profile that fed the cone.
  base.blocker_profile = blocker.profileFor(bucket);

  // Invariant 7 (human copy) + premises (Invariant 4).
  base.premises = {
    regime: own.firstTs ? ('regime desde ' + new Date(own.firstTs).toISOString().slice(0, 10)) : 'regime recente',
    scope: 'âmbito congelado @ ' + String(ctx.scopeHash).slice(0, 12),
    window: 'últimas ' + own.n + ' sessões da classe ' + cls + (own.regimeBreakAt > 0 ? ' (pós regime-break)' : ''),
    reading: 'distribuição SE as premissas se mantiverem — não é um compromisso',
  };
  base.human = {
    work: 'P50 work ' + _human(base.p50_work) + ' · P90 work ' + _human(base.p90_work),
    wall: 'P50 wall ' + _human(base.p50_wall) + ' · P90 wall ' + _human(base.p90_wall),
    awaiting_note: 'wall inclui espera por ti; work são só os moos activos',
  };

  // Invariant 8/9/10: substantive-work proxy + quality coupling hook.
  const ownSessions = bucketed[bucket] || [];
  base.work_signal_class_median = _median(ownSessions.map((s) => s.work_signal)) || 0;
  base.suspended = false; // set true upstream when throughput↑ & gate-pass↓ (needs a gate series)

  return base;
}

// Build the whole forecast object (pure over inputs; ts injected).
function buildForecast(opts) {
  const o = opts || {};
  const roadmapMd = o.roadmapMd != null ? o.roadmapMd : '';
  const eventsBySid = o.eventsBySid || (o.ledgerDir ? ledgerRead.loadEventsFromDir(o.ledgerDir) : {});
  const iterations = o.iterations != null ? o.iterations : 2000;

  const waves = parseRoadmap(roadmapMd);
  const byId = new Map(waves.map((w) => [w.wave_id, w]));
  const scopeHash = provHash(waves.map((w) => ({ id: w.wave_id, cls: classifyWave(w).class, deps: w.deps })));

  const sessions = ledgerRead.sessionsFromMap(eventsBySid);
  const bucketed = ledgerRead.bucketSessions(sessions);
  const buckets = buildBuckets(bucketed, { k: o.k, window: o.window });
  const blocker = buildBlocker(bucketed);
  const injRate = injectionRate(waves);
  const calEntries = o.calibrationEntries || calibration.readEntries();

  const ctx = { buckets, bucketed, byId, blocker, injRate, calEntries, scopeHash, iterations, seed: o.seed };
  const waveRecords = waves.map((w) => forecastWave(w, ctx));

  return {
    schema: 'mooter.forecast/1',
    generated_ts: o.generatedTs || null,
    scope_hash: scopeHash,
    injection_rate: Number(injRate.toFixed(3)),
    k: o.k != null ? o.k : stats.DEFAULT_K,
    window: o.window != null ? o.window : stats.DEFAULT_WINDOW,
    iterations,
    classes_observed: Object.keys(buckets).map((b) => ({ bucket: b, n: buckets[b].n, calibrating: buckets[b].calibrating })),
    waves: waveRecords,
  };
}

// Staleness (DC-14/15): a persisted forecast is STALE when the live roadmap's
// scope_hash no longer matches the one the forecast was built on.
function isStale(forecastObj, liveRoadmapMd) {
  if (!forecastObj || !forecastObj.scope_hash) return true;
  const waves = parseRoadmap(liveRoadmapMd || '');
  const live = provHash(waves.map((w) => ({ id: w.wave_id, cls: classifyWave(w).class, deps: w.deps })));
  return live !== forecastObj.scope_hash;
}

// Atomic write (never throws). Returns the path or null.
function emit(outPath, forecastObj) {
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const tmp = outPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(forecastObj, null, 2) + '\n');
    fs.renameSync(tmp, outPath);
    return outPath;
  } catch { return null; }
}

module.exports = { buildForecast, forecastWave, classSample, buildBuckets, buildBlocker, injectionRate, transitiveScope, isStale, emit };

// --- CLI --------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
  const roadmapPath = getArg('--roadmap', path.resolve(__dirname, '..', '..', '..', 'docs', 'strategy', 'MOOTER_ROADMAP.md'));
  const ledgerDir = getArg('--ledger', ledgerRead.defaultLedgerDir());
  const outPath = getArg('--out', path.resolve(__dirname, 'forecast.json'));
  const iterations = parseInt(getArg('--iterations', '2000'), 10);

  let roadmapMd = '';
  try { roadmapMd = fs.readFileSync(roadmapPath, 'utf8'); } catch { console.error('forecast: cannot read roadmap at ' + roadmapPath); }

  const fc = buildForecast({ roadmapMd, ledgerDir, iterations, generatedTs: new Date().toISOString() });
  const written = emit(outPath, fc);
  const nWaves = fc.waves.length;
  const nCone = fc.waves.filter((w) => w.p50_wall != null).length;
  const nCal = fc.waves.filter((w) => w.calibrating).length;
  const nNoBase = fc.waves.filter((w) => w.no_base).length;
  console.error('🛩️  forecast: ' + nWaves + ' waves · ' + nCone + ' com cone · ' + nCal + ' a calibrar · ' + nNoBase + ' sem base · scope ' + fc.scope_hash.slice(0, 12));
  console.error(written ? ('   → ' + written) : '   → (falha a escrever forecast.json)');
}
