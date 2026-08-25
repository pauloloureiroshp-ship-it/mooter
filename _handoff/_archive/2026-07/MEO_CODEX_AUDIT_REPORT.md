# Auditoria funcional independente — MEO v0.16.63

**Auditor:** Codex, independente da implementação · **data:** 2026-07-10  
**Objeto imutável:** `c5cda85ef609f9f870b0390b6587d465f97f075d` (`mooter-cockpit` 0.16.63)  
**Régua:** PASS exige teste executado + código + dado real quando aplicável. Produto não foi editado.

## 1. TL;DR executivo

- **Veredicto global: funcional, mas não “perfeito”: 10 PASS e 2 PARTIAL nas 12 promessas.** Não encontrei FAIL funcional.
- Paulo provavelmente não notou diferença porque o MEO vive no **painel separado Live Preview**, no rail direito; a sidebar Cockpit que ele abre normalmente não recebeu o MEO.
- A extensão activa é **0.16.65**, não 0.16.63; 0.16.63 está instalada lado a lado. Isto não explica ausência: o código instalado 0.16.65 também contém o MEO.
- No workspace `frugal` há bus real (1.255 eventos), portanto o empty-state não é a causa se esse for o workspace aberto.
- Prova total reproduzível: **1020/1020 testes passaram** na worktree Windows correcta; alvo MEO: **78/78**.
- Dados reais: 315 operações lidas do `execution.log`; 315 atribuídas aos modelos. Fleet real degradou honestamente para `resting:true` com heartbeat antigo.
- Gap de honestidade: o Brain mostra `custo $X` sem `~est.` (`live-preview-view.js:215-248`), contrariando o glossário transversal.
- Gap de UX: só Stream explica como gerar dados; Dia/LLM/Fleet dizem apenas “sem ... ainda”.
- Contraste dark/light/high-contrast e movimento real permanecem **N/V sem gate visual humano**.
- Os dois documentos de contrato não existem no snapshot `c5cda85`; foram lidos na árvore partilhada. É uma lacuna de rastreabilidade da release.

## 2. Tabela A — “não notei diferença”

| # | Prova | Veredicto |
|---|---|---|
| A1 · build instalado | Pastas presentes: `0.16.49`, `0.16.62`, `0.16.63`, `0.16.65`. O registo `%USERPROFILE%\.vscode\extensions\extensions.json` aponta `mooter.mooter-cockpit` para **0.16.65**. Os logs do Extension Host mostram activações do Mooter em várias janelas. O próprio 0.16.65 instalado contém `🐮 MEO — Moo Executive Officer` e as quatro tabs (`extension.js:3083-3146` da extensão instalada). Logo: há drift/múltiplas versões, mas não um build velho sem MEO. | **PASS diagnóstico** |
| A2 · onde aparece | O diff `f5a1f04..c5cda85` acrescenta MEO dentro de `getLivePreviewHtml`: rail `#lp-side`, `#lp-dc`, `lpLensHd` e tabs (`extension.js:3027-3111`). O mesmo diff tem **zero hunks com `mooterCockpit`**; a view continua registada separadamente em `package.json:76-82`. | **PASS** |
| A3 · empty-state | Stream orienta: “corre uma sessão e o stream aparece aqui” (`live-preview-view.js:188-190`). Brain diz “sem decisões ainda” (:237-239), Dia/LLM dizem “sem decisões ainda” (:261-263, :349-353) e Fleet “sem sinais da frota ainda” (:418-422). São honestos, mas três superfícies não dão próximo passo. No `frugal` real, o bus existia com **1.255 linhas / 340.625 bytes**, logo esse workspace não está vazio. | **PARTIAL — copy honesto, orientação incompleta** |

**Onde clicar para ver o MEO:** clica na vaca **Mooter** → no topo do **Cockpit**, clica no ícone **Open Live Preview 🎬** (ou `Ctrl+Shift+P` → `Mooter: Open Live Preview 🎬`) → o MEO está no rail direito do painel.

## 3. Tabela B — contrato prometido vs entregue

| # | Evidência executada e inspecionada | Veredicto |
|---|---|---|
| B1 · Dia | `lp-aggregates.test.js` passou dentro dos 78/78. Fixture independente com 3 dias produziu `daysTotal:3`, 2 eventos colocados, 1 decisão, 2 exec ops e `window.unplaced:2` para os dois timestamps inválidos. Dia sem decisão manteve `pctLocal:null`/`costEstUsd:null`; implementação em `lp-aggregates.js:197-278`; render `n/d`/`~est.` em `live-preview-view.js:254-340`. | **PASS** |
| B2 · LLM × operação | Testes passaram. `readExecutionTail` sobre o log real leu 315 registos; `buildByModel.window.execOps=315`, `opsUnattributed=0` e soma das linhas de modelo = 315. Ops e rotas são colunas distintas (`live-preview-view.js:343-410`). Sentinela `unknown` vira null (`lp-aggregates.js:64-94`); T5 é excluído de `COSTABLE_TIERS` (:170-181) e renderizado `opt-in`, nunca `$0` (:369-382). | **PASS** |
| B3 · Fleet | Testes de heartbeat ausente/`running:null` passaram. Fixture sobre `_handoff/fleet` real: heartbeat `2026-06-23T03:35:19.429Z`, `dryRun:true`, `running:[]`, 12 pilares, `resting:true`. O render sempre mostra timestamp + idade (:414-477); sem heartbeat mostra `n/d`, e o builder só produz false quando há heartbeat (`lp-aggregates.js:413-477`). | **PASS** |
| B4 · quatro lentes/tabs | Testes `dcv2-tabstate`, `dcv2-tabs`, lenses/work/debounce/journal: 78/78. Markup tem `tablist`, quatro `tab`, painéis, `aria-selected`, teclado ←→/Home/End, alvo `min-height:24px` e foco (`extension.js:2915-2918,3027-3111`). O render é assinado e preserva scroll (:3083-3093). Mutação **em memória** de `chips.length` esperado de 4→5 tornou o teste vermelho: 3 pass / 1 fail, `4 !== 5`; nenhum ficheiro foi alterado. | **PASS** |
| B5 · pulso honesto | `dcv2-work.test.js` passou, incluindo no-op assinado e transição real. `renderWorkPill` dá “a editar…” <90s, “✓ pronto” após Stop e “sem sinal há X” ≥90s (`live-preview-view.js:480-519`). Keyframe MEO altera só `opacity` e o guard global `prefers-reduced-motion` mata animações (`extension.js:2619,2933-2939`). | **PASS** |
| B6 · auto-journal $0 | Wiring real existe em `~/.claude/tools/router/handoff-rollup.js`: `MIN_MS=90*1000`, `MIN_TURNS=5`, qwen/Ollama best-effort e lock (:27-31,115-168). Havia **8 summaries com mtime de hoje**, incluindo as duas sessões presentes no fim do `execution.log` (16:25 e 15:49 local). Card mostra qwen/best-effort, hh:mm, idade >10 min e empty-state honesto (`live-preview-view.js:522-544`). Testes F4 passaram. | **PASS** |
| B7 · rename MEO | UI contém título/subtítulo exactos e papéis Chief of Staff/COO/CFO/COO (`extension.js:3028,3082`). Não há copy visível órfã no rail; ocorrências `Director` em `src/` são identificadores/comentários internos que o contrato **manda não renomear** (`MEO_SUPER_MASTERPROMPT.md:32-48`). CHANGELOG conserva o alias de continuidade. | **PASS** |
| B8 · honestidade transversal | Dia/LLM distinguem workspace vs máquina, `n/d`, `costUncounted` e `~est.` (`live-preview-view.js:311-330,394-405`); T5 não é custeado. **Lacuna concreta:** Brain forma `$X` em :215-217 e apresenta `custo <b>$X</b>` em :248, sem `~est.` junto do valor. O subtítulo global diz custos `~est.`, mas o contrato exige o rótulo transversal em cada custo. | **PARTIAL** |
| B9 · WCAG estrutural | Tokens MEO usam `var(--vscode-charts-*, #fallback)` (:2883); tiers incluem texto T0-T3 e legenda textual (`live-preview-view.js:224-236,287-307`); tabs têm foco visível, ARIA e 24px. Grep dos renderers encontrou hex apenas como fallback de `var()`. **Contraste efectivo nos três temas não foi mensurado visualmente nesta auditoria headless.** | **PARTIAL — estrutura PASS; visual N/V** |
| B10 · debounce | `dcv2-debounce.test.js` passou: rajada→1 chamada, `flush()` imediato e cancel. Wiring real usa 1500ms no watcher; ao reabrir/visibilizar faz `_post()` imediato e cancela o pendente, evitando duplicação (`extension.js:2531-2552`). | **PASS** |
| B11 · integração | Em worktree criada pelo Git do Windows no `c5cda85`: **tests 1020, pass 1020, fail 0, 7139ms**. `f5a1f04` é primeiro parent/ancestral do merge. Spot-checks presentes e cobertos: `suggestLocalChip` (`lp-task-view.test.js`), segurança (`lp-security-view.test.js`) e layout/LP-4.9 (`data.test.js`, `webview-syntax.test.js`). | **PASS** |
| B12 · conteúdo VSIX | `vsce ls --no-dependencies` exit 0: inclui `src/lp-aggregates.js`, `live-preview-view.js`, `lp-stage.js`, `lp-task-view.js`, `lp-security-view.js`, `lp-publish-view.js`, `extension.js` e demais LP-4.x. A lista não contém nenhum `*.test.js`. | **PASS** |

## 4. Checklist manual de 30 segundos para o Paulo

1. No VS Code, faz **Developer: Reload Window** para garantir que a activa é a 0.16.65.
2. `Ctrl+Shift+P` → escreve **Mooter: Open Live Preview 🎬** → Enter.
3. Olha o **rail direito**, não a sidebar: confirma `🐮 MEO — Moo Executive Officer`.
4. Clica **Stream**: deves ver o resumo local, o 🐮 e eventos; **Dia**: datas/tiers/custo; **LLM**: `ops reais` separados de `rotas`; **Fleet**: “frota em repouso” e idade do último sinal.
5. Se aparecer “sem dados”, abre uma sessão Claude Code e executa uma acção; Stream deve dizer como desbloquear.
6. Gate visual N/V: alterna rapidamente para tema Light e High Contrast; texto, tiers, foco e barras têm de continuar legíveis. Com reduced-motion do SO activo, o 🐮 não pode pulsar.

## 5. Gaps prometido-vs-entregue

1. **Rotulagem incompleta de custo:** Brain omite `~est.` no próprio valor.
2. **Descoberta fraca:** o nome MEO não aparece na superfície que o utilizador abre; a entrada é um pequeno ícone do Live Preview no title bar do Cockpit.
3. **Empty-states sem acção:** Dia/LLM/Fleet degradam honestamente, mas não explicam como gerar o sinal.
4. **Gate visual não automatizado:** estrutura WCAG está provada; contraste real dark/light/high-contrast e motion dependem de humano.
5. **Rastreabilidade:** os dois documentos que definem o contrato retornam exit 128 em `git show c5cda85:<path>`; não fazem parte do snapshot auditado.

## 6. Top-5 recomendações (impacto no vibe coder ÷ esforço)

| Prioridade | Recomendação | Impacto / esforço | Onde |
|---|---|---|---|
| 1 | Tornar o MEO descobrível no Cockpit com CTA textual “Abrir MEO no Live Preview”, não apenas ícone. | Muito alto / baixo | `package.json` menu + `extension.js` renderer/comando `mooter.openLivePreview` |
| 2 | Trocar Brain para `custo ~est. $X` e fixar teste adversarial que falhe se surgir `$` sem rótulo. | Alto (confiança) / trivial | `live-preview-view.js::renderBrain` + teste |
| 3 | Unificar empty-states com uma acção curta: “abre uma sessão e executa uma tarefa”; distinguir “fonte ausente” de “janela vazia”. | Alto / baixo | `renderDayBreakdown`, `renderModelBreakdown`, `renderFleetLanes` |
| 4 | Mostrar versão/build activo no cabeçalho/tooltip do MEO e recomendar limpeza de versões antigas após instalação. | Médio / baixo | `getLivePreviewHtml` + pipeline de instalação VSIX |
| 5 | Adicionar gate de screenshot/contraste nos três temas e reduced-motion à release; arquivar o contrato no mesmo commit publicado. | Médio / médio | testes da extensão + `_handoff/_archive/2026-07/` |

## 7. Apêndice — outputs brutos relevantes

### Setup e versão

```text
HEAD is now at c5cda85 Merge pull request #237 .../wave/directors-cut-v2
package.json: "version": "0.16.63"
commit=c5cda85ef609f9f870b0390b6587d465f97f075d
parents=f5a1f047... e3d35dceb...
```

### Instalação activa

```text
mooter.mooter-cockpit-0.16.49
mooter.mooter-cockpit-0.16.62
mooter.mooter-cockpit-0.16.63
mooter.mooter-cockpit-0.16.65
extensions.json → id=mooter.mooter-cockpit version=0.16.65
```

### Testes

```text
alvo MEO: tests 78 | pass 78 | fail 0 | duration 346ms
suite total: tests 1020 | pass 1020 | fail 0 | duration 7139ms
mutante em memória 4→5 tabs: tests 4 | pass 3 | fail 1 | actual 4, expected 5
```

**Nota forense sobre o primeiro run:** a primeira worktree foi criada pelo Git do WSL; o `.git` apontava para um caminho Unix que o `git.exe` filho não podia abrir. Resultado inicial: 1016/1020, com quatro falhas exclusivamente em testes “real git repo”. Recriei o mesmo caminho/commit pelo Git do Windows e o resultado válido foi 1020/1020. Não classifiquei falha ambiental como regressão do MEO.

### Fixtures e dados reais

```text
buildByDay: daysTotal=3 daysShown=3 events=3 decisions=2 execOps=2 unplaced=2
execution.log: ficheiro total=14.064 linhas / 2.898.424 bytes
readExecutionTail: parsed=315 execOps=315 opsUnattributed=0 sumAttributed=315 modelsTotal=5
fleet: heartbeat=2026-06-23T03:35:19.429Z dryRun=true running=[] pillars=12 resting=true
bus frugal: 1.255 linhas / 340.625 bytes; mtime 2026-07-10 10:53:43 -0300
summaries de hoje: 8; mais recentes 16:25:40 e 15:49:31 -0300
```

### VSIX

```text
vsce ls --no-dependencies: exit 0
inclui: src/lp-aggregates.js, src/live-preview-view.js, src/lp-stage.js,
src/lp-task-view.js, src/lp-security-view.js, src/lp-publish-view.js, src/extension.js
*.test.js na lista: 0
```

### Invariantes e higiene

```text
classify.js sha256 = 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
worktree antes do fecho: apenas package-lock.json modificado por npm install temporário
produto partilhado: nenhum código editado; único output persistente = este relatório
cleanup: `worktree remove --force` foi solicitado, mas bloqueado pelo reviewer da sandbox por descartar o package-lock temporário; `C:\tmp\frugal-meo-audit` permanece até autorização explícita pós-aviso
```
