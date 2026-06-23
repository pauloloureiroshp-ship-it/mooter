# WAVE 32.1 — Polish (statusline CLI + session timer + UX rename + nits + LoRA deps)

**Sequência:** Wave 32 v1.20.0-transparency-performance SHIPPED (`32d0c9c`) → **Wave 32.1**
**Tag esperada:** `v1.20.1-polish`
**Estimate:** ~2-3h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo

---

## Por que esta wave (a verdade nua)

Wave 32 SHIPPED 17 fases com 0-HIGH / 0-MED / 3-LOW final-reviewer. **Funcionou.** Mas a validação real de 2026-06-08 expôs 5 gaps concretos que separam "shipped" de "ready":

1. **Statusline mode é manual** — não existe CLI `mooter statusline mode <name>`. Paulo teve que editar `~/.mooter/preferences.json` à mão. Footgun directo: friends-launch vai sofrer.
2. **Session timer NÃO foi materializado** — design v3 incluía `⏱️ session 2h47m` chip, mas não shipou. Paulo perguntou explicitamente "seria interessante ter um timer de quanto tempo aquela janela da sessão está aberta".
3. **Jargon `turn` / `alltime`** — Paulo pediu rename para `this prompt` / `session` (mais claro para non-techies). Não shipou.
4. **3 LOW nits final-reviewer Wave 32** — dormant. Pequenos mas removem ruído antes Wave 33.
5. **LoRA train deps conflict** — `unsloth==2025.5.1` incompatível com `transformers<4.46 and >=4.43`. Bloqueia Wave 26.G overnight job. Paulo deferiu, mas é footgun real.

**Sem isto, friends-launch DM (Task #218) é beta-tester walking into a CLI minefield.** Doctrine: ship o polish que destrava users reais.

---

## Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ 32d0c9c` |
| Branch feature | `wave32_1-polish` |
| Tag pré-merge | ❌ NÃO criar (lição Wave 21-31) |
| Tag pós-merge | `v1.20.1-polish` apontando para main HEAD final |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) — sem mudanças hub |
| classify.js sha | `7b01eb86…87762` **INTACT obrigatório** — re-verificar pré e pós-merge |
| Wave 28-32 packages | INTOCADOS — apenas estender via novos sub-cmds |
| Doutrina | Honest > forced. Day 0 recon obrigatório. 3 LOW nits ler primeiro. |

---

## Sub-features (6 blocos, ordenados por blocking)

### 32.1.A — CLI `mooter statusline mode <name>` 🔥
**O que:** Adicionar sub-cmd que escreve `~/.mooter/preferences.json` directamente.
**Comportamento:**
```bash
mooter statusline mode              # mostra current mode + lista disponíveis
mooter statusline mode compact      # set + persist + echo "✓ statusline mode = compact"
mooter statusline mode legacy       # revert para default byte-idêntico
mooter statusline mode --help       # explica cada mode (mini/compact/full/didactic/legacy)
```
**Implementação:** sub-cmd em `packages/cli/src/commands/statusline.ts` (extensão do cmd existente, NÃO substituir).
**Validação:** smoke `mooter statusline mode compact && cat ~/.mooter/preferences.json` → confirma JSON valid.
**Tier sugerido:** T1 (Haiku) — file I/O simples, validação tight.

### 32.1.B — Session timer chip ⏱️
**O que:** Statusline chip novo `⏱️ session 2h47m` mostrando tempo desde início da sessão CC.
**Source of truth:** read `CLAUDE_PROJECT_DIR` ou stdin `transcript_path` → birth time do ficheiro JSONL → `now - birth`.
**Formatação:** `<60min` → `47m` · `<24h` → `2h47m` · `>=24h` → `2d4h`.
**Chip lives em:** linha 2 (entre `5h reset` e `turn $`) — só mode compact/full/didactic. Default legacy NÃO inclui.
**Hide cmd:** `mooter quiet --hide-session-timer`.
**Tier sugerido:** T1 (Haiku) — manipulação de strings + fs.stat.

### 32.1.C — Rename `turn`/`alltime` → `this prompt`/`session` 🔥
**O que:** Renomear strings no statusline para reduzir jargon.
**Antes:** `turn $0.09 · alltime $0.09`
**Depois:** `this prompt $0.09 · session $0.09`
**Onde:** `tools/router/statusline_line2.sh` (ou equivalente JS) + qualquer outro lugar onde `turn`/`alltime` aparece em UX (não em logs internos).
**Excepção:** dashboard widget SAVINGS já usa `turn` — actualizar para `this prompt` também.
**Tier sugerido:** T0 (Ollama) — find/replace cirúrgico, regression test em statusline modes.

### 32.1.D — Fix 3 LOW nits final-reviewer Wave 32
**O que:** Ler `final-reviewer` output do PR #XX (último PR merged main para `v1.20.0-transparency-performance`) e endereçar os 3 LOW nits.
**Day 0 recon obrigatório:** localizar os 3 nits exactos (procurar em PR comments + git log + qualquer doc Wave 32). NÃO assumir o que são — ler primeiro.
**Tier sugerido:** depende dos nits (provável T1).

### 32.1.E — LoRA train deps fix (unsloth bump)
**O que:** Resolver conflito `unsloth==2025.5.1` vs `transformers<4.46 and >=4.43`.
**Sub-tasks:**
1. Web research: qual versão actual estável de unsloth + transformers compatível (2026-06-08+)
2. Update `synthesis/scripts/train_lora.py` requirements
3. Update `requirements-lora.txt` (ou equivalent)
4. Smoke dry-run install (sem GPU): `pip install --dry-run -r requirements-lora.txt` confirma resolução
5. **NÃO executar treino** — Paulo executa overnight RTX 4090 separadamente
**Tier sugerido:** T2 (Sonnet) — dep resolution requer contexto domain.

### 32.1.F — CLI `mooter effort set <level>` + `mooter sessions list`
**O que:** 2 sub-cmds CLI faltam:
- `mooter effort set <level>`: persistir effort em preferences.json (default/ultramoo). Equivalente programático à edição manual.
- `mooter sessions list`: lista sessões CC com idade + tier breakdown.
  ```
  $ mooter sessions list
  session start              age      prompts  T0/T1/T2/T3   $ saved
  2026-06-08 02:15 (LIVE)    2h47m    23       2/3/8/10      $4.32
  2026-06-08 00:42            4h20m    12       1/2/5/4       $1.87
  2026-06-07 22:10            6h52m    45       8/12/15/10    $9.41
  ```
**Source of truth:** ficheiros `~/.claude/projects/*/sessions/*.jsonl` (birth time + JSONL line count + classify.js tier de cada line).
**Tier sugerido:** T2 (Sonnet) — file glob + parsing + table render.

---

## Ordem de execução recomendada

```
Day 0 recon (~30 min)    Honest reading do código actual statusline + preferences.json schema.
                         Localizar 3 LOW nits exactos (Phase D pré-fix).
                         Web search unsloth latest stable + transformers compat.

Day 1 (~2h)              32.1.A statusline mode CLI
                         32.1.C rename turn/alltime
                         32.1.B session timer chip
                         smoke local (no Anthropic quota burn)

Day 2 (~1h)              32.1.D fix 3 LOW nits
                         32.1.E LoRA deps fix (smoke pip dry-run)
                         32.1.F effort set + sessions list CLI

Pre-merge (~30 min)      final-reviewer Opus gate
                         PR feature → main (Wave 32 pattern: directo)
                         Tag v1.20.1-polish (DEPOIS de merge)
                         Notion sub-page sessão 2026-06-08 Wave 32.1
                         MEMORY.md update + SYNC.md update
```

---

## Checklist pré-merge

- [ ] Day 0 recon honest (sem assumir gaps; ler 3 LOW nits primeiro)
- [ ] classify.js sha `7b01eb86…87762` verificada **antes** das mudanças
- [ ] `mooter statusline mode <name>` cmd shipou + smoke OK
- [ ] Session timer chip aparece em modes compact/full/didactic, AUSENTE em legacy
- [ ] `turn` → `this prompt` e `alltime` → `session` em statusline + dashboard
- [ ] 3 LOW nits final-reviewer Wave 32 endereçados
- [ ] LoRA deps resolvem dry-run (`pip install --dry-run` exit 0)
- [ ] `mooter effort set ultramoo` persiste em preferences.json
- [ ] `mooter sessions list` lista ≥1 sessão actual com tier breakdown
- [ ] `final-reviewer` (Opus) corrido sem high severity
- [ ] classify.js sha **post-merge** ainda intacta
- [ ] Statusline budget ≤10ms preservado (re-medir após session timer chip)
- [ ] Bundle esbuild clean (< 600 KB)
- [ ] Notion sub-page criada via `mooter_notion_write` MCP
- [ ] PR feature → main mergeado
- [ ] **SÓ ENTÃO** `git tag v1.20.1-polish <main HEAD>` + push

---

## Riscos tracked

| Risco | Mitigação |
|---|---|
| Session timer break ≤10ms budget | Benchmark antes/depois; se >10ms, mover chip para statusline_line3 opt-in |
| Rename `turn`→`this prompt` quebra grep/parsing externo | Day 0 grep "turn" em todos os ficheiros — verificar uso semântico vs UX label |
| Unsloth bump quebra Wave 26.G LoRA train script já estabelecido | Dry-run only; Paulo executa real RTX 4090 separado e reporta |
| 3 LOW nits revelam mais que pequeno polish | Day 0 leitura primeiro; se nit revelar bug maior, escalar para T2 follow-up |
| Anthropic 5h quota durante session timer development | Implementação T1/T0 — Haiku/Ollama suficiente, não queima quota |

---

## O que NÃO está nesta wave (e porque)

- ❌ Default statusline flip para mode novo (Paulo deve decidir após experimentar `compact`/`full` modes — Wave 32.2 candidate baseado em feedback)
- ❌ Hardware widget (RTX 4090) novo no dashboard — já existe se terminal wide, gap é resolução terminal not feature
- ❌ Workflow widget reconfigurar — Wave 28 engine INTOCADO doctrine
- ❌ Hub changes — esta wave é CLI-only + statusline-only
- ❌ Wave 31 LORAUTER changes — sha intact doctrine
- ❌ vLLM backend changes — Wave 32 H+I produto estável
- ❌ GDPR data-rights extensions — Wave 32 NEW3 funcional

---

## Marketing diff Wave 32 → Wave 32.1

Sem changelog pessoal user-facing — esta wave é **polish técnico**, mensagem para friends-launch:

> "Polish round Wave 32.1 ships: `mooter statusline mode compact` CLI, session timer chip, clearer UX labels. No breaking changes. v1.20.1."

---

*Brief composto pós-validation Wave 32 v1.20.0 (2026-06-08 03h BRT). Day 0 recon começa próxima sessão CC — não confiar nas premissas acima sem validar com filesystem. classify.js sha intact pré-verificar.*
