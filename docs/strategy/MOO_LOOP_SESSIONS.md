# 🔁🖥️ Moo Loop Sessions — o Cowork dentro do plugin (design SSOT)

> Fonte única de verdade do design. Masterprompt de origem:
> `_handoff/MOO_LOOP_SESSIONS_MASTERPROMPT.md`. Herda `_MASTER_ORCHESTRATION.md` (invariantes),
> a **Evolution Fleet** (`MOOTER_EVOLUTION_FLEET_MASTERPROMPT.md`) e o **Perfect Handoff**
> (que já não mente). Estado: **F1 + F2 aterrados** (`feat/moo-loop-sessions`, off `main @ef25d88`).

## Tese
O Cowork é um bom orquestrador porque **decide o modo, gera o masterprompt, e mantém o handoff
honesto** — o CC nunca fica perdido sobre o que é. As Moo Loop Sessions trazem isso para dentro
do plugin: em vez de o utilizador colar um prompt cru, o cockpit **gera um masterprompt tipado** e
lança uma sessão CC que **já sabe** se é one-shot, um loop autónomo, ou um schedule — com as
stopping-conditions e o gate embutidos, declarados **à cabeça** (o cabeçalho que o CC lê primeiro).

## Os 3 modos (o plugin ganha 2 botões, ao lado de "New Claude Code Session")
| Modo | Botão no cockpit | O que é | Stop |
|---|---|---|---|
| **▶️ Once** | `New Claude Code Session` (já existia) | um masterprompt, corre, pára no gate | fim da tarefa |
| **🔁 Loop** | **`New Claude Code Moo Loop Session`** | auto-prompta, itera até à meta, dentro de guardrails | stopping-conditions |
| **⏰ Schedule** | **`New Claude Code Moo Schedule Session`** | dispara por cron/heartbeat/hook, corre 1 ciclo, dorme | cada disparo = 1 ciclo bounded |

Ao clicar, o cockpit pede a tarefa, **gera localmente ($0) o masterprompt tipado**, valida o
contrato, copia-o para o clipboard e abre a sessão CC. O CC lê o **cabeçalho de modo** primeiro —
a sessão **nunca fica sem saber o que é** (o oposto do handoff que mentia).

## Loop Engineering — o contrato do loop (SOTA 2026: "escreve o loop no quadro antes de abrir a plataforma")
Todo masterprompt de loop/schedule **declara à cabeça**, mecanicamente (o gerador valida que existem):

- **TRIGGER:** o que o arranca. Os **4 padrões canónicos**: `heartbeat` (VRAM ociosa) · `cron`
  (horário) · `hook` (evento: commit/PR/ficheiro) · `goal` (corre até à meta).
- **CHECK:** o que observa a cada ciclo (do Ledger/git/telemetria — **nunca inventa estado**).
- **ACTION:** a mão-de-obra **$0** de um ciclo (uma ação de cada vez: plan→act→observe→decide).
- **STOP (múltiplas, obrigatórias):** `max-iterações` · `budget` (GPU-min + $) ·
  **`no-progress detection`** (sem ganho medido em N ciclos → hiberna) · `goal-achievement`.
  **Um loop sem stop-conditions é REJEITADO mecanicamente** (`validateLoopContract` → `ok:false`).
- **ESCALATE:** quando pára e chama o humano (o irreversível, o incerto, o gate).

## Espelhar o Cowork (a experiência, dentro da sessão)
A sessão de loop comporta-se como o Cowork orquestra: mantém uma **task-list** viva · faz
**AskUserQuestion** no gate (não diálogos soltos) · emite o **Perfect Handoff** a cada pausa
(STATE/GATE/PENDING verdadeiros) · respeita os **modos Moo** (🐢 Lazy / 🐮 Moo / 🔥 Crazy) que
regulam a agressividade/uso de GPU · e **nunca faz o irreversível** — propõe e pára (H1: fricção
assimétrica). O CC deixa de ser um prompt-cru e passa a ser um agente com o modo na alma.

## Arquitectura (o que aterrou · additivo · zero engine tocado)
| Peça | Ficheiro | Papel |
|---|---|---|
| Contrato + gerador | `packages/vscode-extension/src/moo-loop.js` | `MODES`/`TRIGGERS`/`MOO_MODES`, `buildModeHeader`, `buildMasterprompt`, `validateLoopContract`, `parseStatusBlock`, `evaluateStop`, `defaultSpec` — **puro, zero-dep, sem vscode** |
| Motor de ciclos $0 | `packages/vscode-extension/src/moo-loop-runner.mjs` | corre um spec como ciclos bounded (CHECK→ACTION→STOP-eval), pára na 1ª stopping-condition, emite handoff honesto. `--dry` = determinístico offline; live = moo Ollama local |
| Botões + comandos | `packages/vscode-extension/src/extension.js` | 2 botões (`launchLoop`/`launchSchedule`) → `newTypedSession(mode)` gera+valida+copia+abre. Comandos `mooter.newLoopSession` / `mooter.newScheduleSession` |
| Testes | `packages/vscode-extension/src/moo-loop.test.js` | 18 testes do contrato (rejeita loop sem STOP; header declara o modo; 5 declarações; ordem de STOP) |

O **motor é $0 por desenho**: a ACTION corre num moo local (`~/.claude/tools/router/ollama_call.sh`)
quando presente, ou degrada para um ciclo determinístico offline. A cloud **nunca** é chamada no
runner; `main` é read-only; o CHECK lê o git real (grounded) e nunca inventa. `classify.js` é
lido/hasheado mas **nunca escrito** (FROZEN, sha CI-enforced).

## O handoff honesto do loop (Perfect-Handoff-shaped)
Ao parar, o runner emite um bloco derivado **só do que os ciclos observaram**:
`STATE` (stopped-bounded / goal-reached / awaiting-you) · `STOP` (a condição que disparou) ·
`DID`/`CHECK` (do último ciclo, grounded) · `GATE` (nunca afirma testes verdes se nenhum correu) ·
a secção **obrigatória "O QUE NÃO VERIFIQUEI / pode falhar se"** (honestidade radical como formato) ·
`NEXT`. Se um campo é incerto → `n/d`, nunca inferido.

## Integração (a cara de tudo o que já desenhámos — não um motor novo)
- Os **loops da Evolution Fleet** correm **como Moo Loop/Schedule Sessions** (um por pilar); a
  **Fleet Console** é onde se monitorizam e onde os gates humanos acontecem (H1 mecânico).
- O motor $0 aqui é o mesmo contrato que o `local-first-loops` runner encaixa (integração futura):
  a ACTION é o ponto de troca (dry ↔ moo local ↔ SDK), o contrato/STOP/handoff são partilhados.
- Herda **tudo**: guardrails H1-H8, `classify.js` frozen, `main` read-only, gate humano no
  irreversível, groundedness (o CHECK observa, não inventa).

## Arranque FASEADO
- **F1 — Once tipado + cabeçalho-de-modo** ✅ `buildModeHeader`/`buildMasterprompt`; o cockpit gera o masterprompt.
- **F2 — 🔁 Loop Session** ✅ as 5 declarações validadas + stopping-conditions reais + motor $0 que
  corre ciclos bounded e pára numa condição, com handoff honesto (demo `--dry` prova 3 ciclos → stop).
- **F3 — ⏰ Schedule Session** (cron/heartbeat/hook + wake-work-sleep) + **📌 pin** e monitor/resume na
  Fleet Console — **por fazer** (o modo `schedule` e o botão já existem; falta o agendador real + a UI de pin).
- Só então ligar os loops da Fleet a correr como Moo Loop Sessions.

## Demo (o gate)
```
node packages/vscode-extension/src/moo-loop-runner.mjs --demo --dry
→ valida o contrato · corre 3 ciclos $0 · pára em max-iterations(3) · emite handoff honesto
node packages/vscode-extension/src/moo-loop-runner.mjs --spec <invalido>.json
→ CONTRATO INVÁLIDO · a sessão de loop é REJEITADA (loop sem STOP não corre)
```

## Fontes (SOTA 2026 — confirmar antes de fixar)
Loop engineering (trigger/check/action/stop/escalate · heartbeats/crons/hooks/goals ·
stopping-conditions múltiplas) · manager / orchestrator-worker / handoff patterns ·
AGX (local-first, wake-work-sleep, human-in-the-loop) · Claude Command Center (spawn/monitor/resume).
