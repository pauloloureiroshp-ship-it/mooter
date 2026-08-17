'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A raiz de composicao: onde as pecas se ligam.
 *
 *   node correr.js            -> tenta MODO VIVO (falha em voz alta se trancado)
 *   node correr.js --seco     -> monta tudo e NAO envia nem despacha (dry-run)
 *
 * Este ficheiro nao tem regras proprias. As regras vivem nos modulos; aqui
 * decide-se so QUEM fala com QUEM, e essa e a razao de existir: ate agora o
 * `adapter.js` recebia `despachar` e `enviar` injectados e ninguem os injectava
 * de verdade. Sem isto, o spike era 47 testes verdes e nenhuma demo.
 *
 * A ordem nao e livre:
 *   .env -> daemon (prazo · gate · gitignore · token) -> transporte -> adapter
 * O `daemon.arrancar()` e o unico que pode dizer "nao". Se disser, imprime-se a
 * razao e sai-se com codigo != 0 — um spike que arranca meio-ligado e pior que um
 * spike que nao arranca.
 */

const fs = require('fs');
const path = require('path');

const daemon = require('./daemon.js');
const gate = require('./gate.js');
const morte = require('./morte.js');
const { criarAllowlist } = require('./allowlist.js');
const { criarPublicador } = require('./publicar.js');
const { criarAdaptador, lerLedgerPorOmissao } = require('./adapter.js');
const { criarDespachador } = require('./despacho.js');
const { criarTransporte } = require('./transporte.js');
const { descobrirTudo, escreverEnv } = require('./descobrir.js');

const RAIZ_REPO = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(__dirname, '.env');
const SYNC_PATH = path.join(RAIZ_REPO, 'SYNC.md');

/** Nomes das variaveis. Os VALORES nunca passam por aqui em texto. */
const VARS = Object.freeze({
  appToken: 'SLACK_APP_TOKEN',      // xapp-… (Socket Mode)
  botToken: 'SLACK_BOT_TOKEN',      // xoxb-… (chat.postMessage)
  canal: 'SLACK_CANAL',             // C… do #mooter-demo
  botUserId: 'SLACK_BOT_USER_ID',   // U… do proprio bot, para tirar do goal
  allowUserId: 'SLACK_ALLOW_USER_ID', // U… do Paulo: a allowlist de UM
});

/** Carrega o .env sem o imprimir. `loadEnvFile` nao devolve nada — de proposito. */
function carregarEnv(envPath) {
  if (!fs.existsSync(envPath)) return { carregado: false, porque: 'nao existe ' + path.basename(envPath) };
  try { process.loadEnvFile(envPath); return { carregado: true }; } catch (e) {
    return { carregado: false, porque: 'loadEnvFile falhou: ' + ((e && e.message) || 'erro') };
  }
}

/** Diz quais FALTAM, nunca o que tem. Um log de arranque nao e sitio para tokens. */
function faltamVariaveis() {
  return Object.values(VARS).filter((v) => !String(process.env[v] || '').trim());
}

/**
 * A ligação entre a porta de saída e o transporte. **Uma função com nome, e não
 * três linhas dentro do `montar()`, por uma razão medida:** quando isto era inline
 * chamava `enviar(texto, p)` sem o 3.º argumento — o `publicar.js` construía o
 * cartão inteiro e esta função atirava-o ao chão. O transporte caía no caminho de
 * compatibilidade e o que chegava ao Slack era **uma linha com dois botões**.
 *
 * Nada falhou. 168 testes verdes, e o cartão pobre. Descobriu-se no telemóvel do
 * dono, porque a parte não testada era precisamente a que não tinha nome: os
 * testes exercitavam as PEÇAS, e a LIGAÇÃO só existia dentro de uma função grande
 * que nenhum teste podia chamar sem tokens e sem gate.
 *
 * Agora tem nome, é exportada, e há um teste que a chama a ela — não a uma cópia
 * do seu padrão. (A primeira tentativa de teste replicou a ligação em vez de a
 * usar, e por isso também não apanhava o bug. Duas vezes o mesmo erro, uma camada
 * acima.)
 *
 * O `.catch` não é decoração: `publicar()` é sincrono e chama isto sem esperar,
 * logo um erro do Slack era uma unhandled rejection — o processo a morrer por uma
 * mensagem falhada, a meio de uma demo.
 */
function ligarPublicadorAoTransporte(transporte, registar) {
  const log = registar || ((r) => console.error('[registo] ' + JSON.stringify(r)));
  return criarPublicador({
    enviar: (texto, p, blocos) => {
      transporte.enviar(texto, p, blocos).catch((e) => {
        log({ tipo: 'envio_falhou', slack_error: (e && e.slack_error) || 'n/d' });
      });
    },
  });
}

async function montar(opcoes) {
  const o = opcoes || {};
  const seco = !!o.seco;
  const envPath = o.envPath || ENV_PATH;
  const syncPath = o.syncPath || SYNC_PATH;

  carregarEnv(envPath);

  // 1 · o daemon manda. Em dry-run salta-se a parte do token (nao ha envio real),
  //     mas o prazo e o gate NAO se saltam: sao a razao pela qual isto e um spike.
  if (seco) {
    const m = morte.estadoDeMorte();
    if (m.morto) return { montado: false, passo: 'morte', porque: m.porque };
  } else {
    const d = daemon.arrancar({ repo: RAIZ_REPO, envPath, syncPath });
    if (!d.arrancou) return { montado: false, passo: d.passo, porque: d.porque };
  }

  // 1.5 · as 3 derivaveis. O dono da os TOKENS; o canal e os dois ids o proprio
  //       bot sabe perguntar (`auth.test` · `conversations.list` · `users.list`).
  //       Corre so depois do daemon: ou seja, so com o gate aberto e token presente.
  const derivacao = { corrida: false, notas: [], escritas: [], actualizadas: [] };
  if (!seco) {
    const emFalta = faltamVariaveis();
    const derivaveis = [VARS.canal, VARS.botUserId, VARS.allowUserId];
    if (emFalta.some((v) => derivaveis.includes(v))) {
      derivacao.corrida = true;
      const r = await descobrirTudo({ botToken: process.env[VARS.botToken],
        canalNome: o.canalNome || 'mooter-demo' });
      if (!r.ok) {
        return { montado: false, passo: 'derivacao:' + r.passo, porque: r.porque };
      }
      // escreve SO as que faltavam — uma que o dono ja tenha posto a mao manda
      const aEscrever = {};
      for (const [k, v] of Object.entries(r.valores)) if (emFalta.includes(k)) aEscrever[k] = v;
      const w = escreverEnv(envPath, aEscrever);
      if (!w.ok) return { montado: false, passo: 'derivacao:escrita', porque: w.porque };
      Object.assign(derivacao, { notas: r.notas, escritas: w.escritas,
        actualizadas: w.actualizadas, e_membro: r.e_membro });
      for (const [k, v] of Object.entries(aEscrever)) process.env[k] = v;   // sem reler o .env
    }
  }

  const faltam = seco ? [] : faltamVariaveis();
  if (faltam.length) {
    return { montado: false, passo: 'env_incompleto',
      porque: 'faltam variaveis no .env: ' + faltam.join(', ') };
  }

  // 2 · o nucleo, importado como qualquer consumidor. Zero alteracoes.
  const broker = require('../mooter-bridge/broker.js');
  const seamless = require('../mooter-bridge/seamless.js');

  const allowlist = criarAllowlist([process.env[VARS.allowUserId] || 'U_SEM_ID']);
  const transporte = criarTransporte({
    botToken: process.env[VARS.botToken],
    appToken: process.env[VARS.appToken],
    canal: process.env[VARS.canal] || 'C_SEM_CANAL',
    botUserId: process.env[VARS.botUserId],
    syncPath, dryRun: seco,
    registar: (r) => console.error('[registo]', JSON.stringify(r)),
  });
  // O dry-run vive SO no transporte, que e a fronteira da rede. Po-lo tambem no
  // publicador punha duas camadas secas em serie: a de dentro devolvia logo e o
  // transporte nunca via nada — o ensaio seco imprimia «0 mensagens» com o loop
  // todo a funcionar. O publicador filtra sempre; quem nao envia e o transporte.
  //
  // O `.catch` nao e decoracao: `publicar()` e sincrono e chama isto sem esperar,
  // logo um erro do Slack no MODO VIVO era uma unhandled rejection — o processo
  // a morrer por uma mensagem falhada, a meio de uma demo.
  const publicador = ligarPublicadorAoTransporte(transporte);

  // ⚠️ Em SECO o motor NAO entra. Nem atras do gate: se um dia a linha estiver no
  // SYNC.md, um `--seco` com o `toolWork` real despachava a serio enquanto as
  // mensagens eram falsas — o pior dos dois mundos, e do genero que se descobre
  // pela factura. Seco quer dizer seco.
  const despachos = [];
  const despachoSeco = async (p) => {
    despachos.push({ goal_bytes: String((p && p.goal) || '').length, actor: p && p.actor });
    return { job_id: 'seco-' + (despachos.length) };
  };
  const { despachar } = seco
    ? { despachar: despachoSeco }
    : criarDespachador({ toolWork: seamless.toolWork, syncPath,
      // Onde o agente escreve. Isolada de proposito: o que a demo produzir nao se
      // mistura com o codigo do spike, e desaparece com um
      // `git worktree remove .claude/worktrees/slack-demo`.
      // Sem isto, o toolWork herdava `(ctx && ctx.folder) || REPO` e o 1o despacho
      // real morreu em «worktree fora da raiz permitida».
      worktree: process.env.SLACK_WORKTREE
        || path.join(RAIZ_REPO, '..', 'slack-demo') });
  const adaptador = criarAdaptador({ allowlist, publicador, broker, despachar,
    registar: (r) => console.error('[registo]', JSON.stringify(r)) });

  return { montado: true, seco, adaptador, transporte, publicador, broker, allowlist, syncPath,
    despachos, derivacao };
}

async function principal(argv) {
  const seco = (argv || []).includes('--seco');
  const m = await montar({ seco });
  if (!m.montado) {
    console.error('✋ slack-spike NAO arrancou · passo: ' + m.passo);
    console.error('   ' + m.porque);
    if (m.passo === 'modo_vivo') {
      console.error('   a linha que destrava, exacta: «' + gate.LINHA_DESTRAVE + '»');
      console.error('   (MODO CONSTRUCAO continua permitido: node --test)');
    }
    process.exitCode = 1;
    return m;
  }
  if (m.derivacao && m.derivacao.corrida) {
    console.error('🔎 derivei do proprio Slack:');
    for (const n of m.derivacao.notas) console.error('   · ' + n);
    if (m.derivacao.escritas.length) console.error('   escritas no .env: ' + m.derivacao.escritas.join(', '));
    if (m.derivacao.actualizadas.length) console.error('   actualizadas: ' + m.derivacao.actualizadas.join(', '));
  }

  const maos = {
    aoMencionar: (d) => m.adaptador.receberMencao(d),
    aoInteragir: (d) => m.adaptador.receberInteraccao(d),
  };

  // SECO nao abre socket: o `correr()` do transporte fala com o Slack e esse fica
  // sempre do lado do MODO VIVO. Em vez disso passa-se UMA mencao sintetica pelo
  // loop inteiro e imprime-se o que SAIRIA — o ensaio da demo, sem demo.
  if (m.seco) {
    await m.transporte.tratarEnvelope({
      type: 'events_api', envelope_id: 'seco-1',
      payload: { event_id: 'EvSeco', event: { type: 'app_mention',
        user: process.env[VARS.allowUserId] || 'U_SEM_ID',
        text: '<@' + (process.env[VARS.botUserId] || 'U0BOT') + '> ensaio seco do slack-spike',
        channel: process.env[VARS.canal] || 'C_SEM_CANAL', ts: '0.1' } },
    }, maos);
    console.error('🌵 ensaio SECO · ' + m.despachos.length + ' despacho(s) simulado(s) · '
      + m.transporte.enviados.length + ' mensagem(ns) que SAIRIAM:');
    for (const e of m.transporte.enviados) {
      console.error('   → ' + e.metodo + ': ' + String(e.corpo.text).split('\n').join(' | '));
    }
    console.error('   (nada foi enviado, nada foi despachado, nada foi pago)');
    return m;
  }

  const r = await m.transporte.correr(maos);
  if (r.correu) {
    // ⚠️ O SOCKET NAO TRAZ PENDENTES. Ele traz mencoes e cliques; o pendente
    // nasce no ledger, minutos depois, quando o agente para a pedir aprovacao.
    // Sem este poller o cartao nunca aparecia e a demo morria no passo 3 — havia
    // `publicarPendentes()` desde o inicio e ninguem o chamava.
    //
    // O filtro por actor nao e afinacao: e o que impede o primeiro tique de
    // despejar no canal os pendentes historicos do ledger, que ninguem pediu no
    // Slack. So sai o que nasceu aqui.
    const meuActor = 'slack:' + process.env[VARS.allowUserId];
    const vistos = new Set();
    const fechados = new Set();   // job -> fecho ja anunciado no thread

    /**
     * ⚠️ A CORRENTE prep -> job real, ou o cartao cai fora do thread.
     *
     * Quando ha preparacao local, o `toolWork` dispara DOIS jobs e devolve o id do
     * PRIMEIRO (a prep, `agent:moo`). Foi esse que o thread anunciou. Se a prep
     * expira, o motor encadeia o job real com um id NOVO — e o cartao desse job
     * nao tinha thread conhecido, logo aterrava no canal em vez de debaixo da
     * mencao. A promessa «sigo neste thread» passava a falsa por um detalhe de
     * implementacao do motor.
     *
     * O elo esta no ledger: o `dispatched` do job real traz `prep_from`. Herda-se
     * o thread do pai antes de publicar.
     */
    const herdarThread = (jobId, ledger) => {
      if (m.transporte.threads.has(jobId)) return;
      const disp = ledger.find((e) => e.job_id === jobId && e.event === 'dispatched');
      const pai = disp && disp.prep_from;
      const ts = pai && m.transporte.threads.get(pai);
      if (ts) {
        m.transporte.lembrarThread(jobId, ts);
        console.error('[registo] ' + JSON.stringify({ tipo: 'thread_herdado',
          job: jobId, de: pai }));
      }
    };

    /**
     * ⚠️ A CORRENTE TEM DE SE SEGUIR PARA TODOS, nao so para os pendentes.
     *
     * O `herdarThread` corria apenas sobre `listPending()`. Mas o job que ACABA e o
     * encadeado (o pai e a preparacao local, que expira), e um job que acaba bem
     * nunca aparece na lista de pendentes — logo nunca herdava thread, logo nunca
     * entrava no `publicarFechos`, logo o thread NAO fechava. Foi assim que o
     * primeiro pedido normal do dono («lê o README e resume») correu, custou
     * US$ 0,1154, terminou com exit 0... e o thread ficou calado no «Recebido».
     *
     * O fix do fecho estava certo e chegava a lista errada. Agora a corrente
     * segue-se a partir do ledger: qualquer job cujo `prep_from` esteja no mapa
     * herda o thread do pai, tenha pendente ou nao.
     */
    const seguirCorrente = (ledger) => {
      for (const e of ledger) {
        if (e.event !== 'dispatched' || !e.prep_from) continue;
        if (m.transporte.threads.has(e.job_id)) continue;
        const ts = m.transporte.threads.get(e.prep_from);
        if (!ts) continue;
        m.transporte.lembrarThread(e.job_id, ts);
        console.error('[registo] ' + JSON.stringify({ tipo: 'thread_herdado',
          job: e.job_id, de: e.prep_from }));
      }
    };

    const tique = async () => {
      try {
        const ledger = lerLedgerPorOmissao();
        seguirCorrente(ledger);
        for (const p of m.broker.listPending({ actor: meuActor })) herdarThread(p.job_id, ledger);
        const pubs = await m.adaptador.publicarPendentes({
          filtro: { actor: meuActor },
          jaVisto: (p) => vistos.has(p.job_id + ':' + p.state_hash),
        });
        // ⚠️ O RESULTADO DA PUBLICACAO TEM DE SE VER. O cartao deste pendente
        // passava o `publicar()` e o poller corria — e ficamos sem saber se saiu,
        // porque nada registava o desfecho. Uma recusa da porta de saida era
        // silenciosa, e silencio le-se como "nao aconteceu nada", que e o pior
        // dos diagnosticos: indistinguivel de nao ter corrido. Quarta vez hoje
        // que o problema nao era o codigo, era o que ele nao dizia.
        // e o FIM dos que acabaram sem pedir decisao — senao o thread cala-se
        // para sempre num «volto quando precisar de uma decisao» que nunca volta
        for (const f of await m.adaptador.publicarFechos({
          jobs: [...m.transporte.threads.keys()],
          jaVisto: (job) => fechados.has(job),
        })) {
          if (f.publicado) {
            fechados.add(f.job_id);
            console.error('[registo] ' + JSON.stringify({ tipo: 'fecho_publicado',
              job: f.job_id, estado: f.estado }));
          }
        }

        for (const p of pubs) {
          if (p.publicado) {
            vistos.add(p.job_id + ':' + p.state_hash);
            console.error('[registo] ' + JSON.stringify({ tipo: 'cartao_publicado',
              job: p.job_id, hash: String(p.state_hash || '').slice(0, 12) }));
          } else if (p.porque && !/ja publicado/i.test(p.porque)) {
            console.error('[registo] ' + JSON.stringify({ tipo: 'cartao_RECUSADO',
              job: p.job_id, porque: p.porque }));
          }
        }
      } catch (e) {
        console.error('[registo] ' + JSON.stringify({ tipo: 'poller_falhou',
          porque: (e && e.message) || 'erro' }));
      }
    };
    m.poller = setInterval(tique, Number(process.env.SLACK_POLL_MS || 5000));
    m.poller.unref?.();
    await tique();
  }
  if (!r.correu) {
    console.error('✋ o socket nao abriu: ' + r.porque);
    process.exitCode = 1;
    return m;
  }
  const est = morte.estadoDeMorte();
  console.error('🐮 slack-spike a ouvir' + (m.seco ? ' (SECO — nada sai)' : '')
    + ' · morre em ' + est.morre_em + ' (' + est.dias_restantes + ' dias)');
  return m;
}

if (require.main === module) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error('✋ rebentou ao arrancar: ' + ((e && e.message) || e));
    process.exitCode = 1;
  });
}

module.exports = { VARS, ENV_PATH, SYNC_PATH, RAIZ_REPO, carregarEnv, faltamVariaveis,
  ligarPublicadorAoTransporte, montar, principal };
