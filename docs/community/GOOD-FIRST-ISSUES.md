# Good First Issues — prontos a colar no GitHub

> Colar cada bloco como issue com label `good first issue`. Porta de entrada para os 3 contributors do gate.

**1. [docs] Add a "How routing works in 60 seconds" diagram to README** — Mermaid ou imagem; material em docs/METHODOLOGY.md §1-3. Label: docs, good first issue.

**2. [dx] `mooter doctor --json`** — output estruturado para tooling (a extensão VS Code vai consumir). Os checks já devolvem objectos; falta o flag e o JSON.stringify. Label: enhancement.

**3. [routing] Add 10 prompts to the validation set from your own workflow** — contribuir prompts reais (redacted) com tier esperado para `tools/router/validation-set.json`. Zero código. Label: dataset.

**4. [ux] Colour-blind friendly tier markers in statusline** — tier chips dependem de cor; adicionar modo com símbolos. Label: accessibility.

**5. [i18n] Translate README quickstart to pt-BR / es** — Label: docs.

**6. [dx] Shell completion for `mooter` (zsh/bash)** — subcomandos estáticos; gerar completion script no install. Label: enhancement.

**7. [test] Fixture-based tests for decisions.log parser** — fixtures reais já em `test/fixtures/` (F0.2). Label: testing.

**8. [docs] Document MOOTER_* env vars in one table** — env.js tem a lista; falta tabela no README. Label: docs.
