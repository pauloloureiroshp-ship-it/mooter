# First Magic cockpit + statusline (FASE 4)

One view-model, two renderers, all fed from REAL sources (never fabricated; missing → `—`).

## Pieces
- `cockpit-feed.js` — `buildFeed(opts)` aggregates the real sources into one view-model:
  `~/.mooter/workflows/active-run.json` (run pointer — the cockpit lights up on it),
  `~/.mooter/spawns/<id>/state.json` (agent lanes), `decisions.log` (FASE 1 `risk_blocked`
  count), `~/.mooter/verify-last.json` (FASE 2 verdict), injected run savings (FASE 3
  `run-savings`, or the :7821 tracker), and `local-fleet` (HW-aware Moo cap). Any field with
  no real data is `null` → renders `—`. `writeActiveRun()/clearActiveRun()` manage the pointer.
- `statusline-firstmagic.js` — `render6Seg(feed)`:
  `🐮 maestro:Sonnet · 🦙×N (cap M) · ⚠️risk:K · $X (−Y% vs Opus) · verify:🟢 · run:Ts`.
- `cockpit-live.js` — `renderCockpit(feed)`: the terminal "Agents-live" swimlane (one lane
  per agent, 🦙 local / ✨ Claude badge, status, tokens/$ when real). The VSCode cockpit
  (`mooter-cockpit` vsix) consumes the same `buildFeed` JSON.

## It lights up by itself
The cockpit/statusline poll `buildFeed()`. While `~/.mooter/workflows/active-run.json` is
absent or stale (>5 min) the feed is `active:false` → "idle". A run calls `writeActiveRun(...)`
(e.g. at SubagentStart fan-out) and the cockpit comes alive; `clearActiveRun()` on completion.

## Honesty (Doctrine, user-reinforced)
- Savings come from REAL MIXED runs (local + Claude), e.g. the :7821 tracker /summary
  (`Real (est)` vs `Naive Opus` → −%), **not** the 100%-local cost-plane demo. No tracker /
  no run tokens → savings `—`, never a fabricated number.
- The Moo count is HW-aware (`local-fleet`, ≈2 on an 8GB M3) — never inflated to a slide number.
- The risk chip is the FASE 1 `risk_blocked` count; verify is the FASE 2 verdict; a lane
  with no token data shows `—`.

## See it (real mixed data)
```sh
cd tools/router
node cockpit-demo.js          # real local Moos + real mixed-session savings + F1 risk chip
node statusline-firstmagic.js # 6-seg from the live feed
node cockpit-live.js          # terminal swimlane from the live feed
node --test cockpit-feed.test.js
```
