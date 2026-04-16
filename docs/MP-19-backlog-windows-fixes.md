# MP-19 — Backlog Windows: bugs conhecidos + melhorias de qualidade

**Contexto:** Sessão pós-MP-18. O pipeline de métricas está fechado. Esta sessão foca exclusivamente no Windows (RTX 4090) — sem MacBook. São 5 grupos de trabalho, por ordem de impacto.

---

## ESTADO ACTUAL (lê antes de começar)

```
frugal v0.9.8 — Windows · RTX 4090 · Node v24.14.0
decisions.log: 663 entradas
gold-labels.json: 62 entradas (95.2% accuracy)
Hub: frugal-hub.frugal-hub.workers.dev — DEPLOYED ✅
Supabase: eymtobwinevywmmlmxqa.supabase.co — HEALTHY ✅
Dashboard sync: ✅ a funcionar após renovação token
```

---

## GRUPO 1 — Bug: classifier sobre-agressivo em debugging prompts

### Problema
`frugal-doctor --sync` reporta:
```
⚠  "debug this stack trace"   expected T2, got T0
```

O classifier está a classificar prompts de debug como T0 (Ollama local) quando deviam ser T2 (Sonnet). Isto significa que erros de produção estão a ser analisados por um modelo fraco.

### Root cause
Em `tools/router/classify.js`, o `TUNED_COMPLEXITY_THRESHOLD = 0.25` está demasiado baixo. Prompts curtos de debug ficam abaixo do threshold e caem para T0.

### O que fazer

**1a. Auditar os padrões de debug em `classify.js`**

Grep por `debug|stack trace|error|exception|crash` no bloco de regras do classifier. Verificar se há um padrão explícito para debugging que está a forçar T0.

**1b. Adicionar ao `gold-labels.json` — novos casos de debug (mínimo 10 entradas):**

```json
{"id":"gl-063","prompt":"debug this stack trace","expected_tier":"T2","expected_category":"debug","notes":"stack trace analysis needs reasoning"},
{"id":"gl-064","prompt":"why is this error happening: TypeError: Cannot read property 'id' of undefined","expected_tier":"T2","expected_category":"debug","notes":"root cause analysis"},
{"id":"gl-065","prompt":"fix this runtime error","expected_tier":"T2","expected_category":"debug","notes":"fix requires understanding context"},
{"id":"gl-066","prompt":"this test is failing, why?","expected_tier":"T2","expected_category":"debug","notes":"test failure analysis"},
{"id":"gl-067","prompt":"what's causing this 500 error","expected_tier":"T2","expected_category":"debug","notes":"HTTP error investigation"},
{"id":"gl-068","prompt":"explain this error message","expected_tier":"T1","expected_category":"explain","notes":"explanation only, T1 sufficient"},
{"id":"gl-069","prompt":"help me understand this stack trace","expected_tier":"T2","expected_category":"debug","notes":"analysis + guidance"},
{"id":"gl-070","prompt":"my app crashes on startup","expected_tier":"T2","expected_category":"debug","notes":"crash investigation"},
{"id":"gl-071","prompt":"debug why the websocket disconnects","expected_tier":"T2","expected_category":"debug","notes":"intermittent bug analysis"},
{"id":"gl-072","prompt":"trace the root cause of this memory leak","expected_tier":"T3","expected_category":"architecture","notes":"memory leak = T3 investigation"}
```

**1c. Fix cirúrgico em `classify.js`**

Adicionar no bloco de regras de categoria (antes do threshold check), um pattern explícito para debug/error analysis:

```js
// Debug / error investigation — sempre T2 mínimo
const DEBUG_RE = /\b(debug|stack\s+trace|stack trace|traceback|root\s+cause|memory\s+leak|crash(es|ing)?|runtime\s+error|why\s+(is|does|did|are)\s+(this|it|the)\s+(fail|error|crash|break)|what.{0,20}caus(e|ing)|fix\s+this\s+(error|bug|crash))\b/i;

if (DEBUG_RE.test(prompt)) {
  // Debug prompts: T2 mínimo. Se envolve "memory leak" ou "production" → T3
  const isDeepDebug = /memory.leak|production|prod\b|data.loss|security/i.test(prompt);
  return isDeepDebug ? 'T3' : 'T2';
}
```

**Nota:** Implementa o fix no classify.js, depois corre `node tools/router/replay.js --gold-labels` para validar que a accuracy não baixou. Deve subir de 95.2% para ≥ 96%.

---

## GRUPO 2 — Bug: frugal-hub "unreachable" no doctor

### Problema
O doctor reporta:
```
⚠  frugal-hub connectivity   unreachable (check internet)
```
Mas o Worker está deployed e responde. Confirmado hoje:
- `npx wrangler deploy` → `https://frugal-hub.frugal-hub.workers.dev` ✅
- `/health` endpoint existe no worker.js ✅

### Root cause provável
O `frugal-doctor.js` faz `httpGet('https://frugal-hub.frugal-hub.workers.dev/health', 3000)` mas o timeout pode ser demasiado agressivo para uma primeira ligação a frio (cold start do Worker).

### O que fazer

**2a. Aumentar timeout e adicionar retry**

Em `tools/router/frugal-doctor.js`, na secção 6, linha ~298:

```js
// Antes:
const hubRes = await httpGet('https://frugal-hub.frugal-hub.workers.dev/health', 3000);

// Depois: timeout 6s + 1 retry
let hubOk = false;
for (let attempt = 0; attempt < 2 && !hubOk; attempt++) {
  try {
    const hubRes = await httpGet('https://frugal-hub.frugal-hub.workers.dev/health', 6000);
    hubOk = hubRes.ok && hubRes.status === 200;
  } catch { /* retry */ }
  if (!hubOk && attempt === 0) await new Promise(r => setTimeout(r, 1000));
}
```

**2b. Melhorar mensagem de erro**

Se continuar a falhar após retry, mostrar o erro real em vez de "check internet":

```js
row(hubOk ? TICK : WARN, 'frugal-hub connectivity',
  hubOk ? 'reachable' : `unreachable after 2 attempts (timeout 6s)`,
  hubOk ? null : `Test manually: curl https://frugal-hub.frugal-hub.workers.dev/health`);
```

---

## GRUPO 3 — Bug: /frugal-hello skill em falta

### Problema
O doctor reporta:
```
⚠  /frugal-hello   missing → Re-run installer
```

### O que fazer

**3a. Verificar onde o skill devia ser criado**

Grep por `frugal-hello` em `install-windows.ps1` e `install.sh` para perceber se estava no installer ou se é um ficheiro separado.

**3b. Se o ficheiro do skill não existir**, criar `~/.claude/commands/frugal-hello.md` com conteúdo mínimo:

```markdown
# /frugal-hello

Bem-vindo ao frugal! Este comando confirma que o router está instalado e activo.

```bash
node ~/.claude/tools/router/frugal-doctor.js
```

**3c. Actualizar o check no `frugal-doctor.js`**

A verificação de skills procura o ficheiro. Após criar o ficheiro, verificar que o path está correcto no doctor (secção 8).

---

## GRUPO 4 — Melhoria: expandir gold-labels.json com misroutes reais

### Contexto
Temos 663 decisões em `decisions.log`. Das 62 entradas actuais do gold-labels, a accuracy é 95.2%. Com 663 decisões reais, há material para extrair misroutes genuínos e adicionar ao gold-labels.

### O que fazer

**4a. Extrair misroutes do decisions.log**

Correr o seguinte para encontrar padrões anómalos (T3 atribuído a prompts curtos, ou T0 atribuído a prompts longos):

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const log = fs.readFileSync(path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'), 'utf8');
const entries = log.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const classified = entries.filter(e => e.event === 'classified');

// Suspeitos: prompts curtos (< 40 chars) classificados T3
const shortT3 = classified.filter(e => e.tier === 'T3' && e.prompt && e.prompt.length < 40);
// Suspeitos: prompts com 'debug' classificados T0
const debugT0 = classified.filter(e => e.tier === 'T0' && e.prompt && /debug|error|crash|stack/i.test(e.prompt));

console.log('Short prompts → T3 (possível over-escalation):');
shortT3.slice(0, 10).forEach(e => console.log(' ', JSON.stringify(e.prompt)));
console.log('Debug prompts → T0 (misroute):');
debugT0.slice(0, 10).forEach(e => console.log(' ', JSON.stringify(e.prompt)));
"
```

**4b. Com base nos resultados**, adicionar 10-20 entradas ao `gold-labels.json` com os padrões reais observados em produção.

**4c. Correr validação**

```bash
node tools/router/replay.js --gold-labels
```

Target: accuracy ≥ 96% após os fixes do Grupo 1.

---

## GRUPO 5 — Melhoria: MODES_MASTER_PROMPT pendente + setup-profile

### 5a. MODES_MASTER_PROMPT — applyActiveMode() não aplicado

O `SYNC.md` regista: `MODES_MASTER_PROMPT.md` contém o patch exacto para `inject_context.js` — função `applyActiveMode()` após `applyBudgetCap()`. **Ainda não aplicado no runtime.**

Verificar se `applyActiveMode()` existe em `inject_context.js`:

```bash
grep -n "applyActiveMode\|frugal-mode\|\.frugal-mode\.json" ~/.claude/tools/router/inject_context.js
```

Se não existir → ler `MODES_MASTER_PROMPT.md` e aplicar o patch.

### 5b. setup-profile.js — subscription "unknown"

O doctor reporta `Anthropic subscription: unknown`. Correr:

```bash
node tools/router/setup-profile.js
```

Este é um wizard interactivo. Se não existir o ficheiro, verificar se está em `tools/router/` ou `tools/`.

---

## ORDEM DE EXECUÇÃO

```
GRUPO 1 (classifier fix + gold-labels debug)    ← maior impacto na qualidade do router
  → GRUPO 2 (hub connectivity timeout fix)       ← quick win, 5 linhas
  → GRUPO 3 (frugal-hello skill)                 ← quick win, 2 minutos
  → GRUPO 4 (expandir gold-labels com reais)     ← depende dos resultados do Grupo 1
  → GRUPO 5 (applyActiveMode + setup-profile)    ← último, menos urgente
```

---

## TESTES A CORRER NO FINAL

```bash
# 1. Validar classifier melhorado
node tools/router/replay.js --gold-labels
# Esperado: accuracy ≥ 96%

# 2. Testar caso específico que falhava
node tools/router/classify.js "debug this stack trace" --debug
# Esperado: T2

# 3. Health check completo
node tools/router/frugal-doctor.js
# Esperado: hub connectivity ✅, /frugal-hello ✅

# 4. Sync para actualizar dashboard
node tools/router/frugal-doctor.js --sync
# Esperado: Dashboard sync ✅ profile updated
```

---

## COMMIT SUGERIDO

```
fix(router): debug misroutes + hub timeout + frugal-hello + gold-labels expansion (MP-19)
```

---

## RESTRIÇÕES

1. **Não tocar em `TUNED-BLOCK`** — o bloco auto-gerado pelo `update-router.js` não deve ser editado manualmente. Os fixes de padrões vão no bloco de regras manuais acima do TUNED-BLOCK.
2. **Não mudar thresholds globais** — o `TUNED_COMPLEXITY_THRESHOLD = 0.25` foi gerado a partir de 230 samples. Não alterar sem re-treino.
3. **gold-labels.json: IDs sequenciais** — começar em `gl-063` (o ficheiro tem 62 entradas, IDs `gl-001` a `gl-062`).
4. **applyActiveMode(): só aplicar se não existir** — verificar antes de escrever.
5. **setup-profile.js é interactivo** — não pode ser corrido em batch. Paulo tem de responder às perguntas manualmente.
