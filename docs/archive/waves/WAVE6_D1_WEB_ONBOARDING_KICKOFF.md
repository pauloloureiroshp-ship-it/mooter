# Wave 6 D1 — Web Onboarding Wizard (extend landing /dashboard)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.5.3-bash-badge-always-on` em dev. Working dir = `~/mooter`.
>
> **⚠️ LIÇÃO 4× consolidada**: Recon obrigatório PRIMEIRO. Landing já tem auth + dashboard + /api/me + /api/profile + /settings. NÃO assumir greenfield.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave6-d1-web-onboarding-wizard`. `--permission-mode bypassPermissions`.

**Missão Wave 6 D1**: estender landing com web onboarding wizard que prepara o user PARA instalar Mooter no terminal com config certa. 5 sub-features:

1. **`/onboarding` route** — multi-step wizard web (extend dashboard pattern)
2. **Hardware detection browser-side** — WebGPU API + navigator.* para GPU/RAM/OS class
3. **Subscription detection (self-report)** — radio buttons "Anthropic Max/Team/Enterprise/Free"
4. **Persona detection** — Solo Founder / Senior IC / OSS Maintainer / Other
5. **Onboarding state Supabase** — Phase D-style storage (NÃO toca hub/) · `onboarding_state` na `auth.users.user_metadata`

### Recon OBRIGATÓRIO

```bash
# Landing onboarding existe?
find landing/app -type d -name 'onboarding' 2>/dev/null
find landing/app -type d -name 'wizard' 2>/dev/null

# Padrão de routes existente
ls landing/app/\(app\)/

# Supabase metadata RPCs disponíveis?
grep -rn 'user_metadata\|update_user' landing/app/lib/supabase/ 2>/dev/null

# Componentes reutilizáveis (W4 A)
ls landing/components/

# Persona detection já existe (W3 D2 CLI)?
grep -rn 'persona' packages/cli/src/commands/init.ts 2>/dev/null
```

**Reporta findings ao Paulo antes de implementar** (lição 4×).

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost + adapter_selection + glyphs + schemas INTACTOS**
- ❌ **hub/ produção INTACTO** (não pode tocar deployed worker)
- ❌ **landing/ Phases A+B+C INTACTOS** — só ADICIONAR `/onboarding` route
- ❌ **NÃO armazenar PII no Supabase metadata** — só hardware class + persona + plan (anonymous)
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.6.0-web-onboarding**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: hardware detection "best-effort" disclosed · subscription "self-reported"

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma v0.5.3-bash-badge-always-on
git checkout -b wave6-d1-web-onboarding-wizard
```

## 3. Sub-feature 1 — `/onboarding` route

### 3.1 Estrutura

```
landing/app/(app)/onboarding/
├── page.tsx                    # entry, redirects to first incomplete step
├── _components/
│   ├── OnboardingShell.tsx     # progress indicator + nav
│   ├── HardwareStep.tsx
│   ├── SubscriptionStep.tsx
│   ├── PersonaStep.tsx
│   └── InstallStep.tsx (Wave 6 D2 — placeholder for now)
└── steps/
    ├── hardware/page.tsx
    ├── subscription/page.tsx
    └── persona/page.tsx
```

### 3.2 Behaviour

```
1. User loga (existing W4 B flow)
2. /dashboard checks if onboarding_complete = true
3. If not → redirect to /onboarding/hardware
4. Hardware step → SubscriptionStep → PersonaStep → InstallStep
5. Each step saves to Supabase user_metadata
6. After complete → redirect /dashboard with "✓ Setup complete"
```

### 3.3 Tests

- Onboarding shell renders progress
- Redirect logic from /dashboard if incomplete
- Skip if complete

## 4. Sub-feature 2 — Hardware detection browser-side

### 4.1 Behaviour

```tsx
async function detectHardware(): Promise<HardwareInfo> {
  const info: HardwareInfo = { method: 'browser-best-effort' };
  
  // GPU class via WebGPU
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      const adapterInfo = await adapter?.requestAdapterInfo?.();
      info.gpu_vendor = adapterInfo?.vendor;
      info.gpu_description = adapterInfo?.description;
      info.gpu_class = classifyGpuFromString(adapterInfo?.description ?? '');
    } catch {}
  }
  
  // RAM class via deviceMemory (heuristic)
  if ('deviceMemory' in navigator) {
    const gb = (navigator as any).deviceMemory;
    info.ram_class = gb < 8 ? 'low' : gb < 32 ? 'mid' : 'high';
  }
  
  // OS class via userAgent
  const ua = navigator.userAgent;
  info.os_class = ua.includes('Mac') ? 'darwin' : ua.includes('Linux') ? 'linux' : ua.includes('Windows') ? 'windows' : 'unknown';
  
  return info;
}

function classifyGpuFromString(desc: string): 'none' | 'integrated' | 'discrete' | 'high-end' {
  const lower = desc.toLowerCase();
  if (/rtx 4090|rtx 4080|h100|a100|m2 pro|m3 pro|m3 max|m2 max/i.test(lower)) return 'high-end';
  if (/rtx|gtx|radeon rx/i.test(lower)) return 'discrete';
  if (/intel|integrated|amd radeon graphics/i.test(lower)) return 'integrated';
  return 'none';
}
```

### 4.2 Display

```tsx
<div className="p-6 border border-[#3a3a3a] rounded">
  <h2>Hardware detection</h2>
  <p className="text-sm opacity-60">Best-effort browser-side · we never read precise model</p>
  
  {detecting && <p>Detecting...</p>}
  {info && (
    <ul>
      <li>GPU class: {info.gpu_class} {info.gpu_description && <em>({info.gpu_description})</em>}</li>
      <li>RAM class: {info.ram_class}</li>
      <li>OS: {info.os_class}</li>
    </ul>
  )}
  
  <p className="text-sm opacity-60 mt-4">
    ⓘ This is best-effort. CLI wizard does precise detection (mooter init).
  </p>
</div>
```

### 4.3 Tests

- WebGPU mock → returns gpu_class
- No WebGPU → fallback null + disclosure
- classifyGpuFromString edge cases

## 5. Sub-feature 3 — Subscription detection (self-report)

### 5.1 Behaviour

```tsx
<form>
  <h2>Anthropic plan</h2>
  <p className="text-sm opacity-60">Self-reported · helps us calibrate quota</p>
  
  <label><input type="radio" value="max" /> Max plan ($200/mo unlimited Opus)</label>
  <label><input type="radio" value="team" /> Team plan</label>
  <label><input type="radio" value="enterprise" /> Enterprise</label>
  <label><input type="radio" value="api-only" /> API only (pay-per-token)</label>
  <label><input type="radio" value="none" /> No Anthropic account</label>
</form>
```

### 5.2 Validation

- Required choice
- Saved to user_metadata.subscription_self_reported
- Used to recommend packs

### 5.3 Tests

- Form validation
- Save to Supabase metadata

## 6. Sub-feature 4 — Persona detection

### 6.1 Behaviour

Mirror do CLI persona (W3 D2 — 4 personas):

```tsx
<h2>What best describes you?</h2>
<RadioGroup>
  <Radio value="solo-founder">
    <h3>Solo Founder</h3>
    <p>Building products solo · pay own tokens · ROI matters</p>
  </Radio>
  <Radio value="senior-ic">
    <h3>Senior IC</h3>
    <p>FAANG engineer · company pays · want speed + control</p>
  </Radio>
  <Radio value="oss-maintainer">
    <h3>OSS Maintainer</h3>
    <p>Big repos · refactor heavy · Dynamic Workflows fan</p>
  </Radio>
  <Radio value="other">Other</Radio>
</RadioGroup>
```

### 6.2 Tests

- 4 options render
- Save persona to user_metadata
- Recommendations adjusted (placeholder — Wave 6 D2 uses it)

## 7. Sub-feature 5 — Onboarding state Supabase

### 7.1 Schema (Supabase user_metadata)

```json
{
  "user_metadata": {
    "onboarding_complete": true,
    "onboarding_completed_at_utc": "2026-05-31T18:00:00Z",
    "hardware_class": {
      "gpu_class": "high-end",
      "ram_class": "high",
      "os_class": "linux",
      "method": "browser-best-effort"
    },
    "subscription_self_reported": "max",
    "persona": "solo-founder",
    "install_token": "abc123..."  // for Wave 6 D2
  }
}
```

### 7.2 Implementação

`landing/app/(app)/onboarding/_lib/save_state.ts` (NEW):

```typescript
import { createClient } from '@/lib/supabase/server';

export async function saveOnboardingStep(step: string, data: any): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authed');
  
  const current = user.user_metadata ?? {};
  const updated = {
    ...current,
    [`onboarding_${step}`]: data,
    onboarding_last_updated_utc: new Date().toISOString()
  };
  
  if (step === 'complete') {
    updated.onboarding_complete = true;
    updated.onboarding_completed_at_utc = new Date().toISOString();
  }
  
  await supabase.auth.updateUser({ data: updated });
}
```

### 7.3 Tests

- saveOnboardingStep updates metadata
- Complete step sets flag
- No PII leak verified (hardware class, not model)

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev hub/                                         # VAZIO
git diff dev landing/middleware.ts                       # VAZIO
git diff dev landing/app/api/cli-token/route.ts          # VAZIO

# /onboarding existe
ls landing/app/\(app\)/onboarding/
```

## 9. Tests aggregate

- Pre-W6 D1: CLI 170, router 446, landing 11+
- W6 D1: +25 landing tests (shell 4 + hardware 5 + subscription 4 + persona 4 + state 4 + integration 4)
- Total: estimated ~36+ landing

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave6-d1-web-onboarding-wizard vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + glyphs INTACTOS
- schemas v1 INTACTOS
- hub/ NOT touched
- landing/ Phases A+B+C INTACTOS (só ADICIONA /onboarding)
- Hardware detection: best-effort + disclosure 'CLI does precise'
- NO PII no user_metadata (hardware CLASS only, não modelo)
- Subscription self-reported (não auto-detected)
- Persona aligned com CLI W3 D2 (4 personas)
- saveOnboardingStep gracefully handles auth fail
- Vocabulário GLOSSARY
- Sem git add -A, sem --no-verify
- Cost sanity: $0 (mocks)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave6-d1-web-onboarding-wizard
gh pr create --base dev --title "Wave 6 D1: Web Onboarding Wizard (/onboarding route + hardware + subscription + persona)" --body-file - <<'EOF'
## Summary
5 sub-features de web onboarding wizard:
- /onboarding multi-step route
- Hardware detection browser-side (best-effort, disclosed)
- Subscription self-reported (Max/Team/Enterprise/API/None)
- Persona detection (4 personas mirror W3 D2 CLI)
- Onboarding state em Supabase user_metadata (anonymous)

## Invariants
- classify.js byte-identical (P11) ✓
- hub/ NOT touched ✓
- landing/ Phases A+B+C INTACTOS ✓

## Honesty
- Hardware "best-effort browser-side" disclosed
- Subscription self-reported (não automatizado)
- NO PII metadata (CLASS only)

## Tests
- Landing +25
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next: Wave 6 D2
- Install token generation (Supabase RPC)
- Personalized install URL: curl mooter.ai/install/<token>
- Install script
EOF

sleep 30
gh pr merge $PR --squash --delete-branch
```

## 12. Closure D1

```bash
git checkout dev && git pull origin dev
cd landing && npm install 2>/dev/null; cd ..
npm test && npm run lint && npm run typecheck

git tag -a v0.6.0-web-onboarding -m "Wave 6 D1: Web Onboarding Wizard (/onboarding + hardware + subscription + persona + state)"
git push origin v0.6.0-web-onboarding
```

+ Notion + SYNC + memória.

## 13. Resumo final

```
✅ Wave 6 D1 — Web Onboarding Wizard COMPLETA
- Branch: wave6-d1-web-onboarding-wizard (merged)
- 5 sub-features: /onboarding · hardware · subscription · persona · state
- Tag: v0.6.0-web-onboarding
- landing/ A+B+C INTACTOS · hub/ NOT touched
- NO PII (hardware CLASS only)

⏸ Para. Wave 6 D2 (install URL personalizado + script) precisa novo kickoff.
```

=== END ===
