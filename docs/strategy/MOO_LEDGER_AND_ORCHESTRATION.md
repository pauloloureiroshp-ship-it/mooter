# 🐮📒 Moo Ledger & Orchestration Spine

> A espinha de **memória + auditoria + orquestração** dos dois cérebros do Mooter:
> **Claude Code = arquitecto (o cérebro)** · **moos locais ($0, GPU ociosa) = operários (as mãos)**.
> Ancorado no SOTA 2026 (event-sourcing para agentes, log-as-truth, actor model) **e** no
> substrato que o Mooter já tem (`handoff-journal`, bus, hub). Não inventa — formaliza.

## Doutrina (uma linha)
**O journal é a verdade. Markdown, SQLite e Notion são todos apenas projecções dele.**

## Divisão de trabalho (orchestrator-worker, nunca swarm)

| | **Arquitecto — Claude Code** (LLM de fronteira) | **Operários — moos locais** ($0, idle GPU) |
|---|---|---|
| Papel | cérebro: planear, arquitectar, decidir | mãos: summarizar, extrair, dedupe, pré-cozinhar handoffs, compactar |
| Escreve | **único** escritor de estado irreversível (código, deploy, secrets, migrations = T3 floors) | **read-only** — *emitem eventos*, nunca mutam ficheiros partilhados |
| Confiança | confiável | cada output passa um **gate de groundedness** antes do arquitecto confiar |

Espelha o padrão "Explore corre em Haiku com Write/Edit negado" + a tua escada de tiers (T0 local → T3 floors).

## O Ledger (log-as-truth)
- **Journal JSONL append-only** = fonte de verdade **e** trilho de auditoria num só artefacto.
  Estende o `tools/router/handoff-journal.js` (o "Live Context Accumulator") que **já existe**.
- **Schema de evento** (um por acção de moo):
  `{ ts, sid, agent, model, tier, kind, cost_usd, input_hash, output_hash, idem_key, gate }`
  - `kind`: `handoff | compact | summary | extract | …`
  - **Proveniência MECÂNICA** — o *runner* carimba agent/model/tier/timestamp/hash; o LLM **nunca**
    escreve a sua própria proveniência (mata lineage alucinada).
  - `input_hash`/`output_hash` = SHA-256 sobre I/O canonicalizado → content-addressed + dedupe.
  - `idem_key` → trabalho de moo repetido nunca conta a dobrar.
- **git torna-o tamper-evident de graça** (cada entrada commitada, atribuída, timestamped, replayável).
- Propriedades que ganhas (ActiveGraph): **replay determinístico** de qualquer corrida, **fork barato**
  em qualquer evento, **lineage ponta-a-ponta** do objectivo → à chamada de moo exacta que produziu cada artefacto.

## Ciclo de vida de um masterprompt + Decision Records (a memória MAIS valiosa)

Um masterprompt corre em **4 fases** — e cada uma é um **evento de primeira-classe** no ledger:

| Fase | Evento | Captura | Como (mecânico) |
|---|---|---|---|
| 1 · Intent | `kind:intent` | o masterprompt colado (goal) + hash + fonte | o runner regista ao arrancar |
| 2 · Trabalho | `kind:turn` | snippet + tool-calls por turn | turn-end hook (já existe: `gsd-turn-end.js`) |
| 3 · **Decisão** | `kind:decision` | a **pergunta** do CC + opções + **resposta escolhida** + **quem respondeu** (humano / assistido-Cowork) + racional | o hook detecta o AskUserQuestion + a resposta seguinte no transcript → carimba mecanicamente; um moo escreve o racional de 1 linha |
| 4 · Outcome | `kind:outcome` | resultado final + handoff-summary da sessão (intent + TODAS as decisões + resultado) | um moo summariza no fim |

**Porque a Fase 3 é a jóia (e o que te faltava):** as escolhas vivem só no chat efémero — quando o
contexto limpa ou a sessão acaba, o **porquê desaparece**, e a próxima sessão **re-litiga decisões já
tomadas** (delírio ao nível da decisão). O Decision Record (estilo ADR) é o antídoto: a decisão fica
**imutável, atribuída, replayável**. Liga ao `decisions_v2.jsonl` que já existe. **Alinha com o
standard 2026** (EU AI Act "decision traces": logar input + decisão + racional + quem aprovou/overrode +
que contexto o revisor viu).

**Captura MECÂNICA, nunca alucinada:** o hook deriva pergunta/resposta do transcript que o host já
escreveu; o moo só acrescenta summary/racional — e passa pelo gate de groundedness antes de ser confiado.

## Identidade & Linhagem de sessão (o que mata a visibilidade do vibe coder)

O vibe coder perde-se no meta-operacional — e isso rouba criatividade. Cada sessão CC carrega
identidade, **carimbada no evento `intent`** ao arrancar:

| Campo | Responde a… |
|---|---|
| `project` | "que projecto o CC está a trabalhar" |
| `origin_chat` | "que chat do Cowork gerou este masterprompt" (ex.: *Overclock Moo F2*) |
| `task_group` | "que task" — liga as N sessões de uma mesma tarefa (ex.: as 4 frescas da auditoria) |
| `cc_title` | o título da sessão no VS Code — **carimbado pelo masterprompt** (o plugin CC aceita seed: `primaryEditor.open(session, prompt)` + deep-link `?prompt=` — confirmado na F3) |
| `deps` | "depende de merge/git/push?" — arestas que avisam ANTES de uma decisão perigosa |

**Mission Control = supervisor de relance:** agrupa por `task_group`, mostra estado de dependência
(🟢 independente · 🟡 espera merge/push · ⚠️ irreversível à frente), título estável e heartbeat dos
moos → o vibe coder **bate o olho e sabe exactamente o que fazer**, sem pensar em operacional.
Tudo isto sai de graça do ledger (são projecções), e o `intent` já é o portador natural.

## Projecções (derivadas — NUNCA editadas à mão por agentes concorrentes)

| Projecção | Para | Reconstruível? |
|---|---|---|
| Markdown (`_handoff/guardian/<sid>.md`, MEMORY.md, SYNC.md) | humanos / colar | sim, do log |
| SQLite / hub D1 (`wave_events`, `live_session_state`) | statusline + queries do cockpit + auditoria remota | sim |
| Notion (mooter MCP) | publicar / partilhar / vista exec | sim |
| Vault (Obsidian) | espelho de conhecimento pessoal | sim |

**Regra de concorrência (carga estrutural):** os moos **emitem eventos**; um **único reducer**
materializa cada projecção. N moos **nunca** mutam um ficheiro Markdown no sítio → zero races, sempre.

## O gate de groundedness
Cada artefacto de moo (handoff pré-cozinhado, summary de compactação) é pontuado por uma verificação
barata/determinística **antes** de o arquitecto o confiar/promover. Falha → assinalado no cockpit,
não usado em silêncio. (Evidência 2026: modelos baratos são fiáveis no mecânico mas alucinam sozinhos-sem-verificação.)

## Orquestração (disciplina de actor — à prova de bala)
- Cada moo = um **actor** com **mailbox limitada** (backpressure + load-shedding), tarefas
  **idempotentes**, **isolamento de falha** (um moo a crashar não toca nos outros) e **heartbeat**.
- **REGRA CARDINAL: nunca bloquear o arquitecto.** Os moos correm async/background; um moo parado ou
  falhado degrada para "sem artefacto pré-cozinhado" — o arquitecto gera-o ao vivo. **Nunca** trava.
- O runtime de orquestração (fila/estado) vive **fora do contexto do modelo** (script vars / file-bus),
  espelhando o padrão de fan-out do Claude Code.

## Sincronização BIDIRECCIONAL (CC ↔ moos) — comunicação é tudo

O handoff perfeito **não é só moo→CC**. O orquestrador TEM de briefar os operários, senão eles fazem
o tijolo errado contra um plano que já mudou. O Ledger já é o **blackboard partilhado** (ambos lêem e
escrevem → o substrato JÁ é bidireccional), mas faltava o canal **explícito CC→moos**. Padrão
confirmado (SOTA 2026): blackboard + **objecto de contexto tipado partilhado** que o orquestrador
empurra aos workers, passando só os campos relevantes (token-efficient). Blackboard bate RAG em
**13–57%** de sucesso de tarefa.

Adições (eram implícitas, agora primeira-classe):
- **Evento `brief` (CC→moos):** o arquitecto escreve o **contexto de trabalho actual** — goal, foco,
  últimas decisões, constraints/guardrails por papel. Os moos lêem-no e **alinham** o que pré-cozinham
  (handoffs relevantes à task ACTUAL, não genéricos).
- **Botão "🔄 Sync CC ↔ moos"** (Mission Control/Cockpit): handshake explícito — empacota o
  `intent`+`decision` actuais do CC no brief partilhado **E** mostra ao CC o último contexto
  pré-cozinhado pelos moos. Confirmação visível de que **ambos estão na mesma página**.
- **Guardrails por papel** no brief: CC = único escritor do irreversível; moos = read-only. Cada um
  executa só o que lhe compete.
- **Anti-stale:** se o `intent`/`decision` do CC mudar, os artefactos pré-cozinhados dos moos contra o
  plano antigo são **invalidados** → re-alinham. Nunca um moo a trabalhar contra um plano morto.

(Fase **L5** no roadmap do ledger; o substrato — blackboard — já existe, falta o canal explícito + o botão.)

## Cockpit + Mission Control = o supervisor
- **Heartbeat/saúde** por moo (vivo, último evento, profundidade da mailbox).
- **Promover / descartar** um artefacto pré-cozinhado (o arquitecto mantém o controlo).
- **Poupança** ($0 local vs cloud evitado) — já é a tua statusline.
- **Vista de auditoria**: replay do ledger — quem/que-modelo/quando produziu cada artefacto, com hashes.

## Mapeia no que o Mooter JÁ tem (reusar, não reinventar)

| Necessidade | Já existe |
|---|---|
| O log | `tools/router/handoff-journal.js` (JSONL append-only, bounded, roll atómico, never-throws) |
| Projecção de summary | `handoff-rollup.js` (qwen por cima do journal) |
| O bus | `handoff-bus.js`, `handoff-anchor.js`, file-bus `_handoff/` |
| Log de decisões | `decisions_v2.jsonl` + `decisions.log` |
| Espelho remoto auditável | hub `wave_events`, `transparency_events`, `live_session_state` |
| Aprende do log | Pastor (LoRA/distillation) |
| Publicar | Notion mooter MCP · sync do Vault |

## O que é NOVO (a contribuição SOTA)
1. Formalizar o journal como **O ledger de eventos com proveniência** (agent/model/tier/cost/hash/idem).
2. **Moos emitem eventos; um único reducer projecta** todas as superfícies (mata corrupção de escrita concorrente).
3. **Gate de groundedness** em cada artefacto de operário antes do arquitecto confiar.
4. **Backpressure de mailbox limitada (actor)** para um moo lento nunca travar o arquitecto.
5. **Vista de auditoria no cockpit** = replay determinístico do ledger.

## Fases
- **L0** — Schema de proveniência no journal existente (add agent/model/tier/cost/hash/idem_key/gate).
- **L1** — Reducer + projecções (MD/SQLite a partir do log) — **acaba** com escritas directas a MD.
- **L2** — Gate de groundedness.
- **L3** — Runtime de actor (mailbox/heartbeat/backpressure) para os moos.
- **L4** — Supervisor no cockpit + vista de auditoria (replay).

## Reframe do Guardian (importante)
O Guardian F2/F3 muda de "escrever `_handoff/guardian/<sid>.md`" para **"emitir um evento
`kind:handoff` no ledger"**; o `<sid>.md` passa a ser uma **projecção** do reducer. Assim o
pré-cozinhar de N moos em paralelo fica concorrência-seguro e auditável por construção.

## Fontes (SOTA 2026)
- The Log is the Agent (ActiveGraph) — arXiv 2605.21997
- Event Sourcing for Autonomous Agents (ESAA) — arXiv 2602.23193
- Anatomy of Agentic Memory — arXiv 2602.19320
- From Agent Traces to Trust (provenance) — arXiv 2606.04990
- Letta: Is a Filesystem All You Need? (74% vs 68.5%) — letta.com/blog/benchmarking-ai-agent-memory
- Claude Code subagents (Explore-on-Haiku, fan-out) — code.claude.com/docs/en/sub-agents
- Akka actor model for agentic AI (mailbox/supervision) — pradeepl.com
- Multi-agent orchestration patterns in production — beam.ai
