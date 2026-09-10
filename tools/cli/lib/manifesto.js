/**
 * manifesto.js — verificar um manifesto de release ANTES de trocar o payload.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA PREMISSA DO KICKOFF ESTAVA ERRADA, E ISTO E A CORRECCAO
 * ────────────────────────────────────────────────────────────────────────────
 * O kickoff da W1 diz: «assinatura Ed25519 com a chave publica **ja embutida
 * nos beacons**». Nao esta. Procurado no repo a 2026-09-10 (`PUBKEY`,
 * `publicKey`, `BEGIN PUBLIC`, `SPKI`, `chave_publica` em `tools/`,
 * `packages/mooter-bridge/`, `landing/app/`): **zero** chaves publicas
 * embutidas. O que existe e outra coisa, e nao serve para isto:
 *
 *  · `assinatura.js` HMAC-SHA256 — chave SIMETRICA do dono. Quem verifica
 *    consegue assinar. Pousar essa chave em cada cliente e dar a chave de
 *    assinar releases a toda a gente que instala o Mooter.
 *  · `assinatura.js` Ed25519 — chave POR DEVICE, verificada contra um registo
 *    (`50-fleet/trusted-devices.json`) que vive no vault PESSOAL do dono. Um
 *    cliente instalado nao tem vault nenhum, logo nao tem registo, logo nao
 *    tem contra o que verificar.
 *
 * Uma release assinada precisa de uma terceira coisa: **uma chave de release,
 * cuja publica vem pregada no cliente** e cuja privada nunca sai de quem corta
 * releases. E isso que este ficheiro define.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * E FALHA FECHADA, DE PROPOSITO
 * ────────────────────────────────────────────────────────────────────────────
 * Essa chave AINDA NAO EXISTE — gera-la exige um segredo que so o dono pode
 * criar e guardar. Por isso este modulo NAO traz chave nenhuma inventada. Sem
 * `release-pubkey.json` presente e valido, `verificarManifesto()` devolve
 * `ok:false` com codigo `sem-ancora`, e o `update` recusa-se a trocar o
 * payload. Nunca "avisa e continua".
 *
 * A alternativa — deixar passar enquanto nao ha chave — e o defeito que o
 * adversario ja mediu no bridge: «o updater verifica presenca/sintaxe, nao
 * assinatura — um atacante da origem entrega JS valido». Um verificador que
 * degrada para "aceito na mesma" nao e um verificador; e um comentario.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ENTRA NA ASSINATURA
 * ────────────────────────────────────────────────────────────────────────────
 * O corpo canonico (`canonico()` de `assinatura.js`, que ordena chaves e exclui
 * `sig`) de TODOS os campos: `version`, `url`, `sha256`, `channel`, `released`.
 * O `sha256` tem de estar dentro da assinatura — se estivesse fora, um atacante
 * trocava o binario e o hash ao mesmo tempo e a assinatura continuava valida
 * sobre um manifesto que ja nao descreve o que se descarrega.
 *
 * O `channel` tambem entra, e e verificado contra o canal PEDIDO: sem isso, um
 * manifesto `beta` assinado de boa-fe pode ser servido a quem pediu `stable`
 * (o atacante nao forja nada — apenas serve o ficheiro errado, que e um ataque
 * de rebaixamento perfeitamente valido).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { canonico } = require('../../router/assinatura.js');

/** O rotulo do algoritmo. Versionado: mudar de esquema tem de ser visivel. */
const ALG_RELEASE = 'Ed25519-release-v1';

/** Onde vive a publica pregada no cliente. Ausente = sem ancora = recusa. */
const FICHEIRO_ANCORA = path.join(__dirname, '..', 'release-pubkey.json');

/** Os campos que um manifesto TEM de trazer, todos cobertos pela assinatura. */
const CAMPOS = Object.freeze(['version', 'url', 'sha256', 'channel', 'released']);

const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * A chave publica de release pregada neste cliente.
 * `{ ok:false, porque }` quando nao ha — nunca uma chave por omissao.
 */
function ancora(o = {}) {
  const {
    caminho = FICHEIRO_ANCORA,
    readImpl = fs.readFileSync,
    existsImpl = fs.existsSync,
  } = o;
  if (o.pubB64) return { ok: true, pubB64: o.pubB64, fonte: 'injectada' };
  if (!existsImpl(caminho)) {
    return {
      ok: false,
      porque:
        'nao ha chave publica de release neste cliente (' +
        path.basename(caminho) +
        ' ausente) — nenhuma actualizacao pode ser verificada, logo nenhuma e aplicada',
    };
  }
  try {
    const j = JSON.parse(readImpl(caminho, 'utf8'));
    if (!j || typeof j.pub !== 'string' || !j.pub) {
      return { ok: false, porque: 'ancora sem campo `pub`' };
    }
    return { ok: true, pubB64: j.pub, fonte: caminho };
  } catch (e) {
    return { ok: false, porque: 'ancora ilegivel: ' + e.message.slice(0, 80) };
  }
}

/** Compara semver. >0 se `a` for mais recente. Nao-semver ordena como menor. */
function comparaVersao(a, b) {
  const ma = SEMVER_RE.exec(String(a || ''));
  const mb = SEMVER_RE.exec(String(b || ''));
  if (!ma && !mb) return 0;
  if (!ma) return -1;
  if (!mb) return 1;
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** A forma esta certa? Separado da assinatura para o erro dizer QUAL das duas. */
function forma(m) {
  if (!m || typeof m !== 'object') return 'manifesto nao e um objecto';
  for (const c of CAMPOS) {
    if (typeof m[c] !== 'string' || !m[c]) return `campo \`${c}\` em falta ou vazio`;
  }
  if (!SHA256_RE.test(m.sha256)) return 'campo `sha256` nao e um sha256 hexadecimal de 64 chars';
  if (!SEMVER_RE.test(m.version)) return `versao '${String(m.version).slice(0, 20)}' nao e semver`;
  let u;
  try {
    u = new URL(m.url);
  } catch {
    return 'campo `url` nao e um URL';
  }
  // O payload e codigo que vai correr nesta maquina. Um `http://` deixa um
  // intermediario servir outro ficheiro; a assinatura apanha-o, mas apanha-o
  // DEPOIS do download. Recusar antes e mais barato e mais claro.
  if (u.protocol !== 'https:') return `\`url\` tem de ser https (e ${u.protocol}//)`;
  return null;
}

/**
 * Verifica um manifesto. Devolve SEMPRE `{ ok, codigo, porque, ... }` — este
 * valor vira recibo e aparece ao utilizador.
 *
 * `canalPedido` e obrigatorio: verificar a assinatura sem verificar o canal
 * deixa passar um manifesto valido do canal errado.
 */
function verificarManifesto(manifesto, o = {}) {
  const { canalPedido = null, versaoInstalada = null } = o;

  const mau = forma(manifesto);
  if (mau) return { ok: false, codigo: 'forma', porque: mau };

  if (!canalPedido) {
    return { ok: false, codigo: 'sem-canal', porque: 'verificarManifesto() sem canalPedido' };
  }
  if (manifesto.channel !== canalPedido) {
    return {
      ok: false,
      codigo: 'canal-trocado',
      porque: `pedi o canal '${canalPedido}' e este manifesto e do canal '${String(manifesto.channel).slice(0, 40)}'`,
    };
  }

  const sig = manifesto.sig;
  if (!sig || typeof sig !== 'object') {
    return { ok: false, codigo: 'nao-assinado', porque: 'manifesto sem assinatura' };
  }
  if (sig.alg !== ALG_RELEASE) {
    return {
      ok: false,
      codigo: 'alg-desconhecido',
      porque: `algoritmo '${String(sig.alg).slice(0, 40)}' — este cliente so aceita ${ALG_RELEASE}`,
    };
  }
  if (typeof sig.mac !== 'string' || !/^[0-9a-f]+$/i.test(sig.mac)) {
    return { ok: false, codigo: 'assinatura-malformada', porque: 'campo `sig.mac` nao e hexadecimal' };
  }

  const anc = ancora(o);
  if (!anc.ok) return { ok: false, codigo: 'sem-ancora', porque: anc.porque };

  let chave;
  try {
    chave = crypto.createPublicKey({
      key: Buffer.from(anc.pubB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (e) {
    return { ok: false, codigo: 'ancora-invalida', porque: 'chave publica ilegivel: ' + e.message.slice(0, 80) };
  }

  const corpo = canonico(manifesto);
  let valida = false;
  try {
    valida = crypto.verify(null, Buffer.from(corpo, 'utf8'), chave, Buffer.from(sig.mac, 'hex'));
  } catch (e) {
    return { ok: false, codigo: 'assinatura-invalida', porque: 'verificacao falhou: ' + e.message.slice(0, 80) };
  }
  if (!valida) {
    return {
      ok: false,
      codigo: 'assinatura-invalida',
      porque: 'a assinatura nao corresponde ao conteudo deste manifesto',
    };
  }

  const cmp = versaoInstalada == null ? 1 : comparaVersao(manifesto.version, versaoInstalada);
  return {
    ok: true,
    codigo: cmp > 0 ? 'nova' : 'ja-tens',
    porque:
      cmp > 0
        ? `assinatura valida · v${manifesto.version} no canal ${manifesto.channel}`
        : `assinatura valida · ja estas em v${versaoInstalada} (manifesto: v${manifesto.version})`,
    version: manifesto.version,
    sha256: manifesto.sha256,
    url: manifesto.url,
    channel: manifesto.channel,
    maisRecente: cmp > 0,
    kid: sig.kid || null,
  };
}

/**
 * Assina um manifesto. Vive aqui — e nao num script de release separado — para
 * que a coisa que assina e a coisa que verifica leiam a MESMA definicao de
 * corpo canonico. Duas definicoes divergem, e divergem em silencio.
 * Usado pelo CI de release e pelos testes.
 */
function assinarManifesto(manifesto, privada, o = {}) {
  const mau = forma(manifesto);
  if (mau) throw new Error('nao assino um manifesto malformado: ' + mau);
  const corpo = canonico(manifesto);
  const mac = crypto.sign(null, Buffer.from(corpo, 'utf8'), privada).toString('hex');
  return Object.assign({}, manifesto, {
    sig: { alg: ALG_RELEASE, kid: o.kid || null, mac },
  });
}

module.exports = {
  ALG_RELEASE,
  FICHEIRO_ANCORA,
  CAMPOS,
  ancora,
  forma,
  comparaVersao,
  verificarManifesto,
  assinarManifesto,
};
