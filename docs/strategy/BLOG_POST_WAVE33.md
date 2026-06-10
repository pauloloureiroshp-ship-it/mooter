# Mooter v1.21: 3-bit KV cache, speculative decoding, and a router that hasn't changed in 12 releases

Over 658 real routed calls across my own development sessions, Mooter saved 47% of what I would have spent sending every prompt straight to Opus. That number isn't from a synthetic benchmark — it's the running total the statusline shows me every day. The more interesting number, though, is zero: the number of times `classify.js` has been touched since v1.9.

That file is the core of the whole thing. It reads a prompt, looks at signals — task type, blast radius, file scope, explicit model pins — and decides which tier handles it: local Ollama, Haiku, Sonnet, or Opus. It has been byte-identical for twelve consecutive releases. Not because the project stagnated, but because getting the routing logic right and then *not breaking it* is the actual product.

Wave 33 ships three experimental backends, a handful of quality-of-life features, and a GDPR layer. None of it touches the classifier.

---

## TurboQuant: 3-bit KV cache, honest about what that means

The most technically interesting addition is TurboQuant, an opt-in backend that applies 3-bit KV-cache quantization to local inference. The underlying method comes from Google DeepMind's work presented at ICLR 2026 (arXiv:2504.19874). Depending on model architecture, it reduces KV-cache memory by 3.6× to 5.2×. On a machine where you're running a 34B model and memory is the bottleneck, that can mean the difference between the model fitting at all and swapping to disk.

I want to be direct about what this ships as: an experimental, build-from-source backend. The PR that implemented this for mainline llama.cpp was rejected upstream. That means you have to compile a patched fork, enable the flag in your Mooter preferences, and accept that this code path has seen less production hardening than the default inference stack. The default backend is unchanged. If you don't explicitly opt in, you never touch this.

The reason I'm shipping it anyway, gated behind an explicit flag, is that for developers who have the hardware and are willing to build from source, the memory headroom is real and the alternative is not using the model at all. Honest opt-in beats honest omission.

---

## EAGLE-3 speculative decoding via vLLM

Speculative decoding runs a small draft model in parallel with the main model to predict multiple tokens ahead, then verifies them in a single forward pass. EAGLE-3, integrated through vLLM, delivers roughly 2–2.5× throughput improvement on generation-heavy workloads. That matters specifically for the T2 and T3 tiers, where you're getting back a multi-paragraph technical plan and latency compounds.

The guardrails here are straightforward. It requires a GPU with enough VRAM headroom for both the draft and main model simultaneously. If the check fails at startup, Mooter falls back to standard inference silently — no crash, no degraded output, just no speed improvement. Cloud API calls (Haiku, Sonnet, Opus direct) are never affected. This is opt-in and GPU-gated, and the graceful fallback path is tested.

---

## MiniMax M3: a watcher, not a claim

MiniMax M3 weights are not out yet as of this writing. Expected release window is around June 10–11, 2026, based on the model's public roadmap. Wave 33 ships a watcher script that polls for the release and runs the install pipeline automatically the day the weights drop. When they're available, it slots in as a new local tier candidate with a benchmark-gated trust score.

I'm mentioning this here because it's part of the release, not because it's usable today. If you run `mooter sessions list` after installing v1.21 and see MiniMax M3 in the adapter list, something has gone wrong with my release notes. It will appear when the weights are public and the benchmarks pass.

---

## The quieter wins

A few additions that aren't experimental: the session timer now tracks wall-clock time per routing decision and surfaces it in `mooter sessions list`, which gives you a legible history of what ran where and when. The statusline ships with four display modes — default is unchanged, opt-in modes add token counts, cost deltas, and a compact single-chip view.

The GDPR data rights layer adds export (redacted), delete-all, and a `/v1/forget-me` endpoint on the hub. If you're using the cloud sync feature, your routing history is yours to pull or purge. This should have shipped earlier.

The arbitrage monitor deserves a specific note on what it does *not* do. It reads public status pages from model providers — latency warnings, degraded service notices — and surfaces them as informational chips in the statusline. It does not override routing decisions. The tier floor set by the classifier is immutable from the arbitrage layer. If classify.js says T3, the monitor showing "Opus degraded, p99 +800ms" is information, not an instruction to route to Sonnet instead.

---

## The doctrine in practice

Every cloud-touching feature in this release — TurboQuant's vLLM backend, EAGLE-3, the hub sync, the arbitrage monitor — is off by default. The local-first routing path with the frozen classifier is what runs unless you explicitly enable something else.

This is deliberate. The 47% savings figure is real because the tier floors hold. The moment a cost-optimization layer can override a safety or quality boundary, the whole trust model collapses and you get unpredictable behavior at the worst moments. The guardrails aren't a limitation to work around — they're the thing that makes the savings number trustworthy.

I build with this tool running in every Claude Code session. The classifier sha hasn't changed. The default output hasn't changed. What's new is optional, documented, and honest about its constraints.

If you want to try it: `mooter.ai`.
