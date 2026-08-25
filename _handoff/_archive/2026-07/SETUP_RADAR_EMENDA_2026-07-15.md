# ⇄ EMENDA 1 ao SETUP_RADAR_MASTERPROMPT.md · 2026-07-15 (mesma data, sessão posterior)

> Autor: Cowork, após advogado do diabo do próprio masterprompt. Aprovação Paulo: sessão 2026-07-15.
> Ler JUNTO com `_handoff/SETUP_RADAR_MASTERPROMPT.md` — esta emenda ALTERA 3 pontos e não substitui o resto.
> (Ficheiro separado de propósito: gotcha conhecido de truncation em overwrite via bridge — ver memória.)
> Ao arquivar o masterprompt, arquivar esta emenda no mesmo PR.

## E1 — Wizard: mínimo de fricção, não 12 campos (ALTERA Fase 4)

- Máx. **3 inputs manuais** na primeira sessão; resto inferido pelo probe ou **adiado** (Radar mostra
  cinza "conecta quando quiser" — a tela 2 "Conexões" deixa de ser gate e vira progressiva).
- Gate novo da Fase 4: **primeiro valor em ≤3 min** (1 prompt roteado local com recibo visível) +
  setup completo ≤15 min (teste do amigo inalterado).
- Notion / prod URL / GitHub remote são day-2, nunca bloqueiam o primeiro uso.

## E2 — Armar o TURBO no setup, não só detectar Ollama (ALTERA Fase 2 + Fase 3)

- `setup-state.json` ganha bloco `turbo`: `{prompt_compression, handoff_compress, precook_context,
  draft_verify_app_level, index_generation}` — cada um `{enabled, engine_local, proof}`.
- Wizard liga defaults seguros (compression + handoff_compress + index_generation) e mostra o ganho.
- Anel N3 do Radar exibe o **Turbo Gauge**: trabalho local do dia (handoffs comprimidos, drafts, specs,
  tokens poupados = $) + "tua GPU pagou X% da assinatura este mês" (número REAL do Ledger, nunca estimado
  sem rótulo). Doutrina: todo token local sem erro = token que não cobra, não espera, não gasta quota.
- `draft_verify_app_level` = local escreve boilerplate/testes/docs, cloud audita o diff (promovido do
  W8; a variante token-level/speculative continua FRONTIER).

## E3 — Radar read-only entra DENTRO do F0 NÃO MENTIR (ALTERA a sequência ▶ DO)

- Novo: **Radar-RO** (sem botão Corrigir) é entregável do próprio F0 — é o dashboard da doutrina
  prova-ou-cinza e serve de superfície de teste do F0.
- Só o "Corrigir" headless (ação) espera o F0 fechar. Fases 1-2 inalteradas (já podiam correr).

## Inalterado (reconfirmado após tentativa de refutação)

Fase 0 régua primeiro · prova-ou-cinza · plugin VS Code como superfície · não competir com Agents window
na casca · 4 níveis = produto / 5 pilares = engenharia · não reordena o spine packet 🟡 do SYNC.

## Contexto de produto para quem executa (resumo da visão 2026-07-15)

Os 3 medos que o produto mata: irreversibilidade (→ Time Machine, wave futura), cegueira (→ F1 Morning
Brief pré-cozido pela GPU $0), custo invisível (→ recibos em tudo). Peças futuras aprovadas em conceito:
Time Machine (checkpoint+undo 1 clique via worktrees), Turbo Gauge (E2), Spec Rail (mini-spec → local
expande $0 → cloud valida → tasks com gate de teste). Wow só quando é prova (roteamento visível once,
timeline, gauge, radar acendendo, Live Preview/cinema); zero confete. Doc completo: entregue no chat
Cowork 2026-07-15 (`mooter-visao-vibe-coder-e-autocritica.md`).
