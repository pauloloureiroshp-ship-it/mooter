# AUDIT_MASTER_PROMPT.md
# frugal — Super Auditoria Completa do Projecto
# Data: 2026-04-10 · Cowork → Claude Code
# Objectivo: validar tudo, encontrar loopholes, gerar roadmap de melhorias

> **Lê este ficheiro inteiro antes de tocar em qualquer ficheiro.**
> Esta é uma sessão de auditoria — não de implementação.
> Documentas tudo o que encontras. Só corriges o que for crítico e seguro de corrigir nesta sessão.
> Para tudo o resto: documenta em AUDIT_REPORT.md e aguarda aprovação do Paulo.

---

## FILOSOFIA DESTA SESSÃO

Esta sessão tem um único objectivo: **saber exactamente onde o frugal está e o que precisa antes de chegar a mãos de utilizadores reais.**

Não é sobre adicionar features. É sobre garantir que o que existe é sólido, seguro, organizado e partilhável com confiança.

O output final é um ficheiro `AUDIT_REPORT.md` na raiz do projecto com:
1. Estado real de cada componente (verde / amarelo / vermelho)
2. Lista de loopholes encontrados, ordenados por severidade
3. Roadmap de melhorias com estimativas e prioridade
4. Confirmação clara: "pronto para amigos: sim / não / com estas condições"

---

## ESTRUTURA DO PROJECTO A AUDITAR

```
~/frugal/
  tools/router/          ← o núcleo do frugal
  hub/                   ← Cloudflare Worker (backend)
  landing/               ← Next.js landing page (frontend)
  dashboard/             ← área logada (scaffold)
  skills/                ← slash commands do Claude Code
  agents/                ← subagents (model-architect, etc.)
  vscode-extension/      ← extensão VS Code (v0.4.0)
  docs/                  ← documentação
  install.sh             ← installer Mac/Linux
  install-windows.ps1    ← installer Windows
  PRIVACY.md, README.md, SECURITY.md, etc.
```

---

## BLOCO 1 — AUDITORIA DE SEGURANÇA (faz primeiro — é crítico)

### 1.1 — Scan de secrets no histórico git

```bash
# Corre estes comandos e documenta o output completo em AUDIT_REPORT.md
cd ~/frugal

# Scan de chaves e tokens no histórico
git log --all -p --follow -- "*.env" 2>/dev/null | grep -E "(KEY|TOKEN|SECRET|PASSWORD|api_key)" | head -30

# Verifica se .env ou .env.local alguma vez foram commitados
git log --all --full-history -- ".env" ".env.local" ".env.*"

# Scan de strings perigosas em todos os commits
git log --all --oneline -50

# Verifica o .gitignore actual
cat .gitignore

# Verifica se há ficheiros sensíveis no índice actual
git status --short
git ls-files | grep -E "(\.env|secret|key|token|password|credential)" | grep -v "node_modules"
```

**O que procuras:**
- ANTHROPIC_API_KEY no histórico → CRÍTICO: invalidar a chave imediatamente se encontrares
- CF_API_TOKEN (Cloudflare) → CRÍTICO: invalidar e regenerar
- Supabase service_role key → CRÍTICO
- Qualquer JWT ou Bearer token hardcoded
- decisions.log ou backtest data com prompts reais commitados

**Documenta em AUDIT_REPORT.md § Segurança:**
- Resultado: PASSOU / FALHOU
- Se FALHOU: lista exacta dos ficheiros e commits afectados
- Recomendação de acção (invalidar chave, git filter-repo, etc.)

### 1.2 — Auditoria do .gitignore

Lê `.gitignore` actual. Verifica que inclui TODOS estes itens:
```
.env
.env.*
*.env
.env.local
decisions.log
router-tuning.json
backtest-latest.log
.tracker.pid
.frugal-mode.json
classify.js.bak*
hw-capability.json
subscription-profile.json
*.vsix
node_modules/
.next/
.vercel/
*.log
.frugal-auth.json
frugal-core/
.frugal-core/
```

Se algum item estiver em falta → adiciona ao .gitignore **e** verifica se o ficheiro está no tracking actual:
```bash
git ls-files [ficheiro-em-falta]
# Se aparecer → git rm --cached [ficheiro] e commit
```

Documenta: quais itens foram adicionados, quais ficheiros foram removidos do tracking.

### 1.3 — Auditoria do hub-push.js (privacidade dos dados)

Lê `tools/router/hub-push.js` completo.

Verifica:
- [ ] O campo `prompt` ou `prompt_preview` NÃO está no payload enviado para o hub
- [ ] O campo `prompt_len` SIM (comprimento, não conteúdo)
- [ ] O campo `tier` SIM
- [ ] O campo `confidence` SIM
- [ ] O campo `cascade_path` SIM
- [ ] O campo `hw_tier` SIM
- [ ] Nenhum username, hostname, email, path absoluto no payload
- [ ] O endpoint de destino é HTTPS (não HTTP)
- [ ] Existe try/catch → se o hub estiver offline, o Claude Code continua normalmente

Se encontrares `prompt_preview` ou qualquer campo de conteúdo → **remove imediatamente** e documenta.

### 1.4 — Auditoria do inject_context.js (o que vai para o contexto do Claude)

Lê `tools/router/inject_context.js` completo.

O `<router-hint>` injectado no contexto do Claude deve conter APENAS:
- TIER (T0/T1/T2/T3)
- CONFIDENCE (0.0-1.0)
- MODEL (nome do modelo sugerido)
- REASONING (texto genérico — não pode incluir conteúdo do prompt)
- LATENCY_MS
- HW_TIER

Verifica que o hint NÃO inclui:
- O prompt raw ou qualquer substring dele
- Username ou hostname do sistema
- Paths absolutos da máquina
- Qualquer PII

### 1.5 — Auditoria do Cloudflare Worker (hub)

Lê `hub/worker.js` completo.

Verifica:
- [ ] O endpoint `/api/delta` (POST) valida o payload antes de guardar
- [ ] Não aceita campos arbitrários — só os campos do schema definido
- [ ] Rate limiting existe? (mesmo que básico)
- [ ] O endpoint `/api/stats` (GET) não expõe dados individuais — só aggregados
- [ ] CORS headers: origin restrito ou wildcard? (wildcard é ok para API pública)
- [ ] Existe autenticação para endpoints admin? (ex: `/api/admin/*`)
- [ ] Os secrets (PAULO_WEBHOOK_URL, etc.) estão como env vars, não hardcoded

Documenta: rating de segurança do worker (0-10) + lista de melhorias.

### 1.6 — Auditoria do Supabase

Lê `landing/app/lib/supabase.ts` e `landing/app/api/waitlist/route.ts`.

Verifica:
- [ ] A anon key está como variável de ambiente (não hardcoded)
- [ ] RLS está activo na tabela `waitlist`
- [ ] A policy INSERT para anon existe (estava em falta — verifica se foi corrigido)
- [ ] Não há service_role key exposta no frontend (NEXT_PUBLIC_*)
- [ ] Os campos guardados na waitlist não incluem dados sensíveis além de email

Testa o endpoint de waitlist:
```bash
curl -X POST [URL_VERCEL]/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"audit-test@frugal.test","hardware":"mac_m_series","subscriptions":["claude_max"]}'
# Documenta a resposta
```

---

## BLOCO 2 — AUDITORIA TÉCNICA DO NÚCLEO

### 2.1 — classify.js

Lê `tools/router/classify.js` completo.

Verifica:
- [ ] O SHA-256 cache funciona (evita re-classificar o mesmo prompt)
- [ ] Os 11 passes estão ordenados correctamente (fast-paths primeiro, slow-paths depois)
- [ ] Os guardrails T3 (payments, security, migrations) não podem ser ultrapassados por conteúdo do prompt
- [ ] O resultado em caso de erro é T2 (safe default) — não T0 ou crash
- [ ] A latência média está documentada e dentro do target (<50ms)

Corre o smoke test:
```bash
cd tools/router
node smoke-test.js 2>/dev/null || node -e "
const classify = require('./classify.js');
const tests = [
  {p: 'rename handleConnect to onConnect', expected: 'T0'},
  {p: 'generate commit message for this diff', expected: 'T1'},
  {p: 'why does the websocket reconnect fail sometimes', expected: 'T2'},
  {p: 'redesign auth for multi-tenant with Stripe payments', expected: 'T3'},
];
tests.forEach(t => {
  const r = classify(t.p);
  const ok = r.tier === t.expected;
  console.log(ok ? '✓' : '✗', t.expected, '->', r.tier, '|', t.p.substring(0,40));
});
"
```

Documenta: quantos passaram (X/4), latência média, qualquer mismatch.

### 2.2 — patterns.js

Lê `tools/router/patterns.js` completo.

Verifica:
- [ ] Os padrões estão organizados por tier (T0 → T3)
- [ ] Não há padrões conflituosos (um pattern em T0 que também matcharia um T3)
- [ ] Os guardrails T3 têm prioridade sobre tudo o resto
- [ ] Conta o número total de patterns e documenta

### 2.3 — inject_context.js + hook

Lê `tools/router/inject_context.js`.

Verifica:
- [ ] O hook `UserPromptSubmit` está correctamente configurado
- [ ] Se classify.js falhar → o hook falha silenciosamente (não quebra o Claude Code)
- [ ] O hint é injectado antes do prompt chegar ao Claude (não depois)
- [ ] O overhead de latência do hook está abaixo de 100ms no total

### 2.4 — savings-tracker.js

Lê `tools/router/savings-tracker.js`.

Verifica:
- [ ] O servidor HTTP escuta apenas em 127.0.0.1 (não 0.0.0.0)
- [ ] Existe cleanup do processo ao sair (não deixa portas abertas)
- [ ] Os dados de savings são calculados correctamente (não inflacionados)
- [ ] O tracker não falha se decisions.log não existir

### 2.5 — install.sh + install-windows.ps1

Lê ambos os instaladores completos.

Para install.sh, verifica:
- [ ] Todos os paths usam `"$HOME"` com aspas (não $HOME sem aspas)
- [ ] O installer é idempotente (pode ser corrido mais do que uma vez sem problemas)
- [ ] Existe um mecanismo de rollback / uninstall (existe uninstall.sh?)
- [ ] A mensagem de sucesso final é clara e friendly
- [ ] O installer verifica prerequisites (Node.js, Claude Code) antes de instalar
- [ ] O installer não faz `curl | bash` sem verificação de integridade (ou documenta que não verifica)

Para install-windows.ps1, verifica:
- [ ] Todos os paths usam variáveis entre aspas (`"$env:APPDATA"`)
- [ ] Funciona sem privilégios de administrador (ou documenta que precisa)
- [ ] O ExecutionPolicy é tratado correctamente
- [ ] Existe equivalente ao smoke-test após instalação

### 2.6 — Scheduled Tasks / Cron Jobs

Verifica os 4 cron jobs nocturnos:
```bash
# Lista os scheduled tasks do frugal
schtasks /query /fo LIST 2>/dev/null | grep -A5 "frugal"
# OU
ls ~/.claude/tools/router/*.cmd 2>/dev/null
cat ~/.claude/tools/router/run-backtest.cmd 2>/dev/null
```

Para cada task, verifica:
- [ ] O path tem aspas (fix para o bug Windows com espaços)
- [ ] O task existe e está activo
- [ ] O último log de execução não tem erros
- [ ] O output vai para um ficheiro de log (não se perde)

---

## BLOCO 3 — AUDITORIA DO FRONTEND (Landing Page)

### 3.1 — Estrutura e completude

```bash
cd ~/frugal/landing
# Verifica que o build passa sem erros
npx tsc --noEmit 2>&1 | tail -5
```

Documenta: TypeScript clean (✅) ou erros encontrados (lista).

### 3.2 — Checklist de conteúdo da landing

Lê `landing/app/page.tsx` e confirma que estas secções existem e têm conteúdo correcto:

- [ ] Hero: H1 claro, subtitle, counters ao vivo, install command copiável
- [ ] Demo Section: 3 prompts interactivos (button colour T0, mobile crash T2, payment T3)
- [ ] Flywheel Section: 5 passos + privacy proof (what's sent vs never sent)
- [ ] How It Works: diagrama de arquitectura + 4 pillars
- [ ] Install Journey: 5 passos numerados FOR DUMMIES (se já implementada em v10)
- [ ] Comparison Section: tabela vs concorrentes com dados reais
- [ ] Pricing Section: Free / Pro / Enterprise com features claras
- [ ] Access Form: email + hardware + subscriptions + submit funcional

### 3.3 — Verifica os live counters

Os counters no hero apontam para `mooter-hub.frugal-hub.workers.dev/api/stats`.

```bash
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | head -5
```

Documenta: responde com dados reais? Qual é o fallback se o hub estiver offline?

### 3.4 — Verifica o form de waitlist

O endpoint `/api/waitlist` deve:
- Aceitar POST com email válido → guardar no Supabase → retornar `{ok: true}`
- Rejeitar email inválido → retornar `{error: "invalid email"}`
- Não falhar silenciosamente se o Supabase estiver offline

Verifica se a RLS policy do Supabase para INSERT anónimo está activa (estava em falta).

### 3.5 — Performance básica

```bash
# Verifica o tamanho do bundle
cd ~/frugal/landing
ls -lh .next/static/chunks/ 2>/dev/null | sort -k5 -hr | head -10
# OU verifica se há imagens não optimizadas
find . -name "*.png" -o -name "*.jpg" 2>/dev/null | grep -v node_modules | grep -v .next
```

---

## BLOCO 4 — AUDITORIA DO BACKEND (frugal-hub Cloudflare)

### 4.1 — Worker endpoints

```bash
# Testa todos os endpoints
BASE="https://mooter-hub.frugal-hub.workers.dev"

curl -s "$BASE/health" | head -3
echo ""
curl -s "$BASE/api/stats" | head -10
echo ""

# Testa POST delta com payload válido
curl -s -X POST "$BASE/api/delta" \
  -H "Content-Type: application/json" \
  -d '{"tier":"T0","confidence":0.94,"prompt_len":45,"hw_tier":"gpu_mid","cascade_path":"TRIVIAL","frugal_version":"0.9.4-audit"}' \
  | head -5
echo ""

# Testa POST delta com payload inválido (deve rejeitar)
curl -s -X POST "$BASE/api/delta" \
  -H "Content-Type: application/json" \
  -d '{"tier":"INVALID","prompt":"este texto nao devia ser aceite"}' \
  | head -5
```

Documenta: cada endpoint respondeu correctamente? O payload inválido foi rejeitado?

### 4.2 — Verifica o D1 database

```bash
# Se tiveres o wrangler configurado:
cd ~/frugal/hub
npx wrangler d1 execute frugal-hub-db --command "SELECT COUNT(*) as total FROM routing_decisions;" 2>/dev/null
npx wrangler d1 execute frugal-hub-db --command "SELECT tier, COUNT(*) as n FROM routing_decisions GROUP BY tier;" 2>/dev/null
```

Documenta: quantos registos existem? A distribuição de tiers é razoável?

### 4.3 — Crons do hub

Lê `hub/wrangler.toml` e confirma que os 3 crons estão configurados:
- hourly aggregate
- daily generate
- weekly notify

Verifica que o PAULO_WEBHOOK_URL não é o placeholder (`PAULO_WEBHOOK_URL`).
Se ainda for placeholder → documenta como crítico: as notificações não chegam ao Paulo.

---

## BLOCO 5 — AUDITORIA DE DOCUMENTAÇÃO E ORGANIZAÇÃO

### 5.1 — Consistência entre documentos

Lê cada um destes ficheiros e verifica se são consistentes entre si:
- `README.md` — versão, install command, features
- `SYNC.md` — estado actual
- `CHANGELOG.md` — histórico de versões
- `PRIVACY.md` — o que é recolhido
- `SECURITY.md` — como reportar vulnerabilidades
- `ARCHITECTURE.md` — diagrama técnico
- `VISION_V2.md` — visão expandida

Procura inconsistências:
- Versão diferente em ficheiros diferentes
- Install command diferente
- Claims contraditórios ("never sends prompts" vs código que os envia)
- Funcionalidades descritas que não existem (over-promise)

### 5.2 — README público

Lê `README.md` como se fosses um amigo que recebeu o link pela primeira vez.

Perguntas para responder:
- [ ] Fica claro o que o frugal faz em 2 frases?
- [ ] O install command está correcto e funcional?
- [ ] Há link para PRIVACY.md?
- [ ] Há menção de "free to use"?
- [ ] Há menção dos requisitos (Node.js, Claude Code)?
- [ ] Há link para a landing page?
- [ ] Há contacto (email do Paulo)?

Se algum item estiver em falta → adiciona.

### 5.3 — Notion (se tiveres acesso)

Verifica se a página "Friends Beta v1" existe no Notion do Paulo (frugal workspace).
Se não existir → documenta que precisa de ser criada manualmente pelo Paulo.
Se existir → documenta o link.

### 5.4 — Ficheiros órfãos

```bash
cd ~/frugal
# Ficheiros que podem estar desactualizados ou esquecidos
ls -la *.md
ls -la tools/router/*.js | wc -l
ls -la tools/router/*.bak 2>/dev/null
ls -la skills/
ls -la agents/
# Verifica se há ficheiros .bak, .old, .backup que deviam ser removidos
find . -name "*.bak" -o -name "*.old" -o -name "*.backup" 2>/dev/null | grep -v node_modules
```

---

## BLOCO 6 — AUDITORIA DA EXPERIÊNCIA DO UTILIZADOR

### 6.1 — Simula a jornada completa de um amigo (Mac)

Percorre mentalmente (ou com dry-run) cada passo:

```
1. Amigo recebe mensagem do Paulo com link
2. Abre a landing page → consegue perceber o que é em 30 segundos?
3. Clica em "Install Now" → o comando é copiável e correcto?
4. Cola no terminal Mac → o installer funciona?
5. Abre Claude Code → digita um prompt qualquer
6. Corre /frugal-status → vê algo friendly e útil?
7. Decide desinstalar → existe uninstall.sh? Funciona?
```

Para cada passo: documenta o que funciona (✅), o que está incompleto (⚠️), o que está partido (❌).

### 6.2 — Simula a jornada completa de um amigo (Windows)

```
1. Amigo recebe mensagem com link
2. Abre landing → percebe que é para Windows?
3. Copia o PowerShell command
4. Corre no PowerShell → precisa de admin? ExecutionPolicy bloqueia?
5. Abre Claude Code → faz um prompt
6. Corre /frugal-status → funciona?
```

Documenta os pontos de falha conhecidos (o bug dos paths com espaços — foi corrigido?).

### 6.3 — Graceful degradation

Verifica o comportamento em cada cenário de falha:
- Ollama offline → Claude Code continua? T0 degrada para T1? Mensagem de erro friendly?
- Hub offline → hub-push falha silenciosamente? O frugal continua a funcionar?
- savings-tracker offline → statusline mostra "—" em vez de crashar?
- decisions.log não existe → é criado automaticamente?
- Node.js não instalado → o installer dá instrução clara de como instalar?

---

## BLOCO 7 — CHECKLIST FINAL "PRONTO PARA AMIGOS"

Após completar todos os blocos acima, preenche esta checklist:

### Segurança
- [ ] Nenhum secret no histórico git
- [ ] .gitignore cobre todos os ficheiros sensíveis
- [ ] hub-push.js não envia conteúdo de prompts
- [ ] inject_context.js não expõe dados do utilizador
- [ ] Supabase RLS activo na tabela waitlist
- [ ] Worker rejeita payloads inválidos
- [ ] PAULO_WEBHOOK_URL configurado (não placeholder)

### Funcionalidade
- [ ] smoke-test.js passa 4/4
- [ ] install.sh funciona em Mac limpo
- [ ] install-windows.ps1 funciona em Windows 11
- [ ] /frugal-status devolve output friendly
- [ ] /frugal-savings mostra dados reais
- [ ] hub-push envia delta correctamente
- [ ] Landing form submete sem erro

### Documentação
- [ ] README.md claro e actualizado
- [ ] PRIVACY.md explica o que é recolhido
- [ ] ONBOARDING_GUIDE.md tem instruções para Mac e Windows
- [ ] FRIEND_KIT.md tem mensagem pronta para copiar

### Organização
- [ ] SYNC.md actualizado com estado real
- [ ] CHANGELOG.md actualizado com v0.9.4
- [ ] Sem ficheiros .bak ou órfãos
- [ ] Notion Friends Beta page existe

---

## OUTPUT FINAL — AUDIT_REPORT.md

No final de toda a auditoria, cria `AUDIT_REPORT.md` na raiz do projecto com esta estrutura:

```markdown
# AUDIT_REPORT.md
# frugal — Relatório de Auditoria Completa
# Data: [data actual]
# Auditor: Claude Code (sessão auditoria)

## Resultado Geral
**PRONTO PARA AMIGOS: [SIM / NÃO / COM CONDIÇÕES]**
[Se "com condições": lista as condições mínimas]

## Score por Área
| Área | Score | Estado |
|------|-------|--------|
| Segurança | X/10 | 🟢/🟡/🔴 |
| Funcionalidade | X/10 | 🟢/🟡/🔴 |
| Frontend | X/10 | 🟢/🟡/🔴 |
| Backend | X/10 | 🟢/🟡/🔴 |
| Documentação | X/10 | 🟢/🟡/🔴 |
| UX | X/10 | 🟢/🟡/🔴 |

## Issues Encontrados

### 🔴 CRÍTICOS (bloqueia partilha com amigos)
[lista com descrição + localização + acção recomendada]

### 🟡 IMPORTANTES (corrigir antes de launch público)
[lista]

### 🟢 MELHORIAS (roadmap futuro)
[lista]

## O que foi Corrigido Nesta Sessão
[lista de fixes aplicados automaticamente durante a auditoria]

## Roadmap de Melhorias — Priorizado

### Fase 1: Friends Beta (esta semana)
[itens críticos e importantes]

### Fase 2: Launch Público (próximo mês)
[itens importantes]

### Fase 3: v1.5 — O Perfil (Q2 2026)
[itens de evolução do produto]

### Fase 4: v2.0 — Sistema Operativo (Q3 2026)
[itens estratégicos de longo prazo]

## Confirmação de Privacidade
**Checklist de privacidade: X/7 itens verificados**
[detalhe de cada item]

## Mensagem para o Paulo
[resumo executivo em 5 bullet points do que está bem, o que precisa de atenção,
e o que podes fazer sem medo de partilhar com amigos]
```

---

## REGRAS DESTA SESSÃO

### O que podes corrigir automaticamente (sem aprovação)
- Adicionar itens em falta no .gitignore
- Remover ficheiros .bak ou órfãos
- Corrigir inconsistências nos documentos markdown
- Adicionar try/catch em falta no hub-push.js
- Corrigir paths sem aspas nos scheduled tasks
- Melhorar o README.md com informação em falta
- Corrigir typos em qualquer ficheiro de texto

### O que requer aprovação do Paulo antes de tocar
- Qualquer mudança no classify.js ou patterns.js
- Qualquer mudança no hub/worker.js
- Remover código que parece dead code (pode não ser)
- Mudanças no schema do Supabase
- Push para GitHub
- Qualquer coisa que afecte o comportamento do router em produção

### O que fazer se encontrares um secret no histórico git
1. PARA IMEDIATAMENTE
2. Documenta o commit exato e o ficheiro
3. NÃO tentes limpar o histórico sozinho (git filter-repo é destrutivo)
4. Escreve em AUDIT_REPORT.md § CRÍTICO: "ENCONTRADO SECRET NO HISTÓRICO"
5. Lista a acção: Paulo deve invalidar a chave ANTES de tornar o repo público

---

## PRIORIDADE DE EXECUÇÃO

```
1. Bloco 1 (Segurança) — faz SEMPRE primeiro
2. Bloco 2 (Núcleo técnico) — faz antes de qualquer outra coisa
3. Bloco 4 (Backend hub) — verifica que o hub está sólido
4. Bloco 3 (Frontend) — verifica landing e form
5. Bloco 5 (Documentação) — corrige o que é fácil de corrigir
6. Bloco 6 (UX) — simula as jornadas
7. Bloco 7 (Checklist final) — preenche
8. AUDIT_REPORT.md — escreve o relatório completo
9. Actualiza SYNC.md com o resultado da auditoria
```

---

**O sucesso desta sessão não é medido pelo número de fixes aplicados.
É medido pela qualidade do AUDIT_REPORT.md no final —
um documento que o Paulo pode ler em 5 minutos e saber exactamente
onde o frugal está e com que confiança pode partilhá-lo com os amigos. 🐕**
