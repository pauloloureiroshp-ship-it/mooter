<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 2; exit 0; 131 s; tokens_reported n/d; prompt_chars 34524; at 2026-09-09T14:36:46.569Z -->

**O v2 ainda não é publicável tal como está.** Os controlos novos sustentam uma anomalia de selecção no LiteLLM, mas não o «nunca» nem a causa atribuída. E os números nativos continuam a ser contadores reportados por um instrumento cuja exactidão não foi demonstrada no material fornecido.

Analisei exclusivamente o texto e os dados apresentados. Não verifiquei código, configurações efectivas, capturas de rede, testes, logs brutos, commits ou o MP completo. As hipóteses de defeito abaixo são ataques a excluir, não defeitos que eu tenha confirmado.

### P5-14 — serious — «Nunca» excede a experiência

**Afirmação:** “A $0 deployment is never chosen.”

**Porque pode não se sustentar:** Só duas configurações continham um deployment a zero: **0 escolhas em 40 pedidos**, não 60 oportunidades. Os outros 20 pedidos testaram preços positivos. Isto demonstra ausência de selecção nas duas configurações ensaiadas, não impossibilidade de selecção.

Mesmo admitindo ensaios independentes com probabilidade constante — pressuposto não demonstrado num router com estado — 0/40 permitiria uma probabilidade de selecção até cerca de **7,2%**, num limite superior unilateral de 95%. Se a escolha for determinística, repetir pedidos aumenta pouco a cobertura de configurações.

**Resolve:** Para a afirmação empírica, escrever «não foi seleccionado em nenhum dos 40 pedidos das duas configurações com preço zero». Para uma propriedade universal, demonstrar o ramo de código e delimitar as suas condições.

### P5-15 — serious — A causa continua por provar

**Afirmações:** “0 é lido como sem preço”; “o cost-based-routing funciona”; “se [a escolha] mudar, o resultado principal é do LiteLLM”.

**Porque podem não se sustentar:** A inversão enfraquece a hipótese de preferência fixa por porta. O preço positivo minúsculo reforça uma hipótese de tratamento especial do zero. **Nenhum dos dois identifica onde esse tratamento ocorre.** Pode estar na configuração, parsing, fallback de preços, identificação do modelo, elegibilidade ou selecção. A dicotomia da emenda — mudou, portanto é do LiteLLM — é falsa.

O veredicto admite incerteza na prosa, mas a tabela e `analysis.json` continuam a apresentar a explicação como facto.

**Resolve:** Configuração efectivamente carregada, custos resolvidos por deployment, lista de candidatos elegíveis e rastreio da decisão na versão exacta. Até lá: «resultado compatível com tratamento especial do preço zero; mecanismo não confirmado».

### P5-16 — serious — Mock com preço zero não representa automaticamente Ollama real

**Afirmação:** “É o caso do Ollama local.”

**Porque pode não se sustentar:** O ensaio usa deployments simulados. Não demonstra que uma configuração real de Ollama carregue os mesmos preços, metadados, fallback e condições de elegibilidade. Custo monetário local nulo e valor numérico zero reconhecido pelo router não são a mesma observação.

**Resolve:** Repetir com Ollama real e publicar os custos efectivos usados na selecção. Entretanto, retirar a extrapolação.

### P5-17 — serious — O controlo do proxy não calibra os contadores

**Afirmações:** “CONNECT exactos por prompt”; “41 TLS tunnels”; “1.62 MB out”; “187 kB to Datadog”.

**Porque podem não se sustentar:** «Com proxy aparecem registos; sem proxy não aparecem» demonstra encaminhamento pelo proxy. Não demonstra exactidão da contagem.

Sem código e traços não consigo excluir:

- Contagem do mesmo fluxo nas duas pernas do proxy.
- Soma de eventos `data` com contadores cumulativos de socket.
- Inclusão de CONNECT ou respostas do proxy no total declarado como túnel.
- Contagem de CONNECT tentados ou falhados como túneis estabelecidos.
- Classificação de bytes recebidos do cliente como bytes efectivamente entregues ao upstream.

**Resolve:** Calibração com volumes conhecidos em ambos os sentidos, incluindo CONNECT falhado, fecho antecipado e tráfego inicial anexado ao CONNECT; reconciliação por ligação com captura independente. Publicar a definição exacta de cada contador.

### P5-18 — serious — O proxy pode alterar o comportamento medido

**Afirmação:** “O Claude Code nativo abre ~41 túneis […] e envia ~1,6 MB por prompt.”

**Porque pode não se sustentar:** O observado é **o cliente através daquele proxy**, em processos separados. Um proxy pode modificar reutilização de ligações, temporização, falhas e retries. A ausência de registos no contador quando se retira o proxy é tautológica; não compara o tráfego directo.

Além disso, «por prompt» aqui inclui arranque e encerramento de uma invocação. Não estima o custo marginal de mais um prompt numa sessão persistente.

**Resolve:** Captura independente com e sem proxy, mantendo condições equivalentes; separar invocações novas de sessões persistentes. Até lá: «por invocação nesta montagem com proxy».

### P5-19 — serious — 13/20 erros são um confound não resolvido

**Afirmação:** “13/20 terminam is_error […] — o perfil de rede é o mesmo nos 20 (o intervalo é estreito).”

**Porque pode não se sustentar:** Totais próximos não demonstram o mesmo perfil. Um custo fixo de arranque pode dominar o volume e esconder diferenças de retries, conteúdo, sequência ou resultado. A montagem com um turno e ferramentas desligadas pode produzir um comportamento pouco representativo de utilização concluída com sucesso.

**Resolve:** Publicar motivos dos erros e métricas por resultado, host e sequência de ligações. Comparar depois com execuções bem-sucedidas adequadas à tarefa. No slide, **13/20 `is_error` deve aparecer junto dos números**, não desaparecer.

### P5-20 — serious — As medianas publicadas não correspondem à definição convencional

**Afirmações:** Medianas de saída total **1 624 212**, saída API **1 387 295** e CONNECT **41**.

**Porque podem não se sustentar:** Pelos 20 registos `per_prompt` fornecidos:

| Métrica | Dois valores centrais ordenados | Mediana convencional |
|---|---:|---:|
| Bytes de saída | 1 620 845 e 1 624 212 | **1 622 528,5** |
| Bytes de saída API | 1 386 339 e 1 387 295 | **1 386 817** |
| CONNECT | 40 e 41 | **40,5** |

Os números publicados correspondem à **mediana superior**. Essa convenção pode ser usada se explicitada; sem definição, o resumo não é reprodutível. O arredondamento do slide continua aproximadamente correcto, mas os números exactos do veredicto não são a mediana convencional.

**Resolve:** Declarar a convenção e aplicá-la consistentemente, ou corrigir a análise. Não há dados individuais suficientes para verificar a mediana Datadog.

### P5-21 — serious — Host não revela conteúdo nem entrega à aplicação

**Afirmações:** “sistema, ferramentas, MCP, npm e telemetria do cliente”; “187 kB to Datadog on every prompt”.

**Porque podem não se sustentar:** CONNECT fornece um destino solicitado; o túnel cifrado não identifica as classes de conteúdo enumeradas. O hostname de ingestão de logs torna telemetria uma interpretação plausível, mas não demonstra o conteúdo nem a aceitação pela aplicação remota.

Além disso, **187 kB é a mediana**, não a quantidade em cada prompt: o intervalo publicado é 168 794–192 440 bytes.

**Resolve:** Identificar conteúdo com instrumentação autorizada no cliente ou evidência equivalente. Para o slide basta: «tráfego registado em 20/20 invocações para o host de ingestão Datadog; mediana de saída 187 kB». Retirar a decomposição especulativa do conteúdo.

### P5-22 — serious — A ausência observada não demonstra completude do tap

**Afirmações:** “every Node process under a socket-level tap”; “No external destination recorded”.

**Porque podem não se sustentar:** A segunda frase sobrevive como descrição do registo; a primeira exige um inventário independente dos processos esperados. Contar 75 processos instrumentados não prova que todos os processos Node relevantes tenham sido instrumentados.

A falta de eventos finais também impede concluir que os registos são completos apenas porque existem eventos `open`. Não prova perda de destinos, mas deixa essa possibilidade sem avaliação. A saída posterior dos serviços loopback continua fora da fronteira.

**Resolve:** Reconciliação da árvore de processos com carregamento do preload e registos, controlo positivo na mesma montagem e captura independente.

**Peso probatório exacto:** O tap reportou **35 eventos de ligação, todos para loopback, em 75 processos Node registados**. Isto não fornece um limite quantitativo para egress não observado, nem prova ausência de prompt fora do dispositivo. A-block não acrescenta evidência de bloqueio efectivo.

### P5-23 — serious — A comparação continua a misturar tarefas

**Afirmações:** “A vitória é da configuração tanto quanto da arquitectura”; “O que os proxies fazem de diferente do nativo […] é outro destino e um processo a mais”.

**Porque podem não se sustentar:** A mede o hook de decisão, defeituoso e sem árbitro; D mede encaminhamento para mock; E mede uma invocação completa do cliente com rede externa. Não há estimativa comparável do efeito de ligar o Mooter sobre a mesma tarefa concluída.

A frase sobre «os proxies» também volta a generalizar apesar de C ser `n/d`, D não ter fornecedores reais e o seu egress próprio estar por medir.

**Resolve:** Retirar «vitória» e a conclusão genérica sobre proxies. Para comparação causal, medir o mesmo fluxo completo com e sem Mooter e separar decisão, encaminhamento e execução.

### P5-24 — serious — A emenda não documenta todo o controlo usado

**Afirmação:** “AMENDMENT-2 […] D com dois controlos”; “Pre-registered […] two instrument amendments on file”.

**Porque pode não se sustentar:** A AMENDMENT-2 apresentada documenta a inversão, mas **não documenta o ensaio `tiny`**, embora este seja central na interpretação causal. Não fornece também uma cronologia verificável de quando cada alteração foi decidida relativamente aos resultados.

Isto não invalida os ensaios exploratórios, mas impede tratá-los como confirmações previamente especificadas. A inscrição anterior do protocolo não transfere automaticamente esse estatuto aos controlos posteriores.

**Resolve:** Registar `tiny`, motivação, configuração e cronologia; distinguir braço original, re-medições e controlos pós-ronda-1. Verificar os commits efectivos.

### P5-25 — serious — B voltou a ganhar quantificadores universais

**Afirmações:** “runs only with a key”; “builds a request with the raw prompt whenever it runs”; “o árbitro, quando tem chave, constrói […]”.

**Porque podem não se sustentar:** Os 20 casos demonstram construção sob instrumentação e chave falsa. Não demonstram todos os caminhos de execução, inputs, condições de activação ou comportamento com chave real. «Whenever» transforma uma observação delimitada numa propriedade universal.

**Resolve:** «Nas 20 invocações instrumentadas com chave falsa, os pedidos construídos continham o prompt integral». Uma afirmação sobre todos os caminhos exige revisão do código relevante.

### P5-26 — minor — Comprimento do preview inflacionado no slide

**Afirmação:** “1,390 lines with an 80-char raw prompt preview”.

**Porque pode não se sustentar:** O veredicto diz **até 80 caracteres**. O JSON apresentado apenas conta linhas com `prompt_preview`; não verifica conteúdo ou comprimento de cada campo.

**Resolve:** Publicar validação dos campos ou escrever «1 390 linhas com campo `prompt_preview`, descrito como contendo até 80 caracteres».

### P5-27 — minor — Palavras proibidas: o slide passou; o veredicto não

**Afirmação:** “as palavras proibidas saíram mesmo em negação”.

**Porque pode não se sustentar:** No slide fornecido, as palavras identificadas na ronda 1 não aparecem. No veredicto continuam **«privado»/«seguro»**, embora negadas. Se a proibição literal abrange o pacote, a correcção está incompleta. Não recebi o §4 integral para verificar outras palavras ou o âmbito exacto.

**Resolve:** Retirar esses termos do veredicto se a regra for literal. Não alegar conformidade integral com uma lista não fornecida.

### SURVIVE

- A: nenhum destino externo **registado pelo tap**, na configuração descrita; bytes `n/d`.
- A-block: zero tentativas interceptadas e tiers iguais; bloqueio não exercitado.
- B: igualdade integral do campo em 20/20 pedidos construídos sob instrumentação.
- D: as três contagens de selecção reportadas; evidência de uma anomalia dependente da configuração de preços.
- E: os valores **reportados pelo contador**, sujeitos a calibração e à fronteira com proxy.
- C: `n/d`.
- Logs: contagens de correspondências e de campos, sem inferência de instâncias únicas.

### REWORD

- «Nunca» → **0/40 nos dois ensaios com preço zero**.
- «Zero lido como sem preço» → hipótese não confirmada.
- «Nativo por prompt» → invocação do cliente através do proxy.
- «41 túneis TLS» → CONNECT registados, até se confirmar estabelecimento.
- «187 kB em cada prompt» → mediana de 187 kB; presença em 20/20.
- «Every Node process» → 75 processos Node registados pelo tap.
- «Whenever the arbiter runs» → nas 20 invocações instrumentadas.
- Pré-registo → protocolo original pré-registado; controlos posteriores identificados como tal.

### DEAD

- Garantia universal de exclusão de deployments a zero.
- Causa «zero = preço ausente» apresentada como facto.
- Extrapolação automática para Ollama real.
- «Mesmo perfil de rede» deduzido de totais próximos.
- Conteúdo do tráfego deduzido dos hosts.
- «Vitória» comparativa ou diferença geral entre proxies e cliente nativo.
- Qualquer atestação de ausência de egress do dispositivo.

**SLIDE PUBLISHABLE WITH THESE EDITS:** substituir “every Node process” por “75 Node processes recorded by the tap”; substituir “A $0 deployment is never chosen” por “The zero-priced deployment was selected 0/40 times across the two zero-price configurations”; qualificar B como 20 invocações instrumentadas com chave falsa; apresentar E como “Counter-reported per CLI invocation through this proxy: median 40.5 CONNECT requests and 1.62 MB outbound; 13/20 returned is_error; counter accuracy and proxy-induced overhead not independently established”; escrever “Datadog intake traffic recorded in 20/20; median 187 kB outbound”; corrigir preview para “up to 80 chars”; identificar os controlos LiteLLM como posteriores à ronda 1.