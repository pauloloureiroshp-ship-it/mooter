# BRIEF X5 — os dois gates que ainda dependem de alguém se lembrar

Duas lacunas conhecidas e nenhuma delas é código novo: são gates que existem
mas não estão no caminho de ninguém.

---

## S1 — `sync:check` no CI, com a ressalva certa

O `npm run sync:check` já existe e já é honesto (a máscara do HEAD resolveu o
paradoxo auto-referencial). Só que **não corre em lado nenhum**.

- Acrescentar um passo ao workflow de CI existente em `.github/workflows/`
  (ler primeiro o que lá está — **não criar um workflow novo** se houver um
  onde isto encaixa).
- **A ressalva que tem de ficar escrita no próprio passo:** o `--check` só
  estabiliza com a frota parada, porque o SYNC.md inclui estado lido ao vivo do
  ledger. No CI não há frota nem ledger local — por isso o passo deve correr
  contra um ledger **de fixture**, não contra `~/.mooter/ledger.jsonl`.
  Se isso não for possível de forma limpa, **não forçar**: escrever o porquê e
  deixar o passo como `continue-on-error` documentado, em vez de um gate que
  toda a gente aprende a ignorar por ser instável.
- Um gate que dá falsos vermelhos é pior do que gate nenhum: acaba desligado, e
  um guarda desligado não guarda nada.

## S2 — A barra tem provas estáticas; falta a de comportamento

Hoje o `entrega.test.js` prova que a string `eta-track` existe no HTML. Isso é
o **nível 2** (conteúdo). Falta o **nível 3**: que o modelo produz de facto as
classes certas para cada estado.

Reparar que **não é preciso um browser**. O `etaBarModel()` vive em `fleet.js`
e é uma função pura sobre o bloco `estimativa` — dá para testar directamente.

Em `packages/mooter-bridge/barra.test.js` (já existe — **estender**, não criar
outro ficheiro), provar, com `estimativa` injectada à mão:

1. `falta_s` nulo ⇒ modelo **indeterminado**, e **sem** `fill_pct` — nunca 0;
2. percentil abaixo de 50 ⇒ estado calmo; entre 50 e 90 ⇒ estado de aviso;
3. `aviso` presente ⇒ `pulsing` verdadeiro **e** o texto traz o máximo histórico;
4. `pulsing` verdadeiro **não** implica barra indeterminada, e vice-versa — são eixos independentes;
5. o pulso do E3 (`vivo.estado === 'parado'`) coexiste com uma barra a meio: os dois sinais saem ao mesmo tempo, é o caso que nos escapou quando um job ficou 30 min e saiu `timeout` com o trabalho feito;
6. `fill_pct` só é emitido quando a fonte é `passos declarados` — com base em percentil, sai `null`.

## S3 — O `.gitignore` protege o que já está versionado

Existem **18 ficheiros `.jsonl` versionados** (em `.planning/`, `docs/benchmarks/`
e `packages/router/scripts/wave*-benchmark/`) que só sobrevivem porque entraram
no índice **antes** de a regra `*.jsonl` existir. O `.gitignore` não afecta
ficheiros já *tracked* — mas um `git rm --cached` acidental numa limpeza
apaga-os do repo, e o padrão largo re-ignora-os **na hora, em silêncio**.

- Acrescentar excepções `!` explícitas para esses caminhos, ao lado da que já
  existe para `!audit/*.jsonl`.
- Um comentário curto a dizer porquê — o próximo a passar por ali tem de
  perceber que aquelas linhas são um cinto de segurança, não decoração.
- **Verificar depois**: `git check-ignore -v` em cada um dos 18 tem de deixar
  de os apanhar.

## Regras da casa

- `git add` **selectivo**. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN), em `landing/app/page.tsx`,
  nem em `moo.js` (outro agente está lá).
- Português nos comentários, inglês nos identificadores.
- Se um gate não puder ser honesto, **escrever o porquê em vez de o forçar**.
