# vLLM Backend & Multi-LoRA (Wave 32)

An **opt-in** high-throughput local serving backend. The default is **always
Ollama** — vibe coders on Apple M-series or no-GPU machines are never excluded.
vLLM is only used when it is both installed **and** reachable; otherwise everything
falls back to Ollama silently (doctrine #9).

## Why vLLM

vLLM offers ~16× concurrent throughput vs Ollama on an NVIDIA GPU and can serve
**many LoRA adapters off one base model concurrently**, swapping per request in
<10 ms (a pointer change, not a reload). That makes Multi-LoRA serving practical.

## Install / manage

```bash
mooter backend status                 # active backend (Ollama default · vLLM optional)
mooter backend install vllm [--run]   # detect prereqs + plan/install in .venv-vllm
mooter backend uninstall vllm         # remove the venv + disable vLLM
```

`install` **detects prerequisites** (NVIDIA GPU via `nvidia-smi`, `python3`,
`pip`). If anything is missing it **refuses gracefully** and stays on Ollama —
no half-install. With prereqs present it prints the exact plan (dry-run); add
`--run` to execute:

```
python3 -m venv .venv-vllm
.venv-vllm/bin/pip install --upgrade pip
.venv-vllm/bin/pip install vllm
.venv-vllm/bin/python -m vllm.entrypoints.openai.api_server --port 8000 --enable-lora
```

The OpenAI-compatible server listens on `:8000`. `mooter backend status` health-
checks `/v1/models`.

## Multi-LoRA serving

`MultiLoraServer` (in `@mooter/vllm-backend`) maps the **6 Wave 31 per-task
adapters** from the synthesis registry into concurrently-resident vLLM LoRA
modules. Per request:

1. The **Wave 31 LORAUTER** (`routeRequest`) picks which adapter fits the task.
2. The chosen adapter maps to its vLLM LoRA module (`O(1)` lookup → sub-ms swap).
3. The request is served with that LoRA applied; if no adapter matched, the base
   model is used.

**The tier is preserved untouched.** Multi-LoRA picks *which adapter* runs inside
the tier the classifier already chose — it never downgrades a task to a cheaper
tier. classify.js HIGH_RISK floors always win.

## Fallback

`chooseBackend(optIn)` returns `ollama` whenever vLLM is not opted-in or not
reachable, with the reason. No GPU, no vLLM, server down → Ollama, every time.
