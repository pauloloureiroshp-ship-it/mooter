'use strict';
/**
 * assinatura.js — HMAC do canal entre devices da frota.
 *
 * PORQUE EXISTE (medido 2026-08-20, `_handoff/INVENTARIO_MOOTER_2026-08-20.md`):
 * o unico `createHmac` do repo estava em `adapter_selection.js` e nao tem nada a
 * ver com isto. O canal da frota — beacons no vault, recibos — viajava em claro:
 * qualquer processo com escrita em `50-fleet/` podia inventar um device,
 * ressuscitar um morto, ou reescrever quanto custou o dia de outra maquina, e o
 * painel acreditava. Um painel que acredita em tudo nao e transparencia; e um
 * megafone.
 *
 * O QUE ESTE MODULO **NAO** E: nao e confidencialidade. O beacon continua a ser
 * texto legivel no vault, de proposito — o dono tem de o poder ler com os olhos.
 * O que se acrescenta e AUTENTICIDADE (foi mesmo este dono) e INTEGRIDADE (nao
 * foi mexido depois de assinado). Quem ja podia ler continua a ler; quem o
 * quiser FORJAR passa a precisar da chave.
 *
 * Determinista, sem rede, sem LLM. Todo o I/O e injectavel para testes.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ALG = 'sha256';
/** O algoritmo tal como viaja no envelope. Versionado de proposito. */
const ALG_TAG = 'HMAC-SHA256-v1';

/** 32 bytes. Nao e um numero redondo por gosto: e o tamanho do bloco do SHA-256. */
const KEY_BYTES = 32;

/**
 * Janela de aceitacao de uma assinatura, em segundos.
 *
 * NAO e a mesma coisa que `BEACON_STALE_S` (1800) do `fleet-beacon.mjs`: aquilo
 * responde "este device ainda esta vivo?", isto responde "esta assinatura ainda
 * conta?". Um beacon velho e informacao velha — legitima, e o painel mostra-a
 * como morta. Uma ASSINATURA velha demais e um replay: alguem guardou um
 * ficheiro assinado de ontem e voltou a pousa-lo hoje para fingir vida.
 * Por isso esta janela e MAIOR que a de frescura (um device 1h offline tem de
 * reconvergir sem ser acusado de fraude) mas finita.
 */
const JANELA_S = 24 * 60 * 60;

/** Tolerancia de relogio entre maquinas — o mesmo valor que `fleet-state.mjs` usa. */
const SKEW_S = 5;

/**
 * Onde vive a chave do dono.
 *
 * NO VAULT, nao no repo e nao em `~/.mooter` por defeito. A razao e a unica que
 * interessa: o vault e o canal que JA atravessa as maquinas do dono e JA esta
 * fora do git do produto. Uma chave por-device nao assina uma frota, assina um
 * solitario — o Mac nao conseguiria verificar o PC, e cada maquina acreditaria
 * apenas em si propria, que e exactamente o estado que este modulo existe para
 * acabar.
 *
 * SEM VAULT montado ha fallback local, e ele DECLARA-SE (`partilhado:false`).
 * Nunca se finge frota: um device sozinho assina para si, o painel diz que a
 * verificacao e local, e ninguem le "frota autenticada" onde ha uma maquina so.
 */
function caminhoDaChave(o = {}) {
  const {
    vaultPath = process.env.VAULT_PATH,
    home = os.homedir(),
    existsImpl = fs.existsSync,
  } = o;
  const vault = vaultPath || (home ? path.join(home, 'paulo-vault') : null);
  if (vault && existsImpl(vault)) {
    return { caminho: path.join(vault, '50-fleet', '.owner.key'), fonte: 'vault', partilhado: true };
  }
  return { caminho: path.join(home || '.', '.mooter', 'owner.key'), fonte: 'local', partilhado: false };
}

/**
 * Le a chave, criando-a a primeira vez.
 *
 * A criacao usa `wx` (falha se ja existir) de proposito: duas maquinas a arrancar
 * ao mesmo tempo contra o mesmo vault nao podem gerar duas chaves e a ultima
 * ganhar — isso partiria em silencio toda a frota assinada com a primeira. Se o
 * `wx` falhar porque outro a criou entretanto, RELEMOS em vez de sobrescrever.
 */
function chaveDoDono(o = {}) {
  const {
    existsImpl = fs.existsSync,
    readImpl = fs.readFileSync,
    writeImpl = fs.writeFileSync,
    mkdirImpl = fs.mkdirSync,
    gerar = () => crypto.randomBytes(KEY_BYTES),
  } = o;
  const { caminho, fonte, partilhado } = caminhoDaChave(Object.assign({}, o, { existsImpl }));

  const ler = () => {
    const cru = String(readImpl(caminho, 'utf8')).trim();
    const buf = Buffer.from(cru, 'hex');
    if (buf.length !== KEY_BYTES) {
      throw new Error('chave do dono corrompida em ' + caminho + ': ' + buf.length + 'B, esperados ' + KEY_BYTES + 'B');
    }
    return buf;
  };

  try {
    if (existsImpl(caminho)) {
      return { chave: ler(), caminho, fonte, partilhado, criada: false, erro: null };
    }
  } catch (err) {
    // Uma chave corrompida NAO se substitui em silencio: isso invalidaria todos
    // os beacons ja assinados e o dono nunca saberia porque.
    return { chave: null, caminho, fonte, partilhado, criada: false, erro: String(err && err.message) };
  }

  try {
    mkdirImpl(path.dirname(caminho), { recursive: true });
    // 0600: o dono le e escreve, mais ninguem. Em Windows o modo e advisory —
    // ver `avisoDePermissoes`, que se recusa a prometer o que o SO nao cumpre.
    writeImpl(caminho, gerar().toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
    return { chave: ler(), caminho, fonte, partilhado, criada: true, erro: null };
  } catch (err) {
    // EEXIST: outro processo ganhou a corrida. Reler e o comportamento certo.
    if (err && err.code === 'EEXIST') {
      try {
        return { chave: ler(), caminho, fonte, partilhado, criada: false, erro: null };
      } catch (e2) {
        return { chave: null, caminho, fonte, partilhado, criada: false, erro: String(e2 && e2.message) };
      }
    }
    return { chave: null, caminho, fonte, partilhado, criada: false, erro: String(err && err.message) };
  }
}

/**
 * O que o SO garante MESMO sobre o ficheiro da chave.
 *
 * Em Windows `mode: 0o600` nao instala uma ACL — e um pedido que o SO atende
 * parcialmente. Escrever "chave protegida a 0600" numa maquina Windows seria a
 * especie de afirmacao que este projecto se recusa a fazer.
 */
function avisoDePermissoes(plataforma) {
  const p = plataforma || process.platform;
  return p === 'win32'
    ? 'em Windows o modo 0600 nao instala ACL: a chave fica protegida pelas permissoes da pasta do utilizador; ao nivel do ficheiro e n/d'
    : null;
}

/**
 * Serializacao canonica: a mesma entrada da SEMPRE os mesmos bytes.
 *
 * Sem isto o HMAC seria uma moeda ao ar. `JSON.stringify` preserva a ordem de
 * insercao das chaves, e um objecto montado por dois caminhos diferentes no
 * codigo produz duas strings diferentes com o MESMO significado — logo dois MACs
 * diferentes e uma rejeicao que ninguem consegue explicar.
 *
 * Ordena chaves recursivamente e ignora `undefined` (que o JSON tambem perde).
 * `sig` e excluido: assina-se o conteudo, nunca o envelope.
 */
function canonico(valor) {
  if (valor === null || typeof valor !== 'object') {
    const s = JSON.stringify(valor);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
  const chaves = Object.keys(valor)
    .filter((k) => k !== 'sig' && valor[k] !== undefined)
    .sort();
  return '{' + chaves.map((k) => JSON.stringify(k) + ':' + canonico(valor[k])).join(',') + '}';
}

/**
 * Assina um objecto. Devolve o envelope `sig` para o chamador pousar no payload.
 *
 * O `nonce` e o `ts` entram DENTRO do MAC, nao apenas ao lado dele: senao um
 * atacante trocava-os a vontade sem partir a assinatura, e tanto a proteccao
 * anti-replay como a janela temporal eram decorativas.
 */
function assinar(payload, o = {}) {
  const {
    chave,
    ts = new Date().toISOString(),
    nonce = crypto.randomBytes(16).toString('hex'),
  } = o;
  if (!chave || !Buffer.isBuffer(chave) || chave.length !== KEY_BYTES) {
    throw new Error('assinar() sem chave valida de ' + KEY_BYTES + 'B');
  }
  const corpo = canonico(Object.assign({}, payload, { _ts: ts, _nonce: nonce }));
  const mac = crypto.createHmac(ALG, chave).update(corpo, 'utf8').digest('hex');
  return { alg: ALG_TAG, ts, nonce, mac };
}

/** Assina em-sitio: devolve copia do payload com `sig` pousado. */
function assinado(payload, o = {}) {
  return Object.assign({}, payload, { sig: assinar(payload, o) });
}

/**
 * Verifica. Devolve SEMPRE um motivo legivel — este valor vira recibo.
 *
 * `timingSafeEqual` e nao `===`: comparar MACs com `===` sai mais cedo no
 * primeiro byte diferente, e o tempo da resposta conta ao atacante quantos bytes
 * ja acertou. E barato fazer bem.
 */
function verificar(payload, o = {}) {
  const {
    chave,
    agora = Date.now(),
    janelaS = JANELA_S,
    skewS = SKEW_S,
    vistos = null,
  } = o;
  const sig = payload && payload.sig;

  if (!sig) return { ok: false, motivo: 'sem assinatura', codigo: 'nao-assinado', idade_s: null };
  if (sig.alg !== ALG_TAG) {
    return { ok: false, motivo: 'algoritmo desconhecido: ' + String(sig.alg).slice(0, 40), codigo: 'alg-desconhecido', idade_s: null };
  }
  if (!chave || !Buffer.isBuffer(chave) || chave.length !== KEY_BYTES) {
    return { ok: false, motivo: 'sem chave do dono para verificar', codigo: 'sem-chave', idade_s: null };
  }
  if (typeof sig.mac !== 'string' || !/^[0-9a-f]{64}$/.test(sig.mac)) {
    return { ok: false, motivo: 'mac malformado', codigo: 'mac-malformado', idade_s: null };
  }
  if (!sig.nonce || typeof sig.nonce !== 'string') {
    return { ok: false, motivo: 'sem nonce', codigo: 'sem-nonce', idade_s: null };
  }

  const t = Date.parse(sig.ts);
  if (!Number.isFinite(t)) {
    return { ok: false, motivo: 'ts ilegivel', codigo: 'ts-invalido', idade_s: null };
  }
  const idadeS = Math.round((agora - t) / 1000);
  if (idadeS < -skewS) {
    return { ok: false, motivo: 'assinatura datada no futuro (' + -idadeS + 's)', codigo: 'ts-futuro', idade_s: idadeS };
  }
  if (idadeS > janelaS) {
    return { ok: false, motivo: 'assinatura expirada (' + idadeS + 's > ' + janelaS + 's)', codigo: 'expirada', idade_s: idadeS };
  }

  const corpo = canonico(Object.assign({}, payload, { _ts: sig.ts, _nonce: sig.nonce }));
  const esperado = crypto.createHmac(ALG, chave).update(corpo, 'utf8').digest();
  const dado = Buffer.from(sig.mac, 'hex');
  if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) {
    return { ok: false, motivo: 'assinatura nao bate com o conteudo', codigo: 'adulterado', idade_s: idadeS };
  }

  // Anti-replay. So se aplica se o chamador der um registo de nonces vistos: um
  // beacon REESCRITO no mesmo sitio a cada ciclo nao e replay, e actualizacao, e
  // o `ts` ja o distingue. Onde importa (recibos, inbox do F4) o chamador passa
  // o `Set` e paga o custo de o manter.
  if (vistos) {
    if (vistos.has(sig.nonce)) {
      return { ok: false, motivo: 'nonce ja visto (replay)', codigo: 'replay', idade_s: idadeS };
    }
    vistos.add(sig.nonce);
  }

  return { ok: true, motivo: null, codigo: 'ok', idade_s: idadeS };
}

module.exports = {
  ALG_TAG,
  KEY_BYTES,
  JANELA_S,
  SKEW_S,
  caminhoDaChave,
  chaveDoDono,
  avisoDePermissoes,
  canonico,
  assinar,
  assinado,
  verificar,
};
