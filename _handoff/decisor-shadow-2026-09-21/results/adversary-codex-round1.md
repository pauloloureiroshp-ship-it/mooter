# Adversário — ronda 1 · codex-cli 0.153.4 · 2026-09-21

Motor **diferente** do que produziu a análise (Codex, não Claude). Entrada: `protocol.json`
(pré-registado no commit `1416884d`), `results/04-analysis.md`, e o resumo de cada braço
(summary + matriz de confusão + distribuição das previsões + bins de calibração).
**Nenhum prompt real foi enviado** — só ids, contagens e métricas. Prompt exacto em
`results/adversary-prompt-sent.txt`; saída bruta em `results/adversary-codex-raw.txt`.

O pedido foi explícito: «um adversário que só aprova não correu». Ele não aprovou —
14 ataques, e **um deles apanhou um defeito de medição real que foi corrigido**.

---

## Saída do adversário (verbatim)

**Veredicto: nenhum braço satisfaz todos os critérios pré-registados.** D-14B apresenta evidência de melhoria sobre a regra neste corpus, mas não demonstra superioridade sobre o juiz ou sobre a constante T2, nem calibração suficiente.

1. **Pseudo-replicação: “40 prompts reais” não garante 40 observações independentes. — ACEITE como limitação.**

   Os 23 prompts derivados de um template foram correctamente separados; esse ataque específico está **REFUTADO** para o resultado primário. Mas faltam as origens dos 40: mesma conversa, tarefa, utilizador ou reformulações podem criar dependências. O número nominal é 40; o número efectivo de observações independentes é **desconhecido**, pelo que os IC e os valores de *p* dependem de uma hipótese ainda não demonstrada.

2. **Fuga directa através dos rótulos ou do gold-84. — REFUTADO pelos factos apresentados.**

   Os rótulos foram produzidos às cegas, antes das classificações, e o gold-84 está separado do teste primário. Usar o mesmo modelo base em B e D não demonstra fuga: B é um concorrente, não o autor dos rótulos. Contudo, não há aqui prova de que os autores das perguntas de D desconhecessem os resultados anteriores.

3. **Reutilizar o teste P1 permite adaptação ao teste, mesmo com pré-registo novo. — ACEITE como risco não excluído.**

   O hash confirma que o ficheiro é o mesmo; não confirma que tenha permanecido desconhecido durante o desenho de F1. Congelar o protocolo antes de executar F1 não elimina escolhas informadas pelos erros de P1. Este é um teste reutilizado, não uma validação independente em prompts novos.

4. **“Todos os modelos são Qwen” e “Codex fornece verdade objectiva”. — Primeiro REFUTADO; segundo ACEITE como crítica.**

   B e os dois modelos D são Qwen, mas C é identificado como Laya; o material não estabelece a família base de C. Existe pouca diversidade entre B e D e apenas um rotulador de referência: a accuracy mede concordância com **Codex + rubrica**, não o tier mínimo que efectivamente resolve cada tarefa. O próprio protocolo reconhece esta limitação.

5. **As probabilidades de C não parecem constituir uma distribuição sobre quatro tiers. — ACEITE; falha prioritária de medição.**

   Numa distribuição normalizada sobre quatro classes, a maior probabilidade tem de ser pelo menos **0,25**. Em C typed-decisions, até o máximo observado nos 40 é **0,1234**; no C base, a mediana é **0,0952**. Portanto, estes valores não podem ser simplesmente a probabilidade máxima de uma distribuição exclusiva sobre T0–T3.

   Podem ser scores, probabilidades não condicionadas às quatro opções ou incluir outros resultados. Até esclarecer a semântica, o ECE de C não sustenta a conclusão sobre calibração de tiers; renormalizar também não deve ser uma correcção automática sem verificar o que o modelo devolve.

6. **“Decisor calibrado” não está demonstrado, e 0,110 versus 0,10 é uma fronteira estatisticamente frágil. — ACEITE.**

   D-14B tem ECE **0,10990**, com apenas 40 observações e sete bins ocupados, alguns com **3 itens**. Não há incerteza estimada que permita distinguir esse resultado de um ECE populacional abaixo de 0,10; também não há evidência de que esteja abaixo dele.

   **O gate observado falhou**, sem arredondamentos convenientes. Mas “falhou o limiar nesta amostra” não equivale a “demonstrámos que o modelo é mal calibrado”. Extrair logprobs, por si só, também não constitui calibração.

7. **A tabela mistura predição forçada com abstenção. — ACEITE.**

   C apresenta **40 abstenções em 40**, mas accuracy de 0,400 ou 0,225. Isso pode descrever correctamente o argmax subjacente, mas não o desempenho de um decisor que realmente se abstém: nesse caso, a cobertura autónoma é **0%**.

   D-14B tem três abstenções: se forem operacionais, a cobertura é **37/40 = 92,5%**. Falta separar accuracy forçada, desempenho nos itens aceites e resultado/custo do fallback. O protocolo apresentado também não fixa o limiar de abstenção.

8. **O *p*=0,002 é atribuído visualmente à referência errada. — ACEITE; mas isso não destrói toda a evidência contra a regra.**

   O teste compara D com **A-nokey: 13/40**, enquanto a referência principal mostra **A-key: 14/40**. Para os discordantes 12/1, o valor exacto unilateral é **0,001709**: a aritmética está correcta, a associação ao baseline precisa de correcção.

   Contudo, pelas matrizes fornecidas, D e A-key partilham entre 10 e 13 acertos. Os emparelhamentos possíveis dão *p* unilateral entre **0,00317 e 0,01544**, antes de ajustes por multiplicidade e assumindo independência entre itens. Logo, seria errado afirmar que a melhoria sobre A-key desaparece necessariamente.

9. **“D bate o juiz” excede os dados. — ACEITE.**

   D acerta **24/40**, B acerta **21/40**: são apenas três acertos adicionais. Pelas matrizes, os emparelhamentos possíveis produzem *p* exacto unilateral entre aproximadamente **0,188 e 0,351**. Assim, nenhum emparelhamento compatível com estes resumos demonstraria superioridade a 5% por esse teste.

   O facto de usarem o mesmo modelo base torna a comparação interessante para avaliar o formato de decisão; não transforma a diferença observada numa melhoria comprovada.

10. **“Só acima de 0,450 há sinal” é uma interpretação excessiva da constante. — ACEITE.**

    Acima de 0,450 há vantagem descritiva em accuracy sobre always_T2, não automaticamente evidência estatística. Contra essa constante, a matriz de D permite calcular exactamente **16 ganhos e 10 perdas**, dando McNemar unilateral **p=0,16347**.

    Portanto, D-14B não demonstra superioridade sobre a constante neste teste. Inversamente, um modelo abaixo de 0,450 poderia ainda ter utilidade se os erros tiverem custos diferentes; a accuracy sozinha não resolve essa questão.

11. **A accuracy esconde erros de subdimensionamento relevantes. — ACEITE.**

    D-14B classifica **3 dos 8 T3** como tiers inferiores: dois como T0 e um como T1. Também baixa **10 dos 18 T2** para T0 ou T1.

    Isto não prova violação executada nem falha do sistema completo. Prova que **60% de concordância não basta para autorizar substituição da regra** sem medir os guardrails, o fallback e o resultado efectivo das tarefas.

12. **165 ms é um número de produção generalizável. — REFUTADO; como medição quente, é admissível.**

    O protocolo pede explicitamente latência quente, e os modelos foram aquecidos e mantidos em GPU. Não medir arranque a frio não viola esse critério.

    Contudo, falta confirmar se os **165 ms incluem as quatro perguntas**, processamento e decisão final, ou apenas parte desse percurso. Arranque, carregamento após expulsão da VRAM, filas e concorrência não foram medidos. A comparação entre **~0,002 ms in-process**, **207 ms de hook** e **165 ms do decisor** também mistura fronteiras de medição até se provar o contrário.

13. **Uma corrida elimina selecção oportunista e torna o protocolo completamente fechado. — REFUTADO.**

    Uma corrida por configuração exclui a acusação específica de repetir até obter um resultado favorável. Não elimina escolhas de modelos, variantes, prompts ou métricas.

    O JSON apresentado não especifica integralmente os modelos D, as quatro perguntas, o tratamento de tokens ausentes dos top-logprobs, a normalização ou todas as variantes C. Esses detalhes podem estar congelados noutros ficheiros do commit, mas isso não está demonstrado aqui. A utilização de coder:14b em vez do modelo pedido deve ficar como desvio explícito; escolher o vencedor entre quatro configurações também exige tratar a multiplicidade.

14. **“Sem egress” está demonstrado pela allowlist. — ACEITE como ataque à suficiência da prova.**

    `egress_hosts_allowed` define uma condição; o probe de Ollama confirma disponibilidade local. Nenhum demonstra, por si só, os destinos de rede efectivamente usados pelos dois braços. O material apresentado sustenta intenção de execução local, não uma verificação de ausência de egress.

**O que NÃO pode ser afirmado:**

- Que F1 passou o conjunto dos critérios pré-registados.
- Que D-14B supera o juiz ou always_T2 para além da variação amostral.
- Que os 40 itens são independentes ou representam a utilização futura.
- Que D está calibrado, ou que o ECE de C mede a probabilidade correcta.
- Que Laya é intrinsecamente inadequado: há primeiro uma dúvida sobre a medição.
- Que 165 ms representa latência integral, fria ou sob carga.
- Que maior accuracy demonstra segurança, poupança, qualidade executada ou valor comercial.
- Que ausência de egress foi verificada.

**O teste mais barato que mudaria a minha opinião:** primeiro, uma reanálise sem inferências novas: validar as probabilidades, recuperar os pares por item e separar abstenção de argmax. Isso pode corrigir a tabela, mas não resolve a reutilização do teste.

Para alterar o veredicto sobre generalização, congelaria **uma única configuração D-14B** e avaliaria o próximo lote de tarefas novas, seleccionadas consecutivamente, com origem registada e sem variantes da mesma tarefa. Fixaria previamente o tamanho e a regra de decisão, rotularia antes das predições e compararia, nos mesmos itens, D, A-key, B e always_T2. Mediria a decisão completa e os erros T3→inferior. Outra corrida nos mesmos 40 não substituiria esse teste.

---

## Veredicto do executor, ataque a ataque

Regra: cada ataque leva **ACEITE** ou **REFUTADO** e a razão concreta. Onde o adversário teve de
**limitar** um *p* por lhe faltar o emparelhamento por item, eu tenho-o — e calculei o valor
exacto. Esses cálculos são sobre o bruto que já estava em disco: **zero corridas novas**, a stop
rule do protocolo não foi tocada.

| # | Ataque | Veredicto | Razão |
|---|---|---|---|
| 1 | Pseudo-replicação: 40 nominais ≠ 40 independentes | **ACEITE** | Os 23 do template ficaram de fora do teste primário (isso está refutado), mas a independência dos 40 **não foi demonstrada** — os itens vêm de transcrições de Agosto-Setembro e nada prova que não haja reformulações da mesma tarefa. O `n` efectivo é **n/d**. Os IC e os *p* desta análise assumem independência. |
| 2 | Fuga treino→teste pelos rótulos / gold-84 | **REFUTADO** | Rótulos do Codex às cegas, com rubrica, **antes** de qualquer classificação (P1). O gold-84 está marcado TREINO e excluído do veredicto na própria tabela. O 14b ser o mesmo modelo do juiz não é fuga: o juiz é **concorrente**, não autor dos rótulos. |
| 3 | Reutilizar o corpus do P1 permite desenhar para o teste | **ACEITE** | O sha256 prova que é o mesmo ficheiro; **não** prova que fosse desconhecido ao desenhar as 4 perguntas do braço D. Congelar o protocolo antes de correr não apaga escolhas informadas pelos erros já publicados do P1. Isto é um **teste reutilizado**, não validação independente. |
| 4a | Viés de família: tudo Qwen | **REFUTADO** | B e os dois D são Qwen; C é Laya (arquitectura distinta) e **perdeu**. Se o resultado fosse artefacto de família, C não ficaria em 0,225-0,400. |
| 4b | «Codex = verdade» | **ACEITE** | A acurácia mede **concordância com Codex+rubrica**, não o tier mínimo que resolve a tarefa. O próprio `protocol.json` já o diz em `does_not_prove`. Há um só rotulador de referência. |
| 5 | O `p_max` de C não pode ser probabilidade sobre 4 tiers | **ACEITE — e corrigido** | **O melhor ataque da ronda, e está certo.** Verificado no artefacto: o Laya devolve `probabilities` (soma 1; em n01 T3=0,594) **e** `confidence` (0,2559) — e o `03-arm-C-laya.py` tomou o segundo por `p_max`. Emendado por `05-amend-C-pmax.mjs` a partir do bruto, **sem corrida nova**: ECE de C nos 40 passa de 0,316 → **0,136**, abstenções de 40/40 → **5/40**. A **acurácia não muda** (o `choice` é o argmax das `probabilities`). Continua a falhar o gate de ECE e continua abaixo de `always_T2`. |
| 6 | ECE 0,1099 vs 0,10 é fronteira frágil (n=40, bins com 3 itens) | **ACEITE** | O gate **falhou** — sem arredondar. Mas «falhou o limiar nesta amostra» ≠ «está provado mal calibrado». Não há IC para a ECE. E ler logprobs **não é** calibrar. |
| 7 | A tabela mistura predição forçada com abstenção | **ACEITE** | Verdade: as acurácias são todas **forçadas** (argmax). A coluna «abstém» é informativa, não aplicada. D/14b abstém-se em 3 → cobertura autónoma 37/40 = 92,5 %; C amendado abstém-se em 5. O `protocol.json` **não fixa** o limiar de abstenção (o 0,4 está no código, não no protocolo). Falta medir custo/resultado do fallback. |
| 8 | O p=0,002 está atribuído à referência errada | **ACEITE — e agora exacto** | O adversário tinha razão e limitou o valor a [0,00317; 0,01544] por lhe faltarem os pares. **Calculado com os pares reais: D/14b vs A-key (14/40) → b=11, c=1, p unilateral = 0,00317.** A melhoria sobre a regra **mantém-se significativa** com a referência certa. |
| 9 | «D bate o juiz» excede os dados | **ACEITE — e agora exacto** | Adversário limitou a [0,188; 0,351]. **Valor real: D/14b vs B (21/40) → b=5, c=2, p = 0,22656.** 24 contra 21 são **3 acertos**. **D NÃO bate o juiz** em nenhum sentido estatístico. |
| 10 | «Só acima de 0,450 há sinal» é interpretação excessiva | **ACEITE — e agora exacto** | O adversário previu 16/10 e p=0,16347 **e acertou ao número**. **D/14b vs `always_T2` → b=16, c=10, p = 0,16347.** **D não demonstra superioridade sobre responder sempre T2.** É o facto mais duro desta ronda: o único braço que sobreviveu não se distingue de uma constante. |
| 11 | A acurácia esconde sub-dimensionamento | **ACEITE** | Medido: D/14b desce **3 dos 8 T3** (2→T0, 1→T1) e **10 dos 18 T2**. 60 % de concordância **não autoriza** substituir a regra sem medir guardrails, fallback e resultado da tarefa. |
| 12 | «165 ms é número de produção» | **REFUTADO quanto ao protocolo, ACEITE quanto ao alcance** | O `protocol.json` pede **decisor quente** e foi isso que se mediu (`ollama ps` 100 % GPU antes). Confirmado no código: os 165 ms são o ciclo das **4 perguntas** (`ms`), e a pergunta do tier sozinha é **42 ms**. Mas frio, expulsão de VRAM, fila e concorrência: **não medidos**. E o adversário tem razão que 0,002 ms in-process, 207 ms de hook e 165 ms de decisor são **fronteiras de medição diferentes** e não devem ser lidos na mesma coluna. |
| 13 | Uma corrida não fecha o protocolo | **REFUTADO em parte, ACEITE em parte** | Exclui «repetir até dar bem» (e a re-corrida única que a stop rule permitia **não foi gasta**). Não exclui multiplicidade: **escolheu-se o melhor de 4 configurações** sem ajuste. E é verdade que o `protocol.json` não especifica as 4 perguntas nem o tratamento de letras fora dos top-logprobs — isso vive no `02-arm-D-logit.mjs`, que **está no commit de pré-registo `1416884d`**, mas o adversário não o podia ver. |
| 14 | «Sem egress» não está verificado | **ACEITE** | Verdade. `egress_hosts_allowed` é uma **condição**, não uma medição. O P1 tinha `nettap` a registar ligações; **esta ronda não correu nenhum**. A afirmação honesta é: «os braços foram escritos para falar só com `127.0.0.1:11434` e o Laya corre local», **não** «foi verificado que não houve egress». |

### O que esta ronda mudou na análise

1. **Correcção de medição** do braço C (ataque 5) — aplicada por emenda sobre o bruto.
2. **Três *p* que estavam por calcular** passaram a exactos (ataques 8, 9, 10) — e dois deles
   **derrubam** afirmações que a tabela deixava no ar: D não bate o juiz, e D não bate a constante.
3. A leitura «só acima de 0,450 há sinal» fica **corrigida**: 0,450 é a régua descritiva, mas
   estar acima dela **não é, por si, evidência estatística**.

### O que NÃO pode ser afirmado a partir destes dados

- Que a F1 passou o conjunto dos critérios pré-registados. **Não passou** — a ECE falha.
- Que o D/14b supera o juiz (p=0,227) ou o `always_T2` (p=0,163).
- Que os 40 itens são independentes, ou representativos do uso futuro.
- Que o decisor está **calibrado** — ler logprobs não é calibrar.
- Que 165 ms é latência fria, integral ou sob carga.
- Que houve **ausência de egress** — não foi medida nesta ronda.
- Que mais acurácia significa poupança, segurança ou qualidade executada.

### O teste mais barato que mudaria a conclusão (do adversário, aceite)

Congelar **uma** configuração (D/14b), rotular às cegas **um lote novo** de tarefas consecutivas
com origem registada e sem variantes da mesma tarefa, fixar antes o tamanho e a regra de decisão,
e comparar nos **mesmos itens**: D, A-key, B e `always_T2` — medindo a decisão completa e os erros
T3→inferior. **Outra corrida nos mesmos 40 não substitui isto.**
