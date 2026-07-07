# Live Edit · MP5.2 — Select-Lock + Prompt Ancorado + Cerca AST

> **Dor exacta do Paulo (2026-07-06, ao vivo no preview):** *"não consigo fixar onde o
> mouse clicou para garantir que o prompt vai ser realizado só naquela parte. No Lovable
> eu clicava e já mandava um prompt para resolver só aquilo."* Ele tentou selecionar uma
> pequena imagem para apagar e a seleção subiu para `<CrookOutline>` (`page.tsx:43:17`) —
> o componente, não o nó. E não há caixa de prompt livre — só TEXTO/CLASSE.
>
> **Objetivo:** a experiência de select-to-edit **melhor do mundo** — clicas → **fica preso**
> (com breadcrumb para afinar o nó exacto) → escreves um **prompt livre** → a edição cai
> **só naquele nó**, com **diff antes de aplicar**. Paridade de gesto com o Lovable, mas com
> uma **cerca determinística** por baixo (a escrita está fisicamente presa ao intervalo de
> bytes do nó) e o **chip de modelo router-native** que ninguém no tier de builders tem.

---

## 0. O que já existe em `main` (confrontado no código real — construir EM CIMA, não duplicar)

| Peça | Ficheiro (em `origin/main`) | O que faz hoje |
|---|---|---|
| Motor de edição $0 | `packages/vscode-extension/src/live-edit-ast.js` | `applyDeterministicEdit(source, {line,col,tag}, edit)` → só `kind:'text'` e `kind:'class'` por **byte-splice**; tudo o resto devolve `{ok:false, reason}` (recusa honesta — é o caminho LLM). `collectJsxElements`/`locate`/`tagNameOf` exportados. **Cada `JSXElement` já traz `.start`/`.end` em bytes.** |
| Tap de seleção (dev-only) | `landing/app/_components/lp-error-tap.ts` | `installLpErrorTap` §6 "Select-to-edit mode (MP5.1)": host liga com `{type:'lp-select-mode',on}`; hover desenha overlay em shadow DOM; **pick = `document.elementFromPoint(x,y).closest('[data-insp-path]')`** (⚠️ é aqui que sobe ao componente); click → `postMessage({type:'lp-select', file,line,col,tag, rect, text, className})`; `Esc` → `{type:'lp-select-mode-off'}`. `parseInspPath` (PURE) já separa `data-insp-path`. |
| Host / painel | `packages/vscode-extension/src/extension.js` | `LEA = require('./live-edit-ast.js')`; botão `#lp-select-btn` 🎯 (`setSelectMode`); recebe `lp-select` → `lpSelection={file,line,col,tag,rect,text,className}` → `renderSelection`; painel com "abrir no editor" (`showTextDocument`) + campos TEXTO/CLASSE → `applyDeterministicEdit`; chip `lpTier='local'`. |
| Source mapping (dev-only) | `landing/next.config.ts` | `codeInspectorPlugin({bundler:'webpack', hotKeys:false})` no hook `webpack` **só quando `dev===true`** → carimba `data-insp-path="ficheiro:linha:col:tag"`. Dead-code em prod. |

**Nota de congelamento:** `live-edit-ast.js` foi **adicionado** na wave LP-2 (não é engine congelado das waves 28-34.5). MP5.2 **estende-o com funções novas** — sem tocar `applyDeterministicEdit`/`editText`/`editClass` (os testes 617/617 têm de continuar verdes). `classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) — nunca tocado.

---

## 1. As 4 camadas (o desenho)

### A · Lock + Breadcrumb (mata a dor "não fixo onde cliquei")
- **Pin persistente:** ao clicar, o tap deixa de limpar a moldura — desenha um overlay **fixo** sobre o nó selecionado (shadow DOM, `pointer-events:none`), que só sai com `Esc` ou nova seleção. Hoje a moldura é hover-only e desaparece.
- **Breadcrumb:** no click, o tap sobe a árvore a coleccionar **todos** os ancestrais com `[data-insp-path]` e envia `path:[{file,line,col,tag,label}, …]` (raiz→folha). O host desenha chips clicáveis `section › CrookOutline › img`; clicar num chip re-emite `lp-select` para esse ancestral (re-pin). Validado pelo padrão do **RN Dev Inspector** (breadcrumb da árvore de componentes, tap em qualquer ancestral).

### D · Descer ao nó (mata o "aterrou no componente, não na imagem")
- O pick passa de `closest('[data-insp-path]')` (sobe ao 1º ancestral com carimbo) para: **o elemento carimbado mais profundo sob o cursor**. `elementFromPoint` já dá a folha; se a folha tiver `data-insp-path`, usa-a; senão sobe (comportamento actual como fallback). Com a breadcrumb, o Paulo sobe/desce à mão se precisar.
- **Limitação honesta (surface no painel):** se o nó vive dentro de um componente partilhado (`CrookOutline` definido noutro ficheiro), o `data-insp-path` aponta para a **definição** — editar afeta **todos os usos**. Onlook chama a isto "component scope"; o painel avisa: *"este nó vive em `CrookOutline.tsx` — a edição afeta todos os usos."*

### C · Cerca AST (a GARANTIA — a escrita está presa ao nó, não à confiança no LLM)
Funções **novas** em `live-edit-ast.js` (aditivas):
- `locateRange(source, target) → {start, end, el} | {ok:false}` — reusa `parse`+`collectJsxElements`+`locate`; devolve os bytes `el.start..el.end` (o subtree exacto).
- `deleteNode(source, target) → {ok, code, kind:'delete'}` — remove `start..end` **+ o whitespace/linha órfã** à volta; **$0, zero LLM, determinístico**. É o gesto do Paulo ("apaga esta imagem").
- `spliceNodeRange(source, {start,end}, replacement) → {ok, code} | {ok:false, reason}` — **fail-closed**: valida que `replacement` (a) faz parse como JSX, (b) é **um único elemento-raiz**, (c) substitui **só** `start..end`. Se falhar qualquer condição → **rejeita** (nunca escreve). Mesmo que o modelo alucine, a escrita não pode tocar outro byte.

> **Porque é melhor que o Lovable:** o Lovable sincroniza a AST inteira no browser e **confia** que a mutação fica no sítio (às vezes escapa). Aqui o modelo só **vê** o subtree (`source.slice(start,end)`) e a escrita é **byte-bounded** — a cerca é arquitectural, não confiança.

### B · Prompt Ancorado (paridade de gesto Lovable + router-native)
- Caixa **"descreve a mudança…"** colada ao nó preso + botão **🗑 apagar** (determinístico $0).
- Roteamento honesto por dificuldade:
  - `apagar` / `texto` / `cor·spacing·classe` → **determinístico $0**, sem modelo (o que já existe + `deleteNode`).
  - prompt livre difuso ("transforma em avatar redondo com borda") → **modelo roteado**; default **local Ollama qwen3:30b ($0)** na 4090; escalar a cloud (Haiku/Sonnet) é **opt-in** com custo honesto no chip. O host manda **só o subtree** + o prompt, recebe o replacement, passa pela **cerca `spliceNodeRange`**, mostra **diff visual**, aplica no OK.
- Chip router-native (advisory, lê o mapeamento — **não executa** `classify.js`): *"Moo faz isto local $0 · [subir p/ Sonnet]"*.

---

## 2. Faseamento (SHIP a dor primeiro; o modelo depois)

| Fase | Entrega | Modelo? | Mata |
|---|---|---|---|
| **MP5.2a** | **Delete $0** + **Lock/pin** + **Breadcrumb** + **Descer-ao-nó** + diff do nó a remover | ❌ zero LLM | a dor exacta do Paulo ("seleciono a imagem e apago só ela") — determinístico, instantâneo |
| **MP5.2b** | **Prompt livre ancorado** → modelo roteado (local $0 default) → **cerca `spliceNodeRange`** → **diff antes de aplicar** | ✅ byte-bounded | "mando um prompt e resolve só aquilo" (paridade Lovable + chip) |
| **MP5.3** | Seleção de **ÁREA** (marquee → screenshot recortado + nós contidos + multimodal) | ✅ | o "print" — já na fila |

MP5.2a é o **maior ganho por menor risco**: resolve o gesto sem tocar num modelo. Aterrar primeiro, ver ao vivo, depois 5.2b.

---

## 3. ⇄ MASTERPROMPT · MP5.2a — Delete $0 + Lock + Breadcrumb + Descer-ao-nó

```
# ⇄ COWORK→CC · WAVE LP-3 · MP5.2a — Select-Lock + Delete determinístico ($0)

Lê _handoff/LIVE_EDIT_MP5_2_SelectLock_Spec.md (§0, §1 camadas A/C/D, §2). Arquitectura
Opus, código Sonnet. PROTOCOLO à prova de erro R1–R6. NÃO tocar classify.js (FROZEN) nem
applyDeterministicEdit/editText/editClass (617/617 têm de ficar verdes).

## 🛡️ PROTOCOLO
- R1: git fetch; git worktree add -b wave/lp-mp5-2a ../frugal-mp52a origin/main; cd lá;
  confirma `git rev-parse --show-toplevel` == ...frugal-mp52a.
- R2: commit atómico após CADA peça (antes de teste manual).
- R5: base = origin/main actual (já tem MP5.1).

## ▶ DO (por ordem; COMMIT após cada)
1. **Motor: cerca + delete** — em live-edit-ast.js ADICIONA (sem tocar no existente):
   `locateRange(source,target)→{ok,start,end,el}` (reusa parse/collect/locate) ·
   `deleteNode(source,target)→{ok,code,changed,kind:'delete'}` (remove start..end + a linha
   órfã/whitespace envolvente, byte-splice, $0) · `spliceNodeRange(source,{start,end},repl)→
   {ok,code}|{ok:false,reason}` fail-closed (repl tem de fazer parse JSX + ser 1 raiz + só
   substitui start..end). Testes unitários novos (delete simples, delete preserva irmãos,
   splice rejeita repl inválido/multi-raiz). **→ COMMIT.**
2. **Tap: descer-ao-nó + breadcrumb** — em lp-error-tap.ts §6: pick = elemento carimbado
   MAIS PROFUNDO sob o cursor (elementFromPoint→se tem data-insp-path usa; senão closest,
   como fallback). No click, sobe a árvore a coleccionar ancestrais com data-insp-path →
   inclui `path:[{file,line,col,tag,label}...]` (raiz→folha) no lp-select. **→ COMMIT.**
3. **Tap: pin persistente** — a moldura do nó selecionado passa a FIXA (não limpa no
   mouseout); só sai em Esc ou nova seleção. Overlay em shadow DOM, pointer-events:none.
   **→ COMMIT.**
4. **Host: breadcrumb + descer** — em extension.js/renderSelection: desenha os chips da
   breadcrumb (path[]); clicar num chip re-emite lp-select desse ancestral (re-pin no tap
   via nova msg {type:'lp-reselect', file,line,col,tag}). Aviso honesto quando o file do nó
   ≠ file da rota actual ("vive em X.tsx — edição afeta todos os usos"). **→ COMMIT.**
5. **Host: botão 🗑 apagar + diff** — no painel, botão "apagar elemento" → lê o source do
   file, chama LEA.deleteNode({line,col,tag}) → mostra um mini-diff (as linhas removidas)
   → no "aplicar" grava o ficheiro (HMR mostra). Copy honesta: "apagar é determinístico —
   $0, sem tokens". **→ COMMIT.**

## 🔒 GUARD (R4)
classify.js FROZEN · applyDeterministicEdit/editText/editClass INTACTOS · delete/splice
NUNCA tocam LLM · code-inspector dev-only · selective git add · SEM push/merge sem OK ·
toca só packages/vscode-extension/ + landing/ · PT-PT no chat, EN no código.

## ✅ GATE (cola tudo)
Ligo o 🎯 → passo o rato → clico na IMAGEM → a moldura FICA PRESA e a breadcrumb mostra
`… › CrookOutline › img` · clico "apagar" → mini-diff mostra só a linha da imagem → aplico
→ a imagem some no preview, $0, e NENHUM outro byte mudou (git diff mínimo) · Esc solta ·
testes extensão 617+novos verdes · landing vitest verde · classify.js sha intacta · git
status limpo. PÁRA no gate; cola git log --oneline + testes + sha.
```

---

## 4. ⇄ MASTERPROMPT · MP5.2b — Prompt Ancorado + Modelo Roteado (byte-bounded)

```
# ⇄ COWORK→CC · WAVE LP-4 · MP5.2b — Prompt livre ancorado, edição só no nó (cerca AST)

PRÉ-REQ: MP5.2a aterrado em main (delete/lock/breadcrumb/spliceNodeRange existem). Lê
_handoff/LIVE_EDIT_MP5_2_SelectLock_Spec.md §1 camadas B/C. R1–R6. classify.js FROZEN.

## ▶ DO (por ordem; COMMIT após cada)
1. **Runner de edição escopada ($0 local)** — módulo novo (ex: live-edit-model.js): recebe
   {nodeSource, prompt, file, line} → chama um moo LOCAL (Ollama qwen3:30b via ~/.mooter,
   $0) com um sistema estrito: "reescreve APENAS este elemento JSX; devolve só o elemento,
   sem prosa". Timeout + fail-soft. NUNCA manda o ficheiro inteiro — só nodeSource. **→ COMMIT.**
2. **Cerca na aplicação** — o resultado passa OBRIGATORIAMENTE por spliceNodeRange (parse +
   1 raiz + só start..end). Se rejeita → mostra o motivo, não escreve. **→ COMMIT.**
3. **Painel: caixa de prompt ancorada + diff visual** — "descreve a mudança…" no nó preso →
   corre runner → mostra DIFF (before/after do nó) → aplica só no "aplicar". **→ COMMIT.**
4. **Chip router-native + escalação** — chip mostra o tier (advisory, lê mapeamento, NÃO
   executa classify.js); default local $0; botão "subir p/ Sonnet" (cloud, opt-in, custo
   honesto). Deterministic (delete/text/class) continua a NÃO chamar modelo. **→ COMMIT.**

## 🔒 GUARD
Escrita SEMPRE byte-bounded (spliceNodeRange) — modelo só vê o subtree, nunca escreve fora ·
local-first $0 default, cloud opt-in com cap · classify.js FROZEN · diff antes de aplicar
(irreversível passa por confirmação) · sem push/merge sem OK.

## ✅ GATE
Clico na imagem → escrevo "põe cantos redondos e uma borda fina" → corre local $0 → DIFF
mostra só o nó → aplico → muda só aquele elemento (git diff cercado ao nó) · escrevo algo
impossível → rejeita honesto, não escreve · chip diz local $0 e deixa subir · sha intacta ·
testes verdes · git status limpo. PÁRA no gate.
```

---

## 5. Decisões honestas / limitações (não esconder)

1. **Componente partilhado = edição global.** Se o nó vive numa definição de componente
   reutilizada, apagar/editar afeta todos os usos. Surface no painel; não é bug, é a
   natureza do source-mapping (Onlook tem o mesmo — "component scope").
2. **`deleteNode` remove o elemento JSX, não o dado por trás.** Se a imagem vem de um
   `.map()` sobre dados, apagar o `<img>` no JSX remove-o do template (todos os itens). O
   painel deve dizê-lo quando o nó está dentro de um `.map`/expressão.
3. **O runner local (5.2b) é $0 mas não é infalível** — por isso a **cerca** e o **diff
   antes de aplicar**: o pior caso é "rejeitado, não escreveu", nunca "escreveu no sítio
   errado".
4. **`extension.js` "never executes workspace code":** o runner executa um **modelo** (não
   scripts do workspace) e escreve um **byte-splice que ele próprio validou** — é uma
   fronteira nova a confirmar contigo antes de 5.2b (5.2a não a toca).

## 6. Fontes
- Código real: `origin/main` — live-edit-ast.js, lp-error-tap.ts §6, extension.js, next.config.ts (confrontado 2026-07-06).
- Onlook (build-time attribute injection + component scope + AST write-back): docs.onlook.com/developers/architecture.
- Lovable "How we built Visual Edits" (AST client-side, Babel/SWC, AST > regex p/ className; multi-select Cmd/Ctrl): lovable.dev/blog/visual-edits.
- RN Dev Inspector (breadcrumb da árvore, tap em ancestral): react-dev-inspector.
- code-inspector-plugin (webpack/Next, MIT): npmjs.com/package/code-inspector-plugin.
```
