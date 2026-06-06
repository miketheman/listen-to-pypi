# 432 Hz Tuning Toggle — Design

**Date:** 2026-06-06
**Status:** Approved (pre-implementation)
**Source:** FUTURE.md → "Sound Design Experiments → 432 Hz tuning"

## Summary

Add a header toggle that retunes all pitched audio from the standard 440 Hz
reference down to 432 Hz (a uniform factor of `432/440 ≈ 0.98182`). Off by
default; persisted to localStorage; applies live, including a smooth glide of
the running drone.

## Motivation

FUTURE.md lists 432 Hz as a sound-design experiment. The evidence is weak (a
single small study; the broader 432-vs-440 claim is largely folklore), so this
is an **opt-in curiosity**, not a default. A toggle preserves user choice and
lets listeners A/B the two tunings.

## Approach

A single uniform frequency multiplier (`tuningRatio`) applied to every pitched
source. All voices (bell/bowl/shimmer/ambient chime) already read
`this.scale`, so rebuilding `this.scale` retunes them with no per-call-site
changes. The drone is the only special case (already-running oscillators), so
it gets a live glide.

Exposed as a header toggle mirroring the existing Drone switch — the most
discoverable option and consistent with established UI. Applies live (matching
the live Drone toggle); a control that did nothing until restart would be
confusing.

## Components

### `js/audio.js`

- Module constants:
  - `BASE_SCALE` — the current 440 Hz C-major-pentatonic literal, moved out of
    the constructor.
  - `RATIO_432 = 432 / 440`.
- Pure exported helper `tuneScale(scale, ratio)` → new `{low, mid, high}`
  arrays with every frequency multiplied by `ratio`. Pure and unit-testable,
  following the `feed.js` / `sound-hints.js` export pattern.
- Constructor: add `this.tuningRatio = 1`; set
  `this.scale = tuneScale(BASE_SCALE, 1)`.
- New method `setTuningEnabled(enabled)` (mirrors `setDroneEnabled`):
  - `this.tuningRatio = enabled ? RATIO_432 : 1`
  - `this.scale = tuneScale(BASE_SCALE, this.tuningRatio)`
  - If the drone is running (`this.ctx` and drone oscillators exist), glide
    drone oscillators `[0..2]` to `baseFreq × tuningRatio` using
    `frequency.setTargetAtTime(target, now, 0.15)` (~0.45 s to ~95%, the same
    smoothing style `setDroneEnabled` uses). Oscillator `[3]` is the LFO and is
    left untouched.
- Add a module const `DRONE_BASE = [130.81, 196.02, 164.91]` (C3, G3, E3),
  aligned to drone oscillator indices `[0..2]`. `startDrone()` sets each
  oscillator frequency to `DRONE_BASE[i] * this.tuningRatio` at creation (so a
  drone started while 432 is active starts in tune), and `setTuningEnabled`
  reuses `DRONE_BASE` to compute the glide targets.

### `js/app.js`

- Restore saved state: `storage.get("tuning")` — value `"432"` ⇒ toggle on,
  anything else (incl. `null`) ⇒ off.
- `onTuningToggle(e)`: `audio?.setTuningEnabled(e.target.checked)` and
  `storage.set("tuning", enabled ? "432" : "440")`.
- In `start()`, after `audio.init()` / `setVolume()` and **before**
  `startDrone()`, apply the saved tuning so both the scale and the drone start
  in tune.

### `index.html`

- Add a toggle to the header `.controls`, after the Drone toggle:

  ```html
  <label class="toggle tuning-toggle" title="432 Hz tuning (experimental)">
    <input type="checkbox" id="tuning-toggle">
    <span>432 Hz</span>
  </label>
  ```

- Add one short line to the help dialog noting the experimental 432 Hz toggle.

### `css/style.css`

- Generalize the existing `.drone-toggle` switch rules (track, knob,
  `:checked` states, label layout) to a shared `.toggle` class applied to both
  the Drone and 432 Hz labels. JS references only the `#drone-toggle` id, so
  renaming the styling hook is safe and avoids duplicating the switch CSS.
- The `432 Hz` label text stays visible on mobile (it is short and
  self-describing; a bare switch would be meaningless). It is **not** added to
  the `max-width: 600px` sr-only rule that hides the Drone/Volume labels.

## Data flow

`#tuning-toggle change` → `onTuningToggle` → `audio.setTuningEnabled(bool)` →
rebuild `this.scale` (+ glide drone) and `storage.set`. Next note read of
`this.scale` is already retuned. On load, `start()` applies the persisted value
to the engine before the first sound.

## Edge cases

- **Toggle before playback starts:** `audio` is null, so `onTuningToggle` is a
  no-op on the engine; the value still persists and is applied in `start()`.
- **Toggle while paused:** the AudioContext is suspended; rebuilding the scale
  is fine and drone `setTargetAtTime` ramps are scheduled against the frozen
  clock, taking effect on resume. New notes after resume use the new scale.
- **Drone disabled when toggled:** no drone oscillators to glide; only the
  scale rebuilds. When the drone is later re-enabled it is created at the
  current `tuningRatio`.

## Testing

- **Node (`node --test`):** `tuneScale` returns correctly scaled arrays
  (including `ratio = 1` identity and `RATIO_432` values), and `RATIO_432`
  equals `432/440`. Pure-function coverage consistent with the project's
  existing suite.
- **Browser (Playwright):** import `audio.js`, construct an engine, and verify:
  1. `setTuningEnabled(true)` scales every `this.scale` value by `RATIO_432`; `setTuningEnabled(false)` restores the 440 values.
  2. After `init()` + `startDrone()`, toggling glides drone oscillators `[0..2]` toward `base × ratio` (assert `frequency.value` after the ramp window) and leaves the LFO frequency unchanged.
  3. Header toggle wiring: flipping `#tuning-toggle` updates the engine and persists `"432"`/`"440"` to localStorage; the saved value is restored on reload.

## Non-goals

- No continuous tuning slider or reference pitches other than 432/440.
- No change to the visualization.
- No retuning of the LFO modulation rate.

## Files touched

- `js/audio.js` — tuning model, `tuneScale`, `setTuningEnabled`, drone glide.
- `js/app.js` — toggle wiring, restore, apply-on-start.
- `index.html` — header toggle, help-dialog note.
- `css/style.css` — shared `.toggle` switch class.
- `js/audio.test.js` — new pure-function tests (new file).
