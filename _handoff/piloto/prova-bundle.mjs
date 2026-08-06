#!/usr/bin/env node
/**
 * prova-bundle.mjs — P0-C da wave "pista limpa": provar que o braço B corre o
 * código que o `base_sha` diz.
 *
 * PORQUE ESTE FICHEIRO EXISTE
 * O driver fixa `base_sha` do HEAD do repo (`driver.mjs:296`) e escreve-o em
 * cada `meta.json`. Mas o braço B (MOOTER) não corre o repo: corre o runtime
 * INSTALADO — `~/.claude/tools/router/inject_context.js` é o que o
 * `settings.json` liga ao UserPromptSubmit, e `~/.claude/hooks/*` é o que ele
 * liga ao resto. Esses ficheiros só se aproximam do repo quando alguém corre
 * `/mooter-update`. Entre um `git commit` e esse update, o `base_sha` do
 * `meta.json` descreve código que NÃO correu. Já custou 3× (o gotcha do G4,
 * achado #6): a medição sai limpa e aponta para o commit errado.
 *
 * O QUE ISTO PROVA (e o que não prova)
 * Compara, ficheiro a ficheiro, o digest do BLOB NO REPO em `base_sha` contra
 * o digest do ficheiro INSTALADO no disco. Nunca lê um manifest: um manifest é
 * a segunda verdade que estamos justamente a tentar não criar — declara o que
 * a instalação DIZ que instalou, não o que lá está. `git show <sha>:<path>`
 * sai da árvore commitada, portanto ficheiros por commitar na worktree contam
 * como divergência (é isso mesmo que se quer saber antes de medir).
 *
 * sha256, não md5: o brief dizia "md5 ficheiro-a-ficheiro" e chamava
 * `runtime_bundle_sha` ao resultado. Um campo chamado `sha` calculado por md5
 * é exactamente a classe de defeito que esta wave existe para matar, e o md5
 * não traz aqui nenhuma vantagem (não há compatibilidade a manter — o campo
 * não existe em lado nenhum: grep por `runtime_bundle_sha` no repo devolvia só
 * o próprio brief). Fica sha256 e o nome passa a ser honesto.
 *
 * `runtime_bundle_sha` é o sha256 da lista ORDENADA de `<caminho> <sha256>` de
 * cada ficheiro instalado — uma projeção determinística dos digests, não um
 * número guardado em lado nenhum. `repo_bundle_sha` é a mesma projeção sobre
 * os blobs do repo. Iguais ⇒ o runtime é o repo.
 *
 * USO
 *   node prova-bundle.mjs                 # imprime a prova; exit 1 se divergir
 *   node prova-bundle.mjs --sha <sha>     # contra um sha explícito (default: HEAD)
 *   node prova-bundle.mjs --json          # saída máquina-legível
 *   node prova-bundle.mjs --home <dir>    # raiz alternativa (testes)
 *
 * Exit 0 = igual · 1 = divergente · 2 = não foi possível medir (n/d, nunca "ok").
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function homeDir(override) {
  return override || process.env.MOOTER_PROVA_HOME || process.env.USERPROFILE || process.env.HOME || "";
}

/** Blob do repo NA ÁRVORE COMMITADA. null quando o caminho não existe nesse sha. */
function blobNoRepo(sha, relPath) {
  try {
    return execFileSync("git", ["-C", REPO, "show", `${sha}:${relPath}`], {
      encoding: "buffer", maxBuffer: 64 * 1024 * 1024,
    });
  } catch { return null; }
}

/** Ficheiros `tools/router/*.js` presentes NO SHA (não no disco). */
function routerFilesNoSha(sha) {
  const out = execFileSync("git", ["-C", REPO, "ls-tree", "--name-only", `${sha}:tools/router`], { encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter((s) => s.endsWith(".js") && !s.endsWith(".test.js"));
}

/**
 * A lista de hooks ligados vem do `settings.json` REAL, não de uma cópia. É a
 * única fonte que prova o que a sessão carrega; `WIRED_HOOKS` do sync-hooks.js
 * diz o que o instalador TENCIONA copiar. Usamos as duas e reportamos a
 * diferença — divergir entre elas já é um achado.
 */
function hooksLigados(home) {
  const settings = join(home, ".claude", "settings.json");
  if (!existsSync(settings)) return { paths: [], porque: `settings.json ausente em ${settings}` };
  let parsed;
  try { parsed = JSON.parse(readFileSync(settings, "utf8")); }
  catch (e) { return { paths: [], porque: `settings.json ilegível: ${e.message}` }; }
  const paths = new Set();
  for (const entradas of Object.values(parsed.hooks || {})) {
    for (const entrada of entradas || []) {
      for (const h of entrada.hooks || []) {
        const m = String(h.command || "").match(/"([^"]+\.js)"|(\S+\.js)/);
        const p = m && (m[1] || m[2]);
        if (p) paths.add(p.replace(/\\/g, "/"));
      }
    }
  }
  return { paths: [...paths].sort(), porque: null };
}

function wiredHooksDoInstalador() {
  try { return require(join(REPO, "tools", "router", "sync-hooks.js")).WIRED_HOOKS || []; }
  catch { return null; }
}

/**
 * O conjunto instalado que o braço B exercita:
 *   - `~/.claude/tools/router/*.js`  ← origem: tools/router/<mesmo nome>
 *   - `~/.claude/hooks/<wired>.js`   ← origem: tools/router/<mesmo nome>
 * Só entram hooks cuja origem existe no repo: os que vêm de outro projecto
 * (o vault, por exemplo) não são deste bundle e ficam declarados à parte.
 */
function paresParaComparar(sha, home) {
  const pares = [];
  const foraDoBundle = [];
  const routerNoSha = new Set(routerFilesNoSha(sha));

  for (const nome of routerNoSha) {
    pares.push({
      repo: `tools/router/${nome}`,
      instalado: join(home, ".claude", "tools", "router", nome),
      superficie: "runtime-router",
    });
  }

  const { paths, porque } = hooksLigados(home);
  for (const p of paths) {
    const nome = basename(p);
    if (!routerNoSha.has(nome)) { foraDoBundle.push({ path: p, porque: `sem origem em tools/router/ no sha ${sha.slice(0, 7)}` }); continue; }
    if (p.replace(/\//g, "\\").includes("\\tools\\router\\") || p.includes("/tools/router/")) continue; // já coberto acima
    pares.push({ repo: `tools/router/${nome}`, instalado: p, superficie: "hook-ligado" });
  }
  return { pares, foraDoBundle, avisoHooks: porque };
}

function comparar(sha, home) {
  const { pares, foraDoBundle, avisoHooks } = paresParaComparar(sha, home);
  const linhas = [];
  for (const par of pares) {
    const blob = blobNoRepo(sha, par.repo);
    const instaladoExiste = existsSync(par.instalado);
    const shaRepo = blob ? sha256(blob) : null;
    const shaInstalado = instaladoExiste ? sha256(readFileSync(par.instalado)) : null;
    let estado;
    if (!shaRepo) estado = "ausente_no_repo";
    else if (!shaInstalado) estado = "ausente_instalado";
    else if (shaRepo === shaInstalado) estado = "igual";
    else estado = "divergente";
    linhas.push({ ...par, sha_repo: shaRepo, sha_instalado: shaInstalado, estado });
  }
  linhas.sort((a, b) => (a.instalado < b.instalado ? -1 : a.instalado > b.instalado ? 1 : 0));

  // Projeção determinística: sha256 da lista ordenada "<caminho> <sha256>".
  // Só se calcula sobre ficheiros medidos dos DOIS lados — um bundle com
  // buracos não produz um número que finja cobertura.
  const medidos = linhas.filter((l) => l.sha_repo && l.sha_instalado);
  const projecao = (campo) => medidos.length
    ? sha256(medidos.map((l) => `${l.repo} ${l[campo]}`).join("\n"))
    : null;

  const divergentes = linhas.filter((l) => l.estado === "divergente");
  const ausentes = linhas.filter((l) => l.estado === "ausente_instalado" || l.estado === "ausente_no_repo");
  const repoBundleSha = projecao("sha_repo");
  const runtimeBundleSha = projecao("sha_instalado");

  return {
    base_sha: sha,
    home,
    ficheiros: linhas,
    fora_do_bundle: foraDoBundle,
    aviso_hooks: avisoHooks,
    wired_hooks_do_instalador: wiredHooksDoInstalador(),
    medidos: medidos.length,
    total: linhas.length,
    divergentes: divergentes.map((l) => l.instalado),
    ausentes: ausentes.map((l) => ({ path: l.instalado || l.repo, estado: l.estado })),
    repo_bundle_sha: repoBundleSha,
    runtime_bundle_sha: runtimeBundleSha,
    igual: !!repoBundleSha && repoBundleSha === runtimeBundleSha && divergentes.length === 0 && ausentes.length === 0,
    porque: !repoBundleSha
      ? "nenhum ficheiro foi medido dos dois lados — prova indeterminável (n/d), nunca 'ok'"
      : (divergentes.length || ausentes.length
        ? `${divergentes.length} divergente(s) e ${ausentes.length} ausente(s): o braço B corre código que o base_sha não descreve`
        : `${medidos.length} ficheiro(s) medidos ficheiro-a-ficheiro por sha256 — sem manifest`),
    digest: "sha256",
    digest_porque: "o brief pedia md5 mas chamava-lhe sha; um campo chamado sha calculado por md5 é a mentira que esta wave existe para matar",
  };
}

function relatorio(r) {
  const l = [];
  l.push("── PROVA DE BUNDLE (P0-C) ──────────────────────────────────────");
  l.push(`base_sha            ${r.base_sha}`);
  l.push(`repo_bundle_sha     ${r.repo_bundle_sha || "n/d"}`);
  l.push(`runtime_bundle_sha  ${r.runtime_bundle_sha || "n/d"}`);
  l.push(`ficheiros medidos   ${r.medidos}/${r.total} (digest: ${r.digest}, ficheiro-a-ficheiro, sem manifest)`);
  l.push(`veredicto           ${r.igual ? "IGUAL — o runtime é o repo" : "DIVERGENTE"}`);
  l.push(`porque              ${r.porque}`);
  for (const f of r.ficheiros.filter((x) => x.estado !== "igual")) {
    l.push(`  ✖ ${f.estado.padEnd(18)} ${f.instalado}`);
    l.push(`      repo ${f.sha_repo ? f.sha_repo.slice(0, 16) : "n/d"} · instalado ${f.sha_instalado ? f.sha_instalado.slice(0, 16) : "n/d"}`);
  }
  if (r.aviso_hooks) l.push(`  ⚠ hooks: ${r.aviso_hooks}`);
  for (const f of r.fora_do_bundle) l.push(`  · fora do bundle: ${f.path} (${f.porque})`);
  l.push("────────────────────────────────────────────────────────────────");
  return l.join("\n");
}

const argv = process.argv.slice(2);
function flag(nome) { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; }

// Windows + espaços no caminho ("C:\Users\Paulo Loureiro\...") partem a comparação
// ingénua com `file://` + replace: o URL real vem percent-encoded e com a drive.
// pathToFileURL é a única forma que não mente em nenhum dos dois OS — a primeira
// versão deste ficheiro saiu com exit 0 e ZERO output por causa disto.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sha = flag("--sha") || execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const home = homeDir(flag("--home"));
  if (!home) { console.error("n/d: sem HOME/USERPROFILE — impossível localizar o runtime instalado"); process.exit(2); }
  const r = comparar(sha, home);
  console.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : relatorio(r));
  process.exit(r.repo_bundle_sha === null ? 2 : (r.igual ? 0 : 1));
}

export { comparar, relatorio, sha256, paresParaComparar, hooksLigados };
