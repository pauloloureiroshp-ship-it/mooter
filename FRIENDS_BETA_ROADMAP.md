# Friends Beta Roadmap
> Última actualização: 2026-04-12
> Objectivo: primeira versão sem vergonha — utilizador faz login, instala, apareces no admin, os dados chegam ao hub.

---

## Estado actual (snapshot honesto)

| Componente | Estado | Bloqueador |
|---|---|---|
| Router frugal (core) | ✅ v0.9.8 em prod | — |
| Hub Cloudflare Worker | ✅ live | inject_context não envia eventos |
| Landing Next.js 15 | ✅ deployed | Sem botão de login |
| Supabase Auth | ⚠️ 90% | OAuth não activado, supabase.ts truncado |
| Onboarding flow | ⚠️ 70% | Bug de estado após OAuth redirect |
| Dashboard | ✅ funcional | Depende de auth estar a funcionar |
| Admin page | ❌ não existe | — |
| Dados → hub | ❌ não fluem | hub-submit-events.js não chamado |
| install_completed tracking | ❌ não existe | endpoint não criado |

---

## P0 — Sem isto, ninguém consegue usar (fazer primeiro)

### P0-A: Completar supabase.ts
**Ficheiro**: `landing/app/lib/supabase.ts`
**Problema**: truncado em 120 linhas — faltam 5 funções que todo o resto importa.
**Adicionar**:
- `signInWithGitHub()` — redirect para Supabase OAuth
- `exchangeCodeForSession(code)` — troca code por tokens (usado em /auth/callback)
- `getUser(token)` — valida token e devolve user (usado em /api/me, /api/profile)
- `upsertProfile(accessToken, data)` — grava/actualiza perfil (usado em onboarding)
- `getProfile(accessToken, userId)` — lê perfil (usado em /api/profile)

### P0-B: Activar GitHub OAuth no Supabase + criar GitHub OAuth App
**Requer browser** (não delegável ao Claude Code):
1. Ir a https://github.com/settings/applications/new
   - Name: `frugal`
   - Homepage: `https://landing-five-azure-16.vercel.app`
   - Callback URL: `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`
2. Ir a https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers
   - Activar GitHub → meter Client ID + Secret

### P0-C: Adicionar botão Login na landing
**Ficheiro**: `landing/app/page.tsx`
**O quê**:
- Botão "Sign in with GitHub" na `Nav` (ao lado de "Install now")
- Nova `AccessSection` depois de `ComparisonSection` com CTA de login
- Middleware já protege `/dashboard` e redireciona para `/#access` quando não autenticado

### P0-D: Corrigir bug de sequência do onboarding
**Problema**: OAuth no Step 2 limpa o state React (hw, subs) → perfil fica incompleto
**Fix**: O login deve acontecer ANTES do onboarding, não durante.
O fluxo correcto:
```
Landing → "Sign in with GitHub" → /auth/callback → /onboarding (user já autenticado)
Step 1: hardware + subs  →  Step 2: install  →  Step 3: config + save
```
Remover o "Connect GitHub" do Step 2 do onboarding (já está feito via landing).
Ajustar `saveProfile()` para incluir `frugal_config` gerado.

---

## P1 — Fundamental para ter dados e visibilidade

### P1-A: Endpoint /api/install-complete
**Ficheiro novo**: `landing/app/api/install-complete/route.ts`
**O quê**: POST com bearer token → marca `install_completed: true` + timestamp no perfil
**Também**: adicionar call best-effort no `install.sh` e `install-windows.ps1`

### P1-B: Página /admin
**Ficheiro novo**: `landing/app/admin/page.tsx` + `landing/app/api/admin/users/route.ts`
**O quê**: tabela com todos os profiles — email, hardware, subs, install_completed, created_at
**Acesso**: restrito a `paulo.loureiro.shp@gmail.com`

### P1-C: Ligar inject_context.js ao hub
**Ficheiro**: `tools/router/inject_context.js`
**O quê**: chamar `hub-submit-events.js` depois de cada decisão (batch assíncrono, best-effort)
**Resultado**: flywheel comunitário começa a girar, D1 começa a ter dados reais

### P1-D: Corrigir security gaps na API
**Ficheiro**: `landing/app/api/me/route.ts`
- Remover `accessToken` do response body (não deve ser exposto ao cliente)

**Ficheiro**: `landing/app/api/profile/route.ts`
- Verificar que `userId` no query param corresponde ao user do token (previne ler perfil alheio)

---

## P2 — Polimento e qualidade para impressionar os friends

### P2-A: Gravar frugal_config no onboarding
**Ficheiro**: `landing/app/onboarding/page.tsx`
**O quê**: incluir `frugal_config` no `saveProfile()` call do Step 3

### P2-B: Gravar email no perfil
**Ficheiro**: `landing/app/onboarding/page.tsx`
**O quê**: no `saveProfile()`, incluir `email` do `/api/me` response

### P2-C: Atualizar FRIEND_KIT.md
**O quê**: substituir instrução `git clone` (requer acesso colaborador) por:
```
1. Vai a https://landing-five-azure-16.vercel.app
2. Sign in with GitHub
3. Segue o onboarding — tens o comando de install personalizado para o teu setup
```

### P2-D: Sync version.json para 0.9.8
**Ficheiro**: `tools/router/version.json`

### P2-E: Testar PostToolUse fix em sessão nova
Abrir uma sessão fresh no Claude Code e verificar que os emojis de tier aparecem correctamente no statusline após calls bash.

---

## P3 — Visão (não bloqueia beta)

### P3-A: Domínio custom
Registar `frugal.dev` (ou similar) → apontar para Vercel landing.
Requer browser: vercel.com/dashboard → Domains.

### P3-B: usage_sessions → Supabase
Enviar sessões de uso detalhadas (prompts/sessão, savings/sessão, tier breakdown) para `usage_sessions` table.
Mostrar no dashboard do utilizador.

### P3-C: FrugalRouterBacktest como scheduled task
Registar o backtest diário automaticamente nos installers.

### P3-D: VSCode extension no marketplace
Publicar v0.4.0 no VS Code Marketplace.

---

## Sequência recomendada para Claude Code

Colar estes master prompts **por esta ordem**, esperando confirmação entre cada um:

```
1. Master Prompt SUPABASE-COMPLETE    → completa supabase.ts com as 5 funções em falta
2. [Browser — Paulo faz] GitHub OAuth App + Supabase providers
3. Master Prompt LANDING-LOGIN        → botão login na Nav + AccessSection
4. Master Prompt ONBOARDING-FIX       → corrige sequência OAuth + grava frugal_config
5. Master Prompt ADMIN-PAGE           → /admin + /api/admin/users
6. Master Prompt INSTALL-COMPLETE     → endpoint + call nos installers
7. Master Prompt SECURITY-FIX         → remove accessToken do /api/me, verifica userId no /api/profile
8. Master Prompt HUB-CONNECT          → liga inject_context.js ao hub-submit-events.js
9. [Browser — Paulo faz] Deploy Vercel (git push → auto-deploy)
```

Passos 2 e 9 são as únicas coisas que precisam do teu browser.
Os restantes 7 são delegáveis ao Claude Code com os master prompts abaixo.

---

## Master Prompts prontos para usar

### MP-1: SUPABASE-COMPLETE

```
## TAREFA
Completar landing/app/lib/supabase.ts com as funções em falta.

## CONTEXTO
O ficheiro tem 120 linhas e exporta: insert, upsert, count, selectOne, isConfigured.
As seguintes funções são importadas em onboarding/page.tsx e auth/callback/route.ts mas NÃO EXISTEM no ficheiro:
- signInWithGitHub (importada por onboarding/page.tsx)
- exchangeCodeForSession (importada por auth/callback/route.ts)
- getUser (importada por api/me/route.ts e api/profile/route.ts)
- upsertProfile (importada por onboarding/page.tsx)
- getProfile (importada por api/profile/route.ts)

## O QUE FAZER
Adicionar ao FINAL de landing/app/lib/supabase.ts (sem alterar o que já existe):

```ts
/**
 * Sign in with GitHub via Supabase OAuth.
 * Redirects: GitHub → Supabase → /auth/callback → /onboarding
 * Client-side only (uses window.location).
 */
export function signInWithGitHub(): void {
  const redirectTo = `${window.location.origin}/auth/callback`;
  const oauthUrl =
    `${URL}/auth/v1/authorize?provider=github` +
    `&redirect_to=${encodeURIComponent(redirectTo)}`;
  window.location.href = oauthUrl;
}

/**
 * Exchange OAuth authorization code for access + refresh tokens.
 * Called from /auth/callback (server-side route).
 */
export async function exchangeCodeForSession(
  code: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as { access_token: string; refresh_token: string };
  } catch {
    return null;
  }
}

/**
 * Get the current user from an access token.
 * Used in /api/me and /api/profile to validate auth.
 */
export async function getUser(
  accessToken: string
): Promise<{ id: string; email: string } | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/user`, {
      headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as { id: string; email: string };
  } catch {
    return null;
  }
}

/**
 * Upsert a user profile. Conflict key: id (user_id).
 */
export async function upsertProfile(
  accessToken: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await fetch(`${URL}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...headers({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

/**
 * Get a user profile by user_id.
 */
export async function getProfile(
  accessToken: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&limit=1`, {
      headers: {
        ...headers(),
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}
```

## VALIDAÇÃO
```bash
cd landing && npx tsc --noEmit 2>&1 | head -20
```
Zero erros esperados.
```

---

### MP-2: LANDING-LOGIN

```
## TAREFA
Adicionar botão de login com GitHub à landing page.

## FICHEIROS A EDITAR
- landing/app/page.tsx

## O QUE FAZER

### 1. Adicionar função loginWithGitHub (topo do ficheiro, após os imports)
```tsx
function loginWithGitHub() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;
  const redirectTo = `${window.location.origin}/auth/callback`;
  window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
}
```

### 2. Modificar Nav() para adicionar botão "Sign in"
Na função Nav(), dentro de `<div className="container nav-row">`, substituir:
```tsx
<a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
  Install now
</a>
```
por:
```tsx
<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
  <button
    onClick={loginWithGitHub}
    className="btn btn-sm"
    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'inherit' }}
  >
    Sign in
  </button>
  <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
    Install now
  </a>
</div>
```

### 3. Adicionar AccessSection (nova função, antes do export default ou função principal)
```tsx
function AccessSection() {
  return (
    <section id="access" className="section" style={{ background: 'var(--bg-card, #0f0f0f)' }}>
      <div className="container narrow" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Reveal>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
            Start saving today
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.1rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
            Free during friends beta. Install in 30 seconds.
          </p>
        </Reveal>
        <Reveal>
          <button
            onClick={loginWithGitHub}
            className="btn btn-primary"
            style={{ padding: '0.875rem 2.5rem', fontSize: '1.05rem', display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
        </Reveal>
        <Reveal>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1.25rem' }}>
            No credit card. No waitlist. We only read public GitHub metadata.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
```

### 4. Adicionar <AccessSection /> no render principal
Na função/componente que renderiza toda a página, adicionar `<AccessSection />` DEPOIS de `<ComparisonSection />`.

## VALIDAÇÃO
```bash
cd landing && npx tsc --noEmit 2>&1 | head -20
```
```

---

### MP-3: ONBOARDING-FIX

```
## TAREFA
Corrigir o bug de sequência de autenticação no onboarding e garantir que frugal_config é gravado.

## PROBLEMA
O onboarding tem 4 steps: 1 (hw/subs) → 2 (Connect GitHub via OAuth) → 3 (install) → 4 (config).
Quando o utilizador clica "Connect GitHub" no Step 2, é redirecionado para GitHub → Supabase → /auth/callback → /onboarding.
Nessa altura, o React state (hw, subs) foi perdido e o utilizador começa do Step 1 de novo.

Além disso, o saveProfile() no Step 3 não grava frugal_config nem email.

## FICHEIRO
landing/app/onboarding/page.tsx

## O QUE FAZER

### 1. Redesenhar para 3 steps (remover Step "Connect GitHub")
O utilizador chega ao onboarding JÁ autenticado (veio de /auth/callback).
O Step de "Connect GitHub" deixa de fazer sentido no onboarding.

Novo fluxo:
- Step 1: Hardware + Subscriptions
- Step 2: Install command
- Step 3: Personalized config + save

### 2. Actualizar saveProfile() para gravar email e frugal_config
```tsx
const saveProfile = async () => {
  setSaving(true);
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const { userId, email } = await res.json();  // NÃO usar accessToken do body — lê do cookie

    // Gerar config
    const config = generateFrugalConfig({
      hardware_tier: hw,
      subscriptions: subs.map(s => s.toLowerCase().replace(/\s+/g, '_')),
    });

    // Usar fetch directamente para o endpoint /api/profile com cookie auth
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        data: {
          id: userId,
          email,
          hardware_tier: hw,
          subscriptions: subs,
          frugal_config: config,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        }
      }),
    });
  } catch {
    // best-effort
  } finally {
    setSaving(false);
  }
};
```

### 3. Criar /api/profile POST endpoint
Adicionar método POST ao landing/app/api/profile/route.ts:
```ts
export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { userId, data } = await request.json();
  
  // Verify token matches userId
  const user = await getUser(accessToken);
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await upsertProfile(accessToken, { id: userId, ...data });
  return NextResponse.json({ ok: true });
}
```

### 4. Actualizar progress dots para 3 steps (não 4)

## VALIDAÇÃO
```bash
cd landing && npx tsc --noEmit 2>&1 | head -20
```
```

---

### MP-4: ADMIN-PAGE

```
## TAREFA
Criar página /admin para ver utilizadores registados.

## FICHEIROS A CRIAR
1. landing/app/admin/page.tsx
2. landing/app/api/admin/users/route.ts

## FICHEIRO 1: landing/app/admin/page.tsx
```tsx
'use client';

import { useEffect, useState } from 'react';

type Profile = {
  id: string;
  email?: string;
  hardware_tier?: string;
  subscriptions?: string | string[];
  install_completed?: boolean;
  install_completed_at?: string;
  frugal_version?: string;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => {
        if (r.status === 401 || r.status === 403) throw new Error('Access denied — admin only');
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then(data => { setProfiles(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: '2rem', fontFamily: 'monospace' }}>Loading...</div>;
  if (error) return <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#f87171' }}>{error}</div>;

  const installed = profiles.filter(p => p.install_completed).length;

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#0a0a0a', minHeight: '100vh', color: '#e5e5e5' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>frugal admin</h1>
      <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.9rem' }}>
        {profiles.length} users · {installed} installed · {profiles.length - installed} pending
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              {['email', 'hardware', 'subscriptions', 'installed', 'version', 'onboarded', 'joined'].map(h => (
                <th key={h} style={{ border: '1px solid #333', padding: '6px 12px', textAlign: 'left', background: '#111', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} style={{ background: p.install_completed ? '#0f1a0f' : 'transparent' }}>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.email ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.hardware_tier?.replace(/_/g, ' ') ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>
                  {Array.isArray(p.subscriptions) ? p.subscriptions.join(', ') : (p.subscriptions ?? '—')}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px', textAlign: 'center' }}>
                  {p.install_completed ? '✅' : '—'}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.frugal_version ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px', textAlign: 'center' }}>
                  {p.onboarding_completed ? '✓' : '—'}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.created_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## FICHEIRO 2: landing/app/api/admin/users/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/supabase';

const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await res.json());
}
```

## TAMBÉM: adicionar /admin ao middleware (proteger com auth)
Em landing/middleware.ts, adicionar '/admin' à lista protectedPaths:
```ts
const protectedPaths = ['/dashboard', '/onboarding', '/admin'];
```

## VALIDAÇÃO
```bash
cd landing && npx tsc --noEmit 2>&1 | head -20
```
```

---

### MP-5: SECURITY-FIX

```
## TAREFA
Corrigir 2 gaps de segurança nas API routes da landing.

## FIX 1 — landing/app/api/me/route.ts
PROBLEMA: o response expõe accessToken ao cliente JS — desnecessário e aumenta superfície de ataque.
REMOVER `accessToken` do NextResponse.json():
```ts
// ANTES:
return NextResponse.json({ userId: user.id, email: user.email, accessToken });

// DEPOIS:
return NextResponse.json({ userId: user.id, email: user.email });
```

## FIX 2 — landing/app/api/profile/route.ts (método GET)
PROBLEMA: aceita userId como query param sem verificar se é o user do token → qualquer user autenticado pode ler perfil alheio.
ADICIONAR verificação:
```ts
// Após obter user do token:
if (user.id !== userId) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
```

## VALIDAÇÃO
```bash
cd landing && npx tsc --noEmit 2>&1 | head -20
```
```

---

### MP-6: HUB-CONNECT

```
## TAREFA
Ligar inject_context.js ao hub-submit-events.js para que os eventos de routing comecem a fluir para o Cloudflare D1.

## FICHEIRO
tools/router/inject_context.js

## CONTEXTO
- hub-submit-events.js já existe em tools/router/
- O endpoint /submit-events no hub Cloudflare já está a funcionar (bearer auth com FRUGAL_SUBMIT_TOKEN)
- O token está em ~/.frugal/hub-token.txt (ou variável FRUGAL_HUB_TOKEN)
- inject_context.js já tem uma função logDecision() que escreve em decisions.log

## O QUE FAZER
Após a chamada a logDecision() em inject_context.js, adicionar uma chamada assíncrona best-effort a hub-submit-events.js.

A chamada deve:
1. Ser fire-and-forget (não bloquear o hook)
2. Usar spawnSync ou spawn assíncrono ao hub-submit-events.js com --batch flag para enviar o último evento
3. Silenciar todos os erros
4. Só correr se hub_push_enabled for true no settings (ou se a variável FRUGAL_HUB_PUSH=1 estiver set)

Verifica como hub-submit-events.js funciona antes de implementar.
Lê tools/router/inject_context.js e tools/router/hub-submit-events.js antes de começar.

## VALIDAÇÃO
Depois da alteração, verificar que:
1. node tools/router/hub-submit-events.js --dry-run não dá erro
2. inject_context.js --help ou --dry ainda funciona
3. Nenhum teste existente quebra: node --test tools/router/classify.test.js
```

---

## Resumo visual do que o Paulo precisa de fazer no browser

| # | Acção | URL |
|---|---|---|
| B1 | Criar GitHub OAuth App | https://github.com/settings/applications/new |
| B2 | Activar GitHub provider no Supabase | https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers |
| B3 | Deploy automático (git push → Vercel faz o resto) | — |

Tudo o resto é Claude Code.
