# Mooter.ai — AI Operating System Alignment Checkpoint

> **Status:** initial read-only audit completed; implementation not started  
> **Updated:** 2026-07-12 · America/Sao_Paulo  
> **Audit worktree:** `C:\Users\Paulo Loureiro\frugal-w2`  
> **Branch / HEAD:** `wave/w2-agent-bridge` @ `ae17c91800a4aa80774ca050dc7c85bd67d794cb`  
> **Audience:** Paulo, ChatGPT/Codex, Cowork, Claude Code, Gemini CLI and local Moo/Ollama workers  
> **Purpose:** give a fresh session a compact, evidence-backed operating picture without relying on chat memory.

## 1. How to use this document

This is a checkpoint, not an eternal claim. Before acting, every agent must:

1. read `AGENTS.md`, this file and `SYNC.md`;
2. confront the current Git branch, HEAD and dirty state;
3. treat code, schemas and executable tests as stronger evidence than prose;
4. name any contradiction instead of silently selecting the convenient source;
5. preserve user changes and never modify `tools/router/classify.js`;
6. keep external access read-only and allowlisted until Paulo approves otherwise.

If this document conflicts with current code or runtime evidence, update this document after proving the new state. Do not force the code to match a stale checkpoint.

## 2. Executive summary

Mooter is a substantial local-first LLM routing system with a live Claude Code hook, deterministic classifier, optional semantic arbitration, provider dispatch, local telemetry, CLI, workflow engine, Cloudflare Hub, Next.js/Supabase application, VS Code cockpit, MCP server and early multi-agent governance.

The engineering foundation is stronger than the current cross-agent operating system. Four issues dominate the next phase:

1. **P0 — privacy contract drift:** public documentation says prompt text is never stored or sent, while the runtime records a local prompt preview, can retain full turns in the opt-in Context Bridge and can send the full prompt to the optional Haiku arbiter.
2. **P0 — source/runtime drift in Publish:** this branch contains cockpit `0.16.65` with the old fail-open Security→Publish behavior, while the installed extension `0.16.66` is fail-closed and removes the webview override.
3. **P1 — provider contract drift:** `classify.js` can recommend DeepSeek, Gemini and Mistral, but the executor only directly supports Ollama, Codex CLI and OpenAI; Anthropic routes defer to Claude subagents.
4. **Council is experimental:** Fleet governance primitives are useful, but there is no provider-agnostic Council runtime or durable decision schema, and preserved measurements do not prove a quality advantage over the best single local model.

**Current verdict:** safe to build local documentation, policies, schemas, drift checks and the `mooter-project-operator` skill. Not safe to enable broad external writes, promote Council to executor, or publish a plugin yet.

## 3. Provenance and validation boundary

### 3.1 Confirmed environment

| Item | Observed state |
|---|---|
| Repository root | `/mnt/c/Users/Paulo Loureiro/frugal-w2` |
| Git branch | `wave/w2-agent-bridge` |
| HEAD | `ae17c91800a4aa80774ca050dc7c85bd67d794cb` |
| Upstream | `origin/wave/w1-f3`, branch reported three commits ahead |
| OS / shell | WSL2 · bash 5.1 |
| Node in WSL | unavailable |
| Windows Node | `v24.14.0` |
| Package topology | one Git repo with standalone npm packages; not an npm workspace |
| Docker | CLI present; daemon inaccessible to this audit shell |
| Ollama | CLI installed; daemon not running |
| Frozen classifier | SHA-256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` |
| Cockpit in checkout | `0.16.65` |
| Cockpit installed | `0.16.66` |

### 3.2 User changes that existed before the audit

These must not be overwritten or attributed to this checkpoint:

- `SYNC.md`
- `landing/app/globals.css`
- `landing/app/page.tsx`
- nine untracked `_handoff/guardian/*.md` packets

### 3.3 Validation performed

- `classify.js` hash verified before and after the audit.
- Critical runtime files in `~/.claude/tools/router` and the wired `/home/paulo/mooter/tools/router` tree matched this checkout byte-for-byte for the inspected files.
- Selected tests: **196 total · 189 pass · 7 load failures**.
- The seven load failures were Hub tests that could not import locally absent `@sentry/cloudflare`; no dependency was installed.
- Router, privacy/context, Fleet governance and selected cockpit trust/permission tests passed.
- 162 JSON files were checked: four VS Code files are intentionally JSONC; `packages/council/scripts/quality-eval-paired-results.json` is genuinely truncated.
- Landing build, full extension suite and full package matrix were not run.
- No provider inference, external write, deploy, migration, commit, push or PR occurred.

## 4. Source-of-truth precedence

Unless a versioned decision says otherwise, use this order:

1. code, schemas and executable tests;
2. approved ADRs and durable decisions;
3. versioned technical documentation;
4. verifiable operational state: Git, installed runtime, logs and Ledger;
5. allowlisted Notion pages;
6. allowlisted Obsidian content under the Mooter folder;
7. Slack, chats, screenshots and handoffs as non-canonical evidence.

Operational model:

- **Git** is the canonical technical source.
- **Ledger** is mechanical provenance.
- **`SYNC.md`** is the current project snapshot, not a log.
- **`MEMORY.md`** stores durable architectural decisions.
- **`LOOP.md`** stores observed execution learning.
- **Notion** is the work/milestone mirror when authorized.
- **Obsidian** is a personal/stable-knowledge mirror under an explicit folder boundary.
- **Slack** may become an interaction/notification surface, never architectural truth.

## 5. Architecture map

```text
Claude Code prompt
  -> UserPromptSubmit hook
  -> prompt normalization
  -> frozen regex classifier (classify.js)
  -> optional Haiku arbiter for ambiguous prompts
  -> pins + budget + safety boost + high-risk floor + coherence
  -> router hint / execution decision
       -> T0 Option A: local Ollama suggested answer
       -> T1 Option B, opt-in: router-execute
       -> Anthropic tiers: Claude subagents
       -> explicit provider pin: Ollama / Codex CLI / OpenAI
  -> host response
  -> local decisions/execution logs
  -> backtest, calibration, statusline and optional aggregated sync
  -> Cloudflare Hub / D1 / R2
```

Parallel product surfaces:

```text
Next.js/Vercel -> Supabase Auth + RLS -> profile, devices and dashboard
VS Code cockpit -> Workspace Trust -> Agent SDK/local workers -> review/apply/publish
MCP stdio -> local tools + opt-in Notion write + local Obsidian sync
```

Key evidence:

- Hook flow and arbitration: `tools/router/inject_context.js:585`, `:801`.
- Haiku request carrying the prompt: `tools/router/arbiter.js:178`.
- Provider selection: `tools/router/classify.js:950`.
- Executor contract: `tools/router/router-execute.js:537`, `:843`.
- Context Bridge boundary: `tools/router/session-context.js:44`.
- Hub routes: `hub/worker.js:53`.
- Supabase REST/auth wrapper: `landing/app/lib/supabase.ts:1`.
- Cockpit entry: `packages/vscode-extension/src/extension.js`.

## 6. Component status

| Component | Status | Notes |
|---|---|---|
| Live router/hook | Functional | Runtime is wired and inspected critical files matched the repo. |
| Frozen classifier | Functional | Required SHA intact. |
| Semantic arbiter | Functional but policy-conflicted | Optional cloud call contradicts absolute privacy copy. |
| Multi-provider executor | Partial | Capability mismatch with classifier recommendations. |
| CLI | Broad implementation | Full suite not rerun in this checkpoint. |
| Workflow engine | Implemented, not runtime-proven here | SQLite resume, sandbox and workers exist. |
| Cloudflare Hub | Configured, partially tested | D1/R2 and routes exist; local dependency gap blocked seven tests. |
| Landing/Supabase | Implemented, not built here | Auth, RLS and migrations present. |
| VS Code cockpit | Functional with drift | Installed `0.16.66` is safer than branch `0.16.65`. |
| MCP server | Implemented, not globally registered | 20-tool manifest, including external-write tools. |
| Fleet governance | Partial/strong foundation | FSM, proof-gate, leases and caps tested. |
| Council | Experimental | Evals/artifacts only; no perennially consumable runtime contract. |

## 7. Agent readiness matrix

| Agent | Durable instructions | Context/tools | Main gap | Readiness |
|---|---|---|---|---:|
| Claude Code | `AGENTS.md`, `CLAUDE.md`, rules, 21 skills and hooks | Strong | Global permission prompt bypass is enabled | 4/5 |
| ChatGPT/Codex | `AGENTS.md`; external Mooter sync skill available in this audit | Partial | Repo `.codex` is empty; no local project operator | 2.5/5 |
| Gemini CLI | None found | None found | No `GEMINI.md`, adapter or validation | 0.5/5 |
| Ollama/Moos | Agent prompts, workflow, Fleet and runners | Local-first | Stateless context/handoff conventions are not uniform | 2.5/5 |

## 8. Integration registry — current state

| Integration | State | External access in this checkpoint | Guard/uncertainty |
|---|---|---|---|
| Git/GitHub Actions | Functional | Read-only local Git | Branch/upstream mismatch requires care. |
| Cloudflare Workers/D1/R2 | Configured | Not contacted | Production state unverified. |
| Supabase | Configured | Not contacted | RLS present; live policies unverified. |
| Vercel | Partial | Not contacted | Cockpit deploy exists; linked project not verified. |
| Hostinger | Absent/unproved | None | No operational reference found. |
| Sentry | Configured | None | Local Hub dependency absent. |
| Ollama | Installed, daemon off | Local status only | No inference run. |
| Anthropic | Implemented | No real call | Arbiter and Agent SDK paths exist. |
| OpenAI/Codex | Partial | No real call | Wrappers exist; availability not validated. |
| Gemini | Recommendation only | None | No executor adapter or agent setup. |
| Notion | Write code exists, disconnected | No connector available | No page allowlist or per-write approval. |
| Obsidian | Local pack exists, unconfigured | Vault content not read | Must restrict to an approved `<vault>/Mooter/`. |
| Slack | Absent | None | Registry/documentation only. |
| MCP | Repo configs exist | No global Mooter MCP active | `settings.json` reported no MCP servers. |

## 9. Notion, Obsidian and Slack policy baseline

### Notion

- Start read-only through an official remote MCP/OAuth flow.
- Require an explicit page allowlist.
- Preserve source URI, title, timestamp/version, classification and authorization.
- `mooter_notion_write` must not be enabled broadly in its current form: it can accept an arbitrary `parentId` and writes whenever a token is present and `dryRun` is false.

### Obsidian

- Treat the vault as local Markdown, not as an indiscriminate embedding corpus.
- Read only `<approved-vault>/Mooter/preferences.md` initially.
- Write only below `<approved-vault>/Mooter/`.
- Never scan or alter personal vault folders outside the Mooter boundary.

### Slack

- Non-canonical notification and approval surface only.
- No implementation until an actual workflow justifies it.
- Future design must include redaction, identity, channel allowlist, rate limits and loop prevention.

## 10. Security and privacy findings

### Strengths

- High-risk prompts floor to T3 and downgrade requests are refused.
- Context Bridge is default OFF, bounded, local, mode `0600` and TTL-pruned after seven days.
- Aggregated sync has an explicit consent gate and forbidden-field checks.
- Hub schemas, pseudonymous identifiers, RLS and admin gates exist.
- Data-rights package supports redacted export, confirmed local deletion and signed forget-me.
- Cockpit Agent SDK paths use Workspace Trust and path/tool fences.
- Installed cockpit `0.16.66` makes Security->Publish fail closed.

### Required corrections

1. Replace absolute privacy claims with a precise data-flow contract distinguishing:
   - regex classification in memory;
   - local prompt preview;
   - opt-in Context Bridge transcripts;
   - optional cloud arbitration;
   - aggregated Hub sync.
2. Port the installed `0.16.66` Publish security gate back to canonical Git before another package is built from this branch.
3. Make provider capability a single registry consumed by classifier, executor, cockpit and docs.
4. Put Notion writes behind allowlist + explicit approval.
5. Review the global `skipDangerousModePermissionPrompt=true` setting with Paulo; do not change it autonomously.
6. Replace CLI access tokens in URL query parameters with a safer one-time exchange design.
7. Define retention for every local and remote store, not only Context Bridge and Hub deltas.

## 11. Council readiness

| Dimension | Score 0-5 | Baseline finding |
|---|---:|---|
| Versioned Context Package | 0.5 | No single contract. |
| Provider-agnostic decision schema | 0.5 | Missing durable schema. |
| Independent/blind proposals | 1.5 | Present in experiments, not a reusable runtime. |
| Provider diversity | 1 | Preserved eval is mainly Qwen-family. |
| Abstention and dissent | 0 | Not implemented. |
| Safety and approval | 3.5 | Fleet FSM/signature foundation is useful. |
| Cost and attention caps | 3 | Scheduler/caps exist. |
| Honest evaluation | 3 | Negative result was preserved. |
| Reproducibility | 2 | One result artifact is truncated. |
| Cockpit execution | 1 | No complete Council command/vertical slice. |

**Overall readiness:** approximately **1.7/5**.

Council must remain advisory. Start later with two independent members and one narrow task class. Compare every run against a single-model baseline on quality, error, latency, cost, safety and human intervention. If it does not win, do not recommend Council for that class.

## 12. Red-team register

| Severity | Scenario | Detection | Prevention / recovery |
|---|---|---|---|
| P0 | Private prompt reaches Haiku under an absolute “never leaves” promise | Data-flow contract tests | Explicit consent/policy; disable arbiter where prohibited; correct claims and retention. |
| P0 | Rebuilding cockpit from this branch reintroduces fail-open Publish | Installed-vs-Git drift check | Port `0.16.66`; gate packaging on fail-closed tests. |
| P1 | Classifier selects provider with no executor adapter | Provider contract test | Single capability registry; fail closed when adapter absent. |
| P1 | Prompt injection directs a Notion write outside the approved area | Authorization log + URI allowlist | Read-only initial connector; per-write approval; revoke token on incident. |
| P1 | Council consensus is worse and slower than a single model | Mandatory A/B baseline | Preserve dissent/abstention; disable Council for losing classes. |
| P1 | Dangerous-mode bypass weakens human gates | Settings audit | Paulo-reviewed global-setting change. |
| P2 | Interrupted eval produces a truncated “result” consumed as truth | JSON/schema validation | Atomic temp+rename writes; regenerate from ledger/transcript. |

## 13. Documentation debt and reuse decisions

Reuse instead of duplicating:

- `SYNC.md` is the `PROJECT_STATE` equivalent.
- `docs/strategy/MOOTER_ARCHITECTURE.md` remains the living architecture target.
- `docs/adr/` and `docs/decisions/` remain the decision system.
- `AGENTS.md` and `CLAUDE.md` remain short adapters.
- `docs/data-policy.md` must be corrected in place.

Still needed:

- a machine-readable source registry;
- data classification, permission and retention policies;
- one tool/integration registry;
- Council protocol/roles/schema/rubric;
- drift checks;
- a concise `mooter-project-operator` skill;
- a small Gemini adapter;
- automatic checks for instruction, provider, privacy and installed-runtime drift.

## 14. Minimal implementation plan

1. Correct the privacy/data-flow contract and tests.
2. Add `.mooter/context/source-registry.yaml`.
3. Add minimal `.mooter/policies/{data-classification,permissions,retention}.yaml`.
4. Add `docs/ai/CONTEXT_MAP.md` and `docs/ai/TOOL_REGISTRY.md` only; do not duplicate project state or ADRs.
5. Update the living architecture with verified current flow.
6. Add Council protocol, roles, decision schema and evaluation rubric.
7. Build `mooter-project-operator/` with concise `SKILL.md`, references and deterministic scripts.
8. Add drift/schema/link/privacy/provider tests.
9. Simulate fresh Codex, Claude and Gemini sessions plus missing integrations and production-risk prompts.
10. Use the skill in real sessions before proposing a plugin.

## 15. Owner input — conservative defaults

Paulo can approve the whole baseline by replying **“continue with the defaults”**, or list only exceptions.

| Decision | Conservative default |
|---|---|
| Canonical sources | Git/code/tests -> ADR -> docs -> runtime -> allowlisted Notion -> allowlisted Obsidian -> chat/Slack |
| Private Notion pages | Deny until explicitly allowlisted |
| Private vault folders | Everything outside `<approved-vault>/Mooter/` |
| Environments | Local/dev only; staging/production blocked |
| Human approval | External writes, irreversible actions, production, secrets, spend and publication |
| Council mode | Consultative |
| Task budget | Local `$0`; no cloud budget without task-specific approval |
| External-provider data | Public/redacted only |
| Mandatory-local tasks | Redaction, classification, drift, secret scan and context packaging |
| Retention | Prompt-bearing local context <=7 days; no new external retention |
| Final authority | Paulo; dissent must be preserved |
| Notifications | Off |
| Notion/Obsidian/Slack writes | Off |
| Users/teams | Single-owner until explicitly expanded |
| Legal baseline | GDPR/privacy baseline; no regulated data authorized |

## 16. Actions allowed after this checkpoint

Safe, local and reversible:

- documentation, schemas and deterministic tests;
- local skill creation;
- drift checks;
- corrections to versioned privacy claims;
- no commit or publication.

Require explicit consolidated authorization:

- dependency installation;
- connector authentication;
- global settings changes;
- database/API/CI/CD changes;
- migrations or production actions;
- external writes;
- structural provider refactors;
- commit, push, PR, merge or publication;
- skill-to-plugin promotion.

## 17. Fresh-session handoff block

Copy this block into ChatGPT/Codex, Cowork or Claude Code together with this file:

```text
You are joining the Mooter.ai project. Read AGENTS.md, docs/ai/AI_SETUP_SUMMARY.md and SYNC.md before acting.

Confront the current Git branch, HEAD, dirty state and installed runtime. Code/schemas/tests outrank prose. Preserve all user changes. Never edit tools/router/classify.js. Do not install, authenticate, deploy, migrate, publish, commit, push or write externally without Paulo's explicit approval.

Current priorities:
1. fix the privacy/data-flow contract;
2. reconcile cockpit installed 0.16.66 with canonical Git;
3. create source/tool/policy registries and drift checks;
4. build the local mooter-project-operator skill;
5. keep Council advisory until its contract and eval prove it beats a single-model baseline.

When reporting, include the real worktree/branch, dirty state, inspected/changed files, tests actually run, blockers, classify.js SHA status and the next concrete action.
```

## 18. Next action

Await Paulo's confirmation or exceptions to the conservative defaults, then implement the minimal local foundation beginning with the privacy/data-flow contract and source registry.
