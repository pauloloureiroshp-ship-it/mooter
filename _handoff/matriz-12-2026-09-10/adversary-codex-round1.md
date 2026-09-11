<!-- adversary: codex exec (gpt-6-astra, effort medium), read-only, cwd vazio, --ignore-user-config, prompt por stdin; round 1; ok true; 151 s; tokens in 85239 (cached 42112) out 4643 reasoning 420; prompt_chars 43075; at 2026-09-11T10:10:39.061Z -->

Vou confrontar as afirmações com as tabelas fornecidas, distinguindo contradições verificáveis de conclusões que exigem dados em falta.

**O resultado descritivo resiste; várias “provas” não.** As tabelas dão ao Haiku mais pontos agregados e menor custo de lista imputado do que ao B. Não sustentam um limite de ruído de 2 pontos, a superioridade intrínseca do 14b sobre o 30b, nem quatro causas identificadas.

Analisei apenas o material fornecido. Não pude verificar respostas completas, justificações dos juízes, código, patch D1, logs, hashes, cronologia, preços citados ou isolamento efectivo. As severidades abaixo referem-se à afirmação atacada.

**M12-01 — serious — Custo imputado apresentado como facturação**

> “custo faturado $”; “custou menos”; “**$0 reais**”

Não há facturação por token demonstrada. Há uma simulação a preços de lista sobre utilização por subscrição. “$0 reais” também confunde ausência de cobrança incremental com ausência de custo: subscrições, GPU e energia existem.

A objecção específica da cache, porém, **não derruba a ordenação fornecida**:

- Com cache: B $0,1620; C $0,1527 — diferença $0,0093.
- Na coluna “custo resposta”: B $0,1140; C $0,0521 — diferença $0,0619.

Retirar a cache **aumenta** a diferença contra B. As duas chamadas Opus são escolhas do router e pertencem legitimamente ao custo do braço B. O problema é apresentar esta contabilidade como custo económico da escolha real.

**O que resolve:** fórmula auditável, fonte datada, usage bruto e separação entre custo imputado da resposta, overhead do harness e cobrança incremental. Substituir “faturado” por “imputado, incluindo cache”.

**M12-02 — serious — Domínio agregado transformado numa recomendação geral**

> “existe uma alternativa mais barata que ele e melhor que ele, e é a mais simples de todas — mandar tudo para o modelo pequeno de nuvem.”

A ordenação vale para **dois totais**, neste conjunto e nesta contabilidade. C ganha em pontuação média em 9 prompts, empata num e perde em dois. Nos dois T3, B soma 20 contra 15 de C. B também tem menor tempo total reportado.

Logo, não existe domínio em todas as tarefas ou dimensões. O próprio texto admite que não demonstrou a adequação de “tudo para Haiku” em risco.

**O que resolve:** escrever “C obteve maior pontuação agregada e menor custo de lista imputado nestes 12 prompts”. Uma recomendação de utilização exige distribuição representativa de pedidos e critérios mínimos de segurança.

**M12-03 — fatal — O máximo observado não calibra o ruído**

> “**Ruído do instrumento: 2 pontos.** […] A distância de B a C é 24. Não é ruído.”

São duas duplas de respostas, avaliadas por dois juízes. Os quatro pares de notas não são quatro réplicas independentes: os juízes avaliam as mesmas respostas. Misturam variação da geração e do julgamento.

O máximo observado não é um limite superior do ruído. Além disso, compara-se uma diferença **por prompt e juiz** com uma diferença **somada em 12 prompts**. Não têm a mesma escala estatística.

O D8 já reportava uma diferença de **3 pontos** no ensaio de fumo. Isso contradiz qualquer apresentação de 2 como limite conhecido, embora não altere o máximo observado nesta corrida.

**O que resolve:** retirar “ruído calibrado” e “não é ruído”. Para quantificar incerteza, pré-registar repetições de geração e julgamento em vários tipos de tarefa. Agora só é defensável dizer que ambos os juízes colocaram C acima de B no agregado.

**M12-04 — serious — Critério de sucesso alterado depois do resultado**

> “MKT-3 […] ≤ 1, mas ≤ ruído (2): **não é vitória**”

A previsão registada pede custo menor com qualidade equivalente até 1 ponto. MKT-3 apresenta B−A = −1 e custo imputado menor. **Satisfaz o critério operacional registado.**

Um intervalo de equivalência não exige que B mostre superioridade de qualidade acima do ruído. A fragilidade da medição deve ser declarada; não autoriza a substituir a regra de sucesso.

Assim, pelos critérios escritos e pelas notas fornecidas, acertam **6 de 12 previsões**, incluindo uma das seis previsões de vitória. “As de vitória falharam todas” contradiz também “5 das 6 […] falharam”.

**O que resolve:** corrigir a contagem e classificar MKT-3 como cumprimento do limiar registado, sem equivalência estatística demonstrada. Alternativamente, apresentar uma emenda prévia verificável que estabelecesse outro critério.

**M12-05 — serious — B não é “Anthropic” nos casos que explicam a derrota**

> “Os bracos A, B e C sao todos Anthropic”; “Não muda o veredicto sobre o Mooter”

B é Qwen em **10 dos 12 prompts**. Precisamente nesses dez, C usa Anthropic. Um eventual favoritismo de J2 por Anthropic pode, portanto, afectar directamente B contra C.

J1 também prefere C no agregado, por 14 pontos; isso sustenta concordância de ordenação, mas não elimina um viés comum contra estilo local, respostas curtas ou raciocínio exposto. A diferença de J2 é 34 pontos.

**O que resolve:** corrigir a composição dos braços e fornecer notas por critério com justificações. Acrescentar avaliação independente de conteúdo; J3 pode ajudar, mas não é automaticamente um árbitro sem viés.

**M12-06 — serious — Preferência observada não demonstra a causa “família”**

> “O viés está nos dados, não na teoria.”

Os dados mostram que cada juiz coloca primeiro o candidato da sua família. Não demonstram **porquê**. A mesma tabela é compatível com diferentes ponderações de correcção, extensão, cautela ou estilo.

Não se pode provar viés de família por esta associação e depois declarar que esse viés não contamina outra comparação.

**O que resolve:** substituir por “padrão compatível com viés de família”. Demonstrar o mecanismo exigiria mais juízes e experiências que separassem conteúdo, estilo e identidade percebida.

**M12-07 — serious — Previsões falhadas não ilibam a selecção dos prompts**

> “Que 5 das 6 previsões de vitória tenham falhado sugere que não foram escritos para dar razão à tese”

Não é uma inferência fiável. Previsões podem falhar por desconhecimento do produto, má previsão ou escolha enviesada para outra narrativa. Não é preciso ter existido manipulação deliberada para a amostra estar enviesada.

Mais grave é a formulação anterior:

> “Se os prompts tivessem sido feitos para dar razao as previsoes, isso nao teria acontecido.”

Isso pressupõe que quem tentasse favorecer a tese conseguiria fazê-lo infalivelmente. Não procede.

**O que resolve:** retirar ambos os argumentos de auto-isenção. Usar prompts seleccionados independentemente, com critérios e proveniência registados antes de consultar rotas ou resultados.

**M12-08 — serious — Quatro hipóteses são promovidas a causas**

> “Porque perde — as causas que os dados deixam ver”; “Há quatro causas e um número.”

A corrida observa uma configuração conjunta, não os efeitos separados:

- **Rota:** sabe-se onde B caiu; não quanto ganharia usando Sonnet nesses pedidos.
- **Modelo de código:** a especialização é uma hipótese explicativa, não uma causa demonstrada. B2 não resolve o problema, porque introduz diferenças de raciocínio e truncagem.
- **System prompt curto:** instrução e respostas curtas coexistem; falta a comparação com o mesmo modelo e instrução neutra.
- **Arbiter inactivo:** não se observou que rotas escolheria, nem a qualidade e custo resultantes.

“Não se consegue dizer quanto pesa cada uma” continua a pressupor que todas contribuem para a derrota. Algumas podem ter efeito nulo ou interagir.

**O que resolve:** chamar-lhes “quatro hipóteses explicativas”. Executar ablações registadas, incluindo possíveis interacções, antes de atribuir causalidade.

**M12-09 — serious — A quinta explicação omitida é o instrumento**

> “Há quatro causas e um número.”

Falta considerar **a construção da amostra e da pontuação**: prompts do autor, dois pedidos aparentados sobre chaves de API com risco a dobrar, respostas avaliadas conjuntamente e possível preferência por desenvolvimento extenso.

Isso não prova que a derrota seja um artefacto. Impede fechar a lista nas quatro características do produto. Um quinto candidato é o próprio desenho da experiência; outro é a desigualdade dos harnesses.

**O que resolve:** incluir explicitamente estas hipóteses e apresentar pontuações por critério, justificações e futuras avaliações independentes. Não há evidência para acusar ocultação intencional; há uma exclusão argumentativa injustificada.

**M12-10 — serious — Activar a chave pode não activar o arbiter neste ensaio**

> “M12-c | `ANTHROPIC_API_KEY` presente → arbiter activo”

O protocolo descreve B como decisão de `classify()` seguida de execução pinada. O D7 localiza a chamada ao arbiter em `inject_context.js`. Sem o percurso de execução, não está demonstrado que o harness usado invoque esse hook.

É possível que adicionar a chave não mude nada, por o ensaio contornar a integração relevante.

**O que resolve:** mostrar o percurso efectivo da chamada, com registo da invocação ou do no-op e da decisão final. Só depois prometer que a chave é a única variável necessária.

**M12-11 — serious — O patch D1 não é auditável pela sua dimensão**

> “14 linhas em `tools/router/router-execute.js`”; “Aplicado aqui so o hunk do `maxTokens`”

Catorze linhas podem alterar precedência de opções, validação, valores por defeito, providers abrangidos ou comportamento perante erros. O exemplo da lista demonstra que uma chamada deixou de cortar; não demonstra ausência de outros efeitos.

Os hashes congelados de `classify.js` e `patterns.js` não congelam o executor modificado.

**O que resolve:** diff exacto, hash final do executor, cronologia da aplicação e testes relevantes de opções, defaults e providers. Sem isso, o braço é “Mooter com patch D1 declarado”, não uma reprodução verificada do produto intacto.

**M12-12 — fatal — A conclusão sobre os modelos depende das respostas truncadas**

> “`qwen3:30b` é pior que `qwen2.5-coder:14b` nesta máquina […] A ordem do probe está certa”

Nos dez prompts, B2 soma 33,5 contra 36,5. Contudo, nos **oito sem truncagem reportada**, as próprias tabelas dão:

- 14b: **31,0**.
- 30b: **31,5**.

Esta exclusão é apenas uma análise de sensibilidade, não um novo resultado principal. Mostra que a ordenação agregada depende dos casos truncados.

A comparação continua válida como comparação das **configurações executadas com tecto 2048**. Não identifica superioridade do modelo nem valida um probe de código através desta amostra predominantemente não técnica.

**O que resolve:** limitar a conclusão à configuração. Para comparar modelos, registar condições de raciocínio, orçamento e conclusão da resposta, com repetições. Não apagar retrospectivamente as truncagens da análise principal.

**M12-13 — serious — Chamada directa não isola o modelo da configuração**

> “Confirmado com uma chamada directa a `/api/chat`, sem o Mooter pelo meio: **e o modelo, nao o adaptador**.”

A chamada directa elimina o wrapper Mooter, mas mantém servidor, versão, template e artefacto do modelo. Não prova que o comportamento seja uma propriedade intrínseca do Qwen.

O texto também transforma uma instrução condicional — “para perguntas simples” — num limite geral de três frases. E **107 tokens não é uma contagem de palavras** que, por si só, demonstre incumprimento do pedido de 120 palavras.

**O que resolve:** fornecer versão do Ollama, digest/template, pedido e resposta completos, campos de término e contagem efectiva de palavras. Restringir a conclusão à configuração observada.

**M12-14 — serious — Omitir um termo não basta para provar insegurança**

> “não menciona `NEXT_PUBLIC_` — que é exactamente a forma de a chave ir parar ao browser”

Sem a resposta completa, não é possível saber se ela fornece instruções suficientes para manter a chave no servidor. A ausência desse identificador pode ser uma omissão relevante; não prova, isoladamente, uma recomendação insegura.

P5 nem sequer especifica Next.js. Não pode herdar automaticamente a mesma exigência textual.

**O que resolve:** publicar as respostas e uma avaliação específica por prompt, com critérios de exposição da chave. Aqui só se verificam as rotas reportadas e as notas, não a alegada falha técnica completa.

**M12-15 — serious — Contradições concretas comprometem a apresentação**

> “uma corrida, **56 respostas**, 0 falhas”

Os braços fornecidos implicam **58 respostas**: quatro braços completos de 12 mais B2 de 10.

> “DEV-2: **4,0** contra 8,0 do Haiku”

B recebe 6 e 4: média **5,0**. O 4,0 pertence a B2.

> “custo faturado $” de D: **0.0000**

As tabelas mantêm os zeros que o D5 diz ter corrigido para `n/d`.

“0 falhas” também precisa de significar falhas de execução, porque existem truncagens e houve falhas de transporte no julgamento.

**O que resolve:** reconciliar contagens, corrigir DEV-2, propagar `n/d` e definir separadamente sucesso técnico, truncagem e qualidade.

**M12-16 — serious — Pré-registo declarado não é cronologia comprovada**

> “`congelado_em` gerado por `new Date()`, não à mão”

Uma data gerada pelo relógio local não prova publicação anterior, imutabilidade ou ausência de edições. Um hash identifica conteúdo; sem âncora anterior verificável, não demonstra quando ficou fixado.

Houve ensaios, conhecimento prévio das rotas e alterações antes da corrida. Isso pode ser legítimo, mas exige uma cronologia das decisões.

**O que resolve:** registo externo anterior à primeira resposta avaliada, hashes completos dos artefactos finais e histórico dos ensaios e alterações. Até lá: “pré-registo declarado no pacote”.

**M12-17 — serious — A linguagem excede a amostra e a rubrica**

> “o classificador não usa o degrau do meio”; “faz **metade** dos pontos do Haiku”; “a rota […] produz menos qualidade”; “pontos por $”

“Não usa” generaliza 0/12 ao classificador. “Metade” não corresponde a 36,5 contra 65,5 e introduz uma proporção retórica. “Qualidade” promove notas de leitura a correcção validada. “Pontos por dólar” parece uma métrica de retorno económico, embora use uma escala ordinal somada e dólares não facturados.

O título “escolha real do utilizador” também fica comprometido quando a abertura centra o comparador secundário C e transforma esse resultado numa escolha recomendada. A comparação primária com A deve permanecer explícita.

**O que resolve:** usar contagens exactas, “pontuação atribuída pelos juízes” e âmbito local em cada conclusão. Retirar “pontos por dólar” da apresentação ao investidor. Preservar A como comparação primária e C como secundária.

**Destino das afirmações numeradas — “O que esta corrida prova”**

**SURVIVE**

- **Nenhuma integralmente como está escrita.** Sobrevivem as observações de rotas, pontuações e custos imputados reportados, sujeitas às correcções acima.

**REWORD**

- **1:** “Nesta execução, B recebeu 56,5 e C 80,5 pontos na média dos dois juízes; o custo de lista imputado, incluindo cache, foi $0,1620 e $0,1527. Não foi estimada a incerteza.” Identificar patch D1 e arbiter inactivo.
- **2:** “Nenhum destes 12 prompts foi encaminhado para T1/T2.” Retirar a afirmação geral sobre o classificador.
- **3:** “OPS-3 e P5 foram encaminhados para T0. O autor reporta omissões nas respostas.” A conclusão de segurança exige as respostas e avaliação específica.
- **5:** “O ensaio D1 fornecido reporta truncagem a 256 tokens e conclusão a 2048 numa lista. A matriz foi executada com o tecto aumentado e B continuou abaixo de A e C em pontuação agregada.” Não prova o efeito de D1 na matriz nem incapacidade “por construção”.

**DEAD**

- **4:** Morrem “30b é pior” como conclusão sobre o modelo e “a ordem do probe está certa”. Pode substituí-las por uma nova observação: “Com esta configuração e tecto, B2 somou 33,5 contra 36,5; duas respostas B2 foram truncadas.” A superioridade do 14b não foi estabelecida.

**VERDICT PUBLISHABLE WITH THESE EDITS (corrigir contagens e notas; renomear custos e remover falsos zeros; retirar calibração de ruído, causalidade afirmada e validação do probe; restaurar o critério pré-registado; corrigir composição familiar de B; explicitar patch, integração não verificada, truncagens e limites da amostra; manter A primário e C secundário).**