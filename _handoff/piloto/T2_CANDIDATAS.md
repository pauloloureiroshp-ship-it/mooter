# T2 — 5 candidatas (listadas ANTES do sorteio — protocolo v1.1 §3, Δ F7)

Regras comuns a todas: teste vermelho→verde com `node:test` · APENAS ficheiros novos
(zero conflito com trabalho em curso; `tools/router/classify.js` e packages frozen
intocáveis por construção) · zero dependências novas · o braço escreve primeiro o
teste (vermelho), depois implementa até verde. O driver considera o run terminado
quando o TEST_CMD sai com código 0.

---

## C1 — tempo relativo PT no cockpit

Ficheiros novos: `tools/cockpit/tempo-relativo.js` + `tools/cockpit/tempo-relativo.test.js`
TEST_CMD: `node --test tools/cockpit/tempo-relativo.test.js`

### PROMPT (idêntico nos 3 braços)

```
No repositório actual, cria tools/cockpit/tempo-relativo.js (ESM, zero deps) exportando
tempoRelativo(tsMs, agoraMs): devolve "agora" (<60s ou ts no futuro), "há N min" (<60min),
"há N h" (<24h), "há N d" (resto); tsMs null/undefined/NaN devolve "n/d". Escreve PRIMEIRO
tools/cockpit/tempo-relativo.test.js com node:test cobrindo os 5 ramos e os limites 59s/60s
e 23h/24h, vê-o falhar, depois implementa até todos os testes passarem com
`node --test tools/cockpit/tempo-relativo.test.js`. Não toques em mais nenhum ficheiro.
```

## C2 — parser de mix de tiers de um decisions.log

Ficheiros novos: `packages/mooter-bridge/mix-tiers.js` + `packages/mooter-bridge/mix-tiers.test.js`
TEST_CMD: `node --test packages/mooter-bridge/mix-tiers.test.js`

### PROMPT (idêntico nos 3 braços)

```
No repositório actual, cria packages/mooter-bridge/mix-tiers.js (ESM, zero deps) exportando
mixTiers(jsonl, sessionId): recebe o texto JSONL de um decisions.log e devolve
{porTier: {T0: n, ...}, total, ignoradas} contando só eventos event==="classified" com
session_id===sessionId; linhas malformadas ou de outras sessões contam em "ignoradas";
jsonl vazio devolve {porTier: {}, total: 0, ignoradas: 0}. Escreve PRIMEIRO
packages/mooter-bridge/mix-tiers.test.js com node:test (casos: vazio, 3 tiers misturados,
linha malformada no meio, sessão errada), vê-o falhar, depois implementa até
`node --test packages/mooter-bridge/mix-tiers.test.js` passar. Não toques em mais nenhum ficheiro.
```

## C3 — custo-proxy por tabela de preços injectada

Ficheiros novos: `packages/mooter-bridge/proxy-custo.js` + `packages/mooter-bridge/proxy-custo.test.js`
TEST_CMD: `node --test packages/mooter-bridge/proxy-custo.test.js`

### PROMPT (idêntico nos 3 braços)

```
No repositório actual, cria packages/mooter-bridge/proxy-custo.js (ESM, zero deps) exportando
proxyCusto(usoPorModelo, tabela): usoPorModelo é {modelo: {inputTokens, outputTokens}} e
tabela é {modelo: {input, output}} em USD por milhão de tokens; devolve {porModelo, totalUsd}
com 4 casas decimais; modelo ausente da tabela lança Error com o nome do modelo (nunca
inventar preço); tokens em falta contam como 0. Escreve PRIMEIRO
packages/mooter-bridge/proxy-custo.test.js com node:test (casos: 2 modelos conhecidos,
modelo desconhecido lança, tokens em falta, tabela vazia), vê-o falhar, depois implementa
até `node --test packages/mooter-bridge/proxy-custo.test.js` passar. Não toques em mais nenhum ficheiro.
```

## C4 — validador mínimo de handoff

Ficheiros novos: `packages/mooter-bridge/valida-handoff.js` + `packages/mooter-bridge/valida-handoff.test.js`
TEST_CMD: `node --test packages/mooter-bridge/valida-handoff.test.js`

### PROMPT (idêntico nos 3 braços)

```
No repositório actual, cria packages/mooter-bridge/valida-handoff.js (ESM, zero deps)
exportando validaHandoff(texto): verifica que o texto contém as secções obrigatórias
"STATE:", "TL;DR:", "GATE:" e "NEXT:" (uma por linha, qualquer ordem) e devolve
{valido: boolean, emFalta: [secções ausentes]}; valor "n/d" numa secção é válido;
texto vazio devolve {valido: false, emFalta: [as 4]}. Escreve PRIMEIRO
packages/mooter-bridge/valida-handoff.test.js com node:test (casos: completo, faltam 2,
vazio, "n/d" aceite), vê-o falhar, depois implementa até
`node --test packages/mooter-bridge/valida-handoff.test.js` passar. Não toques em mais nenhum ficheiro.
```

## C5 — estatísticas de FPS a partir de timestamps de frames

Ficheiros novos: `tools/cockpit/fps-stats.js` + `tools/cockpit/fps-stats.test.js`
TEST_CMD: `node --test tools/cockpit/fps-stats.test.js`

### PROMPT (idêntico nos 3 braços)

```
No repositório actual, cria tools/cockpit/fps-stats.js (ESM, zero deps) exportando
fpsStats(timestampsMs): recebe um array de timestamps de frames (ms, crescente) e devolve
{frames, fpsMediana, fpsP95Pior} calculados sobre os deltas entre frames consecutivos
(fps = 1000/delta, mediana e percentil 95 do pior caso, 1 casa decimal); menos de 11
timestamps devolve {frames: n, fpsMediana: null, fpsP95Pior: null}; array não crescente
lança Error. Escreve PRIMEIRO tools/cockpit/fps-stats.test.js com node:test (casos: 60fps
constante, deltas mistos, <11 frames, não crescente lança), vê-o falhar, depois implementa
até `node --test tools/cockpit/fps-stats.test.js` passar. Não toques em mais nenhum ficheiro.
```
