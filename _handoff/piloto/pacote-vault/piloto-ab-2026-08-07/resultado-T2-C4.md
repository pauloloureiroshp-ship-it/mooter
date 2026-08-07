# Resultado da bateria — gerado mecanicamente

> Gerado por `resultado.mjs` a partir de 9 `meta.json` em `runs-T2-C4`.
> Nenhum número deste ficheiro foi escrito à mão. Campo ausente sai `n/d`, nunca zero.

## Sha medido

- `base_sha`: `7f78c72b2cac3910b48f579a9e66ec44d8e7704a` — o commit que a bateria diz ter medido.
- `runtime_bundle_sha`: `n/d` — o que o braço B REALMENTE correu (prova ficheiro-a-ficheiro por sha256, sem manifest).
- ⚠️ 9 run(s) sem `runtime_bundle_sha` no `meta.json` **e sem prova no `driver.log`** da bateria — não há como saber o que correu: `T2-C4-A-e1-1786102209313`, `T2-C4-A-e2-1786102560522`, `T2-C4-A-e3-1786102901665`, `T2-C4-B-e1-1786102383153`, `T2-C4-B-e2-1786102484229`, `T2-C4-B-e3-1786102732237`, `T2-C4-C-e1-1786102293964`, `T2-C4-C-e2-1786102639741`, `T2-C4-C-e3-1786102808621`.

## Declarações obrigatórias (condições desta bateria)

- **Exposição do Paulo:** viu **1 artefacto da bateria-1** (arquivada como inválida) antes deste
  julgamento. Os 9 artefactos julgados aqui são da bateria-2 e **nenhum lhe foi mostrado antes
  de o painel fechar**. A exposição é declarada por ter existido, não por se saber que enviesou.
- **Limite do contexto neutro:** o `CLAUDE.md` do projecto foi substituído por um neutro idêntico
  nos três braços e o `AGENTS.md` removido. O **`~/.claude/CLAUDE.md` do utilizador NÃO é
  removível** — `CLAUDE_CONFIG_DIR` quebra a autenticação (medido: `Not logged in`). É
  **constante nos três braços**, logo não é variável entre eles, mas o ambiente **não é livre de
  doutrina**. Quem ler isto como "contexto neutro" está a ler mais do que foi medido.
- **Item 8 do DoD** (condição de vitória quando a vaca está cercada): **`n/d (humano)` nos 9
  artefactos** — o harness não o consegue verificar. Fica à espera de o Paulo jogar os 9 jogos.
  O `score_dod` de cada artefacto é sobre 11 itens verificáveis, não 12.

## Runs

| run | braço | tarefa | exec | critério de paragem | tentativas | wall_ms | custo proxy | intervenções |
|---|---|---|---|---|---|---|---|---|
| T2-C4-A-e1-1786102209313 | TECTO | T2-C4 | 1 | cumprido | 1 | 83227 | {"total_usd":0.2308,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":21,"usd":0.0009},"claude-fable-5":{"tier":"T5","inputTokens":16,"outputTokens":4595,"usd":0.2299}}} | 0 |
| T2-C4-A-e2-1786102560522 | TECTO | T2-C4 | 2 | cumprido | 1 | 77834 | {"total_usd":0.2197,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":18,"usd":0.0008},"claude-fable-5":{"tier":"T5","inputTokens":14,"outputTokens":4375,"usd":0.2189}}} | 0 |
| T2-C4-A-e3-1786102901665 | TECTO | T2-C4 | 3 | cumprido | 1 | 56417 | {"total_usd":0.1742,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":24,"usd":0.0009},"claude-fable-5":{"tier":"T5","inputTokens":10,"outputTokens":3465,"usd":0.1734}}} | 0 |
| T2-C4-B-e1-1786102383153 | MOOTER | T2-C4 | 1 | cumprido | 1 | 99625 | {"total_usd":0.1413,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":18,"outputTokens":5648,"usd":0.1413}}} | 0 |
| T2-C4-B-e2-1786102484229 | MOOTER | T2-C4 | 2 | cumprido | 1 | 74956 | {"total_usd":0.0992,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":18,"outputTokens":3966,"usd":0.0992}}} | 0 |
| T2-C4-B-e3-1786102732237 | MOOTER | T2-C4 | 3 | cumprido | 1 | 75144 | {"total_usd":0.104,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":16,"outputTokens":4156,"usd":0.104}}} | 0 |
| T2-C4-C-e1-1786102293964 | ESTATICO | T2-C4 | 1 | cumprido | 1 | 87957 | {"total_usd":0.0999,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":18,"usd":0.0008},"claude-sonnet-5":{"tier":"T2","inputTokens":20,"outputTokens":6597,"usd":0.099}}} | 0 |
| T2-C4-C-e2-1786102639741 | ESTATICO | T2-C4 | 2 | cumprido | 1 | 91144 | {"total_usd":0.0901,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":21,"usd":0.0009},"claude-sonnet-5":{"tier":"T2","inputTokens":22,"outputTokens":5948,"usd":0.0893}}} | 0 |
| T2-C4-C-e3-1786102808621 | ESTATICO | T2-C4 | 3 | cumprido | 1 | 91820 | {"total_usd":0.1036,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":756,"outputTokens":23,"usd":0.0009},"claude-sonnet-5":{"tier":"T2","inputTokens":20,"outputTokens":6847,"usd":0.1028}}} | 0 |
