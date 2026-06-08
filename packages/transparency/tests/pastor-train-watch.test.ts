// Wave 32 (Phase F) — Pastor train-watch renderer + sparkline.
import { test } from "node:test";
import assert from "node:assert";
import { buildTrainWatch, sparkline } from "../src/pastor-train-watch/render.ts";

test("sparkline maps a series to 8 unicode levels", () => {
  assert.strictEqual(sparkline([]), "");
  const s = sparkline([0, 1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(s.length, 8);
  assert.ok(s.startsWith("▁"));
  assert.ok(s.endsWith("█"));
  // flat series → all lowest bar (no NaN/divide-by-zero)
  assert.strictEqual(sparkline([3, 3, 3]), "▁▁▁");
});

test("phase none → honest no-run notice", () => {
  const f = buildTrainWatch({ phase: "none" });
  assert.match(f, /Train-Watch/);
  assert.match(f, /no training run recorded yet/);
  assert.match(f, /no loss metrics recorded/);
});

test("running run renders progress + loss + per-task", () => {
  const f = buildTrainWatch({
    phase: "running",
    adapter: "coding-frontend",
    taskType: "coding-frontend",
    samples: 320,
    totalSteps: 100,
    etaSec: 420,
    steps: [
      { step: 10, loss: 2.1, valLoss: 2.3 },
      { step: 50, loss: 1.2, valLoss: 1.4 },
      { step: 80, loss: 0.8, valLoss: 1.0 },
    ],
    perTask: [
      { task: "frontend", score: 0.82 },
      { task: "backend", score: 0.71 },
    ],
  });
  assert.match(f, /progress:.*80\/100/);
  assert.match(f, /ETA 7m/);
  assert.match(f, /train .*2\.100 → 0\.800/);
  assert.match(f, /val .*2\.300 → 1\.000/);
  assert.match(f, /frontend\s+\[.*\] 82%/);
});

test("done run with no metrics falls back to registry tasks", () => {
  const f = buildTrainWatch({
    phase: "done",
    adapter: "coding-backend",
    samples: 500,
    registryTasks: ["coding-frontend", "coding-backend", "data", "pt-pt", "en"],
  });
  assert.match(f, /✓ done/);
  assert.match(f, /no scores yet · 5 task adapters/);
  assert.match(f, /coding-frontend, coding-backend/);
});
