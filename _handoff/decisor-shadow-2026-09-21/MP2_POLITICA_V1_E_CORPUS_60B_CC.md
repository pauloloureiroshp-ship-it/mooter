# MP2 — Política v1 + calibração + corpus 60b · para o Claude Code · 2026-09-21

Ponto de partida: `results/PROGRESSO.md` termina em `VEREDICTO: ENTRE (REGRA<ACC<JUIZ) → POLÍTICA V1 ANTES DE F2`. D/14b (qwen2.5-coder:14b, logit-head) = 0,600 nos 40 reais, McNemar vs regra p=0,003, **vs «T2 sempre» p=0,163 (não separa), ECE 0,110 (>0,10)**.
Regras iguais ao MP1: `classify.js` FROZEN (sha `427d8c0b…` no fim), nada em `tools/router/` muda, sem `git push`, número não medido = n/d, append em `results/PROGRESSO.md` com hora. Stop rule: uma corrida por (braço × corpus); re-corrida única só por falha de infra, com motivo.

## Princípio que governa este MP (não negociável)
**Os 40 reais são TESTE. Nenhum parâmetro (temperatura, pesos, limiares, escolha de candidato) é ajustado olhando para eles.** Treino = `gold-84` + `validation-set` (154 prompts; são treino da *regra*, mas o braço D nunca os viu — para D são dados independentes). O corpus 60b (novo) é o **segundo teste**, rotulado às cegas antes de qualquer predição.

## Passo 0 — Pré-registo (commit antes de correr)
Acrescenta a `protocol.json` um bloco `"mp2"` com: hipótese («uma política aprendida sobre as 4 respostas tipadas do D/14b, treinada em 154 rotulados que D não viu, sobe acc nos 40 e baixa ECE ≤ 0,10 sem tocar nos 40»), treino/teste como acima, os 3 candidatos do passo 2, a regra de escolha (CV 5-fold no treino, métrica = log-loss; desempate por acc), e o gate final: **nos 100 (40 + 60b) juntos: acc > «T2 sempre» com McNemar unilateral p<0,05 ∧ ECE ≤ 0,10 ∧ p50 ≤ 250 ms ∧ egress 0 hosts**. Commit: `chore(decisor-shadow): pré-registo MP2 — política v1, calibração, corpus 60b`.

## Passo 1 — Completar o treino
`node 02-arm-D-logit.mjs --model qwen2.5-coder:14b --corpus valset` — acrescenta a `lib-common.mjs` o modo `valset` (lê `tools/router/validation-set.json`, secções canonical/adversarial/historical, `id = <sec>-<nn>`, rótulo `expected_tier`; **só lê**). Grava `results/D-qwen2.5-coder_14b-valset.json`. Uma corrida.

## Passo 2 — `05-policy-v1.mjs` (node puro, zero dependências, seed fixa 20260921)
Entrada: as linhas `rows[].answers` dos ficheiros D/14b de gold-84 e valset (treino) e dos 40 reais (teste, só no fim).
Features por prompt (todas já estão no JSON, não se re-corre o modelo): `p(T0..T3)` do tier (4), `E[complexity]` e `p(2)`, `p(high_stakes)`, `p(needs_repo)`, `mass_on_letters` do tier → 9 features + bias.
Candidatos:
- **v0** — argmax de `p(tier)` (o que já existe; referência).
- **v0+T** — temperature scaling: uma temperatura escalar sobre os log-probs do tier, ajustada no treino por minimização de log-loss (grid 0,3–5,0, passo 0,05). Não muda o argmax; muda a ECE.
- **v1** — regressão softmax 4 classes sobre as 9 features, L2 (λ ∈ {0,01; 0,1; 1}), gradient descent, 2 000 iterações; depois temperature scaling sobre a saída, ajustado nos folds.
Selecção: 5-fold CV estratificada **no treino** (154), métrica primária log-loss, secundária acc. Regista a tabela de CV em PROGRESSO.md. **Só então** aplica o candidato vencedor (e os dois outros, para transparência) aos 40 reais e grava `results/policy-v1-40.json` com acc, IC95 Wilson, ECE 10 bins, confusão, McNemar vs regra (`A-nokey.json`), vs juiz (`B.json` do P1) e vs «T2 sempre». Também `results/policy-v1-weights.json` (pesos, temperatura, λ, folds).
Regra de honestidade: se o vencedor da CV perder para v0 nos 40, **imprime-se** e não se troca de candidato depois de ver os 40.

## Passo 3 — Corpus 60b (segundo teste, novo)
Fonte: transcrições do Claude Code em `~/.claude/projects/**/*.jsonl` — mensagens `type:"user"` com texto de prompt humano (excluir tool_result, comandos `/…`, prompts < 20 chars, e qualquer prompt cujo `sha256[0..12]` esteja em `corpus-63.json` do P1). Janela: **2026-09-10 → 2026-09-21** (fora da janela do P1, que acabou a 09-04). Um prompt por sessão no máximo; amostra 60 com seed 20260921; anonimiza como o P1 (`<owner>`, `<email>`, caminhos `~`). Grava `results/corpus-60b.json` (**não commitar**; já está no `.gitignore` do pacote? se não, acrescenta). Regista em PROGRESSO.md: pool, elegíveis, distribuição de projectos (hash).
Rótulos **cegos**: `codex exec` em cwd isolado sem o repo, `label-rubric.txt` do P1 (sha `f95958dd…`), lotes ≤ 13, JSON forçado, **antes** de qualquer predição sobre os 60b. `results/labels-60b.json` com `_labeler`, `_rubric_sha256`, `_blind`, `_labeled_at`. Segundo rotulador para kappa: opcional; se o fizeres, usa Sonnet via CC subagent, não Qwen (viés de família com D).

## Passo 4 — Correr nos 60b (uma corrida cada)
- Regra: `A-60b.mjs` (≤ 30 linhas, chama `classify()` por item, grava `results/A-60b.json` com `rows[{id,tier,run:1}]`).
- D/14b v0: `02-arm-D-logit.mjs --corpus results/corpus-60b.json --labels results/labels-60b.json`. **Com atestação de egress:** reutiliza a `lib/` de nettap do P1 (`_handoff/provas-v1-2026-09-09/lib`) para registar hosts contactados durante a corrida; esperado = só `127.0.0.1:11434`. Grava `results/nettap-D-60b.jsonl` e o resumo em PROGRESSO.md.
- Política vencedora do passo 2 aplicada às respostas dos 60b → `results/policy-v1-60b.json`.
- Latência fria: uma medição, declarada, do 1.º prompt após `ollama stop qwen2.5-coder:14b` (só para registar; o gate é com modelo quente).

## Passo 5 — Análise final
Estende `04-analyse.mjs` (ou cria `06-analyse-mp2.mjs`) para a tabela: linhas = regra · «T2 sempre» · juiz (só nos 40) · D v0 · D v0+T · D v1; colunas = acc40, acc60b, **acc100**, ECE100, p50, McNemar vs «T2 sempre» nos 100, McNemar vs regra nos 100. Gates do passo 0 avaliados nos 100. `results/06-analysis-mp2.md`.

## Passo 6 — Adversário round 2
`codex exec` com o pré-registo do passo 0 + `06-analysis-mp2.md` + `policy-v1-weights.json`: «fuga treino→teste (alguma decisão foi tomada olhando os 40 ou os 60b?), sobreposição corpus 60b × treino, viés do rotulador único, calibração em 10 bins com n=100, latência». `results/adversary-codex-round2.md`, cada ataque aceite/refutado.

## Passo 7 — Fecho
Última linha de PROGRESSO.md, uma de: `GATE VERDE (100: >T2 p<0,05 ∧ ECE≤0,10 ∧ p50≤250 ∧ egress 0) → F2 PODE ABRIR` · `ENTRE → F6 (Laya fine-tune nos 214 rotulados) OU mais rótulos` · `❄️ ABAIXO DE T2 SEMPRE → parar`. Verifica sha do `classify.js`. Commit do que é permitido (scripts, `06-analysis-mp2.md`, `policy-v1-weights.json`, `adversary-*.md`, PROGRESSO.md, protocol.json); corpora/rótulos brutos ficam fora. Sem push.

Não faças: ajustar nada olhando para os 40 ou 60b; trocar o candidato depois do teste; Jev/TypeSafe; alterar `tools/router/`; «mais uma corrida».
