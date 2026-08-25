# ⇄ COWORK → CC · Fleet Fase 3 LAUNCH — council + seguranca em loop REAL local $0 (v2, pós-confronto git 2026-07-06)

> Substitui operacionalmente `_handoff/FLEET_FASE3_ARM_MASTERPROMPT.md` (mantém-no como contexto).
> **Confronto git real feito pelo Cowork em 2026-07-06** (leitura de refs directa; mount `git status` não fiável — cross-check nativo em §CROSS-CHECK):
>
> | Peça | Estado REAL | Evidência |
> |---|---|---|
> | `feat/fleet-orchestrator` | ✅ **TOTALMENTE em main** — `git log main..feat/fleet-orchestrator` vazio | ref 1c0c077 ancestral de main |
> | `_handoff/fleet/fleet-orchestrator.mjs` + `fleet.json` | ✅ tracked em main 266e4f3 | `git ls-tree -r main` |
> | Overclock pool concorrente (`packages/overclock-moo/src/pool.mjs` runBoundedPool + runOverlapped + thermal clamp) | ✅ **em main** | `git ls-tree -r main` |
> | Overclock runner Ollama real (`src/runner.mjs`: OLLAMA_HOST 127.0.0.1:11434 · pickOllamaModel qwen3 · eval counts reais) | ✅ em main | idem |
> | `overclock-fill.mjs` (audit-fix) | ✅ em main (`packages/vscode-extension/src/`) | idem |
> | `archive/overclock-tree-2026-07-03` | ❄️ 2 commits só-arquivo (snapshot forge+churn) — **nada a aterrar para a Fleet**; recuperar forge é backlog separado | `git log main..archive/…` |
> | 12 pilares scaffolded (STATE/CRITERIA/INBOX) | ✅ tracked em main | idem |
> | Rondas anteriores (STATE round 6, ledger, heartbeat) | ⚠️ **tudo DRY_RUN de 2026-06-23** (`dry_run:true`, engine `ollama-dry`) — 0 rondas reais | `fleet-heartbeat.json` |
> | Workforce local REAL no orchestrator | ❌ **NÃO EXISTE** — só `dryRunPillar` (sintético) e `cloudPillar` (sdk-runner cloud, fail-closed `FLEET_ALLOW_CLOUD=1`, e devolve `costUsd: NaN`) | linhas 120–165 |
> | `fleet.json`: council e seguranca | ⚠️ ambos `cloud_heavy:true · gpu_heavy:false` — contradiz a prova "GPU saturada $0" | `fleet.json` |
> | STANDING_POLICY.json/charter/DECISIONS.md dos 2 pilares | ❌ não existem (criar) | `ls` |
> | Tree principal `~/frugal` | ⚠️ em `wave/honest-controls` (84fa287), **5 commits ATRÁS de main, 0 à frente** — nada perdido; checkout main é do Paulo (nativo) | refs |
> | `classify.js` | ✅ sha intacta `427d8c0b…` | sha256sum |
>
> **Conclusão:** não há nada para "aterrar" de branches — a fundação está toda em main. O que falta é **construir a ponta local $0** (ficheiros novos) + governança + correr as rondas. O orchestrator é dependency-injectable (`runFleet(opts)` aceita `runPillar`) — **zero modificação a ficheiros existentes do engine**.
>
> **Deep dive 2026-07-06 (roster + continuidade de contexto)** — 3 conclusões que moldam este handoff:
> 1. **Roster:** aos 12 pilares falta um **13º meta-pilar `cronista`** (QA-escriba: regista tudo, verifica harmonia cross-pilar, pré-coze handoffs) — era o "meta-avaliador" adiado p/ Fase 4; entra JÁ na Fase 3 porque a prova sem escriba é ilegível. Backlog Fase 4 (não armar agora): `cli` (packages/cli não está no roster!), `docs` (drift README/STRATEGY/INFRA), `hub` (worker Cloudflare).
> 2. **Ctx window — moos locais são imunes POR CONSTRUÇÃO:** cada ronda Ollama é stateless; o "contexto" é remontado do disco (charter+STATE+ledger). O risco real (65% das falhas enterprise = context drift, não exaustão — Zylos 2026) é o prompt de ronda inchar com histórico → regra **bounded context assembly** no passo 2. O `sdk-runner` (pilares cloud, futuro) usa `resume` → contexto CRESCE entre rondas: política de rotação fica anotada p/ Fase 4, não bloqueia FASE3.
> 3. **A sessão CC executora também não pode perder nada:** checkpoint = R2 (commit atómico) + ledger + STATE em disco; §RESUME no fim deste handoff permite a qualquer sessão fresca retomar do último commit — prática de mercado 2026: "resume from authoritative state, not from a model-generated guess" (LangGraph checkpointing; Letta/MemGPT tiered memory).

## 🗺️ ORDEM DE EXECUÇÃO GLOBAL (cruzamento Notion HQ + vault + STRATEGY.md + MOOTER_ROADMAP v3, 2026-07-06)

| # | Frente | Fonte/masterprompt | Modo (régua roadmap) | Quando |
|---|---|---|---|---|
| 0 | Live Preview MP5 (select-to-edit) | `_handoff/LIVE_EDIT_MP5_SPEC.md` | CC cloud (extra usage) | 🔥 JÁ CORRE — não descarrilar |
| 1 | **🎼 SUPER MP** — maestro que executa MP-Q → MP-A → rondas na 4090, com gates entre fases | `_handoff/SUPER_MP_QUOTA_FLEET.md` | CC-once (1 colagem) | **É ISTO QUE SE COLA** (2026-07-06) |
| 1a | MP-Q · Quota-Aware Routing (spec da Fase Q do super) | `_handoff/QUOTA_AWARE_MP.md` | — | lido pelo super MP |
| 1b | MP-A · Fleet FASE3 (este handoff = spec das Fases A+R) | este ficheiro | — | lido pelo super MP |
| 2 | **§MP-B · Fleet no Deck (lite)** | §MP-B abaixo — **subordinado ao W15** | CC-once (S) | pós-gate FASE3 |
| 3 | **W15 · CTO Command Deck** (redesign 6 fases — absorve o §MP-B) | `_handoff/CTO_COMMAND_DECK_SPEC.md` (PRONTO) | CC faseado | depois do §MP-B |
| 4 | **Fase 4 · escalar a fleet aos 13+** com os §CHARTERS abaixo | §CHARTERS | Loop $0 contínuo | pós-prova + OK Paulo |
| 5 | W2 housekeeping · W9 TTL insight-distiller | rondas do cronista / pilar próprio | Loop $0 | dentro da Fase 4 |

Régua do roadmap que isto respeita: **máxima velocidade = máxima delegação ao local** · CC-once só no coding/irreversível · aterrar > começar. O vault note de 2026-07-03 ("orchestrator não existe") está **stale** — o confronto git de hoje prova que aterrou em main na consolidação de 03-07.

## 📜 §CHARTERS — os 13 pilares alinhados à estratégia (para o passo 1 do DO e para a Fase 4)

> Cruzamento: STRATEGY.md (tese/5 princípios) × MOOTER_ROADMAP v3 (waves/squads) × Mooter Backlog Notion × polish backlog vault. **Regra:** o charter de um pilar = a wave do roadmap que lhe pertence; o loop $0 faz a mão-de-obra iterativa da wave, o CC-once faz o irreversível dela. FASE3 arma os 3 primeiros; Fase 4 arma o resto por esta ordem de prioridade.

| Pilar | Squad | Wave(s) | Charter (1 linha) | Critério de sucesso MEDIDO |
|---|---|---|---|---|
| **council** 🔥F3 | 🧠 Auto-Evolution | eval/quality | Melhorar qualidade+calibração do council (length-neutral, ACT, custo) sem regressão | `oracle_gap ≤5%` · `p99 ≤100ms` |
| **seguranca** 🔥F3 | 🛡️ Security | W12 (DP) + supply-chain | Auditoria contínua 3-promessas + supply-chain packs/MCP | `0 leaks` · `audit 100%` |
| **cronista** 🔥F3 | 📊 Obs & Sustentação | W2 + "Purposeful Overclock" | Registar tudo, verificar harmonia, pré-cozer handoffs; rondas ociosas fazem W2 — **PROPOSTAS de arquivo dos +40 masterprompts legacy via DECISIONS.md** (arquivar/apagar é destrutivo → two-factor) | digest ≤1 ronda atraso · 0 incoerências não reportadas · N propostas W2 no DECISIONS |
| bench-eval | 📊 Obs | WORLD_CLASS_LOOP §1 | Eval honesto OOD do runtime completo + fix `moo-verify` (falha pré-existente!) | ROUTER_SCORE medido/ronda · moo-verify verde |
| matriz | 🧭 Routing | specialization + **usage-relief** | Afinar a specialization-matrix vs oracle local + **decidir que subagent-tasks vão a moos locais** (37% do burn real) + quota-aware signal | delta acc medido · est_cloud_tokens_avoided/ronda |
| quantizacao | 🧭 Routing | W11 (AWQ) | Candidatos AWQ/quant vs qwen3:30b base | tok/s +X% com eval sem perda (medido) |
| integracoes-llm | 🧭 Routing | W8 (speculative) + **usage-relief** | Bench local draft→verify + **MCP result distiller** (24% do burn = context7; moo resume output MCP antes do contexto) | speedup medido lossless · tokens MCP evitados |
| lora-dora | 🧠 Auto-Evolution | W7 (Forge) | Preparar 1 adapter real O-LoRA/DoRA anti-forgetting | adapter valida no forge gate |
| vscode-plugin | 🛩️ Cockpit & UX | W13/W15 + polish F1/F3 + **usage-relief** | Micro-polish ADITIVO guiado por `COCKPIT_UX_AUDIT` + **Guardian/ctx-diet como feature de user** (66% do burn = ctx >150k; brief Context Guardian já existe) (redesign grande = W15 CC-once, ❌ não é o loop) | 0 botões mortos · testes verdes |
| design | 🛩️ Cockpit & UX | W15 Fase 0 (tokens) | Matar cores hardcoded → `var(--vscode-*)` (pré-cozinha a Fase 0 do deck) | 0 hex no CSS dos módulos tocados · 3 temas legíveis |
| statusline | 🛩️ Cockpit & UX | STATUSLINE_V2 | Chips honestos opt-in sem tocar o default | default byte-idêntico · testes |
| site | 📦 Distribution | W3 | Install-Ready + rankings frescos + onboarding educativo | lighthouse ≥95 · install E2E |
| skills | 🔀 Agent Comms | W2 parcial | Consolidar skills duplicadas + testes | N skills consolidadas c/ teste |

## ⚡ §GPU-POLICY — "sempre a trabalhar, nunca busywork" (doutrina dos teus próprios cards Notion)

- **Full Moo:** só trabalho com **valor pendente real** — a fila vem dos charters e do ledger, nunca de probes sintéticos para "encher". (Notion: *Full Moo — saturação inteligente*.)
- **Purposeful Overclock:** ócio da GPU → `overclock-fill` puxa trabalho REAL: pré-cozer handoffs (cronista), distilar insights do Ledger (semente do W9 TTL), micro-diagnósticos, drafts de housekeeping W2. **"GPU produz memória, não calor."**
- **Métrica de ócio recuperado** no ledger/heartbeat: `gpu_min_uteis / gpu_min_totais` por dia + rondas/dia por pilar — a narrativa CMO ("a GPU que já pagaste nunca fica parada") sai daqui, MEDIDA.
- **Eficiência = caps respeitados:** `gpuHeavyConcurrent:1` entre pilares · saturação INTRA-ronda via `runBoundedPool` · thermal clamp do allocator (não fritar a 4090) · `daysQuota` = orçamento diário por pilar.
- **Modo contínuo (só pós-prova):** `FLEET_MAX_ROUNDS` alto + relançamento por schedule; **STOP file** (`_handoff/fleet/STOP`) pára a frota limpa — o botão de emergência é um ficheiro, não um kill.

## 🩸 §USAGE-RELIEF — a fleet ataca as dores de quota REAIS (print do Paulo, 2026-07-06 · advogado do diabo v5)

> **Dados reais do utilizador-alvo** (Account & Usage, Max, 2026-07-06): Session 10% · **Weekly 89%** · **Fable 100%** (reset 3d). Composição do burn: **66% em contexto >150k** · **37% em sessões subagent-heavy** · **24% no MCP context7**. Isto é a realidade da maioria dos users Max que o Mooter serve — e o veredicto do advogado do diabo: **o v4 evoluía o produto mas não atacava cirurgicamente estas 3 dores. O v5 corrige.**

**A moeda certa (correcção à estratégia):** para user Max, marginal cost ≈ $0 mas a **quota semanal é finita** — a moeda real não é $, é **% de semana libertada**. O statusline "saved $X" está certo p/ PAYG; p/ Max, o número que importa é "quota freed". Facto novo (web hoje 2026-07-06): CC 2.1.x+ **passa `rate_limits.five_hour`/`.seven_day` no stdin do statusline** — zero API calls; o Mooter JÁ tem statusline hook → **quota-aware routing é trivial** (weekly >80% → defcon local-first agressivo; Fable 100% → bloquear sugestões T5).

**Mapa cirúrgico dor → moo local $0:**

| Dor (medida no print) | Ataque da fleet | Pilar dono |
|---|---|---|
| 66% ctx >150k | Context Guardian + compaction advisor (briefs JÁ existem) + bounded context como feature de user, não só da fleet | vscode-plugin (Guardian) + cronista (distill) |
| 37% subagents | Moos locais como subagent-workers (workflow engine já tem workers Ollama); a matriz decide QUE subagent-task vai local | matriz + integracoes-llm |
| 24% MCP (context7) | **MCP result distiller**: moo local resume o output MCP antes de entrar no contexto; docs-lookup roteado ao Ollama | integracoes-llm |
| Quota cega | **Quota-aware routing** (P0 novo): rate_limits do stdin como sinal de routing | matriz + statusline |

**Contabilidade de quota (facto novo, web hoje):** desde 2026-06-15 o uso **programático** (Agent SDK, `claude -p`) tem **pool de créditos MENSAL separado** — o `sdk-runner` (pilares cloud, mooter-bridge) NÃO gasta a semana interactiva. O ledger passa a marcar a fonte: `quota_source: local-$0 | programmatic-credits | weekly-interactive | api-$`. E cada ronda regista `est_cloud_tokens_avoided` (estimativa honesta, `n/d` se não medível) — o número CMO/CEO na moeda do user.

## 🧼 §HIGIENE DA SESSÃO EXECUTORA (weekly a 89% — a sessão que arma a fleet não pode queimar a semana que ela quer salvar)
- **Sonnet** (já mandatado; Fable está a 100% e não é para isto).
- **Antes de colar:** `/mcp` → desactivar servers desnecessários — **context7 é 24% do teu burn**; o arming não precisa dele.
- **Zero subagents** no arming (37% do burn) — o handoff é linear, não precisa de fan-out.
- **Sessão curta e disco-first:** R2 commit por passo + sair no GATE; nada de manter a sessão viva "para ver as rondas" — as rondas correm no launcher Node, não na sessão CC.
- **Se a semana apertar antes do reset (3d):** alternativa legítima = correr o arming headless via Agent SDK (`sdk-runner`/`claude -p`) que gasta o pool programático mensal, não a semana. Trade-off: menos visibilidade interactiva; o §RESUME cobre a retoma.

## 🎯 GOAL
`council` e `seguranca` em **loop real local $0** — medir→propor→testar→ledger — 2-3 rondas, GPU 4090 saturada pelo pool do Overclock, todo o destrutivo só em `DECISIONS.md`, e o **`cronista`** (QA-escriba) a registar tudo e a garantir harmonia. Prova antes de escalar aos 12+.

## 📍 WHERE (R1/R5 — obrigatório)
`git fetch` → `git worktree add ../frugal-fleet-arm main` → `cd ../frugal-fleet-arm` → confirmar `git rev-parse --show-toplevel` == `frugal-fleet-arm`. Branch `feat/fleet-arm`. Sonnet. **1 pilar de trabalho = esta worktree; nenhuma outra sessão aqui.**

## ▶ DO (commit atómico após CADA passo — R2)
1. **Governança:** `STANDING_POLICY.json` em `_handoff/fleet/{council,seguranca,cronista}/` (AUTO = ronda seguinte/refactors/evals locais/commits na branch do pilar/ficheiros novos · DIGEST = push/merge/deploy/secrets/apagar → linha em `DECISIONS.md`, nunca executa · two-factor = merge para main só com OK do Paulo) + **charter** 1 linha + critério de sucesso: council `oracle_gap ≤5% · p99 ≤100ms`; seguranca `0 leaks · audit 100%`; cronista `digest fresco ≤1 ronda de atraso · 0 incoerências não reportadas · handoff pré-cozido por pilar activo`. Criar `DECISIONS.md` vazios + scaffold `_handoff/fleet/cronista/` (STATE.json idle, CRITERIA, INBOX, OUTBOX — espelho dos outros pilares). → COMMIT.
2. **Workforce local $0 — ficheiro NOVO** `_handoff/fleet/local-pillar.mjs`: corre uma ronda do pilar com moos locais via Ollama (reusar os padrões de `packages/overclock-moo/src/runner.mjs`: `OLLAMA_HOST` default `http://127.0.0.1:11434`, `pickOllamaModel` pref qwen3, tokens = eval counts REAIS). A ronda: **mede** (estado vs critério do charter) → **propõe** 1 melhoria → **testa** local. Devolve `{ proposal, events, engine:"ollama-local", costUsd:0, gpuMinutes:<medido> }`. A proposal TEM de passar o proof-gate do orchestrator: incluir "pode falhar se" + claims grounded em events (sem isso é `gate_rejected` — comportamento correcto, não bug). **Dentro da ronda**, saturar a GPU com `runBoundedPool` do Overclock (`packages/overclock-moo/src/pool.mjs`) — vários moos concorrentes NUM pilar (o cap `gpuHeavyConcurrent:1` é entre-pilares; a saturação vem de dentro da ronda). Respeitar o thermal clamp do pool.
   **⚠️ VISIBILIDADE (confronto 2026-07-06 — sem isto a prova é INVISÍVEL no cockpit):** o orchestrator só LÊ `STATE.json` (buildLoops), nunca o escreve — quem escrevia era o loop dry antigo. `local-pillar.mjs` TEM de, por ronda: **(a)** actualizar `_handoff/fleet/<pilar>/STATE.json` (`status` running→awaiting_eval · `round`++ · `last_run_ts` · `sessionId` `fleet-r<N>-<pilar>` · `measuredWins`/`measuredTotal` — alimentam o hit-rate Beta do scheduler e acendem a Fleet Console, que marca ACTIVE se `last_run_ts` ≤6h); **(b)** append em `_handoff/fleet/<pilar>/ledger.jsonl` com o delta MEDIDO vs critério (`n/d` se não mediu). Escrita atómica (tmp+rename, padrão do writeHeartbeat).
   **⚠️ BOUNDED CONTEXT ASSEMBLY (anti-drift — deep dive 2026-07-06):** o prompt de cada ronda é remontado do disco com TECTO: charter + critério + STATE + últimas **K=10** linhas do ledger do pilar + OUTBOX da ronda anterior — **NUNCA** o histórico/transcript completo. Cap explícito de chars no assembler (constante no topo do ficheiro). É isto que torna o loop imune a estouro de contexto: cada ronda é uma sessão nova por construção, o estado autoritativo vive no disco, nada vive só na memória do modelo. → COMMIT (com teste unitário mínimo, incl. teste do cap).
   **2b. Pilar `cronista` (QA-escriba — pedido Paulo 2026-07-06):** rotina própria (modo no `local-pillar.mjs` ou ficheiro novo `_handoff/fleet/cronista-pillar.mjs` — decisão tua, desde que aditivo). Por ronda, o cronista NÃO gera código; ele: **(i)** lê os ledgers/OUTBOX/STATE/DECISIONS de TODOS os pilares activos; **(ii)** verifica harmonia — invariantes: sha classify intacta · caps respeitados (vs heartbeat) · schema do ledger válido · todo delta tem fonte (juiz U2: um moo local $0 re-verifica 1 claim por ronda — mata o falso-verde) · nenhum pilar parado >2 rondas sem incident; **(iii)** escreve `_handoff/fleet/cronista/DIGEST.md` (visão executiva acumulada: o que a frota fez, deltas, pendências two-factor) e **(iv)** pré-coze `_handoff/fleet/<pilar>/HANDOFF_NEXT.md` por pilar activo (estado + próximo passo + como retomar) — **o handoff está sempre pronto ANTES de ser preciso**; qualquer sessão fresca retoma sem perder nada. Incoerência detectada → linha no DIGEST + `incident` no ledger (nunca corrige sozinho o trabalho de outro pilar). → COMMIT.
3. **Launcher — ficheiro NOVO** `_handoff/fleet/fleet-local-launch.mjs`: importa `runFleet` do orchestrator + `localPillar`, chama `runFleet({ dryRun:false, runPillar: localPillar, maxRounds: Number(process.env.FLEET_MAX_ROUNDS||3) })`. **`FLEET_ALLOW_CLOUD` fica UNSET** (fail-closed $0 — é o guardrail, não o contornar). → COMMIT.
4. **`fleet.json`:** council e seguranca → `gpu_heavy:true · cloud_heavy:false` (justificação no commit: workforce agora é local; flags eram seed metadata da era cloud) + **nova entrada** `{ "id":"cronista", "workdir":"_handoff/fleet/cronista", "priority":0.6, "gpu_heavy":false, "cloud_heavy":false, "daysQuota":6 }` (leve, não fura o cap `gpuHeavyConcurrent:1`; quota alta porque corre a cada ronda-fleet). Única edição a ficheiro existente permitida. → COMMIT.
5. **Higiene da prova:** `git mv`/rename `fleet-ledger.jsonl` → `fleet-ledger.dry-2026-06-23.jsonl` e idem para `council/ledger.jsonl` + `seguranca/ledger.jsonl` (a prova real começa com ledger limpo; a admissão ignora `awaiting_eval`, STATE.json pode ficar). → COMMIT.
6. **Correr 2-3 rondas reais** (nativo, Ollama vivo na 4090): `node _handoff/fleet/fleet-local-launch.mjs` com `FLEET_MAX_ROUNDS=3` — agora com **3 pilares** (council + seguranca + cronista). Medir GPU util antes/durante (`nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 2` ou metrics do Overclock) e **guardar os números** (colar no BACK). Delta MEDIDO no ledger; `n/d` se não mediu; `change ≠ improvement` → reverte via AUTO.
7. Qualquer necessidade destrutiva descoberta → **uma linha em `DECISIONS.md`**, nunca executar.

## 🔒 GUARD
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · **NÃO tocar** `fleet-orchestrator.mjs`, `packages/overclock-moo/*` nem qualquer engine file — só ficheiros NOVOS + a edição cirúrgica do `fleet.json` (passo 4) · caps respeitados (`gpuHeavyConcurrent:1 · poolWidth:4 · budgetUsdPerDay:5`) · `FLEET_ALLOW_CLOUD` unset · **NUNCA merge/push** (two-factor = Paulo) · selective `git add` · ledger honesto (nunca fabricar delta) · thermal clamp do pool (não fritar a 4090) · PT-PT conversa / inglês código.

## ✅ GATE
council+seguranca × ≥2 rondas REAIS no `fleet-ledger.jsonl` novo (engine `ollama-local`, `cost_usd:0`, heartbeat `dry_run:false`) · GPU util medida SOBE durante as rondas (números colados, antes/durante) · proof-gate exercido (≥1 proposal gated OU gate_rejected legítimo) · **Fleet Console do cockpit mostra os 3 pilares ACTIVE/loop** (STATE.json fresco — prova de visibilidade, printscreen ou fleetSnapshot colado) · **cronista provado**: `DIGEST.md` cobre todas as rondas + ≥1 claim re-verificado pelo juiz U2 + `HANDOFF_NEXT.md` fresco por pilar (teste: uma sessão fresca conseguiria retomar SÓ com ele) · prompts de ronda respeitam o cap do assembler (teste verde) · todo o destrutivo só em `DECISIONS.md` · sha intacta · `git status` limpo (tudo committed — R2) · ZERO merge/push. **PÁRA aqui.**

## 📋 BACK
Branch `feat/fleet-arm` + `git log --oneline main..HEAD` + `git --no-pager diff --stat main..HEAD` (só adições + fleet.json) + `fleet-ledger.jsonl` colado + `DECISIONS.md` dos 2 pilares + números de GPU util + sha check.

## ⏭ NEXT (só depois do gate)
**§MP-B abaixo (Fleet no Deck — frente sequencial própria, R3)** · **Quota-aware routing P0** (rate_limits do statusline stdin → sinal de routing; defcon local-first quando weekly >80%, bloquear T5 quando Fable 100% — ver §USAGE-RELIEF) · Fase 4: escalar aos 12+ — charters restantes + candidatos novos ao roster (`cli`, `docs`, `hub` — deep dive 2026-07-06) + política de rotação p/ pilares cloud (o `sdk-runner` usa `resume`, contexto cresce: reset do `sessionId` a cada N rondas, rebuild do disco; contabilizar `quota_source: programmatic-credits`) · R6: podar as 15 worktrees acumuladas · backlog: recuperar forge de `archive/overclock-tree-2026-07-03` · hardening `cloudPillar` `costUsd:NaN` → medido.

## ♻️ §REUSE — repos públicos confrontados (web 2026-07-06): o que adoptar, inspirar, saltar
- **Orquestradores fleet públicos** (`sethdford/claude-fleet` · `oguzhnatly/fleet` · `escapeboy/agent-fleet-o` · gists multi-agent): ❌ **NÃO adotar** — o nosso orchestrator JÁ está em main com governança única (proof-gate + ledger honesto + two-factor + caps GPU) que nenhum deles tem; trocar agora viola "aterrar > começar". ✅ **Inspirar**: delta-tracking/reliability-judging do `oguzhnatly/fleet` ≈ valida o nosso juiz U2; ler antes de escrever o cronista.
- **`ethanhq/cc-fleet`** — subagents/agent-teams do CC em modelos terceiros/locais (Qwen, DeepSeek…). 🔥 **Leitura OBRIGATÓRIA para o pilar `matriz`** (subagent→moo local, 37% do burn): a técnica deles de apontar subagent a endpoint compatível é o atalho; confrontar com o nosso no-proxy antes de adotar (aceitável para subagents INTERNOS? decisão para DECISIONS.md).
- **`ryoppippi/ccusage`** — adotar como leitor de burn local (ver §REUSE do MP-Q).
- **`wshobson/agents` + `rohitg00/awesome-claude-code-toolkit`** — catálogos curados (135 agents, 35 skills, 20 hooks); 🐮 ronda W2 do cronista: minerar e propor imports via DECISIONS.md.
- **Registries oficiais Anthropic (skills/plugins)**: confrontados hoje — nada instalável além do que já temos (kepano/obsidian-skills já no vault).
- **Regra:** verificar LICENÇA antes de copiar qualquer linha; imports = ficheiros novos com atribuição no header.

## 🔁 §RESUME — continuidade da sessão executora (nada se perde, NUNCA)
Este handoff é executado com checkpoints em disco: R2 (commit atómico por passo) + ledger + STATE + `HANDOFF_NEXT.md` do cronista. **Se ESTA sessão CC estourar o contexto, morrer ou for fechada:** abrir sessão CC fresca em `~/frugal` e colar apenas isto:
> Continua `_handoff/FLEET_FASE3_LAUNCH_HANDOFF.md` na worktree `../frugal-fleet-arm` (branch `feat/fleet-arm`). Confronta `git log --oneline main..HEAD` + `git status` na worktree para veres o último passo committado; lê `_handoff/fleet/cronista/DIGEST.md` e os `HANDOFF_NEXT.md` se já existirem. Retoma do primeiro passo do DO ainda não committado. NUNCA refaças um passo já committado (incremento, não recomeço).
Regra dura na sessão executora: **nada relevante vive só no contexto** — se produziste algo e ainda não está committado ou num ficheiro do bus, ainda não existe. Opcional (Guardian): baixar o limiar de auto-compact via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (só baixa, nunca sobe).

---
## §MP-B · ⇄ COWORK→CC · Fleet no Deck LITE — Director's Cut da frota + lentes executivas (SÓ depois do gate FASE3)

> **Confronto 2026-07-06:** o 🎞️ Director's Cut vigia `_handoff/live-preview/events.jsonl` (session-scoped) — as rondas da fleet NUNCA aparecem lá; a Fleet Console só mostra status/round/age. Para o Paulo "bater o olho e saber" (MC) que os moos trabalham sem parar, o deck precisa de ler o `fleet-ledger.jsonl`.
> **⚠️ SUBORDINAÇÃO ao W15 (anti-retrabalho):** o redesign grande do plugin é o **CTO Command Deck** (`_handoff/CTO_COMMAND_DECK_SPEC.md`, super masterprompt PRONTO, 6 fases). Este MP-B é o incremento LITE que o W15 absorve: obedece às **6 leis de pilotagem** do spec (gestão por exceção · tela calma · honest-copy lei de código · coerência wave=sessão=aba), usa `var(--vscode-*)` (nada de hex novo — Fase 0 do deck vai matar os existentes), `prefers-reduced-motion`, e os componentes têm de encaixar no slot **Floor → Fleet Console** do layout alvo. Régua UX do Paulo (vault 2026-06-30): *"tudo na mão — visualização, transparência, velocidade; sem redundância; cada elemento é uma feature ou não existe."* Diagnóstico, não scoreboard.

**GOAL** — Ver no cockpit, ao vivo e sem fabricar nada: os moos locais a evoluir pilares em contínuo + registos claros por lente executiva.

**WHERE** — worktree nova `../frugal-fleet-deck`, branch `feat/fleet-deck`, from main ATUAL (pós-aterragem FASE3 se já aterrou). Sonnet.

**DO** (aditivo, read-only sobre a fleet; commit atómico por bloco)
1. **🎞️ Fleet Director's Cut:** fonte adicional no cockpit que faz tail read-only de `_handoff/fleet/fleet-ledger.jsonl` (mesmo padrão fs.watch fail-soft do bus live-preview; NUNCA cria/escreve o ficheiro). Cada evento com atribuição de pilar + ronda + engine + custo. Sem ledger → estado vazio honesto ("sem rondas ainda"), nunca inventado. Filtro por pilar.
2. **Lentes executivas** (card único, derivado SÓ do ledger + STATE.json + DECISIONS.md + `cronista/DIGEST.md` — o cronista já pré-agrega a visão executiva; cada número com a sua fonte; `n/d` honesto quando não medido):
   - **CEO** — outcome: deltas medidos vs charter por pilar · wins/dia · % deltas positivos · "o que a frota conquistou hoje".
   - **CTO** — motor: proposals gated vs rejected (proof-gate) · incidents (pillar-threw, orphan-lease) · sha classify intacta · engine mix (ollama-local vs cloud).
   - **COO** — operação: rondas/dia por pilar · caps respeitados (peakGpu/peakCloud/peakPool do heartbeat) · leases · daysQuota consumida · uptime do loop (heartbeat age).
   - **CIO/CISO** — risco: DECISIONS.md pendentes (o queue two-factor do Paulo) · destrutivo executado = 0 · leaks = 0 · budget cloud usado vs cap $5.
   - **CMO** — história: deltas positivos citáveis (material de prova para o GSD write-up/site) · streak de rondas $0 · GPU util média (a narrativa "mão-de-obra $0 na 4090").
3. **Honest-copy meta-coerente:** cada lente diz DE ONDE vem o número (tooltip fonte: ledger linha N / heartbeat / DECISIONS). Sem dado → a lente degrada com "n/d", nunca esconde.
4. Testes: parser do ledger (linhas malformadas → skip, nunca crash) + render das 5 lentes com fixtures (0 rondas · rondas dry · rondas reais) + fail-soft sem fleet dir.

**GUARD** — `classify.js` FROZEN (sha `427d8c0b…`) · read-only sobre `_handoff/fleet/**` (o deck NUNCA escreve na fleet) · aditivo no `packages/vscode-extension` (não partir Fleet Console/MC existentes — testes deles continuam verdes) · honest-copy · selective add · sem merge/push sem OK.

**GATE** — Com a fleet a correr (FASE3), o cockpit mostra: 🎞️ eventos de ronda ao vivo com pilar+delta · 5 lentes com números REAIS rastreáveis à fonte · zero fabricação com ledger vazio (fixture) · testes verdes (extensão completa) · sha intacta. Cola printscreen/render + `git log --oneline main..HEAD`.

**BACK** — branch + diff --stat + testes + o render das lentes com os dados reais da FASE3.

---
## §CROSS-CHECK nativo (Paulo, PowerShell, 30s — antes de colar o handoff ao CC)
```powershell
cd ~/frugal
git log --oneline -3 main                      # esperar: 266e4f3 no topo
git log --oneline main..feat/fleet-orchestrator # esperar: vazio
git status -sb                                  # tree principal está em wave/honest-controls — fazer: git checkout main
```
Se bater com a tabela acima, colar este ficheiro numa sessão CC **fresca** na worktree nova. O loop das rondas (passo 6) corre nativo — Ollama/4090 não são alcançáveis do sandbox do Cowork.
