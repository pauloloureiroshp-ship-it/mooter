# VISION_V2.md
# frugal — O Sistema Operativo do Vibe Coder
# Versão: 2.0 · Data: 2026-04-10 · Autor: Paulo Loureiro

> Este documento captura a visão expandida do frugal.
> Não é um roadmap técnico — é o "porquê" que guia todas as decisões.
> Lê antes de qualquer sessão de produto ou engenharia.

---

## O Problema Real

Um vibe coder iniciante hoje acorda e enfrenta isto:

- 47 vídeos novos no YouTube sobre "a melhor ferramenta de IA desta semana"
- Subscrições no Lovable ($25/mês), Claude Max ($20/mês), GitHub Copilot ($10/mês), ChatGPT Plus ($20/mês)
- Não sabe se está a usar bem nenhuma delas
- O projecto que imaginou há 3 meses ainda não saiu do papel
- Medo de carregar no "build" porque não sabe quanto vai custar

**O frugal não resolve só o custo. Resolve o ruído, a paralisia e o medo.**

A maior barreira para um vibe coder não é a falta de talento ou de ideias.
É não saber por onde começar, com o quê, e quanto vai custar.

---

## O que o frugal É (v2.0)

**O frugal é o sistema operativo do vibe coder.**

Não é mais apenas um router de LLMs. É a camada de inteligência que:

1. **Conhece o utilizador** — hardware, subscrições, projectos, stack, nível de experiência
2. **Optimiza automaticamente** — routing de modelos, configuração de tools, sugestões de setup
3. **Aprende com a comunidade** — cada decisão de routing melhora o algoritmo para todos
4. **Liberta de ter de acompanhar o ruído** — o frugal actualiza-se, o utilizador não precisa

A promessa central muda de:
> "Poupa 90% no Claude Code"

Para:
> "Concentra-te na tua ideia. Nós tratamos do resto."

---

## Os 3 Tipos de Utilizador

### Tipo 1 — O Iniciante (maior mercado)
- Começou no Lovable, achou caro e limitado
- Ouviu falar do Claude Code mas tem medo do terminal
- Quer construir o seu projecto mas não sabe o setup ideal
- **O frugal resolve**: onboarding guiado, config automática, "for dummies"

### Tipo 2 — O Intermediate (mais valioso para dados)
- Já usa Claude Code, já paga $20-100/mês em modelos
- Sabe que está a desperdiçar mas não sabe onde
- Tem projectos no GitHub, usa Next.js ou Python, tem subscrição activa
- **O frugal resolve**: savings imediatos, perfil automático via GitHub, config optimizada

### Tipo 3 — O Power User (evangelista)
- Developer experiente, usa múltiplos modelos, tem opinião forte
- Quer controlo total sobre o routing
- Vai partilhar com a comunidade se o produto for bom
- **O frugal resolve**: modo Beast/Zen/Auto, access ao hub de dados, customização total

---

## O Fosso Competitivo (o que ninguém consegue copiar)

### Hoje
O `classify.js` com 102 patterns e 100% accuracy num corpus de 1,437 prompts reais.
Qualquer developer replica o código em 2 horas. O que não replica: **os dados**.

### Em 12 meses
Um modelo de routing treinado em 100,000+ decisões reais de routing, anonimizadas, com labels de qualidade (o utilizador confirmou que a decisão foi boa ou má). Nenhum concorrente tem este dataset porque nenhum tem o acesso ao nível do prompt que o frugal tem.

### Em 24 meses
Perfis de utilizador que cruzam: hardware + subscrições + stack + padrões de prompting + projectos GitHub + histórico de savings. O frugal sabe que um utilizador com Mac M3 + Next.js + Claude Max tem um perfil de routing completamente diferente de um utilizador com Windows + Python + API-only. E entrega configs radicalmente diferentes para cada um.

**Este é o segredo da Coca-Cola: não a fórmula, mas o conhecimento acumulado de cada utilizador.**

---

## Arquitectura de Dados (o activo mais valioso)

```
Nível 1 — Público (MIT)
  classify.js, inject_context.js, install.sh
  O código que qualquer um pode ver e copiar.
  Não é o diferenciador.

Nível 2 — Comunidade (hub, agregado, anónimo)
  tier + confidence + prompt_len + hw_tier + cascade_path
  Agregado de todos os utilizadores.
  Melhora o classify.js automaticamente.
  Parcialmente público (stats na landing).

Nível 3 — Perfil (privado por utilizador, encriptado)
  hardware, subscriptions, stack, GitHub repos metadata,
  routing history, savings history, custom patterns
  Nunca sai da conta do utilizador.
  É a base da personalização.

Nível 4 — Motor (privado, repo frugal-core)
  O modelo treinado nos dados do Nível 2.
  O dataset com labels de qualidade.
  As decisões de arquitectura do algoritmo.
  Nunca público. Nunca open-source.
  É o segredo da Coca-Cola.
```

---

## Princípios de Produto (não negociáveis)

1. **Zero fricção no primeiro uso** — instala em 1 linha, vê o benefício em 30 segundos
2. **Privacy by default** — os prompts nunca saem da máquina. Nunca.
3. **O utilizador não precisa de acompanhar o ruído** — o frugal actualiza-se sozinho
4. **Simples por fora, inteligente por dentro** — o iniciante vê simplicidade, o power user vê controlo
5. **O savings real é o produto** — não o número no dashboard, o dinheiro que fica no bolso

---

## O que o frugal NÃO é (igualmente importante)

- **Não é um proxy** — não intercepta comunicação entre o utilizador e a Anthropic
- **Não é um agregador de subscrições** — não gere as contas do utilizador
- **Não é uma plataforma de conteúdo** — não ensina vibe coding, apenas optimiza
- **Não é um assistente** — não responde perguntas, apenas roteia e optimiza
- **Não é um produto de empresa** — é para developers individuais e pequenas equipas

---

## Métricas que importam

### North Star
**Savings reais gerados para a comunidade** (em USD, acumulado, visível na landing)
Meta v1.0: $10,000 poupados pela comunidade
Meta v2.0: $1,000,000 poupados pela comunidade

### Leading Indicators
- % de utilizadores que chegam ao primeiro /frugal-status (activation)
- Prompts/dia por utilizador activo (engagement)
- T0% médio da comunidade (eficiência do algoritmo)

### Lagging Indicators
- Retenção a 30 dias (% que ainda usa depois de 1 mês)
- NPS da comunidade (estão a recomendar?)
- Savings/utilizador/mês (está a crescer com o tempo?)

---

## Roadmap de Alto Nível

```
v1.0 — Prova o núcleo (agora)
  10 amigos a usar, dados reais, savings comprovados.
  Landing page de nível world-class.
  Registo simples com magic link.

v1.5 — O Perfil (Q2 2026)
  GitHub OAuth + análise de metadata de repos.
  Config personalizada gerada automaticamente.
  "O teu frugal" — cada utilizador recebe um setup diferente.
  Contador de savings da comunidade na landing (tempo real).

v2.0 — O Sistema Operativo (Q3 2026)
  Sugestões activas ("activa isto, poupa X mais").
  Dashboard de projectos com insights de stack.
  Planos pagos (success fee 20% das savings).
  Programa de referidos.

v3.0 — O Motor Proprietário (Q4 2026)
  Modelo de routing treinado nos dados da comunidade.
  API pública para integrar noutras ferramentas.
  frugal para teams (empresas de vibe coding).
  O dataset como activo comercial (licenciamento B2B).
```

---

## Uma frase para resumir

> **"O frugal é o que acontece quando alguém finalmente decide que os vibe coders merecem uma ferramenta que os conhece melhor do que o ruído do mercado."**

— Paulo Loureiro, São Paulo, 2026
