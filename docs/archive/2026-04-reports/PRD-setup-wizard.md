# PRD — frugal Setup Wizard: "Zero to Running in 15 Minutes"

> Feature spec para a experiência de onboarding mágica para utilizadores beginner.
> Sessão #20 — 2026-04-12
> **Decisões tomadas (2026-04-12)**:
> - OQ1: Orientar utilizador a usar Claude Cowork (desktop) com projecto dedicado — não Claude.ai web
> - OQ4: Token exibido com hash (eyJ...xxxx) + toggle para revelar + botão Copy
> - Language: English (internationalização futura)
> - Local LLM: Ollama é o standard por agora; novas ferramentas adicionadas quando maduras

---

## Problem Statement

Um utilizador não-técnico que descobre o frugal via recomendação de um amigo chega à landing, vê os números ($71 poupados, 90% savings), fica entusiasmado — e depois de clicar "Install" fica completamente perdido. O comando `bash <(curl...)` não significa nada para ele. Não sabe o que é Node.js, não tem VS Code, nunca viu um terminal. O resultado: abandona antes de ver qualquer valor. O frugal perde o utilizador no momento mais crítico — entre a intenção e a primeira experiência de valor.

---

## Goals

1. Qualquer pessoa com computador Windows ou Mac consegue ter o frugal a funcionar em ≤ 15 minutos, sem ajuda humana
2. Cada etapa tem um master prompt que o Claude executa automaticamente — zero comandos manuais para o utilizador
3. O utilizador sabe exactamente em que passo está e o que falta (progress visual)
4. No fim do setup, o utilizador vê os seus primeiros dados reais no dashboard
5. O Paulo (admin) vê cada utilizador que completou o setup e em que passo ficou preso

---

## Non-Goals

- Não é um tutorial de programação — não explicamos o que é Git ou Node.js em profundidade
- Não suportamos Linux (por agora — é audiência avançada)
- Não automatizamos a criação de contas em serviços terceiros (GitHub, Anthropic) — só linkamos
- Não instalamos VS Code automaticamente via script (segurança) — damos link directo
- Não substituímos o `frugal-doctor` existente — o wizard usa-o como validação final

---

## Personas

### Persona A — "O Curioso Indicado"
- Recebeu link de um amigo (o Paulo)
- Usa o computador para trabalho normal, não é developer
- Tem conta Google/GitHub por acaso
- Motivação: poupar dinheiro em ferramentas AI
- Barreira: nunca abriu um terminal na vida

### Persona B — "O Developer Preguiçoso"
- Sabe o que é Node.js mas não quer perder tempo a configurar
- Quer copiar um comando e que funcione
- Motivação: eficiência
- Barreira: demasiados passos manuais no fluxo actual

---

## Arquitectura Técnica — Fluxo Completo

```
LANDING PAGE
     │
     ▼
[Botão "Get Started Free"]
     │
     ▼
/setup — Wizard interactivo (3 perguntas)
  ├── Qual é o teu sistema? [Windows] [Mac]
  ├── Já tens o VS Code? [Sim] [Não]
  └── Já tens conta GitHub? [Sim] [Não]
     │
     ▼
PLANO PERSONALIZADO (gerado dinamicamente)
  ┌─────────────────────────────────────────┐
  │ O teu plano — 4 passos, ~12 min        │
  │                                         │
  │ ✓ FEITO  GitHub account                │
  │ ○ PASSO 1  VS Code + Node.js           │
  │ ○ PASSO 2  Login frugal               │
  │ ○ PASSO 3  Instalar frugal            │
  │ ○ PASSO 4  Validar setup              │
  └─────────────────────────────────────────┘
     │
     ▼
CADA PASSO tem:
  ├── Descrição simples (1 frase)
  ├── Tempo estimado ("~3 min")
  ├── Master Prompt [Copy] → colar no Claude
  ├── Link directo quando necessário
  └── Botão [Marcar como feito] ou detecção automática
```

---

## Os 4 Master Prompts

### PROMPT 0 — Pré-requisitos (só se necessário)
**Trigger**: utilizador diz que não tem VS Code ou Node
**Cola em**: Claude.ai (sem conta Claude Code)
**Tempo**: ~5 min

```
Preciso de preparar o meu computador para instalar o frugal.
Sistema operativo: [WINDOWS/MAC]

Por favor:
1. Verifica se tenho o VS Code instalado. Se não, dá-me o link directo para download e espera que eu confirme que instalei.
2. Verifica se tenho o Node.js v18+ instalado. Se não, instala via winget (Windows) ou brew (Mac).
3. Verifica se tenho o Git instalado. Se não, instala.
4. No fim, confirma que tudo está pronto com uma lista de verificação.

Faz uma coisa de cada vez e espera pela minha confirmação antes de avançar.
```

### PROMPT 1 — Login frugal
**Trigger**: sempre (primeiro passo real)
**Cola em**: Claude Code (terminal)
**Tempo**: ~2 min

```
Vou fazer login no frugal para ligar o meu computador ao dashboard.

1. Abre https://landing-five-azure-16.vercel.app no browser
2. Clica em "Sign in with GitHub"
3. Autoriza o frugal
4. Quando o browser mostrar o token, copia-o
5. Guarda-o com: mkdir -p ~/.frugal && echo -n "TOKEN_AQUI" > ~/.frugal/auth.token

Guia-me passo a passo. Quando terminar, confirma que o ficheiro ~/.frugal/auth.token existe.
```

### PROMPT 2 — Instalar frugal
**Trigger**: após login
**Cola em**: Claude Code (terminal)
**Tempo**: ~5 min

```
Instala o frugal no meu computador.
Sistema: [WINDOWS/MAC]

Corre o comando de instalação adequado:
- Windows: irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex
- Mac: bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)

Durante a instalação:
- Se perguntar sobre Ollama, instala
- Se perguntar sobre modelos, escolhe qwen2.5:3b (rápido, gratuito)
- Se der algum erro, mostra-mo e resolve

No fim, confirma que o frugal está instalado.
```

### PROMPT 3 — Validar e sincronizar
**Trigger**: após instalação
**Cola em**: Claude Code (terminal)
**Tempo**: ~2 min

```
Valida a minha instalação do frugal e sincroniza com o dashboard.

1. Corre: node ~/.claude/tools/router/frugal-doctor.js --sync
2. Interpreta os resultados em linguagem simples:
   - O que está a funcionar bem
   - O que está em falta e se é crítico ou opcional
   - Qual é a minha percentagem de setup completo
3. Se o sync falhou, diagnostica e corrige
4. No fim, abre https://landing-five-azure-16.vercel.app/dashboard e confirma que os meus dados aparecem

Explica tudo em linguagem simples, sem jargão técnico.
```

---

## User Stories

### Persona A (Curioso Indicado)

**Como** utilizador não-técnico que recebeu um link,  
**quero** saber exactamente o que preciso de fazer no meu computador específico,  
**para que** não precise de perceber o que é Node.js ou um terminal.

**Como** utilizador não-técnico,  
**quero** ter um prompt para copiar e colar em vez de seguir instruções manuais,  
**para que** o Claude trate de tudo por mim enquanto vejo o que acontece.

**Como** utilizador não-técnico,  
**quero** ver uma barra de progresso do meu setup,  
**para que** saiba que estou a avançar e o que falta.

### Persona B (Developer Preguiçoso)

**Como** developer,  
**quero** um único master prompt que instala tudo de uma vez,  
**para que** não perca tempo em passos manuais.

**Como** developer,  
**quero** ver imediatamente os meus dados de savings no dashboard após instalar,  
**para que** confirme que funciona antes de investir mais tempo.

---

## Requirements

### P0 — Must Have

| # | Requisito | Critério de aceitação |
|---|-----------|----------------------|
| P0.1 | Página `/setup` com detecção de OS via user-agent | Windows e Mac detectados correctamente em >95% dos casos |
| P0.2 | 3 perguntas de qualificação (OS, VS Code, GitHub) | Plano personalizado gerado em <1s após respostas |
| P0.3 | 4 master prompts com botão [Copy] | Cópia funciona em Chrome, Safari, Edge |
| P0.4 | Progress tracker persistente (localStorage) | Estado mantido se utilizador fechar e reabrir |
| P0.5 | Cada passo tem tempo estimado | Estimativas dentro de ±50% do tempo real |
| P0.6 | Links directos para VS Code download, GitHub signup | Links abrem em nova tab, sempre actualizados |

### P1 — Nice to Have

| # | Requisito | Critério de aceitação |
|---|-----------|----------------------|
| P1.1 | Detecção automática de passo completo via `/api/install-complete` | Dashboard mostra ✓ automaticamente após sync |
| P1.2 | Versão dos prompts para Claude.ai (sem Claude Code) | Prompts adaptados para ambiente web |
| P1.3 | Animação de celebração no passo final | Confetti ou similar quando setup 5/5 |
| P1.4 | Share button "Estou pronto, e tu?" | Link pré-preenchido para enviar a amigos |

### P2 — Future

| # | Requisito |
|---|-----------|
| P2.1 | Setup via video walkthrough (Loom) por OS |
| P2.2 | Chat de suporte directo com Paulo no wizard |
| P2.3 | Setup automático 100% via script sem Claude |

---

## Fluxograma Detalhado por OS

### Windows

```
Tem VS Code? ──Não──> Link: https://code.visualstudio.com/download
     │                      (espera confirmação)
    Sim
     │
Tem Node.js? ──Não──> PROMPT 0: instala via winget
     │
    Sim
     │
GitHub account? ──Não──> Link: https://github.com/signup
     │
    Sim
     │
PROMPT 1: Login (abre landing, copia token)
     │
PROMPT 2: Install via install-windows.ps1
     │
     ├── Tem Ollama? ──Não──> instala automaticamente
     │
     └── Tem qwen2.5:3b? ──Não──> ollama pull qwen2.5:3b
     │
PROMPT 3: frugal-doctor --sync
     │
Dashboard: Setup 5/5 ✓
```

### Mac

```
Tem VS Code? ──Não──> Link: https://code.visualstudio.com/download
     │
    Sim
     │
Tem Homebrew? ──Não──> PROMPT 0: instala brew
     │
Tem Node.js? ──Não──> brew install node
     │
GitHub account? ──Não──> Link: https://github.com/signup
     │
PROMPT 1: Login
     │
PROMPT 2: Install via install.sh
     │
PROMPT 3: frugal-doctor --sync
     │
Dashboard: Setup 5/5 ✓
```

---

## Design da Página /setup

```
┌─────────────────────────────────────────────────────┐
│  F. frugal                                          │
│                                                     │
│  Let's get you set up                               │
│  ~12 minutes · No coding required                  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  First, tell us about your setup            │   │
│  │                                             │   │
│  │  Your computer:  [🪟 Windows] [🍎 Mac]     │   │
│  │  VS Code:        [✓ Installed] [✗ Not yet] │   │
│  │  GitHub account: [✓ I have one] [✗ No]    │   │
│  │                                             │   │
│  │  [Generate my plan →]                      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

APÓS RESPOSTAS:
┌─────────────────────────────────────────────────────┐
│  Your plan — 3 steps, ~10 min                       │
│                                                     │
│  ✓ GitHub account          done                     │
│                                                     │
│  ● STEP 1  Log in to frugal         ~2 min         │
│  ┌───────────────────────────────────────────┐     │
│  │ Open Claude Code and paste this:          │     │
│  │                                           │     │
│  │ [prompt text preview...]          [Copy] │     │
│  │                                           │     │
│  │ Where to paste: Claude Code terminal     │     │
│  └───────────────────────────────────────────┘     │
│  [Mark as done ✓]                                  │
│                                                     │
│  ○ STEP 2  Install frugal           ~5 min         │
│  ○ STEP 3  Validate your setup      ~2 min         │
└─────────────────────────────────────────────────────┘
```

---

## Success Metrics

### Leading indicators (semanas 1-2)
- % de utilizadores que chegam à página `/setup` e completam pelo menos 1 passo: target >60%
- Tempo médio entre "Generate my plan" e primeiro sync bem-sucedido: target <15 min
- Taxa de copy dos master prompts: target >80% dos utilizadores que chegam ao passo

### Lagging indicators (mês 1)
- % de utilizadores indicados que chegam a Setup 5/5: target >40%
- Churn na semana 1 (utilizadores que instalam mas não voltam): target <30%
- NPS de utilizadores que completaram o wizard: target >50

---

## Open Questions

| # | Questão | Responsável | Prazo |
|---|---------|-------------|-------|
| OQ1 | Os prompts devem funcionar no Claude.ai (web) além do Claude Code? Audiência beginner pode não ter Claude Code. | Paulo | antes de MP-10 |
| OQ2 | O token do frugal deve ser mostrado visualmente na landing após OAuth para o utilizador copiar? Já temos a infra mas não o UI. | Paulo | MP-10 PEÇA 6 |
| OQ3 | Quanto custa ao Paulo ter Ollama obrigatório para todos? GPU é necessária ou CPU serve para beginners? | Paulo | antes de lançar |
| OQ4 | O wizard deve estar em PT-PT ou EN? Friends Beta é Portugal ou internacional? | Paulo | antes de MP-10 |

---

## Timeline

| Fase | Conteúdo | Dependências |
|------|----------|--------------|
| **Agora** | Fix campos legacy (PEÇA 1 MP-10) | — |
| **MP-10** | Dashboard v2 + Admin + Auto-sync | PEÇA 1 feita |
| **MP-11** | Página /setup com wizard + 4 master prompts | MP-10 feito, OQ1/OQ4 respondidas |
| **Friends Beta** | 5 amigos testam end-to-end | MP-11 feito, Paulo validou |

---

## Notas finais

O insight mais importante desta spec: **o Claude é o instalador**. Em vez de escrever scripts para cada caso edge, delegamos a complexidade ao Claude que o utilizador já tem. O wizard é apenas um gerador de prompts contextualizados. Isto é escalável, manutenível, e alinhado com o produto — um router de LLMs que usa LLMs para se instalar.
