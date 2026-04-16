# frugal — Browser Tasks (4 acções manuais pendentes)
> Última actualização: 2026-04-11
> Estas tarefas requerem browser. Cada uma demora < 5 minutos.
> Faz-as por ordem — T2 desbloqueia a landing para amigos imediatamente.

---

## T2 — SUPABASE: Fix do form de waitlist ⚡ (mais urgente)

**Tempo:** 2 minutos  
**Resultado:** O form da landing passa a gravar emails de amigos

### Passos

1. Abre: https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/editor
2. Cola e executa este SQL:

```sql
CREATE POLICY "Allow anon insert" ON waitlist
FOR INSERT TO anon WITH CHECK (true);
```

3. Verifica: vai à landing https://landing-five-azure-16.vercel.app/ e testa o form com um email de teste
4. ✅ Done — amigos já conseguem entrar na waitlist

---

## T1 — GITHUB: Criar OAuth App "frugal"

**Tempo:** 3 minutos  
**Resultado:** Login com GitHub funcionará na dashboard web

### Passos

1. Abre: https://github.com/settings/applications/new
2. Preenche:
   - **Application name:** `frugal`
   - **Homepage URL:** `https://landing-five-azure-16.vercel.app`
   - **Authorization callback URL:** `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`
3. Clica "Register application"
4. Copia o **Client ID** e gera um **Client Secret**
5. No Supabase: https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers
   - Activa "GitHub"
   - Cola o Client ID e Client Secret
   - Guarda
6. ✅ Done — GitHub OAuth activo

---

## T3 — CLOUDFLARE: Webhook para notificações Paulo

**Tempo:** 3 minutos  
**Resultado:** Recebes notificação quando chegam novos dados de utilizadores

### Passos

1. Cria um webhook gratuito em https://webhook.site (copia a URL única)
   - Alternativa: usa um canal Discord com webhook
2. Abre Cloudflare Dashboard: https://dash.cloudflare.com/b1093c8a6e663afd02f98a1e87d0fa34/workers/services/view/frugal-hub/production/settings/bindings
3. No terminal (ou Wrangler):
```bash
cd ~/frugal
echo "URL_DO_TEU_WEBHOOK" | npx wrangler secret put PAULO_WEBHOOK_URL
```
4. ✅ Done — receberás notificações semanais com stats de utilizadores

---

## T4 — VERCEL: Env vars da landing

**Tempo:** 2 minutos  
**Resultado:** A landing conecta correctamente ao Supabase em produção

### Passos

1. Abre: https://vercel.com/pauloloureiroshp-ship-its-projects/landing/settings/environment-variables
2. Adiciona (se não existirem):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eymtobwinevywmmlmxqa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(vai ao Supabase → Settings → API → anon key)* |
| `NEXT_PUBLIC_SITE_URL` | `https://landing-five-azure-16.vercel.app` |

3. Faz redeploy: `vercel --prod` no terminal (dentro de `~/frugal/landing/`)
4. ✅ Done — form e OAuth funcionam em produção

---

## Decisão pendente: repo público vs hospedar install.sh

Para que amigos instalem com o oneliner sem SSH:
```bash
curl -fsSL https://landing-five-azure-16.vercel.app/install.sh | bash
```

**Opção A (recomendada):** Tornar o repo público
- Auditoria de segurança: ✅ feita (v0.9.4 — 0 secrets em código)
- .gitignore protege: `.env*`, `backtest-delta.json`, `frugal-core/`
- Comando: no GitHub repo → Settings → Danger Zone → Make public

**Opção B:** Hospedar o install.sh na landing (Vercel)
- Copiar `install.sh` para `landing/public/install.sh`
- Funciona sem tornar o repo público
- Desvantagem: utilizadores não podem ver o código-fonte

**Paulo decide qual prefere.**

---

## Estado após completar todas as tarefas

| Funcionalidade | Estado |
|---|---|
| Waitlist form | ✅ funciona |
| GitHub OAuth | ✅ funciona |
| Notificações Paulo | ✅ activas |
| Landing em produção | ✅ completa |
| Oneliner para amigos | ✅ (após decisão repo) |
