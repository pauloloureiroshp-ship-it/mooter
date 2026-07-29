# Os pilares do vibe coding, e o que o Mooter tem de fazer por ti
**Data:** 2026-07-27 · **Conector:** v1.19.0 · **Base:** bateria multi-LLM real corrida hoje
**Tese:** o utilizador não deve ter de estudar vibe coding. O Mooter aplica as práticas por ele.

---

## 0. A bateria que motivou este documento

Mesma pergunta factual, quatro motores, respostas **verificáveis** contra o ficheiro
(`localfirst.js`: 6 regras em `SO_NUVEM`, `CONTEXTO_MAX_LOCAL_CHARS = 18000`, campo
`forcado_por_quota`).

| Motor | Modelo | Resposta | Acerto | Tempo | Custo |
|---|---|---|---|---:|---:|
| **moo** | qwen2.5-coder:14b | `6 · 18000 · forcado_por_quota` | **3/3** | **7 s** | **$0** |
| **codex** | default CLI | `6 · 18000 · forcado_por_quota` | **3/3** | 69 s | n/d |
| **cc** | claude-sonnet-5 | `n/d · n/d · n/d` + explicou que o ficheiro não existe naquela worktree | **n/d honesto** | 40 s | **$0,44** |
| **gemini** | default CLI | (vazio, exit 1) | ❌ falhou | 6 s | n/d |

**Três conclusões que mudam o produto:**

1. **A GPU local ganhou.** Mesma resposta certa, **10× mais rápido que o Codex e $0,44 mais barato
   que o Sonnet.** Não é "quase tão bom": foi melhor nas três dimensões.
2. **O `cc` comportou-se de forma exemplar e ainda assim custou dinheiro.** Estava numa worktree
   antiga sem o ficheiro; **disse `n/d` em vez de inventar** — comportamento perfeito — mas custou
   **$0,44 para dizer "não sei"**. O erro não foi dele: foi meu, ao mandá-lo para a pasta errada.
3. **O Gemini falha em silêncio** (exit 1, saída vazia), confirmando o registo de 2026-07-24.

> **Bug encontrado pela própria bateria:** o Codex foi automaticamente relocalizado ("a pasta pedida
> não tem packages/mooter-bridge/localfirst.js") e o `cc` **não foi**. A mesma protecção existe para
> um motor e não para outro. Custou $0,44 real. → entra no backlog como bug de honestidade.

---

## 1. Os oito pilares — e quem os faz hoje

O consenso de 2026 é claro: a era do "vibe coding" puro acabou e entrámos na **engenharia agêntica**
— orquestrar agentes contra especificações detalhadas, com supervisão humana. O próprio Karpathy,
que cunhou o termo, disse-o. As equipas que ganham **exploram com vibe coding e entregam com
context engineering**, e quem estrutura o contexto (specs, regras do projecto, ficheiros, exemplos)
reporta 40-60% mais velocidade do que quem faz prompting livre.

| # | Pilar | O que é, na prática | Estado no Mooter |
|---|---|---|---|
| 1 | **Fundação do projecto** | Ficheiro de regras que o agente lê sempre (`CLAUDE.md`/`AGENTS.md`), estrutura, comandos de teste | 🟡 `fosso.js` faz o mapa; falta **gerar** a fundação em projectos novos |
| 2 | **Context engineering** | Dar ao agente só o que interessa, no tamanho certo | ✅ `context.js` + `num_ctx` real + truncagem declarada |
| 3 | **Spec antes de código** | Objectivo, restrições e critério de aceitação escritos antes | 🟡 os masterprompts fazem-no à mão; falta **template** |
| 4 | **Verificação em camadas** | Testes, guards, revisão — nunca "confia e segue" | ✅ A4, guards, runner nativo, verificação cruzada |
| 5 | **Orquestração multi-motor** | Escolher o motor mínimo viável e saber quando trocar | ✅ é o motor do produto |
| 6 | **Memória e retoma** | A sessão seguinte nasce informada, não arrasta tudo | ✅ `sessao.js`, SYNC.md, vault |
| 7 | **Custo consciente** | Saber o que se gasta e descer sozinho | ✅ quota, tecto, calibragem |
| 8 | **Loop de aprendizagem** | O resultado de hoje muda a decisão de amanhã | 🟡 `aprender.js` existe; falta correr por si |

**O que falta é sempre a mesma coisa: as práticas existem no produto, mas o utilizador tem de as
invocar.** O salto seguinte é o Mooter **aplicá-las sem lhe perguntar**.

---

## 2. O benchmark do mercado — contra o que nos medimos

Números públicos de Julho de 2026 (Terminal-Bench 2.1 e SWE-bench Pro):

| Sistema | Terminal-Bench 2.1 | SWE-bench Pro |
|---|---:|---:|
| Codex CLI + GPT-5.5 | **83,4%** | — |
| Claude Code + Fable 5 | 83,1% | **80,3%** |
| Claude Code + Opus 4.8 | 78,9% | — |

⚠️ **A armadilha:** estes benchmarks medem *o motor*, e nós **não somos um motor** — somos o
roteador e a cabine. Copiar a métrica seria comparar-nos na dimensão errada e perder sempre.

**A métrica em que somos únicos** é a que ninguém publica: **custo e latência POR TAREFA RESOLVIDA,
com a fatia feita a $0**. Na bateria de hoje: o local resolveu ao mesmo nível de acerto por **$0 e
7 s**, contra **$0,44 e 40 s**. É esta a régua que nos favorece — e é honesta, porque mede o que o
utilizador sente na carteira e no relógio.

---

## 3. O que medir por utilizador — a proposta

Quatro camadas. Tudo local, tudo no disco do utilizador, nada sai da máquina.

### Camada 1 — Por interacção (já existe, e é o alicerce)
`ttft_ms` · duração · tokens in/out · custo · `desfecho` · `local_decisao{porque}` ·
`modelo_porque` · `contexto_truncado` · `permissoes_pedidas` vs `efectivas`.

### Camada 2 — Por tarefa entregue (parcialmente)
Acerto (quando verificável), keep rate, retomas necessárias, custo total até à entrega,
**quantos motores foram precisos**. ⚠️ Falta: registar quando uma tarefa exigiu 2ª tentativa.

### Camada 3 — Por sessão (falta quase toda)
Interrupções ao MEO · fatia de releitura de cache (hoje **53,8%** e a subir) · tempo até ao
primeiro resultado útil · **quantas vezes o utilizador reformulou o pedido** (sinal de contexto mal
dado, e é a métrica mais subestimada de todas).

### Camada 4 — Por perfil do utilizador (não existe — é a que dá o self-learning)
| Métrica | Porque interessa |
|---|---|
| Categorias em que **este** utilizador trabalha | O routing devia adaptar-se à pessoa, não à média |
| Onde ele aceita local e onde rejeita | Preferência revelada, não declarada |
| Hora do dia × tipo de tarefa | Prever a carga e pré-aquecer o modelo certo |
| Tolerância a espera por tipo de tarefa | 40 s numa auditoria é aceitável; num resumo não |
| Vocabulário próprio | "revisa" vs "audita" — o classificador devia aprender o dialecto dele |

---

## 4. Os loops de self-learning — cadência e o que cada um decide

| Loop | Cadência | Custo | O que decide sozinho |
|---|---|---|---|
| **Pulso** | cada job | $0, sem LLM | actualiza estatísticas; nada decide |
| **Recalibragem** | a cada 20 jobs numa categoria | $0 | muda o motor preferido dessa categoria (já existe: `recomendarAgente`, ≥5 obs) |
| **Sentinela** | **de hora a hora** | $0 | corre o scorecard; se uma métrica sair da faixa, abre excepção com dono. **Não interrompe** — só escreve |
| **Conselho** | 1×/dia ou ao 3.º desvio | $0 local | consolida excepções; no máximo 1 decisão para o MEO |
| **Aferição** | semanal | 1 job pago | corre a bateria de tarefas verificáveis (como a de hoje) e mede **acerto × custo × tempo por motor**. É o nosso benchmark interno |
| **Radar** | trimestral | pesquisa | compara com o mercado e actualiza `RADAR_CONCORRENCIA.md` |

> **A Sentinela é o que o Paulo pediu como "loop de hora a hora".** Nota de desenho importante:
> ela **regista**, não avisa. Um alarme de hora a hora seria a maneira mais rápida de destruir a
> confiança no painel. O aviso é do Conselho, uma vez por dia.

**A Aferição é a peça que nos falta e que nenhum concorrente tem:** um conjunto de tarefas com
resposta conhecida, corrido periodicamente contra todos os motores disponíveis, que responde à
pergunta que interessa — *para o meu tipo de trabalho, o que é que cada motor me custa por resposta
certa?* Não é o SWE-bench: é o **teu** bench.

---

## 5. O que roubar de cada concorrente

| Fonte | O que copiamos | O que fazemos melhor |
|---|---|---|
| **Cursor** | keep rate, custo por commit, cache-awareness | eles medem-se a si; nós medimos **todos os motores**, incluindo os locais |
| **Terminal-Bench / SWE-bench** | o rigor de ter resposta verificável | tarefas **do teu repo**, não de um dataset público |
| **Jellyfish / Worklytics** | AI share of committed code, taxa de aceitação | eles vendem vigilância a chefes; **nós devolvemos os dados ao próprio dev**, na máquina dele |
| **Spec-driven development** | spec antes do código, com critério de aceitação | gerar a spec a partir do objectivo em linguagem normal |
| **anthropics/skills** (~135k ⭐) | a gramática do formato | conteúdo que só nós temos: router, quota, GPU |

⚠️ **Limite conhecido, e vale para nós:** o próprio Cursor admite que a telemetria subestima —
código copiado do chat ou modificado antes de aceitar não é registado. Qualquer keep rate nosso
tem a mesma cegueira, e tem de o dizer.

---

## 6. O que proponho construir a seguir, por ordem

1. **Sentinela horária** ($0) — o loop que o Paulo pediu. Escreve, não grita.
2. **Aferição semanal** — a bateria de hoje, versionada e repetível. Passa a haver um número
   próprio para "o Mooter está acima do benchmark?".
3. **Fundação automática** — em projecto sem `CLAUDE.md`/`AGENTS.md`, o Mooter propõe um, gerado a
   partir do que leu do repo. É o pilar 1, o único que ainda é 100% manual.
4. **Perfil do utilizador** (camada 4) — o que transforma "um router" em "o teu router".
5. **Corrigir o bug apanhado hoje:** o relocate por ficheiro-em-falta tem de valer para todos os
   motores, não só para o Codex. Custou $0,44 nesta bateria.

---

## Fontes
- [Vibe coding vs spec-driven development (2026)](https://www.augmentcode.com/guides/vibe-coding-vs-spec-driven-development) · [Guia SDD 2026](https://thebcms.com/blog/spec-driven-development)
- [Context engineering para coding](https://solguruz.com/blog/context-engineering-for-coding-and-vibe-coding/)
- [Leaderboard SWE-bench / Terminal-Bench / LiveCodeBench](https://awesomeagents.ai/leaderboards/coding-benchmarks-leaderboard/) · [SWE-bench Pro 2026](https://codingfleet.com/blog/swe-bench-pro-leaderboard-2026/)
- [Cursor AI monitoring (Jellyfish)](https://jellyfish.co/library/cursor-ai-monitoring/) · [Code-level AI observability 2026](https://blog.exceeds.ai/code-level-ai-observability-2026/)
