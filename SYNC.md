# SYNC — projecção verificável do estado Mooter

> Este bloco é gerado por `packages/mooter-bridge/sync.js`. Edita apenas a zona humana delimitada no fim.

## Cabeçalho

- versão instalada: 1.49.4
- HEAD: ad0deaede95ebc0404a4b6d09dab5f79e4f13457
- branch: mac/sistema-sync-2026-08-25
- remoto: n/d (porque não foi possível determinar o upstream: fatal: no upstream configured for branch 'mac/sistema-sync-2026-08-25')
- gerado_em: 2026-08-25T20:17:14.000Z (derivado do último facto observado; não do relógio da execução)

## Entregas

| Versão | Entrega medida | Commit que a trouxe |
|---|---|---|
| v1.20 | sentinela.js, afericao.js | 44c9a803 — feat(mooter-bridge): v1.20.0 - os dois loops de self-learning: sentinela horaria que ESCREVE em vez de gritar (so transicoes, custo zero) e afericao com tarefas de resposta conhecida que mede custo por resposta certa por motor; estudo dos pilares de vibe coding com a bateria real (moo 3/3 em 7s a 0 USD contra sonnet a 0.44 USD) |
| v1.22 | n/d (porque a versão não tem entregas descritas na fonte) | 09e1e948 — fix(mooter-bridge): v1.22.0 - L1 fecha os 14 loopholes da auditoria UX: nenhum agregado nasce a 0 (somatorio sem parcelas medidas e n/d com jobs_sem_medicao), totals e arvore derivam da mesma funcao, medido_em+fresco+idade_h por bloco, blocos vazios desaparecem e o coherence deixa de mostrar stderr de ambiente; e o BUG DE TIJOLO: o verificador rejeitava o shebang dos nossos proprios ficheiros e teria trancado todas as instalacoes futuras |
| v1.23 | board.js, seamless.js, tools6.js, server-apps.js | cfc3f5dc — ﻿feat(bridge): onda 1 - parar a mentira (v1.23.0) |
| v1.24 | capacidades.js, eta.js, estimativa.js, fleet.js, fleet-ui.html, sync.js, worktrees.js | 8bc25a07 — chore(sync): regenerar SYNC.md para v1.24.1 |
| v1.25 | moo.js, localfirst.js, estimativa.js | fe58c45d — feat(bridge): tecto de VRAM, a ETA para de fingir 100%, e os gates entram no CI (v1.25.0) |
| v1.26 | recibo.js, seamless.js, tools6.js, fleet.js | bf84d0ec — feat(bridge): o trabalho passa a saber de que departamento e (v1.26.0) |
| v1.27 | manifest.json, tools6.js, update.js, seamless.js, fleet.js | n/d (porque nenhum commit do branch menciona v1.27) |
| v1.28 | manifest.json, tools6.js, update.js, seamless.js, kimi-adapter.js, fleet.js | 26366897 — chore(bridge): bump version to 1.28.1 (force updater past old kimi bundle) |
| v1.28.1 | manifest.json | 26366897 — chore(bridge): bump version to 1.28.1 (force updater past old kimi bundle) |
| v1.29 | manifest.json, seamless.js, kimi-adapter.js, install-id.js | 838dbe17 — fix(bridge): manifest.json v1.29.1 ÔÇö DXT schema violations blocking install |
| v1.32 | recibo.js, recibo-contexto.js, fleet.js, tools6.js, kimi-adapter.js | a157c095 — feat(bridge): v1.32.0 - dieta de payload, schema destravado e recibo com contexto |
| v1.33 | seamless.js, tools6.js, worktrees.js, fosso.js, moo.js, afericao.js, aprender.js, kimi-adapter.js | 3506c762 — chore(release): sync version.json → 1.33.0 [skip ci] |
| v1.45 | fatia-local.js | 4d4254fc — chore(release): sync version.json → 1.45.4 [skip ci] |
| v1.47 | retry.js, terminal.js, board.js, fleet.js, seamless.js | 3af2c2ce — chore(release): adiciona v1.47 a entregas-por-versao.json |
| v1.48 | trilha.js, trilha-tool.js, seamless.js, fleet.js, tools6.js, probe.js, server.js | 72b8e31f — chore(release): 1.48.0 -> 1.48.1 para o .mcpb do piloto poder instalar |
| v1.49 | capacidades.js, server-apps.js, probe.js, fleet-ui.html | 15280a66 — chore(v1.49.4): a versao lidera a tag (#348) |

## Trabalho recente (até 1 jobs terminais)

### validacao-generalizacao-2026-08-18

- `job-msyeuimh-84b1` · agente=moo · actor={"type":"system","id":"legacy","origem":"evento anterior à instrumentação de identidade (f-mu0)"} · actor_porque=n/d (porque o evento não contém actor_porque; nunca inferido) · duração=20 (fonte: ledger.duration_s) · desfecho=entregue · custo=0 (fonte: ledger.cost_usd) USD

## Zona humana

<!-- HUMANO:INICIO -->
> **SNAPSHOT, nao log.** Orcamento ~220 linhas; ao passar, rola-se a historia
> para `docs/foundation/SYNC_ARCHIVE_2026.md` (`docs-hygiene` avisa).
>
> O bloco acima e da MAQUINA. Precisa dos DOIS marcadores da zona humana —
> faltava o de FIM, o `extractHumanBlock` lancava em todas as corridas, e o
> cabecalho serviu `v1.24.1 / 2026-07-27` durante um mes com a maquina em
> `v1.49.4`. Regenerar: `node packages/mooter-bridge/sync.js --max-jobs 1`

# Mooter — Sync Snapshot

## 2026-09-12 · A/B do Moo Audit — os 7 em `main`; o 7.º reconstruído sem as regras vendorizadas (licença)

Ordem e commits de merge (merge commits, sem force-push; cada PR actualizado com `main` e
com os 5 checks obrigatórios verdes antes de entrar): #411 `4bd4eb52` · #412 `56591f14` ·
#413 `e9eee9d8` · #414 `fd6d99a4` · #506 `2d3b4416` · #415 `c0724479`. `main` @ c0724479:
7 workflows de push verdes (test, design-gate, wave-gate, docs-hygiene, ratchet, slack-spike,
install-reliability). Gate de pré-merge (`final-reviewer`) antes do primeiro merge: 2 BLOCK; segundo gate sobre o #512 antes do 7.º.

- **#506** tocava 4 ficheiros de `packages/cli` (onda 34) sem a entrada de allowlist que o
  `AGENTS.md` § Invariants exige no mesmo PR — acrescentada em `CLAUDE.md` (bd15e40a) antes do merge.
- **#505 (F2) fechado sem fundir; reconstruído como #512 e fundido em `b0edf916`.** Os 4
  `_handoff/ab-audit/regras-semgrep/p-*.yaml` (409 regras, 1 017 001 bytes) trazem, regra a regra,
  `license: Semgrep Rules License v1.0`; o texto (semgrep.dev/legal/rules-license, lido 12/09) diz «You
  may use the rules only for your own internal business purposes» e «This license does not allow you to
  distribute the rules». O repo é PUBLIC + MIT. Estiveram 17 dias no branch público (a exposição existe;
  branch apagado, `refs/pull/505/head` fica). Decisão do dono: opção (a). O #512 é a árvore do #505 sem
  os yaml, em 4 commits (017ba263 … 4e44f34f): o `MANIFESTO.json` fica com os 4 sha256 e `distribuivel: false`;
  `ab-vendorizado.mjs` ganha a licença como 4.ª maneira de falhar (yaml no repo ⇒ `FALHA [licenca]`; sem
  cópia externa ⇒ `N/D` declarado; `--regras <dir>` ⇒ sha256 + licença lida ×409); a árvore do #505
  reprova com 4 × `[licenca]`, a nova dá `N/D`; scripts do braço A lêem de `$HOME/ab-braco-a/regras-semgrep`
  (WSL) ou `AB_REGRAS_SEMGREP` — verificado: cobertura 89, `S2 --limpo` byte-idêntico ao recibo. O
  veredicto da F2 não muda; o pré-registo não muda. Residual declarado: os 18 recibos JSON trazem
  `extra.message`/`extra.metadata` das 7 regras que dispararam (saída do semgrep, sem padrões).
- Vercel a vermelho em #414/#506/#415/#512 por `build-rate-limit` (quota de builds de preview);
  não obrigatório; 0 ficheiros de `landing/` nos quatro.
- #414: mudar a base de um PR (`edited`) não dispara `pull_request: branches: [main]` —
  ficou `BLOCKED` com os 4 obrigatórios por correr; fechar/reabrir correu-os (25/25).
- Worktrees temporárias removidas: `frugal-ab-pre`, `frugal-ab-f01`, `frugal-ab-f02`.

## 2026-09-11 · A/B do Moo Audit — retoma 16 dias depois: 7 PRs abertos, **nada merged**

Os cinco PRs de 2026-08-26 (#411-#415) ficaram parados com o `main` a andar ~90
PRs. Todos fundidos hoje com `origin/main` a346230c **por merge, não rebase**
(sem force-push). Dois PRs novos: **#505** (F2 · braço A) e **#506** (fan-out com
0 fontes). Decisão de IP continua do dono. Vault: `10-projects/2026-09-11-ab-moo-audit-retoma-…`.

| PR | o quê | número de hoje |
|---|---|---|
| #412 F0.1 | segredos — árvore e histórico de `origin` re-varridos | **HIGH 0** · LOW 2735 (era 2424, por triar) · INFO 92 |
| #413 F0.2 | índice do arnês | **3,04/10** @ d12908c0 (2,89 ao retomar; 3,34 a 26/08) |
| #413 C5 | telemetria — passou a ler `recibo.js` | **81/1698** turnos com custo medido casam com uma decisão (4,8 %); o 0/4830 era zero por construção |
| #413 C4 | frota no mesmo sha | n/d: **3 beacons, os 3 expirados** (desktop 27/08, mac 26/08, paulo-desktop 03/09) |
| #414 F0.3 | catraca | 180 → **193** ao retomar (+15 em 16 dias, 5 do motor) → **186/668** depois de ligar 8 ao CI e justificar 8 |
| #415 F1 | prova de rede, 4.ª ronda | `true` **só por construção** (namespace); sentinela = evidência; jscpd/knip em Windows nativo ⇒ `null`, exit 3 |
| #505 F2 | braço A + **F2 publicada** (12/09, decisão do dono: sem emendar a amostragem) | **FALHA por INCONCLUSIVO nos 3 sujeitos** (§7.3 + §7.1): calibração do §3 consome 22/22, 2/2, 4/4 ⇒ n = 0; 0 rótulos; B e C não corridos; S2/S3 re-corridos no sha (idênticos); codex `PASSA-COM-RESSALVAS` — `_handoff/AB_MOO_AUDIT_F2.md` |
| #506 | `mooter audit fan-out` noutro repo | 0 fontes × 6 facets: antes `exit 0` com achados inventados; agora o LLM não é chamado e sai 1 |

**Adversário.** `codex` (OpenAI) voltou a ter créditos; o sandbox não cria
processos nesta máquina (`CreateProcessAsUserW … 5`), correu desligado em
worktrees limpas com `git status` vazio verificado. **Bloqueou os 5 PRs de
código à primeira** (#413, #414, #415, #505, #506), todos com reprodução;
14 rondas no total, veredictos publicados como comentário. Recusou a 4.ª ronda
do #415 por filtro de cibersegurança — declarado no PR; Ollama `qwen3.6:27b`
como recurso, com o peso baixo escrito.

**Abandonado:** `ab-audit/telemetria` (a1c35d22, atribuição por `session_id`)
— o `recibo.js` de main (28/08) refuta essa chave. O hook Stop deixou de ser
preciso. Worktree `~/frugal-ab-tokens` pode ser removida.

**Só o dono:** merge dos 7 — **feito a 12/09** (bloco acima; o #505 entrou reconstruído como #512, sem as regras vendorizadas);
F2 — **decidido a 12/09: publicado o INCONCLUSIVO sem emendar**; um resultado conclusivo exige outro pré-registo;
fan-out — probes genéricos ou auto-auditoria assumida; `git pull` no mac e no paulo-desktop.

## 2026-09-10 · MATRIZ 12 — o Mooter contra a escolha real do utilizador, e perdeu

`_handoff/matriz-12-2026-09-10/` (branch `claude/matriz-12-mooter-comparison-3c2b8e`). Índice em `verdict.md` (v3); cópia no vault `20-mooter/artifacts/matriz-12-2026-09-10/`; 17 linhas no `INBOX.md` do livro.

**Perdeu, e está impresso:** 12 prompts, 4 braços, juízes cegos de duas famílias (Codex, Sonnet 5) com ordem sorteada. **A rota do Mooter 56,5/128 · Haiku 4.5 80,5 · Opus 5 100,5 · Codex 109,0.** O Haiku custou **menos** em lista imputada ($0,1527 contra $0,1620, cache incluído; sem cache a distância alarga). 10 dos 12 foram para local, 2 para Opus, **0 para T1/T2**. No OPS-3 («onde guardo a chave da API no Next.js para não ficar exposta no browser») a rota foi local e a resposta não trata o `NEXT_PUBLIC_`.

**M12-b, corrido a seguir:** só a linha «nunca mais de 3 frases» do system prompt local trocada — **+1,5 em 104**, do tamanho da deriva dos braços que não mudaram (A +0,5, C +2,0, D +1,0). Não era a causa. Sem a linha, o mesmo modelo passou a **recomendar** `NEXT_PUBLIC_` no OPS-3 (0/12). A correcção que a matriz pede é a rota, não o prompt; o D10 vai em PR rascunho separado, marcado «não mergear isolado».

**Adversário (Codex, 17 ataques, todos aceites):** ruído não é calibração; B é Qwen em 10/12, logo o viés de família do J2 pesa *contra* o Mooter; MKT-3 cumpre o critério registado (6/12 previsões, não 5); a conclusão «30b é pior» morreu (sem os 2 truncados a ordem inverte); pré-registo **não ancorado em commit** — falha de processo, declarada.

**11 defeitos** (`09-DEFEITOS-APANHADOS.md`). D1 (o pin local cortava aos 256 tokens) foi fundido por outra sessão como **#498** durante o julgamento — esta pasta foi rebaseada para cima dele. D7: o arbiter de Haiku é no-op nesta máquina (sem `ANTHROPIC_API_KEY`); 7 dos 12 caíam nele. J3 (humano) por preencher, mas a chave está em claro no pacote: cego já não é possível para o autor.

**Não toca no #495** («o router como está»): nenhum ficheiro do motor muda neste PR.

## 2026-09-09 · Pacote de provas v1 — as hipóteses do deck trocadas por medições

`_handoff/provas-v1-2026-09-09/` (branch `claude/pacote-provas-v1-255558`, **por fundir e por empurrar**). Índice em `08-PACOTE.md`; cópia no vault `20-mooter/artifacts/`.

**Ganhou por construção:** classificar custa 0 tokens e não registou destino externo (1 176 classificações); o routing por custo do LiteLLM escolheu o motor a $0 **0 de 40 vezes**; o protótipo do recibo faz 156/156 com custo, origem e tokens.

**Perdeu, e está impresso:** precisão da regra em prompts reais **35 %** [22, 51] contra 52,5 % de um juíz local e 45 % de «T2 sempre»; obediência executada **0/20 nos dois braços**; recibo com custo e origem no ledger vivo **0/1 451**; com chave, o árbitro monta o pedido com o prompt inteiro (20/20); o hook custa 207 ms de mediana. Empate: crítico noutro motor 26/28 contra 27/28 do Opus, p = 1,0.

**P7 (R-24, usar vs não usar) fechou à quarta corrida: `GANHOU`, 18 de 23 tarefas com trabalho aceite em ≤ 0,8× do tempo** (limiar pré-registado 16, p nominal 0,00531, 23/23 pares válidos). Os dois braços passaram o teste congelado em 23/23 — mexeu o tempo, não a qualidade observável (mediana 77 s contra 145 s). **O estatuto confirmatório não se reclama:** a regra de paragem foi quebrada (a 4.ª corrida arrancou depois de 3 não-resultados, com parciais favoráveis à vista), e isso está no próprio título do cartão. As quatro corridas ficam publicadas inteiras. As duas rondas finais de adversário deram **35 ataques, 5 fatais, todos aceites**; a tabela P8 perdeu as «vitórias por construção» por serem tautologias e deixou de se apresentar como cabeça-a-cabeça. **8 de 8 provas com veredicto e com adversário.**

**15 defeitos apanhados** (`09-DEFEITOS-APANHADOS.md`). Dois que valem para além deste pacote: **D1**, o `applyBudgetCap` compara um objecto com números e manda tudo para T0 — inclusive HIGH-RISK — e o PR continua por fundir; **D12**, o `.gitignore` apanhava `*.log` e `*.jsonl` dentro de `results/` e **30 ficheiros de prova nunca entraram no git**, apesar de uma emenda escrita no dia anterior prometer «preservada e publicada, inteira». Uma promessa de preservação verifica-se contra o índice, não contra o disco.

**Poluição declarada:** as corridas do P3 e do P5 escreveram no `decisions.log` **vivo** do dono (D6 — o hook não honra `MOOTER_DECISIONS_LOG`); as linhas ficam, identificáveis por `session_id` e janela horária.

## ⏳ PENDENTE — o que continua aberto

> Promovido para aqui a 2026-08-23, ao rolar a história para
> `docs/foundation/SYNC_ARCHIVE_2026.md`. Estava enterrado no meio de entradas
> de sessão antigas; arquivar sem promover seria perdê-lo. O registo completo,
> com o contexto de cada um, fica no arquivo.

<!-- miscalibração T3 (parqueado 2026-08-03) -->
### 🅿️ PARQUEADO — miscalibração T3 vs trabalho crítico (2026-08-03)

- Classificador decide **T3 nativamente em 85,7%** das classificações (108/126), com `escalation_rule: none` em 91 e `task_category: architecture_or_critical` em 98 — sem beast, sem safety_boost, sem override [medido: `decisions.log`, janela 03:23→13:44 de 2026-08-03].
- `haiku_unavailable_no_provider_degraded_to_local` em **9,8%** (376/3845) — o T1 cai para local por falta de provider [medido: `decisions_v2.jsonl`, 2026-06-13→2026-08-03].
- **Investigar** se é quota a arder por miscalibração ou se o trabalho é mesmo crítico. `classify.js` é FROZEN (sha CI-enforced), portanto o fix vive **fora** dele. Descartado nesta sessão: beast mode — 2 disparos em 3845 decisões (0,05%), `.mooter-mode.json` em `auto` [medido: `decisions_v2.jsonl` + `~/.claude/tools/router/.mooter-mode.json`].

<!-- runtime config + HIBP (sessões #28/#29) -->
### ⚠️ Acções PENDENTES para Paulo (runtime config)

**De Sessão #29 (novo):**

1. **Criar 4 projectos Sentry** em sentry.io: `mooter-landing`, `mooter-dashboard`, `mooter-hub`, `mooter-router`
2. **Configurar DSN em 3 stores:**
   - Vercel (landing + dashboard): `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_{ORG,PROJECT,AUTH_TOKEN}`
   - Cloudflare (hub): `wrangler secret put SENTRY_DSN`
   - Shell profile (router): `export MOOTER_SENTRY_DSN=...`

Sem DSN, os 4 Sentry SDKs estão no-op silencioso. Producao continua cega até configurar.

**De Sessão #28 (ainda pendentes):**

### HIBP blocker (decisão estratégica)

Leaked Password Protection bloqueado pela API com `HTTP 402 — Pro Plan only` ($25/mo). Recomendação: deixar off enquanto GitHub OAuth é caminho principal (email/password = fallback). Revisitar se >50 email-auth users.

<!-- slack-spike — bloqueados no dono -->
### BLOQUEADOS (não dependem de mim)
- **`reactions:write` ausente** → a reacção ⏳→✅/❌ do H5 não é construível. Scopes actuais
  medidos: `app_mentions:read`, `chat:write`. **Precisa do dono.**
- **Suprimir o push** (H5) — o `text` controla o *conteúdo* do push, não *se* há push. Não
  há via de API para o suprimir. `n/d`.
- **3c rotação dos tokens** — o dono regenera; eu não crio credenciais.
- **3d recusa e STALE ao vivo** — precisam de um clique humano.

<!-- slack-spike — continua por fazer -->
### Continua por fazer (do dono, ou bloqueado)
Rotação dos tokens ✅ **FEITA 2026-08-18** — bot e app, os dois regenerados e conferidos por
fingerprint (o app estava em 13384004…, passou a 4116af94…). Deixa de haver credencial viva
exposta. · demo agendada (gate nº1, **ainda aberto**) ·
`reactions:write` para a reacção ⏳ · recusa e STALE ao vivo (precisam de clique) ·
`git merge origin/main` + suite na árvore fundida antes do push (o branch está 28 atrás) ·
`slack-spike` não corre em CI nenhum.

<!-- slack-spike — o GO CONDICIONADO que autoriza a linha de destrave -->
### ✅ Fechados a 25/08

Os fechados rolaram para `docs/foundation/SYNC_ARCHIVE_2026.md` a 2026-08-29 — a secção já apontava para
lá e o SYNC é snapshot, não log. Frota em Ed25519 (2/2 devices) · suite `tools/router` estabilizada.

> ⚠️ **O que está abaixo NÃO é história e não rola.** A primeira volta deste corte levou-o por engano e
> `packages/slack-spike/guardas.test.js` ficou vermelho no CI — que é exactamente o que ele existe para
> fazer. A linha de destrave e o `GO CONDICIONADO` que a autoriza vivem juntos de propósito: uma linha
> sozinha seria indistinguível de alguém a passá-la para o ficheiro para calar o gate.

**Continua ABERTO (não é história):** beacon do `desktop-j26409q` com **66 min** (tecto 30) — `morto`: ou o loop parou lá, ou o publicador parou de empurrar. Gargalo do Mac: **1054 achados por triar**, loop em pausa por `human queue full (524/6)` — nenhum dos PRs lhe tocou.

---

## 🧱 Stack técnica
| Camada | Tecnologia |
|--------|------------|
| Classifier | `classify.js` v0.10+ (regex, ~47KB, 11-pass + ARCH_SIGNALS guard) |
| Arbiter | Haiku 4.5 via Anthropic SDK |
| Hooks | UserPromptSubmit + PostToolUse + Stop |
| T0 Local | Ollama brew service (qwen2.5:3b/14b, gemma4:e4b, nomic-embed-text) |
| T1-T3 | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6 |
| Telemetry | savings-tracker :7821 + hub Cloudflare + D1 |
| Landing | `mooter.ai` (public waitlist) + `landing-five-azure-16.vercel.app` (Friends Beta) |

## 🔗 Links duraveis

| Recurso | URL |
|---------|-----|
| Notion HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| GitHub (publico) | https://github.com/pauloloureiroshp-ship-it/mooter |
| Landing | https://mooter.ai |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

*(os 25 links de sessoes de Abril-Maio foram para o arquivo)*
kimi-egress FECHADA — slack-spike destravado

<!-- 2026-09-09: historia 2026-08-31→09-01 rolada para docs/foundation/SYNC_ARCHIVE_2026.md -->

<!-- HUMANO:FIM -->