# Wave 14 — 14C: LoRA Statusline Chip

> **Goal**: adicionar chip `🧬 LoRA active · <adapter>` na statusline Mooter quando
> adapter > baseline está activo. Pattern replica `quant Q4_K_M (-72% size · ~99%
> quality vs FP16)` chip da Wave 12 PR-F (que já está LIVE).
>
> **Trigger**: Wave 14 14A audit findings (positive features already shipped but
> not surfaced). Paulo notou que LoRA não tem chip visível na statusline mesmo
> com Wave 5 Adapter Forge shipped.
>
> **Scope**: 1 PR squash→dev, router-only (`tools/router/statusline-multi.js`),
> ~1h CC autonomous. Tag dev `v1.8.7-lora-chip-dev`. Pode arrancar paralelo a Day 4.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero schema changes
> - Zero hub touch
> - Tests router 110/110 mantidos + 2 new
> - Statusline existing chips intactos (quant Q4_K_M, savings, sparkline, etc.)

---

## 0. Context — chip pattern existente

Wave 12 PR-F shippou chip `quant Q4_K_M (-72% size · ~99% quality vs FP16)` na statusline. Visível em `statusline-multi.js` quando model Ollama está ativo.

Pattern para LoRA replica este mesmo treatment.

---

## 1. Design

### Display logic

| Adapter state | Chip display |
|---|---|
| `baseline` (default) | (no chip — current behavior) |
| `<name>` (any adapter active) | `🧬 LoRA active · <name>` |
| `<name>` com benchmark data | `🧬 LoRA active · <name> · +N pts` |

### Source of truth

Adapter name vem do:
- `~/.mooter/config.json` → `adapter: <name>`
- OU subagent output / hook payload
- OU `mooter forge ls` current adapter

### Placement

Junto ao `quant Q4_K_M` chip — separator `·` consistent. Linha 2 do statusline render.

---

## 2. Fix path

### Step 1 — Read adapter state

```js
// In statusline-multi.js renderTwoLine()
const adapter = readAdapter(); // existing helper from Wave 5
const adapterChip = adapter && adapter !== 'baseline'
  ? `🧬 LoRA active · ${adapter}`
  : null;
```

### Step 2 — Render in pipeline

```js
const chips = [
  quantChip,        // existing Q4_K_M
  adapterChip,      // NEW LoRA
  gpuChip,          // existing RTX 4090
  subscriptionChip, // existing Claude Max
  resetChip,        // existing 5h reset
  cleanupCta,       // existing mooter forge install
].filter(Boolean).join(' · ');
```

### Step 3 — Tests (2 new)

- Test 1: `renderTwoLine({ adapter: 'baseline' })` → no LoRA chip
- Test 2: `renderTwoLine({ adapter: 'react-pro' })` → contains "🧬 LoRA active · react-pro"

---

## 3. Recon comandos

```bash
# Find statusline-multi.js
ls tools/router/statusline-multi.js

# Find adapter reading helper (Wave 5)
grep -rn "readAdapter\|getAdapter" tools/router/

# Find quant chip pattern (Wave 12 PR-F)
grep -n "Q4_K_M\|quant " tools/router/statusline-multi.js

# Verify classify.js byte-identical
sha256sum tools/router/classify.js
```

---

## 4. Sequência (1 PR, ~1h CC autonomous)

1. **Recon** (10 min) — locate statusline-multi.js + adapter helper
2. **Implementation** (20 min) — read adapter, render chip, integrate
3. **Tests** (15 min) — 2 new + verify 110/110 mantidos
4. **classify.js sha256** (5 min)
5. **PR squash→dev** branch `wave14-14c-lora-chip`
6. **final-reviewer T1 (Haiku)** — low-risk display change

---

## 5. Definition of Done

1. ✅ `🧬 LoRA active · <adapter>` chip aparece quando adapter ≠ baseline
2. ✅ Adapter `baseline` → no chip (current behavior preserved)
3. ✅ Tests router 110/110 + 2 new
4. ✅ classify.js byte-identical
5. ✅ statusline existing chips intactos (visual review)
6. ✅ PR squash→dev + tag dev `v1.8.7-lora-chip-dev`

---

## 6. Anti-patterns

- ❌ NÃO inventar `+N pts` boost number — só mostrar se benchmark data confirma
- ❌ NÃO criar new adapter system — usar Wave 5 helpers existentes
- ❌ NÃO mexer no quant chip Wave 12 PR-F
- ❌ NÃO mudar pipeline order significantly

---

## 7. Master prompt para CC

```
Inicia Wave 14 14C LoRA Statusline Chip conforme docs/strategy/WAVE14_14C_LORA_STATUSLINE_CHIP_MICROBRIEF.md.

Pré-flight: Wave 14 Day 1+2 EM DEV. 14C pode arrancar paralelo a Day 4.

Scope: adicionar chip 🧬 LoRA active · <adapter> em statusline-multi.js quando adapter != baseline. Pattern replica Wave 12 PR-F quant chip. Router-only.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_14C_LORA_STATUSLINE_CHIP_MICROBRIEF.md inteiro
  - tools/router/statusline-multi.js (current state)
  - Adapter helper (Wave 5 Forge)
  - Wave 12 PR-F quant chip pattern (mesmo ficheiro)

Non-negotiables:
  - classify.js byte-identical
  - Tests router 110/110 + 2 new
  - Existing chips intactos
  - Zero schema/hub touch

Sequência (~1h autonomous):
  1. Recon: locate statusline + adapter helper
  2. Implementation: read adapter, render chip
  3. Tests 2 new
  4. classify.js sha256 check
  5. PR squash→dev wave14-14c-lora-chip
  6. final-reviewer T1 Haiku

Tag dev v1.8.7-lora-chip-dev.
```

---

**Composed by Cowork, 2026-06-04 evening. 14C ships LoRA chip ~1h CC. Tag dev v1.8.7-lora-chip-dev.**
