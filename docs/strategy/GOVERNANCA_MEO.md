# Governança MEO — a empresa de um, com organograma de verdade

**Data:** 2026-07-26 · **Autor:** Paulo (MEO) + Cowork (conselheiro)
**Estado:** doutrina proposta, ainda não implementada. Nada aqui é feature declarada.
**Alinhamento:** `docs/strategy/STRATEGY.md` (o motor é o fosso, a cabine é o produto).

> Este documento responde a 13 perguntas do Paulo sobre transformar o Mooter numa
> empresa que se toca sozinha. Começa pelo confronto, porque a ideia é boa o
> suficiente para merecer um advogado do diabo antes de merecer código.

---

## 0. O confronto — cinco maneiras de isto correr mal

Antes de desenhar o organograma, os riscos que ele traz. Cada um tem antídoto.

| # | Risco | Porque é real | Antídoto que adopto neste documento |
|---|---|---|---|
| 1 | **Teatro organizacional** | Um M-level que só escreve relatórios é custo com aparência de estrutura. A tua própria doutrina já apanhou isto: "change ≠ improvement" | **Teste de existência**: um M-level só existe se tiver (a) um KPI que ninguém mais mede, (b) um **veto** que ninguém mais pode exercer, (c) um orçamento próprio. Falha um → não nasce |
| 2 | **Imposto de coordenação** | 6 agentes a reportar geram 6 relatórios. Numa empresa, comunicação cresce em n(n−1)/2. Com 6 M-levels são 15 canais | **Hub-and-spoke rígido**: M-levels **não** falam entre si. Falam com o MEO através de um artefacto tipado. Zero canais laterais na v1 |
| 3 | **Custo** | Uma "reunião de conselho" com 6 agentes é 6 inferências para produzir texto que talvez ninguém leia | **O conselho é local ($0) por omissão.** Só sobe para nuvem quando há divergência entre M-levels ou um gate humano. Ver §6 |
| 4 | **Falsa autoridade** | Um agente chamado "MFO" a dizer "o custo está sob controlo" soa a facto e é opinião de um LLM sobre um JSON | **Todo o M-level responde com evidência ou `n/d`.** Um M-level nunca gera números: lê os que o motor mediu. É a doutrina do `n/d` aplicada ao organograma |
| 5 | **Deriva da tese** | O produto é a cabine (Resume·Plan·Route·Watch·Review). Um organograma pode virar um sexto produto que ninguém pediu | **A camada MEO não é um produto novo: é o Watch e o Review a ganharem estrutura.** Se um M-level não melhora uma das cinco experiências, não entra |

**Conclusão do confronto:** a ideia procede, mas invertida. Não é "criar um C-level de IA".
É **dar dono e veto a métricas que já existem e hoje não têm ninguém**. O organograma é a
consequência, não a causa.

---

## 1. Quem é quem — o M-level, com teste de existência aplicado

Nomenclatura: troca-se o **C** de *Chief* pelo **M** de **Mooter**. O `MOO` já existe no produto
(o motor local); os outros nascem à volta de métricas órfãs.

| Sigla | Cargo | KPI que ninguém mede hoje | Veto exclusivo | Passa no teste? |
|---|---|---|---|---|
| **MEO** | Mooter Executive Officer — **és tu, o Paulo** | Direcção e alocação de risco | Tudo o que é irreversível | — |
| **MOO** | Mooter Operating Officer (a GPU, o `moo`) | % de trabalho feito a $0, tok/s, fila | Recusar trabalho que não cabe no local | ✅ (já existe metade) |
| **MTO** | Mooter Technology Officer | Saúde do código: suites verdes, regressões apanhadas, dívida aberta | **Bloquear merge** | ✅ |
| **MFO** | Mooter Financial Officer | Custo por tarefa entregue, pressão de quota, cache-awareness | **Descer o tecto de tier** (já existe em `quota.js`) | ✅ |
| **MIO** | Mooter Intelligence Officer | Keep rate, satisfação inferida, qual motor acerta em quê | Reencaminhar categoria de tarefa | ✅ (a Onda 3 acabou de lhe dar dados) |
| **MRO** | Mooter Risk Officer | Segredos, deploys, migrações, acções irreversíveis | **Parar tudo** e escalar ao MEO | ✅ |
| **MCC** | Mooter Chief of Comms | Coerência entre docs canónicos e produto | Marcar um documento como "mente" | ⚠️ nasce em M2 — hoje é uma checagem, não um cargo |
| ~~MPO~~ | Product Officer | — | — | ❌ **Não nasce.** O produto é decisão do MEO. Um agente a decidir produto é a deriva nº 5 |

> **Nota de honestidade:** cinco destes já existem como funções dentro do código (quota calibra,
> localfirst veta, aprender recomenda, a4 guarda). O que este documento faz é **dar-lhes nome,
> voz e um sítio para reportar**. Isso é barato. Criar seis agentes novos seria caro e é o que
> não vamos fazer.

---

## 2. Qual é a melhor metodologia de interação C-level (e o que roubamos)

Não há uma "melhor"; há quatro escolas maduras. Traduzi cada uma para o Mooter e digo o que fica.

| Metodologia | Ideia central | O que serve ao Mooter | O que fica de fora |
|---|---|---|---|
| **EOS / Level-10 Meeting** (Wickman) | Reunião semanal de 90 min com agenda fixa: scorecard → rocks → issues (IDS: Identify, Discuss, Solve) | **O formato do conselho.** Scorecard primeiro, discussão só sobre o que está fora de faixa | O ritual social (check-in de 5 min, "headlines") |
| **Management by Exception** (clássico, Drucker/controlo de gestão) | O gestor só é chamado quando um indicador sai da faixa acordada | **É a resposta directa à tua pergunta nº 9.** O MEO só é acionado por excepção | Nada. É o coração do desenho |
| **High Output Management** (Grove/Intel) | Task-relevant maturity: quem já provou competência numa tarefa ganha autonomia nela | **A autonomia é por categoria e ganha-se com histórico** — que o `aprender.js` já mede | Reuniões 1:1 semanais (aqui são assíncronas) |
| **RAPID / DACI** (Bain / Atlassian) | Separar quem Recomenda, Aprova, Input, Decide, Executa | **Cada decisão carrega o seu papel.** Um M-level *recomenda*; o MEO *decide* o irreversível | A burocracia de mapear todas as decisões |
| **Amazon 6-pager + narrativa** | Nada de slides: um documento denso lido em silêncio antes de discutir | **O formato do relatório**: prosa densa com números e fontes, não bullets vazios | As 6 páginas. Aqui é 1 ecrã |

**A síntese que adopto — "Conselho por Excepção com Autonomia Ganha":**

1. O **scorecard** é gerado pelo motor, não escrito por agentes (EOS).
2. Só entra na agenda o que está **fora de faixa** (Management by Exception).
3. A **autonomia de cada M-level cresce com o histórico medido** dele (Grove + `aprender.js`).
4. Toda a recomendação diz **quem decide** (RAPID).
5. O relatório é **prosa curta com evidência**, nunca uma tabela de ticks verdes (Amazon + a lição
   do A4: "15/15 verdes escondiam execução arbitrária").

---

## 3. As perguntas que o MEO faz aos M-levels

Regra de ouro: **uma pergunta só é boa se a resposta puder ser `n/d`.** Perguntas que forçam uma
resposta bonita produzem mentiras educadas.

### 3.1 As cinco perguntas universais (a todo o M-level, em qualquer ritual)

| # | Pergunta | Porque é esta | Resposta inaceitável |
|---|---|---|---|
| 1 | **O que mudou desde a última vez, em números?** | Força delta, não estado | "Está tudo bem" |
| 2 | **O que é que tu sabes que eu não sei?** | Extrai o que não cabe no scorecard | "Nada de novo" sem ter olhado |
| 3 | **De que é que já não tens a certeza?** (crenças revistas) | Normaliza mudar de ideias — o oposto do agente que defende a decisão anterior | Silêncio |
| 4 | **O que precisas de mim que não é dinheiro?** | Descobre bloqueios de decisão, não de recurso | "Nada" quando há um gate humano parado |
| 5 | **Se eu desaparecer 30 dias, o que parte primeiro?** | Encontra a dependência do MEO — que é o que queremos reduzir | Uma lista genérica de riscos |

### 3.2 As perguntas próprias de cada cargo

| Cargo | Pergunta-âncora (é a razão de existir) | Perguntas de seguimento |
|---|---|---|
| **MOO** | Que fatia do trabalho desta semana foi feita a $0, e o que impediu o resto? | Quantos jobs a GPU recusou e porquê? Que modelo escolheste e que segundo lugar perdeu? A prep compensou, em segundos e tokens medidos? |
| **MTO** | O que está verde por não estar a ser testado? | Que teste é saltado em silêncio (falso-verde)? Que regressão apanhámos por acidente e não por desenho? Que ficheiro é tocado por todos e não tem dono? |
| **MFO** | Se a barra da app diz X%, o nosso número diz o quê — e qual está errado? | Qual é a fatia de releitura de cache? Quanto custou a tarefa entregue (não o token)? Que decisão nossa aumentou o custo sem melhorar o resultado? |
| **MIO** | Que decisão de routing mudou por causa de um resultado real? | Qual é o keep rate por motor e categoria? Onde é que o local ganha e nós não confiamos? Que categoria tem menos de 5 observações — e portanto opinião nenhuma? |
| **MRO** | O que correu esta semana que eu não autorizei e podia ter sido irreversível? | Que permissões declarámos e não cumprimos? Que job escreveu fora da worktree? Que segredo passou perto de um log? |
| **MCC** | Que documento canónico está a mentir hoje? | Quantos dias tem o `STRATEGY.md` de atraso face ao código? O que o repo não sabe que aconteceu no mercado? |

### 3.3 O que o MEO **não** deve perguntar

- "Está tudo bem?" — convite à mentira educada.
- "Achas que devemos...?" — o MEO decide; o M-level recomenda **com** opções e trade-offs.
- "Podes rever isso?" sem critério — revisão sem gate é ruído pago.

---

## 4. As perguntas que um M-level faz aos seus agentes

Um M-level nunca pede "faz o teu melhor". Pede **evidência, limites e alternativa**.

| # | Pergunta ao agente | O que impede |
|---|---|---|
| 1 | **Que ficheiros leste, e o que citaste sem ler?** | A fabricação (é o guard A4, transformado em pergunta) |
| 2 | **Que comando correste, e qual foi a saída literal?** | O relatório de ticks verdes |
| 3 | **O que farias diferente com metade do orçamento?** | O gasto por inércia |
| 4 | **Onde é que a tua resposta muda se eu te disser que estás errado?** | A confiança falsa (calibração) |
| 5 | **O que ficou por fazer, e porquê exactamente?** | O "concluído" que não concluiu |
| 6 | **Que parte disto podia ter sido feita a $0?** | O desperdício de tier |

> Repara que cinco destas seis já são invariantes do produto. O M-level é a **voz** de guards que
> já existem. É por isso que esta camada pode ser barata.

---

## 5. Rituais e cadência — o conselho que não interrompe

Quatro loops, com custo declarado. Nenhum interrompe o MEO por omissão.

| Ritual | Quando | Quem corre | Custo | Sai o quê |
|---|---|---|---|---|
| **Pulso** | A cada job que termina | motor (código, sem LLM) | **$0** | Actualiza o scorecard. Silencioso |
| **Turno** | Fim de cada bloco de trabalho | MOO local | **$0** | O bloco "o que aprendi" (já existe, Onda 3) + excepções abertas |
| **Conselho** | 1×/dia, ou ao 3º desvio | M-levels em paralelo, local | **$0**, sobe a Haiku/Sonnet só na divergência | **Uma página**: scorecard, 3 excepções, 1 decisão pedida ao MEO |
| **Revisão de estratégia** | Semanal, ou quando um gate abre | MEO + MCC + MTO | tier alto, **com o MEO presente** | Actualiza `STRATEGY.md`/`SYNC.md` e fecha ou reabre ondas |

**A cadência voltada a performance de vibe coding** — as métricas do conselho são as que a
indústria já provou (DORA) mais as duas que o Cursor tornou padrão, todas já ao nosso alcance:

| Métrica | Origem | Onde já a temos |
|---|---|---|
| Frequência de entrega | DORA | ledger: jobs `done`/dia |
| Lead time até resultado útil | DORA | `dispatched` → primeiro token útil |
| Taxa de falha de mudança | DORA | `failed` + regressões apanhadas |
| Tempo de recuperação | DORA | tempo até suite voltar a verde |
| **Keep rate** | Cursor | `aprender.js` (hoje `n/d` até haver jobs de escrita medíveis) |
| **Custo por tarefa entregue** | Cursor | `aprender.js` — US$ 0,4826 medidos em 45 jobs |
| WIP | Kanban | 3–5 (o teu próprio limite) |

---

## 6. Sessão do Cowork como MEO, e uma sessão por M-level

**Resposta curta:** sim, e é a arquitectura certa — mas **não** por sessões a falarem umas com as
outras. Por um **barramento de ficheiros** que já existe: o ledger e o `SYNC.md`.

### 6.1 Porque não sessões a conversar

Sessões de Cowork não se vêem umas às outras. Qualquer desenho que dependa disso é ficção.
O que existe e funciona: **todas escrevem e lêem o mesmo disco**. Um agente que escreve um evento
tipado no ledger está a "reportar", e o MEO lê. É assíncrono, auditável e custa zero.

### 6.2 O desenho

```
   ┌──────────────────────── SESSÃO MEO (Cowork) ─────────────────────────┐
   │  lê: scorecard.json · excepções abertas · decisões pendentes         │
   │  escreve: decisões, prioridades, gates                               │
   └───────▲─────────▲──────────▲──────────▲──────────▲──────────▲────────┘
           │         │          │          │          │          │
      (só excepções, nunca o fluxo todo — hub-and-spoke, sem canais laterais)
           │         │          │          │          │          │
   ┌───────┴──┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐
   │ MOO      │ │ MTO    │ │ MFO    │ │ MIO    │ │ MRO    │ │ MCC    │
   │ sessão   │ │ sessão │ │ sessão │ │ sessão │ │ sessão │ │ sessão │
   └────┬─────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
        └───────────┴──────────┴──────────┴──────────┴──────────┘
                                   │
                    ledger.jsonl + scorecard.json + boardroom/
                        (o barramento: ficheiros, $0, auditável)
```

Cada sessão de M-level abre com uma skill própria (`/meo-mfo`, `/meo-mto`, …) que:
1. lê **só a sua fatia** do scorecard (contexto pequeno = barato e rápido);
2. responde às perguntas-âncora do §3.2 com evidência ou `n/d`;
3. escreve **um** artefacto tipado em `_boardroom/<cargo>-<data>.json`;
4. abre uma **excepção** se e só se um limiar for cruzado.

O MEO nunca lê os seis artefactos: lê o **scorecard consolidado** e a lista de excepções. Essa é a
diferença entre um conselho e uma caixa de entrada.

### 6.3 "Na sequência perfeita"

Não há relógio partilhado entre sessões, mas há **ordem causal**: cada artefacto traz
`gerado_em`, `ledger_offset` (até que evento leu) e `hash_do_scorecard`. O MEO consolida por
`ledger_offset`, não por hora de chegada. É assim que sistemas distribuídos resolvem isto — e
poupa-nos a fingir que temos sincronia.

---

## 7. Como o MEO é acionado o mínimo possível

Este é o ponto mais importante da tua lista, e tem resposta de engenharia, não de estilo.

**Regra:** o MEO é chamado por **três motivos, e mais nenhum**.

| Gatilho | Exemplo | Porque exige um humano |
|---|---|---|
| **Irreversível** | push/merge, deploy, apagar, gastar dinheiro, publicar | Custo de erro assimétrico |
| **Divergência entre M-levels** | MFO diz "desce para local", MTO diz "esta categoria falha no local" | Duas autoridades legítimas em conflito |
| **Limiar cruzado** | pressão de quota >0,85; keep rate <50% em 10 jobs; 2 regressões seguidas | O sistema perdeu a faixa onde é autónomo |

**Tudo o resto o M-level decide e regista.** E a autonomia é **ganha, por categoria**:

| Nível | Condição (medida no ledger) | O que pode fazer sozinho |
|---|---|---|
| L0 — pergunta sempre | <5 observações na categoria | Recomenda, não executa |
| L1 — executa e avisa | ≥5 obs, sucesso ≥60% | Executa leitura/análise, regista |
| L2 — executa em silêncio | ≥20 obs, sucesso ≥80%, zero incidentes de risco | Executa e só reporta no scorecard |
| L3 — propõe mudança de regra | ≥50 obs, ganho medido | Pode propor alterar limiares (o MEO decide) |

Um incidente de risco **desce um nível imediatamente**. Isto é `task-relevant maturity` do Grove,
com o histórico a substituir a percepção do chefe.

**O orçamento como coleira:** cada M-level tem tecto diário de tokens pagos. Quando estoura,
continua a trabalhar **em local** e escreve no scorecard "estourei o orçamento às 14h". Não pede
autorização — informa. Isso é uma decisão de desenho: **o silêncio é o estado normal do sistema
saudável.**

---

## 8. Multi-device e somar GPUs — o que é verdade hoje

Aqui a resposta honesta separa duas coisas que parecem uma.

### 8.1 Sessão do Cowork em vários dispositivos — o que a Anthropic diz

- Desde **7 de Julho de 2026** o Cowork saiu do desktop: está em beta na web (claude.ai) e em
  iOS/Android, começando pelos planos Max. As **sessões remotas correm nos servidores da
  Anthropic**, e conversas e projectos seguem-te entre dispositivos.
- No **desktop**, duas instâncias em duas máquinas funcionam, mas **independentes**: começar uma
  tarefa num PC e continuá-la noutro **não** é suportado como sessão contínua. Conversas, projectos,
  memória e definições sincronizam; a *execução* não.

**Tradução para o teu desejo:** partilhar *contexto* entre dispositivos — sim, já hoje. Partilhar
uma *sessão de execução* — não, e não é algo que possamos "destravar" do nosso lado.

### 8.2 Somar poder de processamento — isso não vem do Cowork, vem de nós

E esta é a boa notícia: **somar GPUs nunca foi um problema do Cowork.** O Cowork é a cabine; a
frota é nossa. O que falta é um **mesh de motores locais** com:

| Peça | O que faz | Estado |
|---|---|---|
| Registo de nós | cada máquina publica GPU, VRAM livre, modelos instalados, latência | ❌ existe só para a máquina local |
| Fila com afinidade | manda o job para o nó com o modelo já quente (evita 18 GB de recarga) | ❌ hoje a fila é local |
| Barramento partilhado | ledger sincronizado entre nós (ficheiro em pasta partilhada, ou um endpoint) | 🟡 o ledger existe; falta o transporte |
| Identidade e confiança | um nó só aceita jobs assinados | ❌ |

Com isto, dois PCs + um portátil somam-se de verdade, **e nenhum dos passos depende da Anthropic**.
É engenharia nossa e encaixa no fosso: ninguém no mercado vende "a tua frota de GPUs domésticas
como tier de primeira".

> ⚠️ Confronto: isto é uma onda inteira (semanas), e o ganho só aparece se houver **fila cheia**.
> Hoje o teu gargalo não é GPU — é decisão e verificação. Proponho: **M3, depois do resto.**

---

## 9. O que o conector pode fazer e ainda não faz

Aqui há dinheiro em cima da mesa. O protocolo MCP tem seis capacidades; nós usamos duas e meia.

| Capacidade | O que é | Usamos? | O que destrava no Mooter |
|---|---|---|---|
| **Tools** | funções que o modelo chama | ✅ (6 portas) | — |
| **Resources** | conteúdo que o cliente lê directamente (ficheiros, snapshots) | ❌ | O scorecard e o `PROJECT_CONTEXT.json` como **recursos**: o MEO lê sem gastar uma tool call |
| **Prompts** | prompts nomeados, reutilizáveis, expostos pelo servidor | ❌ | Os rituais viram prompts oficiais: `/conselho`, `/mfo`, `/mto` — sem skills espalhadas |
| **Elicitation** | o servidor **pausa e pergunta ao utilizador** a meio de uma chamada | ❌ | **O onboarding dentro do Cowork**, sem sair para o terminal — responde directamente à tua pergunta |
| **Sampling** | o servidor pede ao **cliente** para inferir; sem API key, sem custo próprio do servidor | ❌ | **Enorme:** os M-levels podiam raciocinar usando a tua sessão, em vez de um motor separado |
| **Roots** | o cliente declara ao servidor que pastas são o âmbito | ❌ | Mata o bug do bind perdido (`P / tmp`) de raiz |

### ✅ MEDIDO — a sonda M0 correu no cliente real (2026-07-27 02:43)

Fonte: `~/.mooter/mcp-capabilities.json`. Cliente `local-agent-mode-Mooter` 1.0.0, protocolo
`2025-11-25`.

| Capacidade | Estado medido | Como se soube |
|---|---|---|
| **roots** | ✅ **suportado** — o cliente respondeu a `roots/list` com **9 roots** (inclui `frugal` e `paulo-vault`) | resposta real a `roots/list` |
| resources | `n/d` | não declarado em `initialize.params.capabilities` — ausência não prova falta de suporte |
| prompts | `n/d` | idem |
| elicitation | `n/d` | idem — logo, **o onboarding por elicitation continua por provar** |
| sampling | `n/d` | idem |
| logging | `n/d` | idem |

**O que isto muda, já:** o bind de projecto deixa de depender de um ficheiro escrito à mão — as
**roots são a fonte de âmbito** e o cliente dá-as de graça. É a correcção de raiz do bug do
`P / tmp`. Quanto ao onboarding dentro do Cowork: fica o plano B (painel de setup no MCP Apps),
porque `elicitation` não está declarado e nós não construímos sobre suposições.

**Ressalvas honestas:** `elicitation` e `sampling` dependem do **cliente** as suportar. Se o Claude
Desktop/Cowork as suporta hoje, e em que versão, é **`n/d` — tem de ser testado**, não assumido.
Além disso, a especificação está a mudar: uma versão recente substitui as chamadas iniciadas pelo
servidor por um mecanismo de múltiplas voltas (`InputRequiredResult` + `requestState`). Portanto:
**testar primeiro, desenhar depois** — e escrever o resultado do teste no repo, como fizemos com o
Live Preview (`ui-probe.json`, 5 ms medidos, e por isso sabemos em vez de achar).

**Onboarding dentro do Cowork:** com `elicitation` (ou com o mecanismo novo), o `mooter_setup`
pergunta o que falta — pasta do projecto, host do Ollama, referência de quota — dentro da própria
conversa. Sem isso, há um plano B honesto e barato: um **painel de setup** no MCP Apps (que já
usamos para o Live Preview) com campos e um botão. Não é tão elegante, mas é certo que funciona.

---

## 10. Conector, plugin ou skill — não é escolha, é camada

O mercado já arrumou os nomes, e a arrumação é útil:

- **Skill** = conhecimento (as jogadas).
- **Connector (MCP)** = acesso (as mãos), com OAuth e permissões.
- **Plugin** = **embalagem**: leva skills, configuração de MCP, hooks, agentes e comandos num só
  instalável, distribuído por um marketplace.

| Critério | Só conector (hoje) | Plugin no marketplace |
|---|---|---|
| Instalação | ficheiro `.mcpb` que tu geras e instalas | um comando, e actualiza sozinho |
| O que leva | o servidor | servidor **+ skills + comandos + agentes M-level** |
| Descoberta | nenhuma | listagem pública, estrelas, ranking |
| Custo | $0 | $0 (é distribuição, não infra) |
| Proposta de valor | "instala este binário" | "instala a empresa" |

**Decisão recomendada:** manter o conector como motor e **empacotar tudo num plugin** — é aí que
as skills `/conselho`, `/mfo`, `/mto` vivem, e é a única forma de alguém encontrar o Mooter sem te
conhecer. O plugin é a porta; o conector é o motor atrás dela. Não são alternativas.

---

## 11. Repos e skills oficiais — como isto vira o repo mais estrelado do segmento

Factos de hoje, e são melhores do que esperávamos:

| Repo | O que é | Porque nos interessa |
|---|---|---|
| `anthropics/skills` | repositório público de Agent Skills, ~135 mil estrelas | É a **prova social** do formato. As nossas skills devem falar exactamente esta língua |
| `anthropics/claude-plugins-official` | directório oficial de plugins de qualidade, mantido pela Anthropic | **É aqui que queremos estar listados.** Não é vaidade: é distribuição |
| `anthropics/knowledge-work-plugins` | 11 plugins para trabalho de conhecimento no Cowork | Mostra o padrão que a Anthropic considera bom para **Cowork**, que é a nossa cabine |

**Como alimentamos o Mooter com isto** (e sem copiar o que não é nosso): os repos oficiais são a
**gramática** — estrutura de skill, formato de plugin, convenções de marketplace. O nosso conteúdo
continua a ser o que só nós temos: router determinístico, quota de subscrição, GPU como tier de
primeira, verificação cruzada.

**O caminho para as estrelas, sem ilusões:** um repo cresce por ser *útil sem o autor*. Três coisas
compram isso — instalação num comando (plugin), um `README` que mostra um número medido nos
primeiros 30 segundos ("2,44× de inflação de quota apanhada nesta máquina"), e uma demonstração que
corre sem chaves de API. As estrelas são consequência; a métrica honesta é **quantas pessoas
instalam e voltam na semana seguinte**.

---

## 12. Isto está em linha com a estratégia?

| Peça | Alinha? | Justificação |
|---|---|---|
| MEO + M-level | ✅ | É a cabine a ganhar estrutura: **Watch** (scorecard) e **Review** (conselho) |
| Conselho a $0 por omissão | ✅ | O motor é o fosso — a governança corre na GPU do utilizador |
| Autonomia ganha por histórico | ✅ | Consome directamente o `aprender.js` da Onda 3 |
| Plugin + marketplace | ✅ | Distribuição, que é o buraco actual |
| MCP: resources/prompts/roots | ✅ | Melhora Resume e Route sem tocar no motor |
| Sampling para os M-levels | ⚠️ | Alinha **se** o cliente suportar — testar antes de prometer |
| Mesh multi-GPU | ⚠️ | Alinha com o fosso, mas o gargalo hoje não é GPU. **Fica para M3** |
| Um "MPO" a decidir produto | ❌ | Contraria a tese: o produto é decisão do MEO |

**Uma coisa que mudo na estratégia por causa desta conversa:** o `STRATEGY.md` fala em cinco
experiências. Falta lá a sexta, que é o que tu estás realmente a pedir: **Delegar** — dar trabalho
a quem não precisa de ser vigiado. Proponho acrescentá-la, porque sem ela o MEO é só um painel
mais bonito.

---

## 13. O que fica por saber (e como se descobre)

| Pergunta em aberto | Como se responde | Custo |
|---|---|---|
| O Cowork suporta `elicitation`/`sampling`? | sonda no conector que tenta e regista o resultado, como o `ui-probe.json` | 1 job |
| Quantos tokens custa um Conselho real? | correr um em local e medir | 1 job |
| O scorecard reduz mesmo as interrupções? | contar quantas vezes o MEO foi chamado por semana, antes e depois | 2 semanas |
| Um plugin no marketplace traz instalações? | publicar e medir instalações/retorno | 1 release |

---

## Fontes

- [Claude Cowork na web e mobile, sessões remotas e sincronização entre dispositivos (2026)](https://www.buycheapai.com/en/blog/42-claude-cowork-web/)
- [Guia de rollout do Cowork web/mobile](https://www.digitalapplied.com/blog/claude-cowork-web-mobile-expansion-guide-2026)
- [Usar o Claude em 2 PCs — limitações do Cowork](https://www.clauder-navi.com/en/claude-pc2)
- [Skills vs MCP vs Connectors vs Plugins](https://devtoolpicks.com/blog/claude-skills-vs-mcp-connectors-vs-plugins-2026)
- [Comparação Plugins vs MCP vs Skills](https://systemprompt.io/guides/claude-plugins-vs-mcp-vs-skills)
- [anthropics/skills](https://github.com/anthropics/skills) · [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)
- [Funcionalidades MCP: tools, resources, prompts, sampling, roots, elicitation](https://workos.com/blog/mcp-features-guide)
- [Especificação MCP 2026-07-28 — o que muda](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
