/**
 * r24-exposicao.mjs — como o tratamento é exposto, e como se prova que foi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE FICHEIRO FECHA (D1, decisão do dono a 2026-09-04)
 *
 * Até aqui a única diferença entre os braços era, no controlador:
 *
 *     if (braco === 'OFF') args.push('--setting-sources', 'project,local');
 *
 * O comentário logo acima dizia que isso «arrasta» effortLevel e permissões e
 * que era preciso repô-los «para os braços diferirem só na variável em
 * estudo», e criava `extraArgs` para isso. **`extraArgs` nunca era passado.**
 * A compensação existia em prosa e não em código.
 *
 * Pior: `.claude/settings.json` não está versionado e o snapshot vem de
 * `git archive`, portanto as duas fontes que sobravam ao OFF resolviam para
 * NADA. O filtro não era «project+local em vez de user» — era «nada em vez de
 * tudo». Medido: o braço ON levava `effortLevel: xhigh`, 4 plugins, **22 hooks
 * em 6 famílias** (só UM é o router; dois injectam contexto do vault; um nega
 * chamadas de Bash) e 31 regras de permissão, incluindo leitura pré-aprovada
 * do repositório VIVO em HEAD. O braço OFF levava zero.
 *
 * X teria medido dois perfis de configuração do CLI, não a presença do router.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMO PASSA A SER
 *
 * 1. Os dois braços recebem **exactamente os mesmos argumentos** — incluindo
 *    `--effort`, `--permission-mode` e `--setting-sources project`. Não há um
 *    único `if (braco === ...)` na linha de comando. Um teste afirma que os
 *    dois argv são iguais byte a byte.
 *
 * 2. A ÚNICA diferença vive no `.claude/settings.json` escrito dentro do
 *    snapshot: os dois ficheiros são idênticos excepto a chave `hooks`, que só
 *    o ON tem. Um teste afirma que a diferença é exactamente essa chave.
 *
 * 3. O router é **PINADO**. Medido 2026-09-04: `classify.js` difere do sha
 *    congelado em 4 dos 23 commits-pai. Se o hook apontasse para o
 *    `tools/router/` do snapshot, quatro tarefas corriam um classificador
 *    diferente — e três das tarefas mexem em `tools/router/`, portanto o
 *    agente podia alterar o próprio tratamento a meio. O hook aponta para uma
 *    cópia única e imutável, fora do snapshot, cujo sha entra no congelamento.
 *
 * 4. A exposição é **verificada, não assumida**. O pré-registo lista «braço mal
 *    exposto» como motivo de corrida inválida e nenhuma linha de código o
 *    calculava. O hook do ON deixa uma marca no snapshot; depois da corrida,
 *    ON sem marca e OFF com marca são ambos INVÁLIDOS.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * O nível de esforço, fixo e igual nos dois braços.
 *
 * Fixá-lo é obrigatório (era um confundidor); QUAL fixar é uma escolha, e esta
 * é `xhigh` porque é o que o dono corre no dia-a-dia — a alegação é sobre o
 * trabalho dele, não sobre um laboratório. Fica declarado porque um número
 * escolhido em silêncio é um grau de liberdade.
 */
export const EFFORT = 'xhigh';

/** O ficheiro que o hook do ON toca. A sua presença é a prova da exposição. */
export const MARCA = '.r24-hook-disparou';

/**
 * Os argumentos comuns aos DOIS braços. Nada aqui depende do braço.
 *
 * `--setting-sources project` faz o CLI ler só o `.claude/settings.json` que
 * nós escrevemos no snapshot — nem a camada `user` do dono, nem `local`.
 * `--permission-mode` e `--effort` são passados na linha de comando de
 * propósito: assim não dependem de nenhuma fusão de ficheiros e são
 * verificáveis a olho na linha do ledger.
 */
export function argsComuns() {
  return [
    '--setting-sources', 'project',
    '--permission-mode', 'bypassPermissions',
    '--allow-dangerously-skip-permissions',
    '--effort', EFFORT,
  ];
}

/**
 * As definições escritas no snapshot. Os dois braços partilham TUDO menos
 * `hooks`, que só o ON tem.
 */
export function definicoesDoBraco(braco, caminhoDoHook) {
  const base = {
    // sem plugins, sem MCP, sem marketplaces: a camada `user` do dono não entra
    includeCoAuthoredBy: false,
  };
  if (braco !== 'ON') return base;
  return {
    ...base,
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: `node "${caminhoDoHook.replace(/\\/g, '/')}"` }] },
      ],
    },
  };
}

/** Escreve as definições e devolve o sha do que ficou no disco. */
export function escreverDefinicoes({ snapshotDir, braco, caminhoDoHook, fsImpl = fs }) {
  const obj = definicoesDoBraco(braco, caminhoDoHook);
  const texto = JSON.stringify(obj, null, 2) + '\n';
  const dir = path.join(snapshotDir, '.claude');
  fsImpl.mkdirSync(dir, { recursive: true });
  fsImpl.writeFileSync(path.join(dir, 'settings.json'), texto);
  return { sha: crypto.createHash('sha256').update(texto).digest('hex'), texto };
}

/**
 * A exposição, verificada depois da corrida.
 *
 * ON sem marca = o hook não disparou; OFF com marca = disparou onde não devia.
 * Os dois são «braço mal exposto», que o pré-registo já listava como corrida
 * inválida e que nenhuma linha de código calculava.
 */
export function exposicaoValida({ braco, marcaExiste }) {
  if (braco === 'ON' && !marcaExiste) return { ok: false, motivo: 'braco_mal_exposto:ON_sem_hook' };
  if (braco === 'OFF' && marcaExiste) return { ok: false, motivo: 'braco_mal_exposto:OFF_com_hook' };
  return { ok: true, motivo: null };
}

/**
 * O invólucro que o hook do ON corre: deixa a marca e delega no
 * `inject_context.js` pinado, passando stdin e stdout intactos.
 *
 * A marca vai para o cwd, que num hook do Claude Code é a raiz do projecto —
 * isto é, o snapshot. Sem variáveis de ambiente: o controlador está congelado
 * e não passa nenhuma, e um caminho absoluto cravado tornaria a cópia pinada
 * específica de um snapshot.
 */
export const FONTE_DO_INVOLUCRO = [
  '#!/usr/bin/env node',
  '// GERADO por tools/ab/r24-exposicao.mjs — o invólucro do hook do braço ON.',
  '//',
  '// A marca é escrita DEPOIS de delegar, e só se o hint tiver mesmo saído.',
  '// A versão anterior marcava ANTES e saía 0 aconteça o que acontecer: ela',
  '// certificava que o invólucro correu, nunca que o tratamento chegou ao',
  '// agente. O inject_context.js tem três saídas legítimas com exit 0 e stdout',
  '// vazio — classificador falhado, parse falhado, e o portão de confiança',
  '// mínima (0,60, que é exactamente a confiança destas 23 tarefas: margem',
  '// zero). Em qualquer delas o braço ON corria SEM tratamento, a guarda dizia',
  '// que estava exposto, os 23 pares contavam como válidos, e a análise',
  '// imprimia PERDEU — uma derrota afirmada por um hook que não falou.',
  "const fs = require('fs');",
  "const path = require('path');",
  "const { spawnSync } = require('child_process');",
  '',
  "let entrada = '';",
  "try { entrada = fs.readFileSync(0, 'utf8'); } catch { /* sem stdin */ }",
  '',
  "const alvo = path.join(__dirname, 'inject_context.js');",
  "const r = spawnSync(process.execPath, [alvo], { input: entrada, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });",
  'if (r.stdout) process.stdout.write(r.stdout);',
  'if (r.stderr) process.stderr.write(r.stderr);',
  '',
  "const saida = typeof r.stdout === 'string' ? r.stdout : '';",
  "const houveHint = r.status === 0 && saida.includes('router-hint');",
  'if (houveHint) {',
  '  const linhas = saida.split(String.fromCharCode(10));',
  '  const valor = (chave) => {',
  '    for (const ln of linhas) { if (ln.indexOf(chave) === 0) return ln.slice(chave.length).trim(); }',
  '    return null;',
  '  };',
  '  const tier = valor("tier: ");',
  '  const maxTier = valor("max_tier: ");',
  '  const opcaoA = saida.indexOf("suggested_answer") >= 0;',
  '  try {',
  "    fs.appendFileSync(path.join(process.cwd(), '" + "MARCA_AQUI" + "'),",
  "      JSON.stringify({ tier, max_tier: maxTier, opcao_a: opcaoA, bytes: saida.length }) + String.fromCharCode(10));",
  '  } catch { /* n/d */ }',
  '}',
  "process.exit(typeof r.status === 'number' ? r.status : 0);",
  '',
].join(String.fromCharCode(10)).replace('MARCA_AQUI', MARCA);



/**
 * O AMBIENTE do braço. O `correrBraco` congelado faz `spawnSync` sem `env`,
 * portanto o CLI — e o hook dentro dele — herdavam tudo o que o terminal do
 * dono tivesse. Duas variáveis mudam o TRATAMENTO sem mudar um único byte do
 * router pinado:
 *
 *   · `ANTHROPIC_API_KEY` liga o árbitro (`arbiter.js`, uma chamada de rede a
 *     um segundo modelo). Medido: os 23 prompts normalizados dão todos
 *     `T0 · confiança 0,60 · ambiguous_medium`, e o portão do árbitro é
 *     `confiança < 0,75 || categoria ambígua` — as duas metades disparam nas
 *     23. Com a chave, o tratamento deixa de ser o classificador congelado;
 *     sem ela, é. Duas corridas da mesma árvore, dois tratamentos, e o
 *     `router_sha` idêntico nas duas.
 *   · `MOOTER_*` e `CLAUDE_CODE_*` trazem modos, pins e estado de sessão.
 *
 * **Decisão declarada:** o árbitro fica FORA do tratamento. Não é uma opinião
 * sobre o seu valor — é que ele é não-determinístico (um modelo remoto) e a
 * alegação do produto que estamos a medir é a do router local: «determinista,
 * <50 ms, $0 a classificar». Medir o local com um remoto por baixo mediria
 * outra coisa. Fica escrito no pré-registo, não escondido num default.
 */
export const PREFIXOS_REMOVIDOS = ['ANTHROPIC_', 'CLAUDE_CODE_', 'MOOTER_'];
export const NOMES_REMOVIDOS = ['CLAUDECODE'];

export function envDaCorrida(base = process.env) {
  const saida = {};
  for (const [k, v] of Object.entries(base)) {
    if (NOMES_REMOVIDOS.includes(k)) continue;
    if (PREFIXOS_REMOVIDOS.some((p) => k.startsWith(p))) continue;
    saida[k] = v;
  }
  return saida;
}

/** O sha das chaves do ambiente que sobrou — vai para o ledger. */
export function shaDoEnv(env) {
  return crypto.createHash('sha256').update(Object.keys(env).sort().join(String.fromCharCode(10))).digest('hex');
}

/**
 * Uma impressão digital barata do estado VIVO que o hook lê e que nenhum sha
 * de árvore cobre: os ficheiros de modo, de pin, de perfil e de orçamento em
 * `~/.claude/tools/router/`. Se mudarem a meio das 23 horas — um `/crazy-moo`
 * numa sessão ao lado, uma renovação da cache de orçamento — o tratamento
 * mudou e as linhas do ledger passam a dizê-lo.
 */
export const FICHEIROS_DE_ESTADO = [
  '.mooter-mode.json', '.pin-next.json', 'subscription-profile.json', '.budget-cache.json',
];

export function shaDoEstadoVivo(routerDirVivo, { fsImpl = fs } = {}) {
  const partes = [];
  for (const nome of FICHEIROS_DE_ESTADO) {
    try { partes.push(`${nome} ${crypto.createHash('sha256').update(fsImpl.readFileSync(path.join(routerDirVivo, nome))).digest('hex')}`); }
    catch { partes.push(`${nome} ausente`); }
  }
  return crypto.createHash('sha256').update(partes.join(String.fromCharCode(10))).digest('hex');
}

/**
 * Uma impressão digital BARATA do cache de `node_modules`.
 *
 * O cache é partilhado pelos 46 snapshots e é escrevível através da junção —
 * e os braços correm com `bypassPermissions`. Um `npm install` na tarefa 7
 * fica no chão das tarefas 8 a 23, e a pré-condição de cada tarefa (o teste
 * tem de FALHAR no pai) absorve o estrago em vez de o apanhar: um cache podre
 * faz exactamente o teste falhar.
 *
 * Digitaliza só os filhos directos (nome + mtime) — milhares de entradas, não
 * milhões de ficheiros. Apanha pacotes acrescentados, removidos ou
 * reinstalados; **não** apanha uma edição cirúrgica dentro de um pacote, e
 * isso fica dito aqui em vez de prometido.
 */
export function shaDoCacheNm(raizCache, { fsImpl = fs } = {}) {
  const base = path.join(raizCache, 'nm');
  const partes = [];
  const andar = (dir, rel) => {
    let entradas;
    try { entradas = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entradas.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const cheio = path.join(dir, ent.name);
      if (ent.name === 'node_modules') {
        let filhos = [];
        try { filhos = fsImpl.readdirSync(cheio).sort(); } catch { /* n/d */ }
        for (const f of filhos) {
          let mt = 0;
          try { mt = Math.round(fsImpl.statSync(path.join(cheio, f)).mtimeMs); } catch { /* n/d */ }
          partes.push(`${rel}/${ent.name}/${f} ${mt}`);
        }
      } else if (ent.isDirectory()) {
        andar(cheio, rel ? `${rel}/${ent.name}` : ent.name);
      }
    }
  };
  andar(base, '');
  if (partes.length === 0) return null;
  return crypto.createHash('sha256').update(partes.join(String.fromCharCode(10))).digest('hex');
}

/**
 * O sha do router pinado: um manifesto determinístico de
 * `<caminho relativo> <sha256>` por ficheiro, ordenado, excluindo
 * `node_modules`. É isto que entra no congelamento — o tratamento tem um sha,
 * como tudo o resto.
 */
export function shaDaArvore(raiz, { fsImpl = fs } = {}) {
  const linhas = [];
  const andar = (dir, rel) => {
    for (const nome of fsImpl.readdirSync(dir).sort()) {
      if (nome === 'node_modules' || nome === '.git') continue;
      const cheio = path.join(dir, nome);
      const relativo = rel ? `${rel}/${nome}` : nome;
      const st = fsImpl.statSync(cheio);
      if (st.isDirectory()) andar(cheio, relativo);
      else if (st.isFile()) {
        linhas.push(`${relativo} ${crypto.createHash('sha256').update(fsImpl.readFileSync(cheio)).digest('hex')}`);
      }
    }
  };
  andar(raiz, '');
  return crypto.createHash('sha256').update(linhas.join('\n')).digest('hex');
}
