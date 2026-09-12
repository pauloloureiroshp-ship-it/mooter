**P6 sobrevive como demonstração de formato de telemetria. Não sobrevive, neste estado, como prova pré-registada de custo real reconciliado.** A aritmética do −94% está correcta; a pré-inscrição, a proveniência e a completude dos custos têm problemas materiais.

Âmbito: analisei os excertos fornecidos, confirmei os preços oficiais e executei reproduções isoladas de `numOrNull` e `reconcile`. O acesso local falhou com `CreateProcessAsUserW failed: 5`: **não executei a suite original nem inspeccionei `run.mjs`, `pricing.js`, Git ou logs brutos**. Distingo abaixo defeitos demonstrados de hipóteses por verificar.

**P6-01 · fatal — Pré-registo contradito pela cronologia apresentada**

- **Claim:** protocolo congelado e commitado antes da corrida.
- **Porquê:** `analysis.at = 13:51:24.449Z`; `congelado_em = 14:40:00Z`, no mesmo dia. A análise antecede o congelamento em **48 min 35,551 s**. O hash abreviado, isoladamente, não demonstra a ordem. Isto compromete a condição de pré-registo, embora não invalide automaticamente os cálculos.
- **Evidência que resolve:** conteúdo exacto do protocolo no commit completo, prova temporal independente da sua existência antes da execução e timestamps dos artefactos brutos. Se foi uma corrida preliminar, identificá-la como tal e apresentar a corrida posterior. Preservar os originais; uma correcção exige errata.

**P6-02 · serious — “Ganhou por construção” é sobretudo uma propriedade do formato**

- **Claim:** 156/156 demonstra que cada decisão tem custo real e origem.
- **Porquê:** `costLine` preenche esses campos pelo ramo seleccionado. A presença é largamente garantida pelo instrumento, incluindo zeros atribuídos por política. Os 63 pares de contagens da regra são sintéticos. Além disso, 156 linhas representam decisões e chamadas relacionadas, não necessariamente 156 turnos independentes.
- **Evidência que resolve:** correspondência por identificador entre o universo esperado de eventos e as linhas emitidas, incluindo falhas, retries, cancelamentos e contagens ausentes. Isso pode provar **cobertura nesta amostra**. Não prova exactidão financeira nem integração no produto.

**P6-03 · minor — O −94% está certo; a fórmula publicada omite input normal**

- **Claim:** os totais reconciliam com os preços indicados.
- **Porquê:** a documentação oficial confirma Haiku 4.5 a US$1/M input, US$5/M output, US$2/M escrita de cache de 1 hora e US$0,10/M leitura. [Preços oficiais](https://platform.claude.com/docs/en/about-claude/pricing)

A conta completa é:

| Parcela | USD |
|---|---:|
| Input + output fornecidos | 0,079605 |
| 601 742 × 2/M | 1,203484 |
| 354 357 × 0,1/M | 0,0354357 |
| **Total reconstruído** | **1,3185247** |
| Host | 1,318525 |
| **Residual** | **0,0000003** |

`(0,079605 − 1,318525) / 1,318525 = −93,9625718%`: **−94% é correcto**.

Os 15 881 tokens de output custam US$0,079405. Faltam US$0,000200 na fórmula textual, compatíveis com 200 tokens de input ao preço indicado.

- **Evidência que resolve:** confirmar esses 200 tokens nos brutos e publicar a fórmula completa.

**P6-04 · serious — “Fully explained, linha a linha” excede a evidência apresentada**

- **Claim:** cache explica integralmente o desvio de cada chamada.
- **Porquê:** o agregado coincide extraordinariamente bem **sob a hipótese de todas as escritas terem TTL de 1 hora**. Mas `analysis.json` diz **1,25×**, correspondente a 5 minutos. Nesse cenário, o total seria **US$0,8672182**, deixando **US$0,4513068** por explicar.

O módulo conserva apenas a contagem agregada de criação, sem separar TTLs. Uma igualdade agregada também pode esconder erros que se compensam entre chamadas.

- **Evidência que resolve:** para cada uma das 20 chamadas, modelo, input/output, escrita de cache por TTL, leitura, custo do host, custo reconstruído e residual. Documentar a contradição 1,25×/2× por errata. Até lá: **“o agregado é consistente com escrita de cache de 1 hora”**.

**P6-05 · serious — A via API publica um subtotal como custo incremental**

- **Claim:** `cost_usd` responde a “quanto custou”.
- **Porquê:** no ramo `api`, `cost_usd = listPrice(input, output)`, ignorando cache mesmo quando as contagens existem. `host_reported_cost_usd` não corrige nem assinala essa incompletude. Aplicada aos números desta amostra, essa lógica apresenta cerca de 6% da estimativa completa.

Preço de tabela também não é, por si só, desembolso observado. Imprimir as contagens omitidas não torna o total completo.

- **Evidência que resolve:** testes de cache-only e cache mista contra valores independentes; campo explicitamente denominado subtotal estimado, ou cálculo completo com estado de completude e base de preço.

**P6-06 · serious — A origem e o zero podem ser escolhidos pelo chamador**

- **Claim:** `subscription_included` e `ollama_local` demonstram desembolso zero.
- **Porquê:** o módulo aceita `engine` sem verificar execução ou cobertura. Uma chamada paga pode ser rotulada `subscription` e receber zero; uma chamada pode ser rotulada `rule` e ter as contagens sobrescritas com `0/0`. Subscrição sem quaisquer contagens continua a receber custo e origem válidos.

Para execução local, zero pode descrever cobrança do fornecedor de inferência; não demonstra custo operacional total zero. Estas são convenções declaradas pelo chamador, não recibos autenticados.

- **Evidência que resolve:** ligação ao evento real de execução e à modalidade de pagamento, com origem observada separada de origem declarada. Testar rótulos contraditórios e chamadas não cobertas.

**P6-07 · serious — `reconcile` transforma desconhecidos em zero e mistura bases**

- **Claim:** a reconciliação não esconde custos.
- **Porquê:** reproduzindo literalmente a função:

```js
reconcile([{ cost_usd: 'n/d', list_price_usd: 'n/d' }], 1)
// ours_usd: 0, delta_usd: -1, delta_rel: -1
```

Um conjunto inteiramente desconhecido aparenta ficar 100% abaixo do host. Numa subscrição com preço desconhecido, o fallback para `cost_usd: 0` produz o mesmo problema.

A função também prefere preço de lista quando disponível e custo incremental nos restantes casos, sem exigir uma base comum. Não valida duplicados nem correspondência com o total do host. A ausência da palavra `savings` não impede uma apresentação enganadora.

- **Evidência que resolve:** testes de linhas desconhecidas, conjuntos vazios, bases misturadas, duplicados e cobertura parcial. Total incompleto deve ficar marcado como incompleto, com contagens de incluídos/excluídos.

**P6-08 · serious — Validação numérica permissiva permite contagens falsas**

- **Claim:** sem contagens não se inventam números.
- **Porquê:** a reprodução de `numOrNull` confirma:

```text
false → 0     true → 1     " " → 0
[] → 0       [5] → 5      -1 → -1
1.5 → 1.5
```

Ollama precisa apenas de **uma** contagem não nula para publicar zero com origem. Contagens negativas ou fraccionárias são conservadas. `reconcile` aceita custos negativos: `[{cost_usd:-1}]` contra host `1` dá **−200%**.

- **Evidência que resolve:** validação explícita de contagens inteiras, finitas e não negativas; rejeição de coerções ambíguas; testes para cada caso acima e para apenas uma contagem presente.

**P6-09 · serious — Modelo desconhecido pode receber preço credível por fallback**

- **Claim:** `listPrice` devolve `n/d` quando o modelo não tem preço.
- **Porquê:** não verifica se existe preço exacto antes de chamar `pricing.priceTurn`. Se esta função aplica o fallback descrito no próprio pacote, aceita-o como preço válido. O teste de modelo inexistente apenas exige que o resultado seja diferente do Haiku: **não exige `n/d`**.

Os regex também convertem qualquer nome contendo `haiku`, `sonnet` ou `opus` numa versão escolhida, podendo precificar incorrectamente outra versão ou um identificador malformado.

- **Evidência que resolve:** inspeccionar `pricing.js`; testar modelos desconhecidos, versões distintas, nomes enganosos e aliases permitidos. Publicar o modelo recebido e a chave efectivamente usada. O fallback não deve parecer preço confirmado.

**P6-10 · minor — Arredondamento e data não garantem rastreabilidade**

- **Claim:** o número e `priced_at` identificam fielmente o cálculo.
- **Porquê:** `round6(0.0000001)` produz zero. Arredondar por linha antes de somar acumula erro. A data vem de um comentário, não de um identificador imutável da tabela; se a leitura falhar, a “data” passa a ser `"pricing.js"`.
- **Evidência que resolve:** testes de custos submicrodólar e acumulação; precisão interna superior à de apresentação; versão/hash da tabela e tratamento explícito de data ausente.

**P6-11 · serious — Os totais do ledger somam, mas o significado não está validado**

- **Claim:** 2 134 eventos, zero linhas com custo e origem; 478 execuções nunca correram.
- **Porquê:** `916 + 492 + 726 = 2 134` está certo. Contudo:

  - O protocolo especifica `done` no ledger; o denominador destacado usa **todos os 726 eventos**. No recorte especificado, o total seria **1 428**.
  - Não conhecemos os predicados de `run.mjs`: nomes de eventos, campos aninhados, aliases, valores nulos, erros de parsing ou linhas descartadas.
  - `deferred` demonstra esse estado registado; não demonstra que a operação **nunca** correu posteriormente ou noutro componente.
  - Eventos de ciclo de vida não equivalem a execuções únicas.

O JSON apresentado também não contém a métrica B “linhas com tokens”, apesar da afirmação 156/156.

- **Evidência que resolve:** snapshot imutável dos logs, hash, janela temporal, estatísticas de parsing, predicados exactos e verificação independente dos schemas dos escritores. Correlacionar `deferred` com eventos posteriores. Publicar separadamente o recorte protocolar e a exploração de todos os eventos.

**P6-12 · serious — “11 biting tests” não sustenta exactidão financeira**

- **Claim:** a suite protege contra números incorrectos e manipulação.
- **Porquê:** duas provas repetem essencialmente “Ollama sem ambas as contagens”. Os testes de preço comparam sobretudo o módulo com o mesmo SSOT, podendo reproduzir o mesmo erro. A ordenação Haiku < Sonnet < Opus não verifica preços absolutos nem ausência de fallback em todos os modelos.

Faltam os casos P6-04 a P6-10, reconciliação por chamada, verificação do leitor dos logs e integração com escritores reais.

- **Evidência que resolve:** resultados esperados calculados independentemente, fixtures dos schemas reais e testes das falhas concretas acima. Nesta revisão, há **11 testes apresentados**, não 11 testes cuja execução confirmei.

**P6-13 · serious — O slide promete mais do que o rodapé consegue corrigir**

- **Claim:** “Every decision line carries its cost” e “fully explained”.
- **Porquê:** o título generaliza para o produto uma emissão experimental. A métrica de presença parece medição de custo; o −94% pode ser lido como poupança apesar do aviso. “Host cobra” também confunde telemetria de preço com facturação numa subscrição. O título do protocolo sobre o recibo que a consola não dá exige comparação que P6 não apresenta.
- **Evidência que resolve:** limitar a mensagem à demonstração e tornar as limitações parte da afirmação principal.

Texto proposto para substituir o núcleo do slide:

> **Prototype cost-line coverage: 156 records in one instrumented run. Not yet emitted by the installed product.**
>
> The supplied run reports cost-basis labels and token fields on 156/156 records; 63 rule records contain synthetic zero token counts.
>
> Across 20 Haiku calls, the input/output-only estimate was **$0.079605**, versus **$1.318525** reported by the CLI. Adding the supplied cache counts at 1-hour write rates reconstructs **$1.3185247**. Per-call TTL verification remains outstanding.
>
> **This demonstrates instrumentation, not savings or verified billing.** Historical-ledger coverage and pre-registration chronology remain under verification.

**SURVIVE**

- −93,9626%, correctamente arredondado para −94%.
- Reconstrução agregada do host com cache de 1 hora, até ao arredondamento.
- Utilidade de explicitar a base do custo.
- Avisos de ausência de prova de poupança e de integração no produto.

**REWORD**

- “Ganhou” → demonstração de preenchimento de campos nesta amostra.
- “Custo real” → base declarada e estimativa, com completude explícita.
- “Fully explained linha a linha” → agregado consistente sob hipótese de TTL.
- “2 134 eventos” → recorte exploratório, distinto do denominador protocolar.
- “Nunca correram” → registados como `deferred`.
- “11 biting tests” → 11 testes unitários, com lacunas materiais.

**DEAD**

- Pré-registo demonstrado, enquanto a cronologia permanecer contraditória.
- Presença de `cost_source` como prova de origem verificada.
- Subtotal input/output como custo API completo.
- `n/d` convertido em zero numa reconciliação válida.
- Δ Ollama = 0 como validação independente.
- Qualquer conclusão de poupança ou cobertura do produto instalado.

**SLIDE PUBLISHABLE WITH THESE EDITS** — como demonstração de protótipo. **P6 como prova pré-registada permanece não publicável até resolver a cronologia.**