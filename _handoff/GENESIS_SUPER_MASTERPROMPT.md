# ⇄ COWORK → CC/CODEX · SUPER MASTERPROMPT — PROJECT GENESIS ponta-a-ponta

> Cowork · 2026-07-17 · Budget ≤8k · id: genesis-super-w1 · **SUPERSEDE** `_handoff/GENESIS_WAVE_MASTERPROMPT.md`
> (arquivar ambos em `_handoff/_archive/2026-07/` no PR que shipar). Pressupõe: Paulo despachou este
> documento = ⛔ STOP E0–E3 da spec RESOLVIDO (aprovada a jornada, o contrato e a mecânica).
> A decisão da SUPERFÍCIE DO CONECTOR continua ABERTA — é o STOP da F6, não desta partida.

🎯 GOAL   Implementar o Genesis completo conforme `docs/strategy/MOOTER_GENESIS_SPEC.md`: o onboarding
          que pega QUALQUER projeto (import ou cold-start, qualquer LLM) e o leva ao primeiro
          handoff/recibo em minutos — contrato tipado por pilar · gerador de entrevista stack-aware ·
          transportes file-contract/paste (conector por último, gated) · aba value-first · TTFV medido.
📍 WHERE  worktree `../frugal-genesis` · branch `feat/genesis-tab` · from origin/main (`git fetch`
          antes — main local historicamente stale). NUNCA a árvore principal. 1 sessão = 1 worktree.
⏱️ WHEN   Agora, com gates de entrada da F0 (abaixo). Não colide com Fleet/Mesh A em voo.

▶ DO (fases em ordem; cada uma tem gate mecânico próprio)

  F0 · PREFLIGHT + RECON (read-only, zero código) — a fase que evita construir sobre areia:
     a. Boot: ler AGENTS.md + tail SYNC.md + `docs/strategy/MOOTER_GENESIS_SPEC.md` (INTEIRA) +
        `_handoff/GENESIS_PILLAR_PROMPTS.md` + `_handoff/MOOTER_SKILLS_MAP.md` §3 (skills que os
        botões usam) + `_handoff/MOOTER_PROJECT_ZERO_BLUEPRINT.md` §3+§7 (classes de ativo, teto 2-3).
     b. Gate #255: `grep -q "Lingua Franca v1" docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`.
        FALHOU → reportar "falta merge #255" e prosseguir SÓ com F0c-e (recon); F1+ esperam.
     c. Gate Radar: existe `mooter setup probe`/`setup-state.json` (C3) e Radar-RO (C4)?
        NÃO → **modo degradado declarado**: F1–F3 prosseguem (não dependem); F4 usa doctor-checks
        existentes e marca `proof: n/d` (cinza, NUNCA verde) onde o Radar ainda não prova. Reportar.
     d. ♻️ REUSE — **F0 de 2026-07-17 JÁ MEDIU (resultados abaixo; reconfirmar no dia, não redescobrir):**
        extensão é `.js` CommonJS (0 .ts, 136 .js; `main: ./src/extension.js`; testes `node --test
        src/*.test.js`) — genesis-* NOVOS seguem essa convenção, NUNCA .ts nem build step ·
        templates empacotados vivem em `assets/` (`resources/` NÃO existe; precedente `src/lp-skills.js`) ·
        **vscode-elements NÃO instalado** (dep runtime única: @babel/parser) — UI reusa padrões de
        webview do próprio plugin · `setup-state.json` NÃO existe ainda (C3 pendente — gate c) ·
        MCP server: `packages/mcp-server/src/tools.ts` `buildRegistry()` · stack-detect:
        `tools/router/project-context.js` `detectProjectContext()` órfão (0 callers — F2 liga, não
        reescreve; decidir port, cli não importa tools/router) · `handoff-journal.js` JOURNAL_MAX=50
        ROLA — genesis-state durável NÃO pode depender só dele · `handoff-preflight.js` está no branch
        do **#255** (o validador L0 nasce como PRIMO dele, nunca 2º validador de handoff).
     e. Output F0: tabela reuso→estende + estado dos 3 gates. ⛔ STOP-0 só se (b) falhou.

  F1 · CONTRATO (a constituição do Genesis):
     ⚠️ pré-condição: decisão STOP-1 do Paulo sobre a relação payload↔P4 (spec §2.4 nota — opção (a)
     corpo de DECISION CONTRACT vs (b) contrato de produto fora do escopo P4; recomendação Cowork: b).
     Schema JSON versionado dos 8 payloads de pilar (spec §2.4: provenance repo/machine/user ·
     read_evidence obrigatório em campo repo · n/d aceito, palpite rejeitado) + validador L0 node
     puro + eventos `kind:genesis` no Ledger + projeção genesis-state (shape `{value, source,
     verified_at, proof}` = setup-state). Testes node:test com 3 fixtures: válido · palpite-sem-
     provenance rejeitado · repo-sem-evidence rebaixado a 🟡.
     ⛔ STOP-1: diff do schema → Paulo (é constituição; não seguir sem OK).

  F2 · GERADOR: os textos de `GENESIS_PILLAR_PROMPTS.md` viram resources do plugin + motor de
     `{{placeholders}}` (probe + pipeline N→N+1 + modo IMPORT/COLD-START + stack-aware por injeção —
     zero stack hardcodada no texto-base). Prova: gerar os 8 prompts para (a) o próprio repo Mooter,
     (b) fixture de repo Rust (estrutura do fd, sanitizada), (c) pasta vazia (cold-start).

  F3 · TRANSPORTES $0 primeiro: B file-contract (`.mooter/genesis/<pillar>.yaml` + watcher + import
     com diff) e C paste (caixa com validação L0 na hora). O A (conector) é F6 — não antecipar.

  F4 · ABA GENESIS (spec §5, à letra): Fase 1 AHA proeminente · UMA ação primária por vez · Fase 2
     colapsada até Fase 1 fechar · estados 🔴🟡🟢-com-prova (teste unitário: verde sem `proof` = FAIL) ·
     diff antes de TODA escrita · escape hatch por pilar · scaffold-by-mapping (nunca criar ficheiro
     que duplique equivalente existente — spec §4 achado 4) · padrões de webview do próprio plugin
     (zero lib UI nova — correção F0: vscode-elements NÃO está instalado).

  F5 · DOGFOOD + MEDIDA: Genesis completo em (1) o próprio Mooter (import) e (2) pasta vazia
     (cold-start — o caso Paulo-próximo-projeto). Medir TTFV real dos dois com timestamps do Ledger.
     Meta ≤10min; caminho feliz Fase 1 ≤3min. Número real no handoff, nunca estimado.

  F6 · CONECTOR (gated): tools `mooter_genesis_state` + `mooter_genesis_submit` no MCP server +
     empacotamento .mcpb (formato oficial, verificado 2026-07-17).
     ⛔ STOP-2 ANTES de escrever: superfície final de tools (decisão pendente do
     `MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md` §3) → Paulo.

🔒 GUARD  classify.js FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) ·
          packages de motor waves 28–34.5 frozen · ALLOWLIST EXATA:
          `packages/vscode-extension/src/**` (NOVOS `genesis-*.js` — CommonJS, convenção do pacote) ·
          `packages/vscode-extension/assets/genesis/**` (novos — `resources/` não existe) ·
          `packages/cli/src/commands/genesis.ts` (novo) OU extensão mínima marcada de `init.ts` ·
          `packages/mcp-server/**` (SÓ F6, só as 2 tools, pós-STOP-2) · testes correspondentes ·
          arquivamentos `_handoff/` do NEXT — **NADA mais**. Sem tocar SYNC.md fora do fecho de
          sessão · git add seletivo (nunca -A) · push/merge/delete = gate Paulo · sem .md novos na
          raiz · honest-copy na UI (número = medido ou rotulado estimativa) · agnóstico: zero
          "Claude" hardcodado em prompt gerado ou copy · PT-BR conversa / EN identifiers.

✅ GATE   suites existentes 0 regressão (cli + tools/router + plugin) · testes novos F1/F2/F4 verdes ·
          docs-hygiene verde · verde-só-com-proof testado · TTFV dos 2 dogfoods reportado ·
          `final-reviewer-honest` antes do commit final (veredicto no handoff).

♻️ REUSE  (1) interno: init probe · setup-state · doctor-checks · padrões de webview do plugin · MCP server ·
          handoff-preflight (padrão de validador) · templates #255 — estender, nunca reimplementar.
          (2) público: .mcpb oficial (modelcontextprotocol/mcpb) · AGENTS.md padrão (agents.md) —
          adotar formato, zero fork. (3) waves: SETUP_MAPPING (probe→payload) · EMENDA Radar E1
          (≤3 inputs, valor ≤3min) herdadas por referência.

⛔ STOPs  STOP-0 (#255 ausente) · STOP-1 (schema F1) · STOP-2 (superfície conector, antes da F6) ·
          qualquer necessidade fora da allowlist · qualquer tentação de editar canon (#255) ou
          régua (AGENTS.md §overview) — reportar, nunca absorver.

⏭ NEXT   pós-ship (mesmo PR): arquivar em `_handoff/_archive/2026-07/` → PROJECT_GENESIS_MASTER_
          HANDOFF · MOOTER_ONBOARDING_WORLDCLASS_HANDOFF · GENESIS_WAVE_MASTERPROMPT · este ficheiro ·
          GENESIS_PILLAR_PROMPTS (os textos passam a viver como resources) · atualizar SYNC.md
          snapshot + LOOP.md (aprendizados). Depois: teste do amigo (5 stacks, 1 greenfield,
          1 não-Claude) agendado com Paulo · Mesh C (`init --auto`) pluga no genesis-state ·
          wave moo-skills (`MOOTER_SKILLS_MAP` E4) é WAVE SEPARADA — não fundir aqui (WIP).

📋 BACK   HANDOFF tipado ≤4k — `npm run handoff:preflight` PRIMEIRO (nunca escrever à mão) + `--qa`
          p/ DECISIONS verbatim · TTFV dos 2 dogfoods · screenshot da aba · nº checks com prova vs
          total · estado dos 3 gates F0 · CCA: n/5 honesto · uncommitted = RED ALERT com paths.

📮 DESTINO: **Claude Code · sessão FRESCA no worktree `../frugal-genesis`** (recomendado — Codex está
com Fleet/Mesh A em voo; se ainda estiver, NÃO usar Codex). Compatível com Codex se liberado: boot
idêntico via AGENTS.md; manter draft PR, nunca merge.

🔍 council 8/8 · objeção mais forte: "super-MP de 6 fases numa sessão só viola o WIP e convida o
fantasma 'todos verdes, merga'" · resolvida: cada fase tem gate mecânico próprio e 3 STOPs humanos
nomeados; F6 é explicitamente gated fora do fluxo; a sessão PODE parar em qualquer STOP e retomar
fresca — o preflight do handoff garante que o estado real viaja, não a memória.
CCA: 5/5 ✓
