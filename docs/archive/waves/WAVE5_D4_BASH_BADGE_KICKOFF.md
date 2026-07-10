# Wave 5 D4 — Bash Badge Always-On (NIT Paulo #4)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.5.2-statusline-v2` em dev (W5 D3). Working dir = `~/mooter`.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave5-d4-bash-badge` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 5 D4**: investigar e fix por que badge `[🐂 sonnet ☁ 0.84]` parece não aparecer em cada bash command (NIT Paulo #4). Tornar always-on por default + opção threshold.

### Recon OBRIGATÓRIO

```bash
# Badge actual implementation
cat tools/router/inject_context.js | grep -A 20 'badge'
cat tools/router/badge.js 2>/dev/null

# Threshold actual (Wave 2.5 D3 default 0.6)
grep -rn 'confidence.*0\.6\|confidence_threshold\|badge.*threshold' tools/router/

# Hook UserPromptSubmit wiring
cat ~/.claude/settings.json | grep -A 10 UserPromptSubmit

# Check if badge actually injects
echo "test prompt" | bash $HOME/.claude/tools/router/inject_context.js 2>&1 | head -20
```

**Reporta o que descobrires antes de implementar.** Possíveis causas:
- Threshold 0.6 é demasiado alto (muitos prompts ficam abaixo)
- `mooter quiet` desligou badge para esta session
- Hook UserPromptSubmit não wirado
- Badge só injecta quando hint emite (W2.5 D3 confidence ≥ 0.6 condition)

## 1. Invariantes

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost + adapter_selection + glyphs INTACTOS**
- ❌ **mooter_event + sync_event + adapter_manifest schemas INTACTOS**
- ❌ **hub/ + landing/ NOT touched**
- ❌ **NÃO inventar confidence** — usar real do classify.js
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.5.3-bash-badge-always-on**
- ✅ **Vocabulário GLOSSARY**

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma v0.5.2-statusline-v2
git checkout -b wave5-d4-bash-badge
```

## 3. Sub-features (4)

### 3.1 Sub-feature 1 — Investigation + reporte

Documenta o que descobriste no recon:
- Threshold actual
- Onde está suprimido
- Hook wiring status

**Reportar findings ao Paulo via chat antes de prosseguir** (lição 4×).

### 3.2 Sub-feature 2 — Badge always-on (when not muted)

Remover threshold 0.6 (W2.5 D3 default). Novo behaviour:
- Default: badge sempre presente (qualquer confidence)
- Format low confidence: `[? sonnet ☁ 0.42]` (? indica low confidence)
- Format high confidence: `[🐂 sonnet ☁ 0.85]`

Threshold configurável via:
- `mooter quiet --badge-threshold=0.4` — set custom
- `mooter quiet --badge-always` — show even at 0.0
- `mooter quiet --badge-off` — disable entirely

### 3.3 Sub-feature 3 — Stop hook MOO card always include adapter info

Moo card (Wave 2.6 D3) — ensure adapter row appears even when baseline:
```
 adapter   ◌ baseline · forge ships D2 → install via mooter forge
```

### 3.4 Sub-feature 4 — Hide low-quality boost reasons

Se safety_boost foi applied:
```
[🐂 sonnet ☁ 0.85 boosted from T1 · architectural_keyword]
```

Add `boosted_from` info to badge when safety_boost.applied = true.

## 4. Tests

`tools/router/tests/badge-always-on.test.js` (NEW):
- Badge present at confidence 0.4 (low)
- Badge format with `?` glyph quando confidence < 0.5
- `mooter quiet --badge-threshold=0.7` respects threshold
- `mooter quiet --badge-off` suppresses badge
- safety_boost.applied=true → adds "boosted from" info

## 5. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev tools/router/adapter_selection.js            # signature pattern
git diff dev hub/ landing/                                # VAZIO

# Manual smoke
mooter quiet --help | grep badge
```

## 6. Tests aggregate

- Pre-W5 D4: ~188 (W5 D3)
- W5 D4: +12 (badge always 4 + threshold 3 + boost info 2 + flags 3)
- Total: ~200 verdes

## 7. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave5-d4-bash-badge vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + glyphs INTACTOS
- schemas INTACTOS
- hub/ + landing/ NOT touched
- Badge always shown unless --badge-off
- Low confidence uses ? glyph clear
- safety_boost info added when applicable
- Threshold configurable
- ~200 tests verdes
- Vocabulário GLOSSARY
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 8. PR + auto-merge + tag

```bash
git push -u origin wave5-d4-bash-badge
PR=$(gh pr create --base dev --title "Wave 5 D4: Bash Badge Always-On (NIT Paulo #4 fix)" --body-file - <<'EOF'
## Summary
4 sub-features que tornam o badge bash sempre visível:
- Investigation + report (root cause documented)
- Badge always-on (removes 0.6 threshold default)
- Moo card adapter row always present
- Boost reason info on badge when applied

## Tests
- ~200 verdes (+12)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 9. Closure D4

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

git tag -a v0.5.3-bash-badge-always-on -m "Wave 5 D4: Bash Badge Always-On (NIT Paulo #4)"
git push origin v0.5.3-bash-badge-always-on
```

+ Notion + SYNC + memória.

## 10. Resumo final

```
✅ Wave 5 D4 — Bash Badge Always-On COMPLETA
- Branch: wave5-d4-bash-badge (merged)
- 4 sub-features: investigation + always-on + adapter row + boost info
- Tests: ~200 verdes
- Tag: v0.5.3-bash-badge-always-on

⏸ Para. Sprint A (W5 D3 + W5 D4) complete. Próximo: Sprint B (User lifecycle web↔CLI).
```

=== END ===
