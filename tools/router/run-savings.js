'use strict';

// run-savings — honest per-run savings vs the all-Opus counterfactual (First Magic — FASE 3).
//
// The Mooter cost claim must always be: "what this run actually cost" vs "what it
// would have cost if every lane had run on the maestro (Opus)". Both numbers come
// from REAL measured token counts and the pricing SSOT (pricing.js) — never a
// fabricated figure. A lane with no token data contributes nothing and is flagged;
// if NO lane has token data, saved is null ("—"), not a guess.
//
//   counterfactual = Σ priceTurn(maestro,  in, out)   over ALL lanes
//   actual         = Σ (local ? 0 : priceTurn(model, in, out))
//   saved          = counterfactual − actual           (advisory)

const { priceTurn } = require('./pricing');

const DEFAULT_MAESTRO = 'claude-opus-4-6[1m]';

function n(x) { return Math.max(0, Number(x) || 0); }

/**
 * @param {{lanes: Array<{target:'local'|'cloud', model?:string, input_tokens?:number, output_tokens?:number, label?:string}>, maestro?: string}} run
 * @returns {{actual_usd:number, counterfactual_usd:number|null, saved_usd:number|null, saved_pct:number|null,
 *            local_lanes:number, cloud_lanes:number, measured_lanes:number, per_lane:Array, basis:string}}
 */
function computeRunSavings(run) {
  const lanes = (run && Array.isArray(run.lanes)) ? run.lanes : [];
  const maestro = (run && run.maestro) || DEFAULT_MAESTRO;

  let actual = 0;
  let counterfactual = 0;
  let measured = 0;
  let localLanes = 0;
  let cloudLanes = 0;
  const perLane = [];

  for (const lane of lanes) {
    const ti = n(lane.input_tokens);
    const to = n(lane.output_tokens);
    const isLocal = lane.target === 'local';
    if (isLocal) localLanes++; else cloudLanes++;

    const hasTokens = (ti + to) > 0;
    if (hasTokens) measured++;

    // counterfactual: this lane's tokens priced as if the maestro had done it
    const cf = priceTurn(maestro, ti, to);
    // actual: $0 for local, real model price for cloud
    const act = isLocal ? 0 : priceTurn(lane.model || maestro, ti, to);

    counterfactual += cf;
    actual += act;
    perLane.push({
      label: lane.label || (isLocal ? 'local' : (lane.model || 'cloud')),
      target: lane.target,
      model: isLocal ? (lane.model || 'ollama') : (lane.model || maestro),
      input_tokens: ti,
      output_tokens: to,
      actual_usd: round(act),
      counterfactual_usd: round(cf),
      measured: hasTokens,
    });
  }

  // Honesty: no measured tokens anywhere → we cannot claim a saving.
  if (measured === 0) {
    return {
      actual_usd: round(actual),
      counterfactual_usd: null,
      saved_usd: null,
      saved_pct: null,
      local_lanes: localLanes,
      cloud_lanes: cloudLanes,
      measured_lanes: 0,
      per_lane: perLane,
      basis: `no measured tokens on any lane — savings unknown (—), not fabricated; maestro=${maestro}`,
    };
  }

  const saved = counterfactual - actual;
  const pct = counterfactual > 0 ? saved / counterfactual : 0;
  return {
    actual_usd: round(actual),
    counterfactual_usd: round(counterfactual),
    saved_usd: round(saved),
    saved_pct: Math.round(pct * 1000) / 10, // one decimal %
    local_lanes: localLanes,
    cloud_lanes: cloudLanes,
    measured_lanes: measured,
    per_lane: perLane,
    basis: `actual (local=$0 + cloud@real) vs counterfactual (all lanes @ ${maestro}); ${measured}/${lanes.length} lanes had measured tokens`,
  };
}

function round(x) { return Math.round(x * 1e6) / 1e6; }

module.exports = { computeRunSavings, DEFAULT_MAESTRO };

if (require.main === module) {
  // read a run JSON from argv[2] (file) or stdin
  const fs = require('fs');
  let raw = '';
  try { raw = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8'); } catch { /* none */ }
  let run = {};
  try { run = JSON.parse(raw || '{}'); } catch { run = {}; }
  process.stdout.write(JSON.stringify(computeRunSavings(run), null, 2) + '\n');
}
