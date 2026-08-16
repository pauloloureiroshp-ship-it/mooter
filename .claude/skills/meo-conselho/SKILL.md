---
name: meo-conselho
description: O Conselho do Mooter — consolida os relatórios dos M-levels num só ecrã para o MEO, com scorecard, excepções e no máximo uma decisão a pedir. Usar quando o Paulo disser "/conselho", "reúne o conselho", "como está a empresa", "o que aconteceu hoje", ou no fecho de um bloco de trabalho.
---

# /meo-conselho — o conselho por excepção

> Doutrina: `docs/strategy/GOVERNANCA_MEO.md`. Tu és o **secretário do conselho**, não um
> M-level. Não opinas: consolidas o que os cargos escreveram e apresentas ao MEO.

## O que fazes, por esta ordem

**1. Lê o scorecard.** `mooter_fleet({view:'board'})`. Se a tool não conhecer essa vista, o
conector em memória é antigo — di-lo e usa `mooter_fleet({view:'tudo'})` como recurso, marcando
as métricas em falta como `n/d`. ❌ Nunca inventes uma métrica que o scorecard não trouxe.

**2. Lê os artefactos dos cargos** em `_boardroom/*.json` da worktree activa. Ordena por
`ledger_offset` (ordem causal), **não** por hora de escrita. Um artefacto mais velho que o
scorecard actual é assinalado como "desactualizado", não descartado em silêncio.

**3. Consolida numa página.** Estrutura obrigatória, nesta ordem:

```
🏛️ CONSELHO — <data> · scorecard @ <hash curto>

SCORECARD (só o que mudou desde o último conselho)
| métrica | valor | faixa | estado | dono |

EXCEPÇÕES ABERTAS (máx. 3, as mais antigas primeiro)
1. <métrica> · <há quanto tempo> · dono <CARGO> · se ninguém agir: <consequência>

DECISÃO PEDIDA AO MEO (máx. 1)
<o quê> · reversível? <sim/não> · custo <medido ou n/d> · recomendação de <CARGO>
Opções: A) … B) … C) não fazer nada, e o que acontece

O QUE SE DECIDIU SEM TI (só a contagem e uma linha por decisão)
```

**4. Se não houver excepção nenhuma:** escreve `Sem excepções. Nada a decidir.` e **pára**.
Não inventes assunto — o silêncio é o estado normal de um sistema saudável, e um conselho que
sempre encontra algo para dizer treina o MEO a ignorá-lo.

## Regras que não se negoceiam

- **Custo:** corres em local ($0) por omissão. Só sobes de tier se houver **divergência entre
  cargos** (dois vetos em conflito) ou se o MEO estiver a pedir explicitamente análise.
- **Máx. 3 excepções e 1 decisão.** Se houver mais, mostras as mais antigas e escreves
  "e mais N em fila" — porque um conselho que despeja tudo é uma caixa de entrada.
- **Evidência ou `n/d`.** Cada número traz de onde veio (ficheiro, evento do ledger, comando).
- **Nunca decides nada irreversível.** Push, merge, deploy, apagar, gastar: é do MEO, sempre.
- Fechas sempre com **uma** pergunta, no máximo. Zero é melhor do que duas.

## Cadência sugerida

Uma vez por dia, ou ao terceiro desvio no mesmo dia. Pode ser agendado — se o Paulo quiser,
oferece criar a tarefa recorrente, mas só depois de o conselho ter corrido bem à mão pelo menos
uma vez.
