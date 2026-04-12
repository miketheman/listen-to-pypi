# CLAUDE.md

## Project Overview

**Listen to PyPI** — a real-time sonification and visualization of Python Package Index activity.
Each package release triggers a synthesized sound and animated circle on a dark canvas, creating an ambient soundscape.

No build step. No frameworks. No dependencies. Vanilla HTML/JS/CSS with Web Audio API and SVG.

## Architecture

```text
index.html              Single page, loads js/app.js as ES module
js/app.js               Entry point - wires audio, feed, visual together; event queue, controls
js/audio.js             Web Audio API synthesis (bell, bowl, shimmer, drone, reverb)
js/feed.js              RSS fetch, XML parse, dedup, event enrichment
js/sound-hints.js       Pure function mapping event metadata to audio parameters
js/visual.js            SVG circles with glow filters and SMIL ripple animations
css/style.css           CSS custom properties, ascending specificity order
manifest.json           PWA manifest for Add to Home Screen
```

All JS files use ES modules (`export default`). `app.js` is the only entry point imported from HTML.

## Running Locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

No server-side component needed. PyPI's RSS feeds serve CORS headers
(`Access-Control-Allow-Origin: *`) so the browser fetches them directly.

## Key Design Decisions

- **Client-only** — each browser runs independently, no shared server state
- **Synthesized audio** — all sounds generated via Web Audio API, no audio files
- **C major pentatonic scale** — any combination of simultaneous notes sounds harmonious
- **Event queue with adaptive drain** — poll results push to a queue; a setTimeout chain drains one event at a time with adaptive spacing (1-5s based on queue depth). Initial seed events are queued and played steadily from the start.
- **Deduplication** — a seen-set keyed on RSS `<link>` URLs, pruned at 500 entries
- **Keyboard shortcut** — Space to play/pause (skips when inputs or dialogs are focused)
- **Network recovery** — tracks consecutive poll failures, shows "Reconnecting..." after 3 failures, clears on success
- **Help dialog** — native `<dialog>` with app description, sound/color legend, and privacy note

## Event Enrichment Pipeline

Each RSS item is enriched with derived fields in `feed.js`:

| Field | Source | Used for |
| --- | --- | --- |
| `versionType` | Version string parsing | major/minor/patch → voice selection |
| `category` | Keyword scan of name + description | Timbre (overtone waveform, reverb mix) |
| `maturity` | Major version number (0.x/1-2.x/3+.x) | Decay length, octave shift |
| `hasAuthor` | Author field presence | Subtle harmonic accent |
| `noteIndex` | Hash of package name mod 5 | Deterministic note (same package = same note) |

## Sound Design

- **Bell** — minor/patch updates. Sine + harmonics, quick attack, 2-5s decay. Category sets overtone waveform, maturity scales decay.
- **Bowl** — new packages + major versions. Deeper, sine + triangle with beating, 4-8s decay.
- **Shimmer** — 25% of patches. Brief detuned pair, textural contrast.
- **Drone pad** — continuous C3+E3+G3 with slow LFO. Toggleable via header switch.
- **Ambient chime** — fires after 90s of silence, reverb-only.
- **Reverb bus** — generated impulse response (2.5s tail), shared by all voices.
- **Stereo panning** — each sound placed randomly in the stereo field.

## CSS Conventions

- All colors, fonts, and animation durations defined as CSS custom properties in `:root`
- File ordered by ascending specificity: reset → elements → classes → IDs → media queries
- No `!important` except for the `prefers-reduced-motion` override (intentional per WCAG)
- Event type colors defined in both CSS vars (`--color-*`, `--log-*`) and JS (`getColor()` in visual.js) - keep them in sync manually
- Preserve comments when refactoring — explain non-obvious behavior for future readers

## Testing

```bash
node --test js/*.test.js
```

Uses Node.js built-in test runner. Tests cover pure functions from `feed.js`
(`classifyVersion`, `classifyMaturity`, `classifyCategory`, `hashString`)
and `sound-hints.js` (`soundHints`, `CATEGORY_VOICE`, `MATURITY_DEPTH`).

## Linting and Formatting

```bash
biome check
```

`files.includes` in `biome.json` controls which files are checked.
Use `biome check` (not just `lint`) - it covers both lint rules and formatting.
`biome` is available on PATH (no npx needed). Use `biome check --write` to
auto-fix. Biome formats with double quotes and trailing commas.

`cspell.json` contains domain-specific words (detuned, SMIL, numpy, pentatonic, etc.).

## Things to Keep in Mind

- PyPI RSS feeds return 100 items each, update frequently (~8-10 releases/min)
- The `/rss/packages.xml` feed is for brand-new packages; `/rss/updates.xml` is for all releases
- New packages take priority in dedup — if a name appears in both feeds, the "new package" event wins
- PyPI RSS feeds serve `Access-Control-Allow-Origin: *` (added via <https://github.com/pypi/warehouse/pull/19846>)
