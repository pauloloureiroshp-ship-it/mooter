# P3 · Obediência > 0 — veredicto

**Corrida:** 2026-09-09, 13:58–14:48Z · protocolo `5efd58ed` commitado 13:47:54Z, antes da primeira sessão · corpus `corpus-20.json` (sha no protocolo; n01–n21 sem n14, os 20 primeiros prompts reais do P1 que a regra marca T0/T1 e não tocam push/deploy/delete) · cada sessão numa cópia descartável do repo (`git archive`), `claude.exe -p --model sonnet --max-turns 12 --output-format stream-json`, **hooks do dono ligados** (o produto instalado), `OLLAMA_HOST` num proxy de contagem em loopback · bruto em `results/A-sonnet.json`, `results/B-sonnet.json`, `results/A-opus.json` (sonda), `results/analysis.json`.

## Veredicto em uma linha

**Obediência > 0, pequena e medida:** sem hook adicional, 3 de 20 sessões nativas delegaram para um subagente local que executou no Ollama com contagens no recibo; com um hook PreToolUse que reescreve o spawn conforme a decisão do router, 8 de 20 sessões delegaram, o hook chegou a **8/8** e reescreveu **8/8** para o tier local, e 4 de 20 executaram localmente com contagens. Nenhum dos 20 prompts foi delegado para Haiku em nenhum braço. n = 20 por braço, sem teste estatístico (não pré-registado).

## Os números (20 sessões por braço, mesmos prompts, mesma ordem)

| | **A · sessão nativa** (só o `UserPromptSubmit` vivo, que injecta o `<router-hint>`) | **B · A + `pretooluse-route.js`** (PreToolUse em `Agent|Task`: reescreve `subagent_type`/`model` conforme `last-subagent.json`; nunca sobe de tier) |
|---|---|---|
| Sessões com ≥ 1 delegação (spawn de subagente), Wilson 95 % | **4/20 · 20 % [8,1; 41,6]** | **8/20 · 40 % [21,9; 61,3]** |
| Sessões com delegação **executada** localmente — spawn `local-summarizer`/`local-transformer` **e** chamada ao Ollama com `eval_count` na mesma sessão (a métrica do protocolo) | **3/20 · 15 % [5,2; 36,0]** | **4/20 · 20 % [8,1; 41,6]** |
| Sessões com spawn de `cheap-triage`/Haiku | 0/20 | 0/20 |
| Hook PreToolUse: sessões em que chegou / spawns reescritos | — (não instalado) | **8 / 8** — todos para `T0/local-summarizer` (os spawns originais eram `Explore`, `model-reasoner`, `local-summarizer`) |
| Sessões com qualquer chamada ao Ollama (inclui o Option A do próprio hook — proxy largo) | 16/20 | 16/20 |
| Chamadas ao Ollama, por modelo (com `eval_count`) | 18: `qwen3:30b` 15/15, `qwen2.5:3b` 1/1, `gemma4:e4b` 0/2 | 17: `qwen3:30b` 15/15, `qwen2.5:3b` 2/2 |
| Tokens Ollama (prompt + eval) no recibo | 5 389 | 5 420 |
| Decisão do router no spawn (`last-subagent.json`) | T0 ×17 · T3 ×3 | T0 ×16 · T3 ×3 · T2 ×1 |
| Uso do modelo principal por sessão (média): entrada / saída / cache lida | 9,3 / 4 093 / 460 840 | 7,7 / 3 342 / 357 652 |
| Duração média por sessão | 77,1 s | 75,7 s |
| Exits | 19/20 = 0 (n07 exit 1, sem delegação — conta, ITT) | 20/20 = 0 |

**Sonda com Opus como modelo principal** (braço A, 5 primeiros prompts, quota permitiu): delegação 1/5, executada 1/5 (n05), T0 5/5, exit 4/5; 60,5 s por sessão. Só descritivo.

## Leitura honesta

1. **O número que interessa ao roadmap é 3/20 → 4/20 executados, e 8/8 alcançados pelo hook.** A primeira delegação executada «que não foi escrita à mão» aconteceu — três vezes sem hook nenhum (o modelo seguiu a doutrina do `CLAUDE.md` do dono e chamou `local-summarizer`), e o hook PreToolUse chegou a **todos** os spawns que o modelo fez. O que o hook **não** consegue é criar spawns: 12/20 sessões em B não delegaram e ele não teve onde actuar — é exactamente o argumento do ADR M1 (o hook só reescreve o que o modelo decide fazer).
2. **A diferença 4 → 8 delegações entre braços não é um efeito do hook por construção** (o hook não induz spawns); pode ser variância do modelo entre corridas. Não há teste pré-registado e n = 20; não se afirma causa.
3. **T1 nunca aconteceu:** 0 spawns de `cheap-triage`/Haiku nos dois braços. Sem chave a runtime degrada T1→T0 e a decisão foi T0 em 33/40 — em parte pelo defeito D1 (tecto de orçamento). Os 3 T3 são pisos de risco.
4. **A decisão no spawn variou entre braços para 4 prompts** (n02/n03 T3→T0, n04/n07 T0→T3, n11 T0→T2): o `last-subagent.json` é o do hook vivo, cujo estado (orçamento, sessão) muda entre corridas. Declarado; não corrigido.
5. **O «proxy largo» (16/20 sessões com chamada ao Ollama) não é obediência:** inclui o Option A do próprio hook (`gemma4:e4b`, `qwen2.5:3b`). A métrica do protocolo exige spawn local **e** chamada com `eval_count`; é essa a linha impressa.
6. **Custo:** cada sessão leu ~360–460 k tokens de cache do prefixo do Claude Code; o trabalho delegado ao Ollama foi ~5 k tokens por braço. Subscrição; API = 0.

## O que isto NÃO prova

- Qualidade do trabalho delegado (P7). Obediência com Opus além da sonda de 5. Que o hook *força* alguma coisa (é *gated best-effort*: nunca cria um spawn). Efeito causal do hook na taxa de delegação. Comportamento com chave (T1). Reprodutibilidade run-a-run (1 corrida por prompt por braço).

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --corpus
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm A --model sonnet
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm B --model sonnet
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm A --model opus --only n01,n02,n03,n04,n05
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --analyse
```
