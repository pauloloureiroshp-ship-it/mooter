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

---

`2026-08-25 | gestos locais | feitos`

| gesto | estado | verificação |
|---|---|---|
| `cowork-session.json` ↔ `sessoes/mooter.json` | **alinhado** | estava `mooter-pilar-coerencia` (bound 16/08, stale) vs `mooter-gpu-local-strategy` (actualizado hoje). Ambos em `mooter-gpu-local-strategy`; paridade confirmada por leitura dos dois ficheiros. Backup em `cowork-session.json.bak-2026-08-25`, e a razão do realinhamento ficou escrita no campo `note` — não mudei um valor em silêncio |
| `~/.mooter/preferences.json` | **criado** | não existia. `{"statusline_line3": true}`. Nota: o caminho é `~/.mooter/`, não `~/.claude/` |
| arquivar `_handoff/` | **feito** | ver marco do arquivo |

Nada disto está no PR — são estado de máquina, fora do repo, por desenho.

---

`2026-08-25 | FECHO | PR #390 aberto, CI verde`

**17/17 checks não-Vercel passam**, incluindo `cockpit tests (windows)`, `a suite não pode
piorar` e `a higiene não pode piorar`. As 2 falhas Vercel são **rate-limit de deploy** ("retry in
24 hours"), não código.

**O CI apanhou-me uma vez, e valeu a pena.** O primeiro push falhou em `a higiene não pode piorar`:
`sync_lines 631 > 606 (piorou 25)`. A culpa era minha — a declaração de escopo que o mutex pede
tinha 33 linhas, e o `SYNC.md` é um **snapshot, não um log**. Comprimida para 3 linhas. Repare-se
que **localmente eu não tinha visto isto**: local o ratchet falhava por `untracked` e `stashes`, que
no checkout do CI não existem, e essas duas mascaravam a métrica que era mesmo minha.

Fica em 603 linhas — passa, mas **por 3 de margem**. O `SYNC.md` continua a ~3x o orçamento
canónico (~220) e o `WARN SYNC_TOO_LONG` continua de pé. Enrolar o histórico para
`docs/foundation/SYNC_ARCHIVE_2026.md` é o gatilho documentado, mas mexe num ficheiro partilhado
com o CC do PC a meio da missão dele — **não o fiz**.

### O que precisa de decisão do dono (nada disto foi auto-autorizado)

1. **Ratificar** a edição de fixture em `packages/router/tests/cache-aware-cost.test.ts` — fora do
   allowlist da Wave 58. `const` + comentário, zero lógica de motor. **Não toquei no allowlist do
   `CLAUDE.md`.**
2. **`claude-fable-5`** — precificá-lo exige primeiro resolver o campo `tier: T5` do snapshot
   contra o "priceable, not routable" do SSOT.
3. **Baseline do ratchet** — três métricas melhoraram muito (−176 pacotes, −177 ficheiros); um
   `--update-baseline` desce-as, mas **subiria** `stashes`. Não corri.
4. **Duas colisões** por resolver: `LIVE_PREVIEW_AUDIT_FINDINGS.md` e `LP_COHERENCE_AUDIT_REPORT.md`
   existem no topo **e** no arquivo, com conteúdo diferente.
5. **`_handoff/archive/2026-08`** — órfão da convenção antiga, ao lado do canónico `_archive/`.
6. **Stash `mac-checkup-v1494`** (24/08) — trabalho fora de qualquer commit. Não é meu, não lhe toquei.

### O que ficou por fazer, e porquê

**F1, F2, F3, F4 do masterprompt não foram abertos** — são do PC/dono por mandato do kickoff, e o
mutex proíbe. O `SKILL.md` duplicada do moo-pilot foi **refutada** (não existe). O `mooter-cabine`
existia com outro nome e era um defeito maior do que o enunciado.

**O `kimi-k3` não correu**: não existe canal para ele nesta máquina. Está declarado no topo em vez
de ser silenciosamente substituído.

---

`2026-08-25 | FECHO 2 | as seis pendências do dono, decididas por delegação escrita`

O dono delegou por escrito (via Cowork, ~19:00Z: *"resolver tudo como sempre"*). Tudo o que se
segue foi decidido **em nome dele, por instrução escrita** — não é auto-autorização, e está
registado assim em cada commit e no PR.

### O que fechou

**#390 mergido.** O ramo estava `CONFLICTING`: o `main` tinha avançado de `9c54af2c` para
`77cc92bc` (o PC entregou #388, #389, #391, #392). Único conflito: `SYNC.md`, colisão de append.
Resolvido mantendo **as duas** entradas. 21/21 checks verdes no momento do merge — até os dois
Vercel, que recuperaram sozinhos do rate-limit.

**Item 4 (colisões), item 5 (archive órfão), item 7 (corpus).** Feitos, nada apagado sem medir
primeiro. Detalhe nos commits.

### O item 2 caiu — e não por opinião

O plano dizia: *remover o campo `tier` do fable-5 (deixa de ser ordenável por custo), e só então
precificar do SSOT*. A missão mandava refutar antes de codificar. **As duas metades caem**, medidas
contra o motor real:

| | `decideAgent({task_category:"reasoning.science"})` |
|---|---|
| hoje | `chosen_model: null` |
| sem `tier` + preço $10/$50 do SSOT | **`chosen_model: "claude-fable-5"`, TES 3784** |

Ninguém escreveu `@fable`. **O passo final do plano produzia exactamente a violação que o plano
existia para evitar.**

Porquê: o campo `tier` só alimenta o proxy heurístico usado quando **não há score medido**. A
ordenação por TES depende de **preço**. O fable está no roster e tem a **única** célula medida de
`reasoning.science` (0.946, GPQA Diamond) — falta-lhe só um preço para ganhar a categoria sozinho.

E remover o campo tem um efeito colateral que o plano não previa: `tierForModel()` devolve `"T2"`
por omissão. Tirar o `"T5"` **não apaga o tier — troca uma etiqueta verdadeira por uma falsa**, e
põe as superfícies a dizer `tier-heuristic:T2` sobre o Fable. Por isso o campo **fica**, e a
divergência com o SSOT passa a estar declarada nos dados (`tier_diverges_from_ssot`).

**O que hoje segura o invariante é a ausência de preço, e mais nada.** Não existe exclusão de T5
dentro do `decideAgent` (verificado por grep). O sítio certo para a correcção é lá — mas
`decide-agent.ts` é ficheiro de motor congelado e o allowlist da Wave 58 diz *"new files only — no
existing engine file is modified"*. **Não mexi.** Entra um **arame**, não uma correcção:
`precificavel-nao-rotavel.mjs` + teste no comando do CI, que dispara no instante em que a violação
se torna possível. O teste `ARAME` semeia o estado proibido com os ficheiros reais e exige que o
portão acuse — sem ele, os assertos ancorados podiam estar verdes por o código não fazer nada.

**Adversário:** o `codex` que a missão pedia **não está instalado nesta máquina** — `n/d`, não
fingido. A refutação correu no adversário que há (Ollama `gpt-oss:20b`, local, $0) e confirmou os
quatro pontos de forma independente. O mesmo validou o item 4.

### O item 3 parou, como estava mandado

O stash `mac-checkup-v1494` **não era resíduo**. Medido: ~230 das 294 linhas adicionadas **não
existem em nenhum ref do repositório**. `medirParidade` e `BEACON_FRESH_REMOTO_S` não aparecem em
`git log --all -S` nem em branch nenhum. `verConector` é a excepção — essa fatia já aterrou pelos
PRs #335, #337 e #351, e está superseded.

O que há de único é uma funcionalidade inteira por entregar: **PARIDADE** (cada device leva no
beacon versões, sha e paths, para o painel de *qualquer* device acusar a diferença) e a **frescura
de beacon remoto** (um device remoto julgado pela cadência do sync, não pelo relógio local — sem
isto, um Mac a publicar de 10 em 10 min aparecia no PC como *"sem sinal há 716s"*).

Preservado em `mac/stash-paridade-2026-08-24`, no próprio commit-base dele. **A stash original NÃO
foi dropada** e continua em `stash@{0}`. Não vai a merge sem o dono.

### O item 6 fica bloqueado, e a razão é mecânica

`--update-baseline` **não** actualiza só as métricas que melhoraram: reescreve o ficheiro inteiro
com a medição corrente (`tools/docs-hygiene.js:313-320`). Correr agora gravaria `stashes: 1` e
**subiria o limite de 0 para 1 em permanência** — que é exactamente o que o ratchet existe para
impedir. E a única razão para `stashes` ser 1 é o item 3 ter mandado *não* dropar.

Ficam por baixar, quando o stash for decidido: `active_packets` 204 → **26**,
`top_level_handoff_files` 312 → **141**, `sync_lines` 606 → **598**.

### Continua a precisar do dono

1. **Stash / branch `mac/stash-paridade-2026-08-24`** — mergir, refazer sobre o `main` de hoje, ou
   descartar. Enquanto não decidir, o item 6 fica bloqueado.
2. **Precificar o `claude-fable-5`** — só depois de a exclusão de T5 viver em código dentro do
   `decideAgent`, o que exige entrada nova no allowlist da Wave 58 e autorização dele.
3. **Baseline do ratchet** — três métricas prontas a descer muito, à espera do nº 1.
4. **`packages/mooter-bridge/package-lock.json`** untracked. Os outros cinco packages têm o lock em
   git; este não. Não o adicionei: um lockfile tem implicações de dependências e não estava no
   enunciado.
5. **`SYNC.md` continua a ~3x o orçamento** (598 vs ~220). Enrolar para o arquivo mexe num ficheiro
   partilhado com o PC — continua por fazer, pela mesma razão de ontem.

**F1–F4 continuam fora**, como manda o kickoff.
