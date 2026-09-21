# MP3 — Confirmatório limpo do v0 + F2-shadow no arbiter · para o Claude Code · 2026-09-21

Ponto de partida: MP2 fechou `ENTRE`. Exploratório forte: **D v0 argmax** (logit-head, qwen2.5-coder:14b, sem parâmetros aprendidos) = 0,608 em 97 reais, mas (i) não era o candidato pré-registado, (ii) 40 dos 97 são reuso, (iii) 3 sessões = 30 dos 57 (Codex A2/A4/A5). A v1 aprendida perdeu para o v0 duas vezes — **não se fine-tuna nada (nem Laya) neste MP**.
Regras: `classify.js` FROZEN (sha `427d8c0b…`); append em `results/PROGRESSO.md` com hora; stop rule (uma corrida por braço×corpus); sem `git push`; n/d onde não mediste. **Novidade:** este MP autoriza a **primeira** alteração em `tools/router/` — só `arbiter.js` (+ `types.d.ts`, + teste novo), só em modo sombra, e só na Frente B. Nada mais em `tools/router/`.

## Frente A — Confirmatório do v0 (candidato fixo, corpus virgem)

### A0 — Pré-registo (commit antes de amostrar)
Bloco `"mp3"` em `protocol.json`: candidato primário **v0 argmax** (o script `02-arm-D-logit.mjs` como está, política v0, limiar de abstenção 0,4); candidato secundário **v0+T** com **T=1,55** (já fixado no MP2, não se re-ajusta); candidato terciário **v0-guard**: `se argmax==T0 e (p_needs_repo>=0,5 ou p_high_stakes>=0,5) → T2` (um limiar, 0,5, fixado aqui). Gate **só no corpus 60c**: acc > «T2 sempre» (McNemar unilateral exacto, p<0,05) ∧ ECE ≤ 0,10 (10 bins) ∧ p50 quente ≤ 250 ms ∧ egress 0. Análise por sessão: com 1 prompt/sessão estrito os pares são independentes por construção — regista o `session_sha8` de cada item. Commit: `chore(decisor-shadow): pré-registo MP3 — confirmatório v0 (60c, 1/sessão) + F2-shadow`.

### A1 — Corpus 60c (virgem, 1 por sessão ESTRITO)
`corpus-60b.mjs` reutilizado com parâmetros novos (lidos do `protocol.json#mp3`): janela **2026-08-01T00:00Z → 2026-09-09T23:59Z** (a janela dos 40 do P1 é 08-01→09-04, por isso **exclui por sha256[0..12] todos os 63 do `corpus-63.json` do P1** e também os 57 do 60b); `--cap-per-session 1`; mesma elegibilidade (20–500 chars, sem tool_result/meta/notificações/scratchpad); seed **20260922**. Alvo 60; se o pool de sessões der menos, **n = o que der** (declarado; não se sobe o tecto por sessão — foi isso que o A3 atacou). Regista pool/elegíveis/sessões. Anonimiza como antes; 0 fugas verificadas. `results/corpus-60c.json` (gitignorado — confirma).

### A2 — Rótulos cegos (antes de qualquer predição) — TRÊS rotuladores, maioria conta
Lição do MP2: κ Codex×Sonnet = 0,59 e o v0 vai de 0,61 para 0,49 conforme o rotulador — um rotulador único é tecto artificial.
- R1 **Codex** (`label-60b.mjs` apontado ao 60c: rubric sha `f95958dd…` verificado, lotes ≤ 13, `--ephemeral`, cwd isolado, guarda de cegueira que aborta se existir `D-/A-/policy-*60c*`).
- R2 **Sonnet** (subagente `model-reasoner`, só rubric + prompts, sem acesso ao repo).
- R3 **Opus** ou **Gemini/Kimi** se houver adaptador (`kimi-adapter.js` existe no bridge) — motor de **família diferente** de R1 e R2; se nenhum estiver disponível, R3 = Haiku 4.5 e declara-se.
Rótulo que conta = **maioria dos 3**; empate a 3 → Codex (pré-registado aqui). Grava `results/labels-60c.json` com os 3 votos por item, κ par-a-par e κ de Fleiss, e a % de itens unânimes. Reporta o gate também contra **só os itens unânimes** (sensibilidade: o tecto do rótulo).

### A3 — Correr (uma corrida cada)
- Regra: `A-60b.mjs` adaptado → `results/A-60c.json` (sha do `classify.js` verificado antes).
- D v0: `02-arm-D-logit.mjs --model qwen2.5-coder:14b --corpus results/corpus-60c.json --labels results/labels-60c.json` com o net-tap (`NODE_OPTIONS=--require <P1 lib/net-tap.cjs>`, `NET_TAP_OUT=results/nettap-D-60c.jsonl`).
- v0+T e v0-guard aplicados **às mesmas respostas** (`05-policy-v1.mjs --apply` só para o T; escreve um `07-guard.mjs` de ≤ 30 linhas para o guard) → `results/policy-60c.json`. Zero corridas extra.

### A4 — Análise
`06-analyse-mp2.mjs` estendido (ou `08-analyse-mp3.mjs`): tabela **só 60c** — regra · «T2 sempre» · «T3 sempre» · v0 · v0+T · v0-guard; acc, IC95, ECE, p50, McNemar vs «T2 sempre» e vs regra; confusão; n de sessões. Gates avaliados no **v0** (primário). `results/08-analysis-mp3.md`.

## Frente B — F2-shadow (primeira mudança de código, mínima e reversível)

### B0 — O que muda e o que NÃO muda
- `tools/router/arbiter.js`: acrescenta um backend `ollamaLogit(prompt)` (porta directa de `02-arm-D-logit.mjs`: 4 perguntas tipadas, 1 letra, `top_logprobs` via `/v1/chat/completions`, host de `ollama-host.js`, modelo `process.env.MOOTER_DECISOR_MODEL || 'qwen2.5-coder:14b'`, timeout 400 ms, keep_alive 30m). Devolve `{ tier, probabilities, p_max, abstained, latency_ms, backend:'ollama-logit', model }` ou `null`.
- **Modo sombra:** `arbitrate()` chama `ollamaLogit` **só** se `MOOTER_DECISOR_SHADOW=1`, **depois** de decidir o que já decide hoje, e **nunca** usa o resultado na rota: escreve um evento `decisor_shadow` no `decisions.log` com `{ts, prompt_sha12, prompt_len, tier_regra, confidence_regra, task_category, tier_arbiter_haiku (se houve), tier_D, probs_D, p_max_D, abstained_D, ms_D, backend, model, session_id}` — **sem texto do prompt** (80 chars de preview no máximo, como o resto do log). Sem chave, sem `MOOTER_DECISOR_SHADOW`, ou com `MOOTER_ARBITER_DISABLE=1` → **zero** comportamento novo.
- `inject_context.js`: **não muda** (o shadow vive dentro do `arbitrate()`? NÃO — atenção: hoje `arbitrate()` só é chamado quando `confidence<0,75 || ambíguo`. Para o shadow apanhar **todos** os prompts, acrescenta em `inject_context.js` **uma** chamada `shadowDecisor(prompt, decision)` logo antes da secção «v0.8 HAIKU ARBITER» (linha ~907), dentro de `try/catch`, best-effort, que só corre com `MOOTER_DECISOR_SHADOW=1`. É a única linha nova nesse ficheiro.)
- Orçamento de latência: o shadow adiciona ~150 ms com modelo quente (medido) e ~2,5 s frio. Aceitável porque é **opt-in** e o dono é o único utilizador. Regista a mediana do hook com e sem shadow (10 prompts cada) em PROGRESSO.md.
- `types.d.ts`: campos opcionais. `classify.js`: **intocado** (verifica sha no fim).
- Teste novo `tools/router/arbiter-shadow.test.js`: (1) sem env → nenhum evento; (2) com env e `_mockResponse` de logprobs → evento com o schema acima e **rota inalterada**; (3) HIGH_RISK continua a ser da regra; (4) timeout → evento `outcome:'timeout'`, rota inalterada. Suite `tools/router` inteira tem de continuar verde (regista contagem antes/depois).

### B1 — Ligar no PC do dono
Cria `RUN-DECISOR-SHADOW-ON.bat` e `-OFF.bat` na raiz: `setx MOOTER_DECISOR_SHADOW 1` / `setx MOOTER_DECISOR_SHADOW ""`. **Não os corras** — é o dono que decide ligar. Documenta em `README.md` do pacote: o que fica no log, como desligar, e o script `09-shadow-report.mjs` (lê os eventos `decisor_shadow`, imprime n, concordância regra×D, distribuição, p50) para o dono correr daqui a 1–2 semanas — os prompts acumulados viram o corpus 60d, rotulado cego pelo mesmo método.

### B2 — Commit
Um commit só para a Frente B: `feat(router): decisor sombra ollama-logit — regista, não roteia (F2-shadow)`; **não fundir/push**. Reviewer gate do dono.

## Emendas (regra formal, pedida pelo adversário round 2)
Qualquer desvio ao `protocol.json#mp3` (n < 60, tecto por sessão, rotulador indisponível, timeout do modelo) entra **antes** de rótulos/predições num commit próprio `chore(decisor-shadow): AMENDMENT mp3-<n> — <motivo>` com bloco `amendments[]` no `protocol.json` (`when`, `what`, `why`, `outcome_known: false`). Sem commit de emenda, o desvio não existe — a corrida pára.

## Fecho
`codex exec` round 3 sobre `08-analysis-mp3.md` + diff da Frente B («o shadow pode alterar a rota por algum caminho? fuga do prompt para o log? o 60c é mesmo virgem?»). Última linha do PROGRESSO.md: `GATE VERDE (60c) → F2 PODE ABRIR (arbiter trocável, default haiku)` · `ENTRE → shadow acumula; re-testar com 60d` · `❄️ ABAIXO DE T2 SEMPRE → parar`. Verifica sha do `classify.js`.
Não faças: fine-tune (Laya ou outro); ajustar T ou o limiar 0,5 depois de ver o 60c; subir o tecto por sessão; usar o shadow para rotear; push.
