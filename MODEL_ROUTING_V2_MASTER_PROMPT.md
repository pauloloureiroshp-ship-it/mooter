# MODEL_ROUTING_V2_MASTER_PROMPT.md
# Frugal — Multi-Model Routing + Statusline 2.0
# Versão: 1.0 | Data: 2026-04-13
# Para o Claude Code executar em sessão dedicada

> **LEIA PRIMEIRO:** Este master prompt resolve dois problemas separados mas relacionados:
> 1. **gemma3, deepseek e outros modelos Ollama existem no catálogo mas nunca são usados**
> 2. **O statusline trata todos os modelos locais como "🦙 Local" e não cabe tudo numa linha**
>
> Executa por ordem. Cada tier tem safety gate. NÃO avances sem o gate estar verde.
> Ficheiros-alvo: `tools/router/` + `agents/` — não tocas em `landing/` nem `hub/`.

---

## PRÉ-FLIGHT (obrigatório antes de qualquer tier)

```bash
# 1. Ver o que está instalado no Ollama
ollama list

# 2. Health check do frugal
node ~/.claude/tools/router/frugal-doctor.js

# 3. Ver o que o model-manager detecta
node ~/frugal/tools/router/model-manager.js --json
```

Regista o output do `ollama list`. O tier T1 usa esta lista para decidir quais modelos wiramos.
Se `ollama list` falhar → Ollama não está a correr. Avisa e para.

---

## TIER 1 — EMOJIS + STATUSLINE RECOGNITION (sem risco, sem routing change)

**Objectivo:** tornar o statusline capaz de reconhecer e distinguir gemma3, deepseek, e qualquer novo modelo Ollama — sem mudar o routing ainda.

### T1-A: Emojis no model-profile.json

Edita `tools/router/model-profile.json`. Adiciona campo `"emoji"` a cada modelo:

```json
"claude-opus-4-6":    { "emoji": "🔴", ... }
"claude-sonnet-4-6":  { "emoji": "🟡", ... }
"claude-haiku-4-5":   { "emoji": "⚡", ... }
"qwen3:30b":          { "emoji": "🦙", ... }
"qwen2.5:3b":         { "emoji": "🐑", ... }
"gemma3:12b":         { "emoji": "🌺", ... }
"deepseek-v3:7b":     { "emoji": "🐉", ... }
```

Regra: emojis únicos por modelo, visualmente distintos, sem ambiguidade.

### T1-B: Estender bucketFor() no gsd-statusline.js

**Ficheiro:** `tools/router/gsd-statusline.js`

**Encontra** a função `bucketFor(model)` (linha ~110). Actualmente:
```js
if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
```

**Substitui** por buckets específicos:
```js
if (m.includes('deepseek'))                               return 'deepseek';
if (m.includes('gemma'))                                  return 'gemma';
if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
```

### T1-C: Estender realExecutionCounts() e renderDistribution()

**Ficheiro:** `tools/router/gsd-statusline.js`

1. **Em `realExecutionCounts()`**, adiciona `deepseek: 0, gemma: 0` ao objecto `counts` (linha ~138):
```js
const counts = { opus: 0, sonnet: 0, haiku: 0, local: 0, gpt: 0, gemini: 0, deepseek: 0, gemma: 0 };
```

2. **Em `renderDistribution()`**, adiciona extracção dos novos buckets (após `gptPct`/`gemPct`):
```js
const dspPct = Math.round(pbt.DSP || callCountsByBucket?.deepseek / (callCountsByBucket?.total || 1) * 100 || 0);
const gmmPct = Math.round(pbt.GMM || callCountsByBucket?.gemma   / (callCountsByBucket?.total || 1) * 100 || 0);
```

3. **Adiciona cores** (junto aos outros TIER_COLOR, linha ~271):
```js
const DEEPSEEK_COLOR = '\x1b[38;2;99;179;237m';   // cyan-blue  #63b3ed
const GEMMA_COLOR    = '\x1b[38;2;154;205;50m';    // yellow-green #9acd32
```

4. **Adiciona ao bar** (após gemC):
```js
const dspC = share(dspPct);
const gmmC = share(gmmPct);
// No bar:
(dspC > 0 ? `${DEEPSEEK_COLOR}${'█'.repeat(dspC)}${RESET}` : '') +
(gmmC > 0 ? `${GEMMA_COLOR}${'█'.repeat(gmmC)}${RESET}`   : '')
```

5. **Adiciona labels** (após `💎 Gemini`):
```js
labels.push(`${dimIf(dspPct, DEEPSEEK_COLOR)}🐉 DeepSeek ${dspPct}%${RESET}`);
labels.push(`${dimIf(gmmPct, GEMMA_COLOR)}🌺 Gemma ${gmmPct}%${RESET}`);
```

### T1-D: Statusline 2 linhas

**Ficheiro:** `tools/router/gsd-statusline.js`

**Problema:** todos os modelos numa linha → demasiado longo no terminal.

**Solução:** separar em 2 linhas usando `\n` no output do Claude Code statusline.

Encontra o bloco final de construção do output (onde se junta a string toda).
A estrutura actual é algo como:
```
[savings hero] │ [bar] [labels todos juntos]
```

**Nova estrutura (2 linhas):**
```
Linha 1: 🐕 ↓89% 💰~$3.84 spent~$0.47 │ ████████░░ exec
Linha 2: 🔴Opus 9% · 🟡Sonnet 22% · ⚡Haiku 0% · 🦙Qwen 44% · 🐉DeepSeek 12% · 🌺Gemma 13% · 🟩GPT 0% · 💎Gemini 0%
```

**Implementação:** no ponto onde se faz `return` do resultado final, substitui:
```js
// ANTES (1 linha)
return `${savingsHero}${distribution}`;

// DEPOIS (2 linhas)
// Separa distribution em bar + labels
// Linha 1: hero + bar + source badge
// Linha 2: labels de modelos
// Usa \r\n para nova linha no terminal (funciona em PowerShell e bash)
```

> ⚠️ **Atenção:** o Claude Code statusline usa `PreToolUse`/hook output. Verifica como o teu hook consome o output antes de mudar. Se o output é uma string retornada ao terminal, `\n` funciona. Se vai para um widget separado, pode precisar de abordagem diferente. Consulta `~/.claude/settings.json` → `statusline` para perceber o mecanismo.

### Gate T1 ✅

```bash
# Smoke test — corre uma sessão curta e verifica:
# 1. O statusline ainda aparece (não crashou)
# 2. Os novos buckets aparecem quando usas um modelo Ollama
node ~/.claude/tools/router/frugal-doctor.js
```

---

## TIER 2 — ROUTING WIRE-UP (modelos Ollama reais em uso)

**Pre-condição:** `ollama list` confirma que pelo menos um de gemma3:12b / deepseek-v3:7b está instalado. Se nenhum estiver instalado, este tier instala primeiro.

### T2-A: Instalar modelos em falta (se necessário)

```bash
# Verifica o que está instalado (output do pré-flight)
# Se gemma3:12b não estiver: 
ollama pull gemma3:12b

# Se deepseek-v3:7b não estiver:
# Nota: o nome no Ollama pode ser "deepseek-v3" ou "deepseek-coder-v2:7b"
# Verifica em https://ollama.com/library/deepseek-v3
ollama pull deepseek-v3:7b
```

### T2-B: Actualizar ollama-warmup.js para aquecer modelos instalados

**Ficheiro:** `tools/router/ollama-warmup.js`

Actualmente aquece sempre `qwen2.5:3b` (hardcoded via `FRUGAL_WARMUP_MODELS`).

**Solução:** ler `hw-capability.json` para saber quais modelos estão disponíveis, e aquecer os top-2 (mais rápido primeiro). Adiciona lógica:

```js
// No topo, antes de warmupOne():
function getModelsToWarm() {
  // 1. Env override → honra sempre
  if (process.env.FRUGAL_WARMUP_MODELS) {
    return process.env.FRUGAL_WARMUP_MODELS.split(',').map(s => s.trim()).filter(Boolean);
  }
  // 2. Lê hw-capability.json para ver modelos disponíveis
  try {
    const hwPath = require('path').join(require('os').homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
    const hw = JSON.parse(require('fs').readFileSync(hwPath, 'utf8'));
    if (hw.available_ollama_models && hw.available_ollama_models.length > 0) {
      // Aquece o mais rápido (menor latência estimada) e o mais capaz (maior qualidade)
      // Fallback: os 2 primeiros da lista
      return hw.available_ollama_models.slice(0, 2).map(m => m.name || m);
    }
  } catch { /* silent */ }
  // 3. Fallback: defaults seguros
  return ['qwen2.5:3b'];
}

const MODELS = getModelsToWarm();
```

### T2-C: Actualizar budget-engine.js TIER_MODEL_MAP para selecção dinâmica

**Ficheiro:** `tools/router/budget-engine.js`

Actualmente tem TIER_MODEL_MAP fixo (linha ~36):
```js
const TIER_MODEL_MAP = {
  T0: 'qwen3:30b',
  T1: 'claude-haiku-4-5',
  T2: 'claude-sonnet-4-6',
  T3: 'claude-opus-4-6',
};
```

**Substitui** por função que selecciona dinamicamente com base no que está instalado:

```js
/**
 * Selecciona o melhor modelo para cada tier com base nos modelos Ollama disponíveis.
 * Prioridade T0: qwen3:30b > gemma3:12b > deepseek-v3:7b > qwen2.5:3b
 * Prioridade T1-local: deepseek-v3:7b > gemma3:12b > qwen3:30b (quando sem API key)
 */
function buildTierModelMap(hwCapability) {
  const available = new Set(
    (hwCapability.available_ollama_models || []).map(m => (m.name || m).toLowerCase())
  );

  // Helper: primeiro da lista que está instalado, ou fallback
  const pick = (candidates, fallback) =>
    candidates.find(c => available.has(c.toLowerCase())) || fallback;

  const t0Local = pick(
    ['qwen3:30b', 'gemma3:12b', 'deepseek-v3:7b', 'qwen2.5:3b'],
    'qwen2.5:3b'   // safe fallback (sempre presente se Ollama instalado)
  );

  const t1Local = pick(
    ['deepseek-v3:7b', 'gemma3:12b', 'qwen3:30b'],
    t0Local
  );

  return {
    T0: t0Local,
    T0_ALT: 'qwen2.5:3b',           // option-A pre-compute — sempre rápido
    T1: 'claude-haiku-4-5',          // API first
    T1_LOCAL: t1Local,               // fallback quando sem ANTHROPIC_API_KEY
    T2: 'claude-sonnet-4-6',
    T3: 'claude-opus-4-6',
  };
}
```

Actualiza `calculateOptimalConfig()` para usar `buildTierModelMap(hwCapability)` em vez de `TIER_MODEL_MAP`.

### T2-D: Actualizar model-manager.js para escrever available_ollama_models em hw-capability.json

**Ficheiro:** `tools/router/model-manager.js`

No fim da função principal (ou numa nova função `syncToHwCapability()`), adiciona:

```js
// Após getInstalledModels():
function syncModelsToHwCapability(installedModels) {
  const hwPath = path.join(ROUTER_DIR, 'hw-capability.json');
  try {
    const hw = JSON.parse(fs.readFileSync(hwPath, 'utf8'));
    hw.available_ollama_models = installedModels.map(m => ({
      name: m.name,
      size_gb: m.sizeGB,
      vram_est_mb: estimateVramMb(m.name),
    }));
    hw.ollama_models_updated_at = new Date().toISOString();
    fs.writeFileSync(hwPath, JSON.stringify(hw, null, 2));
  } catch { /* non-fatal */ }
}
```

Chama `syncModelsToHwCapability(installedModels)` no fluxo principal do model-manager.

### T2-E: Actualizar local-summarizer subagent para usar o melhor modelo disponível

**Ficheiro:** `agents/local-summarizer.md` (no repo) + `~/.claude/agents/local-summarizer.md` (instalado)

Actualiza a chamada Ollama para ler dinamicamente o modelo correcto:

```bash
# Antes (hardcoded via ollama_call.sh que usa qwen3:30b)
bash "$HOME/.claude/tools/router/ollama_call.sh" --text "<prompt>"

# Depois: usa o modelo T0 do budget-engine, ou fallback para qwen3:30b
FRUGAL_T0_MODEL=$(node -e "
  try {
    const hw = JSON.parse(require('fs').readFileSync(
      require('path').join(require('os').homedir(), '.claude', 'tools', 'router', 'hw-capability.json'),
      'utf8'
    ));
    const models = hw.available_ollama_models || [];
    const preferred = ['qwen3:30b','gemma3:12b','deepseek-v3:7b','qwen2.5:3b'];
    const names = models.map(m => m.name || m);
    console.log(preferred.find(p => names.includes(p)) || 'qwen3:30b');
  } catch { console.log('qwen3:30b'); }
" 2>/dev/null)
bash "$HOME/.claude/tools/router/ollama_call.sh" --model "${FRUGAL_T0_MODEL:-qwen3:30b}" --text "<prompt>"
```

> Verifica que `ollama_call.sh` aceita `--model` como parâmetro. Se não aceitar, adiciona esse suporte.

### T2-F: Actualizar inject_context.js para emitir modelo específico no router-hint

**Ficheiro:** `tools/router/inject_context.js`

O `<router-hint>` actual diz apenas o tier: `T0 — local-summarizer`.

Actualiza para incluir o modelo recomendado:

```
<router-hint>
tier: T0
model: gemma3:12b
agent: local-summarizer
confidence: 0.87
reason: trivial_edit
</router-hint>
```

Onde `model` é lido do `hw-capability.json → available_ollama_models` (já escrito pelo model-manager).

### Gate T2 ✅

```bash
# 1. Smoke: vê que modelos estão em hw-capability.json
node -e "const hw=require(require('os').homedir()+'/.claude/tools/router/hw-capability.json'); console.log(hw.available_ollama_models)"

# 2. Budget engine com os novos modelos
node ~/frugal/tools/router/budget-engine.js --profile

# 3. Doctor
node ~/.claude/tools/router/frugal-doctor.js

# 4. Faz um prompt T0 qualquer no Claude Code e confirma que o router-hint mostra o modelo correcto
```

---

## TIER 3 — STATUSLINE 2 LINHAS (visual upgrade)

**Objectivo:** reformatar o output do statusline para 2 linhas limpas.

### T3-A: Entender o mecanismo de output

Antes de tocar código, verifica:

```bash
# Como é que o statusline é invocado?
cat ~/.claude/settings.json | grep -A5 statusline

# É um hook? Um script separado?
ls ~/.claude/hooks/
```

Se o statusline é emitido via hook `UserPromptSubmit` (como string no stdout), então `\n` funciona directamente no terminal. Se é um widget separado, pode requerer abordagem diferente — avisa antes de implementar.

### T3-B: Implementar 2 linhas no gsd-statusline.js

**Encontra** o bloco de construção final do output. Tipicamente no fim do ficheiro, algo como:
```js
process.stdout.write(line1 + distribution + '\n');
```

**Nova estrutura:**

```js
// Linha 1: o essencial — poupança + barra
//   🐕 ↓89% 💰~$3.84 spent~$0.47  ████████░░ exec
const line1 = `${savingsHero}${DIM} ${bar} ${sourceBadge}${RESET}`;

// Linha 2: breakdown por modelo (todos, dimmed se 0%)
//   🔴 Opus 9% · 🟡 Sonnet 22% · ⚡ Haiku 0% · 🦙 Qwen 44% · 🐉 DeepSeek 12% · 🌺 Gemma 13%
const line2 = `  ${labels.join(' · ')}${gpuTag}`;

process.stdout.write(`${line1}\n${line2}\n`);
```

### T3-C: Ajustar labels para serem mais compactos

Para caber em 80 cols por linha, encurta os labels quando 0%:
- Se `pct === 0`: mostrar `🔴 0%` (dimmed, sem nome)  
- Se `pct > 0`: mostrar `🔴 Opus 9%` (com nome, cor activa)

```js
const compactLabel = (emoji, name, pct, color) =>
  pct === 0
    ? `${DIM}${emoji} 0%${RESET}`
    : `${color}${emoji} ${name} ${pct}%${RESET}`;
```

### Gate T3 ✅

```bash
# Corre o statusline standalone e vê o output
node ~/.claude/tools/router/gsd-statusline.js

# Inicia uma sessão Claude Code e confirma visualmente:
# - 2 linhas aparecem no terminal
# - Linha 1: savings + bar
# - Linha 2: todos os modelos com emojis
```

---

## TIER 4 — OPENAI / GEMINI (OPCIONAL — perguntar ao Paulo primeiro)

> **Antes de implementar este tier, confirma com o Paulo:**
> "Tens API key do OpenAI e/ou Google Gemini? Queres activá-los como providers no frugal?"
> Se sim → implementa. Se não → skip.

### T4-A: openai_call_node.js

```js
// tools/router/openai_call_node.js
// Usa OPENAI_API_KEY do env ou de ~/.claude/.openai_key
// API: https://api.openai.com/v1/chat/completions
// Modelo default: gpt-4o-mini (mais barato)
// Timeout: 10s
```

### T4-B: gemini_call_node.js

```js
// tools/router/gemini_call_node.js
// Usa GEMINI_API_KEY do env ou de ~/.claude/.gemini_key
// API: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
// Modelo default: gemini-2.0-flash (free tier generoso)
// Timeout: 10s
```

### T4-C: Wrangler de keys

```bash
# Forma segura de guardar as keys sem as commitar:
echo "sk-..." > ~/.claude/.openai_key && chmod 600 ~/.claude/.openai_key
echo "AI..." > ~/.claude/.gemini_key  && chmod 600 ~/.claude/.gemini_key
```

### T4-D: Subagents para os novos providers

Cria `agents/openai-reasoner.md` e `agents/gemini-reasoner.md` seguindo o padrão do `model-reasoner.md` mas com chamada ao script correspondente.

### T4-E: Adicionar ao bucketFor() e statusline

Já existem os buckets `gpt` e `gemini` no statusline — apenas adiciona os scripts de chamada e os subagents. O tracking já funciona.

### Gate T4 ✅

```bash
# Teste directo de cada script
echo "what is 2+2" | node ~/.claude/tools/router/openai_call_node.js
echo "what is 2+2" | node ~/.claude/tools/router/gemini_call_node.js
```

---

## SAFETY GATES — RESUMO

| Gate | Comando | Critério |
|---|---|---|
| Pre-flight | `node frugal-doctor.js` + `ollama list` | Tudo verde, Ollama a correr |
| Gate T1 | `node frugal-doctor.js` | Statusline não crashou |
| Gate T2 | `budget-engine.js --profile` + hw-capability check | Modelos detectados, T0 usa o certo |
| Gate T3 | `node gsd-statusline.js` | Output tem 2 linhas limpas |
| Gate T4 | Scripts de call directos | Respostas válidas dos APIs |

---

## ORDEM DE EXECUÇÃO RECOMENDADA

```
1. Pré-flight (5 min) → confirma o que está instalado
2. T1 (20 min) → apenas visual, sem risco
3. Gate T1 → statusline verde
4. T2-A (5 min se necessário) → instala modelos em falta
5. T2-B/C/D (30 min) → wiring de routing
6. T2-E/F (15 min) → subagent + router-hint
7. Gate T2 → modelos visíveis e usados
8. T3 (20 min) → 2 linhas
9. Gate T3 → visual confirmado
10. T4 → APENAS se Paulo confirmar que quer OpenAI/Gemini
```

**Tempo total estimado:** 90-120 min (sem T4)

---

## O QUE NÃO FAZER

- Não tocar em `landing/`, `hub/`, `dashboard/` — não é scope deste sprint
- Não mudar `classify.js` — o routing por tier continua igual; só o modelo dentro do tier muda
- Não remover `qwen2.5:3b` como fallback para Option A — continua a ser o mais rápido para pre-compute
- Não commitar API keys nem paths absolutos hardcoded
- Não fazer `git add -A` — commits selectivos por tier

---

## COMMITS ESPERADOS

```
feat(routing): add model emojis + deepseek/gemma buckets to statusline (T1)
feat(routing): dynamic Ollama model selection based on installed models (T2)
feat(statusline): 2-line layout with per-model breakdown (T3)
feat(routing): OpenAI + Gemini providers (T4) [opcional]
```

---

## REFERÊNCIA RÁPIDA — EMOJIS POR MODELO

| Modelo | Emoji | Provider | Tier |
|---|---|---|---|
| Claude Opus | 🔴 | Anthropic | T3 |
| Claude Sonnet | 🟡 | Anthropic | T2 |
| Claude Haiku | ⚡ | Anthropic | T1 |
| qwen3:30b | 🦙 | Ollama | T0 |
| qwen2.5:3b | 🐑 | Ollama | T0 (Option A) |
| gemma3:12b | 🌺 | Ollama | T0/T1 |
| deepseek-v3:7b | 🐉 | Ollama | T0/T1 |
| GPT-4o-mini | 🟩 | OpenAI | T1/T2 |
| Gemini Flash | 💎 | Google | T1/T2 |
