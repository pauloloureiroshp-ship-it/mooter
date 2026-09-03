'use strict';
/**
 * passk.js — the metric that counts for an edit (Demystifying-evals §"pass@k / pass^k").
 *
 *  - pass@1  : did the FIRST trial pass? (raw capability)
 *  - pass^k  : did ALL k independent trials pass? (felt reliability — the user's experience of "it
 *              just works every time")
 *
 * The $0 engine is deterministic, so a correct task yields pass^k === pass@1 by construction; that
 * equality is itself a reported result (the value of pass^k only diverges once a stochastic LLM path
 * is wired — MP5.2b, out of Fase A scope). We still run k real trials in k fresh sandboxes to PROVE
 * the determinism rather than assume it.
 */

function summarize(trialPasses) {
  const k = trialPasses.length;
  const passed = trialPasses.filter(Boolean).length;
  return {
    k,
    pass_at_1: trialPasses.length ? !!trialPasses[0] : false,
    pass_hat_k: k > 0 && passed === k,
    pass_rate: k ? passed / k : 0,
    passed_trials: passed,
  };
}

module.exports = { summarize };
