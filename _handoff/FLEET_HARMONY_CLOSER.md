# ⇄ COWORK → CC · FLEET HARMONY CLOSER — a fleet JÁ corre 24/7; fecha as 4 pontas (2026-07-10)

> **Estado confrontado pelo Cowork 2026-07-10 11:22Z (NÃO redescobrir):** fleet contínua VIVA
> (heartbeat 15s de idade, pid 37308) · último ciclo `ran:15 · gated:15 · incidents:0 · $0` ·
> ciclo renasce sozinho (shutdown 11:21:57 → startup 11:22:12, 13 pilares) · vram_free 17.4GB
> (opção C day-model qwen2.5-coder:14b OK) · pm2 `mooter-fleet` + watchdog schtasks + testes de
> morte verdes (DECISIONS 2026-07-08) · **PENDENTE:** ① pm2-logrotate + boot persistence (ADMIN) ·
> ② janela nocturna 30B (FLEET_NIGHT_MODEL só especificado) · ③ aterragem em main · ④ visibilidade
> do DIGEST no fluxo do projecto.
> WHERE: worktree `../frugal-fleet-arm` (branch `feat/fleet-arm`). Sonnet. Token-diet: zero
> subagents · não reler specs · R2 · sair no gate. sha classify `427d8c0b…` provada início+fim.

## ▶ F0 · Prova de vida (2 min, números colados)
`pm2 ls` (mooter-fleet online? uptime? restarts?) · idade do heartbeat · `schtasks /Query /TN MooterFleetWatchdog` · tail -3 fleet-forever.log. Qualquer coisa morta → diagnostica antes de avançar (o watchdog devia ter reagido — se falhou, é o bug prioritário).

## ▶ F1 · Fechar as pendências ADMIN (a fleet hoje NÃO sobrevive a um reboot)
1. Tenta sem elevação: `pm2 install pm2-logrotate` + `pm2 set pm2-logrotate:max_size 50M` + `retain 30` + `compress true`; boot persistence: tenta `npx pm2-windows-startup install` (user-level, muitas vezes não pede admin).
2. Funcionou → `pm2 save` + regista em cronista/DECISIONS.md. Não funcionou (precisa admin) → escreve `_handoff/fleet/ADMIN_FINALIZE.ps1` (ASCII, com log, idempotente) com os comandos exactos + linha no DECISIONS: "PENDENTE PAULO: correr ADMIN_FINALIZE.ps1 como administrador (1 min)". **Não contornes o UAC.**

## ▶ F2 · Janela nocturna 30B (o cérebro profundo trabalha enquanto o Paulo dorme)
No `fleet-forever.mjs` (aditivo): janela horária local **00h-07h America/Sao_Paulo** → default model = `FLEET_NIGHT_MODEL` (qwen3:30b); fora dela → day model. Pre-flight VRAM continua a mandar (se o 30B não couber porque algo ficou residente → backoff normal, nunca CPU-fallback). Transição limpa: a troca só se aplica no ciclo seguinte. Env overrides: `FLEET_NIGHT_START/END`. → COMMIT + teste unitário (relógio injectável — nada de esperar pela meia-noite).

## ▶ F3 · Harmonia de visibilidade (o projecto vê a fleet sem abrir a worktree)
O DIGEST do cronista ganha um **espelho diário** de 5 linhas appendado a `SYNC.md` da branch (secção `## Fleet (auto)`): data · ciclos/dia · rondas ok/falhas · deltas positivos · $0 + tokens evitados · pendências two-factor abertas. Implementação no cronista (aditivo, idempotente por data). É a ponte fleet→projecto até o §MP-B/W15 levarem isto ao cockpit. → COMMIT + teste.

## ▶ F4 · Preparar a aterragem (two-factor: o merge é do Paulo)
1. `git fetch` + rebase da branch sobre main ATUAL se limpo (conflito → PÁRA e reporta, não resolvas à força).
2. Abre **draft PRs** (a colagem deste handoff pelo Paulo = OK para drafts; merge NÃO): `gh pr create --draft` para `feat/fleet-arm` e `feat/quota-aware`, corpo com: o que muda · números do gate (GPU 19→100%, ciclos $0, testes de morte) · invariantes provados (sha, aditivo, zero engine) · o que fica pendente pós-merge (mover schtasks/pm2 paths de worktree→main, 1 linha de instrução).
3. ⚠️ NOTA no PR do fleet-arm: após merge, o pm2/watchdog apontam para a WORKTREE — incluir secção "pós-merge: re-apontar ecosystem.config para ~/frugal e `pm2 restart`" (não executes; é do Paulo no dia do merge).

## ✅ GATE (provas, formato curto)
pm2 online + logrotate activo OU ADMIN_FINALIZE.ps1 entregue · boot persistence idem · janela nocturna: teste unitário verde + config visível no ecosystem/env · SYNC.md com o 1º espelho do DIGEST · 2 draft PRs abertos (links) · fleet continuou VIVA durante tudo isto (heartbeat nunca >20min — o watchdog é testemunha) · sha intacta · relatório final ≤15 linhas. **PÁRA.**

## 🔁 §RESUME
Sessão fresca: "Continua _handoff/FLEET_HARMONY_CLOSER.md na worktree ../frugal-fleet-arm; git log + DECISIONS dizem onde parei; nunca refazer committado."
