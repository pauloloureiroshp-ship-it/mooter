# BENCHMARK KICKOFF — single copy-paste entry point

> **Tu (Paulo) faz exactamente isto, nada mais:**
>
> 1. Se Claude Code aberto: `/exit`
> 2. Abre **Ubuntu Terminal** (Menu Start → "Ubuntu 22.04")
> 3. Digita: `cd ~/mooter && claude --permission-mode auto`
> 4. Quando o REPL `>` abrir, **abre `KICKOFF.md` no Bloco de Notas**, selecciona desde `=== START ===` até `=== END ===`, copia (`Ctrl+C`)
> 5. Volta ao terminal, cola (`Ctrl+Shift+V`) + Enter
> 6. O Claude executa tudo sozinho (~3.5h). Tu só respondes à confirmação inicial e ao "podes prosseguir?" pontual.

---

=== START ===

És Claude Code em `~/mooter/`. Estás a arrancar o **Wave 1 Pastor End-to-End Benchmark** (pre-registered em `~/frugal/docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md`).

A tua missão tem 7 fases. Executa **na ordem** sem perguntar nada que possas decidir tu mesmo. Pergunta **apenas** o que está marcado abaixo como "PERGUNTAR".

---

## FASE 0 — Self-prep automática (sem perguntar)

Corre estes checks em ordem. Se algum falhar, **aborta** e diz ao Paulo o motivo exacto.

```bash
# Check 1 — onde estou
pwd
git status

# Check 2 — tag existe?
git fetch --tags 2>&1 | tail -5
git tag --list | grep -i wave1
# Esperado: v0.1.0-pastor-wave1
# Se vazio → ABORTA com mensagem: "Tag v0.1.0-pastor-wave1 não existe. Confirma com Paulo."

# Check 3 — actual branch
git branch --show-current
git log --oneline -1
```

**Decisão automática:**

| Branch actual | Acção |
|---|---|
| `wave1-benchmark` | Confirma com `git describe --tags --exact-match`. Se = `v0.1.0-pastor-wave1`, salta para Check 5. |
| Outra (main, dev, etc.) | `git checkout v0.1.0-pastor-wave1` então `git checkout -b wave1-benchmark` (se branch existir local, `git branch -D wave1-benchmark` primeiro para reset clean) |

Não perguntes ao Paulo qual branch — escolhe `wave1-benchmark` sempre.

```bash
# Check 4 — confirma a branch + tag
git branch --show-current
git describe --tags

# Check 5 — ANTHROPIC_API_KEY
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:15}..."
# Se output mostra "ANTHROPIC_API_KEY: ..." (vazio depois dos dois pontos)
# → ABORTA com mensagem:
#   "ANTHROPIC_API_KEY não está no env. Antes de arrancar:
#    1. Vai a https://console.anthropic.com/settings/keys
#    2. Cria key 'mooter-benchmark', copia
#    3. echo 'export ANTHROPIC_API_KEY=\"sk-ant-...\"' >> ~/.bashrc && source ~/.bashrc
#    4. Relança Claude Code"

# Check 6 — Ollama acessível
curl -s -m 5 http://localhost:11434/api/tags | head -3
# Se falha → ABORTA com mensagem: "Ollama não responde. Abre Ollama no Windows e relança."

# Check 7 — Dependências router
cd ~/mooter/packages/router
ls -la package.json
cat package.json | head -20
node --version
npm --version

# Check 8 — Dependências cli
cd ~/mooter/packages/cli
ls -la package.json 2>/dev/null && echo "cli package OK" || echo "cli package missing"

# Check 9 — Pricing snapshot ou criar
cd ~/mooter
ls -la data/pricing-snapshot-2026-05-27.json 2>/dev/null && echo "pricing snapshot exists" || echo "pricing snapshot MISSING — vou criar na Fase A"
```

**Quando todos os 9 passarem:** reporta ao Paulo num único bloco:

```
✅ Pré-condições OK

Tag: v0.1.0-pastor-wave1
Branch: wave1-benchmark
ANTHROPIC_API_KEY: presente (sk-ant-...)
Ollama: responde (X modelos disponíveis)
Node: vXX.XX
Dependências router/cli: instaladas
Pricing snapshot: <exists | precisa criar>

Pronto para Fase 1 — leitura obrigatória dos docs.
```

---

## FASE 1 — Leitura obrigatória (sem perguntar, ~10 min)

Lê na ordem **completa** (não summaries):

1. `~/frugal/docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md` — pre-registration (contrato)
2. `~/frugal/docs/benchmarks/wave1-pastor/MASTER_PROMPT.md` — plano detalhado de execução (Fases A-F do §4)
3. `~/frugal/docs/strategy/PASTOR.md` — apenas §5 (packs) e §6.1 (pack-hint format)
4. `~/mooter/packages/router/src/classify_complexity.ts`
5. `~/mooter/packages/router/src/classify_domain.ts`
6. `~/mooter/packages/router/src/pack_resolve.ts`
7. `~/mooter/packages/router/src/hooks/inject_context.ts`
8. `~/mooter/tools/router/pricing.js`
9. `~/mooter/packs/animation-web/pack.yaml` + `packs/code-audit/pack.yaml` + `packs/diagram-systems/pack.yaml`

Não resumas para o Paulo. Apenas confirma "Leitura completa, prosseguindo para Fase 2".

---

## FASE 2 — PERGUNTAR ao Paulo (única decisão dele)

Apresenta este resumo + 1 pergunta:

```
Pre-flight check completo. Plano:

Tempo estimado: ~3.5h total
  - Fase A (Setup + scaffold + pricing + schemas) ~40 min
  - Fase B (34 prompts pre-registered) ~20 min — DECISÃO ABAIXO
  - Fase C (3 arms: Pastor / baseline / gold) ~45 min
  - Fase D (blind Sonnet judge + deterministic checks) ~30 min
  - Fase E (RUN: 102 invocações + 34 judge calls + Parquet + data lake) ~50 min runtime
  - Fase F (handoff README + queries.sql) ~20 min

Cost estimate: ~$50 (cap $80, pausa para perguntar)

Output schema: v1.0.0 com lineage block (commit, pastor_version, pricing_version, env_hash, sdk_version, ollama_version) — reproduzível a 12 meses.

Storage: JSONL + Parquet (DuckDB-queryable), hub-ready (sem upload nesta run).

⚠️ DECISÃO NECESSÁRIA — Fase B (geração dos 34 prompts):

Opção A: gera os 34 prompts directo, hands-off (mais rápido, sem revisão tua)

Opção B: gera primeiro 5-6 prompts representativos (1-2 por bloco), mostra-tos, esperas
         o teu OK ("Sim, prossegue") ou ajustes, depois completa os restantes 28-29
         alinhados com o tom validado (anti-bias do redactor)

Qual escolhes (A ou B)?
```

Espera resposta do Paulo. Aceita "A" ou "B" como answer. Se ambíguo, pede clarificação curta.

---

## FASE 3 — Executa MASTER_PROMPT.md §4 Fases A-F

A partir daqui, **segue exactamente** o que está em `~/frugal/docs/benchmarks/wave1-pastor/MASTER_PROMPT.md` §4. Sem desvios. Aplica todos os princípios non-negotiable (§2 desse doc), respeita Definition of Done (§7).

### Marcos de pause obrigatórios (PERGUNTAR ao Paulo):

| Marco | Quando | O que perguntar |
|---|---|---|
| **A.1** (se opção B foi escolhida) | Após gerar os 5-6 prompts seed | "Validas o tom destes 5-6? Faço os restantes 28-29 alinhados?" |
| **C.dry-run** | Após dry-run de 1 prompt × 3 arms (~$0.50) | "Dry-run OK, resultados sanos. Avanço para os 34 completos?" |
| **E.cost-30** | Quando running cost passar $30 | "Cost a $30, estimate $50. Continuo?" (default: sim, só info) |
| **E.cost-80** | Se passar $80 | **HARD STOP**. Espera decisão antes de continuar. |
| **Anomaly** | Se judge variance > 0.3 nos 5 sanity-check repeats | "Judge variance alta (X), continuar com noted limitation ou abortar?" |

### Princípios duros (não negociáveis):

- ❌ **Sem push para `main`** nem `dev`. Branch fica local.
- ❌ **Sem merge** do PR (não abrir PR sequer, opcional)
- ❌ **Sem modificar** `BENCHMARK_DESIGN.md` durante a run
- ❌ **Sem inventar** URLs, packages, libs, CVEs
- ❌ **Sem `git add -A`**. Commits selectivos.
- ✅ **Schema validation** runtime em cada row (`schema_version: "1.0.0"` + lineage block)
- ✅ **Parquet output** além de JSONL (analytics ready)
- ✅ **Cost monitor** loud (imprime cada 5 prompts)

---

## FASE 4 — Closure + handoff

Depois da Fase F (handoff README), faz um commit final único:

```
docs(sync): Wave 1 benchmark complete · run_id=<uuid> · cost=$XX.XX · X/102 rows · Y anomalies
```

Push da branch para origin (NÃO mergeada):

```bash
git push -u origin wave1-benchmark
```

Reporta ao Paulo num único bloco final:

```
✅ Benchmark Wave 1 Pastor — RUN COMPLETA

Branch: wave1-benchmark (pushed, NÃO merged)
Run-id: <uuid v7>
Outputs em: ~/mooter/packages/router/scripts/wave1-benchmark/outputs/

Ficheiros:
- RAW_RESULTS.jsonl (X rows · X bytes)
- RAW_RESULTS.parquet (X bytes)
- JUDGE_LOG.jsonl (Y rows · Y bytes)
- JUDGE_LOG.parquet
- SUMMARY.json
- SUMMARY.parquet
- queries.sql (Z queries pre-canned)
- README.md (handoff)
- anomalies.md (X anomalies registadas, ou vazio)
- lineage-snapshot.json

Data lake atualizado:
- ~/.mooter/cache/events/2026-MM-DD.jsonl
- ~/.mooter/cache/parquet/2026-MM-DD.parquet

Métricas top-level (apenas factos, sem interpretação):
- Total cost real: $XX.XX
- Quality means: A=0.XX, B=0.XX, C=0.XX
- Cost means: A=$0.XX, B=$0.XX, C=$0.XX
- Latency means: A=Xms, B=Xms, C=Xms

Anomalies: <X registadas> | <vazio>

Próximo passo: o Paulo volta ao Cowork e diz "benchmark terminou, branch wave1-benchmark, outputs em <path>". Cowork (Claude no Paulo's chat) faz análise pelo seu lado e gera REPORT.md.

NÃO faço merge para dev/main. NÃO interpreto resultados. Handoff puro.
```

---

## FASE 5 — Quando parar e perguntar (resumo dos triggers acima)

- Tag não existe → ABORT
- API key missing → ABORT
- Ollama down → ABORT
- Cost > $80 → PAUSE + ask
- Judge variance > 0.3 → PAUSE + ask
- Algum prompt impossível de gerar sem inventar lib → reescreve para algo verificável (não inventes)
- Discrepância material entre design e ambiente → PAUSE + ask
- Spawn de >5 subagents num turn → improvável neste contexto, mas se acontecer → PAUSE + ask
- Operação destrutiva (rm -rf, drop, reset --hard, force push) → PAUSE + ask (nunca deve precisar de nenhuma destas)

Para tudo o resto, **decide tu** e segue.

---

## Princípio último

Pre-registration é contrato. Schema é contrato. Lineage é contrato. Versão pinned é contrato.

**Não muda metodologia durante a run.** Anomalias vão para `anomalies.md`. Insights metodológicos vão para "Wave 2 benchmark roadmap" no fim, não para mudanças retroactivas.

Isto é o que torna o resultado **defensável** a quem nos vai perguntar "porque é que confio nestes números?".

Ready. Começo agora pela Fase 0 (self-prep)?

=== END ===

---

## Notas para o Paulo (não vão para Claude Code)

- **Tens 1 decisão na Fase 2** (Opção A vs B para geração dos prompts). Recomendo **B** — validas o tom de 5-6 antes de comprometer os 34, anti-bias do redactor.
- **2 ou 3 confirmações pontuais** durante a run (dry-run, cost-30, eventualmente cost-80). Tudo curto.
- **Não toques no terminal** durante a Fase E (run completa). Ele está a chamar APIs sequencialmente — interromper meio-da-run vai produzir RAW_RESULTS incompleto.
- **Quando reportar no fim**: volta a este Cowork e diz **literalmente**: *"benchmark terminou, branch wave1-benchmark, outputs em packages/router/scripts/wave1-benchmark/outputs/"*. Eu pego nos ficheiros e faço a análise.

Cost real estimado: $40-60. Time real estimado: 3-4h wall-clock (~50min run efectiva, resto é dev + judge + scaffold).
