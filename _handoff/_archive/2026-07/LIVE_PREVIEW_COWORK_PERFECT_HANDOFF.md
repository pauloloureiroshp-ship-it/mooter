# ⇄ COWORK · LIVE PREVIEW — HANDOFF PERFEITO (não parar até melhor que o Lovable)

> **Missão (uma frase):** levar o Live Preview do Mooter — selecionar → editar/perguntar → ver
> mudar ao vivo → 🛡 Review Security → 🚀 Publish — a funcionar **perfeitamente e de ponta a
> ponta**, com **UX/UI melhor que o Lovable**, PROVADO com evidência real (não afirmado), e só
> parar quando o checklist de aceitação estiver 100% verde OU numa das paragens humanas obrigatórias.

Este documento é um **runbook executável**. Lê-o todo antes de agir. É PT-BR na conversa, **EN no
código/commits/comandos**. Reporta em cada milestone (ver §9). Nunca finjas "funciona" — PROVA.

---

## 0. A REGRA-MÃE (se esqueceres tudo o resto)
**PROVA, não afirmes.** Cada feature só está "feita" quando tens EVIDÊNCIA: um teste que executa,
um ficheiro que mudou no disco, um screenshot, ou uma verificação humana pontual explicitamente
pedida. "Os testes de string passam" NÃO é prova de que a UI funciona — foi exatamente isso que
falhou ("clico Editar e nada visível acontece"). O harness de runtime (`live-preview-runtime.test.js`)
existe para isto: **executa o webview a sério**. Usa-o e alarga-o.

---

## 1. ESTADO ATUAL (ground truth — 2026-07-08)
- **Produção:** `origin/main` @ `84871dc` · extensão **v0.16.59** · **889/889 testes verdes** ·
  `classify.js` FROZEN (`427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`).
- **vsix atual:** `C:\Users\Paulo Loureiro\frugal-land-mp52a\packages\vscode-extension\mooter-cockpit-0.16.59.vsix` (~890 KB, 77 ficheiros). Reconstrói sempre que mexeres no código.
- **Worktrees relevantes:**
  - `frugal-land-mp52a` — worktree de **main** (é onde fizemos o merge; tem node_modules da extensão).
  - `frugal-lp49` — worktree da branch de trabalho (tem node_modules de `landing` + extensão).
  - **Trabalha numa branch nova off `origin/main`** (`git worktree add ../frugal-lp-perfect -b wave/lp-preview-perfect origin/main`). NÃO trabalhes direto em main.
- **Dev server:** `landing` corre em `http://127.0.0.1:7819` (`cd landing && npm run dev`). O tap
  `LpErrorTap` está no `app/layout.tsx`; a página serve `data-insp-path` (code-inspector-plugin) →
  o 🎯 seleciona elementos. Confirma UP com `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7819/`.
- **Motores de edição na máquina agora:**
  - **Ollama LIGADO** (`qwen3:30b`, `qwen2.5:3b` em GPU) → **caminho local $0 disponível JÁ**. Para editar código, usa um moo-coder: `ollama pull qwen2.5-coder:7b` (recomendado para JSX).
  - **Ponte do agente (SDK) DESLIGADA** — não há `@anthropic-ai/claude-agent-sdk` no workspace. É por isso que a "linha de contexto" diz **"agente OFF"** e o Editar cai no local. Para ligar o caminho que **lê o projeto todo**: `npm i -D @anthropic-ai/claude-agent-sdk` no workspace + **confia no workspace** (Manage Workspace Trust).
- **O que já está construído (todas as ondas em main):**
  - **LP-4.8** — toolbar in-canvas ancorada ao pin, presets determinísticos, `/skills`, multi-select, a11y base.
  - **LP-4.9** — toggle **Editar/Perguntar** (intent, cerca no runner), progressive disclosure ("▾ mais"), presets-estrela + hover-preview, botão X/minimizar/arrasto/posicionador que nunca tapa o pin, feedback real-time (toast + flash), progresso vivo (🐮 + tier honesto + cancelar), coach marks, WCAG 2.2 AA, **linha de contexto** (agente ON/OFF), toasts in-canvas no caminho local.
  - **LP-5** — 🛡 Review Security local $0 (secret-scan redigido, npm audit honesto, XSS estático, CSP) + painel por severidade + gate `critical-open` que bloqueia publish.
  - **LP-6** — 🚀 Publish: popover, commit **selectivo** (nunca `git add -A`), push, deploy Vercel com **two-factor host-side** (escrever o nome exacto do projeto), custo $0 visível.
  - **FIX-MP-1** — gate de identidade da árvore servida: o apply escreve na árvore SERVIDA (não em `~/frugal`), fail-closed nos 6 caminhos de escrita.

---

## 2. A BARRA: **melhor que o Lovable** (concreta, não vibes)
O Lovable ganha em: edição visual instantânea, UI limpa (uma caixa), publish 1-clique. **Igualar
isso** e **bater** nos nossos diferenciadores. Rubrica de aceitação da UX (cada linha = evidência):

| Dimensão | Lovable | O nosso alvo (tem de ficar ≥) |
|---|---|---|
| Gesto simples por defeito | 1 caixa | ✅ minimal por defeito + "▾ mais". **Melhora:** o modo simples tem de caber sem scroll e respirar. |
| Edição visual instantânea | swatch → muda | ✅ presets + hover-preview + local $0. **Melhora:** hover-preview **sem lag**, aplicar **<2s** com HMR. |
| Feedback do que aconteceu | toast | ✅ toast in-canvas + flash. **Melhora:** micro-animação premium, nunca mudo. |
| Honestidade de custo | esconde | 🥇 **nós mostramos** $0 vs tier. É um diferenciador — torna-o BONITO, não técnico. |
| Segurança | ❌ | 🥇 🛡 Review Security local $0 — o Lovable não tem. Torna o painel **legível e tranquilizador**. |
| Publish | 1-clique cloud | ✅ popover + two-factor. **Melhora:** o popover tem de parecer produto, não formulário. |
| Offline / local-first | ❌ cloud-only | 🥇 funciona com Ollama, $0. |
| Confiança (nunca partir) | pode partir em silêncio | 🥇 cerca (diff + hash) + tree-identity. Nunca escreve às cegas. |

**"Melhor que Lovable" = mensurável:** corre um **design-critique** (subagente, ver §7) contra esta
rubrica ANTES de cada gate; itera na polish visual (espaçamento, motion, theming light/dark, estados
vazio/loading/erro) com **screenshots antes→depois** como prova. O alvo sentido: **parece UMA
gesto, não uma sequência de painéis de engenheiro.**

---

## 3. INVARIANTES INEGOCIÁVEIS (viola = pára e reporta)
1. **`classify.js` FROZEN** — nunca tocar. sha CI-enforced acima.
2. **Selective git adds** — nunca `git add -A`/`.`. Faz stage exacto dos ficheiros que mudaste. O commit de publish usa `host-extra.gitCommit` (`git add -- <files>`).
3. **Zero deps npm novas** sem allowlist `.vscodeignore` + assert em `live-edit-packaging.test.js`.
4. **Toda a escrita passa PELOS DOIS gates:** `_treeGateBlocked()` (árvore servida, FIX-MP-1) → cerca de bytes/hash (locate + sha `m.h` + `spliceNodeRange`). Nunca adiciones um caminho de escrita sem os dois.
5. **DEPLOY REAL DE PRODUÇÃO = PARAGEM HUMANA.** `vercel --prod` só com two-factor host-side (nome exacto). **O agente NUNCA faz um deploy real de produção autonomamente.** Podes testar a MÁQUINA do deploy (com child_process MOCKED, como `lp-publish-host.test.js`), nunca disparar o real. Preview deploys idem — pede o OK do Paulo.
6. **Nunca `git push --force`**, nunca reset destrutivo em main.
7. **PT-BR conversa, EN código.** **Não criar `.md` de raiz** sem pedido (este `_handoff/*.md` é permitido).
8. **Testes verdes ANTES de cada commit.** Suite completa: `cd packages/vscode-extension && node --test src/*.test.js` (2 testes mode-registry/handoff são flaky por timing — re-corre 1× para confirmar que são só esses).

---

## 4. PROTOCOLO DE VALIDAÇÃO (as 4 camadas — usa TODAS)
Uma feature só passa quando tem evidência nas camadas aplicáveis:

- **L1 — automática (webview logic):** `live-preview-runtime.test.js` executa o inline script num DOM
  real e conduz select→enviar. **Alarga-o** para cada feature nova (presets aplicam? toast aparece?
  skills seedam? publish popover abre? security lista?). Padrão: `bootWebview` → dispatch mensagem →
  assert no DOM/`posted`.
- **L2 — automática (host logic):** `lp-*-host.test.js` carrega a `LivePreviewPanel` real com
  `Object.create(Panel.prototype)` (não-gated pela árvore) + workspace temp. Prova `_securityScan`,
  `_publishCommit` (nunca -A), `_publishDeploy` (two-factor, child_process MOCKED). Alarga por método.
- **L3 — end-to-end REAL na máquina (usa o acesso ao PC):**
  1. `cd landing && npm run dev` → confirma :7819 (200).
  2. `cd packages/vscode-extension && npx @vscode/vsce package` → instala: `code --install-extension <vsix>`.
  3. Confirma o Ollama: `ollama ps` (liga com `ollama serve` + `ollama pull qwen2.5-coder:7b`).
  4. **Prova o ciclo local $0 SEM GUI:** o apply escreve um ficheiro real. Conduz o caminho `lp-prompt`
     via um teste host (como `lp-prompt-host.test.js`) OU um pequeno script que chama `_promptEdit`/
     `_promptApply` contra `landing/` e **verifica que o ficheiro servido mudou** (diff no disco) e
     que o preview HMR-refresca. Isto prova "editar muda o site" sem clicar.
  5. Onde precisares mesmo do GUI (visual/click), **tira screenshots** e marca como **spot-check
     humano** no relatório — NÃO afirmes "funciona" sem o screenshot.
- **L4 — design-critique (subagente Opus):** contra a rubrica §2. Produz achados + screenshots
  antes→depois. Corre antes de cada gate de UX.

> **Honestidade sobre o headless:** não consegues clicar no webview do VS Code sem display. Portanto:
> automatiza o máximo (L1/L2/L3-4), e para o puro-visual entrega **screenshots + um passo de
> spot-check humano** de 30s — nunca marques verde o que não provaste.

---

## 5. CHECKLIST DE ACEITAÇÃO (o "perfeito" — 100% verde antes de parar)
Marca cada um com a EVIDÊNCIA (teste/screenshot/diff). Se falhar → §6 corrige → re-verifica.

### A. Loop de edição (o coração)
- [ ] Selecionar um elemento renderiza a toolbar in-canvas ancorada ao pin (L1 ✔ já; confirma no GUI + screenshot).
- [ ] **Linha de contexto** diz a verdade (agente ON → "projeto TODO"; OFF → "SÓ este elemento" + como ligar). (L1 ✔; screenshot GUI.)
- [ ] **Editar (local $0)** com Ollama: prompt → diff no painel → aplicar → **o ficheiro servido muda** → HMR muda o preview **<2s**. (L3 real — diff no disco + screenshot.)
- [ ] **Editar (agente)** com o SDK instalado + workspace trusted: lê o projeto, edita no sítio certo, diff + reverter. (L3 real, depois de ligares a ponte.)
- [ ] **Perguntar** → resposta no painel, **zero escrita** (a cerca do runner nega Edit/MultiEdit). (L2 ✔ `ASK is a FENCE`; confirma GUI.)
- [ ] **Presets** cor/tamanho/spacing: hover-preview no elemento vivo → clique aplica $0. (L1 + screenshot do hover-preview.)
- [ ] **/skills** (icon/copy/restyle/a11y/section): abre, seeda o one-box, mostra o tier. (L1 + GUI.)
- [ ] **Multi-select** (Cmd/Ctrl): anexa refs, chips com ✕/limpar, entram no prompt do agente. (L1 + GUI.)
- [ ] **Feedback**: toast (✓/💬/⚠️) + flash do nó + progresso 🐮 com tier honesto + cancelar. Nunca mudo. (L1 + GUI.)
- [ ] **Chrome**: X fecha, minimizar→🐮, arrasto, nunca tapa o pin. (GUI + screenshots dos 4 estados.)
- [ ] **Coach marks** na 1ª utilização + "?" reabre. (GUI.)

### B. 🛡 Review Security (LP-5)
- [ ] Botão 🛡 corre o scan local $0 e lista findings por severidade (Crítico/Aviso/Info). (L2 ✔ + GUI.)
- [ ] Segredos **redigidos** (nunca o segredo completo no painel); paths relativos; test/fixtures saltados. (L2 ✔.)
- [ ] npm audit honesto (dev vs prod, "indisponível" ≠ "nada encontrado"). (L2 + GUI.)
- [ ] Um **Critical aberto bloqueia o Publish** (gate `critical-open`). (L2 ✔ + GUI.)

### C. 🚀 Publish (LP-6)
- [ ] Popover: estado, URL, "🛡 Review Security", lista de ficheiros a commitar, **custo $0 visível**, Update. (L1 + GUI.)
- [ ] **Commit selectivo** — só os ficheiros que o utilizador viu, revalidados contra `gitCommitPreview`, nunca `add -A`. (L2 ✔.)
- [ ] Update **bloqueado** com Critical aberto (ou override explícito com aviso). (L2 ✔ + GUI.)
- [ ] **Two-factor host-side**: deploy só com o nome exacto do projeto; nome errado/vazio nunca spawna. (L2 ✔ mocked.)
- [ ] CLI ausente → onboarding honesto, nunca URL inventada. (L2 ✔.)
- [ ] **NÃO fazer deploy real** — provar a máquina com mock; deploy real só com OK do Paulo (§3.5).

### D. UX/UI melhor que o Lovable (§2)
- [ ] Design-critique verde contra a rubrica §2 (L4) + screenshots antes→depois da polish.
- [ ] Light/dark ambos bonitos. Motion respeita `prefers-reduced-motion`. Estados vazio/loading/erro polidos.
- [ ] Modo simples cabe sem scroll e "parece um gesto".

### E. Saúde
- [ ] Suite completa verde (≥889, +novos). `classify.js` sha frozen. tap TS compila. 0 deps novas.
- [ ] N1 (undo re-checar `_treeGateBlocked`) e N2 (enforce/soften "one active task") — fecha em commits próprios.

---

## 6. O LOOP AUTÓNOMO (como não parar até perfeito)
```
para cada item do checklist §5 (por ordem A→E):
  1. VALIDA na camada aplicável (§4). Tira a evidência.
  2. se PASSA → marca ✔ com a evidência → próximo.
  3. se FALHA → diagnostica a RAIZ (não o sintoma) → corrige → re-valida → commit atómico.
  4. de X em X itens (ou por área) → suite completa + design-critique → commit.
enquanto houver item por marcar E não bateres numa paragem humana (§3.5): continua.
quando 100% verde → reconstrói vsix + relatório final + PÁRA para o OK do Paulo.
```
**Routing barato (doutrina do Paulo):** delega o VOLUME a subagentes Sonnet (`model-reasoner`) —
módulos puros, renderers, testes — e mantém no forte (Opus) a arquitetura, o wiring delicado do
webview e o **review de segurança**. Haiku só para mecânica pura. **Nunca construas segurança/UI
em modelos fracos** (foi a frustração que trouxe o Paulo aqui). Revê SEMPRE o que o subagente
produz antes de aterrar.

**Disciplina de commit:** atómico por peça, mensagem que diz o quê+porquê, `Co-Authored-By`. Nunca
commitar com testes vermelhos. Selective add.

---

## 7. FERRAMENTAS QUE JÁ TENS (usa-as, não reinventes)
- **Harness de runtime:** `packages/vscode-extension/src/live-preview-runtime.test.js` — copia o
  padrão `bootWebview(bridgeAvailable)` + `fireSelect` para conduzir qualquer fluxo do webview.
- **Harness host:** `lp-*-host.test.js` — `Object.create(Panel.prototype)` + workspace temp +
  `child_process` MOCKED (padrão de `lp-publish-host.test.js`, para o deploy nunca correr a sério).
- **Scanners LP-5:** `lp-secret-scan.js`, `lp-audit-summary.js`, `lp-xss-scan.js`, `lp-csp-check.js` (puros, testados).
- **Motor de edição:** `live-edit-ast.js` (`locateRange`/`spliceNodeRange`/`applyDeterministicEdit`), `host-extra.js` (`gitCommit`/`gitPush`/`gitCommitPreview` — selective), `live-edit-task*.js` (agente + runner com a cerca).
- **Design-critique:** spawna um subagente Opus com o diff + a rubrica §2 + "não consegues clicar no
  GUI, raciocina a partir do markup/CSS + pede screenshots". Aplica achados BLOCKER/SHOULD-FIX antes do gate.
- **Adversarial:** para qualquer mudança nos caminhos de escrita, spawna um revisor que tenta achar
  UM caminho que escape à cerca OU acerte na árvore errada. 0-bloqueantes antes de aterrar.

---

## 8. GAPS CONHECIDOS A FECHAR (arranca por aqui)
1. **Provar o ciclo local $0 end-to-end** (L3): o Ollama está ligado — escreve o script/teste que
   edita `landing/` via `_promptEdit`/`_promptApply` e confirma o diff no disco + HMR. É a prova
   directa do "editar muda o site" que ainda só está provada ao nível de mensagem.
2. **Ligar e provar o caminho do agente:** `npm i -D @anthropic-ai/claude-agent-sdk` no workspace +
   trust → a linha de contexto vira "projeto TODO" → prova que edita no sítio certo com contexto.
3. **Polish visual "beat Lovable" (§2.D):** o maior trabalho em aberto. Design-critique → iterar →
   screenshots. Foca: densidade do modo simples, suavidade do hover-preview, motion premium, dark/light,
   estados vazio/loading/erro dos painéis 🛡/🚀.
4. **N1** — `_revertSpliceItem` (undo) não re-verifica `_treeGateBlocked()` (é sha-guarded no ficheiro
   certo; baixo risco). Defense-in-depth: adiciona o gate. Commit próprio.
5. **N2** — o comentário "one active task" no `_taskRun` exagera; ou impõe single-active-task, ou
   suaviza o comentário. Commit próprio.
6. **Alargar o harness de runtime** a presets/skills/refs/security-popover/publish-popover (§4 L1).

---

## 9. REPORTING (o que colar em cada milestone)
Por área concluída (A/B/C/D/E): `git log --oneline` dos commits novos · contagem de testes
(pass/fail) · sha do `classify.js` · a evidência por item (link do teste / caminho do screenshot /
diff do ficheiro servido) · o veredicto do design-critique/adversarial. No fim: caminho do vsix
novo + "checklist 100%?" + a lista de spot-checks humanos que faltam.

---

## 10. PARAGENS HUMANAS OBRIGATÓRIAS (só estas — caso contrário, não pares)
- **Deploy real** (Vercel prod ou preview) — nunca autónomo; pede o OK + o two-factor do Paulo.
- **Merge para `main`** — pára com o relatório; o Paulo dá OK (como fizemos: `merge --no-ff` + bump + gate + push).
- **Operação destrutiva** (reset --hard, force push, apagar worktree/branch com trabalho) — pergunta.
- **Nova dependência npm** ou tocar em `classify.js`/CI/`.vscodeignore` — pára e justifica.

Fora disto: **não pares**. Diagnostica, corrige, prova, avança. O alvo é o checklist §5 a 100% e a
UX/UI a bater o Lovable, com evidência real em cada passo.

— Handoff preparado por Opus 4.8 (sessão LP-4.8→4.9→5→6 + FIX-MP-1), main @ 84871dc / v0.16.59.
