/**
 * self-check.test.mjs
 *
 * O dono disse, e tinha razao: "nao vi nada de melhorias ou alertas". Nove
 * defeitos reais num dia — o ledger sem rotacao, o indice do vault de ha 21
 * dias, dois ficheiros a discordar sobre o projecto activo — e o painel calado
 * o tempo todo. Nao era falta de defeitos: era falta de quem olhasse.
 *
 * Nenhum deles precisava de um modelo. Um `stat` e uma comparacao chegavam.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  verLedger, verIndiceDoVault, verBeacon, verProjectoActivo, verPreferencias,
  autoVerificar, LEDGER_TECTO_MB, BEACON_VELHO_MIN,
  provaDePublicacao, JANELA_DO_PUBLICADOR_MIN,
  verCodigo, verConector,
} from './self-check.mjs';

const MB = 1024 * 1024;

// ── a regra que faz isto valer alguma coisa ─────────────────────────────────

test('todo o alerta traz o GESTO que o resolve', () => {
  // Um alerta que nao diz COMO se resolve e uma queixa. Isto e a diferenca
  // entre um painel que ajuda e um painel que aponta o dedo.
  const maus = [
    verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: (LEDGER_TECTO_MB + 5) * MB }) }),
    verIndiceDoVault('/v', { statImpl: () => { throw new Error('ENOENT'); } }),
    verBeacon('/b', { statImpl: () => { throw new Error('ENOENT'); } }),
    verPreferencias('/m', { existsImpl: () => false }),
  ];
  for (const m of maus) {
    assert.notEqual(m.estado, 'ok');
    assert.ok(m.resolver && String(m.resolver).length > 5, `${m.id} avisa e nao diz como resolver`);
    assert.ok(m.porque && m.porque.length > 10, `${m.id} nao explica porque importa`);
  }
});

test('o que nao se consegue medir e n/d, NUNCA ok', () => {
  // Um verde por ignorancia e pior do que um vermelho: convida a confiar.
  assert.equal(verLedger({ LEDGER: '/x' }, { statImpl: () => { throw new Error('ENOENT'); } }).estado, 'n/d');
  assert.equal(verIndiceDoVault(null).estado, 'n/d');
  assert.equal(verProjectoActivo('/m', { readImpl: () => { throw new Error('ENOENT'); } }).estado, 'n/d');
});

// ── cada verificacao, contra o defeito real que a fez nascer ────────────────

test('o ledger acima do tecto e MAU, e nao um aviso', () => {
  const ok = verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: 1 * MB }) });
  assert.equal(ok.estado, 'ok');
  const mau = verLedger({ LEDGER: '/x' }, { statImpl: () => ({ size: (LEDGER_TECTO_MB + 1) * MB }) });
  assert.equal(mau.estado, 'mau', 'passar o tecto quer dizer que a rotacao nao correu — isso nao e um detalhe');
});

test('ficheiros mais novos que o indice do vault sao invisiveis, e ve-se', () => {
  // Medido a 2026-08-19: 60 de 448 (13%) estavam fora do indice, ha 21 dias.
  const emDia = verIndiceDoVault('/v', { statImpl: () => ({ mtimeMs: 1000 }), listarImpl: () => 0 });
  assert.equal(emDia.estado, 'ok');
  const atras = verIndiceDoVault('/v', { statImpl: () => ({ mtimeMs: 1000 }), listarImpl: () => 60 });
  assert.equal(atras.estado, 'aviso');
  assert.match(atras.valor, /60/);
  assert.match(atras.resolver, /build-index/);
});

test('escrever o beacon NAO e publica-lo, e o painel di-lo', () => {
  const agora = 1_760_000_000_000;
  const desligado = verBeacon('/b', { statImpl: () => ({ mtimeMs: agora }), agora, env: {} });
  assert.equal(desligado.estado, 'aviso');
  assert.match(desligado.porque, /NÃO publicado/);
  assert.match(desligado.resolver, /MOO_PUBLICAR_BEACON/);

  // Esta asserção dizia `ok` — e era ELA que fixava o defeito. O título do teste
  // já dizia a verdade ("escrever NÃO é publicá-lo") e a asserção dizia o
  // contrário: dava por publicado o que só estava escrito, a partir de uma
  // variável de ambiente e de um mtime. Sem git que o prove, a resposta honesta
  // é `n/d` — a mesma regra que o `verCodigo` aplica ao remoto.
  const ligado = verBeacon('/b', { statImpl: () => ({ mtimeMs: agora }), agora, env: { MOO_PUBLICAR_BEACON: '1' } });
  assert.equal(ligado.estado, 'n/d', 'ligado + escrito nao prova que saiu daqui');

  const velho = verBeacon('/b', {
    statImpl: () => ({ mtimeMs: agora - (BEACON_VELHO_MIN + 5) * 60000 }),
    agora, env: { MOO_PUBLICAR_BEACON: '1' },
  });
  assert.equal(velho.estado, 'mau', 'ligado e parado e pior do que desligado — parece que funciona');
});

test('dois ficheiros a discordar sobre o projecto activo e MAU', () => {
  // Medido: `cowork-session.json` dizia mooter-pilar-coerencia e
  // `sessoes/mooter.json` dizia mooter-gpu-local-strategy. Quem ler primeiro
  // decide, e isso e sorte.
  const ler = (mapa) => (p) => {
    for (const [k, v] of Object.entries(mapa)) if (String(p).includes(k)) return JSON.stringify(v);
    throw new Error('ENOENT');
  };
  const iguais = verProjectoActivo('/m', { readImpl: ler({ 'cowork-session': { project: 'x' }, 'sessoes': { projecto: 'x' } }) });
  assert.equal(iguais.estado, 'ok');
  const dif = verProjectoActivo('/m', { readImpl: ler({ 'cowork-session': { project: 'a' }, 'sessoes': { projecto: 'b' } }) });
  assert.equal(dif.estado, 'mau');
  assert.match(dif.valor, /a ≠ b/);
});

// ── o agregado ──────────────────────────────────────────────────────────────

test('uma verificacao que rebenta vira n/d, nunca derruba o alarme', () => {
  // O alarme nao pode ser a coisa que parte.
  const r = autoVerificar({ paths: null, mooDir: null, vaultDir: null, beaconFile: null });
  assert.ok(Array.isArray(r.itens) && r.itens.length >= 5);
  assert.ok(['ok', 'aviso', 'mau', 'n/d'].includes(r.pior));
});

test('o pior estado manda — um mau nao se esconde atras de quatro oks', () => {
  const r = autoVerificar({ paths: { LEDGER: '/x' }, mooDir: '/m', vaultDir: null, beaconFile: null });
  const temMau = r.itens.some((i) => i.estado === 'mau');
  if (temMau) assert.equal(r.pior, 'mau', 'o agregado tem de doer tanto como o pior item');
});

// ── o preflight de um device novo (2026-08-19) ──────────────────────────────

/**
 * Um device novo falha sempre pelas mesmas quatro coisas — codigo antigo,
 * conector de outra versao, vault por montar, beacon que nao publica — e
 * NENHUMA grita. Todas dao um sintoma que parece outra coisa, e passa-se uma
 * hora a debugar o sintoma errado.
 */
test('codigo atrasado e MAU, e diz quantos commits', () => {
  const emDia = verCodigo('/r', { runImpl: () => '0' });
  assert.equal(emDia.estado, 'ok');
  const atras = verCodigo('/r', { runImpl: () => '7' });
  assert.equal(atras.estado, 'mau');
  assert.match(atras.valor, /7 commits/);
  assert.match(atras.resolver, /git pull/);
});

test('sem upstream, cai para origin/main antes de desistir', () => {
  // `n/d` era a resposta honesta e tambem a inutil: quem trabalha num ramo sem
  // upstream ficava sem saber se estava a correr codigo velho.
  let vez = 0;
  const r = verCodigo('/r', { runImpl: () => { if (vez++ === 0) throw new Error('no upstream'); return '3'; } });
  assert.equal(r.estado, 'mau');
  assert.match(r.valor, /3 commits/);
});

/**
 * Um `readFileSync` falso que distingue os DOIS manifests em jogo — o do repo e
 * o da extensão instalada. O falso antigo devolvia o mesmo para qualquer caminho
 * com "manifest", e por isso deixou de servir quando o verificador passou a ler
 * o artefacto instalado além do registo.
 */
const disco = ({ repo = null, extensao = null, registo = null } = {}) => (p) => {
  const s = String(p).replace(/\\/g, '/');
  if (s.includes('mooter-bridge/manifest.json') && repo) return JSON.stringify(repo);
  if (s.includes('Claude Extensions/') && s.endsWith('manifest.json') && extensao) return JSON.stringify(extensao);
  if (s.includes('extensions-installations') && registo) return JSON.stringify(registo);
  throw new Error('ENOENT');
};
const registoCom = (v) => ({ extensions: { 'local.mcpb.x.mooter': { version: v, id: 'mooter' } } });

test('o conector instalado tem de ser o do repo', () => {
  const igual = verConector('/r', {
    readImpl: disco({ repo: { version: '1.49.3' }, extensao: { version: '1.49.3' } }),
  });
  assert.equal(igual.estado, 'ok');

  const dif = verConector('/r', {
    readImpl: disco({ repo: { version: '1.49.3' }, extensao: { version: '1.33.0' } }),
  });
  assert.equal(dif.estado, 'mau');
  assert.match(dif.valor, /1\.33\.0 instalado ≠ 1\.49\.3/);
  assert.match(dif.resolver, /v1\.49\.3/, 'o gesto tem de nomear a versao a instalar');
});

test('o MANIFEST instalado ganha ao registo — o registo fica stale', () => {
  // O caso real, medido a 2026-08-23: o `extensions-installations.json` tinha
  // mtime de 31/07 e dizia 1.29.1; o manifest da extensao, de 21/08, dizia
  // 1.49.3. O verificador exigia ha um mes um gesto que ja tinha sido feito.
  const r = verConector('/r', {
    readImpl: disco({
      repo: { version: '1.49.3' },
      extensao: { version: '1.49.3' },
      registo: registoCom('1.29.1'),
    }),
  });
  assert.equal(r.estado, 'ok', 'o artefacto e a prova; o registo e o que alguem disse que fez');
  assert.equal(r.valor, '1.49.3');
});

test('sem o manifest da extensao, o registo serve de plano B', () => {
  const r = verConector('/r', {
    readImpl: disco({ repo: { version: '1.49.3' }, registo: registoCom('1.33.0') }),
  });
  assert.equal(r.estado, 'mau', 'sem artefacto, o registo ainda vale mais que o silencio');
  assert.match(r.valor, /1\.33\.0 instalado/);
});

test('sem NENHUMA prova, e n/d — nunca ok', () => {
  const r = verConector('/r', { readImpl: disco({ repo: { version: '1.0.0' } }) });
  assert.equal(r.estado, 'n/d', 'nao encontrar prova nenhuma nao prova que esta alinhado');
});

test('o lancamento corre o preflight e nunca bloqueia por causa dele', () => {
  const fonte = fs.readFileSync(new URL('./launch.mjs', import.meta.url), 'utf8');
  assert.match(fonte, /autoVerificar\(/, 'o lancamento tem de verificar o alinhamento');
  assert.match(fonte, /ALINHAMENTO/, 'e tem de o mostrar ao dono');
  // Informa, nao bloqueia: um preflight que impede o arranque e pior do que
  // nenhum, porque a primeira coisa que se faz e desliga-lo.
  const bloco = /const saude = autoVerificar\(\{[\s\S]*?\n  \} catch/.exec(fonte);
  assert.ok(bloco, 'o preflight tem de estar dentro de um try');
  assert.doesNotMatch(bloco[0], /process\.exit/, 'o preflight informa, nao bloqueia');
});

// ── verBeacon: escrever nao e publicar, mas cadencia tambem nao e falha ────
// Duas correccoes no mesmo dia. A 1a: `ok · "escrito e a publicar"` saia de uma
// variavel de ambiente + mtime, sem tocar no git. A 2a (esta): a 1a tratava
// qualquer ficheiro sujo como aviso, e o publicador commita de 10 em 15 min
// enquanto o runner reescreve o ficheiro a cada ronda — o aviso dispararia quase
// sempre. Trocar um `ok` falso por um alarme falso nao corrige nada.
// A pergunta certa e a IDADE DO ULTIMO COMMIT.
//
// A 3a (issue #374): o `por-empurrar` tinha a MESMA forma de erro que a 1a, num
// intervalo mais curto. Duas causas, ambas trancadas aqui:
//   · a pergunta era `rev-list --count @{u}..HEAD` — sobre o REPO, nao sobre o
//     beacon: um commit do dono por empurrar dizia que o beacon nao saira;
//   · o publicador faz commit -> pull --rebase -> push, e nessa janela existe
//     mesmo um commit por empurrar. Medido: commit 08:51:01, push 08:51:06.
// O discriminador e a idade do commit MAIS ANTIGO por publicar (ver mais baixo
// o teste do publicador avariado, que e o que obriga a ser o mais antigo).

const gitFalso = (respostas) => (args) => {
  const cmd = args.join(' ');
  for (const [k, v] of Object.entries(respostas)) {
    if (cmd.includes(k)) { if (v instanceof Error) throw v; return v; }
  }
  throw new Error('ENOENT');
};
const AGORA = 1_760_000_000_000;
const haMin = (n) => String(Math.floor((AGORA - n * 60000) / 1000));
const fresco = () => ({ mtimeMs: AGORA });
const ligado = { MOO_PUBLICAR_BEACON: '1' };
/** `git log <range> --format=%ct -- <beacon>`: do mais recente para o mais antigo. */
const porPublicar = (...minutos) => minutos.map(haMin).join('\n');

test('verBeacon: ficheiro sujo entre publicacoes e CADENCIA — continua ok', () => {
  // O caso normal e permanente: commit ha 2 min, ficheiro reescrito desde entao.
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': haMin(2), 'log @{u}..HEAD': '' }),
  });
  assert.equal(r.estado, 'ok', 'um aviso aqui dispararia quase sempre e seria ignorado');
  assert.match(r.valor, /publicado há 2 min/);
});

test('verBeacon: sem commitar ha mais tempo que o limiar, o publicador parou', () => {
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': haMin(BEACON_VELHO_MIN + 10), 'log @{u}..HEAD': '' }),
  });
  assert.equal(r.estado, 'mau');
  assert.match(r.porque, /a frota vê um estado velho/);
});

test('verBeacon: nunca commitado e o pior caso — a frota e um device so', () => {
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': '' }),
  });
  assert.equal(r.estado, 'mau');
  assert.match(r.porque, /nunca foi commitado/);
});

test('verBeacon: por empurrar ha mais do que a cadencia do publicador e aviso', () => {
  // Uma passagem inteira do publicador passou e o commit continua ca. Aqui o
  // gesto E do dono, e este aviso NAO pode enfraquecer: foi ganho com ~20h de
  // rebase encravado no vault em que este verificador dizia `ok`.
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': haMin(1), 'log @{u}..HEAD': porPublicar(1, JANELA_DO_PUBLICADOR_MIN + 5) }),
  });
  assert.equal(r.estado, 'aviso');
  assert.match(r.porque, /não o empurrou/);
  assert.match(r.resolver, /push/, 'um alerta sem o gesto exacto e uma queixa');
});

// ── issue #374: o falso alarme que mandava correr um push ja dado ───────────

test('verBeacon: DENTRO da janela do publicador nao pede gesto nenhum ao dono', () => {
  // O caso medido: commit 08:51:01, aviso impresso, push 08:51:06. O `launch.mjs`
  // e o disparador mais provavel de todos — arranca o loop e verifica logo a
  // seguir, portanto apanha a janela quase de proposito. O dono corria o
  // `git push` sugerido e recebia `Everything up-to-date`.
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': haMin(0), 'log @{u}..HEAD': porPublicar(0) }),
  });
  assert.equal(r.estado, 'n/d', 'nao e `ok` (nao saiu daqui) nem `aviso` (nenhum gesto do dono resolve)');
  assert.equal(r.resolver, null, 'e o `launch.mjs` so poe em "FALTA O TEU GESTO" o que tem estado mau ou aviso');
  assert.match(r.porque, /publicador/);
});

test('verBeacon: publicador AVARIADO nao se esconde atras do commit mais recente', () => {
  // O teste que obriga o discriminador a ser o commit MAIS ANTIGO por publicar.
  // Um publicador que commita e falha o push a cada passagem deixa sempre um
  // commit de segundos atras; com o mais recente, ficaria mudo para sempre —
  // trocariamos um alarme falso por um silencio falso, que e pior.
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: gitFalso({ 'log -1': haMin(0), 'log @{u}..HEAD': porPublicar(0, 10, 20, 25) }),
  });
  assert.equal(r.estado, 'aviso', 'o mais antigo tem 25 min: uma passagem inteira falhou');
  assert.match(r.valor, /25 min/);
});

test('verBeacon: trabalho do DONO por empurrar no vault nao acusa o beacon', () => {
  // A outra metade do #374. `rev-list --count @{u}..HEAD` contava QUALQUER
  // commit a frente do remoto: um commit do dono no vault (uma nota, um
  // ficheiro de canon) fazia isto declarar o beacon por publicar, com o beacon
  // ja la. O `-- <ficheiro>` isola a pergunta.
  let viuOFicheiro = false;
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: (args) => {
      const cmd = args.join(' ');
      if (cmd.includes('log -1')) return haMin(3);
      if (cmd.includes('log @{u}..HEAD')) {
        viuOFicheiro = args.includes('/v/50-fleet/x.json') && args.includes('--');
        return '';               // nenhum commit DO BEACON por publicar
      }
      throw new Error('ENOENT');
    },
  });
  assert.equal(viuOFicheiro, true, 'a pergunta tem de ser sobre o beacon, nao sobre o repo');
  assert.equal(r.estado, 'ok');
});

test('provaDePublicacao: sem os dois ranges responder, e null — nunca `publicado`', () => {
  // `null` NUNCA vira `ok`: e a regra do cabecalho deste ficheiro, e o caminho
  // novo tem de a cumprir tambem.
  const r = provaDePublicacao('/v/50-fleet/x.json', {
    agora: AGORA,
    gitImpl: gitFalso({ 'log -1': haMin(2) }),   // os ranges rebentam
  });
  assert.equal(r.estado, null);
  assert.equal(r.minPorPublicar, null);
});

test('verBeacon: sem git que responda e n/d — NUNCA ok', () => {
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: ligado,
    gitImpl: () => { throw new Error('nao e um repositorio git'); },
  });
  assert.equal(r.estado, 'n/d');
  assert.equal(r.resolver, null);
});

test('verBeacon: com a publicacao DESLIGADA avisa sem consultar o git', () => {
  let tocou = false;
  const r = verBeacon('/v/50-fleet/x.json', {
    statImpl: fresco, agora: AGORA, env: {},
    gitImpl: () => { tocou = true; return ''; },
  });
  assert.equal(r.estado, 'aviso');
  assert.equal(tocou, false, 'sem publicacao ligada nao ha nada que o git possa provar');
});
