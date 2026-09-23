# Adversário · round 9 (MP10 — AMENDMENT mp4-4: eventos de teste e prompt_len > 500)

`codex exec` (codex-cli 0.153.4, `-s read-only`, cwd isolado no scratchpad, `--ephemeral`) com **`HOME` e `USERPROFILE`
apontados para um directório temporário** (`CODEX_HOME` no `~/.codex` real, só para a autenticação) e a instrução
explícita, na 1.ª linha de cada prompt, de **não correr comando nenhum** — em particular a suite de `tools/router/`
nem nada que escreva em `~/.claude`. O `sha256` do `decisions.log` vivo foi medido antes e depois de cada sub-ronda:
**`d870d4145e4a` nas três, 4 938 linhas**. O HOME temporário recebeu escritas do próprio codex (`AppData/`,
`.claude-server-commander/`): o isolamento não era cosmético. Zero prompts reais enviados (a emenda, o diff e os
testes com prompts sintéticos; dos 6 hand-backs só o nome da tag).

| sub-ronda | UTC | veredicto | ataques |
|---|---|---|---|
| 9 | 13:31:49 → 13:32:15 | SHIP-COM-CORRECÇÕES | A1 (sério) (ii) pode esconder a perda de um prompt > 500 cru e ≤ 500 limpo · A2 (sério) (i) confunde formato com proveniência · A3 (menor) `_dropped` muda de universo · A4 (menor) «antes de qualquer taxa» devia ser «corrigida» · A5 (sério) falta um fecho bem-sucedido com n = 60 · A6 (sério) emenda pós-hoc |
| 9b | 13:35:11 → 13:35:28 | SHIP-COM-CORRECÇÕES | A1/A3/A4/A6 declarado-aceitável · A2/A5 fechados · **novo:** `session_id: "__proto__"` num acumulador `{}` não cria entrada própria → `_non_uuid_session_unknown` 0 e sem aviso |
| 9c | 13:36:44 → 13:37:16 | **SHIP** | `__proto__` fechado; nenhum ataque novo |

## O que mudou por causa do adversário

- **A1 — declarado, com medida; a regra do dono fica.** Em todas as transcrições desta máquina (1 786 linhas
  `type:user` com texto): 412 têm > 500 chars crus, 4 ficam ≤ 500 sem `<system-reminder>`, e 3 dessas seriam
  elegíveis pelo 60c (0,17 %). Na janela A10: 12 eventos UUID ok com `prompt_len` > 500, 6 recuperados, 0
  elegíveis; os 6 não recuperados são os hand-backs de causa provada. O teste (9) afirma o limite.
- **A2 — mitigado sem mudar a regra:** valores não-UUID fora dos 3 literais provados contam em
  `_non_uuid_session_unknown` e o CLI imprime AVISO (hoje: 0).
- **A5 — teste (10):** o CLI fecha 60 sessões num log com 25 eventos de teste e 2 hand-backs > 500 (cruas 23,0 % e
  10,4 %, corrigidas 0), `_partial:false`, cruas escritas no ficheiro.
- **9b — `Object.create(null)`** no acumulador; o meta leva `{ ...acumulador }`. Teste (9) e o r2 do CLI exigem
  contagem, propriedade própria, JSON e AVISO.
- **A3/A4/A6 — declarados** em `protocol.json#mp4._amendments[mp4-4]._round9_notes`.

## Mordidas (cada mutação reprova (9) e/ou (10); reposto → 0 falhas)

UUID aceita tudo · ausente aceite · gt500 fica na taxa · gt500 sai também da elegibilidade · fecho olha para a
crua (não-ok) · idem (recuperação) · crua calculada só sobre UUID · `_not_ok_rate` passa a corrigida · recusa sem a
crua (não-ok) · idem (recuperação) · sem AVISO · lista de literais vazia · desconhecidos contados como conhecidos ·
acumulador com protótipo — **14/14**.

## Limites declarados (não reabertos)

- Os 0,17 % descrevem o histórico observado; não limitam perdas futuras.
- A emenda foi escrita depois de ver as taxas de disponibilidade e recuperação; `outcome_known:false` refere-se ao
  resultado do 60d (rótulos, previsões, gate F2), não a essas taxas.
- A causa de (i) continua viva em `tools/router/` (três testes escrevem no `decisions.log` real sem HOME temporário).
