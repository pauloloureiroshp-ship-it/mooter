# Adversário · round 8 (MP9 — janela confirmatória A10 no corpus e no gate do 60d)

`codex exec` (codex-cli 0.153.4, `-s read-only`, cwd isolado no scratchpad, `--ephemeral`), 6 sub-rondas sobre o diff de
`10-corpus-60d.mjs`, `16-gate-f2.mjs` e os dois testes, mais o texto do A10 (`protocol.json#mp4._amendments[mp4-3]._round7_corrections`).
Zero prompts reais enviados (só código, testes com prompts sintéticos e o texto do protocolo). Saídas cruas em
`adversary-codex-round8{,b,c,d,e,f}-raw.txt`.

| sub-ronda | UTC | veredicto | ataques |
|---|---|---|---|
| 8 | 12:55:59 → 12:56:25 | NO-SHIP | A1 (crít.) carimbo sem ligação aos itens · A2 (crít.) recusa dependente do id `dNN` · A3 `--predictions` aceita corpus antigo / troca de evento repetido · A4 `_since_utc` declara janela que os eventos não respeitam · A5 `_diagnostic_excluded` instável, ts inválido contado como diagnóstico · A6 testes só de metadados |
| 8b | 12:59:39 → 13:00:01 | NO-SHIP | A2/A3/A4/A6 fechados · A1 parcial (previsões antigas com os mesmos ids) · A5 parcial (cópia do array perde contador; leitor sem contador de ts inválido) · A7 novo: gate aceitava corpus parcial/abaixo de n_target |
| 8c | 13:02:44 → 13:03:02 | NO-SHIP | A5/A7 fechados · A1 parcial (rótulos sem ligação ao corpus) · novos: campos consumidos sem validação (regra, ms, abstenção, HIGH_RISK) · hashes ausentes passam (`undefined === undefined`) · duplicados escondidos pelo `Map` |
| 8d | 13:05:14 → 13:05:44 | SHIP-COM-CORRECÇÕES | A1, campos e hashes fechados · duplicado contraditório no `--predictions` · objectos mutáveis depois do hash |
| 8e | 13:06:55 → 13:07:14 | SHIP-COM-CORRECÇÕES | tier `["T0"]` passa a regex por coerção · clone adulterado e recongelado passa o gate |
| 8f | 13:08:38 → 13:08:49 | **SHIP** | (a) e (b) fechados; nenhum ataque novo no âmbito |

## O que mudou por causa do adversário

- **Gate (A1/A2/A7, 8c, 8d, 8e):** `gateF2` deixou de inferir proveniência pelo id. Exige `{ artifacts }` — o objecto
  devolvido por `load60dArtifacts(dir)` (sha256 dos bytes de `corpus-60d.json`, `labels-60d.json`,
  `D-shadow-corpus-60d.json`; congelado em profundidade; identidade num `WeakSet` privado) — ou `{ preview: nome }`,
  que o relatório marca `window: preview:<nome>`. Com artefactos: janela A10 no meta **e em cada item** (`_t_utc`),
  corpus completo (n_target, não parcial), previsões ligadas por sha ao corpus e aos rótulos, rótulos ligados por
  sha ao corpus, ids únicos e iguais nos quatro conjuntos (arrays crus), e cada item igual ao rótulo e à previsão do
  evento em todos os campos que o gate consome.
- **Corpus (A3/A4/A5):** `buildCorpus` filtra pela janela efectiva `max(since, A10)`; ts inválido contado à parte;
  contadores `null` (n/d) quando não viajam, nunca 0; cada item leva `_t_utc`. `--predictions` valida a janela do
  corpus congelado, exige rótulos com `_corpus_sha256`, ids únicos e tiers em `['T0','T1','T2','T3']`, e casa o evento
  por sha + sessão + hora.

## Limites declarados (não reabertos)

- Quem controla o código pode sempre contornar; o objectivo é que um engano honesto não passe em silêncio.
- Nos eventos anteriores ao MP8 o HIGH_RISK do item vem do texto (fallback declarado, contado no gate 4); o gate não
  o consegue verificar contra o evento.
- `labels-60d.json` com `_corpus_sha256` é contrato novo: o passo de rotulagem (ainda por escrever) tem de o gravar.
