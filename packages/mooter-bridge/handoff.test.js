'use strict';

/**
 * HANDOFF — o conteúdo atravessa a porta? (Wave J-5b, 2026-07-31)
 *
 * ⚠️ PORQUE ESTE FICHEIRO EXISTE, E O QUE ELE CORRIGE NA NOSSA METODOLOGIA
 *
 * A v1.32.0 abriu `handoff_from` no schema de `mooter_work`. O teste que
 * acompanhou essa entrega (`dieta.test.js` D13) verificava isto:
 *
 *     assert.ok(props.handoff_from)          // o parâmetro existe no schema
 *
 * Passou. E estava certo — o parâmetro existia mesmo. Mas em produção o
 * handoff não funcionou: `toolWork` monta o objecto para `toolDispatch` campo
 * a campo e não incluía `handoff_from`, portanto ele chegava sempre
 * `undefined`. O corpo do job anterior nunca era colado no masterprompt.
 *
 * D13 testou A PORTA. Ninguém testou O QUE ATRAVESSA A PORTA.
 *
 * Foi apanhado a correr, e pelo próprio mecanismo que estava partido: pediu-se
 * ao moo local que verificasse a $0 o que o kimi tinha produzido, e ele
 * respondeu «NAO PROCEDE — o texto de referência não foi incluído na
 * mensagem». O verificador denunciou o seu próprio transporte.
 *
 * REGRA que estes testes passam a impor: para uma feature de transporte, a
 * asserção tem de ser sobre a CARGA no destino, nunca sobre a existência do
 * canal. Um schema aceite não é uma entrega feita.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const seam = require('./seamless.js');

/** Escreve um job terminado em disco, no formato que o embedHandoff espera ler. */
function jobFalso(raiz, jobId, resultado, agente) {
  const dir = path.join(raiz, jobId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    job_id: jobId, agent: agente || 'kimi', model: 'kimi-k3',
  }), 'utf8');
  fs.writeFileSync(path.join(dir, 'out.log'),
    JSON.stringify({ type: 'result', subtype: 'success', result: resultado }) + '\n', 'utf8');
  return dir;
}

/**
 * `JOBS_DIR()` é `MOOTER_HOME_DIR()/jobs`, e `MOOTER_HOME_DIR()` lê
 * `process.env.MOOTER_HOME` a cada chamada (seamless.js:104,106). Damos-lhe uma
 * casa temporária para o teste não tocar no `~/.mooter` real.
 */
function comJobsEm(fn) {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-handoff-'));
  const raiz = path.join(casa, 'jobs');
  fs.mkdirSync(raiz, { recursive: true });
  const anterior = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = casa;
  try { return fn(raiz); } finally {
    if (anterior === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = anterior;
    try { fs.rmSync(casa, { recursive: true, force: true }); } catch { /* */ }
  }
}

// ────────────────────────────── a carga chega ao destino, não só o canal ──

test('H1 — o CORPO do job anterior é colado no masterprompt (não basta o id)', () => {
  comJobsEm((raiz) => {
    const marcador = 'FRASE-UNICA-QUE-SO-PODE-VIR-DO-JOB-ANTERIOR-42';
    jobFalso(raiz, 'job-origem', marcador);

    const r = seam._embedHandoff('MASTERPROMPT BASE', 'job-origem');

    assert.equal(r.ok, true, 'o handoff devia ter sido embebido');
    assert.ok(r.mp.includes(marcador),
      'REGRESSÃO: o masterprompt NÃO contém o texto do job anterior — '
      + 'é este o bug que passou despercebido na v1.32.0');
    assert.ok(r.mp.startsWith('MASTERPROMPT BASE'), 'o prompt original tem de ser preservado');
  });
});

test('H2 — o bloco identifica a origem, para o agente saber que aquilo não é dele', () => {
  comJobsEm((raiz) => {
    jobFalso(raiz, 'job-origem', 'conteudo qualquer');
    const r = seam._embedHandoff('BASE', 'job-origem');
    assert.match(r.mp, /⇄ PREPARADO PARA TI POR/, 'o cabeçalho de proveniência tem de estar lá');
    assert.match(r.mp, /job-origem/, 'o job de origem tem de ser nomeado');
    assert.match(r.mp, /contexto, não como verdade absoluta/i,
      'o agente tem de ser avisado para não tratar o handoff como verdade');
  });
});

test('H3 — sem job de origem, o masterprompt sai intacto e ok:false', () => {
  const r = seam._embedHandoff('BASE', null);
  assert.equal(r.ok, false);
  assert.equal(r.mp, 'BASE', 'não pode inventar conteúdo quando não há origem');
});

test('H4 — job inexistente não derruba nem inventa: ok:false e prompt intacto', () => {
  comJobsEm(() => {
    const r = seam._embedHandoff('BASE', 'job-que-nunca-existiu');
    assert.equal(r.ok, false, 'um id que não existe não pode dar ok:true');
    assert.equal(r.mp, 'BASE');
  });
});

test('H5 — o corpo é cortado, para um job gigante não estourar o prompt seguinte', () => {
  comJobsEm((raiz) => {
    const enorme = 'X'.repeat(50_000);
    jobFalso(raiz, 'job-enorme', enorme);
    const r = seam._embedHandoff('BASE', 'job-enorme');
    assert.equal(r.ok, true);
    assert.ok(r.mp.length < 20_000,
      'o handoff tem de cortar: masterprompt ficou com ' + r.mp.length + ' caracteres');
  });
});

test('H6 — a origem é registada para o painel poder desenhar a seta sem a inventar', () => {
  comJobsEm((raiz) => {
    jobFalso(raiz, 'job-origem', 'texto', 'codex');
    const r = seam._embedHandoff('BASE', 'job-origem');
    assert.equal(r.from_agent, 'codex', 'o agente de origem tem de vir do meta.json, nunca do texto');
  });
});

// ───────────────────────── a ligação que faltava: toolWork → toolDispatch ──

test('H7 — toolWork PASSA handoff_from adiante (a linha que faltava na v1.32.0)', () => {
  /**
   * Este é o teste que teria apanhado o bug antes de ele chegar a produção.
   * Não olha para o schema: lê o código que monta a chamada e exige que
   * `handoff_from` esteja lá. Se alguém voltar a montar o objecto campo a
   * campo e esquecer este, o teste cai.
   */
  const fonte = fs.readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
  const chamada = fonte.slice(fonte.lastIndexOf('const r = await toolDispatch({'));
  const corpo = chamada.slice(0, chamada.indexOf('});') + 3);

  assert.ok(corpo.includes('handoff_from'),
    'REGRESSÃO: toolWork voltou a não passar handoff_from ao toolDispatch — '
    + 'o parâmetro é aceite pelo schema e morre pelo caminho, que foi exactamente '
    + 'o bug da v1.32.0');
});

test('H8 — toolDispatch continua a ler handoff_from e a chamar embedHandoff', () => {
  const fonte = fs.readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
  assert.match(fonte, /const handoffFrom = args && args\.handoff_from/,
    'toolDispatch tem de continuar a ler o parâmetro');
  assert.match(fonte, /handoff = embedHandoff\(masterprompt, handoffFrom\)/,
    'e tem de continuar a chamar o embed antes do hash do prompt');
});
