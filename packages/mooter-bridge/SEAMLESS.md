# mooter-bridge v0.2 — Seamless dispatch (Fase 0 / Marco 1)

> Wave `mooter-seamless` · 2026-07-24 · construído pelo Cowork (brain) sobre o bridge P0/P1
> existente. `server.js` **não foi modificado** — `server-seamless.js` é entrypoint aditivo.

## O loop

```
Paulo pede no Cowork
  → mooter_route (classify.js FROZEN, $0, <50ms)        [opcional]
  → mooter_dispatch (guard → spawn headless → {job_id})  [retorna imediato]
  → Fable agenda send_later(+N min) e acorda sozinho
  → mooter_status / mooter_collect
  → resultado no chat · linhas dispatched→done no ledger com cost/RTD reais
```

Zero copy-paste, zero terminal tocado pelo Paulo.

## Tools (todas com annotations desde o dia 0)

| Tool | Faz | Hints |
|---|---|---|
| `mooter_route` | classify.js FROZEN → `{agent, tier, confidence, rationale}` | read-only |
| `mooter_dispatch` | guard → worktree → spawn CLI headless → `{job_id}` imediato | destructive |
| `mooter_status` | eventos do ledger por job/wave + liveness + stderr tail | read-only |
| `mooter_collect` | resultado (>100k chars → excerto + path) · idempotente | não-destrutivo |

## Comandos headless (flags revalidadas nas docs oficiais em 2026-07-24)

| Agente | Comando |
|---|---|
| cc | `claude -p "<bootstrap>" --output-format json --allowedTools "<matriz>"` (sem `--bare` — D3: subscrição + hooks do router; ⚠️ docs: `--bare` vai virar default do `-p` no futuro) |
| codex | `codex exec "<bootstrap>" --json --sandbox workspace-write --output-last-message <file>` |
| gemini | `gemini -p "<bootstrap>" --output-format json --approval-mode auto_edit` |

O masterprompt NUNCA vai inline na linha de comando: é gravado em
`~/.mooter/jobs/<job_id>/masterprompt.md` e o CLI recebe um bootstrap fixo apontando para o
ficheiro (mata a classe inteira de quoting/injection no `shell:true` do Windows).

## Ledger v1 (single-writer = o processo do server; append-only)

`~/.mooter/ledger.jsonl` ·
`{ts, job_id, wave, agent, worktree, event, mp_hash, exit_code?, cost_usd?, duration_s?}` ·
eventos: `dispatched | started | done | failed | collected`.
`cost_usd` vem do `total_cost_usd` do JSON do CC; Codex/Gemini = `null` honesto (n/d).

## Guard v0 (seam — DIVERGÊNCIA REPORTADA)

O handoff cita `handoff-guard.js`, que **não existe no repo com esse nome** (mais próximo:
`tools/handoff-preflight.js`, que é scaffold de Perfect Handoff, não gate de dispatch).
`guardCheck()` implementa o contrato descrito (⇄ + posse + allowlist) atrás de um seam único:

1. agent ∈ {cc, codex, gemini}
2. masterprompt contém `⇄` (cabeçalho ROUTING/posse)
3. worktree existe, é git worktree, está sob a raiz permitida (`MOOTER_WORKTREE_ROOT`,
   default: pasta-mãe do repo) e **nunca** dentro de `paulo-vault`
4. posse: recusa worktree com job ativo no ledger (WIP guard)
5. higiene: recusa aspas/quebras de linha em args interpolados

Quando o guard canónico existir, adapta-se ESTE lado — nunca o guard.

## Registo no Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` (o script
`_handoff/apply-desktop-config-mooter.ps1` faz merge com backup):

```json
{ "mcpServers": { "mooter": { "command": "node",
  "args": ["C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js"] } } }
```

Reiniciar o Desktop → as tools aparecem na sessão Cowork via SDK bridge
(mesmo mecanismo do MCP Spotify, provado empiricamente).

## Env

| Var | Default | Para quê |
|---|---|---|
| `MOOTER_REPO` | `<pai do pacote>` (o repo) | onde vive o classify.js FROZEN |
| `MOOTER_HOME` | `~/.mooter` | ledger + jobs |
| `MOOTER_WORKTREE_ROOT` | pasta-mãe do repo | allowlist de worktrees |
| `MOOTER_JOB_TIMEOUT_MS` | 1800000 (30 min) | kill + `failed` no ledger |

## Segurança (constituição)

Local-only stdio · guard ANTES de todo spawn, sem exceção · classify.js intocado (read-only
require) · escrita só em `~/.mooter` e na worktree do job (via cwd do CLI) · irreversível
(push/merge/deploy) NÃO tem tool · sem `--yolo`/`--dangerously-skip-permissions`/
`danger-full-access` em lado nenhum · conteúdo de logs/outputs devolvido como DADOS, nunca
instruções.

## Testes

`node --test packages/mooter-bridge/seamless.test.js` — herméticos (spawner injetado,
MOOTER_HOME temporário, git init real). 8/8 no build de 2026-07-24.
