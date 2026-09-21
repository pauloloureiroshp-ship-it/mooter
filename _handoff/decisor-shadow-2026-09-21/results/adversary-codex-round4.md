# Adversário · round 4 (MP4-a: diffs dos bugs A e B) — ledger

- **Quando:** 2026-09-21 ~11:53Z (08:53 BRT). **Motor:** `codex exec` (codex-cli 0.153.4, `gpt-6-astra`), `read-only`,
  cwd isolado, `--ephemeral`. Entrada: os dois diffs (`git show aee71157` e `423ca9c6`, só `tools/router/`) + duas
  perguntas («pode partir o Mac?», «o argv fix muda algo com `_mockResponse`?»). Prompt em
  `adversary-round4-prompt-sent.txt`; saída bruta em `adversary-codex-round4-raw.txt`. **6 ataques.**

| # | Sev. | Ataque | Veredicto | Resposta |
|---|---|---|---|---|
| A1 | médio | Inventário falhado na 1.ª corrida fica persistente (cache só se regenera quando o ficheiro falta) | **ACEITE, pré-existente** | É o desenho da cache desde sempre (`initHwCapability`); este MP não o muda. Sem `ollama` no PATH a lista fica `[]` e o comportamento é o de antes (só `recommended_t0`). Regeneração: `node tools/router/gpu-probe.js`. Invalidação por idade: n/d, fora do allowlist. |
| A2 | médio | `recommended_t0` pode não estar instalado (lista vazia salta a verificação; sem match cai em `qwen2.5:3b`) | **ACEITE EM PARTE** | Sem lista = comportamento antigo, de propósito (Mac sem `ollama` no PATH). O fallback `qwen2.5:3b` é o modelo mínimo da doutrina e já era o fallback; se estiver ausente, o Option A falha rápido (404), não carrega nada. Teste novo cobre «só instalado o 3b» e «lista real». |
| A3 | **alto** | O leitor podia escolher, pela lista de preferência, um modelo instalado que **não cabe** (Mac 8 GB + 14b instalado) | **ACEITE → CORRIGIDO** (`bestOllamaT0` filtra por `can_run`; commit deste round) | Verdade: a lista de preferência ignorava o probe. Agora só entre os que cabem **e** estão instalados; senão o pequeno. |
| A4 | médio | Teste do argv assume tmpdir sem espaços | **ACEITE → CORRIGIDO** | Aspas duplas em `NODE_OPTIONS` quando o caminho tem espaços. Nesta máquina o tmpdir é 8.3 (`PAULOL~1`); num Mac com espaços fica coberto. |
| A5 | médio | Arranque do servidor falso sem timeout/`error`/`exit` | **ACEITE → CORRIGIDO** | Timeout 5 s, `error` e `exit` rejeitam; `child.kill()` no `finally`. |
| A6 | baixo | Os testes não provam o comportamento sem chave / com kill-switch | **ACEITE** | Os dois índices não tocam nesses portões (`MOOTER_ARBITER_DISABLE` e «sem chave → null» estão antes do `callHaikuSync`; `_mockResponse` salta-o). Testes explícitos desses caminhos: já existem em `backtest.test.js` (mock) e `arbiter-shadow.test.js` (5); «zero transporte» sem chave: n/d em teste. |

**Veredicto dele (verbatim):** «Q1 — Yes, the hardware fix can regress Apple Silicon routing through stale discovery,
absent-model recommendations, and a fallback that bypasses capacity checks; the supplied diff does not show a
Mac-specific crash. Q2 — The argv correction shows no direct change to bypassed mock/disabled/no-key paths, but their
guarantees remain unverified here, and the integration test is not robust across temporary paths or server-startup
failures.»

**Resposta:** o único ponto que podia mandar um Mac carregar um modelo que não cabe (A3) foi corrigido em código; A1 e A2
são o desenho pré-existente da cache, declarados e fora do allowlist; A4/A5 corrigidos no teste. Nada de crash no Mac:
`ollama list` ausente devolve `[]`, e `spawnSync` com `timeout` nunca bloqueia mais de 5 s — e só corre quando o
ficheiro não existe.
