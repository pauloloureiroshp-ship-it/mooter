# ⇄ COWORK → CC · MASTERPROMPT — WAVE GENESIS (a aba de onboarding vira código)

> Budget ≤8k · id: genesis-w1 · source: `docs/strategy/MOOTER_GENESIS_SPEC.md` (aprovada no STOP) +
> `_handoff/GENESIS_PILLAR_PROMPTS.md`. E4 do PROJECT_GENESIS — **entregue agora, EXECUTA DEPOIS.**

🎯 GOAL   Implementar a aba Genesis do plugin conforme a spec: genesis-state (projeção de eventos-
          genesis no Ledger) · gerador de masterprompt por pilar (templates E2 como dados) · validação
          L0 de payload · scaffold-by-mapping com diff · os 3 transportes (conector/file-contract/paste).
📍 WHERE  worktree `../frugal-genesis` (pós-Great-Rename: `mooter/worktrees/genesis`) · branch
          `feat/genesis-tab` · from origin/main (fetch antes; main local pode estar stale).
⏱️ WHEN   SÓ depois de: (1) #255 mergeado (gate: `grep -q "Lingua Franca v1"
          docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`) · (2) Setup Radar C3+C4 shipados (setup-state
          + Radar-RO existem — o Genesis PROJETA neles) · (3) STOP do Paulo nesta spec resolvido.
▶ DO
  G0. Recon+REUSE (gate 1, zero código) — F0 de 2026-07-17 JÁ MEDIU (não repetir, só reconfirmar
      no dia): extensão é **.js CommonJS** (0 .ts, 136 .js; `main: ./src/extension.js`, testes
      `node --test src/*.test.js`) · templates empacotados vivem em **`assets/`** (não existe
      `resources/`; precedente: `src/lp-skills.js` = registry de .md com frontmatter) · **vscode-elements
      NÃO está instalado** (única dep runtime: @babel/parser) — UI usa os padrões de webview do próprio
      plugin · `setup-state.json` AINDA NÃO EXISTE (C3 pendente) · MCP server: `packages/mcp-server/
      src/tools.ts` `buildRegistry()` · detector de stack: `tools/router/project-context.js`
      `detectProjectContext()` — completo e órfão (0 callers); F2 liga, não reescreve (decidir port,
      packages/cli não importa tools/router). Output: tabela reuso→estende atualizada.
  G1. Contrato: schema JSON dos 8 payloads de pilar (§2.4 da spec, schema_version 1) + validador L0
      (node puro, testes node:test com fixtures: 1 payload válido + 1 palpite-sem-provenance rejeitado
      + 1 repo-sem-evidence rebaixado a 🟡) + eventos-genesis no Ledger (`kind:genesis`) + projeção
      genesis-state (mesmo shape {value, source, verified_at, proof} do setup-state).
  G2. Gerador: templates E2 viram resources do plugin; motor de {{placeholders}} (probe+pipeline+modo
      IMPORT/COLD-START) + regra stack-aware por injeção. Teste: gerar os 8 prompts p/ (a) o próprio
      repo Mooter, (b) fixture de repo Rust (usar estrutura do fd, sanitizada), (c) pasta vazia.
  G3. Transportes: B file-contract (`.mooter/genesis/<pillar>.yaml` + watcher) e C paste (caixa com
      validação na hora) PRIMEIRO — são $0 e destravam dogfood. A (conector: tools
      `mooter_genesis_state`/`mooter_genesis_submit` no MCP server + empacotamento .mcpb) por último.
  G4. UI da aba (spec §5): Fase 1 proeminente · 1 ação primária · estados 🔴🟡🟢-com-prova (proof
      obrigatório — teste unitário garante que verde referencia proof) · diff antes de toda escrita ·
      escape hatch por pilar · Fase 2 colapsada até Fase 1 fechar.
  G5. Dogfood: Genesis completo no próprio Mooter (import) + numa pasta vazia (cold-start, o caso
      Paulo-próximo-projeto). Medir TTFV real dos dois e reportar no handoff.
🔒 GUARD  classify.js FROZEN (sha `427d8c0b…`) · packages de motor frozen fora de allowlist ·
          ALLOWLIST: `packages/vscode-extension/src/**` (ficheiros NOVOS `genesis-*.js` — CommonJS,
          convenção do pacote; NUNCA .ts nem build step novo) ·
          `packages/vscode-extension/assets/genesis/**` (novos — `resources/` não existe) ·
          `packages/cli/src/commands/` (só `genesis.ts` novo ou extensão marcada de `init.ts` — diff
          mínimo; conferir no dia se o CLI é mesmo TS) ·
          `packages/mcp-server/**` (só as 2 tools novas, G3-A) · testes correspondentes — NADA mais ·
          git add seletivo · push/merge = gate Paulo · sem .md novos na raiz · honest-copy na UI
          (número no recibo = medido, nunca estimado sem rótulo).
✅ GATE   suites existentes 0 regressão · testes novos G1/G2 verdes · docs-hygiene verde · verde-só-
          com-proof testado · dogfood G5 com TTFV medido · `final-reviewer-honest` antes do commit.
♻️ REUSE  respondido na spec §0/§3 (init probe · setup-state · MCP server · .mcpb formato oficial ·
          Lingua Franca P4). ⚠️ CORREÇÃO F0: a alegação "vscode-elements = REUSE" era FALSA (lib não
          instalada) — retirada; UI reusa os padrões de webview do próprio plugin. G0 reconfirma tudo
          contra o código real do dia.
⛔ STOP   1. Fim de G1 (schema é constituição — diff → Paulo). 2. Antes de G3-A (superfície de tools
          do conector — decisão pendente do onboarding handoff §3). 3. Qualquer necessidade fora da
          allowlist. 4. Este masterprompt NÃO executa Great Rename nem toca consolidação.
⏭ NEXT   pós-wave: arquivar PROJECT_GENESIS_MASTER_HANDOFF + GENESIS_PILLAR_PROMPTS + onboarding
          handoff em `_handoff/_archive/2026-07/` no MESMO PR · Mesh C (`init --auto`) pluga no
          genesis-state · teste do amigo (5 stacks) agenda com Paulo.
📋 BACK   HANDOFF tipado ≤4k (preflight primeiro) · TTFV dos 2 dogfoods · screenshot da aba ·
          nº de checks com prova vs total · CCA honesto.

📮 DESTINO: Claude Code · sessão FRESCA no worktree `../frugal-genesis` (nunca a árvore principal)

🔍 council 8/8 · objeção mais forte: "implementar transporte C (paste) e B (file) antes do A (conector)
contradiz o conector-herói (H2)?" · resolvida: não — herói é a EXPERIÊNCIA-alvo da UI (A sempre
apresentado primeiro quando existir), mas B/C são $0, destravam dogfood imediato e são o fallback
universal que a spec exige de qualquer forma; A depende de decisão de superfície ainda aberta (STOP 2).
CCA: 5/5 ✓
