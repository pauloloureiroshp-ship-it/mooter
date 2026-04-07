# GEMINI_SETUP.md — Gemini Flash as T0 Fallback

> **CRITICAL WARNING**
>
> Since **25 March 2026**, Google has restricted Gemini Pro to paid API tiers. The **free tier only supports Gemini Flash**. If you attempt to use `gemini-pro` or `gemini-1.5-pro` via the free OAuth CLI, you will receive `RESOURCE_EXHAUSTED` or `PERMISSION_DENIED`.
>
> **frugal only routes to Gemini Flash**. Do not configure Pro in 9Router.

---

## What is Gemini Flash (free tier)?

Gemini Flash is Google's fast, efficient model available for free via the `gemini` CLI using your Google account (OAuth). No credit card required.

**Free tier limits:** 1,000 requests/day, reset daily at midnight UTC.

**Use case in frugal:** T0 and T1 routing — summaries, commit messages, docstrings, simple Q&A.

---

## Installation & Auth

```bash
npm install -g @google/gemini-cli
gemini auth login
```

**Verify model (critical):**

```bash
gemini "what model and version are you?"
# Must show: gemini-3-flash-preview
# NOT: gemini-pro or gemini-1.5-pro
```

---

## Rate limits

| Metric | Free tier (Flash) |
|---|---|
| Requests per day | 1,000 |
| Reset time | Daily at 00:00 UTC |
| Context window | 1M tokens |
| Output tokens | Up to 8,192 per response |

---

## When to use Gemini Flash (T0/T1)

Good for: commit messages, docstrings, inline comments, renaming, simple Q&A, syntax explanations, formatting (JSON/YAML/Markdown).

**Do NOT use for:** architecture decisions, critical refactors, production deployment, security-sensitive code, complex multi-step reasoning.

frugal's classifier automatically restricts Gemini to T0/T1. If a prompt is T2+, it will never route to Gemini.

---

## 9Router config

```json
{
  "providers": {
    "gc": {
      "type": "gemini",
      "binary": "gemini",
      "model": "gemini-3-flash-preview",
      "dailyLimit": 1000,
      "resetUtc": "00:00"
    }
  }
}
```

---

## Troubleshooting

**`RESOURCE_EXHAUSTED`** — Daily limit hit. frugal falls back to Ollama/Haiku automatically.

**`PERMISSION_DENIED` for Pro** — Restricted since 25 Mar 2026. Use `gemini-3-flash-preview`.

**Wrong Google account:**

```bash
gemini auth logout && gemini auth login
```

**Windows Git Bash auth fails:**

```bash
BROWSER="C:/Program Files/Google/Chrome/Application/chrome.exe" gemini auth login
```
