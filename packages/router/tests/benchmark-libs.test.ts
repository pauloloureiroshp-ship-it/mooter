// benchmark-libs.test.ts — the ONLY consumers of `ajv` and `@dsnp/parquetjs` in this
// package are scripts/wave{1,2}-benchmark/lib/{schema-validate,parquet-write}.ts, and
// until 2026-09-11 nothing exercised them: both deps could break (or vanish) and the
// suite would stay green. That is exactly what happened with @dsnp/parquetjs@1.9.3 —
// a published tarball with 9 files and no dist/, whose `main` points at a file that
// does not exist. Only a smoke run caught it. This test makes the suite bite.
//
// Fixture is the real wave1 output (102 events), not a hand-written row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rawPath = join(here, "..", "scripts", "wave1-benchmark", "outputs", "RAW_RESULTS.jsonl");
const rawEvents: unknown[] = readFileSync(rawPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

for (const wave of ["wave1-benchmark", "wave2-benchmark"] as const) {
  test(`${wave}: ajv validates every real wave1 event and rejects a broken one`, async () => {
    const { validateEvent } = await import(`../scripts/${wave}/lib/schema-validate.ts`);
    assert.ok(rawEvents.length > 0, "fixture must not be empty");
    for (const ev of rawEvents) {
      const r = validateEvent(ev as never);
      assert.ok(r.valid, `event rejected: ${r.errors.join(" | ")}`);
    }
    // bite: the validator must actually reject, not rubber-stamp
    const broken = { ...(rawEvents[0] as Record<string, unknown>) };
    delete broken.event_id;
    const r = validateEvent(broken as never);
    assert.equal(r.valid, false);
    assert.ok(r.errors.length > 0);
  });

  test(`${wave}: parquetjs writes the events and reads them back`, async () => {
    const { writeEventsParquet, flattenEvent } = await import(`../scripts/${wave}/lib/parquet-write.ts`);
    const parquetjs = (await import("@dsnp/parquetjs")).default as unknown as {
      ParquetReader: { openFile(p: string): Promise<{ getCursor(): { next(): Promise<unknown> }; close(): Promise<void> }> };
    };
    const dir = mkdtempSync(join(tmpdir(), "mooter-parquet-"));
    try {
      const out = join(dir, "events.parquet");
      await writeEventsParquet(rawEvents as never[], out);
      const reader = await parquetjs.ParquetReader.openFile(out);
      const cursor = reader.getCursor();
      let n = 0;
      let first: Record<string, unknown> | null = null;
      for (let rec = await cursor.next(); rec; rec = await cursor.next()) {
        if (n === 0) first = rec as Record<string, unknown>;
        n++;
      }
      await reader.close();
      assert.equal(n, rawEvents.length, "row count must survive the round-trip");
      assert.equal(String(first?.event_id), String(flattenEvent(rawEvents[0] as never).event_id));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
