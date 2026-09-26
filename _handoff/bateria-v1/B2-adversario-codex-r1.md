# B2 — adversário codex, ronda 1 (ledger)

> Ronda de adversário sobre o **desenho** do B2, antes de qualquer dado. Critic ≠ author.
> O pré-registo **não foi alterado** por esta ronda; as emendas vivem em
> `B2-EMENDA-1-PROPOSTA.md` para o dono decidir.

| Campo | Valor |
|---|---|
| Alvo | `_handoff/bateria-v1/B2-PREREGISTO.md` · sha256 `f2344e784508ac74a199221603a2befc485783020e9597c501ed7527a3f3962a` (idêntico ao original em `~/.mooter/p0/`) |
| Excerto do instrumento dado ao adversário | `tools/p0/medir-p0.mjs` linhas 31-40 e 647-660 (`AGENTE_TIER`, `classificarTurno`) + 3 notas verbatim do relatório |
| Motor | `codex-cli 0.153.4` · modelo `gpt-6-astra` (do log da corrida) · session id `01a0df9e-0cfb-7851-bef7-d81889c41053` |
| Isolamento | `codex exec --ephemeral --skip-git-repo-check -s read-only`, cwd isolado no scratchpad (só o prompt), `HOME`/`USERPROFILE`/`CODEX_HOME` temporários (só `auth.json` copiado) |
| 1.ª linha do prompt | `não corras comandos.` |
| Frentes pedidas | gate · alocação · instrumento · guardas (por esta ordem) |
| Resultado | **23 ataques · 15 BLOQUEANTES · 8 SÉRIOS · 0 MENORES** · `VEREDICTO: EMENDAR ANTES DOS DADOS` |
| Data | 2026-09-26 (dia da corrida; hora n/d, não foi registada) |

## Verificação do autor contra o código (só onde o repo responde)

| Ataque | Verificado em | Estado |
|---|---|---|
| A12 — elegibilidade depende da resposta | `medir-p0.mjs:655-658`: `seguiu`/`delegou_outro` são devolvidos **antes** de `host == null` e `host === rec` | **confirmado** |
| A13 — nome exacto sobrepõe o tier declarado | `medir-p0.mjs:652,655`: `seguiuExacto \|\| tierDeleg.includes(rec)` | **confirmado** |
| A17 — texto imperativo contado como delegação | `medir-p0.mjs:254-272` (`delegacoesDe`): só blocos `tool_use` estruturados (`Task`/`Agent`, `Bash`/`PowerShell` com router-execute, `*mooter_work`); texto não conta | **refutado na forma**; a fixture de controlo proposta mantém-se útil |
| A14, A18 (T0 com Ollama falhado conta como seguiu) | nota verbatim do relatório do instrumento | **confirmado pelo próprio instrumento** |
| A9, A10, A15, A22 | dependem de factos fora dos dois textos | **n/d** — o próprio adversário marcou-os assim |

## Resposta do adversário (verbatim, `-o` do codex)

O desenho ainda permite confundir mudança de comportamento com mudança de denominador, pseudo-replicação e decisões tomadas depois de ver resultados. O problema mais imediato está no próprio classificador: pode contar como aderentes turnos que, pela definição de H1, não exigiam acção.

Os ataques abaixo usam apenas os dois textos fornecidos. Quando uma propriedade depende de implementação não mostrada, assinalo-a como não verificada.

**1. Gate**

**A1 · Gate · BLOQUEANTE — Fisher trata turnos dependentes como observações independentes.**  
A alocação é por sessão, mas Fisher sobre a tabela de turnos ignora a dependência dentro de cada sessão. Ter pelo menos 30 sessões por braço não corrige automaticamente essa pseudo-replicação.

Cenário concreto: algumas sessões longas de B concentram delegações; o teste atribui a muitos turnos correlacionados a força de muitas réplicas independentes e declara significância.

Emenda mínima:
> “A inferência primária respeita a sessão como unidade de alocação e dependência. Antes dos dados, congelamos o teste, a sua implementação, a ponderação das sessões e a alternativa estatística. Fisher sobre turnos será apenas descritivo e não decidirá o gate.”

**A2 · Gate · BLOQUEANTE — A regra de paragem tem mínimos, mas não tem fim.**  
“Nunca parar antes por resultado” permite continuar depois dos mínimos até obter um resultado favorável. Também não define se as 30 sessões precisam de conter turnos elegíveis, nem como fechar sessões ainda activas.

Cenário concreto: aos mínimos, B não passa; a recolha continua e termina na primeira avaliação em que passa.

Emenda mínima:
> “A recolha termina no primeiro fecho diário em que ambos os braços atingem 30 sessões com pelo menos um turno elegível e 100 turnos elegíveis. Incluem-se todos os turnos anteriores ao corte. A data-limite administrativa será fixada antes do arranque; mínimos não atingidos nessa data produzem resultado inconclusivo. Não haverá decisões intermédias por eficácia.”

**A3 · Gate · SÉRIO — A diferença absoluta está definida; o tratamento de zero e a interpretação de falha não estão.**  
A = 0% não impede calcular B − A nem, por si só, executar Fisher; impede interpretar razões relativas de aderência. Mais grave: falhar um gate que junta efeito mínimo e significância não demonstra que “o hint não é a alavanca”.

Cenário concreto: A fica em zero e B melhora, mas a incerteza impede passar; conclui-se ausência de efeito e muda-se para delegação automática.

Emenda mínima:
> “A melhoria primária é absoluta, em pontos percentuais, incluindo quando A = 0%. Não usamos razões relativas quando o denominador é zero. Falhar a primária significa ‘critério de adopção não demonstrado’, não ‘ausência de efeito’; publicamos estimativa e intervalo de confiança.”

**A4 · Gate · BLOQUEANTE — A não-inferioridade de qualidade não é um procedimento estatístico definido.**  
Faltam a unidade da pontuação, a combinação dos dois juízes, o teste, o nível de confiança e o tratamento de desacordo. O poder de 20 turnos por braço é **n/d — precisa de ser verificado**: depende da variabilidade e do clustering; dois juízes não duplicam o número de turnos independentes.

Cenário concreto: uma diferença imprecisa é declarada “não inferior” porque não foi detectada inferioridade, ou porque a média observada fica dentro de 0,5.

Emenda mínima:
> “A qualidade por turno será a média das duas avaliações independentes. Só passa se o limite inferior unilateral de 95% para B − A for superior a −0,5, com dependência por sessão contemplada. O método e a justificação do tamanho amostral ficam congelados antes da recolha; precisão insuficiente não conta como passagem. κ é descritivo e a sua variante será pré-especificada.”

**A5 · Gate · BLOQUEANTE — Ninguém ficou responsável pelo sorteio e pelo cegamento dos 20 turnos.**  
Não estão definidos a população amostral, o sorteador, a semente, as exclusões nem os materiais entregues aos juízes. O dono conhece o braço durante a utilização e pode reconhecer os exemplos mesmo depois de removido o rótulo.

Cenário concreto: são escolhidos exemplos favoráveis de B, ou o dono reconhece-os e atribui melhor qualidade.

Emenda mínima:
> “Um script congelado sorteará 20 turnos elegíveis por braço, sem reposição, usando semente comprometida antes da recolha e sem selecção manual. A apresentação terá ordem aleatória, materiais padronizados e remoção de identificadores e texto do tratamento. Os juízes avaliam independentemente antes de ver os rótulos; reconhecimento pelo dono será registado e o cegamento não será presumido.”

**A6 · Gate · BLOQUEANTE — A guarda de quota não define o custo completo nem a decisão.**  
Não está explícito se a quota inclui host, todos os subagentes, tentativas falhadas e trabalho duplicado. “B não pior que A em mais de 10%” também não distingue comparação de medianas observadas de demonstração estatística de não-inferioridade.

Cenário concreto: B delega e o host repete o trabalho, mas só uma parte do consumo entra na mediana; a guarda passa artificialmente.

Emenda mínima:
> “A quota por turno agrega host e todos os descendentes atribuíveis ao pedido, incluindo tentativas falhadas, segundo regra de atribuição congelada. A guarda compara as medianas observadas: mediana B ≤ 1,10 × mediana A; não constitui prova estatística de não-inferioridade. Se a mediana A for zero, só passa com mediana B zero. Consumo não reconstruível torna a guarda inconclusiva.”

**A7 · Gate · SÉRIO — Retrabalho tem margem fixa, mas evento e janela indefinidos.**  
“Seguidos de” não fixa quantos turnos ou quanto tempo observar; “revert” não tem regra de atribuição. As expressões podem aparecer como citação, e um pedido de correcção pode usar outras palavras.

Cenário concreto: A tem mais acompanhamento observado do que B, ou só as correcções de A usam as expressões previstas.

Emenda mínima:
> “Antes da recolha, congelamos a janela de acompanhamento, as regras de detecção e atribuição de retrabalho e o tratamento de turnos sem acompanhamento completo. Todos os turnos elegíveis recebem a mesma janela; ausência de observação não equivale a ausência de retrabalho.”

**2. Alocação**

**A8 · Alocação · BLOQUEANTE — Hash determinístico não garante alocação não manipulada.**  
A regra é previsível para quem conhece o identificador e não impede criar sessões até obter o braço desejado. A geração dos identificadores e a possibilidade de os escolher são **n/d — precisam de ser verificadas**; o hash também não garante equilíbrio na amostra realizada.

Cenário concreto: depois de reconhecer B, o dono mantém essas sessões para pedidos fáceis e reinicia outras, produzindo braços com tarefas diferentes.

Emenda mínima:
> “Antes do arranque, verificamos e documentamos a geração de session_id. Toda a sessão iniciada entra no registo de alocação, mesmo sem turnos elegíveis ou se for abandonada. É proibido reiniciar, excluir ou trocar de sessão para obter um braço; qualquer balanceamento adicional terá regra congelada antes da recolha.”

**A9 · Alocação · BLOQUEANTE — Falta definir a identidade experimental de retomadas, forks e subagentes.**  
Se retomadas ou forks mudam de identificador e se subagentes têm identificador próprio é **n/d — precisa de ser verificado**. Identificadores diferentes podem representar contexto partilhado, não unidades independentes.

Cenário concreto: um fork conserva o hint imperativo no contexto, recebe A e é contado como nova sessão independente de controlo; subagentes ainda podem inflacionar o número de sessões.

Emenda mínima:
> “A unidade de alocação será a sessão raiz e a sua linhagem de contexto. Retomadas e forks conservam o braço da raiz e pertencem ao mesmo cluster. Subagentes não são novas unidades experimentais. O mapeamento entre identificadores técnicos e linhagens será validado antes do arranque.”

**A10 · Alocação · SÉRIO — Várias máquinas podem quebrar unicidade e comparabilidade.**  
A unicidade global de session_id, a deduplicação de sessões sincronizadas e a uniformidade de versões são **n/d — precisam de ser verificadas**.

Cenário concreto: a mesma sessão é importada de duas máquinas e contada duas vezes, ou B fica concentrado numa máquina com configuração diferente.

Emenda mínima:
> “Registamos máquina, identificador experimental global e versões de configuração. Sessões sincronizadas são deduplicadas e conservam braço e linhagem. Se os identificadores não forem globalmente únicos, a regra de composição da chave será congelada antes da alocação.”

**A11 · Alocação · SÉRIO — O dono pode alterar as tarefas depois de conhecer o braço.**  
A métrica ser “comportamento do host” não protege contra diferenças nos pedidos que provocam esse comportamento. A alocação automática não cega o utilizador nem impede incentivos explícitos à delegação.

Cenário concreto: em B, o dono pede resumos simples; em A, insiste em tarefas difíceis ou diz ao host para responder directamente.

Emenda mínima:
> “Os pedidos não serão escolhidos, reformulados ou acompanhados em função do braço. Registamos incentivos explícitos à delegação, overrides e abandonos, sem exclusões retrospectivas. A interpretação reportará a limitação decorrente de o utilizador conhecer o tratamento.”

**3. Instrumento**

**A12 · Instrumento · BLOQUEANTE — A elegibilidade depende da resposta ao tratamento.**  
`seguiu` e `delegou_outro` são devolvidos antes de verificar `host == null` ou `host === rec`. Logo, turnos sem tier conhecido ou já no tier recomendado entram no denominador se houver delegação, mas ficam fora se não houver.

Cenário concreto: B induz delegação em turnos já no tier; esses turnos passam a contar como sucessos, enquanto equivalentes de A são excluídos como `ja_no_tier`. A aderência cresce sem medir H1.

Emenda mínima:
> “A elegibilidade será calculada antes e independentemente de qualquer delegação: hint presente, tier do host conhecido e diferente do recomendado. Só depois classificamos o resultado. Turnos inelegíveis nunca entram no numerador nem no denominador, mesmo que deleguem.”

**A13 · Instrumento · BLOQUEANTE — `seguiuExacto` sobrepõe-se ao tier explicitamente pedido.**  
Apesar do comentário dizer que o tier declarado manda, o `if` aceita o nome exacto do agente mesmo quando `x.tier` indica outro tier. A métrica pode contar cumprimento do subagente como cumprimento do tier.

Cenário concreto: o hint recomenda um agente de T1, mas a chamada pede explicitamente T3; `seguiuExacto` é verdadeiro e o turno conta como aderente.

Emenda mínima:
> “A aderência ao tier exige que o tier declarado na chamada, quando presente, coincida com o recomendado; só na sua ausência usamos o mapeamento nominal. Correspondência do nome do agente será métrica separada e nunca sobreporá uma incompatibilidade de tier.”

**A14 · Instrumento · BLOQUEANTE — Uma chamada compatível não demonstra transferência do trabalho.**  
A função aceita qualquer delegação ao tier recomendado, sem verificar finalidade, ordem, conclusão ou duplicação pelo host. Isso mede emissão de uma chamada compatível; não demonstra que o pedido tenha sido executado nesse tier.

Cenário concreto: o host resolve tudo, chama um subagente para uma verificação acessória e responde; B obtém sucesso sem alterar a execução principal.

Emenda mínima:
> “A primária será denominada ‘taxa de tentativa de delegação ao tier recomendado’. Não implica execução efectiva, exclusividade, conclusão nem transferência do trabalho principal. Delegação exacta, execução concluída e duplicação pelo host serão reportadas separadamente, com regras congeladas.”

Se a intenção de H1 continuar a ser transferência efectiva de execução, esta emenda terminológica não basta: é necessário outro critério primário.

**A15 · Instrumento · SÉRIO — O primeiro modelo do turno pode não ser o host relevante.**  
O instrumento fixa o tier pelo primeiro pedido, mas não demonstra que esse pedido seja o que recebe o hint ou executa a decisão. Se pode haver mudanças de modelo dentro do turno é **n/d — precisa de ser verificado**.

Cenário concreto: o primeiro pedido usa T3, a resposta efectiva usa o tier recomendado e não há subagente; o instrumento classifica `ignorou`.

Emenda mínima:
> “Validamos antes da recolha que o primeiro pedido identifica o modelo que recebe o hint e decide a delegação. Se não identificar, usamos esse pedido decisor, com regra congelada. Mudanças posteriores de modelo serão registadas e não alterarão retrospectivamente a elegibilidade.”

**A16 · Instrumento · BLOQUEANTE — O braço só existir no hint impede auditar quem ficou de fora.**  
Prompts sem hint ficam fora de H1, o que pode ser legítimo, mas o registo descrito não permite verificar cobertura por braço. A aderência também não pode ser extrapolada para todos os prompts; o efeito de B em turnos anteriores pode alterar os pedidos posteriores e a sua elegibilidade.

Cenário concreto: B altera a sequência de trabalho e os turnos difíceis deixam de receber hint; a comparação dos turnos seleccionados favorece B.

Emenda mínima:
> “O braço é registado na criação da sessão e ligado a todos os turnos, independentemente da existência de hint. Reportamos por braço o fluxo completo até à elegibilidade e as razões de ausência de hint. H1 aplica-se apenas à população elegível definida; não será interpretada como efeito sobre todos os prompts.”

**A17 · Instrumento · BLOQUEANTE — Não foi demonstrado que o parser distingue instrução de execução.**  
O excerto de `classificarTurno` não procura texto imperativo: consulta `tn.delegs`. Portanto, não há evidência de que o texto de B conte directamente como sucesso; a construção de `tn.delegs` é **n/d — precisa de ser verificada**.

Cenário concreto: se o parser reconhecer nomes de agentes em texto, o próprio hint ou uma resposta “vou delegar” gera uma delegação inexistente.

Emenda mínima:
> “`tn.delegs` será construído exclusivamente a partir de eventos estruturados de chamadas de ferramentas, nunca de menções textuais. Antes da recolha, fixtures dos dois hints sem chamadas devem produzir zero delegações; chamadas reais, chamadas de outro tier e texto citado terão resultados esperados congelados.”

**A18 · Instrumento · SÉRIO — Congelar a função não congela a medição.**  
“Ou posterior sem alteração à classificação” permite mudar parser, fronteiras de turno, `modelToTier` e mapeamentos. Além disso, T0 conta como tentativa mesmo com Ollama falhado; isso é incompatível com chamar à métrica execução efectiva em T0.

Cenário concreto: uma alteração de extracção detecta mais chamadas numa parte da janela; ou B acumula tentativas T0 falhadas e apresenta elevada “aderência”.

Emenda mínima:
> “Congelamos por hash toda a cadeia de medição, incluindo parser, fronteiras de turno, mapeamentos e definições dos agentes. Correcções posteriores serão documentadas e aplicadas uniformemente a todos os dados. Tentativas T0 e execução local concluída serão resultados distintos.”

**A19 · Instrumento · SÉRIO — H2 selecciona uma variável que a delegação pode alterar.**  
Output do host inferior a 2 000 tokens não é uma definição independente de trivialidade: delegar pode encurtar a resposta do host. “Pares por categoria” também deixa por fixar categorias e emparelhamento.

Cenário concreto: uma tarefa complexa delegada gera apenas uma síntese curta e entra em H2; a mesma tarefa respondida pelo host ultrapassaria o limite e ficaria fora.

Emenda mínima:
> “H2 será descrita como comparação de turnos com output curto do host, sem inferência sobre trivialidade ou efeito causal da delegação. Categorias e emparelhamento serão congelados antes dos resultados. Para estudar tarefas triviais, a classificação terá de usar o pedido antes da resposta.”

**4. Guardas operacionais**

**A20 · Guardas operacionais · BLOQUEANTE — As excepções de segurança não estão ligadas à elegibilidade e à execução.**  
Não está definido como HIGH_RISK e overrides são detectados, qual regra prevalece ou o que acontece numa violação. Um turno correctamente não delegado por excepção pode contar como `ignorou`.

Cenário concreto: B respeita um override e perde aderência; ou ignora-o, delega e ganha aderência. A métrica recompensa o comportamento contrário à guarda.

Emenda mínima:
> “HIGH_RISK e overrides serão determinados antes da exposição ao hint pela mesma regra nos dois braços. Turnos em que a delegação recomendada é proibida ficam fora da primária e entram numa auditoria de segurança. A regra de detecção e precedência será congelada; qualquer violação impede adopção e desencadeia suspensão.”

**A21 · Guardas operacionais · BLOQUEANTE — O kill-switch não tem semântica experimental definida.**  
Está indicado o nome da variável, mas não o comportamento quando fica `off`, quem a acciona, nem como tratar sessões interrompidas e reinícios. Isso pode funcionar como uma segunda regra de paragem, dependente dos resultados.

Cenário concreto: o dono desliga B após experiências caras, exclui esse período e retoma quando as tarefas parecem mais favoráveis.

Emenda mínima:
> “Antes do arranque, fixamos os motivos de suspensão e o comportamento exacto de `off`. Toda a activação será datada e justificada; os dados anteriores permanecem na análise segundo a alocação original. Uma suspensão produz resultado interrompido, sem adopção; retomar exige emenda e nova janela identificada.”

**A22 · Guardas operacionais · SÉRIO — Contaminação pode reduzir ou fabricar a diferença entre braços.**  
A e B podem partilhar instruções persistentes, memória ou configurações. A existência efectiva de “DELEGA SEMPRE” no CLAUDE.md do dono não consta dos dois ficheiros: **n/d — precisa de ser verificada**. Não basta presumir que o mesmo modelo transfere memória entre sessões; é preciso identificar os mecanismos concretos.

Cenário concreto: uma instrução persistente de delegação torna A imperativo também, produzindo um falso negativo sobre a utilidade dessa formulação; uma alteração durante a janela favorece apenas sessões posteriores.

Emenda mínima:
> “Antes do arranque, inventariamos e congelamos CLAUDE.md, memórias persistentes, hooks, skills e instruções de delegação. Registamos os respectivos hashes por sessão e impedimos escrita de instruções experimentais em memória partilhada. A interpretação será incremental sobre essa configuração de base.”

**A23 · Guardas operacionais · BLOQUEANTE — A janela é uma condição incompleta, não uma data operacional fechada.**  
“Depois do veredicto do 60d (≥ 05/10) e do F2” não identifica o evento que conclui F2 nem determina o instante de início. Gravar o decisor activo e prometer estratificação por modelo não fixa como combinar versões e estratos.

Cenário concreto: o início é adiado até uma configuração favorável, ou versões do decisor e do host variam durante a recolha; depois escolhe-se a estratificação que faz B passar.

Emenda mínima:
> “O arranque depende de dois marcos documentados: veredicto do 60d e conclusão de F2 segundo critério anexado antes da recolha. Cumpridos ambos, uma emenda prévia fixa data e hora de início, versões do decisor, host e configurações. Actualizações suspendem a janela; qualquer análise estratificada e respectiva agregação ficam previamente especificadas.”

| id | frente | severidade | emenda em ≤ 12 palavras |
|---|---|---|---|
| A1 | Gate | BLOQUEANTE | Fazer inferência por sessão; congelar teste e ponderação. |
| A2 | Gate | BLOQUEANTE | Fixar corte automático, data-limite e tratamento de sessões activas. |
| A3 | Gate | SÉRIO | Usar diferença absoluta; distinguir falha de ausência de efeito. |
| A4 | Gate | BLOQUEANTE | Definir não-inferioridade, incerteza, agregação dos juízes e poder. |
| A5 | Gate | BLOQUEANTE | Automatizar sorteio e padronizar cegamento e apresentação. |
| A6 | Gate | BLOQUEANTE | Agregar consumo completo; definir comparação, zeros e dados ausentes. |
| A7 | Gate | SÉRIO | Fixar detecção, atribuição e janela igual de retrabalho. |
| A8 | Alocação | BLOQUEANTE | Auditar identificadores e registar todas as sessões iniciadas. |
| A9 | Alocação | BLOQUEANTE | Alocar por linhagem; excluir subagentes da contagem de sessões. |
| A10 | Alocação | SÉRIO | Garantir identidade global, deduplicação e registo por máquina. |
| A11 | Alocação | SÉRIO | Impedir escolha de pedidos pelo braço; registar intervenções. |
| A12 | Instrumento | BLOQUEANTE | Calcular elegibilidade antes da delegação, independentemente do resultado. |
| A13 | Instrumento | BLOQUEANTE | Fazer tier declarado prevalecer sobre nome exacto do agente. |
| A14 | Instrumento | BLOQUEANTE | Distinguir tentativa de delegação de execução efectiva. |
| A15 | Instrumento | SÉRIO | Identificar modelo decisor e registar mudanças dentro do turno. |
| A16 | Instrumento | BLOQUEANTE | Registar braço sem hint e publicar fluxo de elegibilidade. |
| A17 | Instrumento | BLOQUEANTE | Aceitar só chamadas estruturadas; testar texto sem execução. |
| A18 | Instrumento | SÉRIO | Congelar cadeia completa; separar tentativa T0 de sucesso local. |
| A19 | Instrumento | SÉRIO | Retirar inferência de trivialidade baseada no output posterior. |
| A20 | Guardas operacionais | BLOQUEANTE | Fixar excepções prévias, elegibilidade e suspensão por violação. |
| A21 | Guardas operacionais | BLOQUEANTE | Definir suspensão, preservação dos dados e condições de reinício. |
| A22 | Guardas operacionais | SÉRIO | Congelar instruções persistentes e impedir contaminação por memória. |
| A23 | Guardas operacionais | BLOQUEANTE | Operacionalizar marcos, início, versões e análise de estratos. |

VEREDICTO: EMENDAR ANTES DOS DADOS — 15 BLOQUEANTES · 8 SÉRIOS · 0 MENORES.