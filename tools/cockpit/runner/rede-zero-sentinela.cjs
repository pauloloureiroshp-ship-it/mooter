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
 * ⚠️ A LISTA DE APIS NÃO É ESCRITA AQUI, e essa é a correcção de 2026-08-26.
 * Até esse dia esta sentinela cobria QUATRO pontos de saída e o pai cobria
 * CINCO. A que faltava era `dns.promises.lookup`, e a lente adversarial provou
 * o resultado: um filho a chamar `dns.promises.lookup` e outro a usar
 * `dns.Resolver` para 192.0.2.1 saíram os dois como `rede_zero: true` com
 * `saidas: []`. Duas listas para a mesma pergunta divergem. Agora há UMA, em
 * `rede-zero-apis.cjs`, e um teste de paridade que parte se os dois lados
 * deixarem de instalar o mesmo conjunto.
 *
 * ⚠️ O QUE ESTA SENTINELA CONTINUA A NÃO VER, e agora é MEDIDO em vez de
 * assumido: só cobre as APIs de JavaScript do processo. Um *addon* nativo
 * carregado por esse processo (é o caso do `jscpd@5`, cujo motor é
 * `jscpd-windows-x64-msvc`) abre sockets sem passar por `net`/`dns`. Antes, o
 * pai promovia qualquer filho com sentinela a «medido» e isso APAGAVA o `n/d`
 * que cobria essa cegueira. Agora a sentinela instrumenta `process.dlopen` — o
 * ponto único por onde um addon entra num processo Node — e ANUNCIA cada
 * carregamento. Um processo sem nenhum `dlopen` correu 100% em JavaScript e a
 * intercepção é cobertura completa; um processo COM `dlopen` tem uma camada que
 * só a sonda do SO alcança, e se a sonda não tirou nenhuma amostra o veredicto
 * é `n/d`. Registamos a TENTATIVA de `dlopen`, não o sucesso: um carregamento
 * falhado não abre sockets, mas contá-lo erra para o lado do `n/d`, que é o
 * lado seguro.
 *
 * ⚠️ A TERCEIRA CAMADA (2026-08-26, 2.ª lente): os processos que ESTE processo
 * faz nascer. Com rede e `dlopen` cobertos, o pai promovia um filho sem addons
 * a «instrumentado — não sobra camada por observar». Sobrava: um `curl.exe`
 * nascido cá dentro não passa por `net` nem por `dlopen`, e a sonda do SO só
 * olha para o PID deste processo. MEDIDO pela lente: HTTP 200 real e o
 * relatório a dizer `rede_zero: true`. Agora `child_process.*` (e `fork`) é
 * embrulhado e cada nascimento é ANUNCIADO com comando, argumentos e PID. Quem
 * decide se o anunciado ficou coberto é o pai, com o registo inteiro na mão.
 *
 * NÃO decide o que é inerte. A regra vem do pai em `REDE_ZERO_INERTE_RE`, para
 * não haver duas definições de "sair da máquina" neste repositório.
 */

'use strict';

const fs = require('fs');
const { fazEhInerte, instalarGuardas, instalarVigiaDeFilhos } = require('./rede-zero-apis.cjs');

const registo = process.env.REDE_ZERO_REGISTO;
if (registo) {
  const ehInerte = fazEhInerte(process.env.REDE_ZERO_INERTE_RE);

  const anota = (o) => {
    try { fs.appendFileSync(registo, `${JSON.stringify({ pid: process.pid, ...o })}\n`); } catch { /* um registo que falha não pode matar o filho */ }
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
  // num processo Node (é o que `Module._extensions['.node']` chama). Sem isto,
  // «a sentinela carregou» dizia-se cobertura completa sem nada que o medisse.
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

  anota({
    ev: 'sentinela-carregada',
    argv: process.argv.slice(1, 3),
    apis: guardas.instaladas.length,
    vigia: vigia.instaladas.length,
    ts: new Date().toISOString(),
  });
}
