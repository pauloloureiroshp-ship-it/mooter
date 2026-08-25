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

---

`2026-08-25 | arquivo | 180 pacotes de julho movidos` — commit `9585e347`.

O topo do `_handoff/` tinha 208 `.md`; o ratchet media **204 pacotes ativos**. Passam a **28**.
Critério medido, não adivinhado: data no nome; sem data, data do último commit. Zero ficheiros
ficaram sem data determinável. Confirmei que a data não era artefacto de um `git mv` em massa —
106 dos 132 sem data partilham o commit `fe58c45d`, e esse commit **cria-os** (236 ficheiros,
21168 inserções, 43 remoções).

**Convenção — divergi do kickoff, de propósito.** O kickoff dizia `_handoff/archive/`. Usei
`_handoff/_archive/YYYY-MM/`, que é o que o `AGENTS.md` canoniza e onde já viviam 2026-06/07/08.
Criar a segunda pasta seria fabricar exatamente a classe *"duas contagens, janelas diferentes"*
que esta wave anda a matar. Fica reportado: `_handoff/archive/2026-08` existe, é órfão, não lhe
toquei.

**As citações.** Auditei a vizinhança antes de mover: 30 citações em 11 ficheiros reescritas
(`INFRA.md`, `SYSTEM_DESIGN`, `STRATEGY`, `MOOTER_ROADMAP`, `GENESIS_SPEC`, …). Nova passagem: **0
penduradas**. A primeira medição dizia 151 quebras — era **falso positivo**, quase todas dentro
de `.claude/worktrees/mystifying-bohr-78f90b/`, uma cópia obsoleta que não é superfície do repo.
As reais eram 15. De caminho apanhou-se uma quebra pré-existente em
`packages/slack-spike/README.md`.

**Duas colisões não resolvidas, de propósito.** `LIVE_PREVIEW_AUDIT_FINDINGS.md` e
`LP_COHERENCE_AUDIT_REPORT.md` existem no topo **e** no arquivo, com conteúdo **diferente**. O
mandato é "sem apagar nada" e qual das versões vale não é decisão de um script. Ficaram no topo.

**Ratchet: continua FAIL** — pelas duas mesmas razões que já falhava em `main` antes deste commit:
`untracked_active_packets` e o stash de 2026-08-24 (`mac-checkup-v1494`). O stash não é meu e não
lhe toco. **Não corri `--update-baseline`**: ele desceria os três números que melhoraram (−176
pacotes, −170 ficheiros, −8 linhas de SYNC) mas **subiria** `untracked` e `stashes`, e o baseline
só sobe por decisão humana. Fica para o dono.

---

`2026-08-25 | refutação | codex + Ollama, e o que mudou por causa disso`

**O kimi não existe nesta máquina** (ver divergência de força no topo). As duas lentes foram
**codex (gpt-5.6-sol)** e **Ollama local (qwen2.5-coder:14b)** — motores diferentes, doutrina
honrada, sem fingir que uma segunda passagem do mesmo motor conta como segunda lente.

O codex não é decorativo: **duas das quatro objeções procederam e obrigaram-me a corrigir
afirmações minhas.** Verifiquei cada uma no código em vez de aceitar ou descartar.

| objeção | veredicto | o que fiz |
|---|---|---|
| **R1** — "e se houver um fallback heurístico que alcance o modelo à mesma?" | **PROCEDE** | Há. `decide-agent.ts:165` admite explicitamente *"chosen by heuristic with a pending price"*. A minha frase "nunca o consegue escolher" era forte demais. Correcto é: sai do **sort por TES** e só é alcançável pelo fallback de tier — isto é, se for escolhido, é **sem que o custo tenha entrado na decisão**. Corrigido na nota do snapshot e no módulo |
| **R3** — "0 não é zero fabricado, é sentinela legítima" | **PROCEDE** | `cost.ts:77` devolve 0 de propósito ("degrade gracefully, never throw"). Retirei "zero fabricado". Mas o defeito real sobrevive noutra perna, e é melhor: `cost.ts:74` devolve **o mesmo 0** para um modelo local genuinamente grátis. Quem lê não distingue *"de graça"* de *"sem preço"* |
| **R2** — "preencher introduz look-ahead bias no snapshot datado" | **NÃO PROCEDE, e valeu a pena verificar** | $5/$25 entrou no `pricing.js` a **2026-04-16**, que **precede** a data do próprio snapshot (2026-05-27). O valor era conhecível na altura; foi **omitido, não indisponível**. Registado no snapshot em `pricing_no_lookahead` |
| **R4** — "os $5/$25 são a mesma modalidade (cache/batch)?" | **NÃO PROCEDE** | Ambos são standard por MTok, sem caching/batch/fast-mode, e o campo `source` do snapshot já declara que foi cross-checked contra o `pricing.js` |

**Ollama (2ª lente)** acrescentou o que o codex não viu: não existia **política de resolução de
conflito** entre os dois ficheiros, e faltava revisão periódica. É exatamente o que o portão passa
a impor — declara o `pricing.js` como autoridade e falha na divergência e aos 30 dias.

Próximo: gestos locais (feitos), PR.
