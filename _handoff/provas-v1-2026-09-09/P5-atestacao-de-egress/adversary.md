# P5 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, ronda 1, e a resposta

**Prompt:** `adversary-prompt-sent.txt` · **Saída íntegra:** `adversary-codex-round1.md` (13 ataques, 128 s, sem acesso ao repo). Foi a ronda mais produtiva do pacote: derrubou a AMENDMENT-1 inteira.

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P5-01 | «0 hosts» é cobertura do instrumento, não fronteira do dispositivo (filhos não-Node, DNS/UDP, Ollama, porta de métricas) | fatal | **Aceite.** O veredicto v2 diz «nenhum destino externo **registado pelo *tap* de processos Node**» e lista o que não foi observado. O contador CONNECT do A deixou de ser citado (vazio por construção). Observação ao nível do sistema: não feita (`10-NAO-PROVADO.md`) | reformulado |
| P5-02 | contadores de bytes não validados: 35 ligações com 0 bytes | fatal | **Aceite.** Os brutos só têm fase `open` (o filho é morto pelo tecto de 1 s do hook antes do `close`). Bytes do A → **`n/d`**; o `open` prova o destino, não o volume | corrigido (análise) |
| P5-03 | bloqueio sem tentativa é teste vazio | fatal | **Aceite.** «0 tentativas interceptadas; tiers iguais»; a frase «toda a rede externa recusada» saiu | reformulado |
| P5-04 | mede uma configuração defeituosa (sem chave, D1), não o produto | fatal | **Aceite.** Título e primeira linha do veredicto limitam ao «nesta configuração»; D1 vai para o título do slide. Corridas com D1 corrigido / chave presente: não feitas — declarado | reformulado / não resolvido |
| P5-05 | B prova construção de pedido, não transmissão nem nº de ligações; `destinations: [null]`; *substring* | serious | **Aceite.** B re-corrido com **igualdade de campo** (`messages[último].content === prompt`, 20/20) e destino lido do script captado (`api.anthropic.com`, 20/20). «1 ligação por prompt» saiu; «constrói o pedido com o prompt inteiro» é o que fica | corrigido |
| P5-06 | LiteLLM 20/20 ao caro pode ser configuração minha | serious | **Aceite e resolvido por controlo:** preços invertidos (mesmas portas) → 20/20 ao que passou a ser caro; barato a **1e-9** → 20/20 ao barato. Leitura: o *cost-based-routing* funciona, mas o *deployment* a **0** nunca é escolhido. Causa no código do LiteLLM: não confirmada (declarado) | corrigido (2 corridas novas) |
| P5-07 | recepção no *mock* ≠ saída do dispositivo; C não pode entrar em «os proxies» | serious | **Aceite.** Tabela passou a «fronteira observada» por braço; C fica fora de qualquer conclusão | reformulado |
| P5-08 | «2 ligações por prompt» excede a amostragem; exit 1 em metade | serious | **Superado:** o E foi re-medido pelo proxy (P5-10): CONNECT exactos por prompt (37–46), 4 hosts, bytes por sentido. O `netstat` fica só como registo (`E-native-netstat-v2.json`). Os `is_error` (13/20) mantêm-se e o perfil de rede é o mesmo nos 20 (intervalo 1,60–1,64 MB) | corrigido |
| P5-09 | `usage.input_tokens` não atesta entrega integral do prompt | serious | **Aceite.** Retirado; só «houve chamada» | reformulado |
| P5-10 | a sonda do proxy podia estar a bloquear o próprio proxy (`spawnSync` no mesmo event loop) | serious | **Aceite — e era exactamente isso.** `e-probe.mjs` v2 (spawn assíncrono, variáveis de proxy limpas): com proxy 41–43 CONNECT a 4 hosts; sem proxy 0. **D8 retirado** como defeito do `claude.exe` e reescrito como defeito do meu instrumento. O braço E passou a ter bytes | corrigido |
| P5-11 | «752» é soma de *matches*, não auditoria; «30 hoje» não comparável | serious | **Aceite.** «752 correspondências do detector de caminho-do-*home*»; sobreposição com o detector de nome explicada; comparação com «30» retirada | reformulado |
| P5-12 | emendas não são neutras; `analysis.at` 14:16 vs «14:2x»; n03 re-corrido vs «0 retries» | serious | **Aceite.** Cronologia refeita a partir dos `at` dos ficheiros; a re-corrida do n03 era diagnóstico, não *retry*, e saiu do veredicto (o E foi todo re-medido) | corrigido |
| P5-13 | o slide compara grandezas diferentes; «private/secure» aparecem mesmo negadas | fatal | **Aceite.** Slide v2 com «Observation in this setup» e «Boundary observed» por linha; as palavras proibidas saíram mesmo em negação; D1 no título | reformulado |

**Rejeitado:** nada. **Não resolvido:** observação ao nível do dispositivo; corridas com D1 corrigido e com chave; a saída externa do processo Python do LiteLLM; o ccr.

**Ronda 2:** pedida sobre o veredicto v2 e o slide v2 (`adversary-codex-round2.md`, se existir; senão a quota do Codex acabou antes e fica declarado).
