# Wave 5 Day 2 — Mooter Forge (validation pipeline + adapter activation)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.5.0-adapter-foundation` em dev. Working dir = `~/mooter`. Ollama instalado (`which ollama`).
>
> **⚠️ LIÇÃO 3× confirmada**: Recon obrigatório PRIMEIRO. Reportar ao Paulo. Adaptar se já existir.
>
> **Esta wave**: implementa o "F" do Adapter Forge — aceita `.gguf` user-provided + valida + activa runtime. NÃO ainda training automatic (D3+).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave5-d2-mooter-forge` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 5 D2**: shippar 6 sub-features que activam o pipeline forge user-provided:

1. **Manifest validation pipeline** — `validateManifest` + `verifyManifestSignature` + base-model match
2. **`mooter forge install <gguf-path>`** — aceita user `.gguf`, gera manifest, valida, copia para `~/.mooter/adapters/<id>/`
3. **`mooter forge benchmark <id>`** — corre adapter contra golden set (reusa W2.7 sim.ts harness), produz performance metrics REAIS
4. **adapter_selection REAL** — substitui stub D1 por logic real (valida → activa)
5. **NIT W5 D1 #1**: liga `validateManifest` à CLI antes de render `performance`
6. **NIT W5 D1 #2**: ADR 020 Proposed → Accepted (status update + rationale "D2 implements")

### Recon OBRIGATÓRIO

Lê primeiro:
- `packages/router/src/adapter/adapter_manifest.ts` (W5 D1) — schema v1
- `tools/router/adapter_selection.js` (W5 D1) — stub actual
- `packages/cli/src/commands/adapter.ts` (W5 D1) — list/show/activate/deactivate
- `audit/wave2-7-e2e-simulation/sim.ts` (W2.7) — golden harness para benchmark reuse
- `docs/adr/020-adapter-forge-approach.md` (W5 D1) — current Proposed status
- `which ollama && ollama --version` — confirma Ollama disponível
- Verificar se já existe `mooter forge` ou similar (improvável mas confirma)

**Reporta a tua leitura ao Paulo antes de implementar.**

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js critical phrases preserved**
- ❌ **mooter_event + sync_event + adapter_manifest v1 schemas INTACTOS**
- ❌ **hub/ produção INTACTO** · **landing/ Phase A+B+C INTACTO**
- ❌ **NÃO inventar performance** — só real measurements via benchmark
- ❌ **NÃO instalar Python deps** (ADR 020 Hybrid: Ollama runtime only)
- ❌ **NÃO chamar APIs externas de training** (HuggingFace, Replicate)
- ❌ **NÃO aceitar `.gguf` sem validação** — base_model match obrigatório
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.5.1-forge-validation**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: performance só após benchmark real · ADR Accepted only after D2 ships

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma a96f63b + tag v0.5.0-adapter-foundation
git tag -l | grep v0.5.
git checkout -b wave5-d2-mooter-forge

# Recon
ls packages/router/src/adapter/ 2>/dev/null
cat tools/router/adapter_selection.js
cat docs/adr/020-adapter-forge-approach.md | head -50
which ollama && ollama --version
ollama list 2>/dev/null | head
```

## 3. Sub-feature 1 — Manifest validation pipeline

### 3.1 Behaviour

`packages/router/src/adapter/validate.ts` (NEW):

```typescript
import { AdapterManifestV1 } from './adapter_manifest';
import { createHmac } from 'crypto';
import { existsSync } from 'fs';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateManifest(manifest: AdapterManifestV1, secret: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Schema version
  if (manifest.schema_version !== 1) {
    errors.push(`Unsupported schema_version: ${manifest.schema_version}`);
  }
  
  // 2. Required fields
  if (!manifest.adapter_id || !/^[a-f0-9]{8,64}$/.test(manifest.adapter_id)) {
    errors.push('adapter_id must be hex 8-64 chars');
  }
  if (!manifest.name || manifest.name.length > 64) {
    errors.push('name required, max 64 chars');
  }
  if (!manifest.base_model) {
    errors.push('base_model required');
  }
  if (!['lora', 'dora', 'full-finetune'].includes(manifest.adapter_type)) {
    errors.push(`unsupported adapter_type: ${manifest.adapter_type}`);
  }
  
  // 3. Performance honesty: if performance present, benchmark_run_id required
  if (manifest.performance && !manifest.performance.benchmark_run_id) {
    errors.push('performance present without benchmark_run_id (forbidden — would be invented)');
  }
  
  // 4. Signature verification
  const sigValid = verifyManifestSignature(manifest, secret);
  if (!sigValid) {
    errors.push('signature verification failed (tamper detected or wrong secret)');
  }
  
  // 5. Base model availability (warning, not error — Ollama may load later)
  if (manifest.base_model) {
    const available = await checkOllamaModel(manifest.base_model);
    if (!available) {
      warnings.push(`base_model "${manifest.base_model}" not loaded in Ollama (run: ollama pull ${manifest.base_model})`);
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

export function verifyManifestSignature(manifest: AdapterManifestV1, secret: string): boolean {
  const { signature, ...rest } = manifest;
  const payload = JSON.stringify(rest, Object.keys(rest).sort());
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return signature === expected;
}

async function checkOllamaModel(model: string): Promise<boolean> {
  try {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const proc = spawn('ollama', ['list'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', () => resolve(out.includes(model)));
      proc.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}
```

### 3.2 Tests

- Manifest válido + signature → valid: true
- Manifest com schema_version: 2 → error
- Manifest com performance sem benchmark_run_id → error
- Signature tamper → error
- Base model unavailable → warning (não error)

## 4. Sub-feature 2 — `mooter forge install <gguf-path>`

### 4.1 Behaviour

```bash
$ mooter forge install ./diagram-systems-v1.gguf --name diagram-systems-v1 --base-model qwen2.5:3b --type lora --domain diagram-systems

🔧 Mooter forge install
  source: ./diagram-systems-v1.gguf (12.4 MB)
  name: diagram-systems-v1
  base_model: qwen2.5:3b (✓ available in Ollama)
  adapter_type: lora
  quantization: q4_k_m (auto-detected)
  
Computing adapter_id (sha256)... 7a9f3b2c... ✓
Generating manifest... ✓
Signing manifest (HMAC)... ✓
Validating manifest...
  ✓ schema_version: 1
  ✓ signature verified
  ✓ base_model available
  ⓘ performance: not measured yet (run `mooter forge benchmark 7a9f3b2c`)
  
Copying to ~/.mooter/adapters/7a9f3b2c.../adapter.gguf...
Writing manifest to ~/.mooter/adapters/7a9f3b2c.../manifest.json...

✓ Installed adapter "diagram-systems-v1" (id: 7a9f3b2c...)
ℹ To activate: mooter forge activate 7a9f3b2c
ℹ To benchmark first (recommended): mooter forge benchmark 7a9f3b2c
```

### 4.2 Implementação

`packages/cli/src/commands/forge.ts` (NEW):

```typescript
import { readFile, mkdir, copyFile, writeFile, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { validateManifest } from '@mooter/router/adapter/validate';
import { signManifest } from '@mooter/router/adapter/sign';

export async function runForgeInstall(args: ForgeInstallArgs): Promise<void> {
  // 1. Read .gguf file
  const stats = await stat(args.ggufPath);
  const ggufContent = await readFile(args.ggufPath);
  
  // 2. Compute adapter_id (sha256 of file)
  const adapterId = createHash('sha256').update(ggufContent).digest('hex').slice(0, 16);
  
  // 3. Auto-detect quantization (heuristic: check filename for Q4_K_M, etc.)
  const quant = detectQuantization(args.ggufPath);
  
  // 4. Build manifest
  const manifest: AdapterManifestV1 = {
    schema_version: 1,
    adapter_id: adapterId,
    name: args.name,
    domain: args.domain,
    base_model: args.baseModel,
    adapter_type: args.type,
    quantization: quant,
    source: 'user-provided',
    installed_at_utc: new Date().toISOString(),
    file_path_pseudonymous: createHash('sha256').update(args.ggufPath).digest('hex').slice(0, 16),
    signature: ''  // computed next
  };
  
  // 5. Sign + validate
  const secret = await readLocalSecret();
  manifest.signature = signManifest(manifest, secret);
  
  const validation = await validateManifest(manifest, secret);
  if (!validation.valid) {
    console.log('✗ Validation failed:');
    validation.errors.forEach(e => console.log(`   ${e}`));
    process.exit(1);
  }
  
  validation.warnings.forEach(w => console.log(`ⓘ ${w}`));
  
  // 6. Copy .gguf + write manifest
  const adapterDir = join(homedir(), '.mooter/adapters', adapterId);
  await mkdir(adapterDir, { recursive: true });
  await copyFile(args.ggufPath, join(adapterDir, 'adapter.gguf'));
  await writeFile(join(adapterDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  console.log(`✓ Installed adapter "${args.name}" (id: ${adapterId})`);
  console.log(`ℹ To activate: mooter forge activate ${adapterId.slice(0, 8)}`);
  console.log(`ℹ Recommended: mooter forge benchmark ${adapterId.slice(0, 8)} first`);
}
```

### 4.3 Tests

- Install com valid .gguf → manifest gerado + signed + adapter copied
- Install com base_model não disponível → warning
- Install rejeita ficheiros não-.gguf
- Adapter_id determinístico (same .gguf → same id)

## 5. Sub-feature 3 — `mooter forge benchmark <id>`

### 5.1 Behaviour

Corre adapter contra golden set (reusa `audit/wave2-7-e2e-simulation/sim.ts` harness):

```bash
$ mooter forge benchmark 7a9f3b2c

🔧 Mooter forge benchmark — adapter "diagram-systems-v1"

Loading adapter into Ollama...
  → Creating Modelfile + adapter merge: qwen2.5:3b + adapter.gguf
  → ollama create diagram-systems-v1 -f Modelfile ... ✓

Running golden set (30 prompts from W2.7 SAFETY_GOLDEN + adapter domain set)...
  [1/30] design a sharding strategy → T3 ✓ (baseline: T0, BOOSTED: T3, adapter: T3)
  [2/30] review auth middleware → T2 ✓
  ...
  [30/30] complete

Results:
  total: 30 prompts
  baseline accuracy: 21/30 (70%)
  adapter accuracy: 27/30 (90%)
  accuracy_delta: +20% absolute (+28.6% relative)
  inference_speed: 1.08x baseline (8% slower — acceptable)
  
✓ Benchmark complete. benchmark_run_id: a4b3c2d1
Updated manifest:
  performance.benchmark_run_id: a4b3c2d1
  performance.accuracy_delta: +0.20
  performance.inference_speed_factor: 1.08
  performance.measured_at_utc: 2026-XX-XX
```

### 5.2 Implementação

`packages/cli/src/commands/forge.ts` runForgeBenchmark:

```typescript
export async function runForgeBenchmark(adapterId: string): Promise<void> {
  // 1. Load adapter manifest
  const manifest = await loadManifest(adapterId);
  if (!manifest) {
    console.log(`✗ Adapter ${adapterId} not found.`);
    process.exit(1);
  }
  
  // 2. Validate first (defence in depth)
  const validation = await validateManifest(manifest, await readLocalSecret());
  if (!validation.valid) {
    console.log('✗ Manifest invalid, cannot benchmark:');
    validation.errors.forEach(e => console.log(`   ${e}`));
    process.exit(1);
  }
  
  // 3. Create Ollama Modelfile + merge
  const modelfilePath = await createOllamaModelfile(manifest);
  await ollamaCreate(manifest.name, modelfilePath);
  
  // 4. Run golden set
  const goldenSet = await loadGoldenSet();  // reuse sim.ts harness
  const results = [];
  
  for (const item of goldenSet) {
    const baselineTier = await classifyWithModel(item.prompt, manifest.base_model);
    const adapterTier = await classifyWithModel(item.prompt, manifest.name);  // Ollama-loaded adapter
    
    results.push({
      prompt: item.prompt,
      expected: item.expected,
      baseline: baselineTier,
      adapter: adapterTier,
      baseline_correct: baselineTier === item.expected,
      adapter_correct: adapterTier === item.expected
    });
  }
  
  // 5. Compute metrics (REAL, never invented)
  const baselineAccuracy = results.filter(r => r.baseline_correct).length / results.length;
  const adapterAccuracy = results.filter(r => r.adapter_correct).length / results.length;
  const accuracyDelta = adapterAccuracy - baselineAccuracy;
  
  // 6. Inference speed (mean latency)
  const baselineLatency = await measureBaselineLatency(results.slice(0, 5).map(r => r.prompt), manifest.base_model);
  const adapterLatency = await measureBaselineLatency(results.slice(0, 5).map(r => r.prompt), manifest.name);
  const speedFactor = adapterLatency / baselineLatency;
  
  // 7. Update manifest with REAL performance
  const benchmarkRunId = createHash('sha256').update(JSON.stringify(results)).digest('hex').slice(0, 8);
  
  manifest.performance = {
    benchmark_run_id: benchmarkRunId,
    accuracy_delta: accuracyDelta,
    inference_speed_factor: speedFactor,
    measured_at_utc: new Date().toISOString()
  };
  
  // 8. Re-sign + write
  const secret = await readLocalSecret();
  manifest.signature = signManifest(manifest, secret);
  await writeFile(getManifestPath(adapterId), JSON.stringify(manifest, null, 2));
  
  console.log(`✓ Benchmark complete. benchmark_run_id: ${benchmarkRunId}`);
  console.log(`  accuracy_delta: ${(accuracyDelta * 100).toFixed(1)}%`);
  console.log(`  inference_speed_factor: ${speedFactor.toFixed(2)}x`);
}
```

### 5.3 Tests

- Benchmark com golden set → metrics reais computed
- Manifest sem signature válida → reject (no benchmark)
- accuracy_delta NUNCA inventado (sem golden set → no benchmark possible)

## 6. Sub-feature 4 — adapter_selection REAL

### 6.1 Behaviour

`tools/router/adapter_selection.js` (W5 D1 stub) — substitui logic:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function getActiveAdapter() {
  try {
    const prefsPath = path.join(os.homedir(), '.mooter/preferences.json');
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    
    if (!prefs.active_adapter_id) return null;
    
    // D2: load + validate manifest
    const adapterDir = path.join(os.homedir(), '.mooter/adapters', prefs.active_adapter_id);
    const manifestPath = path.join(adapterDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) return null;
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Validate signature (sync subset)
    if (!verifyManifestSignatureSync(manifest)) {
      console.warn('Mooter: active adapter signature invalid — falling back to baseline');
      return null;
    }
    
    // Validate adapter.gguf exists
    if (!fs.existsSync(path.join(adapterDir, 'adapter.gguf'))) {
      return null;
    }
    
    return manifest;
  } catch {
    return null;
  }
}
```

### 6.2 Tests

- Sem active_adapter_id → null
- Com active mas manifest inválido → null + warning
- Com active válido → retorna manifest
- adapter.gguf missing → null

## 7. Sub-feature 5 — NIT 1: link `validateManifest` à CLI antes de render performance

### 7.1 Behaviour

`mooter adapter show <id>` (W5 D1) — antes de mostrar `performance` field, valida:

```typescript
export async function runAdapterShow(adapterId: string): Promise<void> {
  const manifest = await loadManifest(adapterId);
  if (!manifest) return printNotFound();
  
  const validation = await validateManifest(manifest, await readLocalSecret());
  
  console.log(`🔧 Adapter: ${manifest.name}`);
  console.log(`  id: ${manifest.adapter_id}`);
  console.log(`  signature: ${validation.valid ? '✓ valid' : '✗ INVALID — DO NOT TRUST'}`);
  
  // Performance only if manifest valid
  if (validation.valid && manifest.performance) {
    console.log(`  performance: ${(manifest.performance.accuracy_delta * 100).toFixed(1)}% vs baseline`);
    console.log(`    benchmark_run_id: ${manifest.performance.benchmark_run_id}`);
    console.log(`    speed factor: ${manifest.performance.inference_speed_factor.toFixed(2)}x`);
  } else if (!validation.valid) {
    console.log(`  performance: ◌ not shown (invalid manifest)`);
  } else {
    console.log(`  performance: ◌ not benchmarked yet — run \`mooter forge benchmark ${adapterId.slice(0, 8)}\``);
  }
}
```

## 8. Sub-feature 6 — NIT 2: ADR 020 Proposed → Accepted

### 8.1 Update

`docs/adr/020-adapter-forge-approach.md` — change frontmatter:

```markdown
## Status

Accepted (Wave 5 D2 shipped 2026-XX-XX)

### Implementation history
- Wave 5 D1 (v0.5.0-adapter-foundation): foundation manifests + stubs
- **Wave 5 D2 (v0.5.1-forge-validation)**: validation pipeline + Ollama integration + benchmark
- Wave 5 D3+ (planned): Optional Docker unsloth training integration
```

## 9. Statusline update (extend W5 D1)

Quando adapter activado e manifest válido + performance presente:
```
adapter 🔧 diagram-systems-v1 (+20% accuracy)
```

Quando adapter activado mas sem benchmark:
```
adapter 🔧 diagram-systems-v1 (◌ benchmark pending)
```

## 10. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev hub/                                         # VAZIO
git diff dev landing/                                     # VAZIO

# Python deps NOT added
grep -i python packages/cli/package.json
grep -i python package.json

# Ollama integration tested via mock or via real `ollama` if available
```

## 11. Tests aggregate

- Pre-W5 D2: CLI 150, router 108
- W5 D2: +30 (validate 6 + install 6 + benchmark 6 + selection real 4 + show NIT 4 + integration 4)
- Total: ~190 CLI/router verdes

## 12. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave5-d2-mooter-forge vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost.js critical phrases preserved
- mooter_event + sync_event + adapter_manifest v1 INTACTOS
- hub/ + landing/ NOT touched
- validateManifest: signature + schema + performance honesty (no benchmark_run_id → reject)
- forge install: adapter_id determinístico, manifest signed, base_model warning
- forge benchmark: metrics REAIS (não inventados), benchmark_run_id present
- adapter_selection REAL: signature verify, baseline fallback gracioso
- adapter show: validateManifest BEFORE render performance (NIT 1)
- ADR 020 status: Proposed → Accepted + implementation history (NIT 2)
- ZERO Python deps adicionadas
- ZERO external training APIs
- ~190 tests verdes
- Vocabulário GLOSSARY
- Sem git add -A, sem --no-verify
- Cost sanity: $0 (sem Ollama real em tests, só mocks)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 13. PR + auto-merge + tag

```bash
git push -u origin wave5-d2-mooter-forge
PR=$(gh pr create --base dev --title "Wave 5 Day 2: Mooter Forge (validation + install + benchmark + real adapter_selection)" --body-file - <<'EOF'
## Summary
6 sub-features que activam o pipeline forge user-provided:
- Manifest validation pipeline (schema + signature + base_model + performance honesty)
- mooter forge install <gguf-path> (user-provided .gguf → adapter)
- mooter forge benchmark <id> (golden set + REAL metrics)
- adapter_selection REAL (substitui stub W5 D1)
- NIT 1: validateManifest antes de render performance em adapter show
- NIT 2: ADR 020 Proposed → Accepted

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost.js + schemas INTACTOS ✓
- hub/ + landing/ NOT touched ✓
- ZERO Python deps ✓
- ZERO external training APIs ✓

## Honesty
- performance só após benchmark real (benchmark_run_id required)
- Signature verification graceful fallback
- adapter show: validateManifest BEFORE render
- accuracy_delta NUNCA inventado

## Tests
- CLI/router: ~190 verdes (+30)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next
- D3+: Optional Docker unsloth training integration (ADR 020 Option D continuation)
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 14. Closure D2

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke (requires Ollama)
mooter forge --help
mooter forge install --help
mooter forge benchmark --help

# Tag
git tag -a v0.5.1-forge-validation -m "Wave 5 D2: Mooter Forge (validation pipeline + install + benchmark + real adapter_selection)"
git push origin v0.5.1-forge-validation
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave5_d2_shipped.md`.

## 15. Resumo final

```
✅ Wave 5 Day 2 — Mooter Forge COMPLETA
- Branch: wave5-d2-mooter-forge (merged)
- 6 sub-features: validate · install · benchmark · adapter_selection real · NIT 1 + NIT 2
- Tests: ~190 verdes
- Tag: v0.5.1-forge-validation
- P11 + safety_boost + schemas + hub/ + landing/ TODOS INTACTOS
- ZERO Python deps · ZERO external APIs
- ADR 020: Proposed → Accepted

⏸ Para. Wave 5 D3+ (optional Docker unsloth training) precisa novo kickoff quando quiseres training automation.
```

=== END ===
