// Moo Pack schema validator (extracted Wave 1 Day 5 from tests/schema.test.ts).
//
// Single source of truth for "does this pack.yaml satisfy the contract documented
// in pack.schema.yaml". Consumed by:
//   - packs/tests/schema.test.ts  (the Day-1 schema suite)
//   - packages/cli/src/commands/pack.ts  (`mooter pack validate`)
// Deterministic, pure, no I/O, no LLM. Source: docs/strategy/PASTOR.md §4.

export const TIERS = ["T0", "T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];

export const SEMVER = /^\d+\.\d+\.\d+$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === "string";
export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);
export const isTier = (v: unknown): v is Tier => TIERS.includes(v as Tier);

/** Returns a list of human-readable validation errors; empty array == valid. */
export function validatePack(pack: unknown): string[] {
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

  // --- signature (optional; supply-chain hardening F3) ---
  // The trust contract for a future community marketplace. OPTIONAL for now:
  // first-party packs are git-trusted, so absence is valid and never an error.
  // When present, only the SHAPE is validated here — actually verifying the
  // signature (and requiring it for marketplace packs) is a later wave, once a
  // key registry exists. This lands the contract without premature key infra.
  if (pack.signature !== undefined) {
    if (!isObject(pack.signature)) {
      errors.push("signature: must be a mapping when present");
    } else {
      const s = pack.signature;
      for (const k of ["algo", "key_id", "value", "signed_hash"]) {
        if (s[k] !== undefined && !isString(s[k]))
          errors.push(`signature.${k}: must be a string when present`);
      }
      if (!isString(s.algo) || !isString(s.value))
        errors.push("signature: when present, requires at least { algo, value } strings");
    }
  }

  return errors;
}
