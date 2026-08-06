# ⇄ CC → COWORK · Piloto de Convicção — preparação executada (2026-08-06)

```
⇄ MOO HANDOFF · Claude Code (Fable 5) · CC→COWORK · piloto-conviccao/prep · 2026-08-06
STATE:  🟢 pronto-para-run · bloqueado por 1 input (T1_SPEC §5 da v1.0 — vive na tua conversa)
TL;DR:  protocolo congelado (X=40·N=40, sha 0737767c) · kit scripted completo · sorteio T2 feito (C4) ·
        kit passou verificação adversarial (21 achados, 6 ALTA) e foi corrigido (v2) · NENHUM braço corrido
BASE:   main @ 1ee878ba · 4 commits desta sessão · local (no push — gate humano)
GATE:   node --check ✓ nos 4 scripts · driver --dry recusa correctamente (PILOTO_GO + <<TODO) ·
        classify.js intocado · zero ficheiros frozen tocados · selective adds only
TREE:   SYNC.md uncommitted (partilhado com outra sessão em curso — commitar com a próxima wave)
```

## O que foi feito (provas = commits em main)

| Commit | O quê |
|---|---|
| `0737767c` | §0 congelado: X=40 · N=40 · data 2026-08-06, fixados ANTES de qualquer run (Δ F2 + Δ tautologia) |
| `441e7cb6` | sha de congelamento anotado no topo do protocolo |
| `17c128ef` | kit completo `_handoff/piloto/`: driver + harness DoD + baralhar + julgar + T1_SPEC (carrier) + 5 candidatas T2 |
| `51fea927` | sorteio registado: dado crypto `[4]` ⇒ **C4 — validador mínimo de handoff** (candidatas congeladas ANTES, Δ F7) |
| `1ee878ba` | v2: as 6 falhas ALTA da verificação adversarial incorporadas |

## DECISIONS (recuperada da sessão, verbatim)

- Q: "Que valores fixo no §0 para X (custo-proxy de B ≤ X% de A) e N (≤ N% dos tokens de B saídos de T3)?"
  Opções: X=40·N=40 (recomendada) / X=30·N=30 / X=50·N=50 → **escolhido: X=40 · N=40**

## Métricas instrumentadas (definidas, NÃO medidas — zero runs, G18)

- **Primária (G17):** mix de tiers de B — % de tokens por tier, de `modelUsage` agregado sobre TODAS as tentativas + slice do `decisions.log` por `session_id` (T0 local não aparece em modelUsage; discrepância declarada).
- **Custo:** proxy preço-de-lista (tabela `precos.json` ← skill pricing-correto-2026) + custo marginal de subscrição (≈0, dito abertamente) + energia `n/d` (§5).
- **Qualidade:** DoD 12×S/N por harness Playwright (zero LLM) + FPS mediana/p95 + input lag + painel cego 3 vozes com sonda de proveniência e rubrica 40/20/20/20.
- **Processo:** wall-clock, nº de "continue" (≤2), intervenções humanas (=0 por construção), GPU warm/cold, ordem por moeda crypto registada.
- **PRESSUPOSTO A VALIDAR NO RUN 1:** usage do CLI é por-invocação em `--resume` (senão a soma sobreconta — está declarado no `somaModelUsage`).

## Verificação adversarial do kit (crítico≠autor, 3 lentes paralelas)

21 achados, 6 ALTA únicas — todas corrigidas em `1ee878ba`:
1. argv+`shell:true` no Windows mutila prompt multi-linha (reproduzido) → prompts por **stdin**
2. transcrições com `modelUsage` vazavam o braço para os pacotes dos juízes → banidas; único .json admitido: `dod.json`
3. juízes-agente podiam ler `mapa.json`/`runs/` do disco → cwd isolado (tmp) + Fable sem tools
4. artefacto destruído antes do harness (só diff sobrevivia) → cópia real `runs/<id>/artefacto/` antes de desmontar
5. custo/mix só da última tentativa (subcontava §0 b-c) → agregação sobre todas
6. `--revelar` contava `painel.json` como veredicto (mapa abria com 2) → conta só veredictos REAIS
Mais: kimi streaming+600s (fix §7.2), transcrição completa via stream-json (§2.2), worktree opaca, warm-up GPU, redacção de tokens denunciadores na normalização.

## PENDING (o que só tu/Paulo podem dar)

1. **T1_SPEC §5 da v1.0** (prompt Moo Ranch + 12 itens DoD verbatim) — driver e harness recusam sem isto.
2. Depois de colado: implementar os 12 checks em `dod_checks.mjs` (CC faz em minutos com a tabela).
3. Autorização `PILOTO_GO=1` para o run (nunca auto).
4. Nota de infra: codex_quota estava a 0% (janela 5h) nesta sessão — agendar o run quando a âncora do painel tiver quota.

## Honestidade sobre o desenho (o que este piloto NÃO prova)

- n=3 por braço: separa sinal grosso, não subtilezas — amplitudes sobrepostas = INCONCLUSIVO (§0, já previsto).
- Juízes de texto não veem capturas: "acabamento visual" degrada para n/d; experiência = fluidez medida.
- 2 tarefas (1 visual + 1 repo) é amostra de convicção, não benchmark — o rótulo NÃO-PUBLICÁVEL existe por isso; a versão pública exige o gate de 11 itens do BENCH_AB_PLANO.
- "Melhor que concorrente" não se ganha aqui: ganha-se no eixo confiança/prova (recibo auditável + crítico≠autor) — este piloto é exactamente esse músculo a treinar.

NEXT: Cowork cola §5 v1.0 → CC preenche checks → Paulo dá GO → 18 runs → baralhar → painel → resultado.md contra o §0.
```
gauntlet: prep-piloto · verificação adversarial 3-lentes corrida · 6 ALTA incorporadas (1ee878ba) · braços: 0 · números publicados: 0 (G18)
```
