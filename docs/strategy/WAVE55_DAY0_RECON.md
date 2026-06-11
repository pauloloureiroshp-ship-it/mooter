# Wave 55 V3 — Day 0 Recon (Product + Audit)

> Doctrine V4 #2 (Honest > Forced): verify every brief premise against the live
> repo + prod before writing code. Produced 2026-06-11 on branch
> `wave55-product-audit`. Companion: [[REFUTATIONS_LOG.md]] ·
> [[MAC_INCONSISTENCIES_RECON.md]] (Phase A.5 output, done in the addendum pass).

## State of the world (verified)

| Item | Check | Result |
|---|---|---|
| `classify.js` sha | sha256 | ✅ `427d8c0b…364bc48f` — **INTACT** |
| Wave 53 in main | `git log` | ✅ `7393abb feat(wave53)` (#157) |
| Wave 54 in main | latest release | ✅ `v1.35.0-ccaf-audit-overnight` |
| version.json | git | ✅ `1.35.0` (`8d03c9c`) |
| Hub `/v1/pricing` | curl | ✅ HTTP 200 LIVE |
| `mooter.ai/install.sh` | curl | ✅ HTTP 200 |
| mooter.ai landing version | curl | ⚠️ `v1.21.5` — **STALE** (actual 1.35.0; copy refresh is OUT OF SCOPE) |
| CCA-F audit ran? | `~/.mooter/fable-observe/audit/` | ❌ **ABSENT** (ENOENT) → first run pending |
| CCA-F commands | source | ✅ `cca-f-{audit,judge,learn,report,publish,questions,…}` present |
| MCP tools | `packages/mcp-server/manifest.json` | ✅ **20** declared (12 W32 + 16→20 W-Mega) |
| `mooter` on PATH | shell | ⚠️ resolves to the PS launcher in `frugal/`; worktree CLI not globally linked (Phase C runs via tsx) |

## Refutations (P1–P5)

### P1 — "Mac statusline issue is font rendering, not data" — **PARTIALLY TRUE · needs Mac smoke**
Two distinct effects, both real:
- **Rendering (TRUE):** emoji are 2-cell on macOS but counted as `.length` in the
  responsive chip-collapse + padding math → lines over-pack and wrap, and digest
  columns go ragged. Documented with line refs in `MAC_INCONSISTENCIES_RECON.md`
  (B1, B2, B4). This is rendering/width, font-adjacent — supports P1.
- **Data (the nuance):** several chips the brief thinks are "gone" (VRAM, user)
  are present in code but **gated on data that isn't populated on the Mac** (no
  GPU profile, no `auth.json`) — so they don't *show* there. That is a data gap,
  not a render bug.
Final confirmation requires a real Apple-Silicon screenshot → that is what Phase
A.2 `MAC_SMOKE_TEST.md` is for. CC has no Mac in this env.

### P2 — "Wave 53 dropped tier breakdown / VRAM / Ollama model / GPU mode / user" — **MOSTLY FALSE**
Verified against the live `statusline-multi.js` render (`--demo green`, line-3 forced):
| Claimed-dropped chip | Reality | Verdict |
|---|---|---|
| Tier breakdown granular (token counts) | `🪙 T0:0 tkns · T1:0 · T2:0 · T3:0` renders today | ✅ PRESENT |
| VRAM (RTX 4090) | `🎮 …VRAM` chip in code, gated on GPU profile | ✅ PRESENT (gated) |
| GPU mode (gpu-high) | `🔧 gpu-high · …` (`setup-status.js:34`) | ✅ PRESENT |
| User | `👤 user <hash8>` (`user-status.js`) — **opaque hash by Wave 33.8 privacy design** | ✅ PRESENT (hashed) |
| Ollama model name + quant | no statusline chip (only quant-advisor, separate) | ❌ genuinely absent |
| Embed model (nomic 768d) | `nomic-embed-text` used only by the tester, no chip | ❌ genuinely absent |
4 of 6 are present; only 2 are genuinely missing. **Restoring a cleartext
`paulo-XXXX` user label would REGRESS the Wave 33.8 privacy decision** — must not.
→ Phase B re-scoped: not "restore dropped chips" but **a mode selector + a dense
`extended` mode** that surfaces the existing (gated) chips opt-in, plus optionally
the two genuinely-missing ones. See REFUTATIONS_LOG.

### P3 — "Wave 54 CCA-F audit not yet run" — **TRUE**
`~/.mooter/fable-observe/audit/` is absent. Phase C ships setup + a **dry-run**;
the real 60q overnight run stays Paulo's (GPU + Claude Max quota). Phase C.4 chip
uses the honest `?` fallback until a real report exists.

### P4 — "mooter.ai landing stale (v1.21.5)" — **TRUE**
Landing serves `v1.21.5`. Brief lists landing copy refresh as **OUT OF SCOPE**
(Wave 33.7 enhance-in-place covered copy honesty), so this is a documented finding,
not a Phase D fix.

### P5 — "20 MCP tools accessible" — **TRUE (manifest-level)**
`packages/mcp-server/manifest.json` declares 20 tools. Runtime accessibility
(server up + client) is exercised by Phase D's MCP health smoke.

## Re-scope decisions

- **2/5 premises false-ish** (P2 mostly false, P1 partial) — below the 3/5
  wholesale-re-scope threshold. Only **Phase B** re-scopes (mode selector + dense
  `extended` mode, no privacy regression).
- **A.6 macOS-alignment fixes → DEFERRED to a focused Wave 55.1 patch.** They need
  a `string-width` dependency (the repo has none) + rewrite shared layout math +
  proper Mac visual verification — too risky to bundle blind here. This wave ships
  the **dependency-free** Mac wins in the kickoff's Phase A scope: the cross-platform
  doc (A.1), the Mac smoke-test doc (A.2), and the `MOOTER_GLYPH_MODE=ascii` glyph
  fallback (A.4). Full rationale + the deferred list logged in REFUTATIONS_LOG.md.

## Addendum phases already shipped this branch (context)
H (HOME-isolate render), G (bench RESULTS.json), J (burn-rate chip), I (LoRA
runbook augment), A.5/A.6 (MAC_INCONSISTENCIES_RECON) — all committed, tested,
`classify.js` sha intact throughout.
