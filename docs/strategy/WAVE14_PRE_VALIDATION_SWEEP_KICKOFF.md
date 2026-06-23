# Wave 14 — Pre-Validation Quality Sweep

> **Goal**: antes de arrancar validation week com 5 vibe coders, garantir que Mooter
> está em **showcase-quality end-to-end**: brand parity signed-in, statusline
> completo (Q4_K_M + LoRA), telemetria capturada sem gaps, fluxo OAuth→install→prompts
> validado sistematicamente, e segurança auditada. Plus Notion meta-logging para
> rastreio de cada acção Cowork+CC.
>
> **Trigger**: Paulo apanhou UX/UI gap signed-in pages (legado W6 admin skeleton vs
> landing Wave 12 polished) durante review pós-Wave 13.1 (2026-06-04). Pediu também
> auditoria sistemática de OAuth/telemetria/Moos/segurança antes de validation week.
>
> **Scope**: 5 sub-features paralelas/sequenciais, ~5-7 dias. Tag esperada
> `v1.9.0-pre-validation-sweep`. Outreach validation move para **Wave 15** (depois
> deste sweep ship).
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero PII em telemetria
> - Backwards-compat total CLI (sem partir installs existentes)
> - Hub deploy zero-downtime
> - Tests routing 110/110 mantidos

---

## 0. Contexto + gap analysis

| Área | Estado pré-Wave 14 | Gap |
|---|---|---|
| Landing pública | ✅ Polished Wave 12 (palette, typography, components shadcn) | — |
| `/onboarding` | 🟡 Funcional (Day 5 PASS) mas design W6 D1 antigo | Brand parity ❌ |
| `/dashboard` | 🟡 Wave 9/10 fixes mas estética W6.5 | Brand parity ❌ |
| `/settings` | 🟡 Wave 10 B.2b fixes mas estética legada | Brand parity ❌ |
| `/admin` | 🟡 W6.5 D1+D2 skeleton + B.2b polish; user-internal não-crítico | Lower priority |
| Statusline Q4_K_M chip | ✅ Wave 12 PR-F live: `quant Q4_K_M (-72% size · ~99% quality vs FP16)` | LoRA chip ❌ |
| Statusline LoRA chip | ❌ Não existe — adapter system (Wave 5) live mas não tem chip dedicado | NEW |
| OAuth flow | ✅ Day 5 confirmado | Edge cases (revoked tokens, expiry, multi-device) não validados |
| Telemetria capture | ✅ Wave 12 anon feedback LIVE (smokes 201) | Audit sistemático cada event vs perdido |
| Moos locais | ✅ Day 5 + WSL2 re-test confirmou 6 spawns | Stress test concurrent + edge (Ollama down, model swap, timeout) |
| Security | 🟡 Wave 10 C.1 rate-limits + Wave 13.x D2 timing-safe auth | Audit sistemático: OAuth scopes, secrets, RBAC, deps CVE |
| Notion logging | 🟡 Manual via /sync-project | Auto-log cada sub-feature dia-a-dia |

---

## 1. Sub-features (5)

### 14A — Quality Audit completo (Cowork solo, ~2-3h)

**O quê**:
1. Audit signed-in pages via Chrome MCP — screenshot cada página + comparação visual com landing
2. Audit telemetria flow end-to-end — Read hub schemas + admin endpoints + confirmar cada event type capturado
3. Audit OAuth flow — Read auth code + identify edge cases não cobertos
4. Audit Moos local — Read subagent_tracker + post_tool_badge + identify edge cases
5. Audit segurança lightweight — secrets rotation policy, RBAC scope, hub auth dual-token, dependencies

**Output**: `docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md` com:
- Severity: 🔴 Critical / 🟠 Important / 🟡 Polish
- Por finding: descrição + reproduce + fix path + estimate
- Section "Quick wins" (Polish que podem ser fixed em <30 min)

**Por quê primeiro**: define scope de 14B/14C/14E. Sem audit, fixes vão ser anedóticos.

**Anti-pattern**: NÃO criar findings inventados. NÃO recomendar refactor "while we're at it". Só o que está visível e documentado.

---

### 14B — Signed-in Brand Parity sweep (CC autonomous, ~2 dias)

**O quê**:
- `/onboarding` wizard 3 steps: redesign com palette + typography + components landing Wave 12
- `/dashboard` overview: cards Wave 12 style + sparkline + savings hero alinhado
- `/settings`: components shadcn alinhados + consistency com landing
- `/admin` (NÃO user-facing): skip ou polish minor

**Tools alinhar**:
- Tailwind tokens (colors, spacing, typography)
- shadcn/ui components (Card, Button, Tabs, Dialog)
- Iconografia (Lucide React mesma versão)
- Hero patterns (data-source badges, Live · N devices badges Wave 10 B.1a)

**Output**: PR (squash→dev) + tests landing mantidos + visual review via Chrome MCP screenshots

**Por quê crítico para validation**: testers vão entrar via `/onboarding` Day 1 → sentir o salto brand quebra wow factor.

**Anti-pattern**: NÃO redesignar funcionalidade existente — só estética. NÃO refactor estrutura de routes/state. NÃO mexer em `/admin` agora (separate scope).

---

### 14C — Statusline LoRA chip (CC autonomous, ~1h)

**O quê**: adicionar chip `LoRA active · adapter <name> · +N pts` na statusline quando adapter > baseline está activo. Pattern replica `quant Q4_K_M (-72% size · ~99% quality vs FP16)` chip.

**Display logic**:
- Adapter `baseline` → não mostra chip (current behavior)
- Adapter activo `<name>` → mostra `🧬 LoRA active · <name> · +N pts` onde N é estimated quality boost

**Locations**:
- `tools/router/statusline-multi.js` (renderTwoLine — junto ao quant chip)
- Hint engine — fonte do adapter name (já existe via `mooter forge install`)

**Output**: PR small, byte-identical classify.js, tests mantidos.

**Anti-pattern**: NÃO inventar N. Se `+N pts` requer benchmark data não-disponível, mostrar só `🧬 LoRA active · <name>` sem boost label.

---

### 14D — E2E Simulation + Notion log (Cowork solo, ~1h)

**O quê**: Cowork via Chrome MCP simula fresh user end-to-end:
1. Visit mooter.ai → screenshot landing
2. Sign in with GitHub → screenshot OAuth flow
3. `/onboarding` 3 steps → screenshot cada step
4. Get install token URL → confirm Wave 11 install.sh self-clone
5. Visit `/dashboard` → screenshot overview
6. Visit `/settings` → screenshot persona/hardware/packs
7. Visit `/admin` (Paulo-only) → screenshot panel
8. (Skip CLI install — covered by Day 5)

Cada step → entry em Notion sub-page com timestamp + screenshot + observações.

**Output**: Notion sub-page "Wave 14 14D E2E Simulation" + findings cross-ref com 14A.

**Por quê**: complementa 14A audit com fluxo real end-to-end (não só audit por página isolada).

---

### 14E — Security Audit completa (CC autonomous + Cowork review, ~1 dia)

**O quê**:
1. **OAuth scope audit**: Read auth code, confirm scopes minimal, refresh token rotation
2. **Secrets inventory**: lista todos secrets (env, wrangler, Vercel, GitHub) + rotation policy
3. **RBAC audit**: `/admin` ADMIN_EMAILS env, audit log table, escalation paths
4. **Hub auth audit**: dual-token (W13.x), rate-limits (W10 C.1), endpoint coverage
5. **Schema vulnerabilities**: D1 query injection, RLS Supabase, public endpoints sem auth
6. **Dependencies CVE**: `npm audit` + manual review high/critical findings
7. **Logging**: Confirm zero PII em logs hub + Vercel + GitHub Actions

**Output**: `docs/strategy/WAVE14_14E_SECURITY_AUDIT_FINDINGS.md` com severity-categorized findings + remediation plan.

**Anti-pattern**: NÃO fixar critical findings sem Paulo gate. NÃO publicar audit completa publicamente (interno only).

---

## 2. Sequência (5 sub-features, ~5-7 dias)

### Day 1 (hoje)
- ✅ 14A audit Cowork solo (Chrome MCP + Read code) — output WAVE14_14A_QUALITY_AUDIT_FINDINGS.md
- ✅ Notion master sub-page "Wave 14 daily log" criada
- ✅ Brief composto (este file)

### Day 2
- 14C statusline LoRA chip (CC ~1h)
- 14D E2E simulation (Cowork ~1h)
- 14E security audit Day 1 — OAuth + secrets + RBAC (CC + Cowork review)

### Day 3
- 14E security audit Day 2 — Hub auth + schema + dependencies + logging
- 14E remediation plan (Paulo Gate)

### Day 4-5
- 14B brand parity Day 1 — `/onboarding` redesign (CC autonomous)
- 14B brand parity Day 2 — `/dashboard` + `/settings` redesign

### Day 6
- Closure Wave 14: PR consolidação + tag `v1.9.0-pre-validation-sweep`
- Notion daily log fechado
- Memória `project_mooter_wave14_quality.md`

### Day 7
- Wave 15 arranca — Validation Week (outreach + Tally + Calendly + 5 testers convidados)

---

## 3. Non-negotiables + verification

| # | Item | Como verificar | Quando |
|---|---|---|---|
| 1 | `classify.js` byte-identical sha256 `7b01eb86...87762` | `sha256sum tools/router/classify.js` | Cada sub-feature PR |
| 2 | Zero PII em telemetria | grep schema + payload | 14A + 14E |
| 3 | Backwards-compat CLI | `mooter init`/`login`/`feedback` em fresh install | 14D |
| 4 | Hub deploy zero-downtime | rate-limits W10 C.1 + dual-token W13.x intactos | 14C + 14E |
| 5 | Tests routing 110/110 | CI gate | Cada PR |
| 6 | Landing tests mantidos | CI gate | 14B PR |
| 7 | Brand parity validada visual | Chrome MCP screenshots side-by-side | 14B closure |

---

## 4. Definition of Done (Wave 14)

1. ✅ `WAVE14_14A_QUALITY_AUDIT_FINDINGS.md` produzido com findings priorizados
2. ✅ Notion master sub-page com 5 sub-pages (uma por sub-feature) + daily log entries
3. ✅ Sub-feature 14B brand parity shipped em prod (`/onboarding` + `/dashboard` + `/settings`)
4. ✅ Sub-feature 14C LoRA chip shipped em prod (statusline-multi.js)
5. ✅ Sub-feature 14D E2E simulation report + screenshots em Notion
6. ✅ Sub-feature 14E security audit report + remediation plan (Paulo Gate)
7. ✅ Tag prod `v1.9.0-pre-validation-sweep`
8. ✅ Memória `project_mooter_wave14_quality.md` actualizada

---

## 5. Notion meta-logging structure

**Master sub-page**: "🔍 Wave 14 Pre-Validation Quality Sweep — daily log"

Sub-pages (5):
- "Wave 14 14A — Quality Audit Findings"
- "Wave 14 14B — Brand Parity Day-by-Day"
- "Wave 14 14C — LoRA Statusline Chip"
- "Wave 14 14D — E2E Simulation Walkthrough"
- "Wave 14 14E — Security Audit Findings"

Cada entry: `<timestamp> · <action> · <finding> · <next step>`.

Padrão para Cowork + CC: ao fim de cada sub-feature, append entry no master log.

---

## 6. Master prompt para CC arrancar 14B brand parity (Day 4)

```
Inicia Wave 14 Sub-feature 14B Signed-in Brand Parity conforme docs/strategy/WAVE14_PRE_VALIDATION_SWEEP_KICKOFF.md.

Pré-flight: Wave 13.1 v1.8.2-digest-stderr-fix EM PROD. Wave 14 14A audit completed (ver WAVE14_14A_QUALITY_AUDIT_FINDINGS.md para findings UX/UI).

Scope: redesign /onboarding (3-step wizard), /dashboard (overview), /settings com brand parity da landing Wave 12. NÃO redesignar funcionalidade — só estética. NÃO tocar /admin.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_PRE_VALIDATION_SWEEP_KICKOFF.md inteiro
  - docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md (findings UX/UI por página)
  - landing/src/app/page.tsx (referência palette/typography/components)
  - landing/src/app/onboarding/* (current state)
  - landing/src/app/dashboard/* (current state)
  - landing/src/app/settings/* (current state)
  - landing/src/components/ (shadcn/ui inventory)

Non-negotiables:
  - classify.js byte-identical
  - Tests landing mantidos
  - Backwards-compat: não partir routes/state existentes
  - Zero PII changes
  - Visual review obrigatório via Chrome MCP screenshots Cowork antes de promote

Sequência (Day 4-5, ~2 dias autonomous):
  Day 4: /onboarding 3-step wizard redesign + audit visual
  Day 5: /dashboard overview + /settings redesign + audit visual

Final-reviewer T3 gate antes de PR squash→dev. Cowork audit visual via screenshots antes de promote dev→main.

Tag prod (no fim de Wave 14): v1.9.0-pre-validation-sweep.

Reporta WAVE14_14B_DAY_N_FINDINGS.md se houver decisões para Paulo.
```

---

## 7. Anti-patterns globais Wave 14

- ❌ NÃO criar findings inventados — só o que está reproduzível
- ❌ NÃO refactor funcionalidade — só estética (14B) + audit (14A/14E)
- ❌ NÃO publicar findings security publicamente
- ❌ NÃO tocar `classify.js`, hub schemas, subagent_tracker
- ❌ NÃO `git add -A`
- ❌ NÃO auto-merge a main sem Paulo gate
- ❌ NÃO renomear simbolos código (só docs/comments se necessário)

---

**Composed by Cowork, 2026-06-04 afternoon, pós-Wave 13.1 closure. Wave 14 ships
pre-validation quality sweep paralelo com gate week deferred. 5 sub-features, ~5-7
dias, tag v1.9.0. Validation outreach move para Wave 15.**
