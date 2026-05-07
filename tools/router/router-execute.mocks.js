'use strict';
// @ts-check
/**
 * router-execute.mocks.js — provider + tracker mocks for executor tests.
 *
 * Used by router-execute.test.js (Wave-2). Mirrors the real wrapper
 * signatures (`providers/codex-cli.js`, `providers/openai-api.js`,
 * `providers/ollama-api.js` planned in T-04) so test failures point at
 * actual contract drift, not mock drift.
 *
 * Design:
 *  - One generic factory (createMockProvider) since every wrapper has
 *    the same async (prompt, opts) → Promise<Result|null> shape.
 *  - Tracker spy records every recordUsage call so I6 can assert
 *    "exactly one record per ok call".
 *  - State factory returns a frozen object the executor reads from.
 *
 * No npm deps. Pure Node built-ins.
 */

/**
 * @typedef {Object} ProviderResult
 * @property {true}    ok
 * @property {string}  text
 * @property {string}  model
 * @property {number}  tokens_in
 * @property {number}  tokens_out
 * @property {number}  cost_usd
 * @property {number}  duration_ms
 */

/**
 * Build a mock provider function compatible with the real wrappers.
 *
 * @param {ProviderResult | null | { throws: string } | undefined} spec
 *   - null/undefined → mock returns null (treated as failure by executor)
 *   - { throws: msg } → mock throws Error(msg) when called
 *   - ProviderResult  → mock resolves to this shape verbatim
 * @returns {(prompt: string, opts?: object) => Promise<ProviderResult|null>}
 */
function createMockProvider(spec) {
  return async function mockProvider(_prompt, _opts) {
    if (spec === null || spec === undefined) return null;
    if (typeof spec === 'object' && 'throws' in spec && spec.throws) {
      throw new Error(spec.throws);
    }
    return /** @type {ProviderResult} */ (spec);
  };
}

/**
 * Build a tracker spy. Every recordUsage call is appended to `calls`.
 * The summary() method returns whatever `summary` was passed (or a
 * default skeleton) so the executor's quota-aware logic can run.
 *
 * @param {object} [opts]
 * @param {object} [opts.summary]  static summary returned by tracker.summary()
 */
function createMockTracker(opts = {}) {
  const calls = [];
  const summary = opts.summary || {
    anthropic_remaining_pct: 100,
    codex_remaining_pct: 100,
    codex_exhausted: false,
    today_cost_usd: 0,
  };
  return {
    recordUsage(provider, payload) {
      calls.push({ provider, payload });
    },
    summary() { return { ...summary }; },
    shouldPreferCodex() { return false; },
    /** Test-only inspection helpers — never called by executor. */
    _calls: calls,
    _resetCalls() { calls.length = 0; },
  };
}

/**
 * Build a frozen provider-state object. Defaults assume everything is up.
 *
 * @param {Partial<{claude:string,ollama:string,codex_cli:string,openai_api:string,gemini:string,gpt:string}>} [state]
 */
function createMockProviderState(state = {}) {
  return Object.freeze({
    claude:     state.claude     || 'ok',
    ollama:     state.ollama     || 'ok',
    codex_cli:  state.codex_cli  || 'ok',
    openai_api: state.openai_api || 'ok',
    gemini:     state.gemini     || 'off',
    gpt:        state.gpt        || 'ok',
  });
}

/**
 * Convert a fixture's `provider_mocks` block into a map of real mock
 * functions ready to inject via the test harness.
 *
 * @param {Record<string, ProviderResult|null|{throws:string}|undefined>} block
 * @returns {Record<string, ReturnType<typeof createMockProvider>>}
 */
function buildProviderMockSuite(block) {
  /** @type {Record<string, ReturnType<typeof createMockProvider>>} */
  const out = {};
  for (const key of Object.keys(block || {})) {
    out[key] = createMockProvider(block[key]);
  }
  return out;
}

module.exports = {
  createMockProvider,
  createMockTracker,
  createMockProviderState,
  buildProviderMockSuite,
};
