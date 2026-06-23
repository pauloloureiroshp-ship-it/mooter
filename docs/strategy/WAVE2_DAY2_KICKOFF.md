# Wave 2 Day 2 — Kickoff master prompt

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/` (WSL2 Ubuntu), depois do PR #8 estar merged em `dev`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #8 merged em `dev` (`gh pr view 8 --json state -q .state` = MERGED)
- ✅ `git checkout dev && git pull origin dev` na working copy
- ✅ Ollama host responde em `host.docker.internal:11434` (se estiveres em devcontainer) ou `localhost:11434` (host)
- ✅ `claude --version` ≥ versão usada na Wave 1
- ✅ `ANTHROPIC_API_KEY` exportada (PAYG separada do Max sub)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day2-statusline-ambiguous-compression` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target)
- `~/frugal/` (router base, leitura)
- Ollama RTX 4090: `qwen2.5-coder:7b` (T0 default pós-Day 1), `qwen3:30b` (fallback raro), `nomic-embed-text` (Day 3, ignora hoje), `gemma3:12b`
- Anthropic Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 2**: shippar 3 sub-features em paralelo num único PR para `dev`:
1. **AMBIGUOUS scaffold** — desambiguação quando `axis2_confidence ∈ [0.45, 0.60]`
2. **Statusline wire** — wire `statusline-multi.js` ao Claude Code + auto-start `savings-tracker.js` + acrescentar `pack` info (linha 1) e placeholder `adapter` (linha 3)
3. **Animation-web compression** — baixar ceiling T3→T2 + compression hint no scaffold

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **Não criar `mooter init` wizard completo** — fica Day 6
- ❌ **Não desenhar 1-linha colapsada da statusline** — fica Day 6 (cross-platform)
- ❌ **Não escrever event writer** — fica Day 4
- ✅ **Final-reviewer obrigatório** antes do PR (sub-agent ou Opus pinned via Task tool)
- ✅ **Sanity check $1 BLOCKER** — se cost ≥ $1 no sanity, ABORT e reporta
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update

## 2. Branch + scaffold

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git checkout -b wave2-day2-statusline-ambiguous-compression
```

Verifica que tens base limpa:
```bash
git status
git log --oneline -5
```

## 3. Sub-feature 1: AMBIGUOUS scaffold

### 3.1 Spec

Quando `classify_domain()` devolve confidence ∈ `[0.45, 0.60]` para o top-1 pack E a diferença para o top-2 ≤ 0.10, é AMBIGUOUS. O hook deve emitir `<pack-hint>` com `pack_id="AMBIGUOUS"` + `candidates="A,B,..."` + um `prompt_scaffold` instruindo Claude a fazer 1 pergunta de desambiguação antes de planear.

### 3.2 Implementação

**Ficheiro**: `packages/router/src/hooks/inject_context.ts`

Adiciona após o resolve do pack actual:
```typescript
// AMBIGUOUS detection (Day 2)
const AMBIGUOUS_LOW = 0.45;
const AMBIGUOUS_HIGH = 0.60;
const AMBIGUOUS_DELTA = 0.10;

if (
  result.confidence >= AMBIGUOUS_LOW &&
  result.confidence <= AMBIGUOUS_HIGH &&
  result.runnerUp &&
  (result.confidence - result.runnerUp.confidence) <= AMBIGUOUS_DELTA
) {
  return {
    pack_id: "AMBIGUOUS",
    candidates: [result.pack_id, result.runnerUp.pack_id],
    confidence: result.confidence,
    scaffold: `Multiple packs match this prompt with similar confidence (${result.pack_id}, ${result.runnerUp.pack_id}). Before planning, ask the user 1 clarifying question to disambiguate, OR proceed with the more general approach if obvious. Do not assume.`
  };
}
```

**Ficheiro**: `packages/router/src/classify_domain.ts`

Garante que devolve `runnerUp: { pack_id, confidence }` (top-2). Se já não devolvia, adicionar e cobrir com test.

### 3.3 Test

`packages/router/test/ambiguous.test.ts`:
- 3 prompts ambíguos construídos (por exemplo "build a flowchart of my code" — diagram-systems vs code-audit).
- Assert: hook emite `pack_id="AMBIGUOUS"` + scaffold present.
- Assert: non-ambiguous prompts (confidence > 0.60 OR delta > 0.10) NÃO emitem AMBIGUOUS.

## 4. Sub-feature 2: Statusline wire

### 4.1 Spec

Existe `tools/router/statusline-multi.js` (3 linhas narrativa v2). Existe `tools/router/savings-tracker.js` (HTTP :7821). Não estão wired no `~/.claude/settings.json` da WSL fresh-install. Vamos:

1. Wire `~/.claude/settings.json statusLine` → `statusline-multi.js`
2. Auto-start `savings-tracker.js` ao boot via hook `SessionStart`
3. Acrescentar **na statusline-multi.js**:
   - Linha 1: append ` · pack: <id>` quando `pack_id ≠ GENERAL` e `≠ AMBIGUOUS`. Para AMBIGUOUS, ` · pack: AMBIGUOUS (A,B)`.
   - Linha 3: append ` · adapter: ◌` (placeholder Wave 5 — agora sempre idle ◌).

### 4.2 Implementação

**Ficheiro**: `tools/router/statusline-multi.js`

Lê este ficheiro primeiro para perceber estrutura existente (~60 linhas). Acrescenta:
- Função `getCurrentPack()` que lê `~/.mooter/last-decision.json` (criado pelo hook quando emite pack-hint) e devolve `{ pack_id, candidates? }`.
- Função `getAdapterStatus()` placeholder que devolve sempre `{ status: "idle", id: null }` (Wave 5 sobrescreve).
- Update render functions para incluir os campos novos.

**Ficheiro novo**: `tools/router/hooks/SessionStart.sh`

```bash
#!/usr/bin/env bash
# Auto-start savings-tracker se não está a correr
set -uo pipefail

TRACKER_URL="http://127.0.0.1:7821/health"
TRACKER_SCRIPT="${HOME}/.claude/tools/router/savings-tracker.js"

if ! curl -fsS --max-time 1 "$TRACKER_URL" >/dev/null 2>&1; then
  if [ -f "$TRACKER_SCRIPT" ] && command -v node >/dev/null 2>&1; then
    ( nohup node "$TRACKER_SCRIPT" >/dev/null 2>&1 & ) >/dev/null 2>&1
  fi
fi
```

Tornar executável: `chmod +x tools/router/hooks/SessionStart.sh`.

**Ficheiro**: `~/.claude/settings.json` (NÃO no repo — wire LOCAL)

Adiciona:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/mooter/tools/router/statusline-multi.js"
  },
  "hooks": {
    "SessionStart": "~/mooter/tools/router/hooks/SessionStart.sh"
  }
}
```

⚠️ **Importante**: este wire é LOCAL (não commitas `~/.claude/settings.json`). Documenta o wire em `docs/installation/STATUSLINE_WIRE.md` para `mooter init` consumir no Day 6.

### 4.3 Graceful degrade

Em `statusline-multi.js`, se `fetch(TRACKER_URL)` falhar:
- Linha 1: `🛠 mooter setup incomplete · /mooter init`
- Linhas 2-3: silenciadas

### 4.4 Test

- Smoke test: `node tools/router/statusline-multi.js < mock-stdin.json` produz 3 linhas com `pack:` + `adapter: ◌`.
- Mata tracker (`pkill -f savings-tracker`) → re-render mostra `🛠 setup incomplete`.

## 5. Sub-feature 3: Animation-web compression

### 5.1 Spec

`packs/animation-web/pack.yaml` tem `model_ceiling: T3` (legado Wave 1). Benchmark Wave 1 mostrou latency disaster nesta categoria (T3 Opus para tarefas que Sonnet faz igual). Compressão:
- `model_ceiling: T2` (Sonnet máx, nada de Opus)
- Adicionar `prompt_scaffold.compression_hint` com instrução para preferir SVG inline + CSS animations sobre JS libs pesadas.

### 5.2 Implementação

**Ficheiro**: `packs/animation-web/pack.yaml`

```yaml
# antes
model_ceiling: T3

# depois
model_ceiling: T2
```

Acrescenta dentro de `prompt_scaffold:`:
```yaml
prompt_scaffold:
  prefix: |
    You are working on a web animation task.
  compression_hint: |
    Prefer SVG inline + CSS animations (transform, transition, @keyframes) over JS animation libraries (GSAP, anime.js, Framer Motion) unless the user explicitly requests them or the interaction complexity strictly requires JS-driven state. Keep DOM footprint minimal.
```

### 5.3 Sanity re-corre

Pega em P006, P011, P022 do benchmark Wave 1 (estão em `docs/benchmarks/wave1-pastor/prompts.csv`):
```bash
node packages/router/test/sanity-prompts.js --prompts P006,P011,P022 --pack animation-web
```

Expectativa: model_actual = Sonnet (não Opus), latency < 25s, output válido.

## 6. Final-reviewer pre-PR

Antes de abrir PR, spawn final-reviewer (Opus pinned via Task tool):

```
Task tool, subagent: final-reviewer (ou general-purpose pinned Opus)

Prompt: "Review branch wave2-day2-statusline-ambiguous-compression vs dev.
Verifica:
- classify.js byte-identical com dev (invariant P11)
- 3 sub-features cada uma com tests verdes
- Statusline wire funciona em WSL fresh + degrade gracioso quando tracker offline
- AMBIGUOUS scaffold não introduz falsos positivos em prompts non-ambiguous
- animation-web compression baixou ceiling, não floor
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff
Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

Se REQUEST_CHANGES → fix → re-review. Se APPROVE_WITH_NOTES → NITs ≤ 4 vão para Day 3 backlog.

## 7. PR

```bash
git push -u origin wave2-day2-statusline-ambiguous-compression
gh pr create --base dev --title "Wave 2 Day 2: AMBIGUOUS scaffold + statusline wire + animation-web compression" --body-file - <<'EOF'
## Summary
3 sub-features paralelas para Wave 2 Day 2.

## Changes
- `packages/router/src/hooks/inject_context.ts`: AMBIGUOUS detection + scaffold
- `packages/router/src/classify_domain.ts`: expose runnerUp
- `packages/router/test/ambiguous.test.ts`: novos tests
- `tools/router/statusline-multi.js`: pack + adapter placeholders, graceful degrade
- `tools/router/hooks/SessionStart.sh`: auto-start savings-tracker
- `docs/installation/STATUSLINE_WIRE.md`: documentação do wire local
- `packs/animation-web/pack.yaml`: ceiling T3→T2, compression_hint

## Tests
- 24/24 router tests verdes
- 3 ambiguous tests novos verdes
- Statusline smoke + degrade tested in WSL
- animation-web P006, P011, P022 sanity: Sonnet (não Opus), latency < 25s

## Invariants
- classify.js byte-identical com dev (P11) ✓
- No git add -A ✓
- No --no-verify ✓
- Cost sanity: $X.XX (BLOCKER se ≥ $1)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog para Day 3
- <NITs do reviewer>
EOF
```

## 8. Notion + SYNC

### 8.1 Notion sub-page

Cria em Notion HQ (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) sub-page:

Title: `🛠 Sessão YYYY-MM-DD — Wave 2 Day 2 (statusline + ambiguous + compression)`

Body: tabela commits + sub-features delivered + cost sanity + reviewer verdict + link PR + Day 3 backlog.

### 8.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 2 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + decisão de arrancar Day 3 (embedding layer)

## 9. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 2 — Statusline + AMBIGUOUS + Compression COMPLETO
- Branch: wave2-day2-statusline-ambiguous-compression (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- Sanity: $X.XX cost, tests <X/X verdes>
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Statusline wire: funciona em WSL, graceful degrade ok
Próximo: Paulo merge PR + master prompt Wave 2 Day 3 (embedding layer).
```

=== END ===
