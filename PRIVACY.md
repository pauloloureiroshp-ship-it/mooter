# Privacy Policy for frugal

**Short version**: your prompts never leave your machine. The only thing frugal ever sends anywhere is anonymous, aggregated statistics — and you can turn that off with one step.

---

## 1. What stays on your machine (never leaves)

| File / Data | What it contains | Leaves your machine? |
|---|---|---|
| `decisions.log` | First 80 chars of each prompt + classification metadata | Never |
| Your prompts | The actual text you type to Claude | Never |
| Your API keys | Anthropic key, Ollama config, etc. | Never |
| `hw-capability.json` | Your hardware profile (CPU, GPU, VRAM) | Never |
| `subscription-profile.json` | Your Anthropic plan tier | Never |
| Absolute file paths | Any paths that appear in router hints | Never |

`decisions.log` is read locally by `backtest.js` to tune the classifier. It is never uploaded anywhere.

---

## 2. What is sent to frugal-hub (anonymous)

When `hub-push.js` runs (only during a backtest), it sends a small delta to `POST /api/delta`. Here is the **complete list** of what that delta contains:

- `frugal_version` — which version of frugal you are running
- `classifier_version` — which classifier version is active
- `generated_at` — timestamp of when the delta was generated
- `instance_id` — a one-way crypto hash; not linked to you, your machine name, or your account
- `hardware_tier` — one of: `gpu_high`, `gpu_mid`, `cpu_only`
- `vram_mb` — how much VRAM your GPU has (e.g., `8192`)
- `tier_distribution` — aggregated counts of how often each routing tier was used (T0/T1/T2/T3)
- `keyword_signals` — generic keywords extracted from prompts (e.g., `"bug"`, `"debug"`, `"trace"`) — **not** the prompts themselves
- `has_file_refs` — boolean: did any prompt reference a file?
- `has_code_block` — boolean: did any prompt contain a code block?
- `session_hour` — the hour of day (0–23) when sessions happened, not a full timestamp
- `sub_profile` — your Anthropic plan type (e.g., `pro`, `team`)

All buckets require a minimum of **3 occurrences** before they are included. Single-use patterns are dropped entirely.

This data helps improve frugal's routing classifier for everyone. It tells us things like "users with 8 GB GPUs send 40% of tasks to T1" — never *what* those tasks were.

---

## 3. What is NOT sent

To be explicit about what is excluded:

- Your prompt text, even partially
- `prompt_preview` from `decisions.log`
- Your name, username, hostname, or email
- Absolute file paths
- API keys or tokens
- Your git history, project names, or repository contents
- Any output from Claude

---

## 4. How to disable telemetry

You have full control. Any of these options works:

**Option A — delete the push script**
```bash
rm ~/.claude/tools/router/hub-push.js
```

**Option B — point it at nowhere**
```bash
export FRUGAL_HUB_URL=http://localhost:0
```
Add that line to your shell profile to make it permanent.

**Option C — just never run it**
`hub-push.js` only runs during `backtest.js`. If you never run a backtest, nothing is ever sent. The classifier still works locally — the hub push is purely for contributing back to the shared model.

After disabling, frugal continues to work exactly the same. The local classifier, routing, and all cost savings are entirely independent of the hub.

---

## 5. Who controls this

frugal is a personal open-source project by Paulo Loureiro. There is no company, no VC, no ad model.

- The hub endpoint is `https://frugal-hub.frugal-hub.workers.dev/api/delta` (or self-hosted if you configure `FRUGAL_HUB_URL`)
- The code that builds the delta is in `tools/router/backtest.js` — you can read every line of what gets sent before it leaves
- The code that sends it is in `tools/router/hub-push.js` — equally readable

Questions, concerns, or requests to delete your instance's historical data:

**paulo.loureiro.shp@gmail.com**

Since `instance_id` is a hash with no link to your identity, deletion requires you to provide the hash from your local `backtest-delta.json`. I will delete it promptly.

---

*Last updated: April 2026*
