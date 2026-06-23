# MOOTER — Statusline Refinement v3 (6 considerações Paulo + research 2026)

**Composto:** 2026-06-08 ~03:30h BRT, Cowork
**Trigger:** Paulo identificou 6 pontos UX statusline críticos
**Status:** ADD ao Wave 32 Phase B (Statusline refinement)
**Filosofia:** V4 §1.3 #4 (Explainability) — "Qualquer vibe coder entende em 5 segundos"

---

## ⚡ TL;DR

1. **CC nativo expõe JSON stdin per turn** com context window + 5h rate limits — Mooter pode CONSUMIR. Zero hack.
2. **6 fixes UX:** context window bar visual, Max 5h usage, rename `last 10` + `turn`, remover `all-time` da statusline.
3. **Color coding standard 2026:** green <50%, yellow 50-75%, red >75% para context usage.
4. **Layout Starship:** left = context (estado), right = status (live activity).
5. **ADD ao Wave 32 Phase B** sem nova phase — Phase B refinement absorve estes 6 pontos.

---

## Part 1 — Os 6 pontos Paulo resolvidos

### Q1 — Context window bar não existe

**Status:** CC nativo expõe via JSON stdin: `total input tokens, total output tokens, context window size, used percentage, remaining percentage`.

**Solução Mooter:**
- Lê JSON stdin per turn (Wave 28 já implementou hook UserPromptSubmit — same pattern)
- Renderiza chip Line 1 com color coding:

```
🟢 12% context (24k/200k)     ← <50% green
🟡 67% context (134k/200k)    ← 50-75% yellow
🔴 78% context (156k/200k)    ← >75% red — consider /compact handoff
```

**Effort:** Phase B (statusline) ADD ~30min.

### Q2 — `last 10` não claro

**Antes:** `last 10`
**Depois:** `last 10 prompts: T0=6 T1=3 T2=1 T3=0` (explícito)

**Effort:** Phase B label rename ~5min.

### Q3 — Real-time token tracking inline (igual CC)

**Status:** CC mostra token count durante turn. Mooter falta.

**Solução:** Phase C (inline token tracker) já está no Wave 32 brief. ADD: usar o **mesmo JSON CC** para tracking. Output durante turn:

```
[T2 ☁️ Sonnet · 1.2k in · 856 out · $0.0094]
```

Plus color coding por tier (🟢🟡🟠🔴) + backend icon (🏠☁️).

**Effort:** já em Phase C ~2h.

### Q4 — Claude Max 5h window usage

**Status:** CC nativo expõe via JSON: `5h_rate_limit, 7d_rate_limit, percentage_used`.

**Solução Mooter:**

```
🕐 Max 5h: 23% used · resets em 3h47m · 7d: 12%
```

Color coding: green <60%, yellow 60-85%, red >85%.

**Quando Max user atinge 80%** → notify discrete + sugest `/moo-effort low` para conservar.

**Effort:** Phase B ADD ~45min.

### Q5 — `turn` é jargão

**Antes:** `turn $0.09`
**Depois:** `this prompt: T2 Sonnet (conf 0.89) · $0.0094`

Renomear ALL instances:
- `turn` → `this prompt`
- `alltime` → (removido statusline, vai para dashboard)
- `last 10` → `last 10 prompts`

**Effort:** Phase B rename ~15min.

### Q6 — Remover `all-time` da statusline

**Best practice 2026:** *"Design trends moving toward showing this data only when explicitly requested to keep the default UI clean."*

**Antes:** `saved $0.00 all-time (0% vs all-Opus) · turn $0.09 · alltime $0.09`
**Depois:** statusline mostra apenas `today` + `this prompt`. `all-time` move para `mooter dashboard` (Phase D).

**Effort:** Phase B remove + Phase D include ~10min.

---

## Part 2 — Statusline FINAL após v3 refinement

### `compact` mode (default, 2 lines)

```
🐮 Mooter v1.19 · 73% saved today · 60% local · 🟢 23% context · 🕐 Max 5h: 23%
📊 last 10 prompts: T0=6 T1=3 T2=1 T3=0 · ☁️ this prompt: T2 Sonnet (0.89) · $0.0094
```

### `full` mode (3 lines)

```
🐮 Mooter v1.19 · 73% saved today · 60% local · 🟢 23% context · 🕐 Max 5h: 23%
📊 last 10 prompts: T0=6 T1=3 T2=1 T3=0 · ☁️ this prompt: T2 Sonnet (0.89) · $0.0094
🧬 Pastor v1.3 · 🧠 frontend adapter · 🪨 caveman on · 🎯 effort: high
```

### `didactic` mode (5 lines, newbie-friendly)

```
🐮 Mooter v1.19 — Your LLM router. Local-first. Learns forever.
💰 Today: saved $1.27 (73% of $1.74 baseline)
🏠 60% prompts ran LOCALLY at $0 (12 of 20)
☁️ This prompt: Sonnet on Anthropic ($0.0094) — high complexity detected
🟢 23% context used (157k tokens free) · 🕐 Max 5h window: 23% used
```

### `mini` mode (1 line, focused work)

```
🐮 73% saved · 60% local · 🟢 23% ctx · 🕐 23%
```

---

## Part 3 — JSON CC stdin payload (referência)

Para Mooter consumir:

```json
{
  "session_id": "...",
  "model": {
    "id": "claude-sonnet-4-6",
    "display_name": "Sonnet 4.6"
  },
  "context_window": {
    "total_size": 200000,
    "input_tokens": 24000,
    "output_tokens": 856,
    "used_percent": 12.4,
    "remaining_percent": 87.6
  },
  "rate_limits": {
    "5h": {
      "used_percent": 23,
      "resets_at": "2026-06-08T08:30:00Z"
    },
    "7d": {
      "used_percent": 12,
      "resets_at": "2026-06-15T00:00:00Z"
    }
  },
  "cost": {
    "this_turn_usd": 0.0094,
    "session_total_usd": 0.18
  }
}
```

Mooter `tools/router/statusline-multi.js` (existente) consome este JSON + renderiza.

---

## Part 4 — Color coding standard (2026)

| Métrica | Verde | Amarelo | Vermelho |
|---|---|---|---|
| Context usage | <50% | 50-75% | >75% (consider /compact) |
| Max 5h | <60% | 60-85% | >85% (suggest /moo-effort low) |
| Max 7d | <50% | 50-80% | >80% (alert user) |
| Session cost | <40% cap | 40-80% cap | >80% cap (cost cap stricter) |

---

## Part 5 — Integration em Wave 32 brief

**Phase B (Statusline refinement) — expandir spec:**

ADD ao master prompt:

```
Phase B includes (NOVO v3 refinement):
- Consume CC stdin JSON per turn (context window, rate limits, cost)
- Render context window chip with color coding (green <50%, yellow 50-75%, red >75%)
- Render Max 5h window usage chip (green <60%, yellow 60-85%, red >85%)
- Render Max 7d window usage chip (similar)
- Rename "last 10" → "last 10 prompts"
- Rename "turn" → "this prompt"
- Remove "all-time" from statusline (move to mooter dashboard Phase D)
- 4 modes: mini (1 line), compact (2 lines, default), full (3 lines), didactic (5 lines)
- Layout Starship: left = context, right = status
- All chips clickable/hoverable em compatible terminals (tooltip)
```

Phase D (`mooter dashboard`) — expandir spec:

ADD:
```
Dashboard widget "All-time savings" — moved from statusline (Q6 Paulo).
Includes: cumulative savings, top patterns, weekly trend, monthly comparison.
```

**Effort total ADD:** ~2h cumulative (já dentro do estimate Phase B + D).

---

## Part 6 — Anti-patterns evitados

| # | Anti-pattern | Mooter avoids by |
|---|---|---|
| 1 | Esoteric symbols sem explanation | Didactic mode + tooltips |
| 2 | Context window invisible | Color-coded bar always visible |
| 3 | Rate limit surprise | Max 5h/7d chips proactivos |
| 4 | Jargão (`turn`) | Rename `this prompt` |
| 5 | Statusline cluttered all-time | All-time vai para dashboard |
| 6 | Render >50ms | ≤10ms budget (Starship grade) |
| 7 | Monochrome | Color coding semantic |
| 8 | Single mode imposed | 4 modes (mini/compact/full/didactic) |

---

## Part 7 — Honra check V4+V5

| Princípio | Status |
|---|---|
| No proxy | ✅ Statusline lê JSON CC, não intercepta |
| Zero LLM cost classificação | ✅ Render local pure |
| Doctrine > config | ✅ Markdown defaults |
| **Explainability** | ✅✅✅ **CORE** desta refinement |
| Doctrine wins | ✅ classify.js continua intocada |
| Subscription-aware | ✅ Max 5h/7d chips só para Max users |
| Local-first | ✅ Render local |
| Triple-stack | ✅ Statusline expõe via CC nativo path |

---

## Part 8 — Sources canónicos

### Statusline architecture CC
- [CC Docs Statusline](https://code.claude.com/docs/en/statusline)
- [Claude Code Status Bar Context Monitor (Pasquale)](https://pasqualepillitteri.it/en/news/162/claude-code-status-bar-context-monitor-guide)
- [Custom statusline two-line context breakdown (dui Gist)](https://gist.github.com/dui/816853e5a5200d66be621d619b3090e5)
- [CShip — Customizable statusline](https://github.com/stephenleo/cship)
- [ClaudeCodeStatusLine (daniel3303)](https://github.com/daniel3303/ClaudeCodeStatusLine)

### Claude Max rate limits 2026
- [Claude Code Rate Limits 2026 (TrueFoundry)](https://www.truefoundry.com/blog/claude-code-limits-explained)
- [Claude Limits 2026 5h Sessions (TokenMix)](https://tokenmix.ai/blog/complete-claude-limits-guide-2026-tokens-uploads-5-hour)
- [Claude Code Limits Doubled (claudefa.st)](https://claudefa.st/blog/guide/development/higher-usage-limits)
- [SessionWatcher Rate Limits Guide](https://www.sessionwatcher.com/guides/claude-code-rate-limits-explained)

### CLI UX best practices
- [Command Line Interface Guidelines](https://clig.dev/)
- [Status Line Qwen Code Docs](https://qwenlm.github.io/qwen-code-docs/en/users/features/status-line/)
- [Custom statusline for CC (PhotoStructure)](https://photostructure.com/coding/claude-code-statusline/)
- [Copilot CLI Status Line](https://tgrall.github.io/blog/2026/05/02/copilot-cli-customize-statusline)

---

## Part 9 — Acção concreta

Adicionar ao master prompt Wave 32:

```
PHASE B v3 — Statusline refinement (4 modes + 6 Paulo points):
- Consume CC stdin JSON (context window + Max 5h/7d rate limits + cost per turn)
- Render context window chip color-coded (green <50% / yellow 50-75% / red >75%)
- Render Max 5h window chip (green <60% / yellow 60-85% / red >85%)
- Render Max 7d window chip (similar thresholds)
- Rename "last 10" → "last 10 prompts" (explicit)
- Rename "turn" → "this prompt" (no jargon)
- Remove "all-time" savings (move to mooter dashboard Phase D)
- 4 modes: mini (1 line) / compact (2 lines default) / full (3 lines) / didactic (5 lines)
- Layout Starship: left=context, right=status
- ≤10ms render budget
- linhas 1-2 byte-idênticas (linhas 3+ opt-in)
```

E PHASE D adicionar:
```
PHASE D — mooter dashboard inclui widget "All-time savings" (moved from statusline).
Cumulative savings, top patterns, weekly trend, monthly comparison.
```

---

*Refinement v3 composto pós-feedback Paulo. Integrar em Wave 32 brief antes do CC arrancar.*
