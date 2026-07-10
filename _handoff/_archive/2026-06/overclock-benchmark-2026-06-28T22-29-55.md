# Overclock Moo — benchmark honesto (2026-06-28T22:29:55.246Z)

**modelo base:** `qwen3:30b` · **OLLAMA_NUM_PARALLEL:** (default ~4)

## PARTE 1 — HEADLINE: reclamação de GPU ociosa

> A métrica principal é: GPU ociosa → saturada, $0 local vs ~$ cloud evitados,
> ~min-humanos recuperados (COM ressalva METR). Throughput é **SECUNDÁRIO**.

**GPU util idle antes:** 37%

- measured · jobs 6 (pass 6 / fail 0, skip 0)
- measured · GPU reclaimed 19.3s · CPU 0s · util 37%→91% · tokens 1422 · cost $0
- quality · pass-rate 100% · regressions 0 (target ~0)
- estimated · time recovered ~33 human-min — Estimate of human-equivalent work unblocked, NOT a stopwatch measurement. METR 2026: AI can slow experienced devs (−20%..+100% depending on context).
- idle-reclaim · GPU util 37%→100% · busy 19.3s · ~$0.0043 cloud avoided (est) · $0 local
- secondary · throughput n/d — secondary metric; ≈1× local on dense models (RTX 4090 saturates single-stream) — never the headline

## PARTE 2 — SECUNDÁRIO: sweep de throughput [1,2,4,8]

> **Secundário** — ≈1× local em modelos densos (RTX 4090 satura single-stream).
> Cresce em: jobs de output curto, MoE base (ex. qwen3:30b), OLLAMA_NUM_PARALLEL alto, vLLM datacenter.
> O 7b experimental mediu ~1.37×; modelos densos ~1× (compute-bound, não memory-bound).

| concorrência | wall (s) | tok/s | tokens | util máx | speedup vs 1 |
|---:|---:|---:|---:|:---:|---:|
| 1 | 12.5 | **163.2** | 2048 | 100% | 1× |
| 2 | 10.6 | **193.8** | 2048 | 90% | 1.19× |
| 4 | 11.8 | **173.1** | 2048 | 97% | 1.06× |
| 8 | 11.4 | **180.3** | 2048 | 96% | 1.1× |

**throughputX medido:** 1.19× _(secundário; secondary metric; ≈1× local on dense models (RTX 4090 saturates single-stream) — never the headline)_

---

> **Honestidade:** tokens = `eval_count` real do Ollama; util = `nvidia-smi` amostrado a 250ms.
> Cloud-$ evitado = estimativa conservadora ao preço Haiku (tier mais barato — nunca inflada).
> Estimate of human-equivalent work unblocked, NOT a stopwatch measurement. METR 2026: AI can slow experienced devs (−20%..+100% depending on context).
> Se throughput achatar: sobe `OLLAMA_NUM_PARALLEL` e reinicia o Ollama.
