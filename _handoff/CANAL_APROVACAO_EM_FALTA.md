# Canal de aprovação em falta

## Problema (5 linhas)

1. O harness do agente `cc` termina quando encontra um comando que exige aprovação, mesmo quando o pedido já declara autorização.
2. O terminal fica registado como `nao_verificado` com `exit_code: "agent-awaiting-approval"`, sem entrega.
3. O conector não expõe uma ferramenta para aprovar, retomar ou relançar de forma vinculada o job parado.
4. Em `2026-08-04` UTC, o ledger prova 3 jobs neste estado; os 5 registos existentes abrangem `2026-08-03` e `2026-08-04`.
5. Os 3 jobs de hoje custaram USD 0.6426279; o custo foi pago sem o passo pedido ser executado ou verificado.

## Jobs de hoje

Fonte de verdade: `C:\Users\Paulo Loureiro\.mooter\ledger.jsonl`; “hoje” segue a definição da auditoria no próprio ledger: `ts` começa por `2026-08-04`.

| Linha | `job_id` | `ts` UTC | `cost_usd` |
|---:|---|---|---:|
| 797 | `job-mse3sule-c3a9` | `2026-08-04T03:35:31.810Z` | 0.2738892 |
| 1672 | `job-mseybyiy-0a62` | `2026-08-04T17:49:56.839Z` | 0.2022168 |
| 1834 | `job-msf00jyw-423d` | `2026-08-04T18:36:37.434Z` | 0.1665219 |
|  | **Total** |  | **0.6426279** |

Reconciliação honesta: a premissa “5 hoje” não bate com o corte UTC pedido pela auditoria. Existem 5 registos no ledger inteiro: 2 em `2026-08-03` e 3 em `2026-08-04`; o custo dos 5 é USD 0.741787.

## Três desenhos possíveis

### 1. Aprovação e retoma nativas no conector

Adicionar uma operação explícita, por exemplo `mooter_approve(job_id, decisao, capability)`, que só aceita uma decisão humana autenticada e entrega ao harness uma capability limitada ao comando bloqueado.

- Resolve: aprovação auditável, vinculada ao job e ao comando exato; permite retomar quando o runtime ainda suporta pausa/continuação.
- Não resolve: o caso atual em que o processo já terminou e não existe primitiva de resume; também não deve aprovar em lote nem ultrapassar o veto humano para irreversíveis.

### 2. Capabilities pré-autorizadas no dispatch

Converter a autorização já presente no pedido num allowlist determinístico de ferramentas/operações e passá-lo ao harness no arranque do job.

- Resolve: comandos previsíveis deixam de parar por uma segunda aprovação redundante; não exige um canal de retoma.
- Não resolve: pedidos novos descobertos durante a execução, comandos fora do allowlist ou qualquer irreversível que não tenha autorização humana específica.

### 3. Supervisor de aprovação com continuação idempotente

Quando o terminal é `agent-awaiting-approval`, persistir um pedido de decisão no ledger; após resposta do Paulo, criar um job de continuação que recebe o recibo anterior, o comando aprovado e uma chave de idempotência.

- Resolve: funciona mesmo quando o processo original morreu; deixa prova append-only e pode ser implementado sem fingir uma retoma inexistente.
- Não resolve: não preserva memória volátil do processo; sem recibos de efeitos e idempotência pode repetir ações parcialmente executadas.

## Gate pré-despacho

1. **fonte de verdade:** `ledger.jsonl`, linhas 797, 1672 e 1834 para o corte UTC de hoje; nenhuma métrica foi estimada.
2. **escritor único:** o ledger append-only continua a ser o registo canónico; um futuro canal deve ter um único escritor de decisões de aprovação no conector.
3. **reversível vs irreversível:** este ficheiro só apresenta desenhos; nenhum canal foi implementado. Ações irreversíveis continuam dependentes de aprovação explícita do Paulo.
4. **script-first:** a deteção usa `exit_code` determinístico; o canal futuro deve expor primeiro uma operação verificável e testável, não interpretação de texto livre.
5. **projeção vs 2ª verdade:** Cockpit/board projetam o estado do ledger; não se propõe uma base paralela de aprovações.
6. **degradação graciosa:** sem resposta humana ou com o conector indisponível, o job permanece não verificado; nunca há autoaprovação silenciosa.
7. **frozen/allowlist/n-d:** `tools/router/classify.js` fica intocado; capabilities são allowlisted por operação; campos sem prova ficam `n/d`.
8. **custo de reverter:** este diagnóstico reverte-se removendo o ficheiro; um canal futuro deve poder ser desligado sem reescrever o ledger nem invalidar recibos anteriores.

Objeção real: o desenho 1 parece o mais direto, mas sozinho não resolve o harness atual porque o processo já terminou quando o conector observa `agent-awaiting-approval`. Por isso não deve ser escolhido sem uma primitiva real de pausa/retoma; o desenho 3 é o fallback compatível com o estado medido.

CCA: n/d/5 — artefacto de decisão sem preflight de worktree/branch, porque a wave proibiu qualquer uso de Git.

🔍 council 8/8 · objeção mais forte: uma ferramenta `approve` não ressuscita um processo já terminado · resolvida: desenho 1 marcado insuficiente sem retoma nativa; desenho 3 cobre continuação pós-terminação
