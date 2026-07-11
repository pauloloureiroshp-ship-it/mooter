# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Canal bidirecional Cowork ↔ Claude Code segundo o skill `/sync-project`.
> **Snapshot, não log** (regra ≤200 linhas, `AGENTS.md` § Information architecture).
> Histórico pré-W0 (2026-06-11 → 07-08) arquivado em `docs/foundation/SYNC_ARCHIVE_2026.md`.

**Atualizado:** 2026-07-10 · **main @** `c5cda85` (#237-MEO) · **extensão** `v0.16.66` ·
**suites extensão** `1086/1086` pass · `classify.js` sha `427d8c0b…4bc48f` **FROZEN/intacta**.
**Frente LP: FECHADA num único PR** `wave/lp-producao-perfeita` → main (supersede #234/#241/#242) — GATE humano (merge/deploy = Paulo).

---

## 🎯 Frente ativa — LIVE PREVIEW "produção perfeita" (W0→W6)

Plano fechado com o Paulo em `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.97.
Régua de aceitação = checklist §5 A-E de `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md`.
Spec viva do arco = `docs/strategy/LIVE_EDIT_ROADMAP.md`.

| Wave | Conteúdo | Estado |
|---|---|---|
| **W0** Verdade | git-truth vs docs · checklist A-E · veredicto findings · reconciliar docs | ✅ **feito** (`c8916fe`) |
| **W1** F3 — o coração | SelectionStore host-side · prompt óbvio · stage é rei · feed em direto | ✅ **feito** (`3cb9724`) |
| **W2** Ponte agente + contexto repo | `@anthropic-ai/claude-agent-sdk` + trust · "projeto TODO" · chip `repo ✓ · Notion n/d` | ✅ **feito** (`fb27d0d`,`ae17c91`; P1-A re-verificado) |
| **W3** Produção-ready | P1-2/3/4/5/6/7 + N1/N2 + E2E ciclo $0 + casing/probe Mac | ✅ **feito** (F1–F8; P1-2/P1-4 já em main) |
| **W4** Polish beat-Lovable | design-critique · light/dark · motion · estados vazio/loading/erro | ✅ **feito** (F9 — critique independente + honesty fixes) |
| **W5** Publish real 1× + CCA | funil edito→🛡→🚀 em produção (two-factor, gatilho Paulo) · evals CI | 🔜 **terreno pronto** (deploy real = gatilho do Paulo — nunca autónomo) |
| **W6** Camada C | Notion/vault no prompt · chip `repo ✓ · Notion ✓` | ⏳ (fora deste PR) |
| **+ Codex D-series** | auditoria independente D1–D10 | ✅ D6(P0)/D1/D5 fechados neste PR; D4=F0.1, D2=F5/F6, D10-HMR=F2, D10-RNG=F3; D7/D8/D9 notados |
| **+ F0.2** | histórico por-nó persistido (workspaceState, só display) | ✅ **feito** (`a0848c1`) |

### Estado dos findings (2026-07-10) — TODOS fechados neste PR

**Audit LIVE_PREVIEW_AUDIT_FINDINGS (P0/P1/N):** P0-1 tree-identity (FIX-MP-1, já em main) · P1-2 fence de edit
(já em main) · **P1-3** nonce/token→CSPRNG (`d14471f`) · **P1-4** DC scroll (já em main + teste `dcv2-tabstate`) ·
**P1-5** teste comportamental component-scope (`d9c9f18`) · **P1-6** copy limitações visível (`2867b1a`) ·
**P1-7** HMR morto → banner honesto + reconnect (`006be49`) · **N1** undo re-checa tree-gate + **N2** one-active-task (`3ea259f`).
**Codex D-series (auditoria independente):** **D6(P0)** Security→Publish fail-closed + TOCTOU fechado por revisão
adversarial (`613fa5c`,`a0848c1`) · **D1** responsividade (`c0e976b`) · **D5** eventos no MEO (`4df079b`) ·
D4=F0.1 · D2=F5/F6 · D10-HMR=F2 · D10-RNG=F3 · D10-$0/Publicado=F9 (`6bfb770`) · D7/D8/D9 (ícones/CTA) notados, não bloqueiam.
**Checklist §5:** A/B/C/E provados por testes (host+runtime+E2E git); **D** = F9 (critique independente) ✅;
spot-checks GUI (screenshots) ficam para o Paulo. Suite **1086/1086**; `classify.js` sha frozen; 0 deps novas; tap TS compila em CI.

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
