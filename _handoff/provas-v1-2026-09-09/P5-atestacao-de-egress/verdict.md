# P5 · Atestação de egress — veredicto (v2, depois do adversário)

**Corridas (todas as horas nos ficheiros `at`, nenhuma à mão):** A, A-block, D, PII 13:41–13:53Z · B v2, D-invert, D-tiny, E v3 depois das 14:2xZ · protocolo `22388a20` commitado 13:40:15Z · `AMENDMENT-1.md` (E por `netstat` — **superada**), `AMENDMENT-2.md` (E pelo proxy com spawn assíncrono; B por igualdade de campo; D com dois controlos; A bytes `n/d`) · bruto em `results/` · `results/analysis.json` · adversário: `adversary-codex-round1.md` → `adversary.md`.

## Veredicto em uma linha

**Nesta configuração (sem `ANTHROPIC_API_KEY`, com o defeito D1 a forçar T0), o hook do Mooter não registou nenhum destino externo no *tap* de 75 processos Node em 20 prompts reais; o árbitro, quando tem chave, constrói um pedido com o prompt inteiro (20/20, instrumentado); o LiteLLM nunca escolhe um *deployment* a preço 0; e o Claude Code nativo abre ~41 túneis TLS para 4 hosts e envia ~1,6 MB por prompt, dos quais ~187 kB para o Datadog.**

## Os números (20 prompts reais, n01–n20 do corpus do P1, mediana 38 caracteres)

| Braço | Observação **nesta montagem** | Instrumento e fronteira |
|---|---|---|
| **A · Mooter, hook vivo** (sem chave; árbitro por omissão não corre; tier T0 em 20/20 **por D1**) | 75 processos Node sob *tap*, 35 ligações, **todas loopback**: `127.0.0.1:7821` ×20 (porta de métricas do hook) e `127.0.0.1:11434` ×15 (Ollama, Option A). **0 destinos externos registados.** Bytes: **n/d** (só há registos de fase `open`: o filho é morto pelo tecto de 1 s do hook antes do `close`). | net-tap (socket, preload em processos Node). **Fronteira: processo Node**, não dispositivo: filhos não-Node, DNS/UDP e a saída do próprio Ollama **não** foram observados. O contador CONNECT é vazio por construção (o Node não honra `HTTPS_PROXY`). |
| **A-block** (`NET_TAP_BLOCK=1`) | **0 tentativas interceptadas** (nada para bloquear); tiers iguais a A em 20/20 (todos T0). | O bloqueio só é exercitado se algo tentar sair; aqui não tentou. Controlo positivo do modo bloqueio só no teste unitário (`net-tap.test.mjs`), não nesta corrida. |
| **B · árbitro do Mooter** (`arbiter.js`, chave falsa, `spawnSync` do filho captado) | 20/20 pedidos **construídos** com o prompt: `messages[último].content === prompt` em 20/20 (igualdade de campo, não *substring*); destino `api.anthropic.com` no script captado 20/20; corpo médio 2 162 bytes; modelo `claude-haiku-4-5-20251001`. | `[instrumented]`: nada foi transmitido; **não** se afirma número de ligações nem retries. Com chave real e em rede: não medido. |
| **C · claude-code-router 3.0.22** | **n/d** — configuração headless não conseguida em 60 min (`ccr.md`). | — |
| **D · LiteLLM 1.100.0**, `cost-based-routing`, 2 *deployments* do mesmo grupo, ambos `mock-llm` em loopback | Preços normais (barato = **0**, caro = 1e-5/3e-5): **20/20 ao caro**. Preços invertidos (mesmas portas): **20/20 ao que passou a ter preço alto**. Barato a **1e-9** (não zero): **20/20 ao barato**. Prompt cru encaminhado ao *mock* 20/20; corpo médio 179 bytes. | *Mock* em loopback: mede o que o proxy **reenvia**, não a saída do dispositivo; egress externo do processo Python: n/d. Leitura: o *cost-based-routing* funciona, mas **um *deployment* a preço exactamente 0 nunca é escolhido** (lido como «sem preço»). É o caso do Ollama local. n = 20 por configuração, 3 configurações. |
| **E · Claude Code nativo** (`claude.exe -p`, hooks e tools desligados, `--max-turns 1`) | **4 hosts em 20/20 prompts**: `api.anthropic.com:443`, `mcp-proxy.anthropic.com:443`, `registry.npmjs.org:443`, `http-intake.logs.us5.datadoghq.com:443`. CONNECT por prompt: mediana **41** (37–46); para a API 14 (14–14). Bytes de saída por prompt: mediana **1 624 212** (1 597 315–1 641 889), dos quais para a API 1 387 295 (1 363 977–1 402 892) e **para o Datadog 187 083 (168 794–192 440), em 20/20**. Entrada 1 424 847. 15,3 s por chamada. 13/20 terminam `is_error` (1 turno sem tools) — **o perfil de rede é o mesmo** nos 20 (o intervalo é estreito). | counting-proxy (HTTPS_PROXY em loopback, spawn assíncrono, **um proxy por prompt**): conta CONNECT e bytes do túnel TLS sem desencriptar. **Bytes do túnel ≠ bytes de prompt.** Controlo positivo e negativo na mesma corrida (`e-probe.mjs` v2: com proxy 41–43 CONNECT, sem variáveis de proxy 0). |

**PII nos logs locais do router** (`pii-logs.json`, 13:42Z, regex): **752 correspondências do detector de caminho-do-*home*** (que contém o nome do dono) — 747 em `~/.mooter/ledger.jsonl` (727 linhas) e 5 em `decisions.log` (2 799 linhas); as correspondências do detector de nome estão dentro dessas. 0 correspondências de e-mail. **1 390 linhas** do `decisions.log` com um campo `prompt_preview` (até 80 caracteres de prompt cru). Não são «instâncias únicas de PII» nem uma auditoria; não se compara com o «30 hoje» do MP (unidade e janela diferentes). Não se corrige aqui (é o log do dono).

## Leitura honesta

1. **O que sobrevive:** «nenhum destino externo registado pelo *tap* de processos Node, nesta máquina, sem chave e com D1». Não é «o prompt não sai do dispositivo» nem «privado»/«seguro» (palavras proibidas pelo §4 do MP, e também não demonstradas): a fronteira observada é o processo Node.
2. **A vitória é da configuração tanto quanto da arquitectura.** Sem chave o árbitro não corre; com D1 tudo é T0. B mostra o que o árbitro **construiria** com chave: o prompt inteiro para `api.anthropic.com`. Corridas com D1 corrigido e com chave presente/ausente não existem — `10-NAO-PROVADO.md`.
3. **O que os proxies fazem de diferente do nativo não é «menos egress» — é outro destino e um processo a mais no caminho.** E o LiteLLM tem um comportamento que interessa ao Mooter: o *deployment* a **$0** nunca ganha o *cost-based-routing* (3 configurações, 60 pedidos). A causa exacta (0 lido como «sem preço») é a leitura mais simples, não está confirmada no código do LiteLLM.
4. **A referência nativa é mais gorda do que a pergunta:** para um prompt de 38 caracteres saem ~1,6 MB em ~41 túneis — sistema, ferramentas, MCP, npm e telemetria do cliente; ~187 kB vão para o Datadog em todos os prompts. Isto é o **cliente**, não o prompt; e os bytes são do túnel.
5. **O instrumento errou duas vezes e foi apanhado:** o proxy com `spawnSync` (D8, meu, retirado) e os bytes 0 do *tap* (agora `n/d`). As duas correcções estão na AMENDMENT-2 com os brutos antigos guardados.

## O que isto NÃO prova

- Egress ao nível do **dispositivo** (DNS, UDP/QUIC, filhos não-Node, a saída do Ollama). «Toda a rede externa recusada» (nada tentou). SOC 2/DPA/retenção. O árbitro com chave real em rede. Proxies com fornecedores reais. O ccr. Que os bytes do túnel são bytes de prompt. Que o `usage.input_tokens` do nativo atesta o conteúdo entregue (só atesta que houve chamada).

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm A|A-block|B|D|E|pii
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm D --invert   # e --tiny
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --analyse
node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/e-probe.mjs   # controlo do proxy (v2, assíncrono)
```
