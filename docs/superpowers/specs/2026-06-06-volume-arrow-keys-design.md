# Volume Arrow Keys — Design

**Date:** 2026-06-06
**Status:** Approved (pre-implementation)
**Source:** FUTURE.md → "Keyboard shortcuts — up/down for volume"

## Summary

Add `ArrowUp` / `ArrowDown` keyboard shortcuts that adjust playback volume
globally, mirroring the existing `Space` play/pause shortcut. Each press
changes volume by 10 percentage points, clamped to 0–100.

## Motivation

The app already supports `Space` to play/pause via a single global `keydown`
handler. FUTURE.md anticipates volume keys as the natural follow-on. The
`#volume` range input already handles arrow keys natively *when focused*; this
feature provides the same control globally (when the slider is not focused),
so users can adjust volume without reaching for the mouse or tabbing to the
slider.

## Approach

Extend the existing `keydown` handler in `js/app.js` (currently `Space`-only)
rather than adding a second listener. This keeps a single keyboard entry point
and reuses its focus/dialog guards. Volume application reuses the existing
`onVolumeChange` path by re-dispatching the slider's `input` event, so there is
exactly one place that applies and persists volume.

Rejected alternatives:
- *Separate dedicated keydown listener* — duplicates the guard logic across two
  handlers that must stay in sync.
- *Extract an `applyVolume()` helper* — over-engineered for two lines of logic
  (`audio?.setVolume` + `storage.set`); YAGNI.

## Behavior

- In the existing `keydown` handler, after the `Space` branch, handle
  `e.code === "ArrowUp"` and `e.code === "ArrowDown"`.
- **Per-key guard (important):** the `Space` branch skips when the active
  element is an `INPUT`, `BUTTON`, or `TEXTAREA` (so Space activates a focused
  button instead of toggling). The arrow branch must use a *narrower* guard —
  skip only when the active element is an `INPUT` or `TEXTAREA`, or when a
  `dialog[open]` is present. It must **not** skip on `BUTTON`, because after
  `start()` focus lands on `#play-btn` (a button); skipping there would make the
  arrows dead in the most common state right after playback starts. Arrows
  don't activate buttons, so allowing them while a button is focused is safe.
- Skipping on `INPUT` deliberately leaves a *focused* `#volume` slider to the
  browser's native arrow handling, so the two never conflict.
- `ArrowUp` → `value + 10`; `ArrowDown` → `value - 10`; clamp to `[0, 100]`.
- Set `volumeEl.value`, then `volumeEl.dispatchEvent(new Event("input"))` so the
  existing `onVolumeChange` listener applies the gain to the audio engine and
  persists to `localStorage`.
- Call `e.preventDefault()`, consistent with the `Space` branch.

## Edge cases

- **Before playback starts:** harmless. `onVolumeChange` applies via
  `audio?.setVolume(...)` (optional-chained, no-op when audio is absent), and
  the persisted value is restored during `start()`. Adjusting volume before
  pressing play still persists and takes effect on start.
- **Clamping:** repeated presses at the extremes stay pinned at 0 or 100.
- **Key repeat:** holding the key relies on the browser's native key-repeat; no
  custom repeat handling.

## Non-goals

- No on-screen volume indicator. The slider thumb moving in the header is the
  only feedback (consistent with the project convention of not adding
  unrequested UI).
- No mute toggle.
- No configurable step size or repeat rate.

## Testing

The change is a DOM `keydown` handler, not a pure function, so it falls outside
the existing `node --test` pure-function suite (`feed.js`, `sound-hints.js`).
Verify in a browser with Playwright:

1. Press `ArrowUp` / `ArrowDown` with nothing focused; assert `#volume.value` moves by 10 and clamps at 0/100.
2. Assert the audio engine received the new gain (master gain reflects `value / 100`).
3. Confirm a *focused* slider still uses native stepping (our handler does not double-apply).
4. Confirm the keys are ignored while the help dialog is open.
5. Confirm the keys **work** immediately after `start()`, when `#play-btn` holds focus (regression guard for the per-key guard decision above).

## Files touched

- `js/app.js` — extend the `keydown` handler.
