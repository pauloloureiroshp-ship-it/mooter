# MP1 — F1 do decisor calibrado local (shadow) · para o Claude Code · 2026-09-21

Contexto: `_handoff/decisor-shadow-2026-09-21/README.md` e o plano no Project `claude/PLANO_DECISOR_CALIBRADO_ROADMAP_2026-09-21.md`.
Tu és o executor. O Cowork (Fable) acompanha lendo `results/`. Regras: **classify.js FROZEN** (sha `427d8c0b…` tem de continuar igual no fim); nada roteia; nenhum ficheiro em `tools/router/` muda neste MP. Sem `git push` sem o reviewer gate. Escreve cada passo concluído em `results/PROGRESSO.md` (append, com hora) — é por aí que o Cowork acompanha.

## F1a — Pré-registo (primeiro, sem excepção)
1. `git status --porcelain` da pasta `_handoff/decisor-shadow-2026-09-21/` e dos `RUN-DECISOR-*.bat`. Lê `protocol.json`. Não o alteres.
2. Commit **só** desses ficheiros: `chore(decisor-shadow): pré-registo F1 — protocolo, harness, bats (sem código do motor)`. Anota o sha do commit em `README.md` (linha «Pré-registo ancorado: <sha>») e em `results/PROGRESSO.md`.

## F1b — Baseline + probe
3. `node 00-baseline.mjs` → confirma `sha_matches_protocol:true` em `results/00-baseline.json`. Se `false`: PÁRA e escreve porquê em PROGRESSO.md.
4. `node 01-probe-ollama.mjs --model qwen2.5:3b`. Regista em PROGRESSO.md: versão do Ollama, modelos, `logprobs_supported`. Se `false`: tenta `ollama --version`; se < versão com logprobs no compat layer, regista «Ollama sem logprobs → D em amostragem (não passa gate ECE)» e continua — não actualizes o Ollama neste MP.

## F1c — Corpus (bloqueio B1)
5. Procura o corpus NÃO redigido dos 40/63 do P1, por esta ordem: `_handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/results/bruto-resgatado/`, `~/.mooter/`, `~/.claude/tools/router/` (transcripts/decisions de setembro), vault `~/paulo-vault/20-mooter/artifacts/`. Critério: um JSON com `items[].id` n01…n40 e `prompt` sem `[[redigido`. Verifica o hash: `sha256(prompt)` deve começar pelos 12 hex do `[[redigido sha256:…]]` em `corpus-63.json`. Se bater ≥ 38/40 → grava em `results/corpus-40-unredacted.json` (**NÃO commitar**; adiciona ao `.gitignore` local do pacote) e passa ao 7.
6. Se não existir: reamostra 40 prompts do ledger com a mesma regra do P1 (`run.mjs`/`amend.mjs` mostram a fonte e a seed 20260909; usa seed 20260921 e pool = eventos de agosto-setembro com prompt ≥ 20 chars, um por sessão). Grava `results/corpus-40b.json` (não commitar). Rotula **cego** com o Codex: `codex exec` em cwd isolado sem o repo, rubric = `P1/label-rubric.txt` (verifica sha `f95958dd…`), lotes ≤ 13, schema JSON forçado, ANTES de qualquer classificação. Grava `results/labels-40b.json` com `_labeler`, `_rubric_sha256`, `_blind`. Depois corre a regra nos 40b: `node ../provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --arm A --env nokey` **apontado ao 40b** (se o run.mjs não aceitar corpus por flag, faz um `A-40b.mjs` de 30 linhas que chama `classify()` por item e grava `results/A-40b.json` com `rows[{id,tier,run:1}]`), e ajusta `04-analyse.mjs` para ler `A-40b.json` quando o corpus for 40b.

## F1d — Shadow
7. Aquece os modelos: `ollama run qwen2.5:3b ""` e `ollama run qwen2.5:14b ""` (ou `keep_alive`). VRAM: só um de cada vez se o 14b não couber ao lado do que estiver residente.
8. `node 02-arm-D-logit.mjs --model qwen2.5:3b --corpus gold` e `--corpus <corpus real>` ; repete com `qwen2.5:14b`. Uma corrida por modelo por corpus (stop rule do protocolo). Se algum falhar por infra, corrige e re-corre UMA vez, com o motivo em PROGRESSO.md.
9. Laya: `python -m venv .venv-laya && .venv-laya\Scripts\pip install -r requirements-laya.txt` + torch CUDA (cu12x) para a 4090. `python 03-arm-C-laya.py --corpus gold`, depois `--subfolder laya-typed-decisions`, depois com o corpus real. Se a API do `laya` divergir do script (foi escrito a partir do README, não testado), corrige o script — só a chamada, não o schema de saída — e regista a diferença.
10. `node 04-analyse.mjs` → `results/04-analysis.md`. Copia a tabela para PROGRESSO.md.

## F1e — Adversário
11. `codex exec` (motor diferente) com `protocol.json` + `04-analysis.md` + os `results/*.json` de resumo: «ataca esta análise: pseudo-replicação, fuga treino→teste, viés de família, calibração, latência com modelo frio, o que a tabela afirma que os dados não sustentam». Grava `results/adversary-codex-round1.md`. Cada ataque: aceite/refutado, com a razão.
12. Fecho: PROGRESSO.md termina com **um** de: `GATE VERDE (acc40>0,35 ∧ ECE≤0,10 ∧ p50≤250) → F2 pode abrir`, `ENTRE (regra<acc<juiz) → política v1 antes de F2`, `❄️ ABAIXO DA REGRA → parar, derrota impressa`. Verifica `sha256sum tools/router/classify.js` = `427d8c0b…`. `git status` limpo excepto `results/` (não commitar corpora/rótulos brutos com prompts; commitar `04-analysis.md`, `PROGRESSO.md`, `adversary-*.md`, `00-baseline.json`, `01-probe-ollama.json`).

Não faças: alterar `arbiter.js`/`inject_context.js`; ligar Jev/TypeSafe; «mais uma corrida» por parciais favoráveis; inventar número — se não mediste, escreve n/d.
