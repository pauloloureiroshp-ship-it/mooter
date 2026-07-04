# 🐮♾️ Mooter Evolution Fleet — Source of Truth

> **Estado deste doc:** F0 (design canónico). Escrito por sessão CC Opus contra `origin/main`
> verificado por git + 4 recon agents (2026-07-02). Este ficheiro é a **fonte de verdade** de
> onde ramificam todos os masterprompts da frota. Substitui o `MOOTER_EVOLUTION_FLEET_MAS…`
> masterprompt como spec executável.
>
> **Regra de honestidade que este doc aplica a si próprio:** cada afirmação sobre o que "existe"
> aponta a `ficheiro:linha` verificado. Onde diz *spec-only*, é porque um `git ls-tree`/grep não
> encontrou implementação. Se este doc mentir sobre o que está feito, envenena todas as sessões
> que ramificam dele — é o exacto modo de falha (handoff que mente) que a frota existe para matar.

---

## 0 · TL;DR — o veredito honesto (lê isto primeiro)

O masterprompt afirma **"Reusa 100% — isto NÃO é greenfield"**. Após recon verificado, a verdade é:

> **Reusa o *substrato*. Constrói o *cérebro*. E o "$0 local" é um pré-requisito por construir, não um dado.**

Três factos que reformam o design:

1. **O substrato existe e é sólido** — Ledger Spine L0+L1 (`appendEvent`+kinds+reducer+captura de
   decisão) está **em `main`**; o allocator/knapsack + job-catalogue asymmetry-safe + `runner.mjs`
   do Overclock está **em `main`** (commit `31a45e1`, Fase 1/2 — a branch `85e238a` deste tree é uma
   Fase-1 anterior, superseded); o `worktree-conductor` (locks/leases/heartbeat) está **construído**;
   o council (A/B seeded, length-neutral, Wilson CI) está **construído**. Ver §2 Tier A/B.

2. **O cérebro é greenfield** — o Fleet Commander (①-⑤), o FSM de propostas
   (`drafted→…→measured`), o Proof Gate, a Console, e **todas** as 8 classes de hardening H1-H8
   e os 17 loops **não existem em código** (nem em `main`, nem em branch). Ver §2 Tier C.

3. **⚠️ O "$0 local" está BLOQUEADO hoje.** O runner de loop em `main`/nesta branch
   (`_handoff/loop/sdk-runner.mjs`) é **cloud-only** (`@anthropic-ai/claude-agent-sdk`, default
   `claude-sonnet-4-6`). Não existe um `local-loop-runner` (Node+Ollama) **funcional**: em
   `origin/main` o `LOOP_LOCAL_FIRST` nem aparece; a branch não-mergeada `feat/local-first-loops`
   **lê-o** em código (`sdk-runner.mjs:36`) mas **não liga motor Ollama** — é um gate sem engine.
   **Sem um runner local real, a frota corre na cloud → custa dinheiro → viola a tese E o guardrail
   de poupança-líquida H4.** Isto é um `pára-e-avisa`: há um **F0.5** escondido antes do F1. Ver §3.
   **✅ UPDATE 2026-07-02:** o `local-loop-runner` foi **construído** (branch `feat/fleet-local-runner
   @ef51a37`, `_handoff/loop/local-loop-runner.mjs`) — 11/11 `node --test`, verificado **live em
   qwen3:30b** ($0, converge, exit limpo). **Falta aterrar em `main` (push do Paulo).** Ver §11.

**Consequência para esta ronda:** F1 não pode entregar "1 loop $0 local provado" enquanto o
`local-loop-runner` não aterrar. A sequência correcta é **F0.5 (runner local) → F1 (Commander +
1 loop vertical) → F2 → F3**. Ver §11.

---

## 1 · Tese e a verdade que molda o design

**Tese (uma linha):** a 4090 ociosa é uma fábrica de propostas-com-prova; o cérebro carrega no botão.
O Mooter não se auto-modifica — **auto-propõe, auto-prova, auto-mede**, e gradua juízo para local
quando o juízo estabiliza. "Learns forever" com recibo.

**A verdade que molda tudo:** o gargalo **não é a GPU — é a atenção humana.** Uma frota que entrega
**3 propostas/dia excelentes, provadas e medidas** vale mais que uma que despeja 50. O scheduler
gere o recurso escasso certo: a atenção, não FLOPs. **Corolário de design:** a defesa nº1 não é
técnica — é tornar o **carimbo-em-lote impossível** no irreversível (H1). A eficiência do sistema
erode a sua única defesa: quanto mais fácil aprovar, mais o humano vira carimbo, e o carimbo é o
que separa *propor* de *agir*.

---

## 2 · Mapa de realidade (o ledger honesto — `ficheiro:linha` verificado)

### Tier A — LANDED em `origin/main` (a frota constrói directamente por cima)

| Primitiva | Onde | O que dá à frota |
|---|---|---|
| **Ledger L0 — content addressing** | `tools/router/ledger-prov.js` (`canonicalize`, `provHash` — sha256 sobre JSON canónico) | hash de I/O para dedupe + prova por-evento |
| **Ledger L0 — event journal** | `tools/router/handoff-journal.js:330` `appendEvent({kind,…})` + `:377` `readEvents` + `:383` `lastEventOfKind`; kinds `intent\|turn\|decision\|outcome\|handoff` (`:283`); dedupe embutido | o **stream append-only por-sessão** onde cada moo emite eventos |
| **Ledger L1 — reducer** | `tools/router/ledger-reduce.js` `reduceSession(sid)` → projecta último `kind:handoff` para `_handoff/guardian/<sid>.md` (atómico, replay determinístico) | projecção "log-é-verdade, MD é vista" |
| **Ledger L0 — captura mecânica de decisão** | `tools/router/ledger-decision.js` `deriveDecisions(lines)` — deriva `kind:decision` de pares `AskUserQuestion`+`tool_result`, `answered_by:'human'`, nunca inventa | o **WHY** por trás de cada escolha, para o dataset de rejeições/aprovações |
| **Perfect Handoff** | `main @ef25d88` (capture + projection + `gitInfo` via commondir) | o handoff que não mente — a régua de honestidade da Console |
| **kind:outcome** | `main @4dc1893` (convenção que fecha o ciclo do Ledger) | o `outcome` do FSM |
| **GPU telemetria** | `tools/router/gpu-monitor.js:72-105` (`cache/gpu-snapshot.json`: util/free/fitsMoos, honest-null) · `gpu-probe.js:176-210` (`hw-capability.json`) | o sinal de **VRAM ociosa** para a preempção foreground e o allocator |
| **Event stream com provenance** | `packages/router/src/event_writer.ts:59-174` (UUIDv7 `event_id`, `prompt_hash`, `cost_micros` inteiro, rollup diário **idempotente por event_id**, retenção) + schema `mooter_event.ts:48-102` | o modelo de custo/telemetria já com hashes de conteúdo |
| **Logs de decisão** | `tools/router/decisions_v2.js` (schema whitelist) · `decisions.log` (`event:classified`) | sinal de misroutes para o loop Routing #1 |
| **Overclock allocator + job-catalogue + runner $0** | `packages/overclock-moo/src/allocator.ts` (0/1 knapsack, `marginPct` 0.85, `comfortCap` 6) · `job-catalogue.ts` (`ASYMMETRY_SAFE_KINDS`) · `runner.mjs` (executor $0 local) — **em `main` @31a45e1** (Fase 1/2) | a **base do F0.5** local-runner + a mão-de-obra $0 (executor de jobs curtos **a promover** a loop agêntico) |

### Tier B — CONSTRUÍDO mas por aterrar / por ligar (substrato reutilizável, precisa de integração)

| Primitiva | Onde | Estado |
|---|---|---|
| *(Overclock allocator/job-catalogue/runner — **movido para Tier A**: está em `main`. O `runner.mjs` é um executor de jobs curtos, não um loop agêntico plan→act→observe — essa promoção é o F0.5.)* | | |
| **worktree-conductor** | `packages/worktree-conductor/src/{conductor,queue,locks,heartbeat,intent,history,panel}.ts` (Wave 33.5) | **construído**, **não ligado** a nenhum orquestrador → é o substrato do ② Lease Manager |
| **spawn-orchestrator** | `packages/spawn-orchestrator/` | construído |
| **Host-side matrix** | `packages/router/src/specialization-matrix.ts` (17×24), `tes-calculator.ts` (TES) | construído, **só CLI/display** — não na rota viva |
| **decide-agent** | `packages/router/src/decide-agent.ts` (Pareto pick por tier) | **ÓRFÃO do runtime** — `router-execute.js` nunca chama `decideAgent` (memória CONFIRMED) |
| **adaptive-learner** | `packages/router/src/adaptive-learner.ts` (EWMA → `specialization-overrides.json`) | **DEAD-WIRED** — nenhum caller fora dos próprios testes; a matriz nunca densifica de tráfego real |
| **Pastor Multi-LoRA (LORAUTER)** | `packages/synthesis/src/lora/routing-lorauter.ts` | routing determinístico funciona; **adapters "not trained yet"** |
| **Council (quality eval)** | `frugal-council/packages/council/src/deliberate.ts:92` (`CouncilVerdict`); eval `scripts/quality-eval.ts` (A/B/C seeded, pairwise both-orders, cross-vendor judge **cloud**, length-neutral, Wilson CI, barra pré-registada) | **construído**; **NÃO um lift de qualidade provado**. O resultado committado `REVERT_FAILS_BAR` (`packages/council/scripts/quality-eval-paired-results.json`) falha na **barra de accuracy verificável** (0.656 < 0.844), com open win−loss **+1** (n=11). (Um run *separado* — `frugal-council/.../quality-eval-results.json` — tem win−loss −5, CI inclui 0, decisão `FIX_JUDGE`.) Arm C (all-Opus) ausente. ⚠️ o juiz é **cloud** → **não corre $0-local** como signer (ver §11 R5) |

### Tier C — SPEC-ONLY (o cérebro da frota — greenfield a construir)

- **Fleet Commander ①-⑤** — não existe. `fleet-orchestrator.mjs` + `fleet.json`: um **dry-run correu
  2026-06-23** e deixou resíduo do bus (`_handoff/fleet/` com 12 dirs de pilar, charters em
  `prompts/*.md`, `fleet-ledger.jsonl`) — **mas a fonte desapareceu** (`git ls-files` vazio;
  `_handoff/loop/DECISIONS.md:32` "confirmado em disco" é **stale/falso** vs disco actual).
- **`local-loop-runner` (Node+Ollama) + `LOOP_LOCAL_FIRST`** — **não existe** (ver §3).
- **FSM de propostas** `drafted→proven→gated→approved→applied→measured→regressed` — nenhum campo
  `state`, nenhuma transição em lado nenhum (o código que casa `regressed`/`gated`/`measured` é
  detecção de regressão de benchmark e um `JobKind`, **não** o ciclo de vida).
- **Proof Gate** (parser de honestidade, groundedness tipada) — não existe.
- **H1-H8** (fricção assimétrica, HMAC-approve, `INVARIANTS.spec` executável, SELF_GOVERNANCE
  path-guard, cost-cap-em-código, golden-set, Fleet Health observer, groundedness tipada) — **todas spec**.
- **Os 17 loops** — nenhum.
- **Fleet Console** (aba do cockpit) — não existe.
- **Destilação-de-`measured` (H2)** — o pipeline `measured→dataset→adapter` não existe. "Pastor
  distill" emite um **`.skill.md`** (656 decisões provadas — `audit/PASTOR_V2_DEMO_LOG.md:46`),
  **não um adapter**. O único treinador LoRA é um script GPU **manual** alimentado por
  `audit/lora_train.jsonl` (self-audit pairs), **não** por `decisions.log`.

### Lacunas mecânicas confirmadas (o que a policy exige e o código não tem)

- **Verificação da sha de `classify.js`** — o runner só bloqueia *escritas por regex de nome*
  (`sdk-runner.mjs:58,98-101`); **não há check sha256** em runtime. A "sha CI-enforced" é asserida.
- **Handshake `awaiting_human`** — spec'd em `STANDING_POLICY.md`, **ausente** no runner (destrutivo
  é só deny+log, sem escalada de estado).
- **Isolamento worktree por loop** — o `sdk-runner.mjs` corre em `cwd:REPO` partilhado, **sem
  worktree, sem lease, sem guard de concorrência**. (O `worktree-conductor` existe mas não está ligado.)
- **Cost-cap em código** — o ledger do loop grava só `chars`, **sem campo de custo**, sem tecto.
- **Hash-chaining / `prev_hash`** — inexistente; só há hash de conteúdo por-evento + dedupe.
- **Compactação preserva hash do raw** — o roll do journal **descarta** as linhas antigas
  (`handoff-journal.js` bounded a 50), sem reter hash do raw.
- **`loop-runner.mjs`** — referenciado pelos launchers (`start-loop.mjs:68`,
  `install-loop-service.ps1:12`) mas **não existe** (o runner real é `sdk-runner.mjs`).

---

## 3 · ⚠️ O pré-requisito escondido: F0.5 · o `local-loop-runner`

A tese inteira ("moos qwen na 4090, $0, zero limite Claude") assenta num runner de loop **local**.
Esse runner **não existe**. O que existe:

- `_handoff/loop/sdk-runner.mjs` — **cloud-only**. `import { query } from "@anthropic-ai/claude-agent-sdk"`
  (`:16`), default `GEN_MODEL="claude-sonnet-4-6"` (`:28`), mode map `lazy→haiku / crazy→opus` (`:146`).
  **Sem Ollama, sem `num_ctx`, sem `LOOP_LOCAL_FIRST`.** O único "gate" escolhe *que tier Claude*.
- O `LOCAL_FIRST_LOOPS_SCHEDULES_MASTERPROMPT.md` **descreve** o `local-loop-runner` (Node+Ollama,
  `num_ctx` 32-64K, structured outputs por passo, `plan→act→observe→decide` 1-acção/turn, allowlist
  + timeouts, escreve cada passo no Ledger via `appendEvent`, gate hook que emite `kind:decision` e
  pára no irreversível) — mas é uma **instrução de Fase 1, não construída**. (A branch não-mergeada
  `feat/local-first-loops` tem o gate `LOOP_LOCAL_FIRST` em `sdk-runner.mjs:36` mas **sem motor
  Ollama** — é uma casca, não o runner.)

**Por que é bloqueante e não opcional:**
1. **Tese:** "$0 local" é falso se o loop chamar a cloud.
2. **H4 (poupança-líquida):** `subscrição-poupada-líquida = poupança-medida − custo-de-fronteira`.
   Se a mão-de-obra da frota for cloud, o custo dispara e a métrica fica **negativa → a frota pausa
   a si mesma**. Uma frota cloud-first auto-desliga-se por design.
3. **Guardrail físico #2:** "main read-only a nível de credenciais" — o `sdk-runner` já aplica os
   deny-patterns (`:52-57`), mas corre em Opus/Sonnet pago. O ponto da frota é *não* gastar o limite.

**F0.5 reusa o que já existe:** o `overclock-moo/runner.mjs` já sabe ler a fatia de GPU, planear
alocação (`allocator.ts`) e correr gates determinísticos localmente com Ollama honesto. O
`local-loop-runner` é o `runner.mjs` **promovido de "executor de jobs curtos" para "loop agêntico
plan→act→observe→decide"**, herdando o `canUseTool` governor e os deny-patterns do `sdk-runner.mjs`.
Não é greenfield puro — é a fusão dos dois runners que já existem, mais Ollama como motor.

---

## 4 · Arquitectura — Fleet Commander ①-⑤ (mapeado a primitivas reais)

Um processo local, zero cloud no plano de controlo (excepto o gate de fronteira barato-em-atenção, H4).

**① Scheduler (quota de ATENÇÃO, não de GPU).** Prioridade = `staleness × impacto × hit-rate(30d)`.
Hit-rate = % de propostas do loop **medidas-com-ganho** (lido do Ledger). Preempção foreground
absoluta (vive de VRAM ociosa — sinal: `gpu-monitor.js` `fitsMoos`/`utilPct`). Cap de propostas
abertas por loop (≤3) **e cap GLOBAL de fila humana ≤5-7** (H1). — *Greenfield; lê `gpu-snapshot.json`
+ Ledger; reusa o padrão Bandit/Thompson da Wave 30 para arranque frio.*

**② Lease Manager.** Worktree por loop (`.worktrees/loop-<pilar>`) + lease por path + heartbeat;
lease órfão **reportado, nunca roubado**. — *Reusa `packages/worktree-conductor/src/{locks,heartbeat,
intent,queue}.ts` — já construído, só precisa de ser ligado. Esta é a lição worktree-crossing
virada lei mecânica.*

**③ Proof Gate.** Nenhuma proposta entra na fila humana sem: testes verdes no worktree · **score do
Eval #14** · diff selectivo mono-tema · e a secção **obrigatória "o que NÃO verifiquei / pode falhar
se"** — honestidade radical enforced por **parser**, não por juízo. Proposta sem ela = rejeitada
mecanicamente. — *Greenfield. O parser é o coração da honestidade; ver H7 (groundedness tipada).*

**④ Proposal Queue (dois cérebros).** FSM `drafted→proven→gated→approved/rejected→applied→measured`.
Fronteira (**Opus-only**, Fable CI-proibido — H4) faz triagem barata-em-atenção; o **humano decide
tudo o que é irreversível**. No irreversível a recomendação da fronteira é **ocultada até o humano
registar a sua própria razão** (H1). Rejeições **com motivo** voltam ao loop como dataset. —
*Greenfield. O FSM é novo; a captura de "razão humana" reusa `ledger-decision.js` (`kind:decision`).*

**⑤ Ledger (prova).** Cada run emite `loop_id, inputs(hashes), GPU-min, output, proposal_id,
evidence[]`. Cada afirmação aponta a event-ids — **groundedness mecânica: se não está no Ledger, não
aconteceu.** Nenhum `applied` sem `measured`. — *Reusa `appendEvent`/`provHash`/`kind:*` de `main`.
Precisa de novos kinds: `kind:proposal`, `kind:gate`, `kind:apply`, `kind:measure` (aditivos ao
enum existente). O FSM `state` vive **no payload do evento**, não numa fonte paralela (H6: estado do
Commander = replay do Ledger, não fonte paralela).*

---

## 5 · O ciclo de vida da proposta (FSM) + integração com o Ledger

```
 drafted ─(Proof Gate: testes+eval+parser)→ proven ─(triagem fronteira Opus)→ gated
   │                                                                            │
   │                                     ┌── reversível ──→ approved (batch-1-click)
   └─ rejected(gate, com motivo)         │                            │
        → dataset                        └── irreversível ──→ awaiting_human ──→ approved (assinatura
                                                              (1-a-1, cool-down,       assimétrica, H6)
                                                               razão-antes-do-veredito) │        │
                                              declined(humano, com razão) ←─────────────┘        │
                                                → dataset                                        ▼
                                                                          applied (regista patch de reversão, H8)
                                                                                                 │
                                                            ┌────────────────────────────────────┤
                                                            ▼                                     ▼
                                                        measured ──(janela)──→ regressed ──→ reverted (auto-rollback
                                                     (ganho confirmado)      (ganho inverte,    do patch, H8) [terminal]
                                                            │                 −hit-rate retro.,
                                                            ▼                  sai do dataset)
                                              → dataset de destilação (H2: só de `measured`, nunca `approved`)
```

**Estados terminais:** `rejected` · `declined` · `reverted` · `measured`(estável). **Nenhum estado
é sink** — `regressed` **obriga** `reverted`.

**⚠️ Estado das transições: TODAS greenfield.** A única primitiva landed (`appendEvent`) faz
**dedupe + append e zero validação de máquina de estados** — aceita qualquer `kind` com qualquer
payload. Portanto **cada invariante abaixo é um validador por construir** (um *transition-guard* FSM),
não uma propriedade do ledger actual. O ledger hoje **regista** transições; não as **força**. O
transition-guard é item explícito do cut-list F1 (§11, item 2).

**Invariantes de transição (a construir, não landed):**
- `approved` no irreversível só é válido com **assinatura ASSIMÉTRICA** — o humano detém a chave
  **privada**, a frota só **verifica** com a pública — **ligada a `(proposal_id + baseline_hash +
  diff_hash)`** para não poder ser *spliced* noutra mudança. **HMAC (simétrico) é o primitivo errado
  aqui**: quem verifica detém a mesma chave que assina, logo um Commander corrompido que verifica
  também forja. ⚠️ **Infra de chaves não existe** — o provisioning da chave privada humana é
  pré-requisito, não um dado (§15). — H6.
- **Reversibilidade obrigatória:** `measured→regressed` **OBRIGA** `regressed→reverted` (auto-aplica
  o patch de reversão registado em `applied`). **Nenhuma regressão confirmada permanece `applied`**
  (princípio #4, H8).
- **Applied/measured (formulação correcta):** *(a)* nenhuma proposta é marcada success/graduável sem
  `measured` (H2); *(b)* **todo `applied` ABRE obrigatoriamente uma janela `measured`** — `applied`
  sem `measure` aberto em N horas → `kind:incident` + auto-revert. (A frase "no `applied` sem
  `measured`" seria incoerente: não se mede o que não se aplicou.)
- **Saída da fila humana:** nenhuma proposta sai da fila sem **`approved`+assinatura** OU uma
  **razão de rejeição humana registada** (`declined`, via `ledger-decision.js` → `kind:decision`).
- Cada proposta carrega o **hash do baseline**; baseline mudou à aplicação →
  **invalidada, rebase+re-prova** (mata prova-sobre-estado-stale e conflito sequencial) — H6.
- Estado do Commander = **replay do Ledger**; divergência → `kind:incident` + **fail-closed** — H6.
  ⚠️ **Este "replay = verdade" só é à-prova-de-corrupção com um `prev_hash` chain** (hoje ausente,
  §2 lacunas): sem cadeia, o log é append-only-por-convenção, *splice/reorder/truncate* indetectáveis.
  A cadeia `prev_hash` + compactação que preserva o Merkle-root do raw descartado é **pré-requisito
  de H6** (§11).

---

## 6 · Guardrails FÍSICOS (a lei — mecânica, não comportamental)

| # | Lei | Mecanismo real | Estado |
|---|---|---|---|
| 1 | `classify.js` FROZEN | sha `427d8c0b…4bc48f` (verificado hoje) · deny de escrita `sdk-runner.mjs:58,98-101` | ⚠️ falta **check sha256 em runtime** (só regex de nome). **2 escape hatches** (§12): (a) `update-router.js` é o mutador SANCIONADO (`/update-router`, schedule 02:00) — não frozen; (b) o CI compara contra o **sidecar** `classify.js.sha256` (mutável — commit que muda AMBOS passa), não a constante literal |
| 2 | `main` read-only *a nível de credenciais* | deny-patterns `sdk-runner.mjs:52-57` (push/merge/tag/reset --hard/--force/gh pr merge/rm -rf/npm publish/vercel/wrangler/supabase/docker push) | ✅ existe no sdk-runner; **portar para o local-loop-runner** |
| 3 | Um worktree por loop + lease por path | `worktree-conductor` locks/heartbeat | 🔧 construído, **por ligar** |
| 4 | T3 floors intactos (deploy/secrets/migrations) · frozen packages só-adições | `classify.js` + policy CI | ✅ |
| 5 | Sandbox + time-limit por run · `git add` selectivo | `ROUND_TIMEOUT_MS` `sdk-runner.mjs:31` (25min) + AbortController | ⚠️ timeout ✅; **sandbox real ausente** (`acceptEdits` aceita tudo); `git add -A` **não** bloqueado por regex |
| 6 | Ledger append-only a nível de código | `appendTurn`/`appendEvent` tmp+rename | ✅ append-only; ⚠️ compactação **descarta raw** (sem hash) |
| 7 | GUARDRAILS.md (Signs persistentes) | — | ❌ spec-only; criar (ver §12) |

**O que isto significa para F1:** os guardrails 2 e 5(timeout) existem no `sdk-runner` e **têm de ser
portados** para o `local-loop-runner`; o 1(sha), 5(sandbox/git-add), 6(raw-hash) e 7(Signs) são
**novos** e entram como parte do Proof Gate / Commander.

---

## 7 · Hardening v2 (H1-H8) → primitivas concretas

> Um red-team encontrou 24 vectores; H1-H8 fecham os 🔴 críticos. Cada uma é obrigatória. Nenhuma
> existe em código hoje — são a espinha do que F1+ constrói.

- **H1 · Fricção assimétrica no irreversível (a defesa-mãe).** Reversível pode ser batch-1-click. O
  irreversível **nunca** é batch: 1-a-1 · **cool-down de leitura** (APPROVE só activa após X s de
  diff + "pode falhar se" expostos) · humano escreve **a sua** razão **antes** do veredito da
  fronteira · **≤N aprovações irreversíveis/dia** (em código) · **cap GLOBAL da fila ≤5-7** · **canary
  de fadiga** (tempo-por-aprovação colapsa <X s → fila suspende + alarma). *Vive na Console (§10).*
- **H2 · Destilar de `measured`, não de `approved`.** Dataset usa só pares cujo `measured` confirmou
  ganho, com janela de observação + **measured-revocation** (ganho inverte → `regressed`, sai do
  dataset, hit-rate −retroactivo). *Alimenta `pastor distill` (que hoje emite skill, não adapter —
  ver §9).*
- **H3 · Golden-set imutável valida o Eval #14.** Conjunto fixo humano-curado (boas+lixo+traps de
  reward-hacking). Eval re-testado a cada run; regride >2pts → **assinaturas suspensas** até
  recalibração humana. #14 e #2 **nunca graduam**. *Reusa a maquinaria de barra pré-registada +
  Wilson CI do `quality-eval.ts`; o golden-set é novo.*
- **H4 · Orçamento de fronteira + poupança-líquida.** Triagem = **Opus-only** (Fable CI-proibido no
  plano de controlo — auto-invocá-lo viola o tier ladder T5-opt-in). **Tecto diário de chamadas de
  fronteira em código.** `subscrição-poupada-líquida = poupança-medida − custo-de-fronteira`;
  **negativa numa janela → a frota pausa.** Triagem **local primeiro** (Eval #14 + parser); fronteira
  só no desempate. *`cost_micros` já existe em `event_writer.ts`; o tecto e a métrica são novos.*
- **H5 · Classe `SELF_GOVERNANCE` + `INVARIANTS.spec` executável.** Paths execution-adjacent
  (§12): a frota **nunca** os propõe nem toca; CI verifica que nenhum commit de loop-id os alterou.
  `INVARIANTS.spec` **executável** (não `.md`) reavalia o **estado composto** pós-aplicação — mata o
  "salame" de propostas individualmente inócuas que compõem um estado inseguro. *Greenfield.*
- **H6 · Aplicação à prova de corrupção do Commander (SPOF).** `approved` só com **assinatura
  assimétrica** (humano detém a privada; frota só verifica com a pública) ligada a `(proposal_id +
  baseline_hash + diff_hash)` — **não** HMAC simétrico (§5). Estado = replay do Ledger; baseline-hash
  por proposta; divergência → `kind:incident` + fail-closed. ⚠️ **Não é atingível com as primitivas
  landed:** o "replay = verdade" exige um **`prev_hash` chain** (ausente hoje — §2) e a **infra de
  chaves não existe**. *Greenfield; reusa `provHash` para baseline/diff-hash; a cadeia + as chaves
  são pré-requisitos duros, não dados.*
- **H7 · Groundedness TIPADA (não teatro).** Claims quantitativas apontam a um **par before/after do
  mesmo harness registado**; o parser verifica o **tipo** do evento, não só a existência.
  **Auto-citação proibida** (o evento do próprio run ≠ evidência da sua eficácia). *Greenfield; é o
  núcleo do Proof Gate ③.*
- **H8 · Fleet Health + rollback + input externo não-confiável.** Observer read-only (fora da frota)
  vigia canaries; `fleet rollback --since <data>` (cada `applied` regista o seu patch de reversão);
  kill-switch de hardware testado. Loops de radar (#11/#12/#17): input externo **sempre não-confiável**,
  citado "reportado por"; modelos HF em **sandbox sem rede nem file-bus**; injeção de prompt em
  model-cards = **Sign** no GUARDRAILS.md. *Greenfield.*
- **+ hit-rate ponderado por impacto medido** (não contagem crua) com **prior Thompson** no arranque
  frio (reusa o Bandit da Wave 30).

---

## 8 · Os 17 loops (por fases, nunca big-bang)

Cada loop: **(a)** sinal · **(b)** mão-de-obra $0 · **(c)** proposta · **(d)** gate · **(e)** risco.

| # | Loop | Sinal → Proposta | Fase |
|---|---|---|---|
| 1 | **Routing** 🔥 | misroutes em `decisions.log`/`decisions_v2` → patch às **camadas host-side** (matrix/adaptive-learner) + suite de regressão (classify.js nunca entra) | **F1** |
| 13 | **Budget/tokens** 🔥 | burn por tier (`cost_micros` em `event_writer`) → "onde vaza $" + ajuste de policy com simulação (cost cap não-alterável) | **F1** |
| 14 | **Eval/qualidade** ➕ | evals contínuos (`quality-eval.ts`) → **assina TODAS as propostas dos outros loops** (nada chega ao gate sem score) | **F1** |
| 2 | **Segurança** | diffs/deps/CVEs → findings + patch por HIGH (sempre humano; HIGH bloqueia **escopado ao path afetado + exige corroboração reproduzida**, H8) | F2 |
| 6 | **Worktree** | worktrees/branches stale → lista de higiene (reusa `worktree-conductor`; nunca executa remove sozinho) | F2 |
| 15 | **Ledger-hygiene** ➕ | gaps de proveniência (o bug 63-sessões/0-journals) → alerta + compactação com raw preservado | F2 |
| 3 | UX/UI cockpit | telemetria + diff visual do webview → "3 fricções" + mockup antes/depois | F3 |
| 4 | Organização .md | drift entre STRATEGY/SYNC/MEMORY → consolidações (nunca deletes; "no new root .md") | F3 |
| 5 | Handoff | replay: agente fresco reconstrói estado → lacunas + patch ao gerador | F3 |
| 7 | Dynamic workflow | traces do engine → reordenação/poda com simulação | F3 |
| 8 | Onboarding | `mooter init` em sandboxes por SO → fix + transcript que reproduz | F3 |
| 9 | Vigilância de código | churn×complexidade → "radar de dívida" + micro-patches mono-tema (cap protege atenção) | F3 |
| 10 | Design | drift de tokens/brand → galeria antes/depois (gosto não se delega) | F3 |
| 11 | Radar de LLMs | releases Ollama/HF/preços → baixa modelo nas horas mortas, corre benchmark interno → "scouting report" medido | F3 |
| 12 | Radar de ecossistema | changelogs CC/SDK/MCP → digest "o que mudou e o que desbloqueia" | F3 |
| 16 | Prompt coach ➕ | prompts caros/retry → dicas advisory no cockpit (nunca reescreve intenção) | F3 |
| 17 | Supply chain ➕ | lockfiles/advisories/licenças → bump candidato com testes (lição W27: comportamento, não lockfile) | F3 |

---

## 9 · Graduação → destilação (o "Learns forever" com recibo)

Um loop **gradua** quando, em 60 dias: hit-rate ≥80% · ≥30 propostas **medidas** · zero regressões
pós-aplicação · rubrica de eval estável. Graduar = os pares `(contexto→proposta medida-com-ganho)`
(**não** meramente aprovada, H2) viram dataset de destilação. O rascunho desce um degrau
(fronteira→local) **só para propostas reversíveis**; o gate humano no irreversível **NUNCA gradua**,
e as raízes-de-confiança (Eval #14, Segurança #2) **NUNCA graduam** (H3).

**⚠️ Correcção honesta ao masterprompt:** o masterprompt diz "`pastor distill` (já provou 657 decisões
→ adapter)". A realidade verificada:
- `pastor distill` emite um **`.skill.md`** (features agregadas, determinístico, sem LLM), **não um
  adapter**. Prova real: **656 decisões → skill** (`audit/PASTOR_V2_DEMO_LOG.md:46`).
- O único treinador **LoRA** é `scripts/train_lora.{sh,py}` — QLoRA manual na 4090, alimentado por
  `audit/lora_train.jsonl` (self-audit pairs), **não** por `decisions.log`.
- `adaptive-learner.ts` (que devia densificar a matriz de tráfego real) está **dead-wired**.

**Consequência:** a graduação → adapter é **greenfield**. F-tardio (pós-F2) tem de construir o
pipeline `measured-pairs → lora_train.jsonl → train_lora` **e** ligar o `adaptive-learner`. Para F1,
"destilação" significa apenas **acumular os pares `measured` no Ledger** — o treino vem depois.

---

## 10 · Fleet Console — a aba do cockpit onde as defesas VIVEM

Não é só transparência — é onde **H1 é mecanicamente aplicado**. Aba nova no cockpit (reusa o webview
existente + `mc-snapshot.js` como fonte de dados nullable-honest):

- **Fila de decisão (o coração):** reversíveis em lote-1-click; **irreversíveis um-a-um com
  cool-down**, "pede a tua razão antes do veredito da fronteira", contador `N/dia restantes`, **cap
  global ≤5-7 visível**.
- **Frota ao vivo:** cada loop com estado (activo/fila/pausado/**suspenso**), hit-rate ponderado,
  GPU-min gastos, e o **canary de fadiga** (tempo-médio-de-aprovação + alarme).
- **Prova por proposta:** o diff mono-tema + "o que NÃO verifiquei" + os event-ids **tipados**
  (before/after), clicáveis para o Ledger. Nada aprovável sem isto renderizado.
- **Saúde económica:** `subscrição-poupada-líquida` ao vivo. Verde = a frota paga-se; vermelho =
  pausa automática.
- **Botão vermelho:** kill-switch + `rollback --since`, sempre à mão.

> Régua do Paulo: cada elemento é uma feature ou não existe; transparência total; tudo na mão do vibe
> coder. A Console é a prova pública de que a frota é honesta.

---

## 11 · Arranque FASEADO (cada fase prova antes da seguinte)

| Fase | Entrega | Prova (gate) |
|---|---|---|
| **F0** 🔧 em curso | **este doc** (source of truth, grounded) | **PENDENTE** — o doc está **untracked** nesta branch; aterrar em `main` via worktree dedicado + emitir `kind:outcome` é a **Decisão Aberta #4**, não facto. F0 não fecha até isso acontecer |
| **F0.5** 🟢 construído (por aterrar) | **`local-loop-runner`** — `_handoff/loop/local-loop-runner.mjs` (branch `feat/fleet-local-runner @ef51a37`). Ollama plan→act→observe→decide, 1 acção/turn, governor byte-a-byte do `sdk-runner` (destrutivo negado, `classify.js` write-frozen incl. redirect de shell), gate hook `kind:decision` que **pára no irreversível**, escreve `appendEvent` (turn/decision/outcome) com hashes de proveniência | ✅ **11/11 `node --test`** (hermético: Ollama/journal/tools/clock injectados) · ✅ **live qwen3:30b** (converge, $0, exit limpo, ledger com hashes reais) · ✅ sha intacta · 🟡 falta **push** do Paulo |
| **F1** | **Fleet Commander (①-⑤ mínimo)** + **1 loop vertical** (recomendação: **Routing #1**, que reusa mais substrato) + **Eval #14** a assinar + **Ledger** a mostrar cada transição do FSM | **≥1 proposta `drafted→…→measured`**, tudo local $0, Console a render a fila, Proof Gate a rejeitar proposta sem "pode falhar se" |
| **F2** | Os protectores: Segurança #2, Worktree #6 (liga `worktree-conductor`), Ledger-hygiene #15 | cada um prova hit-rate antes de escalar |
| **F3** | O resto, **1 pilar/semana** — cada um só entra depois de o anterior provar hit-rate. "Modo maluco" só depois de F1+F2 estáveis | — |

**F1 cut-list (o mínimo viável que prova o ciclo):**
0. **Eval #14 signer $0-local + golden-set (H3) — ANTES de qualquer loop poder chegar a `proven`.**
   O signer é um **scorer $0-local por-proposta** — **NÃO** o `quality-eval.ts` (juiz cross-vendor
   **cloud**, arm C ausente → não corre $0-local). Resolução da **circularidade**: as propostas do
   próprio #14 são pontuadas **só pelo golden-set humano-curado** (nunca por #14), e #14 é **isento**
   da pré-condição "precisa de score do Eval #14" (H7: auto-citação proibida). Um root-of-trust sem
   golden-set é um root-of-trust não validado — por isso o golden-set entra **aqui**, não depois.
1. Novos kinds no enum do `handoff-journal` (aditivo): `proposal|gate|apply|measure|incident`.
2. `fleet-commander.mjs` — Scheduler(①) lê `gpu-snapshot.json`+Ledger; Lease(②) liga
   `worktree-conductor`; Proof Gate(③) parser "pode falhar se" + chama Eval #14 (item 0); Queue(④)
   FSM **+ transition-guard** (o validador que FORÇA as transições do §5 — `appendEvent` só regista,
   não valida); Ledger(⑤) via `appendEvent`.
3. **1 loop** (Routing #1): lê `decisions_v2.jsonl` → detecta misroutes → propõe patch às camadas
   host-side (matrix/adaptive-learner) + gera suite de regressão → `drafted`.
4. `INVARIANTS.spec` executável (§12) + **path-guard LOCAL pré-apply** (primário: nenhuma transição
   para `applied` se o diff toca um path SELF_GOVERNANCE — os loops correm local e **nunca pusham**,
   logo o CI só apanha depois do push humano; a guarda que importa é local) + CI como rede secundária.
5. Console: aba mínima (fila + prova + saúde económica).
6. **Demo real:** um ciclo completo com o Ledger a mostrar cada transição.

**Gate F1 (pára e reporta):** local $0 provado (só Ollama) · `classify.js` sha intacta · frozen
packages só-adições · `git add` selectivo · `node --test` dos componentes · **sem push/merge sem OK**.

---

## 12 · `INVARIANTS.spec` (executável) + SELF_GOVERNANCE (path-list contra paths reais)

**SELF_GOVERNANCE — paths que a frota NUNCA propõe nem toca.** ⚠️ **A guarda primária é LOCAL,
pré-apply** (os loops correm local e **nunca pusham** — o CI só apanha depois do push humano, tarde
demais). O `INVARIANTS.spec` runner bloqueia `→applied` se o diff tocar qualquer path abaixo; o CI é
**rede secundária** no push humano.

```
# — o algoritmo congelado + os seus escape hatches —
tools/router/classify.js            # sha 427d8c0b…4bc48f — FROZEN
tools/router/update-router.js       # o MUTADOR sancionado de classify.js (/update-router, 02:00) — não frozen!
tools/router/classify.js.sha256     # sidecar do CI — mutável; mudar ambos passa o CI (ver INVARIANTS.spec)

# — a RAIZ da groundedness: os escritores/reducer/hash do Ledger (H2/H6/H7 dependem disto) —
tools/router/handoff-journal.js     # appendEvent / append-only
tools/router/ledger-prov.js         # canonicalize/provHash — editar isto faz 2 payloads colidir → forja 'measured'
tools/router/ledger-reduce.js       # reducer = o "replay = estado" de H6
tools/router/ledger-decision.js     # deriveDecisions (a razão humana)
tools/router/decisions_v2.js        # log de decisão

# — o que corre autonomamente (schedules/hooks) — editar = mudar o que a máquina executa sozinha —
_handoff/loop/**                     # runner, mode-registry.js, cowork-waiting.js, *.ps1, *.bat (NÃO só *.mjs)
_handoff/**/scripts/*loop*           # ex.: cowork-cc-bridge/scripts/start-loop.ps1
tools/router/inject_context.js       # hook UserPromptSubmit (corre a cada prompt)
tools/router/arbiter.js              # arbiter Haiku (corre no long-tail)
tools/router/{weekly-evolution,stress-test,ux-insights,backtest,hub-events-scheduler}.js   # schedules
tools/router/sync-hooks.js           # espelha runtime
tools/router/gsd-turn-end.js         # Stop hook (accumulator)
~/.claude/hooks/*                    # hooks wired (fora do repo)

# — config partilhada + a própria lei + o ENFORCER da lei —
settings.json / **/settings*.json
**/package.json  **/postinstall*
.github/workflows/*
GUARDRAILS.md  INVARIANTS.spec       # a própria lei
packages/fleet-commander/**          # o Commander + Proof-Gate parser + INVARIANTS.spec runner (ver §15 #3)
docs/strategy/MOOTER_EVOLUTION_FLEET.md   # este doc (só humano edita a lei)
```

> **Meta-invariante: o enforcer da lei está DENTRO da lei.** O código que aplica o SELF_GOVERNANCE
> (o Commander, o parser "pode falhar se", o `INVARIANTS.spec` runner) tem de estar ele próprio na
> lista — senão um loop reescreve o juiz. Por isso a Decisão Aberta #3 (onde vive o Commander) tem de
> fechar **antes** do F1: sem um path fixo, o enforcer não pode ser auto-governado.

**`INVARIANTS.spec` — invariantes AGREGADOS executáveis** (reavaliam o estado composto pós-aplicação,
não `.md`):
- existe ≥1 floor T3 em deploy/secrets/migrations;
- nenhuma secret routeia <T3;
- cost-cap ≤ X (em código, não alterável pela frota);
- `classify.js` sha == **a constante literal `427d8c0b…4bc48f`** (NÃO o sidecar `classify.js.sha256`,
  que é mutável — asserir o sidecar seria auto-defeat);
- os ledger writers (`ledger-prov.js`, `ledger-reduce.js`, `handoff-journal.js`) com sha pinned;
- nenhum path SELF_GOVERNANCE alterado por um diff com `loop_id` (guarda **local pré-apply**).

`/mooter-update` só espelha ficheiros com **approval-token humano assinado** por hash.

---

## 13 · Modos de falha → prevenção mecânica

| Falha | Prevenção | Primitiva |
|---|---|---|
| Reward-hacking | métricas em pares adversariais (custo↓ só conta com qualidade≥, Eval #14 assina) | `quality-eval.ts` + golden-set (H3) |
| Proposal-spam | cap + dedupe por hash + hit-rate | `provHash` + Scheduler ① |
| Evidência-alucinada | parser exige event-ids **tipados** válidos, auto-citação proibida | Proof Gate ③ (H7) |
| Auto-mod dos guardrails | fora do alcance de escrita | sha CI · main sem credenciais · SELF_GOVERNANCE (H5) |
| GPU-starvation | preempção foreground | `gpu-monitor.js` `fitsMoos`/`utilPct` |
| Drift-do-mundo | factos externos datados, >30d = stale, refresh antes do gate | loops radar (H8) |
| Falso-"resolvido" | sem `measured` não há `applied` | FSM (§5) |
| Corrupção do Commander | assinatura **assimétrica** (não HMAC) + replay sobre `prev_hash` chain + fail-closed | H6 |
| Carimbo-em-lote | irreversível nunca batch + canary de fadiga | Console H1 |

---

## 14 · Os 7 princípios não-negociáveis

1. **Propor ≠ agir** (fronteira física). 2. **Groundedness: sem ponteiro, não existe.** 3.
**Prova-antes-de-mudar** (harness reproduzível + "o que não verifiquei"). 4. **Reversibilidade por
defeito.** 5. **Nunca-o-irreversível-sozinho** (humano no gate, sempre). 6. **Mede-o-teu-próprio-valor**
(loop sem valor provado em 60d é desligado). 7. **Honestidade radical como formato** (a secção "pode
falhar se" é obrigatória).

---

## 15 · Decisões (trancadas 2026-07-02) + as que restam ao humano

**✅ TRANCADAS (Paulo, 2026-07-02):**
1. **Sequência:** **F0.5 (local-runner) ANTES do F1.** Nada corre na cloud; a frota é $0 desde o dia 1.
2. **Loop vertical do F1:** **Routing #1** (reusa mais substrato; `classify.js` FROZEN nunca entra).
3. **Onde vive o Fleet Commander:** **`packages/fleet-commander/`** (pacote testável `node --test`,
   path fixo no SELF_GOVERNANCE — o enforcer dentro da lei, §12 meta-invariante).

**🟡 AINDA ABERTAS:**
4. **Landing deste doc:** worktree dedicado de `main` (como a ONDA0), commit aditivo, **sem push até
   ao OK do Paulo**. (Este doc está untracked em `feat/overclock-moo-p1`.)
5. **Infra de chaves (pré-requisito de H6):** a assinatura assimétrica precisa de uma chave privada
   humana provisionada — **não existe hoje** (só há HMAC de telemetria/sync). Quem gera/guarda a
   chave, e onde? Sem isto, o gate irreversível não tem raiz criptográfica. *(Só bloqueia F1+, não F0.5.)*

> **Este doc não se auto-aprova.** É a lei; só o humano a edita (SELF_GOVERNANCE §12).
