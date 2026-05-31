# Wave 6 D2 — Install URL Personalizado + Script

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.6.0-web-onboarding` em dev (W6 D1).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave6-d2-install-url`. `--permission-mode bypassPermissions`.

**Missão Wave 6 D2**: gerar `curl mooter.ai/install/<token> | bash` personalizado. 5 sub-features:

1. **Install token generation** — `mooter_install_tokens` table Supabase (RPC)
2. **`/install/[token]/route.ts`** — endpoint que retorna shell script personalizado
3. **Install script generator** — shell script com config pré-rellenada por persona/hardware
4. **CLI auto-config from token** — `mooter init --from-token=<token>` skip wizard se valid
5. **InstallStep onboarding** — UI no /onboarding/install com curl command + copy button

### Recon OBRIGATÓRIO

```bash
# Hub NOT touched — confirm
ls hub/

# Supabase migrations directory?
ls landing/supabase/migrations/ 2>/dev/null

# Existing install scripts?
find . -name 'install.sh' -not -path './node_modules/*' 2>/dev/null
```

## 1. Invariantes

- ❌ **classify.js byte-identical** (P11)
- ❌ **hub/ produção INTACTO** (token NÃO toca hub, usa Supabase)
- ❌ **landing/ Phases A+B+C+W6 D1 INTACTOS**
- ❌ **NÃO armazenar PII no token** (anonymous hardware class + persona)
- ❌ **Token expires 24h** (segurança)
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate**
- ✅ **Auto-merge para dev**
- ✅ **Tag v0.6.1-install-url**

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git checkout -b wave6-d2-install-url
```

## 3. Sub-feature 1 — Install token generation (Supabase RPC)

### 3.1 SQL migration

`landing/supabase/migrations/00X_install_tokens.sql` (NEW):

```sql
create table if not exists public.mooter_install_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  used_at timestamptz,
  config jsonb,
  constraint not_expired check (expires_at > created_at)
);

create index if not exists idx_install_tokens_user on public.mooter_install_tokens(user_id);

create or replace function public.create_install_token(
  p_config jsonb
) returns text
language plpgsql
security definer
as $$
declare
  v_token text;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  
  v_token := encode(gen_random_bytes(24), 'base64url');
  
  insert into public.mooter_install_tokens(token, user_id, config)
  values (v_token, v_user_id, p_config);
  
  return v_token;
end $$;
```

### 3.2 Tests

`landing/__tests__/install-token.test.ts`:
- create_install_token requires auth
- Token unique
- Expires after 24h (mock time)

## 4. Sub-feature 2 — `/install/[token]/route.ts`

### 4.1 Behaviour

```bash
curl https://mooter.ai/install/abc123xyz | bash
```

Returns shell script personalizado.

### 4.2 Implementação

`landing/app/install/[token]/route.ts` (NEW):

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return new NextResponse('# Invalid token\necho "Invalid install token"; exit 1', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  // Service-role to bypass RLS for token lookup
  const supabaseAdmin = createSupabaseAdmin();
  const { data: tokenRow } = await supabaseAdmin
    .from('mooter_install_tokens')
    .select('*')
    .eq('token', token)
    .single();
  
  if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) {
    return new NextResponse('# Token expired\necho "Install token expired. Get a new one at mooter.ai/onboarding"; exit 1', {
      status: 410,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  if (tokenRow.used_at) {
    return new NextResponse('# Token already used\necho "Install token already used"; exit 1', {
      status: 409,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  // Mark used
  await supabaseAdmin
    .from('mooter_install_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);
  
  const script = generateInstallScript(tokenRow.config);
  
  return new NextResponse(script, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
  });
}

function generateInstallScript(config: any): string {
  return `#!/usr/bin/env bash
# Mooter install script — generated 2026-XX-XX
# Personalized for: ${config.persona ?? 'general'} on ${config.os_class ?? 'linux'}
set -e

echo "🐮 Welcome to Mooter"
echo "  Pre-config: ${config.persona ?? 'general'} · ${config.subscription_self_reported ?? 'API'} plan · ${config.hardware_class?.gpu_class ?? 'unknown'} GPU"
echo

# Install (clone repo) — Wave 6 D2 baseline; production would use npm/curl release
cd "\${HOME}"
if [ -d mooter ]; then
  echo "ℹ Mooter directory exists. Updating..."
  cd mooter && git pull
else
  git clone https://github.com/pauloloureiroshp-ship-it/mooter.git
  cd mooter && npm install
fi

# Pre-seed config (skips wizard)
mkdir -p "\${HOME}/.mooter"
cat > "\${HOME}/.mooter/profile.json" <<JSON
{
  "persona": "${config.persona ?? 'other'}",
  "subscription_plan": "${config.subscription_self_reported ?? 'api-only'}",
  "hardware": ${JSON.stringify(config.hardware_class ?? {})},
  "pre_seeded_via_web": true,
  "pre_seeded_at_utc": "${new Date().toISOString()}"
}
JSON

echo
echo "✓ Mooter pre-config saved to ~/.mooter/profile.json"
echo "  Run \`mooter init --from-token=${config.token_id ?? '<token>'}\` to confirm + pull packs"
echo "  Or \`mooter init\` for interactive wizard (re-detects hardware)"
`;
}
```

### 4.3 Tests

- Invalid token → 400 with error script
- Expired token → 410
- Used token → 409
- Valid token → 200 with personalized script + marks used

## 5. Sub-feature 3 — Install script generator

(implementação acima — `generateInstallScript`)

### 5.1 Honesty

- Script é shell visível (não obfuscado)
- User pode `curl ... | less` antes de `| bash`
- Add note in onboarding UI: "Review the install script first: curl mooter.ai/install/<token> | less"

## 6. Sub-feature 4 — CLI auto-config from token

### 6.1 Behaviour

```bash
mooter init --from-token=abc123xyz
# Validates token via /api/install/validate
# If valid → reads pre-config + skips persona/subscription prompts
# Still confirms hardware (CLI does precise detection)
```

### 6.2 Implementação

`packages/cli/src/commands/init.ts` (W2.5 D2 + W2.6 D1 + W3 D2) — extend:

```typescript
export async function runInit(args: InitArgs): Promise<void> {
  if (args.fromToken) {
    const preConfig = await fetchPreConfigFromToken(args.fromToken);
    if (preConfig) {
      console.log('✓ Pre-config from web wizard loaded');
      args.skipPersona = true;
      args.skipSubscription = true;
      args.preFilledPersona = preConfig.persona;
      args.preFilledSubscription = preConfig.subscription_self_reported;
    }
  }
  
  // ... rest of init (W2.5 D2 + W3 D2 etc)
}

async function fetchPreConfigFromToken(token: string): Promise<any | null> {
  const url = `${process.env.MOOTER_LANDING_URL ?? 'https://mooter.ai'}/api/install/validate/${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

`landing/app/api/install/validate/[token]/route.ts` (NEW) — returns config (read-only, doesn't mark used).

## 7. Sub-feature 5 — InstallStep onboarding UI

### 7.1 UI

```tsx
<div className="p-6 border border-[#3a3a3a] rounded">
  <h2>Install Mooter</h2>
  <p className="mb-6 opacity-80">Run this in your terminal:</p>
  
  <div className="bg-[#1a1a1a] p-4 rounded font-mono text-sm mb-4">
    <code>curl https://mooter.ai/install/{token} | bash</code>
    <button onClick={copyToClipboard} className="ml-4 text-[#E8888A]">[copy]</button>
  </div>
  
  <p className="text-sm opacity-60 mb-4">
    ℹ Token expires in 24h · Review script first: curl ... | less
  </p>
  
  <div className="border border-[#3a3a3a] rounded p-4 mt-6">
    <p className="text-sm">Pre-config summary:</p>
    <ul className="text-sm opacity-80">
      <li>Persona: {state.persona}</li>
      <li>Subscription: {state.subscription_self_reported}</li>
      <li>Hardware: {state.hardware_class?.gpu_class} GPU · {state.hardware_class?.ram_class} RAM</li>
    </ul>
  </div>
</div>
```

### 7.2 Tests

- Copy button works
- Token visible in command
- Hardware class summary shown

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev hub/                                         # VAZIO
git diff dev landing/middleware.ts                       # VAZIO

# Install script generation is text-only (no real binary)
test -f landing/app/install/\[token\]/route.ts
```

## 9. Tests aggregate

- Pre-W6 D2: landing ~36 + CLI 170
- W6 D2: +20 (token RPC 4 + install route 6 + script gen 3 + CLI from-token 5 + UI 2)
- Total: ~56+ landing · 175 CLI

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave6-d2-install-url vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + schemas INTACTOS
- hub/ NOT touched
- landing/ Phases A+B+C+W6 D1 INTACTOS
- Token expires 24h enforced
- Used tokens cannot be reused (409)
- Script NÃO obfuscado (visible shell)
- NO PII no token config (hardware CLASS, persona, plan only)
- CLI --from-token: fetches read-only, doesn't mark used
- Vocabulário GLOSSARY
- Sem git add -A
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave6-d2-install-url
gh pr create --base dev --title "Wave 6 D2: Install URL Personalizado + Script (Supabase RPC tokens)" --body-file - <<'EOF'
## Summary
5 sub-features que activam curl mooter.ai/install/<token> | bash:
- Install token generation (Supabase RPC + 24h expiry)
- /install/[token] route returns personalized shell script
- Install script generator (visible shell, non-obfuscated)
- CLI mooter init --from-token (skip wizard if valid)
- InstallStep onboarding UI

## Invariants
- classify.js byte-identical (P11) ✓
- hub/ NOT touched (Supabase RPC, not worker) ✓
- landing/ A+B+C+W6 D1 INTACTOS ✓
- Token 24h expiry ✓
- Single-use enforced ✓

## Honesty
- Script visible (curl ... | less first)
- NO PII (anonymous hardware class)
- Pre-config summary shown in UI

## Tests
- Landing ~56 · CLI 175
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF

sleep 30
gh pr merge $PR --squash --delete-branch
```

## 12. Closure D2

```bash
git checkout dev && git pull origin dev
git tag -a v0.6.1-install-url -m "Wave 6 D2: Install URL Personalizado + Script"
git push origin v0.6.1-install-url
```

## 13. Resumo final

```
✅ Wave 6 D2 — Install URL Personalizado COMPLETA
- Branch: wave6-d2-install-url (merged)
- 5 sub-features: token RPC · install route · script gen · CLI --from-token · UI
- Tag: v0.6.1-install-url
- hub/ NOT touched
- 24h expiry + single-use enforced

⏸ Para. Sprint B (W6 D1 + D2) complete. Próximo: Sprint C (Admin panel) precisa novo kickoff.
```

=== END ===
