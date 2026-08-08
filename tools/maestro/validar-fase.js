#!/usr/bin/env node
/**
 * validar-fase.js — o escritor ÚNICO de `_handoff/maestro-state/`.
 *
 * Porque existe: o v1.1 do maestro trocou "fase fechada é uma frase" por "fase
 * fechada é um JSON" — e a verificação adversarial (job-mskurzba-b4e2) chamou-lhe
 * PIOR, com razão: transformou uma alegação em prosa numa chave machine-readable
 * que o PRÓPRIO executor escrevia. Trocar o sítio da mentira não é um gate.
 *
 * O modelo correcto, e o que este ficheiro implementa:
 *
 *   fonte de verdade = os outputs reais + o Git.
 *   o manifesto = uma PROJECÇÃO validada, nunca a verdade.
 *
 * O executor escreve `<FASE>.candidate.json` FORA de `maestro-state/` e só pode
 * lá pôr o que este validador NÃO consegue medir sozinho (o `attempt_id`, notas).
 * Qualquer campo computável que venha no candidato é REJEITADO — não ignorado,
 * rejeitado — porque aceitá-lo em silêncio seria deixar o executor escolher a
 * própria prova.
 *
 * Auto-referência: um manifesto não pode conter o sha do commit que o inclui.
 * Foi assim que o primeiro F0 saiu com `commit_sha: "PENDENTE-mesmo-commit"` e
 * ficou, pela sua própria regra, por fechar. Aqui separa-se:
 *   - `evidence_commit_sha` — o commit que contém os OUTPUTS. Existe antes.
 *   - o manifesto entra num segundo commit (o *closure commit*), que só o
 *     acrescenta a ele.
 *
 * O que este validador NÃO faz, e diz: não prova autoria humana. Um gesto do
 * dono continua a ser `autoria: n/d`. Isto resolve validade MECÂNICA da fase.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const DIR_SPEC = path.join(RAIZ, '_handoff', 'maestro-spec');
const DIR_ESTADO = path.join(RAIZ, '_handoff', 'maestro-state');

/** Campos que o executor NÃO pode fornecer: o validador mede-os. */
const CAMPOS_PROIBIDOS_NO_CANDIDATO = new Set([
  'master_sha256', 'brief_sha256', 'input_hashes', 'output_hashes',
  'evidence_commit_sha', 'commit_sha', 'branch', 'repo', 'validator_sha',
  'spec_sha256', 'status', 'validated_at',
]);

/** O executor só pode declarar isto. */
const CAMPOS_PERMITIDOS_NO_CANDIDATO = new Set([
  'phase', 'attempt_id', 'comandos', 'notas', 'ressalva', 'veredicto', 'extra',
]);

function sha256Ficheiro(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function git(args, opts = {}) {
  return execFileSync('git', ['-C', RAIZ, ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts,
  }).trim();
}

class Recusa extends Error {}

function recusar(msg) { throw new Recusa(msg); }

function carregarJson(p, que) {
  if (!fs.existsSync(p)) recusar(`${que} não existe: ${path.relative(RAIZ, p)}`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { recusar(`${que} não é JSON válido (${p}): ${e.message}`); }
}

/**
 * Mede, a partir do disco e do Git, tudo o que a spec exige.
 * Nada aqui vem do candidato.
 */
function medir(spec) {
  const medido = { input_hashes: {}, output_hashes: {} };

  for (const rel of spec.inputs || []) {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) recusar(`input declarado na spec não existe: ${rel}`);
    medido.input_hashes[rel] = sha256Ficheiro(abs);
  }

  if (spec.inputs_esperados) {
    for (const [rel, esperado] of Object.entries(spec.inputs_esperados)) {
      const obtido = medido.input_hashes[rel];
      if (!obtido) recusar(`input_esperado "${rel}" não está na lista de inputs da spec`);
      if (obtido !== esperado) {
        recusar(`input "${rel}" mudou desde a spec.\n  esperado: ${esperado}\n  no disco: ${obtido}`);
      }
    }
  }

  for (const rel of spec.outputs || []) {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) recusar(`output exigido pela fase não existe: ${rel}`);
    medido.output_hashes[rel] = sha256Ficheiro(abs);
  }

  // Os outputs têm de estar COMMITADOS. Um output por commitar não é prova:
  // desaparece com um checkout e ninguém o consegue reproduzir.
  const sujos = git(['status', '--porcelain', '--', ...(spec.outputs || [])])
    .split('\n').filter(Boolean);
  if (sujos.length) {
    recusar(`há outputs não commitados — a prova tem de estar no Git:\n  ${sujos.join('\n  ')}`);
  }

  // evidence_commit: o último commit que tocou nos outputs. Existe ANTES do
  // manifesto, e por isso o manifesto pode contê-lo sem se auto-referenciar.
  if ((spec.outputs || []).length) {
    medido.evidence_commit_sha = git(['log', '-1', '--format=%H', '--', ...spec.outputs]);
    if (!medido.evidence_commit_sha) recusar('não consegui determinar o evidence_commit dos outputs');
  } else {
    medido.evidence_commit_sha = null;
  }

  medido.repo = path.basename(RAIZ);
  medido.branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  medido.head_at_validation = git(['rev-parse', 'HEAD']);
  return medido;
}

/** CONFIG por fase: só bloqueia o que ESTA fase consome. */
function verificarConfig(spec) {
  const exigidos = spec.config_requires || [];
  if (!exigidos.length) return { config_requires: [], config_em_falta: [] };
  const pConfig = path.join(DIR_ESTADO, 'CONFIG.json');
  const cfg = fs.existsSync(pConfig) ? JSON.parse(fs.readFileSync(pConfig, 'utf8')) : {};
  const falta = exigidos.filter((k) => {
    const v = cfg[k];
    return v === undefined || v === null || v === '' || v === 'n/d';
  });
  if (falta.length) {
    recusar(
      `CONFIG incompleto para ${spec.phase}: ${falta.join(', ')}\n` +
      '  (só os campos que ESTA fase consome bloqueiam — ver config_requires na spec)'
    );
  }
  return { config_requires: exigidos, config_em_falta: [] };
}

/** Gestos do dono: mecanicamente verificamos existência, não-vazio e binding. */
function verificarGesto(spec, medido) {
  const g = spec.owner_gesture;
  if (!g) return null;
  const abs = path.isAbsolute(g.file) ? g.file : path.join(RAIZ, g.file);
  if (!fs.existsSync(abs)) recusar(`gesto do dono em falta: ${g.file} ⇒ BLOCKED, nunca COMPLETE`);
  const conteudo = fs.readFileSync(abs, 'utf8').trim();
  if (!conteudo) recusar(`gesto do dono está VAZIO: ${g.file} — um ficheiro de 0 bytes prova um touch, não uma decisão`);
  if (g.must_bind) {
    const alvoSha = medido.input_hashes[g.must_bind] || medido.output_hashes[g.must_bind];
    if (!alvoSha) recusar(`must_bind aponta para "${g.must_bind}", que não está nos inputs nem nos outputs`);
    if (!conteudo.includes(alvoSha)) {
      recusar(`o gesto ${g.file} não contém o sha256 de ${g.must_bind} (${alvoSha}) — não está ligado a nada`);
    }
  }
  return {
    ficheiro: g.file,
    binding: g.must_bind || null,
    autoria: 'n/d',
    porque_nd: 'a autoria de um ficheiro não é mecanicamente provável nesta montagem; exige-se também a palavra do dono na conversa',
  };
}

function validar(fase, { candidatoPath, escrever }) {
  const spec = carregarJson(path.join(DIR_SPEC, `${fase}.spec.json`), `spec de ${fase}`);
  if (spec.phase !== fase) recusar(`a spec diz phase="${spec.phase}" mas foi pedida ${fase}`);
  const specSha = sha256Ficheiro(path.join(DIR_SPEC, `${fase}.spec.json`));

  const pCand = candidatoPath
    ? path.resolve(candidatoPath)
    : path.join(RAIZ, '_handoff', 'maestro-candidatos', `${fase}.candidate.json`);
  const cand = carregarJson(pCand, `candidato de ${fase}`);

  // O executor não escolhe a própria prova.
  const intrusos = Object.keys(cand).filter((k) => CAMPOS_PROIBIDOS_NO_CANDIDATO.has(k));
  if (intrusos.length) {
    recusar(
      `o candidato traz campos que EU meço e ele não pode fornecer: ${intrusos.join(', ')}\n` +
      '  (aceitá-los seria deixar o executor escrever a própria chave — retira-os)'
    );
  }
  const desconhecidos = Object.keys(cand).filter((k) => !CAMPOS_PERMITIDOS_NO_CANDIDATO.has(k));
  if (desconhecidos.length) recusar(`campos não reconhecidos no candidato: ${desconhecidos.join(', ')}`);
  if (cand.phase !== fase) recusar(`o candidato diz phase="${cand.phase}" mas foi pedida ${fase}`);
  if (!cand.attempt_id) recusar('o candidato não traz attempt_id — sem ele não há reconciliação de uma fase RUNNING');

  const medido = medir(spec);
  const cfg = verificarConfig(spec);
  const gesto = verificarGesto(spec, medido);

  const manifesto = {
    phase: fase,
    status: 'complete',
    attempt_id: cand.attempt_id,
    validator_sha: sha256Ficheiro(__filename),
    spec_sha256: specSha,
    master_sha256: medido.input_hashes[spec.master] || medido.output_hashes[spec.master] || null,
    brief_sha256: medido.input_hashes[spec.brief] || medido.output_hashes[spec.brief] || null,
    input_hashes: medido.input_hashes,
    output_hashes: medido.output_hashes,
    repo: medido.repo,
    branch: medido.branch,
    evidence_commit_sha: medido.evidence_commit_sha,
    config_requires: cfg.config_requires,
    owner_gesture: gesto,
    comandos: cand.comandos || [],
    veredicto: cand.veredicto || null,
    ressalva: cand.ressalva || null,
    notas: cand.notas || null,
    validated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    aviso: 'PROJECÇÃO validada. A verdade são os outputs e o Git. Este ficheiro entra num closure commit próprio e NÃO contém o sha desse commit.',
  };

  if (!escrever) return { manifesto, modo: 'check' };

  fs.mkdirSync(DIR_ESTADO, { recursive: true });
  const destino = path.join(DIR_ESTADO, `${fase}.complete.json`);
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifesto, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, destino); // atómico no mesmo volume
  return { manifesto, modo: 'escrito', destino };
}

function main() {
  const args = process.argv.slice(2);
  const fase = args.find((a) => !a.startsWith('-'));
  const check = args.includes('--check');
  const iCand = args.indexOf('--candidate');
  const candidatoPath = iCand >= 0 ? args[iCand + 1] : null;

  if (!fase) {
    console.error('uso: node tools/maestro/validar-fase.js <FASE> [--candidate <path>] [--check]');
    console.error('  sem --check, ESCREVE _handoff/maestro-state/<FASE>.complete.json');
    return 2;
  }

  try {
    const r = validar(fase, { candidatoPath, escrever: !check });
    if (r.modo === 'check') {
      const existente = path.join(DIR_ESTADO, `${fase}.complete.json`);
      if (!fs.existsSync(existente)) {
        console.log(`${fase}: NOT_COMPLETE — não existe manifesto, mas a fase VALIDARIA agora.`);
        return 1;
      }
      const actual = JSON.parse(fs.readFileSync(existente, 'utf8'));
      const campos = ['input_hashes', 'output_hashes', 'evidence_commit_sha', 'spec_sha256', 'validator_sha'];
      const divergentes = campos.filter(
        (c) => JSON.stringify(actual[c]) !== JSON.stringify(r.manifesto[c])
      );
      if (divergentes.length) {
        console.error(`${fase}: MANIFESTO DIVERGE do disco em: ${divergentes.join(', ')}`);
        console.error('  o manifesto deixou de representar a realidade ⇒ a fase NÃO está fechada.');
        return 1;
      }
      console.log(`${fase}: OK — o manifesto bate com o disco e com o Git.`);
      return 0;
    }
    console.log(`${fase}: COMPLETE escrito em ${path.relative(RAIZ, r.destino)}`);
    console.log(`  evidence_commit: ${r.manifesto.evidence_commit_sha}`);
    console.log(`  validator_sha  : ${r.manifesto.validator_sha.slice(0, 16)}…`);
    console.log('  FALTA: o closure commit que acrescenta SÓ este manifesto.');
    return 0;
  } catch (e) {
    if (e instanceof Recusa) {
      console.error(`${fase}: RECUSADO — a fase fica BLOCKED, nunca COMPLETE.`);
      console.error(`  ${e.message.split('\n').join('\n  ')}`);
      return 1;
    }
    throw e;
  }
}

if (require.main === module) process.exit(main());
module.exports = { validar, Recusa };
