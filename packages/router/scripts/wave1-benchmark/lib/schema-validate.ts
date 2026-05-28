// schema-validate.ts — runtime JSON Schema validation (§13.1, DoD "100% rows").
//
// Compiles event-schema-v1.0.0 (which $refs lineage-schema-v1.0.0) with ajv and
// validates every BenchEvent before it is appended. A schema miss is a hard
// error: a malformed row poisons aggregations silently otherwise.

import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BenchEvent } from "./types.ts";

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");

function readSchema(name: string): object {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as object;
}

let _validateEvent: ValidateFunction | null = null;
function validator(): ValidateFunction {
  if (_validateEvent) return _validateEvent;
  // strict:false → unknown "date-time" format is ignored rather than throwing
  // at compile time (we emit ISO strings via Date.toISOString(), so the format
  // holds by construction).
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(readSchema("lineage-schema-v1.0.0.json"));
  _validateEvent = ajv.compile(readSchema("event-schema-v1.0.0.json"));
  return _validateEvent;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEvent(event: BenchEvent): ValidationResult {
  const validate = validator();
  const valid = validate(event) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}

/** Throw with a readable message if invalid. Used on the write path. */
export function assertValidEvent(event: BenchEvent): void {
  const r = validateEvent(event);
  if (!r.valid) {
    throw new Error(
      `schema validation failed for ${event.event_id}:\n  ${r.errors.join("\n  ")}`,
    );
  }
}
