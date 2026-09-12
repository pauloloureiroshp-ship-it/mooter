/**
 * rede-zero.mjs — o "(medido)" do gate da F1.
 *
 * O gate do MP diz, à letra: «0 chamadas de rede durante a corrida (medido)».
 * A palavra que faz trabalho é a última. Este ficheiro existe porque a
 * alternativa — escrever «corre offline» no relatório — é uma promessa, e este
 * projecto já pagou por promessas: o modo ANCORADO esteve 10 624 recibos sem
 * correr e ninguém deu por isso, porque a ausência era silenciosa.
 *
 * ── O MECANISMO ESCOLHIDO, E PORQUE É QUE ELE PROVA O QUE DIZ ───────────────
 *
 * Escolhido: **contar e RECUSAR toda a saída no processo que corre a experiência,
 * e tornar cada processo filho mensurável antes de o deixar nascer.**
 *
 * A instrumentação sozinha seria um guarda que NUNCA podia falhar em produção,
 * porque os três produtores da F1 são todos processos filhos: o semgrep corre em
 * WSL, o jscpd é um binário nativo, o knip é outro processo Node. Um contador no
 * processo-pai que conta sempre zero, façam os filhos o que fizerem, é
 * exactamente o que o enunciado desta tarefa chama «um guarda indistinguível de
 * um partido».
 *
 * Por isso o mecanismo tem duas metades, e é uma só coisa:
 *
 *  1. **No processo** — a lista de saídas está em `rede-zero-apis.cjs` e é
 *     instalada aqui e dentro dos filhos pelo MESMO instalador. Cada tentativa
 *     para fora é REGISTADA e a seguir ATIRA. Contar e bloquear na mesma camada
 *     é deliberado: se só contasse, um produtor podia falar para fora e o
 *     relatório dizia «1 chamada» com os dados já enviados. Loopback e IPC são
 *     registados à parte e deixados passar — é a mesma linha que o
 *     `runner-core.assertLocalEngine` já traça, e o painel do cockpit vive em
 *     loopback.
 *
 *  2. **Nos filhos** — `child_process.spawn/execFile/exec` (e as variantes
 *     síncronas) passam por um ponto único que REGISTA o filho com o seu argv.
 *     E cada filho tem de trazer a sua própria medição, numa de quatro
 *     qualidades:
 *
 *       · `bloqueado`     — o processo correu dentro de um espaço de nomes de
 *                           rede sem interfaces (`unshare -rn` no WSL). Não é
 *                           observação, é construção: não há rota nenhuma para
 *                           haver chamada. É o caminho do semgrep, e é o mais
 *                           forte, porque a tabela de sockets do Windows NÃO VÊ
 *                           para dentro da VM do WSL.
 *       · `instrumentado` — a sentinela entrou no filho por
 *                           `NODE_OPTIONS=--require` e interceptou lá dentro.
 *                           **Só vale como medição completa se a camada nativa
 *                           desse processo também estiver coberta** — ver
 *                           abaixo.
 *       · `sondado`       — a tabela de sockets do SO foi lida pelo PID do
 *                           filho, N vezes durante a vida dele. É observação:
 *                           uma ligação curta entre duas amostras escapa.
 *                           Medido a 2026-08-26, uma amostra custa ~550 ms e o
 *                           jscpd corre em 211 ms.
 *       · `n/d`           — não se conseguiu medir.
 *
 * ── A CORRECÇÃO DE 2026-08-26: A PROMOÇÃO QUE APAGAVA O `n/d` ──────────────
 *
 * Até hoje, a linha que dizia «sentinela-carregada» promovia o filho de `n/d`
 * (ou de `sondado` com zero amostras) para `instrumentado`, incondicionalmente.
 * Uma lente adversarial mostrou o que isso faz: o jscpd — cujo motor é um addon
 * NATIVO de 3,7 MB, que a sentinela por construção não vê — saía do relatório
 * como `instrumentado`, ou seja «plenamente medido», tendo a sonda do SO tirado
 * ZERO amostras. O mecanismo escrito para impedir que «não medi» virasse «medi
 * zero» era o que estava a fazê-lo.
 *
 * A promoção continua a existir, mas deixou de ser um acto de fé: a sentinela
 * instrumenta `process.dlopen` — o ponto único por onde um addon nativo entra
 * num processo Node — e o filho ANUNCIA quantos carregou. A isso a 2.ª lente
 * (abaixo) acrescentou um terceiro eixo: os processos que o filho faz nascer.
 * Daí saem os casos seguintes, e só os dois primeiros são medição:
 *
 *   sentinela + 0 addons + 0 filhos por cobrir → `instrumentado`. O processo
 *                                              correu 100% em JavaScript e não
 *                                              fez nascer nada que a sentinela
 *                                              não tenha voltado a apanhar.
 *   sentinela + N addons + ≥1 amostra da sonda → `instrumentado`. A camada de JS
 *                                              por intercepção, a nativa por
 *                                              observação, e o número de amostras
 *                                              viaja no relatório.
 *   sentinela + N addons + 0 amostras        → `n/d`. É o caso do jscpd. A camada
 *                                              onde o trabalho corre não foi
 *                                              observada nem uma vez, e dizer
 *                                              «medido» seria a mentira exacta
 *                                              que este ficheiro veio impedir.
 *   sentinela + ≥1 filho anunciado por cobrir → `n/d`, com o comando no `porque`.
 *
 * ── A 2.ª LENTE (2026-08-26): O NETO QUE NÃO É NODE ─────────────────────────
 *
 * O ramo `0 addons` dizia «não sobra camada por observar». Sobrava o
 * `child_process`: a sentinela cobria rede e `dlopen`, não o que o filho faz
 * nascer, e a sonda do SO pergunta pelo PID do filho, não pela árvore. Um filho
 * Node instrumentado que lançasse `curl.exe` não deixava rasto. MEDIDO pela
 * lente, com a sonda real do Windows: HTTP 200 de `172.66.147.243` e o
 * relatório a dizer `rede_zero: true · todos medidos`.
 *
 * Agora a sentinela embrulha também `child_process.spawn/spawnSync/exec/
 * execFile/execFileSync/execSync/fork` e ANUNCIA cada nascimento
 * (`{ev:'filho', api, cmd, args, pid, node}`). Com o registo inteiro na mão, este
 * ficheiro casa cada anunciado com a `sentinela-carregada` que o próprio neto
 * escreve: anunciado que É Node e que se anunciou a si próprio → coberto (fica
 * em `auditoria.descendentes`, com as mesmas regras de camada); anunciado que
 * não é Node, ou que é Node mas nunca se anunciou (ambiente montado à mão sem
 * `NODE_OPTIONS`, `shell: true`, nascimento falhado) → o filho que o lançou
 * fica `n/d` e o `porque` nomeia o comando.
 *
 * ── DESCENDENTES QUE ESTE RAMO NÃO REGISTOU ────────────────────────────────
 *
 * O comentário que aqui estava dizia «um produtor não consegue nascer sem ficar
 * no registo». Era FALSO e foi medido: `import { spawn } from 'node:child_process'`
 * captura a referência no carregamento do módulo e passa ao lado da substituição
 * (`import{spawn} vê a substituição? false`). Um filho assim não aparecia em
 * `auditoria.filhos` e o veredicto era `true` com um processo por medir.
 *
 * Não há forma de fechar isso do lado do `child_process` — uma referência já
 * capturada é uma referência já capturada. O que se faz agora é apanhá-lo do
 * outro lado: durante a medição, o `NODE_OPTIONS` do PRÓPRIO processo leva a
 * sentinela, portanto qualquer descendente Node que herde o ambiente
 * ANUNCIA-SE, tenha nascido pelo ponto de registo ou não. Fica em
 * `auditoria.descendentes`, com as mesmas regras de camada.
 *
 * O que continua a escapar, e fica escrito em vez de prometido:
 *   · um descendente NÃO-Node nascido NESTE processo por uma referência ao
 *     `spawn` capturada antes de `medirRede` trocar o ponto de registo. A
 *     sentinela não corre neste processo (só entra pelo `--require` dos
 *     filhos), e a sonda do SO não sabe o PID dele. O teste que exige
 *     `spawnVivo` nos três adaptadores tranca só os três adaptadores — não
 *     diz nada sobre outra biblioteca que este processo importe;
 *   · um processo lançado por um addon nativo sem passar pelo `child_process`
 *     de JavaScript, num filho que a sonda chegou a amostrar (o addon conta,
 *     as amostras cobrem-no, e o que ele lança fica fora das duas);
 *   · a reutilização de PID pelo SO dentro de uma corrida: um neto anunciado
 *     cujo PID calhe ao de um Node que se anunciou. Não medido; declarado.
 *
 * E daí sai um resultado de TRÊS estados:
 *
 *      rede_zero = false  há tentativa registada, ou um descendente com saída
 *      rede_zero = null   nasceu um processo que NÃO se conseguiu medir, ou o
 *                         registo das sentinelas tem linhas partidas
 *      rede_zero = true   zero tentativas e TODOS os processos medidos a zero
 *
 * `null` não é `true`. Não medido nunca é medido-zero.
 *
 * O que isto NÃO prova: não bloqueia a rede aos filhos ao nível do SO (isso
 * exigia regra de firewall, ou seja, administrador). O que faz aos filhos é
 * (a) dar-lhes um ambiente hostil e (b) exigir que cada um traga medição própria
 * ou se declare `n/d`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const apis = require_('./rede-zero-apis.cjs');

/**
 * Porta do loopback escolhida para onde apontar os proxies dos filhos. Não tem
 * nada à escuta de propósito: uma biblioteca que respeite `HTTP_PROXY` falha em
 * vez de sair, e a falha é ruidosa.
 */
export const PORTA_PROXY_MORTA = 9;

/** De quanto em quanto tempo se lê a tabela de sockets de um filho vivo. */
export const INTERVALO_SONDA_MS = 250;

/**
 * A ÚNICA definição de "isto não sai da máquina" deste ramo. Vive em
 * `rede-zero-apis.cjs` porque a sentinela que corre dentro dos filhos precisa da
 * mesma, e recebe-a por ambiente (`REDE_ZERO_INERTE_RE`) em vez de trazer uma
 * cópia sua.
 *
 * Inclui os endereços NÃO-ESPECIFICADOS (`0.0.0.0`, `::`, `*`). Até 2026-08-26
 * havia duas definições — `ehLoopback` sem eles e `remotoInerte` com eles — e a
 * divergência produzia um falso positivo medido: `dgram.bind(0)`, um socket
 * local sem destino nenhum, passa por `dns.lookup('0.0.0.0')` e o veredicto ia a
 * `false` com a corrida morta por dentro.
 */
export const RE_INERTE = apis.RE_INERTE;
export const METODOS_RESOLVER = apis.METODOS_RESOLVER;
/** O instalador partilhado. Exportado para que o teste de PARIDADE o possa contar. */
export const instalarGuardas = apis.instalarGuardas;
/** O vigia de `child_process` que a sentinela instala nos filhos. Exportado para o testar em processo. */
export const instalarVigiaDeFilhos = apis.instalarVigiaDeFilhos;
export const pareceNode = apis.pareceNode;

/** Loopback (e o não-especificado) não é rede. Uma fronteira, um predicado. */
export const ehInerte = apis.fazEhInerte(RE_INERTE);

/** O ficheiro `.cjs` que os filhos Node carregam com `--require`. */
export const SENTINELA = fileURLToPath(new URL('./rede-zero-sentinela.cjs', import.meta.url));

export class RedeBloqueada extends Error {
  constructor(api, alvo) {
    super(`rede-zero: ${api} para ${alvo} recusado — a corrida da F1 é offline por construção`);
    this.name = 'RedeBloqueada';
    this.api = api;
    this.alvo = alvo;
  }
}

/** Extrai o destino de um `Socket.prototype.connect`. Ver `rede-zero-apis.cjs`. */
export function alvoDoConnect(args) {
  return apis.alvoDoConnect(args, ehInerte);
}

/**
 * A sonda do Windows: lê a tabela de sockets pelo PID. Devolve os endereços
 * remotos e a contagem de endpoints UDP.
 *
 * Medido a 2026-08-26 nesta máquina: ~557 ms por amostra (`Get-NetTCPConnection`
 * + `Get-NetUDPEndpoint` num PID de node vivo). É lento o suficiente para que
 * valha a pena dizer quantas amostras foram tiradas em vez de fingir contínuo.
 */
export function sondaWindows(spawnOriginal) {
  return async (pid) => {
    const ps = [
      "$ErrorActionPreference='SilentlyContinue';",
      `$t=@(Get-NetTCPConnection -OwningProcess ${pid} | Select-Object -ExpandProperty RemoteAddress);`,
      `$u=@(Get-NetUDPEndpoint -OwningProcess ${pid}).Count;`,
      "[Console]::Out.Write((($t -join ',') + '|' + $u))",
    ].join(' ');
    const saida = await new Promise((resolve) => {
      let buf = '';
      let p;
      try {
        p = spawnOriginal('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
          windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch { resolve(null); return; }
      p.stdout.on('data', (d) => { buf += String(d); });
      p.on('error', () => resolve(null));
      p.on('close', () => resolve(buf));
    });
    if (saida === null) return null;
    const [tcp, udp] = String(saida).split('|');
    const remotos = String(tcp || '').split(',').map((s) => s.trim()).filter((s) => s && !ehInerte(s));
    return { remotos, udp: Number(udp) || 0 };
  };
}

/**
 * O ambiente hostil que qualquer filho recebe. Não é prova — é a segunda
 * fechadura. Uma biblioteca que honre proxy falha; uma que não honre continua a
 * depender da medição do filho.
 */
export function ambienteHostil(base = process.env, porta = PORTA_PROXY_MORTA, { registo = null, sentinela = SENTINELA } = {}) {
  const morto = `http://127.0.0.1:${porta}`;
  // `--require` da sentinela: é o que torna um filho Node mensurável SEM
  // amostragem. Acrescenta-se ao `NODE_OPTIONS` que já exista em vez de o
  // substituir — apagar o do utilizador seria mudar o que se mede.
  // Barras PARA A FRENTE, e não é cosmética: MEDIDO a 2026-08-26, o parser do
  // `NODE_OPTIONS` trata `\` como escape dentro de aspas, e o caminho do Windows
  // chegou ao filho como `C:UsersPaulo Loureiro...` — o knip e o jscpd morreram
  // ambos com `Cannot find module`.
  const nodeOptions = registo
    ? `${base.NODE_OPTIONS ? `${base.NODE_OPTIONS} ` : ''}--require "${String(sentinela).split('\\').join('/')}"`
    : base.NODE_OPTIONS;
  return {
    ...base,
    HTTP_PROXY: morto, HTTPS_PROXY: morto, ALL_PROXY: morto,
    http_proxy: morto, https_proxy: morto, all_proxy: morto,
    NO_PROXY: '', no_proxy: '',
    // Desliga a telemetria dos próprios produtores à cabeça. Não substitui a
    // medição: existe para que a medição não tenha de apanhar o óbvio.
    SEMGREP_SEND_METRICS: 'off',
    DO_NOT_TRACK: '1',
    npm_config_offline: 'true',
    ...(registo ? { NODE_OPTIONS: nodeOptions, REDE_ZERO_REGISTO: registo, REDE_ZERO_INERTE_RE: RE_INERTE } : {}),
  };
}

/**
 * Lê o registo que as sentinelas dos filhos escreveram e agrupa-o por PID.
 * Uma linha ilegível é contada, nunca engolida — e `partidas` tem de chegar a
 * `auditar()`: até à 2.ª lente o único chamador de produção fazia
 * `const { porPid } = …` e uma saída truncada (o filho morto a meio do
 * `appendFileSync`) desaparecia com o veredicto a subir a `true`.
 */
export function lerRegistoDosFilhos(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto;
  try { bruto = String(readImpl(caminho, 'utf8')); } catch { return { porPid: new Map(), partidas: 0 }; }
  const porPid = new Map();
  let partidas = 0;
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    let e;
    try { e = JSON.parse(linha); } catch { partidas += 1; continue; }
    if (!e || !Number.isInteger(e.pid)) { partidas += 1; continue; }
    if (!porPid.has(e.pid)) porPid.set(e.pid, { carregada: false, saidas: [], addons: [], apis: null, filhos: [] });
    const r = porPid.get(e.pid);
    // `apis` é quantos pontos de saída a sentinela instalou LÁ DENTRO. É o que
    // torna a paridade com o pai verificável através da fronteira do processo,
    // em vez de ser uma promessa de que os dois ficheiros estão de acordo.
    if (e.ev === 'sentinela-carregada') { r.carregada = true; r.apis = Number.isInteger(e.apis) ? e.apis : null; }
    else if (e.ev === 'saida') r.saidas.push({ api: e.api, alvo: e.alvo });
    // A camada NATIVA do filho: cada `.node` que ele carregou. Zero destes é a
    // única prova de que a intercepção de JavaScript cobre o processo inteiro.
    else if (e.ev === 'nativo') r.addons.push(String(e.ficheiro || '?'));
    // A DESCENDÊNCIA do filho: cada processo que ele fez nascer, tal como a
    // sentinela o anunciou. Se ficou coberto ou não decide-se em `medirRede`,
    // com o registo inteiro — aqui só se guarda o que foi dito.
    else if (e.ev === 'filho') {
      r.filhos.push({
        api: String(e.api || '?'),
        cmd: String(e.cmd || '?'),
        args: Array.isArray(e.args) ? e.args.map(String) : [],
        // `pid_filho`: o `pid` da linha é quem anuncia, não quem nasceu.
        pid: Number.isInteger(e.pid_filho) ? e.pid_filho : null,
        node: e.node === true,
      });
    }
  }
  return { porPid, partidas };
}

/**
 * O nome com que um filho anunciado aparece no `porque`: comando + até 4
 * argumentos, e o motivo de não estar coberto quando não é o óbvio. MEDIDO:
 * `execFileSync`/`execSync` devolvem o stdout, não o PID — em sucesso um neto
 * Node lançado assim não se consegue casar com a sua `sentinela-carregada`, e
 * fica por cobrir com o motivo escrito (em falha o erro traz o PID).
 */
function nomearAnunciado(f) {
  const args = (f.args || []).slice(0, 4).join(' ');
  const nome = `${f.cmd}${args ? ` ${args}` : ''}${(f.args || []).length > 4 ? ' …' : ''}`;
  if (f.node && f.pid === null) return `${nome} [Node, mas ${f.api} não devolveu o PID: não se casa com sentinela nenhuma]`;
  if (f.node) return `${nome} [Node sem sentinela-carregada no pid ${f.pid}]`;
  return nome;
}

/**
 * Aplica as regras de camada a um processo com sentinela carregada. Separada
 * para poder ser testada sem correr nada — é aqui que mora a decisão que a
 * lente adversarial derrubou (duas vezes: a promoção cega com addons, e depois
 * a frase «não sobra camada por observar» com um `curl.exe` a sair a sério).
 *
 * `filhos` são os processos que ESTE processo fez nascer, cada um já com
 * `coberto` decidido por quem tem o registo inteiro: `true` só quando o
 * anunciado é Node E escreveu a sua própria `sentinela-carregada`.
 */
export function classificarPorCamadas({ saidas = [], addons = [], amostras = 0, filhos = [] }) {
  const js = `${saidas.length} saída(s) de JavaScript interceptada(s)`;
  const porCobrir = filhos.filter((f) => !f.coberto);
  const descendencia = filhos.length === 0
    ? '0 filhos anunciados'
    : `${filhos.length} filho(s) anunciado(s), ${filhos.length - porCobrir.length} coberto(s) pela sentinela`;

  const buracos = [];
  if (porCobrir.length > 0) {
    buracos.push(`fez nascer ${porCobrir.length} processo(s) que a sentinela não cobre e a sonda do SO não apontou: ${porCobrir.map(nomearAnunciado).join(', ')}`);
  }
  if (addons.length > 0 && amostras === 0) {
    buracos.push(`carregou ${addons.length} addon(s) nativo(s) e a sonda do SO não tirou UMA amostra: a camada onde esse código corre não foi observada`);
  }
  if (buracos.length > 0) {
    return {
      estado: 'n/d',
      porque: `a camada de JavaScript foi interceptada (${js}), mas o processo ${buracos.join('; e ')}`,
    };
  }
  if (addons.length === 0) {
    return {
      estado: 'instrumentado',
      porque: `sentinela dentro do processo: ${js}; ZERO addons nativos carregados; ${descendencia}`,
    };
  }
  return {
    estado: 'instrumentado',
    porque: `sentinela dentro do processo: ${js}; ${addons.length} addon(s) nativo(s) cobertos por ${amostras} amostra(s) da sonda do SO; ${descendencia}`,
  };
}

/**
 * Decide o veredicto a partir do que foi registado. Separado de `medirRede`
 * para poder ser testado sem correr nada — é a função que tem de recusar
 * transformar "não medi" em "medi zero".
 *
 * `partidas` é o número de linhas do registo das sentinelas que não se
 * conseguiram ler. Uma saída que um filho começou a escrever e não acabou é
 * uma saída registada: nunca pode virar zero. Uma saída ENCONTRADA ganha à
 * mesma (`false`); sem nenhuma, `partidas > 0` é `null`.
 */
export function auditar({ chamadas = [], loopback = [], ipc = [], filhos = [], descendentes = [], partidas = 0 } = {}) {
  // Um descendente com saída é o antigo "neto": um processo que este ramo não
  // registou mas que a sentinela viu. Estar um nível abaixo não é estar de fora.
  const netos = descendentes.flatMap((d) => (d.sonda.saidas || []).map((s) => ({ pid: d.pid, ...s })));
  const naoMedidos = [...filhos, ...descendentes].filter((f) => f.sonda.estado === 'n/d');
  // Um destino visto pela sonda do SO e um destino que a sentinela apanhou
  // DENTRO do filho contam o mesmo: os dois são saída observada.
  const comRemoto = filhos.filter((f) => (f.sonda.remotos || []).length > 0 || (f.sonda.saidas || []).length > 0);

  let rede_zero;
  let porque;
  if (chamadas.length > 0) {
    rede_zero = false;
    porque = `${chamadas.length} tentativa(s) de saída no processo: ${chamadas.map((c) => `${c.api}→${c.alvo}`).join(', ')}`;
  } else if (comRemoto.length > 0) {
    rede_zero = false;
    porque = `${comRemoto.length} filho(s) com destino remoto observado: ${comRemoto.map((f) => `${f.cmd}→${[...(f.sonda.remotos || []), ...(f.sonda.saidas || []).map((x) => x.alvo)].join('/')}`).join(', ')}`;
  } else if (netos.length > 0) {
    rede_zero = false;
    porque = `${netos.length} saída(s) de processos descendentes: ${netos.map((n) => `pid ${n.pid}→${n.alvo}`).join(', ')}`;
  } else if (naoMedidos.length > 0 || partidas > 0) {
    rede_zero = null;
    const motivos = [];
    if (partidas > 0) {
      motivos.push(`${partidas} linha(s) do registo das sentinelas partida(s)/ilegível(eis): uma saída que um filho começou a escrever e não acabou não pode contar como zero`);
    }
    if (naoMedidos.length > 0) {
      motivos.push(`${naoMedidos.length} de ${filhos.length + descendentes.length} processo(s) sem medição — ${naoMedidos.map((f) => `${f.cmd}: ${f.sonda.porque}`).join('; ')}`);
    }
    porque = motivos.join('; ');
  } else {
    rede_zero = true;
    porque = (filhos.length + descendentes.length) === 0
      ? '0 tentativas de saída no processo e nenhum filho nasceu'
      : `0 tentativas de saída no processo; ${filhos.length + descendentes.length} processo(s), todos medidos: `
        + [...filhos, ...descendentes].map((f) => `${f.cmd}=${f.sonda.estado}${f.sonda.estado === 'sondado' ? `(${f.sonda.amostras} amostra(s))` : ''}`).join(', ');
  }

  return {
    rede_zero,
    porque,
    chamadas,
    loopback_permitido: loopback.length,
    ipc_permitido: ipc.length,
    filhos,
    descendentes,
    netos,
    partidas,
  };
}

/**
 * Corre `fn` com a instrumentação ligada e devolve `{ resultado, auditoria }`.
 *
 * `fn` recebe um contexto com `declararFilhoMedido` — é assim que um adaptador
 * que SABE medir-se a si próprio (o do semgrep, com `unshare -rn`) declara a sua
 * medição em vez de ficar à mercê de uma sonda que não o consegue ver.
 */
export async function medirRede(fn, {
  sondaImpl = null,
  intervaloSondaMs = INTERVALO_SONDA_MS,
  plataforma = process.platform,
  // O registo onde as sentinelas dos filhos escrevem. `null` desliga a
  // sentinela — usado nos testes que querem exercitar SÓ a sonda do SO.
  registo = path.join(os.tmpdir(), `rede-zero-${process.pid}-${Date.now()}.jsonl`),
} = {}) {
  const chamadas = [];
  const loopback = [];
  const ipc = [];
  const filhos = [];

  // Guardadas ANTES de substituir seja o que for: a sonda do SO precisa de
  // nascer sem passar pelo ponto de registo, senão sonda-se a si própria para
  // sempre.
  const spawnOriginal = child_process.spawn;
  const originais = {
    spawn: child_process.spawn,
    spawnSync: child_process.spawnSync,
    execFile: child_process.execFile,
    execFileSync: child_process.execFileSync,
    exec: child_process.exec,
    execSync: child_process.execSync,
  };

  const sonda = sondaImpl || (plataforma === 'win32' ? sondaWindows(spawnOriginal) : null);
  const motivoSemSonda = sondaImpl
    ? null
    : (plataforma === 'win32' ? null : `sem sonda de sockets para a plataforma ${plataforma}`);

  // O ambiente dos filhos é calculado com o `process.env` de ANTES da mutação
  // abaixo — senão o `--require` entrava duas vezes.
  const ambiente = ambienteHostil(process.env, PORTA_PROXY_MORTA, { registo });

  // ── camada 1: as saídas do próprio processo ──────────────────────────────
  //
  // Uma só lista de APIs, partilhada com a sentinela dos filhos. A separação
  // entre "registar" e "recusar" existe porque a primeira versão deste ficheiro
  // rejeitava as promessas (`fetch`, `dns.promises`) sem passar pelo registo:
  // recusava a chamada e depois dizia `rede_zero: true`.
  const guardas = apis.instalarGuardas({
    ehInerte,
    aoSaida: (api, alvo) => {
      chamadas.push({ api, alvo, ts: new Date().toISOString() });
      return new RedeBloqueada(api, alvo);
    },
    aoLocal: (api, alvo) => { (api === 'ipc' ? ipc : loopback).push({ api: api === 'ipc' ? 'net.connect' : api, alvo }); },
  });

  // ── camada 2: o ponto único por onde os filhos nascem ────────────────────

  const vivos = new Map(); // pid -> registo

  const novoRegisto = (cmd, args, extra = {}) => {
    const r = {
      cmd: String(cmd),
      args: (args || []).map(String),
      pid: null,
      sonda: {
        estado: 'n/d', remotos: [], udp_max: 0, amostras: 0, porque: 'ainda não medido',
        js: 'n/d', nativo: 'n/d', addons: [], saidas: [], filhos: [],
      },
      ...extra,
    };
    filhos.push(r);
    return r;
  };

  const declararNaoMedivel = (r, porque) => {
    r.sonda = { ...r.sonda, estado: 'n/d', remotos: [], udp_max: 0, amostras: 0, porque };
  };

  child_process.spawn = function (cmd, args, opts) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    const filho = originais.spawn.call(this, cmd, args, opts);
    r.pid = filho.pid ?? null;
    if (!sonda) declararNaoMedivel(r, motivoSemSonda || 'sem sonda disponível');
    else if (r.pid === null) declararNaoMedivel(r, 'o processo não devolveu PID');
    else {
      r.sonda = { ...r.sonda, estado: 'sondado', porque: null };
      vivos.set(r.pid, r);
      filho.on('exit', () => vivos.delete(r.pid));
      filho.on('error', () => vivos.delete(r.pid));
    }
    return filho;
  };

  // As variantes síncronas bloqueiam o event loop: não há como sondar o PID
  // enquanto correm. Ficam registadas e declaradas `n/d` — o que empurra
  // `rede_zero` para `null` e força quem as usa a mudar para `spawn`.
  const marcarSincrono = (nome, orig) => function (cmd, args, ...resto) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    declararNaoMedivel(r, `${nome} é síncrono: o PID não é sondável enquanto corre`);
    return orig.call(this, cmd, args, ...resto);
  };
  child_process.spawnSync = marcarSincrono('spawnSync', originais.spawnSync);
  child_process.execFileSync = marcarSincrono('execFileSync', originais.execFileSync);
  child_process.execFile = function (cmd, args, ...resto) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    declararNaoMedivel(r, 'execFile não expõe o PID a tempo de o sondar; usa spawn');
    return originais.execFile.call(this, cmd, args, ...resto);
  };
  child_process.exec = function (linha, ...resto) {
    const r = novoRegisto(linha, []);
    declararNaoMedivel(r, 'exec passa por uma shell e não é sondável; usa spawn');
    return originais.exec.call(this, linha, ...resto);
  };
  child_process.execSync = function (linha, ...resto) {
    const r = novoRegisto(linha, []);
    declararNaoMedivel(r, 'execSync é síncrono e passa por uma shell; usa spawn');
    return originais.execSync.call(this, linha, ...resto);
  };

  // ── camada 3: os descendentes que NÃO nascem pelo ponto de registo ───────
  //
  // Uma referência ao `spawn` capturada no import passa ao lado da camada 2 —
  // medido, e é o defeito que o comentário antigo negava. Pondo a sentinela no
  // `NODE_OPTIONS` do PRÓPRIO processo, qualquer descendente Node que herde o
  // ambiente anuncia-se à mesma. Restaurado no `finally`.
  const envAntes = registo
    ? { NODE_OPTIONS: process.env.NODE_OPTIONS, REDE_ZERO_REGISTO: process.env.REDE_ZERO_REGISTO, REDE_ZERO_INERTE_RE: process.env.REDE_ZERO_INERTE_RE }
    : null;
  if (registo) {
    process.env.NODE_OPTIONS = ambiente.NODE_OPTIONS;
    process.env.REDE_ZERO_REGISTO = registo;
    process.env.REDE_ZERO_INERTE_RE = RE_INERTE;
  }

  let aSondar = false;
  const amostrar = async () => {
    if (aSondar || !sonda) return;
    aSondar = true;
    try {
      for (const [pid, r] of [...vivos.entries()]) {
        const v = await sonda(pid);
        if (!v) continue;
        r.sonda.amostras += 1;
        for (const a of v.remotos) if (!r.sonda.remotos.includes(a)) r.sonda.remotos.push(a);
        r.sonda.udp_max = Math.max(r.sonda.udp_max, v.udp || 0);
      }
    } finally { aSondar = false; }
  };

  const relogio = sonda ? setInterval(() => { amostrar(); }, intervaloSondaMs) : null;
  if (relogio && relogio.unref) relogio.unref();

  let resultado;
  try {
    resultado = await fn({
      // Um adaptador que se mede a si próprio declara-o aqui. É o caminho do
      // semgrep: a tabela de sockets do Windows não vê para dentro do WSL, e
      // sondar `wsl.exe` daria um zero cego.
      declararFilhoMedido: ({ cmd, args = [], estado, porque, amostras = 1 }) => {
        const r = novoRegisto(cmd, args, { declarado: true });
        r.sonda = { ...r.sonda, estado, amostras, porque };
        return r;
      },
      // Marca um filho JÁ REGISTADO, pelo PID com que nasceu.
      //
      // `declararFilhoMedido` cria um registo NOVO, e é isso que estava a
      // inflacionar a cardinalidade: o processo do semgrep contava duas vezes —
      // uma como `sondado` (a leitura cega da tabela de sockets do Windows,
      // que não vê para dentro da VM do WSL) e outra como `bloqueado`. «5
      // filhos, TODOS medidos» tinha denominador 4 e incluía duas observações
      // cegas rotuladas como medições. Aqui há um processo e um registo.
      marcarFilhoPorPid: (pid, { estado, porque, amostras = 1 }) => {
        const r = filhos.find((f) => f.pid !== null && f.pid === pid);
        if (!r) return null;
        r.declarado = true;
        r.sonda = { ...r.sonda, estado, amostras, porque };
        return r;
      },
      ambiente,
    });
  } finally {
    if (relogio) clearInterval(relogio);
    guardas.restaurar();
    child_process.spawn = originais.spawn;
    child_process.spawnSync = originais.spawnSync;
    child_process.execFile = originais.execFile;
    child_process.execFileSync = originais.execFileSync;
    child_process.exec = originais.exec;
    child_process.execSync = originais.execSync;
    if (envAntes) {
      for (const [k, v] of Object.entries(envAntes)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  }

  // A sentinela dos filhos: prova por INTERCEPÇÃO, não por amostragem. Uma
  // linha `sentinela-carregada` com o PID do filho é a prova de que ela correu
  // mesmo lá dentro; sem ela não se conclui nada, porque um ficheiro vazio é
  // igual quer o filho tenha estado calado quer a sentinela nunca tenha entrado.
  const { porPid, partidas } = lerRegistoDosFilhos(registo);
  const pidsDeFilhos = new Set(filhos.map((f) => f.pid).filter((x) => x !== null));

  // A cobertura de um processo ANUNCIADO por uma sentinela: só conta como
  // coberto se é Node E a sua própria sentinela escreveu `sentinela-carregada`
  // com esse PID. Um `curl.exe` nunca é coberto; um Node lançado com um
  // ambiente sem `NODE_OPTIONS` (ou por `shell: true`, cujo PID é o da shell)
  // também não — e o filho que o lançou fica `n/d` a nomeá-lo.
  const coberto = (f) => f.node === true && f.pid !== null && porPid.has(f.pid) && porPid.get(f.pid).carregada === true;
  const anunciadosDe = (v) => (v.filhos || []).map((f) => ({ ...f, coberto: coberto(f) }));
  // pid do neto → quem o anunciou, para o rotular no relatório.
  const anunciadoPor = new Map();
  for (const [pid, v] of porPid) for (const f of v.filhos || []) if (f.pid !== null) anunciadoPor.set(f.pid, { pid, cmd: f.cmd });

  for (const r of filhos) {
    const v = r.pid !== null ? porPid.get(r.pid) : null;
    if (!v || !v.carregada) continue;
    r.sonda.saidas = v.saidas;
    r.sonda.addons = v.addons;
    r.sonda.apis = v.apis;
    r.sonda.filhos = anunciadosDe(v);
    r.sonda.js = 'intercetado';
    r.sonda.nativo = v.addons.length === 0 ? 'sem-addons' : `${v.addons.length} addon(s)`;
    r.sonda.instrumentado = true;
    // NUNCA se rebaixa um `bloqueado` (prova por construção) nem se toca no que
    // o adaptador declarou. E a promoção só acontece pelas regras de camada.
    if (!r.declarado && (r.sonda.estado === 'n/d' || r.sonda.estado === 'sondado')) {
      const c = classificarPorCamadas({ saidas: v.saidas, addons: v.addons, amostras: r.sonda.amostras, filhos: r.sonda.filhos });
      r.sonda.estado = c.estado;
      r.sonda.porque = c.porque;
    }
  }

  const descendentes = [];
  for (const [pid, v] of porPid) {
    if (pidsDeFilhos.has(pid) || !v.carregada) continue;
    // Nunca foi sondado: este ramo não soube o PID a tempo. Logo `amostras: 0`.
    const anunciados = anunciadosDe(v);
    const c = classificarPorCamadas({ saidas: v.saidas, addons: v.addons, amostras: 0, filhos: anunciados });
    const pai = anunciadoPor.get(pid);
    descendentes.push({
      cmd: pai
        ? `descendente anunciado pelo pid ${pai.pid}: ${pai.cmd} (pid ${pid})`
        : `descendente não registado (pid ${pid})`,
      pid,
      args: [],
      sonda: {
        estado: c.estado, porque: c.porque, remotos: [], udp_max: 0, amostras: 0,
        js: 'intercetado', nativo: v.addons.length === 0 ? 'sem-addons' : `${v.addons.length} addon(s)`,
        addons: v.addons, saidas: v.saidas, filhos: anunciados, instrumentado: true,
      },
    });
  }
  try { fs.unlinkSync(registo); } catch { /* o registo é temporário; apagá-lo não pode falhar a corrida */ }

  // Um filho que nasceu e morreu antes da primeira amostra não foi medido.
  // Dizer `sondado` com zero amostras seria dar por provado o que ninguém viu.
  for (const r of filhos) {
    if (r.sonda.estado === 'sondado' && r.sonda.amostras === 0) {
      declararNaoMedivel(r, 'o processo terminou antes da primeira amostra da sonda');
    }
  }

  // `partidas` viaja até ao veredicto. Deitá-lo fora aqui foi o que a 2.ª lente
  // apanhou: uma saída truncada no registo e `rede_zero: true · todos medidos`.
  return { resultado, auditoria: auditar({ chamadas, loopback, ipc, filhos, descendentes, partidas }) };
}
