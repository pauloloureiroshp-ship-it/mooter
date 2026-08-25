📥 **COLAR EM:** n/a — resposta à auditoria. O §4 é o que instalas. Ficheiro em `_handoff/MOOTER_V133_RESPOSTA_AUDITORIA.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: RESPONSE + FIX REPORT
id: MOOTER-V133-2026-07-25
responde_a: handoff pós-auditoria v1.3.2 (Onda A→E)
bundle: _handoff/mooter-v133.mcpb · 226 127 B · 14 ficheiros
sha256: 1c78b88607fc809337d9a8bfeac47204dd3e89ea23de1b6c81566c97feffa93e
testes: 88 verdes, 0 falhas · 9 deles são do CAMINHO, não das funções
resolvido_aqui: Ondas A e B completas · D parcial · E completa
```

# 🐮 v1.3.3 — resolvido nesta sessão, sem abrir sessão nova

A auditoria pediu uma sessão fresca para a Onda A. Não foi preciso: os fixes eram de 1-5 linhas e o
diagnóstico estava tão preciso que dava para bater direto. **Ondas A, B, E completas; D em três quartos.**

## 1. Onda A — "não mentir"

| # | Achado | Fix | Onde |
|---|---|---|---|
| A1 | **trabalho entregue marcado `failed`** — 1,8 KB de análise correcta dados como `empty-output` | `producedNothing` passa a medir **o texto**, não a telemetria. Nova função `jobResultText()` — a mesma que o `collect` usa, para nunca haver duas verdades. Telemetria em falta vira log, não sentença | `seamless.js:577` |
| A2 | **`mooter_work` passava ao lado do fix da v1.3.2** | `cliModelFor(agent, tier, rec)` — e **o back-compat FOI APAGADO**. Tinhas razão: protegia um chamador que não existia e criava o que falhava. Agora um chamador sem `agent` **parte** | `seamless.js:376, 905` |
| A3 | **custo `0` quando é desconhecido** | `mooter_await` só soma números e devolve `null` + `cost_jobs_medidos` / `cost_jobs_sem_medicao` / `cost_note`. No painel, `!= null` em vez de truthy, e **`$0 · tudo local` com destaque positivo** | `seamless.js` (await), `fleet-ui.html:457` |
| A4 | **a prosa era escrita e descartada** | `resumo` é a **primeira chave** de `mooter_work`. Não em `content[0].text` — dentro do objecto, onde este host olha | `seamless.js` (work) |
| A5 | **"Ver resultado" só em `done`** | agora em qualquer job terminado, mais **"Tentar noutro motor"** nos falhados | `fleet-ui.html:283` |

## 2. Onda B — "não adivinhar"

**B1 · o embedder.** `isGenerative()` rejeita `embed|bge|gte|minilm|e5-|nomic|mxbai|arctic-embed`, por
nome e por `details.family`. E a regra inverteu-se: **o maior que CABE** na VRAM livre, não o menor —
porque um modelo maior prepara melhor e o `gpu.js` já media a folga. Diagnosticaste o enviesamento duplo
com precisão: embedders são os menores **e** ficam residentes por causa do RAG do vault.

**B2 · o plano.** `plan.addStep()` nova. `mooter_work` acrescenta em vez de substituir; o `step` é
`S<n+1>` calculado do plano existente. Três works na mesma wave = três etapas.

**B3 · o `prepare` silencioso.** Passa a devolver `prepare_skipped` com a razão literal. E há um extra
que os testes encontraram (§5): **`downgraded`** — quando o router escolhe T0 e não há Ollama, o `work`
cai para `cc` e **diz que caiu**, em vez de recusar.

**B4 · `tok_s`.** O `status` passa a congelar na `duration_s` tal como o `fleet`. Há um teste que
compara as duas tools sobre o mesmo job e falha se divergirem.

## 3. Ondas D e E

| | |
|---|---|
| **E1** | `hostOrigin` fixado na primeira resposta do host; tudo o resto é ignorado. E **nunca mais se aceita um nome de tool vindo de uma mensagem** — a lista fixa é a única fonte |
| **D2** | `explainExit()` — cada `exit_code` ganha uma frase. `empty-output` → *"terminou sem entregar texto — motor provavelmente incompatível"* |
| **D3** | re-render só quando o payload muda (hash). Adeus scroll a saltar de 2 em 2 segundos |
| **D4** | `--fg3` escurecido para ~4.5:1 · `@media (prefers-reduced-motion)` · `role="img"` + `<title>` no SVG |
| **D1** | estado vazio com **3 exemplos clicáveis** — pelo mecanismo `say()` que já existia e não ensinava nada |
| — | planos limitados a 3 (tinham `slice` os jobs mas não os planos) |
| **§1.9** | linhas de erro do `stderr` promovidas a `coherence`, **separando ambiente de job**: *"ambiente (não é do job): AuthRequired mcp.vercel.com"* |

## 4. Instalar

```
C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v133.mcpb
```

Settings → Extensions → `mooter` → Uninstall → Install Extension… → confirmar **1.3.3** → fechar o
Desktop pela tray → reabrir → task nova.

## 5. 🔬 A lição da §5, aplicada — e já rendeu

Escreveste: *"todo o bug ganha um teste do caminho observável, não da função"*. Está feito:
**`path.test.js`, 9 testes**, cada um a percorrer `toolWork → … → spawn → ledger → status/collect`.

E o método provou-se **na primeira corrida**: o T7 falhou por uma razão que **nenhuma auditoria tinha
visto**. Quando o classificador dá **T0** e a máquina não tem Ollama a correr, o `mooter_work` devolvia
*"nenhum modelo local disponível"* e o utilizador ficava sem nada — a porta única fechava-se porque um
motor **opcional** estava em baixo. Daí nasceu o `downgraded`.

Também confirmei o teu diagnóstico do §5 no sítio mais incómodo: o assert
`cliModelFor('T1') === 'haiku'` estava mesmo a **certificar a porta de trás**. Agora é
`assert.throws(…, /agent obrigatório/)` — a assinatura antiga tem de partir, não de ser tolerada.

## 6. O que fica, e porquê

| Item | Porquê fica |
|---|---|
| **Onda C** (worktrees) | é a primeira que **escreve estado fora do job dir** (`git worktree add`). Merece o teu gate explícito, não um commit meu |
| **14 → 8 tools** | é decisão de produto: fundir `run`/`route` em modos do `work` muda a API pública |
| **Hierarquia do painel** (custo e coerência ao topo) | é subtracção de UI, e quero-a desenhada contigo a ver |
| **Custo do Codex** | o `codex exec --json` não reporta custo. É investigação, não fix |

## 7. A PERGUNTA — respondo, e devolvo

Perguntaste: **o painel deve parecer completo ou honesto?**

Respondi **honesto**, e implementei-o: `cost_usd: null` em vez de `0`, `tok_s` que se recusa a existir
sem duração, `savedUsd` escondido, `prepare_skipped` e `downgraded` a dizerem em voz alta o que não
aconteceu. O `CLAUDE.md` diz *never fabricating metrics*, e um produto que trai a própria constituição
para parecer melhor numa demo perde as duas coisas.

Mas tu apanhaste a parte que eu não tinha visto, e é essa que fica contigo:

> *"o `coherence` é o produto a auditar-se a si próprio. Nenhum concorrente vai pôr no ecrã 'detectei
> uma incoerência nos meus próprios números', porque nenhum tem incentivo comercial para isso. É o teu
> fosso e está escondido."*

**Isto reformula a pergunta.** O `n/d` deixa de ser o preço da honestidade e passa a ser a **demo**.
"Não sei quanto custou o job do Codex, porque o CLI não reporta" é uma frase que nenhum concorrente
consegue dizer sem parecer partido — e que aqui parece rigor. Mas transformar isso em destaque visual
é desenho de produto, e é teu.

## 8. BOARD

| Item | Estado |
|---|---|
| Onda A (5 fixes) | ✅ |
| Onda B (4 fixes) | ✅ |
| Onda D | ✅ D1-D4 · ❌ D5 (hierarquia) |
| Onda E | ✅ E1 · 🔜 E2 (`allowed_tools_effective` no collect) |
| Testes de caminho T1-T6 | ✅ **9 testes**, e um bug novo encontrado |
| Suite | ✅ **88 verdes** |
| Onda C (worktrees) | 🔜 gate teu |
| Painel: 1 por wave | ✅ desde a v1.3.2 — só tu confirmas visualmente |

🤝 **SOCIO:** receita? **S** — A1 sozinho muda o veredicto de *"não instalava num amigo"* · despesa↓?
**S** — A2 e B1 evitam pagar arranque a jobs que nunca podiam executar · risco↓? **S** — E1 fecha um
painel que mostra dinheiro e envia prompts em nome do utilizador · reversível? **S** · escopo? **S** —
zero toques em `classify.js`.

📮 **DESTINO:** Paulo (instalar 1.3.3 → repetir a wave de auditoria → comparar) → depois Onda C e a
hierarquia do painel, desenhadas a dois.
