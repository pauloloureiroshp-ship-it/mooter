/**
 * sync-cockpit.test.mjs — o canal de distribuicao que nao existia, e o guarda
 * que gritava sempre.
 *
 * Medido a 2026-08-18: nada fora de `tools/cockpit/` importa o cockpit, o
 * `/mooter-update` nao o sincroniza, e o LaunchAgent aponta direto para dentro
 * do checkout. Estes testes prendem as duas metades: o espelho tem de estar
 * completo, E tem de ser prova real que diz o que a maquina corre.
 *
 * Medido a 2026-08-22, na maquina do dono (Windows 11): o self-check imprimia
 * `espelho: 32/32 em dia` e a seguir `AVISO ... nada o corre`, com DOIS
 * processos vivos do cockpit a correr do checkout. Ia procurar um plist em
 * `~/Library/LaunchAgents/` — caminho que so existe em macOS. Vermelho eterno,
 * e falso: em Windows era estruturalmente impossivel de passar.
 *
 * TUDO AQUI E SINTETICO. Nenhum teste olha para processos, lancadores ou
 * ficheiros reais desta maquina — um teste ancorado no estado da maquina passa
 * no portatil de quem o escreveu e nao prova nada em lado nenhum.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ficheirosCanonicos, planear, espelhar, selfCheck, alvoDoLancador, destinoPadrao,
  partirLinhaDeComando, caminhosDeRunner, classificarCaminho, raizesDeCheckout,
  lerProcessos, PROCESSOS_DO_COCKPIT,
} from './sync-cockpit.mjs';

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `moo-sync-${n}-`));

function origemFalsa() {
  const d = tmp('src');
  fs.writeFileSync(path.join(d, 'moo-runner.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(d, 'runner-core.mjs'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(d, 'runner-core.test.mjs'), 'test');
  fs.writeFileSync(path.join(d, 'leia-me.txt'), 'nao e codigo');
  return d;
}

/**
 * Um cenario completo: origem espelhada, e as duas provas sob controlo. Nada
 * aqui toca em processos, lancadores ou ficheiros reais da maquina.
 */
function cenario(base = {}) {
  const src = origemFalsa();
  const dest = tmp('dest');
  const checkout = tmp('checkout');
  const shell = path.join(src, 'nao-existe.html');
  espelhar(planear(src, dest, shell));

  const correr = (extra = {}) => {
    const cfg = { ok: true, linhas: [], lancador: { onde: 'lancador falso', caminhos: [], ausente: true }, ...base, ...extra };
    return selfCheck({
      origem: src,
      dest,
      shell,
      checkout,
      raizesCheckout: [checkout],
      plataforma: cfg.plataforma || 'linux',
      processos: () => ({ ok: cfg.ok, linhas: cfg.linhas, erro: cfg.ok ? undefined : 'ps falhou' }),
      lancador: typeof cfg.lancador === 'function' ? cfg.lancador : () => cfg.lancador,
    });
  };
  return { src, dest, checkout, shell, correr };
}

const comandoPara = (raiz, mod = 'moo-runner.mjs') =>
  `/usr/bin/node ${path.join(raiz, 'tools', 'cockpit', 'runner', mod)}`;

// ---------------------------------------------------------------------------
// Espelhar (inalterado — continua a ser metade do trabalho)
// ---------------------------------------------------------------------------

test('os testes NAO viajam para o runtime', () => {
  const nomes = ficheirosCanonicos(origemFalsa()).map((f) => path.basename(f.abs));
  assert.deepEqual(nomes, ['moo-runner.mjs', 'runner-core.mjs'],
    'testes sao a prova de que o codigo esta bem, nao parte do que corre');
});

test('espelhar e idempotente e nunca apaga', () => {
  const src = origemFalsa();
  const dest = tmp('dest');
  const shell = path.join(src, 'nao-existe.html');
  assert.equal(espelhar(planear(src, dest, shell)).length, 2, 'primeira vez copia tudo');
  assert.equal(espelhar(planear(src, dest, shell)).length, 0, 'segunda vez nao mexe em nada');

  fs.writeFileSync(path.join(src, 'moo-runner.mjs'), 'export const a = 99;\n');
  const seg = espelhar(planear(src, dest, shell));
  assert.equal(seg.length, 1, 'so o que mudou volta a viajar');
  assert.ok(fs.existsSync(path.join(dest, 'runner', 'moo-runner.mjs.bak')),
    'um espelho nunca pode ser a unica copia');

  fs.writeFileSync(path.join(dest, 'runner', 'extra-do-utilizador.mjs'), 'meu');
  espelhar(planear(src, dest, shell));
  assert.ok(fs.existsSync(path.join(dest, 'runner', 'extra-do-utilizador.mjs')), 'aditivo: nunca apaga');
});

test('--dry-run nao escreve uma unica linha', () => {
  const src = origemFalsa();
  const dest = tmp('dry');
  espelhar(planear(src, dest, path.join(src, 'x.html')), { dryRun: true });
  assert.equal(fs.existsSync(path.join(dest, 'runner')), false);
});

test('o destino fica ao lado do espelho do router que ja existe', () => {
  assert.equal(destinoPadrao('/h'), path.join('/h', '.claude', 'tools', 'cockpit'));
});

// ---------------------------------------------------------------------------
// Ler a prova: caminhos, aspas, plataformas
// ---------------------------------------------------------------------------

test('um caminho com espacos no nome do utilizador sobrevive as aspas', () => {
  // `C:\Users\Paulo Loureiro\...` e o caso real desta maquina: partir por
  // espacos sem respeitar aspas partia o caminho ao meio e perdia o processo.
  const linha = '"C:\\Program Files\\nodejs\\node.exe" '
    + '"C:\\Users\\Paulo Loureiro\\frugal\\tools\\cockpit\\runner\\moo-runner.mjs"';
  assert.deepEqual(partirLinhaDeComando(linha), [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Users\\Paulo Loureiro\\frugal\\tools\\cockpit\\runner\\moo-runner.mjs',
  ]);
  assert.deepEqual(caminhosDeRunner(linha),
    ['C:\\Users\\Paulo Loureiro\\frugal\\tools\\cockpit\\runner\\moo-runner.mjs']);
});

test('so os modulos do cockpit contam como prova', () => {
  assert.deepEqual(caminhosDeRunner('/usr/bin/node /x/tools/cockpit/runner/triagem.mjs'), [],
    'um utilitario de um disparo so nao prova que o cockpit esta a correr');
  assert.equal(caminhosDeRunner(comandoPara('/repo')).length, 1);
  assert.equal(caminhosDeRunner(comandoPara('/repo', 'f10-server.mjs')).length, 1);
  assert.deepEqual(PROCESSOS_DO_COCKPIT, ['moo-runner.mjs', 'f10-server.mjs']);
});

test('o Windows dobra maiusculas e barras; o POSIX nao', () => {
  const win = 'C:\\Repo\\tools\\cockpit\\runner\\moo-runner.mjs';
  assert.equal(classificarCaminho([win], { raizesCheckout: ['c:/repo'], foldCase: true }).classe, 'checkout');
  assert.equal(classificarCaminho([win], { raizesCheckout: ['c:/repo'], foldCase: false }).classe, 'outro',
    'em POSIX maiusculas sao outro caminho, e fingir o contrario e inventar');
});

test('`/repo` nao engole `/repo-old` — a fronteira e um separador, nao um prefixo', () => {
  const c = classificarCaminho(['/repo-old/tools/cockpit/runner/moo-runner.mjs'], {
    raizesCheckout: ['/repo'], foldCase: false,
  });
  assert.equal(c.classe, 'outro', 'uma copia velha ao lado do repo E uma copia estranha');
});

test('caminho relativo da n/d, nunca "outro" — a acusacao mais grave exige a prova mais forte', () => {
  const c = classificarCaminho(caminhosDeRunner('node tools/cockpit/runner/moo-runner.mjs'), {
    destAbs: '/espelho', raizesCheckout: ['/repo'], foldCase: false,
  });
  assert.equal(c.classe, 'n/d');
  assert.equal(c.caminho, 'tools/cockpit/runner/moo-runner.mjs');
});

test('o worktree principal conta como este repo', () => {
  // Um `git worktree` e o mesmo checkout noutra pasta. Sem isto, qualquer
  // sessao numa branch punha o guarda vermelho.
  const raizes = raizesDeCheckout(path.join('/repo', '.claude', 'worktrees', 'wt-1'),
    () => `${path.join('/repo', '.git')}\n`);
  assert.equal(raizes.length, 2);
  assert.equal(raizes[1], path.resolve('/repo'));
});

test('sem git, o checkout local basta — degrada, nao rebenta', () => {
  const raizes = raizesDeCheckout('/repo', () => { throw new Error('git: not found'); });
  assert.deepEqual(raizes, [path.resolve('/repo')]);
});

test('lerProcessos nunca lanca — devolve ok:false e a razao', () => {
  const r = lerProcessos({ plataforma: 'linux', execImpl: () => { throw new Error('ps ausente'); } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.linhas, []);
  assert.match(r.erro, /ps ausente/);
});

// ---------------------------------------------------------------------------
// O lancador, no sitio certo de CADA sistema
// ---------------------------------------------------------------------------

test('em Windows procura a tarefa agendada e NUNCA o plist de macOS', () => {
  // Este era o defeito: `~/Library/LaunchAgents/` nao existe em Windows, logo
  // o check era estruturalmente impossivel de passar.
  const la = alvoDoLancador({
    plataforma: 'win32',
    readImpl: () => { throw new Error('ninguem devia ler ficheiros em Windows'); },
    execImpl: () => 'TaskName: \\MooterRunner\nTask To Run: node C:\\repo\\tools\\cockpit\\runner\\moo-runner.mjs\n',
  });
  assert.equal(la.tipo, 'schtasks');
  assert.deepEqual(la.caminhos, ['C:\\repo\\tools\\cockpit\\runner\\moo-runner.mjs']);
});

test('em Windows o caminho e lido da saida toda — o rotulo do schtasks e traduzido', () => {
  const la = alvoDoLancador({
    plataforma: 'win32',
    execImpl: () => 'Tarefa a Executar: node C:\\repo\\tools\\cockpit\\runner\\moo-runner.mjs\n',
  });
  assert.deepEqual(la.caminhos, ['C:\\repo\\tools\\cockpit\\runner\\moo-runner.mjs'],
    'ancorar no rotulo partia num Windows em portugues');
});

test('schtasks a sair !=0 e "nao instalada"; schtasks ausente e "nao se sabe"', () => {
  const naoExiste = alvoDoLancador({
    plataforma: 'win32',
    execImpl: () => { const e = new Error('cannot find the file'); e.status = 1; throw e; },
  });
  assert.equal(naoExiste.ausente, true);
  assert.ok(!naoExiste.indeterminado, 'o schtasks respondeu: a tarefa nao existe');

  const semBinario = alvoDoLancador({
    plataforma: 'win32',
    execImpl: () => { const e = new Error('spawn ENOENT'); e.code = 'ENOENT'; throw e; },
  });
  assert.equal(semBinario.indeterminado, true, 'sem schtasks nao ha como inspeccionar o arranque');
});

test('em macOS continua a ler o plist', () => {
  const home = tmp('home-mac');
  fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'Library', 'LaunchAgents', 'ai.mooter.runner.plist'),
    '<plist><array><string>/usr/bin/node</string>'
    + '<string>/Users/x/frugal/tools/cockpit/runner/moo-runner.mjs</string></array></plist>',
  );
  const la = alvoDoLancador({ plataforma: 'darwin', home });
  assert.deepEqual(la.caminhos, ['/Users/x/frugal/tools/cockpit/runner/moo-runner.mjs']);
  assert.equal(alvoDoLancador({ plataforma: 'darwin', home: tmp('vazio') }).ausente, true);
});

test('numa plataforma sem receita de arranque, a resposta e n/d — nao "nada"', () => {
  const la = alvoDoLancador({ plataforma: 'freebsd' });
  assert.equal(la.indeterminado, true);
  assert.match(la.motivo, /freebsd/);
});

// ---------------------------------------------------------------------------
// selfCheck: a prova viva manda
// ---------------------------------------------------------------------------

test('REGRESSAO 2026-08-22: Windows sem lancador mas com o cockpit vivo do checkout PASSA', () => {
  // O bug medido: `espelho: 32/32 em dia` seguido de `AVISO ... nada o corre`,
  // com moo-runner.mjs e f10-server.mjs vivos a partir do checkout. Nao havia
  // (nem ha) tarefa agendada nesta maquina — os processos foram levantados a
  // mao. "Nada o corre" era falso, e um guarda cronicamente vermelho e um
  // guarda que se ignora.
  const c = cenario({ lancador: { onde: 'tarefa agendada MooterRunner', caminhos: [], ausente: true } });
  const r = c.correr({
    plataforma: 'win32',
    linhas: [
      `"C:\\Program Files\\nodejs\\node.exe" "${path.join(c.checkout, 'tools/cockpit/runner/moo-runner.mjs')}"`,
      `"C:\\Program Files\\nodejs\\node.exe" "${path.join(c.checkout, 'tools/cockpit/runner/f10-server.mjs')}"`,
    ],
  });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  assert.equal(r.corre, 'checkout');
  assert.equal(r.evidencia, 'processo vivo');
  assert.equal(r.avisos.length, 0, 'nada de "nada o corre" com dois processos vivos a olhar para ele');
});

test('o processo vivo do ESPELHO e a configuracao que o espelho existe para produzir', () => {
  const c = cenario();
  const r = c.correr({ linhas: [comandoPara(c.dest).replace('/tools/cockpit/runner/', '/runner/')] });
  assert.equal(r.corre, 'espelho');
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
});

test('correr o CHECKOUT nao e um erro — e a configuracao certa de quem tem o repo', () => {
  // Num device que TEM o checkout, o checkout esta sempre em dia depois de um
  // `git pull` e o espelho so muda quando alguem corre o sync: apontar o
  // arranque ao espelho trocava frescura garantida por frescura manual — a
  // doenca que o `sync-hooks.js` existe para tratar.
  const c = cenario();
  const r = c.correr({ linhas: [comandoPara(c.checkout)] });
  assert.equal(r.corre, 'checkout');
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
});

test('ACEITACAO: a maquina a correr uma TERCEIRA copia NAO passa', () => {
  // Foi assim que o acumulador morreu 63 sessoes em silencio: o espelho dos
  // hooks estava impecavel e o settings.json apontava para outro sitio.
  const c = cenario();
  const r = c.correr({ linhas: [comandoPara(tmp('copia-velha'))] });
  assert.deepEqual(r.emFalta, [], 'o espelho esta completo');
  assert.equal(r.ok, false, 'e mesmo assim NAO passa — porque a maquina corre outra copia');
  assert.equal(r.corre, 'outro');
  assert.match(r.avisos.join(' '), /nem o espelho nem este checkout/);
});

test('havendo uma copia estranha viva, e ela que manda no veredicto', () => {
  const c = cenario();
  const r = c.correr({ linhas: [comandoPara(c.checkout), comandoPara(tmp('estranha'), 'f10-server.mjs')] });
  assert.equal(r.corre, 'outro', 'o caso perigoso nao pode ser abafado por um processo bom ao lado');
  assert.equal(r.ok, false);
});

test('o processo vivo ganha ao lancador — um lancador pode estar instalado e parado', () => {
  const c = cenario({
    lancador: { onde: 'plist', caminhos: [comandoPara(tmp('velha')).split(' ')[1]] },
  });
  const r = c.correr({ linhas: [comandoPara(c.dest).replace('/tools/cockpit/runner/', '/runner/')] });
  assert.equal(r.corre, 'espelho');
  assert.equal(r.evidencia, 'processo vivo', 'o que esta VIVO e prova mais forte do que um ficheiro de config');
});

test('sem nada vivo, o lancador responde — o cockpit pode estar legitimamente parado', () => {
  // Um STOP activo para o runner sem desinstalar o arranque. Nesse estado o
  // lancador e a unica prova que resta, e continua a valer.
  const c = cenario();
  const r = c.correr({
    linhas: [],
    lancador: () => ({
      onde: 'plist',
      caminhos: [path.join(c.checkout, 'tools', 'cockpit', 'runner', 'moo-runner.mjs')],
    }),
  });
  assert.equal(r.corre, 'checkout');
  assert.equal(r.evidencia, 'lancador');
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
});

test('espelho perfeito, nada vivo E nenhum lancador: continua a NAO passar', () => {
  // A licao das 63 sessoes mantem-se — mas agora a frase e verdadeira, porque
  // as DUAS provas foram procuradas antes de a dizer.
  const c = cenario();
  const r = c.correr({ linhas: [] });
  assert.deepEqual(r.emFalta, []);
  assert.equal(r.corre, 'nada');
  assert.equal(r.ok, false);
  assert.equal(r.evidencia, 'processos + lancador', 'so se afirma depois de procurar nos dois sitios');
  assert.match(r.avisos.join(' '), /nenhum lancador configurado/);
  assert.match(r.avisos.join(' '), /nada o corre/);
});

// ---------------------------------------------------------------------------
// n/d: nao saber nao e falhar — mas tambem nao se cala
// ---------------------------------------------------------------------------

test('sem forma de listar processos e sem lancador inspeccionavel, diz n/d e NAO falha', () => {
  const c = cenario({
    ok: false,
    lancador: { onde: 'sem receita', caminhos: [], indeterminado: true, motivo: 'plataforma sem lancador conhecido' },
  });
  const r = c.correr({});
  assert.equal(r.corre, 'n/d');
  assert.equal(r.ok, true, 'um guarda que falha por ignorancia treina-se a ser ignorado');
  assert.equal(r.avisos.length, 0);
  assert.match(r.notas.join(' '), /n\/d/);
  assert.ok(!/nada o corre/.test(r.notas.join(' ')), 'nunca afirmar "nada o corre" sem prova');
});

test('listar processos falhou, mas o lancador responde: vale o lancador', () => {
  const c = cenario({ ok: false });
  const r = c.correr({
    lancador: () => ({ onde: 'plist', caminhos: [path.join(c.dest, 'runner', 'moo-runner.mjs')] }),
  });
  assert.equal(r.corre, 'espelho');
  assert.equal(r.evidencia, 'lancador');
  assert.equal(r.ok, true);
});

test('listar processos falhou e o lancador nao existe: n/d, nao "nada"', () => {
  // Sem conseguir ver processos, "nada o corre" seria outra vez uma afirmacao
  // sem medicao — exactamente o defeito que este ficheiro veio corrigir.
  const c = cenario({ ok: false, lancador: { onde: 'tarefa agendada MooterRunner', caminhos: [], ausente: true } });
  const r = c.correr({});
  assert.equal(r.corre, 'n/d');
  assert.equal(r.ok, true);
  assert.match(r.notas.join(' '), /nao consegui listar processos/);
});

test('cockpit vivo mas por caminho relativo: n/d com nota, sem acusar ninguem', () => {
  const c = cenario();
  const r = c.correr({ linhas: ['node tools/cockpit/runner/moo-runner.mjs'] });
  assert.equal(r.corre, 'n/d');
  assert.equal(r.ok, true);
  assert.equal(r.avisos.length, 0);
  assert.match(r.notas.join(' '), /caminho relativo/);
});

test('um espelho incompleto falha na mesma, seja o que for que corra', () => {
  const src = origemFalsa();
  const dest = tmp('incompleto');
  const checkout = tmp('checkout-i');
  const r = selfCheck({
    origem: src,
    dest,
    shell: path.join(src, 'x.html'),
    checkout,
    raizesCheckout: [checkout],
    plataforma: 'linux',
    processos: () => ({ ok: true, linhas: [comandoPara(checkout)] }),
    lancador: () => ({ onde: 'plist', caminhos: [] }),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.emFalta.sort(), [path.join('runner', 'moo-runner.mjs'), path.join('runner', 'runner-core.mjs')]);
  assert.equal(r.corre, 'checkout', 'as duas metades sao independentes');
});
