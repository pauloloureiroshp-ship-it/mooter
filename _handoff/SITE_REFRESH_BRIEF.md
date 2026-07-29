# ⇄ SITE REFRESH — mooter.ai na voz da tese v2, honest-copy (brief, não masterprompt ainda)

> Cowork · 2026-07-16 · Achado: fetch ao vivo do mooter.ai mostra tagline SUPERSEDED ("The router for
> Claude Code. Local-first. Learns forever." — ADR-0001, formalmente superado no PR #248) + claim
> "47% saved vs all-Opus across 658 routed calls" sem data + "Install in 30s" não reverificado.
> Casa: `_handoff/` · Vira masterprompt executável DEPOIS da F2 mergeada (site e marketplace = uma voz).

🎯 GOAL   O site conta a verdade de hoje na voz da tese v2 — e nada além dela.
🔒 GUARD  Honest-copy absoluta (a mesma doutrina da F2): nenhuma feature do blueprint (mesh, effort
          dial, auto-setup, Mission Control) apresentada como shipped; toda métrica com data e fonte;
          zero número inventado. Landing vive em `landing/` no repo — mesmo fluxo de PR + gate Paulo.
⏱️ WHEN   Gate de entrada: F2 mergeada (a copy do marketplace é a referência de voz). Janela ideal:
          mesmo ciclo de release que publicar o plugin com a copy nova.

## O que o site DIZ hoje × o que deve dizer

| Hoje (fetch 2026-07-16) | Problema | Substituir por |
|---|---|---|
| "The router for Claude Code. Local-first. Learns forever." | tese superseded (ADR-0001) | Voz da tese v2: cabine do vibe coder + motor de custo afundado. Base: a copy F2 aprovada ("Operate a Claude Code project from one cockpit…" / engine = moat, cockpit = product) |
| "47% saved vs all-Opus across 658 routed calls" | métrica de junho, sem data | Re-medir do savings-tracker real OU datar explicitamente ("measured June 2026, n=658") — nunca claim eterna |
| "Learns forever" como promessa | auditoria G3: feature dark, não provada | Não prometer; quando o A/B shadow tiver dados, volta COM os dados |
| "Install in 30s" + GitHub sign-in | não reverificado após F1 (installers mudam no Gate 5) e Great Rename futuro | Reverificar o fluxo real de install de ponta a ponta ANTES de publicar; o número só fica se cronometrado |
| Features: routing, LoRA/DoRA, handoffs, decision records | parcialmente verdade, mas invisível o que é o produto AGORA (cockpit/Live Preview/Review guarded) | Reordenar: cabine primeiro (o que o usuário VÊ), motor depois (o fosso). 5 experiências como estrutura da página |

## O que PODE ser dito (real, provado hoje)
Cockpit VS Code que opera o projeto (resume/plan/watch/review) com guardrails reais (lease, SHA-guard,
aprovação antes de destrutivo) · roteamento determinístico local-first $0/<50ms (classify frozen +
CI) · VSIX empacota/instala/ativa (provado em perfil isolado) · usa as assinaturas que o usuário já
paga + a GPU dele (posicionamento custo afundado — SEM prometer a mesh ainda) · decisões auditáveis.

## O que NÃO pode (ainda)
Harmony Mesh · effort dial/auto-yield · `mooter init --auto` · Mission Control · skills certificadas —
tudo blueprint. Se aparecer, é como "where we're going", visualmente separado do que existe.

## ♻️ REUSE
A copy F2 aprovada (package.json/README/walkthrough) é a fonte de voz — adaptar, não reescrever do
zero. O SETUP_MAPPING.md já mapeia probe→payload→surface do dashboard (gaps conhecidos documentados).

## Gate final
Grep das claims proibidas (mesmo padrão do F2) = 0 · toda métrica com data · fluxo de install
cronometrado de verdade · Paulo aprova a copy exata (é a voz pública máxima do produto).
