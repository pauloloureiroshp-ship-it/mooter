# MEGA MASTER PROMPT — Mooter Autopilot Fleet F1 (ultracode + dynamic workflow)

És o Claude Code em **ultracode**, com toda a potência: research→plan→execute→review→ship, plan mode primeiro, dynamic-workflow do Mooter (script-out-of-context), subagents paralelos (3-5, feature-specific), e self-reflection persistida. Vais construir o **F1 da Mooter Autopilot Fleet**: generalizar o loop único provado numa **frota de loops por pilar** governada por um orquestrador. Espelha o vibe-coding mais atual e inspira-te no Claude. Blueprint completo: `docs/strategy/MOOTER_AUTOPILOT_FLEET_BLUEPRINT.md`.

## EFEITO PRETENDIDO
Uma frota onde cada pilar do Mooter (site, vscode-plugin, council, lora-dora, quantizacao, matriz, skills, statusline, seguranca, design, integracoes-llm, bench-eval) corre o seu loop Generator(CC)⇄Evaluator(Cowork) no SEU worktree, governado por um orquestrador que escalona GPU+quota, com gate humano só no irreversível e auto-geração de waves ("modo maluco").

## INVARIANTES (CI-enforced — violar = abortar)
- `tools/router/classify.js` FROZEN — sha 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f; prova no início e no fim. Nunca importar/modificar.
- `packages/*` (waves 28-34.5) frozen → F1 só faz ADIÇÕES (ficheiros novos), nunca modifica engine existente.
- Selective git adds (nunca `git add -A`). NUNCA merge/push/tag para main (gate humano). Sem novos `.md` na root.
- PT-PT conversa, inglês no código. Branch de trabalho aditiva off wave-autopilot-loop (ex.: fleet-f1).

## REUSAR (NÃO reescrever — importar/orquestrar)
Dynamic workflow (`packages/workflow/src/`): `parallel(items,fn,{concurrency})`, `vote(candidates,voteFn)`, `converge(initial,refineFn,maxIterations=3)`, `agent(req)`, `runScript`, `writeWorkflow`/`WRITER_SYSTEM_PROMPT` (Opus escreve o script 1x), `WorkflowStore`/`startRun`/`resumeFrom`, `AgentPool`/`detectOptimalConcurrency` (DEFAULT 2, MAX 8, PER_WORKER_VRAM 5200MB). Spawn: `fanOut(tasks,options)` (FANOUT_THRESHOLD=3), `buildReport`. Worktree-conductor (lock conductor — NÃO cria worktrees): `acquireWithRecovery`, `tryAcquire/release`, `enqueue/head/markRunning/markDone`, `writeHeartbeat`/`reapStaleHeartbeats` (STALE_MS=30000). Loop existente: `_handoff/loop/loop-runner.mjs` (runner pm2 resiliente), bus `_handoff/loop/`, `_handoff/loop/QUEUE.jsonl` (formato wave), `_handoff/autopilot-loop/cockpit-loop.js` (tab cockpit, gate humano).

## O QUE CONSTRUIR (F1, aditivo)
1. `_handoff/fleet/fleet.json` — registo de pilares: id, dirs, prioridade, recursos (gpu_heavy?, cloud?), charter (norte estratégico de 1 linha). Os 12 pilares acima.
2. `_handoff/fleet/fleet-orchestrator.mjs` — evolução do loop-runner: lê fleet.json + STATE de cada pilar; escolhe o próximo pilar elegível (cc_running + slot) por prioridade + round-robin justo; corre uma ronda CC headless no worktree desse pilar; impõe TETOS: 1 job gpu_heavy de cada vez, máx N sessões cloud, budget diário, STOP global; escreve fleet ledger + heartbeat. Resiliente (try/catch por ronda, nunca morre).
3. Worktree por pilar: orquestra `git worktree add` por pilar, coordenado pelos locks do worktree-conductor (resolve colisão R3). Bus por pilar em `_handoff/fleet/<pilar>/` (STATE/INBOX/OUTBOX/CRITERIA/QUEUE/ledger).
4. Charters dos 12 pilares (curtos, accionáveis) em `_handoff/fleet/charters/<pilar>.md`.
5. Smoke DRY_RUN do orquestrador (sem gastar tokens) provando: escalona 2-3 pilares fake, respeita o teto de 1 gpu_heavy, ledger atualiza.

## MÉTODO (vibe-coding atual + dynamic workflow)
- Começa em **plan mode**: research subagent mapeia o que falta (contexto limpo), depois um plano (ficheiros, riscos, testes).
- Usa **dynamic workflow** para a parte pesada: Opus escreve o script de orquestração 1x; workers locais Ollama em paralelo; adversarial review; converge; synthesis. Custo local-first.
- 3-5 subagents paralelos feature-specific quando ajudar; não mais de 10.
- Self-reflection: se uma ronda falha, anexa "o que correu mal e porquê" ao contexto da próxima.

## GATES (honestos)
- Smoke do orquestrador verde (DRY_RUN). Testes verdes. classify.js sha intacta. Diff 100% aditivo (zero toques em engine frozen).
- Push da branch + PR = GATE HUMANO → reporta em BLOCKERS, não faças.
- No fim, ALIMENTA Notion (sub-página sob a log page 3876f6e4-2bc4-812b-b5d3-e6433a6cc8af) + vault (~/Documents/paulo-vault/).

Termina sempre com o bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE). DONE:yes só quando o orquestrador F1 passa o smoke, os 12 charters existem, e Notion+vault alimentados. Se precisares de mais que uma ronda, divide e continua na mesma sessão.

## FONTES (espelhar)
SPOQ specialist-orchestrated-queuing (2606.03115) · MOSAIC scheduling (2606.03014) · Claude Code best practices (research→plan→execute→review→ship, plan mode, 3-5 subagents, skills=knowledge/MCP=action, research-subagent p/ contexto limpo) · Mooter dynamic-workflow (docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md).
