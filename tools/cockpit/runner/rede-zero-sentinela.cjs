/**
 * rede-zero-sentinela.cjs — a mesma instrumentação, DENTRO do processo filho.
 *
 * Carregada com `--require` via `NODE_OPTIONS`, que o `rede-zero.mjs` põe no
 * ambiente de qualquer filho. Existe porque a sonda de sockets do SO é
 * AMOSTRAGEM, e a amostragem não chega para um processo curto: medido a
 * 2026-08-26, o jscpd sobre `hono` correu em **211 ms** e o knip em **1185 ms**,
 * enquanto uma amostra `Get-NetTCPConnection` custa ~550 ms. A primeira corrida
 * a sério deu `rede_zero: n/d` por isto mesmo — zero amostras em dois filhos.
 * Um `n/d` honesto não é uma prova; é a ausência dela.
 *
 * Aqui não há amostragem: cada tentativa de saída é interceptada no momento em
 * que acontece, escrita no registo e RECUSADA.
 *
 * ── O QUE ESTA SENTINELA É, DESDE 2026-09-11: EVIDÊNCIA, NÃO PROVA ─────────
 *
 * Três lentes adversariais seguidas mostraram a mesma coisa por caminhos
 * diferentes: uma sentinela DENTRO do processo não consegue provar zero rede,
 * porque há sempre uma camada por baixo dela. A 3.ª lente (codex, 2026-09-11)
 * fechou a questão com dois escapes que não passam por API nenhuma de JS:
 *
 *   · `process.binding('tcp_wrap')` — o TCP cru do próprio Node. `TCP.connect`
 *     para `1.1.1.1:80` devolveu 0 (ligado) com `saidas: []`, `addons: []` e
 *     `rede_zero: true`. Não é um addon (não passa por `dlopen`) e não é
 *     `net.Socket` (não passa por `connect`). É o mesmo binding que `net` usa
 *     por dentro — e `internalBinding` é o mesmo buraco um andar abaixo.
 *     **Não se intercepta de propósito**: embrulhar `process.binding` seria
 *     prometer que se conhece a lista de bindings que abrem sockets, e a lista
 *     é do Node, não nossa. Fica registado aqui como o motivo ESTRUTURAL de
 *     esta sentinela não provar nada: o que ela intercepta é uma superfície
 *     de JavaScript, e o processo tem sempre acesso ao que está por baixo dela.
 *   · `worker_threads.Worker` com um `env` sem o `NODE_OPTIONS` — o worker é o
 *     mesmo PID, a sonda do SO não o distingue, e nasceu sem sentinela. HTTP
 *     200 de `example.com` com `rede_zero: true`. Ver `instalarVigiaDeWorkers`.
 *
 * Por isso o que sai daqui mudou de natureza: já não é o que decide o
 * veredicto, é o que fica ANEXADO a ele. Um processo com sentinela e sem
 * isolamento do SO dá `rede_zero: null`, com as saídas interceptadas, os addons,
 * os filhos e os workers anunciados — e um `porque` que diz o que não se viu.
 * Uma saída INTERCEPTADA continua a valer `false`: uma saída vista é uma saída.
 * Só o `true` deixou de existir por esta via. Ver `rede-zero.mjs`.
 *
 * ⚠️ A LISTA DE APIS NÃO É ESCRITA AQUI, e essa é a correcção de 2026-08-26.
 * Até esse dia esta sentinela cobria QUATRO pontos de saída e o pai cobria
 * CINCO. A que faltava era `dns.promises.lookup`, e a lente adversarial provou
 * o resultado: um filho a chamar `dns.promises.lookup` e outro a usar
 * `dns.Resolver` para 192.0.2.1 saíram os dois como `rede_zero: true` com
 * `saidas: []`. Duas listas para a mesma pergunta divergem. Agora há UMA, em
 * `rede-zero-apis.cjs`, e um teste de paridade que parte se os dois lados
 * deixarem de instalar o mesmo conjunto.
 *
 * ⚠️ A CAMADA NATIVA (2026-08-26): só cobre as APIs de JavaScript do processo.
 * Um *addon* nativo carregado por esse processo (é o caso do `jscpd@5`, cujo
 * motor é `jscpd-windows-x64-msvc`) abre sockets sem passar por `net`/`dns`.
 * A sentinela instrumenta `process.dlopen` — o ponto por onde um addon entra —
 * e ANUNCIA cada carregamento. Registamos a TENTATIVA, não o sucesso: um
 * carregamento falhado não abre sockets, mas contá-lo erra para o lado seguro.
 *
 * ⚠️ A TERCEIRA CAMADA (2026-08-26, 2.ª lente): os processos que ESTE processo
 * faz nascer. Um `curl.exe` nascido cá dentro não passa por `net` nem por
 * `dlopen`, e a sonda do SO só olha para o PID deste processo. MEDIDO pela
 * lente: HTTP 200 real e o relatório a dizer `rede_zero: true`. Agora
 * `child_process.*` (e `fork`) é embrulhado e cada nascimento é ANUNCIADO com
 * comando, argumentos e PID. Quem decide se o anunciado ficou coberto é o pai,
 * com o registo inteiro na mão.
 *
 * ⚠️ A QUARTA CAMADA (2026-09-11, 3.ª lente): os workers. Cada `new Worker` é
 * anunciado com o `threadId` e com a previsão de herdar ou não a sentinela; a
 * cobertura é a `sentinela-carregada` que o próprio worker escreve com esse
 * `tid`. Todas as linhas deste ficheiro levam `tid` (0 na thread principal)
 * precisamente para que a linha de um worker não se confunda com a do processo.
 *
 * NÃO decide o que é inerte. A regra vem do pai em `REDE_ZERO_INERTE_RE`, para
 * não haver duas definições de "sair da máquina" neste repositório.
 */

'use strict';

const fs = require('fs');
const { threadId } = require('worker_threads');
const { fazEhInerte, instalarGuardas, instalarVigiaDeFilhos, instalarVigiaDeWorkers } = require('./rede-zero-apis.cjs');

const registo = process.env.REDE_ZERO_REGISTO;
if (registo) {
  const ehInerte = fazEhInerte(process.env.REDE_ZERO_INERTE_RE);

  const anota = (o) => {
    try { fs.appendFileSync(registo, `${JSON.stringify({ pid: process.pid, tid: threadId, ...o })}\n`); } catch { /* um registo que falha não pode matar o filho */ }
  };

  const guardas = instalarGuardas({
    ehInerte,
    aoSaida: (api, alvo) => {
      anota({ ev: 'saida', api, alvo });
      const e = new Error(`rede-zero: ${api} para ${alvo} recusado dentro do processo filho`);
      e.name = 'RedeBloqueada';
      return e;
    },
  });

  // A camada nativa. `process.dlopen` é o ponto único por onde um `.node` entra
  // num processo Node (é o que `Module._extensions['.node']` chama). Não cobre
  // `process.binding`/`internalBinding` — ver o cabeçalho: é o limite
  // estrutural, e está escrito em vez de embrulhado.
  const dlopenOriginal = process.dlopen;
  if (typeof dlopenOriginal === 'function') {
    process.dlopen = function (modulo, ficheiro, ...resto) {
      anota({ ev: 'nativo', ficheiro: String(ficheiro) });
      return dlopenOriginal.call(this, modulo, ficheiro, ...resto);
    };
  }

  // A descendência. Anuncia-se o nascimento — comando, argumentos, PID e se é
  // Node — e nada mais: a sentinela não sabe se o filho dela vai carregar a
  // sentinela (depende do ambiente que lhe passaram). O pai casa o PID
  // anunciado com a `sentinela-carregada` que o próprio neto escreve, ou não.
  // `pid_filho`, e não `pid`: `anota` põe `pid: process.pid` (quem anuncia) e
  // um `pid` aqui sobrepunha-o, atribuindo a linha ao neto em vez do filho.
  const vigia = instalarVigiaDeFilhos({
    aoFilho: ({ api, cmd, args, pid, node }) => anota({ ev: 'filho', api, cmd, args, pid_filho: pid, node }),
  });

  // Os workers. `tid_worker`, pelo mesmo motivo do `pid_filho`.
  const vigiaWorkers = instalarVigiaDeWorkers({
    aoWorker: ({ tid, execArgv, env, herda_sentinela }) => anota({ ev: 'worker', tid_worker: tid, execArgv, env, herda_sentinela }),
  });

  anota({
    ev: 'sentinela-carregada',
    argv: process.argv.slice(1, 3),
    apis: guardas.instaladas.length,
    vigia: vigia.instaladas.length + vigiaWorkers.instaladas.length,
    ts: new Date().toISOString(),
  });
}
