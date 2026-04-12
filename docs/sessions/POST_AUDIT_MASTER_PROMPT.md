# POST_AUDIT_MASTER_PROMPT.md
# frugal — Post-Audit Fixes (Fase 1: Friends Beta)
# Gerado: 2026-04-10 | Fonte: AUDIT_REPORT.md

> Lê este ficheiro inteiro antes de começar. Segue a ordem das prioridades.
> Não faças nada fora desta lista. Não faças "melhorias" extra.

---

## CONTEXTO

A auditoria completa foi feita. Resultado: **PRONTO PARA AMIGOS COM CONDIÇÕES**.
As condições estão aqui. Segue-as por ordem.

Repo: `C:\Users\Paulo Loureiro\frugal\`
Runtime: `~/.claude/tools/router/`

---

## P1 — README badge + CHANGELOG (auto, sem aprovação)

### P1.1 — Corrigir badge no README.md

O badge diz `v0.9.0`. Deve dizer `v0.9.4`.

Localizar no `README.md` qualquer badge ou menção de `v0.9.0` e substituir por `v0.9.4`.
Também verificar se existe link para a landing page (`https://landing-five-azure-16.vercel.app`) — se não existir, adicionar na secção de links ou no topo do README.

### P1.2 — Adicionar entrada v0.9.4 ao CHANGELOG.md

No `CHANGELOG.md`, adicionar entrada **antes** da entrada mais recente (v0.9.3):

```markdown
## [v0.9.4] — 2026-04-10 — Friends Beta

### Added
- Beast/Zen/Auto mode system (`frugal-mode.js`, 3 new skills)
- Cross-platform installer: `install-windows.ps1` with Doctor/Uninstall/DryRun
- `frugal-hello` skill — first-use WOW moment
- `smoke-test.js` — post-install verification (4/4 pass, avg 51ms)
- `paths.js` — cross-platform path resolver
- `PRIVACY.md` — transparent telemetry documentation
- `ONBOARDING_GUIDE.md` + `FRIEND_KIT.md` — friend-facing docs
- `.env.example` — placeholder env vars

### Fixed
- Windows paths with spaces now handled correctly via `paths.js`
- `run-backtest.cmd` uses quoted paths
- `hub-push.js` + `hub-pull.js` + `hub-status.js` URLs corrected
- `install.sh` improvements: banner, smoke test step, friendly output

### Changed
- `frugal-status` skill: improved friendly output format
- `.gitignore`: added `.env.*`, `*.env`, `.next/`, `.vercel/`
- 102 patterns total (was 65)
- 170 test prompts, 100% accuracy
```

### P1.3 — Actualizar SECURITY.md

No `SECURITY.md`, substituir todas as referências a `v0.5.x` ou `v0.5` por `v0.9.x`.
Se o ficheiro tiver uma secção "Supported Versions", actualizar para mostrar v0.9.x como suportado e v0.5.x como não suportado.

---

## P2 — Windows ExecutionPolicy (auto, sem aprovação)

No ficheiro `ONBOARDING_GUIDE.md`, na secção de instalação Windows, adicionar **antes** do comando PowerShell:

```markdown
> **Nota Windows:** Se receberes um erro de segurança ao correr o script, abre o PowerShell como Administrador e corre:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Depois repete o comando de instalação.
```

Localizar a secção exacta onde está o comando `irm ... | iex` ou `.\install-windows.ps1` e adicionar o bloco acima imediatamente antes.

---

## P3 — version.json como SSOT (auto, sem aprovação)

Criar ficheiro `tools/router/version.json`:

```json
{
  "version": "0.9.4",
  "released": "2026-04-10",
  "channel": "friends-beta",
  "minNodeVersion": "18.0.0",
  "homepage": "https://landing-five-azure-16.vercel.app"
}
```

Não é necessário integrar no código agora — apenas criar o ficheiro para estabelecer o SSOT.
Adicionar ao `.gitignore` se não quisermos que vá para o repo público (não adicionar — deve ir para o repo).

---

## P4 — Scheduled Task Windows (requer aprovação Paulo)

> ⚠️ **PARA ANTES DESTA TAREFA** e pede aprovação ao Paulo:
> "A auditoria confirmou que o scheduled task do backtest NÃO está activo no Windows.
> Posso registá-lo agora com `schtasks /create`? Vai correr o backtest às 02:00 diárias.
> Preciso de aprovação para modificar as tarefas agendadas do sistema."

Se aprovado, criar o scheduled task:

```cmd
schtasks /create /tn "FrugalRouterBacktest" /tr "\"C:\Users\Paulo Loureiro\frugal\tools\router\run-backtest.cmd\"" /sc daily /st 02:00 /ru "%USERNAME%" /f
```

Depois verificar:
```cmd
schtasks /query /tn "FrugalRouterBacktest" /fo list
```

---

## P5 — Commit (requer aprovação Paulo)

Após P1, P2, P3 feitos:

```
git status
git diff
```

Mostrar ao Paulo o diff completo antes de commitar.
Mensagem de commit sugerida:
```
docs(audit): post-audit fixes — README v0.9.4, CHANGELOG, SECURITY, ExecutionPolicy note, version.json

- README badge: v0.9.0 → v0.9.4
- CHANGELOG: add v0.9.4 entry
- SECURITY.md: update version references to v0.9.x
- ONBOARDING_GUIDE.md: add ExecutionPolicy note for Windows
- tools/router/version.json: create SSOT for version info
```

**Pede aprovação antes de commitar e antes de fazer push.**

---

## O QUE NÃO FAZER

- Não modificar `classify.js` para o mismatch "commit message T0→T1" — isso requer aprovação separada e análise de impacto
- Não modificar o Cloudflare Worker (rate limiting, error details) — é Fase 2
- Não criar autenticação para endpoints do hub — é Fase 3
- Não fazer `git add -A` — commits selectivos sempre

---

## O QUE VERIFICAR MANUALMENTE (não podes fazer tu)

Estes dois items requerem browser e são documentados em `CLAUDE_AI_BROWSER_MASTER_PROMPT.md`:

1. **Supabase RLS** — verificar se a policy INSERT para `anon` existe na tabela `waitlist`.
   Se não existir, o form de waitlist retorna 503.
   SQL a correr no Supabase SQL Editor:
   ```sql
   CREATE POLICY "Allow anon insert" ON waitlist
   FOR INSERT TO anon
   WITH CHECK (true);
   ```

2. **Cloudflare PAULO_WEBHOOK_URL** — verificar no dashboard se o secret tem valor real.
   `dash.cloudflare.com` → Workers → `frugal-hub` → Settings → Variables → verificar `PAULO_WEBHOOK_URL`.

---

## PROTOCOLO NOTION — fim de sessão

Após completar este master prompt, criar página no Notion:
- HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
- Título: `🔧 Sessão YYYY-MM-DD — Post-Audit Fixes: README, CHANGELOG, SECURITY`
- Conteúdo: commits feitos, itens manuais pendentes, estado do scheduled task
- Actualizar SYNC.md com o ID da página criada
