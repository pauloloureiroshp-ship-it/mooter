# CLAUDE_AI_BROWSER_MASTER_PROMPT.md
# Para o Claude AI (claude.ai) com acesso ao browser e PC do Paulo
# Data: 2026-04-10
# Objectivo: completar tudo o que requer acção no browser ou UI externa

> Cola este prompt inteiro no Claude AI que tem acesso ao teu computador.
> Ele tem acesso ao browser e pode navegar, clicar e preencher formulários.
> Segue exactamente a ordem das tarefas — cada uma depende da anterior.

---

## CONTEXTO — O QUE É O FRUGAL E O QUE JÁ FOI FEITO

O frugal é um router inteligente de LLMs para Claude Code. Poupa ~90% em custos de API classificando prompts em <50ms com regex puro e enviando cada prompt para o modelo certo (Ollama grátis, Haiku, Sonnet ou Opus).

O código está todo implementado e deployed. O que falta são configurações em painéis web externos que requerem acção no browser.

**Stack:**
- Frontend: Next.js deployed no Vercel → https://landing-five-azure-16.vercel.app
- Backend: Cloudflare Worker → https://mooter-hub.frugal-hub.workers.dev
- Auth + DB: Supabase → https://eymtobwinevywmmlmxqa.supabase.co
- Código: GitHub → https://github.com/pauloloureiroshp-ship-it/frugal (privado)

---

## TAREFA 1 — GitHub OAuth App (5 minutos)

### Porquê
O onboarding do frugal tem um step "Connect GitHub" que detecta automaticamente as linguagens
e stack do utilizador via metadata dos repos públicos (nunca lê código).
O código já está implementado — falta activar o provider no GitHub e no Supabase.

### 1a. Cria o OAuth App no GitHub

Navega para: **https://github.com/settings/applications/new**

Preenche exactamente:
| Campo | Valor |
|-------|-------|
| Application name | `frugal` |
| Homepage URL | `https://landing-five-azure-16.vercel.app` |
| Application description | `frugal — intelligent Claude Code router. Saves ~90% on LLM costs.` |
| Authorization callback URL | `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback` |

Clica **Register application**.

Na página seguinte:
1. Copia o **Client ID** (campo visível — parece `Iv1.xxxxxxxxxx`)
2. Clica **"Generate a new client secret"** → confirma se pedir
3. Copia o **Client Secret** imediatamente (só aparece uma vez — se fechares a página perdes-o)

Guarda ambos num ficheiro de texto temporário.

### 1b. Activa o GitHub Provider no Supabase

Navega para: **https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers**

1. Encontra **GitHub** na lista
2. Clica no toggle para activar
3. Cola o **Client ID** do passo anterior
4. Cola o **Client Secret** do passo anterior
5. Clica **Save**

### 1c. Verifica que funciona

Navega para: **https://landing-five-azure-16.vercel.app/onboarding**

Avança até ao Step 2 ("Connect GitHub"). Clica no botão.
Deve redirecionar para o GitHub a pedir autorização.
Após autorizar → deve voltar ao site sem erro.

Se funcionar: ✅ GitHub OAuth está activo.
Se der erro: documenta a mensagem de erro exacta.

---

## TAREFA 2 — Supabase RLS (Row Level Security) para a tabela waitlist

### Porquê
A tabela `waitlist` no Supabase precisa de uma policy que permita inserções anónimas.
Sem ela, o form de early access na landing falha silenciosamente.

### 2a. Abre o SQL Editor do Supabase

Navega para: **https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/sql/new**

### 2b. Corre este SQL

```sql
ALTER TABLE IF EXISTS waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts" ON waitlist;
DROP POLICY IF EXISTS "anon_insert" ON waitlist;
DROP POLICY IF EXISTS "public_insert" ON waitlist;

CREATE POLICY "Allow anonymous inserts"
  ON waitlist FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated reads" ON waitlist;
CREATE POLICY "Allow authenticated reads"
  ON waitlist FOR SELECT TO authenticated USING (true);

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies WHERE tablename = 'waitlist';
```

Resultado esperado: 2 policies listadas.

### 2c. Verifica

Navega para: **https://landing-five-azure-16.vercel.app/#access**
Preenche o form com email de teste e clica Submit. Deve aparecer mensagem de sucesso.

---

## TAREFA 3 — Verificar tabelas profiles + usage_sessions

Navega para: **https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/sql/new**

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'usage_sessions', 'waitlist')
ORDER BY table_name, ordinal_position;
```

Se `profiles` e `usage_sessions` aparecerem → ✅ (já foram criadas pelo Claude Code via MCP).
Se NÃO aparecerem → cria-as com o SQL do ficheiro `~/frugal/FRUGAL_OS_MASTER_PROMPT.md` secção P2c.

---

## TAREFA 4 — Cloudflare: configurar PAULO_WEBHOOK_URL

### 4a. Cria webhook (Discord ou webhook.site)

- Discord: canal → Configurações → Integrações → Webhooks → Criar → Copia URL
- Ou vai a **https://webhook.site** e copia o URL único

### 4b. Configura no Cloudflare

Navega para: **https://dash.cloudflare.com/**
→ Workers & Pages → **frugal-hub** → Settings → Variables
→ Encontra `PAULO_WEBHOOK_URL` → Edit → cola URL → Save

---

## TAREFA 5 — Vercel: verificar environment variables

Navega para: **https://vercel.com/dashboard** → projecto **landing** → Settings → Environment Variables

Verifica que existem:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://eymtobwinevywmmlmxqa.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (começa com `eyJhbG...`) — encontras em Supabase → Settings → API → anon key
- `NEXT_PUBLIC_SITE_URL` = `https://landing-five-azure-16.vercel.app`

Se adicionaste variáveis → Redeploy no Vercel.

---

## TAREFA 6 — Teste final end-to-end

### 6a. Landing: https://landing-five-azure-16.vercel.app
- [ ] Página carrega sem erros (F12 → Console)
- [ ] Counter "Community saved $X.XX" aparece
- [ ] Form early access funciona

### 6b. Onboarding: https://landing-five-azure-16.vercel.app/onboarding
- [ ] 4 steps funcionais
- [ ] Step 2 mostra botão GitHub

### 6c. Hub
```bash
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats
```

---

## TAREFA 7 — Relatório final

```
RESULTADO DAS TAREFAS:

T1 — GitHub OAuth: ✅/❌ [notas]
T2 — Supabase RLS waitlist: ✅/❌ [notas]
T3 — Supabase tabelas: ✅/❌ [notas]
T4 — Cloudflare webhook: ✅/❌ [notas]
T5 — Vercel env vars: ✅/❌ [notas]
T6 — Teste E2E: ✅/❌ [notas]

PRONTO PARA AMIGOS: SIM / NÃO / COM CONDIÇÕES

PRÓXIMO PASSO RECOMENDADO:
[Uma frase]
```

---

## NOTAS DE SEGURANÇA
- Client Secret do GitHub → só no Supabase dashboard, nunca em git
- Supabase Anon Key → seguro para frontend (RLS protege)
- Service Role Key → NUNCA no frontend
- Se algo falhar, documenta e avança para a próxima tarefa
