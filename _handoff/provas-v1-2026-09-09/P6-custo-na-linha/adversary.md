# P6 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, ronda 1, e a resposta

**Prompt enviado:** `adversary-prompt-sent.txt` · **Saída íntegra:** `adversary-codex-round1.md` (13 ataques + SURVIVE/REWORD/DEAD + texto proposto para o slide). O adversário **não** conseguiu executar código local (`CreateProcessAsUserW failed: 5`); reproduziu `numOrNull`/`reconcile` a partir dos excertos e confirmou os preços da Anthropic na página oficial.

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P6-01 | pré-registo contradito: `analysis.at 13:51Z` < `congelado_em 14:40Z` | fatal | **Aceite.** O `congelado_em` era escrito à mão e errado. A prova de anterioridade é o commit `61007b23` (13:51:24Z, mesma linha de shell que a corrida). Errata em `ERRATA-timestamps.md`; protocolo corrigido com `congelado_em_fonte` | corrigido |
| P6-02 | «ganhou por construção» é propriedade do formato; as 63 linhas `rule` têm 0/0 sintéticos | serious | **Aceite.** O veredicto v2 mede **cobertura nesta amostra**, não custo verificado; a nota está no próprio `analysis.json` | reformulado |
| P6-03 | fórmula textual omitia 200 tokens de input; −94 % está certo | minor | **Aceite.** Os 200 tokens são 20 chamadas × 10 `input_tokens` (o `-p` com prefixo em cache). Tabela por chamada publicada | corrigido |
| P6-04 | «fully explained linha a linha» excedia a evidência; nota dizia 1,25× (5 min) | serious | **Aceite.** Tabela por chamada: com escrita a **1 h (2×)** o resíduo é **0 em 20/20**. A nota 1,25× era errada (errata na AMENDMENT-1). A reconstrução é exploratória (multiplicadores fora do SSOT) | corrigido |
| P6-05 | ramo `api` publica subtotal como custo completo | serious | **Aceite.** `completeness: partial_no_cache_pricing`; campo renomeado `list_price_input_output_usd` | corrigido |
| P6-06 | origem e zero escolhidos pelo chamador; subscrição sem contagens recebia 0 | serious | **Aceite em parte.** Sem contagens → `n/d` (corrigido). A origem continua **declarada** pelo chamador — o módulo não tem como verificar a modalidade de pagamento; cada linha leva `source_declared_by_caller: true` e o veredicto diz-o | corrigido / declarado |
| P6-07 | `reconcile` converte n/d em 0 e mistura bases | serious | **Aceite.** Base declarada; excluídos contados; `incomplete` → Δ `n/d`; custo negativo excluído | corrigido |
| P6-08 | `numOrNull` permissivo (`false→0`, `[5]→5`, negativos, fracções); Ollama com uma contagem | serious | **Aceite.** `count()` estrito; Ollama exige as duas | corrigido |
| P6-09 | modelo desconhecido podia herdar o `FALLBACK_PRICE`; regex precificava versões inventadas | serious | **Aceite.** `modelKey` → chave exacta ou apelido exacto, senão `null`; `listPrice` lê `PRICES[key]`, nunca `priceTurn`; `model_key_used` na linha; teste prova que o fallback existe e não é herdado | corrigido |
| P6-10 | `round6` por linha; data do snapshot ilegível virava `"pricing.js"` | minor | **Aceite.** Sem arredondar na linha; `n/d` se ilegível. Hash da tabela: não feito (fica em `10-NAO-PROVADO.md`) | corrigido / parcial |
| P6-11 | denominador do ledger (726 todos vs `done`); faltava `with_tokens` em B; «nunca correram» | serious | **Aceite.** `with_tokens` acrescentado (93/156); cortes rotulados; «nunca correram» → «registados como `deferred`». Snapshot imutável dos logs com hash: **não feito** — e o log vivo cresceu entre as duas corridas (P3/P5 deste pacote escrevem nele); declarado | parcial |
| P6-12 | «11 biting tests» não sustenta exactidão; valores vinham do SSOT | serious | **Aceite.** 15 testes com valores calculados à mão no ficheiro; cobrem P6-05..P6-10. Continuam a ser testes unitários de um módulo sem *callers* no produto — dito no slide | corrigido |
| P6-13 | slide promete mais do que o rodapé corrige («every decision line», «fully explained», −94 % lido como poupança) | serious | **Aceite.** Slide v2 usa o núcleo proposto pelo adversário, com os números re-corridos | reformulado |

**Rejeitado:** nada. **Não resolvido:** origem verificada (é declarada — limite do desenho, não deste instrumento); hash/snapshot dos logs; integração no produto (0 *callers*, `10-NAO-PROVADO.md`).

**Ronda 2:** não corrida — a quota do Codex ficou reservada para os braços B do P4 (56 janelas) e os adversários das provas ainda sem ronda (P3, P4, P5, P7, P8). Declarado, não escondido.
