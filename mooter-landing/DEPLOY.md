# Mooter Landing — Deploy & DNS Guide

> Single-file static HTML landing + waitlist stub. Pronto para deploy na Vercel em < 5 min.

## 1. Deploy na Vercel

### Opção A — CLI (mais rápido, ~2 min)

```bash
cd /Users/paulo/workspace/frugal/landing
npx vercel --prod
```

Responde às perguntas:
- Set up and deploy? **Y**
- Scope? escolhe o teu team
- Link to existing project? **N**
- Project name? `mooter-landing`
- Directory? `./`
- Override settings? **N**

No fim → Vercel devolve URL tipo `mooter-landing-xxx.vercel.app`. Abre e confirma que carrega.

### Opção B — Dashboard Vercel (visual)
1. https://vercel.com/new → Import/Upload
2. Drag-and-drop da pasta `landing/`
3. Project name: `mooter-landing` → Deploy

## 2. Ligar `mooter.ai` ao projecto

No dashboard do projecto `mooter-landing`:
1. Settings → Domains → Add `mooter.ai`
2. Add `www.mooter.ai` (opcional, redirect)
3. Vercel mostra os DNS records necessários

Como o domínio já está registado na Vercel, os DNS devem ser aplicados automaticamente. Se não forem:

### DNS records (Vercel nameservers já apontam bem)
```
A      @     76.76.21.21
CNAME  www   cname.vercel-dns.com
```

## 3. Email forwarding `paulo@mooter.ai` → Gmail

Vercel não fornece email hosting. Duas opções:

### Opção A — ImprovMX (free, recomendado)
1. https://improvmx.com → "Add Domain"
2. Domain: `mooter.ai`
3. Forward: `*@mooter.ai` → `paulo.loureiro.shp@gmail.com`
4. ImprovMX dá 2 MX records para adicionar no DNS:
   ```
   MX  @  mx1.improvmx.com  (priority 10)
   MX  @  mx2.improvmx.com  (priority 20)
   ```
5. Adicionar SPF para não cair em spam:
   ```
   TXT  @  "v=spf1 include:spf.improvmx.com ~all"
   ```
6. Na Vercel → Settings → Domains → `mooter.ai` → DNS Records → adicionar os 3 acima

Verificação: envia um email para `paulo@mooter.ai` e confirma que chega ao Gmail em < 2 min.

### Opção B — Cloudflare Email Routing (também free)
Requer mover nameservers para Cloudflare. Mais setup, mas Cloudflare dá também proxy/CDN grátis. Só vale se quiseres isso; caso contrário, ImprovMX é mais simples.

## 4. Env vars (para quando a waitlist tiver backend)

Quando substituires o stub JS por uma Vercel Function que grava em KV/Supabase:

```
# .env (local, não commitar)
WAITLIST_KV_URL=...
RESEND_API_KEY=...   # para confirmation emails
```

Na Vercel dashboard → Settings → Environment Variables.

## 5. Checklist pós-deploy

- [ ] `https://mooter.ai` carrega (HTTPS auto via Vercel)
- [ ] `https://www.mooter.ai` redireciona para apex
- [ ] Favicon 🐮 aparece no tab
- [ ] Form submission mostra mensagem de sucesso (ainda só local)
- [ ] Email de teste a `paulo@mooter.ai` chega ao Gmail
- [ ] Lighthouse score ≥ 95 em Performance/Accessibility

## 6. TODOs depois do lançamento

- [ ] Waitlist real (Vercel KV + POST /api/waitlist)
- [ ] OG image dinâmica (@vercel/og)
- [ ] Analytics (Vercel Analytics, free tier)
- [ ] Migrar para Next.js quando tiver mais conteúdo (docs, pricing, blog)
