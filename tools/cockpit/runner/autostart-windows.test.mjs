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
 * O QUE ISTO NAO FECHA. Esta seccao ja esteve ERRADA nos dois sentidos: dizia
 * que a `MORDIDA 6` caia a "duas" mutacoes e nomeava uma que, medida, e
 * apanhada. Um terceiro revisor correu 36 mutacoes e contou as sobreviventes.
 * O numero honesto:
 *
 *   O `install()` NAO e executado por teste nenhum -- faz E/S de processo
 *   (`process.exit`, `fs`, `os.hostname`). A `MORDIDA 6` cobre-o por regex, e
 *   sobrevivem-lhe pelo menos SETE mutacoes que ressuscitam o defeito de
 *   origem: `return` cedo no ramo win32; o `process.exit(1)` comentado (a
 *   regex nao esta ancorada e casa dentro do comentario); a mesma linha dentro
 *   de `if (false)`; `exit(0)` real com a linha certa em ramo morto;
 *   `process.exit(0)` antes do bloco; `r.instalou = true` antes de ser lido; e
 *   `process.exitCode = 0` depois -- que a contagem de 3 atribuicoes nao ve.
 *
 * Fechar isto a serio pede executar o `install()` com `exitImpl`/`platformImpl`
 * injectados e afirmar o codigo de saida. NAO esta feito, e enquanto nao
 * estiver, a `MORDIDA 6` e uma asercao de forma com sete buracos conhecidos.
 *
 * Portanto: estes testes mordem as mutacoes medidas uma a uma, e nao "a classe
 * toda". Contar as sobreviventes e mais util do que contar as apanhadas.
 *
 * A 11.a chegou pelo pior caminho possivel: depois de #488 fundido, o dono
 * correu o `.cmd` que lhe escrevemos, disse "funcionou", e a tarefa NAO existia
 * -- confirmado por tres vias. O ficheiro nao mentia; simplesmente fechava a
 * janela antes de o resultado poder ser lido. Um remedio que esconde a propria
 * falha e o mesmo defeito que este ficheiro persegue, um degrau mais abaixo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TASK_NAME, trDaTarefa, windowsArgs, windowsCommand,
  instalarWindows, desinstalarWindows, ramoWindowsDoInstall, preflight, conteudoDoCmd,
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
    escrever: (f, c, enc) => escritos.push({ f, c, enc }),
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
  const { f, c, enc } = b.escritos[0];
  assert.equal(f, r.ficheiro);
  assert.match(f, /instalar-mooterrunner\.cmd$/);

  // IGUALDADE, nao `includes`. As asercoes anteriores eram da era #488 --
  // `@echo off` + `schtasks /Create` + runnerPath + sem `--play` -- e o ficheiro
  // VELHO satisfazia-as todas. Um revisor mostrou que reverter esta linha para
  // `@echo off\r\n${windowsCommand(alvo)}\r\n` passava 18/18: o commit inteiro
  // era reversivel no call-site sem um unico teste vermelho.
  assert.equal(c, conteudoDoCmd(ALVO),
    'o que se escreve tem de ser exactamente o que a funcao produz');
  assert.equal(enc, 'utf8',
    'a prova de ASCII e sobre a string; sem fixar a codificacao, utf16le passava');
  assert.deepEqual(b.pastas, ['C:\\pasta-que-nenhum-teste-cria'],
    'a pasta e pedida ao injectado, nunca ao disco real');
});

test('MORDIDA 11 · o .cmd verifica o ESTADO e nao fecha antes de ser lido', async () => {
  // 2026-09-10, depois de #488: o ficheiro foi escrito, o dono correu-o, disse
  // «funcionou», e a tarefa NAO existia — confirmado por `schtasks /Query`,
  // listagem CSV e `Get-ScheduledTask`. Um `.cmd` por duplo-clique fecha a
  // janela ao acabar: o erro pisca e o que fica e a impressao de sucesso.
  // Um remedio que esconde a propria falha e o mesmo defeito do `--install`,
  // um degrau abaixo.
  const c = conteudoDoCmd(ALVO);
  const CRLF = String.fromCharCode(13, 10);
  const ls = c.split(CRLF);
  assert.match(c, /^@echo off/, 'e um .cmd');

  // ORDEM e ADJACENCIA, nao presenca. Um revisor mostrou que `includes` deixava
  // passar: trocar os corpos dos ramos (imprime INSTALADA com a tarefa
  // ausente), meter um `echo.` entre o /Create e o `set CODIGO` (o
  // %ERRORLEVEL% passa a ser o do echo), pôr o /Query ANTES do /Create (le o
  // estado velho), e meter `exit /b 0` antes do pause (a ultima linha continua
  // a ser `pause` e a janela fecha na mesma).
  const iCreate = ls.findIndex((l) => l.includes('schtasks /Create'));
  const iSet = ls.findIndex((l) => l.trim().startsWith('set CODIGO='));
  const iQuery = ls.findIndex((l) => l.includes('schtasks /Query'));
  const iIf = ls.findIndex((l) => l.trim() === 'if errorlevel 1 (');
  assert.ok(iCreate >= 0 && iSet >= 0 && iQuery >= 0 && iIf >= 0, 'faltam linhas');

  // O /Create ocupa 2 linhas (continuacao `^`), portanto o `set` e a linha logo
  // a seguir ao fim dele. Nada pode correr entre os dois.
  assert.equal(iSet, iCreate + 2,
    'o `set CODIGO=%ERRORLEVEL%` tem de vir imediatamente depois do /Create');
  assert.ok(iQuery > iCreate, 'o /Query confirma DEPOIS de criar, nao antes');
  assert.ok(iIf > iQuery, 'so se ramifica depois de perguntar');
  assert.match(ls[iIf + 1], /NAO INSTALADA/,
    'o ramo de errorlevel 1 e o do fracasso — trocar os corpos mente ao dono');
  const iElse = ls.findIndex((l) => l.trim() === ') else (');
  assert.match(ls[iElse + 1], /INSTALADA\. Confirmado por schtasks \/Query/,
    'e o outro ramo diz de onde vem a certeza');
  // A ULTIMA linha tem de ser o comando `pause`, nao uma linha que contenha a
  // palavra. Procurar /\bpause\b/ deixava passar `rem sem pause` -- a palavra
  // presente, o comando ausente, a janela a fechar na mesma. E a terceira vez
  // nesta sessao que "a palavra esta la" se disfarca de "a coisa esta feita".
  const uteis = ls.filter((l) => l.trim() !== '');
  assert.equal(uteis[uteis.length - 1].trim(), 'pause',
    'a ultima linha tem de ser exactamente `pause`, senao a janela leva a mensagem com ela');
  // E nada pode SAIR antes dela. `exit /b 0` a meio deixa a ultima linha
  // intacta e fecha a janela na mesma — presenca outra vez a fingir-se de
  // cobertura.
  const iPause = ls.findIndex((l) => l.trim() === 'pause');
  const antesDoPause = ls.slice(0, iPause).map((l) => l.trim().toLowerCase());
  assert.ok(!antesDoPause.some((l) => /^(exit|goto\s+:?eof)\b/.test(l)),
    'nenhuma saida antecipada antes do pause');
  assert.ok(c.includes(ALVO.runnerPath) && !c.includes('--play'));
  // CRLF: um .cmd com LF puro corre, mas o `^` de continuacao e fragil em
  // ficheiro; escreve-se em CRLF de proposito.
  // COBERTURA, nao presenca. `includes(CRLF)` dava verde com o ficheiro a ter
  // uma linha em LF nu — e era precisamente a linha 4, a da continuacao `^`, a
  // mais fragil, porque o `windowsCommand()` junta com `\n`. Mesma classe de
  // defeito do portao de movimento reduzido de 2026-08-29: presenca aceite
  // como cobertura. Aqui exige-se que NENHUM `\n` esteja desacompanhado.
  const LF = String.fromCharCode(10);
  const soltos = [...c].reduce((n, ch, i) => (
    ch === LF && c.charCodeAt(i - 1) !== 13 ? n + 1 : n), 0);
  assert.equal(soltos, 0, 'todas as quebras de linha do .cmd tem de ser CRLF');

  // ASCII puro. O `cmd.exe` le o ficheiro na codepage OEM (850/437), nao em
  // UTF-8: um travessao `—` escrito no texto chegou ao ecra do dono como `ÔÇö`.
  // Nao e cosmetico -- a linha que sai trocada e precisamente a que lhe diz para
  // ir ler a mensagem de erro.
  const fora = [...c].filter((ch) => ch.charCodeAt(0) > 127);
  assert.deepEqual(fora, [],
    `o .cmd tem de ser ASCII puro; encontrei: ${fora.map((ch) => `${ch}(${ch.charCodeAt(0)})`).join(' ')}`);
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
