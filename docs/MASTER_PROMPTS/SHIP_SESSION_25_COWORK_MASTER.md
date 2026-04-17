# SHIP Session #25 — Master Prompt for Claude Cowork (Mac)

> Cola este prompt inteiro no Claude Cowork (Mac) para executar os 3 passos manuais pendentes da sessão #25 sem supervisão do Paulo. Cada passo tem verificações. Se algum falhar, pára e reporta — NÃO avances.

---

## Contexto da missão

Sessão #25 no Windows (Claude Code, 2026-04-17) fez um sweep de 7 tasks e deixou 3 passos manuais que requerem CLIs que o Windows session não tinha. Tu (Cowork no Mac) vais fechar esses 3 passos e validar end-to-end.

**Commits já feitos por sessão #25 (já no `main` remoto após push):**
- `0184bee` fix(router+hub): tester reliability pass + installed_fleet telemetry
- `6bf87e3` chore: update SYNC.md with session #25

**Ficheiros alterados relevantes:**
- `hub/routes/stats.js` — adicionado campo `installed_fleet` a `/api/stats`
- `tools/router/mooter-continuous-tester.js` — 5 patches de resiliência
- `~/.claude/tools/router/update-metrics.js` — novo (token telemetry)
- `~/.claude/tools/router/mooter-summary-full.js` — novo (dashboard v2)
- `~/.claude/skills/mooter-summary/SKILL.md` — reescrito

**Estado actual em prod:**
- Landing em `mooter.ai` / `landing-five-azure-16.vercel.app` — botão Sign in silencioso (env vars vazias)
- Hub em Cloudflare Workers — endpoint `/api/device-heartbeat` existe em código mas migration 007 pode não estar aplicada a prod; `/api/stats` não tem ainda o campo `installed_fleet` em runtime (código é deste commit, precisa deploy)
- Tester — deve estar a correr no Windows numa janela cmd; TU não tocas aqui

## Pré-requisitos (verificar antes de começar)

```bash
# 1. Estar na working copy correcta do repo (macOS)
cd ~/Documents/Claude/Projects/Mooter.ai\ \(macOS\)/frugal   # ajusta se o path do Mac for outro

# 2. Pull do remoto para apanhar commits 0184bee + 6bf87e3
git pull origin main
git log --oneline -3
# Esperado: ver 6bf87e3 e 0184bee no top

# 3. CLIs necessários
vercel --version      # deve devolver um número. Se "command not found": npm i -g vercel@latest
wrangler --version    # deve devolver um número. Se "command not found": npm i -g wrangler@latest
```

Se qualquer um dos CLIs faltar e não puderes instalar (rede, permissões), **pára e reporta ao Paulo**.

---

## PASSO 1 — Vercel: adicionar env vars + redeploy

**Objectivo:** desbloquear OAuth GitHub na landing. Sem isto, botão Sign in faz `return;` silenciosamente porque `process.env.NEXT_PUBLIC_SUPABASE_URL` é string vazia em runtime.

**Projecto Vercel correcto:** `landing` (team `team_q3kDk3fEFhlL6AcNryTzH3o2`, projectId `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b`). NÃO o projecto `frugal` (é antigo).

### 1.1. Autenticar e vincular (se ainda não estiver)

```bash
vercel whoami
# Se não estiveres logged in: vercel login (abre browser)

cd landing
vercel link
# Selecciona team: "Paulo Loureiro's projects" (ou equivalente)
# Selecciona projecto: "landing"
# NÃO o "frugal"
```

### 1.2. Ler os valores certos do .env.local

```bash
grep '^NEXT_PUBLIC_SUPABASE' .env.local
# Deves ver:
# NEXT_PUBLIC_SUPABASE_URL=https://eymtobwinevywmmlmxqa.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Se o ficheiro não existir ou não tiver estas linhas, **pára e reporta**. Os valores de sessão #25 (para referência):
- URL: `https://eymtobwinevywmmlmxqa.supabase.co`
- ANON_KEY (válida até 2091): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bXRvYndpbmV2eXdtbWxteHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjEzMDMsImV4cCI6MjA5MTI5NzMwM30.N-GYLtcy2p9SByUaea_usAHdxaxAhHo9xQnbkFvWv2Q`

### 1.3. Verificar estado actual em production

```bash
vercel env ls production
```

Três cenários:

- **A) Vars ausentes → adicionar**
- **B) Vars presentes com valor correcto → saltar para 1.5 (redeploy)**
- **C) Vars presentes com valor diferente → `vercel env rm <NAME> production` e re-adicionar**

### 1.4. Adicionar as vars

```bash
# URL
echo "https://eymtobwinevywmmlmxqa.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production

# ANON_KEY (copiar valor de .env.local)
grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

Confirmar:
```bash
vercel env ls production | grep NEXT_PUBLIC_SUPABASE
# Esperado: 2 linhas, ambas presentes
```

### 1.5. Redeploy a production

```bash
vercel --prod
# Espera pelo "Production: https://landing-..." com status Ready
```

### 1.6. Validar OAuth

```bash
# Fetch a landing e procurar a anon key no bundle
curl -s https://mooter.ai | grep -o 'eymtobwinevywmmlmxqa' | head -1
# Esperado: 1 linha "eymtobwinevywmmlmxqa" (confirma que NEXT_PUBLIC_SUPABASE_URL foi inlined no bundle)
```

Se vazio, as env vars não estão a ser injectadas. Diagnostica antes de avançar.

**Critério de sucesso:** Paulo consegue clicar Sign in em https://mooter.ai e é redirecionado para `github.com/login/oauth/authorize?client_id=Ov23liKacZ4JUyjV0GLo&...`

---

## PASSO 2 — Cloudflare Workers hub: migration 007 + deploy

**Objectivo:** (a) aplicar schema `device_heartbeats` em D1 production, (b) deployar código novo com `installed_fleet` em `/api/stats`.

### 2.1. Ir para a pasta do hub

```bash
cd ../hub   # ou path absoluto se .cwd confuso
ls wrangler.toml wrangler.mooter.toml migrations/007_device_heartbeats.sql
# Todos devem existir
```

### 2.2. Autenticar

```bash
wrangler whoami
# Se não estiveres logged in: wrangler login
```

### 2.3. Identificar o D1 de produção

```bash
cat wrangler.toml | grep -A2 'database_id\|\[\[d1_databases\]\]'
```

O `database_name` e `database_id` para production saem daqui. O config `wrangler.mooter.toml` é o canonical (baseado nos ficheiros que vi). **Usa sempre `-c wrangler.mooter.toml` nos comandos a seguir para não apontar para o D1 errado.**

### 2.4. Verificar se migration 007 já foi aplicada

```bash
wrangler d1 execute mooter-d1 -c wrangler.mooter.toml --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='device_heartbeats';"
```

- Se devolver 1 linha com `device_heartbeats` → migration já aplicada, salta para 2.6
- Se devolver vazio → aplica (passo 2.5)

### 2.5. Aplicar migration 007

```bash
wrangler d1 execute mooter-d1 -c wrangler.mooter.toml --remote --file migrations/007_device_heartbeats.sql
```

Re-verifica:
```bash
wrangler d1 execute mooter-d1 -c wrangler.mooter.toml --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='device_heartbeats';"
# Deve devolver: device_heartbeats
```

Se falhar por "table already exists", está OK (migration é idempotente).

### 2.6. Deploy do worker

```bash
wrangler deploy -c wrangler.mooter.toml
# Espera pelo "Deployed worker" com URL
```

### 2.7. Validar endpoints em prod

```bash
HUB_URL="https://mooter-hub.workers.dev"   # confirma o hostname real do output do deploy

# device-heartbeat deve aceitar POST com body válido
curl -sS -X POST "$HUB_URL/api/device-heartbeat" \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"test-cowork-session25","event":"alive","hw_tier":"apple-silicon","sub_profile":"max","setup_version":"cowork-ship-session25","platform":"darwin-arm64","node_version":"v24","claude_code_version":"2.0","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
# Esperado: {"ok":true,"id":"...","received_at":"..."}

# /api/stats deve devolver o novo campo installed_fleet
curl -sS "$HUB_URL/api/stats" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("installed_fleet present:", "installed_fleet" in d); print(json.dumps(d.get("installed_fleet",{}), indent=2))'
# Esperado:
#   installed_fleet present: True
#   total_devices >= 1 (por causa do heartbeat que acabaste de enviar)
```

**Critério de sucesso:** ambos os curls devolvem 200 com o shape esperado. Se `installed_fleet.total_devices` continuar a 0, algo no deploy não pegou — verifica com `wrangler tail` e reporta.

---

## PASSO 3 — Validar o router Windows (sem tocar no tester)

**Tu NÃO arrancas nem pares o tester.** Está no Windows do Paulo numa janela cmd dedicada. O que podes fazer é verificar remotamente se o hub está a receber dados dele (se o tester estiver vivo).

### 3.1. Verificar push do tester para o hub (opcional, se o push estiver configurado)

```bash
# Se existir um endpoint de health:
curl -sS "$HUB_URL/api/version" || true
```

Se der 404 ou nada, é porque a sessão #25 não configurou isto — ignora.

---

## PASSO 4 — Session wrap

### 4.1. Criar página Notion com resumo

Cria uma sub-página em `Mooter HQ` (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`):

- Título: `🚢 Sessão 2026-04-17 — Cowork Ship (#25-continued)`
- Conteúdo:
  - Tabela de 3 passos com status final (P1 Vercel / P2 Cloudflare / P3 Validação)
  - `vercel --prod` URL
  - `wrangler deploy` URL
  - Output do curl de `/api/stats` (excerpt do `installed_fleet`)
  - Qualquer erro que tenhas encontrado e como resolveste

### 4.2. Actualizar SYNC.md

Na secção `## 📥 COWORK → CLAUDE CODE` → subsecção `### ✅ Sessão #25 — 2026-04-17`:
- Marca os 3 pendings manuais como `✅ feito em 2026-04-17 [hora UTC]`
- Linha única: `OAuth deployed · Hub deployed · Migration 007 applied`

Commit:
```bash
cd ..   # volta a root do repo
git add SYNC.md
git commit -m "chore: ship session #25 cowork manuals (OAuth + hub deploy)"
git push
```

---

## Regras globais

1. **Se algum comando falhar com exit code ≠ 0, PÁRA**. Não tentes contornar. Reporta o comando, o output, e espera instrução do Paulo.
2. **Nunca uses `--force` em git, vercel, ou wrangler** sem autorização explícita.
3. **Nunca alteres `main` via force push**.
4. **Secrets** (o anon key acima) NÃO são para commitar em lado nenhum excepto onde já estão (.env.local é gitignored).
5. **Idempotência:** cada passo pode ser re-corrido sem side effects destrutivos. Se em dúvida, re-corre.
6. **Observabilidade:** ao fim de cada passo, imprime um resumo: "Passo N — status | link | hora UTC". Isto ajuda o Paulo a seguir à distância.

## Definition of Done

- [ ] `curl -s https://mooter.ai | grep eymtobwinevywmmlmxqa` devolve 1 linha
- [ ] `curl -sS $HUB_URL/api/device-heartbeat -X POST -d '{...}'` devolve `{"ok":true,...}`
- [ ] `curl -sS $HUB_URL/api/stats` tem campo `installed_fleet` com `total_devices >= 1`
- [ ] Página Notion da Cowork session criada
- [ ] SYNC.md actualizado e committado com `git push`
- [ ] 3 linhas de status finais impressas no terminal

Quando tudo ✅, reporta ao Paulo em 1 parágrafo curto.
