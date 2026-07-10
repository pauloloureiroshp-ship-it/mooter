# WAVE 2 DAY 1 KICKOFF — Bottleneck Fixes (single copy-paste)

> **Contexto**: Wave 1 Pastor shipped ✅ (tag `v0.1.0-pastor-wave1`, repo `mooter` público). Benchmark Wave 1 deu veredicto **WEAK 1/3** (quality ✓, cost ✗, latency ✗). REPORT.md identificou 2 bottlenecks com fixes ranked por effect size.
>
> **Objectivo único Day 1**: implementar os 3 fixes top-priority do REPORT §8 e validar com sanity check. **Não tocar embedding layer nem packs adicionais hoje.**
>
> **Pré-condições**:
> - `main` em `020e80f` ou superior (com REPORT.md em `docs/benchmarks/wave1-pastor/`)
> - `~/.bashrc` tem `ANTHROPIC_API_KEY` válida (não rotacionada — decisão consciente do Paulo)
> - `OLLAMA_HOST=http://host.docker.internal:11434` exportado
> - Ollama no Windows host accessible
> - Branch `wave2-day1-fixes` criada a partir de `main`
>
> **Tu (Paulo) faz exactamente isto**:
> 1. Se Claude Code aberto: `/exit`
> 2. Abre **Ubuntu Terminal**
> 3. `cd ~/mooter && git checkout main && git pull origin main && git checkout -b wave2-day1-fixes && claude --permission-mode auto`
> 4. Quando `>` aparecer, cola o bloco entre `=== START ===` e `=== END ===` (selecciona em `WAVE2_DAY1_KICKOFF.md` no Bloco de Notas → Ctrl+C → Ctrl+Shift+V no terminal)
> 5. Acompanha. 2-3 confirmações pontuais (per-fix sanity check).

---

=== START ===

És Claude Code em `~/mooter/`, branch `wave2-day1-fixes`. A tua missão hoje: **implementar os 3 fixes top-priority do Wave 1 Pastor Benchmark** (pre-identified em `docs/benchmarks/wave1-pastor/REPORT.md` §8).

Não és executor cego. Lês o REPORT.md primeiro, entendes o por quê de cada fix, e implementas com disciplina. Anomalies vão para anomalies log no fim, não para mudanças mid-fix.

---

## FASE 0 — Self-prep (sem perguntar)

```bash
pwd
git branch --show-current
git log --oneline | head -3
ls docs/benchmarks/wave1-pastor/REPORT.md
ls packs/code-audit/pack.yaml
ls packages/router/src/hooks/inject_context.ts
ls tools/router/ollama_call.sh 2>/dev/null || echo "no ollama_call.sh — using lib/ollama-client.ts pattern"
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:7}..."
curl -s -m 5 "$OLLAMA_HOST/api/tags" | head -c 200
```

**Aborta se:**
- Branch actual ≠ `wave2-day1-fixes`
- `REPORT.md` não existe
- `code-audit/pack.yaml` ou `inject_context.ts` não existem
- ANTHROPIC_API_KEY vazio ou não começa por `sk-ant-`
- Ollama não responde

---

## FASE 1 — Leitura obrigatória (~15 min)

Lê na ordem (não summaries):

1. `~/mooter/docs/benchmarks/wave1-pastor/REPORT.md` §8 (Wave 2 priorities) — entende **por que** cada fix
2. `~/mooter/docs/benchmarks/wave1-pastor/REPORT.md` §4 (Bottleneck analysis) — entende **mecânica** de cada bottleneck
3. `~/mooter/packs/code-audit/pack.yaml` — schema actual + model_floor
4. `~/mooter/packs/animation-web/pack.yaml` + `diagram-systems/pack.yaml` — referência de estrutura
5. `~/mooter/packs/pack.schema.yaml` — schema canónico
6. `~/mooter/packages/router/src/classify_complexity.ts` — wrapper sobre classify.js
7. `~/mooter/packages/router/src/classify_domain.ts` — domain classifier
8. `~/mooter/packages/router/src/pack_resolve.ts` — pack resolution
9. `~/mooter/packages/router/src/hooks/inject_context.ts` — hook UserPromptSubmit (onde o tier final + scaffold final é decidido)
10. `~/mooter/tools/router/ollama_call.sh` (ou equivalente) — T0 model invocation
11. `~/mooter/tools/router/classify.js` — eixo 1 (apenas leitura, NÃO tocar)

Confirma "Leitura completa, prosseguindo para Fase 2".

---

## FASE 2 — Resumo + 1 confirmação ao Paulo

Resume os 3 fixes que vais fazer + plano de testes. Pede confirmação.

Resumo esperado a apresentar:

```
Plano Day 1 (3 fixes em ordem):

FIX #1 — GENERAL fallback policy (priority highest, REPORT §4 #1)
  WHERE: packages/router/src/hooks/inject_context.ts
  WHAT: quando classify_domain() retorna pack_id="GENERAL", force tier="T2" (Sonnet)
        em vez de cair para T0/Ollama. Adicionar scaffold mínimo "general engineering
        assistant, no specific domain".
  WHY: REPORT §3.5 — GENERAL routes to T0 qwen3:30b → quality 0.695 vs 0.999 Sonnet
       bare (-30pp), latency 149s (7× pior), 1/2 timeouts vêm daqui.
  ESTIMATED EFFECT: quality +25pp em GENERAL, latency -85%, elimina timeouts.

FIX #2 — code-audit model_floor T3 → T2 + keyword escalation (REPORT §4 #2)
  WHERE: packs/code-audit/pack.yaml + packages/router/src/pack_resolve.ts (escalation logic)
  WHAT: mudar floor T3 → T2, ceiling T3. Adicionar escalation_keywords no pack.yaml:
        ["audit completo", "production audit", "vulnerability assessment",
         "security review for production", "arquitectura de segurança"].
        Em pack_resolve: se prompt contém algum keyword → escalate tier para T3.
        Schema patch: adicionar `escalation_keywords: [string]` ao pack.schema.yaml.
  WHY: REPORT §3.2 — 8/8 prompts code-audit foram para Opus. cost +18% vs Sonnet.
       Lint/dependency check/secret scan (T1-T2) não precisam Opus.
  ESTIMATED EFFECT: ~5 prompts re-routed Opus→Sonnet, cost saving 30% no pack.
  QUALITY RISK: -2pp em audits sérios. Mitigação: keyword escalation força T3 quando
                user explicitamente pede audit profundo.

FIX #3 — T0 default model qwen3:30b → qwen2.5-coder:7b (REPORT §4 #3)
  WHERE: tools/router/ollama_call.sh (ou wrapper TS) + tier mapping em inject_context
  WHAT: trocar T0 default model. Manter qwen3:30b como T0 explicit override
        (env var OLLAMA_T0_MODEL_OVERRIDE ou flag em pack.yaml).
  WHY: REPORT §4 #3 — qwen3:30b é reasoning model com long thinking chains, lento
       (149s mean em GENERAL, 93s em animation-web), 2 timeouts.
  ESTIMATED EFFECT: latency T0 -60%, zero timeouts esperados.

VALIDATION (sanity check 5 prompts):
  - P005 GENERAL "configura edge functions Vercel" — pre-fix: T0 timeout. Pos-fix:
    Sonnet T2 deve responder em <15s com quality >0.9.
  - P012 animation-web T3 "orquestra timeline scrubbable" — pre-fix: timeout. Pos-fix:
    routed para Opus T3 (correctly), responde em <30s.
  - P013 code-audit T1 "lint mental React" — pre-fix: Opus (forced floor). Pos-fix:
    Haiku/Sonnet T1-T2 (sem keyword) com cost <$0.005.
  - P018 code-audit T3 "audit completo arquitectura JWT" — pos-fix: keyword "audit completo"
    escalation → Opus T3 (mantém). Quality alta.
  - P020 diagram-systems T1 "sequence HTTP" — control: continua Haiku T1. Sem regressão.

COMMITS (5 selectivos):
  1. fix(packs): code-audit floor T2 + escalation_keywords
  2. fix(packs): pack.schema.yaml adds escalation_keywords field
  3. feat(router): GENERAL fallback to T2 Sonnet with general-expert scaffold
  4. feat(router): T0 default qwen2.5-coder:7b + override via env var
  5. test(bench): sanity 5 prompts pos-fixes — 5/5 expected behavior

PR target: dev (não main). final-reviewer antes do PR.

ANOMALIES log se houver desvios.

Avança?
```

Espera "Sim, avança" ou ajustes do Paulo.

---

## FASE 3 — Implementação dos 3 fixes

### Fix #1 — GENERAL fallback policy

**File**: `packages/router/src/hooks/inject_context.ts`

Find: lógica que constrói `<pack-hint>` e tier final.

Modificar para:
```typescript
// Quando pack_id === "GENERAL", força tier mínimo T2 (Sonnet) e adiciona scaffold mínimo
if (packResult.pack_id === "GENERAL") {
  // Override tier para T2 se classifyComplexity sugeriu T0 ou T1
  if (complexityResult.tier === "T0" || complexityResult.tier === "T1") {
    complexityResult.tier = "T2";
    complexityResult.reason = "GENERAL pack — overriding to T2 (no domain pack to specialise)";
    complexityResult.model = "claude-sonnet-4-6";
  }
  // Inject general-expert scaffold
  packResult.scaffold_inline = `You are a senior multi-domain engineer. The user's prompt does not match a specific Pastor pack — address it with general engineering best-practices, citing language/framework idioms when relevant. Be concrete and actionable.`;
}
```

Test: prompt "configura GitHub Actions" → deve resultar em `tier=T2, model=claude-sonnet-4-6, scaffold=<general-expert>` no `<pack-hint>`.

Commit: `feat(router): GENERAL fallback to T2 Sonnet with general-expert scaffold`

---

### Fix #2 — code-audit floor T2/T3 + keyword escalation

**File 1**: `packs/pack.schema.yaml`

Adicionar:
```yaml
escalation_keywords:
  type: array
  items: { type: string }
  description: Keywords in the prompt that force escalation to model_ceiling
  required: false
```

Commit: `fix(packs): pack.schema.yaml adds escalation_keywords field`

**File 2**: `packs/code-audit/pack.yaml`

Mudar:
```yaml
model_floor: T2           # was: T3
model_ceiling: T3         # was: T3 (unchanged)
escalation_keywords:
  - "audit completo"
  - "production audit"
  - "vulnerability assessment"
  - "security review for production"
  - "arquitectura de segurança"
  - "complete security audit"
  - "production-grade audit"
```

Commit: `fix(packs): code-audit floor T2 + escalation_keywords`

**File 3**: `packages/router/src/pack_resolve.ts` (or wherever tier from pack is applied)

Adicionar logic:
```typescript
// Em pack_resolve ou no hook
function applyTierEscalation(prompt: string, pack: Pack, suggestedTier: Tier): Tier {
  if (!pack.escalation_keywords || pack.escalation_keywords.length === 0) {
    return suggestedTier;
  }
  const promptLower = prompt.toLowerCase();
  const escalated = pack.escalation_keywords.some(k => promptLower.includes(k.toLowerCase()));
  if (escalated) {
    return pack.model_ceiling || "T3";
  }
  return suggestedTier;
}
```

Aplicar em `inject_context.ts` antes de finalizar tier:
```typescript
finalTier = applyTierEscalation(prompt, resolvedPack, complexityResult.tier);
```

Commit incluído no fix(packs) acima OU separado `feat(router): tier escalation via pack keywords`.

---

### Fix #3 — T0 model swap

**File 1**: `tools/router/ollama_call.sh`

Find: `MODEL=` ou default model variable.

Change default from `qwen3:30b` to `qwen2.5-coder:7b`.

Manter override via env var:
```bash
MODEL="${OLLAMA_T0_MODEL_OVERRIDE:-qwen2.5-coder:7b}"
```

Test: `OLLAMA_T0_MODEL_OVERRIDE=qwen3:30b ./tools/router/ollama_call.sh "test"` ainda usa qwen3:30b.

**File 2**: `tools/router/classify.js` (apenas se T0 model é referenced lá; otherwise skip)

NOTE: classify.js não muda (P11 do CLAUDE.md doctrine — eixo 1 byte-identical). Se T0 model é referenced só em `ollama_call.sh`, sem touch a classify.js.

**File 3**: Document em `docs/adr/017-t0-model-default-swap.md` ADR:
- Context: REPORT.md showed qwen3:30b T0 causa timeouts + slow latency
- Decision: default qwen2.5-coder:7b (2x+ faster, code-specialized)
- Alternatives: qwen3:14b (general, but slower than 7b), qwen2.5:3b (smaller but lower quality)
- Status: Proposed

Commit: `feat(router): T0 default qwen2.5-coder:7b + override via env var + ADR 017`

---

## FASE 4 — Sanity check (5 prompts)

Cria `packages/router/scripts/wave2-day1-sanity/`:

```typescript
// run.ts — sanity check pos-fixes
const PROMPTS = [
  { id: "P005", block: "GENERAL", prompt: "configura edge functions no Vercel para fazer redirects por geolocalização do utilizador.", expected: { tier: "T2", model: "claude-sonnet-4-6", latency_max_ms: 15000, quality_min: 0.85 } },
  { id: "P012", block: "animation-web", prompt: "orquestra uma sequência de entrada de 6 elementos com stagger, easing diferente por elemento, e uma timeline scrubbable por scroll-trigger.", expected: { tier: "T3", model: "claude-opus-4-7", latency_max_ms: 30000, quality_min: 0.85 } },
  { id: "P013", block: "code-audit", prompt: "corre um lint mental a este componente React e aponta inconsistências de estilo e coerência (naming, hooks, etc.).", expected: { tier: "T1_or_T2", model_not: "claude-opus-4-7", cost_max_usd: 0.005, quality_min: 0.80 } },
  { id: "P018", block: "code-audit", prompt: "audit completo à arquitectura de segurança deste fluxo de auth: o JWT e o refresh token são guardados em localStorage, sem rotation.", expected: { tier: "T3", model: "claude-opus-4-7", quality_min: 0.90 } },
  { id: "P020", block: "diagram-systems", prompt: "diagrama de sequência simples em mermaid para um pedido HTTP.", expected: { tier: "T1", model_not_opus: true, latency_max_ms: 12000, quality_min: 0.85 } },
];
```

Para cada prompt: invoca o hook chain (classify + pack_resolve + tier resolution), e verifica que `expected` está satisfeito.

Output: `outputs/SANITY_REPORT.md` com tabela pos-fix vs pre-fix (do Wave 1 benchmark).

⚠️ **Pause/ask Paulo** se algum dos 5 prompts falhar expected behavior — pode indicar fix incomplete ou regression.

Commit: `test(bench): sanity 5 prompts pos-fixes — 5/5 expected behavior`

---

## FASE 5 — final-reviewer + PR para dev

```
> /agents
> [final-reviewer]
> Review the 5 commits in wave2-day1-fixes. Focus on:
> 1. GENERAL fallback correctness (no regression para pack-specific routing)
> 2. code-audit keyword escalation logic (escalates correctly without false positives)
> 3. T0 model swap (preserves env override, no breaking change to existing T0 flows)
> 4. Sanity test coverage (5 prompts cover all 3 fixes)
> 5. ADR 017 completeness
```

Espera APPROVE (com nits OK). Se BLOCKER, fix antes de PR.

```bash
git push -u origin wave2-day1-fixes
gh pr create --base dev --head wave2-day1-fixes \
  --title "Wave 2 Day 1 — Bottleneck Fixes (GENERAL fallback + code-audit floor + T0 swap)" \
  --body "Closes 3 highest-priority REPORT.md §8 items. Pre-fix benchmark verdict WEAK 1/3 (quality OK, cost+latency fail). Post-fix sanity: 5/5 prompts behave as expected.

Fixes:
- #1 GENERAL fallback to T2 Sonnet (was T0 Ollama → quality crash 30pp, 2 timeouts)
- #2 code-audit model_floor T2/T3 + escalation_keywords (was T3 forced all 8 prompts to Opus)
- #3 T0 default qwen2.5-coder:7b (was qwen3:30b reasoning model causing timeouts)

ADR 017 documents T0 swap rationale.
Sanity test report in packages/router/scripts/wave2-day1-sanity/outputs/SANITY_REPORT.md.

Predicted impact (full benchmark re-run on Day 7 will validate):
- GENERAL quality 0.695 → ~0.95 (+25pp)
- code-audit cost -30% (5 prompts Opus → Sonnet)
- T0 latency -60% (no timeouts)
- Pastor wins: WEAK 1/3 → predicted MEDIUM 2/3 or STRONG 3/3"
```

NÃO mergeas para dev tu — Paulo decide mergear depois de review.

Commit final: `docs(sync): Wave 2 Day 1 — bottleneck fixes shipped, PR #X opened`

---

## FASE 6 — Closure

Reporta ao Paulo num único bloco:

```
✅ Wave 2 Day 1 — Bottleneck Fixes COMPLETO

Branch: wave2-day1-fixes (pushed, NÃO merged)
PR: #X (link)
Commits: 5 selectivos

Fixes implemented:
1. ✅ GENERAL fallback to T2 Sonnet + general-expert scaffold
2. ✅ code-audit floor T2/T3 + escalation_keywords (5 keywords)
3. ✅ T0 default qwen2.5-coder:7b + OLLAMA_T0_MODEL_OVERRIDE env var
+ ADR 017 documenting T0 swap

Sanity check (5 prompts pre-vs-pos):
- P005 GENERAL: T0 timeout → T2 Sonnet 14s, quality X
- P012 animation T3: T0 timeout → T3 Opus 28s, quality X
- P013 code-audit lint: Opus → Sonnet T2, cost $X (-Y%)
- P018 code-audit audit: Opus T3 (escalated correctly via keyword)
- P020 diagram simple: Haiku T1 (no regression)

Pre-fix benchmark verdict: WEAK 1/3 vs Sonnet
Predicted post-fix verdict (re-bench Day 7): MEDIUM 2/3 or STRONG 3/3

final-reviewer (Opus): APPROVE/APPROVE_WITH_NOTES

Anomalies: <X registadas> | <vazio>

Próximo: Paulo merge PR para dev. Wave 2 Day 2: AMBIGUOUS scaffold + animation-web compression.
```

---

## Constraints non-negotiable

- ❌ NÃO tocar `tools/router/classify.js` (eixo 1 byte-identical — P11 doctrine)
- ❌ NÃO mexer em embedding layer hoje (Wave 2 Day 3-4)
- ❌ NÃO criar packs novos (data-spreadsheet etc. é Day 4-6)
- ❌ NÃO mergear para `main` ou `dev` — só PR aberto para `dev`
- ❌ NÃO `git add -A` — commits selectivos
- ❌ NÃO inventar packages/libs novas no código (qwen2.5-coder:7b já existe no Ollama host, verifica primeiro com `ollama list`)
- ⚠️ Schema patch (escalation_keywords) precisa de ser backward-compatible — packs antigos sem o campo continuam válidos

---

## Definition of Done

- [ ] 5 commits selectivos (3 fix + 1 ADR + 1 sanity test)
- [ ] code-audit/pack.yaml com `model_floor: T2` + `escalation_keywords` (5+ entries)
- [ ] pack.schema.yaml com `escalation_keywords` field documented
- [ ] inject_context.ts ou pack_resolve.ts com escalation logic + GENERAL override
- [ ] tools/router/ollama_call.sh com qwen2.5-coder:7b default + env override
- [ ] docs/adr/017-t0-model-default-swap.md
- [ ] packages/router/scripts/wave2-day1-sanity/{run.ts, outputs/SANITY_REPORT.md}
- [ ] 5/5 sanity prompts behave as expected (FAILED = pause + ask Paulo)
- [ ] final-reviewer APPROVE
- [ ] PR #X aberto para `dev`, NÃO merged
- [ ] Notion HQ sub-page "🛠 Wave 2 Day 1 — Bottleneck Fixes"
- [ ] SYNC.md updated

---

## Quando parar e perguntar

- Sanity test 1+/5 falha behavior expected → PAUSE + ask
- Schema change quebra um pack existente → PAUSE + ask
- Ollama `qwen2.5-coder:7b` não está local (precisa `ollama pull`) → PAUSE + ask antes de pull (download ~5GB)
- Cost da sanity test ≥ $1 (esperado < $0.10) → PAUSE + ask
- final-reviewer BLOCKER → PAUSE + show feedback antes de tentar fix

Para tudo o resto, **decide tu** e segue.

---

## Princípio último

Pre-registration do Wave 1 Benchmark fixou as métricas e a metodologia. **Os fixes implementados hoje serão validados** com o mesmo design no re-benchmark Day 7. Se um fix não move o verdict pos-bench, foi placebo.

**Honestidade > velocidade**. Se um fix introduz regression em outro pack (e.g. GENERAL fallback faz com que prompts genuinely-trivial gastem mais), anota e discute. Não esconder.

Ready. Começo agora pela Fase 0 (self-prep)?

=== END ===

---

## Notas para o Paulo (não vão para Claude Code)

- **Tempo estimado**: 3-4h. Mais complexo que Wave 1 Day 1 porque toca em 3 ficheiros distintos + logic em pack_resolve, mas mais simples no scope (sem schema massivo).
- **Cost estimado**: <$1 (5 prompts sanity × 3 arms ~$0.30) + Sonnet judge opcional (~$0.20).
- **Decisão tua durante a run**:
  - "Sim, avança" no resumo Fase 2
  - "Yes" se Claude pedir confirmação antes de `ollama pull qwen2.5-coder:7b` (se não está local)
  - Outras: aprovar tool calls como sempre
- **No fim**: Claude vai dizer "PR #X aberto para dev". Tu mergeas via Cowork (eu faço via Chrome) OU via `gh pr merge` no terminal.
- **Wave 2 Day 2 vem depois** (AMBIGUOUS scaffold + animation-web compression). Master prompt Day 2 será composto depois de Day 1 fechar.
