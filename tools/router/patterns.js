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
  /\.env\b/, /\bsecret/i, /\bcredential/i, /\bAPI[_ ]?KEY\b/,
  /\barquitetur/i, /\barchitect/i, /\brefator(a|ar|amento)?\b/i, /\brefactor/i,
  /\bcr[ií]tic/i, /\bcritical\b/i, /\baudit/i, /\breview\s+final\b/i,
  /\bpackage\.json\b/, /\bci\b.*\bpipeline/i, /\.github\/workflows/i,
  /\bredesenha/i, /\bredesign/i,       // added v0.9.3 — "redesenha o auth" misrouted to T0
  /\bmulti[- ]?tenant/i,               // added v0.9.3 — architecture pattern, was T0
  // v0.9.3 stress-test batch — 16 failures found in 47-prompt suite
  /\bpush\s+(para|to)\s+(main|master|prod)/i, // "push para main" was T0
  /\bmerg(e|ing)\s+(a\s+|the\s+)?branch/i, // "merge/merging a branch" was T0
  /\bmigrat/i,                          // "migrate/migrating the database" — all verb forms
  /\bmigrar\b/i,                        // "migrar a base de dados" — PT verb form
  /\bmicroservic/i,                    // "create a new microservice" — architecture signal
  /\bmove\b.*\bupdate\s+(all\s+)?imports/i, // "move folder and update all imports" — multi-file
  // v0.9.3 creative-test batch — compound prompts, deceptive patterns
  /\bpush\s+(to|para)\s+stag/i,         // "push to staging" — deploy signal
  /\bdelete\b.*\btable\b/i,             // "delete the user table" — destructive
  /\bOAuth/i,                           // "set up OAuth2" — auth architecture
  /\bauthenticat/i,                      // "authentication/authenticate/authenticated" — auth design (v0.9 fix: trailing \b broke match)
  /\breview\b.*\bmerg/i,                // "review before merge/merging" — pre-merge gate (v0.9 fix: trailing \b broke "merging")
  /\bPR\s*#?\d+\b.*\breview/i,          // "PR #42 needs review" — code review
  // v0.9.3 mega-test batch — security (9 fails), arch (5), devops (3)
  /\bXSS\b/,                            // "vulnerable to XSS" — security
  /\bCSRF\b/,                           // "CSRF protection" — security
  /\bSQL\s*inject/i,                    // "SQL injection" — security
  /\bOWASP\b/,                          // "OWASP ZAP scan" — security
  /\bauthoriz/i,                        // "authorization checks" — security (distinct from authenticat)
  /\bvulnerab/i,                        // "vulnerable to XSS" — security signal
  /\bJWT\b/,                            // "JWT token rotation" — auth architecture
  /\bbrute\s*force/i,                   // "prevent brute force" — security
  /\brotate\b.*\b(key|token|secret)/i,  // "rotate API keys" — security ops
  /\bbcrypt|password\s+hash/i,          // "bcrypt hashing to replace MD5" — security
  /\bSSL\b.*\b(expir|certific)/i,       // "SSL certificate expired" — infra critical
  /\bblue[- ]green/i,                   // "blue-green deployment" — deploy architecture
  /\bTerraform\b/i,                     // "set up Terraform" — infra as code
  /\bCQRS\b/i,                          // "CQRS pattern" — architecture pattern
  /\bAPI\s*(versioning|gateway)\b/i,    // "API versioning/gateway" — architecture
  /\bmulti[- ]?region/i,               // "multi-region failover" — architecture
  /\bGraphQL\b.*\bREST\b|\bREST\b.*\bGraphQL\b/i, // "GraphQL vs REST" — arch decision
  /\bconvert\s+all\b/i,                // "convert all class components" — multi-file refactor
  /\breplica/i,                         // "read replicas" — database architecture
  /\bmonolith/i,                        // "split the monolith" — architecture
  // v0.9.3 adversarial-gen batch — template mismatches
  /\breview\b.*\bpush/i,               // "review before pushing to main" — pre-push gate
  /\bPR\b.*\bbefore\s+merg/i,          // "PR before merging" — pre-merge gate (stress test 2026-04-16)
  /\bbefore\s+merg/i,                  // "before merging" — pre-merge gate
  /\bbypass/i,                          // "auth bypass" — security signal
  /\bpatch(ed)?\b/i,                   // "needs to be patched" — security fix
  // Sprint B.0 safety fix — PT verb conjugations + PR/merge patterns
  /\bmerg(ea|ear|eia)\b/i,             // "mergea na main" — PT conjugations of merge
  /\bPR\b.*\b(main|master|prod)/i,     // "abre um PR ... main" — release gate
  /\babre\s+(um\s+)?PR\b/i,            // "abre um PR" — PT release gate
  /\bcria(r)?\s+(um\s+)?PR\b/i,        // "criar um PR" — PT release gate
  /\bcreate\s+(a\s+)?PR\b/i,           // "create a PR" — EN release gate
  /\bopen\s+(a\s+)?PR\b/i,             // "open a PR" — EN release gate
  // A/B test 2026-04-16 — P8 misclassified: "review ... security issues" → T0
  /\bsecurity\b/i,                     // "security review", "security issues" — always HIGH_RISK
  /\bseguran[çc]a\b/i,                // "revisão de segurança" — PT security signal
  // Gold-labels audit 2026-04-16 — gl-075: "review the database schema" → T0 (should be T3)
  /\breview\b.*\bschema\b/i,          // "review the database schema" — architecture review
  // Adversarial probe 2026-04-18 — naked push/merge/ship verbs weren't gating T3.
  // Before these patterns: "vou fazer push" → T0 gemma4, "git push origin main" → T0.
  /\bgit\s+push\b/i,                   // "git push <anything>" — any git push is production-touching
  /\bvou\s+(fazer|dar)\s+push/i,       // PT "vou fazer push"
  /\bpronto\s+(para|pra)\s+(push|merg|deploy|release|ship)/i, // PT "estou pronto para merge/ship"
  /\bready\s+(to|for)\s+(push|merg|deploy|ship|release)/i,    // EN "ready to ship/merge/deploy"
  /\b(precis(o|a|ei)|need)\s+(de\s+|to\s+)?(push|merg|deploy)/i, // "preciso de push", "need to merge"
  /\bship\s+it\b/i,                    // "ship it" — deploy signal
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
  /\boptimiz(a|e|ar)\b/i,              // added v0.9.3 — "optimiza a query SQL" was T0
  /\bcria(r)?\s+(um\s+)?endpoint/i,    // added v0.9.3 — feature creation needs reasoning
  /\bcreate\s+(a\s+|an\s+)?endpoint/i, // added v0.9.3 — EN variant
  // v0.9.3 stress-test batch
  /\bplan\s+(the\s+)?implement/i,      // "plan the implementation of" — reasoning task
  /\breescrev/i,                       // "reescreve este componente" — significant rewrite PT
  /\brewrite\b/i,                      // "rewrite" EN variant
  /\berror\s+handling\b.*\ball\b/i,    // "add error handling to all" — multi-file scope
  // v0.9.3 creative-test batch
  /\bcaching\s+distribu/i,            // "caching distribuído" — distributed systems
  /\bconnection\s+pool/i,             // "connection pool exhausting" — perf investigation
  /\bRBAC\b/,                         // "implement RBAC" — access control design
  /\bfailing\s+on\s+CI\b/i,           // "tests failing on CI" — CI debugging
  /\bexhaust/i,                       // "pool exhausting under load" — perf signal
  /\brobust(a|o)?\b/i,                // "solução robusta" — design quality signal PT
  // v0.9.3 mega-test batch — debug/perf (10 fails), frontend (4), backend (4)
  /\bcrash(es|ing)?\b/i,              // "worker crashes after 1000 messages"
  /\bdeadlock/i,                      // "database deadlocks"
  /\bmemory\s*leak/i,                 // "event listener causes memory leak"
  /\bN\+1\b/,                         // "N+1 query problem"
  /\bstale\s*closure/i,              // "useCallback stale closures"
  /\bsegfault/i,                     // "segfault in native addon"
  /\bbundle\s*size/i,                // "bundle size is 4.2MB"
  /\bvirtualiz/i,                    // "infinite scroll with virtualization"
  /\brate\s*limit/i,                 // "add rate limiting"
  /\bdegrad(e|es|ing)\b/i,          // "response time degrades linearly"
  /\bflaky\b/i,                      // "flaky test passes locally"
  /\bdrops?\s+(after|every)/i,       // "WebSocket drops after 60 seconds"
  /\btakes\s+\d+\s*(s|sec|min|hour)/i, // "query takes 8 seconds" — perf investigation
  /\bslow\s+(test|query|page|load)/i,  // "find the slow tests" — perf signal
  /\bstring\s+concatenat/i,           // "SQL uses string concatenation" — security smell
  /\b\d+\s*MB\b/i,                    // "bundle 4.2MB", "files over 100MB" — size investigation
  /\bpromise\s+instead/i,             // "returns promise instead of value" — async bug
  /\bcompar[ae]\b/i,                  // "compara React vs Vue" — comparison reasoning PT+EN
  /\b\w+\s+vs\.?\s+\w+/i,            // "React vs Vue", "Redis vs Memcached" — comparison
  /\bpros\s+(and|e)\s+cons\b/i,      // "pros and cons" — decision analysis
  /\bwhich\s+(is\s+)?better\b/i,     // "which is better for X" — comparison reasoning
  // A/B test 2026-04-16 — P5 misclassified: WebSocket disconnect diagnosis → T0
  /\bdesconect/i,                    // "desconecta clientes" — PT disconnect signal
  /\bdisconnect/i,                   // "disconnects after 60s" — EN disconnect signal
  /\bcausa\s+mais\s+prov[aá]vel/i,  // "causa mais provável" — PT diagnosis signal
  /\bmost\s+likely\s+cause/i,       // "most likely cause" — EN diagnosis signal
  /\bdiagnos/i,                      // "diagnose/diagnosis/diagnostic" — reasoning signal
  /\bcomo\s+resolv/i,               // "como resolvo" — PT problem-solving signal
  // Gold-labels audit 2026-04-16 — gl-063, gl-064, gl-067 misclassified
  /\bsyntax\s+error/i,              // "syntax error near unexpected token" — debug signal
  /\bhook\s+error/i,                // "hook error when running" — debug signal
  /\bbuild\s+fail/i,                // "the build fails with this output" — CI debug signal
  /\bENOENT\b/,                     // "ENOENT no such file or directory" — error investigation
  // overnight-tuning 2026-04-12: compound "implement" → T2 (fixes gl-046, gl-051)
  /\bimplement\w*\b.{30,}/i,          // "implement X with Y, Z and W" — multi-concern feature
  // review #2, 2026-04-17 — T1 accuracy at 33.9%, these were being routed to T0
  /\bhow\s+should\s+(?:we|I|you)\s+handle\b/i, // "how should we handle X" — design question
  /\breview\s+this\s+approach\b/i,     // "review this approach: using X instead of Y" — design review
  /\bqual\s+(?:a\s+)?melhor\b/i,      // "qual a melhor abordagem" — PT design question
  /\bn[aã]o\s+(?:est[aá]\s+a\s+)?funcionar\b/i, // "não está a funcionar" — PT debug signal
  /\bnot\s+working\b/i,               // "not working" — EN debug signal
];

// ── LOW_RISK (light tasks — commit msg, docstring, regex, etc.) ────────────
const LOW_RISK = [
  /\bresume\b/i, /\bresumo/i, /\bsummari[zs]e/i,
  /\bexplain\b/i, /\bexplica/i, /\bo\s+que\s+[eé]\b/i, /\bwhat\s+is\b/i,
  /\bcommit\s+message/i, /\bdocstring/i, /\bregex/i,
  /\bformat/i, /\btransforma/i, /\btraduz/i, /\btranslate\b/i,
  /\btypo/i, /\brename\b/i,
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
