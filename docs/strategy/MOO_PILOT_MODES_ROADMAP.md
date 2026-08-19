# Moo Pilot — modos de trabalho e alocação de GPU

> **Spec viva.** Actualizada em cima, não em append. Estado: **premissa refutada, roadmap
> reordenado.** Última medição: 2026-08-19, ledger de `mac-mini-de-paulo` (6783 recibos).

## 0 · O que isto é, e o que deixou de ser

Um vídeo sobre "o futuro do vibe coding" propôs cinco arquétipos — Prototyper, Builder,
Sweeper, Grower, Maintainer. A avaliação da origem está em
[The Archetype Audit](https://claude.ai/code/artifact/3bd4d12d-9ce5-4c74-be7b-e905668da0fc)
e resume-se a: **um post, de uma pessoa, sem dados**, e a expressão "vibe coding" nem sequer
aparece no original. A forma recorre (Cringely 1993 → Wardley 2015 → Cherny 2026), mas tudo
o que é medido nesta área — Anthropic, DORA, SPACE, DevEx — classifica **trabalho**, nunca
pessoas. Meyer et al. mediram o intervalo médio entre trocas de actividade: **0,3 a 2,0
minutos**. Nenhum rótulo colado a uma pessoa sobrevive a isso.

Daí saiu a proposta: um arquétipo não é um tipo de utilizador, é uma **ponderação sobre
pilares** — o dono diz uma palavra e a GPU ociosa muda de alvo.

**Essa proposta foi testada contra os dados desta máquina e a premissa não passou.**

## 1 · A medição que refuta a premissa

A ponderação por modo só vale se o rendimento **variar entre pilares**. Se todos rendem
igual, redistribuir a GPU só troca quais ficheiros recebem o mesmo rendimento.

| pilar | rondas | GPU (min) | citados | % citado |
|---|---:|---:|---:|---:|
| P1 | 1162 | 104 | 341 | 29,3% |
| P2 | 1093 | 98 | 372 | 34,0% |
| P3 | 1159 | 113 | 408 | 35,2% |
| P4 | 1056 | 94 | 372 | 35,2% |
| P5 | 1054 | 96 | 384 | 36,4% |
| P6 | 1109 | 100 | 326 | 29,4% |

Amplitude: **1,24×** entre o melhor e o pior. Isso é ruído, não sinal. Um optimizador de
alocação construído sobre esta distribuição não tem nada para optimizar.

E o número que importa mais do que qualquer um destes:

```
74 decisões de triagem  ->  72 descartadas · 1 aceite · 1 issue
```

**2,7% de aproveitamento**, e as duas decisões não-descartadas foram tomadas pelo Claude,
não pelo dono. O estrangulamento não é *qual pilar recebe GPU*. É que **97% do que sai é
ruído, em qualquer pilar**.

> Conclusão honesta: construir a ponderação por modo agora seria optimizar a distribuição
> de uma coisa que quase não tem valor. Trocaríamos 2,7% de aproveitamento num conjunto de
> ficheiros por 2,7% noutro.

## 2 · O que os dados dizem que é o verdadeiro gargalo

Precisão, não alocação. E há um detalhe utilizável: os **dois** achados que sobreviveram à
triagem vieram de P3 (`STRATEGY.md` — cronologia invertida entre doc e commit) e P6
(`README.md` — link truncado a meio da palavra `NOTICE.md`, no README **público**).

Ambos são da mesma família: **texto publicado que contradiz o estado real**. Nenhum é um
bug de lógica. Isso é uma pista sobre onde a GPU local é boa — comparar duas coisas que
existem — e onde não é: julgar se um caminho de código está errado.

## 3 · Roadmap revisto

Cada fase tem um **portão de medição**. Uma fase que não passa o portão não avança para a
seguinte; volta atrás ou morre.

### Fase A — porque é que 72 foram descartados *(bloqueia tudo o resto)*

O `triagem.jsonl` grava `decisao` e `nota`, mas a nota é texto livre e quase sempre vazia.
Sem uma **razão tipada**, a taxa de descarte é um número que não ensina nada.

- Acrescentar razões fechadas ao descarte: `nao-e-um-problema` · `ja-sabido` ·
  `fora-do-que-estou-a-fazer` · `citacao-certa-conclusao-errada` · `trivial`.
- O painel passa a mostrar a distribuição das razões, não só a contagem.
- **Portão:** ≥ 30 descartes com razão tipada. Sem isso, nada abaixo tem base.

Esta fase é a única que dá para decidir entre os dois futuros possíveis: se o motivo
dominante for `nao-e-um-problema`, o problema é a **pergunta**; se for
`fora-do-que-estou-a-fazer`, o problema é a **relevância** — e é aí, e só aí, que a
ponderação por modo se justifica.

### Fase B — a pergunta, medida contra si própria

Já há precedente: um A/B controlado sobre excertos idênticos baixou a taxa de ACHADO
de 82% para 28% só mudando o enunciado. Repetir isso com os pilares actuais, um de cada vez.

- **Portão:** o aproveitamento pós-triagem sobe acima de 10% em pelo menos um pilar.

### Fase C — ponderação por modo *(só se a Fase A apontar para relevância)*

`.mooter/modo.json`, uma palavra, zero chamadas a modelo. O default é peso igual — sem
ficheiro, nada muda. Detecção por aritmética do git (novos vs modificados, adições vs
remoções, retrabalho nas mesmas linhas), escrita em `modo.proposto.json`: **o painel propõe,
nunca comuta sozinho**, tal como `pilares.propostos.json` já faz hoje.

Os cinco nomes ficam como vocabulário; a **definição** de cada modo vem da mistura que a
Anthropic mede em 400 000 sessões (fixing 26% · building 25% · operating 17% · planning 14%).
Rótulo folclórico, definição medida.

- **Portão:** com modo activo, o descarte por `fora-do-que-estou-a-fazer` cai pelo menos
  para metade. Se não cair, a ponderação não serviu para nada e sai.

### Fase D — reparação autónoma *(requer autorização do dono)*

Quando o achado é mecânico e citado, a GPU propõe o **patch** em vez da frase. O patch só
chega à triagem se **compilar e a suite passar**. O que não se consegue aplicar morre na
máquina e nunca chega às mãos de ninguém.

- **Portão:** ≥ 20 patches propostos, com a taxa de aplicação medida.
- **Bloqueio:** muda o que o loop pode fazer dentro do repo sem perguntar. Não arranca sem
  o sim explícito do Paulo.

## 4 · O que já ficou feito (2026-08-19)

Não faz parte do roadmap acima — está em `main` e a correr.

- **O painel não compilava.** Uma plica por escapar matou o `<script>` inteiro. Três travas
  novas, sendo a primeira `new vm.Script(SCRIPT)`: sem compilar, nenhum outro teste de UI
  significa nada.
- **Custo por modelo** (`/custo.json`). A família Claude 5 não existia em `pricing.js` —
  `claude-opus-5` era 98,7% dos turnos e caía no fallback de Sonnet. Os mesmos 7 dias:
  $16,52 ao preço errado, $27,53 ao verdadeiro.
- **O poço deixou de secar.** Memória de revisão por pilar + âncoras por padrão:
  19 337 → 267 353 linhas; 604 → 3 274 janelas por rever.
- **`uncited` deixou de mentir.** 209 dos 275 nunca chamaram o modelo. Passou a 66 reais e
  256 em `nada-por-rever`, retroactivamente e sem reescrever o ledger.
- **P9 e P10**, as duas primeiras perguntas que não procuram um defeito.

## 5 · Riscos assumidos

- **A amostra é uma máquina e um repo.** Tudo acima descreve `mac-mini-de-paulo` sobre
  `~/frugal`. Não é uma lei do produto.
- **1,24× pode ser ruído nos dois sentidos.** Com poços agora 14× maiores, a distribuição
  de rendimento por pilar muda e tem de ser **re-medida** antes da Fase C.
- **A Fase A depende do dono triar.** Das 74 decisões, 72 são descartes e as duas úteis
  foram do Claude. Sem triagem humana, a Fase A não produz o dado que precisa.

## 6 · Fontes

Origem dos arquétipos, prior art, estudos medidos e contraprova: ver o artefacto ligado no
§0. Medições desta página: `~/.mooter/runner-ledger.jsonl` (6783 recibos) e
`~/.mooter/triagem.jsonl` (74 decisões), lidos a 2026-08-19.
