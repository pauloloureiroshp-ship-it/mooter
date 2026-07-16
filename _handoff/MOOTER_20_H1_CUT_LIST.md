# ⇄ CC → COWORK · MOOTER 2.0 · H1 — Cockpit De-clutter · cut-list com evidência

```
⇄ MOO HANDOFF · H1 Cockpit De-clutter · 2026-07-16
STATE:    awaiting-you        ← cut-list completa; decisão elemento-a-elemento é do Paulo
WORKTREE: ~/frugal · chore/mooter-20-h0 @08575b4 · 1 ahead of origin/main · UNPUSHED ⚠
GATE:     ZERO código escrito ✓ · read-only ✓ · nenhum ficheiro do Codex tocado ✓
WORK:     0 ficheiros alterados nesta fase (inventário puro, como o masterprompt exige)
NEXT:     Paulo decide KEEP/MERGE/CUT/NATIVE elemento a elemento → só então vira wave
⇄ END
```

> Base: `packages/vscode-extension/src/extension.js` @ `08575b4`, extensão `0.16.78`.
> **Zero código nesta fase** — o ⛔ STOP do H1 exige a decisão do Paulo antes de qualquer edit.

---

## 0. ⚠️ Quatro premissas do masterprompt que NÃO sobreviveram ao código

Isto vem primeiro porque o H1, como estava escrito, cortaria contra um mapa que não corresponde ao
território.

| Premissa do masterprompt | Medido no código | Como se mediu |
|---|---|---|
| `extension.js` ~332KB | **823.184 bytes / 10.334 linhas** — 2,5× | `ls -la` |
| "5 comandos, 1 view" | **7 comandos, 2 views** (a 2ª é `when`-gated em `mooter.livePreviewMode`, por isso "1 view" é defensável; "5 comandos" não) | `package.json` › `contributes` |
| "5 superfícies: Cockpit/MC/PC/Arch/MEO" | **8 tabs**, e o MEO não é um deles — vive noutro webview (Live Preview, `extension.js:6175`) | tab bar `extension.js:9329` |
| "densidade N/V na auditoria **D1-h8**" | **A auditoria não existe.** A string `D1-h8` ocorre exactamente uma vez em todo o repo: dentro do masterprompt que a cita como fonte. Citação auto-referencial. | grep repo-wide |

**Os 8 tabs reais** (`extension.js:9329`): 4 na barra — `cockpit` · `mc` · `pc` · `arch` — mais 4 dobrados
no overflow `···`: `setup` · `herd` · `decisions` · `doctor`.

---

## 1. Inventário — 51 elementos

### Chrome (partilhado por todos os tabs)

| elemento | file:line | veredicto | experiência / destino / porquê |
|---|---|---|---|
| surfacebridge Cockpit ⇄ Live Preview | `extension.js:9323` | KEEP | Resume — única rota entre os 2 webviews |
| project switcher `pswitch` | `extension.js:9324` | KEEP | Resume |
| `＋New › 💬 CC session` | `extension.js:9324` | MERGE | → `.go` (`10081`); mesma acção `launch` renderizada 2× |
| `＋New › ♾️ Loop` **disabled "🌊 W5"** | `extension.js:9324` | CUT | Controlo morto — anuncia feature de wave-5 não construída |
| `＋New › ⏰ Schedule` **disabled "🌊 W5"** | `extension.js:9324` | CUT | Controlo morto — idem |
| `modeBadge` | `extension.js:9325` | MERGE | → mode seg (`10111`), mesmo `s.mode` |
| `scoreBadge` | `extension.js:9325` | MERGE | → Mooter Score card (`10122`), mesmo `score` |
| `inbox` | `extension.js:9326` | KEEP | Resume — "o que precisa de ti" |
| tab bar + overflow `···` | `extension.js:9329` | KEEP | navegação |
| intent command bar | `extension.js:9333` | **NATIVE** | Caixa de texto livre que resolve linguagem natural → comando **é** a Agents window / prompt do CC. Não competir com a plataforma. |

### Cockpit tab

| elemento | file:line | veredicto | experiência / destino / porquê |
|---|---|---|---|
| `.go` New Claude Code session | `10081` | KEEP | Resume |
| caption hint sob `.go` | `10082` | CUT | Texto explicativo permanente; não muda decisão |
| `hwStripCard` GPU util/VRAM | `10083` → `9748` | MERGE | → MC GPU card (`mission-control-view.js:413`), mesmo `s.mc.gpu` |
| `pipelineCard` spec→plan→exec→review→ship | `10084` → `9776` | CUT | Meio-construído: `spec`/`plan` **hardcoded a 0 para sempre** (`9787-9789`). 2 de 5 estágios são decoração. |
| **hero — Saved vs all-Opus** | `10098` | KEEP | **Review** — o recibo (métrica-mãe §1.9) |
| Graphify "~34×" card | `10104` | CUT | O `~34×` é **constante hardcoded**, não é live. Anti-vanity. |
| mode seg zen/auto/beast | `10111` | KEEP | **Route** |
| hint LazyMoo/Moo/CrazyMoo | `10112` | CUT | → tooltip; onboarding permanente |
| `pincard` Next prompt model | `10113` | KEEP | **Route** |
| `fleetCard` | `10045` → `row-renderer.js:586` | MERGE | → MC `mcv2-fleet` (`266`) |
| `fleetConsoleCard` | `10046` → `9622` | MERGE | → MC `mcv2-fleet`; **a frota renderiza 2× neste mesmo tab** |
| `herdCard` 🐄 Live sessions | `10041` | KEEP | **Watch** |
| `flowLens` 📊 | `10048` → `9671` | MERGE | → Project Command. A última linha dele é `Project command ↗` (`9670`) — shim de navegação auto-declarado |
| `economicsLens` 💰 | `10049` → `9703` | MERGE | → hero + ledger. Renderiza `saved`/`saved_pct` (`9680`) e Router mix (`9692`) **já visíveis no mesmo ecrã** em `10098` e `10125` |
| `brainLens` 🧠 | `10050` → `9742` | MERGE | → Decisions (`Insights ↗`, `9741`) |
| `foundationsLens` 🏗️ | `10051` → `9722` | MERGE | → Doctor (`Doctor ↗`, `9721`) |
| `handoffFlowCard` ⇄ | `10055` → `9799` | CUT | **Decoração pura.** Zero argumentos, devolve string constante, `role="img"`. Comentário próprio: "it is a static map, NOT a live work-aware feed" (`9797`) |
| Mooter Score card | `10122` | MERGE | → Doctor (ambos renderizam `s.score.checks`) |
| row Prompts / Today / Avg saved | `10124` | CUT | Contadores de vaidade — nenhuma decisão anexada |
| `recs` Router mix · last N | `10125` | KEEP | **Route** |
| `tokLedger` 🧾 Tokens by model | `10126` → `9556` | KEEP | **Review** — a tabela-recibo real |

### Mission Control tab

| elemento | file:line | veredicto | experiência / destino / porquê |
|---|---|---|---|
| `mc-head` + project pills | `mission-control-view.js:186` | MERGE | → chrome `pswitch` (`9324`) — 2º project switcher |
| `mcf-menu` "⋯" | `:201` | CUT | **Controlo morto.** Tem CSS (`extension.js:8967`), parece menu; **não existe handler** — ausente de `wireMc` (`9840-9852`) e do ficheiro inteiro |
| `mc-pilot` (pausar/retomar/spawn/handoff/refresh) | `:206-212` | KEEP | **Route** + Watch |
| Summary band `mcf-band` | `:232-243` | MERGE | → `mcv2-savings` (`256`). Renderiza `totals.savedToday`+`totals.pctLocal` — **os campos idênticos que o card seguinte renderiza 13 linhas abaixo** |
| `mcv2-savings` 💰 | `:256` | KEEP | **Review** |
| `mcv2-fleet` 🚜 | `:266` | KEEP | **Watch** |
| `mcv2-tg` 🧬 Sessões por tarefa | `:294` | KEEP | **Watch** — task_group + dependências |
| `mcv2-audit` 🧾 | `:341` | KEEP | **Review** |
| GPU card + gauge + Overclock | `:413` | KEEP | **Watch** |
| ⛙ Worktree git-graph | `:473` | KEEP | **Watch** |
| 🔁 Loops & schedules | `:509` | KEEP | **Watch** |
| §7 sessões por tópico | `:533-603` | MERGE | → `mcv2-tg` (`294`). **Mesmo array `sessions`, 2ª renderização no mesmo tab**, só muda a chave de agrupamento |
| 🛰️ Dispositivos remotos | `:606` | KEEP | **Watch** (honesto `n/d` até à Frente F) |
| 🐮 Pergunta ao Moo | `:620` | KEEP | **Resume** — local, $0 |

### Architecture tab

| elemento | file:line | veredicto | destino / porquê |
|---|---|---|---|
| `arch-root` header | `arch-tree.js:190` | CUT | morre com o tab |
| 🌿 main → frentes git-graph | `:128-130` | MERGE | → MC ⛙ Worktree (`473`) — ambos percorrem `sessions[].git.branch` → `openSession` |
| 📜 contratos conn | `:135` | CUT | Constante estática. Comentário próprio: "this is a CONSTANT structural fact, not a live measurement" (`133`) |
| 🛰 hub → devices | `:140-147` | MERGE | → MC 🛰️ (`606`) — mesmo `s.remote.devices` |
| 📝 registo → Notion/Obsidian | `:158-160` | MERGE | → MC sync dots (`566`) — mesmo `sessions[].sync` |
| 🔁 Loops | `:186` | MERGE | → MC 🔁 (`509`) — mesmo `s.loops` |

**Architecture: 0 KEEP.** Não é juízo meu — o ficheiro confessa. `arch-tree.js:3-8`: *"C2 (POLISH_F3):
collapsed from 3 modes to ONE. The old 🌳 tree and 📊 ceo modes duplicated the Mission Control tab…
The only view that gives an insight no other tab gives is the WORKING-TREE graph."* Essa alegação
residual é **falsa hoje**: MC §5 (`mission-control-view.js:473-506`) **é** um worktree git-graph sobre o
mesmo snapshot. Dois dos três modos já foram cortados por duplicarem o MC; o terceiro agora também.

### Project Command — a superfície que refuta a quota

9 KEEP / 1 CUT (só o banner `pc-frontier`, `project-command-view.js:118`). **10% de corte.**
É a única superfície que já conhece a sua fronteira: a linha 118 entrega explicitamente "o agora vivo"
ao Mission Control. **Aplicar-lhe a quota de 60% destruía a superfície mais saudável do produto.**

### MEO — webview diferente, sinalizado e não dobrado

`Control` (`6178`) KEEP·Route · `Stream` (`6179`) KEEP·Watch · `Sessões` (`6180`) MERGE→`mcv2-tg` ·
`Dia` (`6181`) MERGE→`tokLedger` · `LLM` (`6182`) MERGE→`tokLedger` · `Fleet` (`6183`) MERGE→`mcv2-fleet`.

---

## 2. O número honesto — aritmética à vista

Âmbito = webview do Cockpit (Chrome + Cockpit + MC + Architecture). PC e MEO reportados à parte.

```
                  elementos   KEEP   MERGE   CUT   NATIVE
Chrome                   10      4       3      2       1
Cockpit tab              21      7       8      6       0
Mission Control          14     10       3      1       0
Architecture              6      0       4      2       0
                       ----   ----    ----   ----    ----
TOTAL                    51     21      18     11       1     (21+18+11+1 = 51 ✓)
```

- **Métrica A** — sai da superfície onde hoje renderiza (MERGE+CUT+NATIVE): `30/51 = **58,8%**`
- **Métrica B** — desaparece do produto (CUT+NATIVE): `12/51 = **23,5%**`

**Veredicto sobre a hipótese dos ~60%: CONFIRMADA na Métrica A (58,8%), e o número não foi forçado** —
caiu da contagem. **Mas a decisão god-mode é ambígua sobre que métrica queria, e a diferença é tudo:**

- "60% cut" = *o utilizador vê menos 60% de coisas* → **58,8%, atingido.**
- "60% cut" = *60% do código/dados apagam* → **23,5%, e a meta está errada.**

**O achado dominante não é volume, é duplicação: 18 MERGE contra 11 CUT.** O problema do Cockpit é
renderizar o mesmo facto repetidamente, não renderizar factos inúteis:

| facto | renderizações | onde |
|---|---|---|
| sessões | **4×** | `10041` · `533` · `294` · `6180` |
| poupança | **4×** | `10098` · `9680` · `232` · `256` |
| frota | **3×** | `10045` · `9622` · `266` |
| router mix | **2× no mesmo tab** | `9692` · `10125` |
| project switcher | **2×** | `9324` · `186` |

Duas dessas duplicações (poupança, sessões) estão **dentro de um único tab, a ~20 linhas de distância**.
Isso é a manchete, e é evidência mais forte do que qualquer score de densidade.

Estendendo a contagem ao Project Command (9/1), o número global cai para `31/61 = 50,8%` — razão pela
qual reporto o PC à parte em vez de o deixar diluir uma meta a que nunca devia ter sido sujeito.

---

## 3. Layout-alvo — uma superfície por experiência

```
┌─ CHROME (sticky) ───────────────────────────────────────────────────┐
│ 🐮 mooter · [project ▾] · [＋New ▾]              (badges: removidos) │
│   ＋New ▾ → 💬 CC session          ← Loop/Schedule (mortos) CUT     │
│ ┌─ inbox: 🟢 nothing needs you  /  🍅 2 sessions need you ───────┐  │
│ [🐮 Cockpit] [🎛️ Mission Control] [🛩️ Project Command] [··· ▾]      │
│   (🌳 Arquitectura — MORRE.  intent bar — MORRE → Agents nativa.)   │
└─────────────────────────────────────────────────────────────────────┘

🐮 COCKPIT ─────────────────────────── Resume · Route · Review
  [ ✱ New Claude Code session ]                      ← CTA única
  ┌─ 💰 Saved vs all-Opus · $12.40 · 58% ⓘ advisory ─┐   THE receipt
  │  ✓ real executado: $3.10 · 14 local             │   (métrica-mãe)
  [ 🐄 LazyMoo | 🐮 Moo | 🐂 CrazyMoo ]                  Route
  ┌─ 🎯 Next prompt model [🐮 Auto ▾] ──────────────┐   Route
  ┌─ Router mix · last 40 · advisory ──────────────┐   Route
  ┌─ 🧾 Tokens by model [This session|All] ────────┐   Review
  ┌─ 🐄 Live sessions · 3 recent · 1 needs you ────┐   Watch (glance;
  └────────────────────────────────────────────────┘    depth → MC)
  ┌─ 🏛️ classify frozen ✓ · 🩺 Doctor 7/9 · ⚠ 1 sess ≥80% ctx ·
  │  📈 forecast STALE ────────────────────────────┐   ← NOVA status line
  └────────────────────────────────────────────────┘     (ver objeção §5)
  ⤫ 4 lenses · pipeline · handoff-flow · Graphify · Prompts/Today/Avg

🎛️ MISSION CONTROL ─────────────── Watch  (absorve Architecture)
  [❚❚ pausar] [▶ retomar] [＋ spawn moo] [⇄ handoff] [🔄]
  ┌─ 💰 poupado hoje ─────┐  ← UMA strip (mcf-band duplicado REMOVIDO)
  ┌─ 🖥️ GPU · VRAM · 🏆 cabem +3 · [🔥 Overclock] ┐ ← absorve hwStrip
  ┌─ 🚜 Frota de moos ────┐  ← absorve os 2 fleet cards do Cockpit
  ┌─ 🧬 Sessões por tarefa ┐  ← UMA lista (§7 duplicado REMOVIDO)
  ┌─ ⛙ Worktree ─────────┐  ← ABSORVE o git-graph do arch-tree
  ┌─ 🔁 Loops · 🛰️ Devices ┐  ← absorve arch loops + devices
  ┌─ 📝 registo → Ⓝ Ⓞ ────┐  ← absorve arch regBlock
  ┌─ 🧾 Audit ────────────┐
  ┌─ 🐮 Pergunta ao Moo · local · $0 ┐               Resume
  ⤫ mcf-menu (morto) · project pills (dup) · summary band · §7

🛩️ PROJECT COMMAND ── Plan ── INALTERADO excepto ⤫ pc-frontier (118)

🔮 MOO MISSION CONTROL ── TAB FUTURA (blueprint §1.9)
  Agora | Recibos (o centro) | Pilotagem | Skills locais
  ⚠️ Gate: só entra como tab DEPOIS dos merges acima — senão torna-se
     a 5ª lista de sessões e o 5º hero de poupança.
```

**Cobertura pós-corte — cada experiência com uma casa só:**

| Experiência | Casa | Âncora |
|---|---|---|
| Resume | Chrome inbox + Cockpit `.go` + MC Pergunta ao Moo | `9326` · `10081` · `mcv:620` |
| Plan | Project Command | `project-command-view.js:104+` |
| Route | Cockpit (seg · pin · router mix) | `10111` · `10113` · `10125` |
| Watch | Mission Control | `mcv:266-617` |
| Review | Cockpit hero + ledger; MC audit | `10098` · `9556` · `mcv:341` |

---

## 4. ♻️ REUSE gate — resposta explícita

**vscode-elements** (`@vscode/webview-ui-toolkit` foi arquivado/sunset pela Microsoft):

- **Não muda quase nada nesta cut-list — e é esse o ponto.** Todos os 51 elementos são
  **`<div>` hand-rolled por concat de strings**; não há um único web component no render path. O webview
  é construído por serialização `fn.toString()` para dentro de um script com CSP-nonce (`9343`, `9814`) —
  é *por isso* que cada renderer carrega o comentário "CONCAT-ONLY — NO template literals"
  (`arch-tree.js:15`, `mission-control-view.js:555`). Adoptar vscode-elements obriga a importar um bundle
  ESM real para dentro desse webview, o que **colide de frente com a arquitectura `fn.toString()`**. É uma
  migração separada e maior — **não pode ser contrabandeada para dentro do H1**.
- **Onde compensa, pós-corte:** os sobreviventes mapeiam limpo em componentes stock — tab bar (`9329`) →
  `vscode-tabs`; pin `<select>` (`10113`) → `vscode-single-select`; ledger (`9556`) → `vscode-table`;
  botões → `vscode-button`; cards colapsáveis (`cc()`/`wireCollapse`, `9515`) → `vscode-collapsible`, o
  que apagaria o mecanismo de colapso bespoke inteiro. **Cortar primeiro, portar depois.** Portar 51
  elementos para depois apagar 30 é trabalho deitado fora; portar os 21 sobreviventes é tratável.
- O layout-alvo acima está especificado em **semântica, não markup** — sobrevive a qualquer toolkit.

**Agents window nativa como host:**

- **Mata exactamente um elemento sozinha:** a intent command bar (`9333`) → **NATIVE**.
- **Reformula, mas não mata, as listas de sessões.** As 3 colunas que a plataforma **não** dá de graça são
  `tier`, `$ saved` e `ctxPct` + o jump Guardian (`mcv:578-580`) — que são a razão de existir do Mooter.
  Logo: **sobrevive UMA lista (MC `mcv2-tg`)**, escopada a routing/custo/contexto. Se uma versão futura do
  VS Code expuser custo por sessão, re-correr este gate no `mcv2-tg` — nesse dia torna-se NATIVE.
- Argumenta também **contra** a futura Moo Mission Control ser um monitor de jobs: pela regra anti-vanity
  do §1.9, o centro dela tem de ser **Recibos** — a plataforma mostra jobs a correr; só nós mostramos o
  que a GPU te comprou.

**Frozen-file check:** esta proposta toca `extension.js`, `mission-control-view.js`, `arch-tree.js`,
`row-renderer.js`, `project-command-view.js` — nenhum é `packages/vscode-extension/{README.md,
package.json,walkthrough/*}` (allowlist F2 do Codex). Sem sobreposição. `classify.js` intacto.

---

## 5. Objeção mais forte a esta cut-list — e como se resolveu

**A objeção:** os 8 MERGE do Cockpit (as 4 lenses, os fleet cards, o score card, o hwStrip) são o maior
bloco da contagem (8 de 30 remoções, 27% do corte). Classifiquei-os MERGE **porque duplicam outros tabs**
— mas esse raciocínio é circular: **um resumo que duplica um detalhe não é bug, é progressive
disclosure**. As lenses existem para o utilizador saber "há algo errado em economics/brain/foundations?"
**sem pagar quatro trocas de tab**. Removê-las obriga-o a visitar PC, Decisions, Doctor e MC para saber o
que um scroll dizia. Eu teria piorado a navegação enquanto reportava 58,8% de "melhoria" — a optimizar a
métrica pela qual escolhi ser avaliado. É exactamente o anti-vanity ao contrário.

**Porque não derruba o corte — mas emenda-o.** A objeção acerta na *necessidade* e erra no *instrumento*,
e o código di-lo em três sítios:

1. **As lenses são navegação auto-declarada, não superfícies de decisão.** Todas terminam num jump-link —
   `Project command ↗` (`9670`), `Decisions ↗` (`9702`), `Doctor ↗` (`9721`), `Insights ↗` (`9741`). Um
   card cuja última linha é "vai a outro lado fazer isto" é um índice. A tab bar (`9329`) já é o índice, e
   é sticky (`9321`).
2. **A alegação de "resumo" falha na maior lens.** `economicsLens` não resume um tab *distante* —
   re-renderiza `saved`/`saved_pct` (`9680`) e Router mix (`9692`) **já visíveis no mesmo ecrã** (`10098`,
   `10125`). Não é disclosure, é repetição. Essa não tem defesa.
3. **O papel já está preenchido, melhor.** "Precisa de mim?" é respondido pelo **inbox** (`9326`,
   `role="status" aria-live="polite"`) e pelas linhas pendentes do Score com botões `fix` inline
   (`10123`) — ambos **empurram**, enquanto as lenses obrigam a **puxar** por 4 cards colapsados.
   `foundationsLens` é o caso mais claro: renderiza `🩺 Doctor 7/9` (`9713`) a partir de `s.score.checks`
   — o mesmo array por trás do `scoreBadge` (`9325`) e do Score card (`10122`). Três renders de um array,
   um deles permanentemente no chrome.

**A emenda (a objeção a ganhar terreno, não a ser descartada):** não afirmo que o Cockpit precisa de zero
sinal cross-superfície. 4 cards colapsáveis é o instrumento errado; o certo é **uma status line não-
colapsável** com só os estados *excepcionais* que as lenses vigiavam:

```
🏛️ classify frozen ✓ · 🩺 Doctor 7/9 · ⚠ 1 session ≥80% ctx · 📈 forecast STALE
```

São o `archChip` (`9710`) e o `docChip` (`9713`) do foundationsLens, o sinal `ctxFull` do brainLens
(`9732-9733`) e a flag STALE do flowLens — os 4 pontos, entre ~25 linhas de lens, que **mudam uma
decisão**. O resto (Pastor conf/cache `9731`, contagem do Ledger `9737`, a linha-capacidade constante
`9740`, Plano `9700`, Budget/Custo `n/d` `9696-9697`) é telemetria que não muda nada.

**Efeito na aritmética, dito para o número continuar honesto:** acrescenta **1 KEEP**, e é um elemento
*novo*, não um dos 51. Não mexe nas 30 remoções, porque os 4 *cards* de lens deixam todos de renderizar.
A contagem mantém-se em **58,8% (A) / 23,5% (B)** — mas o corte passa a ter substituto nomeado para a
única função que as lenses serviam de facto.

**Risco residual, para a decisão elemento-a-elemento do Paulo:** `pipelineCard` (`10084`) é o meu CUT
menos confiante. Cortei-o porque 2 dos 5 estágios estão estruturalmente hardcoded a 0 (`9787-9789`) — mas
os outros 3 (`exec`/`review`/`ship`) **derivam de sinal git real**, e o marcador de bottleneck (`⛔`,
`9790`) discutivelmente muda uma decisão. Opções honestas: **CUT agora** (a minha recomendação: um
pipeline de 5 estágios que nunca acende 2 é um anúncio meio-construído — exactamente o que o comentário
do brainLens diz já ter sido removido uma vez por essa razão, `9725-9727`) ou **KEEP como rail de 3
estágios** até existir sinal de spec/plan. Recomendo CUT; não me bateria por isso.

---

## Rodapés

`CCA: n/d` — os 5 critérios do CCA-F não estão definidos em lado nenhum que eu consiga citar neste repo
(`AUDIT_CCA.md` não existe; o único doc com critérios tem **10**, não 5). Regra de ouro do
`PERFECT_HANDOFF_SPEC.md:95`: *"Quando incerto → 'n/d', nunca palpite."* Preencho quando o Paulo der a
definição.

`🔍 council 8/8 · objeção mais forte: as 8 lenses/cards MERGE são progressive disclosure, não duplicação —
cortá-las piora a navegação enquanto eu reporto 58,8% de "melhoria", optimizando a métrica pela qual
escolhi ser avaliado · resolvida: refutada em 3 pontos do próprio código (as lenses terminam TODAS em
jump-links auto-declarados, logo são um índice e a tab bar já é o índice; o economicsLens não resume um
tab distante — repete o que está no MESMO ecrã a 20 linhas; inbox+Score já EMPURRAM o sinal enquanto as
lenses obrigam a PUXAR por 4 cards colapsados), MAS a emenda é aceite: entra uma status line
não-colapsável com os 4 sinais que mudam decisão, e a aritmética não se mexe (58,8% A / 23,5% B).`

Council aplicado (8/8 verbatim, dadas pelo Paulo 2026-07-16 — a wave Lingua Franca vai canonizá-las no
`AGENTS.md`; até lá `handoff-preflight --lint` reporta `canon: n/d`):

1. **Fonte de verdade** — inventário feito no código a `file:line`, nunca em auditoria citada. Foi assim
   que 4 premissas do masterprompt caíram: 823.184 bytes ≠ 332KB · 8 tabs ≠ 5 superfícies · 7 comandos ≠
   5 · e a **"auditoria D1-h8" que não existe** (a string ocorre 1× no repo: dentro do masterprompt).
2. **Escritor único** — zero código escrito; nenhum recurso vivo tocado. Não colide com a F2, que detém
   `packages/vscode-extension/{README.md,package.json,walkthrough/*}`.
3. **Reversível vs irreversível** — explícito: **nada aqui é autónomo**. O ⛔ STOP exige decisão do Paulo
   elemento a elemento antes de qualquer edit.
4. **Script-first** — o inventário correu por grep/read mecânicos; a aritmética (21+18+11+1=51) é
   conferível à mão, e mostrei-a em vez de a afirmar.
5. **Projeção vs 2ª verdade** — aponta para `file:line` do código real; não recopiei o estado de nenhuma
   auditoria (foi por não o fazer que a D1-h8 se revelou inexistente).
6. **Degradação graciosa** — a proposta é **semântica, não markup**: sobrevive à migração para
   vscode-elements e não depende de plugin ou daemon.
7. **Frozen/allowlist/n-d** — `classify.js` intacto; zero ficheiros das allowlists do Codex; a densidade
   "N/V" ficou **UNVERIFIED** em vez de repetida como facto.
8. **Custo de reverter** — zero código = custo zero. O caminho mais reversível foi escolhido por desenho:
   inventariar e decidir antes de cortar, nunca o contrário.
