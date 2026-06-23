# STANDING POLICY — Autopilot Loop (Human-ON-the-loop)

> **Isto é a GOVERNANÇA viva. O Paulo edita ESTE ficheiro — não aprova passos.**
> O `loop-runner.mjs` injecta esta política em cada ronda; o avaliador (Cowork)
> decide o reversível por ela e só põe o destrutivo no digest. Última revisão:
> 2026-06-22.

## Princípio

Passámos de *human-IN-the-loop* (aprova cada acção) para *human-ON-the-loop*
(o agente avança autónomo; o humano supervisiona a **governança** e intervém só
no necessário). Guardrails "two-factor" **só** no destrutivo/irreversível.

> **A regra que mata os 100 questionamentos:** o loop NUNCA pára à espera de
> aprovação para o **reversível**. Só o **destrutivo** espera — e mesmo esse vai
> para `DECISIONS.md` (+ notificação) **enquanto o loop segue a melhorar o resto**.

## Banda AUTO — avança na recomendação, SEM perguntar

Decisões por ronda e por wave; estratégicas mas **REVERSÍVEIS**. O avaliador
decide pela rubrica + esta política e segue:

- escolher o objectivo da wave / escolher a próxima wave da `QUEUE.jsonl`
- **reverter o que não melhora** (CHANGE ≠ IMPROVEMENT — ver `_handoff/fleet/WORLD_CLASS_LOOP.md` #6)
- refactors, ficheiros novos, correr evals (local, $0)
- **commits LOCAIS**, criar branches de trabalho
- dynamic-workflow (parallel/vote/converge), agentes moo locais (Ollama)
- registar findings (incl. negativos) no ledger, Notion e vault

## Banda DIGEST — NÃO bloqueia; vai para `DECISIONS.md` (+ notificação)

O loop continua noutras waves entretanto. Cada item espera em `DECISIONS.md`:

- **push para remoto** / abrir ou mergear **PR** / **deploy**
- **secrets** / credenciais
- **apagar dados ou pacotes** / operações irreversíveis
- **gastar dinheiro**
- **descongelar `classify.js`** → auto-**NO** (sha CI-enforced `427d8c0b…364bc48f`)
- **pivot de produto** / mudar lambdas / mudar holdout selado

## Two-factor — só no merge para `main`

A **única** acção que exige dois factores: **merge para `main`**.
Factor 1 = a minha recomendação (Cowork/avaliador). Factor 2 = o **OK final do Paulo**.
Tudo o resto é AUTO (reversível) ou DIGEST (destrutivo, não-bloqueante).

## Paragem forçada (sempre disponível)

- `_handoff/loop/STOP` (kill switch) ou o botão Stop no cockpit 🛸.
- `maxRounds=12` por wave · timeout 30 min/ronda · sha de `classify.js` provada a cada fecho.

## A organização (sempre a falar)

- **Cowork (eu) = GOVERNADOR/avaliador.** Cada ~10 min leio o bus, decido o
  reversível pela rubrica + esta política, alimento Notion + vault, e ponho só o
  destrutivo no digest (`DECISIONS.md`).
- **CC (loop-runner) = GERADOR.** Corre non-stop (serviço), nunca pergunta o
  reversível; *flag* (não bloqueia) o destrutivo via `BLOCKERS`.
- **Fleet F1 (WF) = pilares** com worktree por pilar (zero colisão), dynamic-workflow,
  agentes moo locais, contexto fresco (vault/SYNC/memory). Falam via o orquestrador
  + meta-avaliador cross-pillar.

## Como o Paulo supervisiona (sem aprovar passos)

Vê o board ao vivo (`fleet-watch.ps1`) + o Notion log + os PRs que aparecem.
**Ajusta esta `STANDING_POLICY` — não passos.**

## Handshake do gate (implementado no runner)

1. O gerador, ao tocar no irreversível, escreve `ASK_HUMAN.md` + `BLOCKERS` e põe
   `STATE.status = awaiting_human` (só para o irreversível; o reversível NUNCA cá chega).
2. A decisão entra em `HUMAN_OK` (o avaliador, pela política; ou o Paulo).
3. No tick seguinte o runner **consome `HUMAN_OK`**: injecta-o no `INBOX.md`,
   apaga `HUMAN_OK` + `ASK_HUMAN.md`, regista no `DECISIONS.md` + ledger, e
   retoma a wave (`round++`, `status = cc_running`). Sem keystrokes.

> Fontes: human-on-the-loop (waxell.ai, n8n.io, bytebridge); self-improving SWE
> agents 2026 (c3.ai, cogentinfo); AI Safety Report 2026 (arXiv 2602.21012) —
> guardrails ao nível de governança, two-factor no irreversível.
