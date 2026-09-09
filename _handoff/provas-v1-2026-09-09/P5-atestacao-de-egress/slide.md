# Slide P5 · No external destination recorded by a socket tap on 75 Node processes while the Mooter hook decided 20 real prompts — API key absent, live budget defect forced T0

**Setup:** 20 real September prompts (median 37 chars); the hook installed on this machine; a socket-level tap preloaded into Node processes. Pre-registered protocol committed before the first run; two instrument amendments on file (one retracts our own claim about the client); LiteLLM controls added after adversary round 1 are labelled as such.

| Path | Observation in this setup | Boundary observed |
|---|---|---|
| **Mooter hook** (rule + local pre-answer; no key, arbiter off, T0 ×20 by defect D1) | 35 connection events in 75 tapped Node processes, **all loopback** (own metrics port ×20, Ollama ×15); **no external destination recorded**; bytes n/d | tapped Node processes — not DNS, UDP, non-Node children, or Ollama's own egress; tap completeness not independently inventoried |
| Mooter hook, tap in block mode | 0 intercepted attempts to block; same T0 on 20/20 | block path not exercised in this run |
| **Mooter arbiter** (runs only with a key; 20 instrumented invocations with a fake key, nothing sent) | **20/20 constructed requests carried the whole prompt** (`messages[last].content == prompt`) addressed to api.anthropic.com, ~2.2 kB body | instrumented; no transmission observed; not all code paths |
| LiteLLM 1.100.0 proxy, cost-based routing, two loopback mock deployments | pre-registered run (cheap priced 0): 20/20 to the expensive one. Post-round-1 controls: prices swapped → 20/20 to the now-expensive one; cheap priced 1e-9 → 20/20 to the cheap one. **The zero-priced deployment was selected 0/40 times across the two zero-price configurations.** Forwards the full prompt to the chosen provider 20/20 | loopback mock; mechanism not confirmed in code; real Ollama not measured; the proxy's own external egress unmeasured |
| claude-code-router 3.0.22 | n/d — headless config not achieved in 60 min | — |
| Claude Code native (`claude -p`, hooks/tools off), **per CLI invocation through this proxy** | **4 hosts on 20/20** (api.anthropic.com, mcp-proxy.anthropic.com, registry.npmjs.org, Datadog log intake); counter-reported median **40.5 CONNECT** and **1.62 MB outbound** (1.60–1.64); Datadog intake traffic recorded in 20/20, median 187 kB; **13/20 returned `is_error`** (medians 1.62 MB vs 1.63 MB for the 7 without) | HTTPS CONNECT counter (async, one proxy per prompt; calibrated on known volumes); tunnel bytes, not prompt bytes; proxy-induced overhead vs direct traffic not compared |

**Local logs:** 752 matches of the home-path detector (contains the owner's name) and 1,390 lines with a `prompt_preview` field (up to 80 chars) in the router's own logs on this machine. Counted, not audited, not fixed.

**Printed losses:** the arbiter's constructed requests carry the raw prompt (20/20 instrumented); the T0 ×20 comes from a live budget-cap defect (D1), not from good routing; the redirect of the decisions log was ignored (D6); our first proxy probe was wrong and blamed the client (D8, retracted).

*Does not prove: device-level egress; that any external network was refused; SOC 2 / DPA / retention; behaviour with a real key on the network; proxies with real providers; that tunnel bytes are prompt bytes or what any tunnel carries; native traffic without a proxy; anything about claude-code-router. No comparison of a completed task with and without Mooter is made here.*
