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
const { criarAdaptador } = require('./adapter.js');
const { criarDespachador } = require('./despacho.js');
const { criarTransporte } = require('./transporte.js');

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
  const publicador = criarPublicador({
    enviar: (texto, p) => {
      transporte.enviar(texto, p).catch((e) => {
        console.error('[registo] ' + JSON.stringify({ tipo: 'envio_falhou',
          slack_error: (e && e.slack_error) || 'n/d' }));
      });
    },
  });

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
    : criarDespachador({ toolWork: seamless.toolWork, syncPath });
  const adaptador = criarAdaptador({ allowlist, publicador, broker, despachar });

  return { montado: true, seco, adaptador, transporte, publicador, broker, allowlist, syncPath,
    despachos };
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

module.exports = { VARS, ENV_PATH, SYNC_PATH, RAIZ_REPO, carregarEnv, faltamVariaveis, montar, principal };
