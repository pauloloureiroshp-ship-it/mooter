# decisor-shadow-2026-09-21 — F1 do plano «decisor calibrado local»

Estudo: Project `claude/ESTUDO_JEV_LAYA_X_MOOTER_2026-09-21.md` · Plano: `claude/PLANO_DECISOR_CALIBRADO_ROADMAP_2026-09-21.md`.
**Só lê. Nada aqui roteia. `classify.js` (FROZEN) não é tocado.**

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
