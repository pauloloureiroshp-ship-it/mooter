# decisor-shadow-2026-09-21 — F1 do plano «decisor calibrado local»

Estudo: Project `claude/ESTUDO_JEV_LAYA_X_MOOTER_2026-09-21.md` · Plano: `claude/PLANO_DECISOR_CALIBRADO_ROADMAP_2026-09-21.md`.
**Só lê. Nada aqui roteia. `classify.js` (FROZEN) não é tocado.**

Pré-registo ancorado: `1416884dfd15224daebd8e96ad2b8550e0bf80b4` (2026-09-21T06:31:12-03:00 · 09:31:12Z).
Esse commit congela `protocol.json` + harness **antes** de qualquer braço correr. Os
`RUN-DECISOR-*.bat` da raiz ficaram de fora: a regra `RUN-*.bat` do `.gitignore`
(linha 196) já os exclui deliberadamente — lançadores de duplo-clique são locais.

## Ordem (circuito ficheiro + duplo-clique, na raiz do repo)
| Passo | .bat | O que faz | Sai em |
|---|---|---|---|
| 0 | `RUN-DECISOR-00-BASELINE.bat` | sha da regra vs protocolo; acc gold-84/validation-set (TREINO); ECE proxy do ledger; copia referência P1 | `results/00-baseline.json` |
| 1 | `RUN-DECISOR-01-PROBE.bat` | Ollama: versão, modelos, **logprobs no /v1/chat/completions?** | `results/01-probe-ollama.json` |
| 2 | `RUN-DECISOR-02-ARM-D.bat` | braço D (logit-head) em gold-84 **e** no corpus real (se existir não-redigido) para 3b e 14b | `results/D-*.json` |
| 3 | `RUN-DECISOR-03-ARM-C.bat` | braço C (Laya zero-shot) nos mesmos corpora — exige venv (`requirements-laya.txt`) | `results/C-*.json` |
| 4 | `RUN-DECISOR-04-ANALYSE.bat` | tabela comparativa + McNemar vs regra + gates do protocolo | `results/04-analysis.md` |

Antes do passo 0: **commit do `protocol.json`** (Claude Code) — pré-registo ancorado, a lição do P1.

## §corpus — o que falta e é bloqueio
O `corpus-40/63.json` publicado no P1 está **redigido** (`[[redigido sha256:… chars:…]]`). Os braços precisam do texto. Opções, por ordem:
1. Recuperar o corpus não-redigido da corrida do P1 (fonte declarada: «sept-transcripts», seed 20260909, pool 360) — procurar em `~/.mooter`, `results/bruto-resgatado`, vault `20-mooter/artifacts/`. Passar `--corpus <path>`.
2. Se não existir: reamostrar 40 prompts do ledger (1 176) com a mesma seed e **rotular cego de novo** (Codex, mesmo rubric sha). Vira corpus-40b; McNemar contra a regra volta a ser possível porque a regra é determinística (re-correr `classify` nos 40b — o `04-analyse` já lê `A-nokey.json`; para o 40b, gerar um `A-40b.json` com `P1/run.mjs --arm A`).
3. Enquanto isso: tudo corre em `gold-84` — mas é **treino da regra**: serve para testar a canalização, não para veredicto.

## Modelos residentes (braço D)
O `.bat` corre `qwen2.5:3b` (o T0 actual) e `qwen2.5:14b`; se o probe disser «sem logprobs», o D corre em amostragem n=5 e a coluna fica marcada `(amostragem!)` — não é logit real, não passa o gate de calibração.

## Política v1 (só depois de rótulos)
`policyV0` = argmax do tier. v1 = regressão logística sobre as 4 respostas (tier×4 probs, complexity, high_stakes, needs_repo) ajustada em metade dos rótulos e avaliada na outra metade — o padrão «62,6 % → 95 %» do bench de phishing. Só se justifica se D/C v0 ficarem entre a regra e o juiz.

## F2-shadow (MP3, 2026-09-21) — o decisor tipado em modo SOMBRA no router

Primeira alteração em `tools/router/` desta série: `arbiter.js` ganha `ollamaLogit(prompt)` (porta directa do
`02-arm-D-logit.mjs`: 4 perguntas tipadas, 1 letra, `top_logprobs`, só `127.0.0.1:11434`) e
`shadowDecisor(prompt, decision)`; `inject_context.js` ganha **uma linha** que o chama antes do arbiter Haiku;
`types.d.ts` ganha campos opcionais; `arbiter-shadow.test.js` (7 testes) prova que **a rota não muda**.
`classify.js` intocado.

**Opt-in do dono.** Nada disto corre sem `MOOTER_DECISOR_SHADOW=1`. Na raiz do repo:
`RUN-DECISOR-SHADOW-ON.bat` (`setx MOOTER_DECISOR_SHADOW 1`) · `RUN-DECISOR-SHADOW-OFF.bat` (apaga).
Efeito só em sessões **novas** do Claude Code. `MOOTER_ARBITER_DISABLE=1` desliga-o também.
Só chega à máquina do dono depois de fundir este branch e correr `/mooter-update` (o hook vivo é
`~/.claude/tools/router/inject_context.js`).

**O que fica no log** (`~/.claude/tools/router/decisions.log`, um evento `decisor_shadow` por prompt): `ts`,
`session_id`, `prompt_sha12`, `prompt_len`, `prompt_preview` (≤ 80 chars, como o resto do log — **nunca o texto**),
`tier_regra`/`confidence_regra`/`task_category` (o que o hook decidiu), `tier_D`/`probs_D`/`p_max_D`/`abstained_D`/
`ms_D`/`aux_D` (o que o decisor **diria**), `agree_regra`, `outcome` (`ok`·`timeout`·`failed`·`parse_failed`).
`tier_arbiter_haiku` fica `null` no hook (o Haiku corre depois); o relatório junta ao `classified` da mesma sessão.

**Custo medido** (`results/shadow-latency-hook.json`): +**~240 ms** por prompt com o modelo quente (ms_D p50 245);
tecto 800 ms (AMENDMENT mp3-2). Em modelo frio o primeiro prompt sai `timeout` e dispara um aquecimento
desligado (o Ollama 0.34 **aborta o carregamento** quando o cliente desliga — sem isto o modelo nunca aquecia).
Achado colateral desta medição: nesta máquina algo ligado ao hook (n/d o quê; `hw-capability.json` diz
`apple-silicon`/`available_ollama_models: []`) pede e aborta carregamentos de **todos** os modelos instalados
(qwen3:30b 22 GiB inclusive), o que despeja o 14b e faz o shadow sair `timeout` no prompt seguinte.

**Relatório** (daqui a 1–2 semanas): `node _handoff/decisor-shadow-2026-09-21/09-shadow-report.mjs [--since AAAA-MM-DD] [--json]`
→ n, outcomes, concordância regra×D, distribuições, p50. Os prompts acumulados viram o **corpus 60d**: 1 por sessão
estrito, rotulado às cegas (Codex + Sonnet + Kimi) **antes** de alguém olhar para `tier_D`.
