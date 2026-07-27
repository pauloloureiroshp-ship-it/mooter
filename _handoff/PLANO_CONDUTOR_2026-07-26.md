# PLANO CONDUTOR — Mooter, as 15 frentes fechadas em harmonia
**Data:** 2026-07-26 · **Base:** `chore/mooter-20-h0` (Ondas 0+1 shipped: `fd4f425`+`4bf34eb`+`86a3af5`, v1.12.0)
**Supersede a sequência do** `MASTER_PROMPT_MOOTER_COWORK_2026-07-26.md` **apenas na condução; o conteúdo técnico dele continua válido.**

## Doutrina do condutor (pedido do Paulo, 26/07 noite)
1. **O Cowork (Fable 5) CONDUZ, não executa.** Briefs curtos, verificação de diffs, gates. O tokens caros são os desta conversa — cada linha de código escrita aqui é desperdício.
2. **GPU/moos ao máximo:** toda a análise, resumo, comparação e preparação → `moo` ($0). Com v1.12: num_ctx real, selector por geração, keep_alive.
3. **Codex para código:** implementação e validação cruzada → `agent: codex` (quota OpenAI, separada; 2.560 rollouts provam que está paga e subutilizada).
4. **cc só quando o rigor Anthropic é indispensável** — e nunca acima do tecto da calibragem (hoje: sonnet).
5. **Nada entra sem:** suites verdes no nativo + diff lido pelo condutor + commit selectivo via runner nativo. Veredicto de moo NUNCA é prova (registo 07-26: moo T0 fabrica).

## Matriz de cobertura — as 15 frentes × onde ficam fechadas

| # | Frente | Estado | Fecha em |
|---|---|---|---|
| 1 | Timings local↔subscrição em série | ❌ aberto | **Onda 2** (2.1 timeout, 2.2 medição, 2.3 fallback) |
| 2 | Fleet roteia mal p/ modelos locais | ✅ **fechado hoje** (selector adequação×capacidade, v1.12) | prova pós-restart: job real escolhe qwen3.6:27b |
| 3 | LoRA/DoRA desligados | 🟡 estrutura existe | **Onda 3.7** — SÓ depois do loop 3.1-3.6 (dados primeiro) |
| 4 | Quantização/num_ctx | ✅ **fechado hoje** (num_ctx≥16384, keep_alive, KV q8_0) | prova pós-restart Ollama: /api/ps ≥16384 |
| 5 | Modelos locais melhores já instalados | ✅ **fechado hoje** (qwen3.6:27b passa a ganhar) | idem #2 |
| 6 | Live Preview no Cowork | ✅ medido (5 ms) | manter sonda |
| 7 | Usage Claude inflacionado + Codex ignorado | ✅ **fechado hoje** (dedup 2,44×, Codex lido, ref calibrada 75%) | vale no runtime pós-restart |
| 8 | Radar de concorrência | ❌ aberto | **Onda 5.3** (radar trimestral versionado no repo) |
| 9 | STRATEGY.md congelado em Maio | ❌ aberto | **Onda 5.1** (reescrever com a tese "motor=fosso, cabine=produto") |
| 10 | Ciclo de aprendizagem desligado | ❌ aberto | **Onda 3** (3.1 outcomes→learner→classify · 3.2 keep rate · 3.3 satisfação inferida · 3.6 "o que aprendi") |
| 11 | Lentidão sentida (prep em série 13-37s) | ❌ aberto | **Onda 2** — prioridade nº1 do condutor |
| 12 | Métricas de routing dos concorrentes | 🟡 mapeadas | **Onda 3** (keep rate, custo/tarefa, cache-awareness 3.5) |
| 13 | Contexto de projecto persistente | ❌ aberto | **Onda 4.5** (`PROJECT_CONTEXT.json` barato por worktree) |
| 14 | Vault ✅ / Notion 7 releases atrás | ❌ aberto | **Onda 5.2** (sync Notion) — vault continua em dia |
| 15 | Estamos à frente? | 🟡 tese sim, execução a fechar | **Onda 4** (fan-out, verificação cruzada $0, failover, latency/least-busy) — o que ninguém vende |

**Verificação de harmonia (gaps encontrados e tapados):**
- ⚠️ O runtime instalado era v1.9.0 (régua torta a mandar tudo p/ haiku) → **Fase 0 feita**: v1.12.0 instalada, falta só o restart do Desktop.
- ⚠️ Bind do projecto perdido (`P / tmp`) — bug §5.4 do master prompt; rebind explícito em cada dispatch até à Onda 5.4.
- ⚠️ Bugs §5.4 (create_worktree ignorado, permissoes_efectivas mente) não estavam em onda nenhuma → entram na **Onda 5.4**.
- ⚠️ Restart do Ollama pendente (KV q8_0 + primeiro /api/ps ≥16384).

## Sequência de execução (condutor)
```
FASE 0 ✅ conector v1.12.0 instalado (restart no fim da sessão)
ONDA 2 🔥 (agora, via Mooter): moo analisa → codex implementa → suites → runner comita
ONDA 3 🔜 loop que aprende (outcomes→learner→classify, keep rate, bloco "o que aprendi")
ONDA 4    fosso (fan-out, verificação cruzada local↔nuvem, failover, PROJECT_CONTEXT)
ONDA 5    narrativa (STRATEGY.md, Notion, radar, bugs conector) — pode intercalar com 3/4
LoRA      só depois da Onda 3 ter dados (inegociável)
```

## Provas de fim (o que "o melhor que existe" significa, medível)
1. Tempo até 1º token útil: prep nunca custa >20 s sem justificação medida (Onda 2).
2. Um resultado de job MUDA uma decisão futura, com registo (Onda 3).
3. Uma resposta verificada por dois motores custa menos do que um Opus sozinho (Onda 4).
4. Nenhum documento canónico contradiz o produto (Onda 5).
5. Quota: painel = app (calibragem 75% já feita; re-verificar à próxima barra).
