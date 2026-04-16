# FRIENDS_MASTER_PROMPT.md
# frugal — Onboarding de Amigos (Mac + Windows)
# Missão: instalar, testar, encantar, recolher dados. Sem fricção. Sem cobrança.

> **Para o Claude Code executar autonomamente.**
> Sessão dedicada a preparar frugal para ser partilhado com amigos.
> Zero receita. Zero custo para eles. 100% foco em: funciona no primeiro try, encanta, devolve dados.

---

## CONTEXTO CRÍTICO — lê antes de qualquer coisa

### O que é o frugal (em 2 linhas)
Router inteligente de LLMs para Claude Code. Intercepta cada prompt, classifica em <50ms com regex puro
(sem LLM), e redireciona para o modelo certo. Resultado: ~90% de poupança vs usar Opus em tudo.
Instalação: uma linha. Zero mudanças ao projecto. Zero proxies. Totalmente local.

### Estado actual (v0.9.3 — 2026-04-10)
- classify.js: 102 patterns, 100% accuracy (170 curated prompts)
- Savings validados: 89.9% em produção real
- Hub live: https://mooter-hub.frugal-hub.workers.dev
- install.sh funciona em Mac/Linux. Windows tem particularidades (ver abaixo).
- O MAIOR problema actual: paths com espaços no Windows (`C:/Users/Paulo Loureiro/`)
  quebram comandos bash nos scheduled tasks e health checks.

### Objectivo desta sessão
1. Tornar a experiência de instalação e primeiro uso **encantadora** em Mac e Windows
2. Garantir que **nenhum prompt raw** sai da máquina do utilizador (só telemetria anónima)
3. Preparar um **kit de onboarding** que o Paulo possa enviar aos amigos (link + instruções)
4. Recolher dados de utilização real para melhorar o algoritmo
5. Registar tudo em SYNC.md, Notion e git

### Regras absolutas desta sessão
- NÃO cobres nada. NÃO peças email. NÃO envias prompts para lado nenhum.
- NÃO uses Opus para tarefas de edição de ficheiros ou bash (seria anti-frugal)
- Pergunta ao Paulo ANTES de: push para GitHub, mudanças em wrangler.toml, alterar secrets
- Faz commit de tudo. Usa mensagens claras. Cada feature = commit separado.
- Regista progresso em SYNC.md (secção CLAUDE CODE → COWORK) a cada milestone

---

## PRIORIDADE 1 — Fix do instalador Windows (crítico, faz primeiro)

### O problema
Os paths com espaços (`C:\Users\Paulo Loureiro\`) partem todos os bash commands
quando não têm aspas. Manifesta-se em:
- Health Monitor (scheduled task)
- Backtest diário (Task Scheduler)
- Adversarial gen
- Qualquer `bash -c "node /path/with space/..."` sem quoting

### O que fazer

#### 1a. Audita install.sh para Windows
Lê install.sh completo. Procura todos os lugares onde é construído um path para a home directory.
Verifica se usam `"$HOME"` com aspas (correcto) ou `$HOME` sem aspas (partido em Windows/WSL com espaços).

#### 1b. Cria install-windows.ps1 (NOVO — PowerShell nativo)
O frugal actualmente usa bash para instalação. Em Windows, os amigos podem não ter WSL.
Cria um installer PowerShell que faça o mesmo que install.sh mas nativamente:

```powershell
# install-windows.ps1
# frugal installer para Windows (PowerShell 5.1+)
# Uso: .\install-windows.ps1 [-DryRun] [-Force] [-Doctor] [-Uninstall]
```

O script deve:
1. Detectar `$env:APPDATA\Claude\` (Claude Code no Windows usa AppData, não HOME)
2. Copiar tools/router/*.js, *.cmd para `$env:APPDATA\Claude\tools\router\`
   - NOTA: o Claude Code no Windows usa `%APPDATA%\Claude\` como base, não `~/.claude`
   - Mas `~/.claude` no WSL/Git Bash mapeia para `C:\Users\<user>\.claude`
   - Verifica onde o Claude Code instala settings.json no Windows (registry ou AppData)
3. Injectar o hook em `settings.json` com paths correctos para Windows (barras invertidas ou forward slashes?)
4. Configurar Task Scheduler (schtasks) para o backtest diário às 02:00
5. Instalar skills em `$env:APPDATA\Claude\skills\`
6. Criar CLAUDE.md no local correcto
7. Testar: `node classify.js "rename this variable"` → deve devolver T0

#### 1c. Fix nos scheduled tasks Windows existentes
Em `tools/router/run-backtest.cmd`, verifica se o path está entre aspas:
```cmd
node "%USERPROFILE%\.claude\tools\router\backtest.js"
```
Não:
```cmd
node %USERPROFILE%\.claude\tools\router\backtest.js
```

Se não tiver aspas, corrige.

#### 1d. Fix nos cron jobs do adversarial-gen e health monitor
Lê os scheduled tasks que o Claude Code criou ontem (se houver ficheiros .cmd ou entradas no Task Scheduler).
Garante que todos os paths têm aspas.

#### Commit: `fix(windows): quote all paths with spaces in schedulers and install`

---

## PRIORIDADE 2 — One-line installer cross-platform (Mac + Windows)

### Objectivo
Uma linha que qualquer amigo pode copiar-colar. Sem clonar o repo. Sem saber o que é git.

### 2a. Instalar a partir de URL (Mac/Linux)
Já existe install.sh. Verifica se funciona instalado directamente via curl:

```bash
curl -sSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh | bash
```

Para isto funcionar, o repo tem de ser público OU o Paulo tem de usar um link de gist/release.
Opção A: Tornar o repo público (ideal, mas requer verificação de secrets — vê P5)
Opção B: Criar um release tag e colocar install.sh como release asset (pode ser acedido sem auth)
Opção C: Criar um Gist público com install.sh e o URL desse gist

Para já, usa a Opção C (mais rápido, não requer tornar o repo público):
1. Verifica se existe um GitHub Gist público com install.sh (procura em gh gist list)
2. Se não existir, cria um (precisa aprovação do Paulo — ver nota abaixo)
3. O URL final seria: `curl -sSL https://gist.github.com/pauloloureiroshp-ship-it/HASH/raw/install.sh | bash`

**NOTA:** Antes de criar o Gist, mostra o URL ao Paulo e pede confirmação. É um ficheiro público.

### 2b. Instalar a partir de URL (Windows)
Cria um one-liner PowerShell que funciona sem instalação prévia:

```powershell
# Windows one-liner (colar no PowerShell como admin):
irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex
```

Ou alternativa com curl (disponível em Windows 10+):
```cmd
# Alternativa cmd:
curl -sSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 -o %TEMP%\frugal-install.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\frugal-install.ps1
```

**NOTA:** O `install-windows.ps1` terá de estar no repo para isto funcionar. Se o repo for privado,
precisas de um token de acesso ou de usar releases. Coordena com o Paulo.

### 2c. install.sh — melhorias para experience encantadora

Lê install.sh actual e adiciona:

```bash
# Início do output (depois do banner):
echo ""
echo "  frugal v$(cat VERSION 2>/dev/null || echo '0.9.3')"
echo "  Stop paying for a brain surgeon when you need a band-aid."
echo ""
```

Adiciona estas verificações amigáveis:
- Se Claude Code não estiver instalado → avisa com link para instalação
- Se Node.js não estiver instalado → instrução exacta para instalar (brew/winget/nvm)
- Se Ollama não estiver instalado → sugere, mas diz claramente que é opcional
- No final, mostra uma mensagem de sucesso com o que foi instalado e como testar

Exemplo de output final desejado:
```
  ✓ frugal installed in ~/.claude/
  ✓ Router: classify.js (102 patterns)
  ✓ Hook: UserPromptSubmit active
  ✓ Skills: /frugal-status /frugal-savings /frugal-beast /frugal-zen /frugal-auto
  ✓ Self-test: T0 OK · T2 OK · T3 OK
  ✓ Ollama: qwen2.5:3b ready (optional)
  ✓ Hub: connected (mooter-hub.frugal-hub.workers.dev)

  Next step: open Claude Code and type /frugal-status

  Questions? paulo.loureiro.shp@gmail.com
```

#### Commit: `feat(install): cross-platform one-liner + friendly output`

---

## PRIORIDADE 3 — Garantia de privacidade end-to-end (CRÍTICO para amigos)

### O que já está correcto
- decisions.log: local only, nunca enviado
- savings-tracker: bind 127.0.0.1 only
- hub-push.js: envia apenas tier + confidence + prompt_len (SEM preview, SEM conteúdo)
- No proxy between user and Anthropic

### O que precisas de verificar e reforçar

#### 3a. Auditoria hub-push.js
Lê hub-push.js completo. Confirma:
- O campo `prompt_preview` (80 chars preview) NÃO é enviado para o hub
- O campo `prompt_len` SIM é enviado (comprimento, sem conteúdo)
- O campo `tier`, `confidence`, `cascade_path`, `hw_tier` SIM são enviados
- Nenhum campo de sessão identificável (username, hostname, email) é enviado

Se `prompt_preview` for enviado → remove. Se existir qualquer campo que identifique o utilizador → remove.

O delta deve conter APENAS:
```json
{
  "tier": "T0",
  "confidence": 0.92,
  "prompt_len": 45,
  "hw_tier": "gpu_high",
  "cascade_path": "TRIVIAL",
  "ts": "2026-04-10T12:00:00Z"
}
```

#### 3b. Cria PRIVACY.md
Cria um ficheiro `PRIVACY.md` na raiz do repo que explica em linguagem simples o que o frugal recolhe.
Este ficheiro vai ser lido pelos amigos. Deve ser claro, honesto e tranquilizador.

Estrutura sugerida:
```markdown
# frugal — O que é recolhido (e o que não é)

## O que fica na tua máquina (nunca sai)
- Os teus prompts: nunca são enviados para lado nenhum
- decisions.log: ficheiro local em ~/.claude/tools/router/decisions.log
- A tua API key: nunca vista pelo frugal

## O que é enviado para frugal-hub (anónimo)
Para melhorar o algoritmo para todos, o frugal envia um sinal mínimo por prompt:
- Tier de routing (T0/T1/T2/T3)
- Nível de confiança (0.0–1.0)
- Comprimento do prompt (número de caracteres, não o conteúdo)
- Tipo de hardware (gpu_high/gpu_mid/cpu)

## O que NÃO é enviado
- O conteúdo do prompt
- O teu nome, email ou qualquer identificador
- A tua API key
- O nome do teu projecto ou ficheiros

## Como desactivar o envio
node ~/.claude/tools/router/frugal-mode.js zen
# (o zen mode não afecta a telemetria, mas podes editar hub-push.js para comentar a linha de envio)

## Controlado por
Paulo Loureiro · paulo.loureiro.shp@gmail.com · São Paulo, Brasil
```

#### 3c. inject_context.js — audit de privacidade
Lê inject_context.js. Verifica que o `router-hint` injectado NÃO inclui:
- Username do sistema
- Hostname
- Paths absolutos da máquina do utilizador
- Qualquer informação que identifique o utilizador perante o Claude

O hint deve conter apenas: TIER, CONFIDENCE, MODEL, REASONING, CASCADE_PATH, LATENCY_MS, HW_TIER.

#### Commit: `security(privacy): audit hub-push + add PRIVACY.md + verify hint fields`

---

## PRIORIDADE 4 — Experiência de primeiro uso encantadora (WOW moment)

### Filosofia
O primeiro prompt após instalação tem de ser a melhor experiência que um developer já teve.
O utilizador abre Claude Code, faz algo trivial (rename uma variável), e depois corre `/frugal-status`.
Tem de ver: foi grátis. Foi rápido. Ficou registado.

### 4a. Melhora o output do /frugal-status skill

Lê `skills/frugal-status/SKILL.md`. O output actual pode ser muito técnico.
Reescreve para ser mais legível por alguém que instalou há 5 minutos:

Exemplo de output desejado:
```
frugal status — tudo verde

  Router:    activo · último prompt há 3s · T0 (grátis)
  Savings:   $0.84 poupados esta sessão (89% efficiency)
  Ollama:    qwen2.5:3b online · resposta: 312ms
  Hub:       conectado · 4 utilizadores · última sync: 2h atrás
  Hardware:  RTX 4090 · tier: gpu_high
  Modo:      Auto (routing inteligente)

  Esta sessão: 12 prompts · T0=10 · T1=1 · T2=1 · T3=0
  Hoje pagaras ~$0.03 em vez de ~$0.60. Diferença: $0.57.
```

### 4b. Cria /frugal-hello skill (NOVO — para amigos)

Esta skill é invocada automaticamente no primeiro uso (ou manualmente com `/frugal-hello`).
Mostra ao novo utilizador exactamente o que aconteceu no último prompt.

```markdown
# frugal-hello — welcome to frugal

Bem-vindo ao frugal. Aqui está o que aconteceu no teu último prompt:

  Prompt: "rename the handleConnect function to onConnect"
  Classificado como: T0 (renaming trivial)
  Modelo usado: Ollama (qwen2.5:3b) — $0.00
  Se não tivesses frugal: Opus ($1.20 por 1000 prompts deste tipo)
  Confiança: 0.94 (muito alta)
  Latência de classificação: 18ms

  Os teus prompts nunca saem da tua máquina.
  Só o tier e o comprimento são enviados para ajudar outros utilizadores.

  Comanda: /frugal-status para ver o estado completo
  Comanda: /frugal-savings para ver quanto poupaste
  Comanda: /frugal-beast para forçar o modelo mais inteligente
```

Implementação: Lê a última linha de decisions.log e formata de forma friendly.
Registar em `~/.claude/skills/frugal-hello/SKILL.md`.

### 4c. Onboarding flow — torna-o silent por default para amigos

O onboarding actual pode pedir input interactivo (setup-profile.js), o que quebra em ambientes non-TTY.
Verifica `onboarding.js`: se não for TTY, deve fazer silent setup com defaults sensatos:
- Anthropic plan: "pro" por default
- Ollama: detecta automaticamente (já faz)
- Budget: sem limite por default

Para amigos, o onboarding silencioso é melhor. Podem correr `/frugal-status` para ver o estado.

#### Commit: `feat(ux): frugal-hello skill + friendly frugal-status + silent onboarding`

---

## PRIORIDADE 5 — Tornar o repo público de forma segura

### Por que agora?
O one-line installer só funciona se o repo for público (ou via release assets).
Os amigos precisam de aceder a install.sh e install-windows.ps1 sem autenticação.

### 5a. Auditoria de secrets no histórico git

Corre:
```bash
git log --all --full-history -- "*.env" "**/*.env" ".env*"
git log --all --full-history --diff-filter=A -- "wrangler.toml"
git grep -l "ANTHROPIC_API_KEY\|CF_API_TOKEN\|supabase.*key\|secret\|password\|token" $(git log --all --format="%H") 2>/dev/null | head -20
```

Verifica especificamente:
- `hub/wrangler.toml` — pode ter account_id ou database_id (são públicos e OK, não são secrets)
- `.env` ficheiros — não devem existir no histórico
- `decisions.log` — não deve estar no histórico
- Qualquer commit com "key", "secret", "token" no diff

**IMPORTANTE:** Se encontrares uma chave real no histórico → PARA e avisa o Paulo.
Account IDs Cloudflare são públicos (OK). O que não pode estar: CF_API_TOKEN, ANTHROPIC_API_KEY, Supabase service key.

### 5b. Verifica .gitignore
Lê .gitignore actual. Garante que inclui:
```
.env
.env.*
*.env
decisions.log
router-tuning.json
backtest-latest.log
.tracker.pid
.frugal-mode.json
classify.js.bak
classify.js.bak2
hw-capability.json
subscription-profile.json
*.vsix
```

Adiciona qualquer item em falta.

### 5c. Cria .env.example
Cria `tools/router/.env.example` com todos os env vars usados, com valores fictícios:
```bash
# frugal environment variables
# Copia para .env e preenche com os teus valores

# Anthropic (opcional — T1/T2/T3 precisam disto)
ANTHROPIC_API_KEY=sk-ant-...

# Cloudflare (só para deploy do hub — não precisas para usar o frugal)
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
```

### 5d. README.md — adiciona badge e instruções públicas
No README.md, adiciona (logo no início):
- One-line install command (para Mac e Windows)
- Link para PRIVACY.md
- "Free for everyone, forever"

### 5e. Decisão sobre tornar público
**APÓS completar 5a, 5b, 5c, 5d:**
Cria um relatório conciso com:
- Resultado da auditoria de secrets (passou/falhou)
- Lista de ficheiros que foram actualizados
- Recomendação: "repo está pronto para ser público" ou "requer ação antes"

**AGUARDA APROVAÇÃO DO PAULO** antes de tornar o repo público.
A acção de tornar o repo público deve ser feita pelo Paulo, não pelo Claude Code.

#### Commit: `chore(security): gitignore audit + .env.example + public-ready check`

---

## PRIORIDADE 6 — Kit de onboarding para amigos (o "envelope")

### O que é
Um kit completo que o Paulo pode enviar a um amigo em 1 mensagem.
Deve conter tudo o que o amigo precisa para instalar e começar, sem ter de perguntar nada.

### 6a. Cria ONBOARDING_GUIDE.md

Cria `ONBOARDING_GUIDE.md` na raiz do repo. Público, friendly, sem jargão técnico.

Estrutura:
```markdown
# Como instalar o frugal (5 minutos)

O frugal poupa ~90% do custo do Claude Code sem mudares nada no teu projecto.
Funciona em Mac e Windows. Não custa nada.

## Pré-requisitos
- Claude Code instalado
- Node.js 20+ (verifica com: node --version)
- Opcional: Ollama (para poupanças máximas)

## Mac / Linux (1 comando)
\`\`\`bash
curl -sSL [URL] | bash
\`\`\`

## Windows (1 comando no PowerShell)
\`\`\`powershell
irm [URL] | iex
\`\`\`

## Depois de instalar
Abre o Claude Code e escreve:
\`\`\`
/frugal-status
\`\`\`

Deves ver algo como:
\`\`\`
frugal status — tudo verde
Router: activo
Savings: pronto para poupar
\`\`\`

## O que vai mudar (e o que não muda)
- O Claude Code continua a funcionar exactamente igual
- Os teus prompts continuam a ser só teus
- O frugal trabalha em silêncio, invisível
- Só o tier do routing (T0/T1/T2/T3) é partilhado de forma anónima para melhorar o algoritmo

## Problemas?
paulo.loureiro.shp@gmail.com
```

### 6b. Cria FRIEND_KIT.md (mensagem pronta para copiar-colar)

Cria `FRIEND_KIT.md` — o que o Paulo envia ao amigo no WhatsApp/email.
Conteúdo deve ser informal, entusiasmante, e conter apenas o essencial.

```markdown
# FRIEND_KIT.md
## Mensagem de onboarding (copia e cola para o amigo)

---

Ei! Quero que sejas dos primeiros a testar o frugal.

É uma ferramenta que fiz que poupa ~90% do custo do Claude Code.
Sem mudares nada, sem risco, sem custo. Instala em 30 segundos.

**Mac/Linux:**
\`\`\`
curl -sSL [URL] | bash
\`\`\`

**Windows:**
\`\`\`
irm [URL] | iex
\`\`\`

Depois de instalar, abre o Claude Code e escreve `/frugal-status`.

Os teus prompts ficam sempre na tua máquina — só mando para os meus servidores
o tier de cada decisão (T0/T1/T2/T3) para melhorar o algoritmo.
Podes ver o que é enviado em PRIVACY.md.

Qualquer problema me dizes. 🐕

---
```

### 6c. Actualiza a landing page com as instrucções de instalação

Lê `landing/app/page.tsx`. Localiza a secção do "Install Now" CTA.
Garante que o one-liner de instalação (Mac e Windows) está visível e correcto.
Se o repo não for público ainda, usa o link temporário do Gist (P2a).

#### Commit: `docs(friends): ONBOARDING_GUIDE + FRIEND_KIT + landing install links`

---

## PRIORIDADE 7 — Recolha de dados de amigos (sem atrito, com consentimento implícito)

### Filosofia
Os amigos instalam. Usam. Os dados fluem automaticamente para o hub.
Paulo recebe insights sem precisar de perguntar nada. Os amigos nem precisam de saber que está a acontecer
(mas podem ler PRIVACY.md se quiserem).

### 7a. Verifica o fluxo hub-push end-to-end

Com o frugal instalado localmente, simula uma sessão:
1. Cria um decisions.log de teste com 10 entradas variadas
2. Corre `node tools/router/hub-push.js --dry-run` (se --dry-run não existir, adiciona)
3. Verifica que o payload enviado é exactamente o que está documentado em 3a
4. Verifica que o hub recebe e processa correctamente (chama /api/stats para confirmar)

### 7b. Dashboard do Paulo — view de multi-utilizador

O dashboard em `/dashboard/` está em scaffold. Não precisa de estar completo para amigos,
mas o Paulo precisa de ver contribuições de múltiplos utilizadores.

Verifica o que falta para o dashboard mostrar:
- Total de utilizadores activos (contar session_hash únicos no D1)
- Distribuição global de tiers (T0/T1/T2/T3 % aggregado)
- Savings globais estimados
- Gráfico de prompts por dia

Se o dashboard precisar de <4h de trabalho para ter estes dados reais do hub, implementa.
Se precisar de mais, documenta em SYNC.md o que falta e faz commit com scaffold actualizado.

### 7c. Weekly Notion report — adiciona multi-user stats

O weekly evolution job (domingo, 03:47) gera um relatório Notion.
Actualiza o template do relatório para incluir:
- Utilizadores activos (se houver dados no hub)
- Top tiers da semana (agregado de todos os utilizadores)
- Novos patterns aprendidos

#### Commit: `feat(analytics): multi-user hub flow + dashboard view + weekly report`

---

## PRIORIDADE 8 — Testes e qualidade (garantir que funciona no primeiro try)

### 8a. Teste de instalação limpa

Simula uma instalação limpa fazendo:
```bash
mkdir /tmp/frugal-clean-test
CLAUDE_DIR=/tmp/frugal-clean-test bash install.sh --dry-run
```

Verifica:
- Nenhum erro
- Todos os ficheiros seriam copiados correctamente
- O hook seria injectado correctamente
- A mensagem final de sucesso aparece

### 8b. Smoke test cross-platform

Cria `tools/router/smoke-test.js` — script que qualquer amigo pode correr depois de instalar:

```javascript
// smoke-test.js — run after install to verify everything works
// Usage: node smoke-test.js

const tests = [
  { prompt: "rename handleConnect to onConnect", expected: "T0" },
  { prompt: "generate commit message for this diff", expected: "T1" },
  { prompt: "why does the websocket reconnect fail sometimes", expected: "T2" },
  { prompt: "redesign the auth system for multi-tenant scale", expected: "T3" },
];
```

Output esperado:
```
frugal smoke test
  T0 · rename handleConnect... ✓ (expected T0, got T0, 18ms)
  T1 · generate commit...      ✓ (expected T1, got T1, 22ms)
  T2 · why does websocket...   ✓ (expected T2, got T2, 19ms)
  T3 · redesign auth...        ✓ (expected T3, got T3, 21ms)

4/4 passed. frugal is working correctly.
Average latency: 20ms
```

Se algum falhar:
```
  T1 · generate commit...  ✗ (expected T1, got T0 — confidence 0.45)
  
  Classification mismatch detected. Run: node ~/.claude/tools/router/classify.js "<prompt>" --debug
  Or contact paulo.loureiro.shp@gmail.com
```

Instala smoke-test.js em `tools/router/smoke-test.js` e adiciona ao install.sh como passo final.

### 8c. Verifica que o frugal não parte Claude Code se algo falhar

Lê inject_context.js. Confirma que:
- Se classify.js falhar (crash) → Claude Code continua normalmente sem hint
- Se savings-tracker não estiver online → statusline mostra "—" em vez de crashar
- Se Ollama não estiver online → T0 tasks degradam graciosamente para T1 (não quebram)
- Se decisions.log não existir → cria automaticamente (não crashar)

Se algum destes pontos não estiver garantido, adiciona o try/catch necessário.

#### Commit: `test(install): smoke-test.js + clean install simulation + graceful degradation`

---

## PRIORIDADE 9 — Fix do Windows health checks (os que partiram esta noite)

### O problema exacto
Os scheduled tasks criados ontem usam paths como:
```
node "/c/Users/Paulo Loureiro/.claude/tools/router/stress-test.js"
```

Em Windows nativo (não WSL), `/c/Users/...` não é um path válido.
O path correcto seria `C:\Users\Paulo Loureiro\.claude\tools\router\stress-test.js`
ou com WSL: `/mnt/c/Users/Paulo\ Loureiro/...` (com o espaço escapado).

### O que fazer

#### 9a. Diagnostica o ambiente Windows actual
```bash
# Em WSL ou Git Bash no PC do Paulo:
echo $OSTYPE
uname -a
node -e "console.log(require('os').homedir())"
```

Isto vai dizer exactamente que ambiente bash está a ser usado e qual o path correcto para home.

#### 9b. Cria um helper de paths cross-platform
Em `tools/router/paths.js`:
```javascript
// paths.js — cross-platform path resolver for frugal
const os = require('os');
const path = require('path');

const CLAUDE_DIR = process.env.FRUGAL_CLAUDE_DIR
  || (process.platform === 'win32'
      ? path.join(process.env.APPDATA || '', 'Claude')
      : path.join(os.homedir(), '.claude'));

const ROUTER_DIR = path.join(CLAUDE_DIR, 'tools', 'router');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const DECISIONS_LOG = path.join(ROUTER_DIR, 'decisions.log');

module.exports = { CLAUDE_DIR, ROUTER_DIR, SKILLS_DIR, AGENTS_DIR, DECISIONS_LOG };
```

Actualiza os ficheiros que usam paths hardcoded para importar de paths.js.
Prioridade: inject_context.js, backtest.js, savings-tracker.js, hub-push.js.

#### 9c. Corrige os scheduled tasks com paths com aspas
Lê `run-backtest.cmd` e qualquer outro .cmd criado pelos crons.
Envolve todos os paths em aspas duplas.

#### Commit: `fix(windows): paths.js helper + quoted paths in all schedulers`

---

## PRIORIDADE 10 — Registo, documentação e entrega (sempre o último passo)

### 10a. Actualiza SYNC.md
Na secção `CLAUDE CODE → COWORK`:
- Lista todos os commits feitos nesta sessão
- Estado de cada prioridade (P1-P9): feito / parcial / bloqueado
- O que precisa de aprovação do Paulo (P2 Gist, P5 repo público)
- URL do one-liner de instalação (quando disponível)
- Resultados dos smoke tests

### 10b. Cria página Notion "Friends Beta"
Cria uma página Notion no workspace do Paulo (frugal) chamada "Friends Beta v1".
Conteúdo:
- Lista de amigos (placeholder: Friend 1, Friend 2, ...)
- Status de instalação por amigo (a preencher manualmente)
- Métricas: prompts recebidos, savings, hub contributions
- Links: ONBOARDING_GUIDE.md, PRIVACY.md, FRIEND_KIT.md

### 10c. Evolution snapshot
Cria `.evolution/v0.9.4-friends-beta.json` com:
- SHA-256 de classify.js, inject_context.js, hub/worker.js, install.sh, install-windows.ps1
- Lista das novas features desta sessão
- Número de utilizadores alvo: 3-10 amigos

### 10d. Git tag e push (aguarda aprovação)
Depois de tudo commitado:
- Prepara o comando de push: `git push origin main && git tag v0.9.4 && git push origin v0.9.4`
- **NÃO executes.** Mostra o comando ao Paulo e aguarda confirmação.

### 10e. Mensagem final ao Paulo
No final da sessão, escreve em SYNC.md uma mensagem clara:

```
## Pronto para enviar aos amigos?

Precisas de confirmar:
1. [ ] Aprovas o Gist público para o one-liner Mac/Linux?
2. [ ] Queres tornar o repo público agora? (auditoria passou/falhou)
3. [ ] Há algum amigo específico para quem quer personalizar o kit?
4. [ ] Posso fazer push e criar tag v0.9.4?

Quando confirmares, o frugal está pronto para voar.
```

#### Commits: `chore(release): evolution snapshot v0.9.4 + SYNC.md update + Notion Friends Beta`

---

## RESUMO DAS PRIORIDADES

| P | Título | Impacto | Dificuldade | Requer Paulo? |
|---|--------|---------|-------------|---------------|
| P1 | Fix Windows paths/spaces | Crítico (crons partidos) | Média | Não |
| P2 | One-line installer cross-platform | Alto (friends UX) | Média | Sim (Gist/repo) |
| P3 | Privacidade end-to-end | Crítico (confiança) | Baixa | Não |
| P4 | WOW moment (frugal-hello) | Alto (retenção) | Média | Não |
| P5 | Repo público safe | Alto (distribuição) | Média | Sim (tornar público) |
| P6 | Kit de onboarding | Alto (amigos) | Baixa | Não |
| P7 | Dados de amigos | Médio (algoritmo) | Média | Não |
| P8 | Smoke tests + graceful degradation | Alto (confiança) | Média | Não |
| P9 | Windows health checks | Urgente (infra) | Baixa | Não |
| P10 | Docs, Notion, snapshot, push | Crítico (não perder nada) | Baixa | Sim (push) |

---

## NOTAS FINAIS

### O que "pronto para amigos" significa exactamente
Um amigo pode:
1. Copiar um comando de uma linha
2. Correr no Mac ou Windows sem problemas
3. Ver o frugal a funcionar no próximo prompt
4. Correr `/frugal-status` e perceber o que aconteceu
5. Saber exactamente o que é enviado para os servidores (PRIVACY.md)
6. Desinstalar com um comando se quiser

### O que Paulo recebe automaticamente de cada amigo
- Número de prompts (sem conteúdo)
- Distribuição de tiers (T0/T1/T2/T3)
- Hardware tier (para validar que funciona em várias máquinas)
- Savings estimados (para reportar resultados reais)

### O que Paulo NÃO recebe (garantido tecnicamente)
- Nenhum prompt
- Nenhum nome de ficheiro ou projecto
- Nenhum identificador pessoal

### Arquitectura de dados (para referência)
```
Amigo usa frugal
    ↓
decisions.log (local, na máquina do amigo)
    ↓
hub-push.js (envia delta anónimo a cada 24h ou no /frugal-update)
    ↓
mooter-hub.frugal-hub.workers.dev/api/delta
    ↓
D1 SQLite (Cloudflare) — só tiers, confiança, comprimento, hw_tier
    ↓
Paulo vê via /api/stats ou dashboard
    ↓
backtest.js aprende → classify.js melhora para toda a gente
```

---

**Boa sessão. Faz tudo com cuidado. Regista tudo. Não empurres sem autorização do Paulo.**
**O objectivo é ter 3-10 amigos a usar até amanhã. Podes fazê-lo. 🐕**
