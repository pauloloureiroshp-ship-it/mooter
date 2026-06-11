# 🐄 Operação "Kill Frugal" — Mapa de Extermínio frugal → Mooter

**Data:** 2026-06-11 · **Base:** auditoria real executada no Mac (`frugal-audit-log.txt`) — números medidos, não estimados
**Princípio:** rebrand de **superfícies vivas**; **histórico é imutável** (archive, CHANGELOG, git history, Notion logs — não se reescreve o passado, protege-se o futuro com um guard de CI).

---

## 0. Censo (medido hoje)

| Onde | Quantidade | Gravidade |
|---|---|---|
| Repo total | **378 ficheiros** com "frugal" | — |
| └ docs/ (maioria archive) | 148 | 🟢 histórico — não tocar |
| └ tools/ | 70 | 🔴 código vivo |
| └ packages/ + hub/ + landing/ | 26+26+25 | 🔴 código vivo |
| Runtime instalado (~/.claude/tools/router) | **49 ficheiros** | 🔴 produção |
| **`~/.frugal/device.id`** | criado 10-Jun pelo install ACTUAL | 🔴 código vivo ainda escreve lá |
| **settings.json**: hook `frugal-turn-header.js` | 1 hook registado com nome frugal | 🔴 produção |
| Tracker `/summary` | "frugal — savings summary" | 🔴 visível ao utilizador |
| Hub workers.dev | subdomain de conta = **frugal-hub** | 🔴 URL público |
| Ficheiros com NOME frugal (vivos) | 11 (4 no router, logo+config na landing, wrangler legacy, code-workspace, install-legacy×2, migration SQL) | 🔴 |
| GitHub | repo privado legado `frugal.git` + OAuth app "frugal" | 🟠 |
| Windows PC | clone + runtime inteiros em `C:\...\frugal\` | 🟠 device 2 |
| Home Mac | 2 dirs `*.OLD-frugal-clone-*` (backups rescue) | 🟢 arquivar |

---

## FASE 1 — Código vivo no repo (o grosso, 1-2 dias de Claude Code)

**Ordem importa: repo primeiro, runtime depois (runtime é mirror do repo via install).**

1. **Renames com shim de compatibilidade** (nunca partir quem tem o nome antigo registado):
   - `tools/router/frugal-doctor.js` → `mooter-doctor.js` (+ stub `frugal-doctor.js` que faz require do novo e avisa deprecation)
   - Idem: `frugal-login.js`, `frugal-mode.js`, `frugal-turn-header.js`
   - `landing/app/lib/generate-frugal-config.ts` → `generate-mooter-config.ts`
   - `landing/public/frugal-logo.svg` → substituir pelo asset Mooter (não só rename — é o logo errado!)
   - `frugal.code-workspace` → `mooter.code-workspace`
2. **Strings e identifiers internos** nos 70+26 ficheiros de tools/packages: branding em outputs (`savings-tracker.js` "frugal — savings summary" → "mooter"), comentários, nomes de funções/vars onde seguro. Regra do Paulo: **Read+Edit contextual, `node --check` por ficheiro, NUNCA sed/regex em massa.** Testes existentes (89+ no GATE) são a rede.
3. **Env vars**: `FRUGAL_*` → `MOOTER_*` com fallback de leitura dupla durante 2 releases (`process.env.MOOTER_X ?? process.env.FRUGAL_X`).
4. **Paths**: `~/.frugal/` → `~/.mooter/` em `paths.js` (repo e CLI) com **migração automática**: se `~/.frugal/device.id` existe e `~/.mooter/device.id` não, mover — ⚠️ **device.id é a identidade no hub; perder = device novo nas stats**. Teste obrigatório.
5. **Hooks em settings.json**: `register-hooks.js` regista `mooter-turn-header.js`; install/update migra entradas antigas.
6. **`install-legacy.sh/.ps1`** e `uninstall.sh` stale: corrigir ou matar (o uninstall já é conhecido por procurar backups `frugal-install-*` inexistentes).
7. **Hub code**: `wrangler.frugal-legacy.toml` → apagar se morto; migration `002_frugal_events.sql` **não se reescreve** (migrations são histórico) — criar migration nova de rename de tabela/colunas se aplicável.
8. SYNC.md, INFRA.md, README, CLAUDE.md, docs/strategy vivos (PLAYBOOK): substituição directa.

**Gate F1:** `grep -ri frugal` em tools/packages/hub/landing/scripts = **0** (excepto shims de deprecação marcados) · testes verdes · `mooter doctor` limpo.

## FASE 2 — Runtime nos devices (depois do repo)

- **Mac:** `git pull` + re-run install → runtime re-mirrored. Verificar: hook novo em settings.json, `~/.frugal` vazio→remover, tracker header "mooter".
- **Windows:** clone vive em `C:\...\frugal\` — **reinstalação limpa** do repo público (replicar o playbook de 10-Jun do Mac, que já preservou GSD), com a mesma migração de device.id. ⚠️ device.id Windows ≠ Mac — migrar cada um.
- Arquivar `~/​*.OLD-frugal-clone-*` para disco externo/zip e apagar do home.

## FASE 3 — Infra pública (acções manuais tuas, ~1-2h total)

| Item | Acção | Cuidado |
|---|---|---|
| **Hub URL** `mooter-hub.frugal-hub.workers.dev` | Melhor caminho: **custom domain `hub.mooter.ai`** no worker (Cloudflare → Workers → Custom Domains). O subdomain workers.dev da conta ("frugal-hub") só muda renomeando a conta/subdomain — mexe em TODOS os workers | Manter URL antigo a responder (alias) ≥4 semanas; clientes instalados têm o URL hardcoded — código F1 deve ler URL de config, não constante |
| **GitHub OAuth app "frugal"** | Settings → Developer settings → OAuth Apps → rename "Mooter" + logo + homepage mooter.ai | Client ID `Ov23liKacZ4UyjV0GLo` mantém-se — rename não invalida tokens |
| **Repo privado `frugal.git`** | Archive (read-only) no GitHub — não apagar (histórico/backup) | Confirmar que nada vivo aponta lá (audit: remote do Mac já é mooter.git ✅) |
| **Vercel** | Verificar nomes de projectos (landing-five-azure-16 etc.) e env vars `FRUGAL_*` | Renomear projecto não muda domínio custom |
| **Supabase** | Nome do projecto + tabelas se houver `frugal_*` | Migrations, não renames manuais |
| **npm** | `@mooter/cli` já existe ✅ — verificar se existe pacote `frugal` antigo para deprecate | — |

## FASE 4 — Conteúdo e superfícies de marketing

- Landing mooter.ai: grep aos 25 ficheiros (inclui o logo SVG!).
- Notion: páginas VIVAS (HQ, playbooks) — renomear menções; session logs históricos ficam.
- Vault (~/Documents/paulo-vault): learnings históricos ficam; actualizar apenas `10-projects/mooter.md` e afins vivos.
- Dashboard local (`/frugal-dashboard` → `/mooter-dashboard` na porta 7820).

## FASE 5 — Guard permanente (para nunca mais)

CI no repo (GitHub Action, 10 linhas):
```
grep -ri frugal tools packages hub landing scripts src --exclude=*deprecation*
→ exit 1 se encontrar (allowlist: docs/archive/**, CHANGELOG.md, install-legacy.*, migrations/002*)
```
Cada PR que tente reintroduzir "frugal" em código vivo falha. O passado fica no archive; o futuro fica limpo.

---

## Riscos top-3 (e porquê este mapa os evita)

1. **Perda de identidade de device no hub** (stats órfãs) → migração device.id testada antes de tocar paths (F1.4).
2. **Quebrar instalações existentes dos 5 vibe coders** (URL do hub/nomes de scripts hardcoded) → shims + alias de URL ≥4 semanas + config-driven URL.
3. **Reescrever história** (archive/CHANGELOG/migrations) → fora de âmbito por doutrina; o guard de CI resolve o futuro, não o passado.

## Execução recomendada

- **F1+F2 = master prompt para Claude Code** (1 Wave; já existe precedente: `MOOTER_REBRAND_MASTER_PROMPT.md` de Abril fez a Fase 1 do rebrand — esta é a Fase 2 final). Posso gerar esse master prompt quando disseres.
- **F3 = tu** (acções de consola com 2FA — eu não toco em credenciais/permissões por política).
- **F4-F5 = Claude Code + eu** (Notion/landing posso eu; CI guard vai no mesmo PR da F1).

**Esforço total:** F1-F2 ~2-3 dias de Claude Code · F3 ~1-2h tuas · F4-F5 ~1 dia. Zero downtime se a ordem for respeitada.
