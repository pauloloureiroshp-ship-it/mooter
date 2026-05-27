// Schema validation for Moo Packs (Pastor Wave 1, Day 1).
// Run: cd packs && npm test   (tsx --test tests/*.test.ts)
//
// Asserts:
//   1. pack.schema.yaml is valid YAML and documents the expected top-level keys.
//   2. The mock example-pack.yaml is valid YAML.
//   3. The mock validates against the schema contract (required fields, enums, ranges).
//   4. A deliberately broken pack is rejected (proves the validator actually validates).
//
// The schema file (pack.schema.yaml) is descriptive (field -> type name). The contract
// it documents is enforced here in validatePack(). Source: docs/strategy/PASTOR.md §4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, "..", "pack.schema.yaml");
const MOCK_PATH = join(here, "..", "__mock__", "example-pack.yaml");

const TIERS = ["T0", "T1", "T2", "T3"] as const;
type Tier = (typeof TIERS)[number];

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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);
const isTier = (v: unknown): v is Tier => TIERS.includes(v as Tier);
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns a list of human-readable validation errors; empty array == valid. */
function validatePack(pack: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(pack)) return ["pack is not a YAML mapping"];

  // --- required scalars ---
  if (!isString(pack.name)) errors.push("name: required string");
  else if (pack.name !== pack.name.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    errors.push("name: must be kebab-case (a-z0-9-)");

  if (!isString(pack.version) || !SEMVER.test(pack.version))
    errors.push("version: required semver (MAJOR.MINOR.PATCH)");

  if (!isString(pack.description)) errors.push("description: required string");
  else if (pack.description.length > 100)
    errors.push("description: must be <= 100 chars");

  // --- domain_signals ---
  if (!isObject(pack.domain_signals)) {
    errors.push("domain_signals: required mapping");
  } else {
    const ds = pack.domain_signals;
    if (!isStringArray(ds.keywords) || ds.keywords.length === 0)
      errors.push("domain_signals.keywords: required non-empty string[]");
    for (const opt of ["intent_phrases", "file_extensions", "negative_keywords"]) {
      if (ds[opt] !== undefined && !isStringArray(ds[opt]))
        errors.push(`domain_signals.${opt}: must be string[] when present`);
    }
  }

  // --- tiers ---
  if (!isTier(pack.model_floor))
    errors.push(`model_floor: required one of ${TIERS.join("|")}`);
  if (!isTier(pack.model_ceiling))
    errors.push(`model_ceiling: required one of ${TIERS.join("|")}`);
  if (isTier(pack.model_floor) && isTier(pack.model_ceiling)) {
    if (TIERS.indexOf(pack.model_ceiling) < TIERS.indexOf(pack.model_floor))
      errors.push("model_ceiling must be >= model_floor");
  }

  // --- metadata ---
  if (!isObject(pack.metadata)) {
    errors.push("metadata: required mapping");
  } else {
    const m = pack.metadata;
    if (!isString(m.author)) errors.push("metadata.author: required string");
    // js-yaml parses unquoted ISO dates (e.g. 2026-05-28) as Date objects; accept both.
    const createdOk =
      m.created instanceof Date || (isString(m.created) && ISO_DATE.test(m.created));
    if (!createdOk)
      errors.push("metadata.created: required ISO8601 date (YYYY-MM-DD)");
    if (m.trust_score !== undefined) {
      if (typeof m.trust_score !== "number" || m.trust_score < 0 || m.trust_score > 1)
        errors.push("metadata.trust_score: must be a number in [0, 1]");
    }
    if (m.notion_kb_url !== undefined && m.notion_kb_url !== null && !isString(m.notion_kb_url))
      errors.push("metadata.notion_kb_url: must be string or null (optional)");
  }

  return errors;
}

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

export { validatePack };
