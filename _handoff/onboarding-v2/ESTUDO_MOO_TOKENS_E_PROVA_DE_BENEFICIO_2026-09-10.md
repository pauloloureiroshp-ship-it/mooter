# Estudo — "Moo Tokens", como o mercado mede o roteador, e como provar o Mooter num one-pager (2026-09-10)

**Pergunta do dono:** faz sentido uma unidade "Moo Tokens"? Como os concorrentes contabilizam o roteador e mostram o benefício? Precisamos de matriz PF vs PJ? Onde contabilizar? A+B contra modelo único é factível? Como provar "com Mooter vs sem Mooter" face a OpenRouter, Adapt, Conductor?

**Régua:** número externo = citado com URL (pesquisa web de hoje, 3 subagentes, ~90 fontes). Número do Mooter = medido (SYNC tail de hoje, ledger em disco) ou **n/d**. Sem poupança sem tokens medidos (decisão 24/08). Sem código alterado.

**Fonte de contexto interno lida hoje:** `~/frugal/SYNC.md` (tail), `tools/router/ledger-*.js`, `_handoff/agent-sync/events.jsonl`, `_handoff/mooterbench-*.jsonl`, docs do Project (`CORRECOES_APOS_CONFRONTO_E_V`, `ESTRATEGIA_O_RECIBO`, `ESTUDO_OPENROUTER`, `ROADMAP_PERFEITO_E_COBRAVEL`).

---

## 0. Veredicto em 10 linhas

| # | Pergunta | Resposta curta |
|---|---|---|
| 1 | "Moo Tokens" faz sentido? | **Como unidade de MEDIDA (odómetro), sim. Como unidade de COBRANÇA, não.** Todas as unidades proprietárias de 2025-26 (Copilot *premium requests*, Cursor *requests→créditos*, Salesforce *Flex Credits*, Windsurf *credits*) foram abandonadas ou geraram revolta; ninguém no mercado fatura em token normalizado |
| 2 | Como os concorrentes contam? | Em **tokens nativos × preço do modelo, em US$** (ou créditos 1:1 com US$). Fee = % sobre carregamento (OpenRouter 5,5%, Cloudflare 5%), % sobre inferência (Requesty 5%), por log/pedido (Portkey, Helicone) ou por token roteado (Not Diamond US$0,05/M) |
| 3 | Como mostram o benefício? | **Quase nunca com contrafactual dentro do produto.** Mostram gasto por modelo; "poupança" só de cache (Requesty, Portkey). Excepções: Kilo (custo por tentativa vs fronteira, metodologia publicada) e Copilot (*Auto* = desconto 10% — routing como desconto) |
| 4 | Precisamos de matriz PF vs PJ? | **Sim.** A métrica interna é a mesma (tokens), mas a unidade que o utilizador vê difere: PF = janelas (5h/semana) e multiplicadores sem número; PJ = *rate card* em US$/token ou créditos agrupados, sem treino por defeito, SSO. O Moo Token precisa de **duas colunas de conversão** |
| 5 | Onde contabilizar? | **Local-first:** ledger no device (o conector já é o ponto de captura), esquema OTel `gen_ai.*` com baldes mutuamente exclusivos + `chars_in/out`; sobe **só agregados assinados** (beacon Ed25519 já existe); Stripe Meter só se um dia houver degrau metered |
| 6 | A+B vs modelo único é factível? | **Sim, em duas classes rotuladas:** (a) par REAL medido dos dois lados — único admitido no pitch; (b) contrafactual de tabela por prompt — tokens de entrada contáveis com exactidão e $0 (contadores nativos gratuitos), saída = suposição declarada. Lição Tesla/Honey: **publicar a suposição e deixar o utilizador mudá-la** |
| 7 | Como provar vs não usar? | Três provas que nenhum gateway consegue emitir: **quota preservada** (eles não vêem subscrições), **0 bytes de egresso** no tier local, **recibo com taxa de erro declarada**. Métrica de extrato: **ESR-LLM** (FinOps), cobertura local, qualidade retida (PGR). Alegação já provada: *vs sem router* p<0,0001 (McNemar, n=35) |
| 8 | Fora da caixa | **O Mooter é o carro híbrido.** Bateria = GPU local; gasolina = subscrição/API. O painel do híbrido (km em modo eléctrico, consumo, "poupança de combustível" com suposição visível) é a forma conhecida, não estranha, de explicar o produto numa página |
| 9 | Como cobrar? | **Licença flat por utilizador/ano, 1 chave = frota, free-core** (já na recomendação de 01/09). Não cobrar % da poupança (risco Honey), não cobrar por Moo Token (precedentes maus, e o custo marginal do Mooter é ~0) |
| 10 | O que NÃO fazer | Pôr um número de poupança no one-pager antes de existir classe (a) com ≥20 tarefas. Hoje o ledger vivo tem tokens em **1 de 156** linhas (`agent-sync/events.jsonl`) e o bench regista só `tokens_out` |

---

## 1. "Moo Tokens" — o que o mercado fez com unidades próprias

| Produto | Unidade própria | O que aconteceu | Lição |
|---|---|---|---|
| GitHub Copilot | *Premium requests* com multiplicador por modelo (0,25× a 57×) | **Abandonado em 2026-06-01** → "AI credits", 1 crédito = US$0,01, tokens nativos × preço. Reacção: "50% dos créditos em 2 dias", contas 10×–50× para power users | Multiplicador = taxa de câmbio que ninguém entende; migrar para token+US$ também dói |
| Cursor | 500 *requests* → créditos em US$ (jun/2025) | Quotas esgotadas "após um punhado de prompts", pedido de desculpas do CEO, reembolsos | Mudar de unidade a meio da vida do produto destrói confiança |
| Salesforce Agentforce | *Flex Credits* US$0,10/acção | Citado como "matriz de câmbio que ninguém entende" | Idem |
| Windsurf | Créditos flat | Retirado (mar/2026): "users scared of asking quick questions" | Unidade opaca inibe uso |
| OpenRouter | **QuadChars** (contagem interna agnóstica ao modelo) | Usado só em **análise**, nunca em facturação; factura em tokens nativos | **O único precedente de "token normalizado" existe — e é métrica, não moeda** |
| Not Diamond | US$0,05 por 1M tokens **roteados** (nativos) | Único a cobrar por token roteado; RouterArena aponta que sobre-selecciona modelos caros | Cobrar por token roteado alinha o roteador com *volume*, não com *poupança* |
| Copilot *Auto* | multiplicador ×0,9 | Routing expresso como **desconto** de 10% | A única forma de "valor do roteador" que o mercado tornou legível: **desconto** |

**Conclusão:** "Moo Token" sobrevive como **odómetro** (quanto trabalho passou pelo Mooter e por onde), nunca como **moeda**. O nome pode ficar; a função é medir.

---

## 2. Como os concorrentes contabilizam o roteador e mostram benefício

| Gateway/Router | Unidade cobrada | Mostra benefício como | Contrafactual no produto? | Normaliza tokenizers? |
|---|---|---|---|---|
| OpenRouter (Stripe, US$7B+) | créditos 1:1 US$; fee 5,5% (mín. US$0,80) | Activity por modelo/chave; `usage.cost` por resposta; `:floor`/`:nitro` sem número | **Não** | Factura nativo; QuadChars só análise |
| Not Diamond | US$0,05/M tokens roteados | "Savings dashboard"; calculadora ROI 20-40% | Baseline **não publicada** (n/d) | n/d |
| Martian | US$20 / 5.000 pedidos (3.ª parte) | "até 97%" marketing; criou RouterBench (AIQ) | Não | n/d |
| Requesty | 5% markup | Aba **Savings** ($ e % — só cache), BYOK vs gateway | Só cache | n/d |
| Portkey | US$49/mês por 100k logs (+US$9/100k) | Custo, tokens, latência; poupança de cache; pedidos "resgatados" por fallback | Só cache/fallback | n/d |
| LiteLLM | OSS; Enterprise ~US$250/mês | Contabilidade pura em US$ (`model_prices_and_context_window.json`) | Não | Não |
| Arcee **Conductor** | preço de lista por token, 0 markup | Uso por modelo; no blog "99,38% de poupança" por prompt vs Sonnet/GPT-4o | Só no blog | n/d |
| **Adaptive** (llmadaptive.uk) | site inacessível hoje | snippet "60% cost reduction" | n/d | n/d |
| Vercel AI Gateway | créditos, **0% markup** | Tokens, latência, gasto por projecto; "build your own router" | Não | n/d |
| Cloudflare AI Gateway | grátis; 5% em Unified Billing | Pedidos, tokens, custo, cache hits | Não | n/d |
| Helicone | US$79–799/mês por pedidos | Cache em **horas poupadas** | Não | n/d |
| Kilo Code (Auto) | créditos 1:1 (+5% top-up); Teams US$15 | **KiloBench:** 445 tentativas, custo/tentativa vs fronteira (Auto Efficient 46,7% @ US$19,60 vs fronteira 65,6% @ US$70,40) | **Sim, publicado com metodologia** | n/d |
| Cursor (Auto) | créditos = preço de lista (+US$0,25/M "Cursor Token Rate") | Barra de uso por pool | Não | n/d |

**Cinco achados transversais (fonte: relatório A):**
1. Ninguém factura em token normalizado.
2. Benefício do routing quase nunca aparece como contrafactual dentro do produto; quando aparece, a baseline é "o modelo mais forte em tudo" — limite superior, não medição.
3. RouterArena (ICLR 2026): routers comerciais (Not Diamond, Azure, GPT-5) **sobre-usam modelos caros** e são "ineficientes a reconhecer quando um modelo pequeno chega". → O número de vendedor é tecto, não piso.
4. Os fees agrupam-se em três: % do carregamento · % da inferência · por log/seat. O routing em si é raramente cobrado.
5. A única representação do valor do roteador que virou **preço** foi um desconto (Copilot Auto ×0,9).

**Onde o Mooter é diferente por desenho (e nenhum dos 13 consegue copiar sem mudar de negócio):** eles vivem da portagem sobre gasto cloud; não vêem subscrições já pagas nem GPU própria; a poupança máxima deles é a receita mínima deles. O Mooter opera no lado sem portagem — e por isso **não pode** cobrar % de fluxo sem inverter a tese (estudo OpenRouter 28/08 §3).

---

## 3. Definição proposta: Moo Token = odómetro, com três preços por prompt

### 3.1 O problema do token
Tokenizers não são comparáveis: inglês 1,17 tok/palavra (GPT-5 o200k) vs 1,23 (Sonnet 4.6) vs **1,88 (Opus 4.8)**; alemão 1,71 vs 3,49; código 10-20% menos tokens em o200k vs cl100k; chinês varia **7×** entre tokenizers. O tokenizer novo da Anthropic (Opus 4.7+, Fable 5) usa **até +35%** tokens para o mesmo texto. "1 Moo Token = 1 token" seria mentira estrutural.

### 3.2 Definição (proposta)
| Campo | Definição | Como se mede | Custo |
|---|---|---|---|
| **Moo Token (MT)** | **1 MT = 4 caracteres** de texto que atravessou o Mooter (prompt + contexto + resposta). Agnóstico ao modelo. Precedente: QuadChars do OpenRouter | `chars_in`, `chars_out` no hook — determinístico, idêntico em todos os motores | $0 |
| Tokens nativos | O que cada motor cobrou/consumiu de facto | `usage` do provider (OpenAI/Anthropic/Gemini) · `prompt_eval_count`/`eval_count` (Ollama) | $0 |
| Rácio tokenizer | tokens nativos ÷ MT, por modelo | Calibração contínua a partir do ledger; para modelos que **não** correram, contadores gratuitos: Anthropic `count_tokens`, `tiktoken` local, Gemini `countTokens` | $0 |

### 3.3 Os três preços de cada prompt (o "recibo")
| Preço | O que é | Fonte | Rótulo |
|---|---|---|---|
| **Preço de tabela** | O que este prompt custaria em cada modelo único (Fable 5.1, Sonnet 5, GPT-5.6 Sol, Gemini 3.5 Flash…) à lista pública, tokens de entrada **contados** pelo contador nativo gratuito; saída = tokens de saída do motor que correu (suposição declarada) | catálogo vivo (OpenRouter `/api/v1/models` ou LiteLLM JSON — U1 do estudo 28/08) | "estimativa de tabela · saída assumida" |
| **Preço pago** | O que custou de facto: US$0 + Wh no local (kWh × tarifa + amortização, ambos editáveis) · US$ à rate card se API · **0 US$ se subscrição** | ledger | "medido" |
| **Quota consumida** | Para subscrições: fracção da janela 5h/semanal gasta; para PJ com rate card: créditos/US$ | contagem própria + `/usage` do provider onde exista | "medido" ou "n/d" |

E uma **quarta linha que ninguém emite**: `egresso: 0 bytes` (tier local) ou `egresso: provider X, política de treino Y`.

### 3.4 Porque isto é "conhecido e não estranho"
É a **factura de electricidade**: kWh (odómetro universal) · tarifa · "o mesmo mês no ano passado" · "casas semelhantes" (Opower, efeito medido −1,9% a −2,0%, RCT 80.000 casas). Ou o **recibo Uber**: linhas itemizadas (base, por km, por minuto, taxa, multiplicador). Ninguém precisa de aprender uma moeda nova.

---

## 4. Matriz subscrições — PF vs PJ e o que muda para o Mooter

### 4.1 Como cada vendedor mede (hoje, oficial)
| Vendedor | PF: unidade visível | PJ: unidade visível | Limites diferem PF/PJ? | Treino por defeito PF → PJ | Preço PF / PJ (US$/mês) |
|---|---|---|---|---|---|
| Anthropic Claude | Janela 5h + semanal; só multiplicadores ("5×", "20×"); **zero números de tokens publicados** | Team: mesmas janelas por seat (1,25× / 6,25× Pro); Enterprise novo: **tokens à rate card API, sem tecto** | Sim | ON (opt-out) → OFF | Pro 20 · Max 100/200 / Team 25–125/seat · Ent 20/seat + consumo |
| OpenAI ChatGPT/Codex | Mensagens por 5h + semanal (Codex: Sol 10–100 msgs/5h no Plus); créditos US$0,04 | Business: tectos por seat (=Plus) + créditos de workspace; Enterprise: rate card US$/token (Sol 4/0,40/20) ou créditos | Sim | ON (opt-out) → OFF | Plus 20 · Pro 100/200 / Business 25–125/seat |
| Google Gemini | Prompts/dia por modelo (Pro: 100 prompts Pro/dia); CLI 1.500 req/dia | Workspace por seat; Code Assist 1.500–2.000 req/dia | Sim (req/dia) | ON (opt-out) → OFF | AI Pro 19,99 (R$96,99) · Ultra 249,99 (R$779,9) / Workspace 7–14/seat |
| GitHub Copilot | **AI credits** (1 = US$0,01) de tokens; Pro 1.500 créditos | Créditos **agrupados** por entidade (Business 1.900/user) + orçamentos | Pooling | opt-out → OFF | Pro 10 · Pro+ 39 / Business 19 · Ent 39 |
| Cursor | Créditos = preço de lista (+US$0,25/M em modelos de terceiros) | Igual, pooled no Enterprise | Só pooling | treino salvo Privacy Mode → OFF | Pro 20 · Ultra 200 / Teams 40–120 |
| Kimi | Créditos + semanal + 5h (sem token por crédito publicado) | n/d | n/d | n/d | ¥49–699 |
| xAI Grok | Pool semanal partilhado | n/d | n/d | ON → n/d | 10–300 |

### 4.2 O que a matriz obriga no desenho do Moo Token
| Consequência | Porquê |
|---|---|
| **Duas colunas de conversão**, não uma | PF nunca vê US$ (vê "% da janela"); PJ Enterprise vê US$/token. O recibo mostra a coluna certa por perfil |
| "Quota consumida" é a métrica-assinatura para PF | É a dor real (o dono trava a meio de tarefas quando os créditos de CC acabam — memória 2026-08). Nenhum gateway a mede porque nenhum vê subscrições |
| Política de egresso no recibo | PF: treino ON por defeito em Claude/ChatGPT/Gemini/Grok; PJ: OFF. O Mooter que roteia código **tem** de declarar para onde foi e sob que política |
| Não prometer "US$ equivalentes" a subscritores como poupança | Claude Code `/usage` diz-o textualmente: "usage inside the seat allowance isn't metered in dollars". O ccusage mostra o equivalente à lista — é **yardstick**, não poupança (já é a regra do mapa 25/08) |
| A Anthropic e a xAI não publicam tectos absolutos | Qualquer "N tokens por janela" é inferência de terceiros → n/d no produto; medir a própria janela por contagem |

---

## 5. Onde contabilizar e armazenar

| Opção | Prós | Contras | Veredicto |
|---|---|---|---|
| **Local (device), JSONL/SQLite, esquema OTel** | $0; privacidade por arquitectura; é onde o hook já está; ccusage/Claude Code fazem exactamente isto (`~/.claude/projects/*.jsonl`) | Multi-device precisa de agregação | 🔥 **Fonte de verdade** |
| Conector (MCP) | Ponto de captura natural; já regista `execution_channel: subscription` no `agent-sync-ledger.v3` | Não é armazenamento — é onde se escreve | Captura, não guarda |
| Nuvem (SaaS Mooter) | Extrato multi-device, dashboard de utilizadores, cobrança | Só pode receber **agregados** (contagens), nunca prompts; custa; exige identidade multi-utilizador (ainda não existe) | Recebe **beacons assinados** por hora/dia; fase 2 |
| Stripe Billing Meters | `meter_events` até 1.000/s, timestamp ≤35 dias | Só faz sentido se houver degrau metered | Só para o degrau BYOK (U2), se existir |

**Esquema mínimo de linha (nomes OTel, baldes exclusivos):** `ts · provider · model_req · model_resp · execution_channel (local|subscription|api) · input_tokens · cache_read · cache_write · output_tokens · reasoning_tokens · chars_in · chars_out · duration_ms · ttft_ms · load_ms · energy_wh · price_version · cost_usd · quota_window_id · task_id · outcome · egress_bytes`.
⚠️ Armadilha documentada (Langfuse #12306): OTel trata `input_tokens` como **total** e Anthropic como **exclusivo** de cache — misturar dobra a conta. Guardar baldes exclusivos e derivar o total.

**Estado medido hoje (10/09):** o código do ledger já tem `input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens` (tools/router/ledger-*.js); o ledger vivo `agent-sync/events.jsonl` tem tokens em **1/156** linhas; o MooterBench regista **só `tokens_out`**, sem entrada, sem chars, sem energia. → O Moo Token é hoje **n/d**; o esquema existe, a captura não.

---

## 6. A+B contra modelo único — factível? Sim, em duas classes

| Classe | O que é | Custo | Onde entra |
|---|---|---|---|
| **(a) Par real** | Mesma tarefa nos dois motores, tokens medidos dos dois lados, ≥20 tarefas, juiz cego em motor diferente | Paga a corrida do modelo único (API) | **Pitch, site, one-pager** — único admitido (decisão 24/08, roadmap 01/09 B6) |
| **(b) Contrafactual de tabela** | Por prompt: entrada contada com contador nativo gratuito × preço de lista de cada modelo; saída = a que o motor real produziu, rotulada "assumida" | $0 | **Recibo e extrato do utilizador**, sempre rotulado, referência editável |

**O que (b) não pode saber e tem de dizer:** quantos tokens de saída o modelo que *não* correu teria produzido (verbosidade e *reasoning* variam — o Artificial Analysis mede exactamente isso: "cost to run index" incorpora verbosidade). Lição Tesla ("Gas Savings" com MPG e preço de gasolina não divulgados → disputas nos fóruns) e Honey (acção colectiva 5:24-cv-09470 por contrafactual não auditável): **a suposição é visível e editável pelo utilizador**, e o recibo diz "assumida".

**Formato A+B no recibo (exemplo de estrutura — sem números até haver medição):**

| Linha | Só Fable 5.1 | Só Sonnet 5 | Só GPT-5.6 Sol | **Mooter (misto)** |
|---|---|---|---|---|
| Moo Tokens | n/d | n/d | n/d | n/d |
| tokens entrada (contados) | n/d | n/d | n/d | n/d |
| tokens saída | assumida | assumida | assumida | medida |
| preço de tabela (US$) | n/d | n/d | n/d | — |
| preço pago | — | — | — | n/d |
| quota consumida | — | — | — | n/d |
| egresso | provider | provider | provider | **0 bytes** (se local) |
| veredicto de qualidade | — | — | — | aceite / escalado / n/d |

---

## 7. Como provar "com Mooter vs sem Mooter" — o que os outros não conseguem

### 7.1 Três provas que nenhum gateway emite
| Prova | Porque eles não conseguem | Estado no Mooter |
|---|---|---|
| **Quota preservada** (horas de Claude Code / Codex não queimadas) | Não vêem subscrições; vivem do gasto API | Esquema tem `execution_channel`; contagem de janela **n/d** |
| **0 bytes de egresso** no tier local, com política declarada quando sai | O negócio deles *é* o egresso | Arquitectura suporta; política por projecto W3.b por fazer |
| **Recibo com taxa de erro declarada** (o número carrega o próprio limite) | Ninguém publica *acceptance* com gabarito defensável (Bugbot 78%, Greptile 82% — mas 45% pela Augment nos mesmos repos) | Cultura já em código (`n/d`, "citado não significa certo") |

### 7.2 O que já está PROVADO (SYNC de hoje)
| Alegação | Medida | Veredicto |
|---|---|---|
| Mooter vs **sem router** | 35 ground truth · McNemar 19 discordantes a 1 · **p < 0,0001** (patterns actuais) · p = 0,0015 (patterns pré-rótulos, 82,9%) | **PROVADO — a única alegação que o produto faz** |
| Mooter vs router-por-LLM | 5 a 2 · p = 0,45 · n=35 | **Indistinguível de ruído** em precisão |
| Custo da decisão | **0 tokens** vs 23.182 · p50 **1,85 ms** vs 74,5 ms (47×) · 0 bytes para a rede | Diferença de arquitectura, não estatística |
| 91,4% | Score de **treino** (patterns afinados no validation-set) | Dizer sempre "treino"; holdout queimado |
| Obediência | 0% (43/112 marcados trabalho de graça, 0 delegações) | ⚠️ Recomendação sem execução não gera Moo Token nenhum |

### 7.3 As métricas do extrato mensal (nomes que o comprador já conhece)
| Métrica | Definição | Origem |
|---|---|---|
| **ESR-LLM** | (custo-equivalente cloud − custo pago incl. energia) ÷ custo-equivalente cloud | FinOps *Effective Savings Rate* |
| **Cobertura local** | % de Moo Tokens servidos no device | AWS Savings Plans *Coverage* |
| **Utilização** | % do tempo de GPU ocupado | AWS *Utilization* |
| **Qualidade retida** | % de tarefas aceites sem escalar para cloud (PGR-style) | RouteLLM PGR / RouterBench AIQ |
| **Custo por tarefa aceite** | US$ pago ÷ tarefas aceites | HAL/SWE-bench, Kilo |
| **Egresso** | bytes e destinos, por política | original Mooter |

No extrato, cada métrica tem `n/d` quando não medida — o extrato para o utilizador nº2 já é gate 11 do *Definition of Chargeable*.

### 7.4 Contra OpenRouter/Adapt/Conductor especificamente
- **Não competir na precisão de routing** (empate estatístico com router-LLM; RouterArena mostra que os comerciais também erram para o caro). Competir em **custo da decisão** (0 tokens, 1,85 ms, on-device) e nas três provas de 7.1.
- Frase de posicionamento que sobrevive ao gauntlet: *"Eles cobram uma portagem sobre o que gastas na nuvem. O Mooter mede o que **não** gastaste — na tua GPU e nas subscrições que já pagaste — e mostra-te o recibo, incluindo onde errou."*
- Ideia a roubar: Copilot *Auto* = desconto 10%. Se um dia houver degrau BYOK pago pelo Mooter, "rota Mooter = X% de desconto" é a única gramática de valor que o mercado já aceitou.

---

## 8. Fora da caixa — o Mooter é o carro híbrido

A forma conhecida, não estranha, que explica **exactamente** este produto sem inventar nada:

| Híbrido (Prius, Tesla app) | Mooter |
|---|---|
| Bateria: motor eléctrico para a cidade, quase grátis | **GPU local:** leitura extensa, rondas, classificação — $0 marginal, 0 egresso |
| Gasolina: motor a combustão para a estrada | **Subscrição/API:** git, escrita, refutação — onde é insubstituível |
| Computador de bordo decide quando trocar de motor, sem o condutor mexer | **classify.js:** 0 tokens, 1,85 ms, on-device |
| Painel: km em modo eléctrico · consumo L/100km · autonomia restante | **Recibo:** % Moo Tokens no local · custo por tarefa · **quota restante** (o medidor de combustível que ninguém dá aos subscritores) |
| "Gas savings" da app Tesla (com a lição: mostrar a suposição) | Preço de tabela vs pago, suposição de saída visível e editável |
| Ninguém compra um Prius pelo relatório — compra porque anda mais com o mesmo tanque | Ninguém compra um recibo (correcção de 28/08) — compra porque **não fica parado a meio da tarefa** |

Segunda metáfora, para o extrato: **a conta de luz** (kWh = Moo Token; "mesmo mês do ano passado" = os teus últimos 30 dias; "casas semelhantes" só quando houver baseline real — até lá, "tu vs tu").

**A frase do one-pager:** *"Mooter: o híbrido dos LLMs. A tua GPU faz a cidade. A tua subscrição faz a estrada. Tu vês o painel."*

---

## 9. Modelo de cobrança — opções e recomendação

| Modelo | Exemplo | Alinha com a tese? | Risco | Veredicto |
|---|---|---|---|---|
| % sobre gasto cloud | OpenRouter 5,5%, Requesty 5% | ❌ Inverte (poupança do cliente = receita menor) | Estratégico | ❌ |
| Por Moo Token / token roteado | Not Diamond US$0,05/M | ❌ Premeia volume; precedentes de revolta (Copilot, Cursor) | Confiança | ❌ |
| % da poupança | Honey "you saved" | Só se contrafactual auditável | Jurídico (acção Honey), disputa Tesla | ❌ até classe (a) madura |
| Por log/pedido | Portkey, Helicone | Neutro; penaliza uso do local (que é o objectivo) | Comportamental | ❌ |
| **Flat por utilizador/ano, 1 chave = frota, free-core** | Obsidian, Tailscale, JetBrains | ✅ Custo marginal ~0; o Moo Token é odómetro no extrato, não factura | Preço é decisão do dono, exige tabela de comparáveis (M12) | 🔥 **Recomendado** (coincide com 01/09) |
| Degrau metered opcional | BYOK via gateway com "rota Mooter = desconto" | Só depois do M1 (obediência) e veto de egresso | — | 🔜 Fase 2 |

**Sem promessa de poupança no preço.** O que se vende: não parar a meio (quota preservada), o que é sensível não sai, e um extrato que o financeiro reconhece (ESR, cobertura, custo por tarefa).

---

## 10. Gauntlet — as perguntas que mordem (mapa §10)

| # | Pergunta | Morde? |
|---|---|---|
| 1 | Tem tokens medidos por trás? | 🔴 **Morde em tudo o que é Moo Token hoje** — 1/156 linhas com tokens; bench só `tokens_out`. Toda a §3 e §7.3 é desenho, com `n/d` até captura |
| 2 | Quem produziu o número? | ✅ Externos com URL; internos do SYNC de hoje |
| 5 | Facto externo rotulado? | ✅ Todos em tabelas separadas, com fonte |
| 6 | Reverte decisão canónica? | ✅ Não — confirma "sem poupança sem tokens", "licença flat", "não % de fluxo"; acrescenta Moo Token = odómetro |
| 7 | Rota executada ou só emitida? | 🔴 **Obediência 0%** — sem execução não há Moo Tokens de nada; a captura de tokens só faz sentido com o M1 |
| 10 | Denominador trocado? | ⚠️ 91,4% é score de treino; usar 82,9% (pré-rótulos) ou dizer "treino" |

---

## 11. Decisões do dono (o que este estudo pede)

| # | Decisão | Opção recomendada | Consequência |
|---|---|---|---|
| D1 | Moo Token: moeda ou odómetro? | **Odómetro** (1 MT = 4 chars) | Nome fica; nunca aparece numa factura |
| D2 | Unidade de cobrança | **Flat/ano por utilizador, 1 chave = frota, free-core** | Exige tabela de comparáveis com URL+data antes da ata (M12) |
| D3 | Recibo por prompt: 3 preços + egresso + veredicto | Sim, com "assumida"/"n/d" visíveis | Item transversal nº6 do mapa ("tokens por prompt") passa a ter esquema fechado |
| D4 | Onde guardar | Local-first + beacons agregados | Nada de prompts sai; nuvem só na fase multi-utilizador |
| D5 | Matriz PF vs PJ | Sim; recibo com coluna "quota" (PF) e "US$ rate card" (PJ) | Política de egresso/treino declarada por canal |
| D6 | O que entra no one-pager | Metáfora do híbrido + provas de 7.2 + extrato com `n/d` | Zero números de poupança até classe (a) ≥20 tarefas |
| D7 | Ordem de execução (quando voltar a código) | M1 (obediência) → captura de tokens/chars/energia no hook → catálogo vivo (U1) → extrato → par real ≥20 | Sem M1, tudo o resto mede recomendações que ninguém executa |

**Adversário obrigatório:** conclusão com consequência (D1, D2) exige refutação em motor diferente (codex) registada no vault antes da ata.

---

## 12. Fontes (web 2026-09-10; selecção — lista completa nos 3 relatórios de subagente)

Routers/gateways: openrouter.ai/docs/faq · openrouter.ai/blog/insights/opus-47-tokenizer-analysis · openrouter.ai/docs/features/model-routing · notdiamond.ai/pricing · withmartian.com/post/introducing-routerbench · requesty.ai/pricing · docs.requesty.ai/features/cost-tracking · portkey.ai/pricing · docs.litellm.ai/docs/proxy/cost_tracking · docs.arcee.ai/arcee-conductor/pricing · arcee.ai/blog/ai-model-routing-for-maximum-savings · vercel.com/docs/ai-gateway/pricing · developers.cloudflare.com/ai-gateway/reference/pricing · helicone.ai/pricing · kilo.ai/efficient-vs-frontier · cursor.com/blog/june-2025-pricing · github.blog/…/github-copilot-is-moving-to-usage-based-billing · docs.github.com/…/model-multipliers-for-annual-plans · visualstudiomagazine.com/articles/2026/06/04/copilot-billing-shock · arxiv.org/html/2406.18665v4 (RouteLLM) · arxiv.org/pdf/2403.12031 (RouterBench) · arxiv.org/html/2510.00202 (RouterArena) · stripe.com/newsroom/news/stripe-agrees-to-acquire-openrouter
Subscrições: claude.com/pricing · support.claude.com (11049741, 9266767, 9797531, 11647753, 12429409, 14782391) · code.claude.com/docs/en/costs · platform.claude.com/docs/en/about-claude/pricing · chatgpt.com/pricing · help.openai.com (11369540, 20001106, 11481834, 20001415) · openai.com/business/pricing · one.google.com/about/google-ai-plans · gemini.google/br/subscriptions · geminicli.com/docs/resources/quota-and-pricing · docs.github.com/en/copilot/get-started/plans · cursor.com/docs/models-and-pricing · kimi.com/en/help/membership/membership-overview · ccusage.com/guide/cost-modes · dev.to/savi444/tokens-per-word · developersdigest.tech/blog/claude-tokenizer-change-cost-impact
Contabilidade/armazenamento: opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai · github.com/langfuse/langfuse/issues/12306 · platform.claude.com/docs/en/api/messages · docs.ollama.com/api/usage · raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json · posthog.com/docs/llm-analytics/calculating-costs · docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api · kunalganglani.com/blog/local-llm-cost-breakeven · popularai.org/p/mac-mini-llm-performance-in-2026
Prova de benefício: ceepr.mit.edu/?p=13015 (Opower/Allcott) · tesla.com/support/tesla-app/charge-stats · cohenmilstein.com/case-study/in-re-paypal-honey · finops.org/wg/how-to-calculate-effective-savings-rate-esr · repost.aws (Savings Plans utilization/coverage) · artificialanalysis.ai/methodology · hal.cs.princeton.edu/swebench · metr.org/blog/2026-07-21-expenditure-horizon · fda.gov (Nutrition Facts)
Internas: `~/frugal/SYNC.md` (tail 10/09) · `tools/router/ledger-*.js` · `_handoff/agent-sync/events.jsonl` · `_handoff/mooterbench-20260830T101145.jsonl` · Project: `CORRECOES_APOS_CONFRONTO_E_V_2026-09-10` · `ESTRATEGIA_O_RECIBO_E_O_PRODUTO_2026-08-28` · `ESTUDO_OPENROUTER_MOTOR_ROTEAMENTO_2026-08-28` · `ROADMAP_MOO_PILOT_PERFEITO_E_COBRAVEL_2026-09-01` · `MOOTER_MAPA_E_ROADMAP_2026-08-25`
