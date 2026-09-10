/**
 * probe.js — o device apresenta-se, em vez de o utilizador o descrever.
 *
 * O QUE ISTO SUBSTITUI. O `mooter init` fazia **onze perguntas** sobre coisas
 * que a maquina sabe responder melhor do que a pessoa: «tens Claude Max?»,
 * «tens uma OPENAI_API_KEY?», «usas o Cursor?». Tres problemas com isso:
 *
 *  1. A pessoa pode nao saber. «Tens um plano Pro do Claude Code?» e uma
 *     pergunta de faturacao, nao de configuracao.
 *  2. A pessoa pode enganar-se — e um perfil errado roteia mal para sempre,
 *     em silencio.
 *  3. Onze prompts sao onze oportunidades de desistir antes do 1.º recibo.
 *
 * A GPU NAO E REDESCOBERTA AQUI. `tools/router/gpu-probe.js` ja faz isso e ja
 * esta testado (nvidia-smi, Apple, AMD/Linux). Duplicar era criar uma segunda
 * verdade que divergiria em silencio — a licao das duas copias do `ollama-host`
 * e do `bin-resolver`, que so sobrevivem porque sao provadas contra a MESMA
 * tabela. Aqui nao ha fronteira de empacotamento nenhuma: e um `require`.
 *
 * ── R6, E E UMA LINHA QUE NAO SE ATRAVESSA ──────────────────────────────────
 * NUNCA se leem tokens nem sessoes das CLIs de terceiros. So tres coisas:
 * **presenca** (o binario existe?), **versao** (`--version`), e **estado de
 * login** por um comando read-only documentado de cada CLI.
 *
 * Nao se le `~/.claude/.credentials.json`, nem o keychain, nem `~/.codex/auth`.
 * Nao e so politica: um probe que le credenciais transforma o `mooter init` num
 * alvo — passa a ser um programa que vale a pena comprometer. Um probe que so
 * pergunta «estas logado?» nao tem nada que roubar.
 *
 * Todo o I/O e injectavel: os testes correm sem binario nenhum instalado.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

/** Quanto se espera por uma CLI antes de a dar por ausente. */
const TIMEOUT_MS = 4000;

/**
 * As CLIs que interessam, e COMO se pergunta a cada uma se tem sessao.
 *
 * `login` e um comando read-only e documentado. Onde nao existe um comando
 * desses, o campo e `null` e o resultado e `n/d` — nunca uma adivinhacao a
 * partir da existencia de um ficheiro de credenciais (isso seria ler a
 * credencial, ainda que so o nome dela).
 */
const CLIS = Object.freeze([
  { nome: 'claude', versao: ['--version'], login: null },
  { nome: 'codex', versao: ['--version'], login: null },
  { nome: 'gemini', versao: ['--version'], login: null },
  { nome: 'kimi', versao: ['--version'], login: null },
]);

/** Corre um comando e devolve stdout, ou `null` se falhar por qualquer razao. */
function correr(bin, args, o = {}) {
  const { execImpl = execFileSync, timeoutMs = TIMEOUT_MS } = o;
  try {
    return String(execImpl(bin, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    return null;
  }
}

/** RAM total do sistema, em MB. */
function ramMB(o = {}) {
  const { totalmemImpl = os.totalmem } = o;
  try {
    return Math.round(totalmemImpl() / 1024 / 1024);
  } catch {
    return null;
  }
}

/**
 * O Ollama: esta a atender, e que modelos tem.
 *
 * Pergunta-se a PORTA e nao so ao binario. Um `ollama` instalado e um `ollama`
 * a correr sao coisas diferentes, e o que interessa ao router e o segundo — o
 * primeiro sem o segundo produz exactamente o defeito que o `callOllama()` ja
 * teve: um motor $0 que falha MUDO e o trabalho a cair para um motor pago.
 */
async function ollama(o = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = 2000 } = o;
  // O `OLLAMA_HOST` canonico vem SEM esquema (`127.0.0.1:11434`) e concatenar
  // sem normalizar produz `fetch("127.0.0.1:11434/api/tags")` — um erro que o
  // `catch` engole, e o motor $0 falha MUDO enquanto o trabalho cai para um
  // motor pago (medido, #454/#458).
  //
  // A primeira versao disto normalizava aqui a mao, com uma regex propria.
  // Passava nos testes deste ficheiro e REPROVAVA a guarda de cobertura do
  // `ollama-host.test.js`, que existe precisamente para impedir uma segunda
  // implementacao: duas normalizacoes divergem, e divergem em silencio.
  // Uma copia so se justifica com fronteira de EMPACOTAMENTO (o bundle do CLI
  // nao arrasta codigo de fora do pacote) — e aqui nao ha nenhuma: e um require.
  const { ollamaHostFromEnv, normalizeHost } = require('../../router/ollama-host.js');
  const base = o.host ? normalizeHost(o.host) : ollamaHostFromEnv();
  try {
    const r = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { presente: false, porque: `a porta respondeu ${r.status}`, modelos: [] };
    const j = await r.json();
    const modelos = Array.isArray(j && j.models) ? j.models.map((m) => m.name).filter(Boolean) : [];
    return { presente: true, host: base, modelos, porque: `${modelos.length} modelo(s) em disco` };
  } catch {
    return { presente: false, porque: 'nada a atender em ' + base, modelos: [] };
  }
}

/**
 * As CLIs de subscricao. Presenca, versao, login — e mais nada (R6).
 *
 * O `login` fica `n/d` de propósito enquanto nenhuma destas CLIs tiver um
 * comando read-only documentado que responda a pergunta. `n/d` e a resposta
 * honesta; inferir a partir da existencia de um ficheiro de credenciais seria
 * atravessar a linha que a R6 desenha.
 */
function clis(o = {}) {
  const { lista = CLIS, ondeImpl = null } = o;
  return lista.map((c) => {
    const caminho = ondeImpl ? ondeImpl(c.nome) : ondeEsta(c.nome, o);
    if (!caminho) {
      return { nome: c.nome, presente: false, versao: null, login: 'n/d', porque: 'nao esta instalada' };
    }
    const v = correr(caminho, c.versao, o);
    return {
      nome: c.nome,
      presente: true,
      caminho,
      versao: v ? v.split('\n')[0].slice(0, 60) : null,
      login: c.login ? (correr(caminho, c.login, o) ? 'sim' : 'nao') : 'n/d',
      porque: c.login ? undefined : 'n/d — esta CLI nao tem comando read-only de estado de login',
    };
  });
}

/**
 * Onde esta um binario, SEM correr `which`.
 *
 * O `which` precisa ele proprio de estar no PATH, e o PATH e exactamente o
 * recurso que costuma faltar: o Claude Desktop e o launchd lancam processos com
 * `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, onde nao ha `gh`, nem `codex`, nem
 * nada instalado pelo utilizador. Ver `tools/cockpit/runner/gh-bin.mjs` e
 * `packages/mooter-bridge/bin-resolver.js` — o mesmo defeito, duas vezes.
 */
function ondeEsta(nome, o = {}) {
  const { existsImpl = fs.existsSync, home = os.homedir(), env = process.env, sep = require('path') } = o;
  const doPath = String(env.PATH || '').split(sep.delimiter).filter(Boolean);
  const extra = [
    sep.join(home, '.local', 'bin'),
    sep.join(home, '.local', 'node', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const d of [...doPath, ...extra]) {
    const p = sep.join(d, nome);
    try {
      if (existsImpl(p)) return p;
    } catch { /* continua */ }
  }
  return null;
}

/**
 * O retrato completo. Nunca lanca: um probe que rebenta e pior do que um probe
 * incompleto, porque o incompleto ainda deixa o `init` acabar.
 */
async function retrato(o = {}) {
  const { gpuImpl = null } = o;
  let gpu = null;
  try {
    gpu = gpuImpl ? gpuImpl() : require('../../router/gpu-probe.js').probeSync();
  } catch (e) {
    gpu = { vendor: 'n/d', porque: String((e && e.message) || e).slice(0, 80) };
  }
  return {
    plataforma: process.platform,
    ram_mb: ramMB(o),
    gpu,
    ollama: await ollama(o),
    clis: clis(o),
    medido_em: new Date().toISOString(),
  };
}

/**
 * O ecra 4 do canvas, em texto. Uma linha por facto, e `n/d` onde nao se sabe.
 * Devolve linhas (nao imprime): o que imprime e o `init`, e o que se testa e isto.
 */
function tabela(r) {
  const linhas = [];
  const gpuNome = (r.gpu && (r.gpu.name_short || r.gpu.name)) || 'n/d';
  const vram = r.gpu && r.gpu.vramMB ? `${(r.gpu.vramMB / 1024).toFixed(1)} GB` : 'n/d';
  linhas.push(`GPU        ${gpuNome}${r.gpu && r.gpu.vramMB ? ` · ${vram} utilizáveis` : ''}`);
  linhas.push(`RAM        ${r.ram_mb ? `${(r.ram_mb / 1024).toFixed(0)} GB` : 'n/d'}`);
  linhas.push(
    r.ollama.presente
      ? `Ollama     a atender · ${r.ollama.modelos.length} modelo(s)`
      : `Ollama     ausente — ${r.ollama.porque}`,
  );
  for (const c of r.clis) {
    linhas.push(
      c.presente
        ? `${c.nome.padEnd(10)} ${c.versao || 'versão n/d'} · login ${c.login}`
        : `${c.nome.padEnd(10)} não instalada`,
    );
  }
  return linhas;
}

module.exports = { CLIS, TIMEOUT_MS, correr, ramMB, ollama, clis, ondeEsta, retrato, tabela };
