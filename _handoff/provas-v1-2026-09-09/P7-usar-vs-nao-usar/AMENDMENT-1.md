# P7 · AMENDMENT-1 — a corrida 1 saiu INVÁLIDA por limite de sessão; a experiência recomeça com ledger novo

**Escrito e commitado ANTES da corrida 2 produzir qualquer número.** Nenhum valor do pré-registo muda.

## O que aconteceu

A corrida 1 arrancou às 2026-09-09T14:51:04Z e escreveu **46 braços** (23 tarefas × 2). Nos últimos três, o CLI devolveu `is_error` com a mensagem literal:

```
You've hit your session limit · resets 5pm (America/Sao_Paulo)
```

Braços afectados: **`t22-11f81c79b7` ON**, **`t23-1b929f35f1` OFF**, **`t23-1b929f35f1` ON**. O controlador marcou-os `invalido: true` com `motivo: cli_is_error:…`, imprimiu **`R-24 · ENSAIO INVÁLIDO`** e saiu com 1 no `--correr` e no `--analisar` (2026-09-09T17:09:30Z).

Isto é exactamente o que o pré-registo prevê: `run_invalido.definicao` lista **«is_error do CLI»** como corrida inválida (por oposição a `nao_e_invalido: timeout — é falha observada, TVA = 1800`). Não é derrota nem vitória: é ausência de medição em 3 dos 46 braços, e com 20 pares válidos de 23 o `analisar` não chega ao veredicto (exige `pares_validos = n = 23`).

## O número que a corrida 1 chegou a imprimir — e porque NÃO é o resultado

O `--analisar` da corrida 1 imprimiu, antes de recusar: `X=16 · n=23 · limiar=16 · p=0.04657 · potência=0.80370 · pares válidos: 21 · inválidos: 2`. Escrevo-o aqui porque está no log preservado e qualquer pessoa o recalcula a partir do ledger — esconder um número que existe seria pior do que o problema.

**Não é o resultado, por três razões, e nenhuma delas é conveniência:** (1) o próprio controlador recusou-o (`ENSAIO INVÁLIDO`, exit 1) porque `pares_validos` 21 ≠ `n` 23; (2) o limiar 16 foi calculado para **23** pares — 16 em 21 não é o mesmo teste, e aceitar 16/21 é exactamente a «correcção honesta» que o pré-registo bloqueia por escrito; (3) os 2 pares em falta são `t22` e `t23`, que ninguém sabe como teriam caído. O número publicado é o da corrida 2, ponto.

## Porque é que não se repetem só os 3 braços

O pré-registo é explícito: «um par (task_id, braço) já escrito **nunca se repete** — repetir seria escolher qual das medições conta» (`ledger.nota`), e o executor congelado impõe-no mecanicamente (`jaFeitos()`: qualquer linha `tipo: braco` já no ledger, válida ou inválida, é «feita»). Um `--correr` sobre o mesmo ledger não faria nada.

## O que se faz, e porquê é legítimo

A `nota_estado` do pré-registo manda: «Se mudar, a experiência **recomeça** e isso fica escrito no relatório.» Então:

1. **A corrida 1 fica preservada e publicada**, inteira, como corrida inválida: `results/ledger-corrida-1-invalida.jsonl` (46 braços) e `results/correr-corrida-1-invalida.log`. Nada se apaga.
2. **A corrida 2 começa com o ledger vazio** no caminho do pré-registo, com os mesmos ficheiros congelados, a mesma seed, a mesma atribuição, o mesmo limiar (16/23) e o mesmo executor. Todos os 23 pares voltam a correr.
3. **O veredicto vem só da corrida 2.** Os 20 pares válidos da corrida 1 **não** entram no número publicado — usá-los seria escolher medições. Ficam disponíveis, rotulados como exploratórios, para quem quiser comparar.

O que isto **não** é: não é afrouxar o critério depois de ver resultados. O `n` continua 23 e o limiar 16 (o próprio executor recusa correr se o limiar recalculado não bater com o pré-registado — é a armadilha que o comentário do controlador descreve: baixar `n` para 20 «por causa de 3 pares inválidos» transformaria um X = 15 de PERDEU em GANHOU, e está bloqueado).

## Pré-condições verificadas antes da corrida 2

`r24-diagnostico.mjs` a 2026-09-09T19:11Z: pré-registo CONGELADO e fechado sobre si próprio, limiar recalculado 16 = pré-registado, 23 tarefas (12 ON-primeiro / 11 OFF-primeiro), terminal fora de sessão Claude Code, executável 2.1.224, **sonda ao modelo 2 146 ms · 2 tokens de entrada** (o limite de sessão caiu; o dono comprou créditos), router pinado bate com o pré-registo, sem outra instância a correr. Veredicto: `--correr pode arrancar`.

## O que fica dito no cartão, seja qual for o resultado

Que a primeira tentativa morreu por limite de sessão do fornecedor às 46/46 linhas e 20/23 pares válidos, e que o número publicado é o da segunda.
