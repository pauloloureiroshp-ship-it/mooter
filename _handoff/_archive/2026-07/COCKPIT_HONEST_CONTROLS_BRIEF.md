# ⇄ Handoff Cowork → Cowork · Controlos Honestos do Cockpit (os botões têm de dizer a verdade)

> Briefing para uma sessão Cowork fresca. O tema: **cada botão e badge do cockpit tem de refletir a realidade e
> ter utilidade real.** É a doutrina honest-copy do Mooter estendida dos NÚMEROS para os CONTROLOS.

## O problema — PROVADO hoje (2026-07-04)
O cockpit mostra `⚠️ unsaved work` + `Save my work` ("The AI changed your files — nothing saved yet") em **8+ sessões**.
Confronto nativo (`git -C ~/frugal status --short`): **ZERO ficheiros de código por salvar** — só `SYNC.md`, `package.json`
(bump), e docs `_handoff/*.md`. **Todos os badges "unsaved" são falsos positivos.** Gera ansiedade e ruído — o oposto
do que o Mooter promete (confiança pela verdade).

## A causa-raiz
O cockpit deriva o estado "unsaved" do **journal congelado de cada sessão** (o estado do momento em que a sessão correu),
NÃO do `git` atual. Por isso uma sessão cujo trabalho já foi commitado e mergeado há horas continua a gritar "unsaved".
É o mesmo padrão *journal-stale / worktree-crossing* que nos perseguiu o dia todo (o handoff nativo diz `0 UNCOMMITTED`).

## A doutrina (a régua)
> **Um botão que mente é pior que um número que mente.** A honest-copy do Mooter aplica-se aos controlos: um badge de
> estado ou um CTA só existe se for verdadeiro E útil. Quando o `git` real e o journal divergem, **o git ganha** — o
> journal é uma pista, não a verdade.

## Objetivo da wave
1. **Estado unsaved/saved por sessão ← `git status` REAL** da worktree dessa sessão (não o journal). Se a worktree tem
   uncommitted de código → `unsaved`; senão → `saved ✓` (ou o badge esconde-se).
2. **`Save my work` só acende com uncommitted REAL.** Sem isso, mostra `✓ salvo` ou desaparece — nunca um CTA que não faz nada de útil.
3. **Auditar TODOS os botões/badges do cockpit** (extensão da Fase 5 do deck, que já matou 1 controlo morto): cada um
   (a) reflete a realidade e (b) dispara um `command` real e útil. Um botão sem handler ou que mente = bug.
4. **Estados derivados honestos** (`emergência`/`vigia`/`a podar`/`unsaved`) — todos confrontados com o git/estado real, nunca só o journal.

## Ficheiros-âncora (confirmar na sessão)
`packages/vscode-extension/src/host-extra.js` (recentSessions / cálculo de estado por sessão) · `extension.js` (os botões/CTAs
+ o cálculo do inbox) · `row-renderer.js` (o render das linhas de sessão). O `git` real: confrontar a worktree de cada sessão
(cada sessão tem a sua branch/worktree — cruzar com `git status` dessa worktree, não o journal).

## Gate (honesto)
Com `git status` nativo = 0 código uncommitted, o cockpit mostra **0 badges "unsaved"** (paridade git↔badge provada por teste).
`Save my work` só aparece quando há uncommitted real. Auditoria: 0 botões mortos, 0 botões que mentem. Preview dos estados
(salvo vs unsaved real) para validação humana. `classify.js` frozen · CSP-safe · honest-copy.

## Notas
- Cuidado com o custo do `git status` por sessão (pode ser N worktrees) → cache + debounce, ler o FS real (não o mount do sandbox, que falseia — ver `mount_git_state_unreliable`).
- Encaixa como wave de **Cockpit & UX** (a seguir ao Deck Polish / antes de escalar features). Prioridade: alta — é o cartão de visita e a confiança do vibe coder.
- Contexto completo do dia: `_handoff/CTO_COMMAND_DECK_SPEC.md` + `_handoff/DECK_POLISH_MASTERPROMPT.md`.
