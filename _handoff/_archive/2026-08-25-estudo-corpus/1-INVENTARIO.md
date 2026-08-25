# INVENTARIO MOOTER (gerado 2026-08-25)
## packages/
arbitrage-monitor
cli
council
data-rights
effort
fleet-commander
mcp-server
minimax-watcher
mooter-bench
mooter-bridge
overclock-moo
router
sessions-orchestrator
slack-spike
spawn-orchestrator
synthesis
transparency
turboquant-backend
validation
vllm-backend
vscode-extension
workflow
worktree-conductor
## tools/
ancora
audit
cli
cockpit
docs-hygiene-baseline.json
docs-hygiene.js
docs-hygiene.test.js
guarda-home.baseline.json
guarda-home.mjs
guarda-home.test.mjs
handoff-preflight.js
handoff-preflight.test.js
lint
maestro
ops
router
wave-gate-baseline.json
wave-gate.mjs
## tools/router (principais)
COCKPIT-WIRING.md
PostToolUse.js
README.md
_handoff
_model-resolver-core.js
_model-resolver.js
_model-resolver.test.js
activity-classifier.js
adapter-selection.test.js
adapter_selection.js
adversarial-gen.js
agent-focus-status.js
agent-focus-status.test.js
agent-sync-ledger.js
agent-sync-ledger.test.js
agents-progress-status.js
agents-progress-status.test.js
aggregate-deltas.js
anthropic_call.sh
arbiter.js
arbitrage-status.js
assinatura.js
assinatura.test.js
auto-feedback.js
auto-sync.js
autopilot-install.js
backtest.js
backtest.test.js
badge-always-on.test.js
badge-savings.test.js
badge.js
badge.test.js
bench-hook.js
bench-status.js
bench-status.test.js
benchmark.sh
budget-engine.js
budget-wizard.js
burn-rate-status.js
burn-rate-status.test.js
catalogo-local.js
cca-f-status.js
cca-f-status.test.js
check-local-models.js
chip-composer.js
chip-composer.test.js
classify-branches.test.js
classify-retry.test.js
classify.js
classify.js.sha256
classify.test.js
cockpit-demo.js
cockpit-feed.js
cockpit-feed.test.js
cockpit-live.js
compaction-advisor.js
compaction-advisor.test.js
compaction-drift.js
compaction-drift.test.js
compression-status.js
## tools/cockpit
tools/cockpit/lp-veredicto.js
tools/cockpit/runner/smoke.test.mjs
tools/cockpit/runner/classes-da-fila.test.mjs
tools/cockpit/runner/voidar-fila.test.mjs
tools/cockpit/runner/pausa-visivel.test.mjs
tools/cockpit/runner/refutador.mjs
tools/cockpit/runner/fleet-beacon.test.mjs
tools/cockpit/runner/beacon-publisher.mjs
tools/cockpit/runner/project.mjs
tools/cockpit/runner/deriva-de-codigo.test.mjs
tools/cockpit/runner/project.test.mjs
tools/cockpit/runner/engine-breaker.mjs
tools/cockpit/runner/queixas.test.mjs
tools/cockpit/runner/refutado-pela-fonte.test.mjs
tools/cockpit/runner/autopilot.mjs
tools/cockpit/runner/beacon-publisher.test.mjs
tools/cockpit/runner/build-shell-snapshot.mjs
tools/cockpit/runner/refutado-pela-fonte.mjs
tools/cockpit/runner/alignment.test.mjs
tools/cockpit/runner/prontidao-l2.test.mjs
tools/cockpit/runner/runner-core.mjs
tools/cockpit/runner/ponte-adversarial.mjs
tools/cockpit/runner/fleet-remoto.mjs
tools/cockpit/runner/prontidao-l2.mjs
tools/cockpit/runner/comandante.test.mjs
tools/cockpit/runner/fleet-state.test.mjs
tools/cockpit/runner/pilot-init.mjs
tools/cockpit/runner/sync-device.test.mjs
tools/cockpit/runner/ci-coerencia.test.mjs
tools/cockpit/runner/reserva.mjs
tools/cockpit/runner/self-check.test.mjs
tools/cockpit/runner/ab-report.test.mjs
tools/cockpit/runner/chave-da-frota.test.mjs
tools/cockpit/runner/context-pack.mjs
tools/cockpit/runner/launch.mjs
tools/cockpit/runner/voidar-fila.mjs
tools/cockpit/runner/evidence-verifier.mjs
tools/cockpit/runner/triagem.mjs
tools/cockpit/runner/piso-de-node.mjs
tools/cockpit/runner/autopilot.test.mjs
## skills do plugin (repo)
./skills/moo-pilar-higiene/SKILL.md
./skills/moo-pilar-produto/SKILL.md
./skills/moo-pilar-routing/SKILL.md
./skills/moo-pilar-qualidade/SKILL.md
./skills/moo-pilar-coerencia/SKILL.md
./skills/moo-pilar-motor/SKILL.md
./skills/moo-talo/SKILL.md
marketplace.json
{
  "name": "mooter",
  "description": "Official marketplace for mooter — the router for Claude Code (local-first model routing, measured savings, MIT)",
  "owner": {
    "name": "Paulo Loureiro",
    "email": "paulo@mooter.ai"
  },
  "plugins": [
    {
      "name": "mooter",
      "description": "Routes every prompt to the cheapest capable model (local Ollama / Haiku / Sonnet / Opus). Hook, not proxy. 47% measured savings, methodology published. MIT.",
      "author": { "name": "Paulo Loureiro" },
      "category": "productivity",
      "source": "./plugin/mooter",
      "homepage": "https://mooter.ai"
    }
  ]
}
## manifest conector
{
  "manifest_version": "0.3",
  "name": "mooter",
  "display_name": "Mooter",
  "version": "1.49.4",
  "description": "A cabine do Mooter no Cowork: mede quanto ja gastaste, baixa o tier sozinho quando aperta, manda para a tua GPU o que ela consegue, e guarda o estado da sessao para a conversa seguinte nascer informada em vez de arrastar tudo atras de si.",
  "long_description": "Mooter poe a frota de agentes dentro da conversa, num unico bloco que se le de cima para baixo.\n\nQUEM CONDUZ - o modelo desta conversa, declarado por quem chama (o MCP nao o expoe; sem declaracao aparece n/d, nunca um palpite).\n\nO TRABALHO - cada tarefa em arvore: o motor de subscricao que rematou (Claude Code, Codex) e, por baixo dele, os moos locais que lhe prepararam o caminho a custo zero. Modelo real lido do stream do proprio job, tokens ao vivo, tokens por segundo, e o porque de cada modelo local ter sido escolhido.\n\nO SALDO - que percentagem dos tokens saiu da tua GPU, quanto custou mesmo em subscricoes, e uma poupanca estimada com a base de calculo a vista, valorizada ao modelo pago mais barato para nunca exagerar.\n\nA CABINE - GPU, vault Obsidian, avisos de coerencia, e o Live Preview: o painel embebe o teu servidor local (so localhost) e mede se este host o permite, em vez de o assumir.\n\nO motor: um router local-first determinista (classify.js, congelado por sha em CI, $0 para classificar) que escolhe o tier minimo viavel e passa esse modelo ao CLI. Nada e proxiado e nada e fabricado: o que nao se sabe aparece como n/d.\n\nTELEMETRIA - o conector nao envia telemetria automatica. O install-id (UUID local em ~/.mooter/install-id.json) e gerado na primeira sessao e nunca transmitido sem consentimento explicito.",
  "author": {
    "name": "Paulo Loureiro"
  },
  "license": "MIT",
  "icon": "icon.png",
  "keywords": [
    "mooter",
    "fleet",
    "agents",
    "ollama",
    "mcp-apps",
    "claude-code",
    "codex",
    "router",
    "local-first"
  ],
  "server": {
    "type": "node",
    "entry_point": "server/server-apps.js",
    "mcp_config": {
      "command": "node",
      "args": [
        "${__dirname}/server/server-apps.js"
## landing
landing/app/not-found-breadcrumb.tsx
landing/app/(app)/layout.tsx
landing/app/setup/page.tsx
landing/app/(marketing)/layout.tsx
landing/app/_components/HandoffStory.tsx
landing/app/_components/VersionBadge.test.tsx
landing/app/_components/VersionBadge.tsx
landing/app/_components/DataSourceBadge.tsx
landing/app/_components/CmdKPalette.tsx
landing/app/_components/HeroTerminal.tsx
landing/app/_components/LpBoundaryReport.tsx
landing/app/_components/WhyLocalCards.tsx
landing/app/_components/PulseStrip.tsx
landing/app/_components/CommunityPulse.tsx
landing/app/_components/TwoTerminalDemo.tsx
landing/app/_components/LpErrorTap.tsx
landing/app/_components/AuthErrorBanner.tsx
landing/app/layout.tsx
landing/app/error.tsx
landing/app/page.tsx
