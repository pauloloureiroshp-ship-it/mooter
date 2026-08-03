# Wave WCOCKPIT-2 — refinamento "anti-perder-se" (aditivo sobre wave-WCOCKPIT, com testes)

CONTINUA na branch `wave-WCOCKPIT` (NÃO criar nova). 100% ADITIVO. Lê docs/strategy/MOOTER_COCKPIT_ARCHITECTURE.md.

Acrescenta 5 elementos por live session no cockpit (cada um com fonte de dado real):
1. **Última interação** (`lastActiveTs`): do mtime do transcript / ts do decisions.log (host-extra já tem). Mostra "2m ago" + title com timestamp exacto. Ordenar sessões por: needs-you primeiro, depois mais recente.
2. **Notion** por sessão/projeto: campos no mode-registry `notionPageId`, `notionSyncedAt`. Mini-logo SVG (quadrado + N, currentColor). Mostra "Nh" desde o sync; se nunca → CTA "sync".
3. **Obsidian (2nd brain)**: campos `obsidianPath`, `obsidianSyncedAt`. Existência+mtime do ficheiro no vault canónico (`$MOOTER_VAULT` → `$VAULT_PATH` → `~/paulo-vault`; nunca `~/Documents/paulo-vault`, o clone stale). Mini-logo SVG (gema roxa). Amber "sync" quando stale/ausente.
4. **Botão refresh/registar** por sessão: handler `refreshIntegrations(sid)` -> escreve a nota no Notion (via o canal do governador/bus, NÃO chamar APIs destrutivas no runner) + no vault, e actualiza os `*SyncedAt` no registry (escrita atómica). Mostra a hora do último update.
5. **Worktree-linked**: `git worktree list --porcelain` -> mapear `cwd` de cada sessão ao worktree; campo `worktree` no row. Sessões no mesmo worktree partilham o chip "⌥ wt:<nome>"; o header do projeto conta "N em wt:<nome>".

IMPLEMENTAÇÃO: estender mode-registry.js (novos campos no DEFAULT + um helper `worktrees()` que corre git e mapeia; `touchSync(sid, which)`); host-extra.recentSessions decora com lastActiveTs+worktree; extension.js rowFor desenha a linha de meta (clock, Notion/Obsidian mini-SVG + tempo + refresh, wt chip) e a ordenação; CSS dos mini-logos. NÃO mexer no canUseTool nem em classify.js.

TESTES: unit dos novos helpers (worktrees parse, touchSync atómico, ordenação needs-you-first); contrato dos campos novos em data.test.js. `node --test packages/vscode-extension/src/data.test.js` verde + sem regressão.

REGRAS: classify.js FROZEN (sha 427d8c0b...364bc48f, prova no fim). Aditivo. git add selectivo. NUNCA merge/push/tag/deploy (gate humano -> BLOCKERS; o Paulo autoriza prod a seguir, mas o merge/deploy é feito por ele). Escrita JSON atómica. No fim: bloco status + Notion (sub 3876f6e4-2bc4-812b-b5d3-e6433a6cc8af) + vault.
