---
title: "Mooter — Estratégia Canónica"
subtitle: "Single Source of Truth · O motor é o fosso, a cabine é o produto"
author: "Paulo Loureiro"
date: "2026-07-26"
documentclass: article
geometry: "margin=2cm"
fontsize: 11pt
linkcolor: "blue"
urlcolor: "blue"
toccolor: "black"
colorlinks: true
toc: true
toc-depth: 2
numbersections: false
---

> **Regra deste documento:** se uma linha aqui contradiz o código, uma das duas está errada e
> resolve-se no mesmo dia. Um "single source of truth" desactualizado é um segundo mapa a apontar
> para o sítio errado — foi exactamente o que aconteceu entre 2026-05-24 e 2026-07-26, quando este
> ficheiro continuou a dizer "v0.11, gate a 26 de Maio" com o produto em v1.13.0. A versão
> anterior está arquivada em `docs/foundation/STRATEGY_ARCHIVE_2026-05-24.md`.

# Sumário executivo

**Mooter existe para que um vibe coder opere como um mestre sem estudar todos os dias.** Instala,
vigia e pilota um projecto multi-agente real a partir do VS Code e do Cowork, com visibilidade
total.

Duas metades, e a distinção é a tese inteira:

- **O motor é o fosso.** Um router determinístico local (<50 ms, $0 a classificar) que orquestra
  várias subscrições (Anthropic, OpenAI, Google) mais a GPU do próprio utilizador (Ollama),
  encaminha cada pedido para o tier mínimo viável e aprende com telemetria local. Nunca faz proxy
  de prompts, nunca fabrica métricas.
- **A cabine é o produto.** O que se vende é a experiência: **Resume · Plan · Route (invisível) ·
  Watch · Review**. Uma mudança só ganha lugar se melhorar uma destas cinco.

**Estado real (2026-07-26):** conector `mooter-bridge` **v1.13.0**; extensão VS Code v0.16.x;
`classify.js` FROZEN e verificado em CI. As Ondas 0-2 da auditoria dos 15 pontos estão em
`chore/mooter-20-h0`.

# O que é verdade hoje, medido

| Facto | Valor | Como foi medido |
|---|---|---|
| Inflação da leitura de quota (corrigida) | **2,44×** — 2 061 linhas → 844 turnos | `_handoff/onda0-medicao.json`, 47 ficheiros de sessão |
| Peso semanal, antes → depois da dedup | 15 283 → **8 971** | idem |
| Referência de quota calibrada | 11 961 (barra da app em 75%) | `~/.mooter/preferences.json` |
| Quota do Codex | 2,47M in / 33,5k out / 55 turnos em 7 dias | `~/.codex/sessions/**/rollout-*.jsonl` |
| Contexto do tier local | era 4096 (default silencioso) → **≥16 384** | `/api/ps` e payload do bridge |
| Sonda de quota a bloquear o event loop | **209 ms** → passa a ceder o ciclo | regressão E2E apanhada na Onda 2 |
| Live Preview no Cowork | iframe carrega em **5 ms** | `~/.mooter/ui-probe.json` |
| GPU | RTX 4090, 23 028 MiB, driver 610.62 | `nvidia-smi` |

Tudo o que não estiver nesta tabela e parecer um número deve trazer fonte, ou dizer `n/d`.

# Tier ladder

| Tier | Routing | Notas |
|---|---|---|
| T0 | auto | Ollama local (custo de API = 0; energia não está medida e não é zero) |
| T1 | auto | Haiku |
| T2 | auto | Sonnet |
| T3 | auto | Opus — deploy, segredos e migrações forçam T3 |
| T5 | **só com `@fable`** | Fable — nunca auto-roteado; não existe T4 |

A calibragem por quota só **desce** de tier, nunca sobe, e diz sempre porquê.

# Os três pilares competitivos

1. **Consciência de subscrição, não de factura.** Ninguém mais lê a quota de um plano Max/Pro: a
   Anthropic não expõe endpoint para isso e a leitura local dos ficheiros de sessão é a única
   fonte acessível — com a ressalva, sempre colada ao número, de que é um limite inferior. O
   LiteLLM gere orçamentos por chave e recusa quando acaba; o OpenRouter escolhe um fornecedor
   mais barato e continua a cobrar. Nós descemos de tier e, no limite, mandamos para uma placa que
   não cobra nada: **o trabalho não pára.**
2. **A GPU do utilizador como tier de primeira.** Não como recurso envergonhado de último minuto:
   com contexto real, escolha de modelo por adequação (geração antes de tamanho, especialista de
   código para código) e explicação em linguagem de gente. Um tier local mal configurado é pior do
   que nenhum, porque dá respostas más de graça — e uma resposta má custa mais do que Sonnet.
3. **Honestidade como funcionalidade.** `n/d` em vez de estimativa disfarçada; a ressalva viaja
   com o número; a escolha de modelo deixa rasto auditável no ledger. É cultura, não feature — e
   por isso é a mais difícil de copiar.

# O fosso que ainda não existe (e continua vago no mercado)

Levantamento de Julho de 2026: **não encontrámos nenhum produto comercial a vender fan-out com
verificação cruzada entre motores.** O Cursor Router (GA 2026-07-22) trouxe *keep rate*, custo por
commit e — o ponto que nos aponta directamente — **cache-awareness**: trocar de modelo a meio
invalida o prompt cache, e qualquer poupança reportada que ignore isso é ficção. A nossa própria
medição diz que a releitura de cache é ~48,8% do peso; entra na conta antes de mostrarmos qualquer
número de poupança.

O mercado ficou **mais vazio**, não mais cheio: o Roo Code encerrou (Maio 2026) e o Continue.dev
foi comprado pela Cursor (Junho 2026). Restam Cline e Kilo Code com Ollama BYOK, e nenhum deles lê
quota de subscrição nem faz verificação cruzada.

Portanto, por ordem: fan-out real (uma tarefa, N motores, merge), verificação cruzada local↔nuvem
quase a custo zero (o local propõe, a nuvem confirma só o que diverge), failover com estado, e um
mapa de projecto persistente que evite pagar a redescoberta em cada job.

# Anti-objectivos

Mooter **não** substitui o Claude Code nem o Codex: coabita e orquestra. Não faz proxy de prompts
nem os guarda fora da máquina do utilizador. Não publica números de poupança sem incluir o custo
de cache. Não promete "aprende contigo" antes de existir telemetria recolhida — uma LoRA treinada
sobre dados que ninguém recolhe é teatro caro. E não persegue quantizações que o hardware não faz:
NVFP4 exige Blackwell, a 4090 é Ada, e Q4_K_M continua o alvo certo.

# Como se mede o progresso

Cinco provas, e nenhuma delas é uma tabela de ticks verdes: o tempo até ao primeiro token útil,
com a preparação local a nunca custar mais do que o tecto medido; um resultado de job a **mudar**
uma decisão futura, com registo; uma resposta verificada por dois motores a custar menos do que um
Opus sozinho; nenhum documento canónico a contradizer o produto; e o número de quota no painel a
bater com a barra da aplicação.

# Onde vive o resto

| Precisas de | Ficheiro |
|---|---|
| Estado actual e próxima missão | `SYNC.md` |
| Plano das ondas e cobertura das 15 frentes | `_handoff/_archive/2026-07/PLANO_CONDUTOR_2026-07-26.md` |
| Auditoria que originou o plano | `_handoff/_archive/2026-07/MASTER_PROMPT_MOOTER_COWORK_2026-07-26.md` |
| Infra, URLs, endpoints, afinação do Ollama | `INFRA.md` |
| Instruções para agentes | `AGENTS.md` · `CLAUDE.md` |
| Política de routing detalhada | `~/.claude/docs/ROUTING_POLICY.md` |
