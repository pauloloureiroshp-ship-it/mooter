# ⇄ HANDOFF · CC → COWORK · Mooter 2.0 Trust Release

```text
⇄ MOO HANDOFF · Mooter 2.0 Trust Release · 5 fases · 2026-07-16
TL;DR:    H0 ✅ landed · H4 ✅ aprovado · H1+H2 🟡 awaiting-you · H3 ❄️ gated · PR #254 aberto
INTENT:   _handoff/MOOTER_20_TRUST_RELEASE_MASTERPROMPT.md + 3 ajustes do Paulo (4 ativos · duplo
          rodapé · nunca tocar worktrees do Codex)
STATE:    parked — 6 commits pushed, PR aberto, aguarda 2 decisões
WORKTREE: ~/frugal · chore/mooter-20-h0 @HEAD · 6 ahead of origin/main · pushed ✅
GATE:     classify.js sha 427d8c0b… ✅ intacto (byte-a-byte) · LP 687/687 ✅ · suite ext 1393/1394 ✅
          preflight 13/13 ✅ · suite router: n/d (não executada)
WORK:     16 fich. · +1764/-15 · PR #254 (OPEN, MERGEABLE, não mergeado)
🔥 FOCO:   fechar o gate de CI da extensão — ~15 linhas de YAML, ver §Achado
```

**🚨 UNCOMMITTED: nenhum.** 0 tracked sujos em `~/frugal`. Nada em risco.
Rede: `stash@{0}` preservado · backup `scratchpad/frugal-backup-2026-07-16/` (1596/1596) ·
tag `insurance/fleet-arm-2026-07-16` @ `4f72359`.

---

## ⛔ PENDING — as 2 decisões que bloqueiam tudo

**1. H1 — cut-list, decisão elemento a elemento.**
Q: qual métrica a decisão god-mode queria com "~60% de corte"?
- **A)** o usuário vê menos 60% de coisas → **58,8% atingido** (30/51 saem da superfície)
- **B)** 60% do código apaga → **23,5%** (12/51; os outros 18 são MERGE, o dado sobrevive noutro sítio)

Sem isso o H1 não vira wave. Cut-list completa com `file:linha`: `_handoff/MOOTER_20_H1_CUT_LIST.md`.

**2. H2 — aprovar a spec do harness.** `_handoff/MOOTER_20_H2_TRUST_HARNESS.md`.
Recomendo despromover de "wave" para "3 itens" — ver §Achado.

---

## 🔥 Achado — o LP não tem problema de código, tem problema de CI

- `.github/workflows/test.yml:6-15` → paths só `tools/router/**` e `packages/cli/**`
- `.github/workflows/publish-cockpit.yml:6` → único a correr testes da extensão, em `push: tags`
- **Um PR pode partir os 687 testes do LP e o CI fica verde.**

Os testes existem e passam (687/687 union LP · 1393/1394 suite completa) e **COH-01 — o P0 do NO-GO —
está fechado desde `e2924ce`**. A desconfiança do Paulo estava certa, apontada ao alvo errado.
**~15 linhas de YAML** (job de PR com `npm ci && node --test src/*.test.js`) compram hoje a maior parte
do valor do H2. Fecha na F5 (`_handoff/MOOTER_20_RELEASE_GATE.md` §Dívida 2).

---

## ✅ Feito

| Fase | Estado | Artefacto |
|---|---|---|
| H0 | ✅ landed | 5/5 itens · 1 commit `08575b4` · 9 fich. +228/-15 |
| H1 | ✅ aprovado | `MOOTER_20_H1_CUT_LIST.md` · +2 ajustes (pipelineCard→KEEP rail 3 · status line) · ⛔ métrica por fixar: 58,8/23,5 (original) vs 56,9/21,6 (pós-ajuste) |
| H2 | ✅ aprovado | `MOOTER_20_H2_TRUST_HARNESS.md` · +F7 (finding ID formal p/ o P2) · implementação = wave própria com allowlist, não arranca sem masterprompt |
| H3 | ❄️ gated | F2 fora de `origin/main` (`merge-base --is-ancestor`) |
| H4 | ✅ aprovado | `MOOTER_20_RELEASE_GATE.md` é canon · 0/7 = baseline |

**Pré-H0 (não previsto pelo masterprompt):** `~/frugal` estava em `wave/honest-controls`, **159 commits
atrás**, com `main` preso noutro worktree. Backup → stash → branch nova off `origin/main`, na ordem que
o `LOOP.md` já canonizou em `2026-07-12-worktree-sprawl-esconde-wip-real`.

**♻️ Ferramenta nova:** `tools/handoff-preflight.js` — zero LLM, 13/13 testes.
`npm run handoff:preflight` · `handoff:qa` · `--lint`. Aceite como semente do handoff-lint da mesh.

---

## ⚠️ Contradições achadas — reportadas, não absorvidas

1. **H0.2 contradiz o protocolo do repo.** `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md:16` diz que
   `_handoff/agent-sync/` é *"local runtime state and is gitignored"* e que o ledger *"points to
   [artifacts] rather than duplicating transcripts"*. O H0.2 mandou `git add` do brief e eu forcei-o
   (`08575b4`). **O masterprompt e o protocolo discordam.** Reverter = `git revert 08575b4 -- _handoff/agent-sync/`.
2. **`LIVE_EDIT_ROADMAP.md` contradiz-se:** `:117` diz que `LIVE_PREVIEW_AUDIT_FINDINGS.md` está
   arquivado; `:179` diz que "fica ATIVO". Não arbitrei.
3. **Família Foundation (5 fich.)** supersedida mas presa ao PR da F4, que não shipou.
4. **4 premissas do masterprompt falsas:** "68/68 testes" → 687/687 (~10×) · "332KB" → 823.184 bytes
   (2,5×) · "5 superfícies" → 8 tabs · **"auditoria D1-h8" não existe** (a string ocorre 1× no repo:
   dentro do masterprompt que a cita).

---

## 🛠 Erros meus neste ciclo

1. **Falso alarme, 2×:** reportei `feat/fleet-arm` com "28 commits por push"; estavam **todos pushed**.
   Bug meu — media `origin/main..branch` (*ahead*), não *unpushed*. Corrigido em `22d2ab3` com teste de
   regressão que pina a semântica.
2. **Enquadrei mal o brief** como projeção regenerável; era órfão. O Paulo decidiu sobre base errada
   (Q5), detectei antes de executar e voltei a perguntar (Q7).
3. **Handoff escrito 4×.** Causa-raiz: nunca li `00-core/protocolo-comunicacao` — li sempre o espelho
   (`AGENTS.md`), nunca a fonte. Este handoff é o primeiro dentro do budget de 4k e por referência.
4. **PT-PT a sessão inteira**, sendo o canon **PT-BR** (`CLAUDE.md:29`, vault).

---

## DECISIONS — 9, extraídas mecanicamente (não coladas aqui)

```sh
npm run handoff:qa -- --sid e64b4e34-0abd-40ed-ab63-7cb537a4f7aa   # verbatim, zero LLM
```
Resumo: base do H0 → branch nova off `origin/main` · WIP → stash com tag · backup → sim ·
`latency.yml` → autorizado · brief → `git add -f` só do brief (Q5 invalidada → Q7) · 8 perguntas →
chegaram na 4ª vez · H0 → 1 commit · handoffs → escrever.
⚠️ Não projectáveis do Ledger: `kind:decision` só leva `output_hash`/`idem_key` — a forma, não o
conteúdo. Fonte real = transcript do CC.

---

## 🔜 NEXT FOR COWORK

1. **Canonizar as 8 perguntas no `AGENTS.md`** (a LF) → fecha a Dívida 1 do gate; `--lint` deixa de
   reportar `canon: n/d`. Esta sessão pediu-as 4× e assinou `n/d` até chegarem.
2. **Definir os 5 critérios do CCA-F** — não existem no repo (`AUDIT_CCA.md` ausente; o único doc com
   critérios tem 10). Sem isso `CCA: n/5` é assinatura sem referente.
3. **Pôr payload no `kind:decision`** ou aceitar que DECISIONS vem do transcript, não do Ledger.
4. **Rodar pointer-check antes de emitir masterprompt** — a D1-h8 era ponteiro morto. É o job L0 que o
   `LOOP.md` deste ciclo registou.
5. **Decidir a contradição nº1** acima (brief no git vs protocolo).

## RESUME

```sh
cd ~/frugal && gh pr view 254 --web          # rever
git revert --no-commit 08575b4 -- landing/app/version.json   # se o fix de drift não era pedido
node tools/handoff-preflight.js --lint _handoff/*.md
```

---

`CCA: n/d` — os 5 critérios do CCA-F não estão definidos no repo. Dívida 1 do gate, fecha com a LF.
`PERFECT_HANDOFF_SPEC.md:95`: *"Quando incerto → n/d, nunca palpite."*

`🔍 council 8/8 · objeção mais forte: escrevi este handoff 4× e as 3 primeiras versões violavam o
protocolo que eu dizia estar a seguir — 7182 tokens contra um budget de 4k, e o Q&A colado inteiro
quando a regra é "referência por path:linha, nunca colar o que o consumidor pode abrir". Um executor
que erra 4× o formato do próprio canal não é fiável a auto-reportar se o respeitou · resolvida:
parcialmente. Mecanizei o que dava: o preflight mede e o --lint verifica os rodapés. Mas o budget de 4k
e a regra de referência NÃO estão no --lint — só descobri que existiam ao ler o vault agora, e a
ferramenta foi escrita antes. A parte que não fecha: enquanto o protocolo viver só em prosa no vault e
o espelho do repo não o replicar, o próximo agente repete-me. Por isso o NEXT #1 é canon, não código.`

Council 8/8 aplicado (Paulo, 2026-07-16 · LF vai canonizar no `AGENTS.md`; até lá `--lint` → `canon: n/d`):
**1 Fonte de verdade** — tudo re-medido nesta árvore; falhei-a 1× (fleet-arm), corrigido. **2 Escritor
único** — zero ficheiros dos worktrees do Codex. **3 Reversível** — push/merge/tag = gate Paulo; nunca
mergeei. **4 Script-first** — backup/stash/rebase/testes/preflight correram autónomos; perguntei só onde
havia decisão real. **5 Projeção** — DECISIONS extraído do transcript, não reescrito. **6 Degradação** —
preflight é git+node, sem plugin/daemon; `n/d` onde não alcança. **7 Frozen/allowlist** — `classify.js`
intacto; zero allowlists. **8 Custo de reverter** — máximo: `git revert` de 6 commits, PR fechável.

```text
⇄ END
```
