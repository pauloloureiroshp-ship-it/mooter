// Cross-platform bundle build for @mooter/cli (Wave 61, C5).
//
// The bundle must build on Windows (install.ps1) AND Linux/macOS (CI, install.sh).
// Constraints learned the hard way:
//   1. cmd.exe can't parse the POSIX inline env prefix "NODE_PATH=… esbuild", so the
//      build moved out of package.json into this script (npm script = "node build.mjs").
//   2. NODE_PATH=node_modules is load-bearing in some Windows monorepo layouts for
//      esbuild to resolve its platform binary (@esbuild/<platform>). Harmless on CI.
//   3. node_modules/esbuild/bin/esbuild is PLATFORM-DEPENDENT:
//        • Windows      → a JS shim         → must be run WITH node.
//        • Linux/macOS  → the native binary → must be run DIRECTLY. Passing it to
//          node throws "SyntaxError: Invalid or unexpected token" on the ELF header
//          (this broke the "fresh install" CI before this fix).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// O piso de Node vive num sitio so: `engines.node` deste package.json. Aqui
// DERIVA-SE, nao se copia — ate 2026-08-22 esta linha dizia `--target=node20`
// enquanto o install.sh prometia ao utilizador "Node 18+", e ninguem via porque
// os dois numeros viviam em ficheiros e linguagens diferentes.
//
// Falha fechado de proposito: sem piso legivel nao se adivinha um, porque o
// palpite ficaria compilado dentro do binario que o utilizador executa.
const { engines } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const pisoNode = String(engines?.node ?? "").match(/(\d+)/)?.[1];
if (!pisoNode) {
  console.error("::error::engines.node ausente ou ilegivel no packages/cli/package.json — nao ha piso para compilar contra");
  process.exit(1);
}

const nodeModules = resolve("node_modules");
const esbuildBin = resolve(nodeModules, "esbuild", "bin", "esbuild");
const args = [
  "src/index.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--target=node${pisoNode}`,
  "--outfile=mooter.js",
  "--log-level=warning",
];
const opts = { stdio: "inherit", env: { ...process.env, NODE_PATH: nodeModules } };

// Windows: bin/esbuild is a JS shim → run via node. Elsewhere it's the native
// executable → spawn it directly (running it through node fails to parse the ELF).
const result = process.platform === "win32"
  ? spawnSync(process.execPath, [esbuildBin, ...args], opts)
  : spawnSync(esbuildBin, args, opts);

process.exit(result.status ?? 1);
