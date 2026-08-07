# BRIEF — LIMPEZA DE CONTEXTO v1.1 · Episódio 1 da SENTINELA DA FUNDAÇÃO

**Estado:** rescrita do `BRIEF_LIMPEZA_CONTEXTO_2026-08-07.md` (v1.0) depois do **NO-GO** do Codex.
**Data:** 2026-08-07 · **Padrão-alvo** (Anthropic/Boris Cherny, verificado 2026-08-07): CLAUDE.md = ruleset vivo, ~4k tokens de referência, editar sem dó ATÉ a taxa de erro cair MENSURAVELMENTE; progressão prosa → slash commands → skills → hooks; contexto distribuído com ponteiros, não centralizado.

---

## 0. TRAVA DE EXECUÇÃO — nada disto corre ainda

> **A EXECUÇÃO DA LIMPEZA ESTÁ TRANCADA** até se verificarem **as duas** condições:
>
> 1. **`_handoff/piloto/resultado.md` existe** e é posterior ao último `meta.json` da bateria; e
> 2. **o piloto está fechado** — zero runs incompletos ou activos, matriz completa declarada, e o manifesto de superfícies (§4.1) congelado e hashado no momento do fecho.
>
> **Razão mecânica, não cerimonial:** o `~/.claude/CLAUDE.md` global é **constante declarada do
> experimento em curso**. Mexer-lhe antes do `resultado.md` não é "limpar cedo" — é **corromper o
> braço de controlo de uma experiência a decorrer noutra sessão**.
>
> **A trava da v1.0 era insuficiente.** Congelava só o `CLAUDE.md`. Medido hoje: o
> `~/.claude/settings.json` liga **4 injectores por prompt** (§3.2), um deles a viver *dentro do
> vault*. Congelar um ficheiro e deixar quatro injectores livres não congela nada.
>
> **O que PODE correr já:** o **censo (só-leitura)** e a **construção do manifesto**. Nada mais.
> Nenhuma edição, nenhum corte, nenhum arquivo, nenhum commit fora deste brief.

**SHA pinado da v1.0** (o input desta rescrita):
`188b90eb1a5d723f4cf8f06971892dd7dcc26b3d55a2bff053facd988b1ba9eb` — `_handoff/BRIEF_LIMPEZA_CONTEXTO_2026-08-07.md`, **untracked (`??`)** no momento desta escrita. O SHA pina o *conteúdo*, não o *commit*: se a v1.0 for commitada mais tarde, o SHA tem de bater; se não bater, esta rescrita perdeu o seu input e volta ao gate.

**Veredicto de origem:** `job-msj92859-857e`, wave `limpeza-g4`, motor `codex`, 648 s, custo `n/d`
(nenhum job da wave trouxe `cost_usd` medido). 5 achados: 3 HIGH, 2 MED. Todos incorporados abaixo,
nenhum descartado.

---

## 1. Visão de produto — porque é que isto não é housekeeping

Esta limpeza não é arrumação. É o **Episódio 1** de uma feature perene, e a feature perene é um
degrau de uma escada que já tem os quatro degraus desenhados:

```
  fundação          → o contexto do utilizador é coerente, medido e sem contradições
      ↓
  sentinela         → uma rotina mecânica a $0 vigia essa coerência para sempre
      ↓
  inject_context    → sabendo o que é verdade, injecta-se o sweetspot POR PROMPT
      ↓
  plugin            → isto deixa de ser o setup do Paulo e passa a ser instalável por qualquer um
```

**A promessa no fim da escada:** *todo o prompt com a experiência de um funcionário da Anthropic* —
alguém que já sabe as regras da casa, sabe quais estão mortas, sabe qual é a fonte de verdade quando
duas se contradizem, e não gasta metade da janela a redescobrir isso.

**Consequência de âmbito, explícita:** o objectivo desta wave **deixa de ser "cortar contexto"**.
Passa a ser **"produzir a fundação medida e o manifesto que a sentinela vai vigiar"**. O corte é o
subproduto; a fundação auditável é o produto. Um corte grande com fundação por medir é uma falha
desta wave, não um sucesso.

---

## 2. Objecções que sobrevivem da v1.0 (mantidas, não diluídas)

**G9 — a assunção que derruba tudo.** "Cortar contexto não degrada qualidade" é uma hipótese, não um
facto. O padrão não manda cortar — manda **cortar E MEDIR a taxa de erro**. Sem medição antes/depois,
a limpeza é vibes com diff. DoD nunca é "ficou mais pequeno": é **tokens/prompt ↓ E taxa-de-erro
estável-ou-menor** numa suite comportamental pré-registada.

**G6 — superfícies partilhadas.** O `~/.claude/CLAUDE.md` global serve **todos** os projectos (vault,
marleyliving, …), não só o Mooter. Podar regra "morta para o Mooter" pode partir outra sessão. O
censo mapeia **regra → consumidor** antes de qualquer corte. Corolário v1.1: a matriz de validação
**tem de incluir um projecto não-Mooter** (§4.4).

**Duplicação.** Uma casa canónica por regra; as outras apontam. Corolário v1.1: quando as casas se
**contradizem** — e contradizem-se, medido em §3.3 — "eleger a casa canónica" é uma *decisão do
Paulo*, não uma limpeza automática. Daí o balde `conflitante` (§4.2).

---

## 3. Censo — o que está medido HOJE (2026-08-07)

### 3.1 Superfícies estáticas

| Superfície | bytes | sha256 (12) | semântica |
|---|---:|---|---|
| `~/.claude/CLAUDE.md` | 18 845 | `4a80af1e4c7e` | global, todos os projectos |
| `frugal/CLAUDE.md` | 4 967 | `2f9fba2410e8` | projecto; importa `@AGENTS.md` |
| `frugal/AGENTS.md` | 15 595 | `3b329c56e599` | canon cross-tool |
| `~/.codex/AGENTS.md` | 19 467 | `85c80804dd40` | global do Codex — **ausente da v1.0** |
| `frugal/.claude/rules/` (4 ficheiros) | 8 676 | por ficheiro | path-scoped, condicional |
| auto-memory do frugal (`MEMORY.md`) | 7 016 | `cf78fa073923` | memória de projecto |
| `~/.claude/skills/` (146 entradas) | 288 817 | — | on-demand |
| `~/.agents/skills/` (145 entradas) | 284 127 | — | on-demand; **111/145 comuns divergem** |
| `~/.claude/hooks/` | 4 535 953 | — | executado, não lido; **4 098 261 B são `execution.log`** |

Soma das estáticas do lado Claude: **55 099 B**. Com o `~/.codex/AGENTS.md`: **74 566 B**.

> **`bytes ≠ tokens carregados`.** Tokens reais = **`n/d`** enquanto não estiverem declarados
> tokenizer, loader e condições de activação. Qualquer número de tokens nesta wave sem essas três
> declarações é fabricado — e fabricar métricas viola o canon do repo.

### 3.2 Superfícies dinâmicas — os 4 injectores por prompt (medido)

`~/.claude/settings.json` → `UserPromptSubmit`:

1. `.claude/tools/router/inject_context.js` — router hint, delegation directive, suggested answer
2. `.claude/hooks/frugal-turn-header.js` — **alias deprecated** (Kill Frugal, 2026-06-11) que delega em `mooter-turn-header.js`; **continua wired**
3. `.claude/hooks/live-preview-tap.js UserPromptSubmit`
4. `paulo-vault/.claude/hooks/user-prompt-3rd-brain.js` — **vive dentro do vault**; injecta o bloco `<vault-context>`

O nº4 é a descoberta com mais consequência: **o vault não é só um destino de arquivo, é uma
superfície de contexto activa**. Um brief que manda "arquivar para o vault" está a escrever numa
superfície que **também injecta**. Isso é circular e tem de estar no manifesto.

### 3.3 Conflitos reais entre superfícies (todos verificados hoje)

| # | Conflito | Lado A | Lado B |
|---|---|---|---|
| 1 | **Idioma** | `~/.claude/CLAUDE.md:12` → *"Responde em PT-PT"* | `frugal/CLAUDE.md` → *"PT-BR in conversation (Canon PT-BR reconfirmado 2026-07-07)"* |
| 2 | **Visibilidade do repo** | auto-memory: *"REPO MUST STAY PRIVATE … never suggest public"* | auto-memory: *"Repo PUBLIC temp (Option A) … don't re-flag or privatize prematurely"* |
| 3 | **Skills** | `~/.claude/skills/` (146) | `~/.agents/skills/` (145) — **111 comuns divergem** |
| 4 | **Deprecated wired** | `frugal-turn-header.js` declara-se deprecated e a remover | `settings.json` mantém-no ligado em produção |
| 5 | **Vault** | canon de escrita e destino de arquivo | `main…origin/main [ahead 2, behind 15]`, working tree dirty |

> **Este ficheiro é ele próprio uma instância do conflito nº1.** Está escrito em PT-PT (doutrina
> global + língua do pedido) dentro de um repo cujo `CLAUDE.md` declara canon PT-BR. Não o resolvo
> por decreto: fica registado como o caso-teste nº1 da §4.2, à espera de eleição de casa canónica
> **pelo Paulo**.

---

## 4. Método v1.1 — o que torna isto executável

### 4.1 Manifesto de superfícies (artefacto nº1, pré-condição de tudo)

Antes de qualquer corte, produzir um manifesto **imutável e hashado**, uma linha por superfície:

```
caminho · sha256 · bytes · loader · consumidor(es) · scope · activação
```

- **loader** — quem carrega: CC eager · `@import` · hook `UserPromptSubmit` · leitura nativa do Codex · on-demand por skill trigger · path-scoped rule.
- **consumidor** — *quais* agentes e *quais* projectos vêem isto. `~/.claude/CLAUDE.md` = todos; `frugal/.claude/rules/api-conventions.md` = só quem toca esses paths.
- **scope** — global · projecto · path · tool-específico.
- **activação** — `eager` (sempre) · `conditional` (gatilho declarado) · `on-demand` (só se invocado).

**Regra dura:** uma superfície **sem loader identificado não entra na wave**. Não se corta o que não
se sabe quem carrega. Superfície nova descoberta a meio ⇒ **para**, acrescenta ao manifesto,
re-hasha, retoma.

O manifesto é **o input da sentinela** (§6). Não é papelada: é o esquema da feature perene.

### 4.2 Cinco baldes (a v1.0 tinha quatro)

Cada regra vai a exactamente um balde, **com citação como prova**:

| Balde | Critério | Acção |
|---|---|---|
| **(a) viva-só-prosa** | não há mecanismo que a cubra | fica; candidata a mecanismo em wave própria |
| **(b) já-é-mecanismo** | existe hook/gate/guarda **e passa o teste §4.3** | prosa → referência ao mecanismo |
| **(c) stale** | cita-se a decisão que a matou | arquiva (§4.5) |
| **(d) duplicada** | mesma regra, várias casas, **sem contradição** | elege casa canónica; as outras apontam |
| **(e) conflitante** ← **NOVO** | duas casas **contradizem-se** | **não se toca.** Vai para a lista de decisão do Paulo |

**Porquê o balde (e):** sem ele, o oracle da suite comportamental é arbitrário. Se o global diz PT-PT
e o repo diz PT-BR, uma suite que pontue "usou PT-PT" está a **escolher um lado** e a chamar-lhe
medição. Os 5 conflitos da §3.3 entram todos aqui.

### 4.3 A regra do mecanismo — o teste que a v1.0 não tinha

> **"Já existe um mecanismo" NÃO é suficiente para tirar uma regra da prosa.**

Um mecanismo só substitui prosa depois de provar **as cinco**:

1. **Wiring** — está realmente ligado *neste momento* (citação do `settings.json` / CI / package script), não apenas presente no disco.
2. **Cobertura** — cobre o mesmo âmbito que a prosa. Um guard que só actua em `.planning/` não substitui uma regra global.
3. **Teste** — existe um teste ou gate de CI que falha quando o mecanismo falha.
4. **Fail mode declarado** — `fail-closed` (bloqueia) · `fail-open` (deixa passar) · `advisory` (só avisa). **Advisory e fail-open NÃO removem a prosa** — no máximo encolhem-na para a regra mínima. Um controlo que só avisa não é uma prevenção pré-acção.
5. **Portabilidade** — se a regra é cross-tool, o mecanismo tem de existir para Codex e Gemini também. Mecanismo que só existe no Claude Code não remove prosa do `AGENTS.md`.

**Taxonomia obrigatória** por mecanismo: *preventivo* (impede antes) · *detectivo* (apanha depois) ·
*advisory* (avisa). Trocar prosa preventiva por mecanismo detectivo **é uma perda de controlo** e tem
de ser declarada como tal, não escondida numa contagem de "regras migradas".

**Caso vivo:** o `frugal-turn-header.js` está marcado deprecated **e continua ligado**. Se alguma
regra de prosa citar esse mecanismo como justificação para sair, está a apoiar-se num shim que se
declara a caminho da remoção. Isso é balde **(e)**, não **(b)**.

### 4.4 Baseline mensurável (substitui a "corrida 1×")

A v1.0 dizia "10-15 prompts com resposta esperada, corrida 1×". Isso não é mensurável. A v1.1 exige:

**Rubric pré-registada.** Commitada **antes** do primeiro run e não alterada depois. Por caso:
- **condições de activação** (o que tem de estar carregado para o caso ser válido);
- **afirmações obrigatórias** (tem de dizer/fazer X);
- **afirmações proibidas** (não pode dizer/fazer Y);
- **efeitos laterais** (não escreveu fora do permitido; não tocou em frozen);
- **veredicto binário** por critério. Nada de escalas.

Se a rubric for alterada depois de ver resultados, a suite **deixa de ser pré-registada** e o
relatório tem de o dizer — o mesmo padrão que o `verificador-0/PRE-REGISTO.md` já impõe.

**Ambiente fixo e declarado.** Modelo/CLI/build · effort · `cwd` · trigger de skill · sessão fresca ·
estado de cache declarado. Sem isto não há comparação, há anedota.

**≥3 repetições por condição.** Não é folclore: é a mesma metodologia que o piloto já exige
(`PILOTO_CONVICCAO_2026-08-06.md`) e que o `verificador-0` correu (108 juízos = 2 modelos × 18
artefactos × 3 repetições). Uma corrida única não distingue efeito de ruído.

**Matriz de validação** (a v1.0 só olhava para o `frugal`):

| Eixo | Valores mínimos |
|---|---|
| Projecto | `frugal` · **um projecto não-Mooter** · um repo neutro |
| Motor | Claude Code · **Codex** · **Gemini** (obrigatório sempre que a regra é cross-tool) |
| Condição | `antes` · `depois` |
| Repetições | ≥3 por célula |

**Campos de usage — os reais, não inventados.** Reportar em separado:
`input_tokens` · `cache_creation_input_tokens` · `cache_read_input_tokens` · `output_tokens`.
**Eliminados da v1.0:** `% arrasto` e `releitura %` — não são observáveis com a instrumentação
actual. Métrica não observável não entra no relatório.

**Atribuição causal por ficheiro = `n/d`**, excepto numa **ablação isolada** desse ficheiro. Dizer
"este ficheiro custava N tokens" a partir de um corte conjunto é fabricar causalidade.

### 4.5 Arquivo, backup e rollback (o achado HIGH nº3)

A v1.0 mandava arquivar para `vault/00-core/_archive-contexto/`. **Três problemas medidos:**

1. A **constituição do vault** (`paulo-vault/00-core/mooter-constituicao.md:20`) **proíbe Solistas de escrever no vault-tree**. O brief mandava violar o escritor único.
2. O directório proposto **não existe**.
3. O vault está **dirty, ahead 2, behind 15** — escrever ali agora agrava divergência.

**Regra v1.1:**

- **Backup primário = local e hashado.** `~/.claude/` **não é um repositório git** — "commit selectivo por ficheiro" ali **não protege nada**. O backup é uma cópia integral, com `MANIFEST.sha256` de todos os ficheiros, timestamped, fora do `~/.claude/`. É isso — e só isso — que dá rollback atómico.
- **Rollback atómico definido:** restaurar o snapshot inteiro + verificar contra o `MANIFEST.sha256`. Rollback ficheiro-a-ficheiro **não é rollback**, é edição.
- **Projecção para o vault: só pelo escritor autorizado**, e **só depois de decisão do Paulo**. O que a wave produz é um bundle local; quem o projecta no vault é quem a constituição autoriza. Nunca o executor da limpeza.
- **Nunca apagar.** Remover é mover para o snapshot. O git deste repo cobre só o que está no repo — as superfícies globais estão todas fora dele.

### 4.6 Medição depois + gate

Mesma suite, mesma rubric, mesmo ambiente, ≥3 repetições. **Gate de aceitação: zero novas falhas
duras.** Uma única regressão dura ⇒ rollback do snapshot, sem discussão e sem "mas poupou X%".

---

## 5. Métricas a reportar (versão honesta)

- `input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` / `output_tokens`, antes→depois, por célula da matriz
- nº de regras por balde (**5 baldes**)
- nº de regras migradas para mecanismo — **discriminado por fail mode** (preventivo / detectivo / advisory)
- suite X/Y antes→depois, por motor e por projecto
- nº de conflitos abertos no balde (e) e quais foram decididos pelo Paulo
- **`n/d` explícito** onde não houve medição. `n/d` é um resultado; um número inventado é uma falha.

**Fora do relatório, por decisão:** `% arrasto`, `releitura %`, tokens-por-ficheiro sem ablação.

---

## 6. DESENHO (não implementar) — SENTINELA DA FUNDAÇÃO

> **Âmbito deste bloco: desenho apenas.** Nenhuma linha de código nesta wave. O que segue é o
> contrato que o Episódio 1 tem de deixar viável — e a razão pela qual o manifesto (§4.1) é o
> artefacto que interessa.

**O problema que a sentinela resolve:** uma limpeza é um evento. A entropia é um processo. Sem
vigilância, os cinco conflitos da §3.3 voltam — porque *já* voltaram: o `frugal-turn-header.js`
declarou-se deprecated em 2026-06-11 e continua ligado quase dois meses depois. Nada o apanhou
porque **ninguém estava a olhar mecanicamente**.

### 6.1 Princípio: MECÂNICA-primeiro, a $0

A sentinela é uma **rotina agendada determinística**. Sem LLM no caminho crítico. Sem chamada paga.
Corre em segundos, sobre ficheiros, e devolve factos.

**Isto não é preferência — é o que o número obriga.** O `verificador-0` (2026-08-07, pré-registado,
$0, 108 juízos) reprovou os dois modelos locais como juízes: `qwen3:30b` deu **recall 0/63 nas
falhas** — respondeu "S" a 297 de 297 no domínio discriminante. É uma função constante disfarçada de
78,8% de accuracy. Um verificador que nunca diz "N" **não está a verificar**. O caminho
pré-registado para esse resultado era exactamente *teste-mecânico-primeiro, LLM só em desempate*.

### 6.2 Os seis checks mecânicos

| Check | O que mede | Sinal |
|---|---|---|
| **1. Hash-drift entre pares canónicos** | pares declarados como espelhos (`~/.claude/skills/` ⇄ `~/.agents/skills/`, hooks wired ⇄ `tools/router/`, canon repo ⇄ espelho vault) | sha diferente onde devia ser igual |
| **2. Conflitos entre superfícies** | asserções contraditórias registadas no manifesto (idioma, visibilidade, canon) | conflito aberto sem decisão |
| **3. Orçamento de bytes por ficheiro** | cada superfície eager tem tecto declarado no manifesto | tecto excedido |
| **4. Deprecated-ainda-ligado** | ficheiro que se declara deprecated **e** aparece wired em `settings.json` / CI / scripts | wired ∧ deprecated |
| **5. Vault ahead/behind** | divergência do vault e limpeza do working tree | ahead>0 ∨ behind>0 ∨ dirty |
| **6. Manifesto: drift = evento** | sha de cada superfície vs. manifesto congelado | sha mudou sem entrada no manifesto |

**O check nº6 é o coração.** Não pergunta "isto é bom?" — pergunta **"isto mudou sem ninguém
declarar?"**. Drift silencioso é o evento. Uma alteração declarada não é alarme; uma alteração
silenciosa é sempre alarme, mesmo que a alteração seja boa.

### 6.3 Os 5 primeiros checks vêm de graça

O bootstrap da sentinela **não precisa de casos inventados**. As cinco incoerências medidas hoje
(§3.3) são o primeiro conjunto de casos, cada uma com um estado de partida conhecido:

| # | Caso | Estado 2026-08-07 |
|---|---|---|
| 1 | PT-PT (global) vs PT-BR (repo) | **conflito aberto** |
| 2 | repo privado vs público-temporário (auto-memory) | **conflito aberto** |
| 3 | 111/145 skills comuns divergem entre `~/.claude/` e `~/.agents/` | **drift medido** |
| 4 | `frugal-turn-header.js` deprecated **e** wired (`settings.json`) | **violação activa** |
| 5 | vault `ahead 2, behind 15`, dirty | **divergência activa** |

Se a sentinela correr no dia 1 e **não** acender estes cinco, está partida. É o seu próprio teste de
harnesse — o mesmo truque que apanhou o verificador constante.

### 6.4 Saída: dimensão "fundação" no scorecard do board

O resultado da sentinela entra no scorecard do board como **uma dimensão a par das outras** —
`fundação` —, não como um log escondido. Composição mínima: nº de conflitos abertos · nº de drifts
não declarados · nº de deprecated-wired · estado do vault · superfícies acima do orçamento.

**Regra de honestidade:** a dimensão mostra o **estado medido**, nunca uma nota inventada. Sem
medição na janela ⇒ `n/d` visível, não um verde por omissão. Um scorecard que mostra verde porque
não correu é pior do que não ter scorecard.

### 6.5 Relatório local, escritor único respeitado

- O relatório é **local por omissão** — o mesmo princípio do resto do motor: nada sai da máquina.
- A sentinela **não escreve no vault**. Produz um artefacto local; a projecção para o vault é feita
  **pelo escritor autorizado pela constituição**, depois de decisão. O achado HIGH nº3 desta wave
  nasceu exactamente de esquecer isto — a sentinela não pode repetir o erro que a criou.
- A sentinela **não corrige**. Reporta. Correcção automática de contexto é uma superfície nova a
  escrever noutras superfícies — precisaria do seu próprio brief e do seu próprio gate.

### 6.6 Onde entra o LLM local — e onde não entra

```
  checks mecânicos ($0, determinísticos)  →  factos  →  scorecard
                                                ↓
                              (opcional) LLM local: SUSPEITA semântica
                                                ↓
                                    fila de revisão humana
```

- O LLM local **só** levanta **suspeita semântica**: "estas duas regras parecem contradizer-se sem
  serem textualmente diferentes". Coisa que hash nenhum apanha.
- **Nunca emite veredicto.** Nunca marca verde. Nunca fecha um item. Nunca entra no scorecard como
  facto. A sua saída entra numa **fila de revisão** com etiqueta `suspeita`, e um humano decide.
- Falso positivo do LLM = ruído numa fila. Falso negativo = zero dano, porque os checks mecânicos
  correm à mesma. **Assimetria desenhada de propósito** — é isso que torna seguro usá-lo a $0.
- Base empírica: `_handoff/verificador-0/VEREDICTO.md` (pré-registado, 2026-08-07).

---

## 7. Fora de âmbito e `n/d` declarado

- **Fora:** implementar a sentinela · alterar `settings.json` · resolver os conflitos do balde (e) (são decisão do Paulo) · tocar em `_handoff/piloto/`, no kit, ou em `resultado.*` · escrever no vault.
- **`n/d` honesto:** tokens carregados por superfície (falta tokenizer+loader+activação) · custo da wave `limpeza-g4` (`cost_usd` não medido em nenhum job) · impacto por ficheiro sem ablação isolada · quantos dos 111 skills divergentes são drift real vs. variantes legítimas (não medido).
- **`classify.js`:** intocado; sha frozen `427d8c0b…` mantém-se o gate mecânico do repo.

---

## 8. Gauntlet declarado

Corrido contra este brief antes de o emitir. **≥1 objecção real, obrigatória** — gate que só aprova
não correu.

| # | Questão | Resposta |
|---|---|---|
| 1 | **fonte de verdade** | O manifesto de superfícies (§4.1). Enquanto não existir, a fonte de verdade é `n/d` — e é por isso que a wave não começa pelo corte. |
| 2 | **escritor único** | `~/.claude/` = Paulo/instalador. Vault = escritor autorizado pela constituição (`00-core/mooter-constituicao.md:20`). A wave **não** escreve em nenhum dos dois. Este brief só escreve `_handoff/BRIEF_LIMPEZA_CONTEXTO_v1.1.md`. |
| 3 | **reversível vs irreversível** | Este brief: reversível (ficheiro novo). A limpeza: irreversível sem o snapshot hashado de §4.5 — e é por isso que o snapshot é pré-condição, não boa prática. |
| 4 | **script-first** | Censo, manifesto e os 6 checks são todos mecânicos e a $0. LLM só em suspeita semântica, nunca no veredicto (§6.6). |
| 5 | **projecção vs 2ª verdade** | O vault recebe **projecção** do bundle local, e só pelo escritor autorizado. Se a sentinela escrevesse no vault, criava 2ª verdade — proibido. |
| 6 | **degradação graciosa** | Superfície sem loader ⇒ fica fora da wave. Métrica não observável ⇒ `n/d`, não estimativa. Sentinela sem medição ⇒ `n/d` visível no scorecard, nunca verde por omissão. |
| 7 | **frozen/allowlist/n-d** | `classify.js` frozen e intocado. `_handoff/piloto/`, kit e `resultado.*` fora do allowlist desta sessão. Tokens/custo/impacto-por-ficheiro declarados `n/d`. |
| 8 | **custo de reverter** | Este brief: `git rm` de um ficheiro. A limpeza: restaurar o snapshot integral + verificar `MANIFEST.sha256`. Sem esse snapshot o custo de reverter é **desconhecido** — o que, por si só, bloqueia a execução. |

**Objecção que levanto contra esta v1.1** (anti-sycophancy — o que tentei refutar e não consegui):

> **O manifesto pode nunca convergir.** §4.1 diz "superfície nova descoberta ⇒ para, acrescenta,
> re-hasha, retoma". Mas a §3.2 mostra que uma das superfícies é um **hook que vive dentro do vault**,
> e a §3.3 nº5 mostra o vault a **divergir sozinho** (ahead 2, behind 15). Um manifesto que hasha uma
> superfície que se move por conta própria pode entrar em loop de re-hash e nunca congelar — e então
> a limpeza fica trancada para sempre por uma regra que eu próprio escrevi.
> **Não resolvi isto.** A mitigação mínima seria congelar o vault como *commit* (não como working
> tree) durante a janela da wave, mas isso é uma decisão sobre o vault, que **não é minha para tomar**
> — é do escritor autorizado. Fica como o **primeiro risco a resolver** quando a trava da §0 abrir.

**Estado do gauntlet:** 8/8 respondidas com evidência medida nesta sessão · 1 objecção real por
resolver · execução **trancada** pela §0.
