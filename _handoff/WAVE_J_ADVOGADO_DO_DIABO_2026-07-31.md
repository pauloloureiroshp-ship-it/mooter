# WAVE J · ADVOGADO DO DIABO — as 15 perguntas, medidas

**Gerado:** 2026-07-31 · Cowork (Opus 5) · conector v1.29.1
**Terceiro de:** `WAVE_J_DIAGNOSTICO` → `WAVE_J_BATERIA_E_PLANO` → este
**Regra:** cada resposta tem prova. Onde não medi, digo "não medido".

---

## VEREDICTO DE ABERTURA

Duas coisas mudaram com estas medições:

**1. A causa-raiz de metade dos loop holes é a mesma, e é física.**
O `qwen3.6:27b` ocupa **16,2 GB** de uma RTX 4090 e fica residente (`keep_alive` 10m).
Sobram **1 653 MB**. A folga mínima exigida é 2,2 GB. Logo: **nada mais cabe na GPU.**
Isso explica de uma vez o `prep_timeout` (3× 20 s hoje, sempre exactamente 43 caracteres),
o `cross_check` morto (pede 22,3 GB), e o downgrade forçado (`qwen2.5-coder:14b precisa de
8,4 GB, mas só há 1 663 MB livres`). **A doutrina "GPU no talo" está a estrangular-se a si própria.**

**2. O problema de custo não está onde procurámos.**
Medi o bloco de contexto automático do conector: **tecto ~6 300 tokens**, com truncagem por linha
inteira e aviso honesto. Está bem desenhado. O desperdício está noutro sítio, e é de outra ordem:

| Onde | Tamanho medido |
|---|---|
| Bloco automático do conector | ~6 300 tokens (tecto) |
| `CLAUDE.md` + `AGENTS.md` (auto-import por sessão) | ~5 079 tokens |
| **`SYNC.md`** | **387 695 B ≈ 96 924 tokens** |
| `.md` de topo em `_handoff/` (216 ficheiros) | ≈ 479 290 tokens |

E o `AGENTS.md:212` diz, por escrito: *"Snapshot, not a log. Current state + last few sessions only
(**~200 lines**)"* e `:225` *"`SYNC.md` > ~200 lines ⇒ roll history into the archive file"*.
**O SYNC.md tem 3 438 linhas — 17,2× a regra que nós próprios escrevemos.**

---

## AS 15 PERGUNTAS

### 1. Os ficheiros estão na estrutura adequada para maior performance?

**NÃO — e a regra existe, está escrita, e é ignorada em 4 pontos simultâneos.**

| Regra escrita | Onde | Estado real |
|---|---|---|
| SYNC.md ≤ ~200 linhas | `AGENTS.md:212,225` | **3 438 linhas** |
| `_handoff/` é efémero; arquivar ao shipar; *"Never leave executed masterprompts at top level"* | `AGENTS.md:209` | **216 `.md` no topo**, 34 MB, 672 ficheiros |
| Sem novos `.md` na raiz | `CLAUDE.md` | 21 `.md` na raiz (~167 881 tokens) |
| Consolidar specs duplicadas | `AGENTS.md` | 40 ficheiros "MASTER", 25 "AUDIT", 11 só da wave G3/H |

**Advogado do diabo — o que ninguém perguntou:**

- **`.mooter/worktrees/onda54-bugs-da856bf-snapshot/` contém uma cópia byte-a-byte de `docs/` e
  `packages/`.** Todo `grep`/`glob` que um agente faça devolve **resultados a dobrar**. Isto não é
  desarrumação: é um multiplicador silencioso de tokens e uma fonte de ambiguidade — o agente pode
  editar a cópia.
- **`SYNC_ARCHIVE_2026.md` está 99,1% contido em `SYNC_ARCHIVE_2026H1.md`** (3 030 de 3 058 linhas
  idênticas). ~92k tokens de redundância pura.
- **A raiz tem 103 ficheiros**, dos quais **60 são `RUN-*.bat` descartáveis de waves antigas**. A
  invariante do CLAUDE.md só cobre `.md` — os `.bat`, 5 PDFs, 2 PPTX e um `.tar.gz` não têm regra.
- **Lixo literal**: existe um ficheiro chamado `1.29` (0 bytes) e outro cujo *nome* é um path Windows
  completo (`C:\Users\...\gh-open-prs-py.log`).
- **O `CLAUDE.md.template` (18 384 B) é 3,8× maior que o `CLAUDE.md` real (4 844 B).**

**O que esqueceste:** a regra não falha por ser má — falha por **não ter enforcement**. Não há CI que
recuse um PR com SYNC.md > 200 linhas ou com masterprompts no topo de `_handoff/`. Escrever a regra
outra vez não muda nada; um teste que falha, sim.

---

### 2. Temos as skills e automações do Mooter para maior performance?

**PARCIAL — 5 skills existem, 2 mentem sobre o produto, 1 não toca no conector.**

| Skill | Depende de algo real? | Problema medido |
|---|---|---|
| `mooter-first` | ✅ tudo existe | — |
| `mooter-atualizar` | ✅ tudo existe | — |
| `mooter-model` | ⚠️ parcial | `mix`, `auto`, `status` **não são parâmetros do conector** — são comportamento do assistente. **`fable`/`@fable` não existe em `tools6.js` nem `seamless.js`** — mas o `CLAUDE.md` tem "T5 opt-in via `@fable`" na tabela de tiers |
| `mooter-resume` | ⚠️ **contradiz o código** | A skill diz *"estado escrito pela GPU local a $0"*. `sessao.js:38-42` diz que quem escreve é **o assistente do host**, e que a GPU não participa |
| `sync-project` | ❌ | **Não invoca uma única tool do Mooter.** É manipulação de markdown com caminhos hardcoded |

**Advogado do diabo:**

- **`sessao.js` só tem UM slot de estado.** O handler lê `a.id`, mas `id` **não está no schema** e
  `additionalProperties:false` — logo é sempre `'actual'`. **`sessao: "listar"` nunca poderá devolver
  mais do que uma entrada.** Isto mata sozinho as perguntas 7 e 10 (multi-sessão, multi-projeto).
- **Automações agendadas: 1 activa** (`fecho-do-dia-mooter`), **1 desligada há 25 dias**
  (`cowork-loop-evaluator` — o governador HOTL).

**O que esqueceste:** não perguntaste se as skills **carregam** custo. Cada skill listada consome
descrição no contexto de toda a sessão. 5 skills do Mooter + ~40 de plugins = a lista de skills é ela
própria um custo fixo que ninguém mediu.

---

### 3. Estamos a consultar os repos com mais estrelas para nos inspirar?

**NÃO — e o campo está a mover-se num eixo que não estamos a olhar.**

| Repo | ⭐ | Porque importa |
|---|---|---|
| **OpenClaw** | **210k** (9k→60k em dias, jan/2026) | O fenómeno do ano. Não estudámos |
| **Ollama** | 162k | É a nossa dependência de T0 e nunca lemos o roadmap deles |
| **Langflow** 146k · **Dify** 136k · **Flowise** 51k | — | **3 dos top 5 são visual builders.** O mercado quer montar sem escrever |
| **omo/lazycodex** | 66,8k | *"The coding agent for tokenmaxxers"* — **exactamente o nosso público** |
| **Mem0** | 52k | **Memória persistente para agentes** — precisamente a peça que o diagnóstico diz que nos falta |
| Ruflo | 31,1k | Orquestrador de sessões Claude Code |

**Advogado do diabo:** a leitura de "inspirar-se" está errada. O sinal mais valioso não é o que eles
constroem — é **o que 210k pessoas escolheram sem nós**. E há uma leitura desconfortável: se
Langflow/Dify/Flowise dominam, a preferência revelada do mercado é **montar visualmente**, não
configurar um router por ficheiro. O nosso cockpit VS Code aposta contra isso.

**O que esqueceste:** o **Mem0** resolve, com 52k estrelas e API pronta, o problema que a nossa J-1
vai construir do zero. A pergunta de sócio é: construímos memória persistente ou integramos a que já
ganhou? Construir tem sentido se a memória for o fosso; se for infraestrutura, é dinheiro nosso a
arder.

---

### 4. A UX/UI da thread atrapalha tokens/s, latência e qualidade?

**SIM, mas não onde pensas — e a medição inverte a pergunta.**

O bloco automático do conector está **bem feito** (tecto ~6 300 tokens, corte por linha inteira,
aviso explícito de truncagem). O peso está no **payload de saída** e na **acumulação da thread**:

| Superfície | Medido |
|---|---|
| `mooter_fleet view=recibo` | ≈ 11 KB — **7 dos 8 blocos de cargo dizem "nenhum trabalho na janela"**, ~1 KB de zeros cada ⇒ **67% é preenchimento** |
| `mooter_fleet view=board` | ≈ 6,5 KB |
| `mooter_fleet view=jobs` | **≈ 40 KB** — repete o `goal` inteiro **4 vezes** (wave_activa.goal, wave_activa.current_step, e outra vez em cada job) |

**O `view=jobs` é o pior offensor e ninguém o tinha medido.** Um goal de 3 000 caracteres aparece
4× no mesmo payload.

**Advogado do diabo — o dado que muda a estratégia:** a dor nº1 medida no mercado não é o preço por
token, é **o custo do contexto acumulado**. Fontes de 2026 reportam que numa sessão de vibe coding
*"ao passo 30, cada chamada custa 30× mais do que no passo 1"*, e que uma sessão típica queima
**3-5× mais tokens** do que desenvolvimento estruturado. **O Mooter optimiza QUAL modelo recebe o
prompt. Não toca em QUANTO contexto o prompt carrega.** Estamos a resolver o eixo mais barato.

**O que esqueceste:** esta própria conversa é o exemplo. Estou em **Opus 5** — que o scorecard pesa a
**5×** contra 1× do Sonnet e 0,25× do Haiku — e o `pressao_quota` está em **1,0 (crítico)**, com o
efeito medido de forçar tudo para o tecto `haiku`. **A cabine está a consumir a quota que diz proteger.**

---

### 5. Sabemos e registamos o que foi feito por chat do Cowork, quando, por qual LLM?

**NÃO. Confirmado por duas fontes independentes — e há uma saída que nunca foi tentada.**

| Item | Estado | Prova |
|---|---|---|
| Lê transcrições do Claude **Code** | Sim, mas **só para somar tokens** | `quota.js:56,75-130` |
| Lê rollouts do **Codex** | Sim, só `token_count` | `quota.js:415-500` |
| Lê transcrições do **Cowork/Desktop** | **Não existe** | grep em todo o `mooter-bridge`: zero |
| `session_id` do host | **O MCP não o expõe** | `tools6.js:329` |
| Proveniência de conversa | **Declarativa e manual** — só o que o assistente escrever em `mooter_setup({sessao:"registar"})` | `sessao.js:48-50` |
| `install_id` a carimbar registos | **Zero consumidores** | grep `require(.*install-id)` = 0 |

**A saída que ninguém viu — e é a magia:**
O servidor MCP não vê as sessões. **Mas o assistente vê.** Nesta sessão chamei
`session_info.list_sessions` e obtive **1 748 sessões** com id, título, estado e cwd — e
`read_transcript` lê qualquer uma delas.

> **O que o conector não pode fazer, uma skill pode.** A proveniência de conversa não é um limite de
> plataforma: é uma peça que nunca foi construída no lado certo da fronteira.

**O que esqueceste:** o `fecho-do-dia-mooter` já corre todos os dias às 19:07 e escreve no vault.
Ele tem acesso a `list_sessions`. Hoje escreve o que o assistente lembra; podia escrever o que
**aconteceu de facto** em todas as sessões do dia, com id, título, duração e modelo.

---

### 6. O Cowork perde eficiência vs cada LLM no terminal do VS Code?

**NÃO MEDIDO — é exactamente a Fase 0, e continua por fazer. Mas há três factos que enviesam a favor do terminal:**

| Facto medido hoje | Efeito |
|---|---|
| `prep_timeout` 3×, 20 s cada, 43 chars, `tokens_poupados: 0` | O Cowork+Mooter paga **60 s de latência** que o terminal não paga |
| Job J-4 pelo conector: **3 273 820 tokens de entrada**, `cost_usd: null` | O terminal mostrar-te-ia esse custo; aqui é invisível |
| `local_share` do painel: **`null`** — *"há 6 jobs sem tokens de saída medidos"* | A métrica que justifica a existência do produto **não é calculável hoje** |

**Advogado do diabo:** a pergunta certa não é "perde eficiência?" mas **"perde eficiência em quê?"**.
O Cowork perde em latência (o prep em série) e em transparência de custo. Ganha em três coisas que o
terminal não tem: paralelismo real (3 worktrees ao mesmo tempo, sem 3 terminais), a AskUserQuestion
como gate, e o registo automático. **Se o A/B medir só tempo e custo, o Cowork perde — e a conclusão
será falsa**, porque não terá medido aquilo em que ganha.

**O que esqueceste:** a métrica em falta é **intervenções humanas por entrega**. É onde a cabine
ganha, e não está no plano de medição.

---

### 7. Temos sessões/chats paralelos por projeto que conversam entre si?

**NÃO — e o bloqueio é de uma linha de schema.**

- Existem **1 748 sessões**. Todas isoladas (`is_child: false`).
- `sessao.js` tem **um único slot** (`'actual'`) porque `id` não está no schema.
- **`mooter_sessions_handoff` EXISTE** — em `packages/cli/mooter.js:18012-18040`, devolve resumo +
  `transcriptPath`. **Não está entre as 6 tools do conector.** A peça está construída e não exposta.

**O que esqueceste:** não é preciso construir. É preciso **expor** o que já existe e acrescentar `id`
ao schema. Isto é meia hora de trabalho, não uma wave.

---

### 8. Os LLMs locais fazem auto-compact para não relerem todo o contexto?

**A pergunta assume um problema que o moo não tem — e ignora o que tem.**

| Item | Medido |
|---|---|
| O moo mantém histórico entre chamadas? | **Não. É stateless** — envia `messages: [{role:'user', content: prompt}]`, uma única mensagem (`moo.js:444`) |
| `num_ctx` | `min(max(16384, tokens+2048), 32768)` (`moo.js:425-428`) |
| Truncagem própria | Não faz — **declara** o corte e deixa o Ollama cortar (`moo.js:430-440`) |
| Auto-compact da conversa do host | **Impossível por design.** `sessao.js:22-26`: *"❌ NÃO compacta a conversa em curso. O MCP não expõe nenhuma via para um servidor alterar o histórico do host"* |

**Advogado do diabo:** o moo não acumula contexto — cada job nasce limpo. **Quem acumula é esta
conversa do Cowork**, e é aí que o custo cresce ao ritmo que a indústria mede (30× ao passo 30).
A peça certa já existe e chama-se `sessao.js:150-201` (`retomar`), que devolve um bloco de **~2k
tokens**. Nunca foi transformada em órgão: só corre se alguém pedir.

**O que esqueceste:** o `keep_alive` de 10 minutos é o que mantém 16,2 GB presos na GPU e impede o
verify e o prep. **Auto-compact não é o problema. Gestão de residência de VRAM é.**

---

### 9. A metodologia olha todos os indicadores que os concorrentes usam como diferencial?

**NÃO — faltam 4 eixos, e um deles é o que o Maestro usa como argumento de venda.**

| Eixo do concorrente | Quem | Temos? |
|---|---|---|
| **Cost breakdown por resposta** | Maestro | ❌ `cost_usd: null` em 5 de 5 jobs cloud hoje |
| **Taxa de verificação** | Maestro, Fugu (papel Verifier) | ❌ 0% — nunca correu |
| **Privacy / safety / modality como dimensões de routing** | vLLM Semantic Router | ❌ só custo e complexidade |
| **Interpretabilidade da decisão** | Fugusashi (federated, human-interpretable) | 🟡 temos determinismo, sem explicação por decisão |
| Latência p50/p99 por tier | todos | 🟡 medimos duração, não percentis por tier |

**O que esqueceste — e é o mais grave:** faltam-nos as métricas **defensivas**. A dívida técnica de
código vibe-coded cresce **~3× mais rápido sem QA estruturado** (meta-análise ICSE 2026). Nenhum
concorrente mede isso. **Se medíssemos "dívida evitada", teríamos um eixo só nosso** — e temos o
material (keep rate, auditoria adversarial, 3 falsos-verdes documentados).

---

### 10. Handoff entre LLMs, projetos e sessões — tens razão que é diferencial?

**Tens razão. E hoje existe **um oitavo** do que descreveste.**

| Direcção | Estado | Prova |
|---|---|---|
| moo → cloud | ✅ **contexto real**, texto colado no masterprompt, corte a 12 000 chars | `seamless.js:1338-1367` |
| cloud → cloud | ❌ | `toolDispatch` aceita `handoff_from` (`seamless.js:1450`) mas **não está no schema** e `additionalProperties:false` ⇒ inacessível |
| cloud → moo | ❌ | só nasce em `if (chain && agent === 'moo')` |
| entre sessões | 🟡 construído, **não exposto** | `packages/cli/mooter.js:18012` |
| entre projetos | ❌ | slot único `'actual'` |

**Advogado do diabo:** o handoff é o melhor código do repositório — passa **texto real**, não
referência, e regista `handoff_from` no ledger para desenhar a seta. É genuinamente um diferencial.
**Está travado por duas linhas de schema**, não por arquitectura.

**O que esqueceste:** handoff **entre motores da mesma tarefa** é o padrão que o Fugu vende como
Thinker→Worker→Verifier. Nós temos a metade barata (moo prepara) e não temos a metade que vende
(verifica). Abrir cloud→moo faria o moo verificar **a $0** o que a nuvem produziu — algo que o
Maestro não consegue, porque não tem GPU.

---

### 11. Os paths estão correctos e alinhados com o vault?

**PARCIAL — e há uma armadilha activa.**

- O marcador de repo é `tools/router/classify.js` — **ficheiro exclusivo do frugal**
  (`server-apps.js:92,104`). Fallbacks hardcoded para `~/frugal` e `~/Documents/frugal`.
- O journal escreve no vault por detecção de `.obsidian/` (`journal.js:47-67`), em
  `30-learnings`/`20-decisions`/`10-projects`. Funciona.
- **Frontmatter sem device, sem install-id, sem user** (`journal.js:117-125`).
- **Armadilha:** o `context.js` tem veto absoluto a `.codex/sessions` e `.claude/projects`
  (`context.js:34-37`) com o comentário *"o Codex já se auto-ingeriu e explodiu o próprio contexto"*.
  Bom guarda — mas mostra que o problema de auto-ingestão já aconteceu uma vez.

**O que esqueceste:** se um agente citar "SYNC.md" no goal, o `context.js` lê os 387 695 bytes, corta
em 24 000 (**6,2% do ficheiro**) e declara honestamente que cortou. **O agente fica a ver 6% do
estado do projecto e a pensar que viu o estado.** A honestidade do aviso não salva a decisão.

---

### 12. Worktrees, agentes e subagentes são registados? Os prompts respeitam best practices?

**Registados: sim. Best practices: não medidas — e o `steps` está a mentir.**

- Worktrees, agentes, cargo, `handoff_from`, duração e tokens vão todos para o ledger. Bom.
- **`steps_done: 60` com `steps_total: null`** nos jobs Codex — a barra de progresso conta chamadas
  de ferramenta e admite que não sabe o total. Honesto, mas inútil.
- **Sub-agentes de cada LLM não são registados.** O Codex fez 60 passos; o ledger não sabe o que
  foram.
- `tier_motor: null` em todos os jobs cloud — *"o motor não escreveu tier_motor no ledger"*. **A
  métrica de tier é auto-declarada e não confirmada.**

**Advogado do diabo — o que apareceu nos logs de hoje e ninguém tinha visto:**

| Job | stderr real |
|---|---|
| J-1 | `Error: spawn EPERM` |
| J-2+J-3 | `Error: --codex-run-as-apply-patch requires a UTF-8 PATCH argument` + 2× `Exit code: 1` |
| J-4 | `ERROR codex_core::tools::router: error=Exit code: 1` — **e mesmo assim `state: done, exit_code: 0`** |

**O `apply_patch` do Codex está a falhar por encoding UTF-8** — é o gotcha do PS 5.1/BOM a morder
outra vez. E um job com erro interno fechou como sucesso.

---

### 13. Que dores de vibe coders podemos atacar melhor que a concorrência?

**Três, medidas no mercado — e atacamos zero delas hoje.**

| Dor medida (2026) | Nós hoje |
|---|---|
| Gasto de tokens **+13×** desde jan/2025; sessão vibe queima **3-5×** mais que dev estruturado | Roteamos por modelo, **não cortamos contexto** |
| **"Ao passo 30, cada chamada custa 30× mais do que no passo 1"** — o contexto acumulado é pago repetidamente | `sessao.js:retomar` existe (~2k tokens) e **não é órgão automático** |
| Dívida técnica **~3× mais rápida** sem QA estruturado (ICSE 2026) | Temos auditoria adversarial e **não a vendemos como métrica** |
| Um "debug this function" gera **20+ chamadas API** se o agente entende mal | O contrato capacidades↔tarefa (J-2) ataca isto directamente |

**A oportunidade fora da caixa:** ninguém vende **"custo do passo 30"**. Um contador que mostre
*"esta conversa já custou X, e Y% disso é contexto repetido"* — com o botão de compactar ao lado —
é uma dor real, medida, cara, e **sem produto**. Temos a peça (`retomar`), o ledger e o cockpit.

---

### 14. Qual o melhor modelo para iniciar no Cowork e chamar o Mooter?

**Começar em Opus 5 para orquestrar é pagar 5× por trabalho que outro motor vai fazer.**

Pela fórmula do próprio scorecard (*"entradas+saídas por 1000 × família: Opus 5×, Sonnet 1×, Haiku 0,25×"*):

| Papel na sessão | Modelo certo | Porquê |
|---|---|---|
| Ler SYNC, montar goals, despachar, colher, formatar | **Sonnet** (1×) ou **Haiku** (0,25×) | É trabalho de secretariado. O raciocínio caro acontece **dentro** dos jobs |
| Confronto, arbitragem, decidir gates, auditoria adversarial | **Opus 5** (5×) | Só aqui o prémio se paga |
| Fable | **nunca automático** | `@fable` está no CLAUDE.md mas **não existe no conector** |

**Rota recomendada:** abrir em **Sonnet** com um masterprompt curto que só faça sync + despacho.
Quando houver uma decisão irreversível ou um confronto, **abrir sessão nova em Opus** com o
`mooter_setup({sessao:"retomar"})` (~2k tokens) em vez de arrastar a thread inteira.

**Advogado do diabo:** hoje isto é impossível de fazer bem, porque `retomar` tem **um só slot** e não
é automático. **A rota óptima depende de uma peça que está meio construída.**

**O que esqueceste:** o custo não é só do modelo — é do **contexto que a thread já acumulou**. Uma
sessão Opus curta é mais barata que uma sessão Sonnet longa. **A variável dominante é o comprimento
da thread, não o modelo.**

---

### 15. Há fluxo mais rápido de chamar o Mooter? Melhorar código, conector, plugin, UX?

**A resposta honesta é: nenhuma das quatro primeiro. O caminho mais rápido é apagar coisas.**

| Opção | Custo | Ganho medido |
|---|---|---|
| Melhorar o código do conector | alto | O contexto automático já está bom (~6 300 tokens) |
| Virar plugin | médio | Resolve enforcement e distribuição, **não** latência |
| Simplificar UX | médio | Real: `view=jobs` repete o goal 4× |
| **Arrumar o repo e matar o prep em série** | **baixo** | **60 s por wave + ~97k tokens de SYNC + resultados de grep a dobrar** |

**Fora da caixa — três ideias que mudam a natureza do produto:**

**A) A skill que lê as sessões.** O servidor MCP não vê as conversas; **o assistente vê 1 748 delas**.
Uma skill que corra ao fecho e escreva no vault o que aconteceu em cada chat — id, título, duração,
modelo — resolve a proveniência **sem tocar no conector**. É a peça no lado certo da fronteira.

**B) Despejar o prep em série.** O `prep` custa 20 s e entregou 43 caracteres em 3 de 3 tentativas
hoje. Ou corre **em paralelo** com o job pago (e o pago aproveita se chegar a tempo), ou morre.
Em série é latência pura.

**C) Libertar a GPU.** Um modelo de 16,2 GB residente numa 4090 impede verify, prep e downgrade.
Um modelo pequeno de verificação, sempre residente e com VRAM reservada, transforma três loop holes
em zero — e cria o único diferencial que o Maestro não consegue copiar: **verificação a $0**.

---

## O QUE FALTOU NA TUA LISTA — 8 pontos

| # | Ponto | Porque importa |
|---|---|---|
| 1 | **A GPU está cheia e é a causa-raiz de 3 loop holes** | 16,2 GB residentes, 1,6 GB livres. Nenhuma pergunta tua tocou nisto |
| 2 | **Não há enforcement das regras que já escrevemos** | 4 regras do AGENTS.md violadas em simultâneo. Faltam testes de CI, não mais regras |
| 3 | **`view=jobs` repete o goal 4× (~40 KB)** | A superfície mais cara do conector, nunca medida |
| 4 | **Um snapshot em `.mooter/worktrees/` duplica `docs/` e `packages/`** | Todo grep de agente vem a dobrar |
| 5 | **O `apply_patch` do Codex falha por UTF-8, hoje, em produção** | Duas waves com `Exit code: 1` no stderr e `done` no ledger |
| 6 | **`tier_motor` é sempre `null`** | A métrica de tier é auto-declarada e nunca confirmada pelo motor |
| 7 | **Mem0 (52k ⭐) já resolve a memória persistente que a J-1 vai construir** | Decisão de sócio: construir ou integrar |
| 8 | **Faltam métricas defensivas (dívida evitada)** | É o único eixo onde nenhum concorrente joga |

---

## O PLANO REVISTO

A ordem muda. **J-0 passa à frente de tudo** — é barata, é reversível e destrava as outras.

| Wave | O quê | Ganho medido | Est. |
|---|---|---|---|
| **J-0a** | **Libertar a GPU**: modelo pequeno de verificação com VRAM reservada; rever `keep_alive` | Destrava LH-4 e LH-6 de uma vez | 2 h |
| **J-0b** | **Arrumar**: SYNC.md → 200 linhas + arquivo · arquivar os 216 `.md` de `_handoff/` · matar o snapshot duplicado · limpar os 60 `.bat` · **e um teste de CI que falhe se voltar a acontecer** | ~97k tokens por leitura; grep deixa de duplicar | 3 h |
| **J-0c** | **Prep em paralelo, não em série** | −20 s por job, medido 3/3 hoje | 2 h |
| **J-0d** | **Dieta de payload**: suprimir blocos vazios do recibo; `view=jobs` deixa de repetir o goal | −67% recibo, −75% jobs | 2 h |
| **J-1** | A régua (a correr) | baseline persistida | — |
| **J-2+J-3** | Contrato e frescura (a correr) | trabalho nulo deixa de ser entrega | — |
| **J-4** | Verify vivo (entregue, por auditar) | verify passa de 0% | — |
| **J-5** | **Handoff completo**: expor `handoff_from` no schema · `id` no `sessao` · expor `mooter_sessions_handoff` | cloud→moo, entre sessões e projetos | 4 h |
| **J-6** | **A skill que lê as sessões** — proveniência real sem tocar no conector | 1 748 sessões passam a ser registo | 3 h |
| **J-7** | A sessão-espelho, com **intervenções humanas por entrega** no plano de medição | responde à pergunta 6 sem enviesar | 1 dia |

**Caminho crítico: J-0a → J-0b → J-0c.** São 7 horas e destravam tudo o resto.
