/**
 * self-check.mjs — o Moo Pilot a auditar-se a si próprio, sem modelo nenhum.
 *
 * A 2026-08-19 encontrámos nove defeitos reais num só dia. Nenhum foi
 * encontrado pela GPU. Todos foram encontrados por alguém a ler ficheiros à
 * mão — e nenhum deles precisava de um modelo para ser visto:
 *
 *   · o ledger tinha 4,27 MB e nenhuma rotação
 *   · o índice do vault era de há 21 dias e 13% dos ficheiros estavam invisíveis
 *   · dois ficheiros diziam qual era o projecto activo, e discordavam
 *   · o `preferences.json` nunca tinha sido escrito
 *   · o painel afirmava uma versão de conector que não era a que corria
 *   · o beacon nunca saía da máquina
 *
 * São todos verificáveis com um `stat` e uma comparação. Este módulo faz isso
 * a cada ronda, de graça, e é a razão pela qual o dono passa a VER alertas em
 * vez de silêncio — porque "não há alertas" nunca quis dizer "está tudo bem";
 * queria dizer "ninguém está a olhar".
 *
 * ⚠️ REGRA: um alerta que não diz COMO se resolve é uma queixa. Cada verificação
 * devolve `resolver` — o gesto exacto, para copiar. Sem isso isto seria mais um
 * painel a apontar dedos.
 *
 * ⚠️ REGRA: o que não se consegue medir devolve `n/d`, nunca `ok`. Um verde por
 * ignorância é pior do que um vermelho.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Acima disto o ledger devia já ter rodado — ver `rodarLedger`. */
export const LEDGER_TECTO_MB = 16;

/** Um beacon publicado há mais do que isto quer dizer que a frota está cega. */
export const BEACON_VELHO_MIN = 30;

const OK = 'ok';
const AVISO = 'aviso';
const MAU = 'mau';
const ND = 'n/d';

function tamanhoMb(p, statImpl) {
  try { return statImpl(p).size / (1024 * 1024); } catch { return null; }
}

function mtime(p, statImpl) {
  try { return statImpl(p).mtimeMs; } catch { return null; }
}

/**
 * O ledger cresce para sempre?
 *
 * Medido a 2026-08-19: 4,27 MB, `appendFileSync` puro, e o `readLedger` a ler o
 * ficheiro inteiro a cada 3 segundos. A rotação existe desde então; esta
 * verificação é o que garante que ela está mesmo a acontecer.
 */
export function verLedger(paths, { statImpl = fs.statSync } = {}) {
  const mb = tamanhoMb(paths.LEDGER, statImpl);
  if (mb === null) {
    return { id: 'ledger', estado: ND, o_que: 'tamanho do ledger', porque: 'ainda não existe ledger neste projecto', resolver: null };
  }
  const val = `${mb.toFixed(1)} MB`;
  if (mb <= LEDGER_TECTO_MB) {
    return { id: 'ledger', estado: OK, o_que: 'ledger', valor: val, porque: 'abaixo do tecto de rotação', resolver: null };
  }
  return {
    id: 'ledger', estado: MAU, o_que: 'ledger', valor: val,
    porque: `passou ${LEDGER_TECTO_MB} MB e não rodou — a rotação devia ter acontecido no append`,
    resolver: 'node -e "import(\'./tools/cockpit/runner/moo-runner.mjs\').then(m=>console.log(m.rodarLedger(process.env.HOME+\'/.mooter/runner-ledger.jsonl\')))"',
  };
}

/**
 * O índice do vault está a esconder ficheiros?
 *
 * O `AGENTS.md` manda todos os agentes consultarem o vault como fonte de
 * verdade mais alta, e diz que o índice é reconstruído no SessionStart. Não
 * existe hook SessionStart nenhum: a 2026-08-19 o índice tinha 21 dias e 60 de
 * 448 ficheiros (13%) eram invisíveis a quem seguisse a doutrina.
 */
export function verIndiceDoVault(vaultDir, { statImpl = fs.statSync, listarImpl = null } = {}) {
  if (!vaultDir) {
    return { id: 'vault-indice', estado: ND, o_que: 'índice do vault', porque: 'sem vault montado nesta máquina', resolver: null };
  }
  const idx = path.join(vaultDir, '.claude', '3rd-brain', 'index.json');
  const quando = mtime(idx, statImpl);
  if (quando === null) {
    return {
      id: 'vault-indice', estado: MAU, o_que: 'índice do vault',
      porque: 'não existe — quem consultar o vault não encontra nada',
      resolver: `node "${path.join(vaultDir, '.claude/3rd-brain/build-index.js')}"`,
    };
  }
  const maisNovos = (listarImpl || listarMdMaisNovos)(vaultDir, quando);
  if (maisNovos === null) {
    return { id: 'vault-indice', estado: ND, o_que: 'índice do vault', porque: 'não consegui ler o vault', resolver: null };
  }
  if (maisNovos === 0) {
    return { id: 'vault-indice', estado: OK, o_que: 'índice do vault', valor: 'em dia', porque: 'nenhum ficheiro é mais novo que o índice', resolver: null };
  }
  return {
    id: 'vault-indice', estado: AVISO, o_que: 'índice do vault', valor: `${maisNovos} por indexar`,
    porque: 'ficheiros mais novos que o índice são invisíveis a quem consultar o vault',
    resolver: `node "${path.join(vaultDir, '.claude/3rd-brain/build-index.js')}"`,
  };
}

/** Conta `.md` do vault mais novos que o índice. Um `find` em JS, sem shell. */
function listarMdMaisNovos(vaultDir, desdeMs, { readdirImpl = fs.readdirSync, statImpl = fs.statSync } = {}) {
  let n = 0;
  const pilha = [vaultDir];
  let visitados = 0;
  while (pilha.length && visitados < 5000) {
    const dir = pilha.pop();
    visitados += 1;
    let entradas;
    try { entradas = readdirImpl(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const filho = path.join(dir, e.name);
      if (e.isDirectory()) { pilha.push(filho); continue; }
      if (!e.name.endsWith('.md')) continue;
      const m = mtime(filho, statImpl);
      if (m !== null && m > desdeMs) n += 1;
    }
  }
  return n;
}

/**
 * O beacon chegou ao git do vault, ou está só no disco?
 *
 * Devolve `'publicado'`, `'por-commitar'`, `'por-empurrar'`, ou `null` quando
 * não se consegue provar nada — e `null` NUNCA vira `ok`, pela mesma razão que
 * o `verCodigo` diz `n/d` quando não consegue falar com o remoto.
 */
export function provaDePublicacao(beaconFile, gitImpl = null) {
  const dir = path.dirname(String(beaconFile || ''));
  const correr = gitImpl || ((args) => {
    const { execFileSync } = require('node:child_process');
    return String(execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })).trim();
  });
  try {
    if (correr(['status', '--porcelain', '--', beaconFile])) return 'por-commitar';
  } catch { return null; }
  for (const alvo of ['@{u}..HEAD', 'origin/main..HEAD']) {
    try {
      const n = Number(correr(['rev-list', '--count', alvo]));
      if (Number.isFinite(n)) return n > 0 ? 'por-empurrar' : 'publicado';
    } catch { /* tenta o proximo */ }
  }
  return null;
}

/**
 * O beacon está mesmo a sair da máquina?
 *
 * Escrever o beacon não é publicá-lo. A 2026-08-19 `50-fleet/` nunca tinha sido
 * commitado: o ficheiro existia no disco de uma máquina e a frota era um device
 * só, sem nada no ecrã a dizê-lo.
 *
 * ESTA FUNÇÃO DIZIA ISSO E NÃO O VERIFICAVA — corrigido a 2026-08-23. Concluía
 * `ok · "escrito e a publicar"` a partir de duas provas que não provam
 * publicação nenhuma: uma variável de ambiente (declaração de intenção) e o
 * `mtime` do ficheiro local (prova de escrita). Nenhuma toca no git do vault.
 *
 * O custo foi medido no mesmo dia: o vault esteve ~20h com um rebase encravado,
 * o runner escrevia no log "escrito no disco, mas a frota nao o ve", e este
 * verificador dizia `ok` o tempo inteiro. A prova forte já existia no repo — o
 * `beacon-publisher.mjs` verifica que há git e que há remoto antes de dizer
 * "publicado" —, e esta função ignorava-a.
 *
 * O contra-exemplo estava dez linhas acima: o `verCodigo` diz `n/d` quando não
 * consegue comparar com o remoto, e só afirma "é o mesmo que o remoto" depois de
 * uma comparação real. Passa a ser esse o padrão aqui também.
 */
export function verBeacon(beaconFile, { statImpl = fs.statSync, agora = Date.now(), env = process.env, gitImpl = null } = {}) {
  const ligado = env.MOO_PUBLICAR_BEACON === '1';
  const quando = mtime(beaconFile, statImpl);
  if (quando === null) {
    return { id: 'beacon', estado: MAU, o_que: 'beacon deste device', porque: 'não existe — nenhuma outra máquina vê este device', resolver: 'confirma que o vault está montado e relança: npm run pilot' };
  }
  const min = Math.round((agora - quando) / 60000);
  if (!ligado) {
    return {
      id: 'beacon', estado: AVISO, o_que: 'beacon deste device', valor: `escrito há ${min} min`,
      porque: 'escrito no disco mas NÃO publicado — a frota fica num device só',
      resolver: 'export MOO_PUBLICAR_BEACON=1  (PowerShell: $env:MOO_PUBLICAR_BEACON = "1") e relança',
    };
  }
  if (min > BEACON_VELHO_MIN) {
    return {
      id: 'beacon', estado: MAU, o_que: 'beacon deste device', valor: `há ${min} min`,
      porque: 'a publicação está ligada mas o beacon não é escrito há demasiado tempo',
      resolver: 'vê o log do runner: a publicação falha em silêncio se o vault tiver trabalho em staging',
    };
  }
  const prova = provaDePublicacao(beaconFile, gitImpl);
  if (prova === 'por-commitar') {
    return {
      id: 'beacon', estado: AVISO, o_que: 'beacon deste device', valor: `escrito há ${min} min`,
      porque: 'o estado mais recente ainda não está commitado no vault — a frota vê a versão anterior',
      resolver: 'vê o log do runner: a publicação recusa-se a commitar por cima de um conflito ou de trabalho em staging',
    };
  }
  if (prova === 'por-empurrar') {
    return {
      id: 'beacon', estado: AVISO, o_que: 'beacon deste device', valor: `escrito há ${min} min`,
      porque: 'commitado no vault mas o vault não foi empurrado — nenhuma outra máquina o vê ainda',
      resolver: `git -C "${path.dirname(beaconFile)}" push`,
    };
  }
  if (prova === null) {
    return {
      id: 'beacon', estado: ND, o_que: 'beacon deste device', valor: `escrito há ${min} min`,
      porque: 'não consegui provar que saiu daqui (o vault não é git, não tem remoto, ou o git não respondeu)',
      resolver: null,
    };
  }
  return { id: 'beacon', estado: OK, o_que: 'beacon deste device', valor: `há ${min} min`, porque: 'escrito, commitado e empurrado', resolver: null };
}

/**
 * Há dois ficheiros a dizer qual é o projecto activo — e discordam?
 *
 * Medido a 2026-08-19: `cowork-session.json` dizia `mooter-pilar-coerencia` e
 * `sessoes/mooter.json` dizia `mooter-gpu-local-strategy`. Dois donos da mesma
 * verdade e nenhum árbitro no código.
 */
export function verProjectoActivo(mooDir, { readImpl = fs.readFileSync } = {}) {
  const ler = (p, chaves) => {
    try {
      const d = JSON.parse(String(readImpl(path.join(mooDir, p), 'utf8')));
      for (const k of chaves) if (d && typeof d[k] === 'string') return d[k];
      return null;
    } catch { return null; }
  };
  const a = ler('cowork-session.json', ['project', 'projecto', 'projeto']);
  const b = ler(path.join('sessoes', 'mooter.json'), ['projecto', 'project', 'projeto']);
  if (a === null || b === null) {
    return { id: 'projecto-activo', estado: ND, o_que: 'projecto activo', porque: 'só um dos dois ficheiros declara projecto — nada a comparar', resolver: null };
  }
  if (a === b) {
    return { id: 'projecto-activo', estado: OK, o_que: 'projecto activo', valor: a, porque: 'os dois ficheiros concordam', resolver: null };
  }
  return {
    id: 'projecto-activo', estado: MAU, o_que: 'projecto activo', valor: `${a} ≠ ${b}`,
    porque: 'dois ficheiros dizem qual é o projecto activo e discordam — quem ler primeiro decide, e isso é sorte',
    resolver: `decide qual vale e alinha o outro: ${path.join(mooDir, 'cowork-session.json')} · ${path.join(mooDir, 'sessoes/mooter.json')}`,
  };
}

/**
 * A statusline está degradada?
 *
 * O `~/.mooter/preferences.json` é lido por ~40 ficheiros e nunca foi escrito
 * nesta máquina. É a causa documentada no CLAUDE.md para a statusline cair a
 * 3 linhas — um sintoma que o dono via e ninguém ligava à causa.
 */
export function verPreferencias(mooDir, { existsImpl = fs.existsSync } = {}) {
  const p = path.join(mooDir, 'preferences.json');
  if (existsImpl(p)) {
    return { id: 'preferencias', estado: OK, o_que: 'preferências', valor: 'presente', porque: 'a statusline tem de onde ler', resolver: null };
  }
  return {
    id: 'preferencias', estado: AVISO, o_que: 'preferências', valor: 'em falta',
    porque: 'lido por ~40 ficheiros e nunca escrito — é a causa da statusline curta',
    resolver: `echo '{"statusline_line3": true}' > "${p}"`,
  };
}

/**
 * O código que está a correr é o mesmo que o repo tem?
 *
 * Num device novo isto é a primeira coisa que falha e a última em que se pensa:
 * clona-se, esquece-se o `git pull`, e passa-se uma hora a debugar um sintoma
 * que já foi corrigido há três commits. A pergunta não é "há actualizações" —
 * é "estou a correr o que julgo estar a correr".
 */
export function verCodigo(repoRoot, { runImpl = null } = {}) {
  const correr = runImpl || ((args) => {
    const { execFileSync } = require('node:child_process');
    return String(execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })).trim();
  });
  let atras = null;
  // `@{u}` primeiro (o upstream deste ramo), e `origin/main` como recurso: um
  // device a trabalhar num ramo sem upstream ficava sempre `n/d`, que e a
  // resposta honesta e tambem a inutil.
  for (const alvo of ['HEAD..@{u}', 'HEAD..origin/main']) {
    try { const n = Number(correr(['rev-list', '--count', alvo])); if (Number.isFinite(n)) { atras = n; break; } } catch { /* tenta o seguinte */ }
  }
  if (atras === null) {
    return { id: 'codigo', estado: ND, o_que: 'código deste device', porque: 'não consegui comparar com o remoto (sem upstream, sem origin/main, ou sem rede)', resolver: null };
  }
  if (!Number.isFinite(atras)) {
    return { id: 'codigo', estado: ND, o_que: 'código deste device', porque: 'a comparação com o remoto não deu um número', resolver: null };
  }
  if (atras === 0) {
    return { id: 'codigo', estado: OK, o_que: 'código deste device', valor: 'em dia', porque: 'é o mesmo que o remoto', resolver: null };
  }
  return {
    id: 'codigo', estado: MAU, o_que: 'código deste device', valor: `${atras} commits atrás`,
    porque: 'estás a correr código antigo — um sintoma já corrigido continua a aparecer aqui',
    resolver: 'git pull origin main   (e relança: npm run pilot)',
  };
}

/** As raízes do Claude Desktop, por sistema. A primeira que existir ganha. */
const RAIZES_CLAUDE = [
  ['Library', 'Application Support', 'Claude'],   // macOS
  ['AppData', 'Roaming', 'Claude'],               // Windows
];

/** O id da extensão do conector, como o Claude Desktop a instala em disco. */
export const ID_EXTENSAO = 'local.mcpb.paulo-loureiro.mooter';

/**
 * A versão do conector REALMENTE instalada, lida do artefacto e não do registo.
 *
 * PORQUE NÃO O REGISTO (medido a 2026-08-23, e custou um mês de alarme falso):
 * o `extensions-installations.json` desta máquina tinha mtime de **31/07** e
 * dizia `1.29.1`, enquanto o manifest da extensão instalada — mtime **21/08** —
 * dizia `1.49.3`. O Claude Desktop não o reescreve de forma fiável ao actualizar
 * uma extensão. O verificador pedia há semanas um gesto que já tinha sido feito.
 *
 * É a mesma lição do `sync-cockpit.mjs`, corrigido no mesmo dia: quando existe o
 * ARTEFACTO, ele é a prova; um ficheiro de registo é o que alguém disse que fez.
 * O registo fica como plano B, para o caso de a pasta não existir.
 */
export function versaoInstalada({ readImpl = fs.readFileSync, home = os.homedir() } = {}) {
  const ler = (p) => { try { return JSON.parse(String(readImpl(p, 'utf8'))); } catch { return null; } };
  for (const raiz of RAIZES_CLAUDE) {
    const m = ler(path.join(home, ...raiz, 'Claude Extensions', ID_EXTENSAO, 'manifest.json'));
    if (m && typeof m.version === 'string') return { versao: m.version, fonte: 'manifest' };
  }
  for (const raiz of RAIZES_CLAUDE) {
    const reg = ler(path.join(home, ...raiz, 'extensions-installations.json'));
    const ext = reg && reg.extensions
      ? Object.values(reg.extensions).find((e) => e && e.version && JSON.stringify(e).includes('mooter'))
      : null;
    if (ext && typeof ext.version === 'string') return { versao: ext.version, fonte: 'registo' };
  }
  return { versao: null, fonte: null };
}

/**
 * O conector instalado é o que este repo traz?
 *
 * Medido a 2026-08-19 nesta máquina: 1.33.0 instalado contra 1.49.3 no repo.
 * Nenhuma ferramenta MCP declara a versão que corre, por isso compara-se o
 * manifest do repo com o do conector instalado em disco (ver `versaoInstalada`).
 */
export function verConector(repoRoot, { readImpl = fs.readFileSync, home = os.homedir() } = {}) {
  const ler = (p) => { try { return JSON.parse(String(readImpl(p, 'utf8'))); } catch { return null; } };
  const manifest = ler(path.join(repoRoot, 'packages', 'mooter-bridge', 'manifest.json'));
  const noRepo = manifest && typeof manifest.version === 'string' ? manifest.version : null;
  if (!noRepo) {
    return { id: 'conector', estado: ND, o_que: 'conector', porque: 'o manifest do repo não declara versão', resolver: null };
  }
  const { versao: instalado } = versaoInstalada({ readImpl, home });
  if (!instalado) {
    return { id: 'conector', estado: ND, o_que: 'conector', valor: `${noRepo} no repo`, porque: 'não encontrei o registo de extensões do Claude Desktop nesta máquina', resolver: null };
  }
  if (instalado === noRepo) {
    return { id: 'conector', estado: OK, o_que: 'conector', valor: instalado, porque: 'o instalado é o que este repo traz', resolver: null };
  }
  return {
    id: 'conector', estado: MAU, o_que: 'conector', valor: `${instalado} instalado ≠ ${noRepo} no repo`,
    porque: 'as ferramentas MCP correm código de outra versão — o que vês no painel e o que a skill faz podem discordar',
    resolver: `instala o .mcpb da release v${noRepo} no Claude Desktop`,
  };
}

/**
 * Corre todas as verificações. Nunca lança: uma verificação que rebenta vira
 * `n/d` com o motivo, porque o alarme não pode ser a coisa que parte.
 */
export function autoVerificar({ paths, mooDir, vaultDir, beaconFile, repoRoot, agora, env } = {}) {
  const testes = [
    () => verCodigo(repoRoot || process.cwd()),
    () => verConector(repoRoot || process.cwd()),
    () => verLedger(paths || {}),
    () => verIndiceDoVault(vaultDir),
    () => verBeacon(beaconFile, { agora, env }),
    () => verProjectoActivo(mooDir || path.join(os.homedir(), '.mooter')),
    () => verPreferencias(mooDir || path.join(os.homedir(), '.mooter')),
  ];
  const itens = [];
  for (const t of testes) {
    try { itens.push(t()); } catch (e) {
      itens.push({ id: 'desconhecido', estado: ND, o_que: 'verificação', porque: String(e && e.message).slice(0, 120), resolver: null });
    }
  }
  const conta = { ok: 0, aviso: 0, mau: 0, 'n/d': 0 };
  for (const i of itens) conta[i.estado] = (conta[i.estado] || 0) + 1;
  return { itens, conta, pior: conta.mau > 0 ? MAU : conta.aviso > 0 ? AVISO : conta.ok > 0 ? OK : ND };
}
