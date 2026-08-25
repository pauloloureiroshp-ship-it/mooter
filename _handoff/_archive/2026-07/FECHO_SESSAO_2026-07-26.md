# Fecho da sessão — 2026-07-26 · da auditoria dos 15 pontos a v1.15.0

**Branch:** `chore/mooter-20-h0` (tudo pushed) · **Conector:** v1.15.0 · **Bundle novo:** `_handoff/mooter-v1150.mcpb` (sha256 `07c3c5c4…`)

## O que foi entregue, com commit

| Onda | O que fecha | Commit | Versão |
|---|---|---|---|
| 0 | A régua honesta — dedup por `requestId`, guard #25941, entradas no peso, quota do Codex, referência calibrável | `fd4f425` + `4bf34eb` | 1.11.0 |
| 1 | O tier local dessabotado — `num_ctx`≥16384, `keep_alive`, selector adequação×capacidade, KV q8_0 | `86a3af5` | 1.12.0 |
| 2 | A lentidão sentida — timeout de prep, fallback do moo, prep medida, sondas em paralelo, `quota.estadoAsync` | `6224a0d` + `0a666e3` | 1.13.0 |
| 3 | O loop que aprende — `aprender.js`: um resultado muda decisões futuras, keep rate honesto, custo por tarefa | `9026e57` | 1.14.0 |
| 4 | O fosso — `fosso.js`: mapa de projecto persistente + verificação cruzada local↔nuvem a $0 | `3e05415` | 1.15.0 |
| 5.1/5.3 | A narrativa — `STRATEGY.md` reescrito, radar de concorrência trimestral | `0a666e3` | — |

## As 15 frentes da auditoria

Fechadas: **1, 2, 3(parcial: loop pronto, LoRA por treinar), 4, 5, 6, 7, 9, 10, 11, 12, 13, 15(em execução)**.
Por fechar: **8** (radar criado, falta a 1ª ronda de pesquisa activa), **14** (Notion — o conector precisa de autorização), **5.4** (bugs do conector: `create_worktree` ignorado, `permissoes_efectivas` que declara read-only e usa Bash, bind de projecto que se perde).

## Números que passaram a ser verdade

- Inflação da quota: **2,44× medida** (2 061 linhas → 844 turnos). Peso semanal 15 283 → 8 971.
- Referência calibrada com a barra real da app (75%) → 11 961. Pressão passou de "crítico" falso a "alto" verdadeiro.
- Codex: 2,47M in / 33,5k out / 55 turnos em 7 dias — de "indisponível" a lido.
- Contexto local: 4 096 (default silencioso) → **≥16 384**, com truncagem declarada.
- Sonda de quota: **209 ms** de event loop bloqueado → cede o ciclo.
- `captureGitBase`: **129 ms**, medido, e documentado no código com a razão de ficar síncrono.
- Ledger real: 73 jobs, 55 entregues, 27 locais, custo mediano **US$ 0,4826** em 45 jobs.

## Quatro erros apanhados nesta sessão (e o que cada um ensinou)

1. **Falso-verde do sandbox.** O E2E do `v12.test.js` é *saltado* sem git: Linux dava 20/20 enquanto o Windows falhava 3/3. → O gate é o runner **nativo**.
2. **Commit incoerente.** `6224a0d` chamava `quota.estadoAsync` sem incluir o `quota.js` que a define. → Guard novo: o que o commit chama tem de existir no commit.
3. **Bundle partido.** `pack-mcpb.mjs` não listava `aprender.js` nem `fosso.js` — o `bundle.test.js` apanhou. → Ficheiro novo implica entrada no pack.
4. **Regressão no guard anti-fabricação.** A Onda 4 empurrou `evidencia` para fora da janela que o teste A4 inspecciona. → O campo passou a **primeiro** no `meta.json`, em vez de se relaxar o teste.

Mais dois gotchas de runner, ambos pagos: `Start-Process -PassThru` devolve `ExitCode` nulo em PS 5.1 (usar `cmd /c` + `$LASTEXITCODE`), e **acentos ou aspas aninhadas num `.ps1` sem BOM rebentam o parse antes do `Start-Transcript`** — runners só em ASCII.

## O que falta fazer na máquina (não dá para automatizar daqui)

1. **Reiniciar o serviço Ollama** — sem isso o `OLLAMA_KV_CACHE_TYPE=q8_0` não vale.
2. **Fechar e reabrir o Claude Desktop** — o conector em memória ainda é o antigo; há `mooter-v1150.mcpb` por instalar (`mooter_setup atualizar: aplicar`).
3. Depois, num job real: confirmar `/api/ps` com `context_length ≥ 16384` e que o modelo escolhido é o `qwen3.6:27b`.

## Próximo

Onda 4 restante (fan-out real, failover com estado, estratégias nomeadas de routing tipo `latency-based`/`least-busy`), 5.2 (Notion), 5.4 (bugs do conector), e a LoRA **só** quando o loop da Onda 3 tiver recolhido dados suficientes.
