'use strict';

/**
 * radar.js — Setup Radar: aponta a um repo e diz que fundações lá estão, sem escrever NADA.
 *
 * PORQUÊ ISTO EXISTE, na ordem certa:
 * O estranho que instala o Mooter não tem trabalho nosso para ver. Tem o trabalho DELE. O radar é
 * a primeira coisa que lhe devolve algo sobre o repositório dele — e é leitura pura, logo é a
 * única coisa que pode correr numa máquina desconhecida sem pedir confiança nenhuma.
 *
 * O QUE ELE NÃO É (a linha que não se atravessa):
 * Não avalia a QUALIDADE do código. Não diz se as instruções do agente são boas, se os testes
 * testam alguma coisa, ou se a memória está bem escrita. Mede PRESENÇA, TAMANHO e FRESCURA —
 * três coisas que um `fs` sabe. Tudo o resto sai `n/d` com o motivo. Um radar que fingisse julgar
 * qualidade a partir de um `readdir` seria exactamente a fabricação que este produto diz combater.
 *
 * INVARIANTES:
 * - **Zero escrita.** Só `readdirSync`/`statSync`/`readFileSync`. Nenhuma função deste ficheiro
 *   abre um handle de escrita. Há um teste que percorre a árvore antes e depois e falha se um
 *   único mtime/inode mudar.
 * - **Zero rede.** Não há `http` aqui de propósito.
 * - **Zero segredos.** Quando encontra um `.env`, regista que EXISTE e se está a ser seguido pelo
 *   git. Nunca abre, nunca lê, nunca conta linhas, nunca imprime uma única chave.
 * - **Zero deps.** Só builtins.
 * - **Nunca lança.** Pasta ilegível é um achado, não uma excepção.
 */

const fs = require('fs');
const path = require('path');

const DIAS = 24 * 60 * 60 * 1000;

/** Ficheiros/pastas que nunca vale a pena percorrer — e que enviesariam qualquer contagem. */
const IGNORAR = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage',
  '.venv', 'venv', '__pycache__', 'target', '.turbo', '.cache', 'vendor']);

function existe(p) { try { return fs.existsSync(p); } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }

/**
 * ⚠️ G4 (codex, 2026-08-02), achado nº5: `readFileSync` SEGUE symlinks. Num repo onde o
 * `.gitignore` fosse um symlink para o `.env`, o radar lia o `.env` inteiro para memória — não o
 * devolvia, mas lia. A promessa deste ficheiro («nunca abre, nunca lê» o `.env`) era mais forte
 * do que o código, e uma promessa a mais é a mesma doença que um número a mais.
 *
 * A partir daqui, o radar **recusa-se a seguir symlinks**: `lstatSync` decide, e um symlink é
 * tratado como ficheiro que não se lê. Um repo legítimo com `.gitignore` simbólico perde uma
 * verificação; um repo malicioso perde um vector. A troca é óbvia num relatório que se vende
 * como seguro para apontar a uma máquina desconhecida.
 */
function ler(p, maxBytes) {
  try {
    const l = fs.lstatSync(p);
    if (l.isSymbolicLink()) return null;
    if (!l.isFile()) return null;
    if (maxBytes && l.size > maxBytes) return fs.readFileSync(p, 'utf8').slice(0, maxBytes);
    return fs.readFileSync(p, 'utf8');
  } catch { return null; }
}
function listar(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }

/**
 * ⚠️ G4 (codex, 2026-08-02), achado nº7 (2ª parte): `existsSync('README.md')` encontra `ReadMe.md`
 * em Windows e macOS e **não** o encontra em Linux — o mesmo repositório dava relatórios
 * diferentes conforme a máquina de quem corre. Um radar que muda de resposta com o sistema de
 * ficheiros não é um radar. Aqui a procura é sempre sem sensibilidade a maiúsculas, em todo o lado.
 */
function encontrarSemCaso(entradas, nome) {
  const alvo = String(nome).toLowerCase();
  const e = entradas.find((x) => x.name.toLowerCase() === alvo);
  return e ? e.name : null;
}
function idadeDias(p) {
  const st = stat(p);
  if (!st) return null;
  return Math.floor((Date.now() - st.mtimeMs) / DIAS);
}

/** Percorre a árvore com tectos duros — um repo gigante não pode fazer o radar demorar minutos. */
function varrer(raiz, opts) {
  const o = opts || {};
  const maxFicheiros = o.maxFicheiros || 20000;
  const maxProfundidade = o.maxProfundidade || 6;
  const out = { ficheiros: 0, dirs: 0, porExtensao: {}, truncado: false, ilegiveis: [] };
  const stack = [{ dir: raiz, nivel: 0 }];
  while (stack.length) {
    const { dir, nivel } = stack.pop();
    if (nivel > maxProfundidade) { out.truncado = true; continue; }
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { out.ilegiveis.push({ dir, porque: (e && e.code) || 'ilegível' }); continue; }
    for (const e of entradas) {
      if (out.ficheiros >= maxFicheiros) { out.truncado = true; return out; }
      if (e.name.startsWith('.') && IGNORAR.has(e.name)) continue;
      if (IGNORAR.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { out.dirs++; stack.push({ dir: p, nivel: nivel + 1 }); }
      else if (e.isFile()) {
        out.ficheiros++;
        const ext = path.extname(e.name).toLowerCase() || '(sem extensão)';
        out.porExtensao[ext] = (out.porExtensao[ext] || 0) + 1;
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────── PILAR 1 · instruções ──

/**
 * As instruções que um agente lê ao entrar. Sem isto, cada sessão começa do zero e o agente
 * inventa convenções — é o gap de fundação mais caro e o mais fácil de fechar.
 */
function pilarInstrucoes(raiz) {
  const candidatos = [
    { f: 'CLAUDE.md', quem: 'Claude Code / Claude Desktop' },
    { f: 'AGENTS.md', quem: 'Codex, e qualquer agente que siga o padrão' },
    { f: 'GEMINI.md', quem: 'Gemini CLI' },
    { f: '.cursorrules', quem: 'Cursor' },
    { f: '.github/copilot-instructions.md', quem: 'GitHub Copilot' },
  ];
  const achados = [];
  for (const c of candidatos) {
    const p = path.join(raiz, c.f);
    const st = stat(p);
    if (st && st.isFile()) achados.push({ ficheiro: c.f, quem: c.quem, bytes: st.size, idade_dias: idadeDias(p) });
  }
  const notas = [];
  let estado = 'ausente';
  if (achados.length) {
    estado = 'presente';
    const magros = achados.filter((a) => a.bytes < 300);
    if (magros.length) notas.push(magros.map((m) => m.ficheiro).join(', ') + ' com menos de 300 bytes — provavelmente placeholder');
    const velhos = achados.filter((a) => a.idade_dias != null && a.idade_dias > 90);
    if (velhos.length) notas.push(velhos.map((v) => v.ficheiro + ' (' + v.idade_dias + 'd)').join(', ') + ' sem tocar há mais de 90 dias');
  }
  return {
    pilar: 'Instruções para agentes',
    estado,
    achados,
    // Presença e tamanho são mediveis; se as instruções são BOAS não é — e não se finge que é.
    qualidade: 'n/d (o radar mede presença, tamanho e frescura — não avalia conteúdo)',
    notas,
    porque_importa: 'sem um ficheiro de instruções, cada sessão de agente recomeça sem convenções e inventa as suas.',
    proximo_passo: achados.length ? null : 'criar um AGENTS.md com 20 linhas: o que é o projecto, como correr os testes, o que nunca fazer.',
  };
}

// ────────────────────────────────────────────────────────── PILAR 2 · skills ──

function pilarSkills(raiz) {
  const dirs = [
    { d: '.claude/skills', tipo: 'skills' },
    { d: '.claude/commands', tipo: 'slash commands' },
    { d: '.claude/agents', tipo: 'subagentes' },
  ];
  const achados = [];
  for (const c of dirs) {
    const p = path.join(raiz, c.d);
    if (!existe(p)) continue;
    const entradas = listar(p);
    const nomes = entradas.filter((e) => e.isDirectory() || /\.(md|MD)$/.test(e.name)).map((e) => e.name);
    if (nomes.length) achados.push({ pasta: c.d, tipo: c.tipo, quantos: nomes.length, exemplos: nomes.slice(0, 5) });
  }
  return {
    pilar: 'Skills e comandos',
    estado: achados.length ? 'presente' : 'ausente',
    achados,
    notas: [],
    porque_importa: 'o que se repete e não está numa skill volta a ser explicado a cada sessão — é trabalho pago duas vezes.',
    proximo_passo: achados.length ? null : 'a primeira skill costuma ser a mais óbvia: como correr os testes e o que fazer quando falham.',
  };
}

// ───────────────────────────────────────────────────────── PILAR 3 · memória ──

function pilarMemoria(raiz) {
  const alvos = [
    { f: 'MEMORY.md', o_que: 'decisões duráveis' },
    { f: 'LOOP.md', o_que: 'aprendizagens de execução' },
    { f: 'SYNC.md', o_que: 'estado corrente' },
    { f: 'docs/decisions', o_que: 'ADRs' },
    { f: 'docs/adr', o_que: 'ADRs' },
  ];
  const achados = [];
  for (const a of alvos) {
    const p = path.join(raiz, a.f);
    const st = stat(p);
    if (!st) continue;
    achados.push({
      alvo: a.f,
      o_que: a.o_que,
      tipo: st.isDirectory() ? 'pasta' : 'ficheiro',
      bytes: st.isDirectory() ? null : st.size,
      quantos: st.isDirectory() ? listar(p).length : null,
      idade_dias: idadeDias(p),
    });
  }
  const notas = [];
  const parados = achados.filter((a) => a.idade_dias != null && a.idade_dias > 30);
  if (parados.length) notas.push(parados.map((p) => p.alvo + ' (' + p.idade_dias + 'd)').join(', ') + ' sem escrita há mais de 30 dias — memória que parou é memória a envelhecer');
  return {
    pilar: 'Memória do projecto',
    estado: achados.length ? 'presente' : 'ausente',
    achados,
    notas,
    porque_importa: 'sem memória escrita, a decisão de ontem é re-discutida amanhã — e às vezes decidida ao contrário.',
    proximo_passo: achados.length ? null : 'um MEMORY.md com as 5 decisões que já custaram uma discussão cada.',
  };
}

// ─────────────────────────────────────────────────────────── PILAR 4 · loops ──

/**
 * "Loops" = o que corre sozinho: hooks, CI, agendamentos. É a diferença entre uma prática que
 * depende de alguém se lembrar e uma que dispara. O radar também procura loops MORTOS — um
 * workflow que nunca correu é pior que nenhum, porque dá sensação de cobertura.
 */
function pilarLoops(raiz) {
  const achados = [];
  const wf = path.join(raiz, '.github', 'workflows');
  if (existe(wf)) {
    const files = listar(wf).filter((e) => e.isFile() && /\.ya?ml$/.test(e.name));
    if (files.length) achados.push({ tipo: 'CI (GitHub Actions)', quantos: files.length, exemplos: files.slice(0, 5).map((f) => f.name) });
  }
  const settings = path.join(raiz, '.claude', 'settings.json');
  if (existe(settings)) {
    const txt = ler(settings, 200000);
    let hooks = null;
    try { const j = JSON.parse(txt || '{}'); hooks = j && j.hooks ? Object.keys(j.hooks) : null; } catch { hooks = null; }
    achados.push({
      tipo: 'hooks (.claude/settings.json)',
      quantos: hooks ? hooks.length : 0,
      exemplos: hooks || [],
      nota: hooks ? null : 'settings.json presente mas sem bloco `hooks` legível',
    });
  }
  for (const f of ['.pre-commit-config.yaml', '.husky', 'lefthook.yml']) {
    if (existe(path.join(raiz, f))) achados.push({ tipo: 'git hooks', quantos: 1, exemplos: [f] });
  }
  return {
    pilar: 'Loops automáticos',
    estado: achados.length ? 'presente' : 'ausente',
    achados,
    // Se um workflow CORREU é informação do GitHub, não do disco. Não se inventa.
    execucao: 'n/d (saber se um loop realmente correu exige o histórico do CI — o radar não sai do disco)',
    notas: [],
    porque_importa: 'a prática que depende de alguém se lembrar degrada; a que dispara sozinha, não.',
    proximo_passo: achados.length ? null : 'um workflow que corra os testes em cada push é o loop com melhor relação esforço/retorno.',
  };
}

// ──────────────────────────────────────────────────────── PILAR 5 · estrutura ──

/** Extensões que fazem de um repositório um repositório de CÓDIGO. */
const EXT_CODIGO = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java',
  '.rb', '.php', '.cs', '.swift', '.kt', '.c', '.cpp', '.h', '.sh', '.vue', '.svelte'];

function pilarEstrutura(raiz, varrimento) {
  const achados = [];
  const testDirs = ['test', 'tests', '__tests__', 'spec'].filter((d) => existe(path.join(raiz, d)));

  /**
   * ⚠️ Apanhado ao correr o radar contra um vault Obsidian real (2026-08-02): o relatório exigia
   * testes a um repositório de NOTAS. Conselho absurdo é pior que conselho nenhum — é a primeira
   * coisa que um estranho vê, e queima a credibilidade toda numa linha. Por isso: só se pede
   * testes a quem tem código, e a decisão é medida (proporção por extensão), não assumida.
   *
   * O limiar não é opinião: um vault Obsidian real mede **2,0% de código** (12 de 605 ficheiros)
   * e o repo do Mooter mede **38,8%** (2899 de 7471) — medido 2026-08-02. 10% separa os dois com
   * folga em ambos os lados. A contagem absoluta sozinha não chegava: o vault tem 12 ficheiros
   * `.js` reais (o retriever do 3rd-brain) e passava em qualquer tecto de contagem.
   */
  const ficheirosCodigo = EXT_CODIGO.reduce((n, e) => n + (varrimento.porExtensao[e] || 0), 0);
  const proporcaoCodigo = varrimento.ficheiros > 0 ? ficheirosCodigo / varrimento.ficheiros : 0;
  const ehCodigo = ficheirosCodigo >= 3 && proporcaoCodigo >= 0.10;

  let temTestes = testDirs.length > 0;
  // Ficheiros *.test.* / *.spec.* contam tanto como uma pasta de testes.
  let contagemTestes = 0;
  (function contar(dir, nivel) {
    if (nivel > 4 || contagemTestes > 50) return;
    for (const e of listar(dir)) {
      if (IGNORAR.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) contar(p, nivel + 1);
      else if (/\.(test|spec)\.[a-z]+$/i.test(e.name)) contagemTestes++;
    }
  })(raiz, 0);
  if (contagemTestes > 0) temTestes = true;
  achados.push({
    item: 'testes',
    // Num repo sem código, a ausência de testes não é uma falha — é o normal. `presente: null`.
    presente: ehCodigo ? temTestes : null,
    detalhe: !ehCodigo
      ? 'n/d — ' + ficheirosCodigo + ' de ' + varrimento.ficheiros + ' ficheiros são código ('
        + (proporcaoCodigo * 100).toFixed(1) + '%); isto não parece um repositório de código, e pedir testes seria conselho errado'
      : temTestes
        ? (contagemTestes > 0 ? contagemTestes + ' ficheiro(s) *.test/*.spec' + (contagemTestes > 50 ? '+ (contagem parou em 50)' : '') : 'pasta(s): ' + testDirs.join(', '))
        : 'nenhum ficheiro *.test/*.spec nem pasta de testes encontrada (até 4 níveis)',
  });

  const naRaiz = listar(raiz);
  const readme = encontrarSemCaso(naRaiz, 'README.md');
  achados.push({ item: 'README', presente: !!readme, detalhe: readme && readme !== 'README.md' ? 'encontrado como ' + readme : null });
  const gi = encontrarSemCaso(naRaiz, '.gitignore');
  achados.push({ item: '.gitignore', presente: !!gi, detalhe: gi && gi !== '.gitignore' ? 'encontrado como ' + gi : null });

  const notas = [];
  if (varrimento.truncado) notas.push('a varredura foi truncada (repo grande) — as contagens são um mínimo, não um total');
  if (varrimento.ilegiveis.length) notas.push(varrimento.ilegiveis.length + ' pasta(s) ilegíveis foram saltadas');

  // Itens com `presente: null` (não aplicáveis) não contam para nenhum dos lados do veredicto.
  const avaliaveis = achados.filter((a) => a.presente !== null);
  return {
    pilar: 'Estrutura',
    estado: avaliaveis.every((a) => a.presente) ? 'presente' : (avaliaveis.some((a) => a.presente) ? 'parcial' : 'ausente'),
    achados,
    parece_codigo: ehCodigo,
    ficheiros_codigo: ficheirosCodigo,
    proporcao_codigo: Number((proporcaoCodigo * 100).toFixed(1)),
    ficheiros_vistos: varrimento.ficheiros,
    pastas_vistas: varrimento.dirs,
    truncado: varrimento.truncado,
    notas,
    porque_importa: ehCodigo
      ? 'sem testes, nenhum agente pode provar que não partiu nada — e "os testes passam" deixa de ser uma frase disponível.'
      : 'num repositório sem código, a fundação que conta é a organização e o histórico — não a suite de testes.',
    proximo_passo: (!ehCodigo || temTestes) ? null : 'um único teste que corra o caminho feliz já dá a um agente um sinal de vida/morte.',
  };
}

// ─────────────────────────────────────────────────────────── PILAR 6 · git ──

/**
 * Git sem correr `git`: tudo lido de `.git/` no disco. Correr subprocessos numa pasta
 * desconhecida é precisamente o que um relatório "seguro" não deve fazer.
 */
function pilarGit(raiz) {
  const gitDir = path.join(raiz, '.git');
  if (!existe(gitDir)) {
    return {
      pilar: 'Git',
      estado: 'ausente',
      achados: [],
      notas: [],
      porque_importa: 'sem git não há como reverter o que um agente fizer — é a rede de segurança mínima.',
      proximo_passo: 'git init, e um primeiro commit antes de deixar qualquer agente escrever.',
    };
  }
  const achados = [];
  const head = ler(path.join(gitDir, 'HEAD'), 4096);
  const ramo = head && head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length).trim() : (head ? 'HEAD destacado' : null);
  achados.push({ item: 'ramo', valor: ramo || 'n/d (HEAD ilegível)' });

  const config = ler(path.join(gitDir, 'config'), 200000) || '';
  const temRemoto = /\[remote /.test(config);
  achados.push({ item: 'remoto', valor: temRemoto ? 'configurado' : 'nenhum — o trabalho só existe nesta máquina' });

  const notas = [];
  // .env: presença e se está a ser IGNORADO. Nunca abrimos o ficheiro.
  // Procura sem sensibilidade a maiúsculas (achado nº7 do G4): `.ENV` conta como `.env`.
  const naRaiz = listar(raiz);
  const envs = ['.env', '.env.local', '.env.production']
    .map((f) => encontrarSemCaso(naRaiz, f)).filter(Boolean);
  if (envs.length) {
    const gi = ler(path.join(raiz, '.gitignore'), 100000) || '';
    const cobertos = envs.filter((f) => gi.split(/\r?\n/).some((l) => {
      const t = l.trim().toLowerCase();
      return t === f.toLowerCase() || t === '.env*' || t === '*.env';
    }));
    const expostos = envs.filter((f) => !cobertos.includes(f));
    achados.push({
      item: 'ficheiros .env',
      valor: envs.length + ' encontrado(s) — conteúdo NUNCA lido pelo radar' + (expostos.length ? ' · ' + expostos.join(', ') + ' não aparece(m) no .gitignore' : ' · todos cobertos pelo .gitignore'),
    });
    if (expostos.length) notas.push('⚠️ ' + expostos.join(', ') + ' pode(m) ser commitado(s) por engano — confirma o .gitignore antes de deixar um agente fazer commits');
  }
  return {
    pilar: 'Git',
    estado: 'presente',
    achados,
    notas,
    porque_importa: 'sem git não há como reverter o que um agente fizer.',
    proximo_passo: temRemoto ? null : 'um remoto (mesmo privado) é o que separa "perdi tudo" de "clono outra vez".',
  };
}

// ──────────────────────────────────────────────────────────────── RELATÓRIO ──

/**
 * O relatório. **Não escreve nada** — nem sequer um ficheiro de cache.
 *
 * A pontuação é deliberadamente crua: pilares com fundação presente ÷ pilares avaliados, com o
 * denominador à vista (G12). Não é uma nota de qualidade e o próprio campo diz isso — é uma
 * contagem de presença. Inventar um 0-100 ponderado a partir de `existsSync` seria dar ares de
 * medição a um palpite.
 */
function radar(alvo, opts) {
  const o = opts || {};
  const raiz = path.resolve(String(alvo || process.cwd()));

  const st = stat(raiz);
  if (!st) return { ok: false, alvo: raiz, erro: 'caminho não existe', resumo: '🔴 não encontrei ' + raiz };
  if (!st.isDirectory()) return { ok: false, alvo: raiz, erro: 'não é uma pasta', resumo: '🔴 ' + raiz + ' não é uma pasta' };

  const varrimento = varrer(raiz, o);
  const pilares = [
    pilarInstrucoes(raiz),
    pilarSkills(raiz),
    pilarMemoria(raiz),
    pilarLoops(raiz),
    pilarEstrutura(raiz, varrimento),
    pilarGit(raiz),
  ];

  const presentes = pilares.filter((p) => p.estado === 'presente').length;
  const parciais = pilares.filter((p) => p.estado === 'parcial').length;
  const ausentes = pilares.filter((p) => p.estado === 'ausente');

  const passos = pilares.filter((p) => p.proximo_passo).map((p) => ({ pilar: p.pilar, o_que: p.proximo_passo }));
  const avisos = pilares.flatMap((p) => (p.notas || []).map((n) => ({ pilar: p.pilar, aviso: n })));

  const linhas = pilares.map((p) => (p.estado === 'presente' ? '🟢' : p.estado === 'parcial' ? '🟡' : '🔴') + ' ' + p.pilar
    + (p.estado === 'ausente' ? ' — ausente' : ''));

  return {
    ok: true,
    escreveu: false, // afirmação explícita, verificada por teste
    alvo: raiz,
    pontuacao: {
      presentes,
      parciais,
      total_pilares: pilares.length,
      denominador: 'pilares com fundação PRESENTE ÷ pilares avaliados — é uma contagem de presença, não uma nota de qualidade',
    },
    pilares,
    proximos_passos: passos.slice(0, 3),
    passos_todos: passos,
    avisos,
    varrimento: {
      ficheiros: varrimento.ficheiros,
      pastas: varrimento.dirs,
      truncado: varrimento.truncado,
      pastas_ilegiveis: varrimento.ilegiveis.length,
    },
    resumo: '🐮 radar · ' + presentes + '/' + pilares.length + ' pilares com fundação presente · ' + raiz + '\n'
      + linhas.join('\n')
      + (ausentes.length ? '\n\nO QUE FALTA (por ordem):\n' + passos.slice(0, 3).map((p, i) => (i + 1) + '. ' + p.pilar + ' — ' + p.o_que).join('\n') : '')
      + (avisos.length ? '\n\nAVISOS:\n' + avisos.map((a) => '· ' + a.aviso).join('\n') : '')
      + '\n\n(só leitura: o radar não escreveu nada neste repositório)',
  };
}

module.exports = { radar, pilarInstrucoes, pilarSkills, pilarMemoria, pilarLoops, pilarEstrutura, pilarGit, varrer };
