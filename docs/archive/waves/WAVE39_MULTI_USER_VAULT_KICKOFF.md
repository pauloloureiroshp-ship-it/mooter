# 🗄️ Wave 39 — Multi-User Vault Sync (FOUNDATION KICKOFF)

> **Status: BRIEF ONLY.** This is a design kickoff for a future dedicated wave
> (~1-2 days). Nothing here is implemented yet. Do a Day-0 honest recon first and
> refute these premises before writing any code.

## 🎯 Posicionamento estratégico

Today Mooter is single-user per device: the Pastor learns *your* routing, the
obsidian-vault-sync pack mirrors *your* learnings, and the hub aggregates by an
anonymous `user_id_hash`. **Wave 39 asks:** can two+ users each keep a private
vault (routing history, learnings, preferences) while **opt-in sharing**
adapters/LoRAs and distilled skills — with a hard privacy boundary (vault A never
sees vault B unless explicitly shared)?

This unlocks the "federated wisdom" promise already hinted at on the landing
("Sign in only for federated wisdom and cross-device sync") without ever pooling
raw per-user data.

## 🛡️ NÃO QUEBRAR (carry the standing doctrine)

- `tools/router/classify.js` is **sha-locked** (`7b01eb86…`). Vault logic must
  not touch it. Adapter selection stays advisory, tier floors win.
- `tools/router/version.json` — leave to the version-sync workflow.
- Engine packages (Wave 28-34) are frozen unless a phase explicitly extends one
  with **new** files; never edit frozen internals.
- Privacy is the product. **No raw user IDs, emails, or JWTs ever land in the
  hub D1** — the hub already only sees `user_id_hash` (unsalted SHA-256, 16-hex
  truncated; see `docs/strategy/PHASE_C_ARCHITECTURE_AUDIT.md`). Keep it that way.
- Final-reviewer (Opus) gate before any merge. PR pattern.

## 📐 Arquitectura proposta (refute first)

### 1. Identity — who owns a vault
- Reuse the existing **`user_id_hash`** as the vault owner key. It already keys
  the hub's cross-device aggregation (`/v1/user/dashboard?user_hash=<16hex>`,
  migration 018 index). No new identity primitive needed.
- Local: a vault is `~/.mooter/vaults/<user_id_hash>/` (today's single-user state
  lives flat under `~/.mooter/`; migrate it into a default vault namespace).
- ⚠️ Recon premise to check: is `user_id_hash` stable across re-auth? The audit
  doc flags that a hash change would **orphan** existing rows. A vault keyed on an
  unstable hash would silently lose history. Resolve before building.

### 2. Privacy boundaries — vault A never sees vault B
- Every hub row that carries vault data gets an **`owner_hash`** column
  (= `user_id_hash`). Every read is `WHERE owner_hash = ?`; there is no
  cross-owner query path in the worker. (This `owner_hash` concept is **new** —
  it does not exist in the schema today; define it in the Phase A migration.)
- Local vaults are filesystem-isolated by directory; no shared mutable state
  between them except the explicit shared registry (below).
- Signed requests: vault writes to the hub must carry the existing telemetry HMAC
  (`~/.mooter/.telemetry_secret`) so the hub can attribute without trusting a
  client-supplied owner.

### 3. Shared adapters — opt-in, content-addressed
- A shared LoRA/skill is **content-addressed**: `sha256(weights || manifest)` is
  its ID. Sharing publishes the blob to a `shared_adapters` registry keyed by
  content hash, plus a row linking `owner_hash → content_hash` with a visibility
  flag (`private | shared`).
- Pulling a shared adapter copies the immutable blob into your vault by hash;
  you never mutate someone else's blob. Selection stays advisory (classify.js
  untouched; tier floors win — carry the Wave 31 LORAUTER guardrail).
- This `content_hash` registry is **new** — no `content-addressed` concept exists
  in the codebase today.

### 4. Conflict resolution — two users edit the "same" skill
- **Immutable blobs + a mutable pointer per vault.** Each vault holds a pointer
  `skill_name → content_hash`. Editing creates a *new* blob (new hash) and moves
  *your* pointer; it never rewrites a shared blob. So two users editing the same
  skill diverge into two hashes — no lost-update, no merge conflict.
- Optional later: a 3-way merge UI on top of the pointer history. Out of scope
  for the foundation.

### 5. Layer mapping (where this lives)
- **Home: L15 Ecosystem** (`@mooter/synthesis`) — it already owns the
  catalog/registry concern; the shared-adapter registry is a natural extension.
- **Validate via L13 LoRA** — adapter manifests + selection already live there;
  reuse the manifest/signature primitives, don't reinvent.
- **Surface: obsidian-vault-sync pack** (`packs/obsidian-vault-sync/`) — extend
  its `sync-write`/`sync-read` to be vault-namespace-aware rather than flat.

## 🔭 Day-0 recon checklist (do BEFORE coding)
- [ ] Is `user_id_hash` stable across re-auth? (orphan risk above)
- [ ] What exactly does `~/.mooter/` hold today that must move into a default
      vault? (Pastor state, vault-priors.json, decisions.log scoping)
- [ ] Does any hub table already have an owner column we can reuse instead of a
      new `owner_hash`? (grep `hub/migrations/`)
- [ ] Does the LoRA manifest (L13) already content-address weights? If so, reuse
      its hashing rather than defining a new scheme.
- [ ] Does obsidian-vault-sync assume a single vault path? (it does — confirm the
      blast radius of namespacing it)

## 📋 Phases (execute in order, each its own PR + final-reviewer)
- **Phase A — schema + migration.** New hub migration: `owner_hash` columns +
  `shared_adapters(content_hash, …)` + `vault_pointers(owner_hash, skill_name,
  content_hash, visibility)`. Additive only (CREATE TABLE / ADD COLUMN IF NOT
  EXISTS). Local: `~/.mooter/vaults/<hash>/` layout + a one-time migration of the
  current flat state into a default vault.
- **Phase B — vault namespace (local).** Make Pastor state, decisions scoping,
  and obsidian-vault-sync vault-aware. Single-user behaviour must be byte-identical
  (default vault = today's state).
- **Phase C — sharing (opt-in).** `mooter vault share <skill>` /
  `mooter vault pull <hash>`; content-addressed publish/fetch through the hub
  registry; visibility flag; signed with the telemetry HMAC.
- **Phase D — smoke 2-user scenarios.** Two synthetic owners; assert A cannot read
  B's private pointers; a shared adapter pulled by B is byte-identical to A's
  blob; concurrent edits diverge into two hashes (no lost update).

## ✅ Sucesso (gate)
- classify.js sha intact; version.json untouched; engine packages frozen.
- Single-user experience unchanged (default vault).
- Hard privacy: a test proves no cross-owner read path exists.
- Additive migration only; 2-user smoke green; final-reviewer SHIP.

## 📚 Referências
- `packs/obsidian-vault-sync/` — current single-vault bridge (Wave 31).
- `docs/strategy/PHASE_C_ARCHITECTURE_AUDIT.md` — `user_id_hash` design + orphan risk.
- `hub/migrations/018_user_dashboard_index.sql` — current per-user aggregation index.
- `docs/strategy/MOOTER_VS_OPUS_LIVE_BENCHMARK_2026-06-09.md` — T3 prompt #4 sketched
  this design (owner_hash WHERE clause, LORAUTER guardrail, telemetry_secret signing).
- `@mooter/synthesis` L15 Ecosystem + L13 LoRA — proposed home + validation layer.
