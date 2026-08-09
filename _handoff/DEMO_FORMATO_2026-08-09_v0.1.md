# DEMO-FORMATO v0.1 — o painel de raciocínio, e o que ele custa em schema

**Data:** 2026-08-09 · **Estado:** 🟡 desenho aprovado pelo dono, **não implementado**
**Insumo obrigatório de:** F4 (§0) e F5 (M1) do `MAESTRO_POKEMOO_2026-08-08.md`
**Não altera:** a fila F1→F5 · a REGRA 0 · o jurídico dos frames

> **A conclusão que interessa antes de qualquer pixel:** metade deste painel **ainda não tem
> dado medido por trás**. O `StepReceiptV1` de hoje (`poke_lab/recibo.py:20-53`) não tem um
> único campo de prompt, contexto ou objetivo. O `prompt_bytes` existe em memória no runner
> (`poke_lab/runner.py:566`) e **morre lá** — não é persistido nem hasheado.
> Como o próprio pedido diz *"nada de painel fake: só etapas com dado medido por trás"*, o
> desenho abaixo vem com a factura: **um `StepReceiptV1` v2, que tem de entrar ANTES da F4b.**

---

## 1. Thread com título por etapa — a simetria é o argumento

As **mesmas seis etapas**, na mesma ordem, nas duas telas. O braço de modelo único mostra
`ROTEAR` e `GUARDRAIL` **vazias**. Não é um insulto ao braço A: é a diferença desenhada em vez
de argumentada.

| # | etapa | o que mostra | braço A (modelo único) |
|---|---|---|---|
| 1 | **PERCEBER** | estado lido da RAM: posição · party · objetivo corrente | igual |
| 2 | **PLANEJAR** | pilha de objetivos do harness — *"sair da cidade → floresta → ginásio"* | igual |
| 3 | **ROTEAR** | tier escolhido · **motivo** · **alternativa recusada** | **VAZIA** |
| 4 | **GUARDRAIL** | política de ação inválida · teto de custo — verde ou disparado | **VAZIA** |
| 5 | **AGIR** | o botão | igual |
| 6 | **VERIFICAR** | estado novo confirmado | igual |

Regra dura: **uma etapa sem campo medido não é renderizada com placeholder** — some, e o
rodapé diz por que sumiu. Um painel que preenche buracos com texto plausível é o oposto do
recibo.

## 2. Painel "context engineering" — por lance

O que entrou no prompt **daquele passo**, decomposto, com contagem de tokens por componente:

```
estado da RAM        412 tok   ████████░░
pilha de objetivos    88 tok   ██░░░░░░░░
memória dos N passos 260 tok   █████░░░░░
instruções fixas     140 tok   ███░░░░░░░
                     ───────
total                900 tok
```

A engenharia de contexto **visível**, não alegada. É também o gráfico que explica o custo sem
falar de custo.

## 3. Drill-down

Clicar num lance abre: **prompt exato** · **resposta bruta** · **recibo** com `record_hash`,
`prev_hash` e o link para o `steps.jsonl`. É a "linha de raciocínio até o melhor prompt" —
verificável, não narrada.

Ressalva herdada do brief (C2): quando o transporte não expõe resposta bruta nem `request_id`,
grava-se `request_id: null` + `output_hash` — **e o painel diz isso**, em vez de mostrar um
campo vazio que parece um bug.

## 4. Momentos de escalada em destaque

Quando o Mooter sobe de tier: banner curto com o **motivo lido do ledger**, não um texto
escrito à mão. É o instante mais persuasivo da demo justamente porque é o único que o braço A
não consegue ter.

## 5. O que NÃO entra (G18)

**Pastas, skills e schedules ficam de fora.** Não existem no loop do jogo, e mostrá-los aqui
seria vender maquinaria que não está a correr naquela tela. Essa camada mostra-se no
**cockpit/desktop** (mock v3), **cena 2 do pitch**. Registado também no
`ADDENDUM_MOO_RUN_SERIE_2026-08-08.md`.

---

## 6. A factura — o que falta medir, campo a campo

Auditado contra `poke_lab/recibo.py:20-53` em 2026-08-09.

| etapa / painel | precisa | existe hoje? |
|---|---|---|
| PERCEBER | posição · party · objetivo legíveis | **só `state_hash`.** Os valores legíveis dependem do **B6** (mapa de RAM), que está bloqueado pela ROM |
| PLANEJAR | pilha de objetivos | **nada no recibo.** E que o harness exponha uma pilha de objetivos é **`n/d`** — não foi verificado contra o schema de `GET /state` |
| ROTEAR — tier | `tier` | ✅ |
| ROTEAR — alternativa recusada | `models_tried[]` | ✅ (aproxima) |
| ROTEAR — **motivo da escolha** | — | **GAP.** Só existe `escalation_reason`, que é da *escalada*, não da escolha inicial |
| GUARDRAIL | inválidos / retries | ✅ `invalid_count`, `retries`, `retry_kind` |
| GUARDRAIL — **verde/disparado** | — | **GAP.** Os tetos vivem no runner (C5) mas nenhum campo diz se dispararam |
| AGIR | `action_parsed` | ✅ |
| VERIFICAR | `state_hash` | ✅ |
| **Context engineering** | tokens por componente | **GAP grande.** Zero campos. O prompt não é sequer hasheado |
| **Drill-down — prompt exato** | — | **GAP.** `prompt_bytes` morre no runner |
| Drill-down — resposta / recibo | `output_hash`, `action_raw`, `record_hash` | ✅ |
| Escalada | `escalated` + motivo | ✅ no schema; **no ledger do bridge é o que a F2 vai construir** |

### `StepReceiptV1` v2 — o que a v0.1 exige acrescentar

Campos **novos**, todos `null` quando não medidos (regra da casa: ausente = `null`; métrica
não medida = `n/d`):

| campo | serve |
|---|---|
| `prompt_hash` | drill-down verificável sem inchar o jsonl |
| `prompt_components[]` — `{nome, tokens}` | o painel de context engineering |
| `prompt_tokens_total` | o total do painel |
| `routing_reason` | ROTEAR — o motivo da escolha inicial |
| `alternativas_recusadas[]` — `{modelo, tier, porque}` | ROTEAR — o que foi recusado |
| `guardrails[]` — `{nome, estado: verde\|disparado, valor, teto}` | GUARDRAIL |
| `objectives_stack[]` | PLANEJAR — `null` até o harness provar que expõe |
| `perception` — `{posicao, party, objetivo}` | PERCEBER — `null` até o **B6** |

**O prompt integral não vai para o `steps.jsonl`.** Vai para `runs/<run_id>/prompts/<seq>.txt`
(pasta já coberta pelo `.gitignore` e pelo `test_gitignore.py`), e o ledger guarda só o
`prompt_hash`. O drill-down resolve o hash contra o ficheiro; se o ficheiro não existir, diz
que não existe.

### Consequência para a fila — a única coisa urgente aqui

O brief congela o `StepReceiptV1` **antes de se escreverem adapters** (C0.a), e os adapters
são a **F4b**. Logo:

> **A janela para o v2 é AGORA, antes da F4b.** Se os adapters forem escritos contra a v1, o
> painel da demo não tem de onde sair e a F5 vira reescrita dos dois braços.

Isto **não** fura a REGRA 0: é schema e recibo, não é run de medição. E o `E3` do §0 já pedia
"`StepReceiptV1` **versionado**" — a v2 é o que dá conteúdo a esse "versionado".

## 7. O que este documento não decide

- **Nome e visual** do painel (Moo Ranch): fora de escopo, é da marca.
- **Se o harness expõe pilha de objetivos:** `n/d`. Verificar contra o schema congelado de
  `GET /state` antes de prometer a etapa PLANEJAR.
- **Contagem de tokens por componente:** exige um tokenizador por motor. Para o braço local é
  medível; para o remoto, se a API não devolver a decomposição, o painel mostra **estimativa
  rotulada como tal** ou `n/d` — nunca um número apresentado como medido.


---

## 8. O acordo mock↔banner — imposto por `poke_lab/portao_demo.py`

**O MOCK da tela 2 e o banner "DEMO DE FORMATO" saem JUNTOS. Nunca um sem o outro.**

Hoje a tela 2 é um mock rotulado e o banner diz em letras grandes que aquilo não é medição.
No dia em que alguém trocar o mock por um modelo de topo real — e vai apetecer, porque a demo
fica mais bonita — a comparação passa a ter peso de resultado, e nesse instante cai na
**REGRA 0**: zero runs A/B antes da F3 fechada e do `POKE_GO`.

Tirar o mock e deixar o banner produz uma coisa pior que um erro: **uma comparação real
vestida de brincadeira**. Tirar o banner e deixar o mock produz o contrário — um mock a passar
por modelo.

Isto não é uma recomendação. `poke_lab/portao_demo.py` corre **antes** de qualquer run do
launcher e recusa `--braco2-modelo` sem as três condições, verificadas no disco e não
declaradas por quem chama:

1. `maestro-state/F3.complete.json` existe (o teste nº2 correu);
2. `POKE_GO` existe **e não está vazio** (um ficheiro de 0 bytes prova um `touch`, não uma
   decisão);
3. `--prereg-sha` presente (runs numerados **antes**, todos publicados — D4, anti-cherry-pick).

`tests/test_portao_demo.py` prende a invariante nos dois sentidos: prova que o portão recusa
com cada condição em falta **e** que, quando abre, o banner cai junto com o mock. Um teste que
só provasse a recusa passaria à toa se o portão nunca abrisse.

**Artefacto desta sessão:** `_handoff/demo-formato-2026-08-09.html`
(sha256 `6bacb54806df2832993f30242f49f525d48e032ae45870dba4e7466db76ab91f`) — 14 lances reais,
ROM-sonda homebrew construída no repo, **zero assets Nintendo**. Seguro para galeria.
