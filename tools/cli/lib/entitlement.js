/**
 * entitlement.js — de onde vem o canal de update, e de onde NAO vem.
 *
 * D4 DO ADR (`docs/adr/ADR-onboarding-v2.md`): o canal vem do entitlement,
 * escrito **so** pelo servico de conta. Nunca de um ficheiro que o device
 * escreve a si proprio.
 *
 * O DEFEITO QUE ISTO FECHA, medido pelo adversario a 2026-09-10 e reconfirmado
 * neste worktree: o `install.sh` aceita `--channel=` e `MOOTER_CHANNEL`, guarda
 * o valor em `CHANNEL` (linha 23), e a unica coisa que faz com ele e IMPRIMI-LO
 * na linha 101. Nada o persiste. O `update.js` re-executava o instalador, o
 * instalador voltava ao valor por omissao, e o canal que o utilizador escolheu
 * evaporava-se em silencio a cada actualizacao — sem erro, sem aviso, sem
 * maneira de o notar a nao ser reparando que nunca chegam versoes do canal.
 *
 * PORQUE NAO SE LE DO `profile.json`. Porque o `profile.json` e auto-declarado:
 * quem o escreve e a propria maquina. Um canal lido dai e um canal que o device
 * escolhe para si — e o canal decide QUE CODIGO e descarregado e executado.
 * "Autodeclarado" e a palavra bonita para "quem controlar o disco escolhe o
 * binario". O `lerCanal()` recusa-o explicitamente e diz porque.
 *
 * FALHA ABERTA, de proposito: sem entitlement, o canal e `stable`. Um device
 * sem conta e o caso NORMAL (D2: Free sem conta), nao um erro. O que nao pode
 * acontecer e um device sem conta apanhar um canal que nao pediu.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** O canal de quem nao tem entitlement nenhum. */
const CANAL_OMISSAO = 'stable';

/**
 * Os canais que o cliente aceita. Uma lista fechada e nao uma regex: o canal
 * entra num URL (`/release/<canal>/manifest.json`), e um canal vindo de um
 * ficheiro e input. `../../` nao e um canal.
 */
const CANAIS = Object.freeze(['stable', 'beta', 'friends-beta']);

/** A raiz do estado do Mooter neste device. */
function raizMooter(o = {}) {
  const { home = os.homedir(), env = process.env } = o;
  return env.MOOTER_HOME || path.join(home, '.mooter');
}

/** O caminho do entitlement. Um so escritor: o servico de conta. */
function caminhoDoEntitlement(o = {}) {
  return path.join(raizMooter(o), 'entitlement.json');
}

/**
 * O canal deste device.
 *
 * Devolve sempre `{ canal, fonte, porque }` — nunca lanca. `fonte` e o recibo:
 * `entitlement` (veio da conta), `omissao` (nao ha conta), ou `recusado`
 * (havia ficheiro mas nao servia, e `porque` diz o que estava mal).
 */
function lerCanal(o = {}) {
  const { readImpl = fs.readFileSync, existsImpl = fs.existsSync } = o;
  const caminho = caminhoDoEntitlement(o);

  if (!existsImpl(caminho)) {
    return {
      canal: CANAL_OMISSAO,
      fonte: 'omissao',
      porque: 'sem entitlement neste device — Free local, canal stable',
      caminho,
    };
  }

  let bruto;
  try {
    bruto = JSON.parse(readImpl(caminho, 'utf8'));
  } catch (e) {
    return {
      canal: CANAL_OMISSAO,
      fonte: 'recusado',
      porque: `entitlement ilegivel (${e.message.slice(0, 80)}) — fica em ${CANAL_OMISSAO}`,
      caminho,
    };
  }

  const canal = bruto && typeof bruto.channel === 'string' ? bruto.channel.trim() : null;
  if (!canal) {
    return {
      canal: CANAL_OMISSAO,
      fonte: 'recusado',
      porque: `entitlement sem campo \`channel\` — fica em ${CANAL_OMISSAO}`,
      caminho,
    };
  }
  if (!CANAIS.includes(canal)) {
    // Nao e paranoia: o canal entra num caminho de URL. Ver CANAIS.
    return {
      canal: CANAL_OMISSAO,
      fonte: 'recusado',
      porque: `canal desconhecido '${canal.slice(0, 40)}' — conhecidos: ${CANAIS.join(', ')}`,
      caminho,
    };
  }

  return {
    canal,
    fonte: 'entitlement',
    porque: 'escrito pelo servico de conta',
    caminho,
  };
}

/**
 * O canal NUNCA vem daqui. Existe como funcao para o erro ser explicito e
 * testavel, em vez de ser uma ausencia que alguem "corrige" daqui a seis meses
 * por parecer um esquecimento.
 */
function canalDoProfileEstaProibido() {
  throw new Error(
    'o canal de update nao pode vir do profile.json: e auto-declarado pelo device, ' +
      'e o canal decide que codigo e descarregado e executado (ADR-onboarding-v2, D4)',
  );
}

module.exports = {
  CANAL_OMISSAO,
  CANAIS,
  raizMooter,
  caminhoDoEntitlement,
  lerCanal,
  canalDoProfileEstaProibido,
};
