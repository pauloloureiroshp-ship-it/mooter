/**
 * Testes do executor do R-24. Herméticos: nenhum processo real é lançado,
 * nenhum ficheiro real é escrito. `spawnImpl` e `fsImpl` são injectados.
 *
 * Os testes marcados MORDE são os que `morde-r24.mjs` planta defeitos para
 * provar que apanham. Um teste que não morde não é um teste — é decoração.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  dividirComando, lerLedger, jaFeitos, paresDoLedger, ordemDosBracos,
  prepararSnapshot, testeDoFilho, prepararTarefa, prepararControlo, tvaFinal, correrUmBraco,
  primarias, primeiroDe, guardas, main,
} from './correr-r24.mjs';

// ───────────────────────────────────────────────────────────────────────────
// Duplos
// ───────────────────────────────────────────────────────────────────────────

function fakeFs(ficheiros = {}) {
  const disco = new Map(Object.entries(ficheiros));
  const dirs = new Set();
  const ligacoes = [];
  return {
    disco, dirs, ligacoes,
    readFileSync(p) {
      const k = String(p).replace(/\\/g, '/');
      for (const [nome, conteudo] of disco) if (k.endsWith(nome)) return conteudo;
      const e = new Error(`ENOENT ${p}`); e.code = 'ENOENT'; throw e;
    },
    writeFileSync(p, c) { disco.set(String(p).replace(/\\/g, '/'), c); },
    appendFileSync(p, c) {
      const k = String(p).replace(/\\/g, '/');
      disco.set(k, (disco.get(k) || '') + c);
    },
    mkdirSync(p) { dirs.add(String(p)); },
    rmSync(p) { dirs.delete(String(p)); },
    existsSync(p) { return /node_modules$/.test(String(p)) && !/snap/.test(String(p)); },
    symlinkSync(alvo, ligacao) { ligacoes.push([String(alvo), String(ligacao)]); },
  };
}

/** Guarda cada chamada e responde por regra. */
function fakeSpawn(regras = []) {
  const chamadas = [];
  const impl = (cmd, args, opts) => {
    chamadas.push({ cmd, args, opts });
    for (const r of regras) if (r.quando(cmd, args, opts)) return r.responde(cmd, args, opts);
    return { status: 0, stdout: '', stderr: '', signal: null, error: null };
  };
  impl.chamadas = chamadas;
  return impl;
}

const TAREFA = {
  n: 1, task_id: 't01-abc', commit: 'filho123', parent: 'pai456',
  area: 'router', test_file: 'tools/router/x.test.js', acceptance_cwd: 'tools/router',
  acceptance_cmd: 'cd <repo>/tools/router && node --test --test-skip-pattern="(a|b c)" x.test.js',
  prompt: 'faz passar', prompt_sha256: 'p'.repeat(64),
};

/** O sha do congelamento tem de bater com o conteudo que o fakeFs devolve,
 *  senao as guardas recusam correr e todos os testes passam pela razao errada. */
function preregPara(manifestStr) {
  return {
    experiment_id: 'use-vs-none-v1', estado: 'CONGELADO', seed: 42,
    estatistica: { n: 23 },
    congelados: { manifest: { path: 'tools/ab/r24-manifest.json', sha256: crypto.createHash('sha256').update(manifestStr).digest('hex') } },
    atribuicao: { primarias: [{ id: 't01-abc', primeiro: 'ON' }, { id: 't02-def', primeiro: 'OFF' }] },
  };
}
const PREREG = preregPara('');

// ───────────────────────────────────────────────────────────────────────────

test('dividirComando descarta o cd e respeita aspas', () => {
  const { comando, args } = dividirComando(TAREFA.acceptance_cmd);
  assert.equal(comando, 'node');
  assert.deepEqual(args, ['--test', '--test-skip-pattern=(a|b c)', 'x.test.js']);
});

test('MORDE: dividirComando nunca deixa passar o cd', () => {
  // Um `cd` que sobrevivesse como comando corria no sítio errado e o teste
  // falhava nos dois braços — ruído que parece dados.
  const { comando, args } = dividirComando('cd /qualquer/coisa && node --test y.js');
  assert.equal(comando, 'node');
  assert.ok(!args.includes('cd'), 'o cd não pode chegar aos argumentos');
  assert.ok(!args.some((a) => a.includes('/qualquer/coisa')));
});

test('MORDE: o snapshot vem de git archive e nunca traz .git', () => {
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('TAR'), stderr: '' }) },
  ]);
  const r = prepararSnapshot({ repo: '/r', parent: 'pai456', destino: '/snap', acceptanceCwd: 'tools/router', spawnImpl: spawn, fsImpl: fakeFs() });
  assert.equal(r.ok, true);
  const git = spawn.chamadas.filter((c) => c.cmd === 'git');
  assert.equal(git.length, 1);
  assert.deepEqual(git[0].args, ['archive', '--format=tar', 'pai456']);
  // clone/checkout/worktree trariam .git — e com ele o commit-filho, legível.
  assert.ok(!spawn.chamadas.some((c) => ['clone', 'checkout', 'worktree'].includes(c.args?.[0])));
});

test('MORDE: o teste de aceitação vem do commit-FILHO', () => {
  const spawn = fakeSpawn([
    { quando: (c, a) => a[0] === 'show', responde: () => ({ status: 0, stdout: 'conteudo do teste', stderr: '' }) },
  ]);
  const r = testeDoFilho({ repo: '/r', commit: 'filho123', testFile: 'tools/router/x.test.js', spawnImpl: spawn });
  assert.equal(r.ok, true);
  assert.deepEqual(spawn.chamadas[0].args, ['show', 'filho123:tools/router/x.test.js']);
  assert.ok(!spawn.chamadas[0].args[1].startsWith('pai456'), 'o teste do PAI não serve de critério');
});

test('MORDE: se o teste já passa no pai, a tarefa é inválida', () => {
  // Sem esta guarda, um snapshot podre (ou uma tarefa mal minerada) dava
  // «ON venceu em 0 s» sem ninguém ter feito trabalho nenhum.
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('TAR') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 'teste' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 0, stdout: '', stderr: '' }) }, // JÁ PASSA
  ]);
  const r = prepararTarefa({ repo: '/r', tarefa: TAREFA, destino: '/snap', spawnImpl: spawn, fsImpl: fakeFs() });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'teste_ja_passa_no_pai');
});

test('prepararTarefa aceita quando o teste falha no pai', () => {
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('TAR') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 'teste' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1, stdout: '', stderr: 'falhou' }) },
  ]);
  const r = prepararTarefa({ repo: '/r', tarefa: TAREFA, destino: '/snap', spawnImpl: spawn, fsImpl: fakeFs() });
  assert.equal(r.ok, true);
  assert.equal(r.sha_teste.length, 64);
});

test('MORDE: o teste de aceitação corre em acceptance_cwd, não na raiz', () => {
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('TAR') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 'teste' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
  ]);
  prepararTarefa({ repo: '/r', tarefa: TAREFA, destino: '/snap', spawnImpl: spawn, fsImpl: fakeFs() });
  const noNode = spawn.chamadas.find((c) => c.cmd === 'node');
  assert.equal(noNode.opts.cwd, path.join('/snap', 'tools/router'));
});

test('MORDE: um braço inválido vale null, nunca o tecto', () => {
  // Dar o tecto a uma corrida que nunca chegou ao modelo transforma uma
  // falha de infra-estrutura num ponto para o outro braço.
  assert.equal(tvaFinal({ invalido: true, tva_s: null }, null), null);
  assert.equal(tvaFinal({ invalido: false, tva_s: 12 }, false), 1800);
  assert.equal(tvaFinal({ invalido: false, tva_s: 12 }, true), 12);
});

test('MORDE: o braço OFF leva --setting-sources e o ON não', () => {
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
    { quando: (c) => c === 'claude', responde: () => ({ status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 10 }, session_id: 's' }) }) },
  ]);
  void spawn;
  for (const braco of ['ON', 'OFF']) {
    const sp = fakeSpawn([
      { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
      { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
      { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
      { quando: (c) => c === 'claude', responde: () => ({ status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 10 } }) }) },
    ]);
    correrUmBraco({ braco, tarefa: TAREFA, repo: '/r', raizSnapshots: '/s', prereg: PREREG, spawnImpl: sp, fsImpl: fakeFs() });
    const cl = sp.chamadas.find((c) => c.cmd === 'claude');
    assert.equal(cl.args.includes('--setting-sources'), braco === 'OFF', `${braco} tem a flag errada`);
  }
});

test('MORDE: um braço já no ledger não repete', () => {
  // Repetir um braço é escolher qual das duas medições conta.
  const linhas = [{ tipo: 'braco', task_id: 't01-abc', braco: 'ON' }];
  const f = jaFeitos(linhas);
  assert.equal(f.has('t01-abc:ON'), true);
  assert.equal(f.has('t01-abc:OFF'), false);
});

test('lerLedger ignora linhas partidas sem rebentar', () => {
  const fsi = fakeFs({ 'l.jsonl': '{"tipo":"braco","task_id":"a","braco":"ON"}\nlixo\n{"tipo":"braco","task_id":"a","braco":"OFF"}\n' });
  const l = lerLedger('l.jsonl', fsi.readFileSync);
  assert.equal(l.length, 2);
});

test('paresDoLedger junta ON e OFF da mesma tarefa', () => {
  const pares = paresDoLedger([
    { tipo: 'braco', task_id: 'a', braco: 'ON', tva_s: 10, aceite: true, invalido: false },
    { tipo: 'braco', task_id: 'a', braco: 'OFF', tva_s: 100, aceite: true, invalido: false },
    { tipo: 'nota', task_id: 'a' },
  ]);
  assert.equal(pares.length, 1);
  assert.equal(pares[0].on.tva_s, 10);
  assert.equal(pares[0].off.tva_s, 100);
});

test('MORDE: a ordem dos braços obedece à atribuição congelada', () => {
  assert.deepEqual(ordemDosBracos('ON'), ['ON', 'OFF']);
  assert.deepEqual(ordemDosBracos('OFF'), ['OFF', 'ON']);
  assert.throws(() => ordemDosBracos('qualquer'), /primeiro inválido/);
  assert.equal(primeiroDe(PREREG, 't02-def'), 'OFF');
  assert.throws(() => primeiroDe(PREREG, 'nao-existe'), /fora do pré-registo/);
});

test('primarias exige que o manifest tenha todas as do pré-registo', () => {
  const manifest = { tarefas: [{ task_id: 't01-abc' }, { task_id: 't02-def' }, { task_id: 't99-zzz' }] };
  assert.equal(primarias(manifest, PREREG).length, 2);
  assert.throws(() => primarias({ tarefas: [{ task_id: 't01-abc' }] }, PREREG), /não tem todas as primárias/);
});

test('MORDE: as guardas recusam se o congelamento cair', () => {
  const fsi = fakeFs({ 'tools/ab/r24-manifest.json': 'CONTEUDO DIFERENTE' });
  const g = guardas(PREREG, { fsImpl: fsi, envImpl: {} });
  assert.equal(g.ok, false);
  assert.match(g.motivo, /congelamento/);
});

test('MORDE: as guardas recusam dentro de uma sessão Claude Code', () => {
  const g = guardas(PREREG, { fsImpl: fakeFs(), envImpl: { CLAUDE_CODE_SESSION_ID: 'x' } });
  assert.equal(g.ok, false);
  assert.match(g.motivo, /DENTRO de uma sessão/);
});

function spawnControlo(statusDaAceitacao) {
  return fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 'teste' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: statusDaAceitacao }) },
  ]);
}

test('MORDE: o controlo prepara a partir do FILHO, não do pai', () => {
  // Preparar do pai fazia o controlo medir a mesma coisa que a verificação —
  // e um controlo que concorda com o instrumento por construção não é controlo.
  const sp = spawnControlo(0);
  prepararControlo({ repo: '/r', tarefa: TAREFA, destino: '/snap', spawnImpl: sp, fsImpl: fakeFs() });
  const archive = sp.chamadas.find((c) => c.args?.[0] === 'archive');
  assert.equal(archive.args[2], 'filho123');
  assert.notEqual(archive.args[2], 'pai456', 'o controlo tem de vir do commit onde o humano fez o teste passar');
});

test('MORDE: o controlo exige PASSAR, e reprova quando falha', () => {
  assert.equal(prepararControlo({ repo: '/r', tarefa: TAREFA, destino: '/s', spawnImpl: spawnControlo(0), fsImpl: fakeFs() }).ok, true);
  const mau = prepararControlo({ repo: '/r', tarefa: TAREFA, destino: '/s', spawnImpl: spawnControlo(1), fsImpl: fakeFs() });
  assert.equal(mau.ok, false);
  assert.match(mau.motivo, /teste_nao_passa_no_filho/);
});

test('MORDE: --verificar nunca chama o modelo', () => {
  // O modo grátis tem de continuar grátis: se chamar `claude`, custa dinheiro
  // e gasta a quota do dono sem produzir uma única linha de ledger.
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({
    'r24-prereg.json': JSON.stringify(preregPara(manifestStr)),
    'r24-manifest.json': manifestStr,
  });
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
  ]);
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--verificar'],
    { fsImpl: fsi, spawnImpl: spawn, envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 0);
  assert.equal(spawn.chamadas.some((c) => c.cmd === 'claude'), false, '--verificar chamou o modelo');
});

test('--correr recusa se o congelamento já está partido no arranque', () => {
  // 23 horas de janela é tempo de sobra para alguém editar o manifest.
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({
    'r24-prereg.json': JSON.stringify(preregPara(manifestStr)),
    // JSON válido — senão o teste passava por «manifest ilegível», que é
    // outra falha, e a guarda do congelamento ficava por exercer.
    'r24-manifest.json': manifestStr.replace('t02-def', 't02-ADULTERADO'),
  });
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--correr'],
    { fsImpl: fsi, spawnImpl: fakeSpawn(), envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
  assert.ok(linhas.some((l) => /RECUSO CORRER/.test(l)));
});

test('MORDE: --correr revalida o congelamento a CADA tarefa', () => {
  // Validar só no arranque deixa 23 horas de janela aberta. Este teste deixa
  // a 1.ª tarefa correr por inteiro e só depois adultera o manifest: se a
  // revalidação no laço desaparecer, a corrida segue e ninguém dá por nada.
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const prereg = preregPara(manifestStr);
  let leiturasDoManifest = 0;
  const base = fakeFs({ 'r24-prereg.json': JSON.stringify(prereg), 'r24-manifest.json': manifestStr });
  const fsi = {
    ...base,
    readFileSync(p2) {
      if (String(p2).includes('r24-manifest.json')) {
        leiturasDoManifest++;
        // 1 = main a carregar · 2 = guarda de arranque · 3 = guarda da 1.ª tarefa
        if (leiturasDoManifest > 3) return manifestStr.replace('t02-def', 'ADULTERADO');
      }
      return base.readFileSync(p2);
    },
  };
  const spawn = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
    { quando: (c) => c === 'claude', responde: () => ({ status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 10 } }) }) },
  ]);
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--correr'],
    { fsImpl: fsi, spawnImpl: spawn, envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
  assert.ok(linhas.some((l) => /PÁRA a meio/.test(l)), `esperava paragem a meio, veio: ${linhas.join(' | ')}`);
  // a 1.ª tarefa chegou a correr; a 2.ª não
  assert.ok(linhas.some((l) => /t01-abc ON/.test(l)));
  assert.ok(!linhas.some((l) => /t02-def/.test(l)));
});

test('sem modo escolhido, não corre nada', () => {
  const m = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({ 'r24-prereg.json': JSON.stringify(preregPara(m)), 'r24-manifest.json': m });
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json'], { fsImpl: fsi, spawnImpl: fakeSpawn(), envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
});
