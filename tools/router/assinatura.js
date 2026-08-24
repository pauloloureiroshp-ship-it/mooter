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

/**
 * O algoritmo ASSIMETRICO, e para onde a frota vai.
 *
 * PORQUE (medido 2026-08-24): o HMAC e simetrico, logo verificar exige o mesmo
 * segredo que assinar — todo o device que verifica pode forjar. Com N maquinas o
 * segredo esta em N sitios, tem de la ser levado a mao (Fase 1), e uma delas
 * comprometida e a frota inteira comprometida, sem revogacao possivel a nao ser
 * rodar a chave em todas.
 *
 * Com Ed25519 cada device guarda a PRIVADA, que nunca viaja, e o vault carrega
 * as PUBLICAS num registo versionavel — o oposto de um segredo. Inscrever um
 * device e um commit do dono; revoga-lo e apagar uma linha.
 */
const ALG_ED = 'Ed25519-v1';

/** 32 bytes. Nao e um numero redondo por gosto: e o tamanho do bloco do SHA-256. */
const KEY_BYTES = 32;

/**
 * Tamanho do `kid` em caracteres hex (8 bytes de SHA-256).
 *
 * Identifica a chave sem a revelar: 64 bits chegam de sobra para distinguir as
 * chaves de um dono, e inverter SHA-256 truncado para recuperar 32 bytes de
 * entropia nao e um ataque que exista.
 */
const KID_HEX = 16;

/**
 * A impressao digital de uma chave.
 *
 * PORQUE EXISTE (medido 2026-08-24): o HMAC e simetrico, por isso uma chave
 * ERRADA e um conteudo MEXIDO produzem exactamente o mesmo sintoma — um MAC que
 * nao bate. O `verificar` devolvia `adulterado` para os dois, e no dia em que a
 * frota descobriu que cada device tinha gerado a sua propria chave, o recibo
 * dizia "assinatura nao bate com o conteudo" sobre um beacon que ninguem tinha
 * tocado. Mandava cacar um atacante que nao existia.
 *
 * Com o `kid` no envelope as duas causas separam-se: kid diferente e um device
 * por enrolar, kid igual com MAC errado e adulteracao a serio.
 */
function kidDaChave(chave) {
  if (!chave || !Buffer.isBuffer(chave) || chave.length !== KEY_BYTES) return null;
  return crypto.createHash(ALG).update(chave).digest('hex').slice(0, KID_HEX);
}

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
 * Onde vive a chave PRIVADA deste device.
 *
 * Em `~/.mooter/`, nunca no vault. Nao e detalhe: a privada do Ed25519 nao tem
 * razao nenhuma para estar no canal que atravessa as maquinas — e precisamente
 * a propriedade que este algoritmo compra. Poe-la la seria repetir a Fase 1 com
 * mais passos.
 */
function caminhoDaChaveDoDevice(o = {}) {
  const { home = os.homedir(), mooDir = process.env.MOOTER_HOME } = o;
  return path.join(mooDir || path.join(home || '.', '.mooter'), 'device-ed25519.key');
}

/** O caminho do registo de chaves PUBLICAS, dentro do vault. */
function caminhoDoRegisto(o = {}) {
  const { vaultPath = process.env.VAULT_PATH, home = os.homedir(), existsImpl = fs.existsSync } = o;
  const vault = vaultPath || (home ? path.join(home, 'paulo-vault') : null);
  if (vault && existsImpl(vault)) {
    return { caminho: path.join(vault, '50-fleet', 'trusted-devices.json'), partilhado: true };
  }
  return { caminho: null, partilhado: false };
}

/** A impressao digital de uma chave publica (base64 SPKI). */
function kidDaPublica(pubB64) {
  if (typeof pubB64 !== 'string' || !pubB64) return null;
  return crypto.createHash(ALG).update(pubB64, 'utf8').digest('hex').slice(0, KID_HEX);
}

/**
 * A chave do DEVICE (par Ed25519). Cria-a a primeira vez, com `wx`, pela mesma
 * razao que a do dono: duas rondas a arrancar em paralelo nao podem gerar dois
 * pares e a ultima ganhar — isso invalidaria a inscricao ja feita no registo.
 */
function chaveDoDevice(o = {}) {
  const {
    existsImpl = fs.existsSync, readImpl = fs.readFileSync,
    writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync,
    gerar = () => crypto.generateKeyPairSync('ed25519'),
  } = o;
  const caminho = caminhoDaChaveDoDevice(o);

  const ler = () => {
    const pem = String(readImpl(caminho, 'utf8'));
    const privada = crypto.createPrivateKey(pem);
    const publica = crypto.createPublicKey(privada);
    const pub = publica.export({ type: 'spki', format: 'der' }).toString('base64');
    return { privada, publica, pub, kid: kidDaPublica(pub), caminho, criada: false, erro: null };
  };

  try {
    if (existsImpl(caminho)) return ler();
  } catch (err) {
    // Uma privada corrompida NAO se substitui em silencio: a nova nao bateria
    // com a publica ja inscrita no registo, e o device ficaria fora da frota
    // sem que ninguem soubesse porque.
    return { privada: null, publica: null, pub: null, kid: null, caminho, criada: false, erro: String(err && err.message) };
  }

  try {
    mkdirImpl(path.dirname(caminho), { recursive: true });
    const { privateKey } = gerar();
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    writeImpl(caminho, pem, { flag: 'wx', mode: 0o600 });
    return Object.assign(ler(), { criada: true });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      try { return ler(); } catch (e2) {
        return { privada: null, publica: null, pub: null, kid: null, caminho, criada: false, erro: String(e2 && e2.message) };
      }
    }
    return { privada: null, publica: null, pub: null, kid: null, caminho, criada: false, erro: String(err && err.message) };
  }
}

/**
 * Le o registo de devices de confianca.
 *
 * Um registo ausente NAO e um erro: e uma frota que ainda nao migrou. Devolve
 * `{devices:{}}` e a verificacao Ed25519 diz `nao-inscrito` a quem aparecer.
 * Um registo ILEGIVEL e outra coisa — nao se pode inventar confianca a partir
 * de um ficheiro que nao se conseguiu ler, e isso diz-se.
 */
function lerRegisto(o = {}) {
  const { readImpl = fs.readFileSync, existsImpl = fs.existsSync } = o;
  const { caminho, partilhado } = caminhoDoRegisto(Object.assign({}, o, { existsImpl }));
  if (!caminho || !existsImpl(caminho)) {
    return { devices: {}, caminho, partilhado, existe: false, erro: null };
  }
  try {
    const d = JSON.parse(String(readImpl(caminho, 'utf8')));
    const devices = d && typeof d.devices === 'object' && d.devices ? d.devices : {};
    return { devices, caminho, partilhado, existe: true, erro: null };
  } catch (err) {
    return { devices: {}, caminho, partilhado, existe: true, erro: String(err && err.message).slice(0, 120) };
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
  // O `kid` fica FORA do MAC de proposito, e por duas razoes. A primeira e que
  // `canonico` exclui `sig` inteiro: cobri-lo obrigaria a mudar o corpo assinado
  // e invalidaria todos os beacons ja assinados sem ganhar nada. A segunda e que
  // nao precisa de cobertura — mexer no `kid` nao faz um beacon passar: kid
  // trocado da `chave-diferente`, kid apagado cai no MAC, e o MAC continua a
  // recusar. O pior que um atacante consegue e piorar a sua propria mensagem de
  // erro.
  return { alg: ALG_TAG, kid: kidDaChave(chave), ts, nonce, mac };
}

/**
 * Assina com a chave PRIVADA deste device.
 *
 * O envelope tem a mesma forma do HMAC de proposito — `alg`, `kid`, `ts`,
 * `nonce`, `mac` — para que tudo o que ja le beacons continue a ler. O que muda
 * e o que o `mac` e (uma assinatura de 64B em vez de um MAC de 32B) e, sobretudo,
 * o que e preciso para o produzir.
 */
function assinarEd(payload, o = {}) {
  const {
    privada,
    pub,
    ts = new Date().toISOString(),
    nonce = crypto.randomBytes(16).toString('hex'),
  } = o;
  if (!privada) throw new Error('assinarEd() sem chave privada do device');
  const corpo = canonico(Object.assign({}, payload, { _ts: ts, _nonce: nonce }));
  const mac = crypto.sign(null, Buffer.from(corpo, 'utf8'), privada).toString('hex');
  return { alg: ALG_ED, kid: kidDaPublica(pub), ts, nonce, mac };
}

/** Assina em-sitio com Ed25519. */
function assinadoEd(payload, o = {}) {
  return Object.assign({}, payload, { sig: assinarEd(payload, o) });
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
    // Ed25519: o registo de publicas, e a identidade contra a qual se procura.
    registo = null,
    device = null,
  } = o;
  const sig = payload && payload.sig;

  if (!sig) return { ok: false, motivo: 'sem assinatura', codigo: 'nao-assinado', idade_s: null };
  const ed = sig.alg === ALG_ED;
  if (sig.alg !== ALG_TAG && !ed) {
    return { ok: false, motivo: 'algoritmo desconhecido: ' + String(sig.alg).slice(0, 40), codigo: 'alg-desconhecido', idade_s: null };
  }

  /**
   * Ed25519: quem verifica e o REGISTO, e a identidade e o `device` que o
   * chamador passa — o nome do FICHEIRO, nunca o campo `device` de dentro do
   * beacon. Sem isso, um beacon do Mac pousado em `pc-paulo.json` verificaria
   * com a publica do Mac e roubava-lhe o lugar.
   */
  let publica = null;
  if (ed) {
    if (!device) {
      return { ok: false, motivo: 'sem identidade de device: nao ha registo onde procurar a chave publica', codigo: 'sem-device', idade_s: null };
    }
    const entrada = registo && registo.devices ? registo.devices[device] : null;
    if (!entrada || !entrada.pub) {
      return {
        ok: false,
        motivo: `'${device}' nao esta inscrito no registo de devices de confianca — o dono ainda nao o autorizou`,
        codigo: 'nao-inscrito',
        idade_s: null,
      };
    }
    if (sig.kid && entrada.kid && sig.kid !== entrada.kid) {
      return {
        ok: false,
        motivo: `assinado por outra chave que nao a inscrita para '${device}' (kid ${String(sig.kid).slice(0, KID_HEX)}, inscrita ${entrada.kid})`,
        codigo: 'chave-diferente',
        idade_s: null,
      };
    }
    try {
      publica = crypto.createPublicKey({ key: Buffer.from(entrada.pub, 'base64'), format: 'der', type: 'spki' });
    } catch (err) {
      return { ok: false, motivo: `chave publica de '${device}' ilegivel no registo: ${String(err && err.message).slice(0, 60)}`, codigo: 'registo-ilegivel', idade_s: null };
    }
  } else if (!chave || !Buffer.isBuffer(chave) || chave.length !== KEY_BYTES) {
    return { ok: false, motivo: 'sem chave do dono para verificar', codigo: 'sem-chave', idade_s: null };
  }

  // Ed25519 assina 64B; o HMAC-SHA256 produz 32B. Cada um so aceita o seu.
  const hexEsperado = ed ? 128 : 64;
  if (typeof sig.mac !== 'string' || !new RegExp(`^[0-9a-f]{${hexEsperado}}$`).test(sig.mac)) {
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

  /**
   * A chave que assinou e a nossa?
   *
   * Beacons de versoes anteriores a 2026-08-24 nao trazem `kid`. Esses caem
   * direitos no MAC, como sempre cairam — recusar por falta de `kid` apagaria a
   * frota do painel no dia do upgrade, que e o mesmo erro que o `nao-assinado`
   * ja evita mais acima.
   */
  const nosso = ed ? null : kidDaChave(chave);
  if (!ed && sig.kid && nosso && sig.kid !== nosso) {
    return {
      ok: false,
      motivo: 'assinado com outra chave do dono (kid ' + String(sig.kid).slice(0, KID_HEX) + ', esperado ' + nosso + ') — device por enrolar, nao adulteracao',
      codigo: 'chave-diferente',
      idade_s: idadeS,
    };
  }

  const corpo = canonico(Object.assign({}, payload, { _ts: sig.ts, _nonce: sig.nonce }));

  if (ed) {
    const bate = crypto.verify(null, Buffer.from(corpo, 'utf8'), publica, Buffer.from(sig.mac, 'hex'));
    if (!bate) {
      // Aqui NAO ha a ambiguidade do HMAC: a publica veio do registo, indexada
      // pelo nome do ficheiro. Se nao bate, o conteudo foi mexido depois de
      // assinado — nao ha segunda causa possivel.
      return { ok: false, motivo: 'assinatura nao bate com o conteudo', codigo: 'adulterado', idade_s: idadeS };
    }
    if (vistos) {
      if (vistos.has(sig.nonce)) return { ok: false, motivo: 'nonce ja visto (replay)', codigo: 'replay', idade_s: idadeS };
      vistos.add(sig.nonce);
    }
    return { ok: true, motivo: null, codigo: 'ok', idade_s: idadeS, alg: ALG_ED };
  }

  const esperado = crypto.createHmac(ALG, chave).update(corpo, 'utf8').digest();
  const dado = Buffer.from(sig.mac, 'hex');
  if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) {
    /**
     * Sem `kid` no envelope nao ha como saber QUAL das duas causas foi.
     *
     * O beacon vem de uma versao anterior a 2026-08-24, que nao carimbava kid.
     * Um MAC que nao bate pode ser adulteracao OU uma chave diferente, e o
     * recibo nao pode escolher uma e afirma-la: foi exactamente assim que o
     * `desktop-j26409q` apareceu acusado de forja durante a transicao. Recusa-se
     * na mesma — o veredicto nunca esteve em duvida —, mas a causa diz o que
     * sabe e o que nao sabe.
     */
    if (!sig.kid) {
      return {
        ok: false,
        motivo: 'assinatura nao bate — e sem kid no envelope (device numa versao anterior) a causa pode ser chave diferente OU adulteracao',
        codigo: 'adulterado',
        kid_ausente: true,
        idade_s: idadeS,
      };
    }
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
  ALG_ED,
  KEY_BYTES,
  KID_HEX,
  kidDaChave,
  kidDaPublica,
  caminhoDaChaveDoDevice,
  caminhoDoRegisto,
  chaveDoDevice,
  lerRegisto,
  assinarEd,
  assinadoEd,
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
