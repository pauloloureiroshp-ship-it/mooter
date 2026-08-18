'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A BARREIRA 2b: nomes E valores.
 *
 * Campos de identidade e de prova RECUSAM: fazem ida-e-volta nos botoes e um
 * valor errado pode autorizar a coisa errada. Campos de mostruario DEGRADAM para
 * n/d: apagar o cartao inteiro por um modelo ou actor estranho seria um apagao
 * de custodia. Degradar nunca e silencioso — os campos seguem em degradados.
 */

const { MOTORES_LEGIVEIS, FORMA_DE_MODELO, classeDaFonte } = require('./cartao.js');

const TIPOS = Object.freeze(['pendente', 'estado', 'decisao', 'fecho']);
const ESTADOS = Object.freeze([
  'APPROVED', 'REJECTED', 'STALE', 'EXPIRED', 'PARADO', 'JA_TERMINADO',
  'concluido', 'falhou',
]);
const ACCOES = Object.freeze(['aprovar', 'recusar', 'parar']);
const FORMA_DE_JOB_ID = Object.freeze(/^(?!\.+$)[A-Za-z0-9._-]{1,64}$/);
const FORMA_DE_HASH = Object.freeze(/^[a-f0-9]{64}$/);
const FORMA_DE_ACTOR = Object.freeze(/^slack:U[A-Z0-9]{2,20}$/i);
const FORMA_DE_WAVE = Object.freeze(/^[a-z0-9][a-z0-9._-]{0,31}$/);

const FRASES = Object.freeze({
  DESPACHADO: 'despachado — sigo neste thread',
  NAO_DESPACHOU: 'nao despachou',
  PENDENTE: 'aprova ou recusa este pedido',
  STALE: 'o estado mudou entre o cartao e o clique — o pedido CONTINUA a espera',
  APROVADO: 'aprovado — re-despachado',
  RECUSADO: 'recusado por quem decide',
  SEM_DECISAO: 'sem decisão — motivo não reconhecido (ver registo local)',
  JA_TERMINADO: 'o trabalho já tinha acabado — nada foi interrompido',
  PARADO: 'o trabalho foi interrompido a teu pedido',
});
const CATALOGO_DE_FRASES = Object.freeze(Object.values(FRASES));

const CUSTO_PORQUE = Object.freeze({
  SEM_VALOR: 'n/d — o pendente nao traz cost_usd; um numero sem proveniencia nao se publica',
  SEM_FONTE: 'n/d — a fonte do custo e n/d; um numero sem proveniencia nao se publica',
  DEGRADADO: 'n/d — custo fora do esquema de publicacao',
});
const CATALOGO_CUSTO_PORQUE = Object.freeze(Object.values(CUSTO_PORQUE));
const FONTES_CANONICAS = Object.freeze({
  motor: 'reportado pelo CLI',
  local: 'inferência local sem custo de API',
  estimativa: 'calculado a partir de tokens e tabela de precos',
});

const SUBCHAVES = Object.freeze({
  autor: Object.freeze(['valor', 'rotulo', 'fonte', 'porque']),
  motor: Object.freeze(['valor', 'rotulo', 'fonte', 'porque']),
  modelo: Object.freeze(['valor', 'rotulo', 'fonte', 'porque']),
  custo: Object.freeze(['valor', 'rotulo', 'fonte', 'estimativa', 'porque']),
  diff_stat: Object.freeze(['valor', 'rotulo', 'fonte', 'porque']),
  cadeia: Object.freeze(['pedidos', 'total', 'fontes', 'todosMedidos']),
  auditoria: Object.freeze([
    'request', 'veredicto', 'accao', 'estado', 'actor', 'hash', 'autorizacao', 'job_novo',
  ]),
});

const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const objectoPlano = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const numeroSeguro = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function congelar(o) {
  if (!o || typeof o !== 'object' || Object.isFrozen(o)) return o;
  for (const v of Object.values(o)) congelar(v);
  return Object.freeze(o);
}

function fonteCanonica(fonte) {
  const s = String(fonte == null ? '' : fonte).trim();
  for (const canonica of Object.values(FONTES_CANONICAS)) {
    if (s === canonica && classeDaFonte(s)) return canonica;
  }
  return null;
}

function subchaveDesconhecida(nome, valor) {
  if (!objectoPlano(valor)) return null;
  return Object.keys(valor).find((k) => !SUBCHAVES[nome].includes(k)) || null;
}

function resultado(ok, payload, degradados, porque) {
  return Object.freeze({
    ok, payload: payload && congelar(payload),
    degradados: Object.freeze([...degradados]), porque: porque || null,
  });
}

function recusa(porque, degradados) {
  return resultado(false, null, degradados, porque);
}

function normalizarCampo(nome, valor, degradados) {
  if (valor == null) {
    degradados.add(nome);
    return { valor: null };
  }
  if (!objectoPlano(valor)) return recusa(nome + ' tem de ser objecto', degradados);
  const desconhecida = subchaveDesconhecida(nome, valor);
  if (desconhecida) {
    return recusa('subchave fora do esquema em ' + nome + ': ' + desconhecida, degradados);
  }

  if (!proprio(valor, 'valor') || valor.valor === undefined) {
    degradados.add(nome);
    return { valor: null };
  }
  const v = valor.valor;
  if (nome === 'autor') {
    if (v == null || FORMA_DE_ACTOR.test(String(v))) return { valor: v == null ? null : String(v) };
  } else if (nome === 'motor') {
    if (v == null || proprio(MOTORES_LEGIVEIS, String(v))) {
      return { valor: v == null ? null : String(v) };
    }
  } else if (nome === 'modelo') {
    if (v == null) return { valor: null };
    const modelo = String(v);
    if (FORMA_DE_MODELO.test(modelo.replace(/-\d{8}$/, ''))) return { valor: modelo };
  } else if (nome === 'diff_stat') {
    if (v === null) return { valor: null };
  }
  degradados.add(nome);
  return { valor: null };
}

function normalizarCusto(valor, degradados) {
  if (valor == null) return null;
  if (!objectoPlano(valor)) return recusa('custo tem de ser objecto', degradados);
  const desconhecida = subchaveDesconhecida('custo', valor);
  if (desconhecida) {
    return recusa('subchave fora do esquema em custo: ' + desconhecida, degradados);
  }

  const temValor = valor.valor != null;
  const numero = temValor ? numeroSeguro(valor.valor) : null;
  const fonte = valor.fonte == null ? null : fonteCanonica(valor.fonte);
  let porque = CATALOGO_CUSTO_PORQUE.includes(valor.porque) ? valor.porque : null;
  if (valor.porque != null && !porque) degradados.add('custo');

  if ((temValor && numero == null) || (valor.fonte != null && !fonte)
      || (numero != null && !fonte)) {
    degradados.add('custo');
    return { valor: null, fonte: null, porque: CUSTO_PORQUE.DEGRADADO };
  }
  if (numero == null && !porque) {
    porque = fonte == null ? CUSTO_PORQUE.SEM_VALOR : CUSTO_PORQUE.SEM_FONTE;
  }
  return { valor: numero, fonte, porque };
}

function normalizarCadeia(valor, degradados) {
  if (valor == null) return null;
  if (!objectoPlano(valor)) return recusa('cadeia tem de ser objecto', degradados);
  const desconhecida = subchaveDesconhecida('cadeia', valor);
  if (desconhecida) {
    return recusa('subchave fora do esquema em cadeia: ' + desconhecida, degradados);
  }

  const pedidos = valor.pedidos;
  const total = numeroSeguro(valor.total);
  const fontes = valor.fontes;
  if (!Number.isInteger(pedidos) || pedidos < 0 || total == null || !Array.isArray(fontes)
      || typeof valor.todosMedidos !== 'boolean') {
    degradados.add('cadeia');
    return null;
  }
  const canonicas = fontes.map(fonteCanonica);
  if (canonicas.some((f) => !f)) {
    degradados.add('cadeia');
    return null;
  }
  return {
    pedidos, total, fontes: [...new Set(canonicas)], todosMedidos: valor.todosMedidos,
  };
}

function parteDeAuditoria(nome, valor) {
  if (nome === 'request' || nome === 'job_novo') {
    return FORMA_DE_JOB_ID.test(String(valor == null ? '' : valor)) ? String(valor) : 'n/d';
  }
  if (nome === 'veredicto') return ['aprovar', 'recusar'].includes(valor) ? valor : 'n/d';
  if (nome === 'accao') return valor === 'parar' ? valor : 'n/d';
  if (nome === 'estado') return ESTADOS.includes(valor) ? valor : 'n/d';
  if (nome === 'actor') {
    return FORMA_DE_ACTOR.test(String(valor == null ? '' : valor)) ? String(valor) : 'n/d';
  }
  if (nome === 'hash') {
    return FORMA_DE_HASH.test(String(valor == null ? '' : valor))
      ? String(valor).slice(0, 12) + '…' : 'n/d';
  }
  if (nome === 'autorizacao') {
    const s = String(valor == null ? '' : valor);
    if (s === 'single_user') return s;
    if (s.startsWith('roles:') && s.slice('roles:'.length).trim()) return 'roles';
    return 'n/d';
  }
  return 'n/d';
}

function normalizarAuditoria(valor, degradados) {
  if (valor == null) return null;
  if (!objectoPlano(valor)) return recusa('auditoria tem de ser objecto', degradados);
  const desconhecida = subchaveDesconhecida('auditoria', valor);
  if (desconhecida) {
    return recusa('subchave fora do esquema em auditoria: ' + desconhecida, degradados);
  }

  if (!proprio(valor, 'request')) {
    return recusa('auditoria exige request', degradados);
  }
  const temVeredicto = proprio(valor, 'veredicto');
  const temAccao = proprio(valor, 'accao');
  if (temVeredicto === temAccao) {
    return recusa('auditoria exige exactamente veredicto ou accao', degradados);
  }

  const partes = [];
  for (const nome of SUBCHAVES.auditoria) {
    if (!proprio(valor, nome)) continue;
    const seguro = parteDeAuditoria(nome, valor[nome]);
    if (seguro === 'n/d' && valor[nome] != null) degradados.add('auditoria.' + nome);
    partes.push(nome + '=' + seguro);
  }
  return partes.join(' · ');
}

/** Reconstrói o payload: nada do original atravessa por omissão. */
function validar(payload) {
  const p = payload || {};
  const degradados = new Set();
  if (!objectoPlano(p)) return recusa('payload tem de ser objecto', degradados);
  const out = {};

  if (!proprio(p, 'tipo') || !TIPOS.includes(p.tipo)) {
    return recusa('tipo fora do vocabulario fechado', degradados);
  }
  out.tipo = p.tipo;
  if (proprio(p, 'job_id')) {
    if (!FORMA_DE_JOB_ID.test(String(p.job_id == null ? '' : p.job_id))) {
      return recusa('job_id fora da forma verificavel', degradados);
    }
    out.job_id = String(p.job_id);
  }
  if (proprio(p, 'wave')) {
    if (p.wave == null) out.wave = null;
    else if (FORMA_DE_WAVE.test(String(p.wave))) out.wave = String(p.wave);
    else { out.wave = null; degradados.add('wave'); }
  }
  if (proprio(p, 'estado')) {
    if (!ESTADOS.includes(p.estado)) {
      return recusa('estado fora do vocabulario fechado', degradados);
    }
    out.estado = p.estado;
  }

  for (const nome of ['autor', 'motor', 'modelo', 'diff_stat']) {
    if (!proprio(p, nome)) continue;
    const campo = normalizarCampo(nome, p[nome], degradados);
    if (campo && campo.ok === false) return campo;
    out[nome] = campo;
  }
  if (proprio(p, 'custo')) {
    const custo = normalizarCusto(p.custo, degradados);
    if (custo && custo.ok === false) return custo;
    out.custo = custo;
  }
  if (proprio(p, 'cadeia')) {
    const cadeia = normalizarCadeia(p.cadeia, degradados);
    if (cadeia && cadeia.ok === false) return cadeia;
    out.cadeia = cadeia;
  }

  for (const nome of ['hash_esperado', 'hash_actual']) {
    if (!proprio(p, nome)) continue;
    if (p[nome] != null && !FORMA_DE_HASH.test(String(p[nome]))) {
      return recusa(nome + ' fora da forma verificavel', degradados);
    }
    out[nome] = p[nome] == null ? null : String(p[nome]);
  }
  if (proprio(p, 'auditoria')) {
    const auditoria = normalizarAuditoria(p.auditoria, degradados);
    if (auditoria && auditoria.ok === false) return auditoria;
    out.auditoria = auditoria;
  }
  if (proprio(p, 'accoes')) {
    const a = p.accoes;
    if (!Array.isArray(a) || new Set(a).size !== a.length || a.some((x) => !ACCOES.includes(x))) {
      return recusa('accoes fora do vocabulario fechado', degradados);
    }
    out.accoes = [...a];
  }
  if (proprio(p, 'texto')) {
    if (!CATALOGO_DE_FRASES.includes(p.texto)) {
      return recusa('texto fora do catalogo fechado', degradados);
    }
    out.texto = p.texto;
  }
  for (const nome of ['passos', 'segundos']) {
    if (!proprio(p, nome)) continue;
    const maximo = nome === 'passos' ? 10000 : 2592000;
    if (!Number.isInteger(p[nome]) || p[nome] < 0 || p[nome] > maximo) {
      return recusa(nome + ' fora da forma verificavel', degradados);
    }
    out[nome] = p[nome];
  }

  return resultado(true, out, degradados, null);
}

module.exports = Object.freeze({
  TIPOS, ESTADOS, ACCOES, FORMA_DE_JOB_ID, FORMA_DE_HASH, FORMA_DE_ACTOR, FORMA_DE_WAVE,
  FRASES, CUSTO_PORQUE, FONTES_CANONICAS, validar,
});
