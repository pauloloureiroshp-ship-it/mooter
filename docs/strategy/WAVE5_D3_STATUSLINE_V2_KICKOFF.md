# Wave 5 D3 — Statusline V2 (clarity + 5 chips)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.5.1-forge-validation` em dev (W5 D2). Working dir = `~/mooter`.
>
> **Lição 4× confirmada**: Recon obrigatório. Reportar ao Paulo. Adaptar se já existir.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave5-d3-statusline-v2` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 5 D3**: shippar 5 sub-features que clarificam a statusline (endereça pontos 1, 2, 3 + novo "context bar" do Paulo):

1. **VRAM chip** — `🎮 RTX 4090 (12.4GB / 24GB)` via nvidia-smi (Linux/WSL) · system_profiler (macOS)
2. **Quantização tooltip** — `quant Q4_K_M (-73% size · ~99% quality vs FP16)` (honest, verifiable)
3. **Context window bar** — `ctx [████░░░░░░] 23%` (visual, threshold cores · novo ponto Paulo)
4. **`mooter explain` comando** — educational mode que descreve cada chip + significado
5. **Hide flags** — `mooter quiet --hide-<chip>` para hide individual chips

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js + adapter_selection.js + glyphs.js INTACTOS**
- ❌ **mooter_event + sync_event + adapter_manifest v1 INTACTOS**
- ❌ **hub/ + landing/ Phases A+B+C INTACTOS**
- ❌ **NÃO inventar** VRAM se nvidia-smi falhar — graceful skip
- ❌ **NÃO inventar** quantização quality% — usar valor real Ollama docs/conservative
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.5.2-statusline-v2**
- ✅ **Vocabulário GLOSSARY**

### Recon obrigatório

```bash
# Statusline actual
cat tools/router/statusline-multi.js | head -80

# Hide flags existentes
cat packages/cli/src/commands/quiet.ts

# VRAM tooling disponível?
which nvidia-smi 2>/dev/null && nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null
which system_profiler 2>/dev/null  # macOS

# Quantização — qwen2.5:3b default quant
ollama show qwen2.5:3b 2>/dev/null | grep -i quant
```

Reporta o que descobrires antes de implementar.

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma 6935e30 + tag v0.5.1-forge-validation
git checkout -b wave5-d3-statusline-v2
```

## 3. Sub-feature 1 — VRAM chip

### 3.1 Implementação

`tools/router/vram_detect.js` (NEW):

```javascript
'use strict';
const { spawnSync } = require('child_process');

function detectVramLinux() {
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 1500 });
    if (r.status !== 0) return null;
    const line = r.stdout.toString().trim().split('\n')[0];
    const [used, total] = line.split(',').map(s => parseInt(s.trim(), 10));
    if (!used || !total) return null;
    return { used_mb: used, total_mb: total };
  } catch {
    return null;
  }
}

function detectVramMac() {
  // M-series unified memory — approximation via system_profiler
  try {
    const r = spawnSync('system_profiler', ['SPHardwareDataType', '-json'], { timeout: 1500 });
    if (r.status !== 0) return null;
    const data = JSON.parse(r.stdout.toString());
    const ramText = data?.SPHardwareDataType?.[0]?.physical_memory;
    if (!ramText) return null;
    const totalGb = parseInt(ramText, 10);
    return { used_mb: -1, total_mb: totalGb * 1024 };  // M-series shared
  } catch {
    return null;
  }
}

function getVram() {
  const platform = process.platform;
  if (platform === 'linux') return detectVramLinux();
  if (platform === 'darwin') return detectVramMac();
  return null;
}

function formatVramChip(vram) {
  if (!vram) return null;
  if (vram.used_mb < 0) return `${(vram.total_mb / 1024).toFixed(1)}GB shared`;
  return `${(vram.used_mb / 1024).toFixed(1)}GB / ${(vram.total_mb / 1024).toFixed(0)}GB`;
}

module.exports = { getVram, formatVramChip };
```

### 3.2 Wire em statusline-multi.js

Junto ao `🎮 RTX 4090` chip:
```javascript
const { getVram, formatVramChip } = require('./vram_detect.js');
const vram = getVram();
const vramStr = formatVramChip(vram);
const gpuChip = gpu ? (vramStr ? `🎮 ${gpu} (${vramStr})` : `🎮 ${gpu}`) : null;
```

**Cache**: VRAM detect spawn é lento (~50-200ms). Cache resultado em memory por 5s.

### 3.3 Tests

`tools/router/tests/vram-detect.test.js` (NEW):
- Mock nvidia-smi output → parse correctly
- nvidia-smi fail → return null (NOT inventar)
- formatVramChip(null) → null
- formatVramChip({used:12400, total:24576}) → "12.1GB / 24GB"

## 4. Sub-feature 2 — Quantização tooltip

### 4.1 Behaviour

Substituir `quant Q4_K_M` por:
```
quant Q4_K_M (-73% size · ~99% quality vs FP16)
```

Values verifiable:
- Q4_K_M ~28% size vs FP16 → -72% size reduction (Ollama docs)
- Quality preservation ~99% on chat benchmarks (conservative, Ollama community)

### 4.2 Implementação

`tools/router/quantization.js` (W2.8) — extend:

```javascript
const QUANT_INFO = {
  'FP16': { size_pct_vs_fp16: 100, quality_pct: 100 },
  'Q8_0': { size_pct_vs_fp16: 53, quality_pct: 99.9 },
  'Q6_K': { size_pct_vs_fp16: 41, quality_pct: 99.5 },
  'Q5_K_M': { size_pct_vs_fp16: 35, quality_pct: 99 },
  'Q4_K_M': { size_pct_vs_fp16: 28, quality_pct: 99 },
  'Q4_0': { size_pct_vs_fp16: 28, quality_pct: 97 },
  'Q3_K_M': { size_pct_vs_fp16: 23, quality_pct: 95 },
  'Q2_K': { size_pct_vs_fp16: 18, quality_pct: 88 }
};

function formatQuantChipDetailed(quant) {
  const info = QUANT_INFO[quant];
  if (!info) return `quant ${quant}`;
  const sizeReduction = 100 - info.size_pct_vs_fp16;
  return `quant ${quant} (-${sizeReduction}% size · ~${info.quality_pct}% quality vs FP16)`;
}

function formatQuantChipCompact(quant) {
  return `quant ${quant}`;
}
```

Render detailed when `COLUMNS >= 140`, compact otherwise.

### 4.3 Tests

- formatQuantChipDetailed('Q4_K_M') → "quant Q4_K_M (-72% size · ~99% quality vs FP16)"
- Unknown quant → fallback "quant XYZ"
- Compact mode quando COLUMNS < 140

## 5. Sub-feature 3 — Context window bar

### 5.1 Behaviour

Substituir `ctx 23%` por bar visual:
```
ctx [████░░░░░░] 23%
```

Cores ANSI:
- Verde 0-50%
- Amarelo 50-80%
- Vermelho 80-100%

### 5.2 Implementação

`tools/router/statusline-multi.js` — extend:

```javascript
function ctxBar(pct) {
  const width = 10;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = pct < 50 ? '\x1b[32m' : pct < 80 ? '\x1b[33m' : '\x1b[31m';
  return `ctx [${color}${bar}\x1b[0m] ${pct}%`;
}
```

### 5.3 Tests

- ctxBar(0) → "ctx [░░░░░░░░░░] 0%"
- ctxBar(100) → "ctx [██████████] 100%"
- ctxBar(50) → contém amarelo \x1b[33m
- ctxBar(90) → contém vermelho \x1b[31m

## 6. Sub-feature 4 — `mooter explain` comando

### 6.1 Behaviour

```bash
$ mooter explain statusline

🐮 Mooter statusline guide

Line 1 (macro · cumulative session info):
  🐮 mooter saved $X (Y%)
     ↳ cumulative session savings vs T3-default
  T2 sonnet 0.65
     ↳ current tier (T0/T1/T2/T3) · model · confidence (0-1)

Line 2 (current state):
  🐂 · 🐄 · 🦬 · 🦌 · 🐎
     ↳ glyph by tier (cow/bull/bison/deer/horse)
  🏠 local ×4
     ↳ 4 calls used local Ollama (free)
  🐄 last10: T0:1 T1:1 T2:3 T3:5
     ↳ tier distribution of last 10 prompts
  🎮 RTX 4090 (12.4GB / 24GB)
     ↳ GPU + VRAM usage
  100% 5h
     ↳ Anthropic quota remaining (5h window)
  quant Q4_K_M (-72% size · ~99% quality)
     ↳ quantization (smaller file, slight quality loss vs FP16)
  ctx [██░░░░░░░░] 23%
     ↳ context window used in current Claude Code session
  adapter ◌ baseline
     ↳ no LoRA active (run `mooter forge install` to add)

To hide any chip: mooter quiet --hide-<chip-name>
Available hide flags: --hide-vram --hide-quant --hide-ctx --hide-adapter
```

### 6.2 Implementação

`packages/cli/src/commands/explain.ts` (NEW):

```typescript
export async function runExplain(args: { topic: string }): Promise<void> {
  if (args.topic !== 'statusline') {
    console.log('Available topics: statusline');
    process.exit(1);
  }
  console.log(STATUSLINE_GUIDE);
}

const STATUSLINE_GUIDE = `... (markdown above) ...`;
```

### 6.3 Tests

- `mooter explain statusline` retorna guide
- Unknown topic → list available

## 7. Sub-feature 5 — Hide flags

### 7.1 Behaviour

Extend `mooter quiet`:
```bash
mooter quiet --hide-vram        # hide VRAM in statusline
mooter quiet --hide-quant       # hide quantization
mooter quiet --hide-ctx         # hide context bar
mooter quiet --hide-adapter     # hide adapter chip
mooter quiet --show-all         # re-enable all
```

### 7.2 Implementação

Extend `~/.mooter/preferences.json`:
```json
{
  "hidden_chips": ["vram", "quant"]
}
```

Statusline lê prefs e omite chips listados.

### 7.3 Tests

- `mooter quiet --hide-vram` adiciona "vram" a hidden_chips
- statusline render sem o chip listado
- `--show-all` limpa hidden_chips

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev tools/router/adapter_selection.js            # signature pattern
git diff dev tools/router/glyphs.js                       # unchanged
git diff dev hub/ landing/                                # VAZIO

# nvidia-smi NÃO obrigatório (tests use mocks)
grep -rn 'nvidia-smi\|fetch\|http' tools/router/vram_detect.js  # só nvidia-smi
```

## 9. Tests aggregate

- Pre-W5 D3: CLI 156, router 114
- W5 D3: +18 (vram 4 + quant 3 + ctx 3 + explain 2 + hide 4 + integration 2)
- Total: ~188 verdes

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave5-d3-statusline-v2 vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + glyphs + mooter_event INTACTOS
- hub/ + landing/ NOT touched
- vram_detect.js: graceful fallback (null) se nvidia-smi falhar — NÃO inventa
- quantization values verifiable (Q4_K_M -72% size · 99% quality são Ollama docs)
- ctxBar: cores threshold correctas
- mooter explain statusline: descritivo + accurate
- hide flags persist + statusline respeita
- ~188 tests verdes
- Vocabulário GLOSSARY
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave5-d3-statusline-v2
PR=$(gh pr create --base dev --title "Wave 5 D3: Statusline V2 (VRAM + quant tooltip + ctx bar + explain + hide flags)" --body-file - <<'EOF'
## Summary
5 sub-features que clarificam a statusline para vibe coder novo:
- VRAM chip (nvidia-smi · graceful fallback)
- Quantização tooltip (-72% size · 99% quality vs FP16 · verifiable)
- Context window bar (visual ANSI cores)
- mooter explain statusline (educational mode)
- Hide flags (mooter quiet --hide-<chip>)

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost + adapter_selection + glyphs + schemas INTACTOS ✓
- hub/ + landing/ NOT touched ✓
- ZERO inventar (VRAM null se nvidia-smi falhar)

## Honesty
- Quantization values: Ollama docs verifiable
- VRAM graceful skip
- ctxBar uses real session context (no mock)

## Tests
- ~188 verdes (+18)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure D3

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter explain statusline
mooter quiet --help
mooter quiet --hide-vram && cat ~/.mooter/preferences.json | grep hidden_chips
mooter quiet --show-all

# Tag
git tag -a v0.5.2-statusline-v2 -m "Wave 5 D3: Statusline V2 (VRAM + quant tooltip + ctx bar + explain + hide flags)"
git push origin v0.5.2-statusline-v2
```

+ Notion sub-page + SYNC.md + memória.

## 13. Resumo final

```
✅ Wave 5 D3 — Statusline V2 COMPLETA
- Branch: wave5-d3-statusline-v2 (merged)
- 5 sub-features: VRAM + quant tooltip + ctx bar + explain + hide flags
- Tests: ~188 verdes
- Tag: v0.5.2-statusline-v2
- P11 + invariants OK
- ZERO inventar (graceful fallbacks em tudo)

⏸ Para. Próximo: Wave 5 D4 (bash badge always-on investigation + threshold).
```

=== END ===
