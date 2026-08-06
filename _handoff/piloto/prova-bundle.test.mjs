#!/usr/bin/env node
/**
 * Testes do P0-C. Correr: node --test prova-bundle.test.mjs
 *
 * O que estes testes protegem: uma prova que só sabe dizer "igual" não é uma
 * prova, é um carimbo. Cada caso aqui força o NÃO — bundle adulterado, ficheiro
 * em falta, shas mistos — e exige que o veredicto mude. O caso feliz vale pouco
 * sozinho: foi por confiar num caso feliz que o `base_sha` do meta.json passou
 * 3× a descrever código que não correu.
 */
import test from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { comparar } from "./prova-bundle.mjs";
import { agregar, coerencia } from "./resultado.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const HEAD = execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

/** Um "home" instalado sintético: cópia fiel do runtime real do repo em HEAD. */
function homeInstalado(prefixo) {
  const home = mkdtempSync(join(tmpdir(), prefixo));
  const routerDest = join(home, ".claude", "tools", "router");
  mkdirSync(routerDest, { recursive: true });
  const nomes = execFileSync("git", ["-C", REPO, "ls-tree", "--name-only", `${HEAD}:tools/router`], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter((s) => s.endsWith(".js") && !s.endsWith(".test.js"));
  for (const nome of nomes) {
    const blob = execFileSync("git", ["-C", REPO, "show", `${HEAD}:tools/router/${nome}`], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(routerDest, nome), blob);
  }
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ hooks: {} }));
  return { home, routerDest, nomes };
}

test("runtime idêntico ao repo prova igualdade e mede todos os ficheiros", () => {
  const { home, nomes } = homeInstalado("mooter-bundle-igual-");
  try {
    const r = comparar(HEAD, home);
    assert.strictEqual(r.igual, true, r.porque);
    assert.strictEqual(r.medidos, nomes.length);
    assert.strictEqual(r.repo_bundle_sha, r.runtime_bundle_sha);
    assert.strictEqual(r.digest, "sha256", "o digest declarado tem de ser o digest usado");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("UM byte trocado no runtime derruba a igualdade e nomeia o ficheiro", () => {
  const { home, routerDest } = homeInstalado("mooter-bundle-adulterado-");
  try {
    const alvo = join(routerDest, "sync-hooks.js");
    writeFileSync(alvo, readFileSync(alvo, "utf8") + "\n// byte a mais\n");
    const r = comparar(HEAD, home);
    assert.strictEqual(r.igual, false, "um bundle adulterado passou por igual — a prova é um carimbo");
    assert.notStrictEqual(r.repo_bundle_sha, r.runtime_bundle_sha);
    assert.ok(r.divergentes.some((p) => p.endsWith("sync-hooks.js")), `ficheiro divergente não nomeado: ${JSON.stringify(r.divergentes)}`);
    assert.match(r.porque, /divergente/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("ficheiro em falta no runtime é ausência declarada, nunca igualdade silenciosa", () => {
  const { home, routerDest } = homeInstalado("mooter-bundle-ausente-");
  try {
    rmSync(join(routerDest, "sync-hooks.js"), { force: true });
    const r = comparar(HEAD, home);
    assert.strictEqual(r.igual, false);
    assert.ok(r.ausentes.some((a) => a.estado === "ausente_instalado"), "ausência não classificada");
    assert.ok(r.medidos < r.total, "um ficheiro em falta não pode contar como medido");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("home sem runtime instalado devolve n/d — nunca um veredicto", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-bundle-vazio-"));
  try {
    const r = comparar(HEAD, home);
    assert.strictEqual(r.repo_bundle_sha, null, "sem nada medido dos dois lados não há projeção");
    assert.strictEqual(r.runtime_bundle_sha, null);
    assert.strictEqual(r.igual, false);
    assert.match(r.porque, /indetermin/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// --- resultado.md ------------------------------------------------------------

function runsSinteticos(prefixo, metas) {
  const dir = mkdtempSync(join(tmpdir(), prefixo));
  metas.forEach((m, i) => {
    const d = join(dir, m.run || `run-${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "meta.json"), JSON.stringify(m));
  });
  return dir;
}

test("resultado recusa base_sha misto — a comparação entre braços deixaria de significar algo", () => {
  const dir = runsSinteticos("mooter-res-misto-", [
    { run: "T1-A-e1", base_sha: "aaaa1111", runtime_bundle_sha: "rrrr", "braço": "A", tarefa: "T1" },
    { run: "T1-B-e1", base_sha: "bbbb2222", runtime_bundle_sha: "rrrr", "braço": "B", tarefa: "T1" },
  ]);
  try {
    const ag = agregar(dir);
    assert.strictEqual(ag.ok, false);
    assert.ok(ag.bloqueios.some((b) => /base_sha MISTO/.test(b)), JSON.stringify(ag.bloqueios));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("resultado recusa runtime_bundle_sha misto mesmo com base_sha único", () => {
  const dir = runsSinteticos("mooter-res-rt-misto-", [
    { run: "T1-A-e1", base_sha: "aaaa1111", runtime_bundle_sha: "rr11", "braço": "A" },
    { run: "T1-B-e1", base_sha: "aaaa1111", runtime_bundle_sha: "rr22", "braço": "B" },
  ]);
  try {
    const ag = agregar(dir);
    assert.strictEqual(ag.ok, false, "dois runtimes diferentes sob o mesmo base_sha é exactamente o gotcha do P0-C");
    assert.ok(ag.bloqueios.some((b) => /runtime_bundle_sha MISTO/.test(b)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("shas coerentes geram resultado; runs sem meta.json são declarados, não calados", () => {
  const dir = runsSinteticos("mooter-res-ok-", [
    { run: "T1-A-e1", base_sha: "aaaa1111", runtime_bundle_sha: "rr11", "braço_nome": "TECTO", tarefa: "T1", execucao: 1, wall_ms_total: 10, intervencoes_humanas: 0 },
    { run: "T1-B-e1", base_sha: "aaaa1111", runtime_bundle_sha: "rr11", "braço_nome": "MOOTER", tarefa: "T1", execucao: 1, wall_ms_total: 20, intervencoes_humanas: 0 },
  ]);
  mkdirSync(join(dir, "T1-C-e1"), { recursive: true }); // run abortado: pasta sem meta.json
  try {
    const ag = agregar(dir);
    assert.strictEqual(ag.ok, true, JSON.stringify(ag.bloqueios));
    assert.strictEqual(ag.base_sha.valor_unico, "aaaa1111");
    assert.strictEqual(ag.ilegiveis.length, 1, "o run abortado tem de aparecer");
    assert.strictEqual(ag.ilegiveis[0].porque, "sem meta.json");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pasta de runs vazia não produz um relatório verde", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-res-vazio-"));
  try {
    const ag = agregar(dir);
    assert.strictEqual(ag.ok, false);
    assert.ok(ag.bloqueios.some((b) => /nenhum meta\.json/.test(b)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("coerencia distingue campo ausente de campo divergente", () => {
  const c = coerencia([{ run: "a", x: 1 }, { run: "b", x: 1 }, { run: "c" }], "x");
  assert.strictEqual(c.misto, false);
  assert.strictEqual(c.valor_unico, 1);
  assert.deepStrictEqual(c.ausente_em, ["c"], "um run sem o campo não pode ser lido como concordância");
});
