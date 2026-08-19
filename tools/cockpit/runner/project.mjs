/**
 * project.mjs — que repo, e onde vive o estado desse repo.
 *
 * O runner sabia conduzir exactamente um projecto: o REPO_ROOT era derivado da
 * localizacao do proprio script (`moo-runner.mjs:29`), e nenhuma das variaveis
 * que ele lia — HOME, MOOTER_DEVICE, MOOTER_HOME, MOO_DIFF_BASE,
 * MOO_SECOND_MODEL, VAULT_PATH — apontava um repo. A propria skill declarava
 * a limitacao: "so sabe conduzir o que ja esta no repo".
 *
 * Pior, o estado era global: um ledger, um cursor, um lock, uma ancora, sem
 * campo de repo. Dois projectos nao podiam coexistir, e os 5478 recibos que ja
 * existem nao dizem a que repo pertencem.
 *
 * NOMES: o repo ja usava `MOOTER_REPO` (packages/mooter-bridge/tools6.js,
 * onboarding.js) e `MOOTER_REPO_ROOT` (tools/router/matrix-status.js) para
 * esta mesma ideia. Inventar um terceiro nome seria repetir o problema dos
 * cinco numeros de versao para a mesma coisa, por isso todos sao aceites, por
 * ordem declarada, e a resolucao DIZ qual venceu.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Ordem de precedencia das variaveis de ambiente, da mais especifica a mais antiga. */
export const ENV_KEYS = Object.freeze(['MOO_REPO_ROOT', 'MOOTER_REPO_ROOT', 'MOOTER_REPO']);

function gitToplevel(cwd, runImpl) {
  const run = runImpl || ((args, opts) => execFileSync('git', args, opts));
  try {
    const out = run(['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const root = String(out || '').trim();
    return root || null;
  } catch {
    return null;
  }
}

/** Um caminho so serve se existir e for uma pasta. Um repo que nao esta la e um erro, nao um default. */
function pastaValida(p, statImpl = fs.statSync) {
  if (!p) return null;
  try {
    return statImpl(p).isDirectory() ? path.resolve(p) : null;
  } catch {
    return null;
  }
}

/**
 * Le `--repo <path>` ou `--repo=<path>` de uma lista de argumentos.
 * @returns {string|null}
 */
export function repoFlag(argv = []) {
  const args = [...argv];
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    if (a === '--repo') return args[i + 1] ? String(args[i + 1]) : '';
    if (a.startsWith('--repo=')) return a.slice('--repo='.length);
  }
  return null;
}

/**
 * Resolve o repo a conduzir.
 *
 * Ordem: `--repo <path>` > env (ENV_KEYS) > `git rev-parse --show-toplevel` a
 * partir do cwd > a raiz do proprio script.
 *
 * Um `--repo` ou uma env que apontem para o que nao existe REBENTAM: sao um
 * gesto explicito do dono, e cair em silencio para outro repo seria conduzir
 * o projecto errado sem ninguem dar por isso. So o degrau do git e que degrada,
 * porque ai ninguem pediu nada.
 *
 * @returns {{root: string, fonte: 'flag'|'env'|'git'|'script', chave?: string}}
 */
export function resolveRepoRoot({
  argv = [],
  env = process.env,
  cwd = process.cwd(),
  scriptRoot,
  statImpl = fs.statSync,
  gitImpl = null,
} = {}) {
  const flag = repoFlag(argv);
  if (flag !== null) {
    const ok = pastaValida(flag, statImpl);
    if (!ok) throw new Error(`--repo aponta para o que nao e uma pasta: ${flag || '(vazio)'}`);
    return { root: ok, fonte: 'flag' };
  }

  for (const chave of ENV_KEYS) {
    const bruto = env[chave];
    if (!bruto) continue;
    const ok = pastaValida(bruto, statImpl);
    if (!ok) throw new Error(`${chave} aponta para o que nao e uma pasta: ${bruto}`);
    return { root: ok, fonte: 'env', chave };
  }

  const doGit = pastaValida(gitToplevel(cwd, gitImpl), statImpl);
  if (doGit) return { root: doGit, fonte: 'git' };

  if (!scriptRoot) throw new Error('sem repo: nem flag, nem env, nem git, nem raiz de script');
  return { root: path.resolve(scriptRoot), fonte: 'script' };
}

/**
 * Nome de pasta legivel E unico para um repo: o basename para um humano
 * navegar, o hash do caminho absoluto para dois repos com o mesmo nome nao
 * colidirem.
 */
export function projectSlug(repoRoot) {
  const abs = path.resolve(repoRoot);
  const hash = crypto.createHash('sha256').update(abs).digest('hex').slice(0, 10);
  const nome = path.basename(abs).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40) || 'repo';
  return `${nome}-${hash}`;
}

/**
 * Onde vive o estado deste projecto.
 *
 * O repo canonico deste device — aquele de onde o proprio script corre — MANTEM
 * os caminhos planos de sempre. Nao e elegancia: sao 5478 recibos ja escritos,
 * e um painel, um beacon e uma frota que os leem nesse sitio. Mover esse
 * historico para dentro de `projects/` orfanava-o para ganhar simetria. Ja
 * qualquer OUTRO repo ganha a sua propria pasta, e e isso que permite dois
 * projectos coexistirem.
 */
/**
 * A versao do conector, LIDA da fonte canonica.
 *
 * Ate 2026-08-19 estava cravada a mao em `fleet-state.mjs` como '1.48.0'. O
 * repo estava em 1.49.3 e a maquina do dono tinha 1.33.0 instalada: o painel
 * mostrava um numero que nao correspondia a nenhum dos dois. Uma versao
 * copiada para um segundo ficheiro so tem um futuro possivel, e e este.
 *
 * ⚠️ E ESTA E A VERSAO DO CHECKOUT, NAO A QUE ESTA A CORRER.
 *
 * A auditoria do mesmo dia apanhou a segunda metade do problema: ler o manifest
 * do repo da a versao do CODIGO EM DISCO, e a extensao carregada no Claude
 * Desktop pode ser outra — medido, 1.33.0 contra 1.49.3, dezasseis versoes de
 * diferenca. Nenhuma ferramenta MCP do bridge declara a versao que esta a
 * correr, portanto nao ha aqui como saber. O painel escreve "in this checkout"
 * porque e a unica coisa que este numero prova.
 *
 * @returns {string|null} `null` quando nao se consegue ler — nunca um palpite.
 */
export function versaoDoConector(repoRoot, { readImpl = fs.readFileSync } = {}) {
  try {
    const bruto = readImpl(path.join(repoRoot, 'packages', 'mooter-bridge', 'manifest.json'), 'utf8');
    const v = JSON.parse(bruto).version;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function projectPaths({ repoRoot, mooDir, canonicalRoot = null }) {
  const abs = path.resolve(repoRoot);
  const canonico = canonicalRoot ? path.resolve(canonicalRoot) === abs : false;
  const base = canonico ? mooDir : path.join(mooDir, 'projects', projectSlug(abs));
  return {
    repoRoot: abs,
    canonico,
    slug: canonico ? null : projectSlug(abs),
    base,
    LEDGER: path.join(base, 'runner-ledger.jsonl'),
    STATE: path.join(base, 'runner-state.json'),
    CURSOR: path.join(base, 'runner-cursor.json'),
    FOCUS: path.join(base, 'runner-focus.json'),
    ANCORA: path.join(base, 'ancora-achados.json'),
    // O que ja foi julgado, por conteudo. Sem isto o motor remoia os mesmos 20
    // excertos ~147 vezes por dia e chamava-lhe trabalho.
    REVISTOS: path.join(base, 'revistos.json'),
    LOCK: path.join(base, 'runner.lock'),
    // O STOP e por projecto, tal como o lock: parar o projecto A nao pode parar
    // o projecto B. Um kill-switch global e uma decisao maior, e essa e do dono.
    STOP_FILE: path.join(base, 'STOP'),
  };
}

/**
 * O commit em que este repo esta agora. `null` quando nao ha git — nunca inventado.
 *
 * Le do DISCO, sem subprocesso. A primeira versao corria `git rev-parse HEAD` a
 * cada ronda; com o loop a 29s isso e um processo git de 29 em 29 segundos a
 * disputar o repo, e ja fez o `wave-gate` cair num teste que verifica que
 * `git status` nao deixa `.git/index.lock` para tras. Um recibo mais honesto
 * nao pode custar contencao no repo que ele esta a rever.
 */
export function repoSha(repoRoot, runImpl = null) {
  const curto = (x) => (/^[0-9a-f]{40}$/.test(String(x || "").trim()) ? String(x).trim().slice(0, 12) : null);
  // Um subprocesso injectado continua a ser respeitado — e o que os testes usam.
  if (runImpl) {
    try {
      return curto(runImpl(["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }));
    } catch {
      return null;
    }
  }
  try {
    let dir = path.join(repoRoot, ".git");
    if (!fs.statSync(dir).isDirectory()) {
      // Worktree: `.git` e um ficheiro com `gitdir: <caminho>`.
      const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dir, "utf8"));
      if (!m) return null;
      dir = path.resolve(repoRoot, m[1].trim());
    }
    const head = fs.readFileSync(path.join(dir, "HEAD"), "utf8").trim();
    if (curto(head)) return curto(head); // detached
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return null;
    const nome = ref[1].trim();
    try {
      const solta = curto(fs.readFileSync(path.join(dir, nome), "utf8"));
      if (solta) return solta;
    } catch {
      /* ref nao solta: esta nas packed-refs */
    }
    for (const linha of fs.readFileSync(path.join(dir, "packed-refs"), "utf8").split("\n")) {
      const [sha, alvo] = linha.trim().split(" ");
      if (alvo === nome) return curto(sha);
    }
    return null;
  } catch {
    return null;
  }
}
