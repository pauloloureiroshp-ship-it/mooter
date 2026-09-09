# Slide P5 · To decide where a prompt goes, the Mooter hook contacted 0 external hosts on 20 real prompts — measured at the socket

**Setup:** 20 real September prompts; the hook installed on this machine (no API key, arbiter in its default state); every Node process under a socket-level tap plus an HTTPS CONNECT counter. Pre-registered protocol committed before the first run.

| Path | External connections to decide | Does the raw prompt leave? | How observed |
|---|---|---|---|
| **Mooter hook** (rule, local pre-answer) | **0** — 35 connections in 75 processes, all loopback (own metrics port ×20, Ollama ×15) | No | socket tap + proxy counter |
| Mooter hook, **all external network refused** | 0 blocked (nothing was attempted); **same tier on 20/20** | No | socket tap, block mode |
| **Mooter arbiter** (only runs with an API key; here: fake key, request captured, nothing sent) | would open 1 per prompt to api.anthropic.com | **Yes — the whole prompt, 20/20**, ~2.2 kB body | instrumented, not network-observed |
| LiteLLM 1.100.0 proxy, cost-based routing, two loopback mock providers | decides locally; forwards 100 % | **Yes, 20/20** — and it picked the *expensive* deployment 20/20 (both price-config forms tried) | loopback mock counts bodies |
| claude-code-router 3.0.22 | n/d — headless config not achieved in 60 min (UI/SQLite + undocumented authenticated RPC) | n/d | blocker on file |
| Claude Code native (`claude -p`, hooks/tools off) | **2 per prompt, 20/20** (api.anthropic.com + one GCP address) | Yes, by design (host reports input tokens 20/20) | `netstat` sampled every 150 ms; bytes n/d (`claude.exe` ignores `HTTPS_PROXY`) |

**Local logs are not clean:** 752 home-path-with-owner-name instances and 1,390 lines with 80-char raw prompt previews in the router's own logs on this machine. Counted, not fixed.

**Printed losses:** the arbiter ships the raw prompt whenever it runs; the tier was T0 on 20/20 because of a live budget-cap defect (D1), not because of good routing; the redirect of the decisions log was ignored (D6).

*Does not prove: "private" or "secure" (words not allowed); SOC 2/DPA/retention; behaviour with a real key and the arbiter on the network; proxies with real providers; native byte counts; anything about claude-code-router.*
