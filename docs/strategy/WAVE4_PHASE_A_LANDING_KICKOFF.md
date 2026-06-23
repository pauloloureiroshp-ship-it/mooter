# Wave 4 Phase A — Landing rebuild · master prompt

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/` (WSL2 Ubuntu). Branch isolada `wave4-landing-impl` — NÃO toca `dev` (Wave 2 owns dev).
>
> **Refinado de**: master prompt do Claude Design + análise crítica do Cowork (schema Wave 2 D4 enforced · invariants mooter explícitos · scope só landing public · dark theme migration).

**Pré-requisitos verificados antes de colar**:
- ✅ Dark theme migration acordado (Paulo decidiu 2026-05-28)
- ✅ Canvas Claude Design aberto e navegável (`Mooter v1 P0 Canvas.html`)
- ✅ Source files acessíveis: `colors_and_type.css`, `mooter-v1-shared.jsx`, `mooter-v1-iter1.jsx`
- ✅ `claude --version` ≥ versão usada Day 3 Wave 2
- ✅ Branch `wave4-landing-impl` ainda não existe (Claude Code vai criar)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, vais criar branch **`wave4-landing-impl`** a partir de `dev`. `--permission-mode auto`. NÃO mergeas para `dev` directamente — Wave 2 ainda está activa em `dev`, vais abrir PR e esperar review.

Acesso:
- `~/mooter/` (target)
- Anthropic Max sub
- GitHub repo `pauloloureiroshp-ship-it/mooter`
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
- Design canvas: `Mooter v1 P0 Canvas.html` (open in browser para referência)
- Source files do Claude Design: ver §2 abaixo

**Missão Phase A**: rebuild `landing/` com novo design **dark theme** + 8 marketing pages + tokens + dark migration de `globals.css`. Auth + onboarding + app (logged-in) NÃO fazem parte desta Phase — ficam B+C.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca tocar `tools/router/*`** — Wave 2 owns
- ❌ **Nunca tocar `packages/router/*`** — Wave 2 owns
- ❌ **Nunca tocar `packs/*`** — Wave 2 owns
- ❌ **Nunca tocar `dashboard/`** — fica Phase C
- ❌ **Nunca tocar `landing/app/(app)/*`** — fica Phase C
- ❌ **Nunca tocar `landing/app/auth/*`, `landing/app/onboarding/*`** — ficam Phase B
- ❌ **Nunca tocar `landing/app/api/*`** — fica Phase D
- ❌ **Nunca `git add -A`** — commits selectivos por área (componentes, pages, tokens, etc)
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **Não criar endpoints `/api/*`** nesta Phase — usa fetches mockados com fallback
- ❌ **Não fazer migrations Supabase** nesta Phase — fica Phase B
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR (Task tool, Opus pinned)
- ✅ **Sanity cost $1 BLOCKER** — esta Phase é maioritariamente UI, esperado $0.10-0.30 max
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update
- ✅ **Schema `mooter_event` segue versão Wave 2 D4 canónico** (ver §6 abaixo) — NÃO o schema simplificado do design

## 2. Design surface — onde está

**Canvas (clickable prototype, multi-page)**: open `Mooter v1 P0 Canvas.html` na browser. Navega clicando nos botões — cada artboard tem nav real. Lê todas as 8 pages marketing antes de tocar em código.

**Source files (use estes verbatim para componentes)**:
- `colors_and_type.css` — tokens design system (paste em `globals.css` no @theme block)
- `mooter-v1-shared.jsx` — primitives: `MooterMark`, `PastorCrook`, `CrookSolid/Outline/Animated/WithCow`, `TierChip`, `MonoNum`, `Eyebrow`, `TerminalCard`, `StatuslineCard`, `ProgressBar`, `NavBar`, `Btn`, `Card`, `ProviderLogo`, `LockChip`, `MooHerd`
- `mooter-v1-iter1.jsx` — **CANONICAL versions** (V2/iter1) — usar estas, NÃO as v1 em `mooter-v1-marketing.jsx`:
  - `HeroV2Artboard`
  - `UnderHoodArtboard`
  - `CompareArtboard`
  - `PrivacyArtboard`
  - `FooterArtboard`
  - `CrookSheetArtboard`
  - `MethodologyV2Artboard`
  - `SitemapArtboard`

**Quando vires dois nomes (Hero / HeroV2, Methodology / MethodologyV2) usa SEMPRE o V2** — v1 está em `mooter-v1-marketing.jsx` mas é deprecated.

## 3. Branch + setup

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma que Wave 2 está activa
git checkout -b wave4-landing-impl  # branch isolada
```

Confirma estado:
```bash
ls -la landing/app/
cat landing/app/layout.tsx | head -20  # vê estado actual (light theme)
cat landing/app/globals.css | head -30   # vê tokens actuais
```

## 4. Phase A — tasks em sequência

### A0 — Dark theme migration (pre-requisite)

**Ficheiro**: `landing/app/globals.css`

Replace tokens actuais por tokens do design (paste verbatim de `colors_and_type.css`):

```css
@theme {
  /* Background — warm near-black, NEVER #000 */
  --color-bg: #0B0A09;
  --color-bg-2: #0F0E0C;
  --color-surface: #141311;
  --color-surface-2: #1C1A17;
  --color-border: #252220;
  --color-border-light: #302C28;

  /* Text — warm off-white, NEVER #FFF */
  --color-text: #F2EDE6;
  --color-muted: #7A7168;
  --color-faint: #2A2622;

  /* Accent — cow-muzzle pink */
  --color-accent: #E8888A;
  --color-accent-2: #F2A5A5;
  --color-accent-08: rgba(232,136,138,0.08);
  --color-accent-25: rgba(232,136,138,0.25);

  /* Functional */
  --color-green: #4CAF6A;
  --color-yellow: #D4C090;

  /* Tier colors (web — note T2 differs in terminal) */
  --color-tier-0: #4CAF6A;
  --color-tier-1: #5A9BD4;
  --color-tier-2: #A88BD4;
  --color-tier-3: #D46A5A;

  /* Terminal mockups (in-page TTY) */
  --color-term-bg: #0d1117;
  --color-term-border: #30363d;
  --color-term-header: #161b22;
  --color-term-fg: #c9d1d9;
  --color-term-dim: #8b949e;

  /* Fonts (já presentes via next/font/google) */
  --font-sans: var(--font-space-grotesk);
  --font-mono: var(--font-jetbrains-mono);
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  /* 2% opacity SVG noise — terminal vibe */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><filter id='n'><feTurbulence baseFrequency='0.9'/><feColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.93 0 0 0 0 0.9 0 0 0 0.02 0'/></filter><rect width='100' height='100' filter='url(%23n)'/></svg>");
  background-size: 200px 200px;
}

/* Mono numbers — sempre tabular */
.num, code {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/* Aggressive heading letter-spacing */
h1 { letter-spacing: -0.04em; }
h2 { letter-spacing: -0.03em; }
h3 { letter-spacing: -0.02em; }
```

**Ficheiro**: `landing/app/layout.tsx`

Update metadata `themeColor: '#0B0A09'`. Mantém font config existente (Space Grotesk + JetBrains Mono já lá).

### A1 — Hero (replace `landing/app/page.tsx`)

Substitui o landing actual (light) pelo `HeroV2Artboard` (dark, "Got Moo?" em 168pt, terminal demo + 3-line statusline + community pulse strip).

**Preserva**:
- Lógica do terminal animation (rotação de cenas T0/T1/T2/T3)
- `MooterMark` SVG (cow ears, refine se necessário mas mantém identity)
- GitHub OAuth via Supabase (não tocar mas garante que o botão "Sign in" continua a chamar `loginWithGitHub()`)

**Adiciona**:
- "Got Moo?" 168pt, `?` em rose (#E8888A)
- 3-line statusline (substitui 6-row TTY antigo) — ver §6 para format exacto
- Lock chip `🔒 your code stays local` no top-right da terminal frame
- Community pulse strip 4 numbers (com graceful fallback — ver §5)

### A2 — 7 novas rotas `(marketing)`

Cria App Router group `(marketing)` com layout partilhado (NavBar + Footer):

```
landing/app/(marketing)/
├── layout.tsx                    # NavBar + outlet + Footer
├── under-the-hood/page.tsx       # Quantization + LoRA explainers
├── packs/page.tsx                # Gallery + filter sidebar
├── packs/[id]/page.tsx           # Pack detail (manifest viewer)
├── compare/page.tsx              # Comparison table 5-col × 15-feature
├── methodology/page.tsx          # Cost calculator + benchmark proof
├── privacy/page.tsx              # 4 cards + compliance card
└── install/page.tsx              # One-command install moment
```

Cada page importa o artboard correspondente de `mooter-v1-iter1.jsx`:
- `under-the-hood` → `UnderHoodArtboard`
- `packs` → `PackBrowser` (de `mooter-v1-marketing.jsx`, ainda válido em Phase 1.5)
- `packs/[id]` → infer from card (não existe artboard, criar baseado em manifest schema do pack.yaml)
- `compare` → `CompareArtboard`
- `methodology` → `MethodologyV2Artboard`
- `privacy` → `PrivacyArtboard`
- `install` → `Install` (de `mooter-v1-marketing.jsx`)

### A3 — Shared layout `(marketing)/layout.tsx`

```tsx
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export default function MarketingLayout({ children }) {
  return (
    <>
      <NavBar />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

`Footer` = 3-tier do `FooterArtboard`:
- Tier 1: "Got Moo?" 96pt sign-off + 2 CTAs
- Tier 2: 4-column links (Product / Resources / Community / Legal)
- Tier 3: copyright + socials

⚠️ "Got Moo?" footer (96pt) **menor** que hero (168pt) — hierarchy preservada.

### A4 — Community pulse com graceful fallback

Hero strip mostra 4 numbers. Endpoint `/api/community/pulse` ainda não existe (Phase D cria).

**Implementação Phase A**:
```tsx
// landing/app/(marketing)/_components/CommunityPulse.tsx
async function fetchPulse() {
  try {
    const r = await fetch("/api/community/pulse", { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.prompts_routed == null) return null;  // k-anon < 50
    return data;
  } catch {
    return null;
  }
}

export async function CommunityPulse() {
  const data = await fetchPulse();
  if (!data) {
    return <PulseStripPlaceholder text="growing — be one of the first" />;
  }
  return <PulseStripLive data={data} />;
}
```

Se `/api/community/pulse` não responde ou retorna null → mostra "growing — be one of the first 50" friendly placeholder. Nunca mente com numbers.

### A5 — Methodology calculator (client-only)

Component em `landing/app/(marketing)/methodology/page.tsx` baseado em `MethodologyV2Artboard`.

Formula client-only (sem backend):
```ts
// landing/lib/cost-calculator.ts
type Hardware = 'none' | '8gb' | '16gb' | '24gb_plus';
type Os = 'macos' | 'linux' | 'windows';
type Sub = { provider: string; tier: string };

const OPUS_AVG_COST = 0.042;  // per prompt baseline

const TIER_COSTS = { T0: 0, T1: 0.001, T2: 0.003, T3: 0.042 };

const TIER_DISTRIBUTION_BY_GPU: Record<Hardware, [number, number, number, number]> = {
  none:        [0,    0.50, 0.35, 0.15],
  '8gb':       [0.35, 0.25, 0.25, 0.15],
  '16gb':      [0.50, 0.22, 0.18, 0.10],
  '24gb_plus': [0.62, 0.18, 0.14, 0.06],
};

export function calculateSavings(opts: {
  hardware: Hardware;
  os: Os;
  promptsPerDay: number;
  pctCritical: number;
}) {
  const baseline = opts.promptsPerDay * 30 * OPUS_AVG_COST;
  const dist = TIER_DISTRIBUTION_BY_GPU[opts.hardware];
  const monthlyPrompts = opts.promptsPerDay * 30;
  const withMooter = dist.reduce((sum, share, idx) => {
    const tier = ['T0','T1','T2','T3'][idx] as keyof typeof TIER_COSTS;
    return sum + (monthlyPrompts * share * TIER_COSTS[tier]);
  }, 0);
  return {
    baseline_monthly: baseline,
    with_mooter_monthly: withMooter,
    saved_monthly: baseline - withMooter,
    saved_pct: (1 - withMooter / baseline) * 100,
    tier_distribution: { T0: dist[0], T1: dist[1], T2: dist[2], T3: dist[3] }
  };
}
```

Page wire: 4 inputs (hardware, OS, subs multi-select, sliders) → recalculate on every change, render output panel com donut + savings $ + stack compatibility list.

### A6 — Comparison snapshot

```bash
# Create docs/compare-snapshot.md
mkdir -p docs/
cat > docs/compare-snapshot.md <<'EOF'
# Comparison snapshot

Last updated: 2026-05-28

If you spot an inaccuracy, open an issue at:
https://github.com/pauloloureiroshp-ship-it/mooter/issues
EOF
```

Em `compare/page.tsx`, lê este ficheiro em build-time:
```tsx
import { readFile } from 'fs/promises';
import { join } from 'path';

export default async function ComparePage() {
  const md = await readFile(join(process.cwd(), 'docs/compare-snapshot.md'), 'utf-8');
  const lastUpdated = md.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'unknown';
  return <CompareArtboard lastUpdated={lastUpdated} />;
}
```

### A7 — Data policy (privacy "what we collect" card)

```bash
mkdir -p docs/
cat > docs/data-policy.md <<'EOF'
# What mooter collects (telemetry, opt-in only)

## We collect (aggregated, k-anon ≥50):
- Prompt SHA-256 hash — NOT prompt text
- Tier chosen + cost — NOT model response
- Pack used + confidence — NOT pack contents
- Latency in ms — NOT request payload
- Optional /mooter rate feedback — sentiment of comment, NOT full text

## We never collect:
- Your code (any part, any form)
- Your prompts (text, screenshots, partial)
- Model responses
- Personal identifiers (email retained ≤7 days, anonymized after)
- Repository URLs or commit messages
- File paths or directory structures

## You can revoke anytime
- Run `/mooter share OFF` in your terminal
- Delete `~/.mooter/consent.json`
- All your data is purged from hub within 30 days
EOF
```

`privacy/page.tsx` lê este ficheiro e injecta no compliance card.

### A8 — Static seed para Pack browser

```bash
mkdir -p landing/public/
cat > landing/public/packs-seed.json <<'EOF'
{
  "version": "1.0.0",
  "last_updated": "2026-05-28",
  "packs": [
    {"id": "diagram-systems", "trust": 98, "installs": 247, "min_vram_gb": 6, "domain": "diagram", "savings_pct": 89, "models": ["qwen2.5-coder:7b", "claude-sonnet", "claude-opus"], "summary": "ARCH discussions, system maps, Mermaid generation, ADR drafting"},
    {"id": "code-audit", "trust": 95, "installs": 198, "min_vram_gb": 4, "domain": "audit", "savings_pct": 76, "models": ["claude-sonnet", "claude-opus"], "summary": "Security review, audit, vulnerability assessment"},
    {"id": "animation-web", "trust": 87, "installs": 124, "min_vram_gb": 4, "domain": "animation", "savings_pct": 71, "models": ["claude-sonnet", "qwen2.5-coder:7b"], "summary": "Web animation: SVG, CSS animations, JS libs"},
    {"id": "data-spreadsheet", "trust": 82, "installs": 89, "min_vram_gb": 4, "domain": "data", "savings_pct": 73, "models": ["claude-sonnet", "qwen2.5-coder:7b"], "summary": "Spreadsheet manipulation, data transforms, formulas"},
    {"id": "prd-strategy", "trust": 79, "installs": 67, "min_vram_gb": 8, "domain": "strategy", "savings_pct": 65, "models": ["claude-sonnet", "claude-opus"], "summary": "PRD writing, product strategy, roadmap drafting"},
    {"id": "voice-tts", "trust": 76, "installs": 42, "min_vram_gb": 4, "domain": "voice", "savings_pct": 68, "models": ["claude-sonnet"], "summary": "TTS, voice scripting, audio pipeline"},
    {"id": "knowledge-third-brain", "trust": 73, "installs": 38, "min_vram_gb": 8, "domain": "knowledge", "savings_pct": 71, "models": ["claude-opus", "qwen3:30b"], "summary": "Notion KB, knowledge graph, second brain"}
  ]
}
EOF
```

`packs/page.tsx` fetcha este ficheiro static (sem backend) e renderiza cards.

### A9 — Componentes extraídos para `components/`

Extrai primitives de `mooter-v1-shared.jsx` para `landing/components/`:
- `MooterMark.tsx`
- `PastorCrook.tsx` (com 4 variants: Solid, Outline, Animated, WithCow)
- `TierChip.tsx`
- `StatuslineCard.tsx`
- `TerminalCard.tsx`
- `MooHerd.tsx`
- `NavBar.tsx`
- `Footer.tsx`
- `ProviderLogo.tsx`
- `LockChip.tsx`
- `Btn.tsx`
- `Card.tsx`
- `MonoNum.tsx`
- `Eyebrow.tsx`
- `ProgressBar.tsx`

Cada componente:
- TypeScript strict
- Default export
- Props com defaults (sem required props sem default)
- Tailwind v4 classes (CSS variables do @theme)
- Sem `localStorage` / `sessionStorage` (proibido em SSR)

### A10 — shadcn/ui — approved list

Phase A não introduz shadcn novos. Se Hero/Footer precisarem de algo, usa os primitives extraídos em A9.

Se for ABSOLUTAMENTE necessário shadcn:
- `button` (mas usa `Btn` extraído como wrapper)
- `card` (mas usa `Card` extraído)
- `dialog` (não necessário Phase A — Phase B usa para auth flow)

⚠️ Não instalar mais nada sem documentar razão no PR.

## 5. Endpoints — todos mockados nesta Phase

Esta Phase NÃO cria `/api/*`. Mas pages podem referenciar endpoints. Estratégia:

| Page | Endpoint | Mock strategy |
|---|---|---|
| Hero / community pulse | `/api/community/pulse` | `fetch().catch(() => null)` → mostra placeholder "growing" |
| Pack browser | static JSON `/packs-seed.json` | já implementado A8 |
| Methodology | client-only formula | sem backend (A5) |
| Compare | build-time md read | A6 |
| Privacy | build-time md read | A7 |
| Install | static command string | sem backend |

## 6. Schema `mooter_event` canónico (Wave 2 D4) — TS type

Cria `landing/lib/mooter-event.ts`:

```typescript
// Canonical Wave 2 D4 schema — DO NOT diverge
// This type is used by Phase D when implementing /api/hub/event ingestion

export type MooterEvent = {
  // ── Envelope ──
  event_id: string;                    // UUIDv7
  event_type: 'prod' | 'bench';
  timestamp_utc: string;               // ISO8601
  user_id_anon: string;                // sha256(hw_fingerprint + local_salt)
  session_id: string;                  // UUIDv7
  pastor_version: string;              // semver
  pricing_version: string;             // semver from pricing.js
  env_hash: string;                    // sha256(os+node+ollama+models)

  // ── Routing decisions ──
  prompt_hash: string;                 // sha256 truncated 16ch — NEVER plaintext
  prompt_tokens_est: number;
  axis1_tier_recommended: 'T0'|'T1'|'T2'|'T3';
  axis1_confidence: number;            // [0,1]
  axis2_pack_id: string | null;
  axis2_confidence: number;            // [0,1]
  axis3_adapter_id: string | null;     // Wave 5
  axis3_adapter_version: string | null;
  model_floor_applied: 'T0'|'T1'|'T2'|'T3';
  model_ceiling_applied: 'T0'|'T1'|'T2'|'T3';
  escalation_triggered: boolean;
  escalation_reason: string | null;

  // ── Execution ──
  model_actual: string;
  provider: 'anthropic' | 'ollama' | 'bedrock' | 'openai' | 'google' | 'grok';
  tokens_in: number;
  tokens_out: number;
  tokens_cache_hit: number;
  cost_micros: number;                 // INTEGER microUSD — no float drift
  latency_ms_total: number;
  latency_ms_ttft: number | null;
  latency_ms_per_tok: number | null;
  error_type: string | null;
  retries: number;

  // ── Implicit quality signals (nível 1) ──
  user_continued: boolean | null;      // turn N+1 happened
  user_edited_output: boolean | null;
  user_aborted: boolean | null;
  session_outcome: 'commit' | 'abort' | 'unknown' | null;

  // ── Explicit feedback (nível 2, opt-in via /mooter rate) ──
  rating_thumb: '👍' | '👎' | '🤷' | null;
  rating_comment_anon: { length: number; sentiment: 'pos'|'neu'|'neg' } | null;

  // ── Bench-only (event_type === 'bench') ──
  judge_model?: string;
  judge_scores?: { correctness: number; completeness: number; relevance: number; actionability: number; hallucination: number };
  judge_rationale?: string;            // truncado 500 chars
  judge_blind?: boolean;
};

// Statusline 3-line format — ABSOLUTE format
export const STATUSLINE_FORMAT = `
🟢 mooter saved $X today (Y%) · T{n} {model} · pack: {pack}
   {bar} N% 5h · {bar} N% 7d · ↺ {time}
   ctx N% · adapter: {id} ◌|● · ${"{ppt}"}/turn · alltime ${"{total}"}
`.trim();

// Tier color tokens (terminal vs web differ for T2)
export const TIER_COLORS_TERMINAL = {
  T0: '#4CAF6A',
  T1: '#5A9BD4',
  T2: '#D4C090',  // yellow in terminal
  T3: '#D46A5A',
};

export const TIER_COLORS_WEB = {
  T0: '#4CAF6A',
  T1: '#5A9BD4',
  T2: '#A88BD4',  // purple on web
  T3: '#D46A5A',
};
```

Este TS type ficará disponível para Phase D quando criar `/api/hub/event` — força conformidade com schema canónico Wave 2 D4.

## 7. Quality bar (acceptance)

Antes de declarar Phase A done:

- [ ] Lighthouse 95+ nas 8 marketing pages (perf, a11y, best-practices, SEO)
- [ ] Hero LCP < 2.5s em 4G throttle
- [ ] Zero layout shift no hero (two-column → stacked transition pre-allocated)
- [ ] Tab order matches visual order (a11y)
- [ ] Color contrast ≥ 4.5:1 body, ≥ 3:1 large text — sobre fundo `#0B0A09`
- [ ] Focus rings visíveis (não remover browser default sem replacement)
- [ ] Todos os numbers em `--font-mono` com `tabular-nums`
- [ ] Statusline preview matches `STATUSLINE_FORMAT` exacto
- [ ] Community pulse strip mostra placeholder se endpoint falhar (test: kill `/api/community/pulse`)
- [ ] Methodology calculator updates on every input change (no submit button)
- [ ] Pack browser filter persiste em URL params
- [ ] "Got Moo?" hero 168pt > footer 96pt (hierarchy preserved)
- [ ] `MooterMark` cow identity preservada (paths SVG inalterados, só cores ajustam ao dark)
- [ ] `classify.js` byte-identical com dev (`git diff --quiet dev -- tools/router/classify.js`)
- [ ] `packages/router/*` byte-identical (não tocado)
- [ ] `tools/router/*` byte-identical (não tocado)
- [ ] `packs/*` byte-identical (não tocado)
- [ ] Mobile responsive: hero stacks (terminal abaixo do tagline em < 1024px)
- [ ] PT-PT detail: nenhum texto em português hardcoded — copy é inglês (PT-PT é só conversa)

## 8. Final-reviewer pre-PR

Antes de abrir PR, spawn final-reviewer (Opus pinned via Task tool):

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave4-landing-impl vs dev.

Verifica:
- classify.js byte-identical com dev (invariant P11)
- packages/router/*, tools/router/*, packs/* byte-identical (não tocados)
- landing/app/(app)/*, landing/app/auth/*, landing/app/onboarding/*, landing/app/api/* byte-identical (não tocados)
- Dark theme migration completa: globals.css novo, layout.tsx themeColor #0B0A09
- 8 marketing pages criadas em (marketing)/ group
- NavBar + Footer shared layout
- Hero usa HeroV2Artboard (V2 canónico, não V1)
- Methodology usa MethodologyV2Artboard
- 'Got Moo?' hero 168pt > footer 96pt (hierarchy)
- Community pulse strip tem graceful fallback (test: mock fetch error)
- Methodology calculator é client-only (sem fetch/backend)
- Pack browser fetcha /packs-seed.json (static)
- Comparison page lê /docs/compare-snapshot.md (build-time)
- Privacy page lê /docs/data-policy.md (build-time)
- mooter-event.ts type tem 31+ campos (schema canónico Wave 2 D4, não simplificado do design)
- Componentes em landing/components/ são TS strict, default export, sem required props sem default
- Sem localStorage / sessionStorage
- Sem novos shadcn instalados (excepto button/card/dialog se documentado)
- Lighthouse 95+ (perf, a11y, best-practices, SEO) nas 8 pages
- Hero LCP < 2.5s 4G throttle
- Tab order + color contrast + focus rings OK
- Mobile responsive < 1024px
- Sem git add -A
- Sem --no-verify
- Sem secrets em diff

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

Se REQUEST_CHANGES → fix → re-review. Se APPROVE_WITH_NOTES → NITs ≤ 4 vão para Phase B backlog.

## 9. PR

```bash
git push -u origin wave4-landing-impl
gh pr create --base dev --title "Wave 4 Phase A: Landing rebuild (dark theme + 8 marketing pages)" --body-file - <<'EOF'
## Summary
Phase A of Wave 4 launch — landing public surface rebuild against new dark design.

## Changes
### Theme migration
- `landing/app/globals.css`: dark tokens (warm near-black bg, warm off-white text, rose accent)
- `landing/app/layout.tsx`: themeColor #0B0A09

### Marketing pages (8 new)
- `landing/app/page.tsx`: HeroV2 (replace existing)
- `landing/app/(marketing)/layout.tsx`: NavBar + Footer shared
- `landing/app/(marketing)/under-the-hood/page.tsx`: Quantization + LoRA
- `landing/app/(marketing)/packs/page.tsx`: gallery + filter
- `landing/app/(marketing)/packs/[id]/page.tsx`: pack detail
- `landing/app/(marketing)/compare/page.tsx`: 5-col table
- `landing/app/(marketing)/methodology/page.tsx`: cost calculator
- `landing/app/(marketing)/privacy/page.tsx`: 4 cards + compliance
- `landing/app/(marketing)/install/page.tsx`: one-command moment

### Components extracted
- `landing/components/`: 15 primitives (MooterMark, PastorCrook, TierChip, StatuslineCard, TerminalCard, MooHerd, NavBar, Footer, etc)

### Schema
- `landing/lib/mooter-event.ts`: canonical Wave 2 D4 TS type (31+ fields)
- `landing/lib/cost-calculator.ts`: client-only methodology formula

### Static assets
- `landing/public/packs-seed.json`: 7 Pastor packs
- `docs/compare-snapshot.md`: comparison table "last updated"
- `docs/data-policy.md`: privacy "what we collect" card source

## Out of scope (next phases)
- Phase B: `/auth/sign-in`, `/onboarding` (5-step wizard)
- Phase C: `/app/dashboard`, `/app/settings`, `/app/packs`, stubs Forge/Digest/Community
- Phase D: `/api/community/pulse`, `/api/me/*`, install token flow, CF Workers, Supabase migrations

## Tests
- Lighthouse 95+ on all 8 pages (perf, a11y, best-practices, SEO)
- Hero LCP < 2.5s on 4G throttle
- Color contrast ≥ 4.5:1 body, ≥ 3:1 large
- Community pulse graceful fallback tested
- Methodology calculator client-only verified

## Invariants
- ✅ classify.js byte-identical with dev (P11)
- ✅ packages/router/*, tools/router/*, packs/* byte-identical
- ✅ No git add -A
- ✅ No --no-verify
- ✅ Schema canonical Wave 2 D4 (not simplified design schema)
- ✅ Cost sanity: $X.XX (BLOCKER if ≥ $1)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog for Phase B
- <NITs do reviewer>
- `(app)/*` refactor
- `auth/*` refactor + onboarding 5-step
EOF
```

## 10. Notion + SYNC

### 10.1 Notion sub-page

Cria em Notion HQ (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) sub-page:

Title: `🚀 Sessão YYYY-MM-DD — Wave 4 Phase A (landing rebuild dark)`

Body:
- Tabela commits + 8 pages delivered
- Lighthouse scores per page
- Cost sanity
- Reviewer verdict + link PR
- Phase B backlog

### 10.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Phase A page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR (provavelmente depois de Wave 2 fechar) + decisão de arrancar Phase B (após Wave 3 D3)

## 11. Resumo final na chat

Quando tudo verde:
```
✅ Wave 4 Phase A — Landing rebuild COMPLETO
- Branch: wave4-landing-impl (pushed, NÃO em dev — Wave 2 owns dev)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide timing pós-Wave 2)
- Notion: <link>
- Pages: 8 marketing pages (dark theme)
- Lighthouse: 9X/100 average across all pages
- Hero LCP: <X.X>s
- Components extracted: 15 primitives em landing/components/
- Schema canónico: mooter-event.ts com 31+ campos (Wave 2 D4 compliant)
- Sanity cost: $X.XX
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Out of scope respeitado: auth/, onboarding/, (app)/, api/ NÃO tocados
Próximo: Paulo decide merge timing + arranca Phase B quando Wave 3 D3 fechar.
```

=== END ===
