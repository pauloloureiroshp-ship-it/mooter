# WAVE J · DIAGNÓSTICO — master prompt vs disco

**Gerado:** 2026-07-31 · Cowork (Opus 5) · repo `~/frugal` @ `838dbe1` (main)
**Método:** cada afirmação da tabela ESTADO REAL do `SUPER_MASTER_PROMPT_WAVE_J` foi verificada contra
código, git, o conector em produção, os scheduled tasks reais e o site público. Nada foi inferido.
**Regra:** onde a prova não existe, o veredicto é `NÃO VERIFICÁVEL` — não é `confirmado`.

---

## 0. Sumário executivo — o que muda no plano

| # | Achado | Efeito no plano das 5 fases |
|---|---|---|
| A | **A Wave G.3 escreveu 3 factos falsos no SYNC.md** e ninguém os apanhou durante 2 dias | O registo do próprio projecto é uma fonte contaminada. Medir a Fase 0 em cima dele mede ruído |
| B | **A sentinela é código morto em runtime** — nada no produto a invoca | A Fase 5 não é "agendar o que existe": é ligar o que nunca esteve ligado |
| C | **`aprender.js` não escreve nada** (módulo puro, sem `fs`) | O loop de aprendizagem não persiste. Não há memória entre corridas |
| D | **`afericao.js` também não escreve** e ninguém escreve `~/.mooter/afericao/*.json` | O loop baseline→delta não está "por fechar": está estruturalmente impossível hoje |
| E | **Scheduled tasks JÁ estão em uso** (1 activa, correu ontem) | O claim "nunca usadas" é falso. Há relógio — e há um governador HOTL desligado desde 06/07 |
| F | **O contexto automático é MAIOR do que o master prompt admite** | A Fase 1 (dieta) tem mais gordura do que pensávamos; a Fase 0 tem uma variável escondida |
| G | **O site anuncia v1.44.0 e DoRA; o produto está em 1.29.1 e não tem DoRA** | O F0 de honestidade é maior do que "tirar DoRA": há 4 números de versão em desacordo |
| H | **O CI nunca corre os testes do CLI em Windows** | As "15 falhas Windows" não são um resíduo conhecido — são um ponto cego do gate |

---

## 1. As três mentiras da Wave G.3 (achado novo — não estava no master prompt)

O `SYNC.md` regista a Wave G.3 (2026-07-29) como ✅ com estes artefactos. O disco diz outra coisa.

| Claim no SYNC.md | Disco | Veredicto |
|---|---|---|
| "`tools/router/package.json` — versão bumped 1.0.0 → **1.30.0**" | `grep -m1 '"version"' tools/router/package.json` → `"1.0.0"` | **FALSO** |
| "Git tag `v1.30.0` — criada e validada ✅" | A tag existe. Mas nada no repo está em 1.30.0 → é uma **tag órfã**. Hoje `git describe` dá `v1.31.0-9-g838dbe1` | **ENGANOSO** |
| "`ci-validate-manifest.js` — validator CI (sinc package.json ↔ git tag)" | Existe. `grep -rn "ci-validate-manifest" .github/` → **0 resultados**. Ficheiro órfão, nunca corre | **FALSO** |

**Agravante medido:** se o validator corresse hoje, **falharia** — compara `1.0.0` contra `git describe --tags --always`
(`v1.31.0-9-g838dbe1`), sai `process.exit(1)`. E falharia mesmo com a tag certa: `--always` + distância
nunca produz um semver limpo fora de um commit exactamente tagueado (`tools/router/ci-validate-manifest.js:16-48`).

**Padrão:** a Wave G.3 correu 7 testes que passaram — mas os testes validavam *funções* (`numberOrNull`, flag
`killed`), não o *estado do repositório*. Testes verdes carimbaram um relatório falso. É o mesmo padrão do
fix A4 rejeitado (07-26) e da entrega vazia de 07-27.

---

## 2. A corporação: o que existe, o que está ligado, o que está morto

O master prompt diz: *"Sentinela ✅, aprender.js ✅, scorecard M1 ✅, release workflow ✅ — nada agendado."*
Metade disto não se sustenta.

| Peça | Existe | Escreve estado? | Invocada em runtime? | Veredicto |
|---|---|---|---|---|
| `sentinela.js` (239 L) | ✅ | ✅ `~/.mooter/sentinela/*.jsonl` + `estado.json` (`:48-52`, `:135`) | ❌ **`correrSentinela` não é chamado por nenhum runtime** — só por testes e pelo empacotador | **código morto** |
| `aprender.js` (522 L) | ✅ | ❌ **não requer `fs`; 0 `writeFile`** | ✅ hot path (`seamless.js:1546,1553,1852,2655`; `board.js:167,221`) | **wired mas amnésico** |
| `afericao.js` | ✅ | ❌ docstring própria: *"não escreve resultados"* (`:5-9`) | leitura apenas (`fleet.js:1010-1033`) | **read-only** |
| `board.js` / scorecard M1 | ✅ | ✅ `~/.mooter/scorecard.json` + histórico diário | ✅ | **vivo** |

**Consequência dura:** o par sentinela/aprender foi desenhado como o loop de auto-aprendizagem. Na prática
o que escreve não corre, e o que corre não escreve. **Nenhuma execução aprende com a anterior.**
Não há baseline porque ninguém a grava — `lerUltimaAfericao` lê "o ficheiro mais recente" de uma pasta que
nenhum módulo alimenta (`afericao.js:196-243`).

### Relógio: já existe, ao contrário do que o plano assume

| Task | Cron | Estado | Última corrida |
|---|---|---|---|
| `fecho-do-dia-mooter` | `0 19 * * *` | **ENABLED** | 2026-07-30 22:06 UTC |
| `cowork-loop-evaluator` (governador HOTL, consumidor de `NEEDS_DECISION.json`) | `*/10 * * * *` | **DISABLED** | 2026-07-06 |

O `fecho-do-dia` já escreve no vault e no Notion HQ diariamente. A Fase 3 ("journal automático no fecho de
wave" + "espelho Notion como 1.ª tarefa agendada") está a propor construir algo que corre há dias.
E existe um governador HOTL construído e desligado há 25 dias — a peça central da Fase 5, parada.

---

## 3. Contexto e payload — a dieta tem mais para cortar

| Claim | Veredicto | Prova |
|---|---|---|
| "Contexto automático: só `roots/list` + goal + ficheiros citados" | **PARCIAL — subestima** | Falta a 4.ª fonte: um **MAPA COMPACTO DO PROJECTO** injectado no masterprompt com stack, comandos de teste, CLAUDE.md/AGENTS.md, top-level, **`git log` de 10 commits e os 20 ficheiros mais tocados** (`seamless.js:1485,1494-1500`; `fosso.js:243-275`) |
| "`session_model` n/d" | **CONFIRMADO** | Nunca lido do protocolo (`fleet.js:996-1003,1568`) |
| "Sem identidade de sessão/projeto" | **CONFIRMADO** | `session_bind` 100% manual, recusa bind vazio (`fleet.js:673-692`). Único automatismo é a pasta (`seamless.js:2403-2406`) |
| "mooter_fleet ~15KB/chamada" | **CONFIRMADO na ordem de grandeza — e a causa está identificada** | Medido hoje: `view=board` ≈ 6,5 KB; `view=recibo` ≈ 11 KB. **No recibo, 7 dos 8 blocos de cargo são "nenhum trabalho deste cargo na janela"** — cada um com ~1 KB de zeros justificados. ≈ 67% do payload é preenchimento vazio |
| "recibo ~40 campos" | **CONFIRMADO** | Cada cargo traz `waves/entregas/custo/trabalho_a_zero/tokens/excepcoes` com `valor`+`porque` mesmo a zero |

**Conclusão para a Fase 1:** a dieta mais barata não é `verbose:true` — é **suprimir blocos vazios**.
Corta ~2/3 do recibo sem perder um único facto medido.

---

## 4. Relocation — pior do que o registado

| Claim | Veredicto | Prova |
|---|---|---|
| "Relocation entregou resposta ERRADA em 30/07" | **NÃO VERIFICÁVEL** | A única fonte é o próprio master prompt. `git log --since=2026-07-28 -- packages/mooter-bridge` não tem commit de relocation |
| "O fix H3 foi parcial" | **CONFIRMADO — por ausência total de mecanismo** | `firstFree` valida `exists && !busy && !bare && !detached && !suspeita(temp)` + `existsSync` do ficheiro (`worktrees.js:135-153`). **Zero verificação de frescura de branch, data de commit ou distância ao main.** Um ficheiro stale numa branch velha passa o teste |
| Existe teste de regressão? | **NÃO EXISTE** | `grep -rn "login.ts" packages/mooter-bridge` → 0. Os 2 testes de relocação (`seamless.test.js:490-508`, `ondaA.test.js:183-193`) cobrem worktree ocupada e picker a recusar %TEMP% — **nenhum cobre "ficheiro existe mas está desactualizado"** |
| O resumo avisa? | **NÃO** | `worktreeSuffix` → `' · relocado para X (pedida: Y)'` — sem ⚠️, sem branch, sem idade (`seamless.js:1009-1016`) |

---

## 5. Proveniência

| Claim | Veredicto | Prova |
|---|---|---|
| "install-id shipped e sem nenhum consumidor" | **CONFIRMADO** | `grep -n "require(.*install-id" packages/mooter-bridge/*.js` → **0**. Só `install-id.js` e `entrega.test.js` o mencionam. Ledger não carimba `install_id` |
| "journal sem schema" | **FALSO** | Tem `inputSchema` completo com `additionalProperties:false` (`tools6.js:293-304`) |
| "journal sem carimbo device/user" | **CONFIRMADO** | Frontmatter: `title, date, source, wave, jobs, cost_usd, tags` (`journal.js:117-125`). Zero device/install-id/user |
| "espelho Notion manual" | **CONFIRMADO** | `grep -ri notion packages/mooter-bridge/*.js` → 0 |

**Bug lateral novo:** `toolJournal` lê `a.subfolder` (`seamless.js:2353`), mas `subfolder` **não está no
schema** e `additionalProperties:false` — o parâmetro é inatingível pelo modelo. Código que nunca executa.

---

## 6. LoRA / DoRA e o site público

| Claim | Veredicto | Prova |
|---|---|---|
| "forge+benchmark existem com métricas reais" | **CONFIRMADO** | `packages/cli/src/commands/forge.ts` (209 L) corre o classificador real 2× sobre o golden set e escreve `accuracy_delta`; `:87` recusa mostrar performance antes do benchmark |
| "nenhum adapter no loop de produção" | **CONFIRMADO** | `routing-lorauter.ts:30` → `AUTO_SWAP_ENABLED = false`. `grep -rn "lora\|loadAdapter" packages/mooter-bridge/*.js` → **0** |
| "DoRA não aplicado" | **CONFIRMADO** | `grep -rn -i dora` em `packages/cli/src`, `packages/synthesis/src`, `manifest.json` → **0**. Já existe guarda: `estranho.test.js:147` recusa "DoRA" no manifest |
| "o site chegou a afirmar o contrário" | **CONFIRMADO — ainda afirma, hoje** | mooter.ai, secção *Why a local model is good enough*: **"🧩 LoRA / DoRA — Adapter layers fine-tune the base model for your codebase — ~80 MB each, trained overnight on your machine. Free when local."** |

### Achados adicionais no site (não estavam no master prompt)

| Superfície | Diz | Realidade medida |
|---|---|---|
| Header mooter.ai | **"v1.44.0"** | `manifest.json` = **1.29.1** · tag mais recente = **v1.31.0** · `tools/router/package.json` = **1.0.0** |
| Header | "classify.js unchanged 19 waves" | Plausível (CI-enforced por sha) mas o "19" não tem fonte no repo |
| Hero (5×) | "47% saved across 658 routed calls" | Descrito na mesma página como *"across the author's moos"* **e** *"across 7 moos"* — duas descrições do mesmo número |
| Hero | "Spawns agents safely by default" | O P0 de propagação de env só foi fechado a 30/07 (H1); o guard A4 foi rejeitado por permitir execução arbitrária (07-26) |
| Rodapé de métricas | "Opted-in herd telemetry goes live soon" / "rolls out separately" | O install-id, base da telemetria, tem **zero consumidores** |

**Portanto o F0 de honestidade não é uma linha.** São 4 números de versão em desacordo, uma capacidade
inexistente anunciada, e uma métrica com duas proveniências na mesma página.

---

## 7. Multi-projeto — não é greenfield, mas está pior amarrado do que parece

| Claim | Veredicto | Prova |
|---|---|---|
| "o código assume o frugal" | **CONFIRMADO** | O marcador de repo é `tools/router/classify.js`, ficheiro exclusivo do frugal (`server-apps.js:92,104`). Fallbacks hardcoded `~/frugal` e `~/Documents/frugal` (`server-apps.js:53-54,98-99,169`; `update.js:127-128`; `worktrees.js:43`) |
| "sem suporte a múltiplos projetos" | **CONFIRMADO** | Raiz é **um** `MOOTER_REPO` global lido uma vez no arranque (`seamless.js:69`, `fleet.js:52`, `tools6.js:41`). `mooter_setup({project})` é só um rótulo de sessão. `grep -i "MOOTER_PROFILE\|profiles"` → 0 |
| "nunca testado fora do frugal" | **PARCIAL** | Existe **exactamente um** teste que instala o bundle e corre num projecto fora do frugal com `HOME` vazio: `estranho.test.js:114-193`. Está **untracked** e **fora do CI** |

---

## 8. Higiene — os números reais

| Item | Master prompt | Medido |
|---|---|---|
| Untracked | "~250" | **249** ✅ |
| Stash pendurado | "1 (`wip-package-json-pre-wave-h`)" | **10 stashes**, o mais antigo de 03/07 |
| `estranho.test.js` | "untracked, 2 achados abertos" | Untracked ✅ (10 653 B, 28/07). Documenta **3** sintomas (`:11-22`), tem 2 blocos `test()` com 6 assertivas-guarda |
| 15 falhas Windows CLI | "pré-existentes" | **CONFIRMADO** por 4 fontes independentes — **e `cli-test` corre só em `ubuntu-latest`** (`.github/workflows/test.yml:230`). O CI **nunca** vê estas falhas |
| SYNC.md gerado | — | Preso em **v1.24.1 / branch `chore/mooter-20-h0` / 27-07**. O gerador não corre há 4 dias e 5 versões |

---

## 9. Capacidades MCP — confirmado, com uma nuance

| Claim | Veredicto | Prova |
|---|---|---|
| "2 de 6 capacidades" | **CONFIRMADO** | `capabilities: { tools: {}, resources: {...} }` (`server-apps.js:363`). Zero handlers de `prompts/*`, `sampling/*`, `elicitation/*`, `logging/*` |
| "elicitation inexistente" | **CONFIRMADO** | Só existe como campo sondado (`capacidades.js:14`) |
| "sem injecção de instruções" | **CONFIRMADO no protocolo, FALSO no prompt** | `initialize` não devolve `instructions` (`server-apps.js:358-368`) — mas o conector injecta instruções no prompt do agente (`context.js:139-149`) |
| "`user_config` só renderiza `sensitive`" | **NÃO VERIFICÁVEL** | O manifest declara 4 campos, 1 com `sensitive` (`manifest.json:44-70`). O que o host renderiza é runtime do Cowork, sem medição registada |
| "MCP Apps nunca renderizou" | **NÃO VERIFICÁVEL** | O código `_meta.ui` está activo (`server-apps.js:284,400,451`). Sem log |

**Nota:** já existem 3 artifacts Cowork do Mooter (`mooter-cockpit` 24/07, `mooter-recibo-de-fecho` 28/07,
`mooter-golden-screen`). O "artifact-cockpit como plano A" da Fase 2 tem base construída.

---

## 10. Recomendação

O plano de 5 fases assume um sistema que **regista mal mas mede bem**. O diagnóstico mostra o inverso:
mede bem no momento (`board.js` é sólido e honesto), e **não guarda nada** — nem baseline, nem
proveniência, nem estado entre corridas. E o registo que existe (SYNC.md) contém factos falsos que
sobreviveram 2 dias.

**Correr a Fase 0 antes de fechar isto mede um sistema cuja régua não retém memória** — o A/B do handoff
(`prepare:false`) precisa de baseline para significar alguma coisa, e baseline é exactamente a peça que
não existe.

Sequência sugerida, com a tarefa-espelho já escolhida pelo Paulo (**ligar o install-id ao ledger**):

| Ordem | O quê | Porquê agora | Custo |
|---|---|---|---|
| **J-1** | Persistência: `aprender.js`/`afericao.js` passam a escrever; sentinela é invocada pelo produto | Sem isto não há baseline, e sem baseline a Fase 0 não conclui nada | ~meio dia |
| **J-2** | Verdade do registo: matar a tag órfã, alinhar as 4 versões, ligar `ci-validate-manifest` ao CI, comitar `estranho.test.js`, correr `cli-test` também em Windows | Fecha o buraco que produziu as mentiras da G.3 | ~meio dia |
| **J-3** | **Fase 0 — a sessão-espelho** com a tarefa `install-id → ledger` | Agora mede um sistema que não mente e que retém | 1 dia |
| **J-4** | F0 de honestidade do site (DoRA + versão + proveniência dos 47%) | Reversível, independente, e é exposição pública | ~2 h |

As fases 1, 2, 4 e 5 mantêm-se como estão no master prompt, reordenadas pelo gate da Fase 2.

---

## Anexo — o que ficou por verificar

| Item | Porquê |
|---|---|
| Kimi HTTP 401 | Exige chamada real com a key; não testado nesta sessão para não gastar nem tocar na key |
| "6/6 verde" do conector | Não corri a bateria |
| `user_config` / MCP Apps a renderizar | Runtime do host Cowork, não observável a partir do repo |
| Relocation errada de 30/07 | Sem prova independente no git ou nos logs |
| "19 waves" e origem dos 658 calls | Sem fonte rastreável no repo |
