// Schema validation for Moo Packs (Pastor Wave 1, Day 1).
// Run: cd packs && npm test   (tsx --test tests/*.test.ts)
//
// Asserts:
//   1. pack.schema.yaml is valid YAML and documents the expected top-level keys.
//   2. The mock example-pack.yaml is valid YAML.
//   3. The mock validates against the schema contract (required fields, enums, ranges).
//   4. A deliberately broken pack is rejected (proves the validator actually validates).
//   5. Every real pack (packs/<name>/pack.yaml) validates against the schema contract.
//   6. Each pack's prompt_scaffold_path, when present, resolves to an existing file.
//
// The schema file (pack.schema.yaml) is descriptive (field -> type name). The contract
// it documents is enforced here in validatePack(). Source: docs/strategy/PASTOR.md §4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { isObject, validatePack } from "../validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = join(here, "..");
const SCHEMA_PATH = join(PACKS_DIR, "pack.schema.yaml");
const MOCK_PATH = join(PACKS_DIR, "__mock__", "example-pack.yaml");

// Directories under packs/ that are not packs themselves.
const NON_PACK_DIRS = new Set(["node_modules", "tests", "__mock__"]);

/** Discover real packs: packs/<name>/pack.yaml. */
function discoverPacks(): { name: string; path: string }[] {
  return readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_PACK_DIRS.has(d.name))
    .map((d) => ({ name: d.name, path: join(PACKS_DIR, d.name, "pack.yaml") }))
    .filter((p) => existsSync(p.path));
}

const SCHEMA_TOP_LEVEL_KEYS = [
  "name",
  "version",
  "description",
  "domain_signals",
  "model_floor",
  "model_ceiling",
  "skills",
  "mcps",
  "subagents",
  "repos_canonical",
  "tools_cli",
  "prompt_scaffold",
  "validation",
  "metadata",
] as const;

function loadYaml(path: string): unknown {
  return yaml.load(readFileSync(path, "utf8"));
}

test("pack.schema.yaml is valid YAML", () => {
  const schema = loadYaml(SCHEMA_PATH);
  assert.ok(isObject(schema), "schema must parse to a mapping");
});

test("pack.schema.yaml documents every expected top-level key", () => {
  const schema = loadYaml(SCHEMA_PATH) as Record<string, unknown>;
  for (const key of SCHEMA_TOP_LEVEL_KEYS) {
    assert.ok(key in schema, `schema is missing documented key: ${key}`);
  }
});

test("mock example-pack.yaml is valid YAML", () => {
  const mock = loadYaml(MOCK_PATH);
  assert.ok(isObject(mock), "mock must parse to a mapping");
});

test("mock example-pack.yaml validates against the schema", () => {
  const mock = loadYaml(MOCK_PATH);
  const errors = validatePack(mock);
  assert.deepEqual(errors, [], `mock should be valid, got: ${errors.join("; ")}`);
});

test("validator rejects a broken pack (negative control)", () => {
  const broken = {
    name: "Bad Name",          // not kebab-case
    version: "1.0",            // not semver
    // description missing
    domain_signals: { keywords: [] }, // empty
    model_floor: "T3",
    model_ceiling: "T1",       // ceiling < floor
    metadata: { trust_score: 2 }, // out of range, author/created missing
  };
  const errors = validatePack(broken);
  assert.ok(errors.length >= 5, `expected several errors, got ${errors.length}: ${errors.join("; ")}`);
});

test("every packs/*/pack.yaml validates against the schema", () => {
  const packs = discoverPacks();
  assert.ok(packs.length >= 3, `expected >= 3 real packs, found ${packs.length}`);
  for (const { name, path } of packs) {
    const errors = validatePack(loadYaml(path));
    assert.deepEqual(errors, [], `${name}/pack.yaml invalid: ${errors.join("; ")}`);
  }
});

test("prompt_scaffold_path, when present, resolves to an existing file", () => {
  for (const { name, path } of discoverPacks()) {
    const pack = loadYaml(path) as Record<string, unknown>;
    const rel = pack.prompt_scaffold_path;
    if (typeof rel === "string") {
      assert.ok(
        existsSync(join(dirname(path), rel)),
        `${name}: prompt_scaffold_path -> ${rel} does not exist`,
      );
    }
  }
});
