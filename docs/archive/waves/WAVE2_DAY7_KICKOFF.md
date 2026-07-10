# Wave 2 Day 7 — Kickoff master prompt (Re-benchmark cumulative + tag v0.2.0-rc1)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`, depois do PR #13 estar merged em `dev`. Self-contained.
>
> **CRÍTICO**: Esta é a Day que custa dinheiro real (~$3-5 esperado). Lê BENCHMARK_DESIGN.md v2 antes de executar.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #13 merged em `dev` (squash commit `e9de19f`)
- ✅ `git checkout dev && git pull origin dev`
- ✅ Dias 1-6 closed: 89+ tests verdes, 7 packs no registry, schema mooter_event v1, init wizard, execution fields wired
- ✅ `ANTHROPIC_API_KEY` exportada (vai ser usado para benchmark real)
- ✅ Ollama up com `qwen2.5-coder:7b`, `qwen3:30b`, `nomic-embed-text` (usados pelo benchmark)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day7-rebenchmark-and-tag` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target)
- Anthropic Max sub (vai ser usado para chamadas reais ~$3-5)
- Ollama RTX 4090 via `host.docker.internal:11434`
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 7**: shippar 2 sub-features num único PR para `dev`:
1. **Re-benchmark cumulative Wave 2** — mesmo design Wave 1 (34 prompts × 3 arms + Sonnet judge), mesma seeds, mesma rúbrica. Compara vs Wave 1 baseline (WEAK 1/3).
2. **Tag `v0.2.0-rc1`** se gate passa (target STRONG 3/3 ou MEDIUM 2-3/3).

⚠️ **Esta é a Day de gate**. Resultado determina se Wave 2 fecha ou se há repair sprint.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (cross-stream Cowork)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*`
- ❌ **NÃO mudar metodologia mid-run** — pre-registration BENCHMARK_DESIGN.md v2 é contract. Se descobrires desvio, regista em anomalies.md mas **continua**
- ❌ **NÃO retroactivamente filtrar prompts** — todos os 34 entram, mesmo os que falham. Failures vão para SUMMARY.json
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR
- ✅ **Sanity check $5 BLOCKER** (não $1 desta vez — benchmark real custa). Se cost cumulativo > $5 antes de fim do run, ABORT.
- ✅ **Pre-registration commitment**: dados raw + parquet + JUDGE_LOG + SUMMARY committed mesmo se verdict WEAK
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma commit e9de19f no topo (squash Day 6)
git checkout -b wave2-day7-rebenchmark-and-tag
```

Recon paralelo (lê antes de tocar em nada):
- `docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md` — design canónico (NÃO modificar)
- `docs/benchmarks/wave1-pastor/REPORT.md` — verdict Wave 1 baseline (WEAK 1/3 · cost +20% · latency +89%)
- `docs/benchmarks/wave1-pastor/outputs/SUMMARY.json` — números detalhados Wave 1
- `packages/router/scripts/wave1-benchmark/` — harness completo (run.ts + lib/)
- `packages/router/scripts/wave1-benchmark/prompts.jsonl` — 34 prompts validation set
- `packages/router/scripts/wave2-day1-sanity/` — referência para sanity reports

## 3. Re-benchmark execution

### 3.1 Setup directory

Cria `docs/benchmarks/wave2-pastor/` (novo).

Copia design + master prompt como referência (NÃO modificar — pre-registration commitment):
```bash
cp docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md docs/benchmarks/wave2-pastor/BENCHMARK_DESIGN.md
cp docs/benchmarks/wave1-pastor/MASTER_PROMPT.md docs/benchmarks/wave2-pastor/MASTER_PROMPT.md
```

### 3.2 Run

Setup harness baseado em Wave 1:
```bash
mkdir -p packages/router/scripts/wave2-benchmark/{lib,outputs,schemas}
cp packages/router/scripts/wave1-benchmark/lib/* packages/router/scripts/wave2-benchmark/lib/
cp packages/router/scripts/wave1-benchmark/schemas/* packages/router/scripts/wave2-benchmark/schemas/
cp packages/router/scripts/wave1-benchmark/run.ts packages/router/scripts/wave2-benchmark/run.ts
cp packages/router/scripts/wave1-benchmark/prompts.jsonl packages/router/scripts/wave2-benchmark/prompts.jsonl
```

Confirma prompts.jsonl é byte-identical com Wave 1:
```bash
diff packages/router/scripts/wave1-benchmark/prompts.jsonl packages/router/scripts/wave2-benchmark/prompts.jsonl
# Esperado: nenhum output (idênticos)
```

Update `run.ts` apenas para apontar outputs ao novo dir:
```typescript
const OUTPUT_DIR = "./docs/benchmarks/wave2-pastor/outputs";
const RUN_ID_PREFIX = "wave2";
```

**Pricing snapshot** — pega o `data/pricing-snapshot-2026-05-27.json` (Wave 1) E gera o snapshot ACTUAL:
```bash
node packages/router/scripts/wave1-benchmark/lib/pricing.ts --snapshot > data/pricing-snapshot-2026-05-29.json
# (Compara — se prices Anthropic não mudaram, snapshot Wave 2 = snapshot Wave 1)
```

### 3.3 Execução

```bash
cd packages/router/scripts/wave2-benchmark
npx tsx run.ts \
  --prompts ./prompts.jsonl \
  --arms pastor,sonnet,opus \
  --judge sonnet \
  --outputs ./outputs \
  --pricing-snapshot ../../../data/pricing-snapshot-2026-05-29.json \
  --blind-judge \
  --pre-registered ./BENCHMARK_DESIGN.md
```

⚠️ **Tempo esperado**: ~25-40 min (34 prompts × 3 arms = 102 calls + 102 judge calls = 204 calls).
⚠️ **Cost esperado**: $3-5 total. Monitor durante execução.

Se cost passa $5 → ABORT. Lê o cumulative dos logs:
```bash
# Em outra terminal durante o run
tail -f packages/router/scripts/wave2-benchmark/outputs/RAW_RESULTS.jsonl | jq -s 'map(.cost_micros) | add / 1000000'
```

### 3.4 Validate outputs

Após run, validate que todos os 8 outputs canónicos existem:
```bash
ls -la docs/benchmarks/wave2-pastor/outputs/
# Esperado: RAW_RESULTS.jsonl, RAW_RESULTS.parquet,
#           JUDGE_LOG.jsonl, JUDGE_LOG.parquet,
#           SUMMARY.json, SUMMARY.parquet,
#           anomalies.md, lineage-snapshot.json
```

Validate schemas:
```bash
cd packages/router/scripts/wave2-benchmark
npx tsx lib/schema-validate.ts --raw ./outputs/RAW_RESULTS.jsonl
# Esperado: "✓ 102 events valid"
```

### 3.5 Anomalies obrigatórios

Em `docs/benchmarks/wave2-pastor/outputs/anomalies.md`, regista TODOS os desvios face ao pre-registered:
- Pricing changes desde Wave 1 (se houver)
- Modelos Ollama timeouts (Wave 1 teve 2 — P005, P012)
- Judge JSON parse fallbacks (Wave 1 teve 2 — Mermaid)
- Cost invocation vs total clarifications
- Qualquer regressão face a Wave 1 baseline

Formato: lista numerada com (A1) (A2) etc + impact + se foi resolvido ou kept.

## 4. REPORT.md comparativo

Cria `docs/benchmarks/wave2-pastor/REPORT.md` seguindo estrutura do Wave 1 REPORT mas com **comparação directa**:

### 4.1 Estrutura

```markdown
# Wave 2 Re-benchmark Report

## TL;DR
Verdict: [STRONG 3/3 | MEDIUM 2-3/3 | WEAK 1/3 | FAIL 0/3]
vs Wave 1 baseline (WEAK 1/3, cost +20%, latency +89%).

## Headline metrics

| Metric | Wave 1 | Wave 2 | Δ |
|---|---|---|---|
| Quality (judge composite) | 0.870 | XX | +/- N pp |
| Cost ($/prompt) | $0.0224 | $XX | -/+ NN% |
| Latency (ms total) | 51,101 | XX | -/+ NN% |
| Pair A_vs_B verdict | WEAK 1/3 | XX | - |
| Pair A_vs_C verdict | WEAK 1/3 | XX | - |

## Per-pack drill-down
[Wave 2 data per pack vs Wave 1 — diagram-systems, code-audit, animation-web, GENERAL, AMBIGUOUS, new packs em prod data]

## Bottleneck fixes validation
- Fix #1 GENERAL fallback T2: works? (Wave 1: quality crash -30pp em GENERAL)
- Fix #2 code-audit floor T2/T3: works? (Wave 1: cost +18% sustained)
- Fix #3 T0 swap qwen2.5-coder:7b: works? (Wave 1: timeouts P005/P012)

## What's new in Wave 2 vs Wave 1
- 7 packs (vs 3)
- Embedding layer 100% recall
- mooter_event schema operacional
- mooter init wizard
- Execution fields wired

## Recommendation
[STRONG → tag v0.2.0-rc1 + Wave 3 starts]
[MEDIUM 2-3/3 → tag v0.2.0-rc1 with caveats, Wave 3 starts]
[WEAK 1/3 → repair sprint, NO tag]

## Anomalies logged
[Lista de anomalies.md com cross-reference]

## Reproducibility
- Run ID: <uuid>
- Pricing snapshot: 2026-05-29
- Env hash: <sha>
- Pastor version: <semver>
```

### 4.2 Decisão de gate

| Verdict | Acção |
|---|---|
| **STRONG 3/3** | Tag `v0.2.0-rc1` + Wave 2 CLOSED + arranque Wave 3 |
| **MEDIUM 2-3/3** | Tag `v0.2.0-rc1` com caveats + Wave 2 CLOSED + arranque Wave 3 |
| **WEAK 1/3** | NO tag · Repair sprint · Diagnose qual fix Day 1 NÃO funcionou · Wave 2 fica aberta |
| **FAIL 0/3** | NO tag · Regression sprint · Roll back PRs específicos · Pausa Wave 3 |

**Predicted (do Wave 1 REPORT §8)**: MEDIUM-STRONG (cost -40 a -50%, latency -65%).

## 5. Tag v0.2.0-rc1 (CONDITIONAL on verdict)

Se MEDIUM ou STRONG:
```bash
cd ~/mooter
git tag -a v0.2.0-rc1 -m "Wave 2 release candidate 1 — 7 packs, embedding layer, mooter init, event-writer

Re-benchmark verdict: [STRONG 3/3 | MEDIUM 2-3/3]
Cost saved vs Wave 1: NN% improvement
Latency reduced vs Wave 1: NN% improvement
Quality maintained: yes

See docs/benchmarks/wave2-pastor/REPORT.md for details."

git push origin v0.2.0-rc1
```

Se WEAK ou FAIL: **NÃO** tag. Reporta no SYNC.md + Notion para Paulo decidir repair vs roll-back.

## 6. Final-reviewer pre-PR

Spawn final-reviewer:

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2-day7-rebenchmark-and-tag vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- BENCHMARK_DESIGN.md byte-identical com Wave 1 (pre-registration commitment)
- prompts.jsonl byte-identical com Wave 1 (same set)
- 8 outputs canónicos existem (RAW + JUDGE + SUMMARY + anomalies + lineage)
- REPORT.md tem comparison table Wave 1 vs Wave 2 com todas as métricas
- Verdict declarado claramente (STRONG/MEDIUM/WEAK/FAIL)
- Tag v0.2.0-rc1 só foi pushed se verdict MEDIUM/STRONG
- Anomalies registadas honestamente (não retoricadas)
- Cost total < $5 (sanity)
- Pricing snapshot 2026-05-29 committed
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff
- PASTOR.md NÃO no diff (cross-stream)
- docs/strategy/* untracked NÃO no diff
- packages/router/src/* NÃO tocado (não é o scope deste Day)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

## 7. PR

```bash
git push -u origin wave2-day7-rebenchmark-and-tag
gh pr create --base dev --title "Wave 2 Day 7: Re-benchmark cumulative + tag v0.2.0-rc1" --body-file - <<'EOF'
## Summary
Re-benchmark cumulative Wave 2 vs Wave 1 baseline. Tag v0.2.0-rc1 if verdict passes gate.

## Pre-registered
- Design: docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md (byte-identical, copied to wave2-pastor/)
- Prompts: 34 (same as Wave 1, byte-identical)
- Arms: Pastor / Sonnet baseline / Opus gold
- Judge: Sonnet blind
- Gate: STRONG 3/3 or MEDIUM 2-3/3 → tag · WEAK 1/3 or FAIL 0/3 → no tag

## Wave 1 baseline (recap)
- Verdict: WEAK 1/3 both pairs
- Quality: 0.870 ✓
- Cost: $0.0224/prompt (+20% vs Sonnet — FAIL)
- Latency: 51,101 ms (+89% vs Sonnet — FAIL)

## Wave 2 result (this run)
- Verdict: [STRONG | MEDIUM | WEAK | FAIL]
- Quality: <XX> ([+/-] pp vs Wave 1)
- Cost: $<X.XXXX>/prompt ([-/+] NN% vs Wave 1)
- Latency: <XX,XXX> ms ([-/+] NN% vs Wave 1)

## Bottleneck fixes (Wave 2 Day 1) validation
- GENERAL fallback T2: [works | partial | no impact]
- code-audit floor T2/T3: [works | partial | no impact]
- T0 swap qwen2.5-coder:7b: [works | partial | no impact]

## Tag pushed
v0.2.0-rc1: [yes | no — verdict didn't pass gate]

## Anomalies
See docs/benchmarks/wave2-pastor/outputs/anomalies.md ([N] anomalies, [M] resolved, [K] kept)

## Cost actual
$<X.XX> total (budget $5 BLOCKER)

## Out of scope
- Hub upload (Wave 3 D4-5)
- Public announcement (Wave 4 launch)
- Tag v0.2.0 final (depende de Wave 3 + 4 review)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next
Wave 3 arranca após este merge (activation + hub + digest).
EOF
```

## 8. Notion + SYNC

### 8.1 Notion sub-page

Title: `🚀 Sessão YYYY-MM-DD — Wave 2 Day 7 (re-benchmark gate v0.2.0-rc1)`

Body:
- Verdict + comparação directa Wave 1 vs Wave 2
- Tabela completa de métricas com Δ
- Bottleneck fixes validation results
- Tag pushed (sim/não) + reasoning
- Cost total real vs budget
- Link REPORT.md + anomalies.md

### 8.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 7 page
- `📥 COWORK → CLAUDE CODE` → next:
  - Se STRONG/MEDIUM: arranca Wave 3 D1 (feedback loop)
  - Se WEAK/FAIL: repair sprint — diagnose + fix priorities

## 9. Wave 2 closure (se gate passa)

Cria ficheiro novo: `docs/strategy/WAVE2_CLOSURE.md`

```markdown
# Wave 2 Closure — 2026-05-29

## Days shipped
1. Bottleneck fixes (PR #8, commit 095db2e)
2. AMBIGUOUS scaffold + statusline wire + animation-web compression (PR #9, commit 30658c9)
3. Embedding layer + NITs 1+2 (PR #10, commit 48c5eb0)
4. event-writer + 3 NITs Day 3 (PR #11, commit 17fe59f)
5. 4 packs adicionais + recalibração (PR #12, commit c3001f9)
6. mooter init wizard + execution fields + statusline NITs (PR #13, commit e9de19f)
7. Re-benchmark + tag v0.2.0-rc1 (PR #14, commit XX)

## Gate verdict
[STRONG/MEDIUM]

## Tag pushed
v0.2.0-rc1

## What's in this release
[Lista features]

## What's NOT yet (Wave 3+)
[Lista deferred]

## Next: Wave 3
Activation + hub + digest. Plan in docs/strategy/WAVE3_PLAN.md.
```

## 10. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 7 — Re-benchmark + tag v0.2.0-rc1 COMPLETO
- Branch: wave2-day7-rebenchmark-and-tag (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- Re-benchmark verdict: <STRONG/MEDIUM/WEAK/FAIL>
  - Quality: <XX> ([+/-] N pp vs Wave 1)
  - Cost: $<XX> ([-/+] N% vs Wave 1)
  - Latency: <XXms> ([-/+] N% vs Wave 1)
- Bottleneck fixes Day 1 validados: <N de 3 confirmed>
- Tag v0.2.0-rc1: <pushed | not pushed (verdict)>
- Cost total real: $<X.XX> (budget $5)
- Anomalies: <N total, M resolved, K kept>
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- WAVE2_CLOSURE.md criado
Próximo:
- Se STRONG/MEDIUM: Paulo merge PR + arranca Wave 3 D1 (feedback loop: /mooter rate)
- Se WEAK/FAIL: repair sprint diagnostic
```

=== END ===
