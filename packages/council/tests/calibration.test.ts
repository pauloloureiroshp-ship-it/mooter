import { test } from "node:test";
import assert from "node:assert/strict";
import {
  smoothedRate,
  isotonicPAVA,
  isotonicPredict,
  brier,
  expectedCalibrationError,
  reliabilityBins,
  looCv,
} from "../src/calibration.ts";

test("smoothedRate: shrinks extremes toward the prior (no 100% from a 2/2 bucket)", () => {
  assert.equal(smoothedRate(2, 2, 0.8, 2), (2 + 1.6) / 4); // 0.9, not 1.0
  assert.equal(smoothedRate(0, 1, 0.8, 2), 1.6 / 3); // ~0.533, not 0
  // strength 0 → raw empirical rate
  assert.equal(smoothedRate(3, 4, 0.5, 0), 0.75);
});

test("isotonicPAVA: produces a monotone non-decreasing fit, pooling violators", () => {
  const fit = isotonicPAVA([
    { score: 1, label: 1 },
    { score: 2, label: 0 },
    { score: 3, label: 1 },
  ]);
  // (1,1),(2,0) violate → pooled to 0.5; (3,1) stays.
  assert.deepEqual(fit, [{ x: 2, y: 0.5 }, { x: 3, y: 1 }]);
  // monotone non-decreasing in y
  for (let i = 1; i < fit.length; i++) assert.ok(fit[i].y >= fit[i - 1].y);
});

test("isotonicPAVA: already-monotone data is preserved as per-point means", () => {
  const fit = isotonicPAVA([
    { score: 0.1, label: 0 },
    { score: 0.5, label: 0 },
    { score: 0.9, label: 1 },
  ]);
  assert.equal(isotonicPredict(fit, 0.1), 0);
  assert.equal(isotonicPredict(fit, 0.9), 1);
});

test("isotonicPredict: clamps below/above the fitted range", () => {
  const fit = [{ x: 0.3, y: 0.2 }, { x: 0.7, y: 0.9 }];
  assert.equal(isotonicPredict(fit, 0.0), 0.2, "below range → lowest block");
  assert.equal(isotonicPredict(fit, 0.5), 0.2);
  assert.equal(isotonicPredict(fit, 0.7), 0.9);
  assert.equal(isotonicPredict(fit, 1.0), 0.9, "above range → highest block");
  assert.equal(isotonicPredict([], 0.4), 0.5, "empty fit → 0.5");
});

test("brier: mean squared error of probabilistic predictions", () => {
  assert.equal(brier([0.5, 0.5], [1, 0]), 0.25);
  assert.equal(brier([1, 0], [1, 0]), 0, "perfect → 0");
});

test("expectedCalibrationError: 0 when confidence equals accuracy in every bin", () => {
  // all preds 0.9, 9/10 correct → bin conf 0.9, acc 0.9 → ECE 0.
  const preds = Array(10).fill(0.9);
  const labels = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
  assert.ok(expectedCalibrationError(preds, labels, 5) < 1e-9);
});

test("expectedCalibrationError: detects an over-confident signal", () => {
  // claims 0.9 but only 50% correct → ECE ≈ 0.4
  const preds = Array(10).fill(0.9);
  const labels = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
  assert.ok(Math.abs(expectedCalibrationError(preds, labels, 5) - 0.4) < 1e-9);
});

test("reliabilityBins: buckets predictions and reports per-bin conf/acc", () => {
  const bins = reliabilityBins([0.1, 0.9], [0, 1], 2);
  assert.equal(bins[0].n, 1);
  assert.equal(bins[1].n, 1);
  assert.equal(bins[1].acc, 1);
});

test("looCv: trains on n-1 and predicts the held-out sample", () => {
  const samples = [{ y: 1 }, { y: 1 }, { y: 0 }, { y: 0 }];
  const fit = (train: { y: number }[]) => {
    const m = train.reduce((s, t) => s + t.y, 0) / train.length;
    return () => m;
  };
  const preds = looCv(samples, fit);
  // leaving out a 1 → mean of {1,0,0} = 0.333; leaving out a 0 → mean of {1,1,0} = 0.667
  assert.ok(Math.abs(preds[0] - 1 / 3) < 1e-9);
  assert.ok(Math.abs(preds[2] - 2 / 3) < 1e-9);
});
