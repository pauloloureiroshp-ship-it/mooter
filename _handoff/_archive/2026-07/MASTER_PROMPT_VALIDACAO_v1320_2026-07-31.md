# MASTER PROMPT — VALIDAR A v1.32.0 E RETOMAR A WAVE J
> 📥 COLAR EM: sessão **FRESCA** do Cowork, **depois de reiniciar o Claude Desktop**, pasta `~/frugal` montada.
> Modelo sugerido: **Sonnet** para conduzir (o raciocínio caro acontece dentro dos jobs).
> Abre em Opus só quando chegares a um gate ou a um confronto.

---

## QUEM ÉS

Sócio técnico do Paulo (não-dev). Conduzes; o Codex implementa; o moo prepara a $0; o git que escreve
corre nativo por `.bat`. Advogado do diabo permanente: confronta antes de aceitar, nunca inventes
números — "não está claro, verifica em X". PT-BR na conversa, inglês no código. Tabelas > prosa.
Blocos prontos-a-colar abrem com `📥 COLAR EM:`. **Todo veredicto exige artefacto.**

---

## O QUE ACONTECEU ANTES DESTA SESSÃO (2026-07-31)

Conector **v1.29.1 → v1.32.0** instalado (41/41 ficheiros, backup em `~/.mooter/backup-1.29.1-1785495984716`).
Commit `a157c09` em `main`. Bundle `_handoff/mooter-v1320.mcpb`, sha256 `73157b78…bf58`, 44 ficheiros.

**Documentos de contexto** (lê o índice, não o corpo todo):

| Ficheiro | O que traz |
|---|---|
| `_handoff/WAVE_J_DIAGNOSTICO_2026-07-31.md` | 15 claims do master prompt anterior verificados contra o disco |
| `_handoff/WAVE_J_BATERIA_E_PLANO_2026-07-31.md` | bateria multi-LLM medida + 6 loop holes + concorrência |
| `_handoff/WAVE_J_ADVOGADO_DO_DIABO_2026-07-31.md` | 15 perguntas do Paulo respondidas com medições |
| `_handoff/WAVE_J0_ENTREGA_OPUS_2026-07-31.md` | o que a v1.32.0 mudou e quanto vale |
| `_handoff/patches/J0-LOG.txt` | log do commit e do empacotamento |

---

## FASE V · VALIDAR A v1.32.0 (fazer primeiro, ~30 min)

O que se segue foi medido em bancada com `node --test`, **nunca no conector instalado**.
Validar é confirmar que o que passou nos testes se comporta igual em produção.

### V1 — o conector arranca e é a versão certa
```
mooter_setup({ primeira_vez: true })
mooter_setup({ atualizar: "ver" })
```
✅ esperado: `versao_instalada: "1.32.0"` · diagnóstico sem vermelhos novos.
⛔ se o conector não responder: o Desktop não foi reiniciado, ou o bundle partiu algo.
Reverter com `mooter_setup({ atualizar: "reverter" })` e dizer ao Paulo.

### V2 — a dieta de payload (a medição central)
```
mooter_fleet({ view: "recibo" })
mooter_fleet({ view: "recibo", verbose: true })
```
Mede os dois payloads. **Baseline de hoje: recibo ≈ 11 KB com 7 dos 8 blocos de cargo vazios.**
✅ esperado: redução ≥ 40%; cada cargo parado traz `sem_trabalho: true` e continua a dizer zero e porquê.
⚠️ **A verificação que importa mais que o tamanho:** confirma que as **excepções de cargos sem trabalho
NÃO desapareceram**. Hoje MOO, MTO, MFO e MEO estavam todos fora da faixa *e* sem trabalho. Se alguma
excepção sumiu, a dieta comeu um facto — é NO-GO e reverte-se.

```
mooter_fleet({ view: "jobs" })
```
✅ esperado: o goal aparece cortado com `resumo` + `goal_chars`, **não 4 vezes por extenso**.
Baseline: ~40 KB, com um goal de ~2 900 caracteres repetido 4×.

### V3 — o schema destravado (as duas linhas que valiam uma wave)
```
mooter_setup({ sessao: "registar", id: "mooter", projecto: "Mooter",
               feito: ["v1.32.0 instalada"], proximo: "validar a dieta" })
mooter_setup({ sessao: "listar" })
```
✅ esperado: `listar` devolve a entrada `mooter`. Antes só existia o slot `actual`.
Se aceitar, regista também um `id` diferente e confirma que ficam **dois** estados.

Handoff em direcção nova (o que o Maestro não consegue, por não ter GPU):
```
mooter_work({ goal: "...", agent: "codex", wave: "V3" })     → guarda o job_id
mooter_work({ goal: "verifica o resultado anterior e diz se procede",
              agent: "moo", handoff_from: "<job_id>", wave: "V3" })
```
✅ esperado: o segundo job aceita `handoff_from`, o painel desenha a seta, e a verificação sai a **$0**.
⛔ se o schema recusar `handoff_from`, a entrega não chegou ao bundle.

### V4 — o recibo com contexto e o advogado do diabo
```
mooter_fleet({ view: "recibo" })
```
Procura o bloco `contexto`. ✅ esperado: `onde` (projecto, pastas, waves), `antes`, `registado_no_vault`,
`advogado_do_diabo` (perguntas com `facto` e `porque_importa`), `proximos_passos`.
⚠️ **Cada pergunta tem de trazer o facto que a fez nascer.** Uma pergunta sem facto é alucinação com ar
de rigor — se aparecer alguma assim, é bug.
Confirma que o que o conector não sabe (conversa do host, PRs, snapshot pré-tarefa) sai **n/d com motivo**.

### V5 — nada regrediu
Uma bateria curta com resposta conhecida, um job por motor (`moo`, `kimi`, `codex`), e comparar com
a linha de base de hoje:

| Braço | Baseline 31/07 |
|---|---|
| moo local | 182 s · **$0** · resposta certa |
| kimi | 117 s · ≈$0,065 · resposta certa e mais profunda |
| kimi sem contexto | 24 s · recusou honestamente — **e o Mooter carimbou "🐮 feito"** |

⚠️ O terceiro braço é o teste que interessa: **se ainda disser "🐮 feito" sobre uma recusa, o bug
continua vivo** (é um dos dois vermelhos abertos — ver P5 abaixo).

**Entregável da Fase V:** `_handoff/WAVE_J_VALIDACAO_v1320_<data>.md` — tabela medido vs baseline,
com o payload em KB antes/depois e o veredicto GO / NO-GO.

---

## PENDÊNCIAS — nada disto está feito

### 🔴 P1 · Aplicar os 3 patches do Codex (fazer antes de tudo o resto)
90 KB de trabalho salvo de worktrees que estavam `prunable`. Estão em `_handoff/patches/`:

| Patch | Bytes | Toca em |
|---|---:|---|
| `J-1-regua.patch` | 30 126 | `afericao.js`, `aprender.js`, `seamless.js` + testes |
| `J-2-3-contrato.patch` | 47 528 | `seamless.js`, `tools6.js`, `worktrees.js` + testes |
| `J-4-verify.patch` | 12 239 | `fosso.js`, `moo.js`, `seamless.js`, `vram.test.js` |

⚠️ Os três tocam em `seamless.js` — **vão colidir**. Aplica um de cada vez, corre os testes entre cada
um, e resolve conflitos à mão. **Auditoria adversarial cega por motor diferente do produtor antes de
qualquer merge** — três falsos-verdes já foram pagos este mês.
O J-1 calculou o custo do kimi em **US$ 0,065091**; bate com a estimativa independente de ≈$0,065.

### 🔴 P2 · Libertar a GPU (causa-raiz de 3 loop holes)
`qwen3.6:27b` ocupa **16,2 GB** de uma 4090 e fica residente (`keep_alive` 10m). Sobram **1 653 MB**;
a folga mínima exigida é 2,2 GB. Consequências medidas: `cross_check` pede 22,3 GB e **nunca correu**;
`prep_timeout` em 3 de 3 jobs; downgrade forçado do modelo.
O patch J-4 do Codex ataca isto — validar se resolve, e rever o `keep_alive`.
**É o único diferencial que o Maestro não pode copiar: verificação a $0.**

### 🔴 P3 · Prep em paralelo, não em série
`prep_duration_s: 20.0` · `prep_chars: 43` · `tokens_poupados_estimados: 0`, três vezes seguidas.
Ou corre em paralelo com o job pago, ou desliga-se. Em série é latência pura.

### 🔴 P4 · Arrumar o repo — com CI que force
| Item | Medido | Regra que existe e é ignorada |
|---|---|---|
| `SYNC.md` | **3 438 linhas** (~97k tokens) | `AGENTS.md:212,225` — "~200 lines" |
| `.md` no topo de `_handoff/` | **216** (34 MB) | `AGENTS.md:209` — "Never leave executed masterprompts at top level" |
| Ficheiros na raiz | **103**, dos quais **60 são `RUN-*.bat`** | `CLAUDE.md` só cobre `.md` |
| `.mooter/worktrees/onda54-…-snapshot/` | duplica `docs/` e `packages/` byte-a-byte | — |
| `SYNC_ARCHIVE_2026.md` | 99,1% contido no `_2026H1.md` (~92k tokens redundantes) | — |
| Lixo | ficheiro `1.29` (0 B) e outro cujo nome é um path Windows | — |

⚠️ **Não voltes a escrever a regra. Escreve o teste que a força** — foi ignorada 4 vezes.

### 🔴 P5 · Os dois vermelhos do `estranho.test.js`
Comitados de propósito. Não são regressões nossas:
1. `mooter_work` não devolve o estado do router
2. `toolAwait` não constrói resumo → **o wrapper põe "🐮 feito" por omissão** — é o loop hole medido hoje

O patch J-2+J-3 do Codex ataca o (2). Validar.

### 🟡 P6 · Honestidade pública (F0)
| Superfície | Diz | Realidade |
|---|---|---|
| mooter.ai header | **v1.44.0** | produto em **1.32.0** |
| mooter.ai | "🧩 LoRA / **DoRA** — adapter layers… trained overnight" | `grep -i dora` no produto = **0** |
| mooter.ai (5×) | "47% across the author's moos" **e** "across 7 moos" | duas proveniências para o mesmo número |
| git | tag **v1.30.0 órfã** (nada no repo está em 1.30.0) | — |
| `ci-validate-manifest.js` | existe | **não está em nenhum workflow**; se corresse, falhava |
| `.github/workflows/test.yml:230` | `cli-test` em `ubuntu-latest` | **o CI nunca vê as 15 falhas Windows** |
| gate de empacotamento | `"n/d verificações de conteúdo OK"` | um gate que não sabe quantas verificações fez |

### 🟡 P7 · A skill que lê as sessões (a peça no lado certo da fronteira)
O servidor MCP **não** vê as conversas do Cowork. Mas o assistente vê: `session_info.list_sessions`
devolveu **1 748 sessões** com id, título, estado e cwd, e `read_transcript` lê qualquer uma.
Uma skill que corra ao fecho e escreva no vault o que aconteceu em cada chat resolve a proveniência
**sem tocar no conector**. O `fecho-do-dia-mooter` (cron `0 19 * * *`, activo) já é o sítio.

### 🟡 P8 · A corporação
`cowork-loop-evaluator` — governador HOTL, consumidor de `NEEDS_DECISION.json` — está **DISABLED desde
06/07**. É a peça central da autonomia, construída e parada. `sentinela.js` continua sem ser invocada
por runtime nenhum (só testes).

### 🟡 P9 · Multi-projeto
O marcador de repo é `tools/router/classify.js` — ficheiro exclusivo do frugal. Fallbacks hardcoded
`~/frugal`. `MOOTER_REPO` é global e lido uma vez no arranque. `mooter_setup({project})` é só um rótulo.
Agora que `sessao.id` existe, há por onde começar.

### 🟡 P10 · Higiene
249 untracked · **10 stashes** (o mais antigo de 03/07) · `arvore.test.js` não devolve resultado em 40 s
(não foi tocado; por verificar) · `_handoff/*.bat` está no `.gitignore`.

### ⚪ P11 · Decisões de sócio, por tomar
1. **Mem0 (52k ⭐)** já resolve memória persistente para agentes. A J-1 está a construir do zero.
   Construir ou integrar? Construir só se a memória for o fosso.
2. **Posicionamento escolhido: "T0 real — a GPU que já pagaste".** Maestro é explicitamente *no GPU*,
   Fugu é pool de frontier. Obriga a: P2 resolvido, e a fatia de trabalho local a subir dos **33%** de hoje.
3. **A sessão-espelho (Fase 0)** — tarefa escolhida: `install-id → ledger`. Medir com
   **intervenções humanas por entrega** no plano, senão o Cowork perde por medir só tempo e custo.

---

## MÉTODO

- Routing medido hoje: leitura/auditoria de 1 ficheiro → **moo** ($0) · análise profunda com pressa →
  **kimi** (35% mais rápido, ≈$0,065) · escrita → **codex** · arbitragem/gates → **cc/Cowork**.
- Verificação **sempre por motor diferente do produtor**.
- Git que escreve = `.bat` nativo (limpar `index.lock` → `add` selectivo → commit → log). Nunca `git add -A`.
- `.ps1`/`.bat` em ASCII puro, sem BOM. `classify.js` FROZEN. Sem `.md` novos na raiz.
- Fecha cada bloco com: artefacto + SYNC + memória por gotcha novo.

## DEFINIÇÃO DE FEITO DESTA SESSÃO

**A v1.32.0 está validada em produção com números ao lado do baseline de 31/07; os 3 patches do Codex
estão aplicados, auditados por motor diferente e verdes; e a GPU foi libertada ao ponto de o
`cross_check` correr pelo menos uma vez.** O que sobrar entra na wave seguinte.
