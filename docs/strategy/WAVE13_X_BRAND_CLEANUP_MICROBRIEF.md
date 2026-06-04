# Wave 13.x — Brand Cleanup (frugal → mooter alinhamento total)

> **Goal**: alinhar todos os referentes operacionais com a decisão de brand do Paulo —
> "jogamos fora o nome frugal e sempre Mooter". Wave 13.x ship aligned Worker names,
> secret names, config files, e CI workflows com a brand Mooter — sem partir o que está
> a servir clients em produção.
>
> **Trigger**: 2-worker topology gotcha apanhado em Wave 12 PR-B promote (memória
> `two_worker_topology_gotcha.md`). Wave 13 EM PROD com narrative herd, agora a casa
> deve ficar arrumada.
>
> **Scope (Balanced)**: rename + redirect com backwards-compat. Sem URL changes que
> partam installed CLIs. Hub D1 partilhado entre 2 Workers — só Worker `mooter-hub`
> precisa ficar canonical, `frugal-hub` deprecado.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - URLs públicos `mooter-hub.frugal-hub.workers.dev` mantidos (CLIs hardcoded)
> - Zero downtime (`mooter feedback` continua a funcionar durante e depois)
> - Existing `FRUGAL_ADMIN_TOKEN` continua activo até `MOOTER_ADMIN_TOKEN` aprovisionado
> - Zero schema changes em `mooter_event`/D1 tables
> - Zero PII em telemetry

---

## 0. Contexto + audit findings

### Estado actual (Cowork audit pós-Wave 13)

| Componente | Nome actual | Brand-aligned? |
|---|---|---|
| Worker que serve client URL | `mooter-hub` | ✅ sim |
| Worker CI default | `frugal-hub` | ❌ frugal-named |
| Config canonical (clients) | `wrangler.mooter.toml` | ✅ |
| Config CI default | `wrangler.toml` (Worker: `frugal-hub`) | ❌ |
| Secret token name (live em ambos Workers) | `FRUGAL_ADMIN_TOKEN` | ❌ frugal-named |
| Secret salt name | `FEEDBACK_IP_SALT` | 🟡 neutro |
| GitHub Actions workflow | `.github/workflows/deploy-hub.yml` (deploys default config) | ⚠️ deploya Worker errado |
| Repo public name | `mooter` | ✅ |
| CLI default hub URL | `mooter-hub.frugal-hub.workers.dev` | 🟡 subdomain mooter-hub OK; account stub frugal-hub é CF infra (não controlamos sem migration) |
| Workspace folder | `~/frugal/` | 🟡 não importa em prod |

### O risco real se não fizermos cleanup

1. **Repetir o incident Wave 12 PR-B**: alguém (Paulo, CC, contributor) lê `wrangler.toml` default, pensa que é canonical, deploya ao Worker errado, end-users 404.
2. **Validation week**: vibe coder lê secret name `FRUGAL_ADMIN_TOKEN` num doc → "porque é que diz frugal?" → confusão sobre brand.
3. **Anthropic showcase**: alguém vê código com `FRUGAL_*` referencias → narrative inconsistency.
4. **Future contributors**: que canonical seguem?

### Cobertura proposta — 4 phases (1 PR)

| Phase | O que muda | Risco | Backwards-compat |
|---|---|---|---|
| 1 | Hub: renomear `wrangler.toml` → `wrangler.frugal-legacy.toml` + atualizar comentários | 🟢 zero (deprecation marker apenas) | sim |
| 2 | CI: `.github/workflows/deploy-hub.yml` usar `-c wrangler.mooter.toml` (passa a deployar Worker canonical) | 🟡 médio — primeira CI run deploya `mooter-hub` directamente | sim (Worker continua mesmo) |
| 3 | Secrets: dual-write — código aceita `MOOTER_ADMIN_TOKEN` OU `FRUGAL_ADMIN_TOKEN` (fallback) durante deprecação | 🟢 zero | sim (frugal continua aceito) |
| 4 | Docs/copy: substituir referências `FRUGAL_*` por `MOOTER_*` em READMEs + CHANGELOGs + memória + comments | 🟢 zero | n/a |

---

## 1. Phase 1 — Worker config deprecation marker

### Findings to fix

| # | Fix | Severidade |
|---|---|---|
| P1-1 | Renomear `hub/wrangler.toml` → `hub/wrangler.frugal-legacy.toml`. Manter conteúdo idêntico (Worker name continua `frugal-hub`). Adicionar comment header explícito: `# DEPRECATED: legacy frugal-hub Worker. Canonical is wrangler.mooter.toml. See docs/strategy/WAVE13_X_BRAND_CLEANUP_MICROBRIEF.md` | 🟠 important |
| P1-2 | Atualizar comment no topo de `wrangler.mooter.toml` para explicitar **"canonical config — CLIs hardcoded against mooter-hub.frugal-hub.workers.dev which routes to this Worker"** | 🟠 important |

### Recon command

```bash
ls hub/wrangler*.toml
head -25 hub/wrangler.toml
head -25 hub/wrangler.mooter.toml
```

### Fix policy

Phase 1 é puro file rename + comment tweaks. Zero risk operacional.

**Anti-pattern**: NÃO eliminar `wrangler.toml` (renomear → legacy). Eliminar parte CI até Phase 2 executar.

---

## 2. Phase 2 — CI deploy-hub.yml usar canonical config

### Findings to fix

| # | Fix | Severidade |
|---|---|---|
| P2-1 | `.github/workflows/deploy-hub.yml`: adicionar flag `-c wrangler.mooter.toml` no step `wrangler-action`. Worker deployado passa a ser `mooter-hub` (canonical) em vez de `frugal-hub` (legacy) | 🔴 critical |
| P2-2 | Comentário no workflow explicando: "Wave 13.x: deployments now target the mooter-hub Worker (the canonical one CLIs use)." | 🟠 important |

### Recon command

```bash
cat .github/workflows/deploy-hub.yml
```

### Test (CC bash sandbox)

```bash
# Dry-run wrangler with new config (without actually deploying)
cd hub
npx wrangler deploy --dry-run -c wrangler.mooter.toml
```

### Fix policy

P2-1 → blocker. P2-2 → important.

**Trade-off**: depois desta mudança, **CI deploya o Worker `mooter-hub` em vez de `frugal-hub`**. Isso significa:
- `frugal-hub` Worker fica órfão (não recebe deploys novos)
- `mooter-hub` Worker recebe tudo via CI (deixa de precisar de `wrangler deploy -c wrangler.mooter.toml` manual)
- **Paulo decide**: parar de actualizar `frugal-hub` (deprecação total) OR manter `frugal-hub` actualizado paralelamente via mini-script (não recomendado, dual maintenance burden)

**Recomendação**: deprecação total. `frugal-hub` fica frozen na última versão deployed (qual seja v1.8.x). Eventualmente Paulo deleta no Cloudflare Dashboard se preferir.

### Anti-pattern

NÃO eliminar `frugal-hub` Worker no Cloudflare Dashboard nesta phase — pode haver clients antigos que descobriram a URL legacy. Deixar frozen + Wave 14 ou depois fazer audit final.

---

## 3. Phase 3 — Secret dual-write (FRUGAL_ADMIN_TOKEN → MOOTER_ADMIN_TOKEN)

### Findings to fix

| # | Fix | Severidade |
|---|---|---|
| P3-1 | `hub/routes/feedback.js` GET `/api/feedback-list` admin check: aceitar **OU** `env.MOOTER_ADMIN_TOKEN` OU `env.FRUGAL_ADMIN_TOKEN` (fallback). Constant-time compare em ambos. Log uma vez por cold-start qual secret está set ("mooter-token-set" / "frugal-fallback") | 🟠 important |
| P3-2 | CLI `packages/cli/feedback.ts`: ler `MOOTER_ADMIN_TOKEN` env var primeiro, fallback `MOOTER_HUB_TOKEN` (legacy alias), fallback `FRUGAL_ADMIN_TOKEN`. Documentar em help text que `MOOTER_ADMIN_TOKEN` é canonical | 🟠 important |
| P3-3 | Documentar em `docs/strategy/WAVE13_X_BRAND_CLEANUP_MICROBRIEF.md` (este ficheiro) o procedimento Paulo para Phase 3 ops: set `MOOTER_ADMIN_TOKEN` em ambos Workers (mooter-hub + frugal-hub) com o mesmo valor do actual `FRUGAL_ADMIN_TOKEN` → verify endpoint funciona com novo nome → eventualmente delete `FRUGAL_ADMIN_TOKEN` (Wave 14 ou depois) | 🟠 important |

### Recon command

```bash
grep -rn "FRUGAL_ADMIN_TOKEN\|MOOTER_ADMIN_TOKEN" hub/ packages/cli/
```

### Test

```bash
# Unit test: feedback.js auth com ambos tokens
node --test hub/routes/__tests__/feedback-auth.test.js
```

### Paulo ops (Phase 3 secret rotation)

Após PR merged:

```powershell
cd "C:\Users\Paulo Loureiro\frugal\hub"

# 1. Set MOOTER_ADMIN_TOKEN com MESMO valor que FRUGAL_ADMIN_TOKEN actual
#    (guarda em password manager primeiro)
npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.mooter.toml
# Cola token

npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.toml
# Cola o MESMO token

# 2. Verify ambos endpoints aceitam o novo nome
# (CC vai dar curl commands)

# 3. Opcionalmente: delete FRUGAL_ADMIN_TOKEN em Wave 14 ou depois (não é urgente — código aceita ambos)
```

### Fix policy

Dual-write é o approach safe. Eventualmente (Wave 14+) podemos remover fallback `FRUGAL_*`. Não há urgência.

---

## 4. Phase 4 — Docs/copy sweep

### Findings to fix

Identificar e renomear todas as referências `FRUGAL_*` em:
- READMEs
- CHANGELOGs
- Markdown docs em `docs/strategy/`
- Comments em código (não rename code symbols ainda — só comments)
- Help text de CLI (`mooter --help`, `mooter feedback --help`)

### Recon command

```bash
grep -rn "FRUGAL_" docs/ README.md packages/cli/ tools/ 2>/dev/null | head -50
grep -rn "frugal-hub\|frugal_hub" docs/ README.md packages/cli/ tools/ 2>/dev/null | head -30
```

### Fix policy

Cosmetic, low-risk. Sweep substituições mas:
- ❌ NÃO renomear variáveis de código (symbols) — só docs/comments
- ❌ NÃO mudar paths de ficheiros legados (`wrangler.toml` rename é Phase 1, não Phase 4)
- ❌ NÃO mudar `~/frugal/` workspace path (cosmetic only)
- ✅ Substituir nas references humanas (READMEs, docs, comments)

---

## 5. Sequência (1 PR consolidado, 4 phases)

### Day 1 — Recon + 4 phases (CC ~2-3h)

1. **Phase 1**: rename `wrangler.toml` → `wrangler.frugal-legacy.toml` + comment headers
2. **Phase 2**: `deploy-hub.yml` usa `-c wrangler.mooter.toml` + comment explicativo
3. **Phase 3**: dual-write `MOOTER_ADMIN_TOKEN` / `FRUGAL_ADMIN_TOKEN` em hub/cli + tests
4. **Phase 4**: docs/copy sweep

End-of-Day-1: PR squash→dev. Tag `v1.8.1-brand-cleanup-dev`.

### Day 1 — Paulo Gate + promote (~5 min)

1. CC reporta PR aberto
2. Paulo aprova merge (gate)
3. Cowork merge dev→main
4. CC tag prod `v1.8.1-brand-cleanup`
5. **Paulo ops** (~5 min): set `MOOTER_ADMIN_TOKEN` em ambos Workers (per §3 acima)
6. Smoke test: `mooter feedback "wave 13.x brand cleanup smoke"` continua a funcionar
7. Cowork update SYNC + memória + Notion

---

## 6. Anti-patterns

- ❌ NÃO eliminar `frugal-hub` Worker no CF Dashboard (deixar frozen)
- ❌ NÃO eliminar `FRUGAL_ADMIN_TOKEN` secret antes do dual-write estar em prod
- ❌ NÃO renomear `mooter-hub.frugal-hub.workers.dev` URL (CLIs hardcoded)
- ❌ NÃO tocar `classify.js` (P11)
- ❌ NÃO mudar schema D1 `feedback` table
- ❌ NÃO `git add -A`
- ❌ NÃO auto-merge a main

---

## 7. Definition of Done

Wave 13.x é done quando:

1. ✅ `hub/wrangler.toml` renomeado para `hub/wrangler.frugal-legacy.toml` (Phase 1)
2. ✅ `.github/workflows/deploy-hub.yml` usa `-c wrangler.mooter.toml` (Phase 2)
3. ✅ `feedback.js` aceita ambos `MOOTER_ADMIN_TOKEN` e `FRUGAL_ADMIN_TOKEN` (Phase 3)
4. ✅ CLI `feedback.ts` lê `MOOTER_ADMIN_TOKEN` primeiro, fallback `FRUGAL_ADMIN_TOKEN`
5. ✅ Docs sweep concluído (READMEs, comments)
6. ✅ Paulo set `MOOTER_ADMIN_TOKEN` em ambos Workers
7. ✅ Smoke test prod: `mooter feedback "X"` ainda funciona (POST → 201)
8. ✅ Tag `v1.8.1-brand-cleanup` em main
9. ✅ Memória actualizada — `two_worker_topology_gotcha.md` ganha nota "Wave 13.x cleanup aplicado, frugal-hub deprecado"

---

## 8. Master prompt para CC (paste when ready)

```
Inicia Wave 13.x Brand Cleanup conforme docs/strategy/WAVE13_X_BRAND_CLEANUP_MICROBRIEF.md.

Pré-flight: Wave 13 v1.8.0-show-the-herd EM PROD. Sessão #84 closure formal.

Scope: 4 phases consolidadas em 1 PR (rename wrangler config legacy, CI canonical, secret dual-write, docs sweep). Backwards-compat total. Zero downtime.

Lê PRIMEIRO:
  - docs/strategy/WAVE13_X_BRAND_CLEANUP_MICROBRIEF.md inteiro
  - hub/wrangler.toml + hub/wrangler.mooter.toml (auditar headers)
  - .github/workflows/deploy-hub.yml
  - hub/routes/feedback.js (auth path)
  - packages/cli/feedback.ts (env var reading order)
  - Memória [[two_worker_topology_gotcha]] (Cowork memory, contexto incident)

Non-negotiables:
  - classify.js byte-identical (P11)
  - URLs públicos NÃO mudam (mooter-hub.frugal-hub.workers.dev hardcoded)
  - Zero downtime: feedback continua live durante e depois
  - FRUGAL_ADMIN_TOKEN aceito como fallback até Wave 14+ (dual-write)
  - Zero schema changes em D1
  - Zero PII em telemetry

Sequência (4 phases, ~2-3h CC):
  Phase 1 — rename hub/wrangler.toml → hub/wrangler.frugal-legacy.toml + comment headers explícitos
  Phase 2 — .github/workflows/deploy-hub.yml: adiciona -c wrangler.mooter.toml + comment "Wave 13.x: deployments target mooter-hub canonical Worker"
  Phase 3 — feedback.js + feedback.ts: dual-write MOOTER_ADMIN_TOKEN (canonical) | FRUGAL_ADMIN_TOKEN (fallback). Constant-time compare em ambos. Tests unitários.
  Phase 4 — docs sweep: substituir referências FRUGAL_* em READMEs/CHANGELOGs/comments. NÃO renomear code symbols nem paths legados. NÃO renomear ~/frugal/ workspace.

Final-reviewer T3 gate: confirma classify.js sha256 unchanged + zero schema D1 + zero PII + dual-write funciona (test cobertura ambos tokens).

PR squash→dev. Reporta para Cowork merge. Paulo Gate único antes de promote dev→main.

Após merge prod, Paulo ops (~5 min):
  cd "C:\Users\Paulo Loureiro\frugal\hub"
  npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.mooter.toml
  npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.toml
  # (mesmo valor que FRUGAL_ADMIN_TOKEN actual em ambos)

Smoke test final: mooter feedback "wave 13.x brand cleanup smoke" → 201.

Closure: tag v1.8.1-brand-cleanup + update memória two_worker_topology_gotcha.md com nota "Wave 13.x aplicado, frugal-hub deprecado, MOOTER_ADMIN_TOKEN canonical".

Reporta WAVE13_X_DAY1_FINDINGS.md no fim das 4 phases (antes do PR) se houver decisões adicionais para Paulo.
```

---

**Composed by Cowork, 2026-06-04 morning. Wave 13.x ships brand alignment without
breaking URLs, secrets, or client flows. Backwards-compat dual-write deprecation pattern.
~2-3h CC + ~5 min Paulo ops. Tag v1.8.1-brand-cleanup.**
