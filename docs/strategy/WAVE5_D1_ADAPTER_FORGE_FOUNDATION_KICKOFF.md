# Wave 5 Day 1 — Adapter Forge Foundation (recon + manifest + honest stub)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.4.2-cf-backend` em dev. Working dir = `~/mooter`.
>
> **⚠️ LIÇÃO 3× confirmada (W4 B/C/D)**: NÃO assumir greenfield. Recon obrigatório PRIMEIRO. Reportar ao Paulo antes de implementar. Se descobrires que algo já existe (ex.: `hub/router-tuning` cron, ou pack LoRA infra escondida), adaptar.
>
> **Esta wave é FOUNDATION** — NÃO LoRA real. Wave 5 D2+ implementa training. D1 estabelece estrutura para receber LoRA quando shippa.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave5-d1-adapter-forge-foundation` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 5 D1**: shippar 5 sub-features de FOUNDATION para Adapter Forge — manifest schema + runtime selection stub + honest CLI + ADR sobre tech approach. **NÃO** ainda fine-tuning real (D2+).

### Recon OBRIGATÓRIO antes de qualquer código (lição 3×)

Lê primeiro (sem modificar):
- `hub/wrangler.toml` + procura `router-tuning` cron job (W4 D revelou existir)
- `hub/` directory: `find hub -name '*.js' -o -name '*.sql' | xargs grep -l -i 'lora\|adapter\|tune' 2>/dev/null`
- `packages/router/src/` — procura "adapter", "lora", "tune"
- `tools/router/safety_boost.js` (W3 D1) + `glyphs.js` (W2.6 D3) — `adapter` chip já existe
- `~/.mooter/preferences.json` — campos `adapter_*` existem?
- `packages/cli/src/commands/quiet.ts` — toggles existentes
- Verifica se `Ollama` suporta LoRA loading (provavelmente sim via Modelfile) — `ollama show qwen2.5:3b` se disponível

**Reporta a tua leitura ao Paulo antes de implementar.** Se descobrires que router-tuning cron job no hub já implementa parte do que estamos a planear, propõe adaptação.

5 sub-features (ASSUMINDO greenfield no Adapter side — adaptar conforme recon):

1. **ADR sobre tech approach** — `docs/adr/020-adapter-forge-approach.md` (NEW) explicando: Ollama LoRA via Modelfile? Python/PyTorch externo? hub/router-tuning extension? Decisão fundamentada + trade-offs
2. **`mooter_adapter` manifest schema** — JSON shape canónica para "adapter installed/active"
3. **Adapter runtime stub** — `tools/router/adapter_selection.js` (NEW) que retorna `null` (baseline) hoje, com hook para Wave 5 D2 substituir
4. **`mooter adapter` CLI** — `list` / `show` / `activate <id>` / `deactivate` comandos (todos honest stub: "no adapters installed yet — Wave 5 D2 ships training")
5. **Honest baseline disclosure update** — quando `adapter_selection` retorna null, mostra "◌ baseline · forge ships D2"; placeholder explícito de quando shippa

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js critical phrases preserved** (W3 D1) — adapter_selection é layer SEPARADO
- ❌ **mooter_event + sync_event schemas v1 INTACTOS**
- ❌ **hub/ produção INTACTO** — D1 NÃO toca
- ❌ **landing/ Phase A+B+C INTACTO**
- ❌ **NÃO inventar LoRA performance** — quando baseline, dizer baseline; quando D2+ tiver real, mostrar real
- ❌ **NÃO instalar Python deps** sem ADR aprovar primeiro (Mooter é JS/TS native)
- ❌ **NÃO chamar APIs externas de training** (HuggingFace, Replicate, etc.) — D1 é offline
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.5.0-adapter-foundation**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: ADR + manifests claros + "Wave 5 D2 ships training" em todas as stubs

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma e2eb50f + tag v0.4.2-cf-backend
git tag -l | grep v0.5.
git checkout -b wave5-d1-adapter-forge-foundation
```

Recon obrigatório:
```bash
# Hub side
ls hub/
grep -rn 'router-tuning\|lora\|adapter\|tune\|fine' hub/ --include='*.js' --include='*.toml' --include='*.sql' 2>/dev/null | head -50

# Mooter side
grep -rn 'adapter\|lora' packages/ tools/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v '◌ baseline' | head -30

# Glyph + statusline (sabes que adapter ◌ chip existe)
grep -rn 'adapter' tools/router/statusline-multi.js tools/router/glyphs.js packages/cli/src/commands/dashboard.ts 2>/dev/null

# Ollama capability
which ollama && ollama --version 2>/dev/null

# preferences.json fields
cat ~/.mooter/preferences.json 2>/dev/null | head -20
```

## 3. Sub-feature 1 — ADR sobre tech approach

### 3.1 Decisão fundamentada

`docs/adr/020-adapter-forge-approach.md` (NEW):

```markdown
# ADR 020 — Adapter Forge Approach

## Status
Proposed (Wave 5 D1)

## Context

Mooter tem disclosure "◌ baseline · LoRA: Wave 5" desde Wave 2.6 D3. Wave 5 promete LoRA real. Precisamos escolher como implementar.

## Decision drivers

1. **Stack**: Mooter é JS/TS native. Adicionar Python = nova dependência runtime.
2. **Privacy**: Paulo's vision = local-first. Training local > cloud.
3. **Ollama**: Já é o backbone local. Suporta LoRA via Modelfile + adapter merge.
4. **Hub**: Já tem cron `router-tuning` (W4 D recon revelou). Pode ser usado.
5. **Time-to-ship**: D1 = foundation. D2 = first real adapter.

## Options considered

### A. Ollama LoRA via Modelfile (recommended)
- Pros: Native stack, zero Python deps, GPU local, full privacy
- Cons: Limited LoRA training (Ollama é runtime, não trainer)
- Trade-off: requires external trainer (e.g., unsloth via Docker) to produce .gguf adapter, então Ollama loads

### B. Python/PyTorch externo (unsloth / mlx)
- Pros: Mais controlo, melhor para R&D
- Cons: Nova stack, install heavy
- Trade-off: Complica install para users casuais

### C. hub/router-tuning extension
- Pros: Centraliza tuning no backend
- Cons: Cloud-side training quebra "local-first"; precisa GPU em hub
- Trade-off: Não recomendado para Mooter ethos

### D. Híbrida: A para inference, opção externa (Docker unsloth) para training opcional
- Pros: Default = Ollama puro; advanced users podem treinar via Docker
- Cons: 2 código paths
- **Selected** porque preserva local-first sem forçar install pesada para 90% users

## Decision

**Híbrida (Option D)**:
- D1 (this wave): Foundation = manifests + runtime stub + CLI scaffold
- D2: Implementa `mooter forge` CLI que aceita `.gguf adapter` files (user-provided) + valida + activa
- D3+: Optional Docker unsloth integration para users que querem treinar localmente

## Consequences

Positive:
- Zero Python deps por default
- Users avançados não bloqueados
- Mooter ethos preservado (local-first)

Negative:
- Wave 5 D1+D2 ships sem training automation
- Users básicos precisam aceitar "baseline" mais tempo
- Adapter Forge "auto-train" só virá em D3+

## Honest disclosure (mantém em statusline)

Pre-D2: `adapter ◌ baseline (forge ships Wave 5 D2)`
Post-D2 sem adapter activo: `adapter ◌ baseline (run mooter forge --help)`
Post-D2 com adapter activo: `adapter 🔧 {adapter_name} (validated · Q4_K_M)`
```

### 3.2 Tests

- ADR existe + linked do README

## 4. Sub-feature 2 — `mooter_adapter` manifest schema

### 4.1 Schema

`packages/router/src/adapter/adapter_manifest.ts` (NEW):

```typescript
export interface AdapterManifestV1 {
  schema_version: 1;
  adapter_id: string;          // sha256-truncated hash of .gguf file
  name: string;                // user-friendly, e.g., "diagram-systems-v1"
  domain?: string;             // optional: which pack/domain it specializes
  base_model: string;          // e.g., "qwen2.5:3b" — must match Ollama-loaded base
  
  adapter_type: 'lora' | 'dora' | 'full-finetune';
  quantization: 'fp16' | 'q8_0' | 'q4_k_m';  // matches Mooter quant tier
  
  source: 'user-provided' | 'mooter-forge';  // who created it
  training_data?: {
    seed_count: number;
    examples_count: number;
    sha256: string;  // training corpus hash for reproducibility
  };
  
  performance?: {  // OPTIONAL — only if validated
    benchmark_run_id: string;
    accuracy_delta: number;  // vs baseline (+0.05 = 5% better)
    inference_speed_factor: number;  // 1.0 = same as baseline
    measured_at_utc: string;
  };
  
  installed_at_utc: string;
  file_path_pseudonymous: string;  // hashed local path
  signature: string;  // HMAC of manifest
}
```

### 4.2 Manifest storage

`~/.mooter/adapters/{adapter_id}/manifest.json`
`~/.mooter/adapters/{adapter_id}/adapter.gguf` (when user installs)

### 4.3 Tests

- Manifest validation
- Signature roundtrip
- Forbidden: `performance` inventado quando sem benchmark_run_id

## 5. Sub-feature 3 — Adapter runtime stub

### 5.1 Behaviour

`tools/router/adapter_selection.js` (NEW):

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Wave 5 D1 stub: SEMPRE retorna null (baseline). 
// D2+ substituirá por logic real que lê manifest.

function getActiveAdapter() {
  try {
    const prefsPath = path.join(os.homedir(), '.mooter/preferences.json');
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    
    if (!prefs.active_adapter_id) return null;
    
    // D1 stub: even if user manually sets active_adapter_id, return null
    // because D1 doesn't ship validation pipeline yet
    return null;  // Wave 5 D2: load manifest + validate + return adapter
  } catch {
    return null;
  }
}

function applyAdapterToDecision(decision, adapter) {
  if (!adapter) {
    return {
      ...decision,
      adapter_applied: false,
      adapter_id: null,
      adapter_reason: 'baseline (forge ships Wave 5 D2)'
    };
  }
  
  // D2+ logic — for now unreachable in D1
  return {
    ...decision,
    adapter_applied: true,
    adapter_id: adapter.adapter_id,
    adapter_name: adapter.name,
    adapter_reason: `validated adapter active (${adapter.adapter_type}, ${adapter.quantization})`
  };
}

module.exports = { getActiveAdapter, applyAdapterToDecision };
```

### 5.2 Wire em inject_context.js

Após `safety_boost`, antes do badge:
```javascript
const { getActiveAdapter, applyAdapterToDecision } = require('./adapter_selection.js');
const adapter = getActiveAdapter();
const final = applyAdapterToDecision(boosted, adapter);
// Use `final` para emit badge + decision log
```

### 5.3 Tests

- `getActiveAdapter` retorna null em D1 (mesmo com prefs.active_adapter_id setado manualmente)
- `applyAdapterToDecision(decision, null)` adiciona `adapter_applied: false`
- `applyAdapterToDecision(decision, adapterMock)` adiciona `adapter_applied: true` (futuro D2)

## 6. Sub-feature 4 — `mooter adapter` CLI

### 6.1 Comandos

```
mooter adapter list           # lista installed adapters
mooter adapter show <id>      # mostra manifest details
mooter adapter activate <id>  # activates an adapter
mooter adapter deactivate     # back to baseline
```

### 6.2 Behaviour D1 (todos honest stub)

`packages/cli/src/commands/adapter.ts` (NEW):

```typescript
export async function runAdapterList(): Promise<void> {
  const adaptersDir = path.join(homedir(), '.mooter/adapters');
  const manifests = await listAdapterManifests(adaptersDir);
  
  console.log('🐮 Mooter adapters\n');
  
  if (manifests.length === 0) {
    console.log('  ◌ No adapters installed yet.');
    console.log('  ℹ Adapter Forge ships training in Wave 5 D2.');
    console.log('  ℹ For now, you can manually place .gguf adapters in:');
    console.log('    ~/.mooter/adapters/<id>/');
    console.log('    See docs/adr/020-adapter-forge-approach.md for guidance.');
    return;
  }
  
  for (const m of manifests) {
    const active = (await getActiveAdapterId()) === m.adapter_id;
    console.log(`  ${active ? '✓' : ' '} ${m.name} (${m.adapter_type}/${m.quantization})`);
    console.log(`    id: ${m.adapter_id.slice(0, 12)}...`);
    console.log(`    domain: ${m.domain ?? 'general'}`);
    if (m.performance) {
      console.log(`    perf: ${(m.performance.accuracy_delta * 100).toFixed(1)}% vs baseline`);
    } else {
      console.log(`    perf: ◌ not benchmarked yet (run \`mooter adapter benchmark ${m.adapter_id.slice(0, 8)}\`)`);
    }
  }
}

export async function runAdapterActivate(adapterId: string): Promise<void> {
  // D1 stub: writes to preferences.json but adapter_selection.js returns null anyway
  const prefsPath = path.join(homedir(), '.mooter/preferences.json');
  const prefs = await readPrefs();
  prefs.active_adapter_id = adapterId;
  await writeFile(prefsPath, JSON.stringify(prefs, null, 2));
  
  console.log(`✓ Marked ${adapterId.slice(0, 12)}... as active.`);
  console.log('⚠ Wave 5 D1 disclaimer: runtime selection is stubbed.');
  console.log('   Adapter will be honored when Wave 5 D2 ships validation pipeline.');
  console.log('   Current statusline behaviour: still shows baseline.');
}
```

### 6.3 Tests

- `list` com 0 adapters → honest message + "Wave 5 D2 ships training"
- `activate` escreve prefs + warning "D1 stub"
- `show <id>` lê manifest + mostra fields

## 7. Sub-feature 5 — Honest disclosure update

### 7.1 Statusline (extend statusline-multi.js)

Quando `adapter_selection` retorna null:
- Actual: `adapter ◌ baseline (LoRA: Wave 5)`
- Update: `adapter ◌ baseline (forge ships Wave 5 D2)`

Quando user marcou active_adapter mas D1 ainda stub:
- `adapter ⏸ {short_id} (D2 will validate)`

Quando D2+ activou real:
- `adapter 🔧 {name} (validated)`

### 7.2 Moo card update

```
 adapter   ◌ baseline · forge ships Wave 5 D2 (Adapter Forge foundation)
```

### 7.3 Dashboard ADAPTER section update

```
  ADAPTER · ◌ baseline
    Foundation shipped Wave 5 D1
    Training pipeline ships Wave 5 D2
    Run `mooter adapter list` to see installed adapters
```

### 7.4 Tests

- All 3 sites mostram disclosure honest
- "Wave 5 D2 ships training" string present

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev packages/router/src/types.ts                 # schemas v1
git diff dev hub/                                         # VAZIO (não tocar produção)
git diff dev landing/                                     # VAZIO (Phase A+B+C)

# ADR existe
test -f docs/adr/020-adapter-forge-approach.md
```

## 9. Tests aggregate

- Pre-W5 D1: CLI 144 (W4 D)
- W5 D1: +15 (manifest 4 + adapter_selection 4 + CLI 4 + disclosure 3)
- Total: ~159 CLI verdes

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave5-d1-adapter-forge-foundation vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost.js + mooter_event + sync_event INTACTOS
- hub/ NOT touched
- landing/ NOT touched
- ADR 020 presente + linked + Option D selected
- adapter_selection.js: D1 SEMPRE retorna null (mesmo com prefs setado)
- mooter adapter list: honest empty state + 'Wave 5 D2 ships training'
- mooter adapter activate: warning 'D1 stub'
- Statusline + Moo card + dashboard: 'forge ships Wave 5 D2' present
- ZERO Python deps adicionadas (package.json check)
- ZERO chamadas externas (HuggingFace, Replicate, etc.)
- Vocabulário GLOSSARY
- Sem git add -A, sem --no-verify
- ~159 tests CLI verdes
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave5-d1-adapter-forge-foundation
PR=$(gh pr create --base dev --title "Wave 5 Day 1: Adapter Forge Foundation (ADR + manifest + runtime stub + CLI)" --body-file - <<'EOF'
## Summary
5 sub-features de FOUNDATION para Adapter Forge (Wave 5):
- ADR 020 (Hybrid: Ollama runtime + optional Docker training)
- adapter_manifest_v1 schema
- adapter_selection.js runtime stub (D1 sempre retorna null)
- mooter adapter list/show/activate/deactivate CLI (honest stubs)
- Honest disclosure update: "◌ baseline (forge ships Wave 5 D2)"

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost + schemas INTACTOS ✓
- hub/ + landing/ NOT touched ✓
- ZERO Python deps ✓
- ZERO external training APIs ✓

## Honesty
- adapter_selection.js D1 SEMPRE retorna null (mesmo com prefs ativadas) — sem fingir
- mooter adapter list mostra empty state honest
- activate warning 'D1 stub'
- Statusline: 'forge ships Wave 5 D2'
- ADR explica trade-offs + Option D selected

## Foundation, not real training
- D1 = foundation
- D2 = `mooter forge` CLI accepts user-provided .gguf adapters
- D3+ = optional Docker unsloth integration

## Tests
- CLI: 144 → 159 (+15)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next
- D2: `mooter forge` CLI + adapter validation pipeline
- D3+: Optional Docker training integration
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure D1

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter adapter list   # confirma honest empty state
mooter adapter --help

# Tag
git tag -a v0.5.0-adapter-foundation -m "Wave 5 D1: Adapter Forge Foundation (ADR + manifest v1 + runtime stub + CLI · D2 ships training)"
git push origin v0.5.0-adapter-foundation
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave5_d1_shipped.md`.

## 13. Resumo final

```
✅ Wave 5 Day 1 — Adapter Forge Foundation COMPLETA
- Branch: wave5-d1-adapter-forge-foundation (merged)
- 5 sub-features: ADR 020 · manifest v1 · runtime stub · CLI · honest disclosure
- Tests: ~159 CLI verdes
- Tag: v0.5.0-adapter-foundation
- P11 + safety_boost + schemas + hub/ + landing/ TODOS INTACTOS
- ZERO Python deps · ZERO external APIs

⏸ Para. Wave 5 D2 (mooter forge CLI · accepts user .gguf + validation pipeline) precisa novo kickoff.
```

=== END ===
