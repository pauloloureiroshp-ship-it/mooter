# 🖥️🏁 VS-VAL — Demo E2E auditada do Semáforo Moo (recibo da mágica)

> id: vs-val-e2e-20260719 · CC (sessão VS-W1) · 2026-07-19 · socio_pack: v1@manual (tier M)
> **PRECONDIÇÃO (honesta):** PR vs-w1 **não merged** (`531a3b1` ∉ origin/main) e **sem GUI** aqui →
> este relatório **prova o subset headless** (validação, recibos, máquina de estados) e **prepara o
> kit** para o Paulo executar o F5. **Não assina o E2E visual** nem simula GUI/registry (2ª verdade).
> Máquina escreve os fatos (secções 3-4); o Paulo confirma o visual (secção 5).

## 1. Setup auditável (fixtures — validador do Codex PASSA)

`packages/vscode-extension/demo/vs-val/` (fora de `src/`, zero código de produção):
- `sessions.demo.json` — 2 sessões: `cc-vsw1-active` (state active, worktree `frugal-vs-w1`) e
  `cc-registry-parked` (state parked, worktree `frugal-session-registry`).
- `dispatch-queue.demo.json` — 2 itens **derivados do schema VS-W0**: `vs-val-blocker` (severity
  critical, → registry) e `vs-val-paste` (severity high, → vs-w1). Ambos `estado:pending`.
- `receipt-harness.js` + `projection-preview.js` — provas headless (secções 3-4).

## 2. Roteiro F5 para o Paulo (≤10 passos) — coluna "esperado" é mecânica (secção 4)

1. Abrir a worktree `frugal-vs-w1` no VS Code → **F5** ("Run Extension" → Extension Dev Host).
   *(PR não merged → é validação na branch; precisa do teu OK, Paulo.)*
2. No Dev Host, abrir um **workspace multi-root** com as 2 worktrees (`frugal-vs-w1` +
   `frugal-session-registry`) — senão só a pasta aberta recebe badge no Explorer.
3. Copiar as fixtures para o runtime: `demo/vs-val/sessions.demo.json` →
   `<wsRoot>/_handoff/agent-sync/sessions.json` e `dispatch-queue.demo.json` → `.../dispatch-queue.json`
   (esperar ~5s do tick ou correr **Mooter: Refresh**).
4. **ESTADO A** — Explorer: `frugal-vs-w1`=📥, `frugal-session-registry`=🚨; status bar=
   "🚨 blocker: 🔐 vs-val-blocker-20260719" (fundo vermelho); ícone 🐮 = badge **4**. 📸 fotos 1-3.
5. Clicar no beacon → confirmar clipboard = corpo do item critical; **cronometrar clique→clipboard**
   (alvo <10s — é a TUA ação; a cópia é síncrona `clipboard.writeText`, correção provada pelo teste
   `create` do paste-beacon).
6. Editar `dispatch-queue.json`: `vs-val-blocker` `pending`→`done`. → **ESTADO B**: beacon avança a
   "📥 colar 🧾 vs-val-paste-20260719" (âmbar); registry 🚨→🔒; badge 4→3. 📸 foto 4.
7. Editar: `vs-val-paste` `pending`→`pasted`. → **ESTADO C**: beacon="🔒 2 gates te esperam" (sem
   fundo); ambos os worktrees=🔒; badge=2.
8. Recibo de terminal real: correr `node demo/vs-val/receipt-harness.js` (ou o fluxo do dispatch
   quando `feat/moo-dispatch` ligar `runInLaneTerminal`) → ver exit code+duração + o fallback `n/d`.
9. Anotar tempos observados e comparar com a coluna "esperado" (secção 4).
10. Fotografar as 4 superfícies (secção 6) e devolver ao brain.

## 3. Medição headless — recibos com clock INJETADO (mecanismo, não wall-clock)

`node demo/vs-val/receipt-harness.js` (determinístico, reproduz verbatim):
```
(a) validacao da FILA (validador do Codex, por item):
    item[0] vs-val-blocker-20260719 · critical · pending -> VALID
    item[1] vs-val-paste-20260719   · high     · pending -> VALID   (2/2)
(b) CAPTURADO : {"exitCode":0,"durationMs":57,"output":"demo output\n"}   [clock 1000->1057]
(b) CEGO->n/d : {"exitCode":null,"durationMs":0,"receipt":"n/d — shell integration indisponível"} [clock 2000->2000]
```
**Honesto:** os `durationMs` (57, 0) vêm de um **clock injetado determinístico** → provam o MECANISMO
(duração = fim − início) e reproduzem verbatim; **NÃO são latência wall-clock** (essa mede-se no F5).
O que fica provado: exit code **capturado** (0, com output) vs **cego** honesto (`n/d`, exitCode:null) —
o "antes N `sendText` cegos → depois com recibo". Contagem cego→recibo em produção real: `n/d`
(depende de o fluxo do dispatch ligar `runWithReceipt`; medível pós-`feat/moo-dispatch`).

## 4. Máquina de estados — coluna "esperado" (`node demo/vs-val/projection-preview.js`, git real)

| Estado | frugal-vs-w1 | frugal-session-registry | beacon | ViewBadge |
|---|---|---|---|---|
| **A** fila cheia | 📥 paste | 🚨 blocker | 🚨 blocker (vermelho) | 4 |
| **B** blocker resolvido | 📥 paste | 🔒 gate | 📥 colar (âmbar) | 3 |
| **C** paste consumado | 🔒 gate | 🔒 gate | 🔒 2 gates (s/ fundo) | 2 |

Determinístico, reproduzível (`projection-preview.js`). A máquina de estados é coberta por **24
testes unitários novos** (semaforo/beacon/lane) — suite total **1423 · 0 fail**, re-corrida na
verificação VS-VAL (2026-07-19) e provada no HANDOFF vs-w1 @531a3b1.

## 5. Checklist PASS/FAIL

| # | Verificação | Resultado |
|---|---|---|
| V1 | Fixtures da FILA passam o validador do Codex (item-a-item); `sessions.demo.json` é parseada, não validada | ✅ PASS (2/2, §3a) |
| V2 | `runWithReceipt` capta exit code+duração (mecanismo, clock injetado) | ✅ PASS (0 · 57ms det., §3b) |
| V3 | Fallback honesto `n/d` sem shell integration | ✅ PASS (secção 3b) |
| V4 | Máquina de estados A→B→C (precedência, transições) | ✅ PASS (secção 4 + 24 testes) |
| V5 | Zero código de produção tocado (diff prova) | ✅ PASS (só `demo/` + este relatório) |
| V6 | Render visual das 4 superfícies no VS Code | ⏳ PENDING-Paulo (F5, secção 6) |
| V7 | Tempo clique→clipboard <10s (UX real) | ⏳ PENDING-Paulo (secção 2, passo 5) |
| V8 | Estados de registry (🟡/🅿️ puros) | ⏳ PENDENTE MERGE (registry `75b947c` não em main; ver G1) |

## 6. Screenshots que o Paulo captura no F5 (lista exata)

1. **Explorer** com as 2 worktrees badgeadas (ESTADO A: 📥 + 🚨).
2. **Status bar** (Paste Beacon) nos 3 estados: 🚨 vermelho → 📥 âmbar → 🔒 sem fundo.
3. **Activity bar** ícone 🐮 com ViewBadge (4 → 3 → 2).
4. **Terminal** com o recibo (exit code + duração) visível.

## 7. Gaps / findings (diagnóstico, não teatro — NÃO consertados nesta corrida)

- **G1 · Gate esconde 🟡/🅿️.** Worktrees com commits unpushed (o normal de trabalho ativo) mostram
  🔒 (gate > working/parked). Por isso ESTADO C dá 🔒/🔒 e não 🟡/🅿️. **Decisão p/ Cowork:** o gate
  de unpushed deve ter menos precedência que working, ou só contar sem trabalho ativo?
- **G2 · ViewBadge conta em dobro.** `pastes + gates`: uma worktree alvo de paste E com unpushed
  conta 2 (ESTADO A=4). Semântica de "ações humanas" a afinar.
- **G3 · Badge 2-emoji não validado.** `<lane><estado>` não testado em runtime (limite ≤2 chars);
  default atual = 1 emoji (estado) + lane no tooltip. Confirmar no F5 se o emoji único renderiza.
- **G4 · ViewBadge de webview** só pinta após 1ª abertura do cockpit (limitação `WebviewView.badge`).
- **G5 · Visibilidade de sibling worktrees** exige workspace multi-root (passo 2).

## 8. Currículo Vivo (linha para o Paulo)

> "Demo E2E auditada do Agentic OS: dispatch pré-endereçado → beacon → clipboard → transição de
> estado projetada do registry, com recibo mecânico ($0, validador do Codex + máquina de estados
> reproduzível) e roteiro de F5 — 5 gaps de UX identificados antes de qualquer utilizador."

🤝 SOCIO: receita? na · despesa↓? na · risco↓? S (mede e desarma o erro de roteamento humano) ·
reversível? S · escopo? S. 📮 DESTINO: brain (moo-handoff-check) → Paulo executa F5 → consolida.
