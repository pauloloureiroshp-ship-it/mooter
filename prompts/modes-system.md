# frugal — Modes System Master Prompt
## Beast Mode 🦁 · Zen Mode 🧘 · Auto ⚡

> **Instrução para Claude Code**: Implementa o sistema de modos do frugal.
> Este prompt fecha o loop de controlo manual do utilizador: Beast quando o tempo importa,
> Zen quando os tokens importam, Auto para o router inteligente normal.

---

## Contexto

O frugal router já tem routing automático inteligente (90%+ savings validados em 1,437 prompts).
Mas há dois casos extremos que o routing automático não cobre:

1. **"Não me importa o custo, preciso de velocidade e qualidade máxima agora."** → Beast Mode
2. **"Estou sem tokens/dinheiro, preciso de minimizar absolutamente tudo."** → Zen Mode

Os utilizadores querem controlo manual explícito via slash commands, sem ter de editar configs.

---

## Ficheiros criados (já existem no repo — não recriar)

```
~/frugal/tools/router/frugal-mode.js          ← CLI para set/get/clear mode
~/frugal/skills/frugal-beast/SKILL.md         ← /frugal-beast skill
~/frugal/skills/frugal-zen/SKILL.md           ← /frugal-zen skill
~/frugal/skills/frugal-auto/SKILL.md          ← /frugal-auto skill
```

---

## Step 1 — Modificar inject_context.js

Adicionar leitura do modo activo **imediatamente após o bloco `applyBudgetCap`** (linha ~621).
O modo sobrepõe o tier antes de emitir o hint.

Localiza esta secção em `~/.claude/tools/router/inject_context.js`:

```javascript
// Apply budget guardrail before deciding what to emit.
const isHighRisk = HIGH_RISK_HINT.test(prompt);
const budget = getBudget(prompt, isHighRisk);
if (budget) {
  const originalTier = decision.tier;
  decision.tier = applyBudgetCap(decision.tier, budget);
  decision.max_tier = applyBudgetCap('T3', budget);
  if (decision.tier !== originalTier) {
    decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
      ? decision.escalation_rule + '+budget_cap'
      : 'budget_cap';
  }
} else {
  decision.max_tier = 'T3';
}
```

**Adicionar DEPOIS desse bloco (antes do `if (decision.confidence < 0.6)`):**

```javascript
// ── Active Mode override (v0.9.3) ────────────────────────────────────────
// Reads ~/.claude/tools/router/.frugal-mode.json set by frugal-mode.js.
// beast → floor T3 on all prompts (bypass budget cap).
// zen   → ceil T1 on all prompts (except T3-gate safety tasks).
// auto  → file absent, no override.
// Silent on any read error.
(function applyActiveMode() {
  const MODE_FILE = path.join(ROUTER_DIR, '.frugal-mode.json');
  let activeMode = null;
  try {
    if (fs.existsSync(MODE_FILE)) {
      const raw = fs.readFileSync(MODE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.mode && data.mode !== 'auto') activeMode = data.mode;
    }
  } catch { /* silent */ }

  if (!activeMode) return;

  const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

  if (activeMode === 'beast') {
    // Force T3 regardless of classifier, budget, or arbiter.
    decision.tier = 'T3';
    decision.max_tier = 'T3';
    decision.escalation_rule = 'beast_mode';
    decision.active_mode = 'beast';
  } else if (activeMode === 'zen') {
    // Cap at T1 unless this is a T3-gate safety task.
    const isGate = decision.escalation_rule === 'T3_gate' ||
                   /\b(push|merge|deploy|release|migration)\b/i.test(prompt);
    if (!isGate) {
      const currentIdx = TIER_ORDER.indexOf(decision.tier);
      if (currentIdx > 1) { // > T1
        decision.tier = 'T1';
        decision.escalation_rule = (decision.escalation_rule && decision.escalation_rule !== 'none')
          ? decision.escalation_rule + '+zen_cap'
          : 'zen_cap';
      }
      decision.max_tier = 'T1';
      decision.active_mode = 'zen';
    }
    // If it IS a gate task, zen mode is bypassed for safety. Log it.
    if (isGate) {
      decision.active_mode = 'zen_bypassed_gate';
    }
  }
})();
// ─────────────────────────────────────────────────────────────────────────
```

**Atenção**: edita `~/.claude/tools/router/inject_context.js` (runtime), não `~/frugal/tools/router/inject_context.js` (source).
Também edita o source para ficarem em sync.

---

## Step 2 — Adicionar active_mode ao router-hint output

Localiza a secção de output do hint (procura `router-hint` ou o bloco que emite `TIER:`).
Adiciona esta linha **se** `decision.active_mode` existir:

```javascript
// No bloco que constrói o hint string:
if (decision.active_mode) {
  hint += `MODE: ${decision.active_mode}\n`;
  hint += `FORCED: true\n`;
}
```

---

## Step 3 — Instalar skills

```bash
for skill in frugal-beast frugal-zen frugal-auto; do
  mkdir -p ~/.claude/skills/$skill
  cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md
done
echo "✓ Mode skills installed"
```

---

## Step 4 — Adicionar frugal-mode.js ao runtime

```bash
cp ~/frugal/tools/router/frugal-mode.js ~/.claude/tools/router/frugal-mode.js
chmod +x ~/.claude/tools/router/frugal-mode.js
echo "✓ frugal-mode.js installed"
```

---

## Step 5 — Smoke test

```bash
# Testa set/get/clear
node ~/.claude/tools/router/frugal-mode.js beast
node ~/.claude/tools/router/frugal-mode.js --read
node ~/.claude/tools/router/frugal-mode.js zen
node ~/.claude/tools/router/frugal-mode.js --read
node ~/.claude/tools/router/frugal-mode.js auto
node ~/.claude/tools/router/frugal-mode.js --read

# Verifica que o ficheiro foi apagado após auto
ls ~/.claude/tools/router/.frugal-mode.json 2>/dev/null && echo "FAIL: ficheiro existe" || echo "PASS: ficheiro ausente"
```

Expected output:
```
🦁 frugal — Beast Mode activado!
{"mode":"beast","active_since":"...","version":"1.0","active":true}   ← beast
🧘 frugal — Zen Mode activado.
{"mode":"zen","active_since":"...","version":"1.0","active":true}     ← zen
⚡ frugal — Auto Mode activado.
{"mode":"auto","active":false}                                        ← auto
PASS: ficheiro ausente
```

---

## Step 6 — Testar hook integration

```bash
# Com beast mode activo:
node ~/.claude/tools/router/frugal-mode.js beast
echo '{"prompt":"muda a cor do botão"}' | node ~/.claude/tools/router/inject_context.js
# Esperado: TIER: T3, MODE: beast, FORCED: true

# Limpa e confirma auto routing:
node ~/.claude/tools/router/frugal-mode.js auto
echo '{"prompt":"muda a cor do botão"}' | node ~/.claude/tools/router/inject_context.js
# Esperado: TIER: T0 ou T1 (routing normal — tarefa trivial)
```

---

## Step 7 — Actualizar install.sh

No `~/frugal/install.sh`, adicionar ao bloco de skills install (após o loop existente):

```bash
# Mode skills (Beast / Zen / Auto)
for skill in frugal-beast frugal-zen frugal-auto; do
  mkdir -p ~/.claude/skills/$skill
  cp "$FRUGAL_DIR/skills/$skill/SKILL.md" ~/.claude/skills/$skill/SKILL.md
done

# frugal-mode.js runtime
cp "$FRUGAL_DIR/tools/router/frugal-mode.js" ~/.claude/tools/router/frugal-mode.js
chmod +x ~/.claude/tools/router/frugal-mode.js
```

E no doctor check (`/frugal-status`), adicionar:

```bash
# Mode skills check
for skill in frugal-beast frugal-zen frugal-auto; do
  if [ -f ~/.claude/skills/$skill/SKILL.md ]; then
    echo "✓ /$skill"
  else
    echo "⚠ /$skill não instalado — corre: cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/"
  fi
done

# frugal-mode.js check
if [ -f ~/.claude/tools/router/frugal-mode.js ]; then
  echo "✓ frugal-mode.js"
  node ~/.claude/tools/router/frugal-mode.js 2>/dev/null || echo "  (modo: auto)"
else
  echo "⚠ frugal-mode.js ausente"
fi
```

---

## Step 8 — Actualizar frugal-update (SKILL.md)

No `~/frugal/skills/frugal-update/SKILL.md`, adicionar ao Step 5 (sync runtime):

```bash
cp ~/frugal/tools/router/frugal-mode.js ~/.claude/tools/router/frugal-mode.js

for skill in frugal-beast frugal-zen frugal-auto; do
  mkdir -p ~/.claude/skills/$skill
  cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md
done
```

---

## Comportamento esperado para o utilizador

| Utilizador escreve | O que acontece |
|---|---|
| `/frugal-beast` | Skill activa. `frugal-mode.js beast` escreve `.frugal-mode.json`. Todos os prompts seguintes → T3. |
| `/frugal-zen` | Skill activa. `frugal-mode.js zen` escreve `.frugal-mode.json`. Todos os prompts seguintes → máx T1. |
| `/frugal-auto` | Skill activa. `frugal-mode.js auto` apaga `.frugal-mode.json`. Router normal. |
| `@opus` inline | User override tem precedência sobre zen mode (já implementado em classify.js). |
| `git push` com zen activo | T3-gate bypass: final-reviewer ainda corre mesmo em zen mode. |
| `/frugal-status` | Mostra modo activo como parte do health check. |

---

## Modo como aparece no router-hint

**Beast Mode activo:**
```
<router-hint>
TASK_CATEGORY: ui_change
TIER: T3
MODE: beast
FORCED: true
RECOMMENDED_MODEL: claude-opus-4-6
CONFIDENCE: 0.94
</router-hint>
```

**Zen Mode activo (tarefa normal):**
```
<router-hint>
TASK_CATEGORY: ui_change
TIER: T1
MODE: zen
FORCED: true
ZEN_CAP: T1
RECOMMENDED_MODEL: claude-haiku-4-5
CONFIDENCE: 0.94
</router-hint>
```

**Zen Mode + gate task (bypass):**
```
<router-hint>
TASK_CATEGORY: pre_push
TIER: T3
MODE: zen_bypassed_gate
FORCED: false
RECOMMENDED_MODEL: claude-opus-4-6
CONFIDENCE: 0.99
</router-hint>
```

---

## Commit message sugerido

```
feat(modes): add Beast/Zen/Auto mode system with slash commands

- frugal-mode.js: CLI to set/get/clear active mode via .frugal-mode.json
- inject_context.js: reads active mode, overrides tier before hint emission
  - beast: forces T3 on all prompts, bypasses budget cap
  - zen: caps at T1, except T3-gate safety tasks
  - auto: clears mode, router decides normally
- Skills: /frugal-beast, /frugal-zen, /frugal-auto
- install.sh: updated to copy mode skills and frugal-mode.js
- frugal-update: syncs mode files on update

Closes: GSD-mode user request (F*ck-the-budget + saving-mode variants)
```

---

## Verificação final

```bash
# Skills instaladas
ls ~/.claude/skills/frugal-{beast,zen,auto}/SKILL.md

# Runtime
ls ~/.claude/tools/router/frugal-mode.js

# Modo activo (deve ser auto)
node ~/.claude/tools/router/frugal-mode.js

# Hook integration
node ~/.claude/tools/router/inject_context.js --version 2>/dev/null || echo "hook ok"
```
