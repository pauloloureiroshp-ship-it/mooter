# 🐮🛡️📒 Moo Context Guardian + Ledger — Orquestração V3

Specs: `docs/strategy/MOO_CONTEXT_GUARDIAN_BRIEF.md` · `docs/strategy/MOO_LEDGER_AND_ORCHESTRATION.md`.

## Estado actual (2026-06-28)
- `main` @ `1f53de6`.
- ✅ **Guardian F0–F3 INTEGRADOS** em `integ/guardian` (380/380, `classify.js` sha intacta, vsix
  byte-idêntico → sem truncamento). **A aguardar push humano** para main.
  (Fix de 1 linha incluído: `8949fdd` whitelist do `guardian-chip` no harness — a F1 só corria
  `node --check` e dispensava o `webview-syntax`, que é um **gate real**.)
- ⏳ Por construir: **Ledger Spine (L0+L1)**, depois o trio **F2/F3-on-Ledger · Lineage · L5-Sync**.

## Regra de ouro + invariantes (CI)
Uma sessão CC por **worktree isolado**. `node --check` no `extension.js` antes de empacotar/commitar
E verificar o `extension.js` **extraído do .vsix** (byte-size = source → sem truncamento). **Correr o
`node --test` COMPLETO** — o `webview-syntax.test.js` é um **gate real**, nunca dispensar; módulo novo
embebido no webview tem de entrar na whitelist do harness. `classify.js` FROZEN. `git add` selectivo.
Cada sessão pára no gate, mostra o diff, **NÃO faz `git push origin main`** (gate humano).

## Sequência

### ▶ AGORA: landar o Guardian (gate humano)
```
cd "C:\Users\Paulo Loureiro\frugal"
git fetch . integ/guardian:main && git push origin main
git worktree remove ../frugal-integ ../frugal-guardian-f0 ../frugal-guardian-f1 ../frugal-guardian-f2 ../frugal-guardian-f3 ; git worktree prune
```

### 🌊 PRÓXIMO: Ledger Spine (1 sessão — é a FUNDAÇÃO, não paraleliza)
`Lê e segue _handoff/guardian/F_LEDGER_SPINE_MASTERPROMPT.md` → worktree `../frugal-ledger`.
(L0 proveniência + L1 reducer + captura de decisão mecânica.) Land com o teu OK.

### 🌊 DEPOIS do Ledger em main: TRIO em paralelo (3 sessões)
| Sessão | Masterprompt | Worktree |
|---|---|---|
| γ | `WAVE2_F2F3_LEDGER_REFACTOR_MASTERPROMPT.md` | `../frugal-f2f3-ledger` |
| δ | `WAVE2_SESSION_LINEAGE_MASTERPROMPT.md` | `../frugal-lineage` |
| L5 | `WAVE3_L5_BIDIRECTIONAL_SYNC_MASTERPROMPT.md` | `../frugal-l5-sync` |

γ/δ/L5 precisam do Ledger (+ Guardian) em main. Entre si não conflituam (γ=prebake/jump+ledger;
δ=intent-stamp+MC-grouping; L5=brief-event+sync-button). Integração ordenada: γ → δ → L5.

## Contratos (interface — não mudar sem avisar)
- **Advisor** (em main pós-push): `pressureLadder(ctxPct)` · `stage1Boundary(prev,cur,now)`.
- **Ledger:** `appendEvent({sid,agent,model,tier,kind,input,output,idem_key})` · `ledger-reduce` → projecções.
- **Lifecycle:** `intent → turn → decision → outcome`.
- **Brief (L5):** `kind:brief { goal, focus, last_decisions, guardrails_by_role }` (CC→moos, anti-stale por hash).
- **cc_title/seed:** `primaryEditor.open(session, prompt)` + `?prompt=` (confirmado na F3).

## Verdade da plataforma (não re-litigar)
`/compact` por fora impossível (CC #58538) · `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` só baixa · nunca editar `.jsonl` de sessão.
