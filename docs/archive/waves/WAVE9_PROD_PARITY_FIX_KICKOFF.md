# Wave 9 — Prod Parity Fix (mooter.ai)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v1.1.0` em `dev`/`main` (Wave 8 Install Reliability) + migrations 006/007/008 já aplicadas no Supabase (`eymtobwinevywmmlmxqa`, projecto "frugal" no dashboard).
>
> **Origem**: auditoria Cowork 2026-06-01 em `https://mooter.ai/` + `/dashboard` (Paulo logged in) detectou 6 problemas críticos de parity entre prod e repo. Findings completos em §1.
>
> **⚠️ LIÇÃO 10× consolidada**: Recon obrigatório PRIMEIRO. Reportar findings ao Paulo via chat ANTES de implementar qualquer fix. Adaptar (Opção 1) quando possível em vez de reescrever.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave9-prod-parity-fix`. `--permission-mode bypassPermissions`.

**Missão Wave 9**: corrigir 6 problemas de parity entre `mooter.ai` em produção e `main`/`dev` no repo, descobertos na auditoria Cowork 2026-06-01. Sem este fix, qualquer validation com 5 vibe coders mostra-lhes uma versão velha + dados inconsistentes + claims contraditórios.

**6 sub-features** (ordenadas por severidade):

1. 🔴 **Vercel parity** — descobrir por que prod mostra `v0.10.1` em vez de `v1.1.0` + redeploy correcto
2. 🔴 **Stats reconciliation** — Overview tab ($73.85 / 663 / 100%) vs How it works tab ($0 / 0 / 0%) lêem fontes diferentes
3. 🟠 **Pattern count truth** — landing diz "167 regex patterns", dashboard diz "40+ patterns", outro card diz "230 samples trained" — qual é o real?
4. 🟠 **Language policy** — dashboard mistura EN + PT sem norma (strings PT no meio de UI EN)
5. 🟡 **Feature list mismatch** — How it works tab visual lista 7 features mas o texto abaixo lista 7 diferentes (3 mismatches)
6. 🟡 **Stats `<ms` bug** — homepage "Classify latency" mostra `<ms` sem número (devia ser `<50ms`)

## 1. Findings completos da auditoria (não reescrever — referência)

### 1.1 Versão stale em produção

| Sítio | Versão mostrada | Esperado |
|---|---|---|
| Landing footer `mooter.ai/` | `v0.10.1 · build 9fd7109` | `v1.1.0` |
| Dashboard header chip `/dashboard` | `v0.9` | `v1.1.0` |
| Dashboard footer | `mooter v0.9` | `v1.1.0` |

Repo tem tag `v1.1.0` (Wave 8). Significa que `main` não foi promovido OU o deploy Vercel está numa branch desactualizada OU a version string está hardcoded em ficheiro stale.

### 1.2 Stats Overview vs How it works (no MESMO dashboard)

| Tab | $ Saved | Decisões | % away from Opus |
|---|---|---|---|
| Overview | **$73.85** | **663** | **100%** |
| How it works | **$0.00** | **0** | **0%** |

How it works mostra também tier distribution: T0 59% · T1 12% · T2 0% · T3 29%. Mas Overview diz 100% away from Opus (= 0% T3). **Contradição directa.**

### 1.3 Pattern count discrepância

- Landing `mooter.ai/` (homepage section "How it works"): `"167 regex patterns"`
- Dashboard `/dashboard` tab "How it works": `"40+ patterns"`
- Dashboard same tab card classify.js: `"230 samples trained"`

### 1.4 Code-switching PT/EN

Dashboard tab "Overview" tem strings PT injectadas em UI predominantemente EN:
- `"Claude Max detected — Opus sem limite. Router usa T0 local quando disponível, T3 Opus para o resto."`
- `"Instala qwen2.5:3b para T0 rápido"`
- `"O teu GPU aguenta. qwen3:30b faz root cause analysis local — grátis."`

Landing é 100% EN. Inconsistente.

### 1.5 7-features list mismatch (dashboard How it works tab)

| Visual (7 chips) | Texto descritivo (7 nomes) |
|---|---|
| has_code_block | has_code_block ✓ |
| has_file_refs | has_file_refs ✓ |
| has_error_trace | has_error_trace ✓ |
| lang_detected | is_question ❌ |
| quality_intent | has_url ❌ |
| complexity_score | lang_detected ✓ |
| risk_level | file_ref_count ❌ |

3 mismatches: visual mostra `quality_intent / complexity_score / risk_level`, texto refere `is_question / has_url / file_ref_count`.

### 1.6 Homepage `<ms` bug

Stats hub na homepage mostra "Classify latency" com valor `<ms` (string vazia onde devia estar `50`).

## 2. Recon OBRIGATÓRIO (lição 10×)

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma v1.1.0 + Wave 8 merged

# === Recon 1: Vercel deploy ===
# Qual branch o domain mooter.ai aponta?
ls landing/.vercel/ 2>/dev/null
cat landing/vercel.json 2>/dev/null
grep -rn 'gitBranch\|deployment\|production' landing/.vercel/ 2>/dev/null
# Verifica se há ficheiro com version hardcoded
grep -rn '0\.10\.1\|v0\.9\|v0\.10' landing/ packages/cli/ --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' 2>/dev/null | head -20

# === Recon 2: Stats endpoints ===
# Overview tab lê de onde?
grep -rn 'Overview\|663\|73\.85' landing/app/dashboard/ 2>/dev/null | head -10
# How it works tab lê de onde?
grep -rn 'how-it-works\|HowItWorks\|29\.83' landing/app/dashboard/ 2>/dev/null | head -10

# === Recon 3: Pattern count ===
# Quantos patterns tem realmente classify.js?
grep -E "^\s*\{\s*pattern" tools/router/classify.js | wc -l
# Onde está o número 167 hardcoded?
grep -rn '167' landing/ 2>/dev/null | head -5
# Onde está o "40+"?
grep -rn '40+ patterns\|40\\\\+\\s*patterns' landing/ 2>/dev/null | head -5
# Onde está "230 samples"?
grep -rn '230 samples\|230\\s*samples' landing/ 2>/dev/null | head -5

# === Recon 4: PT strings no dashboard ===
grep -rn 'Opus sem limite\|O teu GPU\|Instala qwen' landing/ 2>/dev/null | head -10

# === Recon 5: 7 features ===
grep -rn 'has_code_block\|has_error_trace\|quality_intent\|file_ref_count' landing/ 2>/dev/null | head -20

# === Recon 6: <ms bug ===
grep -rn '\\<ms\|"<ms"\|<\\s*ms' landing/ 2>/dev/null | head -10
grep -rn 'classify.*latency\|classifyLatency' landing/ 2>/dev/null | head -10
```

**REPORTA o que descobriste ao Paulo via chat antes de implementar.** Em particular:
- Qual a branch que Vercel aponta para `mooter.ai`?
- Overview e How it works partilham fonte de dados ou não?
- Quantos patterns reais tem o `classify.js` actual?

Aguarda confirmação Paulo antes de prosseguir com fixes.

## 3. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11) — esta wave NÃO toca em `tools/router/classify.js`
- ❌ **safety_boost + adapter_selection + schemas INTACTOS**
- ❌ **hub/ NOT touched**
- ❌ **migrations 006/007/008 já aplicadas — não re-aplicar**
- ❌ **Não `git add -A`** · **`--no-verify`** · merge `main` sem Paulo aprovar
- ❌ **Sub-feature 1 (Vercel)**: NÃO mudar config produção sem reportar plan ao Paulo primeiro
- ❌ **Sub-feature 4 (language)**: NÃO traduzir strings sem Paulo decidir a policy primeiro (EN-only vs i18n toggle)
- ✅ **Final-reviewer T3-gate obrigatório**
- ✅ **Auto-merge dev após APPROVE** (NUNCA main directamente)
- ✅ **Tag v1.1.1-prod-parity** após merge dev
- ✅ **Vocabulário GLOSSARY** (Mooter, Moos, packs)

## 4. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git checkout -b wave9-prod-parity-fix
```

## 5. Sub-features — fixes

### 5.1 Vercel parity (🔴 prioridade máxima)

**Investigação**:
- Confirma em Vercel CLI ou via dashboard qual a branch produção para domain `mooter.ai`
- Se `main`: faz `git checkout main && git merge dev --ff-only` (se Paulo aprovar) + push → trigger redeploy
- Se outra branch: documenta-o para Paulo decidir
- Verifica também versão hardcoded em `landing/package.json` + `landing/app/page.tsx` (provavelmente footer string) + dashboard `v0.9` (provavelmente lê de `mooter --version` reportado pela CLI do Paulo na ultima phone-home — neste caso o fix é Paulo correr `curl -fsSL https://mooter.ai/install.sh | bash` para upgrade local, NÃO é fix no repo)

**Fix esperado**:
- `landing/app/(landing)/page.tsx` ou `landing/app/layout.tsx`: actualizar version string para ler dinamicamente de `landing/package.json#version` (já é `1.0.0` no manifest — deve passar a `1.1.0`)
- `landing/package.json`: bump version para `1.1.0` (alinhado com tag global)
- Vercel: confirmar branch + force redeploy

### 5.2 Stats reconciliation (🔴 prioridade máxima)

**Investigação**: Overview tab lê do endpoint X, How it works lê do endpoint Y (ou hardcoded). Encontra ambos.

**Decisão de design** (reportar a Paulo antes de implementar):
- **Opção A**: How it works herda os mesmos números do Overview (single source of truth)
- **Opção B**: How it works mostra "Demo data" badge explícito quando não tem ligação ao hub real
- **Opção C**: How it works só mostra distribution percentages (T0/T1/T2/T3 share), sem $/decisões absolutos

Recomendação: **Opção A** (single source of truth) — números diferentes no mesmo dashboard destroem trust.

**Fix esperado**:
- Identificar o componente que lê o source canónico (provavelmente `landing/app/dashboard/_components/StatsOverview.tsx` ou similar)
- Reutilizar no How it works tab ou injectar via prop drilling/context

### 5.3 Pattern count truth (🟠)

**Verificação**:
```bash
# Conta patterns REAIS no classify.js actual
grep -E "^\s*\{\s*pattern" tools/router/classify.js | wc -l
```

**Decisão**: substituir os 3 números diferentes por **UM único número real**, computado em build-time se possível (ler `classify.js` na build do landing, OR exportar o número de `tools/router/classify.js` via constante).

**Fix esperado**:
- `tools/router/classify.js`: exportar `export const PATTERN_COUNT = <real>;`
- `landing/app/(landing)/page.tsx`: importar e renderizar `{PATTERN_COUNT}+ regex patterns`
- `landing/app/dashboard/_components/HowItWorks.tsx`: idem
- O "230 samples trained" devia vir do hub (decisões processadas) — manter separado mas com source claro

### 5.4 Language policy (🟠)

**Decisão Paulo** (reportar antes de implementar):
- **Opção 1**: EN-only em todo `landing/` (público) — traduz strings PT existentes para EN
- **Opção 2**: Adicionar toggle PT/EN no header (sistema i18n com next-intl ou simples switch)

Recomendação: **Opção 1** para já (ship faster, simpler). i18n quando houver mercado PT confirmado.

**Fix esperado se Opção 1**:
- Traduzir strings detectadas:
  - `"Claude Max detected — Opus sem limite..."` → `"Claude Max detected — Opus unlimited. Router uses local T0 when available, T3 Opus for the rest."`
  - `"Instala qwen2.5:3b para T0 rápido"` → `"Install qwen2.5:3b for fast T0"`
  - `"O teu GPU aguenta..."` → `"Your GPU can handle qwen3:30b — runs local root-cause analysis for free."`

### 5.5 7-features mismatch (🟡)

**Verificação**: `tools/router/classify.js` ou `tools/router/signal_extraction.*` — quais são as features reais extraídas?

**Fix esperado**:
- Alinhar visual chips e texto descritivo com o que `classify.js` realmente extrai
- Provavelmente o texto está correcto (features mais antigas) e o visual desactualizou — verificar com `grep` no classify

### 5.6 `<ms` bug (🟡)

**Verificação**:
```bash
grep -rn 'Classify latency\|classifyLatency\|latency' landing/app/ 2>/dev/null | head -5
```

**Fix esperado**: provavelmente template literal a fazer interpolação de variável `undefined`. Hardcode `<50ms` ou ler de uma constante.

## 6. Verification

```bash
# Após cada sub-feature, verifica invariantes
git diff dev tools/router/classify.js          # DEVE estar VAZIO
git diff dev tools/router/safety_boost.js      # DEVE estar VAZIO (só Wave 3 D1 mudou aqui)
git diff dev tools/router/adapter_selection.js # DEVE estar VAZIO (só Wave 5 D2 mudou aqui)
git diff dev hub/                              # DEVE estar VAZIO
git diff dev landing/migrations/                # DEVE estar VAZIO (006/007/008 já aplicadas)

# Manual smoke local
cd landing && npm run dev
# Visita http://127.0.0.1:7819 — versão deve ler 1.1.0
# Login → /dashboard → confirmar Overview e How it works mostram MESMOS números
# Verifica pattern count consistente nas duas localizações
# Verifica strings consistentes (EN-only se Opção 1)
```

## 7. Tests aggregate

- Pre-W9: tests existentes mantidos (landing ~89 · CLI 175 do ultimo report)
- W9 adições mínimas (estes são fixes não features novas):
  - 1 teste de version consistency (landing footer + dashboard header lêem mesma source)
  - 1 teste stats reconciliation (Overview e How it works lêem mesma source)
  - 1 teste pattern count (PATTERN_COUNT constante existe e bate com classify.js)
- Total esperado: ~92 landing · 175 CLI

## 8. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave9-prod-parity-fix vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + schemas INTACTOS
- hub/ + landing/migrations/ NOT touched
- Sub-feature 1 (Vercel): version 1.1.0 lê dinamicamente de package.json, NÃO hardcoded
- Sub-feature 2 (stats): Overview e How it works lêem mesma fonte (data prop ou hook partilhado)
- Sub-feature 3 (patterns): PATTERN_COUNT exportado de classify.js, importado nas 2 localizações
- Sub-feature 4 (language): strings detectadas traduzidas para EN consistentemente (se Opção 1 escolhida)
- Sub-feature 5 (features): visual e texto alinhados em 7 nomes idênticos
- Sub-feature 6 (<ms): valor agora mostra '<50ms' ou similar (não string vazia)
- Vocabulário GLOSSARY (Mooter, Moos, packs)
- ZERO PII em qualquer string nova
- Sem git add -A
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 9. PR + auto-merge + tag

```bash
git push -u origin wave9-prod-parity-fix
PR=$(gh pr create --base dev --title "Wave 9: Prod Parity Fix (version + stats + patterns + lang + features + <ms bug)" --body-file - <<'EOF'
## Summary
6 sub-features que reconciliam mooter.ai prod com repo state:
- Version 1.1.0 dinâmica (package.json → footer + dashboard)
- Stats Overview ↔ How it works single source of truth
- PATTERN_COUNT canónico (classify.js → landing + dashboard)
- Language policy EN-only (3 strings PT traduzidas)
- 7-features visual ↔ texto alinhados
- Homepage "Classify latency <50ms" (era "<ms")

## Origem
Auditoria Cowork 2026-06-01 em mooter.ai/dashboard. Findings em docs/strategy/WAVE9_PROD_PARITY_FIX_KICKOFF.md §1.

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost + adapter_selection + schemas INTACTOS ✓
- hub/ + migrations NOT touched ✓
- landing/ Phases A+B+C+W6+W6.5+W7+W8 INTACTOS — só fix UI parity ✓

## Tests
- Landing ~92 · CLI 175
- Sanity cost: $0

## Manual setup (Paulo)
- Vercel: confirma branch produção alvo + force redeploy após merge

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 10. Closure W9

```bash
git checkout dev && git pull origin dev
cd packages/cli && npm test
cd ../../landing && npm test && npm run typecheck
cd ..

git tag -a v1.1.1-prod-parity -m "Wave 9: Prod Parity Fix (mooter.ai vs repo)"
git push origin v1.1.1-prod-parity
```

+ Notion (nova sub-page Wave 9 no HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) + SYNC.md update + memória `project_mooter_pastor_wave9_prod_parity_shipped`.

## 11. Resumo final (output esperado ao Paulo)

```
✅ Wave 9 — Prod Parity Fix COMPLETA
- Branch: wave9-prod-parity-fix (merged)
- 6 sub-features: version dinâmica · stats reconciled · patterns canónico · lang EN · features aligned · <50ms bug
- Tests: ~92 landing · 175 CLI verdes
- Tag: v1.1.1-prod-parity

⏸ Para. Próximo passo:
1) Paulo faz Vercel force redeploy de main (ou branch confirmada)
2) Re-audita mooter.ai/dashboard via Cowork
3) Se OK → continua com validation 5 vibe coders (VALIDATION_PLAN.md)
```

=== END ===

---

## Notas para Paulo (Cowork)

- **Wave 9 ≠ feature wave** — é debt cleanup. Bloqueia validation honest com vibe coders.
- **Após merge + redeploy, Cowork re-audita** as 3 páginas (homepage, dashboard Overview, dashboard How it works) e confirma os 6 fixes em prod.
- **Sub-feature 1 (Vercel)** depende de eu (Paulo) confirmar qual a branch que `mooter.ai` aponta — CC pode descobrir via `landing/.vercel/project.json` mas só posso aprovar o redeploy depois de confirmar nada quebra.
- **Sub-feature 4 (language)** decide policy comigo antes de traduzir — eu prefiro **Opção 1 EN-only** mas confirma antes.
- Custo estimado: 2-3h CC (T2/T3 mix) · $5-10 Anthropic API.
