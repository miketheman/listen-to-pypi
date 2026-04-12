# CLAUDE.md

## Project Overview

**Listen to PyPI** — a real-time sonification and visualization of Python Package Index activity.
Each package release triggers a synthesized sound and animated circle on a dark canvas, creating an ambient soundscape.

No build step. No frameworks. No dependencies. Vanilla HTML/JS/CSS with Web Audio API and SVG.

## Architecture

```text
index.html              Single page, loads js/app.js as ES module
js/app.js               Entry point — wires audio, feed, visual together; contains log
js/audio.js             Web Audio API synthesis (bell, bowl, shimmer, drone, reverb)
js/feed.js              RSS fetch, XML parse, dedup, event enrichment
js/sound-hints.js       Pure function mapping event metadata to audio parameters
js/visual.js            SVG circles with glow filters and SMIL ripple animations
css/style.css           CSS custom properties, ascending specificity order
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
- **Event staggering** — new events from each poll are spread evenly across the 30s interval to maintain consistent sound
- **Deduplication** — a seen-set keyed on RSS `<link>` URLs, seeded silently on first load, pruned at 500 entries

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
- No `!important`
- Event type colors defined in both CSS vars (`--color-*`, `--log-*`) and JS (`getColor()` in visual.js) — keep them in sync
- Preserve comments when refactoring — explain non-obvious behavior for future readers

## Testing

```bash
node --test js/feed.test.js
```

Uses Node.js built-in test runner. Tests cover the pure functions exported from `feed.js`:
`classifyVersion`, `classifyMaturity`, `classifyCategory`, `hashString`.

These are exported as named exports alongside the default `FeedManager` class.

## Linting and Formatting

```bash
biome check js/ css/ index.html
```

Use `biome check` (not just `lint`) — it covers both lint rules and formatting.
`biome` is available on PATH (no npx needed). Use `biome check --write` to
auto-fix. Biome formats with tabs and double quotes.

`cspell.json` contains domain-specific words (detuned, SMIL, numpy, pentatonic, etc.).

## Things to Keep in Mind

- PyPI RSS feeds return 100 items each, update frequently (~8-10 releases/min)
- The `/rss/packages.xml` feed is for brand-new packages; `/rss/updates.xml` is for all releases
- New packages take priority in dedup — if a name appears in both feeds, the "new package" event wins
- PyPI RSS feeds serve `Access-Control-Allow-Origin: *` (added via <https://github.com/pypi/warehouse/pull/19846>)
