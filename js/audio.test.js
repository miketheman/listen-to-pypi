// Tests for the pure tuning helpers exported from audio.js.
// AudioEngine itself needs the Web Audio API and isn't exercised here.

import assert from "node:assert";
import { test } from "node:test";
import { RATIO_432, tuneScale } from "./audio.js";

const SCALE = {
  low: [130.81, 146.83, 164.81, 196.0, 220.0],
  mid: [261.63, 293.66, 329.63, 392.0, 440.0],
  high: [523.25, 587.33, 659.26, 783.99, 880.0],
};

test("RATIO_432 is 432/440", () => {
  assert.strictEqual(RATIO_432, 432 / 440);
});

test("tuneScale with ratio 1 returns the same values", () => {
  assert.deepStrictEqual(tuneScale(SCALE, 1), SCALE);
});

test("tuneScale scales every frequency by the ratio", () => {
  const tuned = tuneScale(SCALE, RATIO_432);
  // A 440 Hz entry retunes to 432 Hz
  assert.ok(Math.abs(tuned.mid[4] - 432) < 1e-9);
  // Every octave/note is scaled uniformly
  for (const octave of ["low", "mid", "high"]) {
    tuned[octave].forEach((freq, i) => {
      assert.ok(Math.abs(freq - SCALE[octave][i] * RATIO_432) < 1e-9);
    });
  }
});

test("tuneScale does not mutate its input", () => {
  const before = SCALE.mid[4];
  tuneScale(SCALE, RATIO_432);
  assert.strictEqual(SCALE.mid[4], before);
});
