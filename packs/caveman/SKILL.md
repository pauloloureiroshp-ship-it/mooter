---
name: caveman
description: Terse, high-signal output. Drop filler words; keep facts, paths, code, errors. ~8% output-token savings.
---

# Caveman (bundled by Mooter)

> **Attribution.** This bundles the **Caveman** skill by **Julius Brussee**
> (https://github.com/juliusbrussee/caveman, MIT, ~51k stars). The brevity
> behaviour is Julius's work. Mooter adds: subscription-aware gating (Max users
> default OFF — their output is free at the margin) and Pastor acceptance
> tracking (does terse output get accepted or get follow-up edits?). License: MIT.

## What it does
Rewrites responses to be terse and high-signal: no preamble, no summary, short
words, one idea per line — while preserving identifiers, file paths, commands,
error messages and numbers verbatim.

Reported impact (source: March 2026 paper, 31 models, 1485 problems):
- Headline 75% saved → realistic **~4-8% of session total** output tokens.
- **+26 percentage points accuracy** on problems where verbosity caused errors.

## When to use
- Pay-as-you-go / Claude Pro: default ON.
- Claude Max: default OFF (marginal cost ≈ $0); enable explicitly for polish.

Install: `mooter pack install caveman` · Info: `mooter pack info caveman`
