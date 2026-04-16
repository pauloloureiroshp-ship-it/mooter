# STATUSLINE REDESIGN — Master Prompt para Claude Code

> **Objetivo**: tornar o statusline do frugal *best-in-class* — coerente, self-explanatory, responsive, e a reflectir 100% do mecanismo real por trás. Hoje está parcialmente partido (ver Auditoria) e a passar vergonha. Esta missão repara, redesenha e prova.
>
> **Tier**: T3 — multi-arquivo, decisão de UX crítica, mexe em hook de produção.
> **Ordem na fila**: prioridade absoluta. INTELLIGENCE_V3 fica parqueado até esta missão fechar.
> **Estimativa**: 3-4 sessões de 1h cada. Ship em fases — cada fase tem gate próprio.

---

## 1. AUDITORIA — o que está partido (factos, não opiniões)

### BUG #1 — CRÍTICO: `gsd-statusline.js` está TRUNCADO

O ficheiro `tools/router/gsd-statusline.js` termina abruptamente a meio da linha 712, no meio da string `'.frugal-mod` (sem fechar a leitura de mode badge, sem fechar a função `main`, sem chamar `renderDistribution`, `renderSavingsHero`, `renderProviders`, `renderLatency`, `renderGpu`, sem `process.stdout.write` final).

**Verificar:**
```bash
wc -c ~/frugal/tools/router/gsd-statusline.js   # 30829 bytes
tail -c 50 ~/frugal/tools/router/gsd-statusline.js
# → ...'router', '.frugal-mod
```

**Consequência:** o statusline a correr é a versão truncada. Funções que produziriam labels com nomes de modelos, GPU tag, providers row, latency row e o hero com sessão+lifetime **existem mas nunca são chamadas**. É por isto que:
- Tela pequena → quase vazia (só `frugal | bar | %`)
- Tela grande → emojis sem labels (`🔴 🟡 ⚡ 🦙` sem nomes)
- Não aparece distribution bar com per-model breakdown
- Não aparece linha de providers `● Claude · ● Ollama · ○ GPT · ○ Gemini`

**Causa-raiz provável:** edit anterior interrompeu a meio (tooling crash, copy-paste cortado, ou auto-sync mid-write). Confirmar via `git log -p tools/router/gsd-statusline.js | head -200`.

### BUG #2 — Inconsistência semântica entre statusline (terminal) e VS Code statusbar

| Local | Mostra | Significado real |
|---|---|---|
| Terminal (linha 1) | `Opus 4.6 (1M context) \| frugal \| ████░░ 14%` | modelo + dir + ctx usado |
| Terminal (linha 2) | `∅ 0% saved · spent ~$13.35 (all-Opus) · total: 69% · 431 decisions · exec` | sessão vs lifetime misturados sem label |
| VS Code statusbar | `$76.92 \| 431 prompts \| 3.9M tokens \| Deck \| Connecting` | lifetime sem label "lifetime" |

**Problemas concretos:**
- `total: 69%` → 69% do quê? (é `saved_pct` lifetime, não está labeled)
- `431 decisions` (terminal) vs `431 prompts` (VS Code) → mesma coisa, nomes diferentes
- `~$13.35 (all-Opus)` → é spent **da sessão actual** mas não diz "sessão"
- `$76.92` no VS Code → é lifetime spent mas não diz "lifetime"
- O user nunca sabe se está a olhar para sessão ou lifetime sem mapa mental

### BUG #3 — Emojis sem labels persistentes

O código tem `compactLabel(emoji, name, pct, color, tok)` que produz `🔴 Opus 9% 12k` quando activo, mas em layout estreito o terminal corta tudo a partir do `│` e fica só `🔴 🟡 ⚡ 🦙`. **Não há legenda permanente nem layout responsive que decida o que cortar**.

### BUG #4 — `bucketFor()` agrupa todos os Ollama em "local"

Apesar de existirem 4 modelos Ollama distintos (qwen3:30b, qwen2.5:3b, gemma3:12b, deepseek-r1:7b), o bucket renderiza tudo como `🦙 Qwen` ou `🦙 Local`. Dois efeitos:
- O user não vê que gemma3 e deepseek estão a ser usados
- A barra esconde a especialização que o frugal devia comunicar

### BUG #5 — Layout 2-linhas referenciado mas nunca testado em produção

`renderDistribution` retorna string com `\n` interno. Não está confirmado que Claude Code suporta multi-linha no `statusline_command`. Se suportar, óptimo. Se não suportar, o `\n` pode estar a render como espaço ou a quebrar tudo. **Validar empiricamente** antes de assumir.

### O que ESTÁ correcto (não tocar)

- `~/.claude/hooks/execution.log` (formato `session=X model=Y role=Z cmd=W`) — ground truth dos modelos que executaram realmente. Manter.
- Tracker HTTP em `:7821` com endpoints `/metrics`, `/gpu`, `/providers`, `/health`, `/summary`, `/last`, `/real`, `/optimizer-stats`. Manter.
- `realExecutionCounts(session)` lê execution.log para session-scoped — manter, é a fonte primária correcta.
- `renderSavingsHero` cálculo de saved/spent via pricing.js × execution.log — lógica correcta, só precisa de ser **chamado** pela main.

---

## 2. PRINCÍPIOS DO REDESIGN (não negociáveis)

1. **Coerência absoluta sessão ↔ lifetime ↔ VS Code**
   - Toda métrica tem label de scope: `📍 sessão` ou `🌍 lifetime`
   - Mesma terminologia em todo lado: `prompts` (não `decisions`), `saved` (não `total`)
   - VS Code extension actualizada na mesma sprint para "lifetime"

2. **Self-explanatory: zero jargão sem legenda**
   - Cada emoji tem nome próximo (`🔴 Opus 9%`, não `🔴 9%`)
   - Cada % tem unidade (`saved 69%`, não `69%`)
   - Cada $ tem scope (`session $13.35`, não `$13.35`)

3. **Responsive: 3 layouts por largura do terminal**
   - **Compact (≤80 cols)** → 1 linha: hero crítico + ctx, omitir labels
   - **Standard (81-140 cols)** → 2 linhas: hero+ctx · bar+labels+GPU
   - **Wide (≥141 cols)** → 3 linhas: hero+ctx · bar+labels · providers+latency+mode

4. **Source of truth sempre visível**
   - Tag `exec` (real, vindo de execution.log) ou `adv` (advisory, vindo de tracker recommendation) na linha do bar — nunca ambíguo

5. **Per-Ollama-model breakdown**
   - bucketFor distingue: `qwen3` / `qwen2.5` / `gemma3` / `deepseek` / outros local
   - Cada um com emoji próprio e label curto

6. **Falha silenciosa, não cosmética**
   - Se tracker está down → omitir hero, mostrar `🪫 tracker offline · /frugal-tracker-start`
   - Se execution.log vazio → mostrar `📭 nothing logged this session yet`
   - Nunca render parcial misterioso

---

## 3. PLANO POR FASES

Cada fase tem: ficheiros tocados, mudanças concretas, gate de aceitação, e tempo estimado.

### FASE 1 — Reparar truncamento + completar main (CRÍTICO)
**Tempo:** 30-45 min
**Ficheiros:** `tools/router/gsd-statusline.js`

**O que fazer:**
1. Confirmar truncamento via `wc -c` e `tail -c 100`
2. Recuperar versão completa via `git log -p tools/router/gsd-statusline.js` (procurar último commit que tinha a função main completa)
3. Restaurar a função main completa que assembla as partes na seguinte ordem (verificar contra git):
   ```
   gsdUpdate + ◈model + ctx_bar + " │ " + hero + " │ " + task
                                  + "\n " + distribution_bar + labels + gpu_tag
                                  + "\n " + providers + latency + mode_badge
   ```
4. Adicionar `process.stdout.write(...)` final + `process.exit(0)`
5. Garantir try/catch global para nunca quebrar Claude Code

**Gate de aceitação:**
- `node tools/router/gsd-statusline.js < tests/fixtures/statusline-input.json` produz output multi-linha sem erros
- Statusline em terminal aberto mostra hero + bar + labels + providers (smoke test visual)

### FASE 2 — Coerência semântica
**Tempo:** 30-45 min
**Ficheiros:** `tools/router/gsd-statusline.js`, `tools/router/savings-tracker.js` (apenas labels nas respostas /summary se relevante), VS Code extension `vscode-extension/src/statusbar.ts` ou equivalente

**Mudanças concretas no terminal statusline:**
| Antes | Depois |
|---|---|
| `~$13.35 (all-Opus)` | `📍 session: spent $13.35 · saved $0 (all-Opus)` |
| `total: 69%` | `🌍 lifetime: 69% saved` |
| `431 decisions` | `🌍 431 prompts` |
| `exec` / `adv` | manter, mas com cor (verde exec, amarelo adv) |

**Mudanças concretas no VS Code extension statusbar:**
| Antes | Depois |
|---|---|
| `$76.92` | `🌍 $76.92 lifetime` |
| `431 prompts` | `🌍 431 prompts` |
| `3.9M tokens` | `🌍 3.9M tokens` |
| `Deck \| Connecting` | manter |

**Gate:** screenshot lado-a-lado terminal + VS Code → user consegue dizer em 3 segundos qual número é sessão vs lifetime sem perguntar.

#### FASE 2 — ADD-ON (2 micro-fixes aprovados pelo Paulo 2026-04-13)

**A) Rebrand do mascote: 🐕 → 🐮**
Decisão: "frugal" em PT = "mão de vaca". A vaca é a identidade, mais memorável que o cão genérico, e combina com potencial logo futuro estilo Ollama (animal minimalista). Emoji único, sem combo — economiza largura no statusline e é visualmente limpo.

Substituir **em todos os sítios live** (manter CHANGELOG.md intocado, é histórico):

| Ficheiro | Acção |
|---|---|
| `tools/router/gsd-statusline.js` | substituir qualquer `🐕` remanescente no render por `🐮` (grep primeiro — se o main restaurado tiver `🐕` hardcoded no hero, trocar) |
| `tools/router/gsd-statusline.js` comentários doc (linhas 96, 99) | actualizar exemplos para `🐮` (mantém doc coerente) |
| `architecture-diagram.html` linha 565 (h1) | `🐕 frugal` → `🐮 frugal` |
| `dashboard/app/**/*.tsx` ou `dashboard/components/sidebar.tsx` | sidebar mascot class — trocar emoji source (não o `.next/server/` que regenera no build) |
| `dashboard/package.json` build → depois fazer `npm run build` para regenerar os `.next/server/*.html` |
| README.md, landing (se tiver) | grep por `🐕` e decidir caso a caso — se for brand primário, mudar; se for screenshot antigo, skip |

**Não mexer em:** `CHANGELOG.md` (histórico), `frugal-mode.js` (🦁 beast mode e 🧘 zen mode são feature deliberada, não mascote).

**B) Espaço entre emoji e label no `compactLabel`**
Bug visível no output Fase 1: `🔴Opus 100% 11k` — falta espaço após emoji, fica colado e ilegível.

Fix cirúrgico em `tools/router/gsd-statusline.js` função `compactLabel` (~linha 302-305):

```js
// ANTES
const compactLabel = (emoji, name, pct, color, tok) =>
  pct === 0
    ? `${DIM}${emoji}0%${RESET}`
    : `${color}${emoji}${name} ${pct}%${RESET}${tok || ''}`;

// DEPOIS
const compactLabel = (emoji, name, pct, color, tok) =>
  pct === 0
    ? `${DIM}${emoji} 0%${RESET}`
    : `${color}${emoji} ${name} ${pct}%${RESET}${tok || ''}`;
```

Dois espaços adicionados: um em cada branch. Resultado: `🔴 Opus 100% 11k` e `🟡 0%`.

**Gate do add-on:** após Fase 2 completa, terminal mostra `🐮` no hero (não `🐕`), dashboard sidebar mostra vaca, todos os labels de modelos têm espaço após emoji. Zero `🐕` em código live (só em CHANGELOG).

### FASE 3 — Responsive multi-linha
**Tempo:** 45-60 min
**Ficheiros:** `tools/router/gsd-statusline.js`

**Implementação:**
1. Detectar largura: ler `process.env.COLUMNS` ou `data.terminal?.columns` do stdin (Claude Code fornece em algumas versões); fallback `process.stdout.columns || 120`
2. Decidir layout:
   ```js
   const cols = detectColumns();
   const layout = cols <= 80 ? 'compact' : cols <= 140 ? 'standard' : 'wide';
   ```
3. **Compact (1 linha):**
   ```
   ◈ Opus│ ████░░ 14% │ 📍 $13.35 ∅0% │ 🌍 69% │ 431p
   ```
4. **Standard (2 linhas):**
   ```
   ◈ Opus 4.6 │ ████░░ 14% ctx │ 📍 spent $13.35 saved $0 │ 🌍 69% saved · 431 prompts
     ████████░░ exec │ 🔴 Opus 100% 33k · 🟡 Sonnet 0% · ⚡ Haiku 0% · 🦙 Qwen3 0% · ⚡RTX 4090
   ```
5. **Wide (3 linhas):**
   ```
   ◈ Opus 4.6 (1M ctx) │ ████░░ 14% │ 📍 spent $13.35 saved $0 (all-Opus) │ 🌍 69% saved · 431 prompts
     ████████░░ exec │ 🔴 Opus 100% 33k · 🟡 Sonnet 0% · ⚡ Haiku 0% · 🦙 Qwen3 0% · 🐉 Deepseek 0% · 🌺 Gemma 0% · ⚡RTX 4090
     ⚡ ●Claude ●Ollama ○GPT ○Gemini ○Grok ○Mistral │ ⏱ 2.1s p50 ~same as Opus │ 🎭 dogfooding
   ```

**Validação:** testar nas 3 larguras com `COLUMNS=80`, `COLUMNS=120`, `COLUMNS=180` e screenshot.

**Gate:** statusline NUNCA estoura para fora da janela (sem wrap visual feio); informação prioritária (hero) sempre visível.

### FASE 4 — Per-Ollama-model breakdown
**Tempo:** 30 min
**Ficheiros:** `tools/router/gsd-statusline.js`, `hooks/PostToolUse.js` (espelhar mesma `bucketFor`)

**Mudança em `bucketFor`:**
```js
function bucketFor(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus'))    return 'opus';
  if (m.includes('sonnet'))  return 'sonnet';
  if (m.includes('haiku'))   return 'haiku';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('gemma'))   return 'gemma';
  if (m.includes('qwen3'))   return 'qwen3';   // novo bucket
  if (m.includes('qwen2.5') || m.includes('qwen2'))  return 'qwen25';  // novo
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local'; // catch-all restante
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai')) return 'gpt';
  if (m.includes('gemini') || m.includes('google')) return 'gemini';
  return null;
}
```

**Tabela de emojis e cores (canónica, espelhar em PostToolUse.js):**
| Bucket | Emoji | Label curto | ANSI 24-bit |
|---|---|---|---|
| opus | 🔴 | Opus | `38;2;244;71;71` (vermelho) |
| sonnet | 🟡 | Sonnet | `38;2;220;220;170` (amarelo) |
| haiku | ⚡ | Haiku | `38;2;180;180;255` (azul claro) |
| qwen3 | 🦙 | Qwen3 | `38;2;78;201;176` (teal) |
| qwen25 | 🐑 | Qwen2.5 | `38;2;100;180;160` (teal escuro) |
| gemma | 🌺 | Gemma | `38;2;154;205;50` (verde-lima) |
| deepseek | 🐉 | Deepseek | `38;2;99;179;237` (azul) |
| gpt | 🟩 | GPT | `38;2;120;220;120` (verde) |
| gemini | 💎 | Gemini | `38;2;140;180;255` (azul-violeta) |

**Gate:** rodar uma sessão que use cada Ollama model → cada um aparece com seu emoji e label próprio na distribution bar.

### FASE 5 — Source-of-truth tagging visível
**Tempo:** 15 min
**Ficheiros:** `tools/router/gsd-statusline.js`

- `exec` (real execution data) → cor verde dim
- `adv` (advisory recommendation) → cor amarelo
- `📭 no data` quando nenhuma das fontes tem nada para a sessão

**Gate:** abrir uma sessão fresca (sem execution.log entries) → mostra `📭` em vez de bar vazia confusa.

### FASE 6 — Falha graciosa
**Tempo:** 15 min
**Ficheiros:** `tools/router/gsd-statusline.js`

- Tracker offline → `🪫 tracker offline · /frugal-tracker-start`
- execution.log inexistente → `📭 first prompt — nothing routed yet`
- pricing.js missing → omitir hero $ mas mostrar bar
- Try/catch global no main para garantir que statusline NUNCA crash → fallback `frugal v0.9.x` mínimo

**Gate:** matar tracker (`pkill -f savings-tracker`), abrir terminal Claude Code → statusline mostra `🪫 tracker offline` em vez de ficar vazio ou crash.

### FASE 7 — Documentação inline
**Tempo:** 15 min
**Ficheiros:** `tools/router/gsd-statusline.js` (header comments), `docs/STATUSLINE.md` (criar)

`docs/STATUSLINE.md`:
- Anatomia visual de cada layout
- Tabela canónica de emojis (a mesma da Fase 4)
- Como interpretar `exec` vs `adv`
- Como configurar largura (`FRUGAL_LAYOUT=compact|standard|wide` env override)

---

## 4. ENTREGÁVEIS POR SESSÃO

**Sessão 1 (1h):** Fases 1+2 → statusline volta a render completo + coerência semântica básica.
**Sessão 2 (1h):** Fases 3+4 → responsive + per-Ollama-model.
**Sessão 3 (1h):** Fases 5+6+7 → polish, falhas graciosas, docs.
**Sessão 4 (opcional, 30min):** screenshots de prova nas 3 larguras + commit final + bump v0.9.10.

---

## 5. CHECKLIST FINAL (obrigatório antes de fechar)

```
[ ] gsd-statusline.js completo, sem truncamento, sem warnings em node
[ ] Smoke test: statusline render correcto em 3 larguras (80/120/180)
[ ] Coerência: 5 utilizadores aleatórios identificam sessão vs lifetime sem perguntar
[ ] Per-Ollama-model: usar gemma3 numa sessão e ver 🌺 Gemma X% na bar
[ ] Falha graciosa: matar tracker, abrir terminal, ver mensagem clara
[ ] VS Code extension statusbar com prefixo 🌍 lifetime nos números
[ ] docs/STATUSLINE.md criado e linked do README
[ ] Commit message: "feat(statusline): full redesign — responsive, coherent, complete (v0.9.10)"
[ ] Bump versão em package.json + INFRA.md
[ ] Página Notion criada (PROTOCOLO NOTION em CLAUDE.md)
[ ] SYNC.md actualizado: MISSÃO 3 → completed
```

---

## 6. NÃO-FAZER (escopo creep prevention)

- Não tocar no algoritmo de routing (isso é V3)
- Não adicionar feedback loop UI (isso é V3 P2)
- Não adicionar OpenAI/Gemini real wiring (isso é V2 T4)
- Não redesign o `frugal-turn-header.js` (já está bom — só ajustar emojis se faltarem)
- Não mexer no PostToolUse.js para além de espelhar a `bucketFor`
- Não criar dashboard novo

**Foco único: tornar o statusline a vitrine perfeita do que o frugal já faz por trás.**

---

---

## 8. FASE 8 — COERÊNCIA END-TO-END (adicionada 2026-04-13)

> Descoberto em auditoria: o user vê info de modelo em **4 sítios diferentes** ao longo de cada turn, e cada sítio tem a sua própria cópia (divergente) da lógica de emoji. A statusline sozinha não resolve o problema — o user perde confiança quando turn-header diz uma coisa, PostToolUse diz outra, e turn-end diz uma terceira.

### Os 4 pontos user-visible e o que cada um mostra hoje

| Ponto | Onde | Hook | Output actual | Problema |
|---|---|---|---|---|
| **1. Turn header** (início) | `frugal recommends → 🌱 T0 · 🦙 qwen3:30b · via ollama · conf 85% · est. save $0.02` | `frugal-turn-header.js` | `modelEmoji()` com 6 buckets | Não distingue qwen3/qwen2.5/gemma/deepseek |
| **2. PostToolUse** (cada Bash) | `⎿ PostToolUse says: 🔴 claude-opus-4-6 · architect` | `PostToolUse.js` | `getModelEmoji()` com 6 buckets | Idem |
| **3. Turn end** (fim) | `frugal turn end → 🔴 claude-opus-4-6 ×8 · actual ~$2.05 · session: 0% · total: 69% · 431 decisions` | `gsd-turn-end.js` | `modelEmoji()` com 6 buckets | Idem + `total: 69%` ambíguo + `431 decisions` deve ser `prompts` |
| **4. Statusline** (permanente) | (Fase 1 já reparou) | `gsd-statusline.js` | `bucketFor()` com 8 buckets | Única já com deepseek/gemma, mas sem qwen3 vs qwen2.5 |

### O problema raiz: DRY violation crítica

Quatro funções fazem a mesma coisa:
- `PostToolUse.js` linha 12-22 — `getModelEmoji()`
- `gsd-turn-end.js` linha 53-62 — `modelEmoji()`
- `frugal-turn-header.js` linha 50-59 — `modelEmoji()`
- `gsd-statusline.js` linha 110-121 — `bucketFor()` (única mais completa, 8 buckets)

Quando adicionamos um novo modelo, temos de actualizar 4 sítios. Garantido que um fica para trás.

### Solução: módulo partilhado `tools/router/model-display.js` (NOVO)

Criar UM ficheiro com a tabela canónica e todas as funções. Cada hook importa.

```js
// tools/router/model-display.js
'use strict';

// Tabela canónica — ÚNICA fonte de verdade. Adicionar modelo novo = 1 linha aqui.
const MODEL_REGISTRY = [
  { match: /opus/i,                           bucket: 'opus',     emoji: '🔴', label: 'Opus',     tier: 'T3' },
  { match: /sonnet/i,                         bucket: 'sonnet',   emoji: '🟡', label: 'Sonnet',   tier: 'T2' },
  { match: /haiku/i,                          bucket: 'haiku',    emoji: '⚡', label: 'Haiku',    tier: 'T1' },
  { match: /qwen3/i,                          bucket: 'qwen3',    emoji: '🦙', label: 'Qwen3',    tier: 'T0' },
  { match: /qwen2\.?5|qwen2/i,                bucket: 'qwen25',   emoji: '🐑', label: 'Qwen2.5',  tier: 'T0' },
  { match: /gemma/i,                          bucket: 'gemma',    emoji: '🌺', label: 'Gemma',    tier: 'T0' },
  { match: /deepseek/i,                       bucket: 'deepseek', emoji: '🐉', label: 'Deepseek', tier: 'T0' },
  { match: /qwen|ollama|local/i,              bucket: 'local',    emoji: '🦙', label: 'Local',    tier: 'T0' }, // catch-all qwen restante
  { match: /gpt|codex|openai/i,               bucket: 'gpt',      emoji: '🟩', label: 'GPT',      tier: 'T2' },
  { match: /gemini|google/i,                  bucket: 'gemini',   emoji: '💎', label: 'Gemini',   tier: 'T2' },
];

const TIER_EMOJI = { T0: '🌱', T1: '⚡', T2: '🧠', T3: '🏛️' };

const UNKNOWN = { bucket: 'unknown', emoji: '❓', label: 'unknown', tier: null };

function matchModel(model) {
  if (!model) return UNKNOWN;
  const m = String(model);
  for (const entry of MODEL_REGISTRY) {
    if (entry.match.test(m)) return entry;
  }
  return UNKNOWN;
}

module.exports = {
  MODEL_REGISTRY,
  TIER_EMOJI,
  modelEmoji: (m) => matchModel(m).emoji,
  modelLabel: (m) => matchModel(m).label,
  modelBucket: (m) => matchModel(m).bucket,
  modelTier: (m) => matchModel(m).tier,
  tierEmoji: (t) => TIER_EMOJI[t] || '❓',
  // Friendly combined label: "🔴 Opus" ou "🦙 Qwen3"
  prettyLabel: (m) => {
    const e = matchModel(m);
    return `${e.emoji} ${e.label}`;
  },
};
```

### Refactors obrigatórios

**Em `PostToolUse.js`:**
```js
// ANTES (linhas 12-22)
function getModelEmoji(model) { /* 8 linhas */ }

// DEPOIS
const { modelEmoji } = require('./model-display');
// usa modelEmoji(model) no sítio onde getModelEmoji era chamado
```

**Em `gsd-turn-end.js`:** idêntico — substituir `modelEmoji` local por import.

**Em `frugal-turn-header.js`:** idêntico — substituir `modelEmoji` e `tierEmoji` locais por imports.

**Em `gsd-statusline.js`:** substituir `bucketFor` local. O statusline precisa do bucket (não só emoji), por isso usa `modelBucket`.

### Coerência semântica nos 3 hooks (propagar Fase 2)

**`gsd-turn-end.js` output actual → novo:**
```
ANTES: frugal turn end → 🔴 claude-opus-4-6 ×8 · actual ~$2.05 · session: 0% · total: 69% · 431 decisions
DEPOIS: frugal turn end → 🔴 Opus ×8 · 📍 $2.05 spent · 0% saved · 🌍 69% saved · 431 prompts
```

Mudanças concretas:
- `🔴 claude-opus-4-6` → `🔴 Opus` (label amigável, não o model id completo — o id já vai para execution.log)
- `actual ~$2.05` → `📍 $2.05 spent`
- `session: 0%` → `0% saved` (já está no scope 📍 session)
- `total: 69%` → `🌍 69% saved`
- `431 decisions` → `431 prompts`

**`frugal-turn-header.js` output actual → novo:**
```
ANTES: frugal recommends → 🌱 T0 · 🦙 qwen3:30b · via ollama · conf 85% · 🦙 pre-compute ✓ · est. save $0.02
DEPOIS: frugal recommends → 🌱 T0 · 🦙 Qwen3 · via ollama · conf 85% · 🦙 pre-compute ✓ · est. save $0.02
```

Mudança mínima: `qwen3:30b` → `Qwen3` (label amigável) via `modelLabel()`. O model id ainda fica no log para debugging.

**`PostToolUse.js` output actual → novo:**
```
ANTES: 🔴 claude-opus-4-6 · architect
DEPOIS: 🔴 Opus · architect
```

Idem — usa `modelLabel()` em vez do model id cru.

### Regra de ouro

O user quer saber **"que modelo foi usado?"** numa palavra. `Opus`, `Qwen3`, `Gemma`. Não `claude-opus-4-6` ou `qwen3:30b`. O model id detalhado fica em:
- `~/.claude/hooks/execution.log` (auditável via `/frugal-real`)
- Dashboard (drill-down)
- `decisions.log` (debugging)

Mas na **UI do dia-a-dia** (4 pontos user-visible) → label curto amigável.

### Gate da Fase 8

```
[ ] tools/router/model-display.js criado com MODEL_REGISTRY canónica
[ ] PostToolUse.js, gsd-turn-end.js, frugal-turn-header.js importam de model-display
[ ] gsd-statusline.js bucketFor removido, usa modelBucket do módulo partilhado
[ ] 4 pontos user-visible mostram o MESMO label para o MESMO modelo (teste manual: rodar sessão que force uso de qwen3, gemma, opus — os 3 labels aparecem idênticos nos 4 pontos)
[ ] Adicionar novo modelo (ex: qwen3:0.5b) = 1 linha em MODEL_REGISTRY, zero mudanças nos hooks
[ ] Coerência semântica aplicada em gsd-turn-end (📍/🌍, prompts não decisions)
[ ] Labels amigáveis (Opus, Qwen3, Gemma) em vez de model ids crus nos 4 pontos
```

### Rollout seguro (sugestão de ordem)

1. Criar `model-display.js` + teste unitário mínimo (`node -e "console.log(require('./model-display').prettyLabel('qwen3:30b'))"`)
2. Refactor `PostToolUse.js` primeiro (mais crítico — dispara em cada Bash) → validar em 1 turn
3. Refactor `gsd-turn-end.js` + coerência semântica simultaneamente → validar
4. Refactor `frugal-turn-header.js` → validar
5. Refactor `gsd-statusline.js` → validar
6. Commit único com mensagem: `refactor(hooks): unify model display via shared registry (model-display.js)`

**Tempo estimado:** 60-90 min. Pequeno comparado ao valor: toda futura adição de modelo passa a ser trivial e coerente.

---

## 7. INSPIRAÇÃO VISUAL (referência aspiracional)

```
─────────────────────────────────────────────────────────────────────────────────
🐮 ◈ Opus 4.6 (1M ctx) │ ████░░░░░░ 14% │ 📍 $13.35 spent · $0 saved (all-Opus) │ 🌍 69% saved · 431 prompts
  ██████████ exec │ 🔴 Opus 100% 33k · 🟡 Sonnet 0% · ⚡ Haiku 0% · 🦙 Qwen3 0% · 🐉 DS 0% · 🌺 Gem 0% · ⚡RTX 4090
  ⚡ ●Claude ●Ollama ○GPT ○Gemini │ ⏱ 2.1s p50 ~same as Opus │ 🎭 dogfooding
─────────────────────────────────────────────────────────────────────────────────
```

Esta é a ambição. Tudo legível, tudo etiquetado, tudo coerente — **e com a vaquinha 🐮 a assinar tudo o que sai do frugal**.

---

## 9. FASE 9 — IDENTIDADE DE MARCA (vaquinha como assinatura universal) — adicionada 2026-04-13

> **Origem do pedido**: Paulo identificou que `frugal recommends → 🌱 T0` no turn-header não tem a vaquinha 🐮, criando incoerência de marca. Princípio: **wherever frugal speaks, the cow signs**. Igual ao 🦙 da Ollama — o animal é o cunho.

### 9.1 — Mapa completo de onde o frugal "fala"

Auditoria via `grep -l "frugal\|console.log\|systemMessage" tools/router/*.js`. Os pontos user-visible são **9, não 4**:

| # | Hook / CLI | Output actual (resumo) | Tipo |
|---|---|---|---|
| 1 | `frugal-turn-header.js` | `frugal recommends → 🌱 T0 · 🦙 qwen3:30b · ...` | Hook (UserPromptSubmit) |
| 2 | `PostToolUse.js` | `⎿ PostToolUse says: 🔴 claude-opus-4-6 · architect` | Hook (PostToolUse) |
| 3 | `gsd-turn-end.js` | `frugal turn end → 🔴 claude-opus-4-6 ×8 · ...` | Hook (Stop) |
| 4 | `gsd-statusline.js` | `◈ Opus 4.6 │ 14% ctx │ 📍 spent · 🌍 saved · 431p` | Hook (statusline_command) |
| 5 | `frugal-doctor.js` | `frugal doctor — health check` (texto bold) | CLI |
| 6 | `frugal-login.js` | `frugal login` (texto bold) | CLI |
| 7 | `frugal-mode.js` | `⚡ frugal — modo actual: Auto` / `🦁 frugal — Beast activado` | CLI |
| 8 | `onboarding.js` | `frugal — first-time setup` | CLI (first run) |
| 9 | Dashboard sidebar / `architecture-diagram.html` | `🐕 frugal` (Fase 2 add-on já trata) | Web UI |

**Cobertos pela Fase 2 add-on A**: 4, 9 (rebrand 🐕→🐮 já documentado).
**Falta cobrir explicitamente**: 1, 2, 3, 5, 6, 7, 8 — é o que esta Fase 9 acrescenta.

### 9.2 — Princípio da assinatura (regra única)

> **A 🐮 é a voz do frugal. Aparece como prefixo sempre que o frugal está a falar/agir.**
> **Os outros emojis (🌱⚡🧠🏛️ tier, 🔴🟡⚡🦙 modelo, 🦁🧘 mode) são informação, não voz.**

Não competem porque têm papéis distintos:
- 🐮 = **quem fala** (sempre frugal)
- 🌱⚡🧠🏛️ = **o que recomenda** (tier desta interacção)
- 🔴🟡⚡🦙 = **com que modelo** (qual LLM)
- 🦁🧘 = **em que modo** (override do user)

Resultado:
```
🐮 frugal recommends → 🌱 T0 · 🦙 Qwen3 · via ollama · conf 85% · est. save $0.02
   ↑                    ↑     ↑
   marca                tier  modelo
```

A leitura natural fica: *"a vaquinha do frugal recomenda o tier mais leve com o modelo local"*. Cada símbolo tem um trabalho distinto, ninguém compete.

### 9.3 — Mudanças por hook (todas baseadas em Fase 8 já refactorizada)

**Hook #1 — `frugal-turn-header.js`** (linha 226):
```js
// ANTES
const header = `frugal recommends → ${parts.join(' · ')}`;

// DEPOIS
const header = `🐮 frugal recommends → ${parts.join(' · ')}`;
```

**Hook #2 — `PostToolUse.js`** (linha 237) — debate: dispara em CADA Bash, pode ficar barulhento. **Decisão recomendada**: NÃO acrescentar 🐮 aqui; o `⎿ PostToolUse says:` já estabelece contexto e cada linha vem prefixada visualmente pelo Claude Code. Manter o output limpo. Se adicionarmos em todas as 8+ Bash calls de um turn, a vaquinha perde impacto. **Excepção**: vale a pena no PostToolUse só na primeira Bash de cada turn (rare).

```js
// MANTER como está em PostToolUse.js — a vaca aparece nos pontos "voz" do frugal,
// não em cada execução individual. Princípio: signature, not noise.
```

**Hook #3 — `gsd-turn-end.js`** (linha 229):
```js
// ANTES
const footer = `frugal turn end → ${parts.join(' · ')}`;

// DEPOIS — com state suffix (ver 9.4)
const cowState = computeCowState(realCounts, savedPct);  // ✓ / ⚠ / 🥛
const footer = `🐮${cowState} frugal turn end → ${parts.join(' · ')}`;
```

**Hook #4 — `gsd-statusline.js`** (hero, linha 1 do output):
```js
// Substituir o 🐕 remanescente (Fase 2 add-on A já manda) PELO 🐮 estável
// Em layouts Compact/Standard: prefixar "🐮 " ao ◈ model.
// Em layout Wide: usar 🐮 + state suffix (ver 9.4).
```

**CLI #5 — `frugal-doctor.js`** (linha 122):
```js
console.log(C.bold(`  🐮 frugal doctor — health check`));
```

**CLI #6 — `frugal-login.js`** (linha 136):
```js
console.log(C.bold('  🐮 frugal login'));
```

**CLI #7 — `frugal-mode.js`** (linhas 120, 127, 153, 156) — **CONFLITO**: este ficheiro já usa `⚡` (auto), `🦁` (beast), `🧘` (zen) como signature do mode. **Decisão recomendada**: manter os mode emojis como estão (eles SÃO a marca do mode, é feature deliberada). Acrescentar 🐮 só no header de status quando for `--json` ou quando o output é introdutório:

```js
// Linha 120 (modo Auto):
console.log('🐮 frugal — modo actual: ⚡ Auto (router inteligente activo)');

// Linha 127 (modo forçado):
console.log(`🐮 frugal — modo actual: ${meta.emoji} ${meta.label}`);

// Linha 153 (Auto activado):
console.log('🐮 frugal — Auto mode activado · ⚡');

// Linha 156 (mode forçado activado):
console.log(`🐮 frugal — ${meta.label} activado! ${meta.emoji}`);
```

A 🐮 fica à esquerda (assinatura), o emoji do mode fica integrado no texto (informação).

**CLI #8 — `onboarding.js`** (linha 32):
```js
console.log('  🐮 frugal — first-time setup');
```

### 9.4 — Liveness ("vaquinha viva") — análise honesta + proposta

#### O que NÃO é tecnicamente viável
- **Animação real (frame-by-frame)**: hooks emitem **uma única escrita stdout** e terminam. Não há event loop. Claude Code não re-renderiza um hook por sua conta. Statusline re-renderiza apenas quando Claude Code dispara (cada turn, cada tool call) — não há ciclo de timer interno.
- **Spinners ASCII**: o terminal só mostra o último frame que o hook escreveu antes de exit.

#### O que É viável e tem impacto real
**State-based emoji variation** — a cada render, o hook escolhe o variante da vaca que reflecte o estado actual. Nada mexe sozinho, mas como o statusline re-renderiza dezenas de vezes por sessão, o user *vê* a vaquinha mudar de humor conforme as métricas mudam. Sensação de "está viva".

**Tabela canónica de estados da vaca** (a colocar em `model-display.js`):

| Estado | Trigger | Emoji | Significado visual |
|---|---|---|---|
| **idle** | default | `🐮` | Tudo normal, tracker on, sessão saudável |
| **routing** | turn-header (a recomendar agora) | `🐮↗` | Está a calcular routing — energia |
| **success** | turn-end com `saved_pct ≥ 70%` | `🐮✓` | Poupança lifetime forte — celebra |
| **milking** | session com `saved ≥ $0.50` | `🐮🥛` | Sessão actual a poupar muito — visualmente lúdico |
| **warning** | session com `≥5 Bash calls 100% Opus` | `🐮⚠` | Doutrina anti-bazuca violada |
| **offline** | tracker down | `🐮💤` | Tracker offline (statusline já mostra `🪫` mas a vaca também acusa) |
| **first-run** | onboarding active | `🐮👋` | Boas-vindas no primeiro setup |
| **beast** | mode = beast | `🐮🦁` | Modo beast forçado pelo user |
| **zen** | mode = zen | `🐮🧘` | Modo zen forçado pelo user |

#### Onde aplicar liveness e onde NÃO

| Ponto | Liveness? | Razão |
|---|---|---|
| `frugal-turn-header.js` | **Sim** — `🐮↗` se está a recomendar T0/T1/T2; `🐮⚠` se warning de 100% Opus | Dispara 1×/turn, vê-se a mudar |
| `gsd-turn-end.js` | **Sim** — `🐮✓` se saved≥70% lifetime, `🐮🥛` se session saved≥$0.50, senão `🐮` | 1×/turn, fim natural |
| `gsd-statusline.js` (hero) | **Sim** — estado dominante (warning > milking > success > idle) | Re-renderiza dezenas de vezes — máximo impacto visual |
| `PostToolUse.js` | **Não** | Já decidimos não pôr 🐮 aqui (signature, not noise) |
| `frugal-doctor.js` | **Sim** — `🐮👋` no header inicial; `🐮✓` ou `🐮⚠` no resumo final conforme report.fixes | Output detalhado e enquadrado, vaquinha completa o sentimento |
| `frugal-login.js` | **Não** — só `🐮` estático | Acção pontual, sem estado |
| `frugal-mode.js` | **Sim** parcial — `🐮🦁` ou `🐮🧘` quando modo activo | Já é state-based naturalmente |
| `onboarding.js` | **Sim** — `🐮👋` | Primeira impressão |

#### Função canónica (a adicionar a `model-display.js`)

```js
// Calcula o estado actual da vaquinha baseado em métricas e contexto.
// Inputs: { tracker_up, saved_pct_lifetime, saved_session_usd, opus_streak, mode, first_run, routing }
function cowState(ctx) {
  if (ctx.first_run) return '👋';
  if (!ctx.tracker_up) return '💤';
  if (ctx.mode === 'beast') return '🦁';
  if (ctx.mode === 'zen') return '🧘';
  if (ctx.opus_streak >= 5) return '⚠';
  if (ctx.routing) return '↗';
  if (ctx.saved_session_usd >= 0.50) return '🥛';
  if (ctx.saved_pct_lifetime >= 70) return '✓';
  return '';  // idle: só 🐮 puro
}

function cow(ctx = {}) {
  const s = cowState(ctx);
  return s ? `🐮${s}` : '🐮';
}

module.exports.cow = cow;
module.exports.cowState = cowState;
```

#### Subtle "breathing" (opcional, statusline-only)

Se quisermos um efeito mais vivo no statusline, podemos cyclar 🐮→🐄→🐮→🐄 baseado em `Date.now()`:

```js
// Pisca subtil só na statusline (re-renderiza muito) — opcional, behind env flag
function breathingCow() {
  if (process.env.FRUGAL_NO_BREATHING) return '🐮';
  return Math.floor(Date.now() / 2000) % 2 === 0 ? '🐮' : '🐄';
}
```

**Opinião honesta**: o breathing é fofo mas pode irritar em sessões longas. Recomendação: **NÃO activar por default**. Documentar como feature opt-in via `FRUGAL_BREATHING=1`. Os state-suffixes (✓ ⚠ 🥛 ↗ etc.) já dão sensação de vida sem distrair.

### 9.5 — Outputs finais (proposta de "como tudo deve parecer" depois das Fases 1-9)

**Início de turn (turn-header):**
```
🐮↗ frugal recommends → 🌱 T0 · 🦙 Qwen3 · via ollama · conf 85% · est. save $0.02
```

**Cada Bash (PostToolUse) — sem 🐮, signature kept clean:**
```
⎿ PostToolUse says: 🦙 Qwen3 · summarizer
⎿ PostToolUse says: 🔴 Opus · architect
```

**Fim de turn (turn-end), sessão com poupança forte:**
```
🐮🥛 frugal turn end → 🦙 Qwen3 ×3 · 🔴 Opus ×1 · 📍 $0.12 spent · 🌍 71% saved · 432 prompts
```

**Statusline em estado normal:**
```
🐮 ◈ Opus 4.6 (1M ctx) │ ████░░ 14% │ 📍 $1.80 spent · 0% saved │ 🌍 69% saved · 432 prompts
   ██████████ exec │ 🔴 Opus 100% 12k · 🟡 Sonnet 0% · ⚡ Haiku 0% · 🦙 Qwen3 0% · 🐉 DS 0% · 🌺 Gem 0%
   ⚡ ●Claude ●Ollama │ ⏱ 2.1s p50 │ 🎭 dogfooding
```

**Statusline com warning anti-bazuca:**
```
🐮⚠ ◈ Opus 4.6 │ ████░░ 14% │ 📍 $13.35 spent · 0% saved (all-Opus) │ 🌍 69% saved · 432 prompts
   ...
```

**`frugal doctor` health-check OK:**
```
  🐮 frugal doctor — health check
  ...
  🐮✓ All systems operational.
```

**`frugal-mode` em beast:**
```
🐮🦁 frugal — Beast activado! Velocidade máxima · todos os prompts em Opus.
```

### 9.6 — Gate da Fase 9

```
[ ] cow()/cowState() adicionados a tools/router/model-display.js
[ ] frugal-turn-header.js prefixa "🐮{state} " ao header
[ ] gsd-turn-end.js prefixa "🐮{state} " ao footer
[ ] gsd-statusline.js prefixa 🐮{state} no hero (linha 1) sob todos os layouts
[ ] frugal-doctor.js header + resumo final usam 🐮 (idle e ✓/⚠)
[ ] frugal-login.js, onboarding.js prefixam 🐮 (sem state)
[ ] frugal-mode.js mantém 🦁/🧘/⚡ próprios mas prefixa 🐮 no header dos prints
[ ] PostToolUse.js mantém-se sem 🐮 (decisão deliberada — documentar em comentário inline)
[ ] Estado da vaca testado em 3 cenários: idle, warning all-Opus, milking session
[ ] Breathing 🐮↔🐄 implementado mas OFF por default (env FRUGAL_BREATHING=1 para opt-in)
[ ] CHANGELOG documenta v0.9.10 com "🐮 brand identity unified across all frugal speak points"
```

### 9.7 — Por que isto importa (justificação para a sessão de Claude Code)

1. **Cognitive anchoring**: o user lê 30+ outputs por hora durante o desenvolvimento. Sem assinatura visual, perde-se "isto vem do frugal vs isto vem do Claude vs isto é Bash output". A 🐮 marca instantaneamente "mensagem do frugal".

2. **Brand recall**: quando o user partilha screenshots no X/LinkedIn/Reddit, a vaquinha aparece. É o equivalente à 🦙 da Ollama. Diferenciação imediata.

3. **Sentiment feedback**: state-suffixes dão informação afectiva (✓ celebra, ⚠ alerta) sem ler texto. Reduz cognitive load.

4. **Coerência sistémica**: depois da Fase 8 (model-display unificado) + Fase 9 (cow signature unificada), adicionar um novo ponto de output passa a ser trivial: `import { cow, prettyLabel } from './model-display'` e segue o padrão.

### 9.8 — Anti-padrões a evitar (escopo creep)

- **Não** pôr 🐮 em decisions.log, execution.log, ou outros logs estruturados (são dados, não voz).
- **Não** pôr 🐮 em cada PostToolUse — destrói o efeito de signature.
- **Não** animar com setInterval (não há event loop em hooks).
- **Não** usar 🐄/🐂/🐃 alternativos para significar coisas semânticas — manter 🐮 como única vaca canónica; estados ficam em emojis-suffix separados.
- **Não** mexer no `frugal-mode.js` para remover 🦁/🧘 — são features, não branding.

---

**Resumo das Fases 8+9 combinadas:**
- Fase 8 unifica **a informação** (mesmos labels e emojis para modelos em todo lado, via `model-display.js`)
- Fase 9 unifica **a voz** (a vaquinha 🐮 assina cada output do frugal, com state-suffix opcional para liveness)
- Resultado: o user vê um sistema coerente e vivo, em que cada pixel tem propósito e cada emoji tem dono.
