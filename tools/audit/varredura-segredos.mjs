/**
 * varredura-segredos.mjs — a bateria de segredos sobre os DOIS corpora, zero-LLM.
 *
 * Porque existe, medido a 2026-08-25:
 *
 *   · o repo `mooter` e **PUBLICO** (`gh repo view` → PUBLIC, 3241 ficheiros
 *     tracked). Um token commitado aqui e um token no mundo, indexado em
 *     minutos, e revoga-lo depois nao desfaz a copia que ja foi clonada.
 *   · o vault `paulo-vault` e **PRIVADO** (917 ficheiros tracked) — o que nao
 *     torna um segredo la dentro inofensivo, torna-o so menos publico. E o
 *     vault e onde vivem os `_handoff/`, que sao escritos por AGENTES com
 *     tokens vivos em contexto: e o sitio mais provavel para um acidente.
 *
 * O guarda que ja existia (`.github/workflows/slack-spike-test.yml` → job
 * `segredos`) varre a arvore toda do repo, mas so a procura de tokens do
 * **Slack**, e nunca olhou para o vault — que nem sequer e o mesmo repositorio.
 * Isto e a bateria completa sobre os dois.
 *
 * ── DECISOES QUE ESTA FERRAMENTA NAO TOMA SOZINHA ────────────────────────────
 *
 * NAO escreve um detector novo. Reutiliza `scanSecrets` de
 * `packages/vscode-extension/src/lp-secret-scan.js` — que ja e puro, ja e
 * testado, ja redige a 4 caracteres por construcao e ja distingue um
 * placeholder de uma chave. Uma segunda bateria de regex seria uma segunda
 * verdade a divergir da primeira no primeiro mes.
 *
 * NAO varre o disco: varre o que o **git segue**. Um segredo num ficheiro
 * ignorado (`.env.local`) nao saiu da maquina; um segredo tracked ja saiu ou
 * vai sair no proximo push. E a diferenca entre um risco e um incidente.
 *
 * NAO inventa severidade. O mesmo achado vale coisas diferentes conforme o
 * corpo onde esta, e a tabela e explicita (`severidade()`).
 *
 * Uso:
 *   node tools/audit/varredura-segredos.mjs                 # repo + vault (se montado)
 *   node tools/audit/varredura-segredos.mjs --json          # saida para maquina
 *   node tools/audit/varredura-segredos.mjs --repo <dir> --vault <dir>
 *   node tools/audit/varredura-segredos.mjs --sem-vault     # so o repo (o que o CI corre)
 *
 * Saida: 0 = sem HIGH. 1 = ha HIGH (parar e reportar). 2 = a varredura em si falhou.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(aqui, '..', '..');

const require_ = createRequire(import.meta.url);

/**
 * O detector. Carregado do sitio onde ja e testado, nunca copiado para aqui —
 * uma copia seria a garantia de que as duas divergem.
 */
function carregarDetector(raizRepo) {
  const p = path.join(raizRepo, 'packages', 'vscode-extension', 'src', 'lp-secret-scan.js');
  if (!fs.existsSync(p)) {
    throw new Error(`detector nao encontrado em ${p} — a varredura nao corre sem ele, e nao inventa um substituto`);
  }
  return require_(p);
}

/** Ficheiros que o git segue. E o unico corpus que interessa: o que sai da maquina. */
export function ficheirosTracked(dir, { runImpl = execFileSync } = {}) {
  const out = String(runImpl('git', ['ls-files', '-z'], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  }) || '');
  return out.split('\0').map((s) => s.trim()).filter(Boolean);
}

/**
 * Binarios e ficheiros enormes nao se varrem: um `.png` nao tem um token, e um
 * lockfile de 3 MB so faria a varredura demorar. O que se SALTA fica contado e
 * dito, nunca calado — uma varredura que nao diz o que nao olhou e uma
 * varredura que finge cobertura.
 */
const EXT_BINARIA = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.pdf', '.zip',
  '.gz', '.tgz', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.mp3',
  '.wav', '.node', '.wasm', '.mcpb', '.vsix', '.bin', '.gguf', '.safetensors',
]);
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Caminhos pessoais numa arvore PUBLICA.
 *
 * Nao e um segredo — e uma fuga de contexto: o username do dono, a estrutura de
 * disco das maquinas dele, e (quando ha um hostname) o nome do device. Vale
 * `LOW` porque nao da acesso a nada; vale mais do que zero porque um `.md`
 * publico com `/Users/<nome>/...` diz a um atacante exactamente que caminho
 * tentar num payload. No vault (privado) isto e o comportamento CORRECTO — os
 * circuitos `operar/` tem de ter caminhos reais — por isso so corre no repo.
 */
const PESSOAIS = [
  { re: /\/Users\/[A-Za-z0-9._-]+/g, tipo: 'caminho-pessoal-macos' },
  { re: /C:\\Users\\[A-Za-z0-9._-]+/gi, tipo: 'caminho-pessoal-windows' },
  { re: /\/home\/[A-Za-z0-9._-]+/g, tipo: 'caminho-pessoal-linux' },
];

/**
 * Os genericos que NAO sao pessoais. `/Users/runner` e o CI da GitHub,
 * `/home/runner` idem, `/Users/user` e um exemplo de documentacao. Marcar estes
 * encheria o relatorio de ruido e ensinaria toda a gente a ignora-lo — que e
 * como um guarda morre.
 */
const UTILIZADORES_GENERICOS = new Set([
  'runner', 'user', 'username', 'you', 'youruser', 'your-user', 'me', 'root',
  'ubuntu', 'node', 'ci', 'test', 'example', 'someone', 'dev', 'developer',
  'vscode', 'admin', 'linuxbrew',
]);

export function acharPessoais(caminho, conteudo) {
  const achados = [];
  const linhas = conteudo.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    for (const { re, tipo } of PESSOAIS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(linhas[i])) !== null) {
        const utilizador = m[0].split(/[\\/]/).pop();
        if (UTILIZADORES_GENERICOS.has(String(utilizador).toLowerCase())) continue;
        achados.push({
          path: caminho, line: i + 1, type: tipo, severity: 'warning',
          // Mesma disciplina de redaccao do detector de segredos: o relatorio
          // pode acabar num log publico do CI, portanto nao repete o nome todo.
          preview: `${m[0].slice(0, m[0].length - String(utilizador).length)}${String(utilizador).slice(0, 3)}…`,
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return achados;
}

/**
 * ── DUMMIES PUBLICOS E CABECALHOS SEM CORPO ─────────────────────────────────
 *
 * Medido a 2026-08-25, primeira corrida desta bateria: 14 achados HIGH, e os
 * 14 eram dummies de documentacao ou fixtures dos testes que provam que os
 * proprios redactores funcionam. Um guarda que grita 14 vezes por nada ensina
 * toda a gente a nao o ouvir — e essa e a forma mais comum de um guarda morrer.
 *
 * A excepcao NAO vai para o detector. `lp-secret-scan.js` corre no projecto de
 * um UTILIZADOR, onde ser estrito e o comportamento certo: la, um `AKIA...` num
 * teste pode mesmo ser um acidente. A excepcao vive aqui, na camada que sabe
 * uma coisa que o detector nao pode saber — que ESTE repo tem, por profissao,
 * ficheiros cujo conteudo sao segredos falsos.
 *
 * E nunca se apaga um achado: baixa-se para INFO **com o motivo escrito**. Um
 * achado que some em silencio e indistinguivel de um achado que nunca houve.
 */

/** Dummies de valor EXACTO. Lista curta e justificada, uma linha por entrada. */
const DUMMIES = new Map([
  // Publicada pela propria AWS na documentacao oficial dela. E a chave falsa
  // mais citada do mundo; encontra-la nao e um achado, e uma citacao.
  ['AKIAIOSFODNN7EXAMPLE', 'dummy oficial da documentacao da AWS'],
  // Alfabeto sequencial: o payload declara-se falso a olho.
  ['AKIAABCDEFGHIJKLMNOP', 'alfabeto sequencial — fixture do proprio lp-secret-scan'],
  ['sk-ant-abcdefghijklmnop1234567890', 'fixture publica do sanitizador (ja allowlisted no detector)'],
  ['sk-ant-abcdefghij0123456789XYZ', 'alfabeto sequencial — fixture do audit_pii_redactor'],
  // Encontrado a 2026-08-26 pela varredura do HISTORICO, nao pela da arvore:
  // vive em `packages/mooter-bridge/egress.test.js` numa branch LOCAL que nunca
  // foi empurrada (`kimi-egress/fail-closed`). Alfabeto sequencial a seguir ao
  // prefixo `api03-` — declara-se falso a olho.
  ['sk-ant-api03-abcdefghijklmnop', 'alfabeto sequencial — fixture do egress.test.js do mooter-bridge'],
]);

/**
 * Um cabecalho PEM SEM corpo e uma mencao, nao uma chave.
 *
 * `-----BEGIN RSA PRIVATE KEY-----` sozinho, como literal num teste, nao
 * desencripta nada: falta-lhe a chave. Isto e uma regra, nao uma excepcao
 * coladinha — vale para qualquer ficheiro, hoje e no futuro, e continua a
 * apanhar em HIGH o dia em que alguem colar o corpo a seguir ao cabecalho.
 *
 * Corpo = uma corrida base64 longa a seguir ao cabecalho, na mesma linha ou nas
 * cinco seguintes (um PEM real quebra a ~64 colunas, portanto a primeira linha
 * de corpo aparece logo).
 */
export function pemSemCorpo(conteudo, linha1Based) {
  const linhas = String(conteudo).split('\n');
  const i = linha1Based - 1;
  const resto = (linhas[i] || '').split('-----').pop();
  const seguintes = [resto, ...linhas.slice(i + 1, i + 6)];
  return !seguintes.some((l) => /[A-Za-z0-9+/=]{40,}/.test(String(l)));
}

/**
 * Um achado e um dummy declarado? Devolve o MOTIVO (string) ou null.
 * `null` = trata-se como o detector disse.
 */
export function motivoDeDummy(achado, conteudo) {
  const linhas = String(conteudo).split('\n');
  const linha = linhas[achado.line - 1] || '';
  for (const [valor, porque] of DUMMIES) {
    if (linha.includes(valor)) return porque;
  }
  if (achado.type === 'pem-private-key' && pemSemCorpo(conteudo, achado.line)) {
    return 'cabecalho PEM sem corpo — uma mencao, nao uma chave';
  }
  return null;
}

/**
 * A tabela de severidade. Um achado nao vale o mesmo nos dois corpora, e a
 * unica coisa que decide e o raio de dano.
 *
 *   segredo `critical` em repo PUBLICO  → HIGH  (esta no mundo; revogar ja)
 *   segredo `critical` em vault PRIVADO → HIGH  (uma chave e uma chave)
 *   segredo `warning`  em repo PUBLICO  → LOW   (heuristica; corrigir em PR)
 *   segredo `warning`  em vault PRIVADO → INFO  (privado + heuristica)
 *   caminho pessoal    em repo PUBLICO  → LOW
 */
export function severidade(achado, corpus, motivoDummy = null) {
  // Um dummy DECLARADO nunca e HIGH — mas continua no relatorio, com o motivo,
  // para que a proxima pessoa possa discordar da classificacao sem ter de a
  // redescobrir.
  if (motivoDummy) return 'INFO';
  if (String(achado.type).startsWith('caminho-pessoal')) return corpus.publico ? 'LOW' : 'INFO';
  if (achado.severity === 'critical') return 'HIGH';
  return corpus.publico ? 'LOW' : 'INFO';
}

/** Varre UM corpus. Nunca lanca por um ficheiro: um ficheiro ilegivel e um ficheiro contado. */
export function varrerCorpus(corpus, {
  detector, readImpl = fs.readFileSync, statImpl = fs.statSync, listaImpl = ficheirosTracked,
} = {}) {
  const achados = [];
  const saltados = { binarios: 0, grandes: 0, ilegiveis: 0 };
  let lidos = 0;
  let ficheiros;
  try {
    ficheiros = listaImpl(corpus.dir);
  } catch (e) {
    return { ...corpus, erro: `git ls-files falhou: ${String(e && e.message).slice(0, 120)}`, achados: [], lidos: 0, saltados, total: 0 };
  }

  for (const rel of ficheiros) {
    if (EXT_BINARIA.has(path.extname(rel).toLowerCase())) { saltados.binarios++; continue; }
    const abs = path.join(corpus.dir, rel);
    try {
      if (statImpl(abs).size > MAX_BYTES) { saltados.grandes++; continue; }
    } catch { saltados.ilegiveis++; continue; }
    let texto;
    try {
      texto = String(readImpl(abs, 'utf8'));
    } catch { saltados.ilegiveis++; continue; }
    // Um NUL diz binario melhor do que qualquer lista de extensoes.
    if (texto.includes('\0')) { saltados.binarios++; continue; }
    lidos++;

    for (const a of detector.scanSecrets([{ path: rel, content: texto }])) {
      const dummy = motivoDeDummy(a, texto);
      achados.push({ ...a, corpus: corpus.nome, dummy, nivel: severidade(a, corpus, dummy) });
    }
    if (corpus.publico) {
      for (const a of acharPessoais(rel, texto)) {
        achados.push({ ...a, corpus: corpus.nome, nivel: severidade(a, corpus) });
      }
    }
  }
  return { ...corpus, erro: null, achados, lidos, saltados, total: ficheiros.length };
}

const ORDEM = { HIGH: 0, LOW: 1, INFO: 2 };

export function varrer({ repo, vault, detector }) {
  const corpora = [];
  if (repo) corpora.push({ nome: 'repo', dir: repo, publico: true });
  if (vault) corpora.push({ nome: 'vault', dir: vault, publico: false });
  const resultados = corpora.map((c) => varrerCorpus(c, { detector }));
  const achados = resultados.flatMap((r) => r.achados)
    .sort((a, b) => (ORDEM[a.nivel] - ORDEM[b.nivel]) || String(a.path).localeCompare(String(b.path)));
  const conta = (n) => achados.filter((a) => a.nivel === n).length;
  const caminhos = achados.filter((a) => a.nivel === 'LOW' && String(a.type).startsWith('caminho-pessoal')).length;
  return {
    resultados,
    achados,
    resumo: {
      HIGH: conta('HIGH'),
      LOW: conta('LOW'),
      INFO: conta('INFO'),
      // Decomposto porque as duas metades do LOW pedem accoes diferentes: um
      // `generic-secret-assignment` le-se um a um, um caminho pessoal e uma
      // varredura-e-substitui.
      LOW_caminhos: caminhos,
      LOW_segredos: conta('LOW') - caminhos,
    },
  };
}

function principal(argv) {
  const arg = (n, omissao) => {
    const i = argv.indexOf(n);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : omissao;
  };
  const json = argv.includes('--json');
  const repo = path.resolve(arg('--repo', RAIZ_REPO));
  let vault = null;
  if (!argv.includes('--sem-vault')) {
    const v = arg('--vault', process.env.VAULT_PATH || path.join(os.homedir(), 'paulo-vault'));
    if (v && fs.existsSync(path.join(v, '.git'))) vault = path.resolve(v);
  }

  let detector;
  try {
    detector = carregarDetector(repo);
  } catch (e) {
    console.error(`ERRO: ${e.message}`);
    return 2;
  }

  const r = varrer({ repo, vault, detector });

  if (json) {
    console.log(JSON.stringify({ ...r, vault_montado: Boolean(vault) }, null, 2));
    return r.resumo.HIGH > 0 ? 1 : 0;
  }

  console.log('=== varredura de segredos · zero-LLM, $0 ===');
  for (const c of r.resultados) {
    if (c.erro) { console.log(`  ${c.nome}: ERRO — ${c.erro}`); continue; }
    console.log(`  ${c.nome} (${c.publico ? 'PUBLICO' : 'privado'}): ${c.lidos}/${c.total} ficheiros lidos`
      + ` · saltados ${c.saltados.binarios} binarios, ${c.saltados.grandes} grandes, ${c.saltados.ilegiveis} ilegiveis`);
  }
  if (!vault) console.log('  vault: NAO MONTADO — este resultado nao diz nada sobre ele');

  if (!r.achados.length) {
    console.log('\nsem achados.');
    return 0;
  }
  console.log('');
  /**
   * Segredos linha a linha; caminhos pessoais AGREGADOS por ficheiro.
   *
   * Medido na primeira corrida: 1226 caminhos pessoais em 455 ficheiros, quase
   * todos logs arquivados em `_handoff/`. Imprimir 1226 linhas nao e mais
   * honesto do que imprimir 455 — e menos, porque ninguem le 1226 linhas e o
   * relatorio deixa de ser lido de todo. O numero total continua no resumo e o
   * detalhe todo continua no `--json`; `--tudo` imprime linha a linha.
   */
  const eCaminho = (a) => String(a.type).startsWith('caminho-pessoal');
  const tudo = argv.includes('--tudo');
  for (const a of r.achados) {
    if (eCaminho(a) && !tudo) continue;
    const nota = a.dummy ? ` · declarado dummy: ${a.dummy}` : '';
    console.log(`  [${a.nivel}] ${a.corpus}:${a.path}:${a.line} · ${a.type} · ${a.preview}${nota}`);
  }
  if (!tudo) {
    const porFicheiro = new Map();
    for (const a of r.achados) {
      if (!eCaminho(a)) continue;
      const k = `${a.corpus}:${a.path}`;
      porFicheiro.set(k, (porFicheiro.get(k) || 0) + 1);
    }
    if (porFicheiro.size) {
      const ord = [...porFicheiro.entries()].sort((x, y) => y[1] - x[1]);
      console.log(`\n  caminhos pessoais em arvore PUBLICA — ${r.resumo.LOW_caminhos} ocorrencias em ${ord.length} ficheiros`);
      console.log('  (divida de higiene pre-existente, nao um incidente: nao dao acesso a nada. `--tudo` para linha a linha.)');
      for (const [f, n] of ord.slice(0, 10)) console.log(`    ${String(n).padStart(4)}  ${f}`);
      if (ord.length > 10) console.log(`    …  e mais ${ord.length - 10} ficheiros (ver --json)`);
    }
  }
  console.log(`\nHIGH ${r.resumo.HIGH} · LOW ${r.resumo.LOW} · INFO ${r.resumo.INFO}`);
  if (r.resumo.HIGH > 0) {
    console.log('\nHIGH presente: PARAR e reportar ao dono. Revogar antes de reescrever historico —');
    console.log('um segredo commitado num repo publico conta-se como comprometido a partir do push,');
    console.log('e apagar o commit nao apaga os clones.');
  }
  return r.resumo.HIGH > 0 ? 1 : 0;
}

const chamadoDirectamente = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (chamadoDirectamente) process.exit(principal(process.argv.slice(2)));
