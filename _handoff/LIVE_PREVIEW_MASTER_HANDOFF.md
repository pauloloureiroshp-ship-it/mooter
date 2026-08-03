# ⇄ HANDOFF Cowork→Cowork (chat fresco · Fable 5) · Live Preview — o melhor do mundo

> **Para quê:** esta sessão (Opus 4.8) chegou ao limite; abre-se um **chat Cowork fresco**
> (com Fable 5 disponível) para levar o **Live Preview** do Mooter a ser o melhor do mundo,
> **sem perder um grama de contexto**. Este ficheiro é a fonte de verdade do arranque. Lê-o
> inteiro + os ficheiros linkados **antes** de tocar em código.
>
> **Data:** 2026-07-06 · **Repo:** `~/frugal` (mooter.ai, MIT) · **Plugin:** `packages/vscode-extension` v0.16.48
> · **classify.js sha FROZEN:** `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` (confirmada intacta em origin/main hoje).

---

## 0. Como usar este handoff (boot em 4 passos)
1. Lê este ficheiro inteiro.
2. Lê os 2 specs centrais: **`_handoff/LIVE_EDIT_MP5_2_SelectLock_Spec.md`** (o trabalho que falta, com masterprompts prontos) e **`_handoff/LIVE_EDIT_MP5_SPEC.md`** (a auditoria + arquitectura completa MP5.0→5.3).
3. Lê o protocolo de disciplina: **`_handoff/LIVE_PREVIEW_POSTMORTEM_PROTOCOL.md`** (R1–R6).
4. **Confronta o git REAL nativo** (não confies no mount — ver §9) antes de qualquer edição.

---

## 1. Quem é o Paulo + como falar com ele (não negociável)
- Founder pós-exit (B3/Shipay), background comercial/jurídico/ops, **não-dev**, em sabbatical técnica a aprender engenharia com AI como multiplicador.
- **PT-PT sempre** (não PT-BR): "ficheiro", "ecrã", "actualizar". **"Tu", nunca "você".** Excepção: interfaces de produto BR e código/identificadores em EN.
- Tom **founder-pragmatic, directo, denso em factos. Tabelas > prosa.** Marcadores: ✅ feito · 🔜 próximo · 🟡 em curso · ⚠️ atenção · ❌ não fazer · 🔥 foco · ❄️ pausa.
- ❌ **Sem hype vazio** ("revolutionary", "game-changing", "interessante", "ótima pergunta"). ❌ **Nunca inventar números** — se não sabes, diz "verifica em X". ✅ **Honest-copy** é o valor do Mooter: dizer a verdade sobre custo e limitações é feature, não fraqueza.
- Antes de afirmar sobre LLMs/APIs/dev-tools/frameworks AI → **web_search obrigatório** (mudam <30 dias). Citar fontes: "vault X · web hoje Y · recomendo Z".

## 2. Invariantes Mooter (CI-enforced onde indicado — quebrar = partir o produto)
- 🔒 **`tools/router/classify.js` FROZEN** — nunca modificar. sha CI-enforced (acima).
- 🔒 **Packages de engine congelados** (waves 28–34.5) — não tocar salvo allowlist explícita da wave.
- 🌳 **Selective git add** — nunca `git add -A`; stage exactamente os ficheiros que mudaste.
- 📄 **Sem novos `.md` na raiz** sem pedido explícito (`_handoff/` é livre).
- 🗣 **PT-PT na conversa, EN no código** e identificadores.
- 🚦 **Sem push/merge sem OK do Paulo** (two-factor no irreversível). Tier ladder: T0 Ollama local · T1 Haiku · T2 Sonnet · T3 Opus · **T5 Fable = opt-in only via `@fable`, NUNCA auto-routed** (não há T4).

## 3. Protocolo à prova de erro R1–R6 (a disciplina que evita o caos — nasceu de trabalho perdido)
- **R1:** 1 worktree própria por frente. `git worktree add -b wave/<x> ../frugal-<x> origin/main`; confirma `git rev-parse --show-toplevel`.
- **R2:** commit atómico após CADA peça, **antes** de teste manual.
- **R3:** 1 frente de cada vez (sessões CC partilham working-tree → colidem).
- **R4:** gate executável (sha + testes + confrontar git real).
- **R5:** base = `origin/main` actual.
- **R6:** limpar depois de aterrar. ⚠️ **Nunca reutilizar a mesma pasta de worktree** (`remove --force`+`add` na mesma pasta corrompe o `.git`) — cria sempre pasta NOVA.

---

## 4. Estado ATUAL do Live Preview (tudo EM PRODUÇÃO em origin/main — confirmado hoje)

| Camada | SHA | O que entrega |
|---|---|---|
| **MP2 · App Stage** | `c83e203` | iframe do dev server real dentro do webview (local-first, sem WebContainers) + detector de porta + CSP frame-src + origin-lock |
| **Honest controls** | `05d3601` | atribuição por sessão mata badges "unsaved" falsos |
| **MP4 + MP4.1 · Diagnostics** | `266e4f3` | error-strip honesto (runtime+build) com file:line, captura server-side, $0, sem DevTools |
| **MP3.1 · Relógio** | `a0f6618` | timezone local (SP), não UTC |
| **MP3.3 · Multi-page nav** | `567d419` | ver todas as abas do site (address bar + route picker) |
| **MP4-polish** | `1469f5f` | strip calibrado (fatal vermelho vs aviso amarelo — não acende p/ benigno) |
| **MP3-v2 (merge)** | `541acbb` | consolida relógio+nav+polish |
| **MP5.0 · Source map** | `c2087c5` | `code-inspector-plugin` carimba `data-insp-path` (dev-only, webpack) |
| **MP5.1 · Select-to-edit** | `edf9bc4`→`cc05c85` | modo select no tap (hover+click→`lp-select`) · host click-to-code (abre file:line) · **motor $0 byte-splice AST** (text/class, ZERO LLM) · **chip router-native** (local $0 + override, com `@fable`) |

**O Paulo já viu a MP5.1 ao vivo** (plugin instalado, dev server na porta 7819). Funciona: seleciona, trava no `file:line`, edita texto/cor/classe $0, chip mostra o tier.

---

## 5. A visão "melhor do mundo" + os 3 fossos (o que ninguém no tier de builders tem)
Barra competitiva: **Lovable · Bolt · v0 · Replit · Cursor · Onlook** (estudo em `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md`).

1. **Preview fiel** — dev server real na máquina (não um sandbox que mente). ✅ já entregue (MP2).
2. **Click-to-code determinístico** — elemento→`file:line` via atributo compilado (`data-insp-path`), não fiber-walking (React 19 matou `_debugSource`). ✅ MP5.0/5.1.
3. **Edições $0 + cerca AST** — mutação determinística por byte-splice (text/class), e para o resto uma **cerca fail-closed** onde o modelo só vê o subtree e a escrita está presa ao intervalo de bytes do nó. 🔜 MP5.2 (o que falta). **Melhor que o Lovable**, que confia na AST inteira.
- Fosso router-native transversal: **chip de modelo na seleção** — auto-rota por dificuldade da edição (texto→$0 local; layout→Sonnet; lógica→Opus; `@fable` opt-in). Nenhum editor visual deixa escolher o modelo na seleção.

---

## 6. O QUE FALTA (o coração deste handoff) — roadmap MP5.2 → 5.3

> Nasceu da dor viva do Paulo ao usar a MP5.1: *"não consigo **fixar** onde cliquei p/ garantir
> que o prompt cai só naquela parte; no Lovable clicava e mandava um prompt só p/ aquilo."*
> Tentou apagar uma imagem → a seleção subiu ao componente `<CrookOutline>` (page.tsx:43:17),
> não ao nó; e só há campos TEXTO/CLASSE, sem prompt livre nem apagar.

**Spec completo + masterprompts prontos a colar: `_handoff/LIVE_EDIT_MP5_2_SelectLock_Spec.md`.**

| Fase | Entrega | Modelo? | Estado |
|---|---|---|---|
| **MP5.2a** | **Delete $0** + **Lock/pin** + **Breadcrumb** (`section › CrookOutline › img`) + **Descer-ao-nó** + diff do nó | ❌ zero LLM | **masterprompt escrito §3** — ship 1º (maior ganho, menor risco; mata a dor exacta) |
| **MP5.2b** | **Prompt livre ancorado** → modelo roteado (local Ollama $0 default) → **cerca `spliceNodeRange`** fail-closed → **diff antes de aplicar** | ✅ byte-bounded | **masterprompt escrito §4** — depois de 5.2a ao vivo |
| **MP5.3** | Seleção de **ÁREA** (marquee → screenshot recortado + nós contidos + multimodal) | ✅ | detalhe em `LIVE_EDIT_MP5_SPEC.md` §3.3/3.5/3.6 |

**As 4 camadas de engenharia** (com hooks no código real — ver §7):
- **A · Lock+Breadcrumb** — pin fixo (hoje é hover, some); chips clicáveis da árvore de ancestrais (padrão RN Dev Inspector).
- **D · Descer-ao-nó** — pick = elemento carimbado **mais profundo** sob o cursor, não `closest` (que sobe ao componente).
- **C · Cerca AST** — `locateRange` + `deleteNode` ($0) + `spliceNodeRange` (parse + 1 raiz + só `start..end`; senão **rejeita**).
- **B · Prompt ancorado** — caixa livre + 🗑apagar; determinístico $0, difuso → moo local $0, cloud/`@fable` opt-in; chip honesto.

---

## 7. O código real (o mapa para confrontar — nomes exactos, confirmados em origin/main hoje)

| Órgão | Ficheiro | Âncoras |
|---|---|---|
| Motor $0 | `packages/vscode-extension/src/live-edit-ast.js` | `applyDeterministicEdit(source,{line,col,tag},edit)` só `text`/`class`; exporta `locate`/`collectJsxElements`/`tagNameOf`; **cada JSXElement tem `.start`/`.end` (bytes)**. NÃO é engine congelado (add na wave LP-2) → **estende com funções novas**, sem tocar o existente (617/617 testes verdes). |
| Tap seleção (dev-only) | `landing/app/_components/lp-error-tap.ts` | `installLpErrorTap` §6: host liga com `{type:'lp-select-mode',on}`; **pick = `elementFromPoint(x,y).closest('[data-insp-path]')`** ← É AQUI que sobe ao componente (fix D); click→`postMessage({type:'lp-select',file,line,col,tag,rect,text,className})`; `Esc`→`{type:'lp-select-mode-off'}`. `parseInspPath` (PURE) já existe. |
| Host / painel | `packages/vscode-extension/src/extension.js` | `LEA=require('./live-edit-ast.js')`; `#lp-select-btn` 🎯; recebe `lp-select`→`lpSelection`→`renderSelection`; "abrir no editor" (`showTextDocument`); chip `lpTier='local'`; `applyDeterministicEdit`. |
| Source map (dev-only) | `landing/next.config.ts` | `codeInspectorPlugin({bundler:'webpack',hotKeys:false})` no hook `webpack` só quando `dev===true`; dead-code em prod. |

---

## 8. Limitações honestas já identificadas (surface no painel — não esconder)
1. **Componente partilhado = edição global** — nó dentro de `CrookOutline.tsx` reutilizado → editar afeta todos os usos (component scope, como Onlook). Avisar: *"vive em X.tsx — afeta todos os usos."*
2. **Nó dentro de `.map()`** — apagar o `<img>` remove-o de todos os itens. Avisar quando o nó está numa expressão/loop.
3. **Runner local (5.2b) não é infalível** — por isso a **cerca** + **diff antes de aplicar**: pior caso = "rejeitado, não escreveu", nunca "escreveu no sítio errado".

## 9. Decisão pendente + Fable 5 (para alinhar com o Paulo antes de despachar)
- ⚠️ **Fronteira nova (só na MP5.2b):** a extensão passa a executar um **modelo** (local Ollama qwen3:30b, $0) para o prompt livre — não só edições determinísticas. Hoje a extensão "never-executes-workspace-code"; executar um **modelo** e escrever um byte-splice que ela própria validou é a fronteira a confirmar. **MP5.2a NÃO a toca** → recomendação: despachar 5.2a primeiro, ver ao vivo, depois decidir a 5.2b.
- **Fable 5 / `@fable`:** agora disponível. No chip de modelo é o tier **T5 opt-in** (nunca auto-routed). ⚠️ Antes de afirmar capacidades do Fable 5, **web_search** e confirmar o routing em `packages/router/src/fable-5-routing.ts` (allowlisted na wave 58). O chip já mostra `@fable` como escalação manual.

## 10. Realidades operacionais (para não repetir os erros de ontem)
- 🧭 **Mount mente sobre git** — o bash sandbox reporta estado falso e escrever no `.git` via mount corrompe. **Ler do mount só cruzando com nativo; escrita de git é sempre do Paulo (PowerShell nativo).**
- 🔁 **Instalar vsix:** `install --force` troca os ficheiros MAS **só um Reload Window** (Ctrl+Shift+P) activa o código novo. Sem Reload, a feature nova não aparece (aconteceu com o MP3-v2 e a MP5.1).
- 🌳 **Worktree:** nunca reutilizar pasta (ver R6). Pasta nova por frente.
- 🖥 O plugin está instalado e o dev server esteve na porta 7819; o Paulo vê o preview no VS Code (2 monitores; o VS Code minimiza às vezes).

## 11. Onde está tudo registado (rastreável)
- **Specs/masterprompts:** `_handoff/LIVE_EDIT_MP5_2_SelectLock_Spec.md` (5.2a+5.2b) · `_handoff/LIVE_EDIT_MP5_SPEC.md` (auditoria+5.0→5.3) · `_handoff/WAVE_LP2_MP5_SelectToEdit.md` (5.0/5.1, executado) · `_handoff/WAVE_LP1_MP3v2_MP4polish.md` (MP3-v2) · `_handoff/LIVE_PREVIEW_POSTMORTEM_PROTOCOL.md` (R1–R6) · `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md` (competitivo).
- **Vault:** `30-learnings/mooter-live-edit-mp5-2-select-lock-2026-07-06.md` + `[[10-projects/mooter]]` — escrito em 2026-07-06 em `~/Documents/paulo-vault` (**registo histórico**: esse clone é o stale da G15; o canónico é `$MOOTER_VAULT` → `$VAULT_PATH` → `~/paulo-vault`).
- **Notion HQ:** "Live Edit · MP5.2" (`3956f6e4-2bc4-816c-b71e-c0283bba8a11`), sob a página-mãe "Live Preview".
- **Memória Cowork:** `project_mooter_live_edit_mp5` (actualizada 2026-07-06 com o desenho MP5.2).

## 12. Ordem de arranque recomendada (para o chat fresco)
1. Boot (§0) + confrontar git real nativo (§9).
2. Alinhar com o Paulo: despachar **MP5.2a** já (delete $0 + lock + breadcrumb + descer) — o ganho grande, risco baixo? (recomendação: sim.)
3. Despachar o masterprompt MP5.2a (§3 do spec) para uma sessão CC nova com R1–R6 → worktree `wave/lp-mp5-2a` off origin/main.
4. Gate executável: `git log --oneline` + testes (extensão + landing) + sha FROZEN intacta + `git status` limpo → **parar antes do push** (OK do Paulo).
5. Reinstalar vsix + **Reload Window** → ver ao vivo: clico na imagem → fica preso + breadcrumb → apago → some só ela, $0.
6. Só depois: decidir a fronteira do modelo (§9) e despachar **MP5.2b**; depois **MP5.3** (área).
7. Registar cada aterragem (memória + vault + Notion), como sempre.

---
**Regra de ouro deste handoff:** o Live Preview já VÊ e DIAGNOSTICA em produção; falta EDITAR com maestria. A dor do Paulo é precisa — *fixar a seleção e editar só ali*. A resposta é a **cerca AST** (garantia arquitectural, não confiança) + a **UX de lock/breadcrumb**. Faz a MP5.2a primeiro; é onde está o "uau" com o menor risco. 🐮🔥
