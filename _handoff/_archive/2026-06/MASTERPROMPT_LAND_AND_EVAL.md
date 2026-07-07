# Master Prompt — Land Autopilot Loop + Run Council Quality Eval (CC autónomo)

**Para:** Claude Code (ultracode), sessão na tua máquina · **Cola o bloco do fim.**
**Faz tudo numa run:** (1) landa a feature *Mooter Autopilot Loop* no plugin VS Code, (2) implementa+corre o *Council Quality Eval*, (3) deixa tudo em PR (sem merge para main).

Artefactos já no repo (escritos pelo Cowork):
`_handoff/autopilot-loop/cockpit-loop.js` · `_handoff/autopilot-loop/AUTOPILOT_LOOP.md` · `_handoff/loop/*` (runner+bus) · `_handoff/council-eval/dataset.jsonl` · `docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md` · `docs/strategy/COUNCIL_MODE_DESIGN_2026-06.md`.

---

## ════════ COLAR NO CC ════════

```
És o CC em ultracode autónomo no repo ~/frugal (Mooter, LLM router local-first). Vais resolver
DUAS coisas numa run, sozinho, e parar só no gate humano (push/PR). Lê primeiro, na íntegra:
_handoff/autopilot-loop/AUTOPILOT_LOOP.md, docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md e
_handoff/council-eval/MASTERPROMPT.md. Segue-os à letra.

REGRAS DURAS (CI-enforced):
- tools/router/classify.js é FROZEN — não tocar, não importar; prova a sha
  427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f no início e no fim.
- Tudo ADITIVO. Não tocar em engine packages frozen. git add SELETIVO (nunca -A).
- NUNCA merge/tag para main. Podes push de branch + abrir PR (reversível); merge para main é gate do Paulo.
- English no código. Conventional commits, 1 commit atómico por fase. Após cada fase, testes verdes antes de commitar.

BLOCO 0 — Setup. Faz checkout de wave-council-d (tem packages/council + a extensão). Cria branch
wave-autopilot-loop. Day-0: confirma a estrutura real de packages/vscode-extension/src/extension.js
(DataService.refresh, getHtml() tabs[], CockpitProvider.onDidReceiveMessage, activate, runInTerminal,
repoRoot) e de package.json contributes.commands. Se algo divergir do AUTOPILOT_LOOP.md, anota e adapta.
Commit: "chore(loop): day-0 + branch".

BLOCO A — Landa a feature "Mooter Autopilot Loop" no plugin (ADITIVO):
1. Copia _handoff/autopilot-loop/cockpit-loop.js para packages/vscode-extension/src/cockpit-loop.js.
2. Aplica os 6 pontos de wiring do topo do cockpit-loop.js / AUTOPILOT_LOOP.md §Integração:
   require do módulo; comando mooter.startAutopilotWave (+ contributes.commands no package.json);
   snapshot.loop = loop.readLoopState(repoRoot()) no DataService.refresh (fs puro, respeita overlap-guard);
   tab { id:'loop', label:'🛸 Autopilot', view: loop.renderLoopTab(s.loop) } no getHtml();
   casos loopStart/loopStop/loopApprove/loopReject no onDidReceiveMessage; repoRoot via workspaceFolders.
3. Garante que o tab usa as CSS vars reais do cockpit e que readLoopState NUNCA faz spawn (só fs).
4. Smoke headless do runner sem gastar tokens: na raiz, `DRY_RUN=1 node _handoff/loop/loop-runner.mjs`
   (vês round 1 simular e ir a awaiting_eval) → Ctrl+C. Confirma que ledger.jsonl e OUTBOX.md aparecem.
5. Se houver harness de testes da extensão, adiciona 1 teste a readLoopState/renderLoopTab (states:
   idle/cc_running/awaiting_human/done). Senão, documenta o smoke manual no AUTOPILOT_LOOP.md.
Commits atómicos: "feat(cockpit): autopilot loop module", "feat(cockpit): wire autopilot tab + command".

BLOCO B — Council Quality Eval (prova se o council MELHORA, não só MUDA):
1. Copia _handoff/council-eval/dataset.jsonl → packages/council/eval/dataset.jsonl (42 itens; ground
   truth honesto e self-contained; NÃO inventes).
2. Implementa packages/council/scripts/quality-eval.ts. Por item, 3 braços: A=single-model que
   decideAgent escolhe; B=veredicto Council Advisory (deliberate→verdict); C=all-Opus (opcional, tecto).
   Custo/latência reais via CallOutcome; reusa makeOllamaModel/makeAnthropicModel + decideAgent.
3. Grading com HIGIENE (o que o Gate A não teve): verifiable:true → execução/gabarito pelo campo
   'grading' (NUNCA por LLM); verifiable:false → pairwise CEGO, ordem randomizada nas DUAS direções,
   juiz CROSS-FAMILY (se o council usa Opus, juiz = gpt-5/gemini/deepseek), rubric LENGTH-NEUTRAL.
4. Corre o eval (local-first; cloud só onde preciso). Escreve packages/council/scripts/
   quality-eval-results.json com CAVEAT embebido: win/tie/loss + IC binomial; accuracy delta (verifiable);
   custo+latência por win; calibração (alta-confiança/ACT vs acerto); breakdown por categoria.
   Barra pré-registada: council WIN−LOSS>0 com IC a excluir 0 (aberto) E accuracy delta ≥0 (verifiable).
5. Decisão (3 saídas): net-win→recomenda MERGE+TAG flagship; muda-mas-não-net-win→GATED a alto-risco;
   net-loss→FIX juiz length-neutral. Escreve a entrada "### 🏛 Council Quality Eval — <data>" no topo
   do SYNC.md + _handoff/council-eval/RESULTS.md (resumo 10 linhas). Reporta empates E derrotas.
Commits: "feat(council): quality-eval harness", "test(council): quality eval run + results".

BLOCO C — Verificação + handoff:
- Subagente final-reviewer (Opus) revê os dois blocos: invariantes, honestidade (sem fabricação),
  e se o eval segue o plano. Dá veredicto SHIP / SHIP-WITH-NITS / NO-SHIP e corrige NITS.
- Prova final: sha de classify.js intacta; git diff não toca classify.js nem engine frozen;
  suites council + extensão verdes (ou falhas pré-existentes Windows isoladas e provadas).
- GATE HUMANO (pára aqui): push da branch wave-autopilot-loop e abre PR(s) para wave-council-d
  (NÃO para main). Escreve no SYNC.md o resumo + o comando exacto de merge para o Paulo decidir.
  NÃO mergeies, NÃO tagueies, NÃO toques em main.

Entrega: feature landed no plugin (tab 🛸 Autopilot funcional via DRY_RUN), eval corrido com
results.json + recomendação honesta no SYNC, PR(s) abertos, sha frozen provada. Resume em 10 linhas
o que passou cada gate e a tua recomendação.
```
