# Mooter Autopilot Fleet — blueprint (frota de loops por pilar)

**Composto:** 2026-06-22, Cowork. **Estado:** design para evoluir do loop único (provado, W2 a correr) para uma frota multi-pilar autónoma.
**Modo:** "maluco" pré-mercado — auto-aperfeiçoamento contínuo do Mooter antes de partilhar com amigos.

---

## Respostas diretas às tuas perguntas

| Pergunta | Resposta |
|---|---|
| Mando prompt numa conversa Cowork nova e já entra em loop com o nosso contexto? | **Sim.** A conversa classifica a que **pilar** pertence, transforma o pedido numa **wave** com o contexto (vault + SYNC + memory) e injeta-a na QUEUE desse pilar. A frota apanha. |
| O loop funciona sem parar? | **Sim** — o orquestrador cicla os pilares 24/7; quando a QUEUE de um pilar esvazia, ele **auto-gera** a próxima melhoria a partir do seu *charter* (self-reflection). Limitado por GPU + quota (não é paralelismo infinito). |
| Faz sentido um loop por área (site, plugin, LoRA, DoRA, quant, matriz, skills, statusline, segurança, design, council, integrações LLM…)? | **Sim — é literalmente o SOTA.** Pilares = especialistas; orquestrador = fila (SPOQ). Cada um com agentes subscription + moo locais + skills automáticas. |

---

## Deep dive — estado-da-arte (Junho 2026)

- **SPOQ — Specialist Orchestrated Queuing for Multi-Agent SE** (arXiv 2606.03115): exatamente isto — agentes-especialistas por área, geridos por uma fila orquestrada. É o esqueleto da frota.
- **MOSAIC — Mixture-of-Agent Scheduling** (arXiv 2606.03014): agregação adaptativa + concorrência de inferência — como agendar muitos agentes sem afogar o hardware.
- **Self-improving agents 2026**: o padrão vencedor é **reflexão verbal persistida em memória** — log do que falhou e porquê, anexado ao contexto da próxima tentativa. O **Pastor** já faz isto; a frota generaliza-o por pilar.
- **Single-GPU (RTX 4090)**: continuous batching + ~2 slots concorrentes num 32GB → **jobs pesados serializam**. A frota TEM de ter um escalonador de GPU; não dá para correr 10 councils locais ao mesmo tempo.

Fontes no fim.

---

## Arquitetura — 3 camadas

### Tier 1 — Fleet Orchestrator (sistema nervoso central)
Um processo (`fleet-orchestrator.mjs`, evolução do `loop-runner`) que:
- lê o **registo** `fleet.json` (pilares, prioridade, recursos que cada um precisa) + o STATE de cada pilar;
- escolhe o **próximo pilar elegível** (status=cc_running + tem slot concedido) por prioridade + fairness (round-robin ponderado);
- corre **uma ronda** desse pilar (CC headless no worktree do pilar);
- impõe os **tetos**: 1 job pesado de GPU de cada vez · N sessões cloud concorrentes · budget diário · STOP global;
- escreve um **fleet ledger** global + heartbeat.
Também hospeda o **meta-avaliador** (cross-pillar): lê todos os ledgers, reprioriza, deteta conflitos entre pilares.

### Tier 2 — Pillar Loops (N loops)
Cada pilar = o loop Generator(CC)↔Evaluator(Cowork) já provado, mas **no seu próprio worktree + bus** (`_handoff/fleet/<pilar>/`). Cada pilar tem: **charter** (objetivo estratégico + CRITERIA), **QUEUE** de waves, **agentes** (CC subscription + council/moo local), **skills automáticas**.

### Tier 3 — Substrato partilhado
GPU (Ollama, **serializado** pelo escalonador) · quota subscription (**governada**) · vault + Notion (cada pilar alimenta a sua secção) · **git worktrees** (1 por pilar) · **Pastor** (aprendizagem partilhada).

---

## Os pilares (mapeados a áreas reais do Mooter)

| Pilar | Área / dirs | Agentes | Skills auto |
|---|---|---|---|
| **site** | landing/, dashboard/ | cloud (design-heavy) | design, ux-copy, a11y |
| **vscode-plugin** | packages/vscode-extension | cloud + local | cockpit patterns |
| **council** | packages/council | local (quórum) + cloud juiz | council, eval |
| **lora-dora** | .venv-lora, pastor adapters | local (treino) | lora-runbook |
| **quantizacao** | turboquant-backend, docs ADAPTIVE_QUANTIZATION | local | quant |
| **matriz** | packages/router specialization-matrix | local bench | bench-fetch |
| **skills** | .claude/skills, packs/ | cloud | skill-creator |
| **statusline** | tools/router/statusline-* | local | statusline |
| **seguranca** | packages/data-rights, SECURITY | cloud (adversarial) | security-review |
| **design** | landing design, canvas | cloud | canvas, critique |
| **integracoes-llm** | benchmark-fetcher, minimax-watcher, arbitrage-monitor | local watchers | model-roster |
| **bench-eval** | packages/mooter-bench | local | eval |

(Cada pilar trabalha SÓ nos seus dirs no seu worktree → zero colisão entre pilares.)

---

## Governação de recursos (a parte que torna isto REAL, não fantasia)

| Recurso | Teto real | Política |
|---|---|---|
| **GPU (1× 4090)** | ~1 job pesado / 2 slots pequenos | pilares pedem slot; escalonador serializa councils/treinos; modelos pequenos podem partilhar |
| **Subscription (Claude Max)** | quota mensal | budget governor: máx N CC concorrentes, cap diário de tokens, **prefer local**; pausa pilares cloud se estoura |
| **Git** | 1 working tree por checkout | **1 worktree por pilar** (worktree-conductor) → nunca se pisam (resolve o desastre R3) |
| **Irreversível** | — | merge/push-main/deploy/secrets = **gate humano por pilar**, sempre |

---

## Fluxo "nova conversa Cowork → entra no loop"

1. Escreves um prompt numa conversa Cowork nova.
2. Cowork (eu) **classifica o pilar** (regex/keywords sobre os teus dirs+temas; cria pilar novo se preciso).
3. Transformo em **wave** com o contexto partilhado (vault/SYNC/memory) e injeto na `QUEUE` desse pilar.
4. O orquestrador apanha a wave quando esse pilar tiver slot → o loop corre → alimenta Notion/vault → escala-te só o irreversível.
A conversa **não precisa de ficar aberta** — vira estado no bus do pilar.

---

## Auto-aperfeiçoamento contínuo ("modo maluco")

- Cada pilar tem um **charter** (norte estratégico). Quando a QUEUE esvazia, o pilar **gera a próxima melhoria** a partir do charter + da sua **reflection log** (o que correu mal antes) — auto-trabalho infinito, limitado por GPU/budget.
- O **meta-avaliador** (cross-pillar, cada N min) lê todos os ledgers, **reprioriza** (ex.: dá GPU ao pilar com maior valor/risco), e deteta quando dois pilares mexem na mesma fronteira.
- "Claude a falar com Claude": Generator(CC)↔Evaluator(Cowork) por pilar + meta-avaliador por cima = sociedade de agentes a aperfeiçoar o Mooter.

---

## Segurança (porque a Anthropic teria orgulho)

Gates irreversíveis sempre humanos (por pilar) · budget + GPU caps (nunca runaway) · STOP global e por pilar · transparência total (fleet ledger + Notion por pilar) · `classify.js` FROZEN re-verificado a cada fecho · cada pilar isolado no seu worktree. **Autonomia calibrada, não cega.**

---

## Caminho faseado (do que já temos → frota)

| Fase | O quê | Estado |
|---|---|---|
| **F0** | 1 loop provado (runner pm2 + evaluator + bus), W2 a correr | ✅ feito |
| **F1** | generalizar: `fleet.json` + `fleet-orchestrator` (1 processo, N pilares, GPU/budget caps) | 🔜 |
| **F2** | 1 worktree git por pilar (worktree-conductor) | 🔜 |
| **F3** | meta-avaliador cross-pillar + auto-geração de waves (modo maluco) | 🔜 |
| **F4** | cockpit "Fleet" (N pilares, ledgers, gates num ecrã) | 🔜 |

Cada fase é aditiva e reversível; o loop único de hoje é o pilar #1 da frota.

---

## O que NÃO prometer (honesto)

- **Não é paralelismo infinito.** 1 GPU + quota = concorrência limitada + fila. A frota dá a ilusão de "tudo ao mesmo tempo" via escalonamento, mas no fundo serializa o pesado.
- **Merge é sempre teu.** O valor real é o trabalho chato feito sozinho; a decisão irreversível fica contigo.

---

## Fontes
- SPOQ — Specialist Orchestrated Queuing (arXiv 2606.03115)
- MOSAIC — Mixture-of-Agent Scheduling (arXiv 2606.03014)
- Self-Improving AI Agents 2026 (o-mega.ai) · AI Agent Orchestration enterprise playbook (fifthrow)
- Single-GPU concurrency / continuous batching (Spheron inference guide 2026)
