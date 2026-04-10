# CODEX_SETUP.md — Codex CLI as T2 Fallback

> Codex CLI gives you free GPT-4-class code generation using your **ChatGPT Plus or Pro subscription** — no API key, no per-token billing.

---

## What is Codex CLI?

Codex CLI is OpenAI's official command-line tool that authenticates via ChatGPT OAuth. frugal uses it as a **T2 fallback** when your Anthropic 5-hour budget is running high.

**Cost model:** Included in your ChatGPT Plus ($20/mo) or Pro ($200/mo) subscription.

---

## Installation

```bash
npm install -g @openai/codex
codex auth login
```

Verify:

```bash
codex "what model are you?"
# Expected: "I'm GPT-4o (or similar)."
```

---

## Usage limits

| Plan | Approx. messages per 5h window |
|---|---|
| ChatGPT Plus ($20/mo) | 300–1,500 |
| ChatGPT Pro ($200/mo) | ~5,000+ |
| Free (no subscription) | ~10–20 (GPT-3.5 only) |

---

## 9Router config for frugal

Create `~/.claude/9router.config.json`:

```json
{
  "providers": {
    "cc": {"type": "claude-code"},
    "cx": {"type": "codex", "binary": "codex", "model": "gpt-4o"},
    "gc": {"type": "gemini", "binary": "gemini", "model": "gemini-3-flash-preview"},
    "ol": {"type": "ollama", "baseUrl": "http://localhost:11434", "model": "qwen2.5:3b"}
  },
  "routing": {
    "T0": ["ol", "gc"],
    "T1": ["cc/haiku", "cx"],
    "T2": ["cc/sonnet", "cx"],
    "T3": ["cc/opus"]
  },
  "budget_triggers": {
    "five_hour_pct": 80,
    "action": "redirect_T2_to_cx"
  }
}
```

```bash
nohup 9router start --config ~/.claude/9router.config.json &
```

---

## Important: API key vs OAuth

> **Do NOT set `ANTHROPIC_API_KEY` in your shell if you're using Claude Code with an OAuth subscription.**

When `ANTHROPIC_API_KEY` is set, `claude -p` **charges the API**, not your subscription. This bypasses all frugal budget guardrails.

```bash
echo $ANTHROPIC_API_KEY  # should be empty
unset ANTHROPIC_API_KEY  # remove if set
```

Same applies to Codex: `OPENAI_API_KEY` triggers API billing. Use `codex auth login` instead.
