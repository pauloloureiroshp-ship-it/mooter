# P5 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, duas rondas, e as respostas

**Ronda 1:** `adversary-prompt-sent.txt` → `adversary-codex-round1.md` (13 ataques, 128 s). **Ronda 2** (sobre o veredicto v2 e o slide v2): `adversary-prompt-sent-round2.txt` → `adversary-codex-round2.md` (14 ataques, 131 s). Sem acesso ao repo nas duas. Foi a prova com mais churn de instrumento do pacote: a ronda 1 derrubou a AMENDMENT-1 inteira; a ronda 2 apanhou uma mediana mal definida e quantificadores a mais.

## Ronda 1

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P5-01 | «0 hosts» é cobertura do instrumento, não fronteira do dispositivo | fatal | **Aceite.** «Nenhum destino externo **registado pelo *tap* de processos Node**»; lista do que não foi observado; o contador CONNECT do A deixou de ser citado | reformulado |
| P5-02 | contadores de bytes não validados: 35 ligações com 0 bytes | fatal | **Aceite.** Só há fase `open`; bytes do A → **`n/d`** | corrigido (análise) |
| P5-03 | bloqueio sem tentativa é teste vazio | fatal | **Aceite.** «0 tentativas interceptadas»; «toda a rede externa recusada» saiu | reformulado |
| P5-04 | mede uma configuração defeituosa (sem chave, D1) | fatal | **Aceite.** Limitado a «nesta configuração»; D1 no título do slide. Corridas com D1 corrigido / chave: não feitas | reformulado / não resolvido |
| P5-05 | B: construção ≠ transmissão; `destinations: [null]`; *substring* | serious | **Aceite.** B re-corrido com igualdade de campo (20/20) e destino lido do script (`api.anthropic.com`) | corrigido |
| P5-06 | LiteLLM 20/20 ao caro pode ser configuração minha | serious | **Aceite; dois controlos exploratórios** (invertido; 1e-9): 0/40 ao preço 0; 20/20 ao barato a 1e-9 | corrigido (2 corridas novas) |
| P5-07 | *mock* ≠ dispositivo; C não entra em «os proxies» | serious | **Aceite.** «Fronteira observada» por braço; C fora de conclusões | reformulado |
| P5-08 | «2 ligações por prompt» excede a amostragem `netstat` | serious | **Superado** pelo E v3 (proxy) | corrigido |
| P5-09 | `usage.input_tokens` não atesta conteúdo | serious | **Aceite.** Retirado | reformulado |
| P5-10 | a sonda podia bloquear o próprio proxy (`spawnSync`) | serious | **Aceite — era isso.** `e-probe` v2 assíncrono: o cliente honra `HTTPS_PROXY`; **D8 retirado**; E re-medido com bytes | corrigido |
| P5-11 | «752» é soma de *matches*; «30 hoje» não comparável | serious | **Aceite.** «752 correspondências do detector»; comparação retirada | reformulado |
| P5-12 | emendas não neutras; cronologia; n03 re-corrido | serious | **Aceite.** Cronologia pelos `at`; o n03 era diagnóstico e saiu | corrigido |
| P5-13 | slide compara grandezas diferentes; palavras proibidas em negação | fatal | **Aceite.** Slide reescrito por «observação nesta montagem» + «fronteira»; palavras retiradas | reformulado |

## Ronda 2

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P5-14 | «nunca» excede 0/40 | serious | **Aceite.** «0/40 nas duas configurações com preço 0», com o limite superior de 95 % (~7 %) e a ressalva de independência | reformulado |
| P5-15 | causa «0 = sem preço» apresentada como facto | serious | **Aceite.** Hipótese em todo o lado (`analysis.json` incluído) | reformulado |
| P5-16 | *mock* a 0 ≠ Ollama real | serious | **Aceite.** Extrapolação retirada; «não se extrapola sem o medir» | reformulado |
| P5-17 | o controlo do proxy não calibra os contadores | serious | **Aceite; resolvido por teste:** `lib/counting-proxy.calibration.test.mjs` — N bytes conhecidos por um túnel CONNECT dão N em cada sentido (sem dupla contagem, sem cabeçalho); CONNECT recusado fica a 0. O código conta uma perna por sentido (`clientSocket.on('data')` → out; `up.on('data')` → in) | corrigido |
| P5-18 | o proxy pode alterar o comportamento; «por prompt» inclui arranque | serious | **Aceite.** «Por invocação, através deste proxy»; tráfego directo não comparado; custo marginal em sessão persistente não medido | reformulado |
| P5-19 | 13/20 `is_error` é confound não resolvido | serious | **Aceite em parte.** Medianas por resultado publicadas (13 vs 7; 1,62 vs 1,63 MB; CONNECT 40 vs 41; API 14 vs 14) e no slide; motivo dos erros: não extraído (`n/d`) | corrigido / parcial |
| P5-20 | medianas publicadas eram a mediana superior | serious | **Aceite — erro meu.** Mediana convencional na análise (declarada); veredicto v3 com os valores corrigidos (40,5; 1 622 528,5; 1 386 817) | corrigido |
| P5-21 | host não revela conteúdo; «187 kB em cada» | serious | **Aceite.** Decomposição do conteúdo retirada; «registado em 20/20; mediana 187 kB» | reformulado |
| P5-22 | «every Node process» não demonstrado; sem eventos finais | serious | **Aceite.** «75 processos Node registados pelo *tap*»; completude não inventariada | reformulado |
| P5-23 | «vitória» e generalização sobre proxies | serious | **Aceite.** Retiradas; «não há aqui uma estimativa do efeito de ligar o Mooter sobre a mesma tarefa» | reformulado |
| P5-24 | a emenda não documentava o `tiny` nem a cronologia | serious | **Aceite.** AMENDMENT-2 reescrita com os dois controlos, a ordem das decisões e a cronologia pelos `at` | corrigido |
| P5-25 | B com quantificadores universais («whenever») | serious | **Aceite.** «Nas 20 invocações instrumentadas com chave falsa» | reformulado |
| P5-26 | «80-char preview» inflacionado | minor | **Aceite.** «Até 80 caracteres; conteúdo não validado» | reformulado |
| P5-27 | «privado/seguro» ainda no veredicto | minor | **Aceite.** Retirados do veredicto v3, mesmo em negação | corrigido |

**Rejeitado:** nada nas duas rondas. **Não resolvido:** observação ao nível do dispositivo; D1 corrigido / chave presente; egress do processo Python do LiteLLM; Ollama real no LiteLLM; motivo dos `is_error`; tráfego directo sem proxy; o ccr.

**Ronda 3:** se existir `adversary-codex-round3.md`, foi sobre o v3; senão, a quota do Codex foi reservada para P3, P7 e P8 e isso fica declarado.
