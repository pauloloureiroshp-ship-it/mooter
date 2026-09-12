**O pacote não sustenta o título nem a alegação de vitória em egress. Há contradições entre o veredicto e o JSON, e a comparação principal trata 23 variantes de um template como observações independentes.** Os acertos podem sobreviver como descrição deste corpus; a generalização exige outra evidência.

“Fatal” abaixo significa fatal para a afirmação indicada, não necessariamente para todo o trabalho.

1. **L1 — serious · Cegueira não demonstrada**  
   **Afirmação:** «rótulos cegos de outro motor».  
   **Ataque:** Ser Codex em vez de Claude não demonstra cegueira. Não sabemos se o rotulador recebeu contexto Mooter, instruções do repositório, nomes identificáveis, exemplos ou resultados anteriores. A própria rubrica anuncia «the same definitions the benchmark labels use», sugerindo uma resposta convencional esperada.  
   **Evidência decisiva:** Transcript integral da rotulagem, incluindo instruções, contexto, ferramentas e ficheiros acessíveis; identidade do modelo, configuração e ordem dos itens.

2. **L2 — fatal · Referência adaptada ao template**  
   **Afirmação:** «Precisão, 63 fora de treino» como evidência geral de qualidade de routing.  
   **Ataque:** O autor escreveu uma regra específica para a tarefa dos 23 exemplos R-24. Isso fixa 36,5% do resultado por uma decisão editorial conhecida antes da avaliação. Não prova fraude nem fuga de rótulos, mas transforma grande parte do teste numa verificação de conformidade com essa convenção. Não há evidência de que T2 produza o melhor resultado operacional.  
   **Evidência decisiva:** Histórico da rubrica e do conhecimento prévio do corpus; avaliação independente das tarefas; resultados de execução que fundamentem os tiers.

3. **L3 — serious · Rubrica ambígua nos conflitos**  
   **Afirmação:** «Assign each prompt EXACTLY ONE tier».  
   **Ataque:** A rubrica não resolve explicitamente `@haiku` + deploy, pedido de mais cuidado num T3, nem a tensão entre «multi-file change» e «more than 3 files». Uma discrepância pode representar uma interpretação legítima, não um erro do router.  
   **Evidência decisiva:** Regras de precedência congeladas antes da rotulagem e análise dos desacordos por conflito da rubrica.

4. **L4 — fatal · Kappa apresentado como validação dos rótulos**  
   **Afirmação:** «o kappa diz que não são ruído».  
   **Ataque:** Dois modelos podem concordar ao seguir a mesma convenção inadequada. Kappa mede concordância, não verdade. Além disso, se ambos concordaram nos 23 R-24, como o texto afirma, os 49 acordos totais deixam **26/40 = 65%** nos prompts reais. O bloco repetitivo eleva a concordância agregada.  
   **Evidência decisiva:** Rótulos individuais, kappa separado para os 40, incerteza e adjudicação independente dos desacordos.

5. **C1 — serious · “Real” não significa representativo**  
   **Afirmação:** «40 prompts reais de setembro» e «fora do treino».  
   **Ataque:** Uma seed torna uma seleção reproduzível; não demonstra que a população de origem seja representativa. Faltam universo elegível, exclusões, utilizadores, sessões, duplicados e exposição anterior durante o desenvolvimento. Prompts novos podem reproduzir padrões usados para ajustar a regra.  
   **Evidência decisiva:** Procedimento de seleção, contagens antes/depois das exclusões, agrupamento por sessão/template e auditoria de sobreposição com desenvolvimento e calibração.

6. **C2 — serious · Anonimização pode alterar o alvo**  
   **Afirmação:** «40 prompts reais […] anonimizados».  
   **Ataque:** Caminhos, extensões, nomes de modelos e termos como CI podem determinar o tier. Alterá-los pode modificar o problema e afetar especialmente uma regra lexical. Retirar contexto conversacional também pode tornar pedidos de coordenação impossíveis de classificar com segurança.  
   **Evidência decisiva:** Transformações documentadas e comparação controlada entre originais e versões anonimizadas, incluindo rótulos e previsões.

7. **S1 — fatal · Pseudorreplicação no teste principal**  
   **Afirmação:** «p(B>A) = 3,0 × 10⁻⁷» como prova de superioridade generalizável.  
   **Ataque:** Os 23 R-24 partilham template e regra de rotulagem; não há justificação para tratá-los como 23 unidades independentes. Contribuem **23 dos 34** discordantes favoráveis a B. O cálculo pode estar correto para a tabela fornecida, mas a interpretação inferencial é injustificada. Os Wilson agregados sofrem do mesmo problema de amostragem.  
   **Evidência decisiva:** Análise por tarefas/templates independentes, estrutura de dependência dos 40 e um teste novo com diversidade real.

8. **S2 — serious · Mudança do resultado principal após observar dados**  
   **Afirmação:** «o número que vale é o dos 40» e «PERDEU em precisão fora do treino».  
   **Ataque:** O protocolo escolheu os 63 para o cartão e H1: A>B. Reportar os 40 estava previsto; promovê-los a resultado principal não estava. O sentido oposto também estava previsto para impressão, mas não como nova hipótese principal. Nos 40 há uma derrota **observada de sete acertos**, sem rejeição a 0,05 pelos testes apresentados. As várias direções, subconjuntos e braços também exigem distinguir resultados confirmatórios de exploratórios.  
   **Evidência decisiva:** Plano inferencial anterior aos resultados com hierarquia, multiplicidade e regra para o template; replicação independente.

9. **S3 — serious · Baseline trivial omitida e precisão pouco informativa**  
   **Afirmação:** «B […] 69,8%» e «A […] 35%» como medidas suficientes de qualidade.  
   **Ataque:** Prever sempre T2 dá **41/63 = 65,1%**, apenas três acertos abaixo de B. Nos 40 dá **18/40 = 45%**, acima de A e três acertos abaixo de B. Há só três exemplos T1. A accuracy também atribui o mesmo custo a T3→T0 e T2→T3, apesar de consequências diferentes.  
   **Evidência decisiva:** Baselines constantes, métricas por tier e custos de erro definidos previamente, com amostra suficiente por classe.

10. **S4 — serious · “Fosso treino→teste” confunde exposição e composição**  
    **Afirmação:** «um fosso treino→teste de 53 pontos» e «o juiz LLM […] cai menos».  
    **Ataque:** A subtração está aproximadamente certa — **53,6 pontos** — mas os conjuntos têm composições distintas. No treino de A há 14 rótulos T3 em 35; nos 40 reais há oito. O desnível não isola sobreajuste nem mede uma queda sob distribuição constante. O empate histórico 29/35 também não é o resultado atual, 31/35 versus 29/35.  
    **Evidência decisiva:** Comparação estratificada por tarefa/tier, proveniência dos rótulos de treino e versões exatas da corrida histórica.

11. **M1 — fatal · “Zero tokens” convertido em “custo zero”**  
    **Afirmação:** «Decidir custa zero» e «A vitória estrutural é real e é aritmética».  
    **Ataque:** Zero chamadas de inferência no ramo ensaiado não implica custo zero: há CPU e 97–211 ms de execução típica reportada. O hook pode ainda introduzir texto na conversa e aumentar tokens processados pelo modelo seguinte. B é local: 393 tokens processados não equivalem automaticamente a uma despesa faturada.  
    **Evidência decisiva:** Fronteira de custo explícita, conteúdo emitido pelo hook, tokens adicionais a jusante e recursos computacionais de ambos os braços.

12. **M2 — fatal · Não existe vitória em egress na tabela**  
    **Afirmação:** «Ganhou em tokens e egress (0 medido)».  
    **Ataque:** A tabela mostra **A=0, B=0 e D=0**. C e E ficam para P5. Zero contra zero é empate. Além disso, o protocolo pergunta por **bytes que saem da máquina**, mas os resultados apresentam hosts/chamadas, métricas diferentes.  
    **Evidência decisiva:** Bytes externos por braço na mesma fronteira de execução e um concorrente com valor superior a zero. Os resultados apresentados não contêm essa vitória.

13. **M3 — serious · Instrumentação não fecha todas as saídas**  
    **Afirmação:** «não […] contacta um host» e «0 MEDIDO».  
    **Ataque:** Wrappers de `http/https/fetch` e um stub Ollama observam essas interfaces. Não demonstram cobertura de subprocessos, sockets diretos, módulos com referências capturadas antes dos wrappers ou trabalho assíncrono após a janela medida. Zero entradas no log do árbitro também não equivale a captura de rede.  
    **Evidência decisiva:** Código e ordem de instalação dos instrumentos, controlos positivos que provem deteção e captura ao nível do sistema incluindo processos descendentes e conclusão assíncrona.

14. **F1 — fatal · Ablação apresentada como Mooter completo**  
    **Afirmação:** «Mooter vs LLM-router» e a propriedade geral de decidir sem inferência.  
    **Ataque:** A-key usa chave falsa e `MOOTER_ARBITER_DISABLE=1`; A-hook usa HOME isolado e ausência de credenciais. Isso remove caminhos capazes de consumir inferência ou rede. A própria descrição admite um fetch de orçamento em produção. O resultado caracteriza uma configuração específica.  
    **Evidência decisiva:** Ensaio do hook completo com configuração operacional, árbitro ativo, cache expirado e todos os consumos incluídos.

15. **M4 — fatal · Hook: caudas omitidas e denominadores misturados**  
    **Afirmação:** «o hook que o utilizador sente é 119–211 ms».  
    **Ataque:** São medianas, não um intervalo de experiência. O JSON mostra **p95 de 1 276 ms e 1 183 ms**, com médias de **616 ms e 540 ms**. Além disso, a primeira corrida tem 63 observações, mas apenas 57 spawns; as outras têm 126 observações, enquanto os 132 hits incluem seis da primeira. O veredicto associa medianas por corrida a contagens por caminho.  
    **Evidência decisiva:** Latências por observação e `classify_path`, identificação dos seis hits iniciais e estatísticas calculadas efetivamente por hit/miss.

16. **F2 — serious · Latências sem condições equivalentes**  
    **Afirmação:** «empatou-para-baixo em latência» e «regra […] 0,002 ms».  
    **Ataque:** Não foi feito teste de equivalência. A mediana in-process agrega **98 prompts × seis corridas**, incluindo treino e repetições; B usa 63 prompts e inclui uma carga fria. A p95 in-process é cerca de mil vezes a mediana, o que exige explicar caminhos rápidos, caches e aquecimento. O modelo B fica residente, com recursos não contabilizados.  
    **Evidência decisiva:** Medições frias/quentes separadas, mesma amostra, ordem controlada, descrição de caches e hardware, e comparação da integração completa de ambos.

17. **F3 — serious · Vantagem informacional do juiz por verificar**  
    **Afirmação:** comparação justa de «precisão […] no mesmo corpus».  
    **Ataque:** O corpus é o mesmo, mas o texto integral de `PROMPT_JUIZ` não foi fornecido. Não se pode verificar se B recebe convenções iguais às do rotulador, sobretudo a exceção que decide os 23 R-24, enquanto A foi construído para outra versão da política. Se recebe, pode estar a executar uma especificação mais atual; se não recebe, essa suspeita deve ser retirada.  
    **Evidência decisiva:** Prompt integral de B, histórico temporal da rubrica e especificação contra a qual cada braço foi implementado.

18. **F4 — serious · Precisão da regra atribuída à experiência do hook**  
    **Afirmação:** uma avaliação conjunta de precisão e latência do Mooter usado pelo utilizador.  
    **Ataque:** A precisão reportada é de `classify()`. O hook regista `safety_boost` e `user_override_vetoed`, mas não apresenta matriz de confusão das decisões finais. Portanto, não sabemos se a rota cuja latência se mede tem os mesmos acertos. `max_tier_counts: T3=189` também precisa de definição; não pode ser interpretado automaticamente como previsão.  
    **Evidência decisiva:** Tier efetivamente emitido pelo hook por prompt, transformações aplicadas e accuracy dessas decisões finais.

19. **F5 — fatal · Fallback de D declarado como testado sem prova**  
    **Afirmação:** «o `cli_fallback` nunca disparou (abstenção prévia)» e «O protocolo correu como congelado».  
    **Ataque:** O JSON diz **«desligado nesta passagem»**. Um caminho desligado não demonstra que nunca dispara quando ligado. O protocolo exige duas passagens e uma chamada real instrumentada; essa evidência não aparece. Quatro sondas inglesas também não bastam para concluir genericamente «não serve um utilizador que escreve em português».  
    **Evidência decisiva:** Segunda passagem com fallback ativo, decisões por item, chamada instrumentada e rastreio do caminho nativo do plugin. Até lá, conformidade não demonstrada.

20. **W1 — serious · Veredicto contradiz os seus próprios resultados**  
    **Afirmação:** «A regra diz T1 (10) e T3 (13)» nos 23 R-24.  
    **Ataque:** O JSON apresenta **T1=6 e T3=17**. Os acertos continuam em zero, mas a explicação do comportamento está errada. «n e IC sempre ao lado» também é falso: várias células omitem IC.  
    **Evidência decisiva:** Previsões individuais e geração automática das tabelas e contagens a partir de um único artefacto validado.

21. **P1 — serious · Congelamento e reprodução incompletamente demonstrados**  
    **Afirmação:** «protocolo congelado antes da primeira classificação», «Nenhuma [correcção]» e comando de reprodução completo.  
    **Ataque:** Timestamp e hashes no próprio documento não provam anterioridade. Faltam hashes de rubrica, `PROMPT_JUIZ`, executor, hook e pesos dos modelos. A reprodução de D exige um comando adicional; C/E são remetidos para P5. A ausência de desvios não se sustenta perante o fallback desligado e a promoção posterior dos 40 a número principal.  
    **Evidência decisiva:** Registo externo datado do pacote completo, histórico de execução e alterações, versões imutáveis e manifesto que permita regenerar todos os resultados anunciados.

**SOBREVIVEM como descrição dos dados fornecidos:** 14/40 versus 21/40, 0/23 versus 23/23, contagens zero nos instrumentos usados e repetibilidade nas corridas observadas; **PRECISAM DE REFORMULAÇÃO:** cegueira, generalização, derrota nos 40, latência, fosso treino→teste, determinismo e limitações dos concorrentes; **MORTAS:** «Decidir custa zero», vitória em egress, kappa como prova de validade, superioridade generalizável baseada no p dos 63, distribuição R-24 de 10/13 e conformidade integral demonstrada com o protocolo.