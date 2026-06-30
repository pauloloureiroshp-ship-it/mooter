# 🐮👑 Mooter — MASTER ORCHESTRATION (o masterprompt dos masterprompts)

A **única fonte de verdade**. Todas as specs/masterprompts ramificam daqui. Estado: `main @ 0ccb824` (2026-06-30).

## ⚖️ Invariantes de OURO (valem para TODAS as sessões)
- **1 sessão CC por worktree isolado:** `git worktree add ../frugal-X -b feat/X main`. Nunca em main, nunca no worktree de outra.
- **`node --check`** no `extension.js` antes de empacotar/commitar **E** verificar o `extension.js` extraído do `.vsix` (size = source → sem truncamento).
- **`node --test` COMPLETO** — inclui `webview-syntax` (gate REAL, nunca dispensar).
- `classify.js` **FROZEN** (sha `427d8c0…`). `git add` **selectivo** (nunca `-A`). PT-PT conversa / inglês código.
- **Pára no gate, mostra o diff, NÃO faz `git push origin main`** (push = irreversível = gate humano).
- Se um pré-requisito faltar → **pára e avisa** (não construas no ar).

## 📊 Estado
- ✅ **EM PROD:** Overclock Moo Fase 2 · Context Guardian F0-F3 (`89bad40`) · **Handoff Truth** (`0ccb824`).
- 🟡 **PARKED (por aterrar):** Doctor `feat/cockpit-doctor-selfheal @21556dc` (389/389) · MC v2 `feat/mission-control-v2 @b07a49b` (387/387).
  > ⚠️ SHA real do Doctor = `21556dc` (verifica sempre com `git rev-parse --short feat/cockpit-doctor-selfheal`; o `2155edc` antigo era transcrição errada).
- 🟡 **PARKED ANTIGAS (triar, NÃO mergear):** `wave64-compaction-advisor` · `wave62_5-confidence-cascade` · `pilar/council` — diffstat vs main = **−84k a −100k linhas** cada → merge cego REGRIDE. Ver `_handoff/TRIAGE_PARKED_OLD_MASTERPROMPT.md`.

## 🅾️ ONDA 0 — BOOTSTRAP (obrigatória, corre PRIMEIRO e SOZINHA)
Os masterprompts/specs desta ronda estão **untracked** no working-tree partilhado `~/frugal` — **não em `main`**.
Um worktree novo de `main` não os veria. Aterra-os em main antes de tudo:

| Cola na sessão CC | O que faz |
|---|---|
| `Lê e segue _handoff/ONDA0_BOOTSTRAP_DOCS_MASTERPROMPT.md` | commita specs+masterprompts em `main` (docs-only, aditivo) → desbloqueia TODAS as ondas |

## 🟢 ONDA 1 — escopo desta ronda · abre EM PARALELO **só depois da Onda 0 em main** (worktrees dedicados)
| # | Cola na sessão CC | Worktree | O que faz |
|---|---|---|---|
| 1 · **Ledger** | `Lê e segue _handoff/guardian/F_LEDGER_SPINE_MASTERPROMPT.md` | `../frugal-ledger` | a **FUNDAÇÃO** (memória auditável + captura de decisões) — desbloqueia a Onda 2 |
| 2 · **Aterrar parked** | `Lê e segue _handoff/LAND_PARKED_MASTERPROMPT.md` | `../frugal-land` | Doctor + MC v2 + bump 0.16.45 → main = **tudo pushado** (Doctor antes de MC v2 — tocam nos mesmos ficheiros) |
| 3 · **Site** | `Lê e segue _handoff/SITE_HANDOFF_STORY_MASTERPROMPT.md` | `../frugal-site` | contar a história do handoff no mooter.ai |
| 4 · **Triagem antigas** | `Lê e segue _handoff/TRIAGE_PARKED_OLD_MASTERPROMPT.md` | `../frugal-triage` | decidir wave64 / wave62.5 / council: extrair valor real ou arquivar (nunca merge) |

## 🔴 ONDA 2 — SÓ depois do **Ledger** em main
| Cola | Worktree | Bloqueado por |
|---|---|---|
| `Lê e segue _handoff/PERFECT_HANDOFF_MASTERPROMPT.md` | `../frugal-perfect-handoff` | Ledger (+ Truth ✅) |

## 🧊 Fora desta ronda (escopo do Paulo = caminho crítico + triagem)
GPU visível · First-Magic Onboarding · Session Lineage · Sync bidireccional CC↔moos · Purposeful Overclock.
Masterprompts existem (`GPU_VISIBILITY`, `next-horizon/`, `guardian/WAVE2/WAVE3`) — retoma quando quiseres.

## 🔌 Integração (depois das ondas verdes)
Mergeia por ordem de dependência (Ledger primeiro), `node --check` + `node --test` após CADA merge,
`git push origin main` só com o teu OK. Limpa worktrees já landed (`git worktree remove`).

## 🐂 Conduz com a GPU no talo
Enquanto estas sessões correm, mantém o **🔥 Overclock** ligado — os moos locais $0 sustentam o trabalho
em paralelo ao CC. Quando o Ledger + Perfect Handoff landarem, o overclock passa a produzir **memória**, não só calor.
