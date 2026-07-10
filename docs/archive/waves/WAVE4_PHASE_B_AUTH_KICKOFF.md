# Wave 4 Phase B — Auth (Supabase + landing/ + CLI login)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.3.2-sync-stub` em dev (W3 D3). Working dir = `~/mooter`. **Supabase project NÃO precisa existir ainda** — CC implementa código offline-testable; Paulo configura Supabase depois (instruções no fim).
>
> **O que faz**: 5 sub-features que ligam o terminal Mooter à área logada do mooter.ai via auth Supabase + `mooter login` CLI command. ZERO break do landing existente (Wave 4 Phase A).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave4-phase-b-auth` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 4 Phase B**: shippar 5 sub-features que estabelecem auth user-facing + ligação CLI↔web:

1. **Supabase client setup** — `landing/lib/supabase/` client + server helpers + `.env.example`
2. **Sign in / Sign up pages** — `landing/app/auth/sign-in/page.tsx` + `sign-up/page.tsx` (Google OAuth + email magic link)
3. **Session middleware** — `landing/middleware.ts` protege `/dashboard/*`, redirect para `/auth/sign-in`
4. **`mooter login` CLI** — comando que gera device code + abre browser + recebe token + grava em `~/.mooter/auth.json` (PKCE-style)
5. **Dashboard stub** — `landing/app/dashboard/page.tsx` mostra "Welcome {user.email}" + status `mooter login` (stub para Phase C)

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js critical phrases preserved** (W3 D1)
- ❌ **mooter_event + sync_event schemas INTACTOS** (W2 D4 + W3 D3)
- ❌ **landing/ Wave 4 Phase A INTACTO** — apenas adicionar paths novos (`/auth/*` + `/dashboard/*`)
- ❌ **NÃO commitar `.env.local`** — só `.env.example` + `.gitignore` cover
- ❌ **NÃO armazenar API key em código** — só env vars
- ❌ **NÃO fazer chamadas HTTPS reais em testes** — mocks
- ❌ **NÃO arrancar Supabase project** — Paulo faz setup manual (instruções §13)
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.4.0-auth**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos · login flow user-facing)
- ✅ **Honesty**: dashboard stub mostra claramente "Phase C ships full dashboard"

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma 873c029 + tag v0.3.2-sync-stub
git tag -l | grep v0.3.
git checkout -b wave4-phase-b-auth
```

Recon:
- `landing/app/` — confirma routes existentes (Wave 4 Phase A)
- `landing/package.json` — adicionar `@supabase/ssr` + `@supabase/supabase-js`
- `landing/middleware.ts` — confirma se existe (se sim, EXTEND não substitui)
- `packages/cli/src/commands/` — onde adicionar `login.ts`
- `~/.mooter/` schemas existentes (consent, profile, credentials)

## 3. Sub-feature 1 — Supabase client setup

### 3.1 Install deps

```bash
cd landing
npm install @supabase/ssr @supabase/supabase-js
```

### 3.2 Client helpers

`landing/lib/supabase/client.ts` (NEW) — browser client:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`landing/lib/supabase/server.ts` (NEW) — server client (RSC + middleware):
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        }
      }
    }
  );
}
```

### 3.3 Env vars

`landing/.env.example` (NEW or extend):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...    # server-side only, NUNCA expose
MOOTER_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
```

`landing/.gitignore` (extend):
```
.env.local
.env*.local
```

### 3.4 Tests

`landing/lib/supabase/__tests__/client.test.ts`:
- createClient retorna válido
- Env vars validation throws claramente se ausentes

## 4. Sub-feature 2 — Sign in / Sign up pages

### 4.1 Routes

- `landing/app/auth/sign-in/page.tsx` — login
- `landing/app/auth/sign-up/page.tsx` — registo
- `landing/app/auth/callback/route.ts` — OAuth callback handler
- `landing/app/auth/sign-out/route.ts` — logout

### 4.2 UI sign-in (consistent com landing dark theme)

```tsx
// landing/app/auth/sign-in/page.tsx
'use client';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  
  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` }
    });
  }
  
  async function signInWithEmail() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` }
    });
    setLoading(false);
    alert('Check your email for a magic link.');
  }
  
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0B0A09] text-[#F2EDE6]">
      <div className="w-full max-w-md p-8 border border-[#3a3a3a] rounded">
        <h1 className="text-3xl mb-6">🐮 Welcome to Mooter</h1>
        <p className="mb-6 opacity-80">Sign in to access your hub and sync settings.</p>
        
        <button onClick={signInWithGoogle} className="w-full mb-4 py-3 bg-[#E8888A] text-[#0B0A09] rounded">
          Continue with Google
        </button>
        
        <div className="my-6 text-center opacity-60">or</div>
        
        <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
               className="w-full mb-4 py-3 px-4 bg-transparent border border-[#3a3a3a] rounded" />
        <button onClick={signInWithEmail} disabled={loading || !email} className="w-full py-3 border border-[#F2EDE6] rounded">
          {loading ? 'Sending...' : 'Send magic link'}
        </button>
        
        <p className="mt-8 text-sm opacity-60 text-center">
          New here? <a href="/auth/sign-up" className="underline">Create account</a>
        </p>
      </div>
    </main>
  );
}
```

### 4.3 Callback handler

`landing/app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${req.nextUrl.origin}${next}`);
    }
  }
  
  return NextResponse.redirect(`${req.nextUrl.origin}/auth/sign-in?error=callback_failed`);
}
```

### 4.4 Tests

`landing/app/auth/__tests__/sign-in.test.tsx`:
- Sign-in page renders Google button + email input
- Magic link clicks supabase.signInWithOtp
- Callback handler exchanges code (mocked) → redirects /dashboard

## 5. Sub-feature 3 — Session middleware

### 5.1 Middleware

`landing/middleware.ts` (NEW or extend):
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: req });
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        }
      }
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  const isProtected = req.nextUrl.pathname.startsWith('/dashboard');
  
  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/sign-in';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  
  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
};
```

### 5.2 Tests

`landing/__tests__/middleware.test.ts`:
- `/dashboard` sem session → redirect `/auth/sign-in?next=/dashboard`
- `/` (landing public) → passa
- `/dashboard` com session → passa

## 6. Sub-feature 4 — `mooter login` CLI

### 6.1 Behaviour

```
$ mooter login
🐮 Mooter login
   Opening browser at https://mooter.ai/auth/cli?device_code=ABCD-EFGH
   Or visit manually and paste this code: ABCD-EFGH

Waiting for authorization... (Ctrl+C to cancel)

✓ Authorized as paulo@example.com
✓ Token saved to ~/.mooter/auth.json (mode 0600)
✓ Hub remote sync enabled (was: dry-run only)

Run `mooter hub` to see your authenticated view.
```

### 6.2 Implementação

`packages/cli/src/commands/login.ts` (NEW):

```typescript
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export async function runLogin(args: { manual?: boolean; landingUrl?: string }): Promise<void> {
  const landingUrl = args.landingUrl ?? process.env.MOOTER_LANDING_URL ?? 'https://mooter.ai';
  const deviceCode = generateDeviceCode();  // e.g., "ABCD-EFGH"
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createChallenge(verifier);  // PKCE
  
  const authUrl = `${landingUrl}/auth/cli?device_code=${deviceCode}&challenge=${challenge}`;
  
  console.log('🐮 Mooter login');
  console.log(`   Visit: ${authUrl}`);
  console.log(`   Or paste code: ${deviceCode}\n`);
  
  if (!args.manual) {
    try { await openBrowser(authUrl); } catch { /* fallback to manual */ }
  }
  
  console.log('Waiting for authorization... (Ctrl+C to cancel)\n');
  
  const token = await pollForToken(landingUrl, deviceCode, verifier);
  
  const authPath = join(homedir(), '.mooter', 'auth.json');
  await mkdir(join(homedir(), '.mooter'), { recursive: true });
  await writeFile(authPath, JSON.stringify({
    user_email: token.email,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
    saved_at: new Date().toISOString()
  }, null, 2), { mode: 0o600 });
  
  console.log(`✓ Authorized as ${token.email}`);
  console.log(`✓ Token saved to ${authPath} (mode 0600)`);
}

async function pollForToken(landingUrl: string, deviceCode: string, verifier: string): Promise<any> {
  // Polls landing/api/auth/cli/poll with device_code + verifier
  // landing endpoint (Phase B server stub): retorna 'pending' até user authorize, depois retorna token
  // ... implementation with timeout 5min
}
```

### 6.3 Landing API endpoint para device code

`landing/app/api/auth/cli/poll/route.ts` (NEW):
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { device_code, verifier } = await req.json();
  
  // Lookup device_code in Supabase 'mooter_cli_codes' table (Paulo cria schema manual — §13)
  // Se code authorized → retorna token; else retorna { status: 'pending' }
  // ... implementation
}
```

`landing/app/auth/cli/page.tsx` (NEW) — UI onde user vê device code + autoriza:
```tsx
// "/auth/cli?device_code=ABCD-EFGH" → mostra "CLI Login Request"
// User logged in autoriza → marca device code como ready → CLI poll receives token
```

### 6.4 Tests

`packages/cli/tests/login.test.ts`:
- Device code generation determinístico (seed-able)
- Mock landing API → returns token
- Token escrito com mode 0600
- `mooter logout` apaga auth.json

## 7. Sub-feature 5 — Dashboard stub

### 7.1 Route

`landing/app/dashboard/page.tsx` (NEW):
```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) redirect('/auth/sign-in');
  
  return (
    <main className="min-h-screen bg-[#0B0A09] text-[#F2EDE6] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl mb-2">🐮 Welcome, {user.email}</h1>
        <p className="opacity-60 mb-8">Your Mooter dashboard</p>
        
        <section className="border border-[#3a3a3a] rounded p-6 mb-6">
          <h2 className="text-xl mb-4">CLI status</h2>
          <p className="opacity-80">
            To connect this account to your terminal, run:
          </p>
          <code className="block mt-3 p-3 bg-[#1a1a1a] rounded">mooter login</code>
        </section>
        
        <section className="border border-[#3a3a3a] rounded p-6 mb-6 opacity-60">
          <h2 className="text-xl mb-4">Hub overview</h2>
          <p className="text-sm">Full hub UI ships in Phase C (cloud dashboard).</p>
          <p className="text-sm mt-2">For now, use the local hub: <code>mooter hub</code></p>
        </section>
        
        <section className="text-sm opacity-60">
          <a href="/auth/sign-out" className="underline">Sign out</a>
        </section>
      </div>
    </main>
  );
}
```

### 7.2 Tests

`landing/app/dashboard/__tests__/dashboard.test.tsx`:
- Renders email do user
- Redirect se sem session
- Mostra "Full hub UI ships in Phase C" (honesty)
- "mooter login" code visible

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases intactas
git diff dev packages/router/src/types.ts                 # schemas intactos
ls landing/app/auth landing/app/dashboard                 # rotas existem
grep -rn 'NEXT_PUBLIC_SUPABASE' landing/ --include='*.ts' --include='*.tsx'  # só env vars, sem hardcode
```

## 9. Tests aggregate

- Pre-W4 B: CLI 130 (W3 D3) · landing tests (unknown — confirm)
- W4 B: +30 (supabase client 3 + sign-in 6 + middleware 4 + login CLI 8 + dashboard 4 + integration 5)
- Total: ~160 verdes

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave4-phase-b-auth vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11)
- safety_boost.js critical phrases preserved
- mooter_event + sync_event schemas INTACTOS
- landing/app/page.tsx + Wave 4 Phase A pages INTACTOS (não tocados)
- .env.example com TODAS as 4 vars (URL + ANON + SERVICE_ROLE + REDIRECT)
- .env.local NÃO commitado (verificar .gitignore + git status)
- Supabase keys NUNCA hardcoded (só process.env)
- SUPABASE_SERVICE_ROLE_KEY só usado server-side (não NEXT_PUBLIC_)
- Middleware protege /dashboard/* · redirect com next param
- mooter login: device code + PKCE flow · token mode 0600 · landing endpoint stub
- Dashboard stub honestidade: 'Phase C ships full hub UI' visível
- ~160 tests verdes (130 + 30 novos)
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify
- Cost sanity: $0 (mocks)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave4-phase-b-auth
PR=$(gh pr create --base dev --title "Wave 4 Phase B: Auth (Supabase + mooter login CLI + dashboard stub)" --body-file - <<'EOF'
## Summary
5 sub-features para auth user-facing + ligação CLI↔web:
- Supabase client (browser + server helpers + .env.example)
- Sign in/Sign up pages (Google OAuth + email magic link)
- Session middleware (protege /dashboard/*)
- `mooter login` CLI (device code + PKCE → ~/.mooter/auth.json mode 0600)
- Dashboard stub (/dashboard com "Welcome {email}" + CLI status)

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost.js critical phrases preserved ✓
- mooter_event + sync_event schemas INTACTOS ✓
- landing/ Wave 4 Phase A INTACTO (só adicionar paths)
- ZERO API keys hardcoded ✓

## Honesty
- Dashboard stub declara "Phase C ships full hub UI"
- mooter login mostra device code visivelmente (não silent)
- Token escrito mode 0600 (user-only readable)
- SUPABASE_SERVICE_ROLE_KEY server-only (não NEXT_PUBLIC_)

## Tests
- CLI: 130 → 160 (+30)
- Sanity cost: $0 (mocks)

## ⚠ Manual setup required (Paulo)
Após merge, Paulo precisa configurar Supabase project:
1. Cria projecto em supabase.com
2. Activa providers: Google OAuth + Email Magic Link
3. Cria tabela `mooter_cli_codes` para device code flow
4. Define env vars `.env.local` (template em `.env.example`)
5. Adiciona redirect URLs: `http://localhost:3000/auth/callback` + `https://mooter.ai/auth/callback`

Detalhes completos: docs/strategy/WAVE4_PHASE_B_SUPABASE_SETUP.md (criado neste PR)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next
- Phase C: dashboard cloud (mostra hub remoto, sync history, settings)
- Phase D: CF Workers backend (recebe sync events do D3)
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure Phase B

```bash
git checkout dev && git pull origin dev
cd landing && npm install && cd ..
npm test && npm run lint && npm run typecheck

# Smoke
mooter login --help  # confirma CLI command
ls landing/app/auth landing/app/dashboard

# Tag
git tag -a v0.4.0-auth -m "Wave 4 Phase B: Auth (Supabase + mooter login CLI + dashboard stub) — manual Supabase setup pending"
git push origin v0.4.0-auth
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave4_phaseB_shipped.md`.

## 13. Documento manual setup (Paulo)

`docs/strategy/WAVE4_PHASE_B_SUPABASE_SETUP.md` (NEW) — instruções detalhadas para Paulo:

```markdown
# Wave 4 Phase B — Supabase setup manual

## 1. Criar projecto Supabase
1. Vai a https://supabase.com → New project
2. Nome: "mooter-auth"
3. Region: closest to Paulo (eu-west)
4. DB password: generate strong, save in 1Password

## 2. Activar auth providers
- Authentication → Providers
- Google: enable, add OAuth credentials (criar em console.cloud.google.com)
- Email: enable, "Confirm email" ON, "Enable email confirmations" ON

## 3. Redirect URLs
Authentication → URL Configuration:
- Site URL: https://mooter.ai
- Redirect URLs:
  - http://localhost:3000/auth/callback
  - https://mooter.ai/auth/callback

## 4. Tabela mooter_cli_codes
SQL Editor → New query:
```sql
create table mooter_cli_codes (
  device_code text primary key,
  challenge text not null,
  authorized boolean default false,
  user_id uuid references auth.users,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '5 minutes')
);
create index on mooter_cli_codes(created_at);
```

## 5. Env vars
`landing/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
MOOTER_AUTH_REDIRECT_URL=https://mooter.ai/auth/callback
```

## 6. Verify
- `npm run dev` no `landing/`
- Visit http://localhost:3000/auth/sign-in
- Sign in with Google → redirect to /dashboard
```

## 14. Resumo final

```
✅ Wave 4 Phase B — Auth COMPLETA
- Branch: wave4-phase-b-auth (merged)
- 5 sub-features: supabase client · sign-in/up pages · middleware · mooter login · dashboard stub
- Tests: ~160 verdes (CLI + landing)
- Tag: v0.4.0-auth
- P11 + safety_boost + schemas invariants: ✅
- landing/ Phase A INTACTO

⚠ Setup manual Supabase pendente (Paulo):
   Ler docs/strategy/WAVE4_PHASE_B_SUPABASE_SETUP.md

⏸ Para. Próximo: Wave 4 Phase C (dashboard cloud) OU Phase D (CF Workers backend).
```

=== END ===
