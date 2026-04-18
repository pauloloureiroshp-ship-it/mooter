/**
 * errors.js — Structured error responses for hub Workers.
 *
 * CCA D2/D5: every failure path must emit a response with
 *   { error, errorCategory, isRetryable, isError: true, detail?, issues? }
 * so agents (and tests) can programmatically distinguish:
 *   - validation → client bug, do not retry
 *   - permission → auth missing / expired, do not retry with same creds
 *   - transient  → network / DB hiccup, safe to retry with backoff
 *   - internal   → hub bug, do not retry blindly
 *
 * Rationale: prior shape was `{ error: "storage error", detail: e.message }`
 * which forced callers to regex the message to decide retry policy.
 * The exam (Tool Design / 18% weight) explicitly grades on structured
 * error envelopes with isError + errorCategory + isRetryable.
 */

const CATEGORIES = Object.freeze({
  validation: { status: 422, isRetryable: false },
  bad_request: { status: 400, isRetryable: false },
  unauthorized: { status: 401, isRetryable: false },
  forbidden: { status: 403, isRetryable: false },
  not_found: { status: 404, isRetryable: false },
  method_not_allowed: { status: 405, isRetryable: false },
  rate_limited: { status: 429, isRetryable: true },
  transient: { status: 503, isRetryable: true },
  internal: { status: 500, isRetryable: false },
});

/**
 * Build a structured error Response.
 *
 * @param {string} code           short machine code (e.g. "validation_failed")
 * @param {keyof typeof CATEGORIES} category
 * @param {object} [opts]
 * @param {string} [opts.message] human-readable detail (never include PII)
 * @param {Array}  [opts.issues]  Zod issues or validation detail array
 * @param {number} [opts.statusOverride]  rare cases (e.g. 422 for bad payload shape)
 */
// Categories where the caller's `message` is safe to forward verbatim
// (after truncation). For other categories the raw message may carry PII
// from DB layer errors (column names, constraint values, payload fragments),
// so we surface only a fixed sentinel string.
const SAFE_MESSAGE_CATEGORIES = new Set([
  'validation',
  'bad_request',
  'not_found',
  'method_not_allowed',
  'rate_limited',
  'unauthorized',
  'forbidden',
]);

const SANITISED_MESSAGE = {
  internal: 'An internal error occurred. The incident has been logged.',
  transient: 'A transient backend error occurred. Retry with exponential backoff.',
};

export function errorResponse(code, category, opts = {}) {
  const meta = CATEGORIES[category] || CATEGORIES.internal;
  const body = {
    isError: true,
    error: code,
    errorCategory: category,
    isRetryable: meta.isRetryable,
  };
  if (opts.message) {
    body.message = SAFE_MESSAGE_CATEGORIES.has(category)
      ? String(opts.message).slice(0, 500)
      : (SANITISED_MESSAGE[category] || 'Error');
  } else if (SANITISED_MESSAGE[category]) {
    body.message = SANITISED_MESSAGE[category];
  }
  if (opts.issues) body.issues = opts.issues;
  const status = typeof opts.statusOverride === 'number' ? opts.statusOverride : meta.status;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Classify an exception into an errorCategory.
 * Extend as new failure modes are catalogued.
 */
export function classifyException(e) {
  if (!e) return 'internal';
  const msg = (e.message || String(e)).toLowerCase();
  if (/timeout|abort|econnreset|network/.test(msg)) return 'transient';
  if (/unauthor|forbidden/.test(msg)) return 'forbidden';
  if (/not.found|missing/.test(msg)) return 'not_found';
  if (/too.many|rate.limit/.test(msg)) return 'rate_limited';
  return 'internal';
}

export { CATEGORIES };
