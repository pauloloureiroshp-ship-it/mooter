# MASTER PROMPT — Operação Kill Frugal (F1 repo + F2 devices)

> **Para:** Claude Code (repo `mooter`, partir de `main` actualizado, branch novo `feat/kill-frugal`) · **De:** Cowork 2026-06-11 · **Aprovado por:** Paulo
> **Doc canónico:** `docs/rebrand/FRUGAL-EXTERMINATION-MAP-2026-06-11.md` (mapa com censo medido). Este prompt executa as Fases 1-2 e 5 do mapa. F3 (infra) é manual do Paulo; F4 (conteúdo) em wave separada.

## Missão

Eliminar "frugal" de TODO o código vivo (repo + runtime instalado) sem partir nada: nem instalações existentes (5 vibe coders em validação), nem identidade de devices no hub, nem o histórico (archive/CHANGELOG/migrations/git history são imutáveis).

## Censo de partida (auditoria 2026-06-11, Mac)

tools/ 70 ficheiros · packages/ 26 · hub/ 26 · landing/ 25 · scripts/ 1 · root files (SYNC, INFRA, README, CLAUDE.md, etc.) ~15 · runtime instalado 49 · `~/.frugal/device.id` ainda escrito pelo install actual · hook `frugal-turn-header.js` em settings.json · tracker `/summary` com header "frugal".

## Regras de engagement (duras)

1. **Read+Edit contextual ficheiro a ficheiro. PROIBIDO sed/regex em massa.** `node --check` (ou `tsc --noEmit` / teste do ficheiro) após cada edit. (doutrina Paulo, feedback_code_auto_patch)
2. **Histórico imutável:** NÃO tocar em `docs/archive/**`, `CHANGELOG.md` (entradas passadas), `hub/migrations/002_frugal_events.sql`, mensagens de commit antigas, `audit/*.jsonl` (datasets congelados).
3. **Compatibilidade primeiro:** nada que um utilizador com install antigo tenha registado/hardcoded pode deixar de funcionar nesta release. Shims com deprecation warning, leitura dupla de env vars e paths, URL de hub via config.
4. Cada workstream termina com testes verdes + commit atómico próprio (mensagem `rebrand(scope): ...`). Suite completa no fim de cada dia.
5. Reporting no SYNC.md (secção CC→COWORK) ao fim de cada workstream: feito, partido, decisões, pendentes.

## F1 — Workstreams no repo (ordem de execução)

### W1 — Paths e identidade (o mais crítico, fazer primeiro e isolado)
- `paths.js` (repo + `~/.mooter/cli/lib/paths.js` gerado): base dir `~/.frugal` → `~/.mooter`.
- **Migração automática no arranque do CLI/install:** se `~/.frugal/device.id` existe e `~/.mooter/device.id` não → mover (não copiar) + log. Se ambos existem → manter o de `~/.mooter` e avisar.
- **Testes obrigatórios antes do commit:** (a) fresh install sem ~/.frugal, (b) upgrade com ~/.frugal/device.id → device.id preservado byte-a-byte, (c) hub push pós-migração usa o MESMO device_id (verificar contra `/api/stats` ou mock).
- ⚠️ Falhar isto = stats órfãs no hub para todos os devices existentes. Se houver dúvida, parar e perguntar.

### W2 — Renames de ficheiros com shim
| Antigo | Novo | Shim |
|---|---|---|
| `tools/router/frugal-doctor.js` | `mooter-doctor.js` | stub antigo: require novo + `console.warn` deprecation |
| `tools/router/frugal-login.js` | `mooter-login.js` | idem |
| `tools/router/frugal-mode.js` | `mooter-mode.js` (verificar se já existe — audit mostra ambos os nomes no histórico) | idem |
| `tools/router/frugal-turn-header.js` | `mooter-turn-header.js` | idem + W3 |
| `landing/app/lib/generate-frugal-config.ts` | `generate-mooter-config.ts` | actualizar imports |
| `landing/public/frugal-logo.svg` | substituir por asset Mooter (logo vaca) — **não é rename, é o logo errado** | redirect/copy até landing deploy |
| `frugal.code-workspace` | `mooter.code-workspace` | apagar antigo |
| `wrangler.frugal-legacy.toml` | apagar se nenhum deploy o usa (verificar antes) | — |

### W3 — Hooks registados
- `register-hooks.js` / `install.sh`: registar `mooter-turn-header.js`.
- Lógica de upgrade: se settings.json contém entrada com `frugal-turn-header.js` → substituir pela nova no mesmo slot. Testar com settings.json real (fixture do Mac).

### W4 — Strings, env vars e branding em output
- `FRUGAL_*` env → `MOOTER_*` com fallback `process.env.MOOTER_X ?? process.env.FRUGAL_X` (remover fallback em release +2; deixar TODO datado).
- Outputs visíveis: `savings-tracker.js` header "frugal — savings summary" → "mooter", `inject_context.js` (18 ocorrências), `env.js`, `event-builder.js`, `frugal-doctor` strings, dashboard `/frugal-dashboard` → `/mooter-dashboard`.
- Sweep dos 70+26+26+25 ficheiros: ocorrência a ocorrência, distinguir (a) string visível → mudar, (b) identifier interno → mudar se coberto por testes, (c) referência histórica em comentário → mudar texto, (d) chave de dado persistido/telemetria → **CUIDADO: só com migração** (schema de eventos do hub tem campos legados — verificar `event-builder.js` e `hub-submit-events.js` contra o schema do hub antes de mudar nomes de campos).
- Root docs vivos: SYNC.md (header "canónico em ~/frugal" → ~/mooter), INFRA.md, README.md, CLAUDE.md, ROADMAP.md, CONTRIBUTING.md, SECURITY.md, PRIVACY.md, NOTICE.md, ARCHITECTURE.md, TERMINAL-CONTRACT.md, LOOP.md, MEMORY.md, REQUEST_ACCESS.md, `.mcp.json`, `.gitignore`, `.github/*`, `.vscode/*`.

### W5 — Hub URL config-driven
- Substituir constantes `mooter-hub.frugal-hub.workers.dev` por leitura de config (`~/.mooter/env` → `MOOTER_HUB_URL`, default = URL actual). Quando o Paulo activar `hub.mooter.ai` (F3), muda-se o default — sem release de emergência.

### W6 — installers
- `install.sh`/`install.ps1`: refs frugal + migração W1/W3 embutida.
- `install-legacy.*`: marcar deprecated no topo + refs essenciais; `uninstall.sh` stale: reescrever para procurar backups reais (`mooter-rescue-*`) — bug conhecido.

### W7 — CI guard (a vacina)
`.github/workflows/no-frugal.yml`:
```yaml
- run: |
    ! grep -ri frugal tools packages hub landing scripts src \
      --exclude-dir=node_modules \
      --exclude='*deprecation*' \
      || (echo '::error::frugal reference in live code' && exit 1)
```
Allowlist documentada no próprio workflow: `docs/archive/**`, `CHANGELOG.md`, `install-legacy.*`, `hub/migrations/002_*`, shims `*deprecation*`.

## Gate F1 (duro)
- `grep -ri frugal tools packages hub landing scripts` = 0 (excepto shims marcados)
- Suite completa verde + GATE canonical/adversarial sem regressão
- Os 3 testes de migração W1 passam
- CI no-frugal verde no PR
- PR `feat/kill-frugal` → `dev` com descrição = resumo dos workstreams

## F2 — Devices (após merge)
- **Mac:** pull + re-install → verificar: `~/.frugal` removido, hook novo em settings.json, tracker "mooter", `mooter doctor` limpo, device_id INALTERADO no hub.
- **Windows:** seguir playbook de reinstall do Mac (10-Jun) adaptado: backup `frugal-rescue-win-*`, GSD preservado, install do repo público, migração device.id de `%USERPROFILE%\.frugal\`. Escrever `docs/rebrand/WINDOWS-REINSTALL-PLAYBOOK.md` antes de executar.
- Arquivar dirs `*.OLD-frugal-clone-*` (zip → ~/Archives) e remover do home.

## Fora de âmbito (não fazer nesta wave)
❌ F3 infra (Cloudflare/OAuth/Vercel/Supabase — Paulo) · ❌ F4 Notion/vault/landing deploy · ❌ reescrever histórico · ❌ tocar no branch `feat/vscode-extension-f0` (projecto paralelo)

🐄 No fim: `version.json` bump + entrada CHANGELOG "The cow is fully out of frugal barn" — e o repo nunca mais escreve a palavra proibida em código vivo.
