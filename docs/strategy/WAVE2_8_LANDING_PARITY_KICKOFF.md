# Wave 2.8 — Landing Parity (terminal cumpre a promessa do landing)

> **Como usar**: cola tudo abaixo de `=== START ===` num Claude Code em `~/mooter/`. Self-contained.
>
> **Quando correr**: APÓS Wave 2.6 fechar (tag `v0.2.2-reveal`) e Wave 2.7 fechar (tag `v0.2.7-audit`). NÃO antes.
>
> **O que faz**: aproxima o terminal real ao mockup do landing mooter.ai. Endereça 8 pontos identificados pelo Paulo 2026-05-30 (gap entre promessa visual e statusline real).

**Pré-requisitos verificados**:
- ✅ Wave 2.6 fechada (tag `v0.2.2-reveal` em dev)
- ✅ Wave 2.7 fechada (tag `v0.2.7-audit` em dev)
- ✅ Hardware probe existe em `packages/cli/src/commands/init.ts` (escreve `profile.json` com gpu, ram, cpu)
- ✅ Statusline 2-line existe (Wave 2.6 D2)
- ✅ Glyph map existe (Wave 2.6 D3)
- ✅ Moo card existe (Wave 2.6 D3)
- ✅ `mooter dashboard` TUI existe (Wave 2.6 D2)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code (Opus 4.8 idealmente) no `~/mooter/`, branch `wave2.8-landing-parity` (a criar de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 2.8**: terminar a aproximação visual entre o terminal real e o landing mockup. 5 sub-features num único PR para `dev`.

Lê primeiro:
- `landing/design-handoff/IMPLEMENTATION_SPEC.md` (se existir) — referência visual canónica do landing
- `docs/strategy/SHOWCASE_AUDIT.md` §1 (persona Hard Vibe Coder)
- `docs/strategy/GLOSSARY.md` (vocabulário Mooter/Moos)

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** schema `mooter_event.ts` (W2 D4)
- ❌ **NUNCA inventar LoRA** — sempre "none yet · Adapter Forge ships Wave 5"
- ❌ **NUNCA inventar quantization** — Q4_K_M é baseline real, declarar
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE (autorizado por Paulo)
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Anti-hyperbole**: zero "revolutionary", "magic", "AI-powered"

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma v0.2.7-audit no topo
git tag -l | grep v0.2.7
git checkout -b wave2.8-landing-parity
```

Recon:
- `tools/router/statusline-multi.js` — onde adicionar GPU chip + quant chip + adapter chip
- `packages/cli/src/commands/init.ts` — hardware probe (já escreve `profile.json` com `gpu` field)
- `~/.mooter/profile.json` — schema actual (lê para entender gpu format)
- `tools/router/glyphs.js` — adicionar glyphs novos se necessário
- `packages/cli/src/commands/dashboard.ts` — adicionar GPU + quant + adapter sections

## 3. Sub-feature 1 — GPU info visível (Ponto #1)

### 3.1 Behaviour

Statusline line 2 mostra GPU detectada do `profile.json`. Se inexistente (no GPU), omite.

**Formato**:
```
🐂 sonnet ☁ 0.84 · 🏠 qwen3:7b ×6 · 🎮 RTX 4090 · ctx 23% · 100% 5h · ...
```

Em compact mode (`COLUMNS < 120`): GPU sai (line 2 não renderiza).

### 3.2 Implementação

`tools/router/statusline-multi.js`:
```javascript
function readGpuFromProfile() {
  try {
    const profilePath = path.join(os.homedir(), '.mooter/profile.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile.gpu || null;  // e.g., "NVIDIA RTX 4090" or null
  } catch {
    return null;
  }
}

function formatGpuChip(gpu) {
  if (!gpu) return null;
  // Strip "NVIDIA " prefix for compactness
  const compact = gpu.replace(/^NVIDIA\s+/i, '').replace(/^Apple\s+/i, '');
  return `🎮 ${compact}`;
}
```

Inject em line 2 entre `local Moos count` e `ctx`.

### 3.3 Tests

```javascript
test('GPU chip rendered when profile has gpu', () => {
  mockProfile({ gpu: 'NVIDIA RTX 4090' });
  expect(renderTwoLine(state)).toMatch(/🎮 RTX 4090/);
});

test('GPU chip omitted when profile has no gpu', () => {
  mockProfile({ gpu: null });
  expect(renderTwoLine(state)).not.toMatch(/🎮/);
});

test('GPU chip omitted in compact mode', () => {
  process.env.COLUMNS = '100';
  expect(render(state)).not.toMatch(/🎮/);
});
```

## 4. Sub-feature 2 — Context window com barra visual (Ponto #2)

### 4.1 Behaviour

Statusline line 2: substitui `ctx 23%` (texto) por **mini-barra ASCII** + percentagem.

**Formato**:
```
ctx [████░░░░░░] 23%
```

Largura mini-barra: 10 chars. Cores ANSI: verde 0-50%, amarelo 50-80%, vermelho 80-100%.

Em compact mode: usa só `ctx 23%` (texto).

### 4.2 Implementação

`tools/router/statusline-multi.js`:
```javascript
function ctxBar(pct) {
  const width = 10;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = pct < 50 ? '\x1b[32m' : pct < 80 ? '\x1b[33m' : '\x1b[31m';
  return `ctx [${color}${bar}\x1b[0m] ${pct}%`;
}
```

### 4.3 Tests

```javascript
test('ctxBar at 0% renders empty', () => {
  expect(ctxBar(0)).toContain('░░░░░░░░░░');
});

test('ctxBar at 100% renders full', () => {
  expect(ctxBar(100)).toContain('██████████');
});

test('ctxBar color: green < 50, yellow < 80, red >= 80', () => {
  expect(ctxBar(25)).toContain('\x1b[32m');  // green
  expect(ctxBar(65)).toContain('\x1b[33m');  // yellow
  expect(ctxBar(90)).toContain('\x1b[31m');  // red
});
```

## 5. Sub-feature 3 — Savings por bash command (Ponto #5)

### 5.1 Behaviour

Extender o badge `[T2·sonnet·0.84]` (Wave 2.5 D3 / Wave 2.6 D3) para incluir savings.

**Formato**:
```
[🐂 sonnet ☁ 0.84 · saved $0.034]
```

Onde `$0.034` = `(cost_baseline_T3 - cost_actual_thisTier)` se aplicável. Se T3 (não há savings vs default), omite.

### 5.2 Implementação

`tools/router/inject_context.js`:
```javascript
function badgeWithSavings(decision, savings) {
  const base = `${decision.glyph} ${decision.model} ${decision.providerGlyph} ${decision.confidence}`;
  if (decision.tier === 'T3' || !savings || savings <= 0) {
    return `[${base}]`;
  }
  return `[${base} · saved $${savings.toFixed(3)}]`;
}
```

### 5.3 Tests

```javascript
test('badge with savings when T0/T1/T2', () => {
  expect(badgeWithSavings({ tier: 'T0', /* ... */ }, 0.045))
    .toMatch(/saved \$0\.045/);
});

test('badge without savings when T3', () => {
  expect(badgeWithSavings({ tier: 'T3', /* ... */ }, 0))
    .not.toMatch(/saved/);
});
```

## 6. Sub-feature 4 — Quantização indicador visual (Ponto #7)

### 6.1 Behaviour

Adicionar chip de quantization na statusline line 2 + Moo card.

**Statusline line 2** (no fim, antes de pack):
```
... · quant Q4_K_M · pack: diagram-systems
```

**Moo card** (linha nova):
```
 quant     Q4_K_M (baseline · -73% vs FP16)
```

### 6.2 Honestidade

Q4_K_M é baseline real desde 2026-04-15 (já documentado em Wave 2.6 D3 trail --evolution). Mostrar com claim verificável: "-73% vs FP16" é número real para Q4_K_M em qwen3:7b (Ollama default). Verifica via web se mudou (ollama docs).

**Não inventar**: se for outro modelo (qwen3:30b usa Q4_K_M também por default), declarar o mesmo. Se utilizador trocou para Q8 ou FP16, declarar isso.

### 6.3 Implementação

`packages/router/src/quantization.ts` (NEW):
```typescript
export function detectQuantization(modelName: string): { format: string; reduction_vs_fp16: number } {
  // Ollama default for most models: Q4_K_M
  // For deepseek/qwen3 specific: check ollama show <model> | grep quantization
  // Fallback: Q4_K_M baseline
  return { format: 'Q4_K_M', reduction_vs_fp16: 73 };
}
```

Implementação real: spawn `ollama show <model>` para detectar quant real do modelo activo. Fallback Q4_K_M se falha.

### 6.4 Tests

```javascript
test('detectQuantization returns Q4_K_M for known models', () => {
  expect(detectQuantization('qwen3:7b').format).toBe('Q4_K_M');
});

test('quant chip in statusline line 2', () => {
  expect(renderTwoLine(state)).toMatch(/quant Q4_K_M/);
});

test('quant in Moo card', () => {
  expect(buildMooCard(stats)).toMatch(/quant\s+Q4_K_M/);
  expect(buildMooCard(stats)).toMatch(/baseline.*-73% vs FP16/);
});
```

## 7. Sub-feature 5 — LoRA visibility honest (Ponto #8)

### 7.1 Behaviour

Adapter chip já existe na statusline (Wave 2.5 D2 — `adapter: ◌`). Tornar mais explícito.

**Statusline line 2** (no fim):
```
... · adapter ◌ baseline (LoRA: Wave 5)
```

**Moo card** (linha nova):
```
 adapter   ◌ baseline · LoRA arrives Wave 5 (Adapter Forge)
```

**Dashboard** ADAPTER section:
```
ADAPTER · ◌ baseline (no LoRA yet · Adapter Forge ships Wave 5)
  projects with custom LoRA: 0
  packs with custom LoRA: 0
  ETA: Wave 5 (~Q3 2026 per roadmap)
```

### 7.2 Honestidade

NUNCA inventar LoRA performance. Quando Wave 5 shippa, substituir por números reais. Até lá: "none yet" com data esperada.

### 7.3 Implementação

`tools/router/statusline-multi.js`:
```javascript
function adapterChip(adapter) {
  if (!adapter || adapter === 'baseline') {
    return 'adapter ◌ baseline (LoRA: Wave 5)';
  }
  return `adapter ${adapter.glyph} ${adapter.name}`;
}
```

`packages/cli/src/commands/dashboard.ts`:
```typescript
function renderAdapterSection() {
  return [
    '  ADAPTER · ◌ baseline (no LoRA yet · Adapter Forge ships Wave 5)',
    '    projects with custom LoRA: 0',
    '    packs with custom LoRA: 0',
    '    ETA: Wave 5 (~Q3 2026 per roadmap)'
  ].join('\n');
}
```

### 7.4 Tests

```javascript
test('adapter chip honest when baseline', () => {
  expect(adapterChip(null)).toBe('adapter ◌ baseline (LoRA: Wave 5)');
});

test('Moo card declares LoRA wave 5', () => {
  expect(buildMooCard(stats)).toMatch(/adapter.*◌ baseline.*LoRA arrives Wave 5/);
});

test('dashboard ADAPTER section honest', () => {
  expect(renderAdapterSection()).toMatch(/no LoRA yet.*Adapter Forge ships Wave 5/);
});
```

## 8. Updated statusline 2-line layout (consolidado)

```
🐮 Mooter · saved $0.27 (89%) · turn $0.012 · alltime $4.21 · last10: T0×6 T1×2 T2×2
🐂 sonnet ☁ 0.84 · 🏠 qwen3:7b ×6 · 🎮 RTX 4090 · ctx [████░░░░░░] 23% · 100% 5h · quant Q4_K_M · pack: diagram-systems · adapter ◌
```

Total sinais line 2: 9 (era 6 na Wave 2.6 D2). Compact mode (< 120 cols): line 1 only.

## 9. Updated Moo card layout (consolidado)

```
─────── 🐮 Moo card ───────
 model     🐂 sonnet ☁ (T2)
 tokens    in 1.2k · out 384
 latency   1.8s
 cost      $0.012 turn · saved $0.034 vs T3-default
 bash      3 calls (🐄 qwen3:7b ×2 · 🐂 sonnet ×1)
 ctx       24% used
 quant     Q4_K_M (baseline · -73% vs FP16)
 adapter   ◌ baseline · LoRA arrives Wave 5 (Adapter Forge)
───────────────────────────
```

## 10. Updated dashboard ADAPTER section

Section ADAPTER (substituí Wave 2.6 D2 placeholder por versão honest):
```
  ADAPTER · ◌ baseline (no LoRA yet · Adapter Forge ships Wave 5)
    projects with custom LoRA: 0
    packs with custom LoRA: 0
    ETA: Wave 5 (~Q3 2026 per roadmap)
```

## 11. Tests aggregate

Após Wave 2.8:
- Pre-W2.8 (W2.7 closure): ~127 + audit reports
- W2.8: +20 tests (GPU chip, ctxBar, badge savings, quantization, adapter honest, integration)
- Total: ~147

## 12. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.8-landing-parity vs dev.

Verifica:
- classify.js byte-identical (P11)
- mooter_event.ts schema INTACTO
- Day 1/2/3 W2.6 + W2.7 audit INTACTOS
- GPU chip: lê profile.json, fallback graceful se gpu=null
- ctxBar: 10-char width, cores verde/amarelo/vermelho por threshold
- Badge savings: omitido para T3, presente T0/T1/T2 com decimal
- Quantization: detectQuantization fallback Q4_K_M, NUNCA inventa
- LoRA honesty: 'none yet · Adapter Forge ships Wave 5' em 3 sítios
- Statusline 2-line: 9 chips, ANSI reset, fallback 1-line
- Moo card: 8 linhas (model, tokens, latency, cost, bash, ctx, quant, adapter)
- Dashboard ADAPTER: honest disclosure
- Vocabulário GLOSSARY (Mooter/Moos)
- ~147 tests verdes
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 13. PR + auto-merge

```bash
git push -u origin wave2.8-landing-parity
PR_URL=$(gh pr create --base dev --title "Wave 2.8: Landing parity (GPU + ctx bar + bash savings + quant + LoRA honesty)" --body-file - <<'EOF'
## Summary
5 sub-features Wave 2.8 (alinhar terminal com landing mockup):

1. **GPU info visible** — `🎮 RTX 4090` chip na statusline line 2 (lê profile.json)
2. **Context bar visual** — `ctx [████░░░░░░] 23%` com cores threshold
3. **Bash savings per command** — `[🐂 sonnet ☁ 0.84 · saved $0.034]`
4. **Quantization indicator** — `quant Q4_K_M` chip + Moo card "(-73% vs FP16)"
5. **LoRA honest disclosure** — `adapter ◌ baseline (LoRA: Wave 5)` em statusline + Moo card + dashboard

## Endereça
8 pontos identificados pelo Paulo 2026-05-30 (gap landing vs terminal):
- ✅ #1 GPU visible
- ✅ #2 ctx bar visual
- ✅ #5 bash savings
- ✅ #7 quantization indicator
- ✅ #8 LoRA visibility (honest)
- (#3 local Moos, #4 tier mix, #6 economia já cobertos Wave 2.5/2.6)

## Honesty preserved
- LoRA: "none yet · Adapter Forge ships Wave 5" (3 sítios)
- Quantization: Q4_K_M baseline (real, verificável via Ollama)
- Nenhuma fake telemetry

## Tests
- Pre-W2.8: ~127 + audit · W2.8: +20 · Total: ~147 verdes
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
)
PR_NUM=$(echo "$PR_URL" | grep -oP '\d+$')

# Auto-merge para dev
sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 14. Closure Wave 2.8

```bash
git checkout dev
git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter --help && mooter dashboard --help

# Tag
git tag -a v0.2.8-parity -m "Wave 2.8: Landing parity — GPU + ctx bar + bash savings + quant + LoRA honest"
git push origin v0.2.8-parity
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave2_8_shipped.md`.

## 15. Resumo final

```
✅ Wave 2.8 — Landing Parity COMPLETA
- Branch: wave2.8-landing-parity (merged)
- 5 sub-features: GPU · ctx bar · bash savings · quant · LoRA honest
- Tests: ~147 verdes
- Tag: v0.2.8-parity
- Cost: $<X>

🎯 8/8 pontos do Paulo endereçados:
  ✅ #1 GPU · ✅ #2 ctx bar · ✅ #3 local Moos · ✅ #4 tier mix
  ✅ #5 bash savings · ✅ #6 economia · ✅ #7 quant · ✅ #8 LoRA honest

Terminal agora cumpre a promessa do landing mooter.ai.

Próximo: Wave 3 (activation + hub) — aguarda Paulo compor WAVE3_D1_KICKOFF.md.
```

=== END ===
