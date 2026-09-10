# O que está nesta pasta, e o que cada ficheiro é

O P7 teve três arranques falhados e três corridas com nome. Nada se apaga, e por isso a pasta tem mais números do que veredictos. Isto diz qual é qual.

| Ficheiro | O que é | Vale como resultado? |
|---|---|---|
| `ledger-corrida-1-invalida.jsonl` · `correr-corrida-1-invalida.log` | Corrida 1 (14:51:04Z–17:09:30Z), 46 braços, 3 inválidos, **21/23 pares válidos**. Morreu no limite de sessão do fornecedor | **Não.** O controlador imprimiu `ENSAIO INVÁLIDO` e saiu com 1. Ver `AMENDMENT-1.md` |
| `ledger-corrida-2-invalida.jsonl` · `correr-corrida-2-invalida.log` | Corrida 2 (19:12:29Z–19:34:00Z), 46 braços, 45 inválidos, **0/23 pares**. Mesmo limite, mesma janela | **Não.** Ver `AMENDMENT-2.md` |
| `correr-corrida-3-arranque-falhado-EPERM.log` | Arranque que caiu a apagar um snapshot antigo, **0 braços escritos** | **Não é corrida nenhuma.** Nenhuma medição foi feita nem descartada |
| `analysis-instantaneo-parcial-corrida-1-NAO-E-RESULTADO.json` | Instantâneo do `analyse.mjs` tirado **a meio da corrida 1**, às 16:32:35Z, quando o ledger tinha 33 dos 46 braços: `X = 11`, `pares válidos 16`, `p = 0,661` | **Não, e é o ficheiro mais perigoso da pasta.** Não é o número do controlador (`X=16 · p=0,04657`), não é o ledger inteiro, e a corrida a que pertence foi declarada inválida. Chamava-se `analysis.json` e não dizia nada disto — quem abrisse a pasta encontrava um terceiro conjunto de números sem explicação. Foi renomeado a 2026-09-09 |

**Como re-derivar:** `node ../analyse.mjs` lê `results/ledger.jsonl`. Esse nome está vazio de propósito — o leitor não escolhe corrida por ti. Copia para lá o ledger da corrida que queres reler e corre. Se o ficheiro não existir, o leitor diz-te isso e lista as corridas preservadas, em vez de rebentar.

**O número que conta** é sempre o do controlador congelado (`--analisar`, no log da corrida). O `analyse.mjs` é um leitor independente e serve para o confirmar ou desmentir. Se os dois discordarem, publica-se a discordância.
