# ARCHITECTURE_PRIVATE.md
# frugal — Arquitectura do Motor Proprietário
# CONFIDENCIAL — não commitar para repo público
# Data: 2026-04-10 · Autor: Paulo Loureiro

> Este documento define o que é o "segredo da Coca-Cola" do frugal
> e como protegê-lo à medida que o produto cresce.
> Deve viver num repo PRIVADO separado: `frugal-core` ou `frugal-engine`.

---

## Estrutura de Repos

### Repo público: `frugal` (já existe)
```
MIT License. Qualquer pessoa pode ver, clonar, usar.
Contém:
  - classify.js (o código, não o dataset que o treinou)
  - inject_context.js
  - install.sh / install-windows.ps1
  - landing/
  - hub/ (worker público)
  - PRIVACY.md, README.md, docs/
```

### Repo privado: `frugal-core` (criar já)
```
Proprietário. Acesso: só Paulo.
Contém:
  - /dataset/           ← o activo mais valioso
  - /model/             ← versões do modelo de routing
  - /decisions/         ← snapshots do algoritmo de decisão
  - /research/          ← análises de padrões, benchmarks internos
  - /roadmap-private/   ← decisões estratégicas que não são públicas
```

### Repo privado: `frugal-data` (criar quando tiver 1000+ utilizadores)
```
Proprietário. Acesso: só Paulo + sistema automatizado.
Contém:
  - /raw/               ← deltas recebidos do hub (anonimizados)
  - /processed/         ← datasets limpos e etiquetados
  - /training/          ← scripts de treino do modelo
  - /evals/             ← resultados de avaliação
```

---

## O Dataset — o activo central

### O que já existe
```
/tools/router/decisions.log  ← log de todas as decisões de routing
  Formato: { ts, prompt_len, tier, confidence, matchedPatterns, latencyMs, hw_tier }
  Estado: local na máquina de cada utilizador
  Problema: não está a ser agregado sistematicamente
```

### O que precisa de existir (v1.5)

**Estrutura do dataset de treino:**
```jsonl
// training-decisions.jsonl
// Uma linha por decisão de routing validada
{
  "id": "sha256-hash-of-prompt",        // nunca o prompt raw — só o hash
  "prompt_len": 45,                      // comprimento em caracteres
  "prompt_len_bucket": "short",          // "short" (<100) | "medium" (100-500) | "long" (500+)
  "tier_assigned": "T0",                 // decisão do classify.js
  "tier_correct": true,                  // foi confirmado como correcto? (ver abaixo)
  "confidence": 0.94,                    // confiança do classify.js
  "matched_patterns": ["TRIVIAL: rename", "short_prompt"],
  "hw_tier": "gpu_mid",
  "user_cohort": "intermediate",         // derivado do perfil, nunca do utilizador individual
  "session_hash": "abc123",              // hash anónimo da sessão — agrupa decisões do mesmo utilizador
  "ts": "2026-04-10T12:00:00Z",
  "frugal_version": "0.9.3"
}
```

**Como determinar `tier_correct`:**
- Se o utilizador não fez nada (não regenerou a resposta) → assumed correct
- Se o utilizador usou `/frugal-beast` logo a seguir → assumed wrong (deveria ter sido T3)
- Se a resposta foi completada e o utilizador continuou → assumed correct
- Futuramente: feedback explícito via `/frugal-feedback good|bad`

### Versioning do dataset
```
/dataset/
  v1.0-2026-04-10.jsonl    ← 1,437 prompts (corpus inicial, curado manualmente)
  v1.1-2026-05-01.jsonl    ← +500 prompts da comunidade (primeiros 10 amigos)
  v2.0-2026-07-01.jsonl    ← +10,000 prompts (após launch público)
  CHANGELOG.md             ← o que mudou em cada versão, accuracy, tamanho
```

---

## O Modelo de Routing — evolução planeada

### Fase 1 (actual): Regex puro
```
classify.js — 102 patterns, 11 passes, <50ms
Accuracy: 100% no corpus de 1,437 prompts curados
Limitação: não aprende, não generaliza para padrões novos
Vantagem: zero custo de inferência, completamente local
```

### Fase 2 (v1.5 — quando tiver 5,000+ prompts validados): Regex + Statistical
```
Adiciona uma camada estatística ao classify.js:
- Vectorização TF-IDF dos prompts (local, no classify.js)
- Lookup numa tabela de padrões aprendidos da comunidade
- Se regex tem alta confiança (>0.85) → usa regex
- Se regex tem baixa confiança (<0.85) → consulta tabela estatística
- A tabela é actualizada via hub-pull (pull do hub, não push)
Custo de inferência: ~0ms (lookup local, tabela em memória)
Tamanho estimado da tabela: <500KB
```

### Fase 3 (v2.0 — quando tiver 50,000+ prompts): Modelo embebido
```
Um modelo tiny (1-3M parâmetros) treinado especificamente para routing.
Corre 100% local (ONNX Runtime ou similar).
Input: prompt embeddings (calculados localmente)
Output: tier (T0/T1/T2/T3) + confidence
Latência target: <10ms mesmo em CPU
Tamanho: <5MB (embebido no installer)
Dataset de treino: os 50,000+ prompts validados da comunidade
```

### Fase 4 (v3.0): Modelo personalizado por perfil
```
O modelo base (Fase 3) + fine-tuning por cohort de utilizador:
  - Cohort "Mac M3 + Next.js + Claude Max" tem um modelo ligeiramente diferente
  - Cohort "Windows + Python + API-only" tem outro
  - Fine-tuning é feito server-side, o utilizador recebe a versão do modelo para o seu perfil
  - Actualização silenciosa via hub-pull
```

---

## Segurança do Motor

### O que NUNCA sai do frugal-core
- O dataset de treino (mesmo anonimizado)
- Os pesos do modelo (quando existir)
- As métricas de accuracy por padrão
- A lógica de scoring dos padrões
- Os evals internos

### O que pode ser público (sem comprometer o motor)
- A accuracy global ("100% no corpus de 1,437 prompts")
- O número de padrões ("102 patterns")
- A latência ("<50ms")
- O código do classify.js (sem o dataset que o criou)

### Backups
```
Strategy:
  - GitHub (repo privado frugal-core) — primário
  - Cloudflare R2 (bucket privado frugal-backups) — automático, diário
  - Local no PC do Paulo — manual, semanal

Frequência de backup automático:
  - Dataset: após cada batch de 100+ novas decisões
  - Modelo: após cada re-treino
  - Todo o repo frugal-core: nightly via GitHub Actions privadas
```

---

## Integrações Externas — Princípios de Design

### GitHub OAuth (v1.5 — PRIORITÁRIO)
```
Scopes necessários (mínimo):
  read:user    ← nome, username, avatar (para perfil)
  public_repo  ← lista de repos públicos (metadata apenas)

O que extraímos:
  - Linguagens usadas nos repos (JavaScript/TypeScript/Python/etc.)
  - Tamanho dos repos (pequeno/médio/grande)
  - Actividade recente (commits nos últimos 30 dias)
  - Número de repos activos

O que NUNCA fazemos:
  - Ler código
  - Aceder a repos privados (sem o scope repo)
  - Armazenar qualquer conteúdo de ficheiros
  - Indexar nomes de ficheiros ou funções

Resultado:
  Um "GitHub fingerprint" anónimo que nos diz:
  "Este utilizador trabalha principalmente com TypeScript + Next.js,
   tem projectos de tamanho médio, é activo há 2 anos."
  → Perfil de routing completamente diferente de um utilizador Python/Django.
```

### Google OAuth (v1.5 — SSO simples)
```
Scopes necessários:
  profile  ← nome e avatar apenas
  email    ← para identificar a conta

Não usamos Google Drive, Gmail, Google Docs.
O Google OAuth é puramente para conveniência de login — não para dados.
```

### Integrações a NÃO fazer (pelo menos até v3.0)
```
1Password   → risco de reputação enorme se houver qualquer incidente
Obsidian    → dados locais, sem OAuth limpo, pouco sinal para routing
Docker Hub  → interessante mas complexo, fica para depois
VS Code     → já temos a extensão (v0.4.0) — integrar via extensão, não OAuth
Notion      → interessante para context do projecto, mas privacidade delicada
```

### VS Code Extension — integração profunda (v2.0)
```
A extensão frugal para VS Code (v0.4.0 existe, não publicada) pode fazer:
  - Detectar a linguagem do ficheiro actual → hint para o router
  - Detectar o framework do projecto (package.json, requirements.txt)
  - Detectar se há erros no editor → hint de que o prompt é provavelmente debug
  - Enviar contexto anonimizado para o classify.js (sem código, só metadata)

Isto melhora significativamente a accuracy do routing sem expor código.
```

---

## Monetização (quando o produto provar o valor)

### Fase 1 — Free (agora)
```
Tudo gratuito. Foco em crescimento e dados.
O Paulo investe tempo, a comunidade retorna dados.
```

### Fase 2 — Success Fee (v2.0)
```
Free tier: acesso completo ao router, sem limites
Pro tier: 20% das savings geradas pelo frugal
  Exemplo: se o frugal poupou $100 este mês → o utilizador paga $20
  Se o frugal não poupar nada → o utilizador não paga nada

Mecanismo de cálculo:
  (prompts no mês × custo médio sem frugal) - (custo real com frugal) = savings
  savings × 0.20 = fee mensal
  Cap: $50/mês (para não assustar utilizadores de alto volume)
```

### Fase 3 — B2B / Enterprise (v3.0)
```
Empresas com equipas de vibe coders:
  - Hub privado (os dados da empresa não vão para a pool pública)
  - Modelo customizado para a stack da empresa
  - SSO, audit logs, SLA
  - Preço: $500-2000/mês por equipa

Dataset licensing (muito mais tarde):
  O dataset anonimizado de decisões de routing tem valor para:
  - Anthropic, OpenAI (para treinar os próprios modelos de routing)
  - Pesquisa académica (NLP, routing, cost optimization)
  - Outros players de dev tools
```

---

## Nota Final — O Que Protege o Negócio

O código é MIT. Qualquer pessoa pode criar o "clone do frugal" em 2 semanas.

O que protege o frugal não é o código — é a combinação de:

1. **O dataset** — 1,437 prompts hoje, 1,000,000 amanhã. Não replicável.
2. **Os perfis** — o conhecimento acumulado de cada utilizador. Não replicável.
3. **A comunidade** — utilizadores que confiam, que partilham dados, que recomendam. Demora anos a construir.
4. **A reputação de privacidade** — "nunca vimos o teu código" é uma promessa que o frugal cumpre desde o dia 1.

**Protege o dataset. Protege os perfis. Cresce a comunidade. O resto é implementação.**
