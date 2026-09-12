<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 1; exit 0; 91 s; tokens_reported n/d; prompt_chars 21353; at 2026-09-11T10:06:17.581Z -->

**O protocolo é publicável como plano de uma medição exploratória depois de corrigido. Não sustenta “sem perder aceitação”, não estabelece não-inferioridade e não permite atribuir uma eventual redução de tokens à delegação local.** A declaração de degenerescência é útil, mas várias conclusões retiradas dela são excessivas.

Aqui, **fatal** significa que a falha impede a conclusão atacada; não que torne todos os dados inúteis. Não há resultados para reprovar ou aprovar.

### Ataques

**CUSTO-01 — serious — A degenerescência não prova falha obrigatória**

- **Afirmação exata:** “o passo local […] não consegue fazer passar o teste de aceitação POR CONSTRUCAO”.
- **Problema:** não editar ficheiros implica preservar o estado inicial; não implica que esse estado falhe. Falta demonstrar que cada tarefa começa efetivamente vermelha, com o teste congelado instalado e executável. Uma tarefa já verde permitiria a B “resolver” sem edição e sem Opus.
- **Prova necessária:** por tarefa, execução inicial documentada com falha pertinente e execução da solução histórica com sucesso, no mesmo ambiente. Congelar previamente o tratamento de tarefas já verdes, testes vazios e falhas de infraestrutura.

**CUSTO-02 — serious — “B igual a A” e “duas tentativas” são descrições incompatíveis com o próprio mecanismo**

- **Afirmações exatas:** “O braço B fica igual ao A mais uma chamada local”; “Favorece B em aceitação”.
- **Problema:** se a chamada local não edita e o texto não chega ao Opus, B tem **uma oportunidade efetiva de reparação**, tal como A. Não há vantagem de aceitação demonstrada. Contudo, o teste intermédio pode criar artefactos, aquecer caches ou alterar estado antes da chamada Opus. Logo, igualdade das condições também não está demonstrada. Duas execuções estocásticas de Opus podem gastar tokens diferentes; a degenerescência não determina igualdade numérica.
- **Prova necessária:** comparação dos inputs efetivos e do estado antes de cada chamada Opus, incluindo efeitos do teste intermédio. Separar “número de chamadas” de “oportunidades de reparação”.

**CUSTO-03 — fatal — O critério permite perder aceitação e chamar-lhe não-inferioridade**

- **Afirmações exatas:** “sem perder aceitação”; “NAO-INFERIORIDADE: aceites_B >= aceites_A - 2”.
- **Problema:** A=20/B=18 passa com perda de 10 pontos percentuais. A=2/B=0 também passa, apesar de B não aceitar tarefa alguma. Se as duas perdas ocorrerem nas sete T0, aceita-se uma queda de **28,6 pontos percentuais nesse estrato**, supondo A=7/B=5. Não há mínimo absoluto de desempenho.
- **Prova necessária:** justificação operacional para tolerar essas perdas e linguagem limitada a “cumpriu o limiar descritivo de até duas aceitações líquidas a menos”. Para afirmar não-inferioridade estatística, é necessário um procedimento inferencial pré-especificado para a diferença emparelhada.

**CUSTO-04 — serious — Os totais deixam trocar tarefas resolvidas por tarefas falhadas**

- **Afirmação exata:** “aceites_B >= aceites_A - 2”.
- **Problema:** A e B podem aceitar dez tarefas cada, mas conjuntos completamente distintos. O critério passa mesmo que B perca todas as dez tarefas que A resolvia. Reportar discordantes ajuda a revelar isso, mas não impede apresentar o resultado como preservação de capacidade.
- **Prova necessária:** tabela das quatro possibilidades emparelhadas, identificação das tarefas perdidas/ganhas e regra antecipada sobre o significado operacional dessas trocas.

**CUSTO-05 — fatal — Os testes estatísticos anunciados não demonstram a propriedade reclamada**

- **Afirmação exata:** “McNemar exacto, bilateral), Wilson 95% por braço […] o critério é o ponto”.
- **Problema:** o McNemar bilateral testa uma hipótese diferente de não-inferioridade com margem. Intervalos separados por braço não são um intervalo da diferença emparelhada. Um resultado não significativo não demonstra equivalência ou não-inferioridade. O aviso “nenhum destes é o critério” reconhece que a decisão será apenas pontual; não legitima o nome.
- **Prova necessária:** ou retirar a alegação inferencial, ou congelar hipótese, intervalo emparelhado, nível de confiança, regra de decisão e avaliação da precisão alcançável. A dependência entre tarefas relacionadas também precisa de tratamento ou limitação explícita.

**CUSTO-06 — serious — O denominador pode recompensar desistências baratas**

- **Afirmação exata:** “tokens de Opus por tarefa aceite”.
- **Problema:** incluir todas as chamadas no numerador é correto, mas não elimina o incentivo a abandonar tarefas caras. Exemplo: A aceita 20 e gasta 200 unidades; B aceita 18 e gasta 90. B passa o limiar e melhora de 10 para 5 unidades por aceite, mesmo que a melhoria venha exclusivamente de falhar barato nas duas tarefas difíceis.
- **Prova necessária:** apresentar obrigatoriamente tokens totais, tokens por tarefa atribuída, aceitações e resultados por tarefa. Congelar o tratamento de zero aceites: a razão fica indefinida, nunca zero. Comparações entre tarefas aceites por ambos devem ser secundárias, pois também condicionam no resultado.

**CUSTO-07 — fatal — Uma invocação não resolve a contabilização de tokens**

- **Afirmação exata:** “uma invocação = uma tentativa, sem ambiguidade de atribuição”.
- **Problema:** uma invocação pode conter várias chamadas ao modelo, ferramentas, subagentes e retries. Não está especificado se `usage` e `modelUsage` são fontes alternativas ou somadas, como se evita dupla contagem, como se identificam aliases do modelo e como se contabilizam chamadas que terminam sem JSON final. A cadeia `parentUuid` é uma proposta de atribuição, não uma prova de completude.
- **Prova necessária:** esquema e extrator congelados, exemplos reconciliados por chamada, cobertura de subagentes e falhas, regras de deduplicação e resolução de divergências. Timeout com consumo e sem JSON deve ser “consumo desconhecido”, nunca zero nem exclusão conveniente.

**CUSTO-08 — serious — Os 58 mil tokens tornam contexto e cache parte central do tratamento**

- **Afirmações exatas:** “soma de input + output + cache_creation + cache_read”; “O custo fixo por invocação domina”.
- **Problema:** contar todas essas categorias mede volume de tokens segundo essa definição, não custo monetário: o próprio protocolo atribui preços diferentes às categorias. Um cache hit pode reduzir o yardstick sem reduzir o total contado. Contextos de sistema, ferramentas ou instruções diferentes podem produzir uma aparente vantagem atribuída ao router. Dividir por aceites **não controla** o custo fixo; apenas o distribui.
- **Prova necessária:** contagens separadas por categoria e chamada, tamanho e identidade do contexto efetivo, política de cache e ordem cronológica. Os 57 957 tokens de criação, isoladamente, custariam cerca de **US$0,362** pelo yardstick declarado; os US$0,58 exigem discriminação dos restantes componentes ou explicação da diferença de preços.

**CUSTO-09 — serious — O yardstick pode tornar-se publicidade de poupança sem usar “$ poupados”**

- **Afirmações exatas:** “isto NAO é uma afirmação de poupança”; “local_usd_por_Mtok […] 0”; “é o número da Anthropic, não o nosso”.
- **Problema:** uma seta descendente, “−X% de custo”, “mais barato” ou um gráfico A/B em dólares comunica poupança mesmo evitando a expressão proibida. O yardstick omite energia, hardware e outros custos locais. `total_cost_usd` é um valor reportado pelo CLI; o texto não demonstra que seja faturação efetiva. Os multiplicadores de cache também não têm fonte congelada nem regra para modalidades diferentes.
- **Prova necessária:** rotular todas as visualizações como **valorização teórica aos preços declarados, não despesa efetiva nem custo total**; congelar fonte e categorias tarifárias; chamar à segunda coluna “estimativa reportada pelo CLI”. Uma alegação económica exigiria dados económicos adicionais.

**CUSTO-10 — fatal — “Inválido” permite apagar resultados de forma assimétrica**

- **Afirmação exata:** “alguma tentativa não ARRANCOU […] é INVALIDO e não conta para nenhum braço”.
- **Problema:** se A já correu, gastou tokens e falhou, uma falha posterior de arranque em B elimina também esse resultado de A. B tem mais operações sujeitas a falha nas T0. Excluir essas falhas remove precisamente um possível custo de fiabilidade do router. “Arrancou” não tem evento técnico definido: processo criado, primeira chamada ao modelo ou primeiro token?
- **Prova necessária:** definição verificável do evento de arranque e tabela de todas as tarefas atribuídas, incluindo consumo anterior à invalidação. Falhas operacionais devem permanecer visíveis no resultado de fiabilidade; análise de pares completos não pode substituir esse registo.

**CUSTO-11 — serious — A regra de paragem protege contra reruns, mas deixa escolher quando ficar sem resultado**

- **Afirmações exatas:** “por qualquer motivo […] n/d nas métricas não fechadas”; suplentes “SO […] git archive falhar”.
- **Problema:** o autor pode interromper após resultados desfavoráveis e publicar `n/d`. Não seria uma vitória falsa, mas seria supressão seletiva do fracasso. Falta definir quais métricas ficam “fechadas”, se uma tentativa iniciada pode continuar após interrupção do controlador, quando se usam suplentes e se a ordem da lista é obrigatória.
- **Prova necessária:** controlador e plano de publicação congelados; publicação de todo o prefixo executado, motivo de paragem e custos consumidos; regra determinística de substituição; proibição de transformar resultados parciais numa alegação favorável.

**CUSTO-12 — serious — O contrabalanço global esconde desequilíbrio precisamente nas tarefas relevantes**

- **Afirmação exata:** “contrabalançada por tarefa”.
- **Problema:** há dez pares de cada ordem no total, mas nas sete T0 há **cinco “A-depois-B” e duas “B-depois-A”**. Nas T3 há cinco e oito. O estrato onde B acrescenta o passo local fica desequilibrado relativamente à posição temporal. Cache, carga e aquecimento podem contaminar a comparação. Além disso, os rótulos devem ser traduzidos inequivocamente em sequências executáveis.
- **Prova necessária:** ordem efetiva congelada e timestamps; balanceamento dentro do tier antes da execução, ou reconhecimento explícito da limitação e resultados por ordem. Com uma corrida pequena, reportar estratos não garante remover o efeito.

**CUSTO-13 — serious — Worktrees separados não demonstram ausência de estado partilhado**

- **Afirmação exata:** “cada braço num worktree fresco próprio — não há estado partilhado entre braços”.
- **Problema:** `git archive` reconstrói ficheiros versionados; não isola diretórios pessoais, serviços, caches, processos, configuração global, rede ou estado do provedor. O protocolo menciona explicitamente recursos em `~/.claude`. A afirmação absoluta é mais forte do que o mecanismo descrito.
- **Prova necessária:** mapa de isolamento e dependências, diretórios temporários por braço, política para serviços e caches e inventário do estado global acessível. Reescrever como “diretórios de trabalho separados; estado global identificado e controlado onde indicado”.

**CUSTO-14 — fatal — Congelar um ficheiro de teste não congela a aceitação**

- **Afirmação exata:** “sai 0 […] com o test_file byte-idêntico”.
- **Problema:** é possível alterar fixtures, auxiliares, configuração ou dependências de forma a neutralizar as asserções sem tocar no ficheiro vigiado. O próprio processo de teste pode terminar prematuramente com código zero. Os padrões de skip retiram verificações sem justificação por tarefa apresentada aqui. Falta ainda explicar como o teste histórico congelado é instalado sobre o `parent`.
- **Prova necessária:** avaliador protegido, conjunto completo das dependências do critério, contagem esperada de testes e skips, prova de execução das asserções relevantes e regras para alterações proibidas. Sem isso, “aceite” significa apenas satisfazer este comando, não reparar corretamente o problema.

**CUSTO-15 — serious — “Como está em produção” não identifica um tratamento reprodutível**

- **Afirmações exatas:** “Router como está”; “claude_cli: n/d”; “modelo local […] resolvido em tempo de corrida”; snapshot vinculativo “no arranque”.
- **Problema:** não estão congelados o CLI, `router-execute`, harness, configuração completa, contexto carregado ou identidade imutável dos modelos. Os valores iniciais vinculativos podem mudar depois de ver o protocolo. Mantê-los constantes durante a corrida prova estabilidade interna, não escolha anterior. Também falta demonstrar que a sequência manual descrita corresponde ao percurso real do produto.
- **Prova necessária:** manifesto de execução completo e anterior ao primeiro resultado, hashes dos executáveis e configurações relevantes, identidade dos modelos e trace do percurso efetivo. Asserções sobre D15 exigem prova de runtime, não apenas uma referência a commit.

**CUSTO-16 — serious — Um commit não demonstra sozinho anterioridade nem ausência de seleção prévia**

- **Afirmações exatas:** “a prova de anterioridade é o commit”; “20 de 25 […] nunca por resultado”.
- **Problema:** o commit identifica conteúdo, mas sem ancoragem independente não demonstra que precedeu todas as execuções. A seleção determinística restringe a escolha dos 20, mas não explica a escolha prévia das 25 tarefas, da seed ou das exclusões. A reutilização de tarefas do R-24 permite conhecimento anterior da sua dificuldade. Há vários testes e módulos repetidos; não são necessariamente 20 unidades independentes de “trabalho real”.
- **Prova necessária:** registo externo do hash antes da corrida, histórico de exposição ao corpus, critérios de inclusão das 25 tarefas e justificação da seed. Limitar conclusões ao corpus selecionado.

**CUSTO-17 — serious — Ainda há liberdade analítica depois de ver os números**

- **Afirmações exatas:** “Resultado reportado também estratificado por tier”; “a divergência é reportada”; ledger “uma linha por tentativa”.
- **Problema:** não estão fixados fonte prevalecente após divergência, precisão e arredondamento, tratamento de dados ausentes, critério de “reduz tokens”, custo dos pares inválidos ou seleção do resultado principal do slide. O ledger enumerado não exige vários elementos necessários: motivo de invalidação, timestamps, sequência real, consumo local, artefacto da resposta local e completude de contabilização.
- **Prova necessária:** script de análise e formato de resultados congelados, com campos obrigatórios e todos os casos-limite resolvidos. Publicar os dois braços, ambos os tiers, custos, aceitações, falhas e dados ausentes, independentemente da direção.

### SURVIVE

- Declarar explicitamente a ausência de executor local capaz de editar é uma limitação relevante e honesta **se documentalmente confirmada**.
- Seleção explícita das tarefas, hashes e ordem publicada reduzem algumas escolhas posteriores.
- Incluir consumo de tentativas falhadas e escaladas no numerador é correto.
- Separar tokens locais de tokens Opus é legítimo para uma pergunta estritamente sobre utilização de Opus.
- Uma corrida pode produzir uma **descrição auditável destes casos**, incluindo overhead local, consumo, tempo e aceitações observadas.

### REWORD

- “Não-inferioridade” → **limiar descritivo de até duas aceitações líquidas a menos**.
- “Sem perder aceitação” → reportar a diferença efetivamente observada.
- “Duas tentativas favorecem B” → duas chamadas, mas uma oportunidade efetiva de reparação sob a degenerescência declarada.
- “Não há estado partilhado” → diretórios separados, com isolamento global por demonstrar.
- “Custo” → distinguir volume de tokens, valorização teórica e estimativa do CLI.
- “Router em produção” → percurso e configuração concretamente identificados.
- “Prova pelo commit” → conteúdo identificado pelo commit e anterioridade demonstrada por registo independente.

### DEAD

- Demonstrar não-inferioridade pelo critério pontual.
- Atribuir uma redução observada à substituição de Opus por execução local, quando essa substituição não existe.
- Inferir poupança económica, retorno financeiro ou custo total a partir deste yardstick.
- Tratar passagem do comando como prova geral de reparação correta.
- Excluir consumo conhecido por invalidação do par e continuar a chamar ao resultado “custo real” do percurso.
- Generalizar uma corrida deste corpus para tarefas, utilizadores ou configurações em geral.

**O que pode concluir legitimamente:** numa execução completa e instrumentada, quantas destas tarefas cada braço passou, quantos tokens foram contabilizados segundo uma definição explícita e quanto tempo consumiu o percurso. Pode observar diferenças; não consegue, por si só, separar efeito do router, variação do Opus e efeitos de ambiente.

**Não pude verificar:** repositório, hashes, anterioridade, conteúdo dos testes, reconstrução das tarefas, implementação do executor, D15, isolamento, semântica dos campos de utilização, preços ou sonda de US$0,58. Nenhuma dessas afirmações foi validada por esta revisão.

**SLIDE PUBLISHABLE WITH THESE EDITS:** apresentar apenas o desenho exploratório; corrigir não-inferioridade, degenerescência e isolamento; fechar previamente aceitação, contabilização, invalidações e análise; ancorar a anterioridade e congelar o ambiente. Qualquer slide que já apresente sucesso, poupança ou “sem perda de aceitação” é NOT PUBLISHABLE.