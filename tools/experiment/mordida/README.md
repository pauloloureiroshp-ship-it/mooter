# mordida/ — as baterias de mutação (prova de que os testes mordem)

Cada script aplica UMA mutação de cada vez a um módulo do kit, corre os testes afectados,
regista que testes ficaram vermelhos, e restaura o ficheiro (verifica no fim que os bytes são
idênticos ao original). Uma mutação que não põe nenhum teste vermelho é um teste que não
guarda nada — `feedback_guarda_sem_teste_de_mordida`.

| Script | Emenda | Módulos mutados | Resultado registado |
|---|---|---|---|
| `morde-amend001-a1.mjs` | AMENDMENT-001 · A1 | closeout.mjs | 8/8 |
| `morde-amend001-a3.mjs` | AMENDMENT-001 · A3 | closeout.mjs, scores.mjs, freeze.mjs | 9/9 |
| `morde-amend001-a5.mjs` | AMENDMENT-001 · A5 | import.mjs | 7/7 |
| `morde-amend001-registo.mjs` | AMENDMENT-001 · registo/A4 | closeout.mjs | 6/6 |
| `morde-amend001b.mjs B1\|B2\|B3\|B4` | AMENDMENT-001b | closeout.mjs, scores.mjs, freeze.mjs, effort.mjs | 4/4 · 5/5 · 4/4 · 5/5 |
| `morde-amend001c.mjs` | AMENDMENT-001c · C1 | journal.mjs, closeout.mjs | 3/3 |

Correr a partir de qualquer directório: `node tools/experiment/mordida/morde-amend001b.mjs B2`.
O relatório JSON vai para `$MORDIDA_OUT` ou `<tmpdir>/prisma-mordida/`. Os scripts nunca fazem
commit nem tocam noutro ficheiro além do mutado; se um alvo deixar de existir (o código mudou),
imprimem «ALVO NÃO ENCONTRADO» — é o sinal para actualizar a mutação, não para a apagar.

A parte mecânica da AMENDMENT-001 (constante de 20 · sha ignorado · pin removido) foi mutada à
mão na sessão de 2026-09-17 e está descrita no registo (`amendments/AMENDMENT-001.json`,
item A4) e no annex `AMENDMENT-001-applied.json`. As baterias dos passos 1–4 (antes das
emendas) foram entregues nos handoffs de cada passo e reproduzidas no annex do ZIP
`cc-p1-20260917-v1` (`annex/mordida/`); alguns dos seus alvos já não existem depois das
emendas — ficam como registo histórico, não como prova viva.
