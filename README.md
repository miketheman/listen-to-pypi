# Listen to PyPI

Real-time sonification and visualization of Python Package Index activity.

Watch and listen as packages are published to [PyPI](https://pypi.org) -
each release triggers a sound and a visual ripple on screen.
The result is an ambient, meditative soundscape driven by the Python community's
activity.

## How It Works

The app polls PyPI's RSS feeds every 30 seconds,
identifies new events since the last poll,
and maps each one to a synthesized sound and an animated circle on a dark canvas.

**Sound mapping:**

| Event | Sound | Pitch |
| --- | --- | --- |
| New package | Singing bowl (deep, resonant) | Low octave |
| Major version | Singing bowl | Low octave |
| Minor version | Bell chime | Mid octave |
| Patch version | Bell chime | High octave |

All sounds are synthesized in the browser using the Web Audio API - no audio
files are loaded. Notes are drawn from a **C major pentatonic scale** so that
any combination of simultaneous tones sounds harmonious.

A quiet **ambient drone pad** plays continuously, creating a warm foundation. Toggle it off with the **Drone** switch in the header if you prefer events only.
The specific note for each package is determined by hashing its name, so the
same package always produces the same tone.

**Visuals:**

- Circles appear at random positions, sized and colored by event type
- New packages glow gold; major versions are blue; minor are teal-blue;
  patches are gray
- A ripple ring expands outward from each event
- Package names and versions appear briefly as labels
- An event log scrolls in the bottom-left corner

**Controls:**

- **Play/Pause** button in the header (or press **Space**)
- **Volume** slider
- **Drone** toggle to mute/unmute the background pad
- **?** button opens a help dialog with sound/color legend and privacy info

## Running Locally

No build step required. Serve the files with any static HTTP server:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>

## Logging

All activity is logged to the browser console with a `[ListenToPyPI]`
prefix. Open DevTools and use the built-in log level filter to control
verbosity:

- `console.info` — lifecycle events (init, start, pause, resume)
- `console.debug` — per-poll and per-event detail (hidden by default in
  most browsers unless "Verbose" log level is enabled in DevTools)
- `console.warn` — poll retry errors
- `console.error` — startup failures

## Deployment

This is a fully static site. Deploy to GitHub Pages, Netlify, Vercel, or any
static hosting provider by pushing the repository contents.

For GitHub Pages: enable Pages in the repository settings and set the source
to the root of the `main` branch.

## Tech Stack

- **Vanilla HTML/JS/CSS** - no frameworks, no build tools, no dependencies
- **Web Audio API** - all sounds synthesized in the browser
- **SVG + CSS animations** - lightweight visual effects
- **PyPI RSS feeds** - `/rss/updates.xml` and `/rss/packages.xml`

## Inspiration

This project is inspired by:

- [GitHub Audio](https://github.com/debugger22/github-audio)
- [Listen to Wikipedia](https://github.com/hatnote/listen-to-wikipedia)
- [BitListen](https://github.com/lupine-dev/bitlisten)

## Authors

- [Mike Fiedler](https://github.com/miketheman), with assistance from [Claude](https://claude.com).

## License

MIT
