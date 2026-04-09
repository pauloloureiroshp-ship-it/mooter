/**
 * patterns.js — single source of truth for frugal's classification regexes.
 *
 * Before v0.7: HIGH_RISK lived inline in classify.js AND HIGH_RISK_MARKERS
 * lived inline in backtest.js. Both had to be updated in lockstep — the
 * v0.9 hardening had to touch two files to stay consistent.
 *
 * v0.7 consolidates both here. Runtime behaviour is preserved exactly:
 *
 *   - HIGH_RISK is the STRICT list classify.js uses to escalate to T3.
 *     It keeps the precise matchers (`git push --force`, `review final`,
 *     `package.json`, `.github/workflows`) so the classifier doesn't
 *     false-positive on benign prompts like "push to branch" or "review
 *     this diff".
 *
 *   - TUNING_EXCLUDE is a SUPERSET of HIGH_RISK plus the broader v0.9
 *     hardening markers (bare `push`, `merge`, `review`, `database`,
 *     `schema`, `--force`). backtest.js uses this looser set to filter
 *     auto-tuning candidates — a false positive here just keeps a prompt
 *     out of the candidate list, which is the safe default.
 *
 * Invariant enforced in tests: TUNING_EXCLUDE ⊇ HIGH_RISK.
 *
 * Consumers:
 *   - classify.js    → HIGH_RISK, MED_RISK, LOW_RISK, TRIVIAL
 *   - backtest.js    → TUNING_EXCLUDE
 */

'use strict';

// ── HIGH_RISK (strict, used by classify.js to escalate to T3) ──────────────
const HIGH_RISK = [
  /\bprodu(c|ç)[aã]o\b/i, /\bproduction\b/i, /\bdeploy\b/i, /\brelease\b/i,
  /\bmigration\b/i, /\bmigra(c|ç)[aã]o\b/i, /\bdrop\s+table\b/i,
  /\brm\s+-rf\b/i, /\bgit\s+push\s+--force\b/i, /\breset\s+--hard\b/i,
  /\b\.env\b/, /\bsecret/i, /\bcredential/i, /\bAPI[_ ]?KEY\b/,
  /\barquitetur/i, /\barchitect/i, /\brefator(a|ar|amento)?\b/i, /\brefactor/i,
  /\bcr[ií]tic/i, /\bcritical\b/i, /\baudit/i, /\breview\s+final\b/i,
  /\bpackage\.json\b/, /\bci\b.*\bpipeline/i, /\.github\/workflows/i,
];

// ── MED_RISK (bug hunt / reasoning signals) ────────────────────────────────
const MED_RISK = [
  /\bbug\b/i, /\bdebug/i, /\broot\s*cause/i, /\bcausa\s*ra[ií]z/i,
  /\bplan(o)?\s+t[eé]cnico/i, /\btradeoff/i, /\binvestiga/i,
  /\banalisa(r)?\b/i, /\banalyze\b/i, /\bdecide(\s+entre)?/i,
  // tuning v2 (added after benchmark v1 false negatives)
  /\bporqu[eê]\b/i, /\bporque\s+[eé]\s+que\b/i, /\bwhy\b/i,
  /\bdecomp(õ|o)e/i, /\bdecompose/i, /\bquebr(a|ar)\s+em\b/i,
  /\bfalha(s)?\s+(intermitente|às\s+vezes|sometimes)/i, /\bintermittent/i,
  /\breconnect/i, /\bracecondition/i, /\brace\s+condition/i,
];

// ── LOW_RISK (light tasks — commit msg, docstring, regex, etc.) ────────────
const LOW_RISK = [
  /\bresume\b/i, /\bresumo/i, /\bsummari[zs]e/i,
  /\bexplain\b/i, /\bexplica/i, /\bo\s+que\s+[eé]\b/i, /\bwhat\s+is\b/i,
  /\bcommit\s+message/i, /\bdocstring/i, /\bregex/i,
  /\bformat/i, /\btransforma/i, /\btraduz/i, /\btranslate\b/i,
  /\btypo/i, /\brename\b/i, /\bcompar(a|e)/i,
];

// ── TRIVIAL (triage, classification, brainstorm) ───────────────────────────
const TRIVIAL = [
  /\btriagem\b/i, /\btriage\b/i, /\bclassific/i,
  /\bextrai/i, /\bextract\b/i, /\bbrainstorm/i,
];

// ── TUNING_EXCLUDE (superset — used by backtest.js) ────────────────────────
// Broader net: includes bare `push`, `merge`, `review`, `database`,
// `schema`, `--force`, `force-push`. These are auto-tuning exclude signals
// only — false positives just mean a prompt isn't eligible as a
// demote/promote candidate, which is the safe default.
const TUNING_EXTRA = [
  /\bpush\b/i, /\bmerge\b/i, /\breview\b/i,
  /\bdatabase\b/i, /\bschema\b/i,
  /--force\b/i, /\bforce[- ]push\b/i,
  /\bci\b/i,
];

const TUNING_EXCLUDE = [...HIGH_RISK, ...TUNING_EXTRA];

module.exports = {
  HIGH_RISK,
  MED_RISK,
  LOW_RISK,
  TRIVIAL,
  TUNING_EXCLUDE,
  TUNING_EXTRA,
};
