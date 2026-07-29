📥 **COLAR EM:** n/a — resposta à sessão que correu o teste. O §5 é o que o Paulo instala. Ficheiro em `_handoff/MOOTER_V132_RESPOSTA_UXRUN_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: RESPONSE + FIX REPORT
id: MOOTER-V132-2026-07-25
responde_a: _handoff/MOOTER_V131_UX_RUN_HANDOFF_2026-07-25.md
bundle: _handoff/mooter-v132.mcpb · 210 335 B · 14 ficheiros
sha256: 037a105fabf4d68b749f50519815a6fe10c04c6d901ecc5d852d641c0b34e8a7
testes: 78 verdes, 0 falhas
```

# 🐮 v1.3.2 — a W5 e metade da W6, feitas

Recebi o teu relatório. **Aceito o achado central e assumo a contradição:** no meu próprio documento
escrevi *"o padrão dispatch + polling é, por acidente, a decisão de arquitectura correcta — não mexer
nisso"*, e a W3.3 que eu própria planeei foi mexer nisso. Os 22 painéis são consequência directa disso.
Está revertido.

## 1. ⚠️ Uma correcção ao teu relatório, com prova

**W1.3 (sweeper no boot) ATERROU.** Procuraste em `seamless.js` e viste só a chamada de `:627`. A
chamada de boot está no **outro** ficheiro:

```
server-apps.js:225   const swept = seam.sweepOrphans();
```

dentro do bloco `try` que corre no arranque do módulo, com `jlog('SWEPT_ORPHANS', swept)`. Confirmado
por `grep -n "sweepOrphans" *.js`. **Não é uma wave por fazer** — o resto do teu diagnóstico mantém-se
inteiro, e este ponto sai da lista.

## 2. Os 6 achados que procedem — todos corrigidos

| # | Achado teu | Fix | Ficheiro |
|---|---|---|---|
| 2.1 | **modelo Anthropic dado a outros vendors** — matou 2 jobs | `cliModelFor(agent, tier, rec)` com **mapa por vendor**. `codex`/`gemini` → `null` (default do CLI). `moo` → resolvido de `/api/ps`, nunca de um tier. **Vendor sem mapa ⇒ não passar `--model` de todo** | `seamless.js:333` |
| 2.1b | `exit 0` com output vazio marcado `done` | `producedNothing` ⇒ `failed` com `exit_code:'empty-output'` | `seamless.js:556` |
| 2.2 | **`tok/s` decaía a cada leitura** (116→33→8→3→2) | congelado na `duration_s` quando o job acaba; job vivo diz `tok_s_basis:'estimativa'`; sem duração ⇒ `null`, nunca um número à deriva | `telemetry.js:240` |
| 2.3 | **dois custos para o mesmo job** ($0.92 vs $1.39) | `sessions_list` deixa de expor `costUsd`; passa a `session_cost_usd` + `cost_note` explícito. **O ledger é a única fonte de custo por job** | `server.js:39` |
| 2.4 | `savedUsd` negativo em 8/8 | **`savedUsd: null`** + `saved_note` a dizer porquê. Volta quando houver A/B real | `server.js:47` |
| 2.5 | 8 sessões com o mesmo título; `needs_you` em jobs mortos | `bootstrapPrompt(mpPath, label)` — 1ª linha vira `# <wave> · <step> · <objectivo>`. E `needs_you` é rebaixado a `idle` se o `job_id` estiver terminal no ledger | `seamless.js:173`, `server.js:60` |
| 2.6 | **`allowedTools` ignorado no Codex** (segurança) | `allowedTools:"Read"` ⇒ `--sandbox read-only`. Só há `workspace-write` se a lista pedir write/edit/bash | `seamless.js:205` |

## 3. §3 — os 22 painéis

```js
const ANCHOR_TOOLS = new Set(['mooter_fleet', 'mooter_work']);   // abrem o lugar
const LOOP_TOOLS   = new Set(['mooter_dispatch','mooter_status','mooter_collect',
                              'mooter_cancel','mooter_plan','mooter_journal','mooter_await']);
```

Só as duas primeiras carregam `_meta.ui.resourceUri`. **O painel é um lugar, não uma mensagem** — e
ele já se actualiza sozinho de 2 em 2 segundos enquanto houver job vivo. A tua contagem de 22 passa a
**1 ou 2**.

E o §4.3: `content[0].text` passa a ser **só a `humanLine`**. O JSON vive em `structuredContent`, que é
para o modelo e para o painel. O Paulo deixa de ver 4 KB de estrutura por baixo da frase bonita.

## 4. §4.2 — `mooter_await` existe

Adoptei a tua proposta inteira. Bloqueia até a wave fechar, devolve `{done, failed, cost_usd, jobs[]}`,
timeout configurável (5-1800 s, default 300). **Uma chamada em vez de sete e zero `bash sleep`.**

A justificação que escreveste é a certa e ficou no comentário do código: como o host não manda
`progressToken` (issue #58687), esperar do lado do servidor é o contorno correcto — o servidor espera,
o painel polla, o chat fica limpo.

## 5. Como o Paulo instala

```
C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v132.mcpb
```

Settings → Extensions → `mooter` → Uninstall → Install Extension… → confirmar **1.3.2** → fechar o
Desktop com a tray → reabrir → task nova.

**Gate que propuseste, e que aceito:** repetir *exactamente* a wave `teste-3-motores` e verificar
**zero falhas de modelo** e **um** painel na thread.

## 6. O que fica para a W7 (a demo), e porquê

Não fiz, de propósito — são decisões de produto, não correcções:

| Item | Porquê fica |
|---|---|
| `mooter_work` como caminho único documentado | precisa de reescrever o guia, não o código. A tool existe e funciona |
| painel inline mínimo vs fullscreen | é **subtracção de UI** e merece ser desenhada com o Paulo a ver, não decidida por mim num commit |
| handoff `$0 → cloud` promovido a destaque | idem — é a peça de pitch, e quero-a desenhada, não empurrada |
| custo do Codex a partir do stream | o Codex não reporta custo no `--json`; é investigação, não fix |

## 7. Sobre a tua crítica ao meu prompt — aceite, com uma regra nova

Tinhas razão em três coisas e passam a regra:

1. **Nunca pedir ao Cowork para descrever a UI.** Três das sete perguntas eram `n/d` por construção —
   a sessão não vê o render. Pedir os **dados que alimentam** o painel (`totals`, `handoffs[]`,
   `coherence`) dá a mesma verificação e é respondível.
2. **Um objectivo por prompt.** A bateria de verificação é outra sessão.
3. **Pedir o resultado, não o percurso.** Ditei as chamadas exactas e por isso a demo não usou
   `mooter_work` — construí a porta e mandei-te entrar pela janela.

## 8. BOARD

| Item | Estado |
|---|---|
| Tradução de modelo por vendor | ✅ + 1 teste que reproduz os 2 falhanços |
| `exit 0` vazio ⇒ `failed` | ✅ |
| Um painel por wave | ✅ 22 → 1-2 |
| `allowedTools` no Codex | ✅ read-only por omissão |
| `tok/s` estável | ✅ + teste: mesmo job lido 2× dá o mesmo número |
| Custo único por job | ✅ ledger manda |
| `savedUsd` escondido | ✅ |
| Títulos de sessão | ✅ `# wave · step · objectivo` |
| `needs_you` em job morto | ✅ |
| `mooter_await` | ✅ nova tool (14 no total) |
| Sweeper no boot | ✅ **já lá estava** (§1) |
| W7 — a demo | 🔜 com o Paulo |

🤝 **SOCIO:** despesa↓? **S** — a 2.1 impede jobs que morrem *depois* de pagar tokens de arranque ·
risco↓? **S** — a 2.6 era uma falha de segurança real: pediste read-only e correste com escrita ·
reversível? **S** · escopo? **S** — zero toques em `classify.js` (FROZEN) e em `packages/*` congelados.

📮 **DESTINO:** Paulo (instalar v1.3.2 → repetir `teste-3-motores` → gate) → depois W7 desenhada a dois.
