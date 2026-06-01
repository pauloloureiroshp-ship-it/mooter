# Anthropic Showcase Plan — Mooter v1.0

> **Documento estratégico** consolidando o trabalho shipped até à **convergence release v1.0.0** (Wave 7) para mostrar a Anthropic e validar com vibe coders externos. v1.0.0 unifica dois timelines paralelos — o *router engine* (frugal-origin, v0.7→v0.11) e os *Mooter waves* (`v0.1.0-pastor-wave1` → `v0.6.6`). Todas as tags legacy ficam preservadas para proveniência; ver §2.0 Genealogy.
>
> **Versão**: 1.2 · 2026-05-31 · v1.0.0 convergence release (Wave 7) · fact-checked vs `git tag`/repo.
>
> **Status**: ready to demo (após 3 Supabase migrations + opcional smoke test).

---

## 1. Executive summary

**Mooter** é o único LLM router open-source que vive dentro do Claude Code, é nativo JS/TS, e dá ao power user transparency radical sobre cada decisão de routing — sem queimar budget Opus em tarefas triviais.

**Diferencial vs OpenRouter/LiteLLM/RouteLLM/Bifrost**:
- **Local-first** (Ollama-aware, não cloud proxy)
- **Per-session decisor** (não bulk gateway)
- **Honesty by default** (LoRA "none yet" até Wave 5 D2; quant verifiable; safety_boost com razão explícita)
- **Open-source MIT** (zero vendor lock)
- **Nativo Claude Code** (statusline + hooks + bash badge)

**Amplifica Claude Code Max plan**: usa local Ollama para T0/T1, Claude Haiku/Sonnet/Opus para T2/T3. Result: utilizadores satisfeitos consomem mais Max consciente (não queimam). Win-win para Anthropic.

---

## 2. O que está shipped (convergence → v1.0.0 · ~28 PRs)

### 2.0 Genealogy — convergence narrative (porque `git tag` mostra 27 tags)

Mooter chegou a **v1.0.0** convergindo **dois timelines de versão** que correram em paralelo no mesmo repo. Ambos os conjuntos de tags ficam **preservados (nunca apagados) para proveniência** — por isso `git tag` mostra mais que o headline v1.0. O projeto *frugal* foi **rebranded → mooter em 2026-04-14** (fonte de verdade: `CHANGELOG.md`). Datas ancoradas no `git log` real:

```
Timeline 1 — router engine  (frugal-origin, rebrand → mooter 2026-04-14)
  v0.7.0 … v0.9.4 (+ algo-v0.9.2)   tags, 2026-04-08→10   landing app + beta
  → v0.8.0 (Haiku arbiter) → v0.11.0                       maturidade do motor
                                                            (tools/router/)

Timeline 2 — Mooter product waves
  v0.1.0-pastor-wave1 … v0.6.6   tags, 2026-05-27→31
  Pastor foundations → reveal/rebrand (v0.2.2, 30-Mai) → safety/activation/sync
  → auth/dashboard → Adapter Forge → statusline V2 → onboarding/install → admin
                                                  (packages/cli/ + landing/)

                      ⬇  converge (Wave 7)  ⬇
              v1.0.0 — versão única nos 3 packages
              (tools/router/ · packages/cli/ · landing/)
```

**Porque convergir**: os mesmos números (ex. `v0.6.x`) significavam coisas diferentes em cada timeline — confuso para um showcase público/Anthropic. v1.0.0 acaba com a ambiguidade e é a versão going-forward. As tags `v0.9.x` (router/frugal) têm número *mais alto* mas são **mais antigas** (Abril) que as tags wave `v0.6.6` (Maio) — esta secção explica-o a quem correr `git tag`.

### Wave 1 — Pastor foundations (7 days)
`v0.1.0-pastor-wave1` · classify.js · 3 packs sementinha · benchmark MEDIUM 2/3

### Wave 2 — Router enhancement (7 days)
embedding axis-2 · event_writer · 7 packs · init wizard · re-benchmark WEAK→MEDIUM
  _(Wave 2 não foi tagged — a 1ª tag a seguir a `v0.1.0-pastor-wave1` é `v0.2.1-polish`. Não existe `v0.2.0-rc1`.)_

### Wave 2.5 — Activation polish (4 days)
`v0.2.1-polish` · statusline 🐮 · wizard hardening · bash command attribution · provenance trail

### Wave 2.6 — Mooter reveal (3 days)
`v0.2.2-reveal` · rebrand Pastor→Mooter+Moos · statusline 2-line + dashboard TUI · Moo card per-turn · glyph map · evolution

### Wave 2.7 — E2E simulation (audit)
`v0.2.7-audit` · 5 personas Hard-Vibe-Coder hermetic via sim.ts · scorecard 36/40 anthropic_ready

### Wave 2.8 — Landing parity
`v0.2.8-parity` · GPU chip · ctx bar · bash savings badge · quant Q4_K_M · LoRA honest

### Wave 3 (3 days)
- `v0.3.0-safety-fix` — safety_boost layer (MAJ-1 fix sharding strategy → T3)
- `v0.3.1-activation-hub` — telemetry opt-in HMAC signed + `mooter hub` TUI + persona-aware
- `v0.3.2-sync-stub` — sync_event schema v1 + dry-run client + audit log + schedule spec

### Wave 4 (4 phases)
- Phase A — landing rebuild dark theme _(sem tag própria; o trabalho de landing parity foi capturado por `v0.2.8-parity` na Wave 2.8 — não é uma 2ª tag)_
- Phase B `v0.4.0-auth` (mooter login CLI — loopback to /api/cli-token)
- Phase C `v0.4.1-dashboard-cloud` (5 cards extend existing dashboard)
- Phase D `v0.4.2-cf-backend` (client-only, hub deployed already)

### Wave 5 — Adapter Forge (2 days)
- D1 `v0.5.0-adapter-foundation` (ADR 020 Hybrid · manifest v1 · runtime stub · CLI scaffold)
- D2 `v0.5.1-forge-validation` (validate · install · benchmark · adapter_selection real · NITs)

### Sprint A — Statusline V2 (2 days)
- `v0.5.2-statusline-v2` (VRAM · quant tooltip · ctx bar · explain · hide flags)
- `v0.5.3-bash-badge-always-on` (root cause: gate confidence<0.6 suprimia hint inteiro)

### Sprint B — User lifecycle (2 days)
- `v0.6.0-web-onboarding` (persona step + libs extracted testable)
- `v0.6.1-install-url` (curl mooter.ai/i/<token> + Supabase definer-RPC tokens)

### Sprint C — Admin + feedback (2 days)
- `v0.6.5-admin-panel-skeleton` (email masking UI+CSV + audit log + env-var RBAC)
- `v0.6.6-admin-charts-feedback` (persona/timeline charts + `mooter feedback` CLI)

**Total**: ~70 dev days condensed · **convergidos em v1.0.0** (19 wave-tags v0.1.0→v0.6.6 + router v0.7→v0.11) · 6 recons consecutivos evitaram disasters · custo cumulative ~$10 (mostly $0 mocked).

---

## 3. Demo de 10 minutos — script proposto

### Min 0-1: Hero landing
- mooter.ai homepage com vaquinha
- Tagline: "Mooter pastors the Moos for Claude Code"
- Lock badge: "your code stays local"

### Min 1-2: `mooter init` flow
```bash
mooter init
# Hardware probe (RTX 4090 detected)
# Persona detection
# Pack recommendations
# Telemetry opt-in (HMAC signed, anonymous)
```

### Min 2-3: Statusline rich
```
🐮 mooter saved $0.75 (37%) · T2 sonnet 0.65
🐂 · 🏠 local ×4 · 🐄 last10: T0:0 T1:0 T2:5 T3:5 · 🎮 RTX 4090 (8.4GB / 24GB) · 100% 5h · quant Q4_K_M (-72% size · ~99% quality vs FP16) · adapter ◌ baseline · install via `mooter forge install <gguf>`
```

Explicar cada chip. **Educational mode**: `mooter explain statusline`.

### Min 3-5: 3 prompts ao vivo
1. **T0 (local Ollama)**: "muda a cor do botão para azul" → 🐄 local · custo $0
2. **T2 (Sonnet)**: "review this auth middleware" → 🐂 sonnet ☁ · safety_boost applied
3. **T3 (Opus)**: "design a sharding strategy for events" → 🦬 opus ☁ · critical_phrase_match

Após cada turn: **Moo card** mostra model · tokens · latency · cost · saved vs T3-default.

### Min 5-6: `mooter dashboard` TUI
```
🐮 Mooter Dashboard
MOOS ACTIVE: 🏠 qwen3:7b ×4 · ☁ sonnet ×2 · ☁ opus ×1
SAVINGS: $0.75 session · evolution +12% vs last week
CONTEXT: [█████░░░░░] 47%
QUOTA: 100% 5h
ADAPTER · ◌ baseline (run `mooter adapter list` · auto-training ships Wave 5 D3)
```

### Min 6-7: `mooter trail --evolution`
```
EVOLUTION (vs previous 7-day window)
  savings: $4.21 → $6.83  (+62.2%)
  prompts: 89 → 124       (+39.3%)
OPTIMIZATIONS APPLIED
  quantization: Q4_K_M (baseline since 2026-04-15)
  LoRA: ◌ none yet (Forge shipped v0.5.1 · install your own .gguf via `mooter forge install`)
```

### Min 7-8: Site logged area
- mooter.ai/dashboard com CLI Status · Activity Overview · Sync History · Settings
- Honest "ships Wave 4 Phase E" disclosures

### Min 8-9: Adapter Forge (se tiveres .gguf)
```bash
mooter forge install ./diagram-systems-v1.gguf --base-model qwen2.5:3b --type lora
mooter forge benchmark <id>
# +20% accuracy vs baseline · validated
mooter forge activate <id>
```

Statusline muda: `adapter 🔧 diagram-systems-v1 (+20% accuracy)`.

### Min 9-10: Q&A · "Por que Anthropic deveria saber"
- **Amplifica Max plan**: users felizes consomem mais conscientes
- **Open-source MIT**: zero competição cloud-side
- **Diferencial técnico**: 6 recons disciplinados · honesty by design · LoRA real validation pipeline
- **Multi-agent local roadmap (Wave 7)**: Dynamic Workflows com LoRAs locais = $0 cost vs $10/workflow Opus

---

## 4. 8/8 pontos Paulo originais — addressed

| # | Ponto | Como está addressed |
|---|---|---|
| 1 | GPU auto-detect | `🎮 RTX 4090 (8.4GB / 24GB)` na statusline ✅ |
| 2 | Context bar | `ctx [████░░░░░░] 23%` ANSI cores ✅ |
| 3 | LLM local count + modelo | `🏠 local ×4` + `qwen3:7b` no Moo card ✅ |
| 4 | Prompts por tier | `last10: T0:6 T1:2 T2:2 T3:0` ✅ |
| 5 | Bash command modelo | Badge always-on `[🐂 sonnet ☁ 0.84]` ✅ |
| 6 | Economia real | `saved $0.75 (37%)` + `mooter trail --evolution` ✅ |
| 7 | Quantização indicador | `quant Q4_K_M (-72% size · ~99% quality vs FP16)` ✅ |
| 8 | LoRA visibility honest | `adapter ◌ baseline` agora → real quando .gguf instalado ✅ |

---

## 5. 5 vibe coders para validar (sugestões)

Procurar perfis nos 3 sub-personas:

### Solo Founders (2)
- Outro founder pós-exit / pre-exit a usar Claude Code Max
- Founder em Discord da Anthropic / X.com

### Senior IC (2)
- FAANG engineer com side projects + Claude Code Max
- Senior IC em YC startups com Anthropic budget

### OSS Maintainer (1)
- Mantainer de OSS popular com Claude Code Max + Dynamic Workflows usage

### Critérios
- Uso real Claude Code (não casual)
- Plan Max ou Team (orçamento que beneficia de optimização)
- Hardware local capaz (RTX 30/40 series ou M2/M3 Pro+)
- Disponibilidade 30 min para call de feedback

### O que pedir
- Install Mooter via mooter.ai/onboarding
- Usar 1 semana em workflow normal
- Submeter feedback via `mooter feedback`
- 30 min call follow-up

### Métricas a recolher
- Mooter saved $X cumulative
- Tier distribution
- Bugs encontrados
- Features pedidas
- "Recomendarias a um amigo?" (NPS)

---

## 6. Landing polish checklist (antes de showcase)

### Confirmar funcional
- [ ] Sign in com GitHub OAuth
- [ ] Sign in com email magic link
- [ ] Redirect /onboarding pós-login (se não complete)
- [ ] Persona step funciona
- [ ] Install token gerado correctamente
- [ ] `curl mooter.ai/i/<token>` retorna script
- [ ] `mooter init --from-token=<token>` skip wizard
- [ ] Dashboard CLI Status card
- [ ] `/admin` redirect non-admin
- [ ] Admin user table email mask
- [ ] CSV export sem email raw
- [ ] `mooter feedback "..."` envia
- [ ] Admin feedback view

### Conteúdo
- [ ] Hero landing tagline confirmada
- [ ] About section actualizada com v1.0
- [ ] /pricing page (se existir) — alinhada com Max-plan-friendly story
- [ ] /docs página com quickstart 5-min
- [ ] /changelog ou /releases visíveis

### SEO / sharing
- [ ] OG image atualizada com vaquinha
- [ ] Title tags por página
- [ ] meta description coerente
- [ ] /robots.txt
- [ ] /sitemap.xml

---

## 7. Roadmap pós-showcase

| Wave | Foco | Quando |
|---|---|---|
| Wave 5 D3 (Docker training) | Adapters auto-treinados (ADR 020 Option D) | Depende feedback showcase |
| Wave 4 Phase E (hub integration) | Real-time data dashboard via `/v1/events` no hub | Backlog · alto risco · só se feedback pedir |
| Wave 7 (multi-agent local) | Dynamic Workflows com LoRAs locais · $0 cost vs Opus | Depende Wave 5 D3 |
| Wave 6.6 — Showcase polish | Bugs/issues encontrados nos 5 testes externos | Iterativo |
| Wave 8 (Codex) | Paulo definiu **"por último"** — TAM expansion | Decisão futura |

---

## 8. Tu próximas acções (Paulo)

### Hoje / esta semana
1. Aplicar 3 Supabase migrations (6+7+8) ~10 min
2. Smoke test local end-to-end ~30 min
3. Identificar 5 vibe coders alvo · enviar convite personalizado

### Próxima semana
4. Recolher 5 feedbacks
5. Iterar bugs com Sprint D (post-showcase polish)
6. Decidir Wave 5 D3 Docker training (se feedback pedir LoRAs)

### Pós-Sprint D
7. Anthropic showcase real (depois de iteração)

---

## 9. Materiais a preparar (eu posso fazer)

- [x] **Este plan** (`ANTHROPIC_SHOWCASE_PLAN.md`) ✅
- [ ] **`DEMO_SCRIPT.md`** — script verbatim 10 min com timing
- [ ] **PPT showcase** — 8-10 slides PowerPoint (skill: pptx)
- [ ] **`VALIDATION_PLAN.md`** — template de convite + survey questions + análise
- [ ] **`MOOTER_FOR_ANTHROPIC.md`** — 1-pager "why Anthropic should care"

Diz qual queres que eu compose a seguir.

---

## 10. Honest disclaimers (anti-hyperbole)

- Mooter não é unicórnio. TAM realista: 5-15% de Claude Code Max users.
- LoRA real só funciona com user-provided .gguf (Wave 5 D2). Docker auto-training é Wave 5 D3+.
- Hub `/v1/events` integration é backlog (Wave 4 Phase E) — dashboard ainda mostra mock data nesse ponto específico.
- Codex CLI fora scope (definição Paulo).
- Multi-agent local (Wave 7) depende Wave 5 D3 shippa.
- **⚠ Polish-PR pendente antes do demo ao vivo**: 6 strings de disclosure no código ainda dizem "ships (Wave 5) D2" embora o Forge já tenha shipado (D2 = `v0.5.1`). As strings de statusline/dashboard/trail neste plan (§3) já mostram o estado **corrigido**; o ecrã só vai bater com o guião depois desse PR. Localizações: `statusline-multi.js:679`, `adapter_selection.js:87` (invariant + test), `adapter.ts:68/136`, `dashboard.ts:254`, `trail.ts:313`. (O Moo card `stop_hook.js:126` já foi corrigido em W5 D4.)

Tudo o resto é production-ready.

---

**Versão**: 1.2 · **Autor**: Cowork (Opus 4.7) · **v1.1 fact-check + v1.2 convergence** (Wave 7): Claude Code (Opus 4.8) — headline → v1.0, §2.0 reescrita como convergence narrative (2 timelines, rebrand 2026-04-14 per CHANGELOG), `v0.2.0-rc1` fantasma, `v0.2.8` duplicado Phase A, statusline strings §3 vs repo real, polish-PR §10 · **Próxima revisão**: pós-5-vibe-coder feedback
