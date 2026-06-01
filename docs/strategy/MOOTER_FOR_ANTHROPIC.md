# Mooter — why Anthropic should care

*A one-pager for Anthropic DevRel. v1.1.0 · 2026-06-01 · MIT · github.com/pauloloureiroshp-ship-it/mooter*

---

**Mooter is the open-source LLM router that lives *inside* Claude Code.** It teaches Claude Code itself when to use local Ollama vs Haiku / Sonnet / Opus — per prompt, with a reason — so power users stop burning Opus on `sed`-tier work. No proxy, no extra bill, and if Mooter dies Claude Code still works (zero blast radius).

## The one reason that matters: it *amplifies* the Max plan

The failure mode Anthropic should worry about isn't users spending too little — it's **bill anxiety driving Max users to churn or self-throttle**. Mooter turns that anxiety into a dashboard they're proud of: trivial tasks go local ($0), the hard ones go to Opus *consciously*. Happy, in-control users keep their Max subscription and use it more, not less. **Win-win.**

## What makes it defensible (and hard to fake)

- **Native, not a proxy.** A regex hook (<50 ms, $0) emits a `<router-hint>`; a doctrine file teaches the session how to act; native subagents do the work. Nothing sits between the user and Anthropic.
- **Local-first.** Ollama-aware; T0/T1 deflect to local hardware. Cloud tiers are for when they earn it.
- **Two-axis routing.** Not just *which model* (complexity → tier) but *which tools* (domain → "Moo Packs": skills + MCPs + scaffold). 
- **Honest by design.** Verifiable quant numbers (`Q4_K_M −72% size · ~99% quality`), `adapter ◌ baseline` until a real LoRA is installed, safety boosts that *show their reason*, masked PII + audited admin. No hype telemetry.

## Proof it's real (not a deck)

- Router engine validated: **~90% cost reduction on 1,437 real prompts**; classifier p99 **3.74 ms**.
- Shipped end-to-end: web onboarding, personalized `curl mooter.ai/i/<token>` install, Adapter Forge (bring-your-own-LoRA, validated + benchmarked), admin + feedback, and a **fresh-install path proven in a clean container** (`mooter feedback`/`forge`/`pack` all work on `install.sh`).
- Disciplined: every wave gated by an independent reviewer; 8 consecutive recons caught real drift before it shipped.

## Honest framing (no unicorn)

Realistic TAM: **5–15% of Claude Code Max/Team users** — the power slice that feels the bill. Auto-trained local LoRAs (Docker) and hub analytics are roadmap, not claims. Numbers above 90% you see in blogs are not what we promise.

## The roadmap that's interesting to Anthropic

**Multi-agent local (Wave 7+):** Dynamic Workflows backed by *local* LoRAs ≈ **$0 per workflow** vs an Opus fan-out — making heavy agentic workflows economically routine for Max users, on Anthropic's own client.

## The ask

30 minutes + intros to a handful of power users for a 1-week validation (NPS + real savings numbers). In return: a transparent look at how Mooter makes Claude Code stickier and Max spending feel *earned*.

— Paulo Loureiro · paulo@mooter.ai
