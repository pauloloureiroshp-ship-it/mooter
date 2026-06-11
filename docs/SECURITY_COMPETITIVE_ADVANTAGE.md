# Security as a Competitive Advantage

> Wave Mega 50-51 (2.D). Companion to `mooter security summary` (one-screen CLI
> version) and `docs/` security material from Wave 33.5 (spawn sandbox).

## The problem with typical vibe-coding setups

The default vibe-coding loop in 2026 is: an LLM agent with your full shell, your
full `$HOME`, your API keys in the environment, and unrestricted network egress
— executing code it just wrote. Every popular "give the agent a terminal" setup
shares this shape. The blast radius of one bad generation, one prompt
injection, or one malicious dependency is your entire machine and every
credential on it.

That risk is not hypothetical. **Veracode's 2025 GenAI Code Security Report**
(research announced July 30, 2025) tested code produced by **more than 100
large language models across 80 curated coding tasks** and found that **GenAI
models introduced security vulnerabilities — including OWASP Top 10 flaws — in
45% of the code samples**. The report also found newer/larger models did *not*
produce meaningfully more secure code than smaller ones.

Sources (verified 2026-06-09):

- Veracode, *2025 GenAI Code Security Report* —
  <https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/>
- Veracode press release, "AI-Generated Code Poses Major Security Risks in
  Nearly Half of All Development Tasks" (Business Wire, 2025-07-30) —
  <https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals>

If roughly half of generated code carries a security flaw, the question is not
*whether* your agent will eventually produce something dangerous — it is what
happens to your machine when it does.

## What Mooter does differently

Mooter's spawn path (`mooter spawn`, Wave 33.5) was built sandbox-first: there
is **no unsandboxed mode**. If no sandbox backend is available, the
orchestrator refuses to spawn and tells you how to install one.

### Local-first

Most routed work (tier T0) runs on **local Ollama models** — the prompt, the
code, and the output never leave your machine. Cloud tiers (T1–T3, and T5
strictly via an explicit `@fable` opt-in) are used only when the task demands
them.

### 4-layer sandbox for spawned agents

Spawned local agents run under bubblewrap (Linux) / Seatbelt (macOS) with:

1. **Network egress** — `--unshare-net`: a spawned agent cannot exfiltrate
   anything, because it has no network at all.
2. **Filesystem boundary** — read-only root plus exactly one writable worktree
   mount; `$HOME` is masked with a tmpfs, so `~/.claude/.credentials.json` and
   friends are simply not there.
3. **Secrets scoping** — provider API keys are stripped from the local spawn
   environment.
4. **Config protection** — Claude/Mooter configuration stays read-only inside
   the sandbox.

And it is verifiable, not asserted: `mooter security audit` checks each layer's
enforceability on your host, and `mooter security spawn-test` runs a real
synthetic sandbox-escape attempt (modeled on CVE-2025-59528) and reports the
verdict.

## Honest limits — what this does NOT solve

A security pitch that hides its limits is marketing, not security:

- **Your main Claude Code session is not sandboxed.** The 4 layers apply to
  `mooter spawn` local agents, not to the interactive session driving them.
- **Cloud calls still leave your machine.** T1–T3/T5 send your prompt and
  context to the provider. Local-first reduces how often that happens; it does
  not change what a cloud call is.
- **Generated code you accept and run yourself** executes with your privileges,
  outside any sandbox. The Veracode 45% figure is exactly why review gates
  (e.g. `final-reviewer` before push/merge) matter regardless of sandboxing.
- Kernel/host escape vulnerabilities, prompt injection inside your own session,
  and supply-chain risk in your dependencies remain out of scope.

## The competitive position in one line

Typical setups give an agent that is statistically certain to eventually write
vulnerable code a full-trust shell; Mooter gives it a no-network, masked-HOME,
key-stripped, read-only cage — locally, by default, and with a test you can run
yourself.
