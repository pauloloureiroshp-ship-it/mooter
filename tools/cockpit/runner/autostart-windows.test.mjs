/**
 * autostart-windows.test.mjs — o instalador do Windows tem de instalar, e tem
 * de falhar alto quando nao consegue.
 *
 * O defeito que estes testes mordem (medido 2026-09-10): o ramo `win32` do
 * `install()` imprimia o comando `schtasks` e saia com codigo 0. Nunca instalou
 * nada. No macOS o mesmo comando escrevia o plist e fazia `launchctl load`, por
 * isso a assimetria passou despercebida: quem corria `--install` no Windows via
 * texto, exit 0, e assumia trabalho feito -- enquanto o
 * `sync-cockpit.mjs --check` reprovava para sempre com "nenhum lancador
 * configurado", sem que correr o instalador outra vez mudasse coisa nenhuma.
 *
 * A PRIMEIRA versao destes testes nao mordia. Cobriam `instalarWindows()` (pura)
 * e depois faziam regex sobre o TEXTO de `install()`. Uma revisao adversarial
 * encontrou quatro mutacoes que passavam 7/7 deixando o instalador mentir:
 *
 *   1. `if (r.ok)` -> `if (true)`         exit 0, "instalada", nada instalado
 *   2. `naoInstalou = true; ...= false;`  exit 0 a imprimir "NAO INSTALADO"
 *   3. `runnerPath + ' --play'`           instala uma tarefa que levanta o STOP
 *   4. `runnerPath: pre.nodePath`         instala a tarefa errada
 *
 * Nenhuma era visivel por regex, porque a regex prende a forma e liberta o
 * comportamento. Por isso o ramo foi extraido para `ramoWindowsDoInstall()` e
 * e EXECUTADO aqui com um `runImpl` falso: as asercoes passam a ser sobre os
 * argumentos que o call-site realmente constroi.
 *
 * O QUE ISTO NAO FECHA, e o registo importa mais do que a promessa. Uma segunda
 * revisao adversarial correu depois desta reescrita e encontrou mutacoes NOVAS
 * que sobrevivem a suite inteira (1328 testes) -- entre elas fazer o `install()`
 * `return` cedo no ramo win32, ou forcar `instalou:true` no objecto devolvido:
 * as duas mantem as 4 regexes e as 3 atribuicoes do `MORDIDA 6` e ressuscitam o
 * defeito de origem. A `MORDIDA 6` continua a ser uma asercao de FORMA, e cai a
 * essas duas. Fechar isso a serio pede executar o proprio `install()` com um
 * `exitImpl` injectado e afirmar o codigo de saida -- nao esta feito.
 *
 * Portanto: estes testes mordem as 8 mutacoes abaixo, medidas uma a uma. Nao
 * mordem "a classe toda", e dizer que sim seria a mesma promessa por medir que
 * este ficheiro existe para desfazer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TASK_NAME, trDaTarefa, windowsArgs, windowsCommand,
  instalarWindows, desinstalarWindows, ramoWindowsDoInstall, preflight,
} from './autostart.mjs';

// O que importa nesta fixture e o ESPACO no caminho -- e o que faz o quoting do
// `/TR` render ou partir. O nome da pasta e irrelevante, e nao pode ser o nome
// antigo do produto: o portao de des-marcacao do CI proibe aumentar o numero de
// ficheiros de codigo vivo que o mencionam, e uma fixture conta como codigo
// vivo. (Este comentario tambem nao o pode nomear -- a primeira versao dele
// dizia-o e fazia disparar a guarda que estava a explicar.)
const REPO = 'C:\\Users\\Paulo Loureiro\\mooter';
const PRE = {
  ok: true,
  nodePath: 'C:\\Program Files\\nodejs\\node.exe',
  runnerPath: `${REPO}\\tools\\cockpit\\runner\\moo-runner.mjs`,
};
const ALVO = { nodePath: PRE.nodePath, runnerPath: PRE.runnerPath, repo: REPO };

/** Um `install()` de mentira: nao toca no disco, guarda o que foi dito e corrido. */
function bancada({ ok = true, err = '' } = {}) {
  const chamadas = []; const linhas = []; const escritos = []; const pastas = [];
  return {
    chamadas,
    linhas,
    escritos,
    pastas,
    correr: async (cmd, args) => { chamadas.push({ cmd, args }); return { ok, out: '', err }; },
    dizer: (s) => linhas.push(String(s)),
    escrever: (f, c) => escritos.push({ f, c }),
    get texto() { return linhas.join('\n'); },
  };
}
// O `criarPastaImpl` e injectado de proposito. Sem ele, a primeira versao desta
// bancada chamava o `fs.mkdirSync` a serio e CRIAVA `C:\nao-existe-de-proposito`
// na raiz do disco de quem corresse os testes -- uma fixture que jurava que a
// pasta nao existia era exactamente quem a criava. Apanhado por uma revisao
// adversarial que foi confirmar a causalidade, nao por ler o codigo.
const executar = (b, extra = {}) => ramoWindowsDoInstall({
  pre: PRE, repo: REPO, runImpl: b.correr, sayImpl: b.dizer,
  escreverImpl: b.escrever, criarPastaImpl: (d) => b.pastas.push(d),
  mooDir: 'C:\\pasta-que-nenhum-teste-cria', ...extra,
});

// ── o que a tarefa corre ────────────────────────────────────────────────────

test('os argumentos do schtasks nao inventam privilegios nem levantam o STOP', () => {
  const a = windowsArgs(ALVO);
  assert.deepEqual(a.slice(0, 9),
    ['/Create', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F', '/TR']);
  assert.ok(!a.join(' ').includes('--play'));
  assert.ok(!/\/RU |\/RP |HIGHEST/i.test(a.join(' ')), 'sem elevacao');
});

test('a receita impressa e os argumentos executados dizem a mesma coisa', () => {
  const args = windowsArgs(ALVO).join(' ');
  const receita = windowsCommand(ALVO);
  for (const pedaco of [TASK_NAME, 'ONLOGON', 'LIMITED', ALVO.runnerPath, ALVO.nodePath]) {
    assert.ok(args.includes(pedaco), `argumentos sem ${pedaco}`);
    assert.ok(receita.includes(pedaco), `receita sem ${pedaco}`);
  }
  assert.equal(trDaTarefa(ALVO), windowsArgs(ALVO)[9]);
});

// ── instalar a serio ────────────────────────────────────────────────────────

test('instalarWindows CHAMA o schtasks — nao se limita a imprimir', async () => {
  const b = bancada();
  const r = await instalarWindows({ ...ALVO, runImpl: b.correr });
  assert.equal(b.chamadas.length, 1, 'nao executou nada');
  assert.equal(b.chamadas[0].cmd, 'schtasks');
  assert.deepEqual(b.chamadas[0].args, windowsArgs(ALVO));
  assert.equal(r.ok, true);
});

test('quando o schtasks recusa, devolve o erro CRU e a receita', async () => {
  const r = await instalarWindows({ ...ALVO, runImpl: async () => ({ ok: false, err: 'ERROR: Access is denied.' }) });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Access is denied/);
  assert.equal(r.acessoNegado, true);
  assert.ok(r.receita.includes('schtasks /Create'));
});

test('um erro sem mensagem nao vira sucesso nem string vazia', async () => {
  const r = await instalarWindows({ ...ALVO, runImpl: async () => ({ ok: false, err: '' }) });
  assert.equal(r.ok, false);
  assert.ok(r.erro.length > 0);
  assert.equal(r.acessoNegado, false, 'sem mensagem nao se afirma acesso negado');
});

// ── MORDIDAS · sobre o ramo REAL, executado ────────────────────────────────

test('MORDIDA 1 · schtasks a falhar NUNCA da instalou:true', async () => {
  const b = bancada({ ok: false, err: 'ERROR: Access is denied.' });
  const r = await executar(b);
  assert.equal(r.instalou, false, 'era o defeito de origem: parecer que instalou');
  assert.match(b.texto, /NAO INSTALADO/);
  assert.match(b.texto, /Access is denied/, 'o erro do sistema chega ao dono');
});

test('MORDIDA 2 · schtasks a passar da instalou:true e nao imprime receita', async () => {
  const b = bancada({ ok: true });
  const r = await executar(b);
  assert.equal(r.instalou, true);
  assert.ok(!b.texto.includes('NAO INSTALADO'));
  assert.ok(!b.texto.includes('schtasks /Create'), 'receita so aparece quando falha');
});

test('MORDIDA 3 · os args EXECUTADOS saem do pre — sem --play, com o runner certo', async () => {
  const b = bancada();
  await executar(b);
  const { args } = b.chamadas[0];
  const tr = args[args.indexOf('/TR') + 1];
  assert.ok(!tr.includes('--play'),
    'uma tarefa com --play levanta o STOP do dono num reboot');
  assert.ok(tr.includes(PRE.runnerPath), 'tem de correr o moo-runner, nao outra coisa');
  assert.match(tr, /moo-runner\.mjs"$/, 'o ultimo argumento e o runner');
  assert.ok(tr.includes(`"${PRE.nodePath}"`), 'o node vai entre aspas — o caminho tem espacos');
  assert.ok(tr.includes(`cd /d "${REPO}"`), 'o repo vai entre aspas — idem');
});

test('MORDIDA 4 · o que se devolve e o que se correu sao a mesma coisa', async () => {
  const b = bancada();
  const r = await executar(b);
  assert.deepEqual(r.args, b.chamadas[0].args,
    'se divergirem, o teste passa a medir uma coisa e a maquina a fazer outra');
});

test('MORDIDA 10 · o .cmd escrito CONTEM o comando, nao so o cabecalho', async () => {
  // Escrever um ficheiro e dizer "escrevi o comando aqui" sao duas coisas; so a
  // segunda e uma promessa. Um `.cmd` com `@echo off` e mais nada passa em
  // qualquer teste que se limite a verificar que houve escrita -- e o dono
  // abre-o, nao encontra comando nenhum, e o remedio que lhe demos e um
  // ficheiro vazio.
  const b = bancada({ ok: false, err: 'ERROR: Access is denied.' });
  const r = await executar(b);
  assert.equal(b.escritos.length, 1, 'devia ter escrito exactamente um ficheiro');
  const { f, c } = b.escritos[0];
  assert.equal(f, r.ficheiro);
  assert.match(f, /instalar-mooterrunner\.cmd$/);
  assert.match(c, /^@echo off/, 'e um .cmd');
  assert.ok(c.includes('schtasks /Create'), 'o comando tem de la estar');
  assert.ok(c.includes(PRE.runnerPath), 'e tem de apontar ao runner certo');
  assert.ok(!c.includes('--play'), 'nem aqui o STOP do dono pode ser levantado');
  assert.deepEqual(b.pastas, ['C:\\pasta-que-nenhum-teste-cria'],
    'a pasta e pedida ao injectado, nunca ao disco real');
});

test('sem disco onde escrever o .cmd, ainda assim imprime a receita', async () => {
  const b = bancada({ ok: false, err: 'ERROR: Access is denied.' });
  const r = await executar(b, { escreverImpl: () => { throw new Error('read-only'); } });
  assert.equal(r.instalou, false);
  assert.equal(r.ficheiro, null);
  assert.ok(b.texto.includes('schtasks /Create'), 'o dono nunca pode ficar sem o comando');
});

// ── a FONTE do runnerPath, que estava desguardada ──────────────────────────

test('MORDIDA 7 · o preflight devolve o runner, e nada mais', () => {
  // O `--play` estava guardado nos dois CONSUMIDORES (`trDaTarefa`, `buildPlist`)
  // e desguardado na FONTE. `preflight()` e o unico produtor de `runnerPath` em
  // producao -- os testes usavam uma fixture feita a mao, e o unico teste que
  // lhe tocava (`fleet-beacon.test.mjs`) so verificava `typeof p.ok`. Uma
  // segunda revisao adversarial mostrou que fazer `preflight` devolver
  // `runnerPath + ' --play'` sobrevivia a suite INTEIRA, 1328 testes, e
  // instalava uma tarefa que levanta o STOP do dono num reboot.
  const p = preflight({ existsImpl: () => true });
  assert.ok(!p.runnerPath.includes('--play'),
    'a fonte do caminho tem de ser tao guardada como quem o consome');
  assert.match(p.runnerPath, /moo-runner\.mjs$/,
    'o preflight devolve o runner e nada mais — sem argumentos colados');
  assert.ok(!/\s--/.test(p.runnerPath), 'nenhuma flag entra pelo caminho do ficheiro');
});

// ── o wiring do install(), que so da para ver na fonte ─────────────────────

test('MORDIDA 6 · o install() liga o ramo ao codigo de saida', () => {
  // Esta e a UNICA asercao por texto que fica, e fica declarada: o `install()`
  // faz E/S de processo (`process.exit`, `fs`, `os.hostname`) e executa-lo num
  // teste exigia um refactor maior do que o defeito justifica. As tres linhas
  // que ela prende sao ligacao pura -- chamar o ramo, marcar a falha, sair !=0.
  // Toda a LOGICA esta nos testes acima, que executam codigo a serio.
  const fonte = fs.readFileSync(new URL('./autostart.mjs', import.meta.url), 'utf8');
  const install = /async function install\(\)[\s\S]*?\n}/.exec(fonte);
  assert.ok(install, 'nao encontrei o install()');
  const corpo = install[0];

  assert.match(corpo, /ramoWindowsDoInstall\(/, 'o ramo win32 tem de ser chamado');
  assert.match(corpo, /if \(!r\.instalou\) naoInstalou = true;/,
    'uma instalacao falhada tem de ficar marcada');
  assert.match(corpo, /if \(naoInstalou\) process\.exit\(1\);/,
    'um instalador que nao instalou nao sai 0 — era exactamente o defeito');
  assert.match(corpo, /if \(!r\.ok\) \{ naoInstalou = true;/,
    'o macOS tem a mesma regra: plist escrito que o launchctl nao carregou nao e sucesso');

  // COBERTURA, nao presenca. A versao anterior desta asercao procurava as
  // linhas acima e dava-se por satisfeita -- e passava a verde com
  // `naoInstalou = true; naoInstalou = false;`, que poe a marca e desfa-la uma
  // linha abaixo. Procurar a linha certa nao prova que nao ha uma linha errada.
  // Sao tres atribuicoes: a declaracao, o ramo darwin, o ramo win32. Uma quarta
  // e, por construcao, alguem a desfazer uma delas.
  const atribuicoes = corpo.match(/naoInstalou\s*=/g) || [];
  assert.equal(atribuicoes.length, 3,
    `esperava 3 atribuicoes a naoInstalou (declaracao + darwin + win32), vi ${atribuicoes.length}`);
});

// ── desinstalar sem ler prosa ──────────────────────────────────────────────

test('MORDIDA 5 · o uninstall pergunta ao ESTADO, nao ao idioma do Windows', async () => {
  // A tarefa ja nao existe: o /Delete falha, o /Query tambem, e isso e sucesso —
  // em pt-BR o schtasks diz "nao pode encontrar o arquivo", que nenhuma regex
  // escrita a mao acertava.
  const r = await desinstalarWindows({
    runImpl: async (_c, a) => ({ ok: false, err: 'ERRO: nao pode encontrar o arquivo especificado.' , args: a }),
  });
  assert.equal(r.ok, true, 'tarefa ausente = removida, seja qual for a lingua');
  assert.match(r.mensagem, /ja nao existia/);
});

test('o uninstall so falha quando a tarefa CONTINUA la', async () => {
  const r = await desinstalarWindows({
    runImpl: async (_c, a) => (a[0] === '/Delete'
      ? { ok: false, err: 'ERROR: Access is denied.' }
      : { ok: true, out: 'MooterRunner' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /continua la/);
});

test('MORDIDA 8 · o uninstall mede a ausencia ANTES de mexer', async () => {
  // A ordem e o contrato. Com o `/Query` depois do `/Delete`, duas recusas
  // seguidas -- que e o que uma shell sem permissoes recebe -- liam-se como
  // "ja nao existia", e dizia-se ao dono que a tarefa saira com ela la.
  const vistas = [];
  const r = await desinstalarWindows({
    runImpl: async (_c, a) => { vistas.push(a[0]); return { ok: true }; },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(vistas, ['/Query', '/Delete'],
    'perguntar primeiro e o que separa "nao encontrei" de "nao consegui ler"');
});

test('MORDIDA 9 · duas recusas seguidas NAO viram "ja nao existia"', async () => {
  // O caso exacto que a revisao adversarial apontou: sem permissoes, o /Query
  // inicial nao devolve ok:false (nao e "ausente"), devolve um erro. A tarefa
  // continua la e o comando tem de o dizer.
  const r = await desinstalarWindows({
    runImpl: async () => ({ ok: undefined, err: 'ERROR: Access is denied.' }),
  });
  assert.equal(r.ok, false, 'nao conseguir ler nao e prova de ausencia');
  assert.match(r.mensagem, /NAO REMOVIDA/);
});
