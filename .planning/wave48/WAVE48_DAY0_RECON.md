# Wave 48 — Day 0 Recon (2026-06-10)

> Doctrine V4: **honest > forced.** Recon read-only. classify.js **NÃO** tocado. Git **NÃO** mutado.
> Branch actual: `feat/wave41_46-friends-activation` (PR #143, ainda não merged).

## TL;DR — 3 linhas (lê isto primeiro)

1. **Phase 2 (local Fable mirror) é INFEASÍVEL autonomamente** → STOP criteria #6 disparado. Qwen2-VL e DeepSeek-Coder-V3 **não estão instalados**; RTX 4090 tem só **18 GB livres de 24 GB** (DeepSeek-Coder 33B não cabe ao lado do qwen3:30b). Pulls multi-GB + viabilidade Ollama por verificar → **não faço autonomamente**.
2. **O brief tem pricing FACTUALMENTE ERRADO.** Diz Opus 4.6 = $15/M e Opus 4.8 = $20/M. Autoritativo (skill `claude-api`, cache 2026-05-26): **Opus 4.6 e 4.8 = $5 in / $25 out**. Fable 5 = **$10 in / $50 out** (esse o brief acertou). Escrever a tabela do brief em `mooter explain tiers` **enviaria pricing errado aos friends.**
3. **Phase 1 (statusline honesto) é viável e alto valor** mas vive em `tools/router/statusline-multi.js` (64 KB host-side), **não** em `packages/cli/src/statusline/` (que nem existe). Recomendo shippar Phase 1 + Phase 3 (dados reais) numa branch limpa, com aprovação Paulo para o git state (ver §6).

---

## 1. Sanity baseline

| Item | Estado |
|---|---|
| classify.js sha256 | `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` — **INTACT** (igual ao documentado em memória, 20+ waves) |
| Branch | `feat/wave41_46-friends-activation` (9 commits à frente de main; PR #143 NÃO merged) |
| main HEAD | `0419c2e chore(release): sync version.json → 1.23.0` |
| Working tree | **SUJO** — 3202 linhas de DELEÇÕES não-commitadas em `tools/router/` (ver §6) |

## 2. Modelos locais + VRAM (refuta Phase 2)

```
Ollama instalado:  qwen2.5-coder:7b (4.7GB) · qwen3:30b (18GB) · qwen2.5:3b (1.9GB) · nomic-embed-text (274MB)
RTX 4090:          24564 MiB total · 18304 MiB LIVRE
```

| Premissa do brief | Realidade | Veredito |
|---|---|---|
| Qwen2-VL 7B disponível p/ vision mirror | **NÃO instalado**; disponibilidade no Ollama registry não verificada | ❌ REFUTADO |
| DeepSeek-Coder-V3 33B p/ coding mirror | **NÃO instalado**; 33B **não cabe** em 18GB livres (com qwen3:30b já a ocupar 18GB) | ❌ REFUTADO |
| "Mooter espelho local do Fable 5 (vision+coding+general)" | Só general (qwen3:30b) e coding-lite (qwen2.5-coder:7b) presentes; vision = zero | ⚠️ Parcial |

→ **STOP criteria #6 ("Local Fable mirror not feasible") está disparado.** Phase 2.2 (pipeline `packages/cli/src/local-mirror/`) **não executado** autonomamente. Requer: pulls multi-GB (decisão de disco/tempo do Paulo) + verificação que Qwen2-VL existe no Ollama + estratégia de eviction VRAM (descarregar qwen3:30b p/ caber DeepSeek). Decisão do Paulo.

## 3. Fable 5 — factos AUTORITATIVOS (skill `claude-api`, cache 2026-05-26)

| Campo | Valor confirmado | Nota |
|---|---|---|
| Model ID | `claude-fable-5` | ✅ brief acertou |
| Pricing | **$10 / M input · $50 / M output** | ✅ brief acertou |
| Context | 1M | ✅ |
| Max output | 128K | — |
| Vision | Sim (image_input, mesma superfície que Opus 4.8) | ✅ |
| API surface | = Opus 4.7/4.8 (adaptive thinking only; `temperature`/`top_p`/`top_k`/`budget_tokens` removidos = 400) **+ 1 breaking novo**: `thinking:{type:"disabled"}` dá 400 → omitir o param | ⚠️ importante p/ qualquer integração |
| **"Falls back to Opus 4.8 em high-risk ~5%"** | **NÃO consta da fonte autoritativa** | ❌ Provável fabricação do brief — não hardcodar |
| **"FREE no Claude Max até 2026-06-22"** | **NÃO consta da fonte autoritativa** | ❌ Não verificado — não hardcodar claim |

## 4. Pricing dos tiers — CORREÇÃO obrigatória (brief errado)

| Tier | Modelo | Brief diz | **Autoritativo (claude-api)** |
|---|---|---|---|
| T1 | Haiku 4.5 | $1/M | $1 in / $5 out ✅ |
| T2 | Sonnet 4.6 | $3/M | $3 in / $15 out ✅ |
| T3 | Opus 4.6 | **$15/M** ❌ | **$5 in / $25 out** |
| T4 | Opus 4.8 | **$20/M** ❌ | **$5 in / $25 out** |
| T5 | Fable 5 | $10/$50 ✅ | $10 in / $50 out ✅ |

→ A tabela que o brief manda escrever em `mooter explain tiers` está **errada nos dois tiers Opus**. Se Phase 2.4 avançar, usar a coluna autoritativa, **nunca** a do brief.

## 5. Distribuição real de tiers (items 9 e 10) — `~/.claude/tools/router/decisions.log`

> Nota: o brief apontava `~/.mooter/decisions.log` (**não existe**). Telemetria real: `~/.claude/tools/router/decisions.log` (2063 linhas, campo `"tier"`).

| Tier | Classificações | % (de ~1280 classified) |
|---|---|---|
| T3 | 501 | ~39% |
| T1 | 410 | ~32% |
| T0 | 273 | ~21% |
| **T2** | **96** | **~7.5%** |

**Item 9 ("T2 nunca usado?") → REFUTADO parcial:** T2 É usado, mas é o tier mais raro (~7.5%). Finding honesto: a maioria dos prompts cai em "trivial" (T0/T1) ou "arquitetura" (T3); a zona de raciocínio médio (T2/Sonnet) é genuinamente estreita. **Não é bug — é a forma da distribuição de trabalho do Paulo.**

**Item 10 / "6+ modelos":** classify.js actualmente emite **só T0–T3** (4 tiers). Não há T4/T5 no log. A "tabela de 6 tiers" do brief é aspiracional, não o estado actual. Adicionar T4/T5 = mudança de classify.js (sha muda → **requer aprovação Paulo**, ver doctrine).

## 6. ⚠️ Git state — BLOQUEADOR para Paulo decidir

Working tree tem **deleções não-commitadas** (não staged) de 5 ficheiros host-side, 3202 linhas:

```
 D tools/router/PostToolUse.js          (209)
 D tools/router/exec-logger.js          (219)
 D tools/router/frugal-turn-header.js   (234)
 D tools/router/gsd-statusline.js       (2203)   ← 2.2k linhas
 D tools/router/gsd-turn-end.js         (337)
```

- **Não fui eu que as apaguei** e contradizem um "start limpo de main". Por doctrine (operação destrutiva / não-criei-isto → surface, não plough), **não commito nem faço checkout/stash** sem o Paulo confirmar.
- Os ficheiros que Phase 1 precisaria (`tools/router/statusline-multi.js` 64KB, `statusline-modes.js`, `mlwr-status.js`, `limits-status.js`) estão **clean/tracked** — não afetados pelas deleções.
- O brief manda "git checkout main && git pull". Com este tree sujo + PR #143 unmerged, isso é arriscado → **paragem para Paulo**.

## 7. Phase 1 — onde vivem realmente os 8 chips (brief errado na localização)

- `packages/cli/src/commands/statusline.ts` (152 linhas) = **só** o comando que define/preview o **modo** (mini/compact/full/didactic). **Não renderiza chips.**
- `packages/cli/src/statusline/` (dir que o brief manda editar) = **não existe.**
- Renderização real dos chips = `tools/router/statusline-multi.js` (64 KB, host-side) + helpers `mlwr-status.js`, `limits-status.js`.

→ Os 8 items do Paulo (ctx window · terminal name · embed · MLWR→Local Routes · limits · prompt/session · agents · Claude Max bar) implementam-se nesse ficheiro host-side de 64KB. Viável, mas **alto blast-radius** (statusline que renderiza em toda a sessão) e é infra host-side (`~/.claude/tools/router/`). `explain.ts` (222 linhas) e `intent.ts` (116) em packages/cli estão prontos a estender.

---

## Recomendação ao Paulo (caminho da manhã)

| Phase | Veredito Day 0 | Acção recomendada |
|---|---|---|
| **P1 — Statusline honesto (8 chips)** | ✅ Viável, alto valor, baixo risco lógico | Shippar em `tools/router/statusline-multi.js` numa **branch limpa de main**. Endereça os 11 pontos de UX reais. |
| **P2.1 — Tier 5 Fable routing (classify.js)** | ⚠️ Muda sha → requer aprovação | Posso preparar o diff p/ aprovares; **não** mudo classify.js autonomamente. |
| **P2.2 — Local Fable mirror (Qwen2-VL/DeepSeek)** | ❌ Infeasível agora (STOP #6) | DEFER. Decides pulls + eviction VRAM. |
| **P2.4 — `explain tiers`** | ⚠️ Pricing do brief errado | Se avançar, usar pricing da §4 (autoritativo), nunca o do brief. |
| **P3 — Data coherence (T2 ~7.5%, savings breakdown)** | ✅ Tenho dados reais | Documentável + `explain saved`/`explain tiers` com números reais. |
| **Git state** | ⚠️ Bloqueador | Confirma: as deleções `gsd-*`/`PostToolUse.js` são intencionais? Posso descartar/commitar? Começo de main? |

**Decisões que só tu podes tomar (não decido sozinho):**
1. As 5 deleções host-side em `tools/router/` — descartar, commitar, ou ignorar?
2. Aprovar mudança de sha do classify.js para adicionar Tier 5 Fable (P2.1)?
3. Autorizar pulls multi-GB + eviction VRAM para o local mirror (P2.2)?
4. Branch: começar Phase 1 limpo de `main`, ou em cima de `feat/wave41_46-friends-activation`?
