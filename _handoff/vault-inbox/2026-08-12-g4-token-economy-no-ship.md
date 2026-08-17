---
tipo: curriculo-vivo (DRAFT — canonização é gesto do Paulo)
destino_sugerido: paulo-vault/30-learnings/
projeto: Mooter
data_utc: 2026-08-12T07:51:29Z
data_dono: 2026-08-12 04:51 (America/Sao_Paulo, UTC-3)
status: draft · NÃO escrever no vault nem no Notion sem gesto do dono
---

# O G4 num segundo motor matou uma wave de medição antes de ela custar dinheiro

## O quê

Despachei os 4 textos da família token-economy (`CACHE_GUARD_SKILL`, `SPEC_WARM_WINDOW_VDQ`,
`TOKEN_AUTOPILOT_SKILL`, `MASTERPROMPT_BENCH_CACHE_v1.1`, todos de 2026-08-12) para revisão
adversarial num **motor diferente do autor** — Codex CLI `gpt-5.6-sol`, reasoning `xhigh`,
sandbox `read-only`. Autor: Cowork/Opus. Crítico: outro motor. G4 satisfeito de facto, não por
declaração.

**Veredicto: `no-ship` nos quatro.** A wave de medição (M1–M5) **não foi executada** — a ordem
dura só a libertava com `ship` ou `ship-com-fixes aplicados`.

## Quando

- Dispatch → fecho: `2026-08-12T07:34:15Z` → `07:51:29Z` (~17 min wall).
  Na hora do dono: **04:34 → 04:51**.
- Auditoria pós-facto re-executada: `07:57Z` = **04:57** hora do dono.

## Porquê isto merece entrar no currículo

**A lição não é "o codex encontrou bugs". É que a pergunta certa só aparece quando quem pergunta
não é quem escreveu.**

O achado que derrubou a wave inteira não foi técnico — foi de premissa:

> *Existe hoje workload API-metered real para optimizar?*

O ledger observado tem **12 jobs codex · 5 local (moo) · 1 Claude CLI · 0 Kimi · 0 Anthropic API**
[medido, re-executado independentemente por mim]. Os dois braços mais caros da wave — M2 (A/B de
cache no Kimi) e M4 (desconto Batch sobre jobs Anthropic) — **mediriam uma workload que não
existe**. O bench teria pago para criar o objeto que ia estudar, e depois comparado com um
contrafactual.

Três padrões que se repetem e que valem mais do que este caso:

1. **Contrafactual disfarçado de `[medido]`.** A fórmula `saved_vs_cold` usava o prefixo
   *planejado*, não o `cache_read_input_tokens` *observado*, e omitia o prêmio de criação do
   cache. Um número derivado de uma intenção não é uma medição, por mais aritmética correta que
   tenha em volta. (A aritmética estava certa — reproduzi toda à mão. Era a *etiqueta* que
   mentia.)
2. **Cap sem executor é desejo.** "Não gastar >\$2" não estava ligado a nada que pudesse recusar
   a execução. Um limite que ninguém verifica antes de chamar a API é uma frase, não um controle.
3. **Skill que dispara trabalho pago sem gesto do dono.** A regra R1 do Token Autopilot
   transformava qualquer entrega em até quatro jobs adicionais, alguns em tiers pagos. Economia
   que se auto-autoriza a gastar deixa de ser economia.

## O que eu fiz de diferente do que me foi pedido (e por quê)

Não aceitei o veredicto do crítico de cara. **Re-executei do zero 5 das afirmações empíricas dele:
4 saíram exatas, 1 era erro literal** (afirmou que `logs/` não existe; existe, com 3 logs de LoRA
e zero campos `usage` — o furo que ele apontava em M1 continua de pé, mas a frase estava errada).

Isso é o mesmo teste que o G4 aplica ao autor, aplicado ao crítico. **A palavra do executor nunca
basta — inclusive a do executor que eu escolhi.**

O que **não** consegui verificar e por isso ficou `n/d`: os preços e regras de provider que o
codex diz ter conferido nas páginas oficiais (multiplicadores de cache, razão 6x de output do
GPT-5.6, Batch −50% empilhável). Sem web fetch nesta sessão. Registrado como *afirmação do
crítico*, não como *fato confirmado por dois motores*.

## Custo

**`n/d` — e o motivo é ele próprio o achado.**

O turn-io desta sessão (`~/.claude/tools/router/handoff/d2fac6e2-….jsonl`) tem 1 linha com os
campos `ts, assistant_snippet, tools, git, n_turn`. **Nenhum campo `usage`. Nenhum `cost_usd`.**
Não existe fonte medida de custo por sessão nesta máquina que eu possa citar.

Ou seja: a sessão que ia medir economia de tokens **não consegue medir quanto ela própria custou**.
É a confirmação ao vivo do achado M1 do G4 — e é o argumento mais forte a favor da única parte da
wave que continua a fazer sentido (instrumentação read-only), independente de qualquer decisão
sobre cache, batch ou disciplina de output.

## Assets

| Ficheiro | sha256 |
|---|---|
| `_handoff/g4-tokeneconomy/resultado.md` | `d1782b3fb422c7b27a3b272f0729aff04a45ff9906218732332acbd64d400e0e` |
| `reports/bench-cache-2026-08/AUDIT.json` | gerado no fecho desta sessão (ver ficheiro) |
| `reports/bench-cache-2026-08/REPORT.md` | **não existe** — passo bloqueado, e não deve ser fabricado |

Sessão codex: `019ff4e4-aeab-7b40-9056-06cf7afb83fd` · comando reproduzível:
`codex exec --sandbox read-only --skip-git-repo-check - < g4-prompt.txt`

## Nota de convivência (vale para o protocolo, não só para este caso)

Duas sessões Claude Code correram **em paralelo no mesmo `main`** nesta manhã sem se pisarem:
a irmã fechou a PARTE A em `NOT_CLOSED` (parada num achado de segurança na história) e declarou
explicitamente `A3 ⛔ NÃO EXECUTADO — G4 auto-DEGRADADO, sem 2º motor`. Esta sessão executou
exatamente esse A3.

O que fez funcionar não foi coordenação — foi **cada lado declarar honestamente o que não fez**.
A irmã escreveu "não reescrevi a numeração, não invento"; eu sinalizei o addendum 2 como fora de
escopo em vez de o executar — e ela já o tinha feito no commit `6c928ca1`. Um `n/d` honesto de um
lado virou o mapa do outro.

---
📮 DESTINO: Paulo — canonizar (ou não) no vault é gesto teu. Este ficheiro é rascunho em
`_handoff/vault-inbox/`, não foi escrito no vault nem no Notion.
