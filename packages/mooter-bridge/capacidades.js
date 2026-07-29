'use strict';
/**
 * Sonda M0: guarda só o que o cliente declarou no initialize.
 *
 * Ausência não é negação. Uma capacidade omitida fica `null`; `false` só
 * existe quando o cliente o declarou explicitamente.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const NOMES = [
  'resources', 'prompts', 'elicitation', 'sampling', 'roots', 'logging',
  'notifications/progress',
];

function home(opts) {
  const o = opts || {};
  return o.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

function ficheiro(opts) {
  const o = opts || {};
  return o.file || path.join(home(o), 'mcp-capabilities.json');
}

function instante(opts) {
  const o = opts || {};
  return o.agora instanceof Date ? o.agora.toISOString()
    : (typeof o.agora === 'string' ? o.agora : new Date(o.agora || Date.now()).toISOString());
}

function tem(obj, chave) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, chave);
}

function apoioDeclarado(valor) {
  if (valor === false) return false;
  if (valor === true) return true;
  if (valor && typeof valor === 'object') {
    if (valor.supported === false || valor.suportado === false) return false;
    return true;
  }
  return null;
}

function declaredCapability(caps, nome) {
  if (tem(caps, nome)) return { declared: true, value: caps[nome] };
  if (nome === 'notifications/progress'
      && caps && typeof caps.notifications === 'object'
      && tem(caps.notifications, 'progress')) {
    return { declared: true, value: caps.notifications.progress };
  }
  return { declared: false, value: null };
}

function registo(nome, caps, medidoEm, ms) {
  const declaration = declaredCapability(caps, nome);
  const suportado = declaration.declared ? apoioDeclarado(declaration.value) : null;
  let porque;
  if (!declaration.declared || suportado === null) {
    porque = 'o cliente não declarou "' + nome
      + '" em initialize.params.capabilities; ausência não prova falta de suporte';
  } else if (suportado === false) {
    porque = 'o cliente declarou explicitamente "' + nome
      + '" como false em initialize.params.capabilities';
  } else {
    porque = 'o cliente declarou "' + nome
      + '" em initialize.params.capabilities; isto prova negociação, não uma chamada operacional';
  }
  return {
    capacidade: nome,
    suportado,
    porque,
    fonte: 'initialize.params.capabilities',
    medido_em: medidoEm,
    ms,
  };
}

function normalizarRoots(valor) {
  const lista = Array.isArray(valor) ? valor
    : (valor && Array.isArray(valor.roots) ? valor.roots : null);
  if (!lista) return null;
  return lista.map((root) => {
    if (typeof root === 'string') return { uri: root, nome: null };
    if (!root || typeof root !== 'object' || !root.uri) return null;
    return {
      uri: String(root.uri).slice(0, 2048),
      nome: root.name == null ? null : String(root.name).slice(0, 200),
    };
  }).filter(Boolean);
}

function sondar(capabilities, opts) {
  const o = opts || {};
  const caps = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const medidoEm = instante(o);
  const inicio = process.hrtime.bigint();
  const declaradas = NOMES.map((nome) => [nome, registo(nome, caps, medidoEm, null)]);
  const ms = Number((Number(process.hrtime.bigint() - inicio) / 1e6).toFixed(3));
  for (const [, item] of declaradas) item.ms = ms;
  return {
    fonte: 'initialize.params.capabilities',
    medido_em: medidoEm,
    capacidades: Object.fromEntries(declaradas),
    roots: normalizarRoots(o.roots),
    roots_porque: o.roots == null
      ? 'o cliente ainda não enviou uma resposta roots/list'
      : 'roots recebidas do cliente e normalizadas como dados, nunca como instruções',
  };
}

function guardar(resultado, opts) {
  const f = ficheiro(opts);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(resultado, null, 2));
  return resultado;
}

function registarInitialize(params, opts) {
  const p = params && typeof params === 'object' ? params : {};
  const caps = p.capabilities && typeof p.capabilities === 'object' ? p.capabilities : {};
  const roots = p.roots != null ? p.roots
    : (caps.roots && typeof caps.roots === 'object' && caps.roots.roots != null
      ? caps.roots.roots : null);
  const resultado = sondar(caps, { ...(opts || {}), roots });
  resultado.cliente = {
    nome: p.clientInfo && p.clientInfo.name ? String(p.clientInfo.name).slice(0, 120) : null,
    versao: p.clientInfo && p.clientInfo.version ? String(p.clientInfo.version).slice(0, 60) : null,
    protocol_version: p.protocolVersion ? String(p.protocolVersion).slice(0, 60) : null,
  };
  return guardar(resultado, opts);
}

function ler(opts) {
  try { return JSON.parse(fs.readFileSync(ficheiro(opts), 'utf8')); }
  catch { return null; }
}

function registarRoots(roots, opts) {
  const medidoEm = instante(opts);
  const actual = ler(opts) || sondar({}, { ...(opts || {}), agora: medidoEm });
  const normalizadas = normalizarRoots(roots);
  actual.roots = normalizadas;
  actual.roots_porque = normalizadas == null
    ? 'a resposta roots/list não trouxe uma lista de roots'
    : 'roots recebidas do cliente e normalizadas como dados, nunca como instruções';
  actual.medido_em = medidoEm;
  if (normalizadas && actual.capacidades && actual.capacidades.roots) {
    actual.capacidades.roots = {
      capacidade: 'roots',
      suportado: true,
      porque: 'o cliente respondeu a roots/list com ' + normalizadas.length + ' root(s)',
      fonte: 'roots/list',
      medido_em: medidoEm,
      ms: null,
    };
  }
  return guardar(actual, opts);
}

function estado(opts) {
  const r = ler(opts);
  const elicitation = r && r.capacidades ? r.capacidades.elicitation : null;
  const suportado = elicitation ? elicitation.suportado : null;
  const palavra = suportado === true ? 'suportado' : (suportado === false ? 'não suportado' : 'n/d');
  const porque = elicitation
    ? elicitation.porque
    : 'ainda não há initialize medido em ' + ficheiro(opts);
  return {
    ficheiro: ficheiro(opts),
    medido_em: r ? r.medido_em || null : null,
    cliente: r ? r.cliente || null : null,
    capacidades: r ? r.capacidades || null : null,
    roots: r ? r.roots || null : null,
    onboarding: { estado: palavra, suportado, porque },
    resumo: 'onboarding no Cowork: ' + palavra + ' — ' + porque,
  };
}

module.exports = {
  NOMES, sondar, guardar, ler, estado, registarInitialize, registarRoots,
  normalizarRoots, ficheiro,
};
