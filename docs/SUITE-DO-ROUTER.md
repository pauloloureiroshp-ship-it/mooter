# A suite do router — o que corre, o que fica de fora, e o que a CI finge

> Medido a 2026-09-01 no mac-mini. Reproduzir: `npm run test:router:quick`,
> `npm run test:router:full`. Nenhum numero aqui foi estimado.

## O facto que muda tudo

**A suite do router nao demora 40 minutos. Ela pendura.**

Corrida inteira, quando termina: **1059 testes, 1058 ok, 1 saltado, 4,3 s.**

O que acontecia era outra coisa. `tools/verify/render_medir.test.js`, corrido
sozinho, cinco vezes:

| tentativa | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| resultado | 25,0 s **pendurou** | 0,1 s ok | 25,0 s **pendurou** | 0,1 s ok | 25,0 s **pendurou** |

Tres em cinco. Quando nao pendura, leva um decimo de segundo. E quando pendura,
o processo **fica**: no dia desta medicao havia um `node --test` do router vivo
ha **2 h 11 m**, de uma sessao anterior. E essa a aritmetica dos "40 minutos" —
ninguem esperou por uma suite lenta, esperou-se por uma suite parada.

**Causa provavel, e fica marcada como PROVAVEL porque nao foi provada:** o
ficheiro e CJS e faz `await import()` de um modulo ESM
(`tools/cockpit/runner/evidence-verifier.mjs`) debaixo do `node --test`. A
intermitencia bate certo com um bloqueio no carregador de modulos, e nao com
trabalho a mais. **NAO foi corrigida nesta onda**: remendar o carregador as
escuras seria trocar um defeito conhecido por um desconhecido. Agora o defeito
conhecido tem numero e tem ficheiro.

Se encontrares um `node --test` do router com dezenas de minutos de `etime`,
mata-o. Nao esta a trabalhar.

## Os dois comandos

```sh
npm run test:router:quick   # 442 testes · 2,8 s · para um portao
npm run test:router:full    # a suite toda, COM TECTO de 300 s
```

Ambos escrevem o TAP num ficheiro e imprimem so o sumario, e ambos **matam ao
fim do tecto e dizem que mataram** — em vez de deixar um processo a apodrecer.

## O que o `quick` deixa de fora, e porque

O criterio **nao e velocidade**: medido ficheiro a ficheiro, nenhum ficheiro da
suite passa de 1,6 s, e os 64 que ficam de fora somam **7,3 s**. O criterio e
*guarda um invariante ou nao*.

| fora do quick | porque |
|---|---|
| `tools/verify/render_medir.test.js` | pendura 3 em 5. E a causa dos "40 minutos". |
| `statusline-*`, `badge-*`, `herd-*`, `glyphs`, `emoji-*` | cobertura de superficie — o que se ve, nao o que decide |
| `wave*-*` | coerencia de ondas passadas; nao muda com uma alteracao de hoje |
| `router-execute.*`, `perf-*`, `speed-meter` | caminho de execucao e desempenho; a CI corre-os |

O que o `quick` **corre** e a lista curta que nao se pode partir em silencio:
o classificador congelado (`classify*`, `user-override-guard`), privacidade
(`privacy`, `sanitize`, `env`), resolucao de modelo e motor local
(`_model-resolver`, `ollama-host`, `ollama_call_node`), quotas, seguranca
(`safety-*`), proveniencia (`ledger-*`, `agent-sync-ledger`, `recibo`) e
paridade de instaladores.

## O que a CI mocka (e que uma corrida local nao mocka)

Isto importa porque um verde na CI **nao** e a mesma afirmacao que um verde
local. Nenhum destes testes toca no mundo real:

- **Motor local (Ollama).** `ollama_call_node.test.js` e `_model-resolver.test.js`
  injectam o `fetch`. A CI nao tem GPU nem Ollama, e nunca prova que o motor
  responde — so que o codigo trata bem uma resposta. Quem prova o motor e o
  `smoke E2E` do cockpit, com um Ollama **falso**, e o `/assist` ao vivo.
- **Provedores pagos.** `providers/providers.test.js` e `providers/deepseek-v4.test.js`
  correm contra respostas gravadas. Nenhuma chave viaja na CI, por desenho.
- **GPU.** `gpu-status`, `vram-detect` e `quantization` leem amostras fixas. A
  CI corre em maquinas sem GPU; um verde aqui nao diz nada sobre hardware.
- **Rede e o hub.** Nada na suite faz uma chamada de rede real.
- **Relogio e fuso.** Os testes injectam o instante. `owner_tz` e
  `America/Sao_Paulo` e a CI corre em UTC — sem injeccao, metade dos testes de
  dia mudava de resultado consoante a hora.

## O agendamento

`tools/ops/moo/launchd/ai.mooter.router-suite.plist` corre a **completa**, de
madrugada, a $0 (e local, nao ha motor pago envolvido). E um **molde** e nao
esta instalado — instalar e um gesto do dono, e o comando esta no cabecalho do
proprio ficheiro.
