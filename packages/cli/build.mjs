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
import { resolve } from "node:path";

const nodeModules = resolve("node_modules");
const esbuildBin = resolve(nodeModules, "esbuild", "bin", "esbuild");
const args = [
  "src/index.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node20",
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
