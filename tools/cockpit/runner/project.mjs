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

/** O commit em que este repo esta agora. `null` quando nao ha git — nunca inventado. */
export function repoSha(repoRoot, runImpl = null) {
  const run = runImpl || ((args, opts) => execFileSync('git', args, opts));
  try {
    const out = run(['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const sha = String(out || '').trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 12) : null;
  } catch {
    return null;
  }
}
