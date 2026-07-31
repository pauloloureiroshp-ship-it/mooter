# VALIDAÇÃO DA v1.32.0 EM PRODUÇÃO — 2026-07-31

**Conector:** v1.32.0 instalado (41/41 ficheiros) · backup `~/.mooter/backup-1.29.1-1785495984716`
**Commit:** `a157c09` · bundle sha256 `73157b78…bf58`
**Método:** cada verificação corrida contra o conector **instalado**, não em bancada.

## VEREDICTO: 🟡 GO COM UMA RESSALVA

Três das quatro entregas comportam-se em produção como nos testes. **Uma está incompleta — e foi
apanhada pelo próprio mecanismo que ela introduz.**

| # | O quê | Veredicto |
|---|---|---|
| V1 | Conector arranca em 1.32.0 | ✅ **PASSA** — 6/6 verde |
| V2 | Dieta de payload | ✅ **PASSA** — e a garantia crítica aguentou |
| V3a | `sessao.id` (multi-projecto) | ✅ **PASSA** |
| V3b | `handoff_from` | 🔴 **FALHA PARCIAL** — aceite pelo schema, **conteúdo não injectado** |
| V4 | Contexto + advogado do diabo | ✅ **PASSA** |
| V5 | Bateria de não-regressão | ⏳ por correr |

---

## V1 · Arranque

```
🐮 diagnóstico · 6/6 verde
🟢 GPU — NVIDIA GeForce RTX 4090 · com folga
🟢 Modelo local (Ollama) — qwen3.6:27b
🟢 Vault Obsidian · 🟢 Router (classify.js) · 🟢 CLIs · 🟢 Live Preview
versao_instalada: "1.32.0"
```

---

## V2 · Dieta — a garantia crítica aguentou

**O que mais importava não era o tamanho.** Era saber se a compactação tinha comido as excepções de
cargos parados. Hoje MOO, MFO e MEO estão todos **sem trabalho na janela E fora da faixa**.

Resultado em produção — as três sobreviveram, com a justificação certa:

```json
{"cargo":"MOO","sem_trabalho":true,"porque":"nenhum trabalho deste cargo na janela",
 "excepcoes":[{"metrica":"trabalho_zero_pct","dono":"MOO", …}],
 "excepcoes_porque":"excepção aberta num cargo sem trabalho na janela —
                     preservada porque um cargo parado pode estar fora da faixa"}
```

Os 7 cargos continuam na lista. Cada um continua a dizer zero e porquê.

### Sobre o número — e porque não repito os 43,8%

Em bancada mediu-se **−43,8%**. Em produção **essa comparação não é honesta**, e digo porquê:
o recibo da v1.32.0 **acrescentou o bloco `contexto`** (≈2,5 KB), que não existia na v1.29.1.

| | Conteúdo |
|---|---|
| v1.29.1 (~11 KB) | 8 blocos de cargo gordos, sem contexto |
| v1.32.0 compacto | 6 blocos compactos + 2 completos + **contexto + advogado do diabo** |
| v1.32.0 `verbose:true` | 8 blocos completos + contexto |

**Medição exacta do que a dieta poupa:** bloco de cargo vazio **935 B → 300 B (−68%)**, contado
directamente. Com 6 cargos parados, são **≈3,8 KB poupados** — e ≈2,5 KB reinvestidos em contexto útil.

**A leitura honesta: o ganho não é em bytes totais, é em informação por byte.** Trocámos zeros
repetidos por o que estava a acontecer, onde, e o que perguntar a seguir.

---

## V3a · Multi-projecto — o slot único morreu

```
mooter_setup({sessao:"registar", id:"mooter",       projecto:"Mooter"})
mooter_setup({sessao:"registar", id:"cloude-home",  projecto:"Cloude Home"})
mooter_setup({sessao:"listar"})
→ [{"id":"cloude-home","projecto":"Cloude Home",…},
   {"id":"mooter","projecto":"Mooter",…}]
```

**Dois estados distintos.** Antes só existia `actual` e `listar` nunca podia devolver mais de uma
entrada. É o primeiro tijolo real do multi-projecto (P9).

---

## V3b · Handoff — 🔴 entrega incompleta, apanhada em directo

**O teste:** kimi produz na nuvem → moo verifica a $0.

```
mooter_work({goal:"…", agent:"kimi", wave:"V3-handoff"})   → job-ms8uecdj-c038 · 25 s · 468 tok
mooter_work({goal:"o anterior procede?", agent:"moo",
             handoff_from:"job-ms8uecdj-c038"})            → job-ms8uf4ma-0938 · 24 s · $0
```

**Resposta do moo:**
> `NAO PROCEDE`
> `O texto de referência não foi incluído na mensagem.`
> `Sem o conteúdo original, é impossível validar a distinção técnica solicitada.`

### O que isto significa

| Camada | Estado |
|---|---|
| Schema aceita `handoff_from` | ✅ chegou ao bundle |
| Ledger regista a origem | ✅ |
| **Corpo do job anterior injectado no prompt** | ❌ **não acontece** |

**Causa provável:** a injecção (`seamless.js:1338-1367`, bloco `## ⇄ PREPARADO PARA TI POR`) só corre
no ramo `if (chain && agent === 'moo')` — a cadeia automática moo→nuvem. Um `handoff_from` vindo de
fora regista a proveniência mas não cola o texto.

**A falha é minha, e é de rigor:** o teste D13 verificava que o parâmetro **existia no schema**, não
que o conteúdo **passava por ele**. Testei a porta, não o que atravessa a porta.

**A ironia que vale registar:** o handoff nuvem→moo funcionou perfeitamente como **mecanismo de
verificação** — apanhou o próprio bug do handoff, em 24 segundos, a **$0**. É exactamente a tese do
produto a provar-se enquanto falha.

**Acção:** J-5b — fazer a injecção correr para qualquer `handoff_from`, com teste que valide o
**conteúdo** do prompt, não a presença do parâmetro.

---

## V4 · Contexto e advogado do diabo — passa

O bloco `contexto` apareceu completo e correcto.

**O que sabe (derivado do ledger):** 6 pastas, 7 waves, 3 agentes (`codex`, `kimi`, `moo`).
**O que leu do disco:** 1 nota no vault — `30-learnings/mooter-session-2026-07-30.md`.
**O que não sabe, com motivo:** `projecto`, `sessao_id`, `conversa_do_host`, `pull_requests` — todos
`n/d` com a razão escrita. Nenhum vazio, nenhum zero fabricado.

**As 4 perguntas geradas, todas com facto:**

| Pergunta | Facto que a fez nascer |
|---|---|
| "Com 11 de 15 jobs sem custo, essa régua ainda mede alguma coisa?" | cobertura de custo: **27%** |
| "Com 40% do trabalho local, o diferencial está a operar ou só a ser afirmado?" | **40%** dos concluídos no moo |
| "O prep em série está a pagar-se, ou só a adicionar latência?" | prep-timeout em 4 jobs, **nomeados** |
| "Qual excepção é causa e qual é sintoma?" | donos: MEO, MOO, MFO |

Zero perguntas sem facto. O regime de regras funciona.

⚠️ **Nota desconfortável e correcta:** o advogado do diabo do próprio produto está a apontar para as
pendências P2 e P3 do master prompt. A ferramenta concorda com o diagnóstico.

---

## Achados novos desta validação

| # | Achado |
|---|---|
| 1 | **`handoff_from` não injecta conteúdo** — schema aberto, implementação a jusante em falta |
| 2 | O guarda `veredictoSemEvidencia` **disparou** no kimi sem contexto (⚠️ VEREDICTO NÃO VERIFICADO no corpo) — **mas o titular continua a dizer "🐮 feito"** com `failed: 0`. O LH-2 continua vivo no cabeçalho |
| 3 | `verificacao_cruzada` continua `pendente` / `null` — o cross_check **ainda não correu** (P2 por resolver) |
| 4 | Cobertura de custo **caiu para 27%** (11 de 15 jobs sem custo). O patch J-1 do Codex corrige isto e ainda não foi aplicado |
| 5 | Trabalho local em **40%** — abaixo da faixa [50,100] |

---

## Próximo passo imediato

1. **P1** — aplicar os 3 patches do Codex (J-1 fecha o achado 4; J-2+J-3 ataca o achado 2; J-4 ataca o 3)
2. **J-5b** — injecção do handoff para qualquer direcção, com teste de conteúdo
3. **V5** — bateria de não-regressão contra o baseline de 31/07
