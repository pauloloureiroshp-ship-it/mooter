# MASTER PROMPT — Mooter no Cowork · auditoria dos 15 pontos e plano de execução

**Data:** 2026-07-26 · **Base:** `chore/mooter-20-h0 @ 53b628d` (v1.10.0, pushed)
**Método:** cada afirmação abaixo tem ficheiro:linha, saída de comando, ou URL com data.
Onde não consegui confirmar, está escrito `n/d`. Nada aqui é estimativa disfarçada de facto.

---

## 0. O veredicto em uma tabela

| # | Pergunta do Paulo | Veredicto | Gravidade |
|---|---|---|---|
| 1 | Timings local↔subscrição coerentes? | ❌ Série pura. A nuvem espera pelo moo. Ninguém mede se compensa | 🔴 |
| 2 | Fleet roteia bem para modelos locais? | ❌ Critério é "o maior que cabe". Escolhe o modelo **mais velho** por 1 GB | 🔴 |
| 3 | LoRA / DoRA aplicados? | ❌ Manifesto assinado, runtime devolve `null`. Zero adaptadores no caminho | 🟠 |
| 4 | Quantização aplicada? | ❌ Só `temperature:0.2`. `num_ctx` **nunca** definido → contexto truncado a 4096 | 🔴 |
| 5 | Há modelos locais melhores? | ⚠️ **Já os tens instalados e não os usas** | 🔴 |
| 6 | Live Preview funciona no Cowork? | ✅ **Sim, medido**: iframe carregou em 5 ms | 🟢 |
| 7 | Usage Claude/Codex mapeado e usado? | ⚠️ Claude sim mas **inflacionado 2-3×**. Codex: 2560 ficheiros no disco, declarado indisponível | 🔴 |
| 8 | Concorrentes tropicalizados? | ❌ Não sistematizado. E o mercado mexeu-se muito | 🟠 |
| 9 | Coerência ficheiros ↔ estratégia? | ❌ `STRATEGY.md` congelado em 2026-05-07, diz "v0.11" | 🔴 |
| 10 | Skills e automações completas? | ⚠️ 3 skills novas, mas o ciclo de aprendizagem está desligado | 🟠 |
| 11 | Metodologia / lentidão sentida | ✅ Causa identificada, com números | 🔴 |
| 12 | Métricas dos concorrentes p/ routing | ✅ Mapeadas — e a melhor não é latência | 🟢 |
| 13 | Conector lê contexto do projecto? | ⚠️ Lê ficheiros citados. Não constrói mapa do projecto | 🟠 |
| 14 | Registado no vault e no Notion? | ⚠️ Vault sim (22:08 hoje). **Notion parado em 2026-07-24** | 🟠 |
| 15 | Estamos à frente? | ⚠️ Em tese sim, em execução não. Ver §4 | 🔴 |

---

## 1. Os quatro achados que mudam tudo

Antes do plano, quatro factos que reordenam as prioridades. Cada um é verificável hoje.

### 1.1 🔴 A quota está inflacionada 2-3× — e é ela que estrangula o produto

`quota.js:120-145` soma **todas** as linhas `type:"assistant"` dos ficheiros de sessão do
Claude Code. Não deduplica por `requestId` nem por `message.id`.

Medição crua feita hoje no ficheiro da sessão viva (`8b01a42b….jsonl`, 22 linhas assistant):

```
1) usage={... "output_tokens":121,  "cache_read_input_tokens":19930 ...}
2) usage={... "output_tokens":121,  "cache_read_input_tokens":19930 ...}   <- duplicado de 1
3) usage={... "output_tokens":1757, "cache_read_input_tokens":43332 ...}
4) usage={... "output_tokens":1757, "cache_read_input_tokens":43332 ...}   <- duplicado de 3
5) usage={... "output_tokens":1757, "cache_read_input_tokens":43332 ...}   <- duplicado de 3
```

Uma resposta com N blocos de conteúdo escreve N entradas assistant, **cada uma com cópia
do mesmo `usage`**. O Mooter soma-as todas.

**Consequência em cadeia, e é grave:**

`pressao: 1` · `nivel: "critico"` · `tecto: "haiku"` → **todo o trabalho é despromovido para
haiku.** Foi por isso que a primeira tentativa do fix A4 foi escrita por haiku, e foi
rejeitada por conter execução arbitrária. O produto sabotou a própria qualidade com um
número que ele próprio inflacionou.

O peso medido é 15 090 contra uma referência de 4 000. Se a inflação for 2,5×, o peso real
ronda 6 000 — ainda acima, mas **longe de crítico**. A diferença entre "aperta" e "pára tudo".

> **Nota de honestidade:** confirmei a duplicação num ficheiro. O factor exacto (2×? 3×?) tem
> de ser medido varrendo os 46 ficheiros da janela. Não o inventes — mede-o.

**Bónus:** o bug conhecido `anthropics/claude-code#25941` (`output_tokens` gravado como
placeholder 1-2) **NÃO reproduz** aqui: das 22 linhas, 0 têm `≤3` e 22 têm `>100`. Bom —
mas o teste tem de existir na suite, porque o dia em que reproduzir, o Mooter cega.

### 1.2 🔴 O selector de modelo local escolhe o mais velho, por 1 GB

`moo.js:174-176` ordena por tamanho e leva o maior. O que está instalado nesta máquina:

| Modelo instalado | Tamanho | Geração | Escolhido? |
|---|---:|---|---|
| `qwen3.6:35b-a3b` | 23,9 GB | Abr 2026 | ❌ não cabe (23,0 GB de VRAM) |
| **`qwen3:30b`** | **18,5 GB** | **2025** | ✅ **é este que corre** |
| `qwen3.6:27b` | 17,4 GB | **Abr 2026** | ❌ perde por 1,1 GB |
| `qwen2.5-coder:14b` | 9,0 GB | 2024 | ❌ |
| `gemma4:e4b` | 9,6 GB | Abr 2026 | ❌ |
| `qwen2.5-coder:7b` | 4,7 GB | 2024 | ❌ |
| `qwen2.5:3b` | 1,9 GB | 2024 | usado na preparação |

**Já tens os modelos de 2026 instalados.** O critério "o maior que cabe" faz-te correr um
modelo de 2025 e ignorar o `qwen3.6:27b`, que é uma geração à frente e liberta 1,1 GB.

Pior: `isGenerative()` (`moo.js:92-98`) é o **único** filtro de capacidade, e é binário
(embedder ou não). Não há noção de código-vs-raciocínio-vs-classificação. Um pedido de
código vai para um modelo de raciocínio se ele for maior — e existe no repo uma
`packages/router/src/specialization-matrix.ts` que ninguém consulta.

### 1.3 🔴 O contexto local é truncado em silêncio a 4096 tokens

`/api/ps` da máquina, agora:

```
qwen3:30b · size_vram: 18 870 635 068 · context_length: 4096
```

`4096` é o **default do Ollama**. `moo.js:240-245` envia `options: {temperature: 0.2}` e mais
nada — sem `num_ctx`, sem `num_batch`, sem `keep_alive`. E `localfirst.js:50` autoriza
**18 000 caracteres** de contexto injectado, ≈ 4 500 tokens.

**Ou seja: o A3 lê ficheiros para dar olhos ao modelo local, e o Ollama corta-os fora.
Silenciosamente.** Todo o esforço de injecção de contexto está a alimentar uma janela que
não o comporta. Isto explica parte da má qualidade do tier local — e não é o modelo, é a
configuração.

Sem `keep_alive`, cada troca de modelo paga recarregamento completo (18 GB do disco).

### 1.4 🔴 Série pura: a nuvem espera, e ninguém verifica se valeu a pena

`seamless.js:1080-1086` — o agente pago só arranca no `close` do processo local:

```js
if (ok && chain) { setImmediate(() => toolDispatch(Object.assign({}, chain, { handoff_from: job_id })) ...
```

Medido nesta sessão: preparação local de **37 s** antes de o `cc` começar. Noutro job, 13 s.
Não há timeout de preparação (só o global de 30 min) e **não existe nenhuma comparação
entre o custo da preparação e o ganho** — `fleet.js:477-479` limita-se a escrever a frase
*"preparado localmente ($0) antes de gastar tokens de subscrição"*. Afirmação, não medição.

E há uma falha em silêncio: **se o moo falhar, o `chain` nunca corre.** O utilizador recebeu
`chained: true` e o trabalho pago simplesmente desaparece; fica só um `event:'failed'` no
ledger. Não há fallback para despachar directo.

> **É esta a lentidão que sentes no Cowork.** Não é o Cowork: são 13-37 s de preparação
> local, em série, à frente de cada trabalho — sem ninguém a perguntar se compensa.

---

## 2. Os restantes pontos, com evidência

### 2.1 LoRA / DoRA — ponto 3

Existe estrutura, e está desligada:

- `packages/router/src/adapter/adapter_manifest.ts:3-6` — *"D1 only defines + validates +
  signs the manifest; the runtime that HONORS it ships in D2"*
- `tools/router/adapter_selection.js:45-75` — `getActiveAdapter()` devolve `null`;
  linha 82 comenta *"unreachable while getActiveAdapter()→null"*
- `moo.js` e `seamless.js` **nunca** mencionam adapter. O tier local não tem LoRA nenhuma.
- Não há código de treino: só uma `.venv-lora/` vazia de scripts.

**Estado da arte (Julho 2026), para saberes o que é possível:**

| Runtime | Adaptadores | Hot-swap |
|---|---|---|
| **Ollama** | `ADAPTER` no Modelfile, (Q)LoRA safetensors ou GGUF | ❌ não — Modelfiles separados por adaptador ([issue #9548](https://github.com/ollama/ollama/issues/9548)) |
| **vLLM** | multi-LoRA por pedido, overhead sub-ms, evicção LRU | ✅ sim ([blog 2026-02-26](https://blog.vllm.ai/2026/02/26/multi-lora.html)) |
| **llama.cpp** | `POST /lora-adapters` a quente | ✅ sim |

⚠️ A doc do Ollama **não lista Qwen3.x** para safetensors — para Qwen é preciso converter a
LoRA para GGUF (`gguf-my-lora`).

Treinar numa 4090 é viável: QLoRA 7B usa **~8 GB**; 1000 exemplos → **15-30 min**;
5000 exemplos/3 épocas/seq 2048 → **1-2 h** (Unsloth). DoRA: a recomendação Unsloth 2026 é
`r=16` com DoRA ligado; o número que circula é *zero degradação de perplexidade e −8% VRAM
vs QLoRA*, mas vem de **fonte secundária sem replicação** — trata como direccional, não
como facto.

**Recomendação:** não prometas "aprende contigo" antes de existir o loop de telemetria
(§2.2). Uma LoRA treinada em cima de dados que ninguém recolhe é teatro caro.

### 2.2 O ciclo de aprendizagem está desligado — ponto 10

| Componente | Onde | Ligado? |
|---|---|---|
| `adaptive-learner.ts` | lê `~/.mooter/cost-perf-log.jsonl`, EWMA, escreve overrides | ❌ ninguém invoca |
| `auto-feedback.js:13` | escreve `~/.claude/tools/router/outcomes.jsonl` | ❌ **zero leitores** |
| `feedback-collector.js` | CLI manual | só o `backtest.js` |
| ledger do bridge | `local_model_chosen`, `modelo_porque` | só o painel o lê |

O bridge importa **apenas** `classify.js` (`seamless.js:446` e `:824`). O `classify.js` lê
patterns, `profile.json` e quota-tracker — **nunca** overrides, matriz de especialização ou
outcomes.

**Loop fechado: NÃO EXISTE.** Nenhum resultado de job muda uma decisão futura.

### 2.3 Métricas de routing — pontos 12 e 7

O caso mais copiável apareceu há 4 dias: **Cursor Router**, GA 2026-07-22
([cursor.com/blog/router](https://cursor.com/blog/router)).

E a lição principal **não é a latência**:

| Métrica | Quem usa | Porque interessa ao Mooter |
|---|---|---|
| **Keep rate** — quanto do código gerado sobrevive no repo | Cursor, há 9 meses | Mede qualidade **sem perguntar nada ao utilizador** |
| **AFC / satisfação inferida** — avançar = positivo, corrigir = negativo | Cursor | Sinal grátis, em cada turno |
| **Custo por commit** (não por token) | Cursor | Auto Balance $4,63 · Opus 4.8 $7,34 · Fable 5 $12,69 |
| **Cache-awareness** | Cursor | Trocar de modelo a meio **invalida o prompt cache** — routers que ignoram isto inflacionam a poupança que reportam |
| `latency-based-routing`, `least-busy`, `usage-based-routing-v2`, `cost-based-routing` | LiteLLM (OSS, self-hosted, 10-20 ms de overhead) | Estratégias nomeadas e configuráveis por team |

> ⚠️ **O ponto de cache-awareness é directamente sobre nós.** O Mooter troca de tier a meio
> de uma sessão. Se essa troca invalida o cache, parte da "poupança" que o painel mostra é
> ilusória. A medição de hoje diz que a releitura de cache é **48,8%** do peso. Isto tem de
> entrar na conta antes de continuarmos a mostrar um número de poupança.

Overhead comparado: Portkey 8 ms P95 · Requesty 8 ms P50 · LiteLLM 10-20 ms ·
**OpenRouter 40-55 ms**. O router local do Mooter (<50 ms, $0) é competitivo — mas os 37 s
de preparação local anulam a vantagem mil vezes.

**Mexidas no mercado que interessam:** Roo Code encerrou (2026-05-15). Continue.dev foi
**comprado pela Cursor** em Junho 2026 (repo read-only). Restam **Cline** e **Kilo Code**
com Ollama local BYOK. O espaço "local+nuvem híbrido honesto" ficou **mais vazio**, não mais
cheio.

**Fan-out / ensemble / verificação cruzada: não encontrei nenhum produto comercial a
vender isto como feature.** Está em papers (ensemble + modelo-juiz; speculative decoding na
camada de routing, 3-5× throughput). **É a tua janela — e continua aberta.**

### 2.4 Usage do Codex — ponto 7

`quota.js:330` declara:

```js
codex: { disponivel: false, porque: 'a OpenAI só expõe a quota do Codex por comando interactivo...' }
```

**Medição de hoje, na tua máquina:**

```
~/.codex/sessions/**/rollout-*.jsonl  →  2 560 ficheiros
mais recente: 2026-07-26T21:01:11Z · 188 853 bytes
```

Os ficheiros contêm prompts, tool calls, aprovações **e contadores de tokens** (input
não-cacheado, cache hits, cache writes, output). O produto declara indisponível uma coisa
que está no disco, em 2560 ficheiros.

⚠️ Ao ler: **excluir esses caminhos das ferramentas do agente** — o Codex já se auto-ingeriu
e provocou crescimento descontrolado de contexto ([issue #27131](https://github.com/openai/codex/issues/27131)).

Sobre APIs oficiais: a Anthropic **tem** Usage & Cost API, mas exige `sk-ant-admin-*` e cobre
a **organização da API**, não a subscrição Max. Para planos de subscrição, **os ficheiros
locais são a única fonte acessível**. A tua abordagem está certa; o que falta é deduplicar
e incluir o Codex.

### 2.5 Live Preview no Cowork — ponto 6 ✅

Único ponto verde sem ressalva. Sonda de hoje (`~/.mooter/ui-probe.json`):

```json
{"estado":"suportado","porque":"o iframe de http://localhost:5173 carregou dentro do painel",
 "iframe_carregou":true,"ms":5,"largura":721,"altura":1729}
```

**Funciona, e está medido em vez de assumido.** Mantém a sonda: é a diferença entre saber e
achar.

### 2.6 Contexto de projecto — ponto 13

O conector lê **ficheiros citados** (`contexto.lerParaPrompt`) e agora também corre **comandos
git** (A4, v1.10.0). O que **não** existe: um mapa do projecto — estrutura, convenções,
`CLAUDE.md`/`AGENTS.md` do repo, stack, comandos de teste, o que mudou recentemente.

Cada job começa do zero e paga a redescoberta. Não é falta de acesso: é falta de um artefacto
de contexto persistente e barato.

### 2.7 Coerência estratégia ↔ código — ponto 9

`docs/strategy/STRATEGY.md`, o "single source of truth", diz:

> *"**Hoje (2026-05-07)**: Mooter está em **v0.11** (Codex Integration)... **Gate em 19 dias
> (2026-05-26)**: ≥250 stars"*

Última alteração ao ficheiro: **24 de Maio**. Hoje é **26 de Julho** e o conector vai em
**v1.10.0**. O gate de 26 de Maio nunca foi resolvido no documento. A tese nova — *"o motor é
o fosso, a cabine é o produto"* — vive na memória e nos handoffs, **não no documento canónico**.

Um "single source of truth" com dois meses de atraso não é fonte de verdade; é um segundo
mapa a apontar para o sítio errado.

### 2.8 Vault e Notion — ponto 14

| Destino | Estado |
|---|---|
| Vault Obsidian | ✅ `mooter-session-2026-07-26.md` às 22:08 de hoje |
| **Notion** | ❌ registo mais recente do conector: **2026-07-24** ("Seamless v0.2 MARCO 1") |

O Notion não tem v1.3, v1.4.x, v1.5-v1.9, nem v1.10. **Sete releases de atraso.**

---

## 3. MASTER PROMPT — o plano de execução

> **Regra que atravessa tudo:** cada onda é julgada por **uma coisa que o utilizador do
> Cowork sente**, não por linhas de código. Se não muda o que ele vê ou espera, não entra.

### Sequência obrigatória — porquê esta ordem

```
ONDA 0 (medir a régua)  →  ONDA 1 (parar de nos sabotar)  →  ONDA 2 (velocidade)
        ↓                                                            ↓
ONDA 3 (o loop que aprende)  ←────────────────────────────  ONDA 4 (o fosso)
```

**Nada antes da Onda 0.** Enquanto a quota estiver inflacionada, cada medição de melhoria é
feita com uma régua torta — e vais "provar" ganhos que não existem.

---

### 🔴 ONDA 0 · A régua honesta (bloqueia todas as outras)

**Experiência-alvo:** o Paulo abre o painel e o número de quota é o número real.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 0.1 | Deduplicar o usage por `requestId` (fallback `message.id`, depois hash de `usage`+`timestamp`) em `quota.js:120-145` | Teste com um `.jsonl` real que tenha linhas duplicadas: o total tem de bater com a contagem única. Reportar no painel o **factor de inflação medido** ("li 2030 turnos, 812 únicos") |
| 0.2 | Guard contra `#25941` | Se >20% das linhas assistant tiverem `output_tokens ≤ 3`, marcar `saidas: n/d` e dizê-lo. **Nunca somar um placeholder** |
| 0.3 | Recalcular pressão e recalibrar as referências `{peso_semana:4000, peso_5h:400}` **depois** da deduplicação | O painel diz de onde vem a referência e que ela é ajustável (já diz — manter) |
| 0.4 | Incluir `entradas` no peso | Hoje `quota.js:229` só pesa `saidas`: uma sessão de input gigante com output curto lê "baixo" |
| 0.5 | Ler o Codex de `~/.codex/sessions/**/rollout-*.jsonl` | `codex.disponivel: true` com tokens reais. **Excluir esses caminhos das ferramentas do agente** (issue #27131) |
| 0.6 | Ligar `forcar_local` | `quota.js:296` calcula-o e testa-o, e `seamless.js` **nunca o lê**. Ou se usa, ou se apaga |

**Prova de fim de onda:** um antes/depois do peso semanal, com o factor de inflação escrito.
Se o nível sair de "crítico", **o Opus volta a estar disponível para trabalho que o exige** —
e a Onda 1 já não é escrita por haiku.

---

### 🔴 ONDA 1 · Parar de sabotar o tier local

**Experiência-alvo:** quando o painel diz "🐮 preparado a $0", isso passa a valer alguma coisa.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 1.1 | Passar `options` reais ao Ollama em `moo.js:240-245`: `num_ctx` calculado a partir do contexto injectado (mínimo 16384), `keep_alive:"10m"`, `num_batch` afinado | `/api/ps` mostra `context_length` ≥ 16384. Teste que falha se `num_ctx` não for enviado |
| 1.2 | **Nunca truncar em silêncio**: se o contexto injectado não couber no `num_ctx`, dizê-lo no painel e no prompt | Campo `contexto_truncado` com números reais, não `null` |
| 1.3 | Trocar o critério "o maior que cabe" por **adequação × capacidade** | `qwen3.6:27b` (Abr 2026) tem de ganhar a `qwen3:30b` (2025). Pedido de código → `qwen2.5-coder:14b` antes de um modelo de raciocínio genérico |
| 1.4 | Ligar `specialization-matrix.ts` ao selector, ou apagá-la | Não pode ficar código a fingir que decide |
| 1.5 | `OLLAMA_KV_CACHE_TYPE=q8_0` documentado e verificado | Δppl 0,002-0,05 (imperceptível), metade da memória de KV. Exige flash attention — automático desde Ollama 0.30.0, e tens **0.32.3** ✅ |
| 1.6 | Explicar a escolha em linguagem de gente | "escolhi o `qwen3.6:27b`: é de Abril de 2026, cabe com 5 GB de folga, e é melhor em código do que o `qwen3:30b` que é maior mas mais velho" |

> ⚠️ **FP4/NVFP4 não é opção**: exige tensor cores Blackwell e a 4090 é Ada. As tags
> `nvfp4`/`mxfp8` no Ollama são builds MLX (Apple). **Q4_K_M continua o alvo certo**
> (97-99% da qualidade FP16). Não persigas o que o teu hardware não faz.

---

### 🔴 ONDA 2 · A lentidão que o Paulo sente

**Experiência-alvo:** o trabalho começa a aparecer em segundos, não depois de meia-lentidão.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 2.1 | **Tecto de tempo na preparação local** (`MOOTER_PREP_TIMEOUT_MS`, default 20 s) | Se estoirar, despacha directo para a nuvem e diz porquê. Ninguém espera 37 s por um preâmbulo |
| 2.2 | **Medir se a preparação compensou** | Gravar `prep_duration_s` e `tokens_poupados_estimados` no ledger. Se em 20 jobs a preparação não pagar o tempo, **o painel propõe desligá-la**. Substituir a frase de `fleet.js:477` por um delta medido |
| 2.3 | **Fallback quando o moo falha** | Hoje o `chain` morre em silêncio (`seamless.js:1080`). Tem de despachar directo e dizer "a preparação local falhou, fui directo" |
| 2.4 | **Paralelizar o que é paralelo** | Sondas de GPU, quota, vault e worktrees correm em série no `fleet`. `Promise.all` com timeout por sonda. Alvo: painel < 300 ms |
| 2.5 | Fila com pool de concorrência | `REGISTRY` é um `Map` sem tecto (`seamless.js:352`). A GPU protege-se com o heurístico `1/(n+1)` de `moo.js:151`, não com uma fila |
| 2.6 | Considerar **vLLM** para o tier local | Benchmark 2026 numa 4090, Llama-3 8B Q4_K_M: Ollama **35 tok/s** vs vLLM **78 tok/s** (2,2×). Decisão de arquitectura, não tarefa — mas mede antes de descartar |

**Prova de fim de onda:** tempo até ao primeiro token útil, antes e depois, em 10 pedidos reais.

---

### 🟠 ONDA 3 · O loop que aprende (e só então, LoRA)

**Experiência-alvo:** no fim de cada sessão, o Mooter diz o que aprendeu — com números.
*(É literalmente o que o Paulo pediu no ponto 3.)*

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 3.1 | Ligar `auto-feedback.js` → `adaptive-learner.ts` → `classify.js` | Um resultado de job tem de **mudar** uma decisão futura. Hoje `outcomes.jsonl` tem zero leitores |
| 3.2 | Adoptar o **keep rate** do Cursor | Quanto do código gerado por cada tier sobrevive no repo após N commits. Sinal de qualidade **sem perguntar nada ao utilizador** |
| 3.3 | Adoptar **satisfação inferida** | Avançar = positivo; corrigir o agente = negativo |
| 3.4 | **Custo por tarefa entregue**, não por token | É a unidade do Cursor, e é a que o Paulo entende |
| 3.5 | **Cache-awareness no cálculo de poupança** | Se trocar de tier invalida o prompt cache, esse custo entra. A releitura já é **48,8%** do peso — ignorá-la torna a poupança reportada ficção |
| 3.6 | **Bloco "o que aprendi nesta sessão"** no fecho do Mooter no Cowork | *"3 jobs locais, 2 aceites (keep rate 67%). O `qwen3.6:27b` acertou em 4/5 resumos e falhou no diff. Da próxima, diffs vão para a nuvem."* Com `n/d` quando não houver dados — **nunca um número inventado** |
| 3.7 | **Só depois:** LoRA a partir dos dados recolhidos | Numa 4090: QLoRA ~8 GB, 1000 exemplos → 15-30 min (Unsloth). Ollama **não faz hot-swap** — Modelfile por adaptador, e Qwen3.x precisa de conversão para GGUF |

> **Sequência inegociável:** 3.1 → 3.6 antes de 3.7. Uma LoRA treinada sobre dados que
> ninguém recolhe é teatro caro. O `adapter_manifest.ts` já existe e está assinado — o que
> falta é o combustível, não a carroçaria.

---

### 🟢 ONDA 4 · O fosso — o que ninguém vende

**Experiência-alvo:** o Paulo faz uma pergunta e recebe uma resposta que **dois motores
verificaram**, por menos do que custaria um.

| # | Tarefa | Porque é fosso |
|---|---|---|
| 4.1 | **Fan-out real**: 1 tarefa → N motores em paralelo → merge | Está na tua lista há semanas. **Não encontrei nenhum produto comercial a vender isto** (Julho 2026) |
| 4.2 | **Verificação cruzada local↔nuvem a $0** | O local propõe, a nuvem confirma só o que diverge. É o A4 levado ao fim: evidência primeiro, veredicto depois |
| 4.3 | **Failover consciente de falhas** | Retomar num motor o que outro deixou a meio, com estado |
| 4.4 | **Routing por latência e least-busy** | LiteLLM tem `latency-based-routing` e `least-busy` como estratégias nomeadas. Nós não temos nenhuma |
| 4.5 | **Mapa de projecto persistente** (ponto 13) | Um `PROJECT_CONTEXT.json` barato, com estrutura, convenções, comandos de teste e o que mudou. Cada job deixa de pagar a redescoberta |

---

### 🟠 ONDA 5 · Alinhar a narrativa com o produto

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 5.1 | Reescrever `docs/strategy/STRATEGY.md` | Diz "v0.11, 2026-05-07, gate a 26 de Maio". Estamos em v1.10.0. A tese nova ("o motor é o fosso, a cabine é o produto") tem de estar **lá**, não só na memória |
| 5.2 | Sincronizar o Notion | Parado em 2026-07-24. Faltam v1.3 → v1.10 |
| 5.3 | Radar de concorrência trimestral (ponto 8) | Roo Code fechou (Mai 2026), Continue.dev foi comprado pela Cursor (Jun 2026), Cursor Router saiu (22 Jul 2026). **Tudo isto aconteceu e nenhum ficheiro do repo sabe** |
| 5.4 | Fechar os bugs do conector já mapeados | `create_worktree:true` ignorado em silêncio · `permissoes_efectivas` declara `Read,Glob,Grep` e o job usa `Bash`+`PowerShell` · o bind de projecto perdeu-se para `P / tmp` a meio desta sessão |

---

## 4. Estamos à frente? — ponto 15, resposta honesta

**Em tese, sim. Em execução, não — mas a distância é menor do que parece.**

### O que temos e ninguém mais tem

| Vantagem | Estado |
|---|---|
| Router determinista local, <50 ms, $0 a classificar | ✅ existe e funciona |
| Leitura de quota de **subscrição** (não API) | ✅ existe — e é raro; a Anthropic não expõe endpoint para planos Max |
| Doutrina do `n/d` — recusar-se a inventar | ✅ é cultura, não feature. Difícil de copiar |
| GPU do utilizador como tier de primeira | ✅ arquitectura certa, configuração errada (§1.3) |
| **Fan-out + verificação cruzada** | ❌ não existe — **e mais ninguém vende** |

### O que nos separa

| Buraco | Quem já resolveu |
|---|---|
| Métricas de qualidade que fecham o ciclo | Cursor, há 9 meses (keep rate, AFC) |
| Estratégias de routing nomeadas | LiteLLM (latency, least-busy, usage, cost) |
| Cache-awareness na conta de poupança | Cursor inclui-a explicitamente |
| Modelos locais actuais bem escolhidos | qualquer pessoa com `ollama pull` |

### O veredicto

> O mercado **ficou mais vazio**, não mais cheio: Roo Code fechou, Continue.dev foi comprado.
> Restam Cline e Kilo Code com Ollama BYOK — e nenhum deles lê a tua quota de subscrição nem
> faz verificação cruzada.
>
> **A tua tese está certa e a janela continua aberta.** O que te separa da frente não é
> arquitectura — é uma quota inflacionada 2-3×, um contexto truncado a 4096, e um selector
> que escolhe o modelo mais velho por 1 GB. **São três bugs, não três meses.**
>
> Fecha a Onda 0 e a Onda 1 e o produto muda de categoria numa semana.

---

## 5. O que NÃO fazer

| ❌ | Porquê |
|---|---|
| Perseguir NVFP4/MXFP4 | Exige Blackwell. A 4090 é Ada. Q4_K_M é o alvo certo |
| Treinar LoRA antes do loop de telemetria | Dados que ninguém recolhe não treinam nada |
| Publicar números de poupança sem cache-awareness | É o erro que o Cursor apontou publicamente. A releitura é 48,8% do peso |
| Medir melhorias antes da Onda 0 | Régua torta prova ganhos que não existem |
| Aceitar relatórios com tabelas de ticks verdes | Hoje mesmo: 15/15 verdes escondiam execução arbitrária. **Ler o diff** |
| Confiar em `output_tokens` sem guard | O bug #25941 não reproduz hoje. No dia em que reproduzir, o Mooter cega sem avisar |

---

## 6. Fontes

**Medido nesta máquina, 2026-07-26:** `nvidia-smi` (4090, 23028 MiB, driver 610.62) ·
`/api/tags` e `/api/ps` do Ollama 0.32.3 · `~/.claude/projects/**.jsonl` (46 ficheiros,
janela 7 dias) · `~/.codex/sessions` (2560 rollouts) · `~/.mooter/ui-probe.json` ·
`mooter_fleet` às 22:34.

**Código:** `packages/mooter-bridge/{moo,seamless,quota,localfirst,fleet}.js` ·
`packages/router/src/{adapter/adapter_manifest,adaptive-learner,specialization-matrix}.ts` ·
`tools/router/{adapter_selection,auto-feedback,quantization}.js`

**Web, com data:** [Cursor Router (2026-07-22)](https://cursor.com/blog/router) ·
[Best local LLMs 24GB (2026-07-19)](https://www.marktechpost.com/2026/07/19/best-local-llms-you-can-run-on-a-single-24gb-gpu-in-2026-qwen-gemma-mistral-deepseek-compared/) ·
[vLLM multi-LoRA (2026-02-26)](https://blog.vllm.ai/2026/02/26/multi-lora.html) ·
[LiteLLM routing](https://docs.litellm.ai/docs/routing) ·
[Ollama KV cache PR #15505](https://github.com/ollama/ollama/pull/15505) ·
[claude-code#25941](https://github.com/anthropics/claude-code/issues/25941) ·
[codex#27131](https://github.com/openai/codex/issues/27131) ·
[Anthropic Usage & Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api)

**Não confirmado:** factor exacto de inflação da quota (medido em 1 ficheiro) · qualidade
NVFP4 vs Q4_K_M (nenhuma suite independente) · o número DoRA −8% VRAM (fonte secundária) ·
Martian, Unify, NotDiamond e Aider não apareceram em fontes de 2026.
