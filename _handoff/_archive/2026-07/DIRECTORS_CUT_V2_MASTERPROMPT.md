# ⇄ COWORK→CC · MASTERPROMPT · Director's Cut v2 — F1.5→F5 (salvar → lentes → magia → journal → polish)

> **Executa numa sessão Claude Code FRESCA, nativa (Windows), UMA de cada vez.**
> Nasce do handoff `_handoff/DIRECTORS_CUT_V2_HANDOFF.md` + auditoria adversarial Cowork 2026-07-08
> que corrigiu 3 premissas do handoff (ver §GUARD-0). F1 (dados) JÁ ESTÁ FEITO e testado — está
> **uncommitted** no working tree. A tua primeira missão é salvá-lo. Depois, uma wave por gate. PÁRA
> em cada gate e reporta ao Paulo.
>
> **Régua de ouro (inegociável):** honestidade primeiro — todo campo nullable, ausente → `n/d`,
> custo é SEMPRE `~est.` (tier-based), NUNCA fabricar número, staleness é informação (mostra a idade
> do dado). O Director's Cut é a prova de que o Mooter não mente.

---

## GOAL

Transformar o Director's Cut de feed flat em cockpit de 4 lentes (Stream · Dia · LLM · Fleet) com
animações de trabalho honestas e auto-journal local $0 visível — **sem partir nada** do webview
(Live Preview + Live Edit + Brain + tabs) e em harmonia com o resto do plugin.

## WHERE

- Repo: `~/frugal`. **BASE OBRIGATÓRIA: `wave/honest-controls @ 28fe2e5`** — NÃO origin/main.
  O F1 foi construído e diffado contra este estado; main não tem o Live Preview MP1-5. Cria:
  `git worktree add ../frugal-dcv2 -b wave/directors-cut-v2 28fe2e5` e trabalha SEMPRE lá.
- F1 uncommitted no tree partilhado `~/frugal` (3 ficheiros — ver F1.5). O tree é partilhado por
  muitas sessões: NÃO uses `~/frugal` como workdir; só copias de lá os 3 ficheiros e sais.
- Render: `packages/vscode-extension/src/live-preview-view.js` · host: `extension.js`
  (`livePreviewSnapshot`/`getLivePreviewHtml`/`readBusTail`) · agregados F1: `src/lp-aggregates.js`.
- Testes: `cd packages/vscode-extension && npm test` (worktree fresca: `npm install` primeiro em
  `packages/cli` E `packages/router` E `packages/vscode-extension`).

## GUARD-0 — premissas corrigidas pela auditoria (lê antes de tudo)

1. **`handoff-rollup.js` NÃO está ausente** — `tools/router/handoff-rollup.js` existe neste branch.
   O handoff v2 §5 está errado nesse ponto. F4 é *verificar wiring do runtime + expor no painel*,
   não reescrever o writer. (Sintoma histórico real: CLAUDE.md "63 sessões, 0 journals" = mirror
   `~/.claude` stale, não código em falta.)
2. **O watcher do bus não tem debounce** — `extension.js` (~linha 1539) chama `_post()` a CADA
   append ao `events.jsonl`. Com os agregados F1 no snapshot, sessão activa = agregação + fs reads
   várias vezes/segundo. F2 começa por corrigir isto (P0 de perf, ver F2.0).
3. **O webview re-renderiza innerHTML a cada snapshot** → animações CSS reiniciam → flicker. F3 só
   funciona com render assinado (só re-render do que mudou — reusa o padrão `lpRoutesSig` que já
   existe no próprio webview script).
4. **Missão concorrente:** `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` (2026-07-08) toca o
   mesmo webview. NÃO executes as duas em paralelo. Esta wave tem precedência salvo ordem do Paulo.

## GUARD — invariantes de sempre (CI-enforced onde marcado)

- `tools/router/classify.js` FROZEN (sha CI `427d8c0b…`) — nunca tocar.
- Packages frozen waves 28-34.5 intocados; esta wave só toca `packages/vscode-extension/` (+ F4:
  zero código novo em `tools/router` salvo se um bug REAL for provado — nesse caso, pára e reporta).
- `git add` SELECTIVO, ficheiro a ficheiro. NUNCA `git add -A`. Sem `.md` novos na raiz.
- PT-BR na conversa, English no código. Copy do UI segue o padrão existente do plugin.
- Push da branch de wave permitido; **merge NUNCA sem OK explícito do Paulo**.
- Webview (tudo o que é serializado via `fn.toString()` em `getLivePreviewHtml`):
  **concat-only** (zero backticks/`${}`, até nos comentários), zero `require`/Node/vscode APIs,
  `esc()` self-contained ou free-var (padrão renderMissionControl), CSP nonce mantido, ZERO libs de
  charting (barras = divs flex, padrão `.lpbr-mix`), cores por `var(--vscode-charts-*, #fallback)`
  e `--t0..--t5`, `prefers-reduced-motion` respeitado, fail-soft (módulo ausente → `""`).
- Snapshot: ESTENDER, nunca reestruturar — campos novos nullable; consumidores antigos intocados.
- Cada wave: adversarial focada no fim (tenta partir o que fizeste) + suite completa verde
  (baseline conhecida: 7 falhas ambientais só em container Cowork; em nativo/CI devem passar) +
  sha do classify verificada + commit atómico + push da branch + **PÁRA no gate**.

---

## F1.5 · SALVAR o F1 (primeiro acto — antes de qualquer código novo)

O F1 está pronto e provado (23 testes novos; 655 pass; adversarial achou e corrigiu 1 falha de
segurança: pricing NUNCA se carrega do workspace — só de `~/.claude/tools/router/pricing.js`).

1. Cria a worktree/branch conforme WHERE (base `28fe2e5`).
2. Copia DO tree partilhado `~/frugal` para a worktree, exactamente estes 3:
   `packages/vscode-extension/src/lp-aggregates.js` (novo) ·
   `packages/vscode-extension/src/lp-aggregates.test.js` (novo) ·
   `packages/vscode-extension/src/extension.js` (editado: +19/−2 — require LPA fail-soft + os 3
   campos nullable `byDay/byModel/fleet` no return de `livePreviewSnapshot`, incl. o catch).
   Confere o diff: se o extension.js do tree tiver entretanto MAIS mudanças que estas, pára e
   reporta (colisão com outra sessão).
3. Apaga o resíduo `packages/vscode-extension/_to_delete/extension.js.f1tmp` no tree partilhado.
4. `npm test` na worktree → suite verde (nativo: as 7 ambientais do container devem passar).
5. Adiciona um teste de contrato de fonte (padrão honest-controls.test.js): lê `extension.js` como
   TEXTO e afirma que o return de `livePreviewSnapshot` contém `byDay`, `byModel`, `fleet` e que o
   catch os devolve null — trava regressão por merge distraído.
6. Commit atómico: `feat(live-preview): DCv2 F1 — host-side byDay/byModel/fleet aggregates (data-only)`.
   Push `-u origin wave/directors-cut-v2`. **GATE F1.5: reporta sha + suite + PÁRA.**

## F2 · LENTES (render concat-only + tabs) — só depois do OK do gate F1.5

**F2.0 (P0 perf, pré-condição):** debounce no watcher do bus (~1500ms, timer único, flush no
`onDidChangeViewState`) para `_post()` não disparar por append. Prova: log temporário de contagem
de `_post`/min numa sessão activa antes/depois (remove o log antes do commit).

**F2.1 Dados→UI:** em `live-preview-view.js`, três render fns novas, cada uma self-contained com o
seu próprio `esc` (padrão renderMissionControl), concat-only, fail-soft com `null` → honest empty:

| Lente | Fn | Contrato honesto (obrigatório no copy) |
|---|---|---|
| Dia | `renderDayBreakdown(byDay)` | "Hoje/Ontem/<data>" calculado no cliente; custo `~est.` SEMPRE com o til; `pctLocal` só se houver decisões; rodapé com `window` ("janela recente: N eventos · M decisões — não é histórico completo"); `costUncounted>0` → "K sem ~est."; scope "todas as sessões deste workspace" |
| LLM | `renderModelBreakdown(byModel)` | DUAS colunas com rótulos distintos: "ops reais" (execution.log) vs "rotas" (decisions.log) — nunca fundir; barra por modelo com tokens `--t0..--t5`; `local:true` → chip "$0 local"; `local:null` → sem chip (não inventar); totais `~est.` + "poupança vs all-Opus ~est."; `opsUnattributed>0` → "K ops sem modelo resolvido"; T5/Fable → chip "opt-in" sem custo |
| Fleet | `renderFleetLanes(fleet)` | swimlanes por pilar (estado/round/🔥GPU); `resting:true` → banner "frota em repouso"; **SEMPRE mostrar a idade do heartbeat** ("último sinal: <data>") — um repouso com sinal de semanas atrás tem de o dizer; `running:null` → "n/d (sem heartbeat)"; `dry_run` → rotular |

**F2.2 Tabs:** chips no topo do Director's Cut (Stream · Dia · LLM · Fleet), default Stream,
estado no webview (variável JS, NUNCA localStorage — proibido), `role="tablist"`/`aria-selected`/
setas ← → (WCAG), targets ≥24px. Serializa as 3 fns novas no `getLivePreviewHtml` pelo padrão
existente (`const renderX=${renderXSrc};`).

**F2.3 Testes:** espelha `live-preview-view.test.js` — por lente: dados reais → render; null →
"sem dados ainda"; XSS-safe (`<script>` escapado); contrato concat-only (o webview-syntax.test.js
já parseia — confirma que apanha as fns novas); rótulos honestos presentes (`~est.`, `n/d`,
"frota em repouso", idade do heartbeat).

**GATE F2 (prova viva):** vsix empacotado (`vsce package`) + `vsce ls | grep lp-aggregates` (o
precedente b2e1389 prova que o .vscodeignore come ficheiros) + install --force + Reload + screenshot
das 4 lentes com dados reais E screenshot dos empty states honestos. PÁRA.

## F3 · ANIMAÇÕES DE TRABALHO — só depois do OK do gate F2

- **Render assinado primeiro:** só re-renderizar a lente cujo sig de dados mudou (JSON curto dos
  campos relevantes, padrão `lpRoutesSig`) — senão os keyframes reiniciam a cada snapshot (flicker).
- Definição HONESTA de "a decorrer": último evento `kind:'file'|'task'` há <90s E sem `Stop` desde
  então → pulso no 🐮 + "a editar…"/"a tarefar…". `Stop`/`SubagentStop` → "✓ pronto". Sem sinal há
  ≥90s SEM Stop → "sem sinal há Xs" (nunca spinner eterno — um crash não pode parecer trabalho).
- Vocabulário vibe-coding: "a editar" · "a tarefar" · "a rotear" · "a pensar (local $0)" · "pronto".
- CSS inline keyframes; `@media (prefers-reduced-motion: reduce)` desliga TUDO; animações só
  opacity/transform (baratas); nada anima quando o painel está hidden.
- **GATE F3 (prova viva):** gif/screencast de uma sessão real a editar (pulso → ✓) + prova do
  reduced-motion (setting do OS ligado → estático). PÁRA.

## F4 · AUTO-JOURNAL LOCAL $0 — só depois do OK do gate F3

⚠️ NÃO reescrever `handoff-rollup.js` (GUARD-0.1). Sequência:

1. **Diagnóstico nativo do wiring** (é aqui que a feature morre historicamente):
   `Test-Path ~/.claude/tools/router/handoff-rollup.js` ·
   `node ~/.claude/tools/router/sync-hooks.js --check` (tem de dar `OK self-check`) ·
   confirma que `gsd-turn-end.js` no runtime spawna o rollup (`node handoff-rollup.js <sid>`,
   detached, throttle ≥90s/≥5 turnos DENTRO do child). Stale → `/mooter-update` (idempotente) e
   re-verifica. Ollama down → o rollup já degrada sozinho (não actualiza o summary) — confirma, não
   "corrijas".
2. **Expor no Director's Cut (host-side):** no snapshot, campo novo nullable `journal`:
   `{ text, updatedAt }` lido de `summaryPath(sid)` (contrato de `handoff-journal.js::readSummary`
   — resolve o path do runtime com o MESMO padrão fail-soft do pricing em `lp-aggregates.js`:
   `~/.claude/tools/router/handoff-journal.js`, NUNCA require do workspace). `updatedAt` = mtime do
   ficheiro — o render mostra "resumo local (qwen · best-effort) · <hh:mm>" e a IDADE se >10min.
   Sem summary → "sem resumo local ainda". Sem sid → n/d.
3. Render na lente Stream (cartão no topo), rotulado best-effort — NUNCA load-bearing.
4. Testes: reader fail-soft (ficheiro ausente/vazio/garbage) + render honesto.
- **GATE F4 (prova viva):** numa sessão real, `<sid>.summary.txt` a actualizar-se + cartão visível
  com timestamp verdadeiro. Se o passo 1 revelar wiring partido que `/mooter-update` não cura,
  PÁRA e reporta (pode ser wave própria). PÁRA.

## F5 · UX/UI POLISH — só depois do OK do gate F4

- Skills de design (design-critique · design-system-management · accessibility-review · ux-writing)
  informam o DESENHO; implementação continua concat-only hand-rolled, zero libs.
- Checklist WCAG 2.2 AA concreto: contraste das barras nos DOIS temas (dark+light+high-contrast);
  foco visível nas tabs; targets ≥24×24; setas no tablist; `prefers-reduced-motion` re-provado;
  info nunca só por cor (tier tem letra além da cor).
- ux-writing: glossário fixo dos rótulos honestos num comment-header do módulo:
  `~est.` · `n/d` · "frota em repouso" · "último sinal <data>" · "resumo local" · "janela recente"
  · "sem sinal há Xs" — consistência total entre lentes.
- Consistência de tokens `--vscode-*` com o resto do cockpit (zero cores hardcoded novas sem
  fallback var()).
- **GATE F5:** screenshots dark/light/high-contrast + checklist a11y preenchido + CHANGELOG +
  bump de versão + vsix final instalado. Depois do OK do Paulo ao merge: se algo tocou
  `tools/router/`, correr o ritual pós-release do CLAUDE.md (`/mooter-update` + self-check +
  sessões CC frescas). PÁRA.

## BACK — o que reportar em CADA gate

`⇄ CC→COWORK: F<n> · branch+sha · testes (novos/total) · o que a adversarial tentou partir e o que
encontrou · provas vivas (paths dos screenshots/gif) · desvios do masterprompt (se houve, porquê) ·
pendências para o Paulo · PARADO à espera de gate.`

## NEXT (fora desta wave — NÃO fazer aqui)

- Decisões pendentes do Paulo no SYNC: PR #228 (gated, à espera de merge), nits de revert, PR do
  CCA eval harness.
- Sequenciação com `LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` (mesmo webview — depois desta wave).
- Fleet Arm (dar vida real à lente Fleet quando a frota sair de dry_run).
