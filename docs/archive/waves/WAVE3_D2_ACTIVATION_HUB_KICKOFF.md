# Wave 3 Day 2 — Activation + Local Hub

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.3.0-safety-fix` em dev (Wave 3 D1). Working dir = `~/mooter`.
>
> **O que faz**: 5 sub-features para fundação da activation + hub local — opt-in telemetry, comando `mooter hub`, PACK section no dashboard (fix MIN-1 W2.7), persona-aware recommendations refinement, safety over-boost monitor (NIT W3 D1).
>
> **NÃO inclui**: Cloudflare backend (Wave 4 Phase D), área logada UI (Wave 4 Phase C). Esta wave é tudo local.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave3-day2-activation-hub` (cria de `dev`). `--permission-mode bypassPermissions` (autorizado).

**Missão Wave 3 D2**: shippar 5 sub-features num único PR para `dev` que constroem a fundação da activation local + hub:

1. **Telemetry opt-in** — wizard ajuda a escolher consciente; `consent.json` audit-trail signed
2. **`mooter hub`** comando — TUI live que mostra packs instalados · safety_boosts last 24h · evolution · sugestões
3. **PACK section no dashboard** (fix MIN-1 W2.7) — adiciona secção PACK ao `mooter dashboard` TUI
4. **Persona-aware recommendations refinement** — wizard adapta recomendações a 3 personas (Solo Founder · Senior IC · OSS Maintainer)
5. **Safety over-boost monitor** (NIT W3 D1) — `mooter trail --safety` mostra boost rate por keyword, sinaliza > 30%

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11) — verificar com `git diff dev tools/router/classify.js`
- ❌ **mooter_event.ts schema INTACTO** (W2 D4)
- ❌ **safety_boost.js (W3 D1) só extensível** — não rewrite
- ❌ **Não tocar** `docs/archive/**`, `~/.claude/agents/*`, `landing/` (Wave 4)
- ❌ **Não enviar nada para network** — opt-in só prepara o canal, NÃO envia
- ❌ **Não inventar** activity metrics — se não tiver dados, mostra "no data yet"
- ❌ **Não `git add -A`**, **`--no-verify`**, ou merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.3.1-activation-hub**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: telemetry consent é audit-trail signed (HMAC), NÃO black-box

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma a0a2258 + tag v0.3.0-safety-fix
git tag -l | grep v0.3.
git checkout -b wave3-day2-activation-hub
```

Recon:
- `packages/cli/src/commands/init.ts` — wizard actual (extend p/ telemetry opt-in)
- `packages/cli/src/commands/dashboard.ts` — adicionar PACK section
- `packages/cli/src/commands/trail.ts` — extend com `--safety --by-keyword`
- `~/.mooter/consent.json` — schema actual (W2 D6)
- `~/.mooter/profile.json` — persona detection input
- `packages/cli/src/commands/quiet.ts` — referência prefs persist
- `tools/router/safety_boost.js` (W3 D1) — referência para hub metrics

## 3. Sub-feature 1 — Telemetry opt-in audit-trail signed

### 3.1 Behaviour

Wizard `mooter init` extended com step novo após pack install:

```
Mooter pode partilhar telemetria anónima para melhorar o classifier.
Telemetria inclui: tier distribuições, accuracy boost reasons, NUNCA prompts ou conteúdo.

Opt-in?
  [y] Sim, ajuda a melhorar Mooter
  [n] Não obrigado (default)
  [d] Detalhes do que é enviado
```

Se `y` → escreve consent.json com timestamp + signature HMAC.

### 3.2 Ficheiro

`~/.mooter/consent.json`:
```json
{
  "telemetry_enabled": false,
  "consent_timestamp_utc": null,
  "consent_signature": null,
  "data_categories": {
    "tier_distribution": false,
    "safety_boost_reasons": false,
    "pack_usage": false,
    "prompt_content": false,
    "hardware_info": false
  },
  "retention_days": 90,
  "version": 1
}
```

Quando user opt-in:
```json
{
  "telemetry_enabled": true,
  "consent_timestamp_utc": "2026-05-31T18:00:00Z",
  "consent_signature": "<HMAC(secret_local, consent_payload)>",
  "data_categories": {
    "tier_distribution": true,
    "safety_boost_reasons": true,
    "pack_usage": true,
    "prompt_content": false,
    "hardware_info": true
  },
  "retention_days": 90,
  "version": 1
}
```

### 3.3 Implementação

`packages/cli/src/commands/init.ts` — adicionar step:
```typescript
async function askTelemetryConsent(io: InitIO): Promise<TelemetryConsent> {
  io.print('\n📊 Telemetria opt-in (anónima)');
  io.print('   Categorias: tier_distribution · safety_boost_reasons · pack_usage · hardware_info');
  io.print('   NUNCA: prompt content');
  io.print('   Retention: 90 dias · Revogável: mooter quiet --telemetry-off');
  
  const choice = await io.ask('Opt-in? [y/n/d] (default: n): ');
  
  if (choice === 'd') {
    io.print(consentDetailsLong());
    return askTelemetryConsent(io);  // re-ask
  }
  
  const enabled = choice === 'y' || choice === 'yes';
  return buildConsent(enabled);
}

function buildConsent(enabled: boolean): TelemetryConsent {
  const now = new Date().toISOString();
  const payload = { enabled, ts: now, version: 1 };
  const signature = enabled ? hmacSign(payload, getLocalSecret()) : null;
  
  return {
    telemetry_enabled: enabled,
    consent_timestamp_utc: enabled ? now : null,
    consent_signature: signature,
    data_categories: enabled ? defaultCategories() : disabledCategories(),
    retention_days: 90,
    version: 1
  };
}
```

`mooter quiet --telemetry-off` para revogar (similar a `--moo-card`).

### 3.4 Tests

`packages/cli/tests/telemetry-consent.test.ts`:
- consent.json escrito com signature válida
- HMAC verificável user-side
- revogação via `mooter quiet --telemetry-off`
- default opt-OUT (false)
- categorias respectadas (prompt_content nunca true)

## 4. Sub-feature 2 — `mooter hub` comando TUI

### 4.1 Layout

```
┌─ 🐮 Mooter Hub · session active ──────────────────────────┐
│                                                            │
│  PACKS INSTALLED (7)                                       │
│    🟢 diagram-systems    T2 · used 12× last 7d            │
│    🟢 code-audit         T2 · used 8× last 7d             │
│    🟢 animation-web      T2 · used 3× last 7d             │
│    ⚪ database-tuning    T3 · used 0× (since install)     │
│    ⚪ legal-contracts    T2 · used 0× (since install)     │
│    ...                                                     │
│                                                            │
│  SAFETY BOOSTS (last 24h)                                  │
│    Total applied: 5 of 47 prompts (10.6%)                  │
│    Top reasons:                                            │
│      critical_phrase_match: 2 (sharding, schema migration) │
│      arch_keyword + low_conf: 3                            │
│                                                            │
│  EVOLUTION (vs prev 7d)                                    │
│    savings: $4.21 → $6.83  (+62.2%)                       │
│    prompts: 89 → 124       (+39.3%)                       │
│    avg cost/prompt: $0.012 → $0.009 (-25.0%)              │
│                                                            │
│  TELEMETRY · opt-in (since 2026-05-30 · signed ✓)         │
│                                                            │
│  SUGGESTIONS                                               │
│    · You haven't used database-tuning in 30 days —         │
│      consider removing or activating in next DB task       │
│    · 3 safety boosts last 24h on "design" keyword —        │
│      review safety_seeds.json for false positives          │
│                                                            │
│  Press q to exit · r refresh · h help · t telemetry        │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Ficheiro

`packages/cli/src/commands/hub.ts` (NEW):
```typescript
export async function runHub(opts: { refreshMs?: number }): Promise<void> {
  // Similar to dashboard.ts (W2.6 D2) — alternate screen, ANSI raw, refresh loop
  // Sections: PACKS · SAFETY · EVOLUTION · TELEMETRY · SUGGESTIONS
  // Sugestões geradas por regras simples (não LLM):
  //   - pack não usado > 30 dias → "consider removing"
  //   - safety_boost rate > 30% num keyword → "review false positives"
  //   - 0 telemetry opted-in → "consider opt-in (anonymous)"
}
```

CLI wiring: `packages/cli/src/cli.ts` adicionar `.command('hub')`.

### 4.3 Tests

`packages/cli/tests/hub.test.ts`:
- buildHub gera 5 sections
- Pack usage count correcto
- Suggestions têm regras determinísticas (não inventar)
- Cleanup ANSI on exit

## 5. Sub-feature 3 — PACK section no dashboard (fix MIN-1 W2.7)

### 5.1 Behaviour

`mooter dashboard` (W2.6 D2) actualmente tem 5 secções: MOOS ACTIVE · SAVINGS · CONTEXT · QUOTA · ADAPTER. Wave 2.7 audit MIN-1 detectou ausência de PACK.

Adicionar PACK section entre QUOTA e ADAPTER:

```
  PACK
    Active: diagram-systems (T2 · last used 5min ago)
    Installed: 7 packs · 3 active last 7d
    Suggestion: legal-contracts unused for 21d
```

### 5.2 Implementação

`packages/cli/src/commands/dashboard.ts` (W2.6 D2) — extend `buildDashboard()`:
```typescript
function packSection(): string {
  const active = getActivePack();
  const installed = listInstalledPacks();
  const usage = getPackUsageStats(installed);
  
  return [
    '  PACK',
    `    Active: ${active?.id ?? 'none'} ${active ? `(T${active.tier} · last used ${humanizeAge(active.last_used)})` : ''}`,
    `    Installed: ${installed.length} packs · ${usage.activeLast7d} active last 7d`,
    suggestionForPacks(usage)
  ].join('\n');
}
```

### 5.3 Tests

`packages/cli/tests/dashboard.test.ts` (extend):
- PACK section presente quando packs instalados
- "none" graceful quando nenhum activo
- Suggestion não inventa (só se há dados reais > 7d)

## 6. Sub-feature 4 — Persona-aware recommendations refinement

### 6.1 Behaviour

Wizard `mooter init` (W2 D6 + W2.5 D2) actualmente recommend packs por scoring `0.4*hardware + 0.3*provider + 0.3*trust`. Adicionar persona detection + weight adjustment.

Persona detection (após hardware probe, antes pack recommendations):

```
Que tipo de developer melhor te descreve?
  [a] Solo Founder — building products, pay own tokens, ROI matters
  [b] Senior IC — company pays, want speed + control, privacy matters
  [c] OSS Maintainer — big repos, Dynamic Workflows fan, paralelism matters
  [d] Other — show me all packs

(Default: prompts further questions)
```

### 6.2 Weight adjustments por persona

| Persona | Hardware weight | Provider weight | Trust weight | Bonus packs |
|---|---|---|---|---|
| Solo Founder | 0.3 | 0.4 (cost-sensitive) | 0.3 | code-audit, animation-web |
| Senior IC | 0.4 | 0.2 | 0.4 | code-audit, security-review |
| OSS Maintainer | 0.5 (heavy local) | 0.2 | 0.3 | diagram-systems, refactor |
| Other | 0.4 | 0.3 | 0.3 | (default, no bonus) |

### 6.3 Tests

`packages/cli/tests/persona-recommendations.test.ts`:
- 3 personas → 3 different pack rankings
- "Other" matches old behavior (backward compat)
- profile.json persists persona choice

## 7. Sub-feature 5 — Safety over-boost monitor (NIT W3 D1)

### 7.1 Behaviour

`mooter trail --safety` (W3 D1) extend com `--by-keyword`:

```
SAFETY BOOSTS (last 100 prompts) · by keyword
  design        12 boosts (24%)
  architecture   3 boosts (6%)
  audit          5 boosts (10%)
  review         8 boosts (16%)
  sharding       2 boosts (4%)
  
⚠ Possible over-boost: "design" applied to 12/50 prompts (24%) — review safety_seeds.json
✓ "architecture" rate (6%) within expected range
```

Threshold: > 30% rate on a single keyword → ⚠ warning emitido.

### 7.2 Implementação

`packages/cli/src/commands/trail.ts` (W2.5 D4 + W2.6 D3) — extend:
```typescript
if (args.safety && args.byKeyword) {
  return printSafetyByKeyword(events);
}
```

### 7.3 Tests

`packages/cli/tests/trail-safety-keyword.test.ts`:
- Counts correct per keyword
- Warning emitted quando > 30%
- 0 warning quando dentro range

## 8. Verification P11

```bash
git diff dev tools/router/classify.js
# DEVE retornar VAZIO

git diff dev tools/router/safety_boost.js
# Pode ter mudanças (extend monitoring) MAS:
#  - signatures não mudam
#  - critical phrases não removidas
```

## 9. Tests aggregate

- Pre-W3 D2: CLI 78/78 (W3 D1 final)
- W3 D2: +35 (telemetry 8 + hub 7 + dashboard PACK 4 + persona 8 + safety monitor 8)
- Total: ~113 CLI verdes

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave3-day2-activation-hub vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11)
- safety_boost.js: extensão monitoring NÃO altera signatures · critical phrases preservadas
- mooter_event schema INTACTO
- consent.json: signature HMAC user-verificável · default opt-OUT · zero prompt_content
- `mooter hub`: 5 sections · sugestões determinísticas (não LLM) · zero números inventados
- Dashboard PACK section: graceful 'none' quando vazio · honestidade preservada
- Persona-aware: 3 personas + 'Other' fallback · profile.json persist · backward compat
- trail --safety --by-keyword: threshold 30% · warning emitido OK
- ~113 tests CLI verdes
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify, sem network calls
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave3-day2-activation-hub
PR=$(gh pr create --base dev --title "Wave 3 Day 2: Activation + Local Hub (5 sub-features)" --body-file - <<'EOF'
## Summary
Fundação activation + hub local (sem network ainda — Wave 4 Phase D faz Cloudflare):
- Telemetry opt-in audit-trail signed (HMAC user-verificável)
- `mooter hub` TUI (packs · safety · evolution · suggestions)
- PACK section no dashboard (fix MIN-1 W2.7 audit)
- Persona-aware recommendations (Solo Founder / Senior IC / OSS Maintainer / Other)
- Safety over-boost monitor (NIT W3 D1 — `mooter trail --safety --by-keyword`)

## P11 + invariants
- classify.js byte-identical ✓
- safety_boost.js critical phrases preserved ✓
- mooter_event schema INTACTO ✓
- ZERO network calls (opt-in só prepara, não envia) ✓

## Honesty
- Sugestões `mooter hub` são determinísticas (regras), não LLM-generated
- Zero inventar (telemetry sem opt-in → "no consent" honesto)
- HMAC signature user-verifiable (key local)

## Tests
- CLI: 78 → ~113 (+35)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog Wave 3
- D3: Hub remote sync stub (prep Wave 4 CF Workers contract)
- D4+: Wave 4 transition (auth + dashboard + CF)
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure D2

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter hub  # quit with q
mooter trail --safety --by-keyword
mooter dashboard  # confirma PACK section visível

# Tag
git tag -a v0.3.1-activation-hub -m "Wave 3 D2: Activation + Local Hub (telemetry opt-in + mooter hub + PACK section + persona-aware + safety monitor)"
git push origin v0.3.1-activation-hub
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave3_d2_shipped.md`.

## 13. Resumo final

```
✅ Wave 3 Day 2 — Activation + Local Hub COMPLETA
- Branch: wave3-day2-activation-hub (merged)
- 5 sub-features: telemetry opt-in · mooter hub · dashboard PACK · persona-aware · safety monitor
- Tests: ~113 CLI verdes
- Tag: v0.3.1-activation-hub
- P11 invariant: ✅ classify.js byte-identical
- safety_boost.js critical phrases: ✅ preserved
- Zero network calls
- 100% local

⏸ Para. Wave 3 D3 (hub remote sync stub) OU Wave 4 transition precisa de novo kickoff do Cowork.
```

=== END ===
