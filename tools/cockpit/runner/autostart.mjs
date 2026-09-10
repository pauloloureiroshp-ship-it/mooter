#!/usr/bin/env node
/**
 * autostart.mjs — "ligar a máquina" passa a levantar o cockpit deste device.
 *
 * O ponto delicado não é agendar: é o que o agendador tem direito de fazer.
 *
 * O shim de duplo-clique corre `--play`, porque um duplo-clique É o gesto do
 * dono. Um LaunchAgent não é gesto nenhum — é a máquina a arrancar. Se o
 * arranque automático levantasse o STOP, o kill-switch deixava de sobreviver a
 * um reboot e passava a ser uma sugestão: o dono carregava em parar, reiniciava,
 * e a máquina voltava ao trabalho sozinha. Por isso o agendamento invoca
 * `moo-runner.mjs` DIRECTAMENTE, nunca o shim, e nunca com `--play`.
 *
 *   node tools/cockpit/runner/autostart.mjs --status
 *   node tools/cockpit/runner/autostart.mjs --install
 *   node tools/cockpit/runner/autostart.mjs --uninstall
 */

import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const MOO_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');

export const LABEL = 'ai.mooter.runner';
export const TASK_NAME = 'MooterRunner';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

const say = (s) => process.stdout.write(`${s}\n`);

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') }));
  });
}

/**
 * The plist. Two properties matter beyond "run at login":
 *  - the command is the runner module, with NO `--play`, so a boot can never
 *    revoke a STOP the owner set;
 *  - `KeepAlive.SuccessfulExit=false` restarts a crash but not a clean exit,
 *    so `--once` or a deliberate quit is respected instead of fought.
 */
export function buildPlist({ nodePath, runnerPath, repo, mooDir, device }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(runnerPath)}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(repo)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MOOTER_DEVICE</key><string>${esc(device)}</string>
    <key>MOOTER_AUTOSTART</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(path.join(mooDir, 'runner.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(mooDir, 'runner.log'))}</string>
</dict>
</plist>
`;
}

/**
 * O que a tarefa corre. UMA definicao, usada pelos dois caminhos: os argumentos
 * que o `schtasks` recebe de facto, e a receita que se imprime ao dono quando
 * nao da para os executar. Derivar a segunda da primeira e o que impede que
 * divirjam -- que e a mesma classe de defeito de ter instalador e verificador
 * com definicoes diferentes do que esta instalado.
 *
 * Sem `--play`, por desenho: ver o cabecalho deste ficheiro.
 */
export function trDaTarefa({ nodePath, runnerPath, repo }) {
  return `cmd /c cd /d "${repo}" && "${nodePath}" "${runnerPath}"`;
}

/** Os argumentos do schtasks, na forma que o `execFile` precisa (sem shell). */
export function windowsArgs({ nodePath, runnerPath, repo }) {
  return [
    '/Create', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F',
    '/TR', trDaTarefa({ nodePath, runnerPath, repo }),
  ];
}

/**
 * O `.cmd` que o dono corre. NAO e a receita embrulhada -- e a receita mais a
 * verificacao, porque sem ela o remedio esconde a propria falha.
 *
 * Medido a 2026-09-10, depois de #488: escrevemos o ficheiro, o dono correu-o,
 * disse "funcionou", e a tarefa NAO existia -- confirmado por tres vias
 * (`schtasks /Query`, listagem CSV, `Get-ScheduledTask`). Um `.cmd` aberto por
 * duplo-clique fecha a janela no instante em que acaba: se o `schtasks` recusa,
 * o erro pisca e desaparece, e o que fica e a impressao de sucesso. Mandar
 * correr um ficheiro que nao deixa ler o resultado e a mesma classe de defeito
 * que o #488 corrigiu no `--install`, um degrau mais abaixo.
 *
 * Por isso o ficheiro pergunta ao ESTADO (um `/Query` depois do `/Create`),
 * imprime um veredicto de uma linha, e faz `pause`. O codigo de saida do
 * `schtasks` entra no texto como informacao, nao como veredicto -- pela mesma
 * razao que o `desinstalarWindows()` nao acredita na mensagem dele.
 */
export function conteudoDoCmd(alvo) {
  const NL = String.fromCharCode(13, 10);
  // A receita vem com `\n` (o `windowsCommand` junta assim, e para imprimir na
  // consola esta certo). Num ficheiro .cmd nao esta: a linha que ela parte e
  // precisamente a da continuacao `^`, a mais fragil de todas. Normaliza-se
  // aqui em vez de mudar o `windowsCommand`, que tem outro consumidor.
  const receita = windowsCommand(alvo).split('\n').join(NL);
  return [
    '@echo off',
    'setlocal',
    `echo Instalando a tarefa agendada ${TASK_NAME}...`,
    'echo.',
    receita,
    'set CODIGO=%ERRORLEVEL%',
    'echo.',
    `schtasks /Query /TN "${TASK_NAME}" >nul 2>&1`,
    'if errorlevel 1 (',
    `  echo   NAO INSTALADA. O schtasks saiu com codigo %CODIGO% e a tarefa nao esta la.`,
    // ASCII puro, sem excepcao. O `cmd.exe` le o ficheiro na codepage OEM
    // (850/437), nao em UTF-8: um travessao escrito aqui chegou ao ecra do dono
    // como `ÔÇö`. Ver o teste que exige `charCodeAt < 128` em todo o conteudo.
    '  echo   Le a mensagem de erro acima - ela diz o motivo.',
    ') else (',
    `  echo   INSTALADA. Confirmado por schtasks /Query, nao pelo codigo de saida.`,
    '  echo   O arranque automatico NUNCA levanta o STOP.',
    ')',
    'echo.',
    'pause',
    '',
  ].join(NL);
}

/** The Windows equivalent, as a command the owner runs in their own shell. */
export function windowsCommand({ nodePath, runnerPath, repo }) {
  return [
    `schtasks /Create /TN "${TASK_NAME}" /SC ONLOGON /RL LIMITED /F ^`,
    `  /TR "cmd /c cd /d \\"${repo}\\" && \\"${nodePath}\\" \\"${runnerPath}\\""`,
  ].join('\n');
}

/**
 * Instala a tarefa agendada A SERIO.
 *
 * Ate 2026-09-10 este ramo do `install()` imprimia o comando e saia com codigo
 * 0. Ou seja: `--install` no Windows **nunca instalou nada** e ainda assim
 * parecia ter feito o trabalho -- enquanto no macOS escrevia o plist e fazia
 * `launchctl load`. O `sync-cockpit.mjs --check` reprovava para sempre com
 * "nenhum lancador configurado", e correr o instalador outra vez nao mudava
 * nada, porque nao havia nada a mudar.
 *
 * Devolve o erro CRU em vez de o traduzir. Foi o que revelou, numa revisao
 * adversarial, um `/TR` acima do limite de 261 chars do schtasks: a mensagem
 * dizia-o exactamente, e uma traducao nossa teria dito "falhou".
 *
 * Sobre o `Access is denied`, e a distincao importa porque muda o conselho:
 *
 *   MEDIDO a 2026-09-10 nesta maquina, no token do processo:
 *     BUILTIN\\Administradores  S-1-5-32-544  "Group used for deny only"
 *     Rotulo Obrigatorio\\Nivel Obrigatorio Medio  S-1-16-8192
 *     IsInRole(Administrator) = False
 *   MEDIDO tambem: sem elevar, `/Create` da "Access is denied" e `/Query`
 *   corre; elevando, `/Create` cria a tarefa. Isso e o facto, e chega para o
 *   conselho.
 *
 *   INFERIDO, e fica marcado como tal: que a causa operativa seja o grupo
 *   estar "deny only". Um token de admin filtrado carrega, no minimo, os
 *   direitos de um utilizador padrao -- e um utilizador padrao devia poder
 *   criar uma tarefa que corre como ele proprio. Ou essa premissa nao vale
 *   nesta maquina (politica, ACL do agendador), ou o "deny only" nao e o
 *   mecanismo. O contrafactual que decidiria -- correr o mesmo `/Create` como
 *   nao-admin aqui -- NAO foi corrido: `n/d`.
 *
 * ESTA ENTRADA JA ESTEVE ERRADA, e o erro fica registado porque foi
 * instrutivo. A primeira versao punha a hipotese MSIX em primeiro lugar --
 * "a shell e filha de C:\\Program Files\\WindowsApps\\ e herda a identidade do
 * pacote" -- e relegava a filtragem UAC a "alternativa nao excluida". Os
 * sintomas eram compativeis com as duas (ler corre, escrever nao) e eu escolhi
 * a mais exotica sem a testar. Um revisor apontou que era inferencia disfarcada
 * de medicao; bastou ler o token para a decidir, e o token diz UAC.
 *
 * Licao operacional: quando duas causas explicam o mesmo sintoma, procura o
 * facto que as separa em vez de escolher a que parece mais interessante.
 */
/**
 * O ramo win32 do `install()`, extraido para ser EXECUTAVEL num teste.
 *
 * Estava inline, e os testes cobriam-no por regex sobre o texto-fonte. Uma
 * revisao adversarial encontrou quatro mutacoes que passavam os 7 testes a
 * verde deixando o instalador mentir -- entre elas trocar `if (r.ok)` por
 * `if (true)` (ressuscita o defeito de origem) e acrescentar `--play` ao
 * runnerPath (instala uma tarefa que levanta o STOP do dono). A regex prende a
 * FORMA e liberta o COMPORTAMENTO, que e o inverso do que este ficheiro quer.
 *
 * Com o ramo aqui, um teste monta-o com um `runImpl` falso e afirma sobre os
 * argumentos que o call-site REALMENTE constroi.
 */
export async function ramoWindowsDoInstall({
  pre, repo, runImpl = run, sayImpl = say, mooDir = MOO_DIR,
  escreverImpl = fs.writeFileSync, criarPastaImpl = fs.mkdirSync,
} = {}) {
  const alvo = { nodePath: pre.nodePath, runnerPath: pre.runnerPath, repo };
  const r = await instalarWindows({ ...alvo, runImpl });
  if (r.ok) {
    sayImpl(`\n  Tarefa agendada instalada — ${TASK_NAME} (ONLOGON, /RL LIMITED)`);
    sayImpl('');
    return { instalou: true, args: windowsArgs(alvo) };
  }

  sayImpl('\n  NAO INSTALADO — o schtasks recusou:');
  sayImpl(`    ${r.erro.split('\n')[0]}`);
  if (r.acessoNegado) {
    sayImpl('');
    sayImpl('  A causa mais provavel e o teu token estar filtrado pelo UAC. Se');
    sayImpl('  fores administrador da maquina mas nao estiveres ELEVADO, o grupo');
    sayImpl('  de Administradores aparece no token como "deny only" e a escrita e');
    sayImpl('  recusada — enquanto a leitura (schtasks /Query) continua a correr.');
    sayImpl('  Confirma numa linha:');
    sayImpl('');
    sayImpl('    whoami /groups | findstr S-1-5-32-544');
    sayImpl('');
    sayImpl('  Se disser "deny only", corre o ficheiro abaixo com o botao direito');
    sayImpl('  -> "Executar como administrador".');
    sayImpl('');
    sayImpl('  Se NAO disser, ha uma segunda hipotese: esta shell ser filha de uma');
    sayImpl('  app empacotada (C:\\Program Files\\WindowsApps\\...) e herdar a');
    sayImpl('  identidade do pacote. Nesse caso abre uma janela cmd a partir do');
    sayImpl('  Explorador e tenta de novo, sem elevar.');
  }

  // A receita NAO sobrevive ao PowerShell. Medido a 2026-09-10 numa revisao
  // adversarial: colada tal e qual, o 5.1 e o 7.6 entregam ambos ao schtasks
  // `[... "/F", "^"]` -- o `/TR` desaparece. E as formas que funcionam sao
  // INCOMPATIVEIS entre si (aspas simples funcionam no 7.6 e truncam em
  // silencio no 5.1). Nao existe one-liner unico, por isso nao se pede ao dono
  // que cole nada: escreve-se um .cmd e diz-se qual e o ficheiro. O cmd.exe
  // le esta sintaxe correctamente -- isso esta provado.
  let ficheiro = null;
  try {
    criarPastaImpl(mooDir, { recursive: true });
    ficheiro = path.join(mooDir, 'instalar-mooterrunner.cmd');
    escreverImpl(ficheiro, conteudoDoCmd(alvo), 'utf8');
  } catch {
    ficheiro = null;                                     // sem disco, resta a receita
  }

  sayImpl('');
  if (ficheiro) {
    sayImpl(`  Escrevi o comando aqui:  ${ficheiro}`);
    sayImpl('  Corre esse ficheiro numa janela cmd.exe (NAO PowerShell). Ele');
    sayImpl('  confirma sozinho se a tarefa ficou la e espera que carregues numa');
    sayImpl('  tecla — nao te fies no facto de a janela fechar sem queixas.');
    sayImpl('');
  }
  sayImpl(windowsCommand(alvo));
  sayImpl('');
  return { instalou: false, args: windowsArgs(alvo), ficheiro, erro: r.erro };
}

/**
 * Remove a tarefa. Simetrico ao install, e pela mesma razao.
 *
 * NAO le a mensagem de erro. A primeira versao disto procurava
 * "cannot find the file specified" para distinguir "ja nao existia" de "falhou"
 * -- e a prosa do schtasks e traduzida: em pt-BR e "nao pode encontrar o
 * arquivo", que nao casava com nenhuma das variantes escritas a mao. Um
 * verificador que depende do idioma do sistema operativo nao e um verificador.
 * Pergunta-se ao estado: se a tarefa nao esta la, foi removida, seja qual for
 * a lingua em que o sistema o disse.
 */
export async function desinstalarWindows({ runImpl = run } = {}) {
  // O `/Query` vem ANTES do `/Delete`, de proposito. A versao anterior so
  // perguntava DEPOIS de o `/Delete` falhar, e nesse desenho duas recusas
  // seguidas -- `/Delete` negado e `/Query` negado, que e o que acontece a uma
  // shell sem permissoes -- liam-se como "ja nao existia". Dizia-se ao dono que
  // a tarefa tinha sido removida com ela la. Medir a ausencia ANTES de mexer
  // tira a ambiguidade: "nao encontrei" e uma leitura, "nao consegui ler" e
  // outra, e as duas deixam de partilhar a mesma resposta.
  const antes = await runImpl('schtasks', ['/Query', '/TN', TASK_NAME]);
  if (antes && antes.ok === false) {
    return { ok: true, mensagem: `Tarefa agendada ja nao existia — ${TASK_NAME}` };
  }

  const del = await runImpl('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
  if (del && del.ok) return { ok: true, mensagem: `Tarefa agendada removida — ${TASK_NAME}` };

  const erro = String((del && del.err) || '').trim().split('\n')[0] || 'sem mensagem';
  const depois = await runImpl('schtasks', ['/Query', '/TN', TASK_NAME]);
  if (depois && depois.ok === false) {
    // O /Delete queixou-se mas a tarefa saiu: conta como removida.
    return { ok: true, mensagem: `Tarefa agendada removida — ${TASK_NAME}` };
  }
  return { ok: false, mensagem: `NAO REMOVIDA — a tarefa continua la. O schtasks disse: ${erro}` };
}

export async function instalarWindows({ nodePath, runnerPath, repo, runImpl = run } = {}) {
  const r = await runImpl('schtasks', windowsArgs({ nodePath, runnerPath, repo }));
  const receita = windowsCommand({ nodePath, runnerPath, repo });
  if (r && r.ok) return { ok: true, receita };
  const erro = String((r && r.err) || '').trim() || 'sem mensagem do schtasks';
  return {
    ok: false,
    erro,
    acessoNegado: /access is denied|acesso negado/i.test(erro),
    receita,
  };
}

/** Fail loudly rather than install something that quietly cannot work. */
export function preflight({ existsImpl = fs.existsSync } = {}) {
  const problems = [];
  const runnerPath = path.join(HERE, 'moo-runner.mjs');
  if (!existsImpl(runnerPath)) problems.push(`runner ausente: ${runnerPath}`);
  if (!existsImpl(process.execPath)) problems.push(`node ausente: ${process.execPath}`);
  // A LaunchAgent has no shell profile: nvm/homebrew node paths that only exist
  // inside an interactive shell would resolve at install time and vanish at boot.
  if (/\/\.nvm\//.test(process.execPath)) {
    problems.push(
      `este node vem do nvm (${process.execPath}) e pode nao existir no arranque; `
      + 'instala um node de sistema ou fixa o caminho a mao',
    );
  }
  return { ok: problems.length === 0, problems, runnerPath, nodePath: process.execPath };
}

async function status() {
  if (process.platform === 'darwin') {
    const installed = fs.existsSync(PLIST);
    say(`  LaunchAgent  ${installed ? 'instalado' : 'nao instalado'}  (${PLIST})`);
    if (installed) {
      const r = await run('launchctl', ['list', LABEL]);
      say(`  carregado    ${r.ok ? 'sim' : 'nao (instalado mas nao carregado)'}`);
    }
    return installed;
  }
  if (process.platform === 'win32') {
    const r = await run('schtasks', ['/Query', '/TN', TASK_NAME]);
    say(`  tarefa agendada  ${r.ok ? 'instalada' : 'nao instalada'} (${TASK_NAME})`);
    return r.ok;
  }
  say(`  sem suporte de arranque automatico para ${process.platform}`);
  return false;
}

async function install() {
  const pre = preflight();
  if (!pre.ok) {
    say('\n  Nao instalo com estes problemas por resolver:');
    for (const p of pre.problems) say(`    - ${p}`);
    process.exit(1);
  }
  const device = process.env.MOOTER_DEVICE
    || os.hostname().replace(/\.local$/i, '').toLowerCase();
  let naoInstalou = false;

  if (process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.mkdirSync(MOO_DIR, { recursive: true });
    fs.writeFileSync(PLIST, buildPlist({
      nodePath: pre.nodePath, runnerPath: pre.runnerPath, repo: REPO, mooDir: MOO_DIR, device,
    }));
    await run('launchctl', ['unload', PLIST]);          // idempotente
    const r = await run('launchctl', ['load', PLIST]);
    say(`\n  LaunchAgent instalado e ${r.ok ? 'carregado' : 'NAO carregado'} — ${PLIST}`);
    // O mesmo defeito que este commit corrige no Windows sobrevivia invertido
    // aqui: o `launchctl load` falhava, imprimia-se "NAO carregado", e saia 0.
    // Um plist escrito que ninguem carregou nao e um arranque automatico.
    if (!r.ok) { naoInstalou = true; say(`  launchctl disse: ${r.err.trim().slice(0, 200)}`); }
  } else if (process.platform === 'win32') {
    const r = await ramoWindowsDoInstall({ pre, repo: REPO, sayImpl: say });
    if (!r.instalou) naoInstalou = true;
  } else {
    say(`\n  Sem receita de arranque automatico para ${process.platform}.`);
    process.exit(1);
  }

  const stopped = fs.existsSync(path.join(MOO_DIR, 'STOP'));
  say(`  STOP actual: ${stopped ? 'ACTIVO' : 'levantado'}`);
  say('  O arranque automatico NUNCA levanta o STOP — se estiver activo, a');
  say('  maquina arranca parada e espera pelo teu ▶.\n');

  // Um instalador que nao instalou nao sai 0. Era exactamente assim que este
  // ramo mentia: imprimia a receita, saia 0, e quem o corresse ficava a pensar
  // que tinha ligado o arranque automatico.
  if (naoInstalou) process.exit(1);
}

async function uninstall() {
  if (process.platform === 'darwin') {
    await run('launchctl', ['unload', PLIST]);
    fs.rmSync(PLIST, { force: true });
    say(`\n  LaunchAgent removido — ${PLIST}\n`);
  } else if (process.platform === 'win32') {
    const r = await desinstalarWindows();
    say(`\n  ${r.mensagem}`);
    if (!r.ok) {
      say(`  Corre na tua shell:  schtasks /Delete /TN "${TASK_NAME}" /F\n`);
      process.exit(1);
    }
    say('');
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  say(`\n  Moo Pilot · arranque automatico · ${process.platform}\n`);
  if (args.has('--uninstall')) return uninstall();
  if (args.has('--install')) return install();
  await status();
  say('\n  --install para ligar · --uninstall para desligar\n');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
