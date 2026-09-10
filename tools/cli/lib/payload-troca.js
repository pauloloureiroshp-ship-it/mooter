/**
 * payload-troca.js — trocar o payload por um novo, e conseguir voltar atras.
 *
 * TRES PASTAS, E CADA UMA EXISTE POR UMA RAZAO:
 *   ~/.mooter/cli        o payload a correr
 *   ~/.mooter/cli.next   o candidato, ainda por verificar
 *   ~/.mooter/cli.prev   o anterior, guardado para o rollback (estado B14)
 *
 * PORQUE `rename` E NAO `cp -r`. Um `cp` recursivo tem uma janela — as vezes
 * segundos — em que a pasta que o Mooter esta a correr esta meio escrita. Se o
 * processo morrer ai (bateria, Ctrl-C, disco cheio), o que fica no disco nao e
 * nem a versao velha nem a nova: e um cruzamento das duas que nao existe em
 * release nenhuma, e que ninguem consegue reproduzir para depurar. `rename` no
 * mesmo sistema de ficheiros e atomico: ou aconteceu, ou nao.
 *
 * PORQUE A ORDEM E ESTA. `cli -> cli.prev`, depois `cli.next -> cli`. Se a
 * segunda falhar, `cli` NAO EXISTE, e e por isso que `trocar()` a repoe no
 * `catch` antes de propagar. Sem essa reposicao, uma falha a meio deixava a
 * maquina sem payload nenhum — pior do que a versao velha, que e exactamente
 * o que um update nunca pode fazer.
 *
 * A VERIFICACAO ACONTECE ANTES DA PRIMEIRA MEXIDA. `trocar()` recusa-se a
 * comecar se o sha256 do candidato nao bater com o do manifesto. O update mais
 * seguro e o que nao chega a acontecer.
 *
 * Todo o I/O e injectavel (`o.fsImpl`) para os testes correrem sem disco.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { raizMooter } = require('./entitlement.js');

/** Os tres caminhos, derivados de uma so raiz. */
function caminhos(o = {}) {
  const raiz = raizMooter(o);
  return {
    raiz,
    actual: path.join(raiz, 'cli'),
    proximo: path.join(raiz, 'cli.next'),
    anterior: path.join(raiz, 'cli.prev'),
  };
}

/** sha256 de um ficheiro, em hex. */
function sha256Do(caminho, o = {}) {
  const { fsImpl = fs } = o;
  return crypto.createHash('sha256').update(fsImpl.readFileSync(caminho)).digest('hex');
}

/**
 * O candidato bate com o que o manifesto prometeu?
 *
 * Isto e a segunda metade da assinatura, nao um extra: a assinatura prova que o
 * manifesto e autentico; ISTO prova que o ficheiro descarregado e o ficheiro
 * que o manifesto autentico descreve. Sem as duas, uma delas nao vale nada.
 */
function confereSha(caminho, esperado, o = {}) {
  const obtido = sha256Do(caminho, o);
  if (obtido !== String(esperado).toLowerCase()) {
    return {
      ok: false,
      codigo: 'sha-diferente',
      porque: `o ficheiro descarregado nao e o que o manifesto descreve (esperado ${String(esperado).slice(0, 12)}…, obtido ${obtido.slice(0, 12)}…)`,
      obtido,
    };
  }
  return { ok: true, obtido };
}

/**
 * Troca. Devolve `{ ok, codigo, porque }` — nunca lanca por falha prevista.
 *
 * `aplicarImpl` e o que instala o candidato em `cli.next` (descompactar,
 * copiar); fica de fora deste modulo de proposito: o que aqui se prova e a
 * ATOMICIDADE, e essa nao depende de saber o que e um `.tar.gz`.
 */
function trocar(o = {}) {
  const { fsImpl = fs, sha256Esperado = null, candidato = null } = o;
  const c = caminhos(o);

  if (!fsImpl.existsSync(c.proximo)) {
    return { ok: false, codigo: 'sem-candidato', porque: `nao ha nada em ${c.proximo}` };
  }
  if (sha256Esperado) {
    if (!candidato) {
      return { ok: false, codigo: 'sem-ficheiro', porque: 'sha256 pedido mas sem ficheiro para conferir' };
    }
    const s = confereSha(candidato, sha256Esperado, o);
    if (!s.ok) return s;
  }

  const tinhaActual = fsImpl.existsSync(c.actual);

  // O `cli.prev` de uma troca anterior sai do caminho ANTES de mexer no vivo:
  // um `rename` sobre uma pasta que ja existe falha em varias plataformas, e
  // falhar aqui e o unico sitio onde falhar ainda nao custa nada.
  if (fsImpl.existsSync(c.anterior)) {
    fsImpl.rmSync(c.anterior, { recursive: true, force: true });
  }

  try {
    if (tinhaActual) fsImpl.renameSync(c.actual, c.anterior);
  } catch (e) {
    return { ok: false, codigo: 'falha-a-guardar', porque: 'nao consegui guardar o payload actual: ' + e.message.slice(0, 90) };
  }

  try {
    fsImpl.renameSync(c.proximo, c.actual);
  } catch (e) {
    // A janela perigosa. `cli` nao existe neste instante — repor antes de sair.
    if (tinhaActual) {
      try {
        fsImpl.renameSync(c.anterior, c.actual);
      } catch {
        return {
          ok: false,
          codigo: 'partido',
          porque:
            'a troca falhou E a reposicao tambem — o payload anterior esta em ' +
            c.anterior +
            '. Move-o para ' +
            c.actual +
            ' a mao.',
        };
      }
    }
    return { ok: false, codigo: 'falha-a-trocar', porque: 'troca revertida: ' + e.message.slice(0, 90) };
  }

  return {
    ok: true,
    codigo: 'trocado',
    porque: tinhaActual ? `payload trocado; o anterior fica em ${c.anterior}` : 'payload instalado (nao havia anterior)',
    anterior: tinhaActual ? c.anterior : null,
  };
}

/**
 * Volta ao payload anterior — o estado B14 do mapa: assinatura invalida ou
 * payload corrompido, «Actualizacao revertida».
 *
 * O que estava em `cli` vai para `cli.next` e nao para o lixo: se o rollback foi
 * um engano, o que se descartou ainda esta la. Apagar e a unica operacao que
 * nao tem rollback.
 */
function reverter(o = {}) {
  const { fsImpl = fs } = o;
  const c = caminhos(o);

  if (!fsImpl.existsSync(c.anterior)) {
    return { ok: false, codigo: 'sem-anterior', porque: `nao ha payload anterior em ${c.anterior} para onde voltar` };
  }

  if (fsImpl.existsSync(c.actual)) {
    if (fsImpl.existsSync(c.proximo)) fsImpl.rmSync(c.proximo, { recursive: true, force: true });
    try {
      fsImpl.renameSync(c.actual, c.proximo);
    } catch (e) {
      return { ok: false, codigo: 'falha-a-afastar', porque: 'nao consegui afastar o payload actual: ' + e.message.slice(0, 90) };
    }
  }

  try {
    fsImpl.renameSync(c.anterior, c.actual);
  } catch (e) {
    return { ok: false, codigo: 'falha-a-reverter', porque: 'nao consegui repor o anterior: ' + e.message.slice(0, 90) };
  }

  return { ok: true, codigo: 'revertido', porque: 'Actualizacao revertida — voltaste ao payload anterior.' };
}

module.exports = { caminhos, sha256Do, confereSha, trocar, reverter };
