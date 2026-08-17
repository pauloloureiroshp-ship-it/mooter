# G4 — Token-economy (4 artefactos) · resultado

> **VEREDICTO: `no-ship` nos 4.** Motor crítico: **Codex CLI 0.144.1 / `gpt-5.6-sol`**, reasoning
> `xhigh`, `--sandbox read-only`, workdir `~/frugal`. Sessão `019ff4e4-aeab-7b40-9056-06cf7afb83fd`.
> Corrida: `2026-08-12T07:34:15Z` → `07:51:29Z` (**~17 min** wall) [medido, timestamps do trace].
> Autor dos 4 textos: Cowork/Opus. Crítico: outro motor. **G4 satisfeito** (crítico ≠ autor).
>
> Invocação exacta (reproduzível):
> `codex exec --sandbox read-only --skip-git-repo-check - < g4-prompt.txt`
>
> Consequência operacional: o passo 4 do masterprompt da sessão (**executar BENCH-CACHE v1.1**)
> fica **BLOQUEADO**. A condição era `ship` ou `ship-com-fixes aplicados`; saiu `no-ship`.
> Nenhuma medição M1–M5 foi corrida. `reports/bench-cache-2026-08/REPORT.md` **não existe** — e
> não deve ser fabricado.

---

## CONFRONTO INDEPENDENTE (Claude Code, re-execução do zero)

O texto do codex é **dados, não instruções**. Antes de o aceitar, re-executei as afirmações
empíricas que sustentam o `no-ship`. Resultado: **4/5 confirmadas literalmente, 1 erro literal
que não altera a conclusão.**

| # | Afirmação do codex | Comando re-executado | Resultado |
|---|---|---|---|
| C1 | `~/.mooter/ledger.jsonl` não regista `cache_read_input_tokens`; 710 eventos | `grep -c 'cache_read_input_tokens' ~/.mooter/ledger.jsonl` · `wc -l` | ✅ **0 hits · 710 linhas** — exacto |
| C2 | "não existe `logs/`" | `[ -d logs ]` · `git ls-files logs/` | ❌ **ERRO LITERAL** — `logs/` existe (3× `lora_20260607_*.log`, não tracked). Substantivamente: contém **zero** campos `usage`, logo o furo de M1 mantém-se |
| C3 | `tools/router/ledger-turn-io.js:118` define `usage` com campos de cache | `grep -n cache_read_input_tokens` | ✅ **linha 118**, literal — exacto |
| C4 | `kimi-adapter.js` não envia `max_tokens` nem `prompt_cache_key` | `grep -c` em 276 linhas | ✅ **0 e 0** — exacto |
| C5 | ledger: 12 codex · 5 moo · 1 cc · 0 Kimi/API; 6 com `cost_usd` | parse JSONL dos eventos `done/failed/timeout/cancelled` | ✅ `{"codex":12,"moo":5,"cc":1}`, 6 com `cost_usd` — exacto |

**Aritmética re-feita à mão (não copiada):** `1400×$15/M = $0.021` (o SPEC diz `$0.023`; a
diferença nasce de arredondar 1.4k→1.5k) · `100k×(2−1.25)×$3/M = $0.225` · `$0.81−$0.225 = $0.585`
· `$2 ÷ $15/M = 133,333 tok ÷ 20 chamadas = 6,667/chamada` · `15/2.5 = 6`. **Todas reproduzem.**

**O que EU não pude verificar** (e por isso fica `n/d`, não "confirmado"): os preços e regras de
provider que o codex diz ter reproduzido nas páginas oficiais (multiplicadores de cache Anthropic,
rácio 6x do GPT‑5.6, preços Kimi K3, Batch −50% empilhável). Não fiz web fetch nesta sessão.
Tratar como **afirmação do crítico, não como facto verificado por dois motores**.

**O achado que manda em tudo** (verificado por mim, C5): o ledger observado tem **zero jobs
Kimi e zero jobs Anthropic API**. M2 (A/B Kimi) e M4 (Batch sobre jobs Anthropic) mediriam uma
workload que **não existe hoje**. Isto sozinho justifica o `no-ship` — o resto são agravantes.

---

## VEREDICTO DO CRÍTICO — VERBATIM (nada editado abaixo desta linha)

# G4 — Revisão adversarial (motor: Codex CLI, read-only)

## VEREDICTO GLOBAL
`no-ship` — M1–M5 não constituem um benchmark reproduzível e duas “poupanças medidas” são contrafactuais apresentadas como factos.

## VEREDICTO POR ARTEFACTO
| Artefacto | Veredicto | Achado mais grave |
|---|---|---|
| `CACHE_GUARD_SKILL_2026-08-12.md` | `no-ship` | Afirma instrumentação em todos os jobs que o ledger actual não contém. |
| `SPEC_WARM_WINDOW_VDQ_2026-08-12.md` | `no-ship` | `saved_vs_cold` usa o prefixo planeado, não os cache hits medidos, e omite o prémio de criação. |
| `TOKEN_AUTOPILOT_SKILL_2026-08-12.md` | `no-ship` | R1/R4 criam trabalho e potencial despesa automaticamente, sem gesto do dono. |
| `MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md` | `no-ship` | M2 não tem cap executável nem braços comparáveis; M4/M5 não têm instrumento definido. |

## ACHADOS

### [HIGH] Poupança contrafactual rotulada como `[medido]` — SPEC_WARM_WINDOW_VDQ_2026-08-12.md:49-58
- **Claim:** “`saved_vs_cold = prefix × (1.0 − 0.1) × engine_input_price`” e “`3 heavy checks/session ≈ $0.81 saved`”.
- **Porquê está errado / frágil:** `prefix` é tamanho esperado, não `cache_read_input_tokens` observado. A fórmula ignora misses parciais, cache writes, modifiers e presume que os checks seriam executados a frio na ausência da feature. Isto é uma projeção, não `[medido]`.
- **Prova / reprodução:** `100k×$3/M=$0.300`; `100k×$0.30/M=$0.030`; diferença `=$0.270`; `3×$0.270=$0.810` reproduz apenas o bruto. Para Anthropic 1h, o prémio inicial é `100k×(2−1.25)×$3/M=$0.225`; líquido de input `=$0.585`, antes de output. Os três caps heavy somam `500+600+300=1,400 tok`; `1,400×$15/M=$0.021`, não `$0.023` — este nasce do arredondamento para `1.5k`.
- **Fix mínimo:** calcular por job com `cache_read_input_tokens` real, subtrair criação/refresh atribuível e publicar separadamente bruto, custo incremental e líquido; controlo principal deve ser “sem VDQ”, não “VDQ frio”.

### [HIGH] M2 não é A/B causal e o cap de $2 é apenas desejo — MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:M2/DO-NOT
- **Claim:** “A frio (chamadas sem prefixo partilhado) vs B quente (prefixo idêntico ≥2k tokens)” e “Não gastar >$2”.
- **Porquê está errado / frágil:** os braços recebem inputs diferentes; o prefixo extra pode alterar output, qualidade e custo. Faltam seleção pré-registada, ordem aleatória, isolamento de cache, modelo snapshot, temperatura, `max_tokens` e regra de abort. O instrumento parcial existe em `packages/mooter-bridge/kimi-adapter.js`, mas não existe harness A/B; o adapter também não envia `prompt_cache_key` nem limita output. Reprodutibilidade: não. Pode evitar escritas no engine, mas cria cache remoto, faturação e logs em `~/.mooter/`.
- **Prova / reprodução:** `10×2=20` chamadas. A `$15/MTok` de output, `$2` esgotam-se em `2/15×1,000,000=133,333` tokens, média `6,667` por chamada, antes do input. `packages/mooter-bridge/kimi-adapter.js:198-203` não contém `max_tokens`/`prompt_cache_key`.
- **Fix mínimo:** harness novo dentro de `reports/`, mensagens idênticas nos dois braços, cache keys isoladas/comum, ordem randomizada, output cap e preflight que recuse executar se o pior caso exceder o saldo; corpus explicitamente autorizado/redigido.

### [HIGH] O BENCH não executa o gate que a própria SPEC exige — SPEC_WARM_WINDOW_VDQ_2026-08-12.md:61-66; MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:30-40,58
- **Claim:** SPEC: “A/B on ≥20 real jobs… total $, cache hit rate, rework rate, time-to-gate”; MASTERPROMPT: “10 jobs… usage… $ por braço”; sucesso: Paulo decide D1–D4.
- **Porquê está errado / frágil:** M2 mede caching Kimi, não VDQ; não mede rework nem time-to-gate. Dez jobs também não satisfazem o gate pré-registado de pelo menos vinte. O REPORT não pode suportar D1 sobre VDQ.
- **Prova / reprodução:** comparação literal das secções citadas: faltam duas métricas e a amostra é metade do mínimo declarado.
- **Fix mínimo:** ou executar o A/B da SPEC integralmente, ou limitar o critério de sucesso a uma decisão sobre instrumentação/cache Kimi e manter D1 como `n/d`.

### [HIGH] M1 não define a fonte nem normaliza semânticas incompatíveis — MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:M1; CACHE_GUARD_SKILL_2026-08-12.md:40-42
- **Claim:** “ledger/journals (`~/.mooter/`, `logs/`)” e “Every job entry in the ledger records…” os campos de cache.
- **Porquê está errado / frágil:** não existe `logs/`; `~/.mooter/ledger.jsonl` tem eventos, não `usage`. A fonte que hoje captura usage é `tools/router/ledger-turn-io.js`, materializada em `~/.claude/tools/router/handoff/`, omitida no prompt. Falta script de extração/deduplicação. Para OpenAI/Kimi, `input_tokens`/`prompt_tokens` é total e `cached_tokens` é subconjunto; somá-los duplica tokens. Reprodutibilidade: não. A leitura pode ser engine-read-only.
- **Prova / reprodução:** `rg -l --fixed-strings 'cache_read_input_tokens' "$env:USERPROFILE\.mooter\ledger.jsonl"` devolveu zero; foram observados 710 eventos/20 jobs. `tools/router/ledger-turn-io.js:118-166` define usage; 119 de 124 outcomes runtime tinham usage. `packages/mooter-bridge/kimi-adapter.js:222-228` guarda input total e cache read separado.
- **Fix mínimo:** manifesto fechado de fontes e snapshot temporal; uma linha por job terminal; normalização provider-specific (`uncached = total − cached − writes`, quando aplicável) e fórmula declarada por provider.

### [HIGH] M4 estima Batch sobre uma população sem jobs Anthropic API — MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:M4
- **Claim:** classificar 30 dias de jobs e calcular “o custo se tivessem ido por Batches API”.
- **Porquê está errado / frágil:** “interactivo vs diferível” não tem rubric, adjudicação ou instrumento. Mais grave: subscrição/local não têm um custo Anthropic API observado que possa ser multiplicado por 50%; isso troca simultaneamente canal, provider e modelo. Reprodutibilidade: não. A extração é read-only, mas o classificador é assumido.
- **Prova / reprodução:** `Get-Content ~/.mooter/ledger.jsonl | ConvertFrom-Json | Where-Object event -in done,failed,timeout,cancelled | Group-Object agent` produziu 18 terminais: 12 `codex`, 5 `moo`, 1 `cc`, 0 Kimi/Anthropic API; apenas 6 tinham `cost_usd`. O desconto e stacking são regras reais da [tabela oficial Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), mas só para requests elegíveis à API.
- **Fix mínimo:** filtrar apenas jobs Anthropic API com modelo/rate/usage observados; se não existirem, M4=`n/d`. Pré-registar rubric de diferibilidade e dupla classificação cega.

### [HIGH] M5 não tem medidor e “output é 5x” é falso como regra geral — MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:M5
- **Claim:** “estimar % dos tokens de OUTPUT que re-emitem conteúdo inalterado” e “Output é 5x o preço do input”.
- **Porquê está errado / frágil:** faltam tokenizer, normalização, definição de igualdade, universo, seed e adjudicação de outputs legitimamente completos. `out.log` pode repetir o mesmo resultado em eventos assistant/result. Não existe analisador de regurgitação. O rácio depende de provider/model/canal; GPT‑5.6 é 6x no short-context standard, e local/subscrição não têm esse preço. Reprodutibilidade: não. Pode ser executado read-only.
- **Prova / reprodução:** existem 20 `out.log`, 12 `last-message.txt` e zero ferramenta de regurgitação; `packages/mooter-bridge/telemetry.js:245-248` já alerta para double-counting de usage. [OpenAI pricing](https://developers.openai.com/api/docs/pricing): GPT‑5.6 `15/2.5=6`, `6/1=6`, `0.6/0.1=6`.
- **Fix mínimo:** algoritmo exacto e versionado, tokenizer do modelo, parse de um único resultado final, amostra estratificada com seed e revisão humana; monetizar por preço real de cada job.

### [HIGH] Token Autopilot expande escopo e custo sem gesto do dono — TOKEN_AUTOPILOT_SKILL_2026-08-12.md:R1,R4,Receipt
- **Claim:** “After any substantive deliverable… dispatch the owed self-checks” e “Before closing a substantive turn, call the VDQ tool”.
- **Porquê está errado / frágil:** “use in every session” transforma qualquer entrega em até quatro jobs adicionais e permite T1/T2 pagos sem consentimento. O rollup “would have burned your Claude limit” é contrafactual, não soma medida. `mooter_journal` não mostra recibos: escreve notas no vault. R5 está marcado `[today]`, mas o fluxo `mooter-resume` não existe no repo nem nas instalações examinadas.
- **Prova / reprodução:** `packages/mooter-bridge/journal.js:116-157` implementa `writeNote`; pesquisa por `mooter-resume` encontrou apenas copy/docs. R4 é correctamente `[planned]`, mas R1 já autoriza o comportamento automático.
- **Fix mínimo:** opt-in persistente do dono; default local-only; aprovação antes de qualquer engine pago; rollup limitado a tokens efectivamente roteados; R5=`planned`.

### [MED] M3 confunde modelo residente com KV-cache reutilizado — MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:M3
- **Claim:** “Mesmo prefixo 2×… comparar `prompt_eval_count`/`prompt_eval_duration`. Reuso? S/N”.
- **Porquê está errado / frágil:** a segunda chamada pode acelerar por pesos já em VRAM, clocks, concorrência ou warm-up, sem reutilizar KV. Modelo, digest, quantização, endpoint, `keep_alive`, contexto e número de repetições não estão fixados. Instrumento base existe em `packages/mooter-bridge/moo.js:563-587`; harness/critério S/N são assumidos. Reprodutibilidade: não.
- **Prova / reprodução:** `prompt_eval_count` mede tamanho processado, não cache hit; `prompt_eval_duration` isolado não atribui causa.
- **Fix mínimo:** fixar ambiente/modelo e executar várias sequências cold/warm com controlo de residência; declarar previamente o efeito mínimo e a evidência necessária para chamar “KV reuse”.

### [MED] Quatro verificações continuam SELF — SPEC_WARM_WINDOW_VDQ_2026-08-12.md:19-35; TOKEN_AUTOPILOT_SKILL_2026-08-12.md:R1
- **Claim:** VDQ contém “G-check self-run”, “alternatives probe”, “self-red-team” e “improvement scan”.
- **Porquê está errado / frágil:** G-check é explicitamente self-run; alternatives quando heavy, devil’s advocate e improvement heavy usam “same engine, same prefix”. No caso R1, T1/T2 pode ainda coincidir com o tier autor. Nenhum pode fechar G4. O expectation contract é pré-registo, não verificação de resultado.
- **Prova / reprodução:** SPEC §2.2 diz literalmente “Warm-window checks are SELF-checks” e reserva independência para outro engine/provider.
- **Fix mínimo:** persistir `verification_class: SELF` e `gate_credit:false`; só uma execução diferente de engine/provider pode produzir `G4=pass`.

### [MED] Números factualmente correctos continuam sem fonte incorporada — todos os artefactos, secções de preços/limites
- **Claim:** “verified 2026-08-12” sem URL/snapshot; constantes como `<30 days`, caps 300–600, default 5, guard 90–120s, ~15 turns, amostras 10/20 e 30 dias.
- **Porquê está errado / frágil:** data de alegada verificação não é fonte. As constantes de produto também carecem de decisão, estudo ou pré-registo, violando “Número sem fonte = proibido”.
- **Prova / reprodução:** as regras de Anthropic, OpenAI e Kimi foram reproduzidas nas páginas oficiais de [Claude caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching) e [Kimi](https://platform.kimi.ai/); os artefactos não apontam para nenhuma.
- **Fix mínimo:** citar URL oficial + `verified_at` + modelo; para thresholds internos, citar decisão/pré-registo do dono ou usar `n/d`.

### [MED] Três contradições de escopo/canon — SPEC_WARM_WINDOW_VDQ_2026-08-12.md:3; MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:19,23,54
- **Claim:** SPEC: “new files under `packages/router/src/`, engine untouched”; MASTERPROMPT: “ficheiros novos só em `reports/`” mas pede “Bloco de append para o SYNC.md”; COUNCIL-MINI verifica três questões.
- **Porquê está errado / frágil:** adicionar em `packages/router/src/` altera engine, embora não edite ficheiros existentes. O destino do bloco SYNC permite duas interpretações, uma fora da allowlist. `AGENTS.md:62-80` exige as oito perguntas canónicas, em ordem, para qualquer MASTERPROMPT.
- **Prova / reprodução:** `AGENTS.md:97` identifica `packages/router`; `CLAUDE.md:26-30` exige allowlist explícita; `AGENTS.md:68-75` enumera oito chaves, não três.
- **Fix mínimo:** dizer “existing engine files untouched; future engine additions require separate allowlist”; guardar o bloco SYNC dentro de `reports/`; incluir o footer completo de oito chaves.

## O QUE TENTEI REFUTAR E NÃO CONSEGUI
- O SHA actual de `tools/router/classify.js` é exactamente `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`; nenhum dos quatro artefactos manda modificá-lo.
- Os multiplicadores Anthropic, regras GPT‑5.6, preços Kimi K3 e desconto Batch de 50% empilhável com caching reproduzem nas fontes oficiais actuais.
- A SPEC não tenta vender SELF como independente: repete a distinção e atribui G4 a outro engine/provider.
- v1.1 preservou M1–M3 e os DO-NOT relevantes de v1.0; não encontrei requisito correcto silenciosamente removido.

## A PERGUNTA QUE NÃO ESTÁ A SER FEITA
Existe hoje workload API-metered real e material para optimizar, e estes checks seriam realmente executados sem VDQ? O ledger observado tem 12 Codex, 5 local, 1 Claude CLI e zero Kimi/API. Sem responder isto, o bench paga para criar uma workload que não existe e compara-a com o contrafactual fictício de “checks frios devidos”.

## CONFIANÇA
`alta` — li integralmente os cinco ficheiros relevantes, canon e instrumentos; não pude verificar offline a faturação da conta, evicção real dos caches, limites das subscrições nem executar M2/M3 sem gastar dinheiro ou alterar estado externo.

---

## O QUE ISTO DESBLOQUEIA / BLOQUEIA (leitura do executor)

- **BLOQUEADO:** ③ colar BENCH-CACHE v1.1 · ④ REPORT.md · ⑨ landing com número `[medido]`.
- **BLOQUEADO por dependência:** GPU-AUDIT (roadmap §7) — era STAGED "só após REPORT do BENCH-CACHE",
  e o REPORT não existe.
- **NÃO bloqueado:** ⑤ D1–D4 do Paulo — mas agora com informação melhor: a pergunta deixou de ser
  "qual alavanca poupa mais" e passou a ser **"existe workload API-metered material para optimizar?"**.
- **Aplicar os fixes é gesto do autor (Cowork), não meu.** São reescritas de spec/masterprompt —
  construção, fora do escopo desta sessão de medição.

📮 **DESTINO: Paulo** — o `no-ship` é do crítico; a decisão de reescrever, encolher ou arquivar
a família token-economy é tua.
