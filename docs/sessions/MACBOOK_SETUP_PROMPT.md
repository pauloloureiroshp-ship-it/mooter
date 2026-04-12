# frugal — Setup Completo no MacBook Pro do Paulo
# Cola este prompt INTEIRO no Claude Code do MacBook.
# Ele instala tudo, configura tudo, valida tudo, e dá o veredicto.

---

## QUEM ÉS TU NESTA SESSÃO

Tu estás no MacBook Pro do Paulo Loureiro — o criador do frugal. Ele já usa o frugal na máquina Windows 11 dele e quer replicar a experiência completa no MacBook. O repo já foi clonado (ou vai ser clonado agora). A conta GitHub é a mesma. Ele é developer experiente.

O frugal é um router de modelos para Claude Code. Classifica cada prompt em <50ms (regex puro) e emite um `<router-hint>` que dirige T0 (Ollama, grátis) → T1 (Haiku) → T2 (Sonnet) → T3 (Opus). Resultado validado: ~90% de savings.

**Versão actual:** v0.9.4 (Friends Beta)
**Repo GitHub:** `https://github.com/pauloloureiroshp-ship-it/frugal.git` (privado, mesma conta)

---

## FASE 1 — PREPARAR O TERRENO

### 1.1 Verifica pré-requisitos

Corre estes comandos e reporta o resultado de cada um:

```bash
echo "=== SISTEMA ===" && uname -sm
echo "=== NODE ===" && node -v
echo "=== GIT ===" && git --version
echo "=== CLAUDE CODE ===" && claude --version 2>/dev/null || echo "NÃO ENCONTRADO"
echo "=== OLLAMA ===" && ollama --version 2>/dev/null || echo "NÃO ENCONTRADO"
```

**Decisões:**
- Node < 18 → diz ao Paulo: `brew install node`
- Claude Code não encontrado → diz ao Paulo: instalar de `claude.ai/download`
- Ollama não encontrado → diz ao Paulo: `brew install ollama` (recomendado mas não obrigatório)
- **Se Node E Claude Code existirem → continua. Não pares.**

### 1.2 Ollama — garantir que está a correr com o modelo certo

```bash
# Verifica se está a correr:
curl -s --max-time 3 http://localhost:11434/api/tags > /dev/null 2>&1 && echo "OLLAMA_RUNNING=true" || echo "OLLAMA_RUNNING=false"

# Se não estiver a correr, tenta iniciar:
# (o Paulo pode ter de correr `ollama serve` num terminal separado)
```

Se Ollama estiver a correr, verifica os modelos:
```bash
ollama list 2>/dev/null
```

Modelos necessários:
- `qwen2.5:3b` — obrigatório para T0 (classificações triviais, grátis)
- `qwen3:30b` — recomendado para T0 com raciocínio (opcional, 18GB)

Se `qwen2.5:3b` não existir:
```bash
ollama pull qwen2.5:3b
```

### 1.3 Clona o repo (se ainda não existir)

```bash
if [ -d ~/frugal/.git ]; then
  echo "Repo já existe em ~/frugal — fazendo pull..."
  cd ~/frugal && git pull origin main
else
  echo "Clonando repo..."
  git clone https://github.com/pauloloureiroshp-ship-it/frugal.git ~/frugal
  cd ~/frugal
fi
```

---

## FASE 2 — INSTALAR O FRUGAL

```bash
cd ~/frugal && bash install.sh
```

O installer é idempotente (seguro correr mais de uma vez). Ele:
- Cria `~/.claude/tools/router/` com todos os ficheiros do runtime
- Instala 6 agents (model-architect, model-reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer)
- Instala 10 skills (/frugal-status, /frugal-savings, /frugal-route, /frugal-summary, /frugal-update, /frugal-beast, /frugal-zen, /frugal-auto, /frugal-hello, /model-router)
- Regista o hook `UserPromptSubmit` no `~/.claude/settings.json`
- Copia docs para `~/.claude/docs/`
- Faz backup de tudo o que toca
- Corre self-test do classifier

**Se o installer disser "CLAUDE.md exists — not overwriting"** → está correcto, não sobrescrevas.

**Se o installer falhar** → corre `bash install.sh --doctor` para diagnóstico e reporta ao Paulo.

---

## FASE 3 — CONFIGURAR O CLAUDE.md PESSOAL

O CLAUDE.md é a directriz que diz ao Claude Code como se comportar com o frugal. O installer não o sobrescreve se já existir. Verifica se é o correcto:

```bash
head -5 ~/.claude/CLAUDE.md 2>/dev/null
```

Se não existir OU se o conteúdo não mencionar "frugal" nem "router":
```bash
cp ~/frugal/CLAUDE.md ~/.claude/CLAUDE.md
echo "✅ CLAUDE.md copiado"
```

Se já existir e mencionar "frugal" → não mexas.

---

## FASE 4 — VALIDAÇÃO COMPLETA (7 checks)

Corre todos estes checks. Reporta ✅ ou ❌ para cada um.

```bash
echo "═══════════════════════════════════════"
echo "  frugal v0.9.4 — Validação MacBook Pro"
echo "═══════════════════════════════════════"
echo ""

# 1. Ficheiros core
echo "CHECK 1: Ficheiros core"
OK=0; TOTAL=4
for f in classify.js inject_context.js savings-tracker.js onboarding.js; do
  [ -f ~/.claude/tools/router/$f ] && echo "  ✅ $f" && OK=$((OK+1)) || echo "  ❌ $f FALTA"
done
echo "  → $OK/$TOTAL"
echo ""

# 2. Hook registado
echo "CHECK 2: Hook UserPromptSubmit"
grep -q "inject_context" ~/.claude/settings.json 2>/dev/null && echo "  ✅ Registado" || echo "  ❌ NÃO registado"
echo ""

# 3. Skills
echo "CHECK 3: Skills"
SKILLS=$(ls ~/.claude/skills/frugal-*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')
echo "  $SKILLS skills instaladas"
ls ~/.claude/skills/frugal-*/SKILL.md 2>/dev/null | sed 's|.*/frugal-||;s|/SKILL.md||' | while read s; do echo "  ✅ /frugal-$s"; done
echo ""

# 4. Agents
echo "CHECK 4: Agents"
AGENTS=$(ls ~/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "  $AGENTS agents instalados"
ls ~/.claude/agents/*.md 2>/dev/null | sed 's|.*/||;s|\.md||' | while read a; do echo "  ✅ $a"; done
echo ""

# 5. Ollama
echo "CHECK 5: Ollama"
curl -s --max-time 3 http://localhost:11434/api/tags 2>/dev/null | node -e "
try {
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const names = d.models.map(m => m.name);
  console.log('  ✅ Running — models: ' + names.join(', '));
  if (!names.some(n => n.includes('qwen2.5'))) console.log('  ⚠️  qwen2.5:3b em falta — correr: ollama pull qwen2.5:3b');
} catch { console.log('  ⚠️  Offline — correr ollama serve num terminal'); }
" 2>/dev/null || echo "  ⚠️  Não disponível"
echo ""

# 6. Classifier — smoke test 5 prompts
echo "CHECK 6: Classifier smoke test"
node -e "
const { execSync } = require('child_process');
const cases = [
  ['fix the typo in line 42', 'T0'],
  ['generate commit message for this diff', 'T1'],
  ['why does this function throw null pointer', 'T2'],
  ['redesign the auth system for multi-tenant', 'T3'],
  ['add a className to this div', 'T0'],
];
let pass = 0;
cases.forEach(([prompt, expected]) => {
  try {
    const out = execSync('node ~/.claude/tools/router/classify.js \"' + prompt + '\"', { encoding: 'utf8' });
    const tier = JSON.parse(out).tier;
    const ok = tier === expected;
    if (ok) pass++;
    console.log('  ' + (ok ? '✅' : '⚠️') + ' \"' + prompt.slice(0,45) + '\" → ' + tier + (ok ? '' : ' (esperado ' + expected + ')'));
  } catch (e) { console.log('  ❌ Erro ao classificar: ' + prompt); }
});
console.log('  → ' + pass + '/5 correctos');
"
echo ""

# 7. CLAUDE.md
echo "CHECK 7: CLAUDE.md"
grep -q "frugal\|router\|Arquiteto-Mediador" ~/.claude/CLAUDE.md 2>/dev/null && echo "  ✅ CLAUDE.md tem directrizes frugal" || echo "  ❌ CLAUDE.md não tem directrizes frugal"
echo ""

echo "═══════════════════════════════════════"
echo "  Validação completa."
echo "═══════════════════════════════════════"
```

---

## FASE 5 — TESTE REAL DO ROUTER

Agora testa o router ao vivo. Executa estes dois slash commands:

### 5.1 — /frugal-status
Invoca o skill `/frugal-status`. Deve mostrar: estado do hook, Ollama, last decisions, savings.

### 5.2 — /frugal-hello
Invoca o skill `/frugal-hello`. É a mensagem de boas-vindas — mostra o que o router fez no último prompt.

Se ambos funcionarem → o frugal está 100% operacional.

---

## FASE 6 — VEREDICTO FINAL

Após todas as fases, responde com este formato:

```
══════════════════════════════════════════
  frugal v0.9.4 — MacBook Pro do Paulo
══════════════════════════════════════════

RESULTADO: [✅ INSTALAÇÃO PERFEITA / ⚠️ FUNCIONAL COM AVISOS / ❌ PRECISA DE FIX]

Checks:
  1. Ficheiros core:  [✅/❌] (N/4)
  2. Hook:            [✅/❌]
  3. Skills:          [✅/❌] (N instaladas)
  4. Agents:          [✅/❌] (N instalados)
  5. Ollama:          [✅/⚠️]
  6. Classifier:      [✅/⚠️] (N/5 correctos)
  7. CLAUDE.md:       [✅/❌]

/frugal-status:     [✅ funcionou / ❌ falhou]
/frugal-hello:      [✅ funcionou / ❌ falhou]

[Se algo falhou, lista exactamente o que correr para resolver]

══════════════════════════════════════════
  Próximo passo: abre novo chat e escreve qualquer prompt.
  O frugal classifica automaticamente.
  Experimenta: "rename this variable to camelCase" → T0 (grátis)
══════════════════════════════════════════
```

---

## NOTAS IMPORTANTES

- **Tu és o Claude Code a correr no MacBook do Paulo.** Ele é o dono do projecto. Não há restrições de acesso.
- **Não peças confirmação.** Instala, valida, reporta. Ele quer plug and play.
- **Se algo falhar, tenta resolver sozinho primeiro.** Só pede ajuda ao Paulo se for algo que requer acção dele (ex: instalar Homebrew, iniciar Ollama).
- **Não cries ficheiros novos** fora do que o installer já cria. Não cries .md, não cries docs extras.
- **Após este prompt, o frugal está activo.** Cada prompt seguinte no Claude Code passa automaticamente pelo router.
- O frugal funciona sem Ollama (perde T0 grátis). Funciona sem ANTHROPIC_API_KEY (T1 usa subagent).
- Se o installer disser que o hook já está registado → perfeito, não é erro.
