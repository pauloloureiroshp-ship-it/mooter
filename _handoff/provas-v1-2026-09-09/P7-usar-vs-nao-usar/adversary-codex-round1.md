<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 1; exit 0; 91 s; tokens_reported n/d; prompt_chars 46744; at 2026-09-10T00:06:42.262Z -->

**O 18/23 sobrevive à recontagem. A apresentação como vitória confirmatória intacta não sobrevive:** houve uma quarta corrida depois de um compromisso explícito de terminar na terceira, e congelou-se um ficheiro que o próprio pacote inclui na definição do tratamento.

**Não demonstraste seleção pelo resultado; demonstraste alteração da regra de continuação depois de observar resultados.** As primeiras corridas já tinham resultados parciais favoráveis. Acusar o autor de descartar derrotas para encontrar uma vitória iria além da evidência.

Recalculei os agregados a partir das 23 linhas fornecidas. Não acedi ao repositório, ledgers originais, commits, testes, controlador ou telemetria do fornecedor. As alegações de anterioridade, integridade e reprodução independente continuam por verificar.

### Ataques

**P7-01 — fatal para o estatuto confirmatório: o compromisso de parar foi quebrado**

- **Afirmação atacada:** «Quatro corridas […] esta é a que conta, e o critério não mudou uma vírgula entre elas.»
- **Porque não se sustenta:** a Emenda 2 determina: **«E se a corrida 3 também não fechar: o cartão P7 sai INVÁLIDA […] Uma quarta tentativa […] seria o mesmo gesto outra vez.»** A terceira não fechou. A Emenda 3 autorizou outra tentativa depois de conhecidos 12 sucessos em 13 pares. Escrever essa emenda antes dos resultados da quarta não a torna anterior à decisão informada pelos resultados anteriores. O limiar ficou igual; a regra de continuação mudou.
- **O que resolveria:** uma regra anterior aos resultados que autorizasse expressamente esta exceção. Sem ela, a quarta pode ser publicada como resultado após alteração do plano; não como execução sem desvios do compromisso apresentado.

**P7-02 — serious: quatro corridas não provam, por si, escolha da vitória**

- **Afirmação atacada:** «Nenhum deles é o resultado, e a razão é sempre a mesma: o limiar 16 foi calculado para 23 pares.»
- **Porque pode não se sustentar:** o denominador explica a recusa do controlador, mas não legitima automaticamente novos ensaios. Os limites de sessão, a deriva de estado e a autorização de reinício são questões diferentes. Também não há evidência de derrotas válidas descartadas: a corrida 1 já tinha **16 sucessos nos 21 pares válidos**. Se esses sucessos fossem preservados, mesmo dois insucessos adicionais deixariam X=16/23. Isso não valida a corrida, mas derruba a ideia de que foi necessário abandoná-la para alcançar o limiar.
- **O que resolveria:** histórico completo de tentativas, regras originais de invalidação e reinício, timestamps e resultados acessíveis em cada decisão. Não basta preservar os ledgers: é preciso justificar a regra que escolhe qual ledger conta.

**P7-03 — serious: a cache está dentro do tratamento definido**

- **Afirmação atacada:** «Não toca na experiência»; «congelar um ficheiro de cache fora da experiência».
- **Porque não se sustenta:** a Emenda 3 diz que o tratamento é **«o router pinado mais este ambiente e este estado»** e que `.budget-cache.json` participa no `estado_vivo_sha`. A localização fora do checkout não o coloca fora da experiência. Congelá-lo pode ser uma estabilização legítima, mas altera o regime de atualização de um componente do tratamento.
- **O que resolveria:** definição original completa do tratamento e evidência de que o congelamento era permitido. Caso contrário, descrever explicitamente o tratamento da quarta corrida como **hook com estado de orçamento congelado**.

**P7-04 — serious: a neutralidade comportamental do congelamento não foi demonstrada**

- **Afirmação atacada:** «O único efeito é a sessão do dono mostrar dados de orçamento […]»; «congelar este ficheiro não muda a decisão que o router toma».
- **Porque pode não se sustentar:** um `catch` não fatal demonstra apenas que uma falha pode ser tolerada. Não demonstra ausência de alterações de latência, refrescos repetidos, leituras de valores antigos ou decisões diferentes. A justificação «D1 […] força T0 em tudo» também falhou como afirmação universal: a quarta corrida contém três T2. Contudo, isso **não prova** que o congelamento mudou esses tiers: a terceira terminou antes de observar t21–t23.
- **O que resolveria:** código dos leitores e escritores, conteúdo da cache, hints completos e comparação controlada nas mesmas tarefas, com cache atualizável e congelada.

**P7-05 — serious: p exato na fórmula não significa inferência validada**

- **Afirmação atacada:** «p = 0,00531 — binomial exacta unilateral».
- **Porque pode não se sustentar:** a conta está correta: \(P[\mathrm{Bin}(23,0,5)\ge18]=0,005311\). A calibração inferencial exige justificar o modelo dos sucessos entre tarefas. Há tarefas heterogéneas, estado partilhado, possíveis dependências temporais e uma regra de continuação alterada. Contrabalançar a ordem não estabelece independência. O intervalo Wilson também não transforma este conjunto fixo numa amostra representativa.
- **O que resolveria:** justificação da unidade estatística, dependências, seleção de tarefas e procedimento de continuação. Até lá, chamar-lhe **p nominal do teste especificado**. Multiplicar automaticamente por quatro também não resolveria: não foram quatro ensaios completos equivalentes.

**P7-06 — serious: 0/3 no limiar não é ausência de ganho temporal**

- **Afirmação atacada:** «nas tarefas em que ele próprio reconhece dificuldade o ganho desaparece».
- **Porque não se sustenta:** em T2, ON foi mais rápido em **duas das três tarefas**. t21 poupou 81,83 s e falhou o limiar por apenas **0,703 s**; t23 poupou 74,54 s. t22 demorou 2,29× o OFF. O resultado correto é **nenhuma atingiu Z=1**, não «o ganho desaparece». Além disso, tier recomendado não é uma medição independente de dificuldade.
- **O que resolveria:** limitar a frase ao critério Z. Uma conclusão sobre tarefas difíceis exigiria classificação independente e mais tarefas desse tipo.

**P7-07 — serious: duas afirmações factuais são falsas**

- **Afirmação atacada:** «São também as três mais longas»; «são as três em que o Mooter não ganhou».
- **Porque não se sustenta:** por TVA_ON, as três mais longas são **t23, t22 e t12**. t12 é T0 e demora 519 s; t21 demora 331 s e é a quarta. Existem **cinco** tarefas com Z=0: t05, t16, t21, t22 e t23.
- **O que resolveria:** corrigir para «as três T2 tiveram Z=0; duas T0 também» e eliminar «as três mais longas». As linhas fornecidas já resolvem a questão.

**P7-08 — serious: a estratificação é descritiva, não uma localização causal do efeito**

- **Afirmação atacada:** «o ganho medido vive nas tarefas que o router classifica como triviais».
- **Porque pode não se sustentar:** o estrato foi definido exploratoriamente por uma saída do próprio tratamento. Os três T2 são também as últimas três tarefas e todas OFF-primeiro. Tier, posição na sequência, identidade das tarefas e ordem sobrepõem-se. A etiqueta «exploratório» é necessária, mas não permite atribuir o padrão à dificuldade ou à capacidade do router.
- **O que resolveria:** replicação com estratos definidos previamente, maior n e distribuição equilibrada por ordem e posição temporal.

**P7-09 — serious: a comparação de ordem mistura composições diferentes**

- **Afirmação atacada:** «ON-first […] won 11/12; OFF-first […] won 7/11. A cache artefact predicts the opposite pattern.»
- **Porque não se sustenta:** todos os três T2, com Z=0, estão no grupo OFF-primeiro. Considerando apenas T0, a comparação passa a **11/12 contra 7/8**: 91,7% contra 87,5%. Os rácios medianos T0 são aproximadamente **0,552 contra 0,565**. A oposição impressionante entre 11/12 e 7/11 depende fortemente da composição dos grupos.
- **O que resolveria:** comparação de ordem com tarefas comparáveis e repetições das mesmas tarefas em ambas as ordens. Os dados atuais não separam esses efeitos.

**P7-10 — serious: “primeiro” não demonstra cache fria; o padrão não exclui cache**

- **Afirmação atacada:** «ON com cache fria»; «ON com cache quente»; «portanto a cache não explica o resultado […] não é a causa».
- **Porque não se sustenta:** não há telemetria de hits, prefixos partilhados, expiração ou leituras/escritas de cache. Três corridas anteriores podem ter aquecido componentes. Os prompts ON e OFF diferem. Um mecanismo de cache pode coexistir com diferenças entre tarefas e produzir o padrão observado. Além disso, cache de prompts do fornecedor e cache local de orçamento são mecanismos distintos.
- **O que resolveria:** telemetria por braço e experiências com condições de cache controladas. Até lá: **«a comparação exploratória por ordem não permite excluir efeitos de cache»**.

**P7-11 — serious: igualdade de aprovação não é igualdade de qualidade**

- **Afirmação atacada:** «Quality did not move; time did»; «A diferença é só tempo»; «Os dois braços resolveram tudo».
- **Porque não se sustenta:** 23/23 aprovações em ambos os braços demonstra igualdade na taxa observada de aprovação desse teste. Não demonstra equivalência de correção, segurança, manutenção ou qualidade. Um teste binário com todos os resultados positivos tem efeito de teto. A ressalva posterior não corrige a afirmação principal.
- **O que resolveria:** para qualidade, critérios apropriados e desenho de equivalência. Para este pacote, substituir por **«Ambos os braços passaram o teste nas 23 tarefas; a qualidade além desse teste não foi medida.»**

**P7-12 — serious: verificações do aparelho não demonstram toda a integridade alegada**

- **Afirmação atacada:** «Nenhum braço mexeu no oráculo»; «a diferença é exatamente a que o pré-registo define».
- **Porque pode não se sustentar:** `tocou_no_teste=false` não demonstra, sozinho, que comandos, dependências, fixtures, configuração ou descoberta de testes ficaram intactos. Um fingerprint de quatro ficheiros não demonstra constância de todo o ambiente relevante. O disparo do hook confirma exposição ao tratamento; não isola o mecanismo do efeito.
- **O que resolveria:** snapshots, diffs, comandos efetivos e resultados de teste, âmbito dos hashes e configuração dos braços. Aqui só recebi afirmações e campos derivados.

**P7-13 — serious: o título omite a condição que tornou o resultado possível**

- **Afirmação atacada:** «On 23 real repository tasks with frozen external tests […] (p = 0.005)».
- **Porque pode não se sustentar:** 18/23 está sustentado pelas linhas, mas o título apresenta um p sem qualificação e não identifica a quarta corrida com orçamento congelado após alteração do compromisso de paragem. A autenticidade das tarefas e o congelamento externo dos testes também não são verificáveis neste material.
- **O que resolveria:** título limitado à observação, por exemplo: **“Run 4, with router budget state frozen: ON passed the test and met TVA_ON ≤ 0.8×TVA_OFF on 18/23 tasks.”** Colocar o p nominal e o desvio ao plano no corpo.

**P7-14 — minor: a nota de custo excede a evidência apresentada**

- **Afirmação atacada:** «on subscription; API spend US$ 0».
- **Porque pode não se sustentar:** a Emenda 1 declara compra de créditos. Isso não prova despesa na API, mas torna «on subscription» potencialmente enganador como descrição do financiamento. As quatro corridas registam **164 braços**, além de sondas e arranques falhados; não equivalem a quatro ensaios completos.
- **O que resolveria:** registos de faturação e definição do que se contabiliza. Sem eles, remover a afirmação monetária.

### SURVIVE

- **18/23** satisfazem Z; **22/23** têm ON mais rápido.
- Medianas **76,865 s e 145,341 s**; totais **61,682 min e 91,370 min**; rácio mediano **0,558**.
- **23/23 aprovações em cada braço**, segundo as linhas fornecidas.
- A cauda binomial nominal é **0,005311**.
- T0 **18/20** e T2 **0/3**, como descrição exploratória.
- Não está demonstrado que se tenham descartado derrotas para selecionar uma vitória.

### REWORD

- «GANHOU» → **«A quarta corrida atingiu o limiar numérico, após alteração do compromisso de paragem.»**
- «fora da experiência» → **«componente do estado do tratamento, congelado durante a quarta corrida»**.
- «qualidade não mudou» → **«a taxa observada de aprovação foi igual; qualidade além do teste não medida»**.
- «ganho desaparece em T2» → **«nenhuma das três T2 atingiu Z=1; duas foram mais rápidas»**.
- Título conforme P7-13; p identificado como nominal; desvio de continuação junto do resultado.

### DEAD

- «O critério não mudou» como descrição do procedimento completo.
- «Não toca na experiência».
- «As três mais longas».
- «As três em que não ganhou», implicando que eram as únicas.
- «A cache não explica o resultado / não é a causa».
- «A diferença é só tempo».
- Vitória confirmatória sem desvios, sustentada apenas por limiar e executor inalterados.

**SLIDE PUBLISHABLE WITH THESE EDITS — aplicar as substituições de REWORD, eliminar as afirmações DEAD e a nota monetária não verificada, e publicar a quarta corrida como resultado após alteração do plano, não como confirmação intacta do pré-registo.**