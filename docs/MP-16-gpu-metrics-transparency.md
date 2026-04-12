# MP-16 — GPU no Dashboard + Metrics Transparency

**Objectivo:** Dois problemas independentes num só MP.

1. **GPU + OS visível na área logada** — mostrar o nome real da GPU (ex: "RTX 4090") ao lado do OS e architecture em vez de só o tier abstracto ("gpu-high")
2. **Metrics Transparency** — deixar claro na UI o que cada número significa, de onde vem, e porquê os valores do VSCode / terminal / dashboard são diferentes por design

**Princípio:** Não inventar dados que não existem. Não tentar forçar números a bater — explicar honestamente porque diferem. Melhorar o que já está lá.

---

## CONTEXTO TÉCNICO (lê antes de implementar)

### Problema 1 — GPU: onde está o dado?

O `frugal-doctor.js` lê `hw-capability.json` (gerado pelo `gpu-probe.js`) que tem:
```json
{ "vendor": "NVIDIA", "name": "RTX 4090", "name_short": "RTX 4090", "vramMB": 24576, "hw_tier": "gpu-high" }
```

O `syncPayload` enviado para `/api/install-complete` só inclui `hw_tier: hwCap?.hw_tier` — **o nome da GPU não é enviado**.

A tabela `devices` tem `hw_tier TEXT` mas não tem `gpu_name TEXT`.

**Fix necessário:**
1. Adicionar `gpu_name` ao payload do `frugal-doctor --sync`
2. Adicionar `gpu_name TEXT` à tabela `devices` via migration
3. Mostrar no dashboard: `RTX 4090 · gpu-high · win32 · x64`

### Problema 2 — Porquê os números diferem (não é bug, é design)

| Fonte | Metodologia | O que conta | Unidade reportada |
|---|---|---|---|
| **VSCode plugin** | Tokens reais OAuth API | Todos os tokens enviados/recebidos à Anthropic | tokens reais + custo real USD |
| **savings-tracker.js** | Estimativa por comprimento de prompt | Prompts de utilizador filtrados (sem system prompts) | decisions + savings estimados |
| **Dashboard Supabase** | Recebe do savings-tracker via --sync | Igual ao savings-tracker | mesmo número, diferente timestamp |
| **decisions.log** | Log bruto | TODAS as linhas incl. system prompts, hooks | linhas totais (>= decisions) |

**Porque `decisions` ≠ `tokens VSCode`:**
- O frugal conta *decisões de routing* (1 por prompt de utilizador)
- O VSCode conta *tokens* (milhares por decisão)
- São métricas ortogonais — ambas correctas, nenhuma substitui a outra

**Porque `$72.83` (frugal) ≠ custo real VSCode:**
- O frugal calcula `saved = naive_opus_cost - real_cost_estimated`
- `naive_opus_cost` = quanto custaria SE tudo fosse Opus
- `real_cost_estimated` = estimativa do que realmente custou (sem tokens reais)
- O VSCode tem o custo real — o frugal tem a *poupança estimada*

---

## PEÇA 1 — Adicionar gpu_name ao sync payload

### 1a. Migration `004_devices_gpu_name.sql`

```sql
-- MP-16 PEÇA 1: adicionar gpu_name à tabela devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS gpu_name TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS gpu_vram_mb INTEGER;
```

Criar o ficheiro `landing/migrations/004_devices_gpu_name.sql` com este conteúdo.
**NÃO executar** — Paulo executa manualmente no Supabase SQL Editor.

### 1b. frugal-doctor.js — adicionar gpu_name ao syncPayload

No `syncPayload` (secção 10), adicionar após `hw_tier`:
```js
gpu_name: hwCap?.name_short || hwCap?.name || null,
gpu_vram_mb: hwCap?.vramMB || null,
```

### 1c. /api/install-complete/route.ts — aceitar gpu_name

Na interface `InstallPayload`, adicionar:
```ts
gpu_name?: string | null;
gpu_vram_mb?: number | null;
```

No upsertDevice, adicionar:
```ts
gpu_name: payload.gpu_name || null,
gpu_vram_mb: payload.gpu_vram_mb || null,
```

### 1d. Device interface no dashboard

Em `landing/app/(app)/dashboard/page.tsx`, na interface `Device`:
```ts
gpu_name?: string | null;
gpu_vram_mb?: number | null;
```

---

## PEÇA 2 — Mostrar GPU + OS na área logada

### 2a. Sidebar — badge de hardware

No `landing/app/(app)/layout.tsx`, no rodapé da sidebar (abaixo do email do utilizador), adicionar um badge de hardware do device mais recente.

O layout já faz fetch a `/api/me`. Precisa de um segundo fetch mínimo a `/api/profile?userId={userId}` para obter o device actual.

**Alternativa mais simples:** passar o hw_tier + gpu_name no response de `/api/me`.

Modificar `landing/app/api/me/route.ts` para incluir hardware info:
```ts
// Após getUser, fazer getProfile e getDevices
const profile = await getProfile(accessToken, user.id);
const devices = await getDevices(accessToken, user.id);
const latestDevice = devices?.[0] || null;

return NextResponse.json({
  userId: user.id,
  email: user.email,
  hw_tier: latestDevice?.hw_tier || profile?.hardware_tier || null,
  gpu_name: latestDevice?.gpu_name || null,
  os_type: latestDevice?.os_type || profile?.os_type || null,
  arch: latestDevice?.arch || null,
  frugal_version: latestDevice?.frugal_version || profile?.frugal_version || null,
});
```

### 2b. Sidebar — mostrar hardware badge

No layout.tsx, actualizar `ShellUser` interface:
```ts
interface ShellUser {
  email: string;
  is_admin: boolean;
  hw_tier: string | null;
  gpu_name: string | null;
  os_type: string | null;
  frugal_version: string | null;
}
```

No rodapé da sidebar, após o email e antes do Sign out, adicionar:
```tsx
{user.gpu_name && (
  <div style={{
    fontSize: '0.7rem',
    color: 'var(--muted)',
    fontFamily: 'var(--mono)',
    padding: '4px 0',
    borderTop: '1px solid var(--border)',
    marginTop: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }}>
    <span style={{ color: 'var(--accent)' }}>{user.gpu_name}</span>
    <span>{user.os_type} · {user.hw_tier}</span>
  </div>
)}
```

### 2c. Top bar — versão dinâmica

Substituir o `v0.9.8` hardcoded na top bar por:
```tsx
<span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
  {user.frugal_version ? `v${user.frugal_version}` : 'v—'}
</span>
```

### 2d. Dashboard Overview — hardware no Savings Hero

No tab Overview do dashboard, no Savings Hero, adicionar uma linha de contexto abaixo dos números principais:

```tsx
{/* Device context line */}
<div style={{
  fontSize: '0.75rem',
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  marginTop: 12,
  paddingTop: 12,
  borderTop: '1px solid rgba(78,201,176,0.15)',
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
}}>
  {devices[0]?.gpu_name && <span>🖥️ {devices[0].gpu_name}</span>}
  {devices[0]?.os_type && <span>{devices[0].os_type === 'win32' ? '🪟 Windows' : devices[0].os_type === 'darwin' ? '🍎 macOS' : '🐧 Linux'}</span>}
  {devices[0]?.hw_tier && <span>⚡ {devices[0].hw_tier}</span>}
  {devices[0]?.frugal_version && <span>frugal v{devices[0].frugal_version}</span>}
</div>
```

---

## PEÇA 3 — Metrics Transparency: tab "How it works"

### Adicionar 4ª tab ao dashboard: "Metrics"

Na lista de tabs do dashboard, adicionar `Metrics` como 4ª tab.

**Conteúdo da tab Metrics:**

```tsx
function MetricsTab({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const { decisionsCount, savingsUsd } = cfgVal(cfg);

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>How frugal measures savings</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          frugal tracks routing decisions, not tokens. Here's what each number means and why
          they may differ from what you see in VSCode or the Claude interface.
        </p>
      </div>

      {/* Source comparison table */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Where each number comes from
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            {
              source: 'frugal dashboard',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: `${decisionsCount} decisions · $${savingsUsd.toFixed(2)} saved`,
              how: 'Counts user prompts routed. Savings = (what Opus would cost) − (what frugal paid). Uses estimated token counts from prompt length.',
              why: 'Honest estimate. Not real tokens — real token counts require API access frugal doesn\'t have.'
            },
            {
              source: 'VSCode Claude plugin',
              badge: 'real',
              badgeColor: 'var(--t0)',
              what: '~3.7M tokens · real USD cost',
              how: 'Reads directly from Anthropic OAuth session. Counts every token sent and received, including system prompts and tool calls.',
              why: 'This is the ground truth for token usage. Higher than frugal\'s prompt count because it includes all context.'
            },
            {
              source: 'decisions.log (local)',
              badge: 'raw',
              badgeColor: 'var(--muted)',
              what: '645 lines (includes hooks + system prompts)',
              how: 'Raw log of every classify() call. Includes UserPromptSubmit hooks, PostToolUse hooks, and system messages.',
              why: 'More lines than "decisions" because frugal filters system prompts out before counting.'
            },
            {
              source: 'statusline (terminal)',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: 'Live savings % per session',
              how: 'Reads the same decisions.log. Shows per-session and cumulative savings with tier breakdown.',
              why: 'Same methodology as the dashboard — refreshes in real time as you work.'
            },
          ].map(row => (
            <div key={row.source} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: '8px 16px',
              alignItems: 'start',
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {row.source}
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 7px',
                  borderRadius: 100,
                  fontSize: '0.65rem',
                  fontFamily: 'var(--mono)',
                  background: `${row.badgeColor}22`,
                  color: row.badgeColor,
                  border: `1px solid ${row.badgeColor}44`,
                }}>
                  {row.badge}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
                  {row.what}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text)' }}>How: </strong>{row.how}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text)' }}>Why different: </strong>{row.why}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key insight callout */}
      <div style={{
        background: 'rgba(78,201,176,0.06)',
        border: '1px solid rgba(78,201,176,0.2)',
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
          💡 The number that matters
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          frugal's <strong style={{ color: 'var(--text)' }}>decisions count</strong> tells you how many times
          the router intervened. The <strong style={{ color: 'var(--text)' }}>savings estimate</strong> is a 
          lower bound — real savings are higher because frugal also reduces latency and context window usage.
          The VSCode token count is the ground truth for what Anthropic actually processed.
        </p>
      </div>

      {/* Glossary */}
      <div>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Glossary
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { term: 'decision', def: 'One user prompt that went through classify.js and was routed to a tier.' },
            { term: 'naive cost', def: 'What that decision would have cost if routed to Opus every time.' },
            { term: 'real cost (est.)', def: 'Estimated actual cost based on the tier it was routed to × avg token estimate.' },
            { term: 'saved (est.)', def: 'naive cost − real cost (est.). This is the $72.83 number.' },
            { term: 'guaranteed saved', def: 'Only Option A hits where Ollama answered directly instead of Opus. Conservative floor.' },
            { term: 'savings %', def: 'saved / naive × 100. 68% means frugal spent 32% of what pure-Opus would cost.' },
          ].map(({ term, def }) => (
            <div key={term} style={{ display: 'flex', gap: 12, fontSize: '0.8rem' }}>
              <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', minWidth: 140, flexShrink: 0 }}>{term}</code>
              <span style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{def}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
```

---

## PEÇA 4 — Commit e execução da migration

### 4a. Verificar que o script de auditoria corre após as mudanças

Após implementar, correr:
```bash
npx tsc --noEmit
```

### 4b. Commit

```
feat(ui): GPU name in sidebar + metrics transparency tab (MP-16)
```

### 4c. Migration para executar manualmente

Paulo executa `landing/migrations/004_devices_gpu_name.sql` no Supabase SQL Editor depois do deploy.

Depois: `node tools/router/frugal-doctor.js --sync` para popular os novos campos `gpu_name` e `gpu_vram_mb`.

---

## ORDEM DE EXECUÇÃO

```
PEÇA 1 (migration + frugal-doctor + API) → PEÇA 2 (UI sidebar + dashboard) → PEÇA 3 (tab Metrics) → PEÇA 4 (tsc + commit)
```

## RESTRIÇÕES

1. NÃO executar a migration — só criar o ficheiro SQL
2. NÃO mudar a metodologia de cálculo do savings-tracker — só documentar
3. NÃO remover nenhum campo existente das interfaces
4. O texto da tab Metrics deve usar os valores reais do profile (decisionsCount, savingsUsd) — não hardcoded
5. Zero dependências novas
