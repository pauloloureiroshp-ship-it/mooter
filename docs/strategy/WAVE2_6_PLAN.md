# Wave 2.6 — Mooter Reveal (2026-05-31 → 2026-06-03)

> **SSoT operacional** Wave 2.6. Endereça 5 gaps de UX/transparency reportados pelo Paulo após Wave 2.5 closure. Não é nova feature — é **revelação visual do esforço do Mooter** + rebrand semântico para coerência.

---

## Porquê Wave 2.6 antes de Wave 3

| Razão | Detalhe |
|---|---|
| **Wave 2.5 fechou polished mas opaco** | Statusline funciona mas mostra 6 sinais. Esforço do Mooter é invisível per-turn. Modelos locais não distinguíveis dos cloud. |
| **Wave 3 (activation+hub) precisa de fundação clara** | Activation telemetry pressupõe vocabulário canónico (Pastor/Moos) e transparency visível. Sem isto, telemetria opt-in é fraca. |
| **Vocabulário "Pastor" confuso** | Conceito interno vazou para nomes públicos. Mooter É a entidade pastora; "Moos" são os workers. Coerência antes de escalar. |
| **WOW factor é vantagem competitiva** | "Não consigo trabalhar sem Mooter" só acontece se o utilizador VÊ o esforço. Wave 2.6 fixa isto. |

## Vocabulário canónico (rebrand)

| Termo | Significado | Uso |
|---|---|---|
| **Mooter** | Entidade que faz routing/decisão. THE pastor. | `Mooter routes T2 to sonnet` · `Mooter saved $0.27` |
| **Moos** | Colectivo de models/agents/packs sob gestão do Mooter. | `Mooter pastors the Moos` · `last 10 Moos: T0×6 T1×2 T2×2` |
| **A Moo** | Worker individual (modelo específico). | `This Moo (🐄 qwen3:7b) handled the bash call` |
| **to pastor** | Verbo: rotear, distribuir, gerir. | `Mooter pastors prompts to the right Moo` |

❌ "Pastor" como entidade isolada → eliminar (excepto em `docs/archive/`)

## Pré-requisitos (todos ✅)

- ✅ Wave 2.5 fechada (tag `v0.2.1-polish`, commit `3bb94b8` em dev)
- ✅ Statusline 1-line com per-session isolation funcional
- ✅ Wizard hardened
- ✅ `mooter trail` + provenance

## Days 3 (focado + accionável)

| Day | Foco | Critical path |
|---|---|---|
| **1** | Rebrand semântico Pastor → Mooter+Moos (docs · landing · memória) | 🔴 vocabulário antes de UI |
| **2** | Statusline 2-line rica + comando `mooter dashboard` TUI | 🔴 wow factor |
| **3** | Per-turn Moo card (Stop hook) + glyphs por modelo + telemetria evolution | 🔴 transparency |

Tag closure: `v0.2.2-reveal`.

---

## Day 1 — Rebrand semântico (Pastor → Mooter+Moos)

### 1.1 Scope

**Renames**:
- `docs/strategy/PASTOR.md` → `docs/strategy/MOOTER_PLAYBOOK.md`
- Memória persistente: `project_mooter_pastor_*` → `project_mooter_*`

**Find-replace coerente** (cada caso decidido pela semântica):
- "Pastor" (entity) → "Mooter"
- "Pastor" (workers/colectivo) → "Moos"  
- "the pastor X" (verb) → "to pastor" (manter como verbo)
- "Pastor decides" → "Mooter pastors"
- "the herd" / "the routes" (se houver) → "the Moos"

**Ficheiros target** (lista verificada):
- `docs/strategy/STRATEGY.md`
- `docs/strategy/ARCHITECTURE_V4.md`
- `docs/strategy/MASTER_PROMPT.md`
- `docs/strategy/ROUTING.md`
- `docs/strategy/FLOWCHART.md`
- `docs/strategy/BRIEFING.md`
- `docs/strategy/WAVE*_PLAN.md` e `WAVE*_KICKOFF.md` (active)
- `docs/strategy/PASTOR_OPERATIONS.md` → renomear `MOOTER_OPERATIONS.md`
- `SYNC.md`
- `README.md` (root + packages/*)
- `landing/` copy review (qualquer "Pastor" visível ao user)

**Novo ficheiro**: `docs/strategy/GLOSSARY.md` — define oficialmente o vocabulário.

### 1.2 Out of scope

- ❌ `docs/archive/**` — histórico mantém "Pastor"
- ❌ `~/.claude/agents/*` — names internos não vazam ao user
- ❌ Código TS/JS variable names — `pastorClass`, `pastorState` (se existirem) ficam para refactor à parte (Wave 3 ou later)
- ❌ Git history rewrite

### 1.3 DoD Day 1

- [ ] `grep -r "Pastor" docs/ --exclude-dir=archive` → 0 occurrences fora de GLOSSARY (que pode referir-se ao rebrand)
- [ ] Memória persistente renomeada + content actualizado
- [ ] GLOSSARY.md publicado e linked do README
- [ ] Landing copy review feito (se houver) — string "Pastor" ausente ou substituída
- [ ] PR `dev` ← `wave2.6-day1-rebrand-mooter-moos` com 2 commits (renames + content)

---

## Day 2 — Statusline 2-line + comando `mooter dashboard`

### 2.1 Statusline 2-line

**Layout final**:
```
🐮 Mooter · saved $0.27 (89%) · turn $0.012 · alltime $4.21 · last10: T0×6 T1×2 T2×2
🐂 sonnet ☁ 0.84 · 🏠 qwen3:7b ×6 · ctx 23% · 100% 5h · in 1.2k out 384 · pack: diagram-systems
```

**Line 1** (macro/historic):
- 🐮 Mooter prefix
- `saved $X (Y%)` cumulative session
- `turn $X` último turn
- `alltime $X` cumulative session
- `last10: T0×N T1×N T2×N T3×N` distribution

**Line 2** (current state):
- Glyph + model + provider + confidence (current decision)
- `🏠 <model> ×N` local Moos count na sessão
- `ctx N%` context window usage
- `N% 5h` quota Anthropic
- `in N out N` token meter
- `pack: X` se pack activo

### 2.2 Truncate-safe

- Detecta `COLUMNS` (env var ou tput)
- Se `COLUMNS < 120` → fallback 1-line (line 1 only, compressed)
- ANSI codes safe: usar reset (`\x1b[0m`) entre cada chip para evitar bleed

**Web check** (web hoje 2026-05-30): [statusline docs](https://code.claude.com/docs/en/statusline) confirmam multi-line suportado mas frágil. Precedente funcional: [vtmocanu/cc-statusline](https://codeberg.org/vtmocanu/cc-statusline) faz 2-line + ANSI estável.

### 2.3 Comando `mooter dashboard`

**Ficheiro**: `packages/cli/src/commands/dashboard.ts` (NEW)

**Stack**: ANSI raw (zero deps — evita blessed/ink que pesam ~5MB)

**Layout TUI**:
```
┌─ 🐮 Mooter Dashboard · session 01939... ──────────────────┐
│                                                            │
│  MOOS ACTIVE                                               │
│    🏠 qwen3:7b ········ 6 calls · 142 tokens · 0.8s avg   │
│    ☁  sonnet ··········· 2 calls · 1.2k tokens · 1.8s avg  │
│    ☁  opus ············· 1 call · 380 tokens · 4.2s avg   │
│                                                            │
│  SAVINGS                                                   │
│    Session: $0.27 saved (89% vs T3-default)                │
│    Today:   $1.42 saved (78% vs baseline)                  │
│    7-day:   $9.83 saved · evolution: +12% vs prev 7-day    │
│                                                            │
│  CONTEXT                                                   │
│    [████████░░░░░░░░░░░░] 23% used (47k / 200k)            │
│                                                            │
│  QUOTA                                                     │
│    Anthropic 5h: [████████████████████] 100%               │
│    Anthropic 7d: [██████████████░░░░░░] 71%                │
│                                                            │
│  PACK · diagram-systems (T2 specialist)                    │
│  ADAPTER · ◌ none (baseline · LoRA in Wave 5)              │
│                                                            │
│  Press q to exit · r to refresh · h for help               │
└────────────────────────────────────────────────────────────┘
```

**Refresh**: 1s tick, lê `decisions.log` + `/metrics` endpoint + stdin do session JSON.

### 2.4 DoD Day 2

- [ ] Statusline 2-line render correcto em `COLUMNS >= 120`
- [ ] Fallback 1-line em `COLUMNS < 120` testado
- [ ] `mooter dashboard` lança TUI, refresh a cada 1s
- [ ] `q` exits cleanly, restore terminal state
- [ ] Snapshot test para 2-line layout fixture
- [ ] Sem regressão: testes Day 1 W2.5 (42/42 statusline-multi) ainda verdes

---

## Day 3 — Moo card + glyphs + evolution

### 3.1 Moo card per-turn (Stop hook)

**Ficheiro**: `tools/router/stop_hook.js` (NEW)

**Wiring**: `~/.claude/settings.json` → adicionar Stop hook que aponta para `stop_hook.js`.

**Output** (ao fim de cada turn, antes do próximo prompt):
```
─────── 🐮 Moo card ───────
 model     🐂 sonnet ☁ (T2)
 tokens    in 1.2k · out 384
 latency   1.8s
 cost      $0.012 turn · saved $0.034 vs T3-default
 bash      3 calls (🐄 qwen3:7b ×2 · 🐂 sonnet ×1)
 ctx       24% used
───────────────────────────
```

**Disable**: `mooter quiet --moo-card` (toggle persistido em `preferences.json`).

**Web check** (web hoje): [hooks docs](https://code.claude.com/docs/en/hooks) confirma Stop hook stdout vai para terminal output. Bug conhecido: UserPromptSubmit JSON falha 1ª msg de session — Stop hook usa plain text (safe).

### 3.2 Glyph map por modelo

**Ficheiro**: `tools/router/glyphs.js` (NEW)

```javascript
const TIER_GLYPHS = {
  T0: '🐄',     // local cow (lightweight Ollama)
  T0_heavy: '🐃', // water buffalo (qwen3:30b ou similar local heavy)
  T1: '🐎',     // horse (fast — Haiku)
  T2: '🐂',     // bull (workhorse — Sonnet)
  T3: '🦬',     // bison (heavy — Opus)
};

const PROVIDER_GLYPHS = {
  local: '🏠',
  cloud: '☁',
  max: '⚡',  // Subscription Max tier
};

function glyphFor({ tier, modelSize, provider }) {
  let tierKey = tier;
  if (tier === 'T0' && modelSize === 'large') tierKey = 'T0_heavy';
  return `${TIER_GLYPHS[tierKey] ?? '🐮'} ${PROVIDER_GLYPHS[provider] ?? ''}`.trim();
}
```

Aplicar em:
- Badge `inject_context.js` → `[🐂 sonnet ☁ 0.84]`
- Statusline line 2 → `🐂 sonnet ☁ 0.84`
- Moo card → `🐂 sonnet ☁ (T2)`
- Dashboard MOOS ACTIVE → `🏠 qwen3:7b` / `☁ sonnet`

### 3.3 Telemetria evolution

**`mooter trail --evolution`** (extends Day 4 W2.5 command):
```
EVOLUTION (vs previous 7-day window)
  savings: $9.83 → $11.02   (+12.0%)
  prompts: 142   → 168      (+18.3%)
  avg cost/prompt: $0.011 → $0.009  (-18.2%)
  
OPTIMIZATIONS APPLIED
  quantization: Q4_K_M (baseline since 2026-04-15)
  LoRA: ◌ none yet (Adapter Forge ships Wave 5)
  
PROJECTED (next 7-day at current rate)
  estimated savings: $11.50-12.20
```

**Statusline view rotativa C** (a juntar às existentes A=macro, B=tier mix):
```
🐮 Mooter · evolution: +12% vs last week · this week: $11.02 saved · 168 prompts
```

Rotação: A→B→C→A cada 5 ticks (Day 3 W2.5 já tinha A/B).

### 3.4 DoD Day 3

- [ ] Moo card aparece pós-cada-turn
- [ ] `mooter quiet --moo-card` desactiva
- [ ] Glyph map aplicado em 4 sítios (badge · statusline · Moo card · dashboard)
- [ ] `mooter trail --evolution` retorna comparison 7d vs 7d
- [ ] Statusline view C funcional
- [ ] Sem regressão: todos os testes Wave 2.5 verdes
- [ ] Tag `v0.2.2-reveal` aplicada após merge

---

## Invariants Wave 2.6

- ❌ Nunca tocar `classify.js` (P11)
- ❌ Nunca `git add -A`
- ❌ Nunca merge directo para `main`
- ❌ Nunca `--no-verify`
- ❌ Não tocar `docs/archive/**` (histórico)
- ❌ Não tocar subagent files `~/.claude/agents/*`
- ❌ Não rebrand variable names .ts/.js (Wave 3 backlog)
- ❌ Não tocar event schema `mooter_event.ts` (Wave 2 D4)
- ✅ Final-reviewer T3-gate obrigatório por Day
- ✅ Sanity cost $1 BLOCKER
- ✅ Notion sub-page + SYNC.md per Day
- ✅ Vocabulário canónico GLOSSARY.md é SSoT

---

## Relacionados

- [WAVE2_5_PLAN.md](./WAVE2_5_PLAN.md) — Wave 2.5 closed `v0.2.1-polish`
- [WAVE3_PLAN.md](./WAVE3_PLAN.md) — Wave 3 activation+hub (post Wave 2.6)
- [MOOTER_PLAYBOOK.md](./MOOTER_PLAYBOOK.md) — ex-PASTOR.md (renomeado Day 1 W2.6)
- [GLOSSARY.md](./GLOSSARY.md) — vocabulário canónico (criado Day 1 W2.6)
