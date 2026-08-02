'use strict';

/**
 * onboarding.js — os 5 gaps da auditoria de onboarding, fechados num sítio só.
 *
 * FONTE DOS GAPS (não re-descobertos — citados): `_handoff/SUPERMASTER_MAC_MINI.md:100-111`,
 * tabela «Top 5 gaps do onboarding (auditoria real, file:line)»:
 *
 *   1. git/gh nunca verificados no boot   → 6 verdes e o 1º job falha com "git not found"
 *   2. Falhas de Ollama indistinguíveis   → moo.js:32-59, tools6.js:71-73
 *   3. Vault n/d para sempre, sem dica    → journal.js:34-58
 *   4. `user_config` nunca validado       → manifest.json:40-66
 *   5. install-id efémero em silêncio     → install-id.js:45-59
 *   + extra: «não existe first-run de verdade» (linha 110)
 *
 * REGRAS DESTE FICHEIRO (as mesmas do resto do conector):
 * - Zero dependências. Só builtins do Node.
 * - **Nunca lança.** Uma dependência em falta é uma linha vermelha, não uma excepção.
 * - **Nunca inventa.** O que não foi medido sai `null`/`n/d` com o motivo ao lado.
 * - **Nunca imprime segredos.** Da `moonshot_api_key` só sai presença e forma — jamais o valor,
 *   nem um prefixo, nem os últimos dígitos. Ver `validarUserConfig`.
 * - Cada diagnóstico vermelho traz **uma linha de conserto accionável**, por OS. Um vermelho sem
 *   conserto é o mesmo que silêncio para quem acabou de instalar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const MOOTER_DIR = path.join(os.homedir(), '.mooter');
const INSTALL_FILE = path.join(MOOTER_DIR, 'install-id.json');

// ───────────────────────────────────────────────────────────── GAP 1 · git/gh ──

/**
 * Varre o PATH por um executável (com as extensões do Windows).
 * Cópia deliberada de `tools6.cliNoPath`: este módulo não pode depender de tools6.js,
 * porque é tools6.js que depende dele. Duplicação de 10 linhas < ciclo de require.
 */
function noPath(bin) {
  const dirs = String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(path.delimiter).filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      try { if (fs.existsSync(path.join(dir, bin + ext))) return true; } catch { /* pasta ilegível */ }
    }
  }
  return false;
}

/** Instrução de conserto de UMA linha, por OS. Sem isto, o vermelho não ensina nada. */
function comoInstalar(bin) {
  const p = process.platform;
  if (bin === 'git') {
    if (p === 'win32') return 'winget install --id Git.Git -e';
    if (p === 'darwin') return 'brew install git   (ou: xcode-select --install)';
    return 'sudo apt install git   (ou o gestor de pacotes da tua distro)';
  }
  if (bin === 'gh') {
    if (p === 'win32') return 'winget install --id GitHub.cli -e';
    if (p === 'darwin') return 'brew install gh';
    return 'ver cli.github.com/manual/installation';
  }
  return 'n/d (binário sem instrução registada)';
}

/**
 * GAP 1 — git e gh no boot.
 *
 * `git` é DURO: sem ele, o primeiro job que escreve falha com "git not found" depois de o
 * diagnóstico ter dado tudo verde. `gh` é MOLE: só a release/PR precisam dele.
 */
function verificarFerramentas() {
  const itens = [
    { bin: 'git', duro: true, para: 'worktrees, commits e qualquer job com write:true' },
    { bin: 'gh', duro: false, para: 'releases e PRs (o resto do Mooter funciona sem)' },
  ];
  const resultado = itens.map((it) => {
    const ok = noPath(it.bin);
    return {
      binario: it.bin,
      presente: ok,
      obrigatorio: it.duro,
      para: it.para,
      conserto: ok ? null : comoInstalar(it.bin),
    };
  });
  const faltaDuro = resultado.some((r) => !r.presente && r.obrigatorio);
  return {
    ok: !faltaDuro,
    itens: resultado,
    detalhe: resultado.filter((r) => !r.presente).length === 0
      ? 'git + gh no PATH'
      : resultado.filter((r) => !r.presente)
        .map((r) => r.binario + ' ausente' + (r.obrigatorio ? ' (obrigatório)' : ' (opcional)') + ' → ' + r.conserto)
        .join(' · '),
  };
}

// ──────────────────────────────────────────────────────────── GAP 2 · Ollama ──

/**
 * GAP 2 — porque é que o Ollama falhou.
 *
 * O `moo.js:32-59` (`listModels`) colapsa TODOS os modos de falha em `null`: timeout, daemon em
 * baixo, JSON ilegível, host errado — tudo vira "modelo local indisponível". Quem instalou não
 * tem por onde pegar. Esta função repete o probe e devolve a CAUSA, com o conserto ao lado.
 *
 * Não substitui `moo.listModels` — o caminho de execução continua lá. Isto é só o diagnóstico.
 */
function probeOllama(hostStr, timeoutMs) {
  const raw = String(hostStr || process.env.OLLAMA_HOST || '127.0.0.1:11434').replace(/^https?:\/\//, '');
  const [h, p] = raw.split(':');
  const host = h || '127.0.0.1';
  const port = Number(p) || 11434;
  const alvo = host + ':' + port;
  const timeout = timeoutMs || 1500;

  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(Object.assign({ alvo }, v)); } };
    let req;
    try {
      req = http.get({ host, port, path: '/api/tags', timeout }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { body += d; if (body.length > 500000) { try { req.destroy(); } catch { /* */ } } });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return finish({
              estado: 'resposta_inesperada',
              modelos: null,
              porque: 'HTTP ' + res.statusCode + ' em /api/tags — há algo à escuta em ' + alvo + ', mas não é o Ollama',
              conserto: 'confirma OLLAMA_HOST; outra aplicação pode estar a ocupar a porta ' + port,
            });
          }
          let j = null;
          try { j = JSON.parse(body); } catch {
            return finish({
              estado: 'resposta_ilegivel',
              modelos: null,
              porque: 'o Ollama respondeu em ' + alvo + ' mas o corpo não é JSON válido',
              conserto: 'actualiza o Ollama (ollama.com/download) — a API /api/tags mudou ou está corrompida',
            });
          }
          const modelos = ((j && j.models) || []).map((m) => m.model || m.name).filter(Boolean);
          if (!modelos.length) {
            return finish({
              estado: 'sem_modelos',
              modelos: [],
              porque: 'o Ollama está a correr em ' + alvo + ' e não tem nenhum modelo instalado',
              conserto: 'ollama pull qwen2.5-coder:7b   (~4,7 GB — o mais pequeno que serve para código)',
            });
          }
          return finish({ estado: 'ok', modelos, porque: null, conserto: null });
        });
      });
    } catch (e) {
      return finish({
        estado: 'erro_local',
        modelos: null,
        porque: 'não foi possível sequer abrir o pedido: ' + ((e && e.message) || String(e)),
        conserto: 'verifica o formato de OLLAMA_HOST (esperado `host:porta`, ex.: 127.0.0.1:11434)',
      });
    }
    req.on('timeout', () => {
      try { req.destroy(); } catch { /* */ }
      finish({
        estado: 'timeout',
        modelos: null,
        porque: 'ninguém respondeu em ' + alvo + ' dentro de ' + timeout + ' ms',
        conserto: 'o Ollama pode estar a carregar um modelo grande — repete daqui a pouco; se persistir, reinicia-o',
      });
    });
    req.on('error', (e) => {
      const code = (e && e.code) || '';
      if (code === 'ECONNREFUSED') {
        return finish({
          estado: 'sem_daemon',
          modelos: null,
          porque: 'ligação recusada em ' + alvo + ' — o Ollama não está a correr',
          conserto: process.platform === 'win32'
            ? 'abre a app Ollama (ou `ollama serve` num terminal). Não a tens? ollama.com/download'
            : 'ollama serve   (não o tens? ollama.com/download)',
        });
      }
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return finish({
          estado: 'host_desconhecido',
          modelos: null,
          porque: 'o nome `' + host + '` não resolve',
          conserto: 'corrige OLLAMA_HOST no formulário de instalação (default: 127.0.0.1:11434)',
        });
      }
      return finish({
        estado: 'erro_rede',
        modelos: null,
        porque: 'erro de rede ' + (code || 'desconhecido') + ' ao contactar ' + alvo,
        conserto: 'verifica firewall/proxy para ' + alvo,
      });
    });
  });
}

/** O que o modo $0 perde quando o Ollama não está lá — dito sem rodeios. */
function degradacaoSemOllama(estado) {
  if (estado === 'ok') return null;
  return 'sem Ollama: o modo $0 (moo) fica indisponível — todo o trabalho passa a custar dinheiro na nuvem. O resto do Mooter funciona.';
}

// ───────────────────────────────────────────────────────────── GAP 3 · vault ──

/**
 * GAP 3 — vault ausente vira `n/d` eterno, sem dica.
 *
 * `journal.js:34-58` já escolhe bem (MOOTER_VAULT → VAULT_PATH → raiz do home). O que falta é
 * dizer ao utilizador NOVO o que fazer quando nada é encontrado — e o que ele perde entretanto.
 */
function estadoVault(vaultStatusFn) {
  let st = null;
  try {
    const fn = vaultStatusFn || require('./journal.js').vaultStatus;
    st = fn();
  } catch (e) {
    return {
      ok: false,
      root: null,
      porque: 'journal.js indisponível: ' + ((e && e.message) || String(e)),
      conserto: 'reinstala o conector — o bundle está incompleto',
      perde: 'sem vault: nada do que aprendes fica registado entre sessões.',
    };
  }
  if (st && st.available) {
    return { ok: true, root: st.root, fonte: st.source || null, ultima_nota: st.last_note || null, porque: null, conserto: null, perde: null };
  }
  return {
    ok: false,
    root: null,
    porque: 'nenhuma pasta com `.obsidian/` encontrada' + (st && st.checked ? ' (' + st.checked + ' caminhos testados)' : ''),
    conserto: 'preenche «Vault Obsidian» no formulário do conector, ou exporta MOOTER_VAULT=/caminho/para/o/vault',
    perde: 'sem vault: o painel fica com `registado_no_vault: n/d` para sempre e o aprendido morre com a sessão.',
  };
}

// ───────────────────────────────────────────────────── GAP 4 · user_config ──

/**
 * GAP 4 — `user_config` nunca validado no boot (`manifest.json:40-66`).
 *
 * Os 4 campos chegam por variáveis de ambiente. Se o utilizador escrever um caminho que não
 * existe, ou colar a key com espaços, só descobre quando um job falha — às vezes dias depois.
 *
 * ⚠️ SEGREDO: `moonshot_api_key` é lida **apenas** para saber se está presente e se tem forma
 * plausível. O valor nunca entra no retorno, nem em log, nem em mensagem de erro. Não devolvemos
 * prefixo nem sufixo — mascarar ainda é revelar.
 */
function validarUserConfig(env) {
  const e = env || process.env;
  const campos = [];
  const usable = (v) => v != null && String(v).indexOf('${') < 0 && String(v).trim() !== '';

  const dirCampo = (nome, valor, opcional, dica) => {
    if (!usable(valor)) {
      campos.push({ campo: nome, estado: 'vazio', ok: !!opcional, detalhe: opcional ? 'não preenchido — o Mooter detecta sozinho' : 'obrigatório e vazio', conserto: opcional ? null : dica });
      return;
    }
    const v = String(valor).trim();
    let existe = false; let isDir = false;
    try { const st = fs.statSync(v); existe = true; isDir = st.isDirectory(); } catch { /* não existe */ }
    if (!existe) campos.push({ campo: nome, estado: 'caminho_inexistente', ok: false, detalhe: 'aponta para um caminho que não existe', conserto: 'corrige «' + nome + '» no formulário do conector' });
    else if (!isDir) campos.push({ campo: nome, estado: 'nao_e_pasta', ok: false, detalhe: 'aponta para um ficheiro, não uma pasta', conserto: 'escolhe a PASTA, não um ficheiro dentro dela' });
    else campos.push({ campo: nome, estado: 'ok', ok: true, detalhe: v, conserto: null });
  };

  dirCampo('vault_path (MOOTER_VAULT)', e.MOOTER_VAULT, true);
  dirCampo('repo_path (MOOTER_REPO)', e.MOOTER_REPO, true);

  // ollama_host — só forma; a ligação é o gap 2, medido à parte.
  const hostRaw = e.OLLAMA_HOST;
  if (!usable(hostRaw)) {
    campos.push({ campo: 'ollama_host (OLLAMA_HOST)', estado: 'vazio', ok: true, detalhe: 'não preenchido — usa o default 127.0.0.1:11434', conserto: null });
  } else {
    const h = String(hostRaw).trim().replace(/^https?:\/\//, '');
    const formaOk = /^[A-Za-z0-9._-]+(:\d{1,5})?$/.test(h);
    campos.push({
      campo: 'ollama_host (OLLAMA_HOST)',
      estado: formaOk ? 'ok' : 'forma_invalida',
      ok: formaOk,
      detalhe: formaOk ? h : 'esperado `host:porta`, recebido algo que não encaixa nesse formato',
      conserto: formaOk ? null : 'usa `127.0.0.1:11434` (sem http://, sem barra no fim)',
    });
  }

  // moonshot_api_key — presença e forma. O VALOR nunca sai daqui.
  const keyRaw = e.MOONSHOT_API_KEY;
  if (!usable(keyRaw)) {
    campos.push({ campo: 'moonshot_api_key', estado: 'ausente', ok: true, detalhe: 'não preenchida — o agente kimi fica indisponível; o resto funciona', conserto: null });
  } else {
    const k = String(keyRaw);
    const temEspacos = /\s/.test(k);
    const comprimentoPlausivel = k.trim().length >= 20;
    const ok = !temEspacos && comprimentoPlausivel;
    campos.push({
      campo: 'moonshot_api_key',
      estado: ok ? 'presente' : 'forma_suspeita',
      ok,
      // sem valor, sem prefixo, sem sufixo — apenas o veredicto de forma
      detalhe: ok ? 'presente (valor nunca é impresso)' : (temEspacos ? 'contém espaços ou quebras de linha — provável erro de cópia' : 'curta demais para ser uma key válida'),
      conserto: ok ? null : 'volta a copiar a key de platform.moonshot.ai, sem espaços à volta',
    });
  }

  const maus = campos.filter((c) => !c.ok);
  return {
    ok: maus.length === 0,
    campos,
    detalhe: maus.length === 0 ? 'os 4 campos validados' : maus.map((m) => m.campo + ': ' + m.detalhe).join(' · '),
  };
}

// ────────────────────────────────────────────────────────── GAP 5 · install-id ──

/**
 * GAP 5 — install-id efémero em silêncio (`install-id.js:45-59`).
 *
 * Quando `~/.mooter` não é gravável, o `catch` fica vazio e o UUID passa a nascer novo a cada
 * arranque. A telemetria local (e a contagem de instalações) quebra sem uma única palavra.
 * Aqui a diferença entre persistente e efémero é MEDIDA no disco e DECLARADA.
 */
function estadoInstallId() {
  let ficheiroExiste = false;
  try { ficheiroExiste = fs.existsSync(INSTALL_FILE); } catch { /* ilegível */ }

  if (ficheiroExiste) {
    let first = null;
    try { first = (JSON.parse(fs.readFileSync(INSTALL_FILE, 'utf8')) || {}).first_seen || null; } catch { /* corrompido */ }
    if (first) return { ok: true, persistente: true, first_seen: first, porque: null, conserto: null };
    return {
      ok: false, persistente: true, first_seen: null,
      porque: 'install-id.json existe mas está ilegível ou corrompido',
      conserto: 'apaga ' + INSTALL_FILE + ' — é regenerado no próximo arranque (perde-se só a data de 1ª instalação)',
    };
  }

  // Não existe: é primeira vez, ou não conseguimos escrever? A diferença importa — medimo-la.
  let gravavel = false; let motivo = null;
  try {
    fs.mkdirSync(MOOTER_DIR, { recursive: true });
    const teste = path.join(MOOTER_DIR, '.write-probe-' + process.pid);
    fs.writeFileSync(teste, 'x', 'utf8');
    fs.unlinkSync(teste);
    gravavel = true;
  } catch (err) { motivo = (err && err.code) || (err && err.message) || String(err); }

  if (gravavel) return { ok: true, persistente: true, first_seen: null, porque: 'primeira execução — o id será escrito agora', conserto: null };
  return {
    ok: false, persistente: false, first_seen: null,
    porque: '~/.mooter não é gravável (' + motivo + ') — o install-id é EFÉMERO: muda a cada arranque',
    conserto: process.platform === 'win32'
      ? 'dá permissão de escrita a ' + MOOTER_DIR + ' (Propriedades → Segurança)'
      : 'chmod u+w ' + MOOTER_DIR,
  };
}

// ─────────────────────────────────────────────────────────── EXTRA · first-run ──

/**
 * «Não existe first-run de verdade» (`SUPERMASTER_MAC_MINI.md:110`).
 *
 * O sinal é a ausência de `~/.mooter/install-id.json` ANTES de qualquer coisa lhe tocar — é por
 * isso que esta função tem de ser chamada no arranque, antes de `getInstallId()`.
 */
function ehPrimeiraVez() {
  try { return !fs.existsSync(INSTALL_FILE); } catch { return false; }
}

/**
 * O boot completo: os 5 gaps medidos + os próximos passos que resultam do que foi medido.
 *
 * Devolve SEMPRE — nunca lança. Cada bloco traz `ok`, `porque` e `conserto`.
 */
async function boot(opts) {
  const o = opts || {};
  const primeira = o.primeiraVez != null ? !!o.primeiraVez : ehPrimeiraVez();

  const ferramentas = verificarFerramentas();
  const config = validarUserConfig(o.env);
  const vault = estadoVault(o.vaultStatusFn);
  const install = estadoInstallId();
  let ollama;
  try { ollama = await probeOllama(o.ollamaHost, o.timeoutMs); }
  catch (e) { ollama = { estado: 'erro_local', modelos: null, porque: (e && e.message) || String(e), conserto: null, alvo: 'n/d' }; }

  const passos = [];
  // Ordem deliberada: primeiro o que bloqueia, depois o que degrada, depois o que só regista.
  for (const it of ferramentas.itens) {
    if (!it.presente && it.obrigatorio) passos.push({ prioridade: 'bloqueia', o_que: 'Instalar ' + it.binario, comando: it.conserto, porque: 'sem isto o 1º job com write:true falha (' + it.para + ')' });
  }
  if (!config.ok) for (const c of config.campos.filter((x) => !x.ok)) passos.push({ prioridade: 'bloqueia', o_que: 'Corrigir ' + c.campo, comando: c.conserto, porque: c.detalhe });
  if (ollama.estado !== 'ok') passos.push({ prioridade: 'degrada', o_que: 'Pôr o Ollama a responder', comando: ollama.conserto, porque: degradacaoSemOllama(ollama.estado) });
  if (!vault.ok) passos.push({ prioridade: 'degrada', o_que: 'Apontar o vault', comando: vault.conserto, porque: vault.perde });
  if (!install.ok) passos.push({ prioridade: 'regista', o_que: 'Tornar ~/.mooter gravável', comando: install.conserto, porque: install.porque });
  for (const it of ferramentas.itens) {
    if (!it.presente && !it.obrigatorio) passos.push({ prioridade: 'opcional', o_que: 'Instalar ' + it.binario, comando: it.conserto, porque: it.para });
  }

  const bloqueios = passos.filter((p) => p.prioridade === 'bloqueia').length;
  const pronto = bloqueios === 0;

  return {
    primeira_vez: primeira,
    pronto_para_trabalhar: pronto,
    bloqueios,
    ferramentas,
    ollama: Object.assign({}, ollama, { degradacao: degradacaoSemOllama(ollama.estado) }),
    vault,
    user_config: config,
    install_id: install,
    proximos_passos: passos.slice(0, 3),
    passos_todos: passos,
    resumo: pronto
      ? (primeira ? '🐮 primeira vez — nada te bloqueia. ' + (passos.length ? passos.length + ' melhoria(s) opcionais abaixo.' : 'Está tudo verde.')
        : 'nada bloqueia' + (passos.length ? ' · ' + passos.length + ' melhoria(s) pendentes' : ' · tudo verde'))
      : '⛔ ' + bloqueios + ' coisa(s) bloqueiam o primeiro trabalho — ver proximos_passos',
  };
}

module.exports = {
  verificarFerramentas,
  probeOllama,
  degradacaoSemOllama,
  estadoVault,
  validarUserConfig,
  estadoInstallId,
  ehPrimeiraVez,
  boot,
  noPath,
  comoInstalar,
  INSTALL_FILE,
};
