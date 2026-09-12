# MEO GAUNTLET v7 — 20 perguntas, régua de disparo, crítico ≠ autor
> v1: as 8 do Paulo (terreno real). v2: +5 da literatura. **v3: uma sessão de contexto fresco
> correu o gauntlet SOBRE o gauntlet, apanhou um erro factual (números do CoVe colados pelo
> autor na compressão — os três valores são de três tarefas distintas: MultiSpanQA F1 0.39→0.48,
> FACTSCORE 55.9→71.4, Wikidata precision 0.17→0.36) e seis defeitos de desenho.** Quase tudo
> aceite. A própria v2→v3 é a demonstração do método: o crítico era outro contexto, verificou
> contra as fontes, e mudou o entregável.
> **v4 (2026-08-01, auditoria E2E): +2 entradas, ambas por RETRO-PROVA, ambas de falhas medidas
> na própria auditoria — G11 (instrumento) e G12 (denominador). Restam 1 slot livre.**
> **v5 (2026-08-01/02, sessão Cowork + CC): +3 entradas, todas por RETRO-PROVA ×3 de falhas do
> próprio dia — G13 (procura-antes-de-delegar), G14 (valor de negócio), G15 (memória cross-silo).
> Tecto elevado 13→15, 0 slots. A partir daqui: entra uma → sai uma.**
> **v6 (2026-08-02, masterprompt "O FLUXO, O ESTRANHO E O JUIZ"): +3 entradas — G16 (juiz ou
> estranho), G17 (modelo vs fluxo), G18 (claim sem [medido]). Tecto elevado 15→18 por DECISÃO
> EXPLÍCITA DO DONO, registada: o Paulo mandou-as commitar antes de a wave arrancar. É a segunda
> vez que o tecto sobe — e a regra do fecho (entra uma → sai uma) só se suspende assim, por gesto
> do dono, nunca por entusiasmo do agente. Retro-prova ×3 anexada a cada uma, toda do registo.**
> **v7 (2026-09-01, D8 fechada): +2 entradas — G19 (tabela inteira do fornecedor, ex-C3) e G20
> (o que tentaste remover, ex-C4). Tecto elevado 18→20 por DECISÃO EXPLÍCITA DO DONO, registada:
> «entram a C3 e a C4». É a TERCEIRA vez que o tecto sobe. A C1 sai da fila — não por ser fraca
> (era a de retro-prova mais sólida: 3/3 confirmadas com sha e a linha defeituosa lida nos dois
> lados do fix), mas porque desce a MECANISMO: «o ficheiro que este ✓ descreve tem bytes?» é um
> `statSync().size > 0`, e uma coisa que um portão faz não gasta um slot que um humano tem de
> correr. A C2 fica em fila.**
> **E as duas entram CORRIGIDAS.** Antes da entrada, as quatro candidatas foram confrontadas com o
> registo por um motor diferente do autor (dossier em `_handoff/DOSSIER_D8_GAUNTLET_2026-09-01.md`).
> A auditoria refutou afirmações concretas nas retro-provas da C3 e da C4 — as correcções estão
> marcadas `[corrigido 2026-09-01]` abaixo, com o que foi medido. Entrar com números que o git
> desmente seria, num documento cuja G18 exige `[medido]`, o defeito que ele existe para matar.

## Régua de disparo (o buraco mais caro da v2 — sem "quando", ou não corre ou corre a fingir)

| Classe | Critério | Gauntlet |
|---|---|---|
| **Trivial** | reversível em <5 min, não sai da sessão | **nenhum** |
| **Rotina** | entregável que o dono vai ler mas não re-verificar linha a linha | **G1, G3, G7 auto-aplicadas** + declaração de 1 linha |
| **Alto risco** | toca produção/secrets/CI/release/site público, OU o dono vai agir sem reler, OU vira masterprompt para outra sessão | **as 20, com G4 num MOTOR DIFERENTE.** Sem segundo motor disponível: o entregável não sai, ou sai carimbado `não-verificado` — nunca sai limpo |

## As 20 — G1 a G13 na tabela abaixo; G14 a G20 seguem, cada uma colada à sua retro-prova

| # | Pergunta | Origem · prova de terreno |
|---|---|---|
| G1 | **Verificaste cada AFIRMAÇÃO factual numa passagem separada, contra a fonte, sem olhar para o teu texto?** (a releitura NÃO conta — foi a releitura que deixou passar "🐮 feito" 3× e os números do CoVe) | Paulo + CoVe · retro-prova: OAuth/release/site (08-01 manhã) e o próprio erro da v2 (08-01 tarde) |
| G2 | Percorreste o fluxo na PELE do utilizador, gesto a gesto? | Paulo · retro-prova: onboarding F0 em falta |
| G3 | **Está FORÇADO por mecanismo — e a medição que prova que o mecanismo disparou existe ANTES da entrega?** (absorve a antiga G12) | Paulo + Amazon Q5 · retro-prova: 3/6 requisitos do contrato eram esperança |
| G4 | **Um motor DIFERENTE tentou derrubar isto e encontrou ≥1 erro concreto — ou explicou porque não?** Role-play de advogado do diabo no mesmo modelo REFORÇA a posição (Nemeth 2001); dissidência tem de ser doutro contexto/motor | Paulo + Nemeth · retro-prova: a própria v3 (contexto fresco apanhou o que o autor não viu) |
| G5 | Pesquisaste ANTES de construir? O ecossistema já resolveu melhor? | Paulo · retro-prova: juiz local, /fork, tiers velhos |
| G6 | Funciona em TODAS as superfícies e devices, ou só onde estás sentado? | Paulo · retro-prova: terreno Mac≠Windows; Cowork cloud sem `~/.mooter` |
| G7 | A sequência está no fim, ordenada, com DONO em cada gesto? | Paulo · retro-prova: D1-D9 |
| G8 | Podias ter resolvido com MENOS interacções do dono? | Paulo · retro-prova: scripts auto-validantes |
| G9 | **Qual é a assunção que, se cair, deita tudo abaixo — e que confiança REAL tenho nela?** | Key Assumptions Check (CIA) · retro-prova: session-affinity gravava recomendação, não executor |
| G10 | **O que me faria dizer que está ERRADO — defini o critério de refutação ANTES e fui procurá-lo?** | ACH/Heuer · distingue "os testes passam" de "tentei partir" (era a G11 da v2) |
| G11 | **Validaste o INSTRUMENTO antes de acreditares na medição? Um negativo é ausência do facto, ou defeito do teu método — provaste qual?** | Auditoria E2E 08-01 · retro-prova ×4 abaixo. G1 verifica a afirmação contra a fonte; esta verifica o APARELHO que produziu a fonte |
| G12 | **O número que publicas mede a coisa que importa, ou a coisa fácil de contar? Declara o denominador ao lado do valor.** | Auditoria E2E 08-01 + Wave K · retro-prova ×4 abaixo. G1 pergunta se o número é verdadeiro; esta pergunta se mede o que interessa |
| G13 | **Antes de mandar o dono fazer um gesto: consultaste `O_QUE_O_SOCIO_FAZ_SOZINHO.md` E corriste o ToolSearch? Cada gesto que lhe passas é IMPOSSÍVEL para ti (com prova), ou não verificaste?** | Paulo · retro-prova ×3 abaixo. G8 pergunta se podias resolver com menos interações; esta pergunta se sequer PROCURASTE. Inventário em `docs/foundation/O_QUE_O_SOCIO_FAZ_SOZINHO.md` — ficheiro **local, não versionado** (lista os conectores ligados do Paulo; fica fora do repo público por decisão dele, 2026-08-02) |

### Retro-prova da G11 (instrumento) — 4 falhas reais, todas de 2026-08-01

1. «`nvidia-smi` não encontrado» reportado como bug do diagnóstico — era o harness do auditor a
   despir `PATHEXT` do ambiente do processo filho. Com ambiente Windows completo, o diagnóstico
   acerta (🟢 RTX 4090). **G1 não apanha: a leitura da fonte estava certa; o aparelho é que mentia.**
2. «o resolvedor descartou a directoria do caminho» — o ficheiro citado simplesmente não existia;
   o erro do conector estava correcto e bem construído.
3. «10 pacotes órfãos» — o grep procurava `packages/<nome>`, mas o CLI importa por
   `../../<nome>/src/...`. Método errado ⇒ falso órfão. Corrigido: 11 são só-CLI, 2 sem consumidor.
4. Histórico (O-0, 08-01 manhã): 6 dispatches recusados atribuídos **inteiramente** ao bug de
   caminhos com espaço, quando a raiz do guard estava também implicada. Uma causa encontrada
   fechou a busca antes de o instrumento estar validado.

### Retro-prova da G12 (denominador) — 4 falhas reais

1. Fatia local: **50,9% por contagem de jobs vs 15,0% por tokens de entrada** (ledger, 08-01).
   O custo segue os tokens; a métrica publicada infla o fosso ~3,4×.
2. Wave K (07-31): a mesma pergunta — «quanto corre local?» — deu 27,27% / 40% / n/d em três
   vistas, cada uma com o seu denominador.
3. Recibo 08-01: `trabalho_a_zero 66,67%` (cargo MEO) e `43%` (advogado do diabo) **no mesmo payload**.
4. `custo_total` declarado "parcial" enquanto 292 259 tokens de entrada de um único job codex
   ficavam sem preço — a parcialidade era honesta, a magnitude nunca aparecia.

### Retro-prova da G13 (procura-antes-de-delegar) — 3 falhas reais, 2026-08-01 noite

1. Mandei o Paulo "abrir o PR no GitHub e clicar Merge" — SEM verificar. Tinha
   `merge_diff` (aceita URL de PR do GitHub) o tempo todo. Um gesto humano inventado por preguiça.
2. Padrão do dia inteiro: `.bat` de duplo-clique para o Paulo, quando muitos eram despacháveis
   à frota — só descobri o limite real (index.lock, política) DEPOIS de tentar, não antes.
3. O próprio Paulo teve de perguntar "você não consegue sozinho?" 3× em sessões diferentes —
   o sinal de que a delegação estava a ser o default, não o último recurso.
**A régua: um gesto só chega ao dono depois de um ToolSearch provar que é impossível para o agente.**

**Passo histórico: tecto 13→14, com a entrada da G14** — não é o estado final (a v5 fecha em 15 · 0
slots; ver o fecho abaixo). (decisão consciente 2026-08-01: o Paulo, como CEO,
apanhou que o gauntlet inteiro media corretude técnica e NADA media valor de negócio — um
checklist que garante que o código está certo mas não que alguém paga por ele. Elevar o tecto
por 1 é a exceção justificada da regra Urbach: entra por PROVA de lacuna, não por entusiasmo).

| # | Pergunta | Origem · prova |
|---|---|---|
| G14 | **Esta wave move a agulha do NEGÓCIO — e qual (aquisição, activação, receita, retenção, referência)? Ou é polimento que não muda a disposição de alguém a pagar?** Se for polimento, porque está à frente do que gera receita? | Paulo-CEO 2026-08-01 · retro-prova ×3 abaixo. G3 pergunta se está forçado por mecanismo; G14 pergunta se o mecanismo importa para o VALOR. É o "kill list" e o "custo de oportunidade" virados pergunta |

### Retro-prova da G14 (valor de negócio) — 3 falhas reais do próprio dia

1. **O dia inteiro (35 turnos) não produziu UM cêntimo de disposição-a-pagar provada.** Titular
   honesto, oráculo, gauntlet — tudo corretude. A demo de 90s (a única coisa que um cliente vê)
   e o F0 (o que abre ao 2º cliente) ficaram sempre para "a próxima wave". Ordenámos por elegância
   técnica, não por receita.
2. **A nota do produto foi 6/10 ponderada — mas "6 em quê?".** Motor 8,5 · produto-para-o-mundo 4.
   O único número que importa para valuation (clientes que pagam) foi **zero**, e nem entrou na conta.
3. **O radar competitivo e o benchmark público** — as duas únicas coisas que criam defesa de mercado
   e à-frente-da-concorrência — esperam um "sim" do Paulo desde as 10h da manhã e nenhuma wave os
   priorizou. Construímos o motor; ninguém construiu a prova de que o motor vale dinheiro.

**A régua de negócio (nova, ao lado da técnica):** nenhuma wave passa da PRIME-0 sem declarar a que
métrica pirata (AARRR) serve. Wave de corretude só ganha prioridade sobre wave de receita se um
BUG estiver a bloquear a receita — senão, receita primeiro. O CEO não pergunta "está certo?";
pergunta "quem paga, quanto, e quando?".

| # | Pergunta | Origem · prova |
|---|---|---|
| G15 | **O que aprendeste ficou REGISTADO onde a próxima sessão (qualquer superfície, qualquer device) o encontra sem tu contares — E as decisões que afectam outra "cadeira" (CFO/COO/CMO/CISO/CRO/UX — ver `CONSELHO_C_LEVEL.md`) foram escritas onde essa cadeira as lê?** | Paulo-CEO 2026-08-01 · retro-prova ×3 abaixo. G13 é sobre não delegar gestos ao humano; G15 é sobre não delegar MEMÓRIA ao humano — o conhecimento tem de sobreviver à sessão E cruzar silos |

### Retro-prova da G15 (memória cross-superfície e cross-silo) — 3 falhas reais

1. A sessão CC de 11:16 fechou **sem escrever nada no vault** — o learning morreu com a sessão até
   alguém (eu) o resgatar. Memória delegada ao humano é memória perdida.
2. **Dois vaults com `.obsidian`** (D10): o `mooter_journal` escrevia no clone abandonado — o
   conhecimento ia para um sítio que a próxima sessão não lê. Registado ≠ registado no sítio certo.
3. O `custo por resposta certa` (a métrica do CFO/CRO) foi discutido 3× e nunca escrito onde a
   lente financeira o encontraria — ficou preso na conversa, invisível ao "conselho".

**A régua:** fechar uma wave sem `mooter_journal` no vault CANÓNICO é violação. Onde fica o canónico
NÃO se decide aqui — está em `AGENTS.md` § Agent boot & freshness (raiz do home, `~/paulo-vault`, fora
de Documents/OneDrive/iCloud). A precedência que o detector aplica de facto
(`packages/mooter-bridge/journal.js`) é `MOOTER_VAULT` → `VAULT_PATH` → raiz do home: se as duas
variáveis divergirem, o canónico deixa de ser mecanicamente garantido — mede antes de assumir (G11). E se a wave tocou
numa métrica de outra cadeira (custo, activação, segurança, receita, UX), essa cadeira tem de ter
o número escrito onde o lê — senão o silo vence e o MEO decide às cegas.

| # | Pergunta | Origem · prova |
|---|---|---|
| G16 | **Isto serve o JUIZ ou os ESTRANHOS? Se nenhum, é conforto disfarçado.** | Paulo 2026-08-02 · retro-prova ×3 abaixo. A G14 pergunta QUAL métrica de negócio a wave move; a G16 corta antes: hoje só existem dois instrumentos que medem alguma coisa — o juiz (`~/.mooter/afericao/`) e um estranho com o produto instalado. Sem um deles, não há métrica para mover |

### Retro-prova da G16 (juiz ou estranho) — 3 falhas reais

1. **`~/.mooter/afericao/` não existe** — medido 2026-08-02 (`ls` → *No such file or directory*).
   Não está vazio à espera de tarefas: nunca foi criado. E o loop foi **declarado entregue** na
   v1.20 (`44c9a80`, § Entregas do `SYNC.md`: "sentinela.js, afericao.js"). Treze dias de waves
   depois, o instrumento que mede `custo por resposta certa` continua a zero tarefas.
2. **Zero estranhos, medido:** release `v1.45.3` publicada 2026-08-02T05:54:19Z com **downloads 0**
   (`_handoff/_archive/2026-08/HANDOFF-PRIME-0-FECHO-para-cowork.md:16`). 0 clientes, 0 receita. Todo o produto
   validado até hoje foi validado pela máquina de quem o escreveu.
3. **Waves I, J, K e PRIME-0 fecharam todas com gate verde** e nenhuma alimentou o juiz nem pôs o
   produto na mão de alguém de fora. Cada uma era defensável isoladamente; o padrão só aparece
   quando se pergunta pelos dois instrumentos ao mesmo tempo.

**A régua:** antes de abrir frente nova, responder "quantos já tocaram no que está feito?" com um
número, não com uma intenção. Se a resposta for 0 e a wave não alimenta o juiz, a wave é conforto.

| # | Pergunta | Origem · prova |
|---|---|---|
| G17 | **Estou a rotear o MODELO (commodity) ou o FLUXO (o produto)?** | Paulo 2026-08-02 · retro-prova ×3 abaixo. G5 pergunta se o ecossistema já resolveu isto; a G17 é mais dura: mesmo que ninguém tenha resolvido HOJE, escolher o eixo comoditizado é escolher perder daqui a dois trimestres |

### Retro-prova da G17 (modelo vs fluxo) — 3 falhas reais

1. **O único número medido que a PRIME-0 propõe para a demo é `classify_ms 3,296 ms`**
   (`_handoff/_archive/2026-08/HANDOFF-PRIME-0-FECHO-para-cowork.md:116-117`) — latência de escolha de modelo,
   exactamente a métrica que qualquer router publica. Eleger esse número como herói da demo é
   eleger competir no eixo que se copia.
2. **O argumento de venda do roteamento de modelo está sem número:** a poupança líquida é `n/d`
   nas cadeias moo→nuvem porque o motor pago corre à mesma (mesma fonte, `:116`). O próprio
   handoff conclui: *"enquanto a poupança for n/d, o argumento é 'confia em mim'"*.
3. **Três waves gastas a acertar a `fatia local`** (Wave K + auditoria E2E: 50,9% por jobs vs
   15,0% por tokens — retro-prova da G12 §1) — esforço no eixo commodity. Zero waves no eixo que
   ninguém copia: PRÉ→DURANTE→PÓS→APRENDER com recibo e scorecard por resposta.

**A régua:** o router é nota de rodapé; o fluxo + o recibo são o produto. Wave que só melhora a
escolha de modelo declara-o à cabeça e justifica porque está à frente do fluxo.

| # | Pergunta | Origem · prova |
|---|---|---|
| G18 | **Afirmo "único/perfeito/melhor que todos"? Onde está o `[medido]`? Sem prova, troca por auditável.** | Paulo 2026-08-02 · retro-prova ×3 abaixo. G1 verifica a afirmação contra a fonte e G12 verifica o denominador; a G18 ataca a classe de afirmação que **não tem fonte possível** — superlativos e comparações com todo o mercado. A troca honesta não é apagar: é passar de "somos os melhores" a "corre X e vê" |

### Retro-prova da G18 (claim sem [medido]) — 3 falhas reais

1. **A correcção honesta existe e nunca chegou ao leitor.** `_handoff/ROADMAP_MOOTER_PRIME.md:74`
   declara, na PRIME-4: *"Deploy do site (copy honesta de DoRA + versão real — hoje o repo está
   certo, o ar não)"*. A copy do repo está exemplar (ver §2); o que o estranho lê continua a ser a
   versão anterior. **Estado do site em produção: `n/d` — não o medi nesta sessão.** Claim honesto
   que fica no disco é indistinguível, para o leitor, de claim desonesto.
2. **A primeira retro-prova desta própria pergunta nasceu falsa — e foi apanhada no mesmo dia.**
   Ao escrever a G18 (2026-08-02) afirmei que `under-the-hood/page.tsx:131-133` vendia o Adapter
   Forge como entregue. A leitura verbatim do ficheiro diz o contrário: *"is planned for Wave 5 and
   **is not shipped**. Mooter has never trained an adapter... Numbers below are targets from the
   published DoRA/Unsloth literature, not measurements of Mooter"* — e até o diagrama diz *"target,
   not measured"*. Foi a G1 (verificar contra a fonte, passagem separada) que a derrubou; a G18
   sozinha ter-se-ia carimbado a si própria. **Lição: a pergunta que caça claims não se auto-verifica.**
3. **Rácio com metade do denominador estimado:** `landing/app/(marketing)/workflow/page.tsx:74-77`
   publica "160× gap" a partir de `$0,0028` **medido** contra `$0,45` **estimado**. O parágrafo
   declara-o em prosa, mas o `$0,45` não traz `[medido: onde]` nem fonte — metade do rácio não tem
   origem verificável, e é o rácio que o leitor retém.

**Contra-exemplo que já funciona (a régua importada do runtime):** `pressao_quota` declarou-se `n/d`
até haver 7 dias de histórico (Wave K3, `112b3da`) em vez de extrapolar de 1 dia. A disciplina existe
no código e nunca atravessou para a copy pública — o mesmo produto com duas réguas.

**A régua:** cada claim público carrega `[medido: onde]` ou desce a "auditável: corre X e vê".
Superlativo sem fonte possível não se suaviza — sai.

| # | Pergunta | Origem · prova |
|---|---|---|
| G19 | **Leste a tabela de preços/regras INTEIRA do fornecedor, ou só a linha que a tua pergunta trouxe?** Desconto garantido por regra publicada (batch, off-peak, TTL longo, assimetria input/output, tier) vale mais que a optimização engenhosa em desenho — e não aparece se a pesquisa for guiada só pelo tópico. | Paulo 2026-08-12 (ex-C3) · entrada na v7 · retro-prova ×2 confirmada abaixo. A G5 é build-vs-adopt; a G12 e a G18 atacam números que EU publico. **Nenhuma das 18 varria os descontos publicados pelo fornecedor que eu deixei na mesa** — é a única das quatro candidatas que apanha algo com dinheiro directo |

### Retro-prova da G19 (tabela inteira do fornecedor) — 2 confirmadas, 1 retirada

1. **Batch API −50% empilhável com caching** entrou como M4 só no delta v1.0→v1.1 — a v1.0 tinha três
   medições e não o incluía. **[corrigido 2026-09-01]** A cláusula «ao 6º turno, por pergunta do dono»
   **não é confrontável**: não há transcript da conversa no disco nem no vault. O que se confirma é a
   entrada tardia; o *quando* exacto é palavra do autor.
2. **Assimetria output ≈ 5× input** entrou como M5 no mesmo delta, enquanto se optimizava o input.
   **[corrigido 2026-09-01]** Esta e a anterior são duas células da mesma tabela, do mesmo fornecedor,
   no mesmo delta — **uma falha com duas caras, não duas independentes.**
3. ~~«Preço do Kimi lido de um agregador; a regra virou DO-NOT do M2 a posteriori.»~~
   **[RETIRADA 2026-09-01 — refutada.]** As secções DO-NOT têm as mesmas 6 balas nas duas versões,
   nenhuma sobre verificar o fornecedor, e a regra já vivia no corpo do M2 na v1.0 — logo não é
   *a posteriori*. E «lido de um agregador» não tem qualquer suporte no registo
   (`grep -i "openrouter|artificialanalysis|agregador"` nos 9 ficheiros → zero).

**A entrada.** Com 2 confirmadas (e essas duas parentes), a G19 **não cumpre a régua de ≥3**. Entra
por decisão explícita do dono, registada, com esta lacuna à vista em vez de escondida — que é o
tratamento que a G18 exige a qualquer claim.

**A régua da G19:** ANTES do despacho de alto risco, um snapshot de preços com `verified_at` no
briefing. Ela exige rede viva e o G4 corre em `--sandbox read-only`: sem o snapshot pinado, degrada
para `n/d` exactamente onde o gauntlet manda correr as 20 — e degrada em silêncio, que é pior.

| # | Pergunta | Origem · prova |
|---|---|---|
| G20 | **É a versão mais SIMPLES que atinge o objectivo — o que tentaste REMOVER antes de entregar?** | Paulo 2026-08-12 (ex-C4) · entrada na v7 · retro-prova abaixo, **0 de 3 confirmadas**. A G14 e a G16 cortam à unidade WAVE (matam a coisa inteira ou deixam-na passar inteira); **nenhuma abre o entregável e pergunta que partes DENTRO dele são carga morta**. E a G8 empurra na direcção contrária: um bloco de 8 passos numa só sessão é MENOS interacções do dono, logo a G8 aplicada a ele daria verde |

### Retro-prova da G20 (subtracção) — **0 de 3 confirmadas**, e entra assim mesmo

**[auditado 2026-09-01, motor diferente do autor]** As três afirmações originais não sobreviveram ao
confronto com o registo. Ficam aqui **como estavam e com o que se mediu**, porque apagá-las seria
esconder que esta é a candidata de prova mais fraca — e a decisão de a fazer entrar foi tomada com
esse facto à vista.

1. ~~«Bloco v3 kitchen-sink: 8 passos numa só sessão.»~~ → **n/d.** Nunca existiu em git
   (`git log --all -- '*COLAR_NO_CC*'` → vazio) nem está em disco.
2. ~~«v1.0 → v1.1 → v3: três gerações no mesmo dia, todas ADICIONARAM.»~~ → **refutada.** Junta duas
   famílias distintas (o MASTERPROMPT fez v1.0→v1.1; o COLAR_NO_CC fez v1→v4), e a única transição
   descrita em detalhe — o v4 — é uma **partição em PARTE A / PARTE B**, que é precisamente o gesto
   de subtracção que a afirmação diz não ter havido.
3. ~~«8 artefactos + 6 appends.»~~ → **refutada nos números.** São 9 ou 10 artefactos, e os appends
   eram **4** à hora em que a candidata foi escrita (04:49) — os Addendum 4 e 5 são de horas depois.

**Porque entra na mesma, e o que isso custa.** A lacuna que ela nomeia é real e nenhuma das 18 a
cobria. Mas é a única das quatro **sem gesto verificável**: a G1 confronta-se contra a fonte, a G11
valida o instrumento, a G18 procura o `[medido]`; «o que tentaste remover?» não tem comando. Sem
prova mecânica, é a pergunta mais fácil de carimbar das 20 — e acrescentar uma pergunta a um gauntlet
que este documento já diz estar sobrecarregado é, literalmente, a falha que a G20 existe para apanhar.

**A régua da G20:** a declaração tem de nomear **uma coisa concretamente removida** (`removido: X`) ou
**dizer porque nenhuma podia sair** (`nada saiu porque Y`). É um campo grep-ável pelo mesmo portão do
estágio 2, no formato das restantes. **Sem esse campo, a G20 não conta como respondida** — é a
condição que a torna auditável em vez de honrada.

**Tecto 20 · 0 slots.** Entradas desde a v4 (12 perguntas, tecto 13): a G13 (procura-antes-de-delegar)
ocupou o slot que estava livre — **não** elevou o tecto; a G14 (valor de negócio) elevou 13→14 e a G15
(memória cross-silo) elevou 14→15. Todas com retro-prova ×3 do próprio dia, nenhuma da literatura.
A v6 elevou 15→18 (G16, G17, G18) **por decisão explícita do dono no masterprompt de 2026-08-02** —
a única porta que a regra do fecho deixa aberta. As três atacam o mesmo buraco por ângulos
diferentes: o gauntlet media corretude (G1-G13), depois valor (G14-G15), e continuava sem perguntar
se o trabalho chega a alguém de fora (G16), se está no eixo defensável (G17), e se o que se promete
em público existe (G18).
**A partir daqui, entra uma → sai uma — e o tecto não volta a subir sem novo gesto do dono.**
As lentes C-level NÃO entram: vivem em `CONSELHO_C_LEVEL.md`,
por rotação, porque persona-por-entrega é o inchaço que Urbach mata.
Candidatas em fila de espera, à espera de RETRO-PROVA (correr contra ≥3 falhas
reais do registo e apanhar ≥1 que as 18 não apanham):
- *Pre-mortem* (Klein) — cortada por sobreposição com G10 e evidência mais fraca (lab 1989 vs teste executado).
- *Pontos de revisão anteriores abertos* (NASA) — volta QUANDO o registo de acções abertas existir
  como artefacto (cérebro da Wave M). Sem ficheiro grep-ável, é pergunta retórica.

- ~~**C1 — "o ✓ tem corpo?"**~~ · **SAIU DA FILA na v7 (2026-09-01), e não por ser fraca.** Era a de
  retro-prova mais sólida das quatro — 3/3 confirmadas com sha, e a linha defeituosa lida nos dois
  lados de cada fix. Sai porque **desce a MECANISMO**: «o ficheiro que este ✓ descreve tem bytes?» é
  um `statSync().size > 0`, e uma coisa que um portão faz em segundos não gasta um slot que um humano
  tem de correr em cada entrega de alto risco. A classe é real (3 falhas num só dia) e não pode
  simplesmente desaparecer — **fica como dívida declarada: o `stat` no hook de fecho do estágio 2**,
  ainda por implementar. Se essa dívida não for paga, o «✓ sobre nada» volta, e volta em silêncio.
  *(A retro-prova completa fica abaixo, para quem implementar o `stat` saber o que está a fechar.)*
- **C2 — "congelaste todas as superfícies?"** · candidata, retro-prova abaixo. *Um invariante
  aplicado a uma superfície e não às irmãs não é invariante, é um hábito. Quando se corrige uma
  classe de defeito, varrer TODAS as superfícies onde ela cabe, no mesmo commit.*
- ~~**C3 — "Leste a tabela de preços/regras INTEIRA do fornecedor?"**~~ · **ENTROU na v7 como G19.**
- ~~**C4 — "É a versão mais SIMPLES — o que tentaste REMOVER?"**~~ · **ENTROU na v7 como G20.**

#### Retro-prova da C1 ("o ✓ tem corpo?") — 3 falhas reais, todas de 2026-08-07

1. **`moo local ✓` com `bruto: ""`** (painel de juízes, 19:18Z). O `julgar.mjs` escrevia ✓ só por
   `r.ok`; o ramo irmão (kimi) já exigia `texto.trim()`. Um veredicto vazio entrou no painel como
   juiz válido. Fix `a5642ae2`. **As 18 não apanham:** a G18 exige `[medido]` num *claim*; aqui o
   claim era um símbolo de estado, não um número.
2. **Braço com 0 bytes registado como `TECTO ATINGIDO — incompleto`** (bateria T1). O run tinha
   3/3 tentativas sem uma linha de transcrição e o harness classificou-o como tentativa falhada,
   não como braço que não correu. Fix `b62146cc`.
3. **`artefacto/` vazio em 6 de 9 runs** com 5-7 MB de transcrição e `success` reportado pelos
   próprios agentes. A captura olhava para o git da worktree; o trabalho estava no scratchpad.
   Fix `7f78c72b`.

**O que a C1 apanha e as 18 não:** a G12 (denominador) pergunta *sobre quantos*; a G18 pergunta se
o número foi medido. Nenhuma pergunta se o **objecto que o estado descreve existe**. Os três casos
passariam as 18 sem tocar em nada.

#### Retro-prova da C2 ("congelaste todas as superfícies?") — 3 falhas reais, todas de 2026-08-07

1. **`--settings` por citar, quarta aparição.** Corrigido no `driver.mjs:258` (`b62146cc`) às 05:28.
   O mesmo defeito ficou vivo no `julgar.mjs:87` até às 14:5x (`dbb8142a`) — 9 horas — e teria
   custado o juiz Fable 5 no fecho. Só apareceu porque fui verificar as fontes do dossier.
2. **`think:false` do qwen3.** Medido e documentado no VERIFICADOR-0 de manhã (`5ae49188`); o
   `julgar.mjs` chamava o mesmo modelo sem ele e produziu o veredicto vazio da C1-1. Eu conhecia o
   defeito e não o generalizei. Fix `a5642ae2`.
3. **`runtime_bundle_sha` só no `driver.log`.** O driver provava o bundle e escrevia a prova numa
   superfície (o log) mas não na outra (o `meta.json`), e o `resultado.md` — o documento canónico —
   saiu a negar que a prova existisse. Fix `13779a6d`.

**O que a C2 apanha e as 18 não:** a G11 (instrumento) pergunta se o instrumento está calibrado
para *esta* medição. Nenhuma das 18 pergunta se o fix de ontem foi aplicado às **outras** superfícies
onde o mesmo defeito cabe. É a diferença entre corrigir um bug e fechar uma classe.

#### Retro-prova da C3 ("leste a tabela INTEIRA?") — 3 falhas reais, todas de 2026-08-12

Fonte: conversa Cowork 2026-08-12, artefactos em `_handoff/*2026-08-12*`.

1. **Batch API −50% empilhável com caching** apareceu só ao **6º turno**, e por pergunta do dono —
   não pela pesquisa. Custo: o masterprompt teve de ir de v1.0 para v1.1 (entrada do M4).
2. **Assimetria output ≈ 5× input ignorada** enquanto se optimizava o input. Entrou também só ao
   6º turno, como M5.
3. **Preço do Kimi lido de um agregador**, não do fornecedor. A regra "verificar o fornecedor no
   dia" foi escrita *a posteriori* (virou DO-NOT do M2).

**O que a C3 apanha e as 18 não:** a G5 pergunta pelo ecossistema/arte prévia; a G12 e a G18
perguntam pelos números que **eu** publico. Nenhuma das 18 varre os **descontos publicados pelo
fornecedor** que eu deixei na mesa.

#### Retro-prova da C4 ("o que tentaste REMOVER?") — 3 falhas reais, todas de 2026-08-12

Fonte: a própria conversa Cowork de 2026-08-12.

1. **Bloco v3 kitchen-sink**: 8 passos numa só sessão — apanhado pelo dono, não por mim.
2. **v1.0 → v1.1 → v3**: três gerações no mesmo dia, todas **ADICIONARAM**, nenhuma removeu.
3. **8 artefactos + 6 appends** numa conversa cujo tema é, precisamente, economia de tokens.

**O que a C4 apanha e as 18 não:** a G8 cobre gestos do **dono**; a G17 cobre o eixo (modelo vs
fluxo). Nenhuma das 18 força **subtracção** no entregável antes de ele sair.

> **Tecto 20.** Sobra **a C2** em fila. A entrada é decisão do Paulo e obedece à regra do fecho
> (entra uma → sai uma), ou a um gesto explícito do dono que eleve o tecto.
> **D8 — FECHADA a 2026-09-01.** «Entram a C3 e a C4» (gesto do dono, verbatim). A C3 entrou como
> G19, a C4 como G20, e o tecto subiu 18→20 — **terceira vez**, e a conta só fecha assim: a C1
> estava na FILA, e tirar da fila não liberta slot. Quem sai das 20 continua sem recomendação
> possível: sem dados do juiz O-1 não há poda por mérito, e as 13 perguntas sem delta literal **não
> são 13 perguntas mortas** (pelo menos G1, G9, G10 e G18 morderam por sentido — é o critério
> literal que as invisibiliza). Dossier da decisão, com as quatro candidatas confrontadas contra o
> registo por um motor diferente do autor: `_handoff/DOSSIER_D8_GAUNTLET_2026-09-01.md`.
>
> **D9 (Paulo, aberta):** a C2 entra? A sua retro-prova confirma-se em substância (5 shas
> verificados) mas tem **dois erros de facto por corrigir** — «14:5x» é 14:43:54, e a «quarta
> aparição» não se reconstrói (o registo prova três sítios; o quarto assenta num episódio que o repo
> conta com duas causas incompatíveis). E ela nunca confronta a **G6**, que é a única das 20 com
> «superfícies» no corpo. Corrigir antes de decidir.

## Como funciona — os 3 estágios de automação (honestidade sobre o que é automático HOJE)

1. **Hoje — contrato de prompt** (§3.9.6 do SUPERMASTER_MOOTER_2_0): o agente corre porque o
   briefing manda e declara no fecho. NÃO é automático — depende de obediência. É o estágio
   Urbach: funciona enquanto muda comportamento, degrada em tick-box.
2. **Próximo — enforcement mecânico (O-2):** hook de fecho de wave verifica a PRESENÇA e a FORMA
   da declaração `gauntlet:` (grep, como o wave-gate faz aos testes) — sem declaração, a wave não
   fecha. Barato, não avalia qualidade, mata o esquecimento.
3. **Fecho do loop — juiz O-1:** amostra declarações e distingue "internalizada" de "carimbada às
   cegas". Só aqui o gauntlet passa de checklist a sistema que aprende.

## Protocolo de declaração (formato fixo, grep-ável para o estágio 2)

`gauntlet: [classe] · Gn mudou X · G4 em [motor|auto-DEGRADADO|não-verificado] · não corridos: Gn (porquê) · removido: X | nada saiu porque Y · artefactos: a.json b.md`

Os campos, e o que cada um custa se faltar (tudo verificado por
`tools/gauntlet/portao-gauntlet.mjs`, que **lê as perguntas deste ficheiro** — não tem cópia delas):

| Campo | Quando | Sem ele |
|---|---|---|
| `[classe]` | sempre | reprova — a régua de disparo não tem quarta linha |
| `Gn` | as que a classe exige | reprova, e diz **quais** faltam |
| `Gn mudou X` | quando a pergunta mordeu | passa **com nota**: um gauntlet de alto risco que só aprova é indistinguível de um que não correu |
| `G4 em [motor]` | alto risco | reprova. Com `não-verificado`/`auto-DEGRADADO` passa **carimbado** — nunca limpo |
| `não corridos: Gn (porquê)` | ao saltar uma | saltar é legítimo; saltar **em silêncio** reprova |
| **`removido: X`** ou **`nada saiu porque Y`** | quando a **G20** é exigida | reprova. É a única das 20 sem gesto verificável — sem o campo, é a mais fácil de carimbar |
| **`artefactos: …`** | opcional | o que for nomeado é confrontado com o disco: **existe? tem bytes?** É a antiga C1, que saiu da fila na v7 por descer a mecanismo. Nada é adivinhado — um portão que inventa que ficheiros deviam existir cria uma segunda verdade sobre o que a entrega é |

**Aviso sobre a crase.** O portão tolera prefixos markdown (`` ` ``, `-`, `>`, `*`) porque a primeira
versão dele não os tolerava e ficou **cega a 11 das 27 declarações do registo** — escritas dentro de
crases, porque é assim que o formato aparece nesta secção. Um instrumento que não lê o que as pessoas
escrevem responde «não há declarações» quando a resposta certa é «não sei ler as que há». É a G11
virada contra o próprio gauntlet, e foi um motor diferente do autor que a apanhou.

**Onde corre.** No CI, sobre o **corpo do PR** (`.github/workflows/test.yml`, step «Gauntlet
declarado no PR»), em modo **advisory**: produz sinal, não bloqueia. Torná-lo obrigatório muda o
processo de toda a gente e é gesto do dono — não do agente que escreveu o portão.

## Regras de crescimento

- Tecto **20 efectivas**: hoje 20 + 0 slots. Entrada SÓ por retro-prova (≥3 falhas reais, apanha ≥1 nova).
  A v2 violou isto (5 entraram por autoridade da literatura numa tarde) — a v3 pagou a multa.
  A v4 respeitou-a: G11 e G12 entraram com 4 falhas medidas cada, todas do registo, nenhuma da literatura.
  A v5 respeitou-a: G13, G14 e G15 entraram com 3 falhas medidas cada, todas do próprio dia.
  A v6 respeitou-a: G16, G17 e G18 entraram com 3 falhas medidas cada, todas do registo verificável.
  **A v7 NÃO a respeitou, e isso fica escrito:** a G19 entrou com **2** confirmadas (e as duas são
  parentes — a mesma tabela, o mesmo delta) e a G20 com **0 de 3**, todas refutadas ou `n/d` na
  auditoria de 2026-09-01. Entraram por decisão explícita do dono, com a lacuna à vista. É a segunda
  vez na história do ficheiro que a régua de entrada cede; a primeira (v2) custou uma v3 inteira a
  pagar a multa. **Se o juiz O-1 vier a mostrar a G19 ou a G20 carimbadas às cegas, são as primeiras
  a sair** — entraram com menos prova do que qualquer uma das 18.
  Com 0 slots vale a regra do fecho: entra uma → sai uma. Elevar o tecto NÃO é alternativa a essa
  regra — exige decisão explícita do dono, registada. Aconteceu 3×: 13→15 (2026-08-01), 15→18
  (2026-08-02, masterprompt "O FLUXO, O ESTRANHO E O JUIZ") e 18→20 (2026-09-01, D8: «entram a C3 e
  a C4»). Um agente **nunca** eleva o tecto sozinho.
  **Aviso de calibração:** 20 perguntas é muito para correr a sério em cada entrega de alto risco —
  e o aviso agora é mais duro do que era, porque o tecto subiu enquanto o número de declarações
  válidas no registo era **zero** (medido 2026-09-01: 27 linhas `gauntlet:`, nenhuma passa o portão
  do estágio 2, a mais recente de 23/08). Um gauntlet que cresce sem estar a ser corrido cresce no
  papel.
  Se o juiz O-1 (estágio 3) mostrar perguntas carimbadas às cegas, a resposta é PODAR, não crescer.
- Pergunta que não muda nada em 3+ sessões de alto risco → o juiz distingue internalizada de
  carimbada; carimbada sai para a fila de espera.
- O log de deltas (`gauntlet:` nas declarações registadas) é o dado de calibração — N5 do Sócio.

## Fontes

CoVe 2309.11495 (números por tarefa, corrigidos na v3) · Nemeth 2001 (DA designado reforça;
nuance: estimula pensamento, mas do tipo errado) · Huang 2310.01798 (auto-crítica sem sinal
externo falha) · Reflexion 2303.11366 · CRITIC 2305.11738 · CIA Tradecraft Primer · Heuer/ACH ·
Haynes 2009 + Urbach 2014 (checklist muda comportamento ou não faz nada) · Klein/HBR (fila de
espera) · NASA NPR 7123.1 (fila de espera) · Superpowers two-stage.
