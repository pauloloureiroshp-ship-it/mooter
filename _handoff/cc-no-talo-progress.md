# CC no talo (Mac) — progresso

Formato: `hora UTC | fase | feito | próximo`

Executor: Claude Code (Mac mini) · branch `mac/no-talo-m2b` · mutex respeitado
(o CC do PC está em `fix/ledger-read-raiz`; nada fora de `mac/...`).

---

`2026-08-25T??:??Z | F0 | arranque` — `git pull` feito em `~/frugal` (HEAD `f9a58f6d`,
merge do PR #386). Branch `mac/no-talo-m2b` criada a partir de `main`. Kickoff e
masterprompt (`~/paulo-vault/_handoff/MASTERPROMPT-MOO-PILOT-NO-TALO-2026-08-25.md`) lidos.

## Divergência de força declarada (F0, antes de qualquer código)

O kickoff manda usar **codex + kimi-k3** como músculo. Medido nesta máquina:

| motor | estado medido | evidência |
|---|---|---|
| codex | **vivo** | `~/.local/node/bin/codex` (0.146.0), `codex exec -s read-only` responde; modelo `gpt-5.6-sol`, auth OAuth ChatGPT |
| kimi-k3 | **indisponível** | sem binário, sem entrada em `tools/router/providers/` (só `codex-cli`, `deepseek-v4`, `ollama-api`, `openai-api`), sem chave Moonshot em `~/.mooter/env` nem no ambiente |
| ollama | **vivo** | `qwen2.5-coder:14b`, `gpt-oss:20b`, `gemma4:12b`, `qwen2.5:3b` |

`codex` **não** está no PATH do shell não-interativo — só resolve via
`~/.local/node/bin/codex`. Quem invocar tem de exportar o PATH.

Consequência assumida: a doutrina "adversário em motor diferente" é honrada com
**codex (gpt-5.6-sol) + Ollama local (qwen2.5-coder)** como as duas lentes. O kimi
fica `n/d` — não é substituído por uma segunda passagem do mesmo motor a fingir de
segunda lente.

## F0 — confirmação de factos do masterprompt/kickoff

| facto alegado | veredicto | evidência no checkout |
|---|---|---|
| marketplace publica "47% savings" | **confirmado** | `.claude-plugin/marketplace.json:11` e `plugin/mooter/.claude-plugin/plugin.json:3` — ambos "47% measured savings" |
| pitch-90s diz "90%" (vault) | **confirmado** | `~/paulo-vault/40-strategy/pitch-90s.md:16` — "poupar 90% em fatura de AI" |
| `pricing-snapshot-2026-05-27.json` em uso | **confirmado (ficheiro existe)** | `data/pricing-snapshot-2026-05-27.json` |
| alias `mooter-cabine` | **confirmado, com o nome errado** | não existe nada chamado `mooter-cabine`; o alias real é **`/cabine`**. E o defeito é maior do que "alias a limpar" — ver M2b abaixo |
| `decide-agent.ts:40` importa o snapshot | **confirmado** | `packages/router/src/decide-agent.ts:40` — `import pricingSnapshot from "../../../data/pricing-snapshot-2026-05-27.json"` |
| SKILL.md duplicada do moo-pilot | **REFUTADO** | há **uma só** `moo-pilot/SKILL.md` no repo (`.claude/skills/moo-pilot/`). As outras duas cópias são um espelho de runtime legítimo (`~/.claude/`, idêntico byte a byte) e uma worktree obsoleta (`.claude/worktrees/mystifying-bohr-78f90b/`). O que existe é outra coisa: **duas skills diferentes a chamarem-se cockpit** — `plugin/mooter/skills/cockpit/` (por sessão) e `.claude/skills/moo-pilot/` (por device). Não são duplicadas, são homónimas — e nenhuma mente. Linha não tocada |

---

`2026-08-25 | M2b | superfícies que mentem, corrigidas` — branch `mac/no-talo-m2b`.

**1. `47% savings` nas superfícies publicadas.** A landing já tinha resolvido isto — a
`DESCRIPTION` que vai para produção diz "same results, a fraction of the spend", sem número
(`landing/app/layout.tsx:42`). O marketplace e o plugin não seguiram. Alinhados com a mesma
linguagem, sem inventar copy nova:
`.claude-plugin/marketplace.json:11` · `plugin/mooter/.claude-plugin/plugin.json:3`.

**2. O alias `/cabine` — o defeito não era o alias, era a promessa.**
`plugin/mooter/skills/cockpit/SKILL.md:3` e `moo-kb.json` dizem os dois ao utilizador que o
alias foi **mantido de propósito** ("para ninguém que aprendeu o nome antigo ficar sem porta"),
e o `moo-kb.json:875` chega a **citar `plugin/mooter/commands/cabine.md` como fonte**, com
quote. Esse ficheiro foi apagado em `0434bc42` — o commit que trouxe o rename Cabine→Cockpit
por arrasto ("inclui o rename Cabine -> Cockpit... que estavam por commitar"). Resultado: duas
superfícies a citar um comando que não resolvia. Reposto como stub fino que aponta ao
`/cockpit`, com a descrição exacta que o KB já cita.

**3. O snapshot de preços — o achado com consequência.**
`claude-opus-4-6` estava marcado `pricing_status: "pending"` com a nota *"No in-repo source for
Opus 4.6 pricing as of 2026-06-12"*. **Essa nota era falsa quando foi escrita**:
`tools/router/pricing.js:46` tem $5/$25 desde **2026-04-16** (commit `22ad1eea`) — dois meses
antes. Consequência medida, não hipotética: `claude-opus-4-6` é o **modelo T3 por omissão** do
router (`pricing.js:155`), e o `decide-agent.ts` nunca o consegue escolher, porque *"you cannot
rank what you cannot price"*; o `computeCostMicros` devolvia **0** para ele — um zero fabricado
da classe exacta que o PR #385 passou uma wave a arrancar.
Preenchido a partir do SSOT do próprio repo. **Nenhum preço foi inventado.**

**4. O que NÃO fiz, de propósito — `claude-fable-5`.** Também está `pending` com uma nota falsa
(o preço $10/$50 está em `pricing.js:65`). Mas o SSOT dá-lhe preço e **nenhum `tier`**, de
propósito — *"priceable, not routable"*. O snapshot, ao contrário, dá-lhe `"tier": "T5"`, e o
`decide-agent.ts:91,100` lê esse campo e ordena T5 ao lado de T3. Precificá-lo sem primeiro
resolver o campo `tier` podia tornar o Fable alcançável por um sort de custo — e o invariante
diz que **T5 nunca é auto-roteado**. Isso é decisão de produto/arquitectura do MEO, não uma
edição de limpeza. Fica pending com a razão **declarada nos dados**
(`pricing_withheld_reason`), não escondida numa lista de excepções dentro do teste.

**5. Teste de frescura, ligado ao CI.** `tools/cockpit/runner/frescura-de-precos.mjs` (lógica
pura) + `.test.mjs` (7 testes com fixtures sintéticas + 1 portão ancorado). Falha em três
classes: idade > 30 dias, preço que contradiz o SSOT vivo, e modelo `pending` que o SSOT sabe
precificar. **Ligado a `test:cockpit-runner` no `package.json`** — a lição dos 18 fantasmas é
que teste fora do comando do CI não existe.

### Gate deste marco

| suite | total | pass | fail | nota |
|---|---|---|---|---|
| cockpit-runner | 814 | 813 | 0 | +8 testes vs base (806/805/0); 1 todo é o q13 pré-existente |
| packages/router | 302 | 295 | 3 | **diff contra `main` vazio** — as 3 são pré-existentes |

**Uma regressão minha, apanhada e corrigida:** `cache-aware-cost.test.ts` usava
`claude-opus-4-6` como *fixture* de "modelo pending". Ao precificá-lo, o fixture deixou de
servir e o teste ficou vermelho. Apontado a `claude-opus-4-8`, que continua genuinamente sem
fonte de preço no repo. O teste continua a testar a mesma coisa (recusar fabricar preço); só
mudou o exemplo.

⚠️ **A ratificar pelo dono:** essa é uma edição em `packages/router/tests/`, fora do allowlist
da Wave 58 (que cobre *adições* a `packages/router/src/`). É um `const` de fixture + comentário,
zero linhas de lógica de motor, e é consequência mecânica de um item que o kickoff mandou fazer.
**Não me auto-autorizei**: não toquei no allowlist do `CLAUDE.md` — fica aqui declarado para o
dono ratificar ou mandar reverter.

Próximo: arquivamento do `_handoff/` + refutação por codex/Ollama.
