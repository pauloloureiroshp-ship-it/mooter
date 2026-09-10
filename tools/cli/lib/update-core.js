/**
 * update-core.js — a decisao do `mooter update`, separada da impressao.
 *
 * PORQUE ESTA SEPARADO DO `commands/update.js`: para poder ser testado sem
 * rede, sem disco e sem trocar o payload de ninguem. O `commands/update.js`
 * fica so com `console.log`. A regra da casa — «todo o I/O e injectavel» —
 * vale a dobrar aqui: este e o codigo que decide QUE BINARIO passa a correr
 * nesta maquina.
 *
 * A SEQUENCIA, e cada passo so acontece se o anterior passou:
 *   1. canal          ← entitlement (D4), nunca do profile.json
 *   2. manifesto      ← https://mooter.ai/release/<canal>/manifest.json
 *   3. assinatura     ← Ed25519 contra a publica pregada no cliente
 *   4. canal do manifesto == canal pedido  (anti-rebaixamento)
 *   5. versao > instalada, senao para aqui e diz «ja tens»
 *   6. download       → cli.next
 *   7. sha256         ← contra o que o manifesto ASSINADO prometeu
 *   8. troca atomica  → cli.prev guardado para o rollback
 *
 * O `--check` corre 1..5 e para. Nunca descarrega, nunca escreve.
 *
 * ESTADOS DO MAPA COBERTOS:
 *   B2  sem rede no arranque  → `codigo: 'sem-rede'`, «Tento outra vez quando houver.»
 *   B14 assinatura invalida   → nunca chega a trocar; se ja tinha trocado, `reverter()`
 */

'use strict';

const { lerCanal } = require('./entitlement.js');
const { verificarManifesto } = require('./manifesto.js');
const { trocar, reverter, caminhos } = require('./payload-troca.js');

/** A origem dos manifestos. Uma constante para o teste a poder substituir. */
const BASE = 'https://mooter.ai/release';

/** Quanto tempo se espera por um manifesto antes de assumir que nao ha rede. */
const TIMEOUT_MS = 8000;

function urlDoManifesto(canal, o = {}) {
  const base = o.base || BASE;
  return `${base}/${encodeURIComponent(canal)}/manifest.json`;
}

/**
 * Busca o manifesto. Distingue «sem rede» de «servidor respondeu mal»: a
 * primeira e uma nao-noticia (o utilizador esta num aviao), a segunda e um
 * problema de quem serve. Dizer «erro» as duas ensina a ignorar as duas.
 */
async function buscarManifesto(canal, o = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = o;
  const url = urlDoManifesto(canal, o);
  let r;
  try {
    r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return {
      ok: false,
      codigo: 'sem-rede',
      porque: 'Sem rede nao consigo procurar actualizacoes. Tento outra vez quando houver.',
      detalhe: String(e && e.message).slice(0, 120),
    };
  }
  if (!r.ok) {
    return { ok: false, codigo: 'origem-recusou', porque: `a origem respondeu ${r.status} em ${url}` };
  }
  try {
    return { ok: true, manifesto: await r.json() };
  } catch (e) {
    return { ok: false, codigo: 'manifesto-ilegivel', porque: 'a origem devolveu algo que nao e JSON: ' + String(e && e.message).slice(0, 80) };
  }
}

/**
 * Decide (e, se `aplicar`, executa). Devolve sempre um objecto-recibo.
 *
 * `descarregarImpl(url, destino)` fica de fora: o que aqui se prova e a ORDEM
 * e as recusas, nao a mecanica de um `.tar.gz`.
 */
async function correr(o = {}) {
  const { aplicar = false, versaoInstalada = null, descarregarImpl = null } = o;

  const canal = lerCanal(o);
  const passos = [{ passo: 'canal', ok: true, valor: canal.canal, fonte: canal.fonte, porque: canal.porque }];

  const busca = await buscarManifesto(canal.canal, o);
  if (!busca.ok) {
    passos.push({ passo: 'manifesto', ok: false, codigo: busca.codigo, porque: busca.porque });
    return { ok: false, codigo: busca.codigo, porque: busca.porque, canal: canal.canal, passos };
  }
  passos.push({ passo: 'manifesto', ok: true, porque: urlDoManifesto(canal.canal, o) });

  const v = verificarManifesto(busca.manifesto, Object.assign({}, o, {
    canalPedido: canal.canal,
    versaoInstalada,
  }));
  passos.push({ passo: 'assinatura', ok: v.ok, codigo: v.codigo, porque: v.porque });
  if (!v.ok) {
    return { ok: false, codigo: v.codigo, porque: v.porque, canal: canal.canal, passos };
  }

  if (!v.maisRecente) {
    return { ok: true, codigo: 'ja-tens', porque: v.porque, canal: canal.canal, version: v.version, passos };
  }

  if (!aplicar) {
    return {
      ok: true,
      codigo: 'ha-nova',
      porque: `ha v${v.version} no canal ${v.channel} (tens v${versaoInstalada || 'n/d'})`,
      canal: canal.canal,
      version: v.version,
      passos,
    };
  }

  if (typeof descarregarImpl !== 'function') {
    return { ok: false, codigo: 'sem-descarregador', porque: 'correr({aplicar:true}) sem descarregarImpl', canal: canal.canal, passos };
  }

  const c = caminhos(o);
  let ficheiro;
  try {
    ficheiro = await descarregarImpl(v.url, c.proximo);
  } catch (e) {
    passos.push({ passo: 'download', ok: false, porque: String(e && e.message).slice(0, 120) });
    return { ok: false, codigo: 'download-falhou', porque: 'nao consegui descarregar o payload: ' + String(e && e.message).slice(0, 100), canal: canal.canal, passos };
  }
  passos.push({ passo: 'download', ok: true, porque: c.proximo });

  const t = trocar(Object.assign({}, o, { sha256Esperado: v.sha256, candidato: ficheiro }));
  passos.push({ passo: 'troca', ok: t.ok, codigo: t.codigo, porque: t.porque });
  if (!t.ok) {
    // Estado B14. Se a troca chegou a mexer no vivo, `trocar()` ja repos; se
    // mesmo assim ficou meia, `reverter()` e a segunda rede. Chamar sempre e
    // barato: sem `cli.prev` devolve `sem-anterior` e nao faz nada.
    const r = reverter(o);
    return {
      ok: false,
      codigo: t.codigo,
      porque: t.porque,
      revertido: r.ok,
      canal: canal.canal,
      passos: passos.concat([{ passo: 'rollback', ok: r.ok, codigo: r.codigo, porque: r.porque }]),
    };
  }

  return {
    ok: true,
    codigo: 'actualizado',
    porque: `v${versaoInstalada || 'n/d'} -> v${v.version} (canal ${v.channel}, assinatura ✓)`,
    canal: canal.canal,
    version: v.version,
    passos,
  };
}

module.exports = { BASE, TIMEOUT_MS, urlDoManifesto, buscarManifesto, correr };
