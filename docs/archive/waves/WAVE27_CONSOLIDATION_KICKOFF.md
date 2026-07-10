# WAVE 27 — Post-Ship Consolidation (kickoff)

**Sequência:** Wave 26 `v1.15.0-pastor-live` SHIPPED (`240e4cf`) → **Wave 27**
**Tag esperada:** `v1.15.1-wave27-consolidation`
**Estimate:** ~4h CC autonomous + LoRA overnight (paralelo, não bloqueia)
**Mode:** `--dangerously-skip-permissions` (Paulo a observar)

---

## Por que esta wave

Wave 26 fechou o loop real (CLI → CF Worker → D1 → Pastor live). Agora há **dívidas** acumuladas das últimas 6 waves que merecem 4h de consolidação antes do próximo grande ship:

1. CI test `unit + integration` falha consistentemente em PRs — bloqueia confiança em verde
2. LoRA train (212 samples Wave 23) ainda não treinado — Pastor v1 não tem adapter
3. Marketing artifacts (`TWEET_THREAD.md`, `BLOG_POST_DRAFT.md`) referenciam Wave 24/26 mas Wave 26 já shipped → desactualizados
4. Telemetria Wave 26 prod nunca foi inspeccionada — sabemos que E2E PASS mas nunca olhamos para `sync_events` real
5. Friends-launch DMs nunca foram materializadas em ficheiro (vivem só na conversa Cowork)
6. `SYNC.md` e `docs/strategy/STRATEGY.md` ainda apontam para Wave 26 IN-FLIGHT

Esta wave fecha **todas estas 6 dívidas** num PR único, sem código novo de produto (zero risco prod).

---

## Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ 240e4cf` |
| Branch feature | `wave27-consolidation` |
| Tag pré-merge | ❌ NÃO criar |
| Tag pós-merge | `v1.15.1-wave27-consolidation` em main HEAD final |
| Worker prod | NÃO TOCAR — Wave 26 está LIVE, esta wave é zero-risk |
| Doctrine | Day 0 honest recon obrigatório, tier mínimo viável, gate Opus final |

---

## Phases (8 blocos)

### Phase A — Day 0 Honest Recon (T0/T1, 20min) 🔥

**O que:** ANTES de tocar em código, inventariar:
- `git log --oneline 5408f9b..240e4cf` — confirmar o que entrou na Wave 26
- `find docs/strategy -name "WAVE2[3-6]*"` — listar briefs existentes
- `cat audit/lora_train.jsonl | wc -l` — confirmar 212 samples
- `cat audit/TWEET_THREAD.md` — confirmar estado actual
- `cat scripts/train_lora.sh` — confirmar existe e funciona
- `grep -rn "Wave 26" docs/strategy/STRATEGY.md SYNC.md` — onde precisa update

**Output:** `docs/strategy/WAVE27_DAY0_FINDINGS.md` com inventory + plano final ajustado.

**Tier:** T0 (Ollama) para reads + T1 (Haiku) para summary.

---

### Phase B — Wave 26 Telemetria Observação (T1, 15min)

**O que:** Inspeccionar D1 prod para ver activity real desde shipping.

```bash
# Total sync_events
npx wrangler d1 execute mooter-hub --remote --config wrangler.mooter.toml \
  --command "SELECT COUNT(*) as total, MIN(ts) as first_ts, MAX(ts) as last_ts FROM sync_events;"

# Devices únicos
npx wrangler d1 execute mooter-hub --remote --config wrangler.mooter.toml \
  --command "SELECT device_id, COUNT(*) as n FROM sync_events GROUP BY device_id ORDER BY n DESC LIMIT 10;"

# Pastor state (se já tem entries)
npx wrangler d1 execute mooter-hub --remote --config wrangler.mooter.toml \
  --command "SELECT * FROM pastor_state LIMIT 5;"
```

**Output:** `docs/observability/WAVE26_PROD_TELEMETRY_DAY0.md` com snapshots.

**Tier:** T1 (Haiku) para queries + interpretação.

---

### Phase C — CI Test Fix (T2/T3, 1h)

**O que:** O test `unit + integration tests (pull_request)` falhou em PR #123 (e provavelmente nos anteriores).

**Hipótese:** `package-lock.json` do Wave 25 v1.14.1 commit (5408f9b) tem `@cloudflare/workerd-windows-64` lockado porque foi gerado no Windows. CI Linux não consegue resolver.

**Plano:**

1. `cd hub && rm -rf node_modules package-lock.json`
2. `npm install` (em Linux WSL2 — gera lockfile cross-platform compatível)
3. Verificar `package-lock.json` agora tem `optionalDependencies` certas
4. Commit "fix(ci): regenerate package-lock.json for cross-platform compat"
5. Push para `wave27-consolidation` branch e ver se CI passa

**Tier:** T2 (Sonnet) para investigação + fix. T3 (Opus) se precisar de Architect review.

---

### Phase D — LoRA Train Setup (T2, 20min setup, depois manual overnight)

**O que:** Validar `scripts/train_lora.sh` está pronto + dar 1 comando ao Paulo correr.

1. `cat scripts/train_lora.sh` e validar:
   - Path para `audit/lora_train.jsonl` correcto
   - Modelo base configurado: `qwen2.5-coder:7b`
   - QLoRA params: 4-bit, alpha 16, dropout 0.1, lr 2e-4
   - Output: `mooter-pastor-v1.gguf`
   - Holdout 80/20, early stop
2. Garantir que script é idempotente e tem trap para erros
3. Compor 1-liner para Paulo correr (overnight): `bash scripts/train_lora.sh 2>&1 | tee logs/lora_train_$(date +%Y%m%d_%H%M%S).log`

**Output:** `scripts/train_lora.sh` validado + um bloco no PR description com instruções para Paulo.

**Tier:** T2 (Sonnet) para validação. **NÃO executar o train no CC** — é Paulo manual.

---

### Phase E — Marketing Artifacts Update (T1, 30min)

**Ficheiros a actualizar:**

`audit/TWEET_THREAD.md`:
- Mudar Tweet #1 framing: "We used Mooter to audit Mooter" → adicionar "and then we shipped real CLI→hub sync in Wave 26 (live now)"
- Tweet #6: `Wave 26's LoRA` (já correcto pós-edit Cowork)
- Adicionar Tweet #11 novo: "Wave 26 just shipped — `mooter sync` now talks to the hub for real. Try `mooter init && mooter sync` and watch your decisions land in the community pulse. mooter.ai/dashboard"

`audit/BLOG_POST_DRAFT.md`:
- Adicionar secção "Closing the loop (Wave 26, shipped 2026-06-06)" com 3 paragrafos
- Cost table actualizada
- Link para Notion sub-page SHIPPED

`README.md` (raiz):
- Badge "Sync: live" depois do "Build: passing"
- Update CHANGELOG section com `v1.15.0-pastor-live`

**Tier:** T1 (Haiku) — escrita microcopy.

---

### Phase F — Documentation Cleanup (T0/T1, 20min)

`SYNC.md`:
- Secção "📥 COWORK → CLAUDE CODE": actualizar próxima missão (Wave 28 backlog discussion)
- Secção "Notion HQ — Páginas de Referência": adicionar links Wave 25 e Wave 26 SHIPPED
- Loopholes: mover Wave 26 "deploy CF" → "✅ fechado 2026-06-06"

`docs/strategy/STRATEGY.md`:
- Secção Wave 26: actualizar de "planned" para "SHIPPED 2026-06-06"
- Tag history table: adicionar `v1.15.0-pastor-live`
- Carry-overs: limpar 26.G LoRA train (movido para Phase D), 22.A herd v167 nuclear (já no Wave 26)

`docs/archive/sessions/`:
- Mover `WAVE25_DAY1_FINDINGS.md` para `docs/archive/sessions/`
- Mover `WAVE25_COMPLETE_HONESTY_KICKOFF.md` para `docs/archive/sessions/`
- Manter activos apenas: `STRATEGY.md`, `WAVE26_REAL_SYNC_PASTOR_KICKOFF.md`, `WAVE27_CONSOLIDATION_KICKOFF.md` (este)

**Tier:** T0 (Ollama) para reads + T1 (Haiku) para edits.

---

### Phase G — Friends-Launch DMs Materializados (T0, 15min)

**Criar ficheiro:** `audit/FRIENDS_LAUNCH_DMS.md`

Conteúdo:
- Pitch v5.2 (honest, com Wave 26 LIVE + Pastor learning loop active)
- 3 DMs personalizadas: @celispj, @om_patel5, @vibecademyai
- Outreach tracking table (sent/replied/feedback)
- Follow-up cadence (Day 3, Day 7, Day 14)
- Pitch variations: short (50 words), medium (100), long (150) para diferentes contextos

**Tier:** T0 (Ollama) — escrita simples.

---

### Phase H — Gate + PR + Merge + Tag (T3, 30min)

1. `final-reviewer` (Opus) sobre o branch inteiro `wave27-consolidation`
   - Critério: zero HIGH severity. MEDIUMs documentados.
   - Verificar zero mudança em código de produto Mooter (apenas docs/marketing/scripts/CI)
2. PR `wave27-consolidation` → `dev`
3. CI deve passar (Phase C resolveu o lockfile)
4. Merge PR → dev
5. PR `dev` → `main` (auto-merge se CI verde)
6. **Depois do merge to main:** tag prod:
   ```bash
   git fetch origin && git tag -f v1.15.1-wave27-consolidation <NEW_MAIN_HEAD>
   git push --force origin v1.15.1-wave27-consolidation
   ```

**Tier:** T3 (Opus) final-reviewer + Chrome MCP merge (Cowork side).

---

## Ordem de execução recomendada

```
Phase A (recon)           ████░░░░░░░░░░░░░░░░░░░░  20min
Phase B (telemetria)      ░░░░████░░░░░░░░░░░░░░░░  15min
Phase C (CI fix)          ░░░░░░░░████████░░░░░░░░  1h
Phase D (LoRA setup)      ████████░░░░░░░░░░░░░░░░  20min (paralelo)
Phase E (marketing)       ░░░░░░░░░░░░░░░░████░░░░  30min
Phase F (docs)            ░░░░░░░░░░░░░░░░░░░░██░░  20min
Phase G (DMs)             ░░░░░░░░░░░░░░░░░░░░░██░  15min
Phase H (gate+merge+tag)  ░░░░░░░░░░░░░░░░░░░░░░██  30min
```

**Total:** ~4h CC autonomous + LoRA train overnight (Paulo manual, paralelo desde Phase D).

---

## Constraints rígidos

- ❌ **NÃO tocar em código de produto** (`landing/`, `cli/`, `hub/src/`). Apenas docs, scripts, audit/, .github/workflows/ se necessário.
- ❌ **NÃO criar tag antes do merge final** (lição 6 waves consecutivas).
- ❌ **NÃO correr LoRA train no CC** — Paulo executa manualmente no 4090.
- ❌ **NÃO mandar DMs Twitter** — Paulo executa manualmente.
- ✅ **PODE** correr `wrangler d1 execute` para queries readonly (telemetria).
- ✅ **PODE** correr `npm install` em `hub/` para regenerar lockfile.
- ✅ **PODE** `gh pr create` + `gh pr merge --merge` (não squash).
- ✅ **PODE** `git push` para `wave27-consolidation` branch (não para main/dev directamente).

---

## Checklist pré-merge

- [ ] Phase A findings doc criado
- [ ] Phase B telemetria snapshot guardado
- [ ] Phase C CI test PASS no PR (verde)
- [ ] Phase D scripts validados, comando para Paulo no PR description
- [ ] Phase E TWEET_THREAD + BLOG_POST + README actualizados
- [ ] Phase F SYNC.md + STRATEGY.md + archives organizados
- [ ] Phase G FRIENDS_LAUNCH_DMS.md criado
- [ ] final-reviewer (Opus) sem HIGH
- [ ] CI verde no PR final
- [ ] Notion sub-page criada (cosmico — também pode ser pelo Cowork)
- [ ] Memory file actualizado

---

## Marketing diff Wave 26 → Wave 27

- Tweet thread agora tem Tweet #11 (Wave 26 LIVE invitation)
- Blog post tem secção "closing the loop"
- README tem badge "Sync: live"
- FRIENDS_LAUNCH_DMS.md materializa pitch v5.2 honest

---

*Brief composto pelo Cowork 2026-06-06 ~22h BRT, post-ship Wave 26. Day 0 recon obrigatório antes de qualquer mudança.*
