# Wave 10 · A.1 — Statusline Visual Polish — 3 Mockups

> **Design-first.** CC compõe, Paulo escolhe (Variant A/B/C), CC implementa o escolhido em `tools/router/statusline-multi.js`.
> Baseline actual (recon 2026-06-01): 2-line em ≥120 cols / 1-line em narrow, glyphs 🐮🐂🚨🛠, rotating tier-mix view a cada 5 ticks, ANSI 2-cor (verde/amarelo/vermelho), **sem sparkline**.

## Estado actual (referência)

```
L1  🐮 mooter saved $0.27 (89%) · T2 sonnet 0.84 │ ctx 42% · 89% 5h · turn $0.02 · alltime $12.34 · quant Q4_K_M · pack mypack · adapter ◌ baseline
L2  ☁ T2 sonnet 0.84 · 🏠 local ×3 · 🐄 T0:5 T1:0 T2:3 T3:2 · 🎮 RTX 4090 (12GB) · ctx [██░░░░░░░░] 42% · 89% 5h · turn $0.02 · alltime $12.34 · quant Q4_K_M (-72% size · ~99% quality vs FP16) · pack mypack · adapter 🔧 deepseek-lora (+8% acc)
```

**Problema de showcase**: L2 é uma parede de chips separados por `·`. Sem hierarquia visual, sem âncora para o olho. Não comunica em <10s "o local LLM está a fazer o trabalho pesado e a poupar-te dinheiro".

---

## Variant A — Minimalist (1-line dense, mono + 1 accent rosa)

```
🐮 saved $0.27 (89%)  ·  T2 sonnet 0.84  ·  🏠×3 of 10  ·  ctx 42%  ·  $12.34
```

Largura fixa ~78 cols. Colapsa sempre para 1 linha. Cinzas para tudo (`\x1b[90m`), **rosa accent (#e8888a) apenas no `saved $`** e no glyph 🐮. Tudo o resto mono.

- **Hierarquia**: o número que importa (saved $) é a única cor → o olho vai lá primeiro.
- `🏠×3 of 10` substitui o verboso `local ×3 · T0:5 T1:0 T2:3 T3:2` — diz "3 dos teus últimos 10 prompts correram local" numa só métrica que um vibe coder entende.
- Sem GPU chip, sem adapter chip, sem quant chip na statusline → movem-se para o **moo card** (on-demand, Stop hook). Statusline = glance, moo card = detalhe.
- Drop de ctx bar ASCII → `ctx 42%` textual (a barra `[██░░]` é ruído a esta densidade).
- **Trade-off**: perde-se densidade de informação. Quem quer ver adapter/quant/GPU tem de abrir o moo card. Ganha-se: legibilidade brutal, zero scroll horizontal, mesmo em terminal 80-col.
- **Showcase angle**: "limpo como uma status bar de editor topo de gama". Engineer da Anthropic vê e pensa "isto não me distrai".

---

## Variant B — Information-rich (2-line, agrupado por secção, emoji âncoras)

```
L1  🐮 saved $0.27 today (89% vs all-Opus)            this turn: T2 sonnet · 0.84 conf · $0.02
L2  🏠 local 3/10 turns   💰 $12.34 alltime   🎮 RTX 4090   📊 ctx [██░░░░░░] 42%   ⚡ 89% quota
```

Mantém 2 linhas mas **reagrupa por significado** em vez de stream linear de chips. Cada grupo tem 1 emoji-âncora à esquerda. Gradiente subtil no separador (espaçamento, não cor).

- **L1 = "o resultado"** (esquerda: poupança acumulada do dia; direita: o que aconteceu neste turn). Separação esquerda/direita cria duas zonas de leitura.
- **L2 = "o sistema"** (4 grupos com âncora emoji: local-mix, custo, hardware, contexto/quota). Cada grupo é auto-explicativo pelo emoji.
- `local 3/10 turns` em vez de `T0:5 T1:0...` — métrica de vibe coder, não de engenheiro de routing.
- adapter/quant chips só aparecem quando **não-default** (adapter loaded ≠ baseline, ou quant ≠ Q4_K_M) → reduz ruído no caso comum.
- **Trade-off**: precisa ≥120 cols para respirar. Emojis podem render inconsistente em alguns terminais (fallback ASCII necessário). Mais "produto" e menos "ferramenta hacker".
- **Showcase angle**: "legível por um PM, não só por um engenheiro". Comunica valor (saved $) + transparência (o que correu onde) sem manual.

---

## Variant C — Cinematic (2-line + sparkline das últimas 10 decisões, tier colors)

```
L1  🐮 saved $0.27 (89%)   ▁▁▃▁█▃▁▁▃█  last 10   ·   now: T2 sonnet 0.84
L2  🏠 7 local · 3 cloud   ████████░░ 70% local   $0.02 turn · $12.34 all · ctx 42% · ⚡89%
```

Introduz o **sparkline** que falta: `▁▁▃▁█▃▁▁▃█` = altura por tier das últimas 10 decisões (▁=T0 local, ▃=T1/T2, █=T3 opus). Cada barra colorida pelo tier (cinza T0, azul T1/T2, rosa T3).

- **A sparkline é o trunfo visual**: num glance vês o "ritmo" da sessão — sobretudo barras baixas cinza (local a dominar) com picos rosa raros (opus só quando preciso). É *literalmente* a tese do produto desenhada.
- L2 barra `████████░░ 70% local` = quota visual local-vs-cloud, reforça a sparkline com a percentagem agregada.
- Tier colors: T0 cinza (#90), T1/T2 azul-petróleo, T3 rosa (#e8888a) → o olho aprende "rosa = caro" instantaneamente.
- **Trade-off**: mais complexo de implementar (precisa janela rolante de 10 decisões já disponível no data layer — recon confirma tier-mix last-10 existe). Sparkline com cor por barra é o trabalho extra. Risco de parecer "demais" para quem quer minimalismo.
- **Showcase angle**: **este é o que faz um engineer da Anthropic tirar screenshot.** A sparkline conta a história sozinha: "vê, o opus quase nunca acende". É o mais memorável dos três e o que melhor serve o objectivo de showcase.

---

## Recomendação CC

**Variant C** para o objectivo Anthropic-showcase (a sparkline é o argumento visual mais forte e usa data que já existe), com o **fallback narrow** a degradar para o layout de **Variant A** (1-line mono) em terminais <120 cols. Variant B é o mais "seguro/produto" se o Paulo achar C demasiado denso.

Os três partilham: `local N/10` como métrica de vibe-coder, adapter/quant chips só quando não-default, e o `saved $` como única âncora de cor forte.
