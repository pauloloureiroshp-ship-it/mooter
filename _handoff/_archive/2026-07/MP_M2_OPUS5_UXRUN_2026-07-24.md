⇄ MASTERPROMPT — M2 UX-RUN: costura nativa + jobs reais CC/Codex + lateral do Cowork viva · 2026-07-24

```yaml
type: MASTERPROMPT
id: MP-M2-OPUS5-UXRUN-2026-07-24
wave: mooter-seamless-m2
tier_alvo: S-T3 (Opus 5 — doutrina 40-strategy/mooter-cowork-session-routing: handoff autocontido rebaixa tier; supersede a linha "Fable 5" do MP-M2-SEAM-RETRY, decisão Paulo+brain 07-24)
socio_pack: v1@manual (tier M)
base: _handoff/MOOTER_SEAMLESS_M2_HANDOFF_2026-07-24.md (EXECUTAR os passos P1–P6 dele À LETRA — este MP só ADICIONA a camada UX)
precond: Desktop reiniciado APÓS o fix do BOM (fix-mooter-connector.log = NODE_JSON_PARSE=OK) ✅ feito 07-24 ~16:05 BRT
budget: ≤ $4
```

## A ÚNICA COISA
Provar o loop nativo Cowork→mooter→CC/Codex→Cowork **e** deixá-lo VISÍVEL na lateral direita da sessão (Progress/Outputs/Context) + no artifact `mooter-cockpit` — mágica auditada: nenhum pixel sem linha de ledger.

## ORDEM
1. **P0-UX · Foto do Context (30s).** Reporta o que vês na lateral: o conector `mooter` aparece como chip? Com que nome as tools chegaram (`mooter_*` ou `mcp__remote-devices__mooter__*`)? Se AUSENTES → segue §7 SE-ENTÃO do MP base (H4) e para com relatório.
2. **P1–P6 do MP base** (`MOOTER_SEAMLESS_M2_HANDOFF_2026-07-24.md`): ACK → route → dispatch cc (auditoria dos buses REAIS: `~/.mooter/ledger.jsonl` × `_handoff/agent-sync/events.jsonl`+`snapshot.json`) → send_later +3min → status/collect → dispatch codex (frugal-integ, análise-only) → collect → relatório `M2_NATIVE_SEAM_REPORT.md`.
3. **U1 · Espelho no task widget (Progress).** ANTES do 1º dispatch: TaskCreate por job planejado com título `🤖cc·m2·audit-buses` / `🤖codex·m2·audit-buses`. TaskUpdate → in_progress no dispatch, completed no done/collect. O Paulo tem de VER a frota andando na lateral sem sair da sessão.
4. **U2 · Cockpit vivo.** Ao final: stage do artifact atual (`device_stage_files` com `artifact_ids: ["mooter-cockpit"]`), atualizar com: linhas da wave m2 (copiar do ledger), tile "jobs" e "custo" recalculados, frota (codex sai de 🟡 se rodar), timeline nova, carimbo de atualização — e `update_artifact` id `mooter-cockpit` (update_summary: "wave m2 nativa + codex 1º job"). Doutrina: número sem linha de ledger = proibido; n/d honesto.
5. **U3 · Relato visual.** No fecho, descreve o que APARECEU na lateral durante a corrida (chip, tasks, outputs, artifact) vs o que ficou invisível — isso alimenta a spec F2 da UX. 
6. **BOARD final** (Paulo·Cowork·CC·Codex·Ledger × estado × próxima ação × ❌).

## GUARDS (herdam do MP base, inegociáveis)
Keys não rotadas → jobs SÓ read-only (`allowedTools: "Read"`; codex análise-only) · zero git/push · zero escrita fora de `_handoff/`, memória, `~/.mooter/` e do artifact `mooter-cockpit` · classify.js/packages intocados · sem flags perigosas · n/d nunca palpite · falhou 2× → relatório parcial e para.

## CRITÉRIO DE ACEITE (o do MP base + UX)
(a) linha `done` com `wave:"mooter-seamless-m2"` no ledger; (b) `M2_NATIVE_SEAM_REPORT.md` citando job_ids reais; (c) artifact `mooter-cockpit` atualizado com a wave m2; (d) relato do que a lateral mostrou. Sem os 4, M2 segue aberto.

🤝 SOCIO: receita? na · despesa↓? S (mata paste/Run-dialog) · risco↓? S (loopholes antes do dogfood) · reversível? S (read-only) · escopo? S
📮 DESTINO: sessão Cowork NOVA (Opus 5) → CC+Codex via mooter → de volta ao Cowork (lateral + cockpit)
