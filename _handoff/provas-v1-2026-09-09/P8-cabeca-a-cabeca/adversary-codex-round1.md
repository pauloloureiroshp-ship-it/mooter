<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 1; exit 0; 97 s; tokens_reported n/d; prompt_chars 49567; at 2026-09-10T00:13:03.108Z -->

**Veredicto: o P8 não sustenta um cabeça-a-cabeça de desempenho.** Junta medições de componentes, configurações, corpora e corridas diferentes. Algumas observações sobrevivem; as “vitórias” comparativas e a frase **“quality did not move, time did”** não sobrevivem como estão.

Analisei apenas o material colado. Não pude verificar os brutos, hashes, datas de congelamento, instalações, scripts, testes, atribuição de chamadas ou a alegada reprodução independente. Abaixo distingo contradições visíveis de lacunas que exigem esses elementos.

### Ataques célula a célula

**P8-01 — serious · Cabeçalho e todas as células**
- **Afirmação:** “every cell is a measurement, an `n/d` with its reason, or an `n/a` with its reason”.
- **Problema:** falso no próprio slide. Existem `n/d` sem motivo: P5/ccr; deployment/ccr e tzachbon; P4/tzachbon e LiteLLM; P6/tzachbon. “the ‘without’ arm” identifica um braço, mas não apresenta uma medição. “yes (already installed)” não mede o ensaio R8.
- **Prova necessária:** mapa das 45 células para resultado, configuração e motivo literal de ausência. Corrigir as células antes de manter a promessa do cabeçalho.

**P8-02 — serious · Corpus P1/P5**
- **Afirmação:** P8: “40 real prompts […] the first 20 of them (P5)”; P5: “20 real September prompts”.
- **Problema:** P1 declara que os 40 contêm **apenas seis prompts de setembro**. As duas descrições não podem ser verdadeiras em simultâneo. A identidade do corpus usado para egress está por resolver.
- **Prova necessária:** IDs, datas e hashes dos 20 prompts de P5, cruzados com os 40 de P1; corrigir a descrição errada.

**P8-03 — fatal · P1/Mooter: configuração da precisão**
- **Afirmação:** coluna Mooter “sem ANTHROPIC_API_KEY”; célula de precisão **22,2%**, com **35%** nos 40.
- **Problema:** a tabela de origem P1 identifica esses resultados como **“key present”** e dá **32,5% without key** nos 40. O P8 apresenta o resultado de outra configuração debaixo do cabeçalho sem chave. O próprio enquadramento do comparativo fica falso.
- **Prova necessária:** previsões por prompt e configuração; identificar os resultados sem chave para os 63 ou rotular explicitamente a célula como ensaio diferente. Separar também presença de chave de execução efetiva do árbitro.

**P8-04 — serious · P1/Mooter: força estatística**
- **Afirmação:** “22.2% […] McNemar one-sided p = 3.0 × 10⁻⁷”.
- **Problema:** o P8 omite que 23 observações são variações de **um template**, limitação central no P1. O valor nominal não passa a evidência de 63 observações independentes por ter sido pré-registado. O Wilson apresentado também não incorpora essa dependência.
- **Prova necessária:** análise que respeite os grupos/templates ou um conjunto independente. Até lá, chamar ao p e ao intervalo cálculos nominais por item e imprimir a dependência junto deles.

**P8-05 — serious · P1/Mooter: rótulos e baseline**
- **Afirmação:** “Tier accuracy vs blind labels”; “Constant T2 scores 65.1%”.
- **Problema:** o P8 elimina a sensibilidade ao avaliador: nos 40, trocar o motor dos rótulos **inverte** a comparação regra/baseline. “Accuracy” pode ser lido como verdade objetiva, embora aqui seja concordância com um avaliador.
- **Prova necessária:** identificar o avaliador principal e publicar a análise de sensibilidade na comparação. Para precisão objetiva seria preciso um critério de verdade independente, que não foi fornecido.

**P8-06 — serious · P1/P5/Mooter: zeros compostos**
- **Afirmação:** “0 tokens to classify · 0 external destinations recorded (75 Node processes; hook 207 ms median…)”.
- **Problema:** a mesma célula funde tokens e latência de P1, processos e ligações de P5 e chamadas locais de P3. Os parênteses sugerem uma única execução instrumentada. Além disso, o título da linha diz **“to decide”**, mas o zero de tokens exclui passos do hook.
- **Prova necessária:** origem e fronteira de cada número dentro da célula; ou uma corrida única que meça os mesmos passos. “Classificar” e “executar o hook” têm de ter denominadores separados.

**P8-07 — serious · Tokens e precisão/ccr e LiteLLM**
- **Afirmação:** “nothing to score: no prompt classifier in its documented design”; “there was nothing to score”.
- **Problema:** isto é precisamente **“não tem” disfarçado de `n/d`**. Uma descrição documental pode explicar a ausência de adaptador de teste; não demonstra impossibilidade da capacidade. Para ccr há ainda um bloqueio de configuração, que impede concluir a partir do comportamento.
- **Prova necessária:** documentação versionada e definição exata da operação comparável. Texto admissível: “não avaliado: não foi implementado um adaptador deste benchmark”; no ccr, acrescentar o bloqueio de configuração.

**P8-08 — serious · Tokens, precisão e egress/tzachbon**
- **Afirmação:** “0 tokens […] abstains 63/63”; fallback “~52k cached tokens, 5.97 s”; “n/d (abstained)”.
- **Problema:** abstenção em 63/63 **é uma medição**, não ausência de medição: cobertura 0/63, precisão condicional indefinida. A chamada de fallback foi invocada separadamente, uma vez; não representa o custo neste corpus. Zero ativações também não verifica o egress do fallback.
- **Prova necessária:** logs de cobertura, teste positivo do caminho suportado e medição separada do fallback, com categorias de tokens. Não apresentar abstinência e fallback como uma única configuração operacional.

**P8-09 — serious · P5/Mooter**
- **Afirmação:** “Where the raw prompt goes”; “all 35 were loopback”.
- **Problema:** destinos de sockets não identificam o conteúdo enviado. A observação suporta destinos das ligações registadas; não demonstra quais levavam o prompt. O controlo positivo em loopback também não demonstra completude da deteção de destinos externos.
- **Prova necessária:** instrumentação do conteúdo ou rastreio correlacionado, controlo externo conhecido e inventário independente. Sem isso, limitar a célula a **destinos das ligações observadas**.

**P8-10 — serious · P5/LiteLLM**
- **Afirmação:** “decides locally, then **forwards the full prompt** […] presence 20/20”.
- **Problema:** a origem P5 diz explicitamente **“full-field equality not demonstrated”**. Deteção de presença não prova integralidade. “Decides locally” também não substitui a medição do egress do proxy, declarada ausente.
- **Prova necessária:** igualdade do campo completo em cada pedido e instrumentação da decisão. Até lá: “o detetor encontrou presença do prompt em 20/20 pedidos ao mock”.

**P8-11 — serious · P5/nativo**
- **Afirmação:** “40.5 CONNECT and 1.62 MB […] 4 hosts incl. Datadog”.
- **Problema:** o P8 conserva os números impressionantes mas omite **13/20 `is_error`** e a falta de comparação com execução direta. São invocações inteiras, frequentemente com erro, através de um proxy experimental. Não constituem um contraponto operacional ao classificador.
- **Prova necessária:** causas dos erros, tráfego direto de controlo e invocações bem-sucedidas comparáveis. Imprimir já a taxa de erro e manter estes números fora de qualquer contagem de derrotas.

**P8-12 — fatal · Deployment/Mooter versus LiteLLM e rodapé**
- **Afirmação:** “Wins by construction […] a $0 local tier is reachable by rule, where LiteLLM […] 0/40”.
- **Problema:** o próprio texto admite que o Mooter apenas emite T0 devido a um defeito. Isso não prova escolha ou execução de deployment; P3 reporta zero delegações locais executadas. LiteLLM foi avaliado pelo **destino efetivamente escolhido**. Comparam-se uma etiqueta e um encaminhamento; chamar-lhe vitória é uma tautologia favorável ao primeiro.
- **Prova necessária:** ambos receberem a mesma tarefa e os mesmos deployments, com destino efetivo observado. Sem isso, retirar a vitória e preservar duas observações separadas.

**P8-13 — serious · Deployment/LiteLLM**
- **Afirmação:** “zero-priced deployment 0/40 times; 20/20 when priced 1e-9”.
- **Problema:** os 40 agregam duas configurações, incluindo controlos posteriores à primeira ronda adversarial. Não são 40 réplicas de uma configuração pré-registada. O resultado sugere um problema de interpretação do preço zero, mas não estabelece o mecanismo nem uma derrota contra execução local real.
- **Prova necessária:** resultados separados por configuração, YAML efetivamente carregado, preços resolvidos e rastreio da decisão. Repetição com provider local real para alegar comportamento operacional.

**P8-14 — serious · Deployment/Mooter: “no money”**
- **Afirmação:** “Local GPU tokens, no cloud tokens, **no money**”.
- **Problema:** não foi medido custo monetário total. Ausência de cobrança de API não torna GPU, eletricidade ou subscrição gratuitos. P7 declara explicitamente que não mede dinheiro.
- **Prova necessária:** contabilidade para custo total. A edição suficiente é “sem cobrança de API observada neste caminho”, se sustentada, e “preço configurado zero” para o deployment.

**P8-15 — serious · P3/Mooter**
- **Afirmação:** “0/20 executed locally in both arms”; nenhuma chamada “carries its signature”.
- **Problema:** ausência de uma assinatura heurística não é reconstrução da execução. Nome do modelo e limite de tokens podem classificar chamadas erradamente; o texto admite não ter cadeia causal reconstruída.
- **Prova necessária:** IDs que liguem sessão → spawn → ferramenta → pedido ao modelo → resposta. Até lá: **“0/20 execuções locais confirmadas pelo método de atribuição usado”**.

**P8-16 — serious · P3/nativo, ccr, tzachbon e LiteLLM**
- **Afirmação:** nativo “n/a — no delegation step to obey”; outros `n/d` por serem proxy/advisory.
- **Problema:** P3 descreve **spawns no braço nativo**. A ausência de uma instrução Mooter a obedecer pode justificar “obediência ao Mooter não aplicável”; não justifica “no delegation step”. Ser proxy ou advisory também não é, sozinho, motivo suficiente para ausência de medição.
- **Prova necessária:** definir separadamente capacidade de delegar, instrução recebida e execução observada. Declarar quais braços foram realmente ensaiados.

**P8-17 — fatal · P4/Mooter e nativo**
- **Afirmação:** “Critic ≠ author on planted defects”; “printed loss for the pre-registered hypothesis”.
- **Problema:** a origem diz **“Neither engine wrote the code it reviewed: nothing about self-review.”** A relação crítico/autor não foi manipulada. O ensaio não pode derrotar nem confirmar essa hipótese. Além disso, pôr Codex/Opus na coluna Mooter apropria-se de uma comparação de revisores que não demonstra efeito do produto.
- **Prova necessária:** autoria conhecida, comparação emparelhada de autor e outro motor, seleção controlada e integração Mooter observada. Aqui só sobrevive a comparação entre dois revisores.

**P8-18 — serious · P4: falsos alarmes e significância**
- **Afirmação:** “false alarms 4/28 vs 2/28; p = 1.0 both ways”.
- **Problema:** a origem chama-lhes “findings on […] unmutated windows”. Uma janela não mutada pode conter um defeito real: finding não é automaticamente falso alarme. O posicionamento do p também deixa ambíguo a que comparação se aplica.
- **Prova necessária:** adjudicação de cada finding e tabelas de discordância por endpoint. Imprimir o p junto do endpoint correspondente. Resolver uma referência para uma linha não valida a relevância do finding.

**P8-19 — serious · P6/todas as colunas**
- **Afirmação:** “Cost line with origin”: ledger 0/1 451; protótipo 156/156; nativo “reconstructs to the cent”.
- **Problema:** são três critérios distintos: cobertura de eventos, esquema de um protótipo e reconciliação de um total CLI. O nativo não foi mostrado a satisfazer o mesmo requisito de origem por evento; 63 registos do protótipo são zeros sintéticos. Os concorrentes não medidos não podem perder esta linha.
- **Prova necessária:** esquema comum de aceitação e aplicação aos mesmos tipos de evento. Rotular a reconstrução como concordância com o host, não validação de faturação.

**P8-20 — fatal · P7/Mooter: qualidade**
- **Afirmação:** **“quality did not move, time did”**.
- **Problema:** 23/23 passes em cada braço demonstram igualdade do **resultado binário observado**, não igualdade de qualidade. O teste está no teto; não distingue robustez, manutenção, segurança ou defeitos fora da cobertura. Não há margem nem teste de equivalência. A ressalva posterior não corrige a afirmação categórica.
- **Prova necessária:** endpoints de qualidade suficientemente sensíveis e desenho de equivalência. Edição imediata: **“Both arms passed the frozen test on all 23 tasks; observed execution times differed.”**

**P8-21 — fatal · P7 e rodapé: vantagem atribuída ao hook**
- **Afirmação:** “Measured advantage”; “the session with the hook reached accepted work […] on 18”.
- **Problema:** a quarta corrida foi feita após inspeção dos resultados, viola a regra de paragem e usa um tratamento alterado. Estado partilhado e cache continuam sem controlo demonstrado. Dizer “nominal” salva o cálculo; não salva a atribuição causal da vantagem ao hook.
- **Prova necessária:** novo ensaio congelado, tratamento estável, regra de paragem respeitada, isolamento dos braços e controlo de ordem/cache. Nesta amostra só cabe **resultado descritivo da corrida 4**.

**P8-22 — serious · P7: defesa contra seleção de corridas**
- **Afirmação:** “abandoning [run 1] cost an easier win rather than buying this one”.
- **Problema:** uma primeira corrida com resultado parcial favorável não elimina seleção nem torna a quarta confirmatória. “Duas derrotas nos pares em falta” é um cenário hipotético; a própria regra classificou a corrida como inválida.
- **Prova necessária:** política de reinício fixada antes dos resultados e análise de todas as tentativas segundo essa política. Retirar esta defesa; publicar o histórico é necessário, mas não corrige o desenho.

**P8-23 — serious · P7: tempos e precisão**
- **Afirmação:** “median 77 s vs 145 s”; “missed […] by 0.703 s”.
- **Problema:** a razão das medianas é aproximadamente **0,531**, enquanto a mediana das razões emparelhadas é **0,56**. Ambas podem estar corretas, mas medem coisas diferentes. A distância de 0,703 s à fronteira transmite precisão sem repetibilidade demonstrada.
- **Prova necessária:** tempos emparelhados, definição de início/fim, resolução do relógio e repetições para variabilidade. Identificar cada estatística; não interpretar a distância à fronteira como estabilidade do resultado.

**P8-24 — serious · P7/nativo e nota ⁴**
- **Afirmação:** “hooks and tools off for the native arms”; P7/nativo é “the ‘without’ arm”.
- **Problema:** não fica claro se o OFF de P7 tinha também as ferramentas desligadas. Se tinha, a capacidade de resolver tarefas de repositório pode diferir por mais do que o hook; se não tinha, a nota geral está errada.
- **Prova necessária:** comandos, permissões e configurações dos 46 braços. Restringir a nota aos ensaios onde corresponde à realidade.

**P8-25 — serious · R8/todas as colunas**
- **Afirmação:** Mooter “yes (already installed)”; ccr “gateway config blocked”; restantes “yes”.
- **Problema:** a legenda diz que a célula Mooter **não é um pass**, mas a célula começa por **“yes”**. ccr não foi operacionalmente configurado: não é um derrotado de desempenho. Os “yes” restantes não mostram duração nem critério comum de “runs”; tzachbon precisou de modelo fornecido manualmente.
- **Prova necessária:** logs de instalação, tempos e smoke test comum. Mooter deve dizer **“n/d — already installed; isolated-install test not run”**. ccr deve manter o bloqueio de configuração, sem classificação de capacidade.

**P8-26 — serious · Rodapé e coerência do pacote**
- **Afirmação:** “Wins by construction”, “printed loss”, “Measured advantage”; pacote “empates”; P7 simultaneamente “GANHOU” e “No verdict yet”.
- **Problema:** não existe total numérico de vitórias/derrotas para conferir, mas a classificação qualitativa já falha: deployment não é vitória comparável; P4 não testa autoria; P7 não permite vitória confirmatória. O pacote contém estados contraditórios, incluindo P8 ainda “sem adversário”.
- **Prova necessária:** uma versão final coerente, com regra explícita para classificar resultados. Ausência de medição não conta como derrota; hipótese não testada não conta como hipótese refutada.

### SURVIVE

Sobrevivem **como observações reportadas, ainda sem verificação dos brutos**:

- P5: 35 ligações registadas, todas loopback, no âmbito limitado do tap.
- LiteLLM: 0/20 em cada uma das duas configurações com preço zero; 20/20 com preço `1e-9`, num mock.
- P4: contagens 26/28 e 27/28 para dois revisores, sem conclusão sobre autoria.
- P6: cobertura reportada do ledger e do protótipo, separadamente.
- P7: corrida 4 com 18/23 a cumprir o critério, 23/23 passes por braço e os tempos reportados.
- O **p nominal 0,00531 é aritmeticamente compatível** com \(P[\mathrm{Binomial}(23,0,5)\ge18]\). Isso não valida os pressupostos ou a seleção da corrida.
- Cinco tarefas falharam o limiar; 22/23 mais rápidas é compatível com quatro dessas cinco serem mais rápidas.

### REWORD

- “Head-to-head” → **compilação de medições com protocolos e configurações diferentes**.
- “Quality did not move” → **ambos os braços passaram o teste congelado em 23/23 tarefas**.
- “Measured advantage” → **resultado descritivo da quarta corrida exploratória**.
- “Full prompt” no LiteLLM → **presença do prompt detetada**.
- “No money” → categoria de custo efetivamente observada.
- “Accuracy” → concordância com rótulos identificados, com configuração e dependência explícitas.
- P3 zero executado → zero confirmado pelo método de atribuição.
- P4 → comparação de revisores; findings em originais até adjudicação.
- Todos os `n/d` e `n/a` → motivo específico, sem inferir incapacidade.

### DEAD

- A vitória Mooter/LiteLLM baseada em **T0 emitido versus deployment selecionado**.
- A afirmação de qualidade inalterada.
- A interpretação de P4 como teste de **crítico versus autor**.
- O “yes” de instalação Mooter.
- Qualquer derrota atribuída ao ccr por não ter sido configurado.
- O estatuto confirmatório ou causal de P7.
- A promessa atual de que todas as células obedecem ao protocolo.
- Uma contagem de vitórias que inclua estes elementos.

**SLIDE PUBLISHABLE WITH THESE EDITS — corrigir a configuração da precisão e a identidade do corpus; substituir as duas alegadas vitórias por observações separadas; retirar “quality did not move”; rotular P7 como descrição exploratória da corrida 4; retirar autoria de P4; corrigir integralidade do prompt, erros nativos, R8 e todos os motivos `n/d`/`n/a`; identificar a origem de cada número e sincronizar os estados contraditórios do pacote.**