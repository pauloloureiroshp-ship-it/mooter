# ERRATA — o arbiter Haiku nunca correu, nem com chave (bug B do MP4-a, 2026-09-21)

**O defeito.** `tools/router/arbiter.js#callHaikuSync` corre o pedido HTTPS num filho `node -e <script> <body> <apiKey>`
e o script lia `process.argv[2]` como corpo e `process.argv[3]` como chave. Em `node -e`, `process.argv` é
`[node, <body>, <apiKey>]` — medido nesta máquina (Node 24): `argv[1] = body`, `argv[2] = apiKey`. Logo o filho tinha
**corpo = a chave** e **chave = `undefined`**. Consequência exacta, medida: `https.request({ headers: { 'x-api-key':
undefined } })` lança **síncronamente** `ERR_HTTP_INVALID_HEADER_VALUE` → o filho morre com exit ≠ 0 **antes de abrir
qualquer ligação** → `callHaikuSync` devolve `null` → `arbiter_call outcome:'failed'` → o hook fica com a decisão da
regra. Em produção nunca houve um `ok` real: os **171** `arbiter_call ok` do `decisions.log` desta máquina têm todos
`duration_ms: 0` (170) e `reasoning: "debug investigation"` (171) — são os mocks do `backtest.test.js` a escrever no
log real. Corrigido em `arbiter.js` (dois índices); `arbiter-argv.test.js` prova-o com um servidor local a fingir a
Anthropic (o teste falha com os índices antigos e passa com os novos; `_mockResponse` intacto).

**O que isto muda nas provas anteriores (declaração retroactiva; nada foi re-corrido):**

| Prova | O que dizia | O que passa a valer |
|---|---|---|
| P1 `A-key` / `A-hook` (2026-09-09) | «a regra com chave presente» (acc40 0,350) | **Não afectado.** Os braços A do P1 corriam com `MOOTER_ARBITER_DISABLE=1` explícito (`run.mjs:80,125`); mediam a regra com o sinal de chave, não o arbiter. |
| P5 · braço B «árbitro do Mooter» (2026-09-09) | «20/20 pedidos construídos com o prompt inteiro; destino api.anthropic.com; nada foi transmitido» | **Ainda mais verdade do que dizia.** O pedido era construído **pelo pai** (o `body` JSON com o prompt), e é isso que a instrumentação do `spawnSync` captou. O filho nunca o enviou: com `x-api-key: undefined` o `https.request` lança antes de ligar. O egress medido («nenhum destino externo») fica intacto; a frase «o árbitro monta o pedido» descreve o pai, não uma transmissão. |
| Matriz-12 · D15 (2026-09-10) | «arbiter falha mudo sem saldo» | **Atribuição errada.** O arbiter falhava mudo **com ou sem saldo**: o pedido não chegava a sair. O «D7 — 7 dos 12 caíam nele» descreve quantos prompts entravam no ramo do arbiter, não quantos foram decididos por ele — foram **0**. A conclusão de que «a chave no env dá +15» (M12-c1) vem do sinal de chave em `classify.js:901` (T1 deixa de degradar para T0), não do Haiku. |
| MP1–MP3 (2026-09-21) | «sem chave nesta máquina; o arbiter é no-op» | Verdadeiro pela razão errada: seria no-op mesmo com chave. Nenhum número do decisor-shadow depende do arbiter. |

**O que NÃO se afirma:** que o arbiter Haiku, agora funcional, melhore a rota — nunca foi medido com chave real e em
rede (P5 diz-o; continua a dizer-se). Ligar chave nesta máquina passa a **enviar prompts inteiros** à Anthropic nos
prompts ambíguos — é isso que o bug impedia por acidente. Decisão do dono.
