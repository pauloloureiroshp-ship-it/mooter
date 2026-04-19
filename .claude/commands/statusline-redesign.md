# /statusline-redesign — Statusline v2.0 "Badge, not Dashboard"

> **Lê TUDO antes de qualquer tool call:**
> ```
> Read /frugal/prompts/STATUSLINE_REDESIGN_MASTER.md   ← brief completo (obrigatório)
> Read /frugal/tools/router/gsd-statusline.js           ← ficheiro a modificar (792 linhas)
> ```

**Filosofia:** um olhar lateral de 100ms diz tudo. 2 linhas. Sempre. Hierarquia de cor rigorosa.

**Output alvo:**
```
╭─ 🔴 mooter  ▓ T2 ▓  sonnet-4-6  ·  14ms  ──────────────────────  ctx 63% ─╮
╰─ ████████████████████░░░░░░░░░░  90%↓ $1.68 saved  ·  $0.18 spent  · ● healthy ─╯
```

---

## FASE 0 — Snapshot

```bash
MOOTER_MOCK=1 node tools/router/gsd-statusline.js > /tmp/statusline_before.txt
cat /tmp/statusline_before.txt
```

---

## FASE 1 — Palette + helpers (não substitui nada)

1. `TIER_COLOR.T3` → `'#C25F65'` (rose, era `#f44747`)
2. Adicionar: `BRAND = '#C25F65'`, `HEALTHY = '#4ec9b0'`, `WARN = '#dcdcaa'`, `DANGER = '#C25F65'`
3. Criar `readRouterEnv()` — lê `MOOTER_LAST_TIER`, `MOOTER_CLASSIFY_MS`
4. Criar `tierToModelShort(tier)` — T0→`qwen3:30b`, T1→`haiku-4-5`, T2→`sonnet-4-6`, T3→`opus-4-6`
5. Criar `healthDot(pct)` — ● teal ≥30%, ● gold ≥10%, ● rose <10%
6. Criar `stripAnsi(str)` — regex inline, sem dependência

---

## FASE 2 — Extrair calcSavings()

Dentro de `renderSavingsHero()`, separar o cálculo do formato:

```javascript
// NOVA — só dados, sem strings
function calcSavings(mOpt, sessionId) {
  // mover aqui toda a lógica de cálculo existente
  // return { savingsPct, savedUsd, spentUsd, promptCount }
}
// renderSavingsHero() passa a chamar calcSavings() — backwards compat mantido
```

---

## FASE 3 — renderDistributionBar(metrics, sessionId, width)

Extrair só a barra colorida de `renderDistribution()`. Width parametrizável (usar 30).
`renderDistribution()` existente não é apagada — pode coexistir ou chamar a nova.

---

## FASE 4 — renderLine1() e renderLine2() (funções novas)

**renderLine1:**
- Esquerda: `╭─ 🔴 mooter  [bgColor T2]  dim(sonnet-4-6)  dim(14ms)`
- Fill: `─` repetido para encher `process.stdout.columns` (usar stripAnsi para largura real)
- Direita: `dim(ctx 63%) ─╮`
- Graceful: campos ausentes omitidos, nunca crash

**renderLine2:**
- `╰─` + barra 30ch + `savings %↓ $X saved` (bold) + `dim($Y spent)` + `healthDot` + `─╯`
- Chama `calcSavings()` para os números
- Chama `renderDistributionBar(metrics, sessionId, 30)` para a barra

---

## FASE 5 — Assembly final

```javascript
// buildStatusline() devolve exactamente:
return [renderLine1(metrics, sessionId), renderLine2(metrics, sessionId, savings)].join('\n');
```

`renderProviders()`, `renderLatency()`, `renderGpu()` — mover para `tools/router/mooter-stats.js`.
**Não apagar** — só deixar de chamar no assembly principal.

---

## FASE 6 — Testes

```bash
# Mock completo
MOOTER_MOCK=1 node tools/router/gsd-statusline.js

# Todos os tiers — cores diferentes
for tier in T0 T1 T2 T3; do
  MOOTER_MOCK=1 MOOTER_LAST_TIER=$tier node tools/router/gsd-statusline.js && echo "---"
done

# Zero-data — sem crash
node tools/router/gsd-statusline.js 2>&1

# Larguras
COLUMNS=80  MOOTER_MOCK=1 node tools/router/gsd-statusline.js
COLUMNS=160 MOOTER_MOCK=1 node tools/router/gsd-statusline.js

# Savings math idêntico
diff <(MOOTER_MOCK=1 node tools/router/gsd-statusline.js | grep -oE '[0-9]+%' | head -1) \
     <(grep -oE '[0-9]+%' /tmp/statusline_before.txt | head -1)

# Build
npm run build 2>/dev/null && echo "✅ BUILD OK" || echo "❌ BUILD FAIL"
```

---

## CHECKLIST

```
[ ] TIER_COLOR.T3 = '#C25F65'
[ ] helpers: readRouterEnv, tierToModelShort, healthDot, stripAnsi
[ ] calcSavings() extraída — renderSavingsHero() mantém backwards compat
[ ] renderDistributionBar(width=30) criada
[ ] renderLine1() — tier badge bgColor, model dim, classify dim, fill ─, ctx dim
[ ] renderLine2() — barra 30ch, %↓ bold, saved green, spent dim, healthDot
[ ] buildStatusline() → exactamente 2 linhas
[ ] mooter-stats.js criado com providers/latency/gpu
[ ] MOOTER_MOCK=1 → output completo e bonito
[ ] T0/T1/T2/T3 → badge muda de cor correctamente
[ ] COLUMNS=80 e COLUMNS=160 → layout não quebra
[ ] savings math idêntico ao before
[ ] zero-data graceful
[ ] build exit 0
[ ] SYNC.md: nota "statusline v2.0 shipped"
```

**Nota: `chalk` já importado. `stripAnsi` inline. Zero dependências novas.**
