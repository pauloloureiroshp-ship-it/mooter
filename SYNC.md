# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Canal bidirecional Cowork ↔ Claude Code segundo o skill `/sync-project`.
> **Snapshot, não log** (regra ≤200 linhas, `AGENTS.md` § Information architecture).
> Histórico pré-W0 (2026-06-11 → 07-08) arquivado em `docs/foundation/SYNC_ARCHIVE_2026.md`.

**Atualizado:** 2026-07-10 · **main @** `f5a1f04` (PR #231) · **extensão** `v0.16.62` ·
**suites extensão** `939/939` pass · `classify.js` sha `427d8c0b…4bc48f` **FROZEN/intacta**.

---

## 🎯 Frente ativa — LIVE PREVIEW "produção perfeita" (W0→W6)

Plano fechado com o Paulo em `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.97.
Régua de aceitação = checklist §5 A-E de `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md`.
Spec viva do arco = `docs/strategy/LIVE_EDIT_ROADMAP.md`.

| Wave | Conteúdo | Estado |
|---|---|---|
| **W0** Verdade | git-truth vs docs · checklist A-E com evidência · veredicto findings · reconciliar docs | ✅ **feito** (relatório 07-10; este PR reconcilia os docs) |
| **W1** F3 — o coração | seleção = estado partilhado (SelectionStore host-side) · prompt-por-LLM óbvio · stage é rei · feed em direto | 🔜 **próxima** (GO dado; arranca após merge deste PR) |
| **W2** Ponte agente + contexto repo | `@anthropic-ai/claude-agent-sdk` + trust · "projeto TODO" ON · chip honesto `repo ✓ · Notion n/d` | ⏳ depende de W1 |
| **W3** Produção-ready | herda P1-3/4/5/6/7 + N1/N2 + prova E2E ciclo $0 + probe Mac + casing/launcher | ⏳ |
| **W4** Polish beat-Lovable | design-critique §2 · light/dark · motion · estados vazio/loading/erro | ⏳ |
| **W5** Publish real 1× + CCA | funil edito→🛡→🚀 em produção (two-factor, gatilho Paulo) · evals CI | ⏳ |
| **W6** Camada C | Notion/vault no prompt (D1-D3) · chip `repo ✓ · Notion ✓` | ⏳ |

### Verdade do W0 (2026-07-10) — main está À FRENTE dos docs

**JÁ em main (verde):** LP-4→4.9 · LP-5 🛡 Security · LP-6 🚀 Publish · Context Engine
(repo-map+slice+data-hop) · cross-device tree-gate · F1+F2 layout (PR #231) · harness runtime L1.
**Findings do audit — fechados:** P0-1 tree-identity (FIX-MP-1: `b0ac59b`+`f428a86`+`938010f`) ·
P1-2 fence de edit simétrico (FIX-MP-2: `fbb3622`).
**Findings — ABERTOS (a W3 herda):** P1-3 nonce/`Math.random` (`extension.js:1270/2554/4368`) ·
P1-4 Director's Cut scroll (`:2987-2993`) · P1-5 teste component-scope (só string-presence) ·
P1-6 copy limitações (parcial) · P1-7 HMR morto (`lp-error-tap.ts:415` engole erro) ·
N1 undo não re-checa tree-gate (baixo risco) · N2 "one active task" não imposto.
**Checklist §5:** A lógica ✅ (runtime+host), visual pendente de spot-check humano · B 🛡 ✅ ·
C 🚀 ✅ (nits: override sem UI, onboarding copy) · D UX → W4 · E 939/939 ✅, N1/N2 abertos.

**F3 (W1) não iniciado** — SelectionStore host-side único não existe em main. É o bug provado
2026-07-08 (o chat "não vejo texto selecionado" com nó pinado). Prioridade zero da W1.

---

## 🔒 Guardrails permanentes desta frente

`classify.js` FROZEN · motor intocável (cerca `spliceNodeRange`, tree-gate FIX-MP-1, agente
LP-4.5, quality LP-4.7, Context Engine — só apresentação+wiring) · webview `live-preview-view.js`
concat-only (sem backticks/`${}`, sem require/Node/VSCode APIs no módulo, CSP nonce, `esc()`,
fail-soft, honesty-first) · zero deps novas sem allowlist `.vscodeignore` + `live-edit-packaging.test.js` ·
adds SELETIVOS (nunca `add -A`) · branch própria off `origin/main` por wave · push só da branch ·
**MERGE E DEPLOY SÃO DO PAULO** · deploy real de produção NUNCA autónomo (two-factor host-side) ·
PT-BR chat / EN código.

---

## 📋 Últimas sessões

- **2026-07-10 · W0 Verdade (CC)** — apurada a verdade de main vs docs; suite 939/939; veredicto
  dos findings (P0-1/P1-2 fechados, P1-3/4/5/7+N1/N2 abertos, P1-6 parcial); este PR reconcilia
  ROADMAP+SYNC e arquiva handoffs superseded. Worktree `../frugal-w0`, branch `wave/w0-verdade`.
- **2026-07-09 · PR #231 (cockpit layout)** — F1+F2 layout integrados em main (`f5f0cb7`).
- **2026-07 · Context Engine + cross-device + LP-5/6 + FIX-MP-1/2** — todos em main (ver git log).

## ⏭️ Próxima missão

Após merge deste PR: **W1 — F3 (o coração)**. SelectionStore host-side único = fonte de verdade
da seleção (reusa o select-lock do MP5.2a); todos os caminhos de prompt injetam o envelope; chip
de âncora honesto ("📍 page.tsx:57 · `<p>`" / "sem seleção" → o agente pergunta, não adivinha);
prova no runtime harness. GATE W1: prova viva pin→prompt→edição no nó certo + screenshots + PÁRA.

## 🔗 Pointers

Spec viva: `docs/strategy/LIVE_EDIT_ROADMAP.md` · North star: `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` ·
Runbook/checklist: `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` · Findings+FIX-MPs:
`_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md` · Estratégia: `docs/strategy/STRATEGY.md` · Infra: `INFRA.md`.
