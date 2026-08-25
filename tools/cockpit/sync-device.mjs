#!/usr/bin/env node
/**
 * sync-device.mjs — um comando que põe ESTE device alinhado, seja ele qual for.
 *
 * O problema que resolve: um device novo (ou parado há uma semana) falha sempre
 * pelas mesmas coisas, e nenhuma grita. Código antigo, espelhos por sincronizar,
 * índice do vault velho, conector de outra versão. Cada uma dá um sintoma que
 * parece outra coisa — e perde-se uma hora a debugar a errada.
 *
 * Este script percorre o caminho todo, por ordem de dependência, e diz em que
 * passo parou. Corre igual em macOS, Linux e Windows: não há um único comando
 * de shell aqui, só `git` e ficheiros.
 *
 * ⚠️ O QUE ELE NÃO FAZ, E NÃO PODE FAZER
 *
 * Instalar o `.mcpb` no Claude Desktop. Isso é uma instalação aprovada por quem
 * está ao teclado, e escrever à mão no registo de extensões da app seria forjar
 * um estado que a app não conhece — a próxima coisa que abrisse o Desktop
 * encontraria uma versão que nunca instalou. Este script DESCARREGA o ficheiro,
 * diz onde está, e para aí. O último gesto é do dono, de propósito.
 *
 * Uso:
 *   node tools/cockpit/sync-device.mjs            # faz e relata
 *   node tools/cockpit/sync-device.mjs --check    # só relata, não escreve nada
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verConector, versaoInstalada } from './runner/self-check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE = path.join(os.homedir(), '.claude');
const SO_RELATA = process.argv.includes('--check');

const passos = [];
function passo(nome, estado, detalhe, resolver = null) {
  passos.push({ nome, estado, detalhe, resolver });
  const marca = { ok: '✓', mudou: '↻', aviso: '!', mau: '✗', 'n/d': '·' }[estado] || '·';
  console.log(`  ${marca} ${nome.padEnd(26)} ${detalhe}`);
  if (resolver) console.log(`      -> ${resolver}`);
}

function git(args, cwd = REPO) {
  return String(execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })).trim();
}

function copiar(de, para) {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  fs.copyFileSync(de, para);
}

/** Copia um glob simples (uma pasta, uma extensão) e devolve quantos mudaram. */
function espelhar(dirOrigem, dirDestino, extensao, excluir = /\.test\./) {
  let n = 0;
  let entradas;
  try { entradas = fs.readdirSync(dirOrigem); } catch { return null; }
  for (const nome of entradas) {
    if (!nome.endsWith(extensao) || excluir.test(nome)) continue;
    const de = path.join(dirOrigem, nome);
    const para = path.join(dirDestino, nome);
    let igual = false;
    try { igual = fs.readFileSync(de, 'utf8') === fs.readFileSync(para, 'utf8'); } catch { igual = false; }
    if (igual) continue;
    if (!SO_RELATA) copiar(de, para);
    n += 1;
  }
  return n;
}

async function main() {
  console.log(`\n  Mooter · alinhar este device${SO_RELATA ? ' (--check: não escrevo nada)' : ''}`);
  console.log(`  ${os.platform()} · ${os.hostname()}\n`);

  // ── 1 · o código ──────────────────────────────────────────────────────────
  // Primeiro de todos por dependência: tudo o que vem a seguir copia FICHEIROS
  // deste repo. Sincronizar espelhos a partir de código velho é espalhar o
  // problema por mais sítios.
  let atras = null;
  try {
    git(['fetch', 'origin', '--quiet']);
    atras = Number(git(['rev-list', '--count', 'HEAD..origin/main']));
  } catch (e) {
    passo('código', 'n/d', 'não consegui falar com o remoto', String(e.message).slice(0, 70));
  }
  if (atras !== null) {
    if (atras === 0) passo('código', 'ok', 'em dia com origin/main');
    else if (SO_RELATA) passo('código', 'aviso', `${atras} commits atrás`, 'git pull origin main');
    else {
      try { git(['pull', '--ff-only', 'origin', 'main']); passo('código', 'mudou', `puxados ${atras} commits`); }
      catch { passo('código', 'mau', `${atras} atrás e o pull não passou`, 'resolve à mão: git pull origin main'); }
    }
  }

  // ── 2 · os espelhos de runtime ────────────────────────────────────────────
  // O que a máquina CORRE vive fora do repo. Um repo actualizado com espelhos
  // velhos é a forma mais discreta de correr código de ontem — foi assim que o
  // acumulador de turno morreu 63 sessões em silêncio.
  const router = espelhar(path.join(REPO, 'tools', 'router'), path.join(CLAUDE, 'tools', 'router'), '.js');
  if (router === null) passo('espelho do router', 'n/d', 'origem não encontrada');
  else passo('espelho do router', router ? 'mudou' : 'ok', router ? `${router} ficheiros` : 'em dia');

  try {
    const v = path.join(REPO, 'tools', 'router', 'version.json');
    const d = path.join(CLAUDE, 'tools', 'router', 'version.json');
    if (!SO_RELATA) copiar(v, d);
    passo('versão do runtime', 'ok', JSON.parse(fs.readFileSync(v, 'utf8')).version);
  } catch { passo('versão do runtime', 'n/d', 'sem version.json'); }

  // As skills: o que o agente lê para decidir o que fazer. Uma skill velha dá
  // instruções que falham na primeira linha — foi o que aconteceu com o Windows.
  let skills = 0;
  try {
    for (const nome of fs.readdirSync(path.join(REPO, '.claude', 'skills'))) {
      const origem = path.join(REPO, '.claude', 'skills', nome);
      if (!fs.existsSync(path.join(origem, 'SKILL.md'))) continue;
      const n = espelhar(origem, path.join(CLAUDE, 'skills', nome), '.md', /(?!)/);
      skills += n || 0;
    }
    passo('skills', skills ? 'mudou' : 'ok', skills ? `${skills} ficheiros` : 'em dia');
  } catch { passo('skills', 'n/d', 'não encontrei .claude/skills no repo'); }

  // ── 3 · o índice do vault ─────────────────────────────────────────────────
  // 135 ms que ninguém corria há 21 dias, com 13% do vault invisível a quem o
  // consultasse. É barato ao ponto de não haver desculpa.
  const vault = process.env.VAULT_PATH || path.join(os.homedir(), 'paulo-vault');
  const build = path.join(vault, '.claude', '3rd-brain', 'build-index.js');
  if (!fs.existsSync(build)) passo('índice do vault', 'n/d', 'sem vault montado nesta máquina');
  else if (SO_RELATA) passo('índice do vault', 'aviso', 'não reconstruído (--check)', `node "${build}"`);
  else {
    try { execFileSync(process.execPath, [build], { stdio: 'ignore', windowsHide: true }); passo('índice do vault', 'mudou', 'reconstruído'); }
    catch (e) { passo('índice do vault', 'mau', 'falhou', String(e.message).slice(0, 70)); }
  }

  // ── 3b · o alias de leitura do vault ──────────────────────────────────────
  //
  // Medido a 2026-08-25: nos ultimos 7 dias o vault levou **1241 commits, dos
  // quais 1204 sao beacons**. Um `git log` no vault e 97% telemetria — as
  // decisoes, o canon e os learnings ficam enterrados debaixo dela.
  //
  // Nao ha nada a arranjar no publicador: ele publica por relogio precisamente
  // para NAO dar milhares de commits, e ja e a versao economica. O que faltava
  // era uma forma de LER sem a telemetria.
  //
  // ⚠️ A forma ingenua nao serve, e falha em SILENCIO:
  //     git config alias.hlog "log --oneline -- :!50-fleet"
  //     git hlog -8      ->  (vazio)
  // O git anexa os argumentos ao FIM do alias, portanto o `-8` aterra depois do
  // `--` e vira um PATHSPEC. Nao ha erro; ha zero linhas, que e pior. Por isso o
  // alias e uma funcao de shell: assim os argumentos ficam antes do `--`.
  if (!fs.existsSync(path.join(vault, '.git'))) {
    passo('alias hlog do vault', 'n/d', 'sem vault montado nesta máquina');
  } else {
    const QUERIDO = '!f() { git log --oneline "$@" -- ":(exclude)50-fleet"; }; f';
    let actual = null;
    try { actual = git(['config', '--get', 'alias.hlog'], vault); } catch { actual = null; }
    if (actual === QUERIDO) {
      passo('alias hlog do vault', 'ok', 'git hlog = histórico sem telemetria');
    } else if (SO_RELATA) {
      passo('alias hlog do vault', 'aviso', actual ? 'configurado com outra forma' : 'em falta',
        `git -C "${vault}" config alias.hlog '${QUERIDO}'`);
    } else {
      try {
        git(['config', 'alias.hlog', QUERIDO], vault);
        passo('alias hlog do vault', 'mudou', actual ? 'reescrito para a forma que aceita argumentos' : 'criado');
      } catch (e) {
        passo('alias hlog do vault', 'mau', 'não consegui escrever a config', String(e.message).slice(0, 70));
      }
    }
  }

  // ── 4 · o conector ────────────────────────────────────────────────────────
  // O último passo, e o único que este script não fecha.
  let noRepo = null;
  try { noRepo = JSON.parse(fs.readFileSync(path.join(REPO, 'packages', 'mooter-bridge', 'manifest.json'), 'utf8')).version; } catch { /* n/d */ }
  // UMA fonte para "que conector está instalado": o self-check. Este ficheiro
  // tinha a sua própria cópia que só lia o REGISTO do instalador — e o conector
  // actualiza-se in-place (`update.js` escreve em `__dirname`, nunca passa pelo
  // instalador), por isso o registo fica para trás. Medido 2026-08-21 no Mac:
  // registo 1.33.0, manifest na pasta 1.49.3; o launcher acusava "1.33.0 ≠
  // 1.49.3" enquanto o self-check já dizia ok. Duas verdades para o mesmo facto.
  const vc = verConector(REPO);
  const { versao: instalado, fonte } = versaoInstalada();
  if (!noRepo) passo('conector', 'n/d', 'o repo não declara versão');
  else if (!instalado) passo('conector', 'n/d', `${noRepo} no repo · conector do Desktop não encontrado`);
  else if (vc.estado === 'ok') passo('conector', 'ok', `${instalado}${fonte === 'registo' ? ' (lido do registo do instalador — a pasta da extensão não se leu)' : ''}`);
  else {
    const destino = path.join(os.homedir(), 'Downloads', `mooter-v${noRepo.replace(/\./g, '')}.mcpb`);
    let baixado = fs.existsSync(destino);
    if (!baixado && !SO_RELATA) {
      try {
        execFileSync('gh', ['release', 'download', `v${noRepo}`, '--pattern', '*.mcpb', '--dir', path.dirname(destino), '--clobber'],
          { cwd: REPO, stdio: 'ignore', windowsHide: true });
        baixado = fs.existsSync(destino);
      } catch { /* sem gh, ou sem release */ }
    }
    passo('conector', 'mau', `${instalado} instalado ≠ ${noRepo} no repo`,
      baixado
        ? `descarregado: ${destino} — abre-o para o Claude Desktop instalar (o último gesto é teu)`
        : `descarrega e instala o .mcpb da release v${noRepo}`);
  }

  // ── o veredicto ───────────────────────────────────────────────────────────
  const maus = passos.filter((p) => p.estado === 'mau');
  const mudou = passos.filter((p) => p.estado === 'mudou');
  console.log('');
  if (maus.length === 0) {
    console.log(`  ALINHADO${mudou.length ? ` — ${mudou.length} coisa(s) actualizada(s)` : ''}. Podes lançar: npm run pilot\n`);
  } else {
    console.log(`  ${maus.length} coisa(s) por resolver antes de este device contar como frota:`);
    for (const m of maus) console.log(`     ✗ ${m.nome}: ${m.detalhe}`);
    console.log('');
  }
  // Nunca sai com erro: isto informa, não bloqueia. Um alinhador que devolve
  // código de erro acaba dentro de um `|| true` na primeira semana.
}

main();
