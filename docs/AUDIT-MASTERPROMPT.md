# AUDIT-MASTERPROMPT — Mooter Full-System Audit

> **Reutilizável.** Invoca em sessão nova com `model-architect` ou `/mooter-audit` (futura skill). Versionado para detectar drift entre runs consecutivas.

## MISSÃO

Auditoria completa e sem lacunas do sistema Mooter, verificando que todas as camadas (classificação → execução → telemetria → display → savings → docs → landing → CLAUDE.md doctrine) reportam a MESMA verdade. Detectar drift entre ficheiros, métricas mascaradas, mentiras visuais, lógica de enforcement fraca, e desalinhamento entre prática técnica e narrativa pública do produto. Entregar plano de remediação priorizado por severidade e blast radius.

**Se és subagente**: assume que este prompt é autónomo — lê tudo do disco.

## PRINCÍPIO GOVERNANTE

**Mooter só tem valor se a sua leitura de realidade for verídica.** Qualquer display que conte história diferente do que `execution.log` e `decisions.log` contam é bug de produto, não bug de formatação. Régua: **"o que mostra ao user bate com o que aconteceu?"**

## ESCOPO — 8 camadas

### Camada 1 — Active vs Legacy Files (fundação)

Antes de auditar, descobre ficheiro ACTIVO consultando `~/.claude/settings.json`:
- `statusLine.command`
- `hooks.SessionStart[]`, `hooks.PostToolUse[]`, `hooks.UserPromptSubmit[]`, `hooks.PreToolUse[]`, `hooks.Stop[]`

Para cada componente lista: ficheiro activo, ficheiros legacy/duplicados, diff resumido.

**Falha crítica**: canonical source memorizado apontar para ficheiro que não está em `settings.json` → flag para update.

### Camada 2 — Routing Core (cabeça)

- `classify.js` — regex bank, tier thresholds (T0≤0.3, T1≤0.5, T2≤0.7, T3>0.7), HIGH_RISK guardrail
- `arbiter.js` — quando corre, confidence threshold, modelo local
- `inject_context.js` — emite `<router-hint>`, suprime Option A quando necessário, honra USER_OVERRIDE

Checks:
- [ ] Todo decision em `decisions.log` tem `ts`, `tier`, `recommended_model`, `suggested_subagent`, `confidence` válidos
- [ ] `quality_intent=true` ou `user_override=true` → evento excluído de backtest pools
- [ ] HIGH_RISK regex é hard floor (match → tier não cai abaixo T3)
- [ ] `validation-set.test.js` passa
- [ ] Arbiter não excede 5s (hook timeout)

### Camada 3 — Execution Telemetry (realidade)

- `execution.log` — 1 linha por Bash call, `[ts] session=X model=Y role=Z cmd=...`
- `decisions.log` — 1 linha por prompt classificado
- `last-subagent.json` — efémero 30s TTL

Checks:
- [ ] `execution.log` regista modelo REAL (transcript), não recomendação
- [ ] `last-subagent.json` é FALLBACK, não ground truth
- [ ] Logs cross-referenciáveis por `session_id`
- [ ] Logs para: classifier call, arbiter, Option-A deflection, subagent spawn, ollama_call.sh directo

**Falha crítica**: emoji per-call mostrar "🦙 qwen3:30b" mas `execution.log` dizer `model=claude-opus-4-7` → mentira visual.

### Camada 4 — Display & Feedback Loops

- Statusline (multi-linha) — `frugal/tools/router/gsd-statusline.js`
- Per-call emoji — `~/.claude/hooks/PostToolUse.js`
- `/mooter-status`, `/mooter-summary`, `/mooter-savings`, `/mooter-review`
- `<router-hint>` no contexto

Checks:
- [ ] "local %" na statusline === `realExecutionCounts(sessionId)` de `execution.log`
- [ ] "saved $X" reproduzível via fetch a `localhost:7821/metrics`
- [ ] "all-Opus session" só quando 100% das Bash calls foram Opus
- [ ] Três modes (Moo/CrazyMoo/LazyMoo) sempre visíveis, só activa destacada
- [ ] Per-call emoji reflecte transcript, não recomendação
- [ ] Sessão fresca (0 prompts) → statusline degrada graciosamente

**Métrica oculta**: local % conta só Bash calls. Classifier local (100% prompts) e arbiter Ollama (~17%) não são creditados. Avaliar.

### Camada 5 — Mode Management

- `/mooter-beast`, `/mooter-zen`, `/mooter-auto`, autopilot
- Persistência: `~/.claude/tools/router/.mooter-mode.json` (`beast_mode`, `zen_mode`)
- Leitores: `inject_context.js`, `gsd-statusline.js`
- Escritor: `frugal-mode.js` / `mooter-mode.js`

Checks:
- [ ] `mooter-mode.js` existe (frugal-mode.js é shim)
- [ ] Default nova sessão documentado
- [ ] Gate tasks bypassam `zen_mode` (safety)
- [ ] Beast força T3 mesmo com quality_intent negativo

### Camada 6 — Savings Accounting

- `savings-tracker.js` HTTP :7821
- `/metrics` endpoint
- `pricing.js` — tabela por modelo/tier

Checks:
- [ ] `saved_pct = (opus_baseline - actual) / opus_baseline`
- [ ] Baseline = todos os prompts em Opus
- [ ] `option_a_hits` contam como savings totais
- [ ] Tester synthetic separado de real-usage (`source: mooter-tester`)
- [ ] Moeda consistente USD

### Camada 7 — Docs / Memory / Notion

- `CLAUDE.md` global + projecto
- `~/.claude/projects/*/memory/` + MEMORY.md
- `SYNC.md`, `INFRA.md`, `VISION_V2.md`, `ARCHITECTURE_PRIVATE.md`
- Notion HQ: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

Checks:
- [ ] file:line refs em memórias estão vivas (grep)
- [ ] `feedback_dual_statusline_files.md` actualizada (canonical é `frugal/tools/router/gsd-statusline.js`)
- [ ] `SYNC.md` tem secção COWORK → CLAUDE CODE
- [ ] Última sessão registada no Notion

### Camada 8 — Landing Alignment

- `frugal/landing/`
- `frugal/mooter-design-updated/` (untracked)
- Claims vs tracker real

Checks:
- [ ] Savings % landing ≈ `saved_pct` tracker (±5%)
- [ ] Features anunciadas existem no código
- [ ] Screenshots coerentes com v6.9+
- [ ] Nenhum claim sem sustentação em log

## METODOLOGIA

Para cada camada:
1. **Descobrir** — grep/glob; confirmar via settings.json
2. **Ler** — só o necessário (30-100 linhas)
3. **Cruzar** — queries que validam consistência
4. **Evidenciar** — cita `ficheiro:linha` ou log
5. **Severizar** — CRITICAL / HIGH / MEDIUM / LOW
6. **Remediar** — fix com blast radius, sem aplicar

## DELIVERABLES

`frugal/AUDIT-MOOTER-YYYY-MM-DD.md`:
1. **Executive Summary** (20 linhas)
2. **Inventory** (tabela: Camada | Activo | Legacy | Status)
3. **Findings** (por camada, severizado)
4. **Cross-layer Integrity Matrix**
5. **Remediation Plan** (ordenado por severidade, ETA min)
6. **Notion** — página criada + SYNC.md actualizado

## NON-GOALS

- **NÃO aplicar** fixes na auditoria
- **NÃO reescrever** ficheiros não auditados
- **NÃO criar** novos hooks/skills/CLI nesta run
- **NÃO tocar** `.mooter-mode.json`
- **NÃO modificar** settings.json sem aprovação

## GUARDRAILS

- Repo privado — invite-only
- Sem `.md` novos fora de scope (só AUDIT-MOOTER.md e este masterprompt)
- Commits selectivos, nunca `git add -A`
- Pré push/deploy → `final-reviewer`
- .env/CI/migrations/secrets → T3 forçado

## ROLLBACK READINESS

Antes de qualquer fix:
- [ ] `git rev-parse HEAD`
- [ ] Lista exacta de ficheiros tocados
- [ ] Reprodução testada (ex: `MOOTER_MOCK=1 echo ... | node statusline.js`)
- [ ] Sem edits acumuladas sem validar a primeira

## EXIT CRITERIA

1. Secções 1-5 escritas com evidência
2. Matrix cross-layer preenchida
3. Página Notion criada
4. SYNC.md actualizado
5. Paulo aprovou remediation plan

**Nenhum fix é aplicado até (5).**

---

**Assinatura**: Esta auditoria é o coração da solução. Se mente, Mooter mente.
