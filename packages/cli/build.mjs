// Cross-platform bundle build for @mooter/cli (Wave 61, C5).
//
// Why this file exists: the bundle must be built on Windows by install.ps1, but the
// previous npm script used a POSIX-only inline env prefix:
//     "build": "NODE_PATH=node_modules esbuild ..."
// cmd.exe (npm's script shell on Windows) cannot parse "VAR=val cmd", so the build
// failed on Windows — a root cause of C5 (no working CLI v1 on Windows). And the
// NODE_PATH=node_modules is load-bearing: in this monorepo layout esbuild needs it
// to resolve its platform binary (@esbuild/<platform>). The only invocation proven
// to work is the esbuild CLI shim run by node with NODE_PATH in the environment, so
// we reproduce exactly that here. The npm script is now just "node build.mjs".
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const nodeModules = resolve("node_modules");
const esbuildShim = resolve(nodeModules, "esbuild", "bin", "esbuild");

const result = spawnSync(
  process.execPath,
  [
    esbuildShim,
    "src/index.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    "--outfile=mooter.js",
    "--log-level=warning",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: nodeModules },
  },
);

process.exit(result.status ?? 1);
