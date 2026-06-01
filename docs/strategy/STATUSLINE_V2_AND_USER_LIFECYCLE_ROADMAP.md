# Statusline V2 + User Lifecycle + Admin Panel — Roadmap

> **Documento estratégico** (não kickoff de wave). Endereça 8 pontos identificados pelo Paulo a 2026-05-31 enquanto Wave 5 D2 corria. Consolida 3 gaps reais: Statusline clareza, User lifecycle end-to-end, Admin panel.

## Versão
v1.0 · 2026-05-31 · Cowork (Opus 4.7) · pós-Wave 5 D1

---

## 1. Estado actual da statusline (Wave 2.5 → Wave 5 D1)

```
🐮 mooter saved $0.56 (41%) · T2 sonnet 0.65
🐂 · 🏠 local ×4 · 🐄 last10: T0:1 T1:1 T2:3 T3:6 · 🎮 RTX 4090 · 100% 5h · adapter ◌ baseline (forge ships D2)
```

**11 chips** — está rica mas pode ser confusa para utilizador novo.

### Mapping de cada chip

| Chip | Significado | Clareza vibe coder novo |
|---|---|---|
| `🐮 mooter saved $0.56 (41%)` | Cumulative session savings vs T3 default | ✅ Claro |
| `T2 sonnet 0.65` | Current tier + model + confidence | 🟡 "0.65" não óbvio (é confidence score) |
| `🐂` | Glyph T2 tier | 🟡 Bonito mas não óbvio |
| `🏠 local ×4` | 4 local Ollama calls nesta session | ✅ Claro |
| `🐄 last10: T0:1 T1:1 T2:3 T3:6` | Distribuição últimos 10 prompts | ✅ Claro |
| `🎮 RTX 4090` | GPU detectada | ✅ Claro |
| `100% 5h` | Quota Anthropic 5h | ✅ Claro |
| `adapter ◌ baseline (forge ships D2)` | LoRA disclosure honest | ✅ Claro (após Wave 5 D1) |

**Gaps identificados pelo Paulo**:
- ❌ **VRAM usage** — só mostra GPU model
- ❌ **Estágio quantização visível** — `quant Q4_K_M` está em algumas rotações mas não óbvio do "estágio"
- ❌ **Educativo**: utilizador novo não sabe se Q4_K_M é bom ou mau

---

## 2. Statusline V2 — propostas

### Proposta A — VRAM chip (Wave 5 D3 ou similar)

```
🎮 RTX 4090 (12.4GB / 24GB) · ...
```

Implementação: spawn `nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits` periodicamente. Cache 30s. Fallback graceful se nvidia-smi não disponível (Mac M-series usa `system_profiler`).

### Proposta B — Quantização estágio visual

Substituir `quant Q4_K_M` por chip que mostra posição no espectro:

```
quant [▁▁█▁▁] Q4_K_M
       ↑     ↑ position on quantization scale
       FP16 → Q4
```

5 dots representando: FP32 · FP16 · Q8 · Q4 · Q2. Highlighted = current.

OU mais simples:
```
quant Q4_K_M (-73% size · 99% quality vs FP16)
```

Honest disclosure: % size reduction is verifiable, quality% comes from Ollama documentation.

### Proposta C — Adapter impacto visível (pós Wave 5 D2)

Quando adapter activated + benchmarked:
```
adapter 🔧 diagram-systems-v1 (+20% accuracy vs baseline)
```

Sem performance medido:
```
adapter 🔧 diagram-systems-v1 (◌ run mooter forge benchmark)
```

### Proposta D — Educational mode

Novo comando: `mooter explain statusline`:

```
🐮 Mooter statusline guide

Line 1 (macro):
  🐮 mooter saved $X (Y%)  → cumulative savings vs T3-default this session
  T2 sonnet 0.65          → current tier (T0/T1/T2/T3) · model · confidence (0-1)
  
Line 2 (current state):
  🐂                       → bull glyph for T2 (Sonnet)
  🏠 local ×4              → 4 calls used local Ollama (free!)
  🐄 last10: T0:1 ...      → distribution of last 10 prompts
  🎮 RTX 4090              → your GPU
  100% 5h                  → Anthropic quota remaining (5h window)
  quant Q4_K_M             → quantization (smaller, faster, slight quality loss)
  adapter ◌ baseline       → no LoRA active yet

Each chip can be hidden via: mooter quiet --hide-<chip-name>
```

**Cost**: ~30 min dev. Massive UX win.

---

## 3. User lifecycle end-to-end — gap analysis

### Flow ideal (não existe completo)

```
[1] User visita mooter.ai
[2] Sign in with GitHub (Wave 4 B ✅)
[3] Onboarding wizard web:
    - Hardware scan: "RTX 4090 detected" (browser-side via WebGPU API?)
    - Subscription detection: "Anthropic Max plan?" (ask user)
    - Pack recommendations preview
[4] Generate personalized install command:
    curl https://mooter.ai/install/<onboarding_token> | bash
[5] User cola no terminal
[6] Install script:
    - Detects OS/arch
    - Downloads correct mooter binary
    - Pre-configures auth.json (linked to onboarding_token)
    - Pre-installs recommended packs
    - Skips wizard (already done web-side)
[7] User runs mooter init OU vai direto para mooter (already configured)
[8] Telemetry opt-in já tem signature (web-side consent recorded)
[9] User aparece em admin panel:
    - Setup detected (RTX 4090, Linux WSL)
    - Subscription (Max plan)
    - Date joined
    - First sync event timestamp
```

### Hoje (parcial)

| Step | Estado |
|---|---|
| 1 | ✅ landing (Wave 4 A) |
| 2 | ✅ Supabase auth (Wave 4 B + landing pre-existing) |
| 3 | ❌ **Web onboarding wizard não existe** (CLI wizard sim) |
| 4 | ❌ **Install URL personalizado não existe** |
| 5 | ❌ |
| 6 | ❌ Install script básico não existe (user clona repo) |
| 7 | ✅ CLI wizard (W2.5 D2 + W2.6 D1) |
| 8 | 🟡 CLI consent (W3 D2) — não integrado com web |
| 9 | ❌ **Admin panel não existe** |

### Gap: 4 grandes pedaços em falta

**A**. Web onboarding wizard
**B**. Install URL personalizado + script
**C**. Web↔CLI consent bridge
**D**. Admin panel

---

## 4. Admin panel — spec rascunho

**Acesso**: só para Paulo (ou role-based RBAC futuro).

**Rota**: `landing/app/(admin)/admin/page.tsx`.

**Tabela principal — users**:

| Coluna | Origem | Privacy |
|---|---|---|
| `user_id_hash` | Supabase + hash local | Pseudonymous |
| `joined_at` | Supabase auth | OK |
| `last_seen` | mooter_events table | OK |
| `gpu_class` | sync_event hardware_info | Anonymous class |
| `os` | sync_event | OK |
| `ollama_available` | sync_event | OK |
| `subscription_plan` | Anthropic Max/Team/Enterprise self-reported | OK |
| `packs_installed` | sync_event | OK |
| `total_events` | mooter_events count | OK |
| `last_sync_kind` | sync-audit log latest | OK |
| `safety_boosts_30d` | mooter_events agg | OK |
| `adapter_active` | sync_event (Wave 5 D2+) | OK |

**Charts**:
- Tier distribution macro (T0/T1/T2/T3 % across all users)
- Top packs used
- Adapter adoption rate (Wave 5 D2+)
- Safety boost effectiveness

**Feedback section**:
- In-app feedback widget (CLI: `mooter feedback "..."`)
- Linear/GitHub Issues integration

**Filters**:
- Por subscription plan
- Por hardware class
- Por activity (active last 7d / 30d)

---

## 5. Multi-agent local LLM (Paulo ponto #6)

### Visão

```
Today (Dynamic Workflows com Opus 4.8):
  task → fan-out 5 subagents Opus → each ~$2 → total $10
  
Future (Mooter LoRA + Dynamic Workflows):
  task → fan-out 5 subagents local Ollama+LoRA → each $0 → total $0
  Quality: 80-95% of Opus para tasks domain-specific (com LoRA training)
```

### Pré-requisitos

1. **Wave 5 D2** (shipping agora) — adapter validation pipeline
2. **Wave 5 D3** — Docker unsloth training (Optional Option D do ADR 020)
3. **Wave 5 D4** — Dynamic Workflows wrapper que usa local models
4. **Wave 5 D5** — Multi-agent orchestration local

**Quando**: ~2-3 meses depois Wave 5 D2 fechar (assumindo focus dedicado).

### Tag teaser na statusline (quando shippa)

```
🚀 multi-agent local: 5 parallel · saved $10 vs Opus subagents
```

---

## 6. Codex (Paulo ponto #5) — decisão estratégica

**Estado actual**: Mooter route Claude Code → Anthropic models + Ollama local.

**Codex CLI** é OpenAI:
- Diferente cluster de modelos (gpt-4o, o1, etc.)
- Diferente CLI tool
- Diferente conta + billing

**Opção A — Mantém scope Claude-only**:
- Pro: Foco. Diferenciador "router PARA Claude Code, dentro de Claude Code"
- Con: Limita TAM
- **Recomendado** para Wave 5

**Opção B — Expandir para Codex (Wave 7+)**:
- Pro: TAM 2-3× maior
- Con: Duplica complexidade (2 routers paralelos? híbrido?)
- Risk: dilute brand "Mooter para Claude"

**Decisão sugerida**: Wave 5-6 mantém Claude-only. Re-avaliar pós-Adapter Forge ship.

---

## 7. Roadmap proposto pós-Wave 5 D2

| Wave | Foco | Endereça |
|---|---|---|
| **Wave 5 D2** (em curso) | Mooter Forge validation pipeline | #2 (LoRA) |
| **Wave 5 D3** — Statusline V2 + clarity | VRAM chip · quantização visual · `mooter explain` · educational mode | #1, #3, #4 |
| **Wave 5 D4** — Bash badge always-on + verification | Badge `[🐂 sonnet]` em CADA bash · NIT investigar suppression | #4 |
| **Wave 6 — User lifecycle web→CLI** | Web onboarding wizard · install URL personalizado · install script · web↔CLI consent bridge | #7, #8 partial |
| **Wave 6.5 — Admin panel + analytics** | `/admin` dashboard com user table + charts + feedback | #8 full |
| **Wave 7 — Multi-agent local** | LoRA-powered Dynamic Workflows local · cost $0 alternative para Opus subagents | #6 |
| **Wave 8 (optional)** — Codex expansion | Se decidir expandir TAM | #5 |
| **Wave 9 — Hub integration** | Adicionar `/v1/events` ao `hub/` deployed (W4 D follow-up) | (defer from W4 D) |
| **Wave 10 — Adapter Forge auto-train** | Docker unsloth integration | ADR 020 Option D continuation |

---

## 8. Decisões para Paulo

Após Wave 5 D2 fechar, decidir:

1. **Próxima wave imediata**: Wave 5 D3 (statusline v2) OR Wave 6 (user lifecycle)?
2. **Codex scope**: incluir Wave 8 ou não?
3. **Admin panel timing**: antes ou depois multi-agent local?
4. **Hub integration prioridade**: agora ou defer?

---

## 9. Quick wins entretanto (enquanto Wave 5 D2 corre)

Coisas pequenas que podem ser feitas em <30 min cada quando D2 fechar:

- **`mooter explain statusline`** — text-only, zero deps, massive UX win
- **VRAM chip** — nvidia-smi parsing já é trivial
- **`mooter quiet --badge-threshold=0.4`** — baixar threshold de confidence para badge (NIT investigar #4)
- **Quantização tooltip** — adicionar `(-73% size vs FP16)` ao chip existente

Estes 4 podem ser uma Wave 5 D3 compacta (~2-3h).

---

## Versão e revisão

- **v1.0** — 2026-05-31 — Cowork inicial
- Próxima revisão: pós Wave 5 D2 closure
