<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 1; exit 0; 123 s; tokens_reported n/d; prompt_chars 20823; at 2026-09-09T14:33:01.738Z -->

**A P4 não mede auto-revisão e não demonstra valor acrescentado do verificador.** Os totais apresentados são internamente coerentes; as interpretações principais excedem o desenho experimental. Há ainda uma contradição documental concreta: o fastify terminou em **55 segundos**, mas o slide atribui os oito mutantes ao limite de tempo de **60 minutos**.

Auditoria exclusivamente ao material fornecido. Não consultei repositórios, scripts, respostas brutas, testes ou fontes externas. **Fatal** significa que o problema invalida a conclusão em causa, não que inutiliza todos os dados.

### P4-01 — Selecção que favorece resultados próximos do máximo
**Severidade: serious**

**Afirmação atacada:** “both caught ~all”; “12 operadores”; “Sem escolha humana.”

Uma selecção determinística não é uma amostra representativa. Os primeiros mutantes mortos privilegiam os primeiros ficheiros, linhas e padrões elegíveis, em código já coberto por testes emparelhados. O log concentra os 28 casos em **15 ficheiros**, com várias linhas adjacentes e janelas sobrepostas. Os tamanhos totais dos repositórios não representam a cobertura efectiva desta experiência.

Doze operadores disponíveis também não significam doze operadores exercitados. Este desenho pode favorecer alterações locais óbvias e produzir um efeito de tecto nestes dois motores. **Não permite concluir que qualquer motor pareceria bom**, nem generalizar para revisão de defeitos naturais.

**Evidência que resolveria:** inventário completo de candidatos e exclusões, distribuição dos operadores efectivamente utilizados, sobreposição das janelas e uma nova amostra pré-registada, aleatória ou estratificada, incluindo alterações semanticamente mais difíceis.

### P4-02 — “Morto pelo teste” não demonstra necessariamente um defeito comportamental
**Severidade: serious**

**Afirmação atacada:** “28 mutantes mortos por teste”; teste do repositório como “oráculo”.

O log mostra estados e durações, não as causas das falhas. Uma falha pode resultar de uma asserção relevante, erro de sintaxe, carregamento, infraestrutura ou instabilidade. Verificar o original uma vez por ficheiro não isola todas essas possibilidades.

O teste é um oráculo defensável de **divergência relativamente ao comportamento testado**, desde que a mutação seja a causa comprovada. Não transforma automaticamente cada caso num defeito semanticamente confirmado.

**Evidência que resolveria:** patch exacto, saída completa da falha, asserção que distingue original e mutante e repetição original → mutante → original. Separar falhas comportamentais de falhas de compilação ou execução.

### P4-03 — n=28 transparente; explicação da paragem contraditória
**Severidade: serious**

**Afirmação atacada:** “fastify yielded 8 in the time cap”; “fastify só produziu 8 no tecto”.

O denominador foi corrigido honestamente para 28 nas taxas e intervalos. **Não há aqui um denominador de 30 escondido.**

Mas o log diz **“8 mutantes mortos em 55s”**, após cinco pares fonte/teste. Isso é compatível com esgotamento dos candidatos elegíveis, não com atingir 60 minutos. O material não demonstra a razão exacta da paragem nem como o protocolo tratava esse esgotamento antecipado.

**Evidência que resolveria:** condição de saída do gerador, timestamps e inventário dos candidatos. Corrigir a explicação para “esgotamento dos candidatos elegíveis” se confirmado, registando a clarificação sem fingir que houve timeout.

### P4-04 — O braço de auto-revisão não existe
**Severidade: fatal**

**Afirmação atacada:** “Self-review”; “Critic ≠ author”; “o mesmo motor a rever-se”.

O próprio veredicto admite que Opus **não escreveu as janelas**. As mutações vieram de operadores sintácticos; a autoria do código original não foi estabelecida como sendo de Opus. Ambos os braços são revisores de código alheio.

Consequentemente, esta experiência não pode confirmar nem refutar a hipótese sobre **autor versus crítico independente**. A ressalva enterrada no veredicto não corrige o título e as colunas do slide.

**Evidência que resolveria:** um braço em que o autor realmente produz código, com requisitos e histórico registados, seguido de revisão pelo próprio e por outro motor sobre os mesmos artefactos. É necessário definir se “próprio” significa mesma sessão com memória ou apenas mesmo modelo numa sessão nova. Para separar autoria de capacidade do motor, incluir também código escrito por ambos os motores e cruzar autores/revisores.

### P4-05 — O marcador revela o alvo e pode induzir acusações
**Severidade: serious**

**Afirmação atacada:** “o revisor não sabe qual é qual”; “28 janelas limpas”.

Se `MUDOU` aparece de forma exactamente igual nos dois grupos, **não revela por si só qual é mutante e qual é controlo**. Mas revela a localização onde se espera um problema e apresenta uma linha original como alterada. Isso pode aumentar tanto os acertos por localização como a propensão para `ACHADO`.

Além disso, “sem mutação” não significa “limpo”: passar um teste emparelhado não certifica ausência de defeitos. IDs `-M`/`-C`, ordem ou reutilização de contexto seriam outras possíveis fugas, mas não estão demonstrados.

**Evidência que resolveria:** prompts completos, IDs efectivamente enviados, ordem de apresentação e isolamento das chamadas; uma ablação pré-registada sem marcador e com marcadores de distracção. Chamar aos controlos “originais sem mutação”, não “limpos”.

### P4-06 — TP por proximidade não é TP por diagnóstico correcto
**Severidade: serious**

**Afirmação atacada:** “TP = ACHADO com PROVA na linha plantada (±2)”; “WRONG-REASON = 0”.

Uma acusação errada dentro de cinco linhas conta como TP. Uma explicação correcta com citação noutra linha pode contar como WRONG_REASON. A métrica mede sobretudo **localização**, não validade causal do diagnóstico. Como a linha está marcada, essa distinção é central.

Também não foi fornecido o parser: `SEM ACHADO` contém a palavra `ACHADO`. Uma pesquisa ingénua pode confundir ambos. Não afirmo que isso aconteceu; os resultados agregados não permitem excluí-lo. Faltam regras para múltiplos achados, múltiplas citações, saídas contraditórias e formato inválido. Exit 0 não resolve nada disso.

**Evidência que resolveria:** respostas brutas e parser; testes com saídas ambíguas; adjudicação cega da explicação contra o efeito da mutação; sensibilidade com tolerância zero. Até lá, “zero WRONG_REASON” não sustenta “zero diagnósticos pela razão errada”.

### P4-07 — Existência de coordenadas apresentada como proveniência
**Severidade: fatal para o alegado valor acrescentado**

**Afirmação atacada:** “ganhou a proveniência”; “what the pipeline adds is a verified citation”; “59/59 valid citations”.

`checkCitation` verificar que ficheiro e linha existem não demonstra que:

- a linha suporta a acusação;
- o defeito existe;
- a explicação está correcta;
- a linha corresponde ao conteúdo revisto.

O último ponto importa porque as janelas contêm mutações: uma coordenada pode existir na árvore original enquanto o conteúdo revisto era diferente. Uma referência rastreável precisaria de identificar também a versão ou mutação.

**59/59 referências dentro dos limites** é um resultado descritivo admissível. Não demonstra valor incremental do verificador: não há neste conjunto uma referência inválida cuja rejeição tenha alterado o resultado, nem comparação sem verificador. A correcção D2 pode demonstrar uma capacidade específica, mas a sua evidência não foi fornecida.

**Evidência que resolveria:** implementação e testes do verificador, ligação a snapshots exactos, casos negativos rejeitados e validação semântica independente. Remover “acrescenta valor medido” enquanto não houver uma comparação que meça esse incremento.

### P4-08 — p=1 está certo; a narrativa de derrota ou equivalência não
**Severidade: serious**

**Afirmação atacada:** “Neither holds”; “a diferença de 1 é ruído”; “the engine swap buys nothing measurable here”.

Os cálculos apresentados são coerentes:

- Mutantes: zero vitórias de B num discordante dá **p unilateral = 1** para superioridade de B.
- Controlos: zero vitórias de B em dois discordantes dá igualmente **p = 1** para menos FP.
- Os intervalos de Wilson correspondem às contagens apresentadas.
- Os totais por repositório e a concordância **53/56** batem certo.

Mas **p=1 não é prova de igualdade, de ausência de benefício ou de que a diferença é ruído**. Significa que estes dados não apoiam as alternativas direccionais escolhidas. Um ou dois discordantes oferecem pouquíssima informação.

Os intervalos binomiais também não incorporam a dependência entre janelas adjacentes nem a selecção determinística. O breakdown por repo torna os dados transparentes; não cria três replicações representativas.

**Evidência que resolveria:** mais unidades independentes, análise que trate agrupamento e intervalos para as diferenças emparelhadas. Para concluir equivalência, seria necessária uma margem de equivalência pré-definida e amostra adequada.

### P4-09 — Dois motores podem partilhar o mesmo erro
**Severidade: serious**

**Afirmação atacada:** “candidate real defects, not verified”.

Como hipótese para investigação, “candidato” é defensável. Como argumento favorável num slide para investidores, é uma sugestão sem validação. Ambos receberam o mesmo prompt, marcador e contexto limitado; não são confirmações independentes.

O caso `fastify-05` é especialmente incómodo: **ambos acusam o original e ambos deixam passar a mutação morta pelo teste**. Isso pode indicar uma interpretação partilhada errada do contrato. Não permite escolher a interpretação mais conveniente.

**Evidência que resolveria:** explicações brutas, contrato esperado, contexto completo e reprodução de um defeito no original. Até lá: “dois alarmes partilhados em controlos, não adjudicados”. Manter os FP na contagem.

### P4-10 — O slide vende uma experiência diferente
**Severidade: serious**

**Afirmação atacada:** título, “Printed loss”, “both caught ~all” e “measurable value is provenance”.

O slide converte uma comparação estreita entre dois revisores numa experiência sobre autoria e numa demonstração de valor do produto. Essas duas transições não são sustentadas.

As expressões proibidas **“enforces”, “most accurate”, “savings” e “private/secure” não aparecem no slide fornecido**. Isso passa na verificação literal. Contudo:

- 59/59 referências existentes não demonstra *enforcement*;
- esta amostra não sustenta “most accurate”;
- custo de B desconhecido impede alegar poupança;
- read-only e cwd vazio não demonstram privacidade ou segurança.

**Evidência que resolveria:** para este slide, corrigir as alegações. Para introduzir essas outras palavras, seriam necessárias provas específicas que esta experiência não contém.

**SURVIVE**

- Contagens reportadas: A 27/28 e 2/28 FP; B 26/28 e 4/28 FP.
- Denominadores de 28, intervalos de Wilson e p unilaterais, com limitações explícitas.
- Concordância 53/56 e breakdown por repo.
- Nenhuma evidência de superioridade de B neste conjunto.
- 59/59 coordenadas reportadas como existentes, sem validação semântica demonstrada.

**REWORD**

- “Self-review” → “Opus reviewer”; “Critic ≠ author” → “Codex reviewer”.
- “Neither holds” → “Neither superiority hypothesis was supported.”
- “Wrong-line findings: 0” → “Findings outside the ±2-line scoring tolerance: 0.”
- “Verified citation/provenance” → “59/59 reported file:line references resolved to an existing line; relevance was not assessed.”
- “Clean controls” → “Original, unmutated controls.”
- Motivo dos oito casos fastify → razão documentada, corrigindo a contradição dos 55 segundos.

**DEAD**

- Qualquer conclusão sobre auto-revisão real.
- “A diferença é ruído” ou equivalência entre motores.
- Valor incremental demonstrado do verificador.
- Zero WRONG_REASON interpretado como zero explicações erradas.
- Concordância dos FP usada como evidência de defeitos reais.

Não consegui verificar o congelamento efectivo do protocolo, código de geração e análise, falhas dos testes, prompts enviados, isolamento dos braços, respostas originais, execução de `checkCitation` ou correcção D2. Os agregados coerentes não substituem esses artefactos.

**SLIDE PUBLISHABLE WITH THESE EDITS:** substituir o título por “On 28 selected test-killed mutants, Opus scored 27/28 and Codex 26/28; superiority was not established”; retirar a nomenclatura de autoria, a alegação de valor incremental e a sugestão de defeitos reais; corrigir a explicação do fastify; limitar citações à existência de coordenadas; declarar selecção determinística, alvo marcado e pontuação por proximidade sem adjudicação semântica.