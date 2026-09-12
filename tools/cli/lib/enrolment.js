/**
 * enrolment.js — o codigo de uso unico morre aqui, e nasce uma chave de device.
 *
 * D3 DO ADR. O `.mcpb` nunca carrega credencial persistente: leva (ou o
 * utilizador cola) um **codigo de bootstrap de uso unico, valido 24 h**. Este
 * modulo troca-o por uma **chave deste device** — escopada, revogavel, guardada
 * com 0600.
 *
 * PORQUE A TROCA E O PONTO TODO. O codigo de bootstrap e um portador: quem o
 * tiver, e' o utilizador. Isso e aceitavel durante 24 h e uma vez; nao e
 * aceitavel para sempre. Depois da troca:
 *   · a credencial que fica no disco vale SO para este device;
 *   · pode ser revogada sem tocar em mais nada (estado A9 do mapa);
 *   · e quem a rouba nao consegue enrolar outro device com ela.
 *
 * O QUE VIAJA E O QUE NAO VIAJA. O device gera um par Ed25519 e envia a
 * **publica**. A privada nunca sai desta maquina — nem no enrolment, nem
 * depois. E o que o servidor devolve (a chave de device) e guardado com 0600 e
 * nunca impresso: `mooter init` diz «ligado», nao diz a chave.
 *
 * FALHA ABERTA, e de proposito. Um enrolment que falha NAO impede o Mooter de
 * funcionar — cai em Free local, que e o modo normal da D2. Estados B10 (codigo
 * invalido) e B12 (chave revogada) dizem uma frase e apontam uma saida; nenhum
 * deles bloqueia o router. Essa e a regra do mapa: «nenhum estado bloqueia o
 * router — degrada, avisa, nunca para».
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { raizMooter } = require('./entitlement.js');

/** Onde vive a credencial deste device. 0600, e nunca impressa. */
function caminhoDasCredenciais(o = {}) {
  return path.join(raizMooter(o), 'credentials');
}

/** Onde vive a chave privada do device. Tambem 0600. */
function caminhoDaPrivada(o = {}) {
  return path.join(raizMooter(o), 'device-enrol.key');
}

const ENDPOINT = 'https://mooter.ai/api/devices/enroll';

/** O formato do codigo de bootstrap. Fechado: ele entra num pedido. */
const CODIGO_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Gera (ou reutiliza) o par deste device.
 *
 * Reutilizar importa: gerar um par novo a cada tentativa de enrolment faria
 * com que uma segunda tentativa depois de um erro de rede inscrevesse uma chave
 * diferente da que ficou no disco — e o device passava a assinar com uma chave
 * que o servidor nao conhece, em silencio.
 */
function parDoDevice(o = {}) {
  const { fsImpl = fs } = o;
  const caminho = caminhoDaPrivada(o);
  if (fsImpl.existsSync(caminho)) {
    const privada = crypto.createPrivateKey(fsImpl.readFileSync(caminho, 'utf8'));
    return { privada, pub: publicaB64(privada), nova: false };
  }
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  fsImpl.mkdirSync(path.dirname(caminho), { recursive: true });
  fsImpl.writeFileSync(caminho, pem, { mode: 0o600 });
  return { privada: privateKey, pub: publicaB64(privateKey), nova: true };
}

function publicaB64(privada) {
  return crypto.createPublicKey(privada).export({ format: 'der', type: 'spki' }).toString('base64');
}

/** Ja existe credencial deste device? */
function ligado(o = {}) {
  const { fsImpl = fs } = o;
  try {
    const j = JSON.parse(fsImpl.readFileSync(caminhoDasCredenciais(o), 'utf8'));
    return !!(j && j.device_key);
  } catch {
    return false;
  }
}

/**
 * Troca o codigo por uma chave de device.
 *
 * Devolve sempre `{ ok, codigo, porque }` — este valor e' impresso, por isso
 * nao pode trazer nada de secreto dentro.
 */
async function enrolar(codigoBootstrap, o = {}) {
  const {
    fetchImpl = globalThis.fetch,
    fsImpl = fs,
    endpoint = ENDPOINT,
    deviceId = null,
    timeoutMs = 8000,
  } = o;

  if (!codigoBootstrap) {
    return { ok: false, codigo: 'sem-codigo', porque: 'Free local — sem conta ligada. Podes ligar uma depois em mooter.ai/settings.' };
  }
  if (!CODIGO_RE.test(String(codigoBootstrap))) {
    // B10, apanhado ANTES de sair da maquina: um codigo malformado nao vale um
    // pedido de rede, e a mensagem e melhor do que a que o servidor daria.
    return { ok: false, codigo: 'codigo-invalido', porque: 'Este codigo de instalacao nao tem a forma certa. Descarrega outro em mooter.ai/settings.' };
  }

  const par = parDoDevice(o);

  let r;
  try {
    r = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrap_code: String(codigoBootstrap),
        device_pub: par.pub,
        device_id: deviceId,
        platform: process.platform,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, codigo: 'sem-rede', porque: 'Sem rede nao consigo ligar este device. Continua em Free local; tenta outra vez depois.' };
  }

  if (r.status === 401 || r.status === 410) {
    // B10 — o codigo expirou ou ja foi usado.
    return { ok: false, codigo: 'codigo-gasto', porque: 'Este codigo expirou ou ja foi usado. Continua em Free local; gera outro em mooter.ai/settings.' };
  }
  if (!r.ok) {
    return { ok: false, codigo: 'origem-recusou', porque: `O servidor respondeu ${r.status}. Continua em Free local.` };
  }

  let j;
  try {
    j = await r.json();
  } catch {
    return { ok: false, codigo: 'resposta-ilegivel', porque: 'O servidor devolveu algo que nao percebi. Continua em Free local.' };
  }
  if (!j || typeof j.device_key !== 'string' || !j.device_key) {
    return { ok: false, codigo: 'sem-chave', porque: 'O servidor nao devolveu chave de device. Continua em Free local.' };
  }

  const caminho = caminhoDasCredenciais(o);
  fsImpl.mkdirSync(path.dirname(caminho), { recursive: true });
  fsImpl.writeFileSync(
    caminho,
    JSON.stringify({ device_key: j.device_key, device_id: j.device_id || deviceId, ligado_em: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  // Se o ficheiro ja existia com outras permissoes, o `mode` do writeFileSync
  // NAO as corrige — ele so se aplica a criacao. Sem este chmod, um
  // `credentials` criado por uma versao antiga ficava 0644 para sempre.
  try {
    fsImpl.chmodSync(caminho, 0o600);
  } catch { /* Windows nao tem modos POSIX; nao e motivo para falhar */ }

  return {
    ok: true,
    codigo: 'ligado',
    porque: 'Device ligado a tua conta.',
    // Nunca a chave. Nem truncada: meia chave e um bom principio para quem
    // esta a adivinhar a outra metade.
    device_id: j.device_id || deviceId,
    chave_nova: par.nova,
  };
}

/**
 * A chave foi revogada do outro lado (estado B12). Nao apaga a privada: o
 * device pode voltar a ser ligado, e gerar outro par por causa de uma revogacao
 * so faz o registo do servidor encher-se de chaves mortas.
 */
function esquecerCredencial(o = {}) {
  const { fsImpl = fs } = o;
  const caminho = caminhoDasCredenciais(o);
  try {
    if (fsImpl.existsSync(caminho)) fsImpl.rmSync(caminho);
  } catch { /* nao ha nada a fazer, e nao vale a pena rebentar por isto */ }
  return { ok: true, codigo: 'esquecido', porque: 'Este device foi revogado. Continua em Free local; volta a liga-lo em mooter.ai/settings.' };
}

module.exports = {
  ENDPOINT,
  CODIGO_RE,
  caminhoDasCredenciais,
  caminhoDaPrivada,
  parDoDevice,
  publicaB64,
  ligado,
  enrolar,
  esquecerCredencial,
};
