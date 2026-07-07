# Wave 2.7 — E2E Simulation Framework (Anthropic-ready audit)

> **Como usar**: cola tudo abaixo de `=== START ===` num Claude Code FRESCO (Opus 4.8, plano Max+) em `~/mooter/`. Self-contained.
>
> **Quando correr**: APÓS Wave 2.6 fechar (tag `v0.2.2-reveal` em dev). NÃO em paralelo — usa o mesmo working directory.
>
> **O que faz**: simula 5 personas de "Hard Vibe Coder" em paralelo via Dynamic Workflows, cada uma fazendo fresh install → wizard → 10 prompts realistas → audit. Output: Markdown report consolidado + lista priorizada de gaps descobertos. Zero código produção tocado — só ler e simular.

**Pré-requisitos verificados**:
- ✅ Wave 2.6 fechada (tag `v0.2.2-reveal` em dev) — statusline rica + Moo card + glyphs + evolution
- ✅ Plano Max+ (Dynamic Workflows disponível)
- ✅ Opus 4.8 disponível (`/model`)
- ✅ Ler `docs/strategy/SHOWCASE_AUDIT.md` para contexto + persona definitions

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code Opus 4.8 no `~/mooter/`, com Dynamic Workflows enabled. Branch: `wave2.7-e2e-simulation` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Wave 2.7**: gerar um audit E2E rigoroso simulando 5 personas reais usando o Mooter pela primeira vez. Output: Markdown reports + priorização de gaps. **ZERO código de produção tocado** — esta wave é audit-only.

**Princípio rector**: paranoid honesty. Se uma persona crashar, é descoberta valiosa, não falha. Se um número não bater, reporta. Se UX é confusa, descreve exactamente porquê.

## 1. Invariantes (não-negociáveis)

- ❌ **NÃO tocar código de produção** — esta wave é audit, não code
- ❌ **NÃO commitar nada além de `audit/**` ficheiros**
- ❌ **NÃO inventar bugs** — só reporta o que efectivamente acontece
- ❌ **NÃO interagir com APIs reais** — usa mocks/fixtures + temp HOMEs
- ❌ **NÃO criar PRs para `dev`** — esta wave entrega um relatório, não merge
- ❌ **NÃO `--no-verify`**, **NÃO `git add -A`**
- ❌ **NÃO atribuir** issues a Claude/Anthropic/Cowork — Paulo é o owner
- ✅ **Final-coordinator** (tu) consolida findings das 5 personas
- ✅ **Sanity cost OBSERVAR** — Dynamic Workflows com 5+ subagents = mais tokens (esperado)
- ✅ **Output central**: `audit/wave2-7-e2e-simulation/REPORT.md`

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma tag v0.2.2-reveal recent
git tag -l | grep v0.2.2  # confirma tag existe

git checkout -b wave2.7-e2e-simulation
mkdir -p audit/wave2-7-e2e-simulation
```

Recon (lê primeiro):
```bash
cat docs/strategy/SHOWCASE_AUDIT.md  # contexto + 8 pontos + 3 sub-personas
cat docs/strategy/GLOSSARY.md          # vocabulário
cat docs/strategy/WAVE2_6_PLAN.md      # o que acabou de shippar
ls -la packages/cli/src/commands/      # comandos disponíveis para simular
ls -la tools/router/                   # hooks + scripts
```

## 3. Personas a simular (5)

Definição operacional (ver `SHOWCASE_AUDIT.md §1` para contexto):

| ID | Nome | Background | Hardware mock | Anthropic? | Ollama? | Stack |
|---|---|---|---|---|---|---|
| **P1** | Solo Founder Paula | Post-exit founder, 1 produto, $$ próprio | RTX 4090, 64GB, qwen3:7b + qwen3:30b | Max plan | ✅ | Next.js + Supabase |
| **P2** | Senior IC Marco | FAANG eng, empresa paga, multi-terminal | M3 Pro, 32GB | Max plan | ✅ qwen3:7b only | Python + Postgres |
| **P3** | OSS Maintainer Yuki | Big repos, refactor heavy, Dynamic Workflows fan | Threadripper, 128GB, multi-model local | Team plan | ✅ qwen3:30b + llama3 | Rust + native libs |
| **P4** | "No Ollama" Edge Linus | Wants Mooter but no GPU local | M1, 16GB, no Ollama | Max plan | ❌ | TS + Vercel |
| **P5** | "No Anthropic" Edge Sara | Open-source purist, local-only | RTX 3090, 32GB | ❌ (no API key) | ✅ qwen3:7b | Go + Docker |

## 4. Estratégia de execução — Dynamic Workflows com 5 subagents paralelos

### 4.1 Coordinator pattern

Tu (Claude Code Opus 4.8) és o coordinator. Fan-out 5 subagents via Task tool com prompt que CONTÉM a palavra `workflow`:

```
Task tool, subagent_type: "general-purpose"

Prompt: "Run a workflow with 5 parallel subagents, one per Hard Vibe Coder persona (P1-P5).

Each subagent owns ONE persona and executes the FULL simulation script (§5 below) in an isolated temp HOME directory. No subagent touches another's temp directory.

Subagents work in parallel. After all 5 complete, return list of (persona, status, report_path, gaps_found_count).

Reviewer subagent (6th): reads all 5 reports + consolidates into REPORT.md meta-report. Verifies:
- Zero invented bugs (each bug traceable to actual subagent observation)
- Honesty disclosures preserved (LoRA 'none yet' etc.)
- Priority gaps ranked by severity (blocker/major/minor)

Output paths:
- audit/wave2-7-e2e-simulation/persona-P1.md
- audit/wave2-7-e2e-simulation/persona-P2.md
- ... (one per persona)
- audit/wave2-7-e2e-simulation/REPORT.md (meta-report)
"
```

### 4.2 Per-persona simulation script (cada subagent executa)

#### 4.2.1 Setup isolated HOME

```bash
TEMP_HOME=$(mktemp -d -t mooter-e2e-P<N>-XXXXXX)
export HOME="$TEMP_HOME"
mkdir -p "$HOME/.mooter" "$HOME/.claude/tools/router"

# Symlink production router scripts (read-only — não modificar)
ln -s ~/mooter/tools/router/inject_context.js "$HOME/.claude/tools/router/inject_context.js"
ln -s ~/mooter/tools/router/statusline-multi.js "$HOME/.claude/tools/router/statusline-multi.js"
ln -s ~/mooter/tools/router/glyphs.js "$HOME/.claude/tools/router/glyphs.js"
ln -s ~/mooter/tools/router/stop_hook.js "$HOME/.claude/tools/router/stop_hook.js"
ln -s ~/mooter/tools/router/classify.js "$HOME/.claude/tools/router/classify.js"
ln -s ~/mooter/tools/router/savings-tracker.js "$HOME/.claude/tools/router/savings-tracker.js"
```

#### 4.2.2 Mock hardware probe

Cada persona tem hardware diferente. Override `probeHardware()` injection:

```typescript
const mockProbe = async () => ({
  os: 'linux',  // ou darwin per persona
  cpu_cores: P1_cores,
  ram_gb: P1_ram,
  gpu: P1_gpu_string,
  ollama: { url: 'mock://test', models: P1_ollama_models, available: P1_ollama_available }
});
```

#### 4.2.3 Mock validateAnthropic

```typescript
const mockValidate = async (key: string) => {
  if (key === 'sk-ant-mock-valid') return { valid: true, tier_detected: P_tier, budget_5h_limit: 1000, budget_7d_limit: 5000 };
  return { valid: false, error: '401 Unauthorized' };
};
```

#### 4.2.4 Run wizard scripted

```typescript
import { runInit } from '~/mooter/packages/cli/src/commands/init';

const ioScript = persona === 'P1' ? [/* Paula's answers */] :
                 persona === 'P2' ? [/* Marco's answers */] :
                 // ...
                 ;

const startTime = Date.now();
await runInit({ io: scriptedIO(ioScript), probeHardware: mockProbe, validateAnthropic: mockValidate });
const wizardDurationMs = Date.now() - startTime;

// Audit point: wizard must complete in <300s
audit.wizardOk = wizardDurationMs < 300_000;
audit.wizardDurationMs = wizardDurationMs;
```

#### 4.2.5 Verificar schemas escritos

```bash
test -f "$HOME/.mooter/profile.json" && audit.profileOk=true
test -f "$HOME/.mooter/credentials.json" && audit.credentialsOk=true
test -f "$HOME/.mooter/consent.json" && audit.consentOk=true
test -d "$HOME/.mooter/packs" && audit.packsDirOk=true
```

Para persona P4 (no Ollama): credentials.json NÃO deve ter `providers.ollama`. Audit verifica.
Para persona P5 (no Anthropic): credentials.json NÃO deve ter `providers.anthropic`. Audit verifica.

#### 4.2.6 Injectar 10 prompts realistas

Mix de tiers, realista para a persona:

```javascript
const prompts = persona === 'P1' ? [
  // Solo Founder Paula: mix product + ops
  { text: "muda a cor do botão login para azul", expectedTier: 'T0' },
  { text: "resume o ficheiro README.md", expectedTier: 'T0' },
  { text: "gera commit message para estas 3 mudanças", expectedTier: 'T1' },
  { text: "explica este erro: TypeError: x is not a function", expectedTier: 'T1' },
  { text: "porque é que o websocket reconnect falha às vezes?", expectedTier: 'T2' },
  { text: "compara estes 2 patterns: useReducer vs useState", expectedTier: 'T2' },
  { text: "redesenha o vault para multi-user (architectural)", expectedTier: 'T3' },
  { text: "audit dos hooks deste codebase para race conditions", expectedTier: 'T3' },
  { text: "lista ficheiros .ts maiores que 500 linhas", expectedTier: 'T0' },
  { text: "vou fazer push, faz review pré-merge", expectedTier: 'T3' },
] : persona === 'P2' ? [
  // Senior IC Marco: optimization + debug heavy
  // ...
] : // ...
;

for (const prompt of prompts) {
  const startTime = Date.now();
  const result = await runInjectContext({
    prompt: prompt.text,
    session_id: `e2e-${persona}-session`,
    classify: classifyReal,  // usar classify real, não mock
  });
  
  audit.prompts.push({
    text: prompt.text.slice(0, 50),
    expectedTier: prompt.expectedTier,
    actualTier: result.tier,
    actualModel: result.model,
    confidence: result.confidence,
    latencyMs: Date.now() - startTime,
    correctlyClassified: result.tier === prompt.expectedTier,
    badgeRendered: !!result.badge,
  });
}

audit.classificationAccuracy = audit.prompts.filter(p => p.correctlyClassified).length / 10;
```

#### 4.2.7 Audit Moo card emission

Run Stop hook 10 vezes (1 por prompt). Verifica:
- Card aparece visível
- Todos os 7 campos (model · tokens · latency · cost · bash · ctx)
- Glyph correcto por tier
- LoRA disclosure presente

```javascript
for (const evt of events) {
  const cardOutput = await runStopHook({ session_id, last_event: evt });
  audit.mooCards.push({
    eventId: evt.id,
    cardEmitted: cardOutput.includes('Moo card'),
    fieldsCount: countFields(cardOutput),
    glyphCorrect: cardOutput.includes(expectedGlyph(evt.tier)),
    loraDisclosed: cardOutput.includes('none yet') || cardOutput.includes('Wave 5'),
  });
}
```

#### 4.2.8 Audit dashboard

```javascript
const dashboardOutput = await runDashboard({ sessionId: `e2e-${persona}-session`, refreshMs: 100 });
// Renderiza 1 frame (ANSI captured)
audit.dashboardOk = dashboardOutput.includes('MOOS ACTIVE') &&
                    dashboardOutput.includes('SAVINGS') &&
                    dashboardOutput.includes('CONTEXT') &&
                    dashboardOutput.includes('QUOTA') &&
                    dashboardOutput.includes('PACK') &&
                    dashboardOutput.includes('ADAPTER');
audit.loraHonestyDashboard = dashboardOutput.includes('LoRA in Wave 5');
```

#### 4.2.9 Audit `mooter trail` + `--evolution`

```javascript
const trailOutput = await runTrail({ sessionId: `e2e-${persona}-session`, json: true });
const trail = JSON.parse(trailOutput);
audit.trailFieldsCount = Object.keys(trail).length;
audit.trailHasFormulas = trail.saved?.formula && trail.last_decision;

const evolOutput = await runTrail({ sessionId, evolution: true });
audit.evolutionHonest = evolOutput.includes('LoRA: ◌ none yet') && evolOutput.includes('Wave 5');
```

#### 4.2.10 Audit transparency end-to-end

Verificações finais:
- [ ] Cada número do statusline tem source verificável via `trail`
- [ ] Per-session isolation: P1 events não aparecem na session P2
- [ ] Vocabulário GLOSSARY coerente (Mooter/Moos, nenhum "Pastor")
- [ ] Zero hyperbole em outputs ("revolutionary", "magic", "AI-powered")
- [ ] Error messages format canónico em todos os erros encontrados

#### 4.2.11 Generate persona report

```javascript
const report = `# Persona ${persona} — ${personaName} simulation report

## Setup
- Hardware: ${hardware}
- Anthropic: ${anthropic_plan}
- Ollama: ${ollama_available ? 'yes (' + models.join(',') + ')' : 'no'}
- Temp HOME: ${TEMP_HOME}

## Wizard (1)
- Duration: ${audit.wizardDurationMs}ms (${audit.wizardOk ? '✅' : '❌'} < 300s)
- Schemas written: profile=${audit.profileOk} credentials=${audit.credentialsOk} consent=${audit.consentOk} packs=${audit.packsDirOk}
- Edge cases handled: ${edgeCasesNote}

## Prompts (10)
- Classification accuracy: ${(audit.classificationAccuracy * 100).toFixed(0)}% (${audit.prompts.filter(p=>p.correctlyClassified).length}/10)
- Avg latency: ${avg(audit.prompts.map(p=>p.latencyMs))}ms
- Badge rendered: ${audit.prompts.filter(p=>p.badgeRendered).length}/10

| # | Prompt | Expected | Actual | Confidence | Latency | OK |
|---|---|---|---|---|---|---|
${audit.prompts.map((p,i) => \`| ${i+1} | ${p.text}... | ${p.expectedTier} | ${p.actualTier} | ${p.confidence} | ${p.latencyMs}ms | ${p.correctlyClassified?'✅':'❌'} |\`).join('\n')}

## Moo cards (10)
- All emitted: ${audit.mooCards.every(c => c.cardEmitted) ? '✅' : '❌'}
- All have 7+ fields: ${audit.mooCards.every(c => c.fieldsCount >= 7) ? '✅' : '❌'}
- Glyph correctness: ${audit.mooCards.filter(c => c.glyphCorrect).length}/10
- LoRA disclosure: ${audit.mooCards.every(c => c.loraDisclosed) ? '✅' : '❌'}

## Dashboard
- All 6 sections rendered: ${audit.dashboardOk ? '✅' : '❌'}
- LoRA honesty: ${audit.loraHonestyDashboard ? '✅' : '❌'}

## Trail
- Fields count: ${audit.trailFieldsCount}
- Has formulas + sources: ${audit.trailHasFormulas ? '✅' : '❌'}
- Evolution honest: ${audit.evolutionHonest ? '✅' : '❌'}

## Transparency
- Per-session isolation: ${audit.isolationOk ? '✅' : '❌'}
- Vocabulário GLOSSARY: ${audit.vocabOk ? '✅' : '❌ (Pastor occurrences: '+audit.pastorOccurrences+')'}
- Zero hyperbole: ${audit.zeroHyperbole ? '✅' : '❌ ('+audit.hyperboleWords.join(',')+')'}

## Gaps descobertos
${audit.gaps.length === 0 ? '✅ Nenhum gap descoberto' : audit.gaps.map((g,i) => \`${i+1}. [${g.severity}] ${g.description} — ${g.evidence}\`).join('\n')}

## Subjective UX score
- Wizard impression: ${audit.uxScores.wizard}/10
- Statusline clarity: ${audit.uxScores.statusline}/10
- Moo card usefulness: ${audit.uxScores.mooCard}/10
- Dashboard wow factor: ${audit.uxScores.dashboard}/10
- Trust in numbers: ${audit.uxScores.trust}/10

## Verdict
${audit.gaps.filter(g=>g.severity==='blocker').length === 0 ? '✅ READY for this persona' : '❌ BLOCKED — ' + audit.gaps.filter(g=>g.severity==='blocker').length + ' blockers'}
`;

writeFile(\`audit/wave2-7-e2e-simulation/persona-${persona}.md\`, report);
```

### 4.3 Reviewer/coordinator subagent (6º)

Após 5 personas completarem, este subagent consolida:

```javascript
const reports = [readFile('persona-P1.md'), readFile('persona-P2.md'), readFile('persona-P3.md'), readFile('persona-P4.md'), readFile('persona-P5.md')];

// Cross-check: cada gap tem evidence?
const allGaps = reports.flatMap(parseGaps);
const unverifiedGaps = allGaps.filter(g => !g.evidence || g.evidence.length < 30);
if (unverifiedGaps.length > 0) {
  throw new Error('Gaps without evidence — reviewer rejects');
}

// Priorize: blocker > major > minor
const prioritized = allGaps.sort((a,b) => severityRank(b.severity) - severityRank(a.severity));

// Cross-persona patterns
const patterns = findCrossPersonaPatterns(reports);  // e.g., "All 5 personas had bug X"

// Anthropic-ready scorecard
const scorecard = computeAnthropicScorecard(reports);
// 40 checklist items from SHOWCASE_AUDIT.md §6

const metaReport = `# Mooter E2E Simulation — Wave 2.7 Meta-Report

> Audit run: ${new Date().toISOString()}
> Personas tested: 5 (Solo Founder, Senior IC, OSS Maintainer, No-Ollama, No-Anthropic)
> Coordinator: Claude Code Opus 4.8 + Dynamic Workflows
> Wave context: post v0.2.2-reveal (Wave 2.6 closed)

## Executive Summary

${prioritized.filter(g=>g.severity==='blocker').length === 0 ? '✅ NO BLOCKERS — Mooter is Anthropic-showcase ready (with caveats below)' : '❌ ' + prioritized.filter(g=>g.severity==='blocker').length + ' BLOCKERS must be fixed before showcase'}

## Per-persona summary

| Persona | Wizard | Classification | Moo cards | Dashboard | Trail | UX avg | Verdict |
|---|---|---|---|---|---|---|---|
${reports.map(r => personaSummary(r)).join('\n')}

## Anthropic-ready scorecard (40 items)
${formatScorecard(scorecard)}

## Cross-persona patterns
${patterns.map(p => \`- ${p.description} (affects: ${p.affectedPersonas.join(', ')})\`).join('\n')}

## Prioritized gaps
### Blockers (${prioritized.filter(g=>g.severity==='blocker').length})
${prioritized.filter(g=>g.severity==='blocker').map((g,i) => \`${i+1}. ${g.description}\n   Evidence: ${g.evidence}\n   Affected personas: ${g.personas.join(', ')}\n   Recommended fix: ${g.recommendedFix}\`).join('\n\n')}

### Major (${prioritized.filter(g=>g.severity==='major').length})
${prioritized.filter(g=>g.severity==='major').map(/* same format */).join('\n\n')}

### Minor (${prioritized.filter(g=>g.severity==='minor').length})
${prioritized.filter(g=>g.severity==='minor').map(/* same format */).join('\n\n')}

## Recommendations for Wave 3 enhanced

Based on the gaps, the following changes to Wave 3 D1 (activation) are recommended:
${generateWave3Recommendations(prioritized)}

## Cost sanity
- Total tokens consumed: ~XYZ (estimate)
- Per-persona tokens: ~ABC each
- No real API calls (all mocks)
- Estimated cost: $X.XX

## Sign-off
Reviewer subagent: <APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES>
Coordinator (Claude Code): <verdict>
`;

writeFile('audit/wave2-7-e2e-simulation/REPORT.md', metaReport);
```

## 5. Tests vs simulation

**Não há tests automáticos novos**. Esta wave gera AUDIT REPORTS, não código testável. O critério de sucesso é:
- 5 persona reports gerados ✅
- 1 meta-report gerado ✅
- Reviewer subagent assina off ✅
- Zero invented bugs (cada gap traceable) ✅

## 6. Final-coordinator pre-output

Tu (Claude Code Opus 4.8) revês os 6 ficheiros gerados (5 persona + 1 meta) antes de commit. Verifica:
- Reports completos (não truncados)
- Evidence presente em cada gap
- Vocabulário GLOSSARY usado
- Zero hyperbole nos próprios reports
- Severity ranking consistente

## 7. Commit + output

```bash
git add audit/wave2-7-e2e-simulation/
git commit -m "audit(wave2.7): E2E simulation report (5 personas, Dynamic Workflows)"
git push -u origin wave2.7-e2e-simulation

# NÃO criar PR — este é audit output, vive na branch para Paulo rever
# Se Paulo quiser merge para arquivo, fá-lo manualmente
```

## 8. Notion + SYNC

### 8.1 Notion sub-page

Title: `🔍 Wave 2.7 E2E Simulation Report (YYYY-MM-DD)`

Body:
- Executive summary (blocker count, scorecard %)
- Link para REPORT.md no GitHub branch
- Top 5 gaps com severity
- Recommended Wave 3 changes

### 8.2 SYNC.md update

- `## Estado Actual` → "Wave 2.7 simulation completa, X blockers / Y major / Z minor gaps"
- `📥 COWORK → CLAUDE CODE` → next: Paulo revê REPORT.md → decide enhanced Wave 3

## 9. Resumo final na chat

```
✅ Wave 2.7 E2E Simulation COMPLETO
- Branch: wave2.7-e2e-simulation (pushed)
- 5 persona reports + 1 meta-report gerados
- Anthropic scorecard: <N>/40 verde
- Blockers: <N> · Major: <N> · Minor: <N>
- Cost: $<X> (Dynamic Workflows com 6 subagents paralelos)
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>

📋 ENTREGAS:
- audit/wave2-7-e2e-simulation/REPORT.md (meta)
- audit/wave2-7-e2e-simulation/persona-P[1-5].md

🎯 ANTHROPIC READINESS: <READY | NEEDS-FIXES (lista top 3)>

Próximo passo: Paulo revê REPORT.md → decide se arranca Wave 3 enhanced ou fix sprint primeiro.
```

=== END ===
