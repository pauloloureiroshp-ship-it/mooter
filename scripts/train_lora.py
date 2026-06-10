#!/usr/bin/env python3
"""Wave 26 (26.G) — train the mooter-pastor-v1 LoRA adapter.

Fine-tunes qwen2.5-coder:7b on the Wave 23 self-audit corpus (instruction →
summary pairs) so the local T0 summarizer matches the quality Mooter graded ≥8.

This script is PREPARED by Claude Code but RUN BY PAULO overnight on the RTX 4090
(it needs a CUDA GPU; CC never executes it). It is self-contained: point it at the
exported corpus and it produces a single Q4_K_M GGUF ready for `mooter forge install`.

Pipeline:
  1. Load `audit/lora_train.jsonl` and keep only score >= --min-score (default 8 →
     212 high-quality samples per audit/lora_meta.json).
  2. Deterministic 80/20 train/validation split (seed-fixed → reproducible).
  3. QLoRA (4-bit) SFT via unsloth + TRL, with EARLY STOPPING on val loss
     (mitigates overfitting on a small 212-sample set — see brief risk table).
  4. Export merged adapter to GGUF Q4_K_M → `mooter-pastor-v1.gguf`.

Then Paulo runs:
    mooter forge install mooter-pastor-v1.gguf \
        --base-model qwen2.5-coder:7b --name mooter-pastor-v1

Deps: pinned in scripts/requirements-lora.txt (unsloth 2026.6.1 + transformers
4.56.0 + trl/peft/accelerate/bitsandbytes), installed by scripts/train_lora.sh.
torch (CUDA) is resolved by unsloth for the local GPU.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description="Train the mooter-pastor LoRA adapter.")
    p.add_argument("--corpus", type=Path, default=repo_root / "audit" / "lora_train.jsonl",
                   help="JSONL with {prompt, completion, score} per line.")
    p.add_argument("--min-score", type=int, default=8,
                   help="Keep only samples with score >= this (8 → the 212 'high' set).")
    p.add_argument("--base-model", default="unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit",
                   help="Unsloth 4-bit base. Maps to Ollama qwen2.5-coder:7b at install time.")
    p.add_argument("--out", type=Path, default=repo_root / "mooter-pastor-v1.gguf",
                   help="Output GGUF path (Q4_K_M).")
    p.add_argument("--val-frac", type=float, default=0.20, help="Held-out validation fraction.")
    p.add_argument("--max-seq-len", type=int, default=2048)
    p.add_argument("--epochs", type=int, default=3, help="Upper bound; early stopping usually ends sooner.")
    p.add_argument("--lora-rank", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument("--patience", type=int, default=2,
                   help="Early-stop patience (eval steps with no val-loss improvement).")
    p.add_argument("--seed", type=int, default=3407)
    return p.parse_args()


def load_corpus(path: Path, min_score: int) -> list[dict]:
    if not path.exists():
        sys.exit(f"✗ Corpus not found: {path}")
    rows: list[dict] = []
    with path.open(encoding="utf-8") as fh:
        for ln, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                print(f"  ⚠ skipping malformed line {ln}", file=sys.stderr)
                continue
            if int(obj.get("score", 0)) < min_score:
                continue
            prompt = (obj.get("prompt") or "").strip()
            completion = (obj.get("completion") or "").strip()
            if prompt and completion:
                rows.append({"prompt": prompt, "completion": completion})
    if len(rows) < 20:
        sys.exit(f"✗ Only {len(rows)} samples at score>={min_score}; refusing to train (overfit risk).")
    return rows


def main() -> None:
    args = parse_args()

    # Heavy GPU imports happen here (not at module load) so --help / a dry import
    # works on a machine without CUDA. On Paulo's 4090 these resolve to the
    # unsloth fast path.
    try:
        import torch  # noqa: F401
        from datasets import Dataset
        from unsloth import FastLanguageModel
        from unsloth.chat_templates import get_chat_template
        from trl import SFTTrainer, SFTConfig
        from transformers import EarlyStoppingCallback
    except ImportError as e:
        sys.exit(f"✗ Missing training dependency ({e}). Run scripts/train_lora.sh which installs them.")

    rows = load_corpus(args.corpus, args.min_score)
    print(f"✓ Loaded {len(rows)} samples (score >= {args.min_score}) from {args.corpus}")

    ds = Dataset.from_list(rows).shuffle(seed=args.seed)
    split = ds.train_test_split(test_size=args.val_frac, seed=args.seed)
    train_ds, val_ds = split["train"], split["test"]
    print(f"✓ Split: {len(train_ds)} train / {len(val_ds)} validation (held-out {args.val_frac:.0%})")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base_model,
        max_seq_length=args.max_seq_len,
        load_in_4bit=True,
        dtype=None,
    )
    tokenizer = get_chat_template(tokenizer, chat_template="qwen-2.5")

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.0,
        bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth",
        random_state=args.seed,
    )

    def to_text(batch: dict) -> dict:
        texts = []
        for prompt, completion in zip(batch["prompt"], batch["completion"]):
            msgs = [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": completion},
            ]
            texts.append(tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=False))
        return {"text": texts}

    train_ds = train_ds.map(to_text, batched=True, remove_columns=train_ds.column_names)
    val_ds = val_ds.map(to_text, batched=True, remove_columns=val_ds.column_names)

    cfg = SFTConfig(
        output_dir=str(args.out.parent / ".lora_ckpt"),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        warmup_ratio=0.05,
        logging_steps=5,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=args.seed,
        dataset_text_field="text",
        max_seq_length=args.max_seq_len,
        # Early stopping needs eval + best-model tracking on val loss.
        eval_strategy="steps",
        eval_steps=10,
        save_strategy="steps",
        save_steps=10,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        args=cfg,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=args.patience)],
    )

    print("▶ Training (early stop on eval_loss; Ctrl-C is safe — best checkpoint is kept)…")
    trainer.train()

    print(f"▶ Exporting merged adapter to GGUF Q4_K_M → {args.out}")
    out = args.out
    # unsloth writes <dir>/<file>; save into the target dir then rename if needed.
    model.save_pretrained_gguf(str(out.parent / out.stem), tokenizer, quantization_method="q4_k_m")
    produced = next((out.parent / out.stem).glob("*.gguf"), None) if (out.parent / out.stem).is_dir() else None
    if produced and produced.resolve() != out.resolve():
        os.replace(produced, out)
    print(f"✓ Done. Install with:\n    mooter forge install {out} "
          f"--base-model qwen2.5-coder:7b --name mooter-pastor-v1")


if __name__ == "__main__":
    main()
