'use strict';
// @ts-check
/**
 * router-execute.harness.js — test harness for router-execute.js (Wave-2).
 *
 * Drives the executor with deterministic provider responses, sanitised state,
 * and a tracker spy. Returns both the ExecuteResult AND the spy data so tests
 * can assert side-effects (recordUsage calls, telemetry writes).
 *
 * Dependency injection at the call boundary: router-execute.js (T-05) must
 * accept `options.__deps` with shape:
 *   {
 *     providers:    { codex_cli?, openai_api?, ollama?: ProviderFn },
 *     tracker:      { recordUsage, summary, shouldPreferCodex },
 *     providerState: { claude, ollama, codex_cli, openai_api, ... },
 *     telemetryWriter?: (record) => void,   // captures decisions.log writes
 *     calibrationSpy?:  (event)  => void,   // captures spawn() triggers
 *   }
 *
 * Why DI instead of require.cache stubbing: ollama-api.js doesn't exist
 * yet (T-04 creates it), so node's require('./providers/ollama-api') would
 * fail at resolution time before any cache lookup. DI sidesteps this.
 */

const path = require('node:path');
const {
  createMockProvider,
  createMockTracker,
  createMockProviderState,
  buildProviderMockSuite,
} = require('./router-execute.mocks');

const ROUTER_EXECUTE_PATH = path.resolve(__dirname, 'router-execute.js');

/**
 * Run the executor against a fixture or a hand-crafted scenario.
 *
 * @param {object} input
 * @param {object} input.fixture                — fixture entry with .prompt + .classification + .provider_state + .provider_mocks
 * @param {object} [input.providerMocksOverride] — extra mocks to merge over fixture.provider_mocks
 * @param {object} [input.providerStateOverride] — extra state fields to merge over fixture.provider_state
 * @param {object} [input.trackerOpts]          — passed through to createMockTracker (e.g. { summary: { anthropic_remaining_pct: 10 } })
 * @param {object} [input.executeOptions]       — additional ExecuteInput.options (e.g. timeoutMs, skipCalibrationCheck)
 * @returns {Promise<{result: any, tracker: any, telemetryWrites: any[], calibrationSpawns: any[]}>}
 */
async function runExecutorWithFixture(input) {
  const { fixture } = input;
  if (!fixture) throw new Error('runExecutorWithFixture: fixture is required');

  // Reset require cache so each run gets a fresh executor module state
  // (important for I8 — EXEC_COUNTER must reset between independent tests).
  delete require.cache[ROUTER_EXECUTE_PATH];

  const providerMocksFromFixture = fixture.provider_mocks || {};
  const providerMocksMerged = {
    ...providerMocksFromFixture,
    ...(input.providerMocksOverride || {}),
  };

  const providers = buildProviderMockSuite(providerMocksMerged);
  const tracker = createMockTracker(input.trackerOpts || {});
  const providerState = createMockProviderState({
    ...(fixture.provider_state || {}),
    ...(input.providerStateOverride || {}),
  });

  /** @type {any[]} */
  const telemetryWrites = [];
  /** @type {any[]} */
  const calibrationSpawns = [];

  // Lazy-load — module is only imported when used so a missing
  // router-execute.js produces a clean test-time error rather than a
  // top-level require failure during harness import.
  let execute;
  try {
    ({ execute } = require('./router-execute'));
  } catch (err) {
    throw new Error(
      `runExecutorWithFixture: failed to load ./router-execute.js — ${err.message}. ` +
      'Ensure T-05 has shipped before running executor tests.'
    );
  }

  const result = await execute({
    prompt: fixture.prompt,
    classification: fixture.classification,
    options: {
      ...(input.executeOptions || {}),
      __deps: {
        providers,
        tracker,
        providerState,
        telemetryWriter: (record) => telemetryWrites.push(record),
        calibrationSpy:  (event)  => calibrationSpawns.push(event),
      },
    },
  });

  return { result, tracker, telemetryWrites, calibrationSpawns };
}

/**
 * Loop helper for I8 — repeats the same fixture N times against a SINGLE
 * executor instance (does NOT reset require.cache). Returns the count of
 * calibration spawns observed.
 *
 * @param {object} input
 * @param {object} input.fixture
 * @param {number} input.times
 * @returns {Promise<{spawnCount: number, lastResult: any, telemetryWrites: any[]}>}
 */
async function runExecutorLoop(input) {
  const { fixture, times } = input;
  if (typeof times !== 'number' || times < 1) {
    throw new Error('runExecutorLoop: times must be ≥ 1');
  }

  // First call: load module fresh. Subsequent calls: same module instance.
  delete require.cache[ROUTER_EXECUTE_PATH];

  let execute;
  try {
    ({ execute } = require('./router-execute'));
  } catch (err) {
    throw new Error(
      `runExecutorLoop: failed to load ./router-execute.js — ${err.message}.`
    );
  }

  const providers = buildProviderMockSuite(fixture.provider_mocks || {});
  const tracker = createMockTracker();
  const providerState = createMockProviderState(fixture.provider_state || {});

  /** @type {any[]} */
  const telemetryWrites = [];
  /** @type {any[]} */
  const calibrationSpawns = [];

  let lastResult = null;
  for (let i = 0; i < times; i++) {
    lastResult = await execute({
      prompt: fixture.prompt,
      classification: fixture.classification,
      options: {
        __deps: {
          providers,
          tracker,
          providerState,
          telemetryWriter: (record) => telemetryWrites.push(record),
          calibrationSpy:  (event)  => calibrationSpawns.push(event),
        },
      },
    });
  }

  return { spawnCount: calibrationSpawns.length, lastResult, telemetryWrites };
}

/**
 * Reset hook — call between unrelated test scenarios so a stale module state
 * (counters, last-calibration timestamps) doesn't leak between tests.
 */
function reset() {
  delete require.cache[ROUTER_EXECUTE_PATH];
}

module.exports = {
  runExecutorWithFixture,
  runExecutorLoop,
  reset,
};
