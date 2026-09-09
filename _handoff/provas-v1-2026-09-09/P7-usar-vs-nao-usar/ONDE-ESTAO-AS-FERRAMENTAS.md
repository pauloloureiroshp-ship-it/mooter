# P7 · onde estão as ferramentas do R-24

`tools/ab/correr-r24.mjs`, `r24-diagnostico.mjs`, `mooter-use-ab.mjs` e os testes **não estão neste branch**: vivem no checkout do dono (`~/frugal`, branch `feat/r24-controlador` @ `0575c5cc`, PR #486 por fundir). Este pacote guarda cópias dos dois ficheiros congelados (`r24-prereg.json`, `r24-manifest.json`, shas no `protocol.json`), o diagnóstico que precedeu o `--correr` (`diagnostico-no-lancamento-2026-09-09.txt`, sonda 2347 ms) e, no fim, o ledger e o log da corrida em `results/`. O `diagnostico-anterior-14-20Z.txt` é a corrida de verificação de 14:20Z (sonda 2127 ms), anterior ao lançamento.

## Como um estranho obtém e verifica o executor (achado R2, corrigido a 2026-09-09)

O exame adversarial classificou isto como **fatal**, e com razão como estava escrito: um pacote cuja premissa é a re-derivação independente dizia que o executor congelado «vive no checkout do dono», sem dizer como lá chegar. `tools/ab/` no `origin/main` tem apenas `mooter-vs-sem.mjs`, `mooter-vs-sem.test.mjs` e `morde.mjs`; nem o executor nem o pré-registo estão em `main`.

**O que estava errado era a frase, não o facto:** os quatro ficheiros **estão empurrados** para o remoto, no branch `feat/r24-controlador`. Verificado a 2026-09-09.

```bash
git fetch origin feat/r24-controlador
git show origin/feat/r24-controlador:tools/ab/correr-r24.mjs      | sha256sum
git show origin/feat/r24-controlador:tools/ab/r24-diagnostico.mjs | sha256sum
git show origin/feat/r24-controlador:tools/ab/r24-prereg.json     | sha256sum
git show origin/feat/r24-controlador:tools/ab/r24-manifest.json   | sha256sum
```

| Ficheiro | sha256 (blob no remoto **e** no disco do dono — comparados, iguais) |
|---|---|
| `correr-r24.mjs` (o executor) | `942ceecdfc1423713c27bb76cf86a87f01cea15c5c218a36b80d580a22b86881` |
| `r24-diagnostico.mjs` (o pré-voo) | `71ca268bba4734cc4ab49283756cf99a2a717a9753937753e23c897411f29f78` |
| `r24-prereg.json` (o pré-registo) | `5ddd527ece9ac3a2…` — **igual, byte a byte, à cópia nesta pasta** |
| `r24-manifest.json` | `d79957ccbfa51ced…` — **igual à cópia nesta pasta** |

Branch remoto em `0575c5cc` («docs(r24): Emenda 8 — o tratamento é o router pinado MAIS este ambiente e este estado»), PR **#486**, por fundir.

As duas cópias que este pacote guarda foram comparadas com o remoto por sha e batem, o que é o ponto: quem duvidar da cópia pode buscar o original e confirmar sem acreditar em ninguém. Os outros dois (`mooter-use-ab.mjs` `fd343d81…`, `morde-r24.mjs` `e01b29b9…`) ficam registados pelo sha do disco.
