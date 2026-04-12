# Future Ideas

## Sampled Instrument Sounds

The current implementation synthesizes all sounds using the Web Audio API.
A natural evolution would be to add pre-recorded instrument samples for
richer, more organic tones:

- **Celesta / bell samples** — The listen-to-wikipedia and bitlisten projects
  both use a set of 24 celesta notes (BSD/MIT licensed, originally from
  bitlisten). These provide a warmer, more recognizable bell tone than pure
  sine synthesis. The samples are small (~50 KB each as MP3) and could be
  loaded on demand.

- **Singing bowl recordings** — Real Tibetan singing bowl recordings would
  give the "bowl" voice much more character. Public domain recordings are
  available from Freesound.org (search for "singing bowl" with CC0 license).

- **Ambient pad / swell samples** — The listen-to-wikipedia project includes
  3 "swell" samples used when new users join. Similar orchestral swell
  recordings could mark new package arrivals.

- **Hybrid approach** — Use synthesized tones for high-frequency events
  (patch releases) and sampled instruments for rarer, more significant events
  (new packages, major versions). This keeps the download small while adding
  richness where it matters most.

**Implementation notes:**

- Use Howler.js or the Web Audio API's `AudioBuffer` / `decodeAudioData` to
  load and play samples
- Provide both MP3 and OGG formats for browser compatibility
- Lazy-load samples after the first user interaction to avoid blocking initial
  render
- Consider a "sound theme" selector letting users choose between synthesized
  and sampled modes

## Other Ideas

- **Package category mapping** — Use PyPI classifiers or trove categories to
  assign different instrument voices per domain (web frameworks get one sound,
  data science another, etc.)

- **Download count integration** — Use the PyPI BigQuery dataset or
  pypistats.org API to weight sounds by package popularity. A pip release
  would be louder/deeper than an obscure utility.

- **3D visualization** — A Three.js mode (like GitHub Audio's 3D view) where
  packages orbit in space, with size representing download count or version
  maturity.

- **WebSocket / SSE server** — If PyPI adds a real-time event stream or
  WebSocket endpoint, replace RSS polling with a persistent connection for
  lower latency.

- **Shared listening mode** — Using a WebSocket server, all connected clients
  could hear the same events at the same time, creating a communal "radio
  station" experience.

- **Keyboard shortcuts** — Space to pause/resume, up/down for volume.

- **Notification API** — Optionally show browser notifications for new
  packages matching a filter (e.g., packages you maintain or depend on).

- **Recording / export** — Capture the audio output using MediaRecorder API
  and allow users to download a clip of the soundscape.
