# 🔍 CODEX · AUDITORIA FUNCIONAL INDEPENDENTE — MEO (Moo Executive Officer) v0.16.63

> **Papel:** és o auditor INDEPENDENTE. Não construíste nada disto (foi o Claude Code) e o teu
> valor é exactamente esse: verificar sem apego, com evidência, se o que foi PROMETIDO está
> mesmo A FUNCIONAR. O dono do produto reportou "não notei muita diferença" — leva esse sinal
> a sério: ou a feature não funciona, ou funciona mas não está onde ele olha, ou o build
> instalado não é o publicado. As três hipóteses são verificáveis. Prova, não opines.
>
> **READ-ONLY ABSOLUTO sobre o produto:** zero fixes, zero commits, zero push, zero edits a
> código. NUNCA tocar em `tools/router/classify.js` nem em `.git` de árvores partilhadas.
> O teu ÚNICO output de escrita é o relatório: `_handoff/MEO_CODEX_AUDIT_REPORT.md`
> (em C:\Users\Paulo Loureiro\frugal — novo ficheiro, só ele).

## Setup (worktree limpa, descartável)
```
git -C "C:\Users\Paulo Loureiro\frugal" worktree add C:\tmp\frugal-meo-audit c5cda85
cd C:\tmp\frugal-meo-audit && cd packages\vscode-extension && npm install
```
`c5cda85` = merge do PR #237 em main (o MEO publicado, 0.16.63). Confirma antes de tudo:
`git log -1 --format="%h %s"` e `package.json version == 0.16.63`. Divergiu → PÁRA e reporta.

## Régua de veredicto (por feature)
`PASS` = evidência directa de funcionamento (teste corrido por TI + inspecção de código + dado
real quando aplicável) · `PARTIAL` = funciona com lacuna concreta (descreve-a) · `FAIL` =
prometido e não funciona (prova) · `N/V` = não verificável por ti (ex.: pixel/animação visual)
— nesses casos escreve O QUE o humano deve olhar para verificar em 30s.
NUNCA dês PASS por "o teste existe" — corre-o. NUNCA dês PASS por "o código parece certo" —
exercita-o (node -e com fixtures reais quando não houver teste).

## A. O caso "não notei diferença" (investiga PRIMEIRO — é a pergunta do dono)
A1. Que versão está INSTALADA na máquina? `dir "%USERPROFILE%\.vscode\extensions" | findstr mooter`
    — se a mais recente não for `mooter.mooter-cockpit-0.16.63`, achaste a causa raiz. Reporta
    também se há múltiplas versões lado a lado.
A2. ONDE a diferença aparece: confirma por código que o MEO vive no painel Live Preview
    (`getLivePreviewHtml`/rail com `lpLensHd`) e que a sidebar do Cockpit (view `mooterCockpit`)
    NÃO foi alterada pelo PR #237 (diff f5a1f04..c5cda85 nos ficheiros do deck). Se confirmado,
    escreve no relatório a instrução de 1 linha: onde clicar para VER o MEO.
A3. O empty-state engana? Se o workspace aberto não tiver bus (`_handoff/live-preview/events.jsonl`),
    as lentes mostram "sem dados ainda" — verifica quais superfícies degradam e se o copy guia o
    utilizador ou o deixa perdido (achado de UX, não bug).

## B. Matriz de features prometidas (o contrato — audita UMA a UMA)
Fontes do contrato: `_handoff/_archive/2026-07/DIRECTORS_CUT_V2_HANDOFF.md` (as 7 melhorias) +
`_handoff/_archive/2026-07/MEO_SUPER_MASTERPROMPT.md` (F5/F6). Para cada linha: evidência
(ficheiro:linha, comando+output, nº de teste) + veredicto.

| # | Prometido | Como verificar (mínimo) |
|---|---|---|
| B1 | Breakdown por DIA (buckets local-day, eventos×decisões×exec, ~est./dia, dia sem decisões → n/d) | corre `node --test src/lp-aggregates.test.js`; depois exercita `buildByDay` com fixtures de 3 dias incl. ts inválido (→ `window.unplaced`) e valida contagens à mão |
| B2 | Breakdown por LLM×operação ("ops reais" do execution.log SEPARADO de "rotas" do decisions.log; poupança vs all-Opus ~est.; `model=unknown`→null nunca linha falsa; T5/Fable nunca custeado) | testes + exercício com log real: lê o TEU `%USERPROFILE%\.claude\hooks\execution.log` (se existir) via `readExecutionTail` e verifica que a soma de ops bate com as linhas |
| B3 | Fleet em paralelo (heartbeat.running[] + STATE.json; `resting` honesto; **idade do último sinal SEMPRE visível**; sem heartbeat → `running:null`, nunca false) | testes + `buildFleet` contra os JSONs reais de `_handoff/fleet/` e confere que o render inclui a idade |
| B4 | 4 lentes + tabs (a11y: role=tablist, setas, ≥24px; um snapshot NUNCA ressalta tab/scroll — render assinado) | corre `dcv2-tabstate.test.js` e `dcv2-tabs.test.js`; verifica por mutação rápida que os asserts são load-bearing (muda 1 linha do teste → vermelho → reverte) |
| B5 | Pulso 🐮 honesto ("a editar…"→"✓ pronto"; ≥90s sem Stop → "sem sinal há Xs" — crash nunca parece trabalho; prefers-reduced-motion mata a animação) | `dcv2-work.test.js` + inspecção do CSS (keyframes só opacity/transform + media query presente) |
| B6 | Auto-journal local $0 (rollup qwen throttled ≥90s/≥5 turnos; cartão "resumo local (qwen · best-effort) · hh:mm" com IDADE se >10min; sem summary → honesto) | wiring REAL: `%USERPROFILE%\.claude\tools\router\handoff-rollup.js` existe? summaries em `...\router\handoff\*.summary.txt` com mtime RECENTE (há sessões vivas hoje)? Se mtimes velhos com sessões activas → PARTIAL com causa |
| B7 | Rename MEO completo (título `🐮 MEO — Moo Executive Officer` + sublinha honesta; papéis Chief of Staff/COO/CFO/COO; ZERO órfãos "Director's Cut" fora do alias único do CHANGELOG) | `grep -rn "Director" packages/vscode-extension/src/` — cada hit é alias documentado ou órfão (FAIL) |
| B8 | Honestidade transversal (todo custo com `~est.`; `n/d` nunca 0 fabricado; âmbitos "deste workspace" vs "desta máquina"; `costUncounted` declarado) | grep dos rótulos no código serializado + procura ADVERSARIAL do contrário: algum caminho onde null vira 0 ou string vazia vira valor? |
| B9 | WCAG estrutural (tokens `--vscode-charts-*` c/ fallback nos 3 temas; tier com LETRA além da cor; legenda texto no Brain; focus-visible) | inspecção de código + grep de hex hardcoded novo SEM var() nas fns dcv2 |
| B10 | Perf (debounce ~1500ms no watcher do bus — rajada de appends → 1 `_post`; flush no view-state) | `dcv2-debounce.test.js` + localiza o wiring real no extension.js |
| B11 | Integração íntegra (main = MEO SOBRE lp-4.9+layout #231; nada da main perdido no merge) | suite COMPLETA em main: `npm test` → esperado 1020/1020 (regista o número real); spot-check 3 features da main pré-MEO (ex.: suggestLocalChip, lp-security-view, layout) presentes e testadas |
| B12 | vsix embarca tudo (lp-aggregates + módulos LP-4.x; testes excluídos) | `npx vsce ls` na worktree e confere a lista |

## C. Relatório — `_handoff/MEO_CODEX_AUDIT_REPORT.md` (o entregável)
Estrutura obrigatória:
1. **TL;DR executivo** (≤10 linhas): veredicto global + a resposta directa a "porque é que o
   Paulo não notou diferença" (A1-A3) + top-3 achados.
2. **Tabela A** (caso "não notei diferença") e **Tabela B** (12 features × evidência × veredicto).
3. **Checklist manual de 30s para o Paulo** — o que abrir/clicar para ver cada feature viva
   (passo a passo, sem jargão), incluindo os N/V visuais.
4. **Gaps prometido-vs-entregue** (se houver) + **top-5 recomendações** priorizadas
   (impacto no vibe coder ÷ esforço), cada uma com o ficheiro/função onde mexer.
5. **Apêndice:** outputs brutos dos comandos (versões, contagens de teste, greps).
Sê tão duro quanto a evidência permitir — um relatório só-elogios não vale os créditos.

## Fecho
Depois de escrever o relatório: `git worktree remove C:\tmp\frugal-meo-audit --force` (a TUA
worktree descartável, mais nada) e termina com um resumo de 5 linhas + path do relatório.
