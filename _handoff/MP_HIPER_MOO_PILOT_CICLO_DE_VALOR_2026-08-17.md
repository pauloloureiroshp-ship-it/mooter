# 🔥 MP HIPER — CC · MOO PILOT: FECHAR O CICLO DE VALOR · Mooter no talo · workflow · 2026-08-17

## 🧭 COMO USAR
- **Sessão CC nova e fresca**, raiz do `frugal`, branch base **`feat/f1-runner-canonico`** (o runner + o fix do snapshot já vivem aqui — continua, não recomeces).
- **Mooter no talo, a frota inteira:** `/mooter-model mix` → moo (Ollama local · $0) · cc (Claude/Fable) · codex · gemini · kimi. **Local-primeiro; Fable orquestra.**
- **Modo workflow:** cada fase abaixo é **um workflow** com **subagentes em paralelo** (um por dimensão/pilar/achado) + **verificação adversarial** antes de dar por feito. Nunca uma fase sem um verificador a tentar refutá-la.
- **Duas economias:** o **BUILD** (executar este MP) usa a frota, tokens OK. O **RUNNER entregue** é **$0 DURO** (só Ollama local) — se gastar 1 token de subscription, é bug.

## 📖 LER PRIMEIRO (grep prova ou morre)
1. `claude/moo-pilot-auditoria-e-feature-2026-08-17.md` (projeto Mooter.ai) **e** `~/paulo-vault/30-learnings/2026-08-17-auditoria-total...md` — a auditoria e o design completo. **Este MP é o resumo executável dela.**
2. `_handoff/MP_HIPER_MOO_AUTOPILOT_2026-08-16.md` — o MP anterior (runner/F2), com a nota do CI vermelho já resolvido.
3. `tail` do `SYNC.md` + `mooter_fleet({verbose:true})` — estado real antes de propor nada.

## 🩸 A VERDADE QUE MOTIVA (não maquilhar)
Medido a 2026-08-17: **829 achados · 0 triados · 0 executados.** O 4090 **fora da frota** (0 beacons). A poupança do routing **não medida**. **Utilização de GPU (99%) ≠ valor.** O loop *acha* e para. As melhorias vieram do humano, não do loop. **Este MP existe para fechar exatamente essa lacuna.**

## 🥊 CORREÇÕES DO GAUNTLET (2026-08-17 · obrigatórias · pesquisa pública)
O design passou pelo gauntlet e **falhou num ponto** — corrigido aqui, tem precedência sobre as fases:
1. **Confiança NÃO vem de votos de modelos.** Concordância entre LLMs correlaciona fraquíssimo com correção (ρ 0.20–0.59; modelos erram juntos por viés partilhado). → Na **F-A**, a confiança vem de **ground-truth**: o achado **reproduz-se** (escrever repro) · o fix **passa o teste** · o `ratchet` mexe. Votação = só **prioridade fraca**, nunca o gate. Ancorar num **analisador estático real** (não o moo sozinho).
2. **Padrão dois-modelos validado (F-C/F-E):** implementer e reviewer de **linhagens DIFERENTES** (ex: qwen-coder + exaone/outra família — mesma família tira a razão do setup); **reviewer read-only** (senão começa a corrigir e dissolve autor/revisor); **cap de 2 rondas** (senão ping-pong infinito); ambos **residentes**.
3. **F-0 · RECON DE PRIOR ART (antes de construir o F-C):** avaliar **OpenHands / aider / SWE-agent** e **local-llm-code-review** como base — não reinventar o executor achado→fix→PR do zero. Roubar padrões testados.
> Confirmado por todos: **o gate humano é obrigatório** — um 30B local é um *primeiro filtro antes de um humano ler o `git diff`*, nunca substituto. Reforça "PR/merge/deploy = só o Paulo".
> Fontes: arxiv 2607.08065 (concordância≠correção) · cmaven dual-model Ollama · Datadog LLM-filtra-SAST · OpenHands/SWE-agent.

## 🎯 GOAL
Transformar o Moo Pilot de *mostrador* em *ferramenta que entrega fixes*: **achado → triagem → ação → PR → deploy**, com **um botão por descoberta** e **dropdown de LLM por ação** (local $0 → subscription por custo). Cada fix é ROI medível. Gates irreversíveis sempre do Paulo.

## 🧱 ESTADO — herda, NÃO recomeça
- ✅ Deploy: PRs #268/#269/#270 **merged na main** (ratchet 176→215 corrigido, trava-de-verde).
- ✅ Motor: runner $0 non-stop + F10 `:4290` (`/fleet.json`,`/pilares.json`,`POST /play|/stop|/focus`) + GPU via `ioreg` + guarda anti-queda do Ollama + anti-sono do Mac.
- ✅ Cabine viva = **browser** `127.0.0.1:4290/panel` (o motor abre-a sozinho ao arrancar). **Sidebar sandboxed NUNCA tem o vivo — provado 2×; não perseguir.**
- ✅ Snapshot honesto lê GPU (ioreg) + frota (beacons) — commit `9a58938f` na f1.
- ✅ `classify.js` FROZEN sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.

## ✅ FASES — cada uma = 1 WORKFLOW (subagentes + verify adversarial · recibo no fecho)

**F-A · TRIAGEM (o desbloqueio — prioridade absoluta).**
Sonda de auto-verificação: por cada achado, **2-3 subagentes moo LOCAIS** votam (é real? risco/oportunidade/ruído? confiança?). Só sobe ao painel o que ≥2 confirmam, com `ficheiro:linha` relido do disco. Mata o "829 não triados". Novo campo no ledger/estado: `veredicto_triagem`, `classe`, `confianca`, `votos`. **$0.** Workflow: fan-out de votantes → dedup → ranking por (risco×confiança).

**F-B · CARD ACIONÁVEL + DROPDOWN.**
O shell (`tools/cockpit/moo-pilot-shell.html`) ganha, por achado: classe (🔴risco/🟢oportunidade), confiança, e os botões **[Verificar] [Aplicar] [Abrir PR] [Descartar] [🔕]** + **selector de modelo** (T0 moo $0 · T1 Haiku · T2 Sonnet · T3 Opus · T5 Fable · codex/gemini/kimi) com **custo estimado à frente**. Ligados a endpoints novos **F11**: `POST /triar`, `/aplicar`, `/pr`, `/descartar`. Em SNAPSHOT ficam desabilitados com o porquê no tooltip (nunca simular).

**F-C · EXECUTOR COM WORKTREE (as regras de vibe-coding).**
`Aplicar` → cria **worktree isolado** `mooter-wt-fix-<id>` → o **modelo escolhido** escreve o diff sob as regras: **diff mínimo · `classify.js` FROZEN · nunca `git add -A` · evidência-ou-n/d**. Depois **gauntlet adversarial** (testes + "isto piora algo?" + ratchet). Falha → escala para o tier acima. FSM por achado: `draft→applied→verified→pr→merged→deployed`, recibo em cada transição. Máx. N worktrees vivos (orçamento VRAM).

**F-D · FILA DE TRABALHO.**
O loop deixa de re-scan os mesmos ~12 ficheiros — consome uma **fila priorizada** (achados por triar > fixes por verificar > scan novo) e **avança**. Sem fila, é movimento; com fila, é progresso.

**F-E · 4090 NA FROTA.**
Replica runner+beacon+F10 no Windows (`C:\Users\Paulo Loureiro\frugal`). **Mac = triagem/routing (P1/P3/P6); 4090 = fixes pesados (P2/P5, 30B).** Um acha, o outro conserta. Cada painel espelha a frota; o 4090 ganha propósito.

**F-F · ROI METER.**
Topo do painel troca "2809 recibos" por **fixes-que-passam-o-check · $ poupado (T0 vs T3) · risco fechado**. A tese Mooter, em números do Paulo. `mooter_journal` regista cada fix e a poupança.

## 🛡 GUARD / DOUTRINA
Runner entregue = **$0 duro** (só Ollama). Tier-ladder: local-primeiro, subir só por custo justificado, **mostrar o custo antes, registar o real depois** (a tese auditável). `classify.js` FROZEN. Evidência-ou-`n/d` (citação sem grep morre). "% GPU" mede utilização, **nunca substitui recibos-que-passam-o-check**. Nunca `git add -A`. Nunca `write:true` sem pedido. Offline/tab-de-fundo/ficheiro-velho = honesto, nunca verde-falso. **Cabine viva = browser; nunca tentar sidebar-vivo.**

## 🚦 GATE — só o Paulo
Abrir PR · merge · push `main` · deploy · tag · modelo residente · secrets · apagar dados. A autonomia vai até à porta do irreversível e **pára com o diff à frente**.

## 🌀 O ESTILO WORKFLOW (como orquestrar)
- Cada fase: um `Workflow` com `phase()` por etapa. **Fan-out** = um subagente por achado/pilar/dimensão. **Pipeline** por default (verifica cada achado assim que a triagem dele fecha, sem barreira).
- **Verify adversarial obrigatório:** por cada fix proposto, ≥2 subagentes tentam **refutar** ("este diff piora algo? quebra teste? é verde-falso?"). Sobrevive só o que ≥maioria não refuta.
- **Fable orquestra**, o trabalho pesado local é sempre o modelo escolhido no dropdown, independentemente do modelo da sessão.
- Loop-until-dry na triagem: repete rondas de votação até 2 rondas sem achado novo confirmado.

## 🔜 NEXT
`F-0 (recon prior art) → F-A (triagem por ground-truth) → F-B (card+dropdown) → F-C (executor dois-modelos+worktree)` — este quarteto já entrega o primeiro fix real. Depois `F-D → F-E → F-F`.

## ↩ BACK
Recibo 7 blocos (objetivo · mediu · propôs · não-verificou · custo · duração · próximo) + `mooter_setup({sessao:'registar', decisoes:[...]})`. ≤3 ações, ≤1 pergunta.

---
**Prioridade: F-A (triagem) — sem ela, 829 achados são lixo. Sessão fresca, mooter no talo com a frota inteira em workflow (Fable orquestra), verify adversarial em cada passo, até o primeiro fix passar o check e chegar à porta do PR (gate do Paulo). O runner entregue é $0 local — se gastar 1 token de subscription, PÁRA e reporta.**
