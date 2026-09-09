# Bruto resgatado de pastas temporárias — P1

Dois números publicados neste cartão vinham de um `decisions.log` dentro de um `%HOME%` isolado e efémero (`%TEMP%/provas-p1-hook-home-*`), citado por caminho absoluto em `results/A-hook.json` e apagável pelo sistema operativo a qualquer momento. Copiados para aqui a 2026-09-09T20:29Z. É o defeito **D13**.

| Ficheiro | Origem | Sustenta |
|---|---|---|
| `decisions-home-isolado-pvOIjr.log` (311 linhas) | `%TEMP%/provas-p1-hook-home-pvOIjr/.claude/tools/router/decisions.log` | `option_a_miss: 75` — a «pré-resposta local que expirou 75/75» |
| `decisions-home-isolado-amve3i.log` (127 linhas) | o segundo home isolado da mesma prova | a corrida irmã |
| `nettap-A-hook.jsonl` (205) · `nettap-A-spawn.jsonl` (64) · `nettap-A-inproc.jsonl` (1) | `%TEMP%/provas-p1-nettap/` | o *tap* v1 desta prova — o que **não** registou ligação nenhuma |

Os três `nettap-*.jsonl` já tinham cópia em `results/`; ficam aqui também, ao lado da origem, porque é a origem que o `A-hook.json` cita.

**Nota sobre o tap v1.** Estes ficheiros são a prova do ponto que o cartão faz contra si próprio: 270 eventos `tap-loaded` e **zero** registos de ligação, numa corrida que lançou 25 filhos para o Ollama e 63 para a porta 7821. O instrumento desta versão só escrevia ao **fechar** o socket. A versão seguinte (commit `5efd58ed`, usada pelo P5) escreve na abertura e regista as ligações — ver `P5-atestacao-de-egress/results/bruto-resgatado/`.
