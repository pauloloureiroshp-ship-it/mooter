# ADR 015 — Pastor: eixo de domínio (Two-Axis Routing)

**Date**: 2026-05-28 (Wave 1, Day 1)
**Status**: 🟡 Proposed
**Owner**: Paulo Loureiro
**Wave**: 1 (Pastor)
**Reviewer**: final-reviewer (Opus + cache)
**Related**: `docs/strategy/PASTOR.md` §4, §6, §8 Day 1; `docs/spec/pack-hint.md`; ADR 016 (TS stack para packs/)

---

## Contexto

Hoje o Mooter roteia por **um único eixo: complexidade**. O `classify.js` (+ arbiter Haiku no long tail) lê o prompt e emite `<router-hint>` com `tier ∈ {T0..T3}` e modelo recomendado. Isto resolve *"quão caro deve ser o modelo"* mas **não** resolve *"que conhecimento de domínio o modelo devia trazer"*.

A research de 2026-05-27 (`docs/strategy/research_best_in_class_2026.md`) identificou um gap claro em **skill orchestration**: os assistentes de coding genéricos não sabem, por domínio, quais skills/MCPs/repos canónicos/scaffolds usar. Um pedido de "animar este hero" e um de "auditar este código" exigem ferramentas, prompts e bibliotecas de referência radicalmente diferentes — e o eixo de complexidade é ortogonal a essa distinção (ambos podem ser T2).

A janela competitiva é **< 12 meses**: skill orchestration declarativa e descobrível ainda não é commodity. Um sistema local-first de "Moo Packs" (manifestos declarativos por domínio) pode tornar-se diferencial de produto antes de o mercado o normalizar.

## Decisão

Adicionar um **segundo eixo de roteamento — domínio → Moo Pack — ortogonal ao eixo de complexidade existente**.

- Um `classify_domain(prompt)` independente (regex layer Day 3, embedding opcional Wave 2) mapeia o prompt para um `pack_id` + confiança.
- `pack_resolve(pack_id)` carrega `packs/<pack_id>/pack.yaml`, verifica skills/MCPs disponíveis e produz um `<pack-hint>` (Day 4) **adicional** ao `<router-hint>` existente.
- O contrato dos packs é declarativo (YAML, sem código): `packs/pack.schema.yaml` (este Day 1).

Os dois eixos coexistem: `<router-hint>` continua a sair tal como o V3 já validou; `<pack-hint>` é puramente aditivo.

## Alternativas consideradas

| # | Alternativa | Avaliação | Decisão |
|---|---|---|---|
| A | Adicionar packs como sub-tier dentro do `classify.js` actual | Acopla domínio a complexidade no mesmo classifier; viola separation of concerns; torna o eixo-1 (estável, validado pelo V3) frágil | ❌ Rejeitado |
| B | Pack registry externo SaaS (servidor central de packs) | Quebra a garantia **local-first** do Mooter; introduz latência de rede e dependência de terceiros no hot path do hint | ❌ Rejeitado |
| C | Substituir `classify.js` por um classifier único multi-eixo | Perde **backward-compat**; reescreve um componente em produção e validado; risco desproporcional ao ganho | ❌ Rejeitado |
| D | **Two-axis routing com `classify_domain()` independente** | Mantém eixo-1 intacto; eixo-2 aditivo e isolável; packs declarativos versionáveis; permite embedding/Haiku como camadas opcionais | ✅ **Escolhido** |

## Consequências

**Positivas**
- ➕ **Backward-compat total** — `<router-hint>` inalterado; nada do que o V3 validou parte.
- ➕ **Pack discovery** torna-se diferencial competitivo (onboarding pré-instala packs por perfil — PASTOR §6.7).
- ➕ Cada pack pode declarar uma `notion_kb_url` (opcional) para **auto-aprender** com uso real (research → execução → reflexão → research; PASTOR §6.6).
- ➕ Eixo-2 isolável: pode ser desligado sem afectar o roteamento por complexidade.

**Negativas / custos**
- ➖ **Mais um classifier para manter.** Mitigação: regex layer simples e pré-compilada (≤ 5ms p99, igual ao `classify.js` v1); embedding apenas como camada opcional quando confiança < 0.7.
- ➖ **Pack quality control torna-se um eixo de produto** (trust_score, TTL, re-validação). Não é só engenharia — é curadoria contínua.

## Status

**Proposed.** Implementação faseada na Wave 1 (PASTOR §8): schema + ADR (Day 1) → 3 packs sementinha (Day 2) → `classify_domain()` regex (Day 3) → hook emite `<pack-hint>` (Day 4) → CLI `mooter pack` (Day 5) → integração `pack_resolve` (Day 6) → validação real + repo público (Day 7).
