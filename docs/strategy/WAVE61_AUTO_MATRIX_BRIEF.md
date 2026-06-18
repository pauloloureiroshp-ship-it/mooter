# Wave 61 — Auto-update Matrix via Artificial Analysis (Q13)

> Composto no Cowork 2026-06-14. Estimate **3-4h CC autónomo**. Tag esperada `v1.39.0-auto-matrix`
> (ou `-patch` se scope reduzido). Doctrine V4: Day-0 recon obrigatório, honest > delivery,
> `classify.js` sha `427d8c0b…` INTACTA, selective git adds.

## 1. Objectivo
Substituir a curadoria 100% manual da matriz de benchmarks por um **pull semi-automático** de
pricing + scores a partir de fontes citáveis (Artificial Analysis em primeiro lugar), mantendo o
invariante anti-fabricação §13.3: nenhum número entra sem `source_url`, `measured` e `as_of`.
**Gate humano obrigatório antes de qualquer commit de dados** (review do diff de células).

## 2. Day-0 recon (VERIFICADO esta sessão — não assumir, confirmar de novo no CC)

**`packages/router/src/benchmark-fetcher.ts` (11.282 bytes, existe):**
- Decisão **A.16** (2026-06-12): *manual curation only, no scraping, no new deps, never network.*
- 2 camadas hoje: repo seed `data/benchmark-seed-2026.json` + overrides `~/.mooter/benchmarks-overrides.json` (overrides ganham). Merge por chave `model\0category`.
- **Já tem o seam desligado**: comentário `FUTURE SCRAPING SEAM` define `_scrapeRemoteSources(sources)`, ponto de integração em `refreshBenchmarks()`, prioridade `overrides > scrape-cache > seed`, escreve `~/.mooter/benchmarks-cache.json`. **Wave 61 = activar este seam**, não reescrever o módulo.
- `BenchmarkCell`: `{ model, category, score: number|null, source, source_url, measured, confidence?, mapping_note?, as_of? }`. §13.3: score raw 0-1, `null` é o único substituto, nunca interpolar.
- ⚠️ **Finding:** o type `ModelId` ainda lista **14 modelos** — stale vs os **17** da expansão Wave 58.4. Corrigir o union (ou confirmar que `cell.model: string` o torna não-bloqueante) faz parte desta wave.

**Artificial Analysis MCP (`davidhariri/artificial-analysis-mcp` — verificado via web hoje):**
- MCP **não-oficial** para a Artificial Analysis API. 300+ modelos.
- Expõe: pricing (`price_input`/`price_output`/`price_blended`), speed (`speed` tok/s, `ttft`), benchmarks (`intelligence_index`, `coding_index`, `math_index`, `mmlu_pro`, `gpqa`), `release_date`. Filtra por provider.
- **Requer API key** (artificialanalysis.ai).
- ⚠️ **É um MCP LOCAL (npx/Glama)** → pela arquitectura confirmada esta sessão, **não corre no Cowork** (Cowork só remote connectors). Logo o pull via MCP só funciona no **Claude Code**. Alternativa sem MCP: a fetcher chama a **AA REST API directamente** (`fetch`, Node 22+) no seam — mais portável, mesma key.

**Governance ⚠️:** `benchmark-fetcher.ts` foi *adição allowlisted* na Wave 58 — mas agora é ficheiro existente. **Este brief allowlista explicitamente** modificar `packages/router/src/benchmark-fetcher.ts` (e só esse) em `packages/router/src/`. Engine restante FROZEN. `classify.js` intocável.

## 3. Scope / Non-goals
| ✅ In | ❌ Out |
|---|---|
| Activar `_scrapeRemoteSources` (AA primeiro) | HTML scraping de leaderboards (fica no seam, futuro) |
| Mapping AA coarse-index → 24 categorias Mooter (com `confidence`+`mapping_note`) | Auto-commit sem review humano |
| `mooter benchmark-update` real (vs dry-run actual) | Tocar `classify.js` ou outro engine file |
| Cron semanal OU on-demand `/mooter-refresh-matrix` | Novos modelos no roster (é decisão de routing, não de dados) |
| Corrigir `ModelId` 14→17 | Remover a camada manual (overrides continuam a ganhar) |

## 4. Arquitectura do pull
```
AA API/MCP ──pull──▶ normalizar ──map──▶ BenchmarkCell[] (measured=true, source_url, as_of)
                                            │
       seed (repo) ◀──── merge prioridade: overrides > scrape-cache > seed
   overrides (user) ◀────┘            escreve ~/.mooter/benchmarks-cache.json (NÃO overrides)
                                            │
                                   GATE HUMANO: diff de células ▶ aprovar ▶ commit seed
```
**Mapping AA→Mooter (o problema real):** AA dá índices grossos (`coding_index`, `intelligence_index`…); Mooter tem 24 categorias finas (`coding.frontend`, `reasoning.math`…). Cada mapeamento leva `confidence` (`high`/`medium`/`low`) + `mapping_note` citando que índice AA serviu de proxy. Onde não há proxy honesto → `score: null` (qualitativo), nunca inventar.

## 5. Invariantes anti-fabricação (§13.3 — CI-relevante)
- Toda célula nova: `measured: true` só com `source_url` AA real + `as_of` (data do pull).
- Proxy de categoria → `confidence` + `mapping_note` obrigatórios.
- Sem número honesto → `score: null`. **Nunca interpolar.**
- `pricing` (se entrar na matriz) é raw AA blended, com `as_of`.

## 6. Fases (atómicas, cada uma testada)
1. **Day-0 recon CC** — reconfirmar seam, `ModelId` stale, decidir MCP-vs-REST (recomendo REST: portável, sem dep de MCP local).
2. **Fetcher: REST client** — `_fetchArtificialAnalysis(apiKey)` no seam; env `MOOTER_AA_API_KEY`; degrada offline (sem key → no-op, mantém manual).
3. **Mapping layer** — tabela AA-index → 24 categorias com confidence; testes de que cada cell carrega `source_url`+`as_of`+`measured`.
4. **`ModelId` 14→17** — sincronizar union com o roster Wave 58.4.
5. **`mooter benchmark-update`** — passa de dry-run a pull real → escreve `benchmarks-cache.json`; `--dry-run` mantém o comportamento actual.
6. **Gate humano** — `mooter benchmark-update --review` imprime diff (added/changed cells) e **não** escreve no seed sem `--apply`.
7. **Cadence** — `/mooter-refresh-matrix` slash (on-demand) + opção cron semanal (DRY-RUN por default, nunca muta sem `--apply`).
8. **Docs** — actualizar `docs/strategy/BENCHMARK_SOURCES_2026.md` (fonte AA + mapping table) e `A.16` → `A.16.1` (seam activado).

## 7. Gates de ship
- `classify.js` sha `427d8c0b…` INTACTA (pré+pós).
- `packages/cli && npm test` verde · `packages/router && npm test` verde.
- Selective add: só `benchmark-fetcher.ts` (+ cli command/tests + data/docs). Engine restante intocado.
- `npm audit` 0 (não regredir Wave 58.5).
- final-reviewer Opus SHIP gate antes do merge.

## 8. Open questions (refutar no Day-0 do CC)
- AA API tem rate-limit / custo por call? (verificar antes de cron semanal).
- A AA cobre os modelos do roster Mooter (`claude-fable-5`, `qwen3-30b` local, `minimax`)? Os que não cobrir → ficam manual, documentado.
- `pricing` deve viver na matriz de benchmarks ou no `pricing.js` SSOT existente? (provável: pricing fica no SSOT, benchmarks só scores — evitar duplicação).

## 9. Por que não no Cowork
AA MCP é local → indisponível no Cowork. E o pull real escreve ficheiros + precisa de key + push. Tudo isto vive no **Claude Code**. O Cowork compõe o brief (isto) e revê diffs; o CC executa.

## 10. Hygiene follow-ups herdados (do ship Wave 58.5/58.4.1, 2026-06-14)
Descobertos durante o ship. Resolvê-los aqui faz sentido (todos tocam roster/cobertura) — **mas allowlist explícito + decisão de denominador primeiro.**
- **Trio stale-14** (a expansão Wave 58.4 14→17 modelos não foi acompanhada):
  1. `LOGICAL_CELLS = 14 * 24` (= 336) em `packages/cli/src/commands/cost-perf.ts` linhas **433-434**.
  2. Texto de usage "336 logical cells" na linha **286** do mesmo ficheiro.
  3. Type `ModelId` (lista 14 modelos) em `packages/router/src/benchmark-fetcher.ts`.
  → **Decisão de denominador: 408 (17×24), CONFIRMADO.** A statusline já mostra `Matrix: 17 mod × 24 cat · 14/408 measured`; o `cost-perf.ts` a 336 é o único outlier. Ou seja o denominador é o **roster (17)**, não os modelos-com-dados (14). Corrigir as 3 spots + o teste `cost-perf.test.ts` (336→408, que o ship β deixou de fora de propósito por exigir este source-fix).
  ⚠️ É **mudança de comportamento** (a % de cobertura muda) → tratar como tal, com nota no commit.
- **Gap CI:** `packages/cli` não tem job de teste no CI (`test.yml` é router-only) — por isso o trio stale-14 passou despercebido. Adicionar `cli-test` ao `test.yml` (candidato a fazer ANTES, para a Wave 61 ter rede).
- ✅ **Divergência `install.sh` — RESOLVIDA (Wave 58.6, PR #175, main @ `823c037`):** `landing/public/install.sh` espelhado ao root, CI `fresh install builds` verde. Já não é dívida desta wave.

---
**Fontes (web, 2026-06-14):**
- Artificial Analysis MCP — github.com/davidhariri/artificial-analysis-mcp · glama.ai/mcp/servers/@davidhariri/artificial-analysis-mcp
- Recon local: `packages/router/src/benchmark-fetcher.ts` (seam A.16, linhas 15-23 + 293-321)
