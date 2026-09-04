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
import fsReal from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  dividirComando, lerLedger, jaFeitos, paresDoLedger, ordemDosBracos,
  prepararSnapshot, testeDoFilho, prepararTarefa, prepararControlo, tvaFinal, correrUmBraco,
  primarias, primeiroDe, idsPrimarias, desta, guardas, main,
  candidatosClaude, resolverClaude, spawnComClaude,
  lerLedgerCru, shaDoPrereg, tomarTranca, largarTranca, prepararSnapshot as _ps,
} from './correr-r24.mjs';
import { verificarCongelamento } from './mooter-use-ab.mjs';
import {
  EFFORT, MARCA, argsComuns, definicoesDoBraco, escreverDefinicoes, exposicaoValida,
} from './r24-exposicao.mjs';

// ───────────────────────────────────────────────────────────────────────────
// Duplos
// ───────────────────────────────────────────────────────────────────────────

let marcaLigada = true;
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
    // a marca da exposição existe sse o braço for ON — os testes que a querem
    // ausente sobrepõem este existsSync
    existsSync(p) { return String(p).includes(MARCA) ? marcaLigada : (/node_modules$/.test(String(p)) && !/snap/.test(String(p))); },
    symlinkSync(alvo, ligacao) { ligacoes.push([String(alvo), String(ligacao)]); },
    cpSync() {},
    readdirSync() { return []; },
    statSync() { return { isDirectory: () => false, isFile: () => false }; },
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

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_PREREG = path.join(AQUI, 'r24-prereg.json');
const CAMINHO_MANIFEST = path.join(AQUI, 'r24-manifest.json');

/** O pré-registo A SÉRIO, do disco. */
const PREREG_REAL = JSON.parse(fsReal.readFileSync(CAMINHO_PREREG, 'utf8'));

/**
 * A fixture é DERIVADA do ficheiro real, nunca escrita à mão.
 *
 * Porquê: a 2026-09-04 a fixture inventou `atribuicao.primarias`, um campo que
 * o pré-registo não tem (os ids vivem em `corpus.primarias`, a ordem em
 * `atribuicao.pares`). 28 testes passaram verdes contra uma forma inexistente,
 * enquanto `--correr`, `--verificar` e `--controlo` rebentavam todos com
 * TypeError contra o ficheiro a sério. Instrumento e controlo escritos pela
 * mesma mão, com a mesma suposição errada, a concordar um com o outro.
 * Clonar o real e só substituir os DADOS faz a forma ser sempre verdadeira.
 */
function preregPara(manifestStr, mexer = () => {}) {
  const p = JSON.parse(JSON.stringify(PREREG_REAL));
  p.corpus.primarias = ['t01-abc', 't02-def'];
  p.corpus.reservas = [];
  p.atribuicao.pares = [{ id: 't01-abc', primeiro: 'ON' }, { id: 't02-def', primeiro: 'OFF' }];
  p.congelados = { manifest: { path: 'tools/ab/r24-manifest.json', sha256: crypto.createHash('sha256').update(manifestStr).digest('hex') } };
  // o sha do router pinado é verificado por um teste próprio; aqui desliga-se
  // para os testes de fluxo não dependerem de uma cópia real em disco
  p.tratamento = { ...p.tratamento, router_sha: null };
  mexer(p);
  p.sha_do_prereg = null;
  p.sha_do_prereg = shaDoPrereg(p);
  return p;
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
  // e a dispensa é uma opção declarada, não um envImpl vazio à socapa
  const analise = guardas(PREREG, { fsImpl: fakeFs({ 'r24-manifest.json': '' }), envImpl: { CLAUDE_CODE_SESSION_ID: 'x' }, exigirAmbiente: false });
  assert.equal(analise.ok, true, '--analisar só lê o ledger; não precisa de ambiente apto');
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
  // O gatilho é a 1.ª tarefa ter sido ESCRITA no ledger, não uma contagem de
  // leituras: contar leituras acopla o teste ao número de guardas, e foi assim
  // que ele se partiu quando as guardas passaram a verificar mais coisas.
  let t01Escrita = false;
  const base = fakeFs({ 'r24-prereg.json': JSON.stringify(prereg), 'r24-manifest.json': manifestStr });
  const fsi = {
    ...base,
    appendFileSync(p2, c) { if (String(c).includes('t01-abc')) t01Escrita = true; return base.appendFileSync(p2, c); },
    readFileSync(p2) {
      if (t01Escrita && String(p2).includes('r24-manifest.json')) return manifestStr.replace('t02-def', 'ADULTERADO');
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

// ───────────────────────────────────────────────────────────────────────────
// O executável do agente. Ver o comentário em correr-r24.mjs: o ENOENT do
// Windows dava PERDEU com p=1,0 em 46 corridas de 4 ms.
// ───────────────────────────────────────────────────────────────────────────

test('MORDE: um erro de spawn é INVÁLIDO, não uma derrota de 1800 s', () => {
  // Esta é a linha que separa «o agente falhou» de «o aparato está partido».
  // Sem ela, os dois braços davam 1800, os 23 pares contavam como válidos,
  // X=0, e o relatório imprimia PERDEU com aparelhagem estatística completa.
  const sp = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
    { quando: (c) => c === 'claude', responde: () => ({ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) }) },
  ]);
  const l = correrUmBraco({ braco: 'ON', tarefa: TAREFA, repo: '/r', raizSnapshots: '/s', prereg: PREREG, spawnImpl: sp, fsImpl: fakeFs() });
  assert.equal(l.invalido, true, 'ENOENT tem de ser INVÁLIDO');
  assert.equal(l.tva_s, null, 'um par inválido não pode trazer um tempo');
  assert.match(l.motivo, /^spawn:/);
});

test('MORDE: --correr recusa arrancar sem executável do agente', () => {
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({ 'r24-prereg.json': JSON.stringify(preregPara(manifestStr)), 'r24-manifest.json': manifestStr });
  fsi.existsSync = () => false; // nenhum candidato existe no disco
  const sp = fakeSpawn([{ quando: () => true, responde: () => ({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }) }]);
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--correr'],
    { fsImpl: fsi, spawnImpl: sp, envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
  assert.ok(linhas.some((l) => /executavel do agente/.test(l)), `esperava recusa por falta de agente, veio: ${linhas.join(' | ')}`);
  assert.equal(sp.chamadas.some((c) => c.args?.[0] === 'archive'), false, 'não pode preparar snapshot nenhum');
});

test('os modos grátis NÃO exigem agente — só --correr exige', () => {
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({ 'r24-prereg.json': JSON.stringify(preregPara(manifestStr)), 'r24-manifest.json': manifestStr });
  fsi.existsSync = () => false;
  const sp = fakeSpawn([
    { quando: (c) => c === 'claude', responde: () => ({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }) },
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
  ]);
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--verificar'],
    { fsImpl: fsi, spawnImpl: sp, envImpl: {}, log: () => {}, err: () => {} });
  assert.equal(code, 0);
});

test('MORDE: o spawn da corrida reescreve claude, e só claude', () => {
  const chamadas = [];
  const base = (cmd) => { chamadas.push(cmd); return { status: 0, stdout: '' }; };
  const env = spawnComClaude('C:/x/claude.exe', base);
  env('claude', []); env('git', []); env('node', []); env('tar', []);
  assert.deepEqual(chamadas, ['C:/x/claude.exe', 'git', 'node', 'tar']);
  // quando já resolve pelo nome, não envolve nada
  assert.equal(spawnComClaude('claude', base), base);
});

test('resolverClaude respeita MOOTER_CLAUDE_BIN e reporta o que tentou', () => {
  const sp = fakeSpawn([
    { quando: (c) => c === '/meu/claude', responde: () => ({ status: 0, stdout: '9.9.9 (Claude Code)' }) },
  ]);
  const r = resolverClaude({ env: { MOOTER_CLAUDE_BIN: '/meu/claude' }, plataforma: 'linux', spawnImpl: sp, fsImpl: { existsSync: () => true } });
  assert.equal(r.ok, true);
  assert.equal(r.caminho, '/meu/claude');
  assert.equal(r.versao, '9.9.9 (Claude Code)');

  const mau = resolverClaude({ env: {}, plataforma: 'linux', fsImpl: { existsSync: () => false },
    spawnImpl: fakeSpawn([{ quando: () => true, responde: () => ({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }) }]) });
  assert.equal(mau.ok, false);
  assert.ok(mau.tentados.some((t) => /ENOENT/.test(t)), 'tem de dizer o que tentou');
});

test('candidatosClaude procura o exe escondido do npm no Windows', () => {
  const c = candidatosClaude({ PATH: 'C:\npm;C:\outro' }, 'win32');
  assert.ok(c.includes('claude'));
  assert.ok(c.some((x) => x.includes('@anthropic-ai') && x.endsWith('claude.exe')),
    'sem isto o shim .cmd do npm nunca é resolvido e o spawn dá ENOENT');
  // em POSIX o nome basta
  assert.deepEqual(candidatosClaude({}, 'linux'), ['claude']);
});

test('sem modo escolhido, não corre nada', () => {
  const m = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({ 'r24-prereg.json': JSON.stringify(preregPara(m)), 'r24-manifest.json': m });
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json'], { fsImpl: fsi, spawnImpl: fakeSpawn(), envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
});

// ───────────────────────────────────────────────────────────────────────────
// CONTRATO DE FORMA — contra os ficheiros A SÉRIO, do disco.
//
// Este bloco existe porque 28 testes verdes conviveram com um executor que
// rebentava contra o pré-registo real. Nenhuma fixture o teria apanhado: só
// carregar o ficheiro apanha.
// ───────────────────────────────────────────────────────────────────────────

test('CONTRATO: o executor lê o pré-registo REAL sem rebentar', () => {
  const manifest = JSON.parse(fsReal.readFileSync(CAMINHO_MANIFEST, 'utf8'));
  const t = primarias(manifest, PREREG_REAL);
  assert.equal(t.length, PREREG_REAL.estatistica.n, 'as primárias têm de ser exactamente n');
  const on = t.filter((x) => primeiroDe(PREREG_REAL, x.task_id) === 'ON').length;
  assert.equal(on, PREREG_REAL.atribuicao.on_primeiro);
  assert.equal(t.length - on, PREREG_REAL.atribuicao.off_primeiro);
  assert.equal(idsPrimarias(PREREG_REAL).length, 23);
});

test('CONTRATO: o pré-registo real fecha-se sobre si próprio', () => {
  assert.equal(shaDoPrereg(PREREG_REAL), PREREG_REAL.sha_do_prereg,
    'o ficheiro que fixa o n tem de estar fixado');
});

test('CONTRATO: o congelamento bate para tudo o que está no repositório', () => {
  // O `desenho` da experiência vive no vault do dono, fora do repositório: em
  // CI é `ilegivel:ENOENT` e não há nada a fazer quanto a isso. O que NÃO pode
  // acontecer é um ficheiro DO REPOSITÓRIO divergir, ou o desenho divergir por
  // BYTES DIFERENTES em vez de ausência — isso seria o congelamento a cair.
  const c = verificarCongelamento(PREREG_REAL);
  for (const f of c.falhas) {
    assert.equal(f.nome, 'desenho', `entrada do repositório fora do congelamento: ${f.nome}=${f.motivo}`);
    assert.match(f.motivo, /^ilegivel:ENOENT$/, 'o desenho pode faltar; não pode ter bytes diferentes');
  }
});

test('CONTRATO: as guardas aceitam o pré-registo real na máquina que tem o vault', (t) => {
  const c = verificarCongelamento(PREREG_REAL);
  if (c.falhas.length) { t.skip('sem o vault montado — coberto pelo teste acima'); return; }
  const g = guardas(PREREG_REAL, { envImpl: {}, exigirAgente: false });
  assert.equal(g.ok, true, `guardas recusaram o ficheiro real: ${g.motivo}`);
});

test('MORDE: mexer no n do pré-registo trava as guardas', () => {
  // n atravessa a fronteira e mexe nas DUAS pontas: abre o portão dos pares
  // válidos e baixa o limiar. Medido: X=15 dá PERDEU (p=0,105) com n=23 e
  // GANHOU (p=0,021) com n=20 — e pôr n=20 é a «correcção honesta» que
  // qualquer executante alcança depois de 3 pares inválidos.
  const adulterado = JSON.parse(JSON.stringify(PREREG_REAL));
  adulterado.estatistica.n = 20;
  // afirmado directamente sobre o selo, para não depender do vault estar montado
  assert.notEqual(shaDoPrereg(adulterado), adulterado.sha_do_prereg, 'o selo do pré-registo tem de partir');
  const g = guardas(adulterado, { envImpl: {}, exigirAgente: false });
  assert.equal(g.ok, false);

  // E mexer numa coisa que o limiar NÃO apanha tem de ser apanhada na mesma:
  // sem isto, o selo do pré-registo podia desaparecer e o teste continuava
  // verde por causa da verificação do limiar, que é outra guarda.
  const outraSeed = JSON.parse(JSON.stringify(PREREG_REAL));
  outraSeed.seed = 7;
  const g2 = guardas(outraSeed, { envImpl: {}, exigirAgente: false });
  assert.equal(g2.ok, false, 'trocar a seed tem de partir o selo');
  assert.match(g2.motivo, /pre-registo mudou/);
});

// ───────────────────────────────────────────────────────────────────────────

test('MORDE: só as linhas DESTA experiência contam', () => {
  const p = preregPara('');
  const linhas = [
    { tipo: 'braco', experiment_id: p.experiment_id, seed: 42, task_id: 't01-abc', braco: 'ON' },
    { tipo: 'braco', experiment_id: 'outra-coisa', seed: 42, task_id: 't01-abc', braco: 'OFF' },
    { tipo: 'braco', experiment_id: p.experiment_id, seed: 7, task_id: 't02-def', braco: 'ON' },
    { tipo: 'braco', experiment_id: p.experiment_id, seed: 42, task_id: 't99-reserva', braco: 'ON' },
  ];
  const d = desta(linhas, p);
  assert.equal(d.length, 1, 'outro experiment_id, outra seed e uma não-primária ficam de fora');
  assert.equal(d[0].task_id, 't01-abc');
});

test('MORDE: uma linha ilegível no ledger é contada, não engolida', () => {
  const fsi = fakeFs({ 'l.jsonl': '{"tipo":"braco"}\nlixo truncado\n{"tipo":"braco"}\n' });
  const r = lerLedgerCru('l.jsonl', fsi.readFileSync);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.descartadas, 1, 'perder um braço em silêncio valia uma derrota');
});

test('MORDE: --analisar recusa um ledger truncado', () => {
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const fsi = fakeFs({
    'r24-prereg.json': JSON.stringify(preregPara(manifestStr)),
    'r24-manifest.json': manifestStr,
    'ledger.jsonl': '{"tipo":"braco"}\nlixo\n',
  });
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--analisar', '--ledger', 'ledger.jsonl'],
    { fsImpl: fsi, spawnImpl: fakeSpawn(), envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
  assert.ok(linhas.some((l) => /ilegivel/.test(l)));
});

test('MORDE: o teste é reinstalado depois do agente, e a alteração fica registada', () => {
  // 13 das 25 tarefas falham por UMA asserção. Um agente que a apague saía com
  // exit 0 e marcava Z=1 — e com o limiar em 16/23, um par fabricado leva
  // «PERDEU · X=15» a «GANHOU · X=16».
  const fsi = fakeFs();
  let conteudoNoDisco = 'teste original';
  fsi.writeFileSync = (p2, c) => { if (String(p2).includes('x.test.js')) conteudoNoDisco = c; };
  fsi.readFileSync = (p2) => { if (String(p2).includes('x.test.js')) return conteudoNoDisco; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };
  fsi.existsSync = (p2) => String(p2).includes(MARCA); // braço ON bem exposto
  const sp = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 'teste original' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
    { quando: (c) => c === 'claude', responde: () => { conteudoNoDisco = 'it.skip(...)'; return { status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 10 } }) }; } },
  ]);
  const l = correrUmBraco({ braco: 'ON', tarefa: TAREFA, repo: '/r', raizSnapshots: '/s', prereg: PREREG, router: { hook: '/pin/h.cjs', sha: 'r' }, spawnImpl: sp, fsImpl: fsi });
  assert.equal(l.tocou_no_teste, true, 'tem de registar que o agente mexeu no teste');
  assert.equal(conteudoNoDisco, 'teste original', 'o teste do commit-filho tem de ser reposto antes da aceitação');
});

test('MORDE: duas instâncias não correm ao mesmo tempo', () => {
  // A segunda instância apagava o directório onde o agente da primeira
  // trabalhava, e o braço saía {aceite:false, tva_s:1800} — indistinguível de
  // uma derrota honesta. Bidireccional: se calhasse no OFF, fabricava vitória.
  const disco = new Map();
  const fsi = {
    mkdirSync() {},
    readFileSync(p2) { if (!disco.has(String(p2))) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return disco.get(String(p2)); },
    writeFileSync(p2, c, o) {
      if (o && o.flag === 'wx' && disco.has(String(p2))) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      disco.set(String(p2), c);
    },
    rmSync(p2) { disco.delete(String(p2)); },
  };
  const a = tomarTranca('/raiz', { fsImpl: fsi, pid: 111 });
  assert.equal(a.ok, true);
  const b = tomarTranca('/raiz', { fsImpl: fsi, pid: 222 });
  assert.equal(b.ok, false);
  assert.match(b.motivo, /ja corre outra instancia/);
  largarTranca(a.caminho, { fsImpl: fsi });
  assert.equal(tomarTranca('/raiz', { fsImpl: fsi, pid: 333 }).ok, true, 'largada, a tranca liberta');
});

// ───────────────────────────────────────────────────────────────────────────
// D1 · A EXPOSIÇÃO DO TRATAMENTO (decisão do dono: isolar o router)
// ───────────────────────────────────────────────────────────────────────────

test('MORDE: os dois braços diferem em UMA chave, e é `hooks`', () => {
  // A assimetria era «nada em vez de tudo»: o OFF perdia effort xhigh, 4
  // plugins, 22 hooks e 31 permissões. Agora a diferença tem de ser exactamente
  // a chave que representa o tratamento, e nada mais.
  const on = definicoesDoBraco('ON', 'C:/pin/r24-hook.cjs');
  const off = definicoesDoBraco('OFF', 'C:/pin/r24-hook.cjs');
  const diferentes = [...new Set([...Object.keys(on), ...Object.keys(off)])]
    .filter((k) => JSON.stringify(on[k]) !== JSON.stringify(off[k]));
  assert.deepEqual(diferentes, ['hooks']);
  assert.equal(off.hooks, undefined, 'o braço OFF não pode ter hooks nenhuns');
  assert.match(JSON.stringify(on.hooks), /UserPromptSubmit/);
});

test('MORDE: o hook aponta para o router PINADO, não para o do snapshot', () => {
  // classify.js difere do sha congelado em 4 dos 23 commits-pai, e 3 tarefas
  // MEXEM em tools/router — o agente podia alterar o próprio tratamento.
  const on = definicoesDoBraco('ON', 'C:/cache/router-pinado/r24-hook.cjs');
  const cmd = on.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.match(cmd, /router-pinado/);
  assert.ok(!/tools[\/]router[\/]inject_context/.test(cmd), 'nunca o router do snapshot');
});

test('MORDE: os args comuns fixam effort e permissões, iguais nos dois braços', () => {
  const a = argsComuns();
  assert.ok(a.includes('--effort') && a.includes(EFFORT), 'o effort tem de ser fixado');
  assert.ok(a.includes('--setting-sources') && a.includes('project'));
  assert.ok(!a.join(' ').includes('project,local'), 'o filtro assimétrico não pode voltar');
});

test('MORDE: braço mal exposto é INVÁLIDO — nos dois sentidos', () => {
  // O pré-registo listava «braço mal exposto» como motivo de invalidez e
  // nenhuma linha de código o calculava.
  assert.equal(exposicaoValida({ braco: 'ON', marcaExiste: false }).ok, false, 'ON sem hook a disparar');
  assert.match(exposicaoValida({ braco: 'ON', marcaExiste: false }).motivo, /ON_sem_hook/);
  assert.equal(exposicaoValida({ braco: 'OFF', marcaExiste: true }).ok, false, 'OFF com hook a disparar');
  assert.match(exposicaoValida({ braco: 'OFF', marcaExiste: true }).motivo, /OFF_com_hook/);
  assert.equal(exposicaoValida({ braco: 'ON', marcaExiste: true }).ok, true);
  assert.equal(exposicaoValida({ braco: 'OFF', marcaExiste: false }).ok, true);
});

test('MORDE: um ON cujo hook não disparou não conta como derrota — conta como inválido', () => {
  const fsi = fakeFs();
  fsi.existsSync = (p2) => !String(p2).includes(MARCA) && /node_modules$/.test(String(p2));
  const sp = fakeSpawn([
    { quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) },
    { quando: (c, a) => c === 'git' && a[0] === 'show', responde: () => ({ status: 0, stdout: 't' }) },
    { quando: (c) => c === 'node', responde: () => ({ status: 1 }) },
    { quando: (c) => c === 'claude', responde: () => ({ status: 0, stdout: JSON.stringify({ is_error: false, duration_api_ms: 900, usage: { input_tokens: 10 } }) }) },
  ]);
  const l = correrUmBraco({ braco: 'ON', tarefa: TAREFA, repo: '/r', raizSnapshots: '/s', prereg: PREREG, router: { hook: '/pin/h.cjs', sha: 'r' }, spawnImpl: sp, fsImpl: fsi });
  assert.equal(l.invalido, true);
  assert.match(l.motivo, /braco_mal_exposto:ON_sem_hook/);
  assert.equal(l.tva_s, null, 'e não pode trazer um tempo');
});

test('escreverDefinicoes põe o ficheiro em .claude/settings.json e devolve o sha', () => {
  const escritos = [];
  const fsi = { mkdirSync() {}, writeFileSync: (p2, c) => escritos.push([String(p2), c]) };
  const r = escreverDefinicoes({ snapshotDir: '/snap', braco: 'OFF', caminhoDoHook: '', fsImpl: fsi });
  assert.equal(escritos.length, 1);
  assert.ok(escritos[0][0].split(String.fromCharCode(92)).join('/').endsWith('/.claude/settings.json'), escritos[0][0]);
  assert.equal(r.sha.length, 64);
  assert.ok(!escritos[0][1].includes('hooks'));
});

test('MORDE: o node_modules do snapshot vem do CACHE, nunca do repositório vivo', () => {
  // Os braços correm com bypassPermissions. Uma junção para o repositório vivo
  // do dono deixava um agente sem travões escrever lá dentro.
  const ligacoes = [];
  const fsi = {
    rmSync() {}, mkdirSync() {}, existsSync: (p2) => /node_modules$/.test(String(p2)) && !/snap/.test(String(p2)),
    symlinkSync: (alvo, lig) => ligacoes.push(String(alvo)),
  };
  const sp = fakeSpawn([{ quando: (c, a) => c === 'git' && a[0] === 'archive', responde: () => ({ status: 0, stdout: Buffer.from('T') }) }]);
  const REPO_VIVO = 'C:/um/repositorio/vivo';
  _ps({ repo: REPO_VIVO, parent: 'p', destino: '/snap', acceptanceCwd: 'tools/router', cacheNm: 'C:/cache', spawnImpl: sp, fsImpl: fsi });
  assert.ok(ligacoes.length > 0, 'tem de ligar alguma coisa');
  for (const a of ligacoes) {
    assert.ok(a.includes('cache'), `ligou para fora do cache: ${a}`);
    assert.ok(!a.includes('vivo'), `ligou para o repositório vivo: ${a}`);
  }
});

test('MORDE: --correr recusa se o router pinado não bater com o pré-registo', () => {
  // O tratamento tem um sha, como tudo o resto. Se a cópia pinada mudar — por
  // um `git pull` no meio da corrida, por exemplo — as 23 tarefas deixavam de
  // partilhar o mesmo tratamento e ninguém saberia.
  const manifestStr = JSON.stringify({ tarefas: [{ ...TAREFA }, { ...TAREFA, task_id: 't02-def' }] });
  const prereg = preregPara(manifestStr, (p) => { p.tratamento = { ...p.tratamento, router_sha: 'a'.repeat(64) }; });
  const fsi = fakeFs({ 'r24-prereg.json': JSON.stringify(prereg), 'r24-manifest.json': manifestStr });
  const linhas = [];
  const code = main(['--prereg', 'tools/ab/r24-prereg.json', '--controlo'],
    { fsImpl: fsi, spawnImpl: fakeSpawn(), envImpl: {}, log: (m) => linhas.push(m), err: (m) => linhas.push(m) });
  assert.equal(code, 2);
  assert.ok(linhas.some((l) => /router pinado nao bate/.test(l)), linhas.join(' | '));
});
