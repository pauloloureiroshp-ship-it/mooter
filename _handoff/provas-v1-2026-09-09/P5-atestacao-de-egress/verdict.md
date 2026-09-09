# P5 · Atestação de egress — veredicto

**Corridas:** 2026-09-09, 13:42Z (A, A-block, B v1, D, PII) e 14:2xZ (B v2, E) · protocolo `22388a20` commitado 13:40:15Z, antes da primeira corrida · `AMENDMENT-1.md` (E por `netstat`, B com prompt JSON-escapado, C `n/d`) · bruto em `results/` (`A.json`, `A-block.json`, `B-arbiter-instrumented.json`, `D-litellm.json`, `E-native.json`, `pii-logs.json`, `nettap-*.jsonl`) · `results/analysis.json`.

## Veredicto em uma linha

**Para DECIDIR, o hook do Mooter contacta 0 hosts externos em 20 prompts reais — observado ao nível do socket em 75 processos Node, e o tier não muda quando toda a rede externa é recusada. O árbitro, se tivesse chave, mandaria o prompt cru inteiro para a Anthropic (20/20, instrumentado). Os proxies (LiteLLM medido; ccr `n/d`) decidem localmente e encaminham 100 % do prompt para o fornecedor que escolhem — e o LiteLLM escolheu o caro 20/20. O nativo abre 2 ligações externas por prompt, por desenho.**

## Os números (20 prompts reais, n01–n20 do corpus do P1)

| Braço | O que se mediu | Ligações externas | O prompt sai? | Como se observou |
|---|---|---|---|---|
| **A · Mooter, hook vivo** (`inject_context.js` da runtime, sem `ANTHROPIC_API_KEY`, árbitro no estado por omissão) | 75 processos Node sob *tap*, 35 ligações, **todas loopback**: `127.0.0.1:7821` ×20 (porta de métricas do próprio hook) e `127.0.0.1:11434` ×15 (Ollama, Option A) | **0 hosts externos** · counting-proxy: 0 CONNECT | **Não** — não há fornecedor no caminho de decisão | `[network-observed]` net-tap (socket) + counting-proxy |
| **A-block** (`NET_TAP_BLOCK=1`: recusa tudo o que não é loopback) | 0 ligações bloqueadas (o hook não tentou nenhuma) | 0 | Não | idem; **tiers idênticos a A em 20/20** |
| **B · árbitro do Mooter** (`arbiter.js`, chave falsa, `spawnSync` do filho `node -e` captado) | 20/20 chamadas construídas; corpo médio **2 162 bytes**; **prompt cru presente no corpo 20/20**; modelo `claude-haiku-4-5-20251001`; destino `api.anthropic.com` (no script do filho) | *sairia* 1 por prompt | **Sim, inteiro, para decidir** | `[instrumented]` — nada saiu (sub-corrida com `NET_TAP_BLOCK=1`: 0 ligações) |
| **C · claude-code-router 3.0.22** | **n/d** — configuração headless não conseguida em 60 min (serviço arranca; gateway exige provider + API key criados pela UI/SQLite ou por RPC autenticado sem catálogo documentado) | n/d | n/d | `ccr.md` tem o bloqueio literal e o comando para retomar |
| **D · LiteLLM 1.100.0** (`cost-based-routing`, 2 deployments: barato = preço 0, caro = preço alto, ambos `mock-llm` em loopback) | Proxy de pé, 20/20 HTTP 200; **20/20 pedidos foram ao deployment CARO**, 0 ao barato (nas duas formas de configurar preço: `litellm_params` e `model_info`); **prompt cru encaminhado 20/20**; corpo médio no mock 179 bytes (106–502) | decide localmente (0 para decidir); encaminha 100 % | **Sim, inteiro, para o fornecedor** | `[loopback mock]`; hosts externos do processo Python: n/d (amostra `Get-NetTCPConnection` vazia) |
| **E · Claude Code nativo** (`claude.exe -p`, hooks e tools desligados, `--max-turns 1`) | **2 ligações externas por prompt, 20/20**: `160.79.104.10:443` (api.anthropic.com) e `34.149.66.165:443` (rDNS n/d) | 2 | **Sim, por desenho** — o host reporta `usage.input_tokens` em 20/20 | `netstat` amostrado a 150 ms (32–114 amostras/chamada); **bytes n/d** (o `claude.exe` não honra `HTTPS_PROXY`, D8) |

**PII nos logs locais do router** (regex, 13:42Z; `pii-logs.json`): `decisions.log` (2 799 linhas) — 5 caminhos do *home* (que contêm o nome do dono) e **1 390 linhas com `prompt_preview`** (80 chars de prompt cru); `ledger.jsonl` (727 linhas) — **747** caminhos do *home* com o nome do dono; `decisions_v2.jsonl` e `latencia-local.jsonl` — 0. Total: **752 instâncias de caminho-com-nome** (o contador de «nome» dá 752 também, porque está dentro dos caminhos — não se soma duas vezes); 0 e-mails. O MP dizia «30 hoje»: são 752. Não se corrige aqui (é o log do dono).

## Leitura honesta

1. **A vitória é estreita e é a que interessa:** *decidir* não sai da máquina. Não é «privado» nem «seguro» (§4 do MP proíbe as duas palavras): é «0 hosts externos para classificar, medido ao socket».
2. **A vitória vale para o estado desta máquina:** sem chave, o árbitro não corre e o tier é T0 em 20/20 — **por causa do defeito D1** (tecto de orçamento), não por acerto. Com chave, os prompts de baixa confiança iriam ao árbitro, e B mostra o que ele manda: o prompt inteiro. É uma derrota conhecida e impressa (`arbiter.js`, `messages:[{role:'user', content: prompt}]`).
3. **O que os proxies fazem de diferente do nativo não é «menos egress» — é «outro destino e mais um processo no caminho».** LiteLLM decide localmente como o Mooter, mas está *à frente* do tráfego: recebe e reenvia 100 % de cada prompt. E o `cost-based-routing` mandou 20/20 ao deployment caro nas duas configurações testadas — sem explicação nos logs (fica como facto, não como acusação: pode ser configuração nossa; o yaml está no bruto).
4. **O `netstat` do E é grosseiro:** conta ligações, não bytes, e 10/20 chamadas saíram com exit 1 e stderr vazio mas com JSON completo (`usage.input_tokens = 10` em todas as 20, como as de exit 0); o n03 re-corrido sozinho dá exit 0 — provável concorrência com as duas outras sessões Claude que corriam ao mesmo tempo (P3, P4); causa não estabelecida (**n/d**). A métrica (2 ligações externas por prompt) é a mesma nas 20.
5. **O instrumento falhou onde disse que podia falhar:** o counting-proxy não vê o `claude.exe`; o `MOOTER_DECISIONS_LOG` não é honrado (D6: as 20 decisões de A foram para o log vivo do dono); a amostra TCP do LiteLLM veio vazia. Tudo declarado, nada preenchido.

## O que isto NÃO prova

- SOC 2, DPA, retenção (não se abriu). O comportamento do árbitro **com chave real em rede** (B é instrumentado). O que os proxies fazem com fornecedores reais (o mock recebe o que sairia). Bytes do nativo. O ccr (n/d). Que «0 hosts para decidir» se mantém com o árbitro ligado — não se mantém, e está escrito.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm A|A-block|B|D|E|pii
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --analyse
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/e-probe.mjs    # o claude.exe e o HTTPS_PROXY
```
