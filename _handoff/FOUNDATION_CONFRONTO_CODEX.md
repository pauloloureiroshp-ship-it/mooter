# ⇄ ADDENDUM · Confronto FOUNDATION_STUDY × auditoria Codex (AI_SETUP_SUMMARY) — plano unificado
**Data:** 2026-07-12 · Autor: Cowork · Complementa `_handoff/FOUNDATION_RESET_MASTERPROMPT.md` (não o substitui)
**Fonte Codex:** `frugal-w2/docs/ai/AI_SETUP_SUMMARY.md` (uncommitted, worktree `wave/w2-agent-bridge @ae17c91`)

## 1. Veredito do confronto (verificado contra git em 2026-07-12)

| Achado Codex | Veredito | Evidência |
|---|---|---|
| P0-2 "cockpit 0.16.65 fail-open no branch; portar 0.16.66 pro Git canónico" | **JÁ RESOLVIDO em origin/main** | `origin/main:packages/vscode-extension/package.json` = 0.16.66 · `lp-publish-host.test.js`/`lp-publish-view.test.js` presentes · PR #245 (F0.9 P0) merged 11-07. O Codex auditou branch **20 behind / 0 ahead** de origin/main |
| "Gemini 0.5/5 — no GEMINI.md" | Cego-por-stale, sintoma real | GEMINI.md criado 09-07 mas **nunca commitado** (`git log --all` vazio) — só existe uncommitted na árvore principal |
| P0-1 drift do contrato de privacidade (copy "nunca sai" vs preview local + Context Bridge + arbiter Haiku) | **VÁLIDO — achado mais importante** | `docs/data-policy.md` existe em origin/main p/ corrigir in place; viola honest-copy doctrine (AGENTS.md) |
| P1 classifier recomenda providers sem executor | VÁLIDO | fix = capability registry único + fail-closed |
| Council 1.7/5 — manter advisory | VÁLIDO | critério de vida/morte p/ PRs #195-198 na matriz F5 |
| `skipDangerousModePermissionPrompt=true` global | VÁLIDO, P1 — revisão do Paulo, nunca mudar autonomamente | settings globais |
| Defaults conservadores §15 | **APROVADOS pelo Paulo em 2026-07-12** (via Cowork, "vamos com a recomendação") | esta sessão |

**Meta-lição:** dois auditores (Cowork + Codex) chegaram a verdades diferentes no mesmo dia porque trabalho vive uncommitted fora de main. O relatório do Codex — sobre drift — está ele próprio uncommitted num worktree stale. Confirma a tese do FOUNDATION_STUDY §2.

## 2. Plano unificado — duas trilhas paralelas após F1/F2

| Ordem | Trilha OFICINA (masterprompt F1-F7) | Trilha CONTRATOS (Codex §10/§14) |
|---|---|---|
| 1 | **F1 snapshot forense** — agora inclui: GEMINI.md, `.ai/`, `.gemini/`, `.codex/` e `frugal-w2/docs/ai/AI_SETUP_SUMMARY.md` (lote G) | — (F1 protege os artefactos do Codex também) |
| 2 | F2 spine A aterra · F3 triagem (lote G: casa canónica de AI_SETUP_SUMMARY.md = `docs/ai/` via PR de origin/main) | **Wave PRIVACY (P0):** corrigir `docs/data-policy.md` + copy pública → contrato de fluxo de dados em 5 camadas (regex em memória · preview local · Context Bridge opt-in · arbitragem cloud opcional · sync agregado) + testes que amarram cada claim |
| 3 | F4 lixo/causa-raiz · F6 poda worktrees | Provider capability registry (classifier+executor+cockpit+docs consomem o MESMO ficheiro; fail-closed sem adaptador) · Paulo revê `skipDangerousModePermissionPrompt` |
| 4 | F5 matriz PRs/branches/stashes (council PRs julgados pelo critério Codex §11) | Registries `.mooter/` + `mooter-project-operator` skill (Codex §14) — **só depois da F4** (não construir doc novo sobre doc podre) |

## 3. Drift checks — o "nunca mais" mecânico (F7 ampliado)

1. **instalado-vs-git**: versão+sha do vsix instalado vs main (mata o P0-2 para sempre)
2. **classifier-vs-executor**: todo provider recomendado tem adaptador (fail-closed)
3. **copy-vs-runtime**: cada claim de privacidade tem teste executável
4. **recon semanal de higiene**: dirty/PRs/branches/worktrees/stashes (Cowork)
5. docs-hygiene `--strict` required no CI (spine V2)
6. Vermelho crónico proibido (`no-frugal ratchet`: fix ou remove)

## 4. Precedência de fontes — escrito uma vez

Verdade **técnica**: código/schemas/testes > ADR > docs versionados > estado operacional (git/runtime/Ledger) > Notion allowlisted > Obsidian allowlisted > chat/Slack (Codex §4 — adotado).
Intenção/preferências do **Paulo**: vault > profile > projeto > conversa (regra global do Paulo — eixo diferente, não colide).

## 5. Decisões registadas (2026-07-12, Paulo via Cowork)

- GO F1 (snapshot forense) ✅ · defaults conservadores §15 do Codex ✅ · wave PRIVACY logo após F2 ✅
- Registro externo: Notion HQ (página de sessão) ✅ · vault Obsidian (nota de decisão; pendente conexão da pasta)
- Este addendum arquiva-se junto com o masterprompt no PR final da F4.
