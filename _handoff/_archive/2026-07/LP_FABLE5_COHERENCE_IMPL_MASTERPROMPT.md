# ⇄ COWORK→CC(Fable 5) · LP-COERÊNCIA-IMPL · Corrida de implementação dos 19 findings (C0→C6, PR único)

> **Cola este ficheiro inteiro no Claude Code.** Implementa os 19 findings da auditoria de coerência
> (`_handoff/_archive/2026-07/LP_COHERENCE_AUDIT_REPORT.md` — lê-o PRIMEIRO, na íntegra) numa corrida autónoma com um
> único gate humano no fim. O mock aprovado (`_handoff/_archive/2026-07/mooter-live-preview-mock-v2.html`) é a spec de
> UI: cada anotação numerada cita o COH-ID que resolve.

## GOAL
Live Preview coerente nível cartão-de-visita: lease de identidade transaccional (P0), zero botões
mentirosos, Ask→Apply, MEO verdadeiro, AUTO router-native, Publish com destino mooter.ai, dicionário
visual único e state machine comum. Termina em **PR único** `wave/lp-coerencia` → main, vsix bumpado,
suite verde.

## WHERE
`C:\Users\Paulo Loureiro\frugal` — worktree NOVA `wave/lp-coerencia` off **origin/main @ 40e84cc**
(o merge do PR #245 já aconteceu — confirma com `git fetch && git log origin/main -1`). NÃO uses a
worktree `frugal-final` nem a árvore suja `wave/honest-controls`.

## GUARD (inegociável — igual às corridas anteriores)
- `classify.js` FROZEN: sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacto no fim de CADA wave.
- **Preservar, nunca reconstruir**: Security→Publish fail-closed, Context Engine, fences AST/tree-gate, origin-lock, CSP nonce, esc() contract, concat-only (zero backticks/`${}` nas fns serializadas da webview), prefers-reduced-motion, fail-soft, honesty-first (`n/d`, nunca inventar).
- Tests-first por finding; commits atómicos `fix(live-edit): COH-xx — …`; suite completa verde antes de cada commit.
- Zero deploy real; `vercel` só mockado nos testes. Push da branch e criação do PR podem ser preparados; **merge é do Paulo/Cowork**.
- Anti-burn: zero re-recon — o relatório do Codex já tem ficheiro:linha de tudo; vai direto. 1 reviewer adversarial apenas na C0 e na C3 (as duas com superfície de segurança).

## AS WAVES (ordem = gap list do Codex; cada uma cita as provas do relatório)

### C0 · COH-01 — lease de identidade (P0, BLOQUEADOR — nada avança sem isto)
Identidade do stage vira lease `{origin, servedRoot, readyEpoch}`:
- Sempre que `stage.url/origin` muda (`_detectStage`/`applyStage`): cancelar task ativa, `_servedRoot=null`, `_selection=null`, limpar `lpSelection/lpRefs`, esconder toolbar, árvore→`unknown` ("por confirmar"), UI = tela S7 do mock (ações: reiniciar MEU server / aguardar handshake / inspecionar).
- Só um `lp-ready` origin-locked **da origem atual** renova o lease; nenhuma escrita parte antes.
- Re-probe valida handshake/app-identity, não apenas TCP; troca de origem limpa sticky.
- `restartDevServer`: raiz = workspace confirmado, NUNCA `_servedRoot` divergente; limpa sticky+seleção antes da re-probe (COH-06 entra aqui).
**Testes obrigatórios (os 5 do relatório §6):** 7819 confirmado+pin → 7819 down + 3000 vivo → stage muda → root/selection null · prompt pendente pós-troca → `preview-tree-mismatch`, zero write · nova origem só desbloqueia após lp-ready dela · `tree:'unknown'` renderiza 4ª luz+ação · restart no root certo.
**Gate C0:** reviewer adversarial tenta romper o lease (TOCTOU entre resolveStage e write; lp-ready forjado de origem antiga; race de epoch).

### C1 · Superfícies honestas — COH-02, COH-03, COH-04, COH-05
- COH-02: toolbar nunca cobre o pin — posição manual e fallback repetem `lpRectsOverlap`; sem espaço → auto-minimizar para chip junto ao pin OU dock no topo do rail direito. Teste GEOMÉTRICO real (instancia rects 320/390/768/820/1024), não presença de string.
- COH-03: "Abrir a pasta" → `vscode.commands.executeCommand('vscode.openFolder')` com picker real (ou `workbench.action.files.openFolder`); copy = efeito.
- COH-04: 4ª luz tri-estado com `unknown` SEMPRE visível + seletor desativado com causa+ação.
- COH-05: multi-root → resolução pelo projeto ativo (editor ativo → workspaceFolder dono) + selector quando ambíguo; nunca `workspaceFolders[0]` cego.

### C2 · COH-07 — Ask→Apply host-bound (a maior quebra do gesto)
Registry host-side por `taskId`: `{selectionLease, instruction, answer, refs, filesRead, model}`.
Resposta Ask ganha CTA "▶ Aplicar com o agente" → webview envia SÓ o taskId → host revalida
lease+root+trust → nova `_taskRun(intent:'edit')` com pergunta+resposta guardadas. Webview NUNCA
fornece payload confiável. Diff + manter/reverter como hoje. Teste: taskId inválido/lease expirado →
recusa com razão; payload adulterado na webview é ignorado.

### C3 · Verdade no MEO e no routing — COH-08, COH-15, COH-09, COH-16, COH-17
- COH-08: `_emitLpEvent` propaga `tier/model/cost` reais (ou `n/d`) e `local` verdadeiro — edição agent/cloud/deploy NUNCA `local:true`.
- COH-15: lifecycle coerente `started/progress/succeeded/failed/cancelled` com `taskId`+`action` (redacted) para: prompt enviado, tier decidido, ask concluído, escalada, keep, cancel, fases de scan/publish.
- COH-09: AUTO consulta o router (facts do pedido+contexto) com escada local→T1→T2→T3; T5 só `@fable` manual; UI anuncia `route_decided` (🧭→🐮/⚡/🎼/🧠) ANTES de correr; escalada emite `escalation_offered/accepted` no MEO. Não toques no classify.js — usa o adapter/router existente (`tools/router`).
- COH-16: filtro do histórico usa lease/árvore+file+line+col (nodeKey completo já persistido).
- COH-17: `_leBridgeTs` invalidado em `onDidGrantWorkspaceTrust`, ação de instalar SDK, re-probe e mudança de workspace — semáforo reage imediatamente.
- **Nits herdados do #245 (entram aqui):** MEO cost-label drift + cobertura do guard concat-only.
**Gate C3:** reviewer adversarial na superfície de eventos (redaction, injeção via answer/refs).

### C4 · Publish com destino + controlos honestos — COH-10, COH-19, COH-11, COH-12
- COH-10: `productionUrl` como config explícita e versionada (setting Mooter ou manifest do projeto), validada HTTPS. Precedência: URL do deploy atual > productionUrl explícita > domínio Vercel disponível > `n/d`. Para este repo o valor é `https://mooter.ai` (INFRA.md:168-175, env.ts:36-39). NUNCA derivar de projectName, NUNCA hardcode genérico. Mostrar destino no painel Publish ANTES do two-factor (mock S5 nota 3).
- COH-19: URL pós-deploy = `<a>` real (openExternal host-side se CSP exigir).
- COH-11: Back/Forward sem tap → disabled com razão (capability do handshake).
- COH-12: commit vazio / confirmação errada → erro inline junto ao controlo; zero silent return.

### C5 · Linguagem visual única + skills contextuais — COH-13, COH-14, COH-18
- COH-13: dicionário ÚNICO — `🐮 local · ⚡ Haiku · 🎼 Sonnet · 🧠 Opus · 🌟 Fable` — em chips, MEO, cockpit (`famEmoji` deixa de colapsar em ✨); um segundo token SEPARADO para estado. Texto sempre presente (nunca só cor/emoji).
- COH-14: state machine visual comum `idle|blocked|working|success|warning|error` num reducer único; animação SÓ em `working`; success/error são transições finitas; `prefers-reduced-motion` verde em tudo.
- COH-18: 1–3 chips de skills contextuais junto ao one-box, derivados da tag/semântica do nó (imagem→/icon · heading→/copy · a11y-warning→/a11y); menu completo continua no drawer.

### C6 · Fecho
Bump 0.16.67 · CHANGELOG (por COH-ID) · SYNC.md · `vsce package` · suite completa (lp-* + complementares + as novas) 100% verde · sha do classify.js confirmado · push branch · `gh pr create` título "Live Preview — coerência total (19 findings da auditoria, COH-01…19)" com tabela finding→commit→teste (formato do #245).

## GATE (único, no fim)
MOO HANDOFF de volta ao Paulo com: tabela COH-ID → commit → teste-prova · resultado das 2 reviews adversariais · o que ficou de fora e porquê · números finais da suite. **PARA antes do merge** — merge é do Paulo/Cowork no Chrome.

## BACK
`⇄ CC→COWORK · LP-COERÊNCIA-IMPL · PR #<n> pronto · suite <x>/<x> · COH fechados: <lista> · adversarial: <veredicto C0/C3> · aguarda merge`
