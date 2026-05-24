# MOOTER CONTINUOUS TESTER v3 — Master Prompt
# Para um terminal DEDICADO. NÃO usar no terminal principal.
# Data: 2026-04-16 · Versão: 3.0

---

## MISSÃO

Abre um terminal e corre este comando. Ele nunca para. Trabalha 24/7 a melhorar o Mooter usando apenas a tua GPU e modelos locais. **Custo: $0.00.**

```
cd "C:\Users\Paulo Loureiro\frugal\tools\router"
node mooter-continuous-tester.js
```

Para modo agressivo (GPU no máximo, ciclos de 20s):
```
cd "C:\Users\Paulo Loureiro\frugal\tools\router"
node mooter-continuous-tester.js --aggressive
```

---

## O QUE FAZ (cada ciclo ~45-90s)

### Pipeline completo a cada ciclo:

```
GENERATE → CLASSIFY → TROPICALIZE → EXECUTE → A/B → EMBED → LOG
```

1. **Gerar prompts** — 8+ por ciclo com complexidade calibrada (T0→T3)
   - Templates instantâneos (sem GPU) com 40+ padrões por tier
   - A cada 3 ciclos: gera prompts via Ollama para variedade real

2. **Classificar** — passa cada prompt pelo `classify.js` e verifica accuracy por tier

3. **Executar modelos reais** — corre 2+ prompts nos modelos Ollama disponíveis:
   - `qwen2.5:3b` (T0/T1), `deepseek-r1:7b` (T1/T2), `gemma3:12b` (T1/T2)
   - `qwen2.5-coder:14b` (T1/T2/T3), `gemma4:e4b` (T2/T3), `qwen3:30b` (T2/T3)
   - Mede latência real, tokens, e sucesso por modelo

4. **A/B Model vs Model** — mesmo prompt, 2 modelos diferentes, Ollama julga o melhor
   - Constrói quality matrix empírica: qual modelo domina qual tipo de tarefa

5. **A/B Raw vs Tropicalized** — a cada 2 ciclos:
   - Mesmo prompt raw + versão optimizada pelo `prompt-optimizer.js`
   - Mesmo modelo → Ollama julga se a tropicalização melhorou a resposta
   - Mapeia qual estratégia (s1-s5) ajuda qual família de modelos
   - Resultado: **dialect map** — como "falar" com cada LLM para máximo output

6. **Embedding** — a cada 5 ciclos, vectoriza prompts com `nomic-embed-text`
   - Constrói clusters semânticos para detectar zonas do espaço onde cada modelo é forte

7. **Log tudo** — `decisions.log` (para o backtest) + `mooter-tester-history.jsonl` (dedicado)

### Report horário (a cada 60 minutos):

- Validação completa (gold-labels + stress-test)
- Backtest (savings analysis)
- Signals (qualidade implícita)
- **Model Performance**: latência, tokens, erros por modelo
- **Quality Matrix**: win rate por modelo×categoria
- **Optimizer Effectiveness**: taxa de sucesso da tropicalização por modelo
- **Dialect Map**: quais estratégias (padding removal, tier reformat, etc.) ajudam quais modelos

---

## DADOS GERADOS

| Ficheiro | O que contém |
|---|---|
| `mooter-tester-stats.json` | Stats acumuladas — o que aparece no `/mooter-summary` |
| `mooter-quality-matrix.json` | Modelo × categoria → win rate + latência |
| `mooter-tester-history.jsonl` | Cada evento individual (classificação, A/B, optimizer, embedding) |
| `decisions.log` | Eventos integrados com dados reais do Paulo (tagged `source: mooter-tester`) |

### Eventos registados:

| Evento | O que prova |
|---|---|
| `tester_classification` | Accuracy do classifier por tier e categoria |
| `tester_ab_test` | Qual modelo é melhor para cada tipo de tarefa |
| `tester_optimizer_ab` | Se a tropicalização melhora as respostas (e em quais modelos) |
| `tester_embedding` | Clusters semânticos de prompts (futuro: semantic routing) |
| `tester_execution` | Latência e qualidade real de cada modelo |
| `tester_misrouting` | Bugs no classifier detectados proactivamente |
| `tester_hourly_summary` | Snapshot horário completo |

---

## O QUE PROVA

O Mooter não é só um router de custos. É um **intelligence engine** que:

1. **Sabe qual modelo é melhor para cada tarefa** — quality matrix empírica, não presuntiva
2. **Adapta o prompt à linguagem de cada modelo** — tropicalização com dados reais
3. **Melhora sozinho** — cada ciclo alimenta o backtest que alimenta o classifier
4. **Custa $0.00** — tudo local, GPU do Paulo
5. **Nunca para** — 24/7, cada hora gera mais dados que provam o valor

Quando o Paulo acordar de manhã:
- `cat mooter-tester-stats.json` mostra centenas de testes executados
- `cat mooter-quality-matrix.json` mostra qual modelo domina cada categoria
- O `/mooter-summary` inclui os dados automaticamente

---

## FLAGS

| Flag | Default | Efeito |
|---|---|---|
| `--aggressive` | off | Ciclos de 20s, 4 execuções por ciclo (GPU no máximo) |
| `--dry-run` | off | Não escreve nada, só mostra no terminal |
| `--cycle-interval N` | 45s | Segundos entre ciclos |

## SAFETY

- Accuracy floor **85%** — se qualquer fix baixar, reverte automaticamente
- `classify.js.bak` antes de cada alteração
- Todos os eventos tagged `source: mooter-tester` (filtrável)
- Graceful shutdown com Ctrl+C (termina ciclo + escreve stats finais)
- Zero APIs pagas — NUNCA chama Anthropic/OpenAI/etc

---

## PARA ARRANCAR COM O PC (opcional)

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "`"C:\Users\Paulo Loureiro\frugal\tools\router\mooter-continuous-tester.js`"" -WorkingDirectory "C:\Users\Paulo Loureiro\frugal\tools\router"
$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "MooterContinuousTester" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force
```

---

> **TL;DR**: `cd "C:\Users\Paulo Loureiro\frugal\tools\router" && node mooter-continuous-tester.js` — abre, esquece, e amanhã de manhã tens centenas de testes que provam que o Mooter é o melhor router de LLMs do mundo.
