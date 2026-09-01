/**
 * beacon-publisher.test.mjs
 *
 * O teste que importa e o terceiro: este modulo corre dentro do VAULT PESSOAL
 * do dono, que pode ter trabalho por enviar (medido a 2026-08-19: 5 commits).
 * Um publicador que empurra o que encontrou e indistinguivel de um acidente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { publicarBeacon, estaNaHora, ligado, MINUTOS_OMISSAO , estadoDoVault, LOCK_ORFAO_MIN} from './beacon-publisher.mjs';

const FICH = '50-fleet/mac.json';

/** Um git falso que grava o que lhe pediram e responde ao que for preciso. */
function gitFalso(respostas = {}) {
  const chamadas = [];
  const run = (bin, args) => {
    chamadas.push(args.join(' '));
    const k = args[0] + (args[1] ? ' ' + args[1] : '');
    if (Object.prototype.hasOwnProperty.call(respostas, k)) {
      const r = respostas[k];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(chamadas) : r;
    }
    return '';
  };
  return { run, chamadas };
}

/**
 * O vault existe e esta LIMPO: sem merge por fechar, sem lock.
 *
 * A primeira versao disto era `() => true`, e com o guarda novo isso passou a
 * querer dizer "ha um MERGE_HEAD" — os testes falhavam por o fixture mentir
 * sobre o disco, nao por o codigo estar mal.
 */
const existeSempre = (p) => !/MERGE_HEAD|REBASE_HEAD|CHERRY_PICK_HEAD|index\.lock/.test(String(p));

// ── nasce desligado ─────────────────────────────────────────────────────────

test('sem a variavel de ambiente, o publicador nao corre', () => {
  assert.equal(ligado({}), false, 'escrever no vault de alguem nao pode ser o comportamento por omissao');
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: '0' }), false);
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: 'sim' }), false, 'so o 1 conta: um valor qualquer nao liga isto');
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: '1' }), true);
});

// ── a trava que protege trabalho alheio ─────────────────────────────────────

test('NAO publica se houver trabalho de outra pessoa em staging', () => {
  const g = gitFalso({
    remote: 'origin',
    'diff --cached': '00-core/uma-nota.md\n20-decisions/outra.md',
  });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, false);
  assert.match(r.porque, /trabalho alheio/);
  assert.ok(!g.chamadas.some((c) => c.startsWith('commit')), 'nem sequer chegou a tentar commitar');
  assert.ok(!g.chamadas.some((c) => c.startsWith('push')), 'e muito menos empurrar');
});

test('o `git add` nomeia o ficheiro exacto — nunca um -A, nem aqui', () => {
  let vez = 0;
  const g = gitFalso({
    remote: 'origin',
    // vazio antes do add, com o beacon depois
    'diff --cached': () => (vez++ === 0 ? '' : FICH),
  });
  publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  const add = g.chamadas.find((c) => c.startsWith('add'));
  assert.equal(add, `add -- ${FICH}`);
  assert.ok(!g.chamadas.some((c) => c.includes('-A')), 'um -A aqui apanharia o vault inteiro');
});

test('empurra com rebase, e nunca com force', () => {
  let vez = 0;
  const g = gitFalso({ remote: 'origin', 'diff --cached': () => (vez++ === 0 ? '' : FICH) });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, true);
  assert.ok(g.chamadas.includes('pull --rebase --autostash'), 'dois devices em paralelo nao podem perder o beacon um do outro');
  assert.ok(g.chamadas.includes('push'));
  assert.ok(!g.chamadas.some((c) => c.includes('--force')), 'nada aqui justifica um force num repo pessoal');
});

// ── recusa-se em vez de fingir ──────────────────────────────────────────────

test('sem vault, sem git ou sem remoto: recusa e diz porque', () => {
  const g = gitFalso({ remote: '' });
  assert.match(publicarBeacon('', FICH, { runImpl: g.run, existsImpl: existeSempre }).porque, /sem vault/);
  assert.match(publicarBeacon('/v', FICH, { runImpl: g.run, existsImpl: () => false }).porque, /sem vault/);
  assert.match(publicarBeacon('/v', FICH, { runImpl: g.run, existsImpl: existeSempre }).porque, /remoto/);
});

test('um beacon que nao mudou nao gera commit nenhum', () => {
  const g = gitFalso({ remote: 'origin', 'diff --cached': '' });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, true);
  assert.equal(r.publicado, null);
  assert.ok(!g.chamadas.some((c) => c.startsWith('commit')), 'milhares de commits vazios era exactamente o que se queria evitar');
});

test('uma falha do git NAO derruba o loop — devolve-se, nao se lanca', () => {
  let vez = 0;
  const g = gitFalso({
    remote: 'origin',
    'diff --cached': () => (vez++ === 0 ? '' : FICH),
    push: new Error('fatal: could not read Username'),
  });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, false);
  assert.match(r.porque, /Username/, 'o beacon e conveniencia; a GPU e o trabalho');
});

// ── o relogio, e nao a ronda ────────────────────────────────────────────────

test('publica por relogio: uma ronda dura segundos, isto nao', () => {
  const agora = 1_760_000_000_000;
  assert.equal(estaNaHora(null, { agora }), true, 'a primeira vez publica sempre');
  assert.equal(estaNaHora(agora - 60_000, { agora }), false, 'um minuto depois, nao');
  assert.equal(estaNaHora(agora - MINUTOS_OMISSAO * 60_000, { agora }), true);
});

// ── a ligacao ao loop (2026-08-19) ──────────────────────────────────────────

/**
 * A primeira versao da ligacao no `moo-runner` tratou o retorno de
 * `beaconDir()` como uma string e fez `where.replace(...)`. `beaconDir`
 * devolve um OBJECTO — `{dir, transporte, partilhado}` — e a publicacao morria
 * com `where.replace is not a function` a CADA ronda, num `catch` que so
 * avisava uma vez. Ligar a variavel nao teria feito nada, e o silencio teria
 * parecido "ainda nao passaram os 10 minutos".
 */
test('o loop usa o .dir do beaconDir, nunca o objecto como string', () => {
  const fonte = fs.readFileSync(new URL('./moo-runner.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /where\.replace\(/, 'beaconDir devolve um objecto, nao uma string');
  assert.match(fonte, /path\.dirname\(where\.dir\)/, 'a raiz do vault deriva-se do .dir');
});

test('nao se publica quando o transporte nao e partilhado', () => {
  // Sem vault montado, `beaconDir()` cai para `~/.mooter/fleet` com
  // `partilhado: false`. Publicar ali seria fazer commits numa pasta que mais
  // ninguem le — trabalho a fingir que e frota.
  const fonte = fs.readFileSync(new URL('./moo-runner.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /where\.partilhado && publicacaoLigada\(\)/,
    'o transporte local nunca pode disparar uma publicacao');
});

// ── o lock orfao no vault do dono (2026-08-21) ─────────────────────────────

/**
 * Incidente real. Este publicador foi morto a meio de um ciclo git e deixou um
 * `.git/index.lock` de 0 bytes no vault PESSOAL do dono. Enquanto ali esteve,
 * TODAS as operacoes git naquele repositorio ficaram bloqueadas — incluindo as
 * dele. Um beacon de conveniencia trancou o trabalho de alguem.
 */
const AGORA = 1_000_000_000_000;
const so = (nome) => (p) => String(p).includes(nome);

test('um merge por fechar PARA o publicador — nao se commita por cima', () => {
  // Commitar por cima de um MERGE_HEAD enterraria um conflito que alguem tem
  // de resolver a olho.
  for (const marca of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD']) {
    const r = estadoDoVault('/v', { existsImpl: so(marca), agora: AGORA });
    assert.equal(r.ok, false, marca);
    assert.match(r.porque, new RegExp(marca));
  }
});

test('um lock FRESCO faz esperar, nunca remover', () => {
  let removeu = false;
  const r = estadoDoVault('/v', {
    existsImpl: so('index.lock'),
    statImpl: () => ({ mtimeMs: AGORA - 60_000 }),
    rmImpl: () => { removeu = true; },
    agora: AGORA,
  });
  assert.equal(r.ok, false);
  assert.equal(removeu, false, 'ha outro git a trabalhar — esperar e gratis, remover e destrutivo');
  assert.match(r.porque, /espero pelo próximo ciclo/);
});

test('um lock ORFAO e removido, e diz-se que se removeu', () => {
  let removido = null;
  const r = estadoDoVault('/v', {
    existsImpl: so('index.lock'),
    statImpl: () => ({ mtimeMs: AGORA - (LOCK_ORFAO_MIN + 5) * 60_000 }),
    rmImpl: (p) => { removido = p; },
    agora: AGORA,
  });
  assert.equal(r.ok, true);
  assert.match(String(removido), /index\.lock$/, 'so o lock, nunca mais nada');
  assert.match(r.porque, /órfão/);
});

test('um lock que nao se consegue datar NAO se remove', () => {
  // So se remove o que se PROVOU orfao pela idade. Nunca por suposicao.
  let removeu = false;
  const r = estadoDoVault('/v', {
    existsImpl: so('index.lock'),
    statImpl: () => { throw new Error('EACCES'); },
    rmImpl: () => { removeu = true; },
    agora: AGORA,
  });
  assert.equal(r.ok, false);
  assert.equal(removeu, false, 'sem prova de idade, nao se toca');
});

test('o publicador verifica o vault ANTES de lhe tocar', () => {
  // Se o guarda corresse depois do `git add`, ja teria sujado o repositorio.
  const fonte = fs.readFileSync(new URL('./beacon-publisher.mjs', import.meta.url), 'utf8');
  const iEstado = fonte.indexOf('estadoDoVault(vaultDir,');
  const iAdd = fonte.indexOf("['add', '--'");
  assert.ok(iEstado > 0 && iAdd > 0);
  assert.ok(iEstado < iAdd, 'a verificacao tem de vir antes de qualquer escrita');
});

// ── RAIO DE ACCAO e a chave de deploy (M10) ─────────────────────────────────
//
// Ate 2026-09-01 o `ficheiroRel` vinha de fora e nao era verificado: este
// modulo, que corre sozinho de 10 em 10 minutos, podia commitar QUALQUER
// caminho do vault PESSOAL do dono. Nunca o fez — e essa nao e a questao. A
// defesa "mas ele so passa beacons" era uma convencao de chamada, nao uma trava.

const { dentroDaPasta, modoDeploy, PASTA_DOS_BEACONS, PASTA_ISOLADA } =
  await import('./beacon-publisher.mjs');

test('RAIO: um caminho fora da pasta dos beacons e recusado', () => {
  const g = gitFalso();
  for (const mau of [
    '00-core/reasoning-protocol.md',
    '40-strategy/2026-08-25-pitch.md',
    '../fora-do-vault.json',
    '50-fleet/../00-core/segredo.json',
    '/etc/passwd',
  ]) {
    const r = publicarBeacon('/vault', mau, { runImpl: g.run, existsImpl: existeSempre, env: {} });
    assert.equal(r.ok, false, `deixou passar ${mau}`);
    assert.match(r.porque, /está fora de/, mau);
  }
});

test('RAIO: e só ficheiros .json — o vault do dono é markdown', () => {
  assert.equal(dentroDaPasta('50-fleet/mac.json'), true);
  assert.equal(dentroDaPasta('50-fleet/notas.md'), false);
  assert.equal(dentroDaPasta(''), false);
  assert.equal(dentroDaPasta(null), false);
});

test('a pasta por omissão continua a ser a que os beacons já usam', () => {
  assert.equal(PASTA_DOS_BEACONS, '50-fleet/');
  assert.equal(PASTA_ISOLADA, '50-fleet/90-beacons/');
});

test('DESLIGADO por omissão — a activação é ata do dono', () => {
  assert.equal(modoDeploy({}).ligado, false);
  assert.equal(modoDeploy({ MOO_BEACON_PUSH: '0' }).ligado, false);
});

test('FAIL-CLOSED: pedir o modo sem chave NÃO cai para as credenciais do dono', () => {
  const semChave = modoDeploy({ MOO_BEACON_PUSH: '1' });
  assert.equal(semChave.ligado, false);
  assert.equal(semChave.erro, true);
  assert.match(semChave.porque, /sem MOO_BEACON_CHAVE/);

  const chaveFantasma = modoDeploy(
    { MOO_BEACON_PUSH: '1', MOO_BEACON_CHAVE: '/nao/existe' },
    { existsImpl: () => false },
  );
  assert.equal(chaveFantasma.ligado, false);
  assert.equal(chaveFantasma.erro, true);
});

test('e um modo pedido sem chave RECUSA a publicação — não publica na mesma', () => {
  const g = gitFalso();
  const r = publicarBeacon('/vault', '50-fleet/mac.json', {
    runImpl: g.run, existsImpl: existeSempre, env: { MOO_BEACON_PUSH: '1' },
  });
  assert.equal(r.ok, false);
  assert.match(r.porque, /MOO_BEACON_CHAVE/);
});

test('com chave: `IdentitiesOnly` — senão o ssh oferece a identidade pessoal primeiro', () => {
  const m = modoDeploy(
    { MOO_BEACON_PUSH: '1', MOO_BEACON_CHAVE: '/k/beacon' },
    { existsImpl: () => true },
  );
  assert.equal(m.ligado, true);
  assert.match(m.env.GIT_SSH_COMMAND, /-i \/k\/beacon/);
  assert.match(m.env.GIT_SSH_COMMAND, /IdentitiesOnly=yes/);
});

test('com o modo ligado, a pasta APERTA para a isolada', () => {
  const g = gitFalso();
  const comum = { runImpl: g.run, existsImpl: existeSempre, env: { MOO_BEACON_PUSH: '1', MOO_BEACON_CHAVE: '/k' } };
  const fora = publicarBeacon('/vault', '50-fleet/mac.json', comum);
  assert.equal(fora.ok, false);
  assert.match(fora.porque, /90-beacons/);
});

test('o GIT_SSH_COMMAND chega MESMO ao git — uma chave que não viaja não protege nada', () => {
  const chamadas = [];
  const run = (bin, args, opts) => {
    chamadas.push({ args, env: opts && opts.env });
    if (args[0] === 'remote') return 'origin\n';
    if (args[0] === 'diff') return chamadas.length > 3 ? '50-fleet/90-beacons/mac.json\n' : '';
    return '';
  };
  const r = publicarBeacon('/vault', '50-fleet/90-beacons/mac.json', {
    runImpl: run, existsImpl: existeSempre,
    env: { MOO_BEACON_PUSH: '1', MOO_BEACON_CHAVE: '/k/beacon' },
  });
  assert.equal(r.ok, true, r.porque);
  assert.equal(r.via, 'chave-de-deploy');
  const push = chamadas.find((c) => c.args[0] === 'push');
  assert.ok(push, 'não houve push');
  assert.match(push.env.GIT_SSH_COMMAND, /IdentitiesOnly=yes/,
    'o push seguiu sem a chave — ia com a identidade do dono');
});
