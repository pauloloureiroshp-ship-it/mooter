# P8 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, ronda 1, e a resposta

**Prompt:** `adversary-prompt-sent.txt` (49 567 chars: protocolo, slide, e os cartões de origem P1, P5, P7 e o índice) · **Saída íntegra:** `adversary-codex-round1.md` (25 ataques, 97 s, sem acesso ao repositório, aos brutos, aos hashes ou às instalações).

A primeira frase dele é o veredicto da ronda: **«O P8 não sustenta um cabeça-a-cabeça de desempenho. Junta medições de componentes, configurações, corpora e corridas diferentes.»**

Aceitei-o. A tabela foi reescrita de cima a baixo: deixou de se apresentar como cabeça-a-cabeça, a configuração passou a estar **em cada célula** em vez de no cabeçalho, e a secção «vitórias por construção» **desapareceu**.

## Os quatro fatais

| # | Ataque | Resposta | Estado |
|---|---|---|---|
| **P8-03** | A coluna do Mooter dizia «sem `ANTHROPIC_API_KEY`» e a célula de precisão usava os números **com** chave. Sem chave são 20,6 % nos 63 e 32,5 % nos 40, não 22,2 % e 35 % | **Aceite — erro meu, verificado no bruto** (`A-key` 14/63 contra `A-nokey` 13/63). A célula passa a imprimir **as duas configurações lado a lado**, e a configuração saiu do cabeçalho para dentro de cada célula | corrigido |
| **P8-12** | «Um tier a $0 alcançável pela regra, onde o LiteLLM escolheu 0/40» compara uma **etiqueta** com um **encaminhamento**. O próprio texto admite que o Mooter só emite T0 por causa do defeito D1, e o P3 mediu zero delegações executadas | **Aceite.** A «vitória por construção» foi **retirada**. Ficam duas observações separadas e uma frase a dizer porque não é um confronto | retirado |
| **P8-17** | Pôr o P4 na coluna do Mooter apropria-se de uma comparação entre dois revisores que não demonstra efeito do produto; e crítico ≠ autor **nunca foi manipulado** | **Aceite.** A linha passou a chamar-se «dois revisores sobre 28 mutantes» com um **«*not* a Mooter capability»** no próprio rótulo | reformulado |
| **P8-20** | «Quality did not move, time did» é categórica. 23/23 nos dois braços demonstra igualdade do **resultado binário observado** num teste no tecto, não igualdade de qualidade, e não houve teste de equivalência | **Aceite, com a edição que ele propôs, literal:** «Both arms passed the frozen test on all 23 tasks; observed execution times differed» | corrigido |
| **P8-21** | «Measured advantage» atribui causalmente a vantagem ao hook, com regra de paragem quebrada, tratamento alterado e cache sem controlo | **Aceite.** O rodapé deixou de ter «vantagem medida» como categoria; a linha do P7 diz o número e diz que o estatuto confirmatório não é reclamado | reformulado |

## Os serious, e o que cada um mudou

| # | O que apanhou | Estado |
|---|---|---|
| P8-01 | O cabeçalho prometia «cada célula é medição, `n/d` com motivo ou `n/a` com motivo» e havia `n/d` sem motivo | corrigido — todos os `n/d` levam motivo, e a promessa do cabeçalho foi reescrita |
| P8-02 | «40 real prompts … the first 20 of them (P5)» contra «20 real September prompts» do P5: os 40 têm **seis** de setembro | corrigido na linha de setup do P8; o slide do P5 fica com a descrição por acertar (declarado) |
| P8-04 | O p e o Wilson do P1 não incorporam que 23 dos 63 são **um template** | corrigido — a célula di-lo, e os valores passam a «nominais por item» |
| P8-05 | Trocar o motor de rótulos **inverte** a comparação regra vs constante, e o P8 eliminava essa sensibilidade | declarado na célula e no slide do P1 |
| P8-06 | Uma célula fundia tokens do P1, processos e ligações do P5 e chamadas do P3 como se fossem uma corrida | corrigido — a linha passou a ser só «classificar», com a fronteira dita |
| P8-07 | «Nothing to score: no prompt classifier in its documented design» é «não tem» disfarçado de `n/d` | corrigido — passa a «não foi construído um adaptador deste benchmark», e no ccr acrescenta-se o bloqueio de configuração |
| P8-08 | Abstenção 63/63 **é** uma medição de cobertura, não ausência de medição; e o fallback foi invocado à parte, uma vez | corrigido nas duas células |
| P8-09 | Destinos de sockets não identificam **conteúdo** | corrigido — a célula diz explicitamente que não identifica |
| P8-10 | O P5 diz «full-field equality not demonstrated» e o P8 escrevia «forwards the full prompt» | corrigido — passa a «o detector encontrou presença em 20/20» |
| P8-11 | Os números do nativo omitiam **13 de 20 invocações com erro** | corrigido — a taxa de erro entrou na célula |
| P8-13 | Os 40 do LiteLLM agregam **duas configurações**, uma acrescentada depois da ronda 1 do adversário do P5 | declarado na célula |
| P8-14 | «No money» não foi medido — GPU, electricidade e subscrição não são grátis | retirado |
| P8-15 | «0/20 executed» é ausência de uma assinatura heurística, não reconstrução da execução | corrigido — «pelo método de atribuição usado», com a cadeia declarada como não reconstruída |
| P8-16 | «No delegation step to obey» é falso: o braço nativo **faz** spawns | corrigido — «nenhuma instrução do Mooter a obedecer», com a nota de que o nativo spawna |
| P8-18 | «False alarms» pressupõe adjudicação que não houve | corrigido — «findings on unmutated windows (not adjudicated)» |
| P8-19 | A linha do recibo mistura três critérios: cobertura por evento, esquema de um protótipo e reconciliação de um total | corrigido — o nativo passa a «concordância com o número do host, não facturação verificada, e um requisito diferente» |
| P8-22 | A minha defesa «abandonar a corrida 1 custou-me uma vitória mais fácil» não corrige o desenho | **aceite em parte.** Fica no veredicto do P7 explicitamente rotulada como não reparando a regra de paragem; saiu do P8 |
| P8-23 | Rácio das medianas (0,531) ≠ mediana dos rácios emparelhados (0,56); e 0,703 s sugere precisão sem repetibilidade | declarado — o P7 imprime a mediana dos rácios e a mediana de cada braço, e o 0,703 s fica como distância à fronteira, não como estabilidade |
| P8-24 | «Hooks and tools off for the native arms» pode não valer para o braço OFF do P7 | corrigido — a nota ⁴ passa a dizer que vale para o P4 e o P5, e que o OFF do P7 é uma sessão completa sem hook |
| P8-25 | O R8 dava «yes (already installed)» ao Mooter na mesma tipografia de um bloqueio real | corrigido — passa a **`n/a` — o Mooter nunca fez este ensaio** |

## O que fica dito

**Rejeitado: nada.** Vinte e cinco ataques, quatro fatais, e a tabela que saiu desta ronda é substancialmente mais pequena nas afirmações do que a que entrou. O que ela perdeu foram comparações; o que manteve foram medições com a configuração ao lado.

**A frase que resume o que este cartão passou a ser:** não é um benchmark, é uma folha de nove coisas medidas na mesma máquina no mesmo dia, com o que cada coluna está autorizada a dizer escrito por cima.

**O que o adversário declarou não ter verificado:** brutos, hashes, datas de congelamento, instalações, scripts, testes, atribuição de chamadas e a alegada reprodução independente. As objecções dele são sobre o que o texto afirma, não sobre se os números estão certos — e os números que ele conseguiu recontar a partir do material colado bateram.

**Ronda 2:** não corrida. Vinte e cinco objecções aceites e a tabela reescrita; uma segunda ronda mediria a reescrita, não a prova. Declarado.
