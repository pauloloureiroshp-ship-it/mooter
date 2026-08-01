'use strict';
/**
 * oraculo.test.js — o oráculo tem de ser mais difícil de enganar que um juiz.
 *
 * Cada teste aqui responde a uma forma concreta de o loop mentir:
 *   · declarar verde sem ter corrido nada
 *   · culpar um job por uma falha que já existia
 *   · deixar passar uma regressão real
 *   · gastar tokens
 */

const { test } = require('node:test');
const assert = require('node:assert');
const oraculo = require('./oraculo.js');

/**
 * Corredor falso: decide o resultado sem tocar no disco.
 *
 * ⚠️ Lê `bin` E `args` concatenados de propósito. O oráculo invoca de duas
 * formas — args separados (posix) e comando montado numa string (windows +
 * shell, por causa do CVE-2024-27980). Um duplo que só olhasse para `args`
 * passaria a verde em Windows sem nunca exercitar o código, que é a forma mais
 * silenciosa de um teste deixar de testar.
 */
function fakeRun(falhamIds) {
  const falham = falhamIds || [];
  return (bin, args) => {
    const alvo = [bin].concat(args || []).join(' ');
    const id = /--test\b/.test(alvo) ? 'node-test'
      : (/\bnpm(?:\.cmd)?\s+test\b/.test(alvo) ? 'test' : (alvo.match(/\brun\s+(\S+)/) || [])[1]);
    if (falham.includes(id)) {
      const err = new Error('check falhou'); err.status = 1; throw err;
    }
    return '';
  };
}
const fakeFs = (pkg, ficheiros = []) => ({
  exists: (p) => /package\.json$/.test(p) && pkg != null,
  readFile: () => JSON.stringify(pkg),
  listar: () => ficheiros,
});

test('oráculo: ausência de checks é n/d, NUNCA verde', () => {
  const r = oraculo.medir('/qualquer', { ...fakeFs(null, ['index.js']), run: fakeRun() });
  assert.strictEqual(r.veredicto, 'n/d', 'sem checks tem de ser n/d');
  assert.match(r.porque, /ausência de prova não é prova de verde/);
  assert.strictEqual(r.custo_usd, 0);
});

test('oráculo: prefere o que o projecto DECLARA a inferência', () => {
  const checks = oraculo.detectarChecks('/w', fakeFs(
    { scripts: { test: 'node --test', lint: 'eslint .' } }, ['a.test.js']));
  const ids = checks.map((c) => c.id);
  assert.ok(ids.includes('test'), 'ignorou scripts.test');
  assert.ok(ids.includes('lint'));
  assert.ok(!ids.includes('node-test'), 'inferiu quando já havia declaração do dono');
  assert.match(checks[0].fonte, /package\.json/);
});

test('oráculo: "no test specified" não conta como verificação', () => {
  const checks = oraculo.detectarChecks('/w', fakeFs(
    { scripts: { test: 'echo "Error: no test specified" && exit 1' } }, []));
  assert.strictEqual(checks.length, 0, 'aceitou o placeholder do npm init como teste');
});

test('oráculo: infere node --test só quando há ficheiros de teste', () => {
  assert.strictEqual(oraculo.detectarChecks('/w', fakeFs(null, ['index.js'])).length, 0);
  const comTestes = oraculo.detectarChecks('/w', fakeFs(null, ['index.js', 'index.test.js']));
  assert.strictEqual(comTestes.length, 1);
  assert.strictEqual(comTestes[0].id, 'node-test');
});

test('oráculo: verde e vermelho são medidos, com o porquê nomeado', () => {
  const fsPkg = fakeFs({ scripts: { test: 'x', lint: 'y' } }, []);
  const verde = oraculo.medir('/w', { ...fsPkg, run: fakeRun([]) });
  assert.strictEqual(verde.veredicto, 'verde');
  assert.strictEqual(verde.custo_usd, 0, 'o oráculo NUNCA pode custar tokens');

  const vermelho = oraculo.medir('/w', { ...fsPkg, run: fakeRun(['lint']) });
  assert.strictEqual(vermelho.veredicto, 'vermelho');
  assert.match(vermelho.porque, /lint/);
});

test('regressão: base vermelha NÃO é imputada ao job — a régua é "não piora"', () => {
  // O repo tem o ondaA.test.js cronicamente vermelho. Um oráculo que exigisse
  // verde absoluto marcaria TODOS os jobs como maus e o sinal morria no dia 1.
  const antes = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }, { id: 'lint', passou: true }] };
  const depois = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }, { id: 'lint', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.strictEqual(v.veredicto, 'verde');
  assert.strictEqual(v.followup_quality, 1);
  assert.match(v.porque, /não lhe são imputadas/);
});

test('regressão: partir um check que passava é culpa do job', () => {
  const antes = { veredicto: 'verde', checks: [{ id: 'test', passou: true }, { id: 'lint', passou: true }] };
  const depois = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }, { id: 'lint', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.strictEqual(v.veredicto, 'regressao');
  assert.strictEqual(v.followup_quality, 0);
  assert.deepStrictEqual(v.novos_falhados, ['test']);
});

test('regressão: consertar o que estava partido conta como bom', () => {
  const antes = { veredicto: 'vermelho', checks: [{ id: 'test', passou: false }] };
  const depois = { veredicto: 'verde', checks: [{ id: 'test', passou: true }] };
  const v = oraculo.comparar(antes, depois);
  assert.strictEqual(v.veredicto, 'verde');
  assert.strictEqual(v.followup_quality, 1);
});

test('regressão: n/d de um dos lados contamina — nunca se inventa veredicto', () => {
  const nd = { veredicto: 'n/d', checks: [] };
  const verde = { veredicto: 'verde', checks: [{ id: 'test', passou: true }] };
  for (const [a, d] of [[nd, verde], [verde, nd], [null, verde]]) {
    const v = oraculo.comparar(a, d);
    assert.strictEqual(v.veredicto, 'n/d');
    assert.strictEqual(v.followup_quality, null, 'n/d não pode virar sinal de reward');
  }
});

test('evento: tem a forma que o auto-feedback já lê, e declara que é oráculo', () => {
  const v = oraculo.comparar(
    { veredicto: 'verde', checks: [{ id: 'test', passou: true }] },
    { veredicto: 'verde', checks: [{ id: 'test', passou: true }] });
  const ev = oraculo.eventoDeQualidade(v, { job_id: 'job-x', tier: 'T2', task_category: 'codigo', ts: '2026-08-01T00:00:00Z' });
  // Mesma forma que feedback-collector.js:98-107 escreve para um polegar humano.
  assert.strictEqual(ev.event, 'quality_feedback');
  assert.strictEqual(ev.followup_quality, 1);
  assert.strictEqual(ev.tier, 'T2');
  assert.strictEqual(ev.task_category, 'codigo');
  // ...mas quem ler o ficheiro TEM de conseguir separar medição de opinião.
  assert.strictEqual(ev.fonte, 'oraculo-determinista');
  assert.strictEqual(ev.custo_usd, 0);
  assert.strictEqual(ev.job_id, 'job-x');
});

test('evento: n/d não produz reward nenhum', () => {
  const v = oraculo.comparar({ veredicto: 'n/d', checks: [] }, { veredicto: 'n/d', checks: [] });
  assert.strictEqual(oraculo.eventoDeQualidade(v), null, 'n/d escreveu reward — é assim que se envenena o learner');
});

test('oráculo: um check que expira é falha declarada, não silêncio', () => {
  const run = () => { const e = new Error('timeout'); e.killed = true; throw e; };
  const r = oraculo.medir('/w', { ...fakeFs({ scripts: { test: 'x' } }, []), run, timeoutMs: 50 });
  assert.strictEqual(r.veredicto, 'vermelho');
  assert.match(r.checks[0].porque, /excedeu 50 ms/);
});

test('G11: comando que não ARRANCA é n/d, nunca vermelho', () => {
  // Medido a sério em 2026-08-01: execFileSync('npm') dá ENOENT no Windows
  // (o executável é npm.cmd). A v1 do oráculo dizia «vermelho» em 4 ms sobre uma
  // suite que passa — e teria escrito followup_quality:0 num repo verde.
  const enoent = () => { const e = new Error('spawnSync npm ENOENT'); e.code = 'ENOENT'; throw e; };
  const r = oraculo.medir('/w', { ...fakeFs({ scripts: { test: 'node --test' } }, []), run: enoent });
  assert.strictEqual(r.veredicto, 'n/d', 'reportou veredicto sobre algo que nunca correu');
  assert.match(r.porque, /chegou a arrancar|não arrancou/);
  assert.match(r.porque, /sem medição não há veredicto/);
  assert.strictEqual(r.checks[0].correu, false);
  assert.strictEqual(r.checks[0].passou, null, 'passou:false seria uma medição que não existe');

  // ...e um n/d desses nunca pode virar reward.
  const v = oraculo.comparar(r, r);
  assert.strictEqual(v.followup_quality, null);
});

test('G11: um check que não arranca não contamina os que arrancaram', () => {
  // O duplo tem de ler as DUAS formas de invocação: args separados (posix) e
  // comando montado numa string (windows + shell). Ler só uma delas foi o que
  // deixou este teste passar a verde quando o código já tinha mudado.
  const run = (bin, args) => {
    const alvo = [bin].concat(args || []).join(' ');
    if (/\blint\b/.test(alvo)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
    return '';
  };
  const r = oraculo.medir('/w', { ...fakeFs({ scripts: { test: 'x', lint: 'y' } }, []), run });
  assert.strictEqual(r.veredicto, 'verde', 'o teste que passou tem de contar');
  assert.match(r.porque, /não arrancou \(lint\)/, 'o n/d tem de ficar visível ao lado do verde');
});

test('G11: em Windows o npm vai por shell, numa string só (sem DEP0190)', () => {
  const vistos = [];
  const run = (bin, args, opts) => { vistos.push({ bin, args, shell: !!(opts && opts.shell) }); return ''; };
  oraculo.medir('/w', { ...fakeFs({ scripts: { test: 'x' } }, []), run });
  if (process.platform === 'win32') {
    // CVE-2024-27980: .cmd exige shell. E com shell, args separados emitem DEP0190
    // — por isso o comando vai montado numa string e args fica vazio.
    assert.strictEqual(vistos[0].bin, 'npm.cmd test --silent');
    assert.deepStrictEqual(vistos[0].args, []);
    assert.strictEqual(vistos[0].shell, true);
  } else {
    assert.strictEqual(vistos[0].bin, 'npm');
    assert.deepStrictEqual(vistos[0].args, ['test', '--silent']);
    assert.strictEqual(vistos[0].shell, false);
  }
});

test('goodharting: job de escrita que não muda nada NÃO pode ser premiado', () => {
  // Medido 2026-08-01 contra esta implementação: 20 negações de permissão, o
  // agente respondeu "Tarefa concluida", o conector gravou done, e o oraculo
  // deu followup_quality:1 porque nada regrediu. Nada regrediu porque nada foi feito.
  const igual = { disponivel: true, chave: 'HEAD abc | sem alteracoes' };
  const e = oraculo.entregouAlgo(igual, { disponivel: true, chave: igual.chave });
  assert.strictEqual(e.entregou, false);
  assert.match(e.porque, /BYTE-A-BYTE igual/);

  const mudou = oraculo.entregouAlgo(igual, { disponivel: true, chave: 'HEAD abc | M index.js' });
  assert.strictEqual(mudou.entregou, true);
});

test('goodharting: sem impressão de git não se afirma nem se nega entrega', () => {
  const sem = { disponivel: false, chave: null, porque: 'sem git' };
  const com = { disponivel: true, chave: 'x' };
  for (const [a, d] of [[sem, com], [com, sem], [null, com]]) {
    const e = oraculo.entregouAlgo(a, d);
    assert.strictEqual(e.entregou, null, 'inventou um veredicto de entrega sem dados');
  }
});

test('impressão: sem git devolve n/d em vez de falhar', () => {
  const run = () => { const e = new Error('not a git repo'); e.code = 'ENOENT'; throw e; };
  const imp = oraculo.impressao('/nao-e-repo', { run });
  assert.strictEqual(imp.disponivel, false);
  assert.strictEqual(imp.chave, null);
  assert.match(imp.porque, /n\/d/);
});

test('impressão: a chave inclui o DIFF, não só os nomes dos ficheiros', () => {
  // Reescrever um ficheiro já modificado nao muda `git status --porcelain`.
  // Sem o diff na chave, um job podia reescrever tudo e parecer que nao mexeu.
  const chamadas = [];
  const run = (bin, args) => {
    chamadas.push(args.join(' '));
    if (args.includes('rev-parse')) return 'abc123\n';
    if (args.includes('--porcelain')) return ' M index.js\n';
    if (args.includes('diff')) return '--- a/index.js\n+++ b/index.js\n+novo\n';
    return '';
  };
  const imp = oraculo.impressao('/w', { run });
  assert.ok(imp.disponivel);
  assert.match(imp.chave, /novo/, 'o conteudo do diff tem de entrar na chave');
  assert.ok(chamadas.some((c) => c.includes('diff')), 'nunca correu git diff');
});
