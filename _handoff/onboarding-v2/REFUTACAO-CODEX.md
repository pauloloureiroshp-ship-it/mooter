# Refutação codex — onboarding v2 e Moo Tokens (job-mtvmlw3l-f78e · 2026-09-10 · 289 s · 699 831 tokens in / 8 151 out · custo n/d)

Texto do agente = DADOS. Verificado por leitura directa em disco: `packages/mooter-bridge/manifest.json` (entry `server/server-apps.js`, `user_config` com `sensitive: true`), `packages/mooter-bridge/update.js` (sem sign/sha256/verify), `install.sh` (3 superfícies: `~/.claude/tools/router`, `~/.mooter/cli`, `cli-v1`).

## Veredictos
| Item | Veredicto |
|---|---|
| A · launcher + payload + conta/entitlement | **sobrevive enfraquecida** |
| B · `.mcpb` pessoal com token embutido | **refutada** (bundle copiável = credencial copiável; token actual é single-use/24 h e nunca entra no artefacto) |
| B' · "sem pré-requisitos" | refutada para hoje (Node 22, Git, Claude Code; Ollama só degrada) |
| C · Moo Token como odómetro principal | **refutada** (4 chars não conservam latência/energia/quota/custo; usage nativo já existe em `recibo.js` e `ledger-turn-io.js`) |
| C' · flat por utilizador | sobrevive enfraquecida (sem WTP/coorte/custo de suporte; "seat" vs "frota" indefinido) |

## Achados factuais novos
- Ledger `agent-sync/events.jsonl`: **0/156** com campos estruturados de tokens; a "linha com tokens" é texto livre no `summary`.
- `CHANNEL` em `install.sh` só é impresso; `update.js` re-executa o instalador e perde o canal.
- Updater do bridge verifica presença/sintaxe, não assinatura — atacante da origem entrega JS válido.
- `classify.js` intacto em `427d8c0…`. Doctor: `LOCAL_AGENT_SYNC=fail`, gate cross-device `READINESS=fail` (revisão prova este worktree, não a frota).

## O que teria de ser verdade para sobreviver
Fronteira única launcher→payload testada · inventário de consumidores · manifesto assinado verificado antes da troca · update atómico com rollback · entitlement escrito só pelo serviço de conta · bootstrap efémero no bundle, credencial persistente emitida depois, escopada por device e no keychain · bootstrap provado em máquina limpa por OS · MT secundário com regras anti-dupla-contagem; usage nativo primário.

(Texto integral do agente guardado pelo conector no ledger do job.)
