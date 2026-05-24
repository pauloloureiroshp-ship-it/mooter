# MP-20 — Savings Transparency: mecânica clara em todas as superfícies

**Objectivo:** Tornar a metodologia de savings completamente transparente e coerente em todas as superfícies — terminal statusline, VSCode plugin, dashboard área logada, e landing page — de forma que qualquer utilizador (ou potencial cliente num modelo success-fee) consiga compreender exactamente de onde vem o número.

**Problema central:** O frugal já tem a metodologia correcta (`COST_MODEL.md` é excelente), mas essa clareza **não chega ao utilizador** — o VSCode mostra `~$X.XX` sem explicar o `~`, o terminal mostra `session: 0%` sem contexto, e o dashboard não distingue visualmente advisory de guaranteed.

---

## CONTEXTO TÉCNICO — como o savings funciona hoje

### A mecânica em 4 conceitos

```
1. naive_cost      = o que custaria se Opus processasse TUDO
                     Fórmula: Σ naiveOpusCost(prompt_len)
                     Modelo: claude-opus-4-6 @ $15/MTok input, $75/MTok output
                     Base: 8000 tokens contexto + prompt_len/3.5

2. real_cost_est   = o que o frugal estimou gastar com o tier escolhido
                     Fórmula: Σ estimateTurnCost(tier_model, tokens)
                     T0 Ollama = $0, T1 Haiku = $0.80/$4.00 MTok,
                     T2 Sonnet = $3/$15 MTok, T3 Opus = $15/$75 MTok

3. advisory_saved  = naive_cost - real_cost_est       ← tilde (~)
                     "Se o router foi respeitado, poupaste isto"
                     Limitação: não sabe se o modelo ignorou o hint

4. guaranteed_saved = option_a_hits × avg_naive_per_prompt  ← sem tilde
                     "Estes prompts foram respondidos por Ollama verbatim"
                     Único número que se pode auditar
```

### Porque é que existe o `~` (tilde)

O classifier emite um `<router-hint>`. O Claude Code pode ignorá-lo. Se ignorar, o savings não foi real — foi uma estimativa optimista. O `~` sinaliza exactamente isso: "assumi que o hint foi honrado". Quando não há tilde, houve um `option_a_hit` verificável no log.

### Ficheiros fonte de dados
- `tools/router/decisions.log` — JSONL, fonte de verdade local
- `tools/router/savings-tracker.js` — HTTP :7821, serve /metrics
- `tools/router/pricing.js` — preços por modelo, SSOT
- `vscode-extension/extension.js` — lê /metrics e mostra na statusbar
- `landing/app/(app)/dashboard/page.tsx` — mostra savings na área logada

---

## PEÇA 1 — Terminal statusline: session% + total% + metodologia visível

### Estado actual
```
⚡ frugal  session: 0% · total: 71% · 409 decisions
```
(Implementado no MP-18 — confirmar se está live)

### O que adicionar: linha de contexto no turn header

Em `tools/router/frugal-turn-header.js` (ou onde o header é gerado), após a linha de tier/model, adicionar uma linha de contexto quando `saved_pct < 10%` na sessão:

```
⚡ frugal  T3 Opus · session: 0% · total: 71% · 419 decisions
ℹ  Session 100% Opus porque este prompt foi classificado T3 (architectural decision).
   Total savings: ~$73.85 (advisory) · $2.14 guaranteed · methodology: token-estimated
```

**Regras:**
- Linha ℹ só aparece se `session_saved_pct < 5%` (sessão pesada)
- Mostra `advisory` vs `guaranteed` explicitamente
- Não mais de 2 linhas — não polui o terminal

**Implementação em `inject_context.js`:**

Após o bloco que constrói o statusline, adicionar:

```js
// Contexto de metodologia quando sessão é pesada
const sessionPct = sessionMetrics?.saved_pct || 0;
const totalSaved = totalMetrics?.saved || 0;
const guaranteedSaved = totalMetrics?.guaranteed_saved || 0;
const totalDecisions = totalMetrics?.prompts || 0;

if (sessionPct < 5 && totalDecisions > 10) {
  const advisoryLabel = `~$${totalSaved.toFixed(2)} advisory`;
  const guaranteedLabel = guaranteedSaved > 0 ? ` · $${guaranteedSaved.toFixed(2)} guaranteed` : '';
  contextLine = `\nℹ  Total savings: ${advisoryLabel}${guaranteedLabel} · methodology: token-estimated vs Opus baseline`;
}
```

---

## PEÇA 2 — VSCode plugin: clareza visual no tooltip + sidebar

### Estado actual do plugin (v0.5.1)

A statusbar mostra: `💰 $73.85 │ 419 prompts │ 2.1M tokens`

O tooltip já tem a tabela correcta com `Saved (est)` e `Guaranteed saved`. O problema é que o utilizador não sabe o que significa o `~`.

### 2a. Adicionar `~` explícito na statusbar

```js
// Antes:
statusBarItem.text = `💰 ${saved} │ ${metrics.prompts} prompts │ ${tokens} tokens`;

// Depois:
const isAdvisory = (metrics.guaranteed_saved || 0) < metrics.saved * 0.1;
const prefix = isAdvisory ? '~' : '';
statusBarItem.text = `💰 ${prefix}${saved} saved │ ${metrics.prompts} prompts`;
```

### 2b. Melhorar tooltip — explicar advisory vs guaranteed

No bloco `tooltipLines`, substituir as linhas actuais de savings por:

```js
`| **Saved (advisory ~)** | **${fmtUsd(metrics.saved)} (${pct}%)** |`,
`| Guaranteed saved | ${fmtUsd(metrics.guaranteed_saved || 0)} |`,
`| | _advisory = token-estimated vs Opus baseline_ |`,
`| | _guaranteed = Option-A hits (Ollama verbatim)_ |`,
```

### 2c. Sidebar webview — adicionar secção "How savings are calculated"

No método `renderHtml()` do `SavingsViewProvider`, adicionar após a tier breakdown, uma secção colapsável:

```html
<details style="margin-top:12px">
  <summary style="cursor:pointer;font-size:0.8em;color:var(--muted)">How is this calculated?</summary>
  <div style="font-size:0.75em;margin-top:8px;line-height:1.5;color:var(--muted)">
    <p><strong>Advisory (~)</strong>: token-estimated. Assumes frugal's routing hint was honoured.
    Formula: <code>naive_opus_cost − estimated_real_cost</code></p>
    <p><strong>Guaranteed</strong>: only Option-A hits — prompts where Ollama answered verbatim
    inside the hook, bypassing Opus processing.</p>
    <p>Naive baseline: Claude Opus 4.6 at $15/MTok input, $75/MTok output.</p>
    <p><a href="https://landing-five-azure-16.vercel.app/methodology">Full methodology →</a></p>
  </div>
</details>
```

### 2d. Bump versão do plugin para 0.5.2

Em `vscode-extension/package.json`, actualizar `"version": "0.5.1"` → `"0.5.2"`.

---

## PEÇA 3 — Dashboard área logada: Savings Hero com metodologia

### Estado actual

O dashboard tem um `SavingsHeroCard` (ou KPI tiles) que mostra `savings_usd` do Supabase. Não distingue advisory de guaranteed. Não explica a metodologia.

### 3a. SavingsHeroCard redesenhado

Em `landing/app/(app)/dashboard/page.tsx`, localizar o componente `SavingsHeroCard` (ou o bloco de KPI tiles) e substituir por:

```tsx
function SavingsHeroCard({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const savingsUsd = Number(cfg.savings_usd || 0);
  const decisionsCount = Number(cfg.decisions_count || 0);
  const guaranteedUsd = Number(cfg.guaranteed_saved_usd || 0);
  const advisoryPct = savingsUsd > 0 ? Math.round(((savingsUsd - guaranteedUsd) / savingsUsd) * 100) : 100;

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--t0) 8%, var(--surface)) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '1.5rem',
      marginBottom: '1.5rem',
    }}>
      {/* Hero number */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--t0, #4ec9b0)', fontFamily: 'var(--mono)' }}>
          ~${savingsUsd.toFixed(2)}
        </span>
        <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>saved (advisory)</span>
      </div>

      {/* Guaranteed pill */}
      {guaranteedUsd > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--t0) 15%, transparent)', borderRadius: 20, padding: '2px 10px', marginBottom: 12 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--t0)' }}>✓ ${guaranteedUsd.toFixed(2)} guaranteed</span>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{decisionsCount.toLocaleString()}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>decisions routed</div>
        </div>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{advisoryPct}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>advisory estimate</div>
        </div>
        {guaranteedUsd > 0 && (
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--t0)' }}>
              {Math.round((guaranteedUsd / savingsUsd) * 100)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>verified savings</div>
          </div>
        )}
      </div>

      {/* Methodology explanation */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)', userSelect: 'none' }}>
          How is this calculated? ↓
        </summary>
        <div style={{ marginTop: 10, fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'var(--fg)' }}>Advisory (~)</strong> — token-estimated.
            Compares what each prompt would cost if processed by Claude Opus 4.6
            vs the actual tier used (T0 Ollama = $0, T1 Haiku, T2 Sonnet, T3 Opus).
            Assumes routing hints were honoured.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'var(--t0)' }}>Guaranteed</strong> — verifiable.
            Only counts Option-A hits: prompts where Ollama answered inside the hook
            and Opus processed zero tokens for the response.
          </p>
          <p style={{ margin: 0 }}>
            Baseline: Opus 4.6 @ $15/MTok input · $75/MTok output.
            Session context base: 8,000 tokens.
          </p>
        </div>
      </details>
    </div>
  );
}
```

### 3b. Passar `guaranteed_saved_usd` no sync

Em `tools/router/frugal-doctor.js` (e em `tools/router/auto-sync.js`), adicionar `guaranteed_saved_usd` ao payload:

```js
// No bloco de metrics:
const guaranteedSavedUsd = metricsRes.json.guaranteed_saved || 0;

// No payload:
payload.guaranteed_saved_usd = guaranteedSavedUsd;
```

Em `landing/app/api/install-complete/route.ts`, no bloco `frugal_config`, adicionar:

```ts
guaranteed_saved_usd: payload.guaranteed_saved_usd ?? existingConfig.guaranteed_saved_usd ?? 0,
```

E adicionar `guaranteed_saved_usd?: number` à interface `InstallPayload`.

---

## PEÇA 4 — Página pública /methodology na landing

Esta página é essencial para o modelo success-fee: mostra a metodologia de forma auditável, com fórmulas e limitações honestas. Baseia-se no `COST_MODEL.md` existente mas com design e linguagem para não-técnicos.

### Criar `landing/app/methodology/page.tsx`

```tsx
export default function MethodologyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'var(--sans)' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        How frugal measures savings
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Last updated: April 2026 · <a href="https://github.com/pauloloureiroshp-ship-it/frugal">Source</a>
      </p>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>The short version</h2>
        <p>
          frugal compares what you <em>actually spent</em> (with routing) against
          what you <em>would have spent</em> if every prompt had been processed by
          Claude Opus 4.6. The difference is your saving.
        </p>
        <p>
          Because frugal cannot intercept real API billing, it estimates costs from
          the number of tokens in each prompt. Numbers marked with <strong>~</strong>
          are estimates. Numbers without ~ are verified.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>The two numbers</h2>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: '1.2rem' }}>~</span>
            Advisory savings
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <code>advisory_saved = naive_opus_cost − estimated_real_cost</code>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Assumes frugal's routing recommendation was followed. If Claude Code
            processed a T0 prompt in Opus anyway, this number is still counted —
            making it optimistic.
          </p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--t0) 40%, var(--border))', borderRadius: 8, padding: '1rem 1.25rem' }}>
          <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--t0)', fontSize: '1.2rem' }}>✓</span>
            Guaranteed savings
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <code>guaranteed_saved = option_a_hits × avg_naive_cost_per_prompt</code>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Only counts Option-A hits: prompts where a local Ollama model generated
            the answer inside the hook and Opus output it verbatim — zero Opus
            reasoning tokens spent. These are auditable in <code>decisions.log</code>.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>Pricing baseline</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0' }}>Model</th>
              <th style={{ textAlign: 'right', padding: '6px 0' }}>Input ($/MTok)</th>
              <th style={{ textAlign: 'right', padding: '6px 0' }}>Output ($/MTok)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Claude Opus 4.6 (baseline)', '$15.00', '$75.00'],
              ['Claude Sonnet 4.6 (T2)', '$3.00', '$15.00'],
              ['Claude Haiku 4.5 (T1)', '$0.80', '$4.00'],
              ['Ollama local (T0)', '$0', '$0'],
            ].map(([model, input, output]) => (
              <tr key={model} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0' }}>{model}</td>
                <td style={{ textAlign: 'right', padding: '6px 0', fontFamily: 'var(--mono)' }}>{input}</td>
                <td style={{ textAlign: 'right', padding: '6px 0', fontFamily: 'var(--mono)' }}>{output}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
          Prices from Anthropic's API pricing page. frugal uses token-estimated
          costs, not real API billing. Session context base: 8,000 tokens per turn.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>Known limitations</h2>
        <ul style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
          <li><strong>Routing compliance:</strong> frugal emits hints; it cannot enforce them. Advisory savings assume 100% compliance.</li>
          <li><strong>Sub-agent overhead:</strong> When Opus spawns a Sonnet sub-agent, Opus still pays tokens to delegate and integrate. This round-trip is not measured.</li>
          <li><strong>Context variability:</strong> Real sessions with many MCP servers can have 12,000–18,000 base tokens, not 8,000. Savings may be understated.</li>
          <li><strong>No real billing access:</strong> frugal does not connect to Anthropic's billing API. A future version will use the OAuth usage endpoint to cross-reference estimates with real spend.</li>
        </ul>
      </section>

      <section>
        <h2>Verify yourself</h2>
        <pre style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', fontSize: '0.8rem', overflowX: 'auto' }}>{`# Real-time metrics from your local tracker
curl -s http://127.0.0.1:7821/metrics | jq '{
  advisory: .saved,
  guaranteed: .guaranteed_saved,
  prompts: .prompts,
  pct: .saved_pct
}'

# Human-readable summary
curl -s http://127.0.0.1:7821/summary

# Raw decisions log (local, never uploaded)
tail -20 ~/.claude/tools/router/decisions.log | jq .`}</pre>
      </section>
    </main>
  );
}
```

### Adicionar link no footer da landing page

Em `landing/app/page.tsx`, no footer, adicionar:
```tsx
<a href="/methodology">Savings methodology</a>
```

---

## PEÇA 5 — frugal-doctor: secção de savings breakdown explícita

Adicionar ao output do `frugal-doctor.js` (secção 9 — Savings Summary) uma linha a explicar a metodologia:

```
9. Savings Summary
──────────────────────────────────────────────────
✓  Total decisions        419
✓  Savings % (advisory)   68%  ← token-estimated vs Opus baseline, assumes hints honoured
✓  Saved (advisory ~)     ~$73.85
○  Guaranteed saved        $2.14  ← only Option-A hits (Ollama verbatim)
✓  Advisory covers         97% of total  (3% verified)
✓  Actual spend           ~$0.00
✓  T0 (Ollama/free)       59%
✓  T3 (Opus)              29%
```

**Implementação:** No bloco da secção 9 em `frugal-doctor.js`, substituir os `row()` calls por versões mais explicativas e adicionar a linha `Advisory covers X%`.

---

## PEÇA 6 — COST_MODEL.md: actualização de preços e success-fee section

O `COST_MODEL.md` está excelente mas tem duas lacunas:

**6a. Actualizar preços** — verificar se os preços em `pricing.js` batem com os actuais da Anthropic (a doc diz "Last reviewed: 2026-04-07" — confirmar que continuam correctos).

**6b. Adicionar secção "Success-fee model"** no final do `COST_MODEL.md`:

```markdown
## Success-fee model (v0.9+)

A frugal success-fee charges a percentage of **verified savings** —
i.e., `guaranteed_saved`, not `advisory_saved`.

### Why guaranteed only?
Advisory savings are estimates. Charging on estimates creates disputes.
`guaranteed_saved` is auditable: every `option_a_hit` in `decisions.log`
has a timestamp, a prompt hash, and the Ollama model that generated the
answer. A client can independently verify every entry.

### Current fee structure (reference)
| Tier | Verified savings/month | Fee |
|---|---|---|
| Starter | < $50 | 0% |
| Growth | $50 – $500 | 15% of verified savings |
| Scale | > $500 | 10% of verified savings |

### How to audit
```bash
# Export all option_a_hit events for a given month
node ~/.claude/tools/router/backtest.js --export-delta --since 2026-04-01
# The output includes prompt_count, guaranteed_saved, and audit trail
```

### What increases guaranteed savings
1. **Ollama installed + qwen3:30b** — better Option-A quality → more hits
2. **Low-complexity project** — more T0-eligible prompts
3. **High prompt volume** — law of large numbers → more Option-A hits
```

---

## ORDEM DE EXECUÇÃO

```
PEÇA 3b (passar guaranteed_saved_usd no frugal-doctor + auto-sync)
  → PEÇA 3a (SavingsHeroCard redesenhado no dashboard)
  → PEÇA 2 (VSCode plugin: ~ explícito + tooltip + sidebar + bump 0.5.2)
  → PEÇA 1 (terminal: linha ℹ quando sessão pesada)
  → PEÇA 5 (frugal-doctor: savings breakdown explícito)
  → PEÇA 4 (página /methodology + link no footer)
  → PEÇA 6 (COST_MODEL.md: preços + success-fee section)
```

---

## TESTES A CORRER NO FINAL

```bash
# 1. Sync para confirmar guaranteed_saved_usd no Supabase
node tools/router/frugal-doctor.js --sync

# 2. TypeScript check
cd landing && npx tsc --noEmit

# 3. Verificar que /methodology está acessível
# (após vercel deploy) curl https://landing-five-azure-16.vercel.app/methodology

# 4. VSCode: abrir o plugin e confirmar ~ na statusbar
# e tooltip com "advisory" vs "guaranteed"
```

---

## COMMIT SUGERIDO

```
feat(transparency): savings methodology visible in all surfaces + success-fee model (MP-20)
```

---

## RESTRIÇÕES

1. **Não mudar a fórmula de cálculo** — `COST_MODEL.md` e `savings-tracker.js` estão correctos. Só melhorar a comunicação.
2. **`~` na statusbar só se guaranteed < 10% do advisory** — se a maioria for guaranteed, não mostrar tilde.
3. **Página /methodology é pública** — não precisa de auth. Usar `app/methodology/page.tsx` fora do route group `(app)`.
4. **Success-fee section no COST_MODEL.md é referência** — as percentagens são placeholder. Paulo decide os valores reais.
5. **guaranteed_saved_usd no InstallPayload é opcional** — não quebrar syncs antigos que não enviam o campo.
6. **VSCode plugin: não publicar no marketplace agora** — bump versão local apenas (L7 ainda pendente).
