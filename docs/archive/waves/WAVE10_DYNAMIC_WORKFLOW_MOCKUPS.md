# Wave 10 · A.5 — Dynamic Workflow Visualization — 2 Mockups

> **O GRANDE TRUNFO.** Mostrar visualmente o que aconteceu na pipeline — onde o local LLM fez o trabalho pesado.
> Design-first. Paulo escolhe Variant 1 OU 2 OU **ambos** (terminal digest + dashboard grafo). CC implementa o escolhido.
> Data source: tier-mix last-N já existe no data layer (recon); `mooter_event` tem `task_category`, `decided_tier`, `per_decision_savings_usd`, `actual_model_used`.

---

## Variant 1 — Terminal session digest (Stop hook, fim de sessão)

Injectado pelo Stop hook quando a sessão termina (ou via `mooter digest`). ASCII puro, zero deps.

```
  ✓ Session digest — 42 prompts · 1h 23m · saved $0.63 (76%)

  ┌─ 🏠 T0 local  qwen2.5:3b      ████████████████████  28  ·  66%  ·  $0.000
  ├─ ☁ T1 haiku                  ██████                 9  ·  21%  ·  $0.007
  ├─ ☁ T2 sonnet                 ███                    4  ·  10%  ·  $0.041
  └─ ☁ T3 opus                   █                      1  ·   3%  ·  $0.150

  Spent $0.198   ·   All-Opus would cost $0.832   ·   You kept $0.634 in your pocket

  Heavy lifting done locally:
    · "refactor the auth guard"          → qwen2.5:3b   T0   320ms
    · "summarize CHANGELOG"              → qwen2.5:3b   T0   180ms
    · "rename useAuth → useSession (×7)" → qwen2.5:3b   T0   240ms
```

- **Barras horizontais proporcionais** por tier, ordenadas T0→T3. A barra T0 domina visualmente → mensagem instantânea: "o local fez a maioria".
- Linha de fecho compara **spent vs all-Opus vs kept** — o número que o vibe coder quer ver.
- Secção "Heavy lifting done locally" lista 3 tarefas reais (prompt truncado, sanitizado — sem PII, respeita privacy contract) que correram em T0 → torna concreto o abstracto.
- **Honesty**: se a sessão não tem phone-home/tracker, mostra `~est` nos custos e omite a lista (não fabrica).
- **Trade-off**: efémero (scrolla para fora do terminal). Mas é o momento "wow" no fim de cada sessão — barato, sempre visível, zero navegação.
- **Showcase angle**: aparece *automaticamente* no fim de cada sessão CC. Um engineer da Anthropic vê isto sem ter de abrir browser. Auto-demonstra o produto a cada uso.

---

## Variant 2 — Dashboard flow grafo (nova tab "Workflow", SVG inline)

Nova tab no dashboard entre `Decisions` e `Metrics`. Grafo de fluxo (estilo Sankey simplificado) mostrando a passagem dos prompts pelos tiers, agregado da última semana.

```
   Prompts (412)                 Classify              Route → Execute
   ──────────────                ────────              ───────────────

                            ┌──────────────┐         🏠 T0 local      271  ▓▓▓▓▓▓▓▓▓▓▓▓ 66%
                            │              │────────▶ qwen2.5:3b       $0.00
        412 ════════════════│  classify.js │
        prompts             │   (regex +   │────────▶ ☁ T1 haiku       86  ▓▓▓▓ 21%
                            │   arbiter)   │                          $0.07
                            └──────────────┘────────▶ ☁ T2 sonnet      41  ▓▓ 10%
                                   │                                   $0.41
                                   └─────────────────▶ ☁ T3 opus       14  ▓ 3%
                                                                       $1.50
```

Renderizado como SVG inline (sem libs pesadas — paths + rects, padrão shadcn). Larguras dos fluxos proporcionais à contagem. Hover num tier → painel lateral com top task_categories desse tier.

- **Sankey-lite**: a espessura do fluxo da esquerda (412 prompts) para cada tier comunica a distribuição. O fluxo gordo vai para T0 local.
- Cada destino mostra contagem + % + custo agregado → mesma informação do digest mas **persistente e navegável**.
- Hover/click revela drill-down: "T2 sonnet — usado em: bug_investigation (24), comparar abordagens (17)".
- **Honesty**: badge "Demo data" se não houver eventos reais; "Live · N events from M devices" quando há phone-home.
- **Trade-off**: requer trabalho de frontend (SVG flow, hover states, responsive). Não aparece sem o utilizador abrir o dashboard. Mais impressionante numa demo dirigida do que no uso diário.
- **Showcase angle**: é a peça que se mostra numa apresentação ("aqui vês o fluxo dos prompts"). Complementa o digest: digest = passivo/diário, grafo = activo/demo.

---

## Recomendação CC

**Ambos**, em fases: Variant 1 (terminal digest) primeiro — é barato, alto-impacto, e aparece a cada sessão sem esforço do utilizador. Variant 2 (dashboard grafo) como complemento — é o "showpiece" para demos dirigidas.

Se o Paulo quiser só um para Phase A e diferir o outro: **Variant 1** sozinho entrega 80% do valor a 30% do custo de implementação. O grafo SVG pode ir para Phase B (já é trabalho de landing/dashboard, onde Cowork audita).
