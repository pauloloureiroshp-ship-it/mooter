# INFO_AUDIT — Inventário de arquitectura de informação (Fase 0)

> **Data:** 2026-07-07 · **Autor:** Cowork (sessão IA-cleanup) · **Modo:** read-only (este ficheiro é o único write).
> **Método:** file tools no host (bash sandbox indisponível); git lido de `.git/HEAD` (branch `wave/honest-controls` confirmada); julgamentos "shipped/em prod" vêm do texto auto-declarado dos ficheiros — **cruzar com `git log` nativo antes de mover o que for**.
> **Meta:** este ficheiro é +1 item no `_handoff/` — arquivar junto com o `INFO_ARCHITECTURE_CLEANUP_HANDOFF.md` quando a Fase 2 terminar.

---

## A. `_handoff/` — o alvo principal

**Total:** 53 `.md` top-level + 6 subpastas (`mock/`, `codex/`, `loop/`, `fleet/`, `council-eval/`, `skills-build/`) ≈ 394 itens. **Não existe `_handoff/_archive/`.**

### Contagem

| Classe | # | Nota |
|---|---|---|
| ✅ Efémero (arquivar) | ~23 | masterprompts executados, waves shipped, snapshots datados |
| 🔥 Vivo (consolidar/manter) | ~24 | specs LP-*, Conductor, Mirror, Bridge, Fleet F3, políticas standing |
| ⚠️ Incerto (Paulo decide) | ~5 | DELIVERY_COCKPIT, DECK_POLISH, PORTABILITY, MOOVE (backlog explícito), WAVE_LP2 |

### Efémeros — candidatos a `_handoff/_archive/` (por ordem de obviedade)

1. `MOOTER_DESIGN_MASTERPROMPT.md` + `MOOTER_CLAUDE_DESIGN_MASTERPROMPT.md` (design 2026-06-14, executado)
2. `WAVE_SITE_MOCK_COW_REVERT.md` · `WAVE66_GRAPHIFY_LANDING_MASTERPROMPT.md` (waves shipped)
3. `overclock-benchmark-2026-06-28T22-29-55.md` (snapshot de dados)
4. `AUDIT_FLEET_ZERO_COST_MASTERPROMPT.md` · `FLEET_W4_MASTERPROMPT.md` · `FLEET_W4_FASE2_EXTRACT.md` (fases 0-2 em main)
5. `ONDA0_BOOTSTRAP_DOCS_MASTERPROMPT.md` · `LAND_PARKED_MASTERPROMPT.md` · `TRIAGE_PARKED_OLD_MASTERPROMPT.md` · `PERFECT_HANDOFF_MASTERPROMPT.md` · `MASTERPROMPT_LAND_AND_EVAL.md` (aterragens pontuais concluídas)
6. `LIVE_PREVIEW_SUPER_MASTERPROMPT.md` · `LIVE_PREVIEW_HOTRELOAD_TEST.md` · `LIVE_PREVIEW_MP4_DIAGNOSTICS_MASTERPROMPT.md` · `LIVE_PREVIEW_CONSOLIDATE.md` · `WAVE_LP1_MP3v2_MP4polish.md` (features em prod)
7. `COCKPIT_HONEST_CONTROLS_BRIEF.md` + `HONEST_CONTROLS_MASTERPROMPT.md` (em prod, postmortem confirma)
8. `FLEET_FASE3_ARM_MASTERPROMPT.md` (auto-declarado substituído por `FLEET_FASE3_LAUNCH_HANDOFF.md`)
9. `CTO_COMMAND_DECK_SPEC.md` · `SITE_HANDOFF_STORY_MASTERPROMPT.md` (deck 0.16.48 instalado / adição pontual)
10. Subpastas: `mock/` inteira (assets deprecated, v1.38.5) · transcripts + WCOCKPIT briefs em `fleet/` · `loop/` STATE/QUEUE.bak/transcripts (loop de 06-22/23 encerrado — guardar só runbooks `PROD_RUNBOOK`/`LOOP_FOREVER`)

### Vivos — o "spec vivo" de cada tema (fonte a preservar)

| Tema | Fonte viva | Apoios |
|---|---|---|
| Live Edit | `SUPER_WAVE_LP48_LP5_LP6.md` (comboio, 07-07) | `LIVE_EDIT_MP5_2_SelectLock_Spec.md` · `LIVE_EDIT_LP4_LP6_VISION.md` |
| Live Preview | `LIVE_PREVIEW_MASTER_HANDOFF.md` (07-06) | `LIVE_PREVIEW_AUDIT_FINDINGS.md` (P0/P1/P2) · `LIVE_PREVIEW_FEATURE_STUDY.md` |
| Fleet/GPU | `FLEET_FASE3_LAUNCH_HANDOFF.md` | `FLEET_ARM_GPU_TALO_BRIEF.md` · `fleet/fleet.json` |
| Conductor | `CONDUCTOR_F0_REDTEAM.md` (spec real v2) | `CONDUCTOR_F0_DISPATCH_MASTERPROMPT.md` · `MOOTER_CONDUCTOR_PRODUCT_DESIGN.md` |
| Mirror | `MOOTER_MIRROR_ARCHITECTURE.md` | `MIRROR_MASTERPROMPTS.md` |
| Bridge | `MOOTER_BRIDGE_CONNECTOR_STUDY.md` | `skills-build/cowork-cc-bridge/` |
| Quota | `QUOTA_AWARE_MP.md` | `SUPER_MP_QUOTA_FLEET.md` |
| Política standing | `_MASTER_ORCHESTRATION.md` | `fleet/STANDING_POLICY.md` · `fleet/AUTONOMY_MODEL.md` |
| Processo | `LIVE_PREVIEW_POSTMORTEM_PROTOCOL.md` (R1-R6) | — |
| Estratégia | `MOOTER_PAINS_X_SOTA_BLUEPRINT.md` | — |

### Sobreposições confirmadas (alvo da Fase 2)

- **LIVE_EDIT_* (5 docs + SUPER_WAVE):** a visão select-to-edit→security→publish está repetida em `MP5_SPEC §0`, `LP4_LP6_VISION` e `SUPER_WAVE`; MP5 tem 3 documentos progressivos (MP5_SPEC → MP5_2 → WAVE_LP2); LP46/LP47 sobrepõem-se às secções da VISION/SUPER_WAVE.
- **LIVE_PREVIEW_* (9 docs):** contexto do App Stage repetido em 7 deles; 3 são efémeros, 3 são o estado vivo.
- **Fleet:** FASE3_ARM vs FASE3_LAUNCH — substituição declarada no próprio ficheiro.
- ⇒ Consolidação proposta (Fase 2): fundir a família LP-* num `docs/strategy/LIVE_EDIT_ROADMAP.md` único e vivo; arquivar o resto.

---

## B. Canónicos do repo — frescura

| Ficheiro | Última evidência | Veredicto |
|---|---|---|
| `CLAUDE.md` | Reescrito lean 2026-06-11 (archive em docs/foundation) | ✅ saudável — pointer-discipline aplicada |
| `AGENTS.md` | Espelho do protocolo (§Communication) presente | ✅ saudável |
| `SYNC.md` | Tail fresco (handoffs 2026-07-07 04:49) **mas 371 KB** | ⚠️ virou log append-only — o "estado actual" está enterrado em ~3.100 linhas de histórico. Perdeu a função de snapshot |
| `MEMORY.md` | Todas as 8 entries de **2026-04-21** | ⚠️ seco há 2,5 meses — nenhuma decisão de Maio–Julho destilada (waves 28-34.5 frozen, tier ladder T5, Live Preview local-first, mission statement…) |
| `LOOP.md` | Última entry 2026-07-03 | 🟡 semi-vivo — aprendizados de 07-04→07-07 (vsix packaging, fence assimétrica, asset whitelist) não registados |
| `ROADMAP.md` | Existe na raiz (frescura por confirmar) | ⚠️ verificar na Fase 2 |
| `TERMINAL-CONTRACT.md` | v1.1, last_reviewed 2026-04-21 | 🟡 estável por natureza; rever se a Fleet F3 muda o contrato |
| `INFRA.md` | "Última actualização: 2026-04-18" e ainda diz **"frugal Infrastructure"** | ⚠️ stale — 2,5 meses de infra nova (hub migrations 016/017, mooter-hub worker, tracker 7821 v0.8.0) por reflectir |

**Padrão:** o canal repo secou porque o registo migrou para Notion/vault/handoffs — exactamente o diagnóstico §3 do brief. Validado ✅.

## C. `docs/strategy/` — segundo depósito descontrolado (achado novo)

- **263 `.md`**, dos quais ~100 são `node_modules/` **dentro de `docs/strategy/`** (pptxgenjs, jszip…) ⚠️ — lixo de uma instalação npm acidental; candidato óbvio a remoção (Paulo decide o `git rm`/gitignore).
- ~50 `WAVE*_KICKOFF/FINDINGS/MICROBRIEF` históricos (waves 2-23) misturados com os canónicos estratégicos (`STRATEGY.md`, `ARCHITECTURE_V5.md`, `MOOTER_ULTIMATE_VISION.md`).
- ⇒ A regra "onde vive o quê" (Fase 1) tem de cobrir `docs/strategy/` também, não só `_handoff/` — senão a limpeza migra o problema de pasta.

## D. Vault

- `30-learnings/`: 28 ficheiros, última entry **2026-07-06** (dia-de-aterragens + system-design + MP5.2). **Falta o registo de 2026-07-07** (LP-4.7 em main, SUPER_WAVE LP-4.8→6 lançada).
- `project-map.md` auto-sinaliza foco stale desde 2026-06-27 (diz GSD 🔥 / Mooter 🛠 — realidade é Mooter 🔥). Decisão estratégica: só o Paulo confirma a correcção.
- `4-canonicos.md` descreve SYNC/MEMORY/LOOP como estão *supostos* ser — o repo divergiu (ver B). O desenho está certo; a execução é que falhou.

## E. Notion HQ Mooter

- Última edição visível: **2026-07-06**. Falta o log de 07-07. Mesmo gap do vault — as 3 camadas de memória estão 1 dia atrás do trabalho real.

## F. Diagnóstico §3 do brief — validado ou refutado?

| Hipótese do brief | Veredicto |
|---|---|
| Metodologia existe, falha é disciplina de execução | ✅ validado — protocolo/regras/4-canonicos são bons e coerentes; nenhum foi vivido no repo desde ~Abril (MEMORY) / o SYNC degenerou em log |
| `_handoff/` mistura efémero e canónico, nunca consolida | ✅ validado — 23 efémeros identificados, 0 arquivados, sem `_archive/` |
| SYNC/LOOP subusados, registo foge para Notion/vault | ✅ parcial — SYNC é usado MAS como log (função errada); LOOP semi-vivo; MEMORY é o verdadeiro seco |
| Re-poluição em ~2 semanas sem regra viva | ✅ plausível — `docs/strategy/` prova que o padrão se repete em qualquer pasta sem regra |

**Refinamento ao brief:** a dor não é só "ficheiros a mais" — é **3 depósitos sem ciclo de vida** (`_handoff/`, `docs/strategy/`, e o próprio `SYNC.md` como depósito interno). A regra da Fase 1 deve definir o ciclo de vida (nasce → vive → consolida → arquiva), não só o "onde".

## G. Próximos passos propostos (aguardam OK)

1. **Fase 1** — regra "onde vive o quê + ciclo de vida" em `AGENTS.md`/`CLAUDE.md` + espelho `00-core/` do vault. Inclui: `_handoff/_archive/` como destino, gatilho de consolidação ("wave shipped ⇒ masterprompt arquiva no mesmo PR"), e âmbito alargado a `docs/strategy/`.
2. **Fase 2** — consolidar LP-* → `docs/strategy/LIVE_EDIT_ROADMAP.md`; mover ~23 efémeros para `_archive/` (mover, não apagar); reescrever `SYNC.md` como snapshot (histórico vai para `docs/foundation/SYNC_ARCHIVE_*.md`); destilar 8-10 decisões Mai-Jul para `MEMORY.md`; entries LOOP 07-04→07-07; actualizar `INFRA.md`.
3. **Fase 3** — registo 07-07 no vault (30-learnings) + Notion HQ.
4. **Fase 4** — auditoria skills/conectores/plugins.

**Paulo-hands (fora do âmbito desta sessão):** `git switch main` limpo no `~/frugal` (arrumar stash/uncommitted primeiro) · decidir `git rm`/gitignore do `node_modules` em `docs/strategy/` · podar 7 worktrees (R6) · confirmar correcção do foco no `project-map.md`.
