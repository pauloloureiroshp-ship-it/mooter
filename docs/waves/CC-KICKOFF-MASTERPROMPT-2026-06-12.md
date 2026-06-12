# CC KICKOFF — Waves pré e pós-lançamento (A→F)

> **Para:** Claude Code · repo `mooter` · partir de `main` actualizado (HEAD ≥ eaf935e)
> **De:** Cowork 2026-06-12 · **Aprovado:** Paulo · **Contexto:** lançamento público D5 — estas waves preparam e sustentam.

## Estado do mundo (não re-descobrir, está validado)

- **main = prod** contém: Waves 53-58 + Kill Frugal W1-W3+W7 (identity migration ~/.frugal→~/.mooter, renames+shims, CI ratchet `no-frugal.yml` baseline 150) + product P0s (heartbeat no install.sh restaurado, @mooter/cli 0.1.0, landing badge dinâmico via `landing/app/version.json`).
- **dev = main** (reconciliado; manter assim: waves → branch → PR → main, dev segue main).
- Mac do Paulo: runtime v1.38 limpo, identidade `b14321f5` preservada, ~/.frugal morto.
- Heartbeat validado live na D1 (1º real: 2026-06-11T22:23Z). npm publish pendente do Paulo.
- Docs canónicos: `docs/rebrand/*` (Kill Frugal + reconcile), `packages/vscode-extension/docs/*` (extensão, F0 completa com P0-HOOK-TEST PASS), `docs/community/GOOD-FIRST-ISSUES.md`, `docs/releases/v1.35.0.md`.
- ⚠️ Lição de ontem: **feat/product-p0s quase ficou fora do merge para main** (branch paralelo). Regra: antes de cada release, `git log main..<branch>` para TODOS os branches activos.

## Regras globais (doutrina, inegociáveis)

1. `classify.js` FROZEN (CI-enforced). Read+Edit contextual, nunca sed/regex em massa, `node --check`/teste por ficheiro.
2. Ratchet no-frugal: a contagem (150) nunca sobe; cada wave deve baixá-la quando tocar nos ficheiros.
3. Cada wave: branch próprio → suite verde + GATE → PR → main. SYNC.md (secção CC→COWORK) no fim de cada wave.
4. Telemetria/wire schema: NUNCA renomear campos sem migração D1 coordenada (Wave E é o lugar).
5. Histórico imutável: docs/archive, CHANGELOG passado, migrations 001-019.

---

## WAVE A — Moo Packs wired em prod 🔥 (P0 de produto, bloqueia metade da tese)

**Problema (deep-dive 2026-06-10):** o hook live `~/.claude/tools/router/inject_context.js` tem 0 lógica de packs; o pack-aware hook (`packages/router/src/hooks/inject_context.ts` + `pack_resolve.ts`) nunca é compilado/registado pelo install.sh. Packs instalam mas `<pack-hint>` nunca é emitido. **No Mac do Paulo há WIP unstaged**: `packages/router/src/_packhint_entry.ts` + alterações em packages/router/package.json — RECUPERAR este WIP primeiro (está no working tree de ~/mooter, branch dev), avaliar e terminar ou refazer.

**Execução:**
1. Recuperar/rever o WIP; decidir: entry-point TS compilado para JS no build do install (padrão do CLI bundle esbuild já existente em install.sh) OU porting da lógica pack_resolve para o inject_context.js runtime. Escolher o que preservar o budget <50ms do hook.
2. `pack_resolve`: resolver pack activo por workspace (pack_signals.jsonl + installed_packs.json em ~/.mooter) e emitir `<pack-hint>` no stdout do hook junto ao `<router-hint>`.
3. install.sh: garantir que o artefacto compilado vai para o runtime e o hook registado o usa.
4. Testes: unit (pack_resolve com fixtures), integração (hook completo emite pack-hint com pack activo; sem pack = sem hint, zero regressão no formato actual), latência (hook continua <500ms budget; alvo <50ms adicional).

**DoD:** num workspace com `code-audit` activo, prompt real produz `<pack-hint>` visível no decisions.log/contexto; suite verde; demo gravável para o lançamento.

## WAVE B — README launch-ready (a landing page do Show HN)

O tráfego do HN aterra no repo. README actual tem refs frugal e não vende.

**Estrutura obrigatória (conteúdo factual em docs/ e RODADA2):**
1. Hero: 1 frase ("The router for Claude Code — local-first, hook not proxy") + badges (CI, license MIT, npm version, release)
2. GIF placeholder 800×450 (`docs/assets/demo.gif` — Paulo grava depois; deixar `<!-- TODO: record -->` com storyboard: prompt → tier chip → saving)
3. Install: `npx @mooter/cli` primeiro, curl alternativo
4. "How it works in 60s": diagrama Mermaid (two-axis: complexity→tier, domain→pack; hook UserPromptSubmit; nunca intercepta API)
5. Números honestos: 47%/658 calls do autor + link methodology + **secção "Where mooter loses"** (OOD RouterBench, T1 dead zone) — a honestidade É o diferencial
6. "vs cost trackers" (ccusage/Clusage): eles mostram o que gastaste; mooter muda a bill — counterfactual
7. Risk floor: 70% disguised-destructive → T3 (1 parágrafo + exemplo)
8. Contributing: link good-first-issues + routing-miss issue form + Discussions
9. Zero "frugal" no README (ratchet desce)

**DoD:** README renderiza limpo no GitHub, zero frugal, links todos válidos.

## WAVE C — Kill Frugal cauda longa

Seguir `docs/rebrand/KILL-FRUGAL-MASTERPROMPT-2026-06-11.md` W4 restante. Prioridade por visibilidade: (1) tools/router strings visíveis restantes (statusline.sh, onboarding.js, README.md do router, smoke-test), (2) landing/ copy, (3) hub/ comments (NÃO tocar campos wire — Wave E), (4) packages/. Excluído: docs/archive, datasets congelados (validation-set.json, audit/*.jsonl — avaliar caso a caso se são fixtures vivas), migrations.

**DoD:** ratchet 150 → <80; actualizar `docs/rebrand/frugal-baseline.txt`; doctor check "classify doctrine sha" deixar de falhar fora do repo (bug conhecido, fix incluído).

## WAVE D — Numbers coherence (confiança = produto)

1. `/me.saved_usd_30d=0` vs `/metrics.saved=1.4939` no tracker :7821 — reconciliar (fonte única de verdade para savings; ver savings-tracker.js aggregateForUser pós-rebrand).
2. version.json 1.38 vs tags antigas → "update available" falso no CLI: corrigir o update-check para comparar contra release/tag real.
3. `landing/app/version.json` wire no workflow `version-sync.yml` (TODO deixado pelo Cowork — 3 linhas).
4. Landing badge "classify.js unchanged 19 waves" → tornar dinâmico ou actualizar o número (já vai em mais).

**DoD:** os mesmos números em /summary, /metrics, /me, statusline e landing; zero "update available" falso.

## WAVE E — Hub wire migration (pós-lançamento, sem pressa, NÃO no caminho crítico)

`frugal_event`/`frugal_version` no wire + tabela `frugal_events` na D1. Plano: (1) migration 020 cria `mooter_events` (cópia de schema) OU adiciona alias/view; (2) worker aceita ambos os payloads (campo novo `mooter_version` com fallback frugal_version) durante ≥4 semanas; (3) clients (event-builder.js) emitem nomes novos; (4) migration 021 remove legado quando a fleet migrar. Testes hub 86/86 + novos.

## WAVE F — VS Code extension F1→F3 (segundo acto, D+7 do lançamento)

Seguir `packages/vscode-extension/docs/VSCODE-EXTENSION-MASTERPROMPT-2026-06-11.md` a partir de F1 (F0 COMPLETA: P0 PASS, schemas validados em F0-VALIDATION-REPORT.md, decisões em ~/.claude/tools/router/decisions{.log,_v2.jsonl}, tracker endpoints /metrics /last /me). Incorporar RODADA2 (custo real via JSONL nativos ~/.claude/projects). UX-SPEC é lei. Timing: lançar no Marketplace ~D+7 do Show HN.

---

## Ordem e dependências

A → B → C+D (paralelo ok) → [LANÇAMENTO Paulo D5] → F → E.
A wave A é a única que bloqueia o lançamento (a demo dos packs entra no pitch). B é fortemente recomendada pré-launch. C/D melhoram mas não bloqueiam.

## Reporting

Por wave: SYNC.md CC→COWORK com feito/partido/decisões/ratchet count/próximo. O Paulo acompanha pelo Cowork; o Cowork valida no Mac quando pedido.

🐄 main está limpo, testado e com caminho directo. Boa caça.
