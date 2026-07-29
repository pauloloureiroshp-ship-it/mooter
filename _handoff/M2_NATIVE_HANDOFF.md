⇄ HANDOFF M2 — TESTE NATIVO DO CONECTOR MOOTER (wave mooter-seamless-m2) · 2026-07-24

DE: Cowork/Fable 5 — sessão Maestro seamless (F0+M1 completos hoje: bridge v0.2 @303f498, Marco 1 técnico provado — job-mrz8fzbc-2ec6, $0.4826, 16s)
PARA: sessão Cowork FRESCA (esta) — nasceu depois do registro do conector, logo DEVE ver as tools nativas
OBJETIVO: provar a última costura — Cowork chama `mooter_*` NATIVAMENTE (zero script) — e executar uma tarefa real do projeto, achando loopholes.

CONTEXTO ESSENCIAL
- Conector: servidor MCP local `mooter` em claude_desktop_config.json → `frugal/packages/mooter-bridge/server-seamless.js` (tools: mooter_route, mooter_dispatch, mooter_status, mooter_collect + 3 do P0/P1).
- Ledger: `C:\Users\Paulo Loureiro\.mooter\ledger.jsonl` (append-only; eventos dispatched|started|done|failed|collected com cost_usd/duration_s).
- Memória de projeto: ler `project_mooter_seamless_f0` se disponível. Doc técnico: `frugal/packages/mooter-bridge/SEAMLESS.md`. Roadmap: `frugal/_handoff/SEAMLESS_ROADMAP_2026-07-24.md`.
- GATE VIGENTE: keys não rotadas → jobs SÓ read-only (cc: allowedTools "Read"; codex: prompt análise-only com DO-NOT de escrita).

PASSOS (nesta ordem)
0. COSTURA: procura as tools do servidor `mooter` (podem vir como `mooter_*` ou prefixadas, ex. `mcp__...mooter...`; usa ToolSearch). SE AUSENTES: esse é o achado principal — escreve o relatório (passo 5) com evidência (lista dos MCPs visíveis) e PARA. Não tentes contornar por script — o objetivo é medir a costura, não o workaround.
1. `mooter_route` com: "auditar consistência entre dois buses de eventos e propor unificação". Regista o retorno (tier/confiança).
2. `mooter_dispatch`: agent `cc` · worktree `C:\Users\Paulo Loureiro\frugal-w2` · wave `mooter-seamless-m2` · allowedTools `Read` · masterprompt (tem de conter ⇄):
   "⇄ ROUTING / DE: Cowork M2 / PARA: cc / WAVE: mooter-seamless-m2
    TAREFA (read-only): audita a divergência entre os dois buses do Mooter: (a) C:\Users\Paulo Loureiro\.mooter\ledger.jsonl (jobs headless, schema {ts,job_id,wave,agent,worktree,event,mp_hash,exit_code,cost_usd,duration_s}) e (b) _handoff/agent-sync/dispatch-queue.json + tools/router/handoff-bus.js neste repo (bus VS-W0 do semáforo). Entrega NO TEXTO FINAL: tabela de campos equivalentes, gaps, e proposta de unificação com escritor único (≤600 palavras). ❌ NÃO escrever/criar/alterar ficheiro nenhum. Números só com fonte; não sabes = n/d."
3. Agenda send_later(+3 min) para te auto-acordares; ao acordar: `mooter_status` (job_id) → `mooter_collect`. Guarda job_id, custo, RTD, e o resultado.
4. Repete dispatch com agent `codex` · worktree `C:\Users\Paulo Loureiro\frugal-integ` · mesma wave · masterprompt análogo (⇄ + análise-only + DO-NOT escrever). Se falhar, regista o erro exato — é dado (codex nunca rodou via daemon).
5. RELATÓRIO: escreve `C:\Users\Paulo Loureiro\frugal\_handoff\M2_NATIVE_SEAM_REPORT.md` (device tools; ficheiro NOVO) com: costura ✅/❌ e como as tools apareceram · job_ids + linhas do ledger (copiar) · custos/RTD reais · resultado das 2 auditorias (o conteúdo!) · loopholes/fricções achados no caminho · veredicto e próximo passo recomendado. Atualiza a memória de projeto (project_mooter_seamless_f0) com 1 parágrafo M2.
6. Fecha com BOARD (Paulo·Cowork·CC·Codex·Ledger × estado × próxima ação × ❌).

REGRAS INVIOLÁVEIS: PT-BR · n/d nunca palpite · zero push/merge/delete · zero escrita fora de _handoff, memória e ~/.mooter · sem --dangerously-skip-permissions/--yolo · falhou 2× → relatório com o que tens e para. Custo alvo da sessão ≤ $3.

🤝 SOCIO: receita? na · despesa↓? S (prova o loop que elimina paste) · risco↓? S (acha loopholes) · reversível? S (tudo read-only) · escopo? S
