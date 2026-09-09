# Slide P5 · No external destination recorded by the Node-process tap while the Mooter hook decided 20 real prompts — API key absent, live budget defect forced T0

**Setup:** 20 real September prompts (median 38 chars); the hook installed on this machine; every Node process under a socket-level tap. Pre-registered protocol committed before the first run; two instrument amendments on file (one retracts our own claim).

| Path | Observation in this setup | Boundary observed |
|---|---|---|
| **Mooter hook** (rule + local pre-answer; no key, arbiter off, T0 ×20 by defect D1) | 35 connections in 75 Node processes, **all loopback** (own metrics port ×20, Ollama ×15); **0 external destinations recorded**; bytes n/d | Node processes only — not DNS, UDP, non-Node children, or Ollama's own egress |
| Mooter hook, tap in block mode | 0 intercepted attempts to block; same T0 on 20/20 | block path not exercised in this run |
| **Mooter arbiter** (runs only with a key; here captured, nothing sent) | **20/20 constructed requests carry the whole prompt** (`messages[last].content == prompt`) addressed to api.anthropic.com, ~2.2 kB body | instrumented; no transmission observed |
| LiteLLM 1.100.0 proxy, cost-based routing, two loopback mock deployments | cheap priced **0** → 20/20 to the expensive one; prices swapped → 20/20 to the now-expensive one; cheap priced **1e-9** → 20/20 to the cheap one. **A $0 deployment is never chosen.** Forwards the full prompt to the chosen provider 20/20 | loopback mock; the proxy's own external egress unmeasured |
| claude-code-router 3.0.22 | n/d — headless config not achieved in 60 min | — |
| Claude Code native (`claude -p`, hooks/tools off) | **4 hosts on 20/20 prompts** (api.anthropic.com, mcp-proxy.anthropic.com, registry.npmjs.org, Datadog log intake); median **41 TLS tunnels** and **1.62 MB out per prompt** (1.60–1.64), of which **187 kB to Datadog** on every prompt | HTTPS CONNECT counter (async, one proxy per prompt); tunnel bytes, not prompt bytes |

**Local logs:** 752 matches of the home-path detector (contains the owner's name) and 1,390 lines with an 80-char raw prompt preview in the router's own logs on this machine. Counted, not audited, not fixed.

**Printed losses:** the arbiter builds a request with the raw prompt whenever it runs; the T0 ×20 comes from a live budget-cap defect (D1), not from good routing; the redirect of the decisions log was ignored (D6); our first proxy probe was wrong and blamed the client (D8, retracted).

*Does not prove: device-level egress; that "all external network" was refused; SOC 2 / DPA / retention; behaviour with a real key on the network; proxies with real providers; that tunnel bytes are prompt bytes; anything about claude-code-router.*
