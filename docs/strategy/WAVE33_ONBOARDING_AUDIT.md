# Wave 33 — Onboarding Audit (code-based)

> **Limitation:** This audit is code-only. No live browser was available.
> The web onboarding flow (`/onboarding`) was read from source; visual rendering,
> real API responses (install token, CLI token, hardware probe), and
> mobile/narrow-terminal behaviour were NOT verified live.

---

## TL;DR (3 lines)

1. The `mooter init` wizard exits with a `mooter sync` nudge but **never tells the user about `/moo-help`, `mooter explain statusline`, or `mooter sessions list`** — the three most discoverable entry-points to Wave 33 features.
2. The web `/onboarding` flow (3 steps) and `/install` page **say nothing about slash commands or skills**, so a friend who installs via the web has zero guided path to `/moo-*`.
3. `mooter --help` lists **48 commands** with no grouping, no "start here" marker, and no separation of stable vs experimental (TurboQuant, MiniMax M3, EAGLE-3) — a first-time user faces a wall.

---

## Findings + Fixes (prioritized, highest friction first)

---

### FIX-1 · `mooter init` completion message teaches nothing

**What's wrong:**
`init.ts:761-769` prints two lines after setup completes:

```
✓ mooter is configured. Run `mooter pack list` to see installed packs.

Next step → populate your dashboard:
  Run `mooter sync` after your next Claude Code session …
```

There is no mention of:
- `mooter explain statusline` (explains every chip, including the new Wave 33 session timer and `--preview` mode)
- `/moo-help` (the in-chat command menu)
- `mooter sessions list` (the most immediately useful Wave 33 command after a first session)
- How to open the dashboard TUI

A new friend runs `mooter init`, sees "mooter is configured", and has no idea what to do next in Claude Code.

**Where:** `/mnt/c/Users/Paulo Loureiro/frugal/packages/cli/src/commands/init.ts` lines 761–769

**Suggested fix (effort: S — edit 1 function, ~10 lines):**

Replace the two closing `io.print` lines with:

```typescript
io.print("\n✓ mooter is configured.");
io.print("\nQuick start:");
io.print("  1. Open Claude Code in any project — mooter runs automatically.");
io.print("  2. Type /moo-help in Claude Code to see the command menu.");
io.print("  3. After your session, run `mooter sessions list` to see savings.");
io.print("  4. Run `mooter explain statusline` to learn what each chip means.");
io.print("\nOptional: `mooter sync` pushes aggregated stats to mooter.ai/dashboard.");
```

---

### FIX-2 · Web `/onboarding` step 3 gives no "what to do next in Claude Code"

**What's wrong:**
`landing/app/onboarding/page.tsx` step 3 (lines 709–933) shows a config summary table,
optionally an install token, optionally a CLI token, and a "Go to dashboard" button.
There is zero mention of:
- `/moo-help` or any slash command
- `mooter explain statusline`
- The fact that mooter is a Claude Code hook (new friends who installed from the web may not know what to do after running the install command)

The "Go to dashboard" CTA sends users to `/dashboard`, which is empty until they run
`mooter sync`. The empty dashboard without context is a likely bounce/confusion point.

**Where:** `/mnt/c/Users/Paulo Loureiro/frugal/landing/app/onboarding/page.tsx` lines 709–932 (step 3 JSX)

**Suggested fix (effort: S — add a prose block before the "Go to dashboard" button):**

Add a "What happens next" 3-step list above the CTA:

```
1. Run the install command above
2. Open Claude Code → type /moo-help to see the menu
3. After your first session → run `mooter sessions list` to see savings
```

Note: cannot verify the current visual state of the dashboard empty-state without a live browser.

---

### FIX-3 · `mooter --help` wall-of-text with no stable/experimental separation

**What's wrong:**
`index.ts:50–95` defines `TOP_USAGE` with 48 command lines, flat, unsorted.
A new user sees:

```
mooter turboquant [status|build [--run]|enable|disable]   opt-in 3-bit KV cache (EXPERIMENTAL, build-from-source)
mooter minimax-m3 [check|status|install [--run]]   watch + install MiniMax M3 weights when released
mooter monitor [providers|status|enable|disable]   opt-in arbitrage monitor (public status pages; advisory only)
```

These appear at the same visual weight as `mooter init` and `mooter explain`. For a
first-time user who has just run `mooter init`, "build-from-source 3-bit KV cache" and
"MiniMax M3 weights when released" are noise that obscures the three commands they
actually need: `mooter explain statusline`, `mooter sessions list`, `mooter status`.

There is also no "# Start here" section heading in the help text.

**Where:** `/mnt/c/Users/Paulo Loureiro/frugal/packages/cli/src/index.ts` lines 50–95 (`TOP_USAGE` constant)

**Suggested fix (effort: M — restructure the string, ~20 lines):**

Add section headers inside the usage string:

```
## Start here
  mooter init                      onboarding wizard
  mooter explain [statusline]      learn what each chip means
  mooter sessions list             past sessions: savings · tier mix
  mooter status [--didactic]       live state snapshot

## Daily use
  mooter statusline mode <…>       pin statusline layout (or --preview)
  mooter effort [set <…>|show]     dial frugality (low → ultramoo)
  … (remaining stable commands)

## Experimental / opt-in
  mooter turboquant …              3-bit KV cache (build-from-source)
  mooter minimax-m3 …              MiniMax M3 weight watcher
  mooter backend …                 vLLM / EAGLE-3 (opt-in)
  mooter monitor …                 arbitrage monitor (advisory)
```

---

### FIX-4 · `mooter explain statusline` does not cover Wave 33 commands

**What's wrong:**
`explain.ts` STATUSLINE_GUIDE (lines 10–50) documents the statusline chips well,
including the session timer (line 32) and `--preview` mode (line 46). However it
does not mention:
- `mooter sessions list` (new Wave 33 command, most useful for friends)
- `mooter pricing-update` (Wave 33, relevant when price changes)
- The new `legacy` alias for `auto` mode

The guide also only accepts `statusline` as a topic (line 53) with no path to
`mooter explain sessions` or `mooter explain backends`. First-time users typing
`mooter explain` with no arg get the statusline guide, which is correct, but
`mooter explain sessions` returns an error.

**Where:** `/mnt/c/Users/Paulo Loureiro/frugal/packages/cli/src/commands/explain.ts` lines 10–57

**Suggested fix (effort: S — append ~8 lines to STATUSLINE_GUIDE + add `sessions` topic):**

Append to STATUSLINE_GUIDE:

```
Related commands (Wave 33):
  mooter sessions list [--limit N]  history of Claude Code sessions: age · savings
  mooter pricing-update [--show]    refresh local pricing cache from the hub
  mooter statusline mode legacy     alias for auto (byte-identical default layout)
```

And extend `runExplain` to accept `"sessions"` as a topic with a 3-line summary.

---

### FIX-5 · `/install` page has no post-install "what to do next" block

**What's wrong:**
`landing/app/(marketing)/install/page.tsx` (lines 17–50) shows the install command,
three feature cards (hardware probe, subscription mapping, pack recommendations),
and an illustrative terminal snippet. It ends there.

There is no "after you install, do this" block. A user who lands on `/install` directly
(via the hero CTA "Install mooter") runs the curl command, sees `mooter init` complete,
and has no guidance on the next step.

Note: `/setup` redirects to `/install` (setup/page.tsx line 6), so any setup link also
lands here with the same gap.

**Where:** `/mnt/c/Users/Paulo Loureiro/frugal/landing/app/(marketing)/install/page.tsx` lines 40–50

**Suggested fix (effort: XS — add 1 prose block below the terminal mock, ~15 lines):**

Add a "Then" section:

```
Then open Claude Code and type /moo-help. That's the full menu.
Or run `mooter explain statusline` in your terminal to learn what each chip means.
```

A two-liner is enough — the goal is one clear next action, not a tutorial.

---

## What was NOT verified (live browser required)

- Visual rendering of `/onboarding` step 3 with and without a valid `installToken`
  (the token is minted via `/api/install-token`; cannot verify it succeeds in prod)
- Whether `/install` redirects are correct in the deployed Vercel build
- Mobile layout of the onboarding page (narrow terminal GPU chip — mentioned in Wave 33 scope — not visible in source)
- Whether `mooter sessions list` actually outputs usable data after a first real session
  (command source exists at `packages/cli/src/commands/sessions.ts` but not audited for output quality)
- Whether the `/moo-*` skills are installed in new users' `.claude/skills/` by the installer script
  (installer script at `https://mooter.ai/install.sh` was not available for static analysis)
