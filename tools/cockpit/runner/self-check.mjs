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
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { MINUTOS_OMISSAO } from './beacon-publisher.mjs';

const require = createRequire(import.meta.url);

/** Acima disto o ledger devia já ter rodado — ver `rodarLedger`. */
export const LEDGER_TECTO_MB = 16;

/** Um beacon publicado há mais do que isto quer dizer que a frota está cega. */
export const BEACON_VELHO_MIN = 30;

/**
 * Quanto tempo um commit do beacon pode estar por empurrar sem que isso seja
 * problema do dono. É a cadência do publicador (`MINUTOS_OMISSAO`): abaixo
 * disto ele ainda não teve a sua passagem, ou está a meio dela — commita,
 * `pull --rebase`, empurra. Acima disto teve, e não empurrou.
 *
 * Amarrado à constante do publicador de propósito. Um número escrito à mão aqui
 * ficaria dessincronizado no dia em que a cadência mudasse, e o sintoma seria
 * exactamente o que a issue #374 descreve: um aviso a pedir um gesto que já foi
 * dado, ou pior, silêncio sobre um que ninguém deu.
 */
export const JANELA_DO_PUBLICADOR_MIN = MINUTOS_OMISSAO;

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
 * A PERGUNTA CERTA É A IDADE DO ÚLTIMO COMMIT, não se há diferença por commitar.
 * A primeira versão disto — escrita horas antes, no mesmo dia — tratava qualquer
 * ficheiro sujo como aviso. Medido logo a seguir: o publicador commita de 10 em
 * 15 minutos e o runner reescreve o ficheiro a cada ronda, portanto durante a
 * maior parte de qualquer janela EXISTE diferença por commitar. Isso é cadência,
 * não falha, e o aviso dispararia quase sempre.
 *
 * Trocar um `ok` falso por um alarme falso não é corrigir nada: um verificador
 * que grita de rotina é tão inútil como um que mente, e foi por isso que o
 * `sync-cockpit` e o `cert-guard` tiveram de ser corrigidos esta semana.
 *
 * O que importa: se o último commit é recente, o publicador está a trabalhar; se
 * está velho, parou. `por-empurrar` continua a ser aviso a sério — commits que
 * não saíram da máquina não são vistos por ninguém, independentemente da cadência.
 *
 * ⚠️ TERCEIRA CORRECÇÃO (2026-08-25, issue #374). O `por-empurrar` tinha a mesma
 * forma de erro que a 1ª versão, num intervalo mais curto — e duas causas
 * distintas, ambas corrigidas aqui:
 *
 * 1. **A pergunta era sobre o REPO, não sobre o beacon.** `rev-list --count
 *    @{u}..HEAD` conta QUALQUER commit à frente do remoto. Um commit do dono
 *    por empurrar no vault fazia isto declarar o beacon por publicar, com o
 *    beacon já lá. Passa a contar só os commits que tocam no ficheiro.
 *
 * 2. **A janela do publicador.** O `beacon-publisher` faz `commit` →
 *    `pull --rebase` → `push` seguidos. Entre o primeiro e o último corre um
 *    pedido à rede, e nessa janela existe mesmo um commit por empurrar. O
 *    `launch.mjs` é o disparador mais provável de todos: arranca o loop e
 *    verifica logo a seguir, portanto apanha a janela quase de propósito.
 *    Medido nesta máquina: commit `08:51:01`, aviso impresso, push `08:51:06`.
 *    Cinco segundos, e o aviso mandava o dono correr um `push` que respondia
 *    `Everything up-to-date`.
 *
 * O discriminador é a idade do **MAIS ANTIGO** commit por publicar, nunca a do
 * mais recente. Com o mais recente, um publicador avariado ficaria invisível
 * para sempre: ele reescreve o beacon a cada ronda, portanto haveria sempre um
 * commit de segundos atrás e o aviso nunca dispararia. Com o mais antigo, uma
 * única passagem falhada do publicador (`MINUTOS_OMISSAO`) põe o item de volta
 * na mão do dono, que é onde ele tem de estar.
 *
 * Devolve `{ estado, minDesdeCommit, minPorPublicar }` com estado em
 * `'publicado'`, `'a-publicar'`, `'por-empurrar'`, `'parado'`, `'nunca'`, ou
 * `null` quando não se consegue provar nada — e `null` NUNCA vira `ok`.
 */
export function provaDePublicacao(beaconFile, { gitImpl = null, agora = Date.now() } = {}) {
  const dir = path.dirname(String(beaconFile || ''));
  const correr = gitImpl || ((args) => {
    const { execFileSync } = require('node:child_process');
    return String(execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })).trim();
  });

  let ultimo;
  try {
    ultimo = correr(['log', '-1', '--format=%ct', '--', beaconFile]);
  } catch { return { estado: null, minDesdeCommit: null }; }
  if (!ultimo) return { estado: 'nunca', minDesdeCommit: null };

  const seg = Number(ultimo);
  if (!Number.isFinite(seg)) return { estado: null, minDesdeCommit: null };
  const minDesdeCommit = Math.round((agora - seg * 1000) / 60000);
  if (minDesdeCommit > BEACON_VELHO_MIN) return { estado: 'parado', minDesdeCommit };

  // Os commits QUE TOCAM NO BEACON e ainda não chegaram ao remoto, do mais
  // recente para o mais antigo. `--` isola o ficheiro: o que o dono tenha por
  // empurrar no resto do vault é problema dele, não prova nada sobre o beacon.
  let porPublicar = null;
  for (const alvo of ['@{u}..HEAD', 'origin/main..HEAD']) {
    try {
      const saida = correr(['log', alvo, '--format=%ct', '--', beaconFile]);
      porPublicar = saida ? saida.split('\n').map((l) => l.trim()).filter(Boolean) : [];
      break;
    } catch { /* tenta o proximo */ }
  }
  if (porPublicar === null) return { estado: null, minDesdeCommit, minPorPublicar: null };
  if (porPublicar.length === 0) return { estado: 'publicado', minDesdeCommit, minPorPublicar: null };

  // O MAIS ANTIGO, não o mais recente — ver a nota da terceira correcção.
  const maisAntigo = Number(porPublicar[porPublicar.length - 1]);
  if (!Number.isFinite(maisAntigo)) return { estado: 'por-empurrar', minDesdeCommit, minPorPublicar: null };
  const minPorPublicar = Math.round((agora - maisAntigo * 1000) / 60000);
  // Abaixo de uma passagem do publicador é a janela dele, não um gesto do dono.
  if (minPorPublicar < JANELA_DO_PUBLICADOR_MIN) {
    return { estado: 'a-publicar', minDesdeCommit, minPorPublicar };
  }
  return { estado: 'por-empurrar', minDesdeCommit, minPorPublicar };
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
  const { estado: prova, minDesdeCommit, minPorPublicar } = provaDePublicacao(beaconFile, { gitImpl, agora });
  if (prova === 'nunca') {
    return {
      id: 'beacon', estado: MAU, o_que: 'beacon deste device', valor: `escrito há ${min} min`,
      porque: 'nunca foi commitado no vault — existe só no disco desta máquina, e a frota é um device só',
      resolver: 'vê o log do runner: a publicação está a falhar em silêncio',
    };
  }
  if (prova === 'parado') {
    return {
      id: 'beacon', estado: MAU, o_que: 'beacon deste device', valor: `último commit há ${minDesdeCommit} min`,
      porque: `escrito mas não commitado há mais de ${BEACON_VELHO_MIN} min — a frota vê um estado velho`,
      resolver: 'vê o log do runner: a publicação recusa-se a commitar por cima de um conflito ou de trabalho em staging',
    };
  }
  if (prova === 'a-publicar') {
    // NÃO é `ok` — não saiu daqui, e afirmar "publicado" seria a mentira que a
    // 2ª correcção deste ficheiro veio matar. Também NÃO é `aviso`: o
    // `launch.mjs` põe todo o `aviso` debaixo de "FALTA O TEU GESTO — nada
    // disto um script pode fazer sozinho", e aqui um script faz, em segundos.
    // `n/d` é o balde honesto: sabe-se o que está a acontecer, e sabe-se que
    // ainda não acabou.
    return {
      id: 'beacon', estado: ND, o_que: 'beacon deste device', valor: `commitado há ${minPorPublicar} min`,
      porque: 'commitado e ainda dentro da passagem do publicador — ele empurra a seguir, sem gesto nenhum',
      resolver: null,
    };
  }
  if (prova === 'por-empurrar') {
    return {
      id: 'beacon', estado: AVISO, o_que: 'beacon deste device',
      valor: `por empurrar há ${minPorPublicar ?? minDesdeCommit} min`,
      porque: `commitado há mais de ${JANELA_DO_PUBLICADOR_MIN} min e o publicador não o empurrou — nenhuma outra máquina o vê`,
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
  // Uma diferença por commitar entre publicações é CADÊNCIA, não falha: o
  // publicador corre de 10 em 15 min e o runner reescreve o ficheiro a cada ronda.
  return { id: 'beacon', estado: OK, o_que: 'beacon deste device', valor: `publicado há ${minDesdeCommit} min`, porque: 'escrito, commitado e empurrado', resolver: null };
}

/**
 * Há dois ficheiros a dizer qual é o projecto activo — e discordam?
 *
 * Medido a 2026-08-19: `cowork-session.json` dizia `mooter-pilar-coerencia` e
 * `sessoes/mooter.json` dizia `mooter-gpu-local-strategy`. Dois donos da mesma
 * verdade e nenhum árbitro no código.
 */
const FONTES_DO_PROJECTO = Object.freeze([
  { ficheiro: 'cowork-session.json', chaves: ['project', 'projecto', 'projeto'],
    quando: ['realigned_at', 'bound_at'] },
  // Rotulo em POSIX de proposito: o `ficheiro` e ao mesmo tempo o caminho que se
  // junta ao `mooDir` (o `path.join` normaliza a barra sozinho) e o ROTULO que se
  // mostra ao dono. Com `path.join` aqui, o Windows dizia `sessoes\mooter.json` e
  // o mesmo self-check falava duas linguas conforme a maquina.
  { ficheiro: 'sessoes/mooter.json', chaves: ['projecto', 'project', 'projeto'],
    quando: ['actualizada_em', 'aberta_em'] },
]);

/**
 * QUAL DOS DOIS VALE — a precedência, decidida por medição e não por gosto.
 *
 * Até 2026-08-25 não havia árbitro nenhum: o `resolver` desta verificação dizia
 * ao dono «decide qual vale», e o código continuava a não saber. Quem lesse
 * primeiro decidia, e isso é sorte.
 *
 * A precedência é a FRESCURA, e a razão está nos dados, não numa preferência:
 * `sessoes/mooter.json` carrega `actualizada_em`, reescrito a cada ronda pelo
 * runner; `cowork-session.json` carrega `bound_at`, escrito UMA vez quando o
 * MCP entrega o `roots/list`. Medido nesta máquina a 2026-08-25: o primeiro
 * dizia `2026-08-25T14:54`, o segundo continuava em `2026-08-16` — nove dias a
 * afirmar um projecto que já não era o activo, e foi preciso um humano
 * realinhá-lo à mão.
 *
 * Empate, ou nenhum com data: ganha `sessoes/mooter.json`, porque é o único que
 * ALGUÉM actualiza sem ser pedido — e isso vai dito no `porque`, para não se
 * confundir uma regra de desempate com uma medição.
 *
 * @returns {{projecto:string|null, fonte:string|null, porque:string, candidatos:Array}}
 */
export function projectoActivo(mooDir, { readImpl = fs.readFileSync } = {}) {
  const candidatos = FONTES_DO_PROJECTO.map((f) => {
    let d = null;
    try { d = JSON.parse(String(readImpl(path.join(mooDir, f.ficheiro), 'utf8'))); } catch { d = null; }
    let projecto = null;
    if (d) for (const k of f.chaves) if (typeof d[k] === 'string') { projecto = d[k]; break; }
    let quando = null;
    if (d) {
      for (const k of f.quando) {
        const t = typeof d[k] === 'string' ? Date.parse(d[k]) : NaN;
        if (Number.isFinite(t)) { quando = t; break; }
      }
    }
    return { ficheiro: f.ficheiro, projecto, quando };
  });

  const comValor = candidatos.filter((c) => c.projecto !== null);
  if (!comValor.length) {
    return { projecto: null, fonte: null, porque: 'nenhum dos ficheiros declara projecto', candidatos };
  }
  if (comValor.length === 1) {
    return { projecto: comValor[0].projecto, fonte: comValor[0].ficheiro,
      porque: 'é o único que declara projecto', candidatos };
  }
  const [a, b] = comValor;
  if (a.projecto === b.projecto) {
    return { projecto: a.projecto, fonte: 'ambos', porque: 'os dois ficheiros concordam', candidatos };
  }
  const datados = comValor.filter((c) => c.quando !== null);
  if (datados.length === 2 && datados[0].quando !== datados[1].quando) {
    const vencedor = datados[0].quando > datados[1].quando ? datados[0] : datados[1];
    return { projecto: vencedor.projecto, fonte: vencedor.ficheiro,
      porque: `precedência por frescura — é o mais recentemente actualizado`, candidatos };
  }
  const desempate = comValor.find((c) => c.ficheiro.endsWith('mooter.json')) || comValor[0];
  return { projecto: desempate.projecto, fonte: desempate.ficheiro,
    porque: 'sem datas comparáveis — desempate declarado: vale o ficheiro que o runner actualiza sozinho',
    candidatos };
}

export function verProjectoActivo(mooDir, { readImpl = fs.readFileSync } = {}) {
  const r = projectoActivo(mooDir, { readImpl });
  const [a, b] = r.candidatos;
  if (a.projecto === null || b.projecto === null) {
    return { id: 'projecto-activo', estado: ND, o_que: 'projecto activo', porque: 'só um dos dois ficheiros declara projecto — nada a comparar', resolver: null };
  }
  if (a.projecto === b.projecto) {
    return { id: 'projecto-activo', estado: OK, o_que: 'projecto activo', valor: a.projecto, porque: 'os dois ficheiros concordam', resolver: null, fonte: r.fonte };
  }
  // Continua MAU: haver árbitro não torna a divergência aceitável — só deixa de
  // ser sorte. Baixar isto a aviso seria calar um alarme por o ter resolvido a
  // meio, que é como o `cowork-session.json` passou nove dias a mentir.
  return {
    id: 'projecto-activo', estado: MAU, o_que: 'projecto activo',
    valor: `${a.projecto} ≠ ${b.projecto}`,
    porque: `dois ficheiros dizem qual é o projecto activo e discordam — vale «${r.projecto}» (${r.fonte}): ${r.porque}`,
    resolver: `alinha o outro pelo que vale: ${path.join(mooDir, r.fonte)} diz «${r.projecto}»`,
    fonte: r.fonte, projecto: r.projecto,
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
/** Onde o Claude Desktop poe os ficheiros do conector instalado. */
export function pastaDoConectorInstalado({ home = os.homedir(), existsImpl = fs.existsSync } = {}) {
  for (const raiz of RAIZES_CLAUDE) {
    const dir = path.join(home, ...raiz, 'Claude Extensions', ID_EXTENSAO, 'server');
    if (existsImpl(dir)) return dir;
  }
  return null;
}

/**
 * DE ONDE VEM CADA FICHEIRO DO BUNDLE — lido da lista do `pack-mcpb.mjs`.
 *
 * A tentacao era casar por nome: `server/x.js` contra `packages/mooter-bridge/x.js`.
 * Medido a 2026-09-02, antes disto existir: dois falsos vermelhos PERMANENTES.
 * `server/package.json` vem de `bundle-package.json` (o bundle leva um
 * package.json minimo, escrito de proposito) e `server/version.json` vem de
 * `tools/router/version.json`. Um verificador que gritasse sempre seria
 * desligado na primeira semana, e passaria a nao verificar nada.
 *
 * Le-se o TEXTO do `pack-mcpb.mjs` e nao se importa o modulo: importa-lo
 * EXECUTA-O — ele constroi o `.mcpb` no topo do ficheiro, sem `main()`. Um
 * `/saude.json` que escrevesse um zip de 1,2 MB a cada pedido seria um
 * defeito muito pior do que o que esta a tentar apanhar. (Verificado: o
 * primeiro esboco desta funcao fez exactamente isso.)
 *
 * Falha ALTO: se a lista deixar de ser legivel, devolve `null` e quem chama
 * responde `n/d` — nunca `ok`.
 *
 * @returns {Array<[string,string]>|null} pares [origem-relativa-ao-pacote, destino-no-bundle]
 */
export function mapaDoBundle(repoRoot, { readImpl = fs.readFileSync } = {}) {
  let fonte;
  try { fonte = String(readImpl(path.join(repoRoot, 'packages', 'mooter-bridge', 'pack-mcpb.mjs'), 'utf8')); }
  catch { return null; }
  const i = fonte.indexOf('const FILES = [');
  if (i < 0) return null;
  const fim = fonte.indexOf('\n];', i);
  if (fim < 0) return null;
  const bloco = fonte.slice(i, fim);
  const pares = [];
  const re = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g;
  let m;
  while ((m = re.exec(bloco)) !== null) pares.push([m[1], m[2]]);
  return pares.length ? pares : null;
}

/** Extensoes cujo conteudo faz o conector correr. Um `.log` nao e codigo. */
const EXT_DE_CODIGO = /\.(js|mjs|cjs|json|html)$/i;

/**
 * COMPARAR SHAS, e nao versoes — C1.6.
 *
 * `1.53.0 instalado === 1.53.0 no repo` prova que dois ficheiros de texto tem a
 * mesma etiqueta. Nao prova que o codigo e o mesmo: um `.mcpb` construido antes
 * do ultimo commit da onda leva a mesma versao e outro conteudo, e o painel
 * dizia «o instalado e o que este repo traz» com toda a confianca. E a mesma
 * classe do `versaoInstalada`, que ja tinha aprendido isto uma vez: o
 * ARTEFACTO e a prova, o registo e o que alguem disse que fez. Aqui o artefacto
 * e o BYTE.
 *
 * Um ficheiro da lista que nao esteja instalado sai em `em_falta` — nao se
 * transforma numa divergencia de conteudo, que e coisa diferente e com outro
 * gesto.
 *
 * @returns {{comparados:number, diferentes:string[], em_falta:string[], porque:(string|null)}}
 */
export function shasDoConector(repoRoot, {
  home = os.homedir(), readImpl = fs.readFileSync, existsImpl = fs.existsSync,
  readdirImpl = fs.readdirSync,
} = {}) {
  const dir = pastaDoConectorInstalado({ home, existsImpl });
  if (!dir) return { comparados: 0, diferentes: [], em_falta: [], porque: 'não encontrei a pasta do conector instalado' };
  const mapa = mapaDoBundle(repoRoot, { readImpl });
  if (!mapa) return { comparados: 0, diferentes: [], em_falta: [], porque: 'não consegui ler a lista FILES do pack-mcpb.mjs' };
  const pacote = path.join(repoRoot, 'packages', 'mooter-bridge');
  const sha = (p) => {
    try { return crypto.createHash('sha256').update(readImpl(p)).digest('hex'); } catch { return null; }
  };
  const diferentes = []; const emFalta = [];
  let comparados = 0;
  for (const [origem, destino] of mapa) {
    const nome = destino.replace(/^server\//, '');
    if (!EXT_DE_CODIGO.test(nome)) continue;
    const noRepo = path.resolve(pacote, origem);
    const instalado = path.join(dir, nome);
    if (!existsImpl(instalado)) { emFalta.push(nome); continue; }
    const a = sha(instalado);
    const b = sha(noRepo);
    // Um `null` de qualquer lado e ilegivel, nao "diferente": afirmar
    // divergencia sem conseguir ler seria inventar o alarme.
    if (a == null || b == null) continue;
    comparados += 1;
    if (a !== b) diferentes.push(nome);
  }
  return { comparados, diferentes, em_falta: emFalta, porque: comparados ? null : 'nenhum ficheiro comparável dos dois lados' };
}

export function verConector(repoRoot, { readImpl = fs.readFileSync, home = os.homedir(), existsImpl = fs.existsSync, readdirImpl = fs.readdirSync } = {}) {
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
    /**
     * A VERSAO IGUAL E NECESSARIA, NAO SUFICIENTE. Ate 2026-09-02 este ramo
     * devolvia `ok` so por as duas etiquetas coincidirem — e um `.mcpb`
     * construido a meio da onda leva a mesma etiqueta e outro codigo.
     */
    const shas = shasDoConector(repoRoot, { home, readImpl, existsImpl, readdirImpl });
    if (shas.diferentes.length) {
      return {
        id: 'conector', estado: MAU, o_que: 'conector',
        valor: `${instalado} nos dois lados, mas ${shas.diferentes.length} de ${shas.comparados} ficheiro(s) diferem`,
        porque: `mesma versão, código diferente: ${shas.diferentes.slice(0, 4).join(', ')}`
          + (shas.diferentes.length > 4 ? ` (+${shas.diferentes.length - 4})` : ''),
        resolver: 'reconstrói e reinstala: `node packages/mooter-bridge/pack-mcpb.mjs` e instala o .mcpb no Claude Desktop',
        shas: { comparados: shas.comparados, diferentes: shas.diferentes, em_falta: shas.em_falta },
      };
    }
    if (!shas.comparados) {
      return {
        id: 'conector', estado: ND, o_que: 'conector', valor: instalado,
        porque: `a versão bate certo, mas não consegui comparar o código: ${shas.porque}`,
        resolver: null,
        shas: { comparados: 0, diferentes: [], em_falta: shas.em_falta },
      };
    }
    return {
      id: 'conector', estado: OK, o_que: 'conector', valor: instalado,
      porque: `o instalado é o que este repo traz — ${shas.comparados} ficheiro(s) conferidos byte a byte (sha256)`,
      resolver: null,
      shas: { comparados: shas.comparados, diferentes: [], em_falta: shas.em_falta },
    };
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
/**
 * A âncora do modo ANCORADO: nunca gerada, ou gerada e vazia?
 *
 * Estas duas coisas eram indistinguíveis, e a diferença custou o modo inteiro.
 * Medido a 2026-08-25: `ancorado` correu ZERO vezes em 10 624 recibos — não por
 * estar partido, por nunca ter tido entrada. O `ancora-achados.json` não existia
 * e nada no repositório o escrevia. O `readAnchor` devolve `[]` numa ausência (de
 * propósito, para não parar uma ronda) e a escada caía em silêncio para `caça`.
 *
 * Nenhum ecrã dizia a diferença, porque não havia onde a dizer. Agora há: o
 * `ancora.mjs` escreve um manifesto ao lado, e é ele que esta verificação lê.
 *
 * ⚠️ Uma âncora VAZIA não é um alerta. Hoje ela está vazia por medição — sete
 * regras candidatas, nenhuma passou o portão de existência — e um aviso por um
 * estado decidido seria ruído de rotina, que é o erro que este ficheiro já
 * corrigiu duas vezes noutros sítios. O que É alerta é nunca ter corrido.
 */
export function verAncora(mooDir, { readImpl = fs.readFileSync } = {}) {
  let m = null;
  try {
    const o = JSON.parse(readImpl(path.join(mooDir, 'ancora-manifesto.json'), 'utf8'));
    m = o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { m = null; }

  if (m === null) {
    return {
      id: 'ancora', estado: AVISO, o_que: 'âncora do modo ancorado',
      valor: 'nunca gerada',
      porque: 'sem manifesto não se distingue "âncora vazia" de "âncora que ninguém escreveu" — e foi essa confusão que deixou o modo ancorado a zero rondas em 10 624',
      resolver: 'node tools/cockpit/runner/ancora.mjs',
    };
  }

  const activas = Array.isArray(m.regras_activas) ? m.regras_activas.length : 0;
  const apontamentos = Number.isSafeInteger(m.apontamentos) && m.apontamentos >= 0 ? m.apontamentos : null;
  if (apontamentos === null) {
    return {
      id: 'ancora', estado: ND, o_que: 'âncora do modo ancorado',
      porque: 'manifesto sem contagem legível — não invento o número que ele devia ter',
      resolver: 'node tools/cockpit/runner/ancora.mjs',
    };
  }

  return {
    id: 'ancora', estado: OK, o_que: 'âncora do modo ancorado',
    valor: `${apontamentos} apontamentos · ${activas} regra(s) activa(s)`,
    porque: activas === 0
      ? 'vazia POR DECISÃO: nenhuma regra candidata passou o portão de existência — e agora isso está escrito, em vez de ser silêncio'
      : 'gerada pelo produtor, e o manifesto diz quando e com o quê',
    resolver: null,
  };
}

export function autoVerificar({ paths, mooDir, vaultDir, beaconFile, repoRoot, agora, env } = {}) {
  const casa = mooDir || path.join(os.homedir(), '.mooter');
  const testes = [
    () => verCodigo(repoRoot || process.cwd()),
    () => verConector(repoRoot || process.cwd()),
    () => verLedger(paths || {}),
    () => verIndiceDoVault(vaultDir),
    () => verBeacon(beaconFile, { agora, env }),
    () => verProjectoActivo(casa),
    () => verPreferencias(casa),
    () => verAncora(casa),
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
