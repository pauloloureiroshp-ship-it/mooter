# LoRA Training Runbook — `mooter-pastor-v1`

> Operator runbook for training the Pastor LoRA adapter overnight on the RTX 4090.
> Claude Code **prepares** this; Paulo **runs** it (CC has no GPU). Last verified
> 2026-06-08 (Wave 33.12).

## TL;DR

```bash
# from repo root, on the 4090 box:
bash scripts/train_lora.sh
# → produces ./mooter-pastor-v1.gguf (Q4_K_M), then:
mooter forge install mooter-pastor-v1.gguf \
    --base-model qwen2.5-coder:7b --name mooter-pastor-v1
```

Everything below is detail: what to check before you start, why the pins are what
they are, and how to recover if a step fails.

---

## 1. What this trains

- **Base:** `unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit` (4-bit) → maps to Ollama
  `qwen2.5-coder:7b` at install time.
- **Corpus:** `audit/lora_train.jsonl`, filtered to `score >= 8` → **212 high-quality
  samples** (`audit/lora_meta.json`). The trainer refuses to run on `< 20` samples.
- **Method:** QLoRA (4-bit) SFT via unsloth + TRL, rank 16 / alpha 16, with
  **early stopping on validation loss** (mitigates overfit on the small 212-sample set).
- **Output:** a single merged **GGUF Q4_K_M** at `./mooter-pastor-v1.gguf`.

> QLoRA on Qwen**2.5** is fine. (Unsloth advises against 4-bit QLoRA on Qwen3.5+
> due to quantization drift — not relevant here; we stay on 2.5-Coder.)

---

## 2. Pre-flight checks (run these first)

```bash
# 1. GPU present + enough VRAM (need >=16 GB; 4090 = 24 GB, ideal)
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# 2. CUDA 12.x driver
nvidia-smi | grep -i "CUDA Version"

# 3. Python 3.10–3.12 (NOT 3.13 — unsloth/torch wheels lag)
python3 --version

# 4. Corpus exists and has the expected high-score sample count
test -f audit/lora_train.jsonl && \
  awk -F'"score":' 'NF>1{n=$2+0; if(n>=8)c++} END{print c" samples score>=8"}' audit/lora_train.jsonl

# 5. Free disk for the venv + base weights + checkpoints (~15 GB headroom)
df -h .
```

Expected: an NVIDIA card with ≥16 GB, CUDA 12.x, Python 3.10–3.12, and
`212 samples score>=8` (or close — the corpus is the source of truth).

### Free the GPU before an overnight run (Wave 55)

QLoRA on the 7B base peaks around **~22 GB** on the 4090, so leave headroom —
**target ≥18 GB free** before you start. The two things that silently hold VRAM:

```bash
# 1. Pause Ollama so it isn't holding a model resident in VRAM overnight
ollama stop                       # or: stop the Ollama service/tray app

# 2. Close other GPU consumers (browser hardware-accel, games, video editors),
#    then confirm what's actually free:
nvidia-smi --query-gpu=memory.free,memory.used --format=csv,noheader
```

If free VRAM is < 18 GB after this, either close more apps or run with a smaller
batch (`--batch-size 1 --grad-accum 8`, see §6 OOM). Training restarts Ollama on
its own the next time the router needs a local model — pausing it is safe.

---

## 3. Dependency resolution (dry-run — no GPU needed)

The pinned stack lives in `scripts/requirements-lora.txt`. Verify it **resolves**
before committing the 4090 to an overnight run. This also runs in CI/dev:

```bash
python3 -m pip install --dry-run -r scripts/requirements-lora.txt
# expect: exit 0, no "ResolutionImpossible"
```

### Why these pins (verified 2026-06-08 against PyPI + unsloth `pyproject.toml`)

| Package | Pin | Rationale |
|---|---|---|
| `unsloth` | `==2026.6.1` | Latest release on PyPI (confirmed `pypi.org/pypi/unsloth/json`). |
| `transformers` | `==4.56.0` | unsloth 2026.6.1 allows `>=4.51.3,<=5.5.0` **minus** an exclusion list (`4.52.x, 4.53.0, 4.54.0, 4.55.x, 4.57.0/4/5, 5.0.0, 5.1.0`). **4.56.0 clears every `!=`.** |
| `peft` | `>=0.18.0` | adapter API used by `get_peft_model`. |
| `trl` | `>=0.18.2,<=0.24.0` | `SFTTrainer`/`SFTConfig` API the script targets. |
| `accelerate` | `>=0.34.1` | trainer backend. |
| `bitsandbytes` | `>=0.45.5,!=0.46.0,!=0.48.0` | 4-bit kernels; the two excluded builds are known-broken. |
| `datasets` | `>=2.19` | corpus loading + split. |

> `torch` (CUDA) is intentionally **unpinned** — unsloth pulls a matching wheel for
> the local CUDA at install time. Do not add a manual torch pin.

If the dry-run fails after an upstream change, re-check unsloth's
[`pyproject.toml`](https://github.com/unslothai/unsloth/blob/main/pyproject.toml)
exclusion list and bump `transformers` to the lowest version inside the window that
is **not** excluded.

---

## 4. Run the training

```bash
bash scripts/train_lora.sh                 # defaults (3 epochs cap, early-stop)
bash scripts/train_lora.sh --epochs 4      # any flag passes through to train_lora.py
```

What the wrapper does: creates `./.venv-lora`, installs the pinned stack (cached
after first run), then runs `scripts/train_lora.py`. Useful knobs:

| Flag | Default | Note |
|---|---|---|
| `--min-score` | `8` | lower → more samples, higher overfit risk |
| `--lora-rank` / `--lora-alpha` | `16` / `16` | bump together if underfitting |
| `--lr` | `2e-4` | |
| `--patience` | `2` | early-stop patience (eval steps w/o val-loss gain) |
| `--epochs` | `3` | upper bound; early stop usually ends sooner |

`Ctrl-C is safe` — `load_best_model_at_end` keeps the best checkpoint.

---

## 5. Install + verify the adapter

```bash
mooter forge install mooter-pastor-v1.gguf \
    --base-model qwen2.5-coder:7b --name mooter-pastor-v1
```

Then sanity-check it routes/summarizes at the quality the audit graded ≥8 before
trusting it for live T0 work.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `nvidia-smi not found` | You're not on the 4090 box. The trainer hard-exits by design. |
| `ResolutionImpossible` on dry-run | unsloth changed its `transformers` window — see §3 footnote. |
| OOM during training | drop `--batch-size` to 1, raise `--grad-accum` to 8; keep effective batch ~8. |
| `Only N samples … refusing to train` | corpus too small at this `--min-score`; lower it or expand `audit/lora_train.jsonl`. |
| Python 3.13 import errors | recreate the venv on Python 3.10–3.12. |

---

## Provenance

- claim: `unsloth==2026.6.1` is the latest PyPI release
  source: https://pypi.org/pypi/unsloth/json
  confidence: high · observed_at: 2026-06-08
- claim: `transformers==4.56.0` is allowed by unsloth 2026.6.1 (not in `!=` list)
  source: unsloth `pyproject.toml` (main) — exclusion list inspected
  confidence: high · observed_at: 2026-06-08
- claim: corpus = 212 samples at score>=8 (of 560 total)
  source: `audit/lora_meta.json` (`samples_high: 212`) — re-counted from `audit/lora_train.jsonl`
  confidence: high · observed_at: 2026-06-08
