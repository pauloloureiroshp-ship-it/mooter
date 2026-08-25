# ⇄ COWORK → CC · FLEET TOTAL — os 13 pilares a rodar na 4090, $0, sem parar (2026-07-08)

> **Mandato do Paulo (2026-07-08, explícito):** todos os pilares em loop contínuo, GPU no talo com máxima eficiência, mínimo gasto de tokens cloud. O OK humano para escalar aos 13 FOI DADO — este MP vai até ao modo contínuo ligado.
> **Confronto git feito pelo Cowork 2026-07-08 (NÃO redescobrir, NÃO refazer):**
> - ✅ `feat/quota-aware @b590d8a` — MP-Q COMPLETO (Q0→Q4+fix, 6 commits). Não tocar; espera push/merge do Paulo.
> - 🟡 `feat/fleet-arm @0bb618b` (worktree `../frugal-fleet-arm` JÁ EXISTE) — DO 1 feito (governança council+seguranca+cronista: STANDING_POLICY.json/CRITERIA/DECISIONS/scaffold committed). **Retomas daqui. NUNCA refazes o DO 1.**
> - ✅ Specs na branch: `_handoff/FLEET_FASE3_LAUNCH_HANDOFF.md` (spec-mãe: §CHARTERS/§GPU-POLICY/§USAGE-RELIEF) + `_handoff/SUPER_MP_QUOTA_FLEET.md`. Lê da TUA worktree.
> - ❌ 0 rondas reais (fleet-ledger ainda é DRY_RUN de 2026-06-23) · orchestrator+Overclock pool em main (herdado na branch).
> - ⚠️ **AMBIENTE DE GUERRA:** ~21 sessões partilham o tree `~/frugal` (77 dirty, 17 divergentes). **O tree principal é INTOCÁVEL para ti** — vives 100% em `../frugal-fleet-arm`. Não respondes a sessões Live Preview, não fazes triage do BOARD — outro track.

## 🧼 TOKEN-DIET desta sessão (o Paulo não pode gastar tokens à toa — cumprir À LETRA)
**Sonnet** · context7 já disabled (não reactivar) · **ZERO subagents** · **NÃO reler specs inteiras** — este MP cita as secções exactas; abre só o que ele aponta · sem exploração ampla (o confronto está feito e colado acima) · R2: commit assim que compila · relatório final CURTO no formato fixo · sai no fim. As rondas correm no launcher Node ($0, Ollama) — a TUA sessão só arma e verifica.

## 🚦 REGRAS DURAS (violar = abortar)
1. `tools/router/classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` provada no início e no fim.
2. **NUNCA** merge/push/tag (two-factor = Paulo) · selective `git add` · packages frozen intocados (ficheiros NOVOS + `fleet.json` são as únicas excepções).
3. `FLEET_ALLOW_CLOUD` **NUNCA setado** — $0 absoluto; qualquer tentação cloud → linha em DECISIONS.md.
4. Honest-copy: delta MEDIDO ou `n/d`; nunca fabricar. `change ≠ improvement` → reverte.
5. Worktree única: `cd ../frugal-fleet-arm` → `git rev-parse --show-toplevel` TEM de acabar em `frugal-fleet-arm`. O tree `~/frugal` só para leitura se indispensável.
6. PT-PT conversa · EN código.

## ▶ F0 · Retoma (5 min)
`cd ../frugal-fleet-arm` → confirma toplevel + `git log --oneline -2` (esperado: `0bb618b` no topo) → `ollama ps` (morto? PÁRA e diz ao Paulo) → baseline `nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv` (guarda) → sha classify. **GATE F0:** tudo confirmado.

## ▶ F1 · Completar a armadura (= DO 2→5 da spec-mãe, secção "▶ DO"; 1 commit por passo)
1. **`_handoff/fleet/local-pillar.mjs`** (NOVO): ronda local $0 via Ollama (padrões de `packages/overclock-moo/src/runner.mjs`: OLLAMA_HOST 127.0.0.1:11434, pref qwen3, eval counts reais). mede→propõe→testa; proposal com "pode falhar se" + claims grounded (proof-gate). Saturação INTRA-ronda com `runBoundedPool` (`packages/overclock-moo/src/pool.mjs`) — respeita thermal clamp. **RESILIÊNCIA (advogado do diabo 2026-07-08, não-negociável):** TODA chamada Ollama com `AbortSignal.timeout` (generate ≤120s, tags ≤3s) + `ROUND_TIMEOUT_MS` global por ronda (env, default 10min) — uma geração pendurada NUNCA congela a fleet; timeout = incident no ledger + ronda falha limpa (o orchestrator já trata pillar-threw como incident, não morte). **Política 1-modelo-por-ciclo** (default qwen3:30b p/ todos; pilar que precise de outro modelo agrupa no fim do ciclo — evita VRAM thrash; `OLLAMA_KEEP_ALIVE` já está 5m no env). **OBRIGATÓRIO por ronda:** (a) actualiza `STATE.json` do pilar (round++ · last_run_ts · sessionId `fleet-r<N>-<pilar>` · measuredWins/Total) — atómico tmp+rename; (b) append `<pilar>/ledger.jsonl` com delta MEDIDO + `est_cloud_tokens_avoided` (estimativa honesta ou `n/d`) + `quota_source:"local-$0"`. **Bounded context assembly:** prompt = charter+critério+STATE+últimas 10 linhas do ledger+OUTBOX anterior, cap de chars como constante, NUNCA histórico completo. → COMMIT + teste (incl. cap).
2. **Cronista runtime** (modo no local-pillar OU `cronista-pillar.mjs`): por ronda lê ledgers/OUTBOX/STATE/DECISIONS de todos → verifica invariantes (sha · caps vs heartbeat · schema ledger · juiz U2: 1 claim re-verificado por moo local · pilar parado >2 rondas → incident) → escreve `cronista/DIGEST.md` (visão executiva) + `<pilar>/HANDOFF_NEXT.md` (retoma pronta ANTES de precisar). Nunca corrige trabalho alheio — só reporta. → COMMIT + teste.
3. **`_handoff/fleet/fleet-local-launch.mjs`** (NOVO): importa `runFleet` do orchestrator + injecta `runPillar: localPillar` (`dryRun:false`, `maxRounds: env FLEET_MAX_ROUNDS`). Honra o **STOP file**: `_handoff/fleet/STOP` existe → shutdown limpo no fim da ronda. → COMMIT.
4. **`fleet.json`**: council+seguranca → `gpu_heavy:true·cloud_heavy:false` + entrada `cronista` (`priority:0.6·gpu_heavy:false·cloud_heavy:false·daysQuota:6`). → COMMIT.
5. **Higiene:** renomear `fleet-ledger.jsonl`→`fleet-ledger.dry-2026-06-23.jsonl` + ledgers dry de council/seguranca. → COMMIT.
**GATE F1:** testes verdes · `git status` limpo · sha intacta.

## ▶ F2 · PROVA com 3 pilares (rondas REAIS, a primeira vez)
`FLEET_MAX_ROUNDS=3 node _handoff/fleet/fleet-local-launch.mjs` com `nvidia-smi ... -l 5` em paralelo (guarda números). **GATE F2 (parar e verificar TUDO):** ≥2 rondas/pilar no ledger novo (engine `ollama-local`, cost 0) · GPU util baseline→pico SOBE · STATE frescos · DIGEST cobre as rondas · HANDOFF_NEXT existe · heartbeat `dry_run:false` · proof-gate exercido · destrutivo só em DECISIONS. **Falhou algo → corrige e re-prova. NÃO avances para F3 com F2 vermelho.**

## ▶ F3 · Armar os 13 (o mandato)
Para os 10 restantes — `bench-eval · matriz · quantizacao · integracoes-llm · lora-dora · vscode-plugin · design · statusline · site · skills` — cria `STANDING_POLICY.json` (mesmo modelo AUTO/DIGEST/two-factor do DO 1) + charter + critério de sucesso **copiados da tabela §CHARTERS** da spec-mãe (cada pilar = a sua wave; inclui os eixos usage-relief: matriz=subagent→moo · integracoes-llm=MCP distiller · vscode-plugin=Guardian ctx-diet; vscode-plugin/design: só micro-polish ADITIVO — redesign é W15 CC-once, o loop NÃO o faz). `fleet.json` já tem os 12 — confirma flags gpu_heavy coerentes com o charter. → 2-3 COMMITS por grupos.
**GATE F3:** 13 pilares com STANDING_POLICY+charter+critério · fleet.json coerente · committed.

## ▶ F4 · RODAR TODOS + ligar o contínuo eficiente
1. Primeiro passe supervisionado: `FLEET_MAX_ROUNDS=2 node _handoff/fleet/fleet-local-launch.mjs` com os 13 (o scheduler admite por prioridade×staleness; caps fazem o resto: `gpuHeavyConcurrent:1` entre pilares · saturação intra-ronda · `poolWidth:4` · `daysQuota` = orçamento diário). Verifica ledger+DIGEST.
2. **Modo contínuo — 3 camadas "nunca quebra" (advogado do diabo 2026-07-08; schtasks caseiro NÃO chega):**
   **Camada 1 · o loop:** `_handoff/fleet/fleet-forever.mjs` (NOVO): antes de cada ciclo faz **health-check Ollama** (`GET /api/tags`, timeout 3s) — down → backoff dentro do loop (30s→60s→…→10min, NUNCA crash-loopa contra o Ollama) + incident no ledger; ok → `runFleet(maxRounds:6)` → sleep 10min → repete; STOP file → shutdown limpo. Escreve heartbeat a cada ciclo. **O loop NUNCA toca git** (as 21 sessões que partilham o tree agradecem; moos propõem em OUTBOX/DECISIONS, não commitam).
   **Camada 2 · supervisor pm2 (o padrão da casa — prompts/README já manda "pm2 + bus"):** `pm2 start fleet-forever.mjs --name mooter-fleet --exp-backoff-restart-delay=100 --max-memory-restart 1G` + `min_uptime 30s`/`max_restarts 10` (mata crash-loops) + **`pm2 install pm2-logrotate`** (50MB/30 ficheiros/compress — disco nunca enche de logs) + `pm2 save`. Boot persistence Windows: `pm2-installer` ou `pm2-windows-startup` (escolhe o que funcionar; regista qual em DECISIONS).
   **Camada 3 · watchdog EXTERNO (o cronista vive DENTRO do loop — morre com ele; watchdog interno não é watchdog):** `_handoff/fleet/fleet-watchdog.mjs` (NOVO, ~20 linhas: heartbeat com idade >20min E sem STOP file → `pm2 restart mooter-fleet` + linha incident no ledger) instalado via `schtasks /SC MINUTE /MO 5`. Camada 4 humana já existe: Fleet Console marca idle >6h.
   Regista em `cronista/DECISIONS.md`: "contínuo ligado 2026-07-08 · desligar = criar `_handoff/fleet/STOP` · supervisor = pm2 (`pm2 stop mooter-fleet`)".
3. **Eficiência provada, não prometida:** heartbeat ganha `gpu_min_uteis/gpu_min_totais` (ócio recuperado) e o DIGEST do cronista fecha cada dia com: rondas/pilar · % deltas positivos · GPU util média · $ cloud (=0) · tokens cloud evitados (estimados, `n/d` se não medível). Full Moo: a fila vem SÓ dos charters/ledger — zero busywork.
**GATE F4 (endurecido — prova de "nunca quebra", não só de "roda"):** 13 pilares com ≥1 ronda real · pm2 online (`pm2 ls` colado) + logrotate instalado + `pm2 save` feito · **teste de morte:** `pm2 restart mooter-fleet` a meio de um ciclo → retoma limpa do disco (STATE/ledger íntegros, prova R2/crash-only) · **teste de watchdog:** heartbeat envelhecido artificialmente → watchdog reinicia em ≤5min (log colado) · **teste de Ollama-down:** pára o Ollama 1 min → loop faz backoff sem crash (incident no ledger) → religa e retoma · STOP file testado (cria→shutdown limpo→apaga) · temp GPU no heartbeat com pausa >85°C · GPU números colados · $0 · disk: ledgers dry arquivados + logrotate a rodar.

## ▶ F5 · RELATÓRIO (formato fixo, CURTO) e SAIR
```
FLEET TOTAL DONE 2026-07-08
F1: feat/fleet-arm @<sha> · <n> commits novos · testes <n>/<n>
F2: prova 3 pilares — rondas <n> · GPU <base>%→<pico>% · $0 ✅
F3: 13/13 armados (charters committed)
F4: contínuo LIGADO (pm2 online + watchdog schtasks 5min + boot persistence) · testes de morte/watchdog/Ollama-down ✅ · STOP testado ✅ · 1º ciclo: <resumo do DIGEST em 3 linhas>
SHA classify: intacta (2x)
PENDENTE PAULO (two-factor): push feat/fleet-arm + feat/quota-aware (6 commits prontos!) · merges → main · os 6 parked do BOARD
```
**PÁRA.** Push/merge é do Paulo. O loop continua sozinho na GPU — é essa a beleza.

## ♻️ §REUSE — resiliência (web 2026-07-08; licença antes de copiar)
- **pm2** (padrão da casa + prática de mercado): exp-backoff-restart, min_uptime/max_restarts (mata crash-loops), max-memory-restart, `pm2-logrotate` (instalar no dia 1 — "disco cheio de logs é a outage mais embaraçosa"), `pm2 save` após cada mudança. Boot Windows: **`jessety/pm2-installer`** (service) ou `pm2-windows-startup`.
- **Padrão crash-only** (LangGraph/Letta doctrine, já nosso): estado autoritativo no disco, retoma de checkpoint, nunca de memória do processo — os testes de morte do GATE F4 provam-no.
- Fleet repos públicos (claude-fleet, oguzhnatly/fleet, agent-fleet-o): confrontados 2026-07-06 — SKIP como dependência (o nosso orchestrator em main tem governança que eles não têm); delta-tracking do oguzhnatly ≈ juiz U2 ✅.

## 🔁 §RESUME (sessão estourou/morreu)
Sessão fresca: *"Continua _handoff/FLEET_TOTAL_MASTERPROMPT.md na worktree ../frugal-fleet-arm. git log diz-te a última fase committed; cronista/DIGEST.md + HANDOFF_NEXT.md dizem-te o resto. Retoma da primeira fase com gate incompleto. NUNCA refaças passo committado."*
