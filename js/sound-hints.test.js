import assert from "node:assert/strict";
import { describe, it } from "node:test";
import soundHints, { CATEGORY_VOICE, MATURITY_DEPTH } from "./sound-hints.js";

describe("soundHints", () => {
  const baseEvent = {
    category: "general",
    maturity: "growing",
    hasAuthor: false,
  };

  it("returns baseline values for a general/growing/anonymous event", () => {
    const hints = soundHints(baseEvent);
    assert.equal(hints.overtone, "sine");
    assert.equal(hints.reverbMix, 0.3);
    assert.equal(hints.decayScale, 1.0);
    assert.equal(hints.octaveShift, 0);
    assert.equal(hints.accent, false);
  });

  it("sets accent to true when event has an author", () => {
    const hints = soundHints({ ...baseEvent, hasAuthor: true });
    assert.equal(hints.accent, true);
  });

  it("maps each known category to a distinct overtone", () => {
    const overtones = new Set();
    for (const cat of Object.keys(CATEGORY_VOICE)) {
      const hints = soundHints({ ...baseEvent, category: cat });
      overtones.add(hints.overtone);
      assert.equal(typeof hints.reverbMix, "number");
    }
    // Should have at least 3 distinct overtone types for variety
    assert.ok(overtones.size >= 3, `Expected >= 3 distinct overtones, got ${overtones.size}`);
  });

  it("maps each known maturity to different depth parameters", () => {
    const early = soundHints({ ...baseEvent, maturity: "early" });
    const growing = soundHints({ ...baseEvent, maturity: "growing" });
    const mature = soundHints({ ...baseEvent, maturity: "mature" });

    // Early should be shorter and brighter (higher octave shift)
    assert.ok(early.decayScale < growing.decayScale);
    assert.ok(early.octaveShift > growing.octaveShift);

    // Mature should be longer and deeper (lower octave shift)
    assert.ok(mature.decayScale > growing.decayScale);
    assert.ok(mature.octaveShift < growing.octaveShift);
  });

  it("falls back to general voice for unknown categories", () => {
    const hints = soundHints({ ...baseEvent, category: "nonexistent" });
    assert.equal(hints.overtone, CATEGORY_VOICE.general.overtone);
    assert.equal(hints.reverbMix, CATEGORY_VOICE.general.reverbMix);
  });

  it("falls back to growing depth for unknown maturity", () => {
    const hints = soundHints({ ...baseEvent, maturity: "nonexistent" });
    assert.equal(hints.decayScale, MATURITY_DEPTH.growing.decayScale);
    assert.equal(hints.octaveShift, MATURITY_DEPTH.growing.octaveShift);
  });

  it("produces correct hints for a web/mature/authored event", () => {
    const hints = soundHints({
      category: "web",
      maturity: "mature",
      hasAuthor: true,
    });
    assert.equal(hints.overtone, "triangle");
    assert.equal(hints.reverbMix, 0.4);
    assert.equal(hints.decayScale, 1.4);
    assert.equal(hints.octaveShift, -1);
    assert.equal(hints.accent, true);
  });

  it("produces correct hints for an ml/early/anonymous event", () => {
    const hints = soundHints({
      category: "ml",
      maturity: "early",
      hasAuthor: false,
    });
    assert.equal(hints.overtone, "sawtooth");
    assert.equal(hints.reverbMix, 0.5);
    assert.equal(hints.decayScale, 0.7);
    assert.equal(hints.octaveShift, 1);
    assert.equal(hints.accent, false);
  });
});

describe("CATEGORY_VOICE coverage", () => {
  it("has entries for all categories that feed.js can produce", () => {
    const expectedCategories = ["web", "data", "ml", "cli", "test", "infra", "general"];
    for (const cat of expectedCategories) {
      assert.ok(CATEGORY_VOICE[cat], `Missing CATEGORY_VOICE entry for "${cat}"`);
    }
  });
});

describe("MATURITY_DEPTH coverage", () => {
  it("has entries for all maturity levels that feed.js can produce", () => {
    const expectedLevels = ["early", "growing", "mature"];
    for (const level of expectedLevels) {
      assert.ok(MATURITY_DEPTH[level], `Missing MATURITY_DEPTH entry for "${level}"`);
    }
  });
});
