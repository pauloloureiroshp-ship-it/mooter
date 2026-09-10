/**
 * conectores.js — registar o Mooter onde a pessoa ja trabalha.
 *
 * Tres sitios, e nenhum deles se assume:
 *   · Claude Desktop  — escreve-se no `claude_desktop_config.json`
 *   · Claude Code     — `claude mcp add mooter …`, se a CLI existir
 *   · Codex CLI       — `codex mcp add mooter …`, se a CLI existir
 *
 * ── PORQUE HA BACKUP, E PORQUE ELE NAO E OPCIONAL ──────────────────────────
 * O `claude_desktop_config.json` NAO e nosso. Tem os conectores que a pessoa
 * configurou, alguns com credenciais la dentro. Reescrever esse ficheiro sem
 * copia e apostar que o nosso parser, o nosso merge e o nosso disco estao todos
 * bons ao mesmo tempo — e se a aposta correr mal, o que se perde nao e o nosso
 * conector: sao os outros. O backup e datado e fica ao lado, e o caminho e
 * IMPRESSO, para a recuperacao nao depender de a pessoa adivinhar onde ficou.
 *
 * ── E PORQUE SE RECUSA ESCREVER NUM FICHEIRO QUE NAO SE PERCEBEU ───────────
 * Se o JSON existente nao fizer parse, nao se escreve por cima. Um ficheiro
 * ilegivel pode ser um ficheiro corrompido — ou pode ser um formato novo que
 * este codigo ainda nao conhece. Nos dois casos, substitui-lo por um objecto
 * so com o Mooter apaga o trabalho de outra pessoa.
 *
 * ── B8: «reinicia o Claude Desktop» ────────────────────────────────────────
 * Escrever a configuracao nao faz o conector aparecer: o Desktop le o ficheiro
 * ao arrancar. Sem essa frase, a pessoa fica a olhar para uma janela onde o
 * Mooter «nao esta» e conclui que a instalacao falhou.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { ondeEsta } = require('./probe.js');

/** Onde o Claude Desktop guarda a configuracao, por plataforma. */
function caminhoDoDesktop(o = {}) {
  const { plataforma = process.platform, home = os.homedir(), env = process.env } = o;
  if (plataforma === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (plataforma === 'win32') {
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude', 'claude_desktop_config.json');
}

/**
 * Regista no Claude Desktop. Devolve `{ ok, codigo, porque, backup }`.
 * `comando`/`args` sao injectados para o teste nao depender de caminhos reais.
 */
function registarNoDesktop(o = {}) {
  const {
    fsImpl = fs,
    comando = process.execPath,
    args = [],
    nome = 'mooter',
    agoraImpl = () => new Date().toISOString().replace(/[:.]/g, '-'),
  } = o;
  const caminho = caminhoDoDesktop(o);

  let cfg = {};
  let backup = null;

  if (fsImpl.existsSync(caminho)) {
    let cru;
    try {
      cru = fsImpl.readFileSync(caminho, 'utf8');
    } catch (e) {
      return { ok: false, codigo: 'ilegivel', porque: `nao consegui ler ${caminho}: ${String(e.message).slice(0, 60)}` };
    }
    try {
      cfg = JSON.parse(cru);
    } catch {
      return {
        ok: false,
        codigo: 'json-invalido',
        porque:
          `${caminho} existe mas nao e JSON valido. NAO lhe toquei — se o reescrevesse, ` +
          'perdias os conectores que ja la tens. Corrige-o (ou apaga-o) e corre outra vez.',
      };
    }
    // Backup ANTES de qualquer escrita, e com o caminho a vista.
    backup = `${caminho}.mooter-backup-${agoraImpl()}`;
    try {
      fsImpl.copyFileSync(caminho, backup);
    } catch (e) {
      return { ok: false, codigo: 'sem-backup', porque: `nao consegui fazer copia de seguranca (${String(e.message).slice(0, 60)}) — nao escrevi nada` };
    }
  }

  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};
  const jaLa = !!cfg.mcpServers[nome];
  cfg.mcpServers[nome] = { command: comando, args };

  try {
    fsImpl.mkdirSync(path.dirname(caminho), { recursive: true });
    fsImpl.writeFileSync(caminho, JSON.stringify(cfg, null, 2) + '\n');
  } catch (e) {
    return { ok: false, codigo: 'sem-escrita', porque: `nao consegui escrever ${caminho}: ${String(e.message).slice(0, 60)}`, backup };
  }

  return {
    ok: true,
    codigo: jaLa ? 'actualizado' : 'registado',
    // B8 — a frase que evita a conclusao errada.
    porque: `${jaLa ? 'Actualizei' : 'Registei'} o Mooter no Claude Desktop. **Reinicia o Claude Desktop** para ele aparecer.`,
    caminho,
    backup,
  };
}

/**
 * Regista numa CLI (`claude` ou `codex`) via o seu proprio `mcp add`.
 *
 * B9 — se a CLI nao estiver instalada, isto NAO e um erro: devolve o comando
 * exacto para quando ela existir. Tratar «ainda nao instalaste» como falha
 * ensina a pessoa a ignorar os nossos erros.
 */
function registarNaCli(cli, o = {}) {
  const { execImpl = execFileSync, comando = process.execPath, args = [], nome = 'mooter', timeoutMs = 10000 } = o;
  const bin = o.ondeImpl ? o.ondeImpl(cli) : ondeEsta(cli, o);
  const argv = ['mcp', 'add', nome, '--', comando, ...args];

  if (!bin) {
    return {
      ok: true,
      codigo: 'cli-ausente',
      porque: `A CLI \`${cli}\` nao esta instalada — registo o conector quando estiver.`,
      comando_para_depois: `${cli} ${argv.join(' ')}`,
    };
  }
  try {
    execImpl(bin, argv, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, codigo: 'registado', porque: `Mooter registado no \`${cli}\`.` };
  } catch (e) {
    return {
      ok: false,
      codigo: 'falhou',
      porque: `O \`${cli} mcp add\` falhou: ${String((e && e.message) || e).slice(0, 100)}`,
      comando_para_depois: `${cli} ${argv.join(' ')}`,
    };
  }
}

/** Regista onde der. Nunca lanca; devolve um relatorio por destino. */
function registarTudo(o = {}) {
  return {
    desktop: registarNoDesktop(o),
    claude: registarNaCli('claude', o),
    codex: registarNaCli('codex', o),
  };
}

module.exports = { caminhoDoDesktop, registarNoDesktop, registarNaCli, registarTudo };
