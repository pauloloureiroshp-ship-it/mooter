# As perguntas que faltam — diagnóstico do MEO com o scorecard vivo
**Data:** 2026-07-27 · **Conector:** v1.17.0 (validado ao vivo: `mooter_fleet({view:'board'})` responde)
**Fonte:** ledger real, 320 eventos, 78 despachos · `_handoff/diag-ledger-saida.txt`

> Regra: cada pergunta traz **dono**, **o que já se sabe** e **a decisão que destranca**.
> Perguntas sem dono são conversa; perguntas sem decisão são curiosidade.

---

## O que o scorecard disse, e o que ele ainda não sabe

| Métrica | Valor | Estado | Dono |
|---|---:|---|---|
| Entregas/dia | 14 | dentro | — |
| **Taxa de falha** | **26,32%** | **fora** | MTO |
| Tempo de recuperação | 0,785 min | dentro | — |
| **Trabalho a $0** | **35,53%** | **fora** | MOO |
| Custo por entrega | US$ 0,4826 | dentro | MFO |
| Pressão de quota | 0,723 | dentro | MFO |
| WIP | 0 | dentro | — |
| Lead time até 1º token | `n/d` | — | MTO |
| Keep rate | `n/d` | — | MIO |

---

## P1 · MTO — "1 em cada 4 jobs falha" é verdade, ou a métrica está a mentir?

**O que já se sabe (medido nos 320 eventos):**

| Motivo do estado não-`done` | Nº | É falha de trabalho? |
|---|---:|---|
| `exit=1` | 9 | ✅ sim |
| `empty-output` | 7 | ⚠️ talvez — saiu 0 mas não entregou texto |
| **`cancelled-by-user`** | **5** | ❌ **não — fui eu que cancelei** |
| `timeout` | 4 | ⚠️ tecto de 30 min do Codex, não erro |
| `(sem exit_code)` | 2 | ❌ não classificável |
| **`orphaned-by-restart`** | **2** | ❌ **não — reinício do conector** |

**Conclusão dura: 9 dos 29 estados não-`done` (31%) não são falhas de trabalho.** A taxa real de
falha ronda os 20%, não 26%. Uma métrica que conta o meu cancelamento como falha do produto é
exactamente a classe de mentira que esta casa não comete.

**Pergunta que destranca:** separamos `falhou` de `interrompido` e `expirou` no ledger, ou
mantemos tudo junto e assumimos que a taxa está inflacionada?
**Decisão:** MTO recomenda; MEO decide se vale um evento novo no ledger.

---

## P2 · MOO — porque é que só 35% do trabalho vai para a GPU?

**O que já se sabe:** 29 despachos para `moo` em 78 (37%), mas **10 desses 29 falharam** (34%).
A GPU recebe pouco *e* entrega menos do que recebe.

**O buraco que impede a resposta:** o ledger **não regista a razão da decisão local-first**.
O `localfirst.js` decide e explica-se em memória — e essa explicação morre ali. Ou seja: o MOO não
consegue responder à sua própria pergunta-âncora ("o que impediu o resto?").

**Pergunta que destranca:** gravamos `local_decisao: {local, porque, confianca}` no evento
`dispatched`? É uma linha de código e transforma uma opinião numa estatística.
**Decisão:** MEO — é barato e desbloqueia o MOO e o MIO ao mesmo tempo.

---

## P3 · MIO — o keep rate consegue alguma vez ser medido nesta máquina?

**O que já se sabe:** `files_touched` aparece em **0 eventos**. O `aprender.js` só mede keep rate
com base git limpa — e a árvore tem ~1500 ficheiros não rastreados há semanas.

**Pergunta desconfortável:** o keep rate é medível aqui, ou vamos ter `n/d` para sempre e estamos
a manter uma métrica decorativa?
**Opções:** (a) medir só em worktrees dedicadas e limpas (`create_worktree`, que agora funciona);
(b) limpar a árvore canónica de uma vez; (c) assumir `n/d` e tirar a métrica do scorecard.
**Decisão:** MEO. Sem uma destas, o MIO fica sem o seu KPI principal.

---

## P4 · MTO — o lead time é n/d por opção ou por esquecimento?

**O que já se sabe:** `first_token`, `first_token_at` e `ttft_ms` aparecem em **0 eventos**. A
métrica que mede "a lentidão que o Paulo sente" — a razão de existir da Onda 2 — não está
instrumentada.

**Pergunta:** vale a pena gravar o instante do primeiro token útil de cada job?
**Contra-argumento honesto:** o `telemetry.js` já vê o stream; é barato. Mas se ninguém olhar para
o número, é mais ruído.
**Decisão:** MEO — é a única métrica que mede a experiência, não o processo.

---

## P5 · MCC — as faixas do scorecard são faixas ou decoração?

**O que já se sabe:** **todas as 9 faixas são `default`, nenhuma calibrada.** E há pelo menos uma
que nunca poderá disparar: entregas/dia com faixa `[1, 1000]`. Isso não é um alarme — é um
enfeite com ar de rigor.

**Pergunta:** que faixas queres calibrar com a tua experiência real, e quais devem ser removidas
por não conseguirem alarmar?
**Decisão:** MEO define as faixas; é literalmente onde ele diz "o que é bom" — e nenhum agente
pode decidir isso por ele.

---

## P6 · MFO — a poupança que mostramos inclui o custo do cache?

**O que já se sabe:** a releitura de cache é **53,8%** do peso da quota (medido hoje; era 48,8%
ontem — está a subir). E o Cursor tornou público que trocar de modelo a meio invalida o prompt
cache.

**Pergunta:** o painel deve mostrar "poupança" enquanto não descontarmos o custo de invalidação
de cache que as nossas próprias trocas de tier provocam?
**Recomendação do MFO:** não. Enquanto não estiver medido, mostrar `n/d` e explicar. É melhor não
ter número do que ter um número simpático.

---

## P7 · MRO — o que corre hoje sem autorização e ainda não vemos?

**O que já se sabe:** a correcção de hoje já mostra `permissoes_pedidas` vs `permissoes_efectivas`
com `diferem: true` — no primeiro job de teste, pediram-se `Read,Glob,Grep` e as efectivas eram
`[]` (o `moo` corre via `/api/chat` e não recebe ferramentas nenhumas).

**Pergunta:** quantos jobs históricos correram com permissões diferentes das declaradas, e algum
deles escreveu fora do âmbito?
**Decisão:** MRO investiga sozinho — é o cargo dele e não precisa do MEO para olhar.

---

## P8 · A pergunta estratégica que fica por cima de todas

O scorecard responde a *"posso ir dormir?"*. Hoje diz **não**, por duas métricas fora.

**Mas a pergunta que ainda ninguém faz é:** *quantas vezes por dia o Mooter me interrompeu esta
semana?* Sem esse número, não sabemos se a camada MEO está a funcionar — que era o critério de
sucesso inteiro do M2.

**Decisão:** contar interrupções (chamadas ao MEO) no próprio scorecard, a partir de agora.
Sem isso, o M2 é uma sensação.

---

## O que eu recomendaria fechar primeiro, e porquê

1. **P2** (razão da decisão local no ledger) — uma linha, destranca dois cargos.
2. **P1** (separar falha de interrupção) — a métrica mais visível está inflacionada 31%.
3. **P8** (contar interrupções) — sem ela não há prova de que a governança funciona.
4. **P4/P3** (lead time e keep rate) — ou instrumentar, ou tirar do scorecard. `n/d` permanente
   numa métrica é dívida, não honestidade.
5. **P5** (calibrar faixas) — só o MEO pode.
