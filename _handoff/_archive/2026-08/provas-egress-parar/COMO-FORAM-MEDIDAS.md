# Como estas provas foram medidas (e por quem)

**Quem escreveu o código:** codex (`job-msyjo1n2-ca24`), sandbox sem `spawn` — **nunca correu um teste**.
**Quem correu os testes:** Cowork, num clone real do branch em **Linux + Node 22.22.3** — o mesmo ambiente do `ubuntu-latest` do CI, não o Windows/Node 24 da máquina do dono.

A separação é deliberada: quem escreve não declara verde. Um PASS que o autor não viu seria a quinta
instância do viés que este trabalho existe para matar.

## Bancada
`git clone --depth 1 --branch claude/slack-spike-masterprompt-82c108 file://<repo>` e depois substituir
`packages/slack-spike` pela worktree. Precisa de ser um CLONE e não um `git archive`: dois testes
(`daemon.test.js:86` e `guardas.test.js:104`) leem `git check-ignore` e o `SYNC.md` da raiz, e numa
árvore sem `.git` dão vermelhos falsos. Aprendido à força hoje.

## Resultados

| Prova | Antes | Depois |
|---|---|---|
| Suite `packages/slack-spike` | 251 pass / 0 fail | **276 pass / 0 fail** (+25 testes) |
| ALTO 1 · payload hostil do auditor | `publicado: true`, **7 canários** | `publicado: false` · `hash_esperado fora da forma verificavel` |
| ALTO 1 · variante decorativa (hash real) | — | `publicado: true` · **canários: null** · `degradados: ["wave","autor"]` |
| ALTO 2 · Parar no caminho real | `botao_parar: false` | teste **T3** verde na bancada real |
| MÉDIO · fecho recusado pelo Slack | perdia-se | teste **T5** verde |

`degradados` viajar no retorno é o ponto: **degradar em silêncio não seria degradar**.

## Uma correcção que o VERIFICADOR fez, e porquê

`esquema.test.js` falhava em `reconstrucao nao partilha referencias`. Causa medida: a fixture da casa
`U_PAULO` (57 ocorrências em 10 ficheiros) **não é uma forma possível de id do Slack** — o underscore
não existe em ids `U…`. O id REAL do dono, medido no `.env`, tem 11 chars e casa com `FORMA_DE_ACTOR`.
Logo a regra estava certa e a fixture é que era ficção.

Não dobrei o teste para passar: reforcei-o. Passa a provar as duas metades — a forma realista sobrevive,
a impossível degrada fail-closed.

## ⚠️ Dívida que fica registada

As outras **56 ocorrências de `U_PAULO`** continuam a exercitar uma forma que não pode acontecer em
produção. É primo do mesmo viés: um teste que passa sobre uma entrada que a realidade nunca produz.
Não foi corrigido aqui (fora do âmbito, e 57 substituições mecânicas merecem uma frente própria).


## Correcção do número (CC, 2026-08-18)

A tabela dizia **270**. São **276**. O TAP guardado é genuíno e completo — descreve é um
estado ANTERIOR desta mesma worktree: 270 + 7 testes novos − 1 renomeado = 276, conferido
nome a nome contra `egress-parar-GREEN-suite.txt`. **Não é diferença de plataforma.**

Cuidado ao repetir a conferência: o TAP escapa `#` como `\#`, e todos os testes `kimi #N`
o têm. Uma comparação ingénua diz que faltam 19 testes e sobram 13 — é artefacto, não achado.

Verificado também que não há testes declarados-e-não-corridos: 276 `test()` nos ficheiros,
276 reportados pelo runner, 0 skipped, 0 todo. (O `O-QUE-FALTA-CORRER.md` fala de 289
declarações estáticas; essa contagem não bate com os ficheiros.)

⚠️ E o mais importante: o `O-QUE-FALTA-CORRER.md` declara `n/d` nos gates executáveis
(«nenhum node --test foi executado nesta retoma»). **A execução 276/276 do CC é a única
evidência de execução que existe para esta árvore.**
