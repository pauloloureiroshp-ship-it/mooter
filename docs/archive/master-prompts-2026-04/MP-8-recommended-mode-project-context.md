# MP-8 — Recommended Mode + Project Context + Plugin Recommendations

> **Objectivo**: Tornar o dashboard verdadeiramente inteligente. Dado o perfil do utilizador
> (hardware, subscrições, keys detectadas), o dashboard calcula e recomenda o modo óptimo
> do frugal, ajuda a configurar projectos, e sugere o que instalar a seguir.
>
> **Pré-requisito**: MP-7 concluído (Setup Health Check + /api/install-complete + --sync)
>
> **Commit alvo**: `feat(dashboard): recommended mode, project context generator, plugin recs (MP-8)`

---

## Ficheiros a ler antes de começar

```
landing/app/dashboard/page.tsx          — dashboard actual (tem SetupHealthCard do MP-7)
landing/app/lib/generate-frugal-config.ts — lógica de geração de config
tools/router/frugal-mode.js             — modos beast/zen/auto e como são persistidos
tools/router/classify.js               — lê ## Router Context do CLAUDE.md (linhas ~60-100)
tools/router/subscription-profile.json — estrutura: { anthropic, openai, gemini }
tools/router/version.json              — versão actual
```

---

## PEÇA 1 — Card "Recommended for you" no dashboard

### Localização
Em `landing/app/dashboard/page.tsx`, adiciona o componente `RecommendedModeCard` DEPOIS
do `SetupHealthCard` e ANTES do card "Savings".

### Lógica de recomendação

A função `calcRecommendedMode(profile)` determina o modo e a razão:

```typescript
type RecommendedMode = {
  mode: 'beast' | 'auto' | 'zen';
  emoji: string;
  title: string;
  reason: string;
  t0_available: boolean;
  t3_unlimited: boolean;
  est_savings_day: string;
  config_block: string; // bloco ## Router Context para copiar
};

function calcRecommendedMode(profile: Profile): RecommendedMode {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const hasMax = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('max') || s.toLowerCase().includes('claude max'));
  const hasAnthropicApi = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('claude api') || s.toLowerCase().includes('api'));
  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown'].includes(profile.hardware_tier);
  const hasOllama = cfg.has_ollama === true;
  const hasAnthropicKey = cfg.has_anthropic_key === true;

  // Beast: tem Max (ilimitado) — custo não é preocupação, usar o melhor sempre
  if (hasMax) {
    return {
      mode: 'auto',
      emoji: '⚡',
      title: 'Auto (optimised for Max)',
      reason: 'Claude Max detected — Opus sem limite. Router usa T0 local quando disponível, T3 Opus para o resto.',
      t0_available: hasOllama,
      t3_unlimited: true,
      est_savings_day: hasOllama ? '~$8–15/day vs all-Opus' : '~$3–8/day vs all-Opus',
      config_block: `## Router Context\ncomplexity_bias: T2\nhub_push_enabled: true`,
    };
  }

  // Zen: só API-paid sem Max, sem GPU — cada token custa
  if (hasAnthropicKey && !hasMax && !hasGpu && !hasOllama) {
    return {
      mode: 'zen',
      emoji: '🧘',
      title: 'Zen mode',
      reason: 'API-paid sem GPU local. Cada token custa. Zen mantém tudo em T0/T1 para poupar ao máximo.',
      t0_available: false,
      t3_unlimited: false,
      est_savings_day: '~$5–12/day vs default',
      config_block: `## Router Context\ncomplexity_bias: T1\nhub_push_enabled: true`,
    };
  }

  // Auto com GPU: melhor equilíbrio — T0 local grátis, T3 quando realmente necessário
  return {
    mode: 'auto',
    emoji: '⚡',
    title: 'Auto (balanced)',
    reason: hasGpu || hasOllama
      ? 'GPU/Ollama detectado — T0 local grátis para tarefas simples, T3 só quando importa.'
      : 'Setup standard — router decide por cada prompt. Adiciona Ollama para poupar mais.',
    t0_available: hasOllama,
    t3_unlimited: false,
    est_savings_day: hasOllama ? '~$6–12/day' : '~$2–5/day',
    config_block: `## Router Context\nhub_push_enabled: true`,
  };
}
```

### UI do card

```
┌─ Recommended for you ──────────────────── [Apply] ─┐
│  ⚡ Auto (optimised for Max)                        │
│                                                     │
│  Claude Max detected — Opus sem limite.             │
│  Router usa T0 local quando disponível.             │
│                                                     │
│  T0 Ollama (free)    ✓ available                    │
│  T3 Opus             ✓ unlimited (Max)              │
│  Est. savings        ~$8–15/day                     │
│                                                     │
│  ── Router Context para o teu CLAUDE.md ──          │
│  ## Router Context                                  │
│  complexity_bias: T2                      [Copy]    │
│  hub_push_enabled: true                             │
└─────────────────────────────────────────────────────┘
```

O botão **[Apply]** não faz nada no servidor — mostra um tooltip:
> "Run in terminal: `node ~/.claude/tools/router/frugal-mode.js auto`"
> (ou `beast` / `zen` conforme o modo recomendado)

O botão **[Copy]** copia o `config_block` para o clipboard (`navigator.clipboard.writeText`).

---

## PEÇA 2 — Card "Project context" no dashboard

### Localização
Depois do card "Recommended for you". Só aparece se `profile.install_completed === true`.

### UI

```
┌─ Project context ──────────────────────────────────┐
│  Configure o router para um projecto específico.   │
│                                                     │
│  Tipo de projecto                                  │
│  [ Frontend ] [ Backend ] [ Fullstack ] [ CLI ]    │
│                                                     │
│  Linguagem principal                               │
│  [ TypeScript ] [ Python ] [ Go ] [ Rust ] [Other] │
│                                                     │
│  Contexto sensível?                                │
│  [ Tem migrações/prod ] [ Tem segredos/CI ]        │
│  [ Só experimentos ]                               │
│                                                     │
│  ── Generated ## Router Context ──                 │
│  ## Router Context                                 │
│  project_type: frontend                 [Copy]     │
│  complexity_bias: T2                               │
│  sensitive_patterns: deploy, migration             │
│  hub_push_enabled: true                            │
└─────────────────────────────────────────────────────┘
```

### Lógica de geração do bloco

```typescript
function generateRouterContext(opts: {
  projectType: 'frontend' | 'backend' | 'fullstack' | 'cli' | '';
  language: 'typescript' | 'python' | 'go' | 'rust' | 'other' | '';
  sensitive: string[]; // ['migrations', 'secrets', 'experiments']
}): string {
  const lines = ['## Router Context'];

  if (opts.projectType) lines.push(`project_type: ${opts.projectType}`);

  // Complexity bias por tipo
  const biasMap: Record<string, string> = {
    frontend: 'T2',
    backend: 'T3',
    fullstack: 'T2',
    cli: 'T1',
  };
  if (opts.projectType && biasMap[opts.projectType]) {
    lines.push(`complexity_bias: ${biasMap[opts.projectType]}`);
  }

  // Sensitive patterns
  const patterns: string[] = [];
  if (opts.sensitive.includes('migrations')) patterns.push('migration', 'deploy', 'prod');
  if (opts.sensitive.includes('secrets')) patterns.push('secret', 'env', 'token', 'key');
  if (patterns.length) lines.push(`sensitive_patterns: ${patterns.join(', ')}`);

  // Sempre adicionar hub_push
  lines.push('hub_push_enabled: true');

  return lines.join('\n');
}
```

O bloco gerado é só para copiar e colar no `CLAUDE.md` do projecto. Não é guardado no servidor.

---

## PEÇA 3 — Card "Recommendations" no dashboard

### Localização
Depois do card "Project context". Só aparece se houver pelo menos 1 recomendação activa.

### Lógica de recomendações

```typescript
type Recommendation = {
  id: string;
  title: string;
  reason: string;
  action: string;      // texto do botão ou comando a copiar
  actionType: 'copy' | 'link' | 'command';
  priority: 'high' | 'medium' | 'low';
};

function getRecommendations(profile: Profile): Recommendation[] {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const recs: Recommendation[] = [];

  // Ollama não instalado → instalar
  if (!cfg.has_ollama) {
    recs.push({
      id: 'install-ollama',
      title: 'Instala Ollama para T0 gratuito',
      reason: 'Sem Ollama, todas as tarefas simples vão para Haiku/Sonnet pago.',
      action: 'https://ollama.com/download',
      actionType: 'link',
      priority: 'high',
    });
  }

  // Ollama instalado mas sem qwen2.5:3b
  if (cfg.has_ollama && !cfg.ollama_has_qwen3b) {
    recs.push({
      id: 'pull-qwen3b',
      title: 'Instala qwen2.5:3b para T0 rápido',
      reason: 'Modelo recomendado para tarefas T0 (renames, commits, formatação).',
      action: 'ollama pull qwen2.5:3b',
      actionType: 'copy',
      priority: 'high',
    });
  }

  // Tem GPU mas não tem qwen3:30b
  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown'].includes(profile.hardware_tier);
  if (cfg.has_ollama && hasGpu && !cfg.ollama_has_qwen30b) {
    recs.push({
      id: 'pull-qwen30b',
      title: 'Instala qwen3:30b para T0-smart',
      reason: 'O teu GPU aguenta. qwen3:30b faz root cause analysis local — grátis.',
      action: 'ollama pull qwen3:30b',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  // Muitos decisions mas nunca correu backtest
  const decisionsCount = Number(cfg.decisions_count) || 0;
  if (decisionsCount > 200) {
    recs.push({
      id: 'run-backtest',
      title: 'Optimiza o teu router com backtest',
      reason: `Tens ${decisionsCount} decisões. O backtest vai afinar o classifier para o teu padrão de uso.`,
      action: 'node ~/.claude/tools/router/backtest.js && node ~/.claude/tools/router/update-router.js',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  // Sem Anthropic key mas tem frugal instalado
  if (!cfg.has_anthropic_key && profile.install_completed) {
    recs.push({
      id: 'add-anthropic-key',
      title: 'Adiciona ANTHROPIC_API_KEY',
      reason: 'Sem a key, T1 (Haiku) não está disponível. O router salta de T0 para T2.',
      action: 'export ANTHROPIC_API_KEY=sk-ant-... # adiciona ao ~/.zshrc ou ~/.bashrc',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  return recs.sort((a, b) =>
    ['high', 'medium', 'low'].indexOf(a.priority) -
    ['high', 'medium', 'low'].indexOf(b.priority)
  );
}
```

### UI

```
┌─ Recommendations ──────────────────────────────────┐
│  🔴 Instala qwen2.5:3b para T0 rápido             │
│  Modelo recomendado para tarefas simples.          │
│  > ollama pull qwen2.5:3b              [Copy] ✓    │
│                                                     │
│  🟡 Optimiza o teu router com backtest             │
│  Tens 1,437 decisões. Afina o classifier.          │
│  > node ~/.claude/tools/router/backtest.js  [Copy] │
└─────────────────────────────────────────────────────┘
```

O **[Copy]** copia o comando para o clipboard. Botão fica com ✓ verde por 2 segundos.

---

## Ordem de execução

1. **PEÇA 1** — RecommendedModeCard (lógica + UI)
2. **PEÇA 2** — ProjectContextCard (gerador de Router Context)
3. **PEÇA 3** — RecommendationsCard (lista priorizada)
4. Verificar TypeScript: `npx tsc --noEmit` em landing/
5. Commit único

---

## Commit

```
feat(dashboard): recommended mode, project context generator, plugin recs (MP-8)

- RecommendedModeCard: calcula beast/auto/zen com base em Max, GPU, Ollama
- ProjectContextCard: gera ## Router Context para CLAUDE.md por projecto
- RecommendationsCard: lista priorizada (Ollama, qwen models, backtest, keys)
- Botões [Copy] para comandos e config blocks
- Tudo client-side: zero chamadas ao servidor neste MP

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Regras

- **Tudo client-side** — os 3 cards calculam localmente com os dados já carregados do profile
- **Sem chamadas ao servidor** neste MP
- **Botões de acção** são sempre "copiar comando" ou "link externo" — nunca executam nada automaticamente
- **Usa as mesmas classes CSS** do dashboard existente (dashboard-card, dashboard-label, etc.)
- **Não quebrar** SetupHealthCard do MP-7
- **Graceful degradation**: se frugal_config é null, todos os cards mostram estado vazio com mensagem "Run frugal-doctor --sync to populate"
