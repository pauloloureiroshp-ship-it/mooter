# Pastor v2: per-task LoRA routing, distillation, and an Obsidian bridge

Mooter is a local-first router for Claude Code: it classifies each task and sends it to
the cheapest tier that can do it well — local Ollama, Haiku, Sonnet, or Opus. Wave 31
makes the "local" side of that smarter and more personal.

## 1. LORAUTER — per-task adapter routing

A single LoRA adapter can't be good at everything. Wave 31 registers six per-task
adapters — `coding-frontend`, `coding-backend`, `coding-data`, `prose-pt-pt`,
`prose-en`, and a `baseline` fallback — and routes between them **deterministically**:

- The prompt is tokenised and represented with **TF-IDF** (distinctive terms weigh more).
- Each adapter has a keyword profile; we score the prompt against all of them with
  **cosine similarity** plus structural signals (file extensions, language, the
  classifier's category).
- The winner is chosen by **relative confidence**. If the best adapter clears a 0.70
  threshold it's selected; otherwise we fall back to baseline. No LLM is involved in the
  decision — it's a pure function of the prompt, the classifier's features, and the
  registry.

The non-negotiable rule: **the classifier owns the tier.** LORAUTER only biases *which
adapter* runs inside the tier already chosen. It can't turn a T1 task into a T3 one, and
a HIGH_RISK task can never be downgraded below T3. Auto-swap is opt-in
(`MOOTER_LORA_AUTOSWAP=1`); the default behaviour is byte-for-byte unchanged.

Routing is live today even though the adapters aren't trained yet — the *decision* works
regardless; materialising an adapter into Ollama is a separate, overnight job.

## 2. Knowledge distillation

`mooter pastor distill` reads your local routing log and emits an installable
Anthropic-compatible skill (`.skill.md`) of everything the Pastor learned: which task
categories route to which tier/model, the language mix, and per-category confidence.

On my machine, 656 decisions distilled to: **T3 48% · T1 32% · T0 18% · T2 2%**, with
`architecture_or_critical → T3`, `simple_transform_or_explain → T1`, and
`trivial_local → T0` as the top learned rules. `npx skills add` it into any agent.

It's features only — no prompts or responses are ever written.

## 3. The Obsidian bridge

If you keep a vault, the new `obsidian-vault-sync` pack connects it both ways:

- **Write:** Pastor learnings → `<vault>/Mooter/learnings-<date>.md`.
- **Read:** `<vault>/Mooter/preferences.md` → routing priors.

It auto-detects vaults via `.obsidian/` (including WSL `/mnt/c` paths), is local-only,
and never deletes your notes.

## Privacy, unchanged

Opt-in by default. The new hub endpoint (`/v1/pastor-adapters`) stores only adapter
usage features, rejects any content key, and every public aggregate is k-anonymity ≥50
gated. The doctrine gate (`classify.js` checksum) is still enforced in CI.

Local-first. Learns forever.
