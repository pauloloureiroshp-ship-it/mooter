# CRÍTICA AO MOOTER — UX, UI E COERÊNCIA EM TEMPO REAL

**Gerado:** 2026-07-31 · conector v1.32.0 instalado · medições tiradas do produto a correr
**Regra:** cada crítica traz o número que a fundamenta. Onde não medi, digo.

---

## 1. A INCOERÊNCIA MAIS CARA — três superfícies, três respostas

**Pergunta:** *quanto do meu trabalho corre na GPU local?*
É a pergunta que define o fosso do produto. Foram feitas três chamadas ao mesmo conector, no mesmo dia:

| Superfície | Responde | Denominador que usa |
|---|---|---|
| `view=board` (11:48) | **27,27%** | 3/11 jobs **concluídos no ledger inteiro** |
| `view=recibo` (11:09) | **40%** | jobs concluídos **na janela de 24 h** |
| `view=jobs` → `totais.local_share` | **n/d** | baseado em **tokens medidos**, não em contagem de jobs |

Cada um está tecnicamente certo. **Os três juntos são inúteis** — o utilizador não sabe em qual acreditar,
e a métrica que define o produto fica sem número de referência.

O mesmo padrão na cobertura de custo: **board diz 30%**, **advogado do diabo diz 27%**.

> **Acção (P-C1):** uma única função canónica `fatiaLocal()` com denominador declarado, consumida pelas
> três vistas. Quem quiser outro recorte pede-o explicitamente. Hoje cada vista tem a sua aritmética.

---

## 2. A PERGUNTA CERTA JÁ ESTÁ RESPONDIDA — e ninguém a vê

O board calcula isto:

```json
"pode_ir_dormir": { "valor": false, "porque": "3 métrica(s) fora da faixa" }
```

**É exactamente a pergunta do utilizador** — *posso sair do PC?* — e está enterrada no fim de um payload
de 6,5 KB, numa vista que ninguém abre por hábito.

Pior: o painel ao vivo que acabei de construir responde **"podes sair"** quando há jobs a correr sem
stall, enquanto o board diz **`pode_ir_dormir: false`**. **Duas superfícies dando conselhos opostos sobre
a mesma decisão.** A culpa é minha: o artifact usa `view=jobs`, que não traz este campo.

> **Acção (P-C2):** `pode_ir_dormir` sobe ao topo de todas as vistas e passa a ser o título do painel.
> O artifact passa a cruzar `jobs` + `board`.

---

## 3. O PRODUTO ESTÁ A ESTRANGULAR-SE COM UM NÚMERO QUE ADMITE SER INVENTADO

```
pressao_quota: 1  (fora da faixa [0, 0.85])
porque: "peso de 6606 na semana contra uma referência de 4000 …
         A referência é ajustável — não é um limite publicado."
```

Consequência medida, visível em cada dispatch de hoje:

```
calibragem_por_quota: { politica: "local-primeiro", nivel: "critico",
                        pressao: 1, tecto: "haiku" }
```

**Tudo é forçado para o tecto `haiku` por causa de um número que o próprio sistema declara não ser
medido.** E há um segundo problema por baixo: **todas** as faixas do scorecard trazem
`faixa_origem: "default MEO M1 — não é um valor medido"`. As 12 métricas são julgadas contra limiares
por omissão que ninguém calibrou.

O resultado é um sistema que está permanentemente "em crise" — e um utilizador que aprende a ignorar
o alarme. **Um alarme que toca sempre é ruído, não sinal.**

> **Acção (P-C3):** calibrar a referência de quota com dados reais (temos 302 eventos no ledger), ou
> declarar a métrica `n/d` até haver base. Um limiar inventado que muda o routing é pior que nenhum.

---

## 4. UX DA THREAD — o que o utilizador vê realmente

| Problema | Medido |
|---|---|
| **O titular mente sobre falhas** | Testado hoje: um job cujo agente respondeu "NÃO CONSIGO VERIFICAR" fechou com `done:1, failed:0` e resumo **"🐮 feito"**. Corrigido no código, **ainda não empacotado** |
| **Nenhuma vista responde "e agora?"** | O `advogado_do_diabo` gera os próximos passos, mas vive no fim do `view=recibo` |
| **O utilizador tem de saber os nomes das vistas** | `tudo · board · afericao · recibo · jobs · pastas · sessoes · plano` — oito, sem indicação de qual serve para quê |
| **Nada avisa quando algo acaba** | O Cowork não tem notificação. O utilizador tem de perguntar. O artifact resolve metade (mostra), não a outra metade (avisa) |
| **Zero animação de progresso real** | O `steps_total` vem `null` nos jobs cloud — *"a contagem de chamadas de ferramenta mede o passo actual, mas não fornece um total fiável"*. Barra indeterminada é o máximo honesto hoje |

---

## 5. OS `n/d` QUE MAIS DOEM

Contados no board de 11:48 — **4 de 12 métricas** sem valor:

| Métrica | Porquê está n/d | Dói porque |
|---|---|---|
| `keep_rate_pct` | *"ainda não existe commit seguinte ao job"* | é a métrica de QUALIDADE. Sem ela, só medimos velocidade e custo |
| `custo_total_usd` | 7 de 10 entregas sem custo | o "cost breakdown" é o argumento de venda do concorrente |
| `cobertura_custo_pct` | 30% | a régua "custo por resposta certa" mede sobre um terço da frota |
| `local_share` | *"6 jobs sem tokens de saída medidos"* | é o fosso, e não tem número |

**O padrão:** o Mooter é honesto sobre o que não sabe — e isso é genuinamente raro e valioso. Mas
**quatro n/d nas métricas que definem o produto** transformam honestidade em impotência. Honestidade
sem cobertura é um relatório de tudo o que não conseguimos medir.

---

## 6. O QUE ESTÁ GENUINAMENTE BEM (e não deve ser mexido)

Ser crítico não é ser negativo. Isto está acima da média do mercado:

- **Todo valor traz `porque`.** Não conheço concorrente que faça isto.
- **`faixa_origem` admite que o limiar é default.** É desconforto voluntário — raríssimo.
- **A truncagem declara-se** (`contexto_truncado`, `⚠️ X foi cortado (N de M linhas)`).
- **`veredictoSemEvidencia`** carimba o texto do agente com um aviso quando não houve evidência. Disparou
  hoje, correctamente.
- **`cargo_porque: "declarado por quem disparou; nunca inferido do texto"`** — recusa adivinhar.
- **O guarda de bundle** apanhou-me a adicionar um `require` sem o empacotar. Salvou uma instalação partida.

---

## 7. PRIORIDADES — o que atacar, por ordem de dor

| # | O quê | Porquê primeiro |
|---|---|---|
| **P-C1** | Uma função canónica para a fatia local | três números para a mesma pergunta destrói a confiança em todos |
| **P-C2** | `pode_ir_dormir` como título de todas as vistas | é a pergunta do utilizador, já calculada, invisível |
| **P-C3** | Calibrar a referência de quota (ou pô-la n/d) | está a forçar todo o routing para `haiku` com um número inventado |
| **P-C4** | Empacotar o fix do "🐮 feito" | está corrigido no código e ainda não chegou ao conector instalado |
| **P-C5** | Fechar a cobertura de custo | J-1 do Codex já calcula por tokens×tabela; falta empacotar |
| **P-C6** | Medir o keep rate | exige commit depois do job — é a única métrica de qualidade que temos |

**As três primeiras são de coerência, não de funcionalidade.** Nenhuma acrescenta uma feature; todas
fazem o produto parar de se contradizer. **Um cockpit que dá três respostas à mesma pergunta é pior
do que um cockpit com menos mostradores.**
