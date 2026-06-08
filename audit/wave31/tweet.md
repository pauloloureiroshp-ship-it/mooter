# Wave 31 launch tweet

---

**Main:**

Mooter Pastor v2 is live. Your local-first LLM router now does **per-task LoRA adapter
routing** — it reads your prompt and picks a specialised adapter (frontend / backend /
data / PT-PT / EN) *inside* the tier the classifier chose.

100% deterministic: TF-IDF + cosine, no LLM in the loop to pick the adapter. 🧠

---

**Thread:**

1/ The classifier still owns the tier (Opus vs Sonnet vs Haiku vs local) — that's a hard
doctrine guardrail. LORAUTER only biases *which adapter* runs within that tier. It can
never escalate or downgrade your routing.

2/ New: `mooter pastor distill`. It reads your routing decisions and emits an installable
`.skill.md` of everything the Pastor learned. Mine: 656 decisions → T3 48% / T1 32% /
T0 18% / T2 2%. `npx skills add` it anywhere.

3/ New: Obsidian bridge. A bidirectional pack — learnings flow to `vault/Mooter/`, and
your `preferences.md` flows back as routing priors. Local-only, features-only, never
deletes your notes.

4/ Privacy unchanged: opt-in, k-anonymity ≥50 on every hub aggregate, classify.js sha
gated in CI. Local-first, learns forever.

mooter.ai
