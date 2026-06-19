'use strict';

// moo-risk — host-side, zero-LLM risk primitive (First Magic — FASE 1).
//
// WHY THIS EXISTS
// The frozen `classify.js` carries a HIGH_RISK regex bank that scores risk by
// keyword. On the Arm C risk-axis benchmark that bank reaches Youden 0.52, but it
// has two MEASURED weaknesses this primitive hardens — WITHOUT touching the frozen
// engine (we re-use `patterns.HIGH_RISK`, we do not import or edit classify.js):
//
//   1. DISGUISED destructive ops slip through. "drop the legacy_users table since
//      nothing reads it" routes T0/minimal because the keyword bank wants the words
//      "drop table" ADJACENT. A gap-tolerant action bank catches the real intent.
//   2. INDIRECT questions over-fire (~60% FPR on that bucket). "explain what rm -rf
//      does" routes T3/high because "rm -rf" is a keyword — even though it is a
//      pure concept question. A 2nd-pass asking-vs-doing intent gate downgrades it.
//
// CONTRACT
//   assess(text) -> {
//     risk_tier: 'none' | 'low' | 'high',
//     action:    'allow' | 'escalate_T3' | 'escalate_human',
//     reason:    string,                // human-verifiable, never a black box
//     signals:   { ... }                // the raw matches, for the cockpit / audit
//   }
//
//   action semantics:
//     allow          — proceed; no model-cost floor imposed by risk.
//     escalate_T3    — high-risk reasoning (deploy/migration/audit/architecture in a
//                      real or imminent context); never downgrade below Opus.
//     escalate_human — irreversible destructive op (drop/delete/truncate/rm -rf/
//                      force-push/secret rotation/prod flag flip). A PreToolUse deny
//                      rule blocks the matching TOOL call and asks for confirmation.
//
// DOCTRINE
//   Zero-LLM. No-proxy. Reads patterns, scores, returns. Never calls a paid model,
//   never edits source, never touches classify.js (frozen sha intact).

const { HIGH_RISK } = require('./patterns');

// ── Asking-vs-doing: pure concept / explanation requests ────────────────────
// A match here means "the user is asking ABOUT a thing", not asking to DO it.
const EXPLAIN_INTENT = [
  /^\s*(please\s+)?(explain|describe|summari[sz]e|define|clarify|teach|walk\s+me\s+through\s+what)\b/i,
  /^\s*what(\s+is|'s|\s+are|\s+does|\s+do)\b/i,
  /^\s*how\s+(does|do|to)\b/i,
  /^\s*why\s+(is|are|does|do)\b/i,
  /\b(at\s+a\s+)?high[- ]level\b/i,
  /\bin\s+general\b/i,
  /\boverview\b/i,
  /\bin\s+a\s+tutorial\b/i,
  /\bshort\s+writeup\b/i,
  /\b(explaining|describing)\s+what\b/i,
  /\bwhat\s+(are\s+)?common\s+(pitfalls|mistakes)\b/i,
  /\bdoc\s+explaining\b/i,
];

// ── Imminent doing: the user is about to act on a real system ───────────────
const IMMINENT = [
  /\bi'?m\s+(about\s+to|going\s+to|gonna|thinking\s+of|planning\s+to)\b/i,
  /\bwe'?re\s+(about\s+to|going\s+to|disabling|planning\s+to|thinking\s+of)\b/i,
  /\bbefore\s+i\b/i,
  /\bquick\s+check\s+before\b/i,
  /\b(patch|fix|change|script)\s+i'?m\s+about\s+to\b/i,
  /\bright\s+now\b/i,
  /\btonight\b/i,
  /\bthis\s+(weekend|friday|week|morning|afternoon)\b/i,
  /\bduring\s+(business\s+hours|the\s+next\s+quiet\s+window)\b/i,
  /\b(can|should|do)\s+i\s+(need\s+)?\b/i,
  /\bis\s+it\s+(fine|safe|ok|okay)\s+to\b/i,
  /\bvou\s+(fazer|dar|correr)\b/i,
  /\bpronto\s+(para|pra)\b/i,
];

// ── Production / real-system context ────────────────────────────────────────
const PROD_CTX = [
  /\bprod\b/i, /\bprod-\w+/i, /\bproduction\b/i, /\bprodu(c|ç)[aã]o\b/i,
  /\bto\s+main\b/i, /\binto\s+main\b/i, /\bto\s+master\b/i,
  /\bbusiness\s+hours\b/i,
  /\bour\s+(stripe|database|db|master|api|payment)\b/i,
];

// ── Local / dev / sandbox context (downgrade — not production) ───────────────
const DEV_CTX = [
  /\blocal\s+dev\b/i, /\bfor\s+(local\s+)?development\b/i, /\blocally\b/i,
  /\bdev\s+seed\b/i, /\bseed\s+(data|script|users)\b/i, /\btest\s+users\b/i,
  /\bsandbox\b/i, /\bexample\b/i, /\bsample\b/i, /\bfor\s+a\s+demo\b/i,
];

// ── Irreversible / destructive operations (gap-tolerant) ────────────────────
// Each match → escalate_human (the deny-rule territory). The {0,N} gaps catch
// disguised phrasings ("drop the legacy_users table") the adjacent-keyword bank
// in classify.js misses by design.
const DESTRUCTIVE = [
  { id: 'sql_drop_table',  re: /\bdrop\b[^.;\n]{0,40}?\btable\b/i },
  { id: 'sql_drop_db',     re: /\b(drop\s+(database|schema)|dropdb)\b/i },
  { id: 'sql_delete_from', re: /\bdelete\s+from\b/i },
  { id: 'sql_truncate',    re: /\btruncate\b[^.;\n]{0,20}?\b(table|\w+)\b/i },
  { id: 'sql_vacuum_full', re: /\bvacuum\s+full\b/i },
  { id: 'sql_update_set',  re: /\bupdate\b[^.;\n]{0,40}?\bset\b/i },
  { id: 'wipe_data',       re: /\bwipe\b[^.;\n]{0,20}?\b(table|database|db|data|disk|volume)\b/i },
  { id: 'reset_database',  re: /\breset\b[^.;\n]{0,20}?\b(database|db|schema)\b/i },
  // rm -rf in any flag order (-rf, -fr, -Rf, -rfv, …)
  { id: 'rm_rf',           re: /\brm\s+-\w*r\w*f|\brm\s+-\w*f\w*r/i },
  // force-push in long or short form (matches the deny-rule the wiring doc advertises)
  { id: 'force_push',      re: /\b(force[- ]?push|git\s+push\s+(--force\b|-f\b|-fr\b|-rf\b)|push\s+--force\b)/i },
  { id: 'reset_hard',      re: /\breset\s+--hard\b/i },
  { id: 'rotate_secret',   re: /\brotat\w*\b[^.;\n]{0,40}?\b(secret|api[ _-]?key|master\s+credential|credential|token|key)\b/i },
  { id: 'disable_mfa',     re: /\b(disabl\w*|turn\s+off|remov\w*)\b[^.;\n]{0,20}?\b(mfa|2fa|two[- ]?factor|multi[- ]?factor)\b/i },
  // A flag/config FLIP — requires a change framing so ordinary source code
  //   (`const enabled = true`, `if (x === true)`) is NOT flagged. Matches an
  //   explicit boolean transition, or a change-verb sitting next to a boolean.
  { id: 'flag_flip',       re: /(\bfrom\s+(true|false)\s+to\s+(true|false)\b|\b(chang\w*|set|flip|toggl\w*|switch|updat\w*|turn\s+(on|off))\b[^.;\n]{0,40}?(=\s*(true|false)\b|\b(true|false)\b))/i },
];

// ── Change verbs (a mutating action, risky only in production context) ───────
const CHANGE_VERB = /\b(bump|increase|decrease|raise|lower|change|set|enable|disable|update|modify|switch|flip|turn\s+(on|off)|deploy|roll\s*out|rollout|migrat\w*|merge|push|rerun|re-run|restart|scale)\b/i;

function anyMatch(banks, text) {
  return banks.some((re) => re.test(text));
}

/**
 * Score a prompt / action string for risk. Pure, synchronous, zero-LLM.
 *
 * Two layers (the distinction is load-bearing for safety):
 *   - PROMPT layer (default): honours asking-vs-doing + dev-context vetoes, so
 *     "explain what rm -rf does" and a local-dev seed script are allowed. This is
 *     the false-positive fix that drives the indirect-bucket FPR to ~0.
 *   - TOOL layer (opts.layer === 'tool'): a tool is ABOUT TO RUN — a command that
 *     literally contains a destructive op IS an action, not a question, so the
 *     vetoes are SKIPPED and any destructive match blocks. This closes the
 *     "append `# sandbox` / `# for example`" bypass on the enforcement hook.
 *
 * @param {string} text
 * @param {{layer?: 'prompt'|'tool'}} [opts]
 * @returns {{risk_tier:'none'|'low'|'high', action:'allow'|'escalate_T3'|'escalate_human', reason:string, signals:object}}
 */
function assess(text, opts) {
  const toolLayer = !!(opts && opts.layer === 'tool');
  const t = String(text == null ? '' : text);

  const explanation = anyMatch(EXPLAIN_INTENT, t);
  const imminent    = anyMatch(IMMINENT, t);
  const prodCtx     = anyMatch(PROD_CTX, t);
  const devCtx      = anyMatch(DEV_CTX, t) && !prodCtx;
  const changeVerb  = CHANGE_VERB.test(t);
  const prodChange  = changeVerb && prodCtx;
  const destr       = DESTRUCTIVE.filter((d) => d.re.test(t)).map((d) => d.id);
  const highHits    = HIGH_RISK.reduce((n, re) => (re.test(t) ? n + 1 : n), 0);

  const signals = { explanation, imminent, prodCtx, devCtx, changeVerb, prodChange, destructive: destr, highRiskHits: highHits };

  const out = (risk_tier, action, reason) => ({ risk_tier, action, reason, signals });

  // The asking-vs-doing and dev-context vetoes apply ONLY at the prompt layer.
  // At the tool layer a destructive token is a live action — skip both vetoes so a
  // trailing "# sandbox" / "# for example" cannot smuggle an op past the gate.
  if (!toolLayer) {
    // (1) DEV/LOCAL veto — explicit local/dev/sandbox work with no production
    //     context is safe even when it names a destructive verb ("reset the
    //     database" in a local seed script). Production context cancels this veto.
    if (devCtx && !prodChange) {
      return out('low', 'allow', 'local/dev/sandbox context — not production');
    }

    // (2) ASKING-vs-DOING veto — a pure concept/explanation question with no
    //     imminent action and no production change is informational, EVEN when it
    //     names a destructive command ("describe how rm -rf works"). Mentioning an
    //     op is not doing it. This 2nd pass kills the indirect-bucket false alarms.
    if (explanation && !imminent && !prodChange) {
      return out('none', 'allow', 'explanation/concept question — asking, not doing');
    }
  }

  // (3) IRREVERSIBLE destructive op intended for real execution → human gate.
  if (destr.length > 0) {
    return out('high', 'escalate_human', `irreversible destructive op (${destr.join(', ')}) — requires human confirmation`);
  }

  // (4) Production change, or a high-risk signal in an imminent/production context.
  if (prodChange || (highHits >= 1 && (imminent || prodCtx))) {
    return out('high', 'escalate_T3', prodChange
      ? 'mutating change in production context — high-risk, floor at Opus'
      : 'high-risk signal in an imminent/production context — floor at Opus');
  }

  // (5) Strong high-risk vocabulary (architecture/audit/security) → reasoning floor.
  if (highHits >= 2) {
    return out('high', 'escalate_T3', `multiple high-risk signals (${highHits}) — architecture/critical work, floor at Opus`);
  }

  return out('none', 'allow', 'no risk signal');
}

/** True for the action set that a PreToolUse deny rule must hard-block. */
function isBlocking(action) {
  return action === 'escalate_human';
}

module.exports = { assess, isBlocking, EXPLAIN_INTENT, IMMINENT, DESTRUCTIVE, PROD_CTX, DEV_CTX };

// ── CLI ─────────────────────────────────────────────────────────────────────
// Usage: node moo-risk.js "drop the legacy_users table since nothing reads it"
if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    process.stderr.write('usage: node moo-risk.js "<prompt or action>"\n');
    process.exit(64);
  }
  const verdict = assess(text);
  process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  // exit 2 when the action must be human-gated (mirrors the PreToolUse contract)
  process.exit(isBlocking(verdict.action) ? 2 : 0);
}
