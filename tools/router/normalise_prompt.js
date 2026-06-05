#!/usr/bin/env node
'use strict';

// normalise_prompt.js — Wave 21 (C2): classifier-stability canonical form.
//
// The regex classifier (classify.js, P11-immutable) is byte-sensitive to keywords
// that bleed in from filesystem paths. Concretely: "resume /etc/os-release em 3
// linhas" classified as `architecture_or_critical` (T3/opus) while the same prompt
// over /etc/hostname classified as `simple_transform` (T1/haiku) — because the
// "release" in "os-release" matched a risk keyword. Same prompt family, different
// tier, no pattern. That non-determinism is the C2 bug.
//
// This module produces a CANONICAL form used ONLY for classification (and the
// classify cache key). The ORIGINAL prompt is always what the LLM, Option A, the
// optimiser, and the logs see — normalisation never reaches the model.
//
// HIGH_RISK floor (router-logic.md): a genuine risk-bearing path token (.env,
// secret, id_rsa, …) is RE-SURFACED after the <path> placeholder so the classifier
// still floors it at T3. Only benign filename keywords (the "release" in
// os-release) are neutralised. This keeps C2's stabilisation from ever weakening
// the safety floor.
//
// Pure Node built-ins. No deps. Never throws (callers wrap, but it's pure anyway).

// Risk-bearing substrings that, when found INSIDE a path being collapsed, must be
// preserved so classify.js still fires its HIGH_RISK bank. Mirrors the secret /
// credential / infra-config slice of HIGH_RISK_HINT in inject_context.js.
const RISK_PATH_TOKENS = [
  '.env', 'secret', 'credential', 'password', 'id_rsa', '.pem', '.key', '.ssh',
  '.git/', 'package.json', 'tsconfig', 'migration', '.github/workflow',
];

/**
 * Canonical, classification-only form of a prompt. Stable across a family of
 * prompts that differ only in an embedded path, number, or count.
 * @param {string} input
 * @returns {string}
 */
function normalisePrompt(input) {
  let s = String(input == null ? '' : input);

  // 1) Collapse absolute filesystem paths to a placeholder so a benign filename
  //    keyword can't bleed into the wrong category. Re-surface any genuine
  //    risk-bearing token from the path so the HIGH_RISK floor still fires.
  s = s.replace(/(?:\/[\w.-]+)+\/?/g, (m) => {
    const low = m.toLowerCase();
    const risk = RISK_PATH_TOKENS.filter((t) => low.includes(t));
    return risk.length ? `<path> ${risk.join(' ')}` : '<path>';
  });

  // 2) Canonicalise standalone numbers / counts ("3 linhas" / "5 linhas" → the
  //    same form) so a count never tips the classifier between categories.
  s = s.replace(/\b\d[\d.,:_-]*\b/g, '<num>');

  // 3) Lower-case + collapse whitespace. classify.js is already case-insensitive,
  //    so this changes no classification — it only makes the cache key canonical
  //    (every "<path>" prompt in a family shares one cache entry → identical tier).
  s = s.toLowerCase().replace(/\s+/g, ' ').trim();

  return s;
}

module.exports = { normalisePrompt, RISK_PATH_TOKENS };

if (require.main === module) {
  // CLI: node normalise_prompt.js "some prompt" → prints the canonical form.
  process.stdout.write(normalisePrompt(process.argv.slice(2).join(' ')) + '\n');
}
