# Wave 8 — Install Reliability (CLI bundle + ship the v1.0 CLI)

> **Status**: KICKOFF / not started. Recon-first (lição 7×). Paulo decides if/when to run.
>
> **Naming note (resolved 2026-06-01)**: this IS **Wave 8 — Install Reliability**. The Codex CLI wave (previously informal "Wave 8 — por último") was renumbered to **Wave 10 (future)** to avoid the collision.

---

## 0. Why this exists (the finding)

A fresh install via `install.sh` ships the **wrong, old CLI**. Concretely:

| | Old CLI (shipped) | v1.0 CLI (NOT shipped) |
|---|---|---|
| Path | `tools/cli/` (plain `.js`, frugal-era, Apr 19) | `packages/cli/src/` (`.ts`, run via tsx) |
| install.sh | `cp -R tools/cli/* → ~/.mooter/cli/` (line 147); shim `exec node ~/.mooter/cli/mooter.js` (line 174) | **never bundled, never copied** |
| Commands | `doctor · init · dashboard · update · uninstall` | `init · login · feedback · forge · adapter · trail · quiet · explain · pack · sync · hub · init --from-token` |

**Impact:**
- `mooter feedback`, `mooter forge`, `mooter login`, `mooter init --from-token`, `mooter adapter`, `mooter trail` — every v1.0 command the demo, smoke test, and **VALIDATION_PLAN** rely on — **do not exist on a real install**.
- The 5 external testers would install via `mooter.ai/onboarding → install.sh` and get a CLI **without `mooter feedback`** — the exact command the validation asks them to use.
- It "works on the dev machine" only because dev invokes `packages/cli` via `tsx`/`npm link`-equivalent, masking the gap.

This is **Case B (real gap)** per the triage: `mooter.js` exists and is shipped, but it is the *legacy* CLI; the v1.0 CLI has **no build or ship path**.

## 1. Invariantes (when implemented)
- ❌ classify.js / safety_boost / adapter_selection / glyphs / hub byte-identical (this is packaging, not routing logic).
- ❌ No new *runtime* deps in the shipped bundle — prefer a **zero-runtime-dep** esbuild bundle (tsx is a dev/test tool, not shippable).
- ❌ Don't break the existing tsx dev/test flow (`npm test` stays `tsx --test`).
- ✅ Final-reviewer T3-gate (touches install.sh + CI + packaging — release-critical).
- ✅ A fresh install must expose the v1.0 commands; `mooter feedback`/`forge`/`login` must run.

## 2. Recon OBRIGATÓRIO (before any code)
```bash
# Confirm the two-CLI split + that nothing bundles packages/cli
grep -n "tools/cli\|packages/cli\|mooter.js\|cp -R" install.sh
ls tools/cli/ packages/cli/src/commands/
grep -n '"build"\|esbuild\|tsup' packages/cli/package.json   # expect: none
# Is tools/cli still referenced anywhere else (hooks, statusline)?
grep -rn "tools/cli" --include=*.sh --include=*.js --include=*.ts . | grep -v node_modules
# Does anything import across the two CLIs? (shared lib/ divergence)
diff <(ls tools/cli/lib) <(ls packages/cli/lib 2>/dev/null) || true
# Signed-tarball intent already in install.sh?
grep -n "signed tarball\|release\|tar" install.sh
```
**Report findings to Paulo before implementing.** Open questions to resolve in recon:
- Is `tools/cli/` still needed for anything (installer-only commands `update`/`uninstall`/`doctor`)? If yes, those must be merged into / preserved by the v1.0 CLI or kept as a thin installer shim.
- ESM vs CJS: `packages/cli` is `"type": "module"` + `.ts`. esbuild must emit a node-runnable bundle (CJS or ESM with a correct shebang).

## 3. Proposed plan (4 steps — confirm after recon)

### Step 1 — Build script in `packages/cli/package.json`
```jsonc
"scripts": {
  "build": "esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/mooter.js --banner:js='#!/usr/bin/env node'",
  "test": "tsx --test tests/*.test.ts"   // unchanged
}
```
- esbuild as a **devDependency** only (not shipped). Bundle is self-contained → `node dist/mooter.js` works with zero runtime deps.
- Verify all dynamic `require`/import paths (commands, packs dir, `~/.mooter` paths) resolve when bundled (esp. `defaultPacksDir()` and any `__dirname`-relative reads — these are the usual bundle breakers).

### Step 2 — `install.sh` ships the v1.0 bundle
Two options (recon decides):
- **(a) Build-on-install**: `npm ci && npm run build` in `packages/cli`, copy `dist/mooter.js` → `~/.mooter/cli/`. Simple, but needs Node+npm on the user box and a network install.
- **(b) Prebuilt release artifact** (preferred for friends-beta → public): CI builds + attaches `mooter-cli-vX.Y.Z.tar.gz` to a GitHub Release; install.sh `curl`s + verifies a checksum/signature (install.sh line 81 already promises "v1.0 ships with signed tarballs"). No build toolchain on the user box.
- Either way: retire or repurpose `tools/cli/` (keep only installer-only commands if still needed, or fold them into the v1.0 CLI).

### Step 3 — CI gate
`.github/workflows/test.yml` (or a new `release.yml`): after build, assert `dist/mooter.js` exists and a smoke runs — e.g. `node dist/mooter.js --version` and `node dist/mooter.js feedback "x"` exits 1 with "Run mooter login first" (proves dispatch + a v1.0 command is present). Fail the build if the bundle is missing or the old command set is detected.

### Step 4 — Versioned release artifact
Tag-triggered GitHub Release with the signed tarball + checksum, matching `v1.0.0`. Document the channel (stable/beta) the installer pulls.

## 4. Scope estimate
- **S–M**. Mostly packaging: 1 build script + esbuild devDep, install.sh edit (~20 lines), 1 CI job, 1 release workflow. The risk is in **bundle correctness** (dynamic requires / path resolution / ESM-CJS) — budget time for a fresh-container smoke (Docker) to catch `__dirname`/packs-dir breakage that won't show in dev.
- **No routing-logic changes.** Pure delivery reliability.

## 5. Acceptance
```bash
# In a clean container (no repo on PATH, no tsx):
bash install.sh           # or the release one-liner
mooter --version          # works
mooter feedback "x"       # → "Run mooter login first" (v1.0 command present!)
mooter forge --help       # exists
```

## 6. Final-reviewer + merge
Gated PR, final-reviewer T3 (install.sh + CI + packaging = release-critical). **No auto-merge** — Paulo approves (release decision, like v1.0.0).
