# Resultado da bateria — gerado mecanicamente

> Gerado por `resultado.mjs` a partir de 9 `meta.json` em `C:\Users\Paulo Loureiro\frugal\_handoff\piloto\runs`.
> Nenhum número deste ficheiro foi escrito à mão. Campo ausente sai `n/d`, nunca zero.

## Sha medido

- `base_sha`: `e8f9b25c9d7b9c0daf2f6a988da66105ce4cc073` — o commit que a bateria diz ter medido.
- `runtime_bundle_sha`: `27fb623d2264d5e1396097b04fd49dfb23d2a82e1ac47155f202ccb1299cb501` — o que o braço B REALMENTE correu (prova ficheiro-a-ficheiro por sha256, sem manifest).
  - fonte: driver.log da bateria (evento prova_bundle)
  - veredicto da prova: **IGUAL — o runtime é o repo**, 198/198 ficheiros medidos.

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
| T1-A-e1-1786122828051 | TECTO | T1 | 1 | cumprido | 1 | 1071813 | {"total_usd":3.79,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":18,"usd":0.0008},"claude-fable-5":{"tier":"T5","inputTokens":29,"outputTokens":75778,"usd":3.7892}}} | 0 |
| T1-A-e2-1786125791219 | TECTO | T1 | 2 | cumprido | 1 | 562847 | {"total_usd":2.1297,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":20,"usd":0.0008},"claude-fable-5":{"tier":"T5","inputTokens":8,"outputTokens":42577,"usd":2.1289}}} | 0 |
| T1-A-e3-1786126928842 | TECTO | T1 | 3 | cumprido | 1 | 820422 | {"total_usd":3.0165,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":21,"usd":0.0008},"claude-fable-5":{"tier":"T5","inputTokens":8,"outputTokens":60313,"usd":3.0157}}} | 0 |
| T1-B-e1-1786124332717 | MOOTER | T1 | 1 | cumprido | 1 | 552044 | {"total_usd":1.1134,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":23,"outputTokens":44532,"usd":1.1134}}} | 0 |
| T1-B-e2-1786125303028 | MOOTER | T1 | 2 | cumprido | 1 | 486682 | {"total_usd":0.9927,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":15,"outputTokens":39705,"usd":0.9927}}} | 0 |
| T1-B-e3-1786127750559 | MOOTER | T1 | 3 | cumprido | 1 | 1041466 | {"total_usd":1.7993,"detalhe":{"claude-opus-5[1m]":{"tier":"T3","inputTokens":97,"outputTokens":71954,"usd":1.7993}}} | 0 |
| T1-C-e1-1786123901224 | ESTATICO | T1 | 1 | cumprido | 1 | 430022 | {"total_usd":0.5253,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":21,"usd":0.0008},"claude-sonnet-5":{"tier":"T2","inputTokens":38,"outputTokens":34960,"usd":0.5245}}} | 0 |
| T1-C-e2-1786124886295 | ESTATICO | T1 | 2 | cumprido | 1 | 415259 | {"total_usd":0.5161,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":21,"usd":0.0008},"claude-sonnet-5":{"tier":"T2","inputTokens":47,"outputTokens":34345,"usd":0.5153}}} | 0 |
| T1-C-e3-1786126355457 | ESTATICO | T1 | 3 | cumprido | 1 | 571958 | {"total_usd":0.8285,"detalhe":{"claude-haiku-4-5-20251001":{"tier":"T1","inputTokens":683,"outputTokens":21,"usd":0.0008},"claude-sonnet-5":{"tier":"T2","inputTokens":28,"outputTokens":55174,"usd":0.8277}}} | 0 |

## Runs não contabilizados (declarados, nunca calados)

- `_handoff` — sem meta.json
