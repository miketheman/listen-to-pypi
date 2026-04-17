// Main application — wires together audio, feed, visual, and log

import AudioEngine from "./audio.js";
import FeedManager from "./feed.js";
import soundHints from "./sound-hints.js";
import VisualEngine from "./visual.js";

// Logging — all levels always emit. Use DevTools log level filter to control
// verbosity. Filter by "[ListenToPyPI]" to isolate app output.
const PREFIX = "[ListenToPyPI]";
const log = {
  info: console.info.bind(console, PREFIX),
  verbose: console.debug.bind(console, PREFIX),
  warn: console.warn.bind(console, PREFIX),
  error: console.error.bind(console, PREFIX),
};

// Safe localStorage wrapper — returns null / no-ops if storage is
// unavailable (private browsing, strict security policies).
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      log.warn("localStorage unavailable, preferences won't be saved", { error: err.message });
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      log.warn("localStorage unavailable, preferences won't be saved", { error: err.message });
    }
  },
};

const CONFIG = {
  UPDATES_URL: "https://pypi.org/rss/updates.xml",
  PACKAGES_URL: "https://pypi.org/rss/packages.xml",
  POLL_INTERVAL: 30000,
  MAX_SEEN: 500,
  AMBIENT_CHIME_AFTER: 90000, // Play subtle chime if no events for 90s
};

// SVG icon markup for the play/pause button
const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><polygon points="6,3 20,12 6,21"/></svg>';
const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';

let audio, feed, visual;
let totalEvents = 0;
let eventTimes = [];
let lastEventTime = 0;
let running = false;
let statsRafPending = false;
let pollIntervalId = null;
let ambientIntervalId = null;
let drainIntervalId = null;
let consecutiveFailures = 0;
const eventQueue = [];

function init() {
  visual = new VisualEngine(document.getElementById("canvas"));

  document.getElementById("play-btn").addEventListener("click", togglePlayback);
  document.getElementById("hero-play-btn").addEventListener("click", togglePlayback);
  const helpDialog = document.getElementById("help-dialog");
  const helpBtn = document.getElementById("help-btn");
  helpBtn.addEventListener("click", () => {
    helpDialog.showModal();
    helpBtn.setAttribute("aria-expanded", "true");
  });
  // Close when clicking the backdrop (outside the dialog content)
  helpDialog.addEventListener("click", (e) => {
    if (e.target === helpDialog) helpDialog.close();
  });
  helpDialog.addEventListener("close", () => {
    helpBtn.setAttribute("aria-expanded", "false");
  });

  // Restore saved volume, or use the HTML default (50)
  const volumeEl = document.getElementById("volume");
  const savedVolume = storage.get("volume");
  if (savedVolume !== null) volumeEl.value = savedVolume;
  volumeEl.addEventListener("input", onVolumeChange);

  // Restore drone toggle state
  const droneEl = document.getElementById("drone-toggle");
  const savedDrone = storage.get("drone");
  if (savedDrone !== null) droneEl.checked = savedDrone !== "off";
  droneEl.addEventListener("change", onDroneToggle);

  window.addEventListener("resize", () => visual?.resize());

  // Space to play/pause — only when no input/button/dialog is focused
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") return;
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    togglePlayback();
  });

  log.info("App initialized", CONFIG);
}

async function togglePlayback() {
  if (running) {
    await pause();
  } else if (audio) {
    await resume();
  } else {
    await start();
  }
}

async function start() {
  const btn = document.getElementById("play-btn");
  btn.disabled = true;

  try {
    audio = new AudioEngine();
    await audio.init();
    audio.setVolume(parseInt(document.getElementById("volume").value, 10));
    log.info("AudioContext created", { state: audio.getState() });

    feed = new FeedManager({
      updatesUrl: CONFIG.UPDATES_URL,
      packagesUrl: CONFIG.PACKAGES_URL,
      maxSeen: CONFIG.MAX_SEEN,
      log,
    });

    // First fetch — seeds the seen set and returns a sample to play
    const initialEvents = await feed.poll();
    log.info("Initial seed complete", feed.getStats());

    // Start the drone pad (respects saved toggle state)
    audio.startDrone();
    if (!document.getElementById("drone-toggle").checked) {
      audio.setDroneEnabled(false);
    }
    running = true;
    updatePlayButton();
    lastEventTime = Date.now();

    // Queue the initial seed events for playback after the hero animation
    if (initialEvents.length > 0) {
      enqueueEvents(initialEvents);
    }

    // Start polling immediately — events accumulate in the queue
    pollIntervalId = setInterval(poll, CONFIG.POLL_INTERVAL);
    startAmbientTimer();

    // Remove the hero overlay — animate it toward the header play button
    // to guide the user's eye. Begin draining events once the transition
    // completes so the first sound doesn't compete with the animation.
    const hero = document.getElementById("hero-play");
    const beginPlayback = () => {
      startDrain();
    };

    if (!hero) {
      beginPlayback();
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hero.remove();
      document.getElementById("play-btn").focus();
      beginPlayback();
    } else {
      const heroBtn = document.getElementById("hero-play-btn");
      const target = document.getElementById("play-btn");
      const from = heroBtn.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = to.width / from.width;

      hero.querySelector(".hero-hint").animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200,
        fill: "forwards",
      });

      heroBtn
        .animate(
          [
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
              opacity: 0.2,
            },
          ],
          { duration: 600, easing: "ease-in", fill: "forwards" },
        )
        .finished.then(() => {
          hero.remove();
          document.getElementById("play-btn").focus();
          beginPlayback();
        });
    }
  } catch (err) {
    log.error("Failed to start", { error: err.message, stack: err.stack });
    btn.disabled = false;

    let hint = err.message;
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      hint = "Cannot reach PyPI RSS feed. Check your network connection.";
    }
    updateStatus(`Error: ${hint}`);
  }
}

async function pause() {
  running = false;
  clearInterval(pollIntervalId);
  clearInterval(ambientIntervalId);
  stopDrain();
  pollIntervalId = null;
  ambientIntervalId = null;
  // Suspend the AudioContext to immediately silence everything —
  // drone, in-flight bells/bowls, reverb tail, all of it.
  await audio.suspend();
  updatePlayButton();
  log.info("Paused");
}

async function resume() {
  await audio.resume();
  running = true;
  lastEventTime = Date.now();
  pollIntervalId = setInterval(poll, CONFIG.POLL_INTERVAL);
  startDrain();
  startAmbientTimer();
  updatePlayButton();
  log.info("Resumed");
  poll();
}

function updatePlayButton() {
  const btn = document.getElementById("play-btn");
  const label = running ? "Pause" : "Resume";
  btn.innerHTML = running ? ICON_PAUSE : ICON_PLAY;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.disabled = false;
}

async function poll() {
  if (!running) return;

  try {
    const events = await feed.poll();
    log.verbose(`Poll: ${events.length} new events`, feed.getStats());

    if (consecutiveFailures > 0) {
      consecutiveFailures = 0;
      updateStatus("");
    }

    if (events.length > 0) {
      enqueueEvents(events);
      startDrain();
    }

    updateStats();
  } catch (err) {
    consecutiveFailures++;
    log.warn(`Poll failed (attempt ${consecutiveFailures})`, { error: err.message });
    updateStatus(consecutiveFailures >= 3 ? "Reconnecting..." : "");
  }
}

// Shuffle events before queuing so new packages (which come from a
// separate feed with a wider time window) don't cluster together.
function enqueueEvents(events) {
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }
  eventQueue.push(...events);
}

// Drain events from the queue at a steady adaptive pace.
// Schedules the next drain after each event based on queue depth
// so the rate always matches the backlog — no unbounded growth.
function scheduleDrain() {
  if (!running || eventQueue.length === 0) {
    drainIntervalId = null;
    return;
  }

  const event = eventQueue.shift();
  triggerEvent(event);

  // Adaptive spacing with jitter:
  // - Small queue (1-3): ~5s spacing (relaxed, matches ~12 BPM research target)
  // - Medium queue (5-10): ~2-3s spacing (steady)
  // - Large queue (20+): ~500ms-1s (audible burst — preserves "flurry" feel)
  // Plus ±30% jitter so spacing never feels mechanical.
  const base = Math.max(
    500,
    Math.min(5000, (CONFIG.POLL_INTERVAL * 0.9) / (eventQueue.length + 1)),
  );
  const jitter = 1 + (Math.random() - 0.5) * 0.6;
  const delay = base * jitter;
  drainIntervalId = setTimeout(scheduleDrain, delay);
}

function startDrain() {
  if (drainIntervalId) return;
  scheduleDrain();
}

function stopDrain() {
  clearTimeout(drainIntervalId);
  drainIntervalId = null;
}

function triggerEvent(event) {
  if (!running) return;

  const now = Date.now();
  totalEvents++;
  eventTimes.push(now);
  lastEventTime = now;

  const hints = soundHints(event);

  if (event.type === "new_package" || event.versionType === "major") {
    audio.playBowl(event.noteIndex, hints);
  } else if (event.versionType === "minor") {
    audio.playBell(event.noteIndex, "mid", hints);
  } else if (Math.random() < 0.25) {
    audio.playShimmer(event.noteIndex, hints);
  } else {
    // Favor mid octave (70%) over high (30%) to reduce listener fatigue
    // in the 500-880 Hz range where hearing is most sensitive.
    const octave = Math.random() < 0.7 ? "mid" : "high";
    audio.playBell(event.noteIndex, octave, hints);
  }

  visual.addEvent(event);
  addLogEntry(event);
  updateStats();

  log.verbose(
    `${event.name} ${event.version} [${event.versionType}] cat=${event.category} mat=${event.maturity} auth=${event.hasAuthor}`,
  );
}

function addLogEntry(event) {
  const logList = document.getElementById("log-list");
  const li = document.createElement("li");

  const isNew = event.type === "new_package";
  const versionLabel = isNew ? "" : ` ${event.version}`;
  const desc = event.description
    ? ` \u2014 ${event.description.slice(0, 80)}${event.description.length > 80 ? "..." : ""}`
    : "";

  const a = document.createElement("a");
  a.href = event.link;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = `${isNew ? "NEW: " : ""}${event.name}${versionLabel}`;

  const span = document.createElement("span");
  span.className = "log-desc";
  span.textContent = desc;

  li.appendChild(a);
  li.appendChild(span);
  li.className = `log-${isNew ? "new" : event.versionType}`;

  // Append to bottom — newest entries appear at the bottom and scroll upward
  logList.appendChild(li);
  while (logList.children.length > 20) {
    logList.firstChild.remove();
  }
}

function startAmbientTimer() {
  ambientIntervalId = setInterval(() => {
    if (!running || !audio) return;
    const silence = Date.now() - lastEventTime;
    if (silence >= CONFIG.AMBIENT_CHIME_AFTER) {
      audio.playAmbientChime();
      log.verbose("Ambient chime (quiet period)");
      lastEventTime = Date.now();
    }
  }, 15000);
}

function updateStatus(message) {
  const el = document.getElementById("status");
  if (el.textContent !== message) el.textContent = message;
}

// Debounced via requestAnimationFrame — multiple calls per frame
// (e.g., from staggered triggerEvent timeouts) collapse into one DOM write.
function updateStats() {
  if (statsRafPending) return;
  statsRafPending = true;
  requestAnimationFrame(() => {
    statsRafPending = false;
    const now = Date.now();
    eventTimes = eventTimes.filter((t) => now - t < 60000);
    const rate = eventTimes.length;

    document.getElementById("total-count").textContent =
      `${totalEvents} update${totalEvents !== 1 ? "s" : ""}`;
    document.getElementById("rate").textContent = `${rate}/min`;
  });
}

function onVolumeChange(e) {
  const value = parseInt(e.target.value, 10);
  audio?.setVolume(value);
  storage.set("volume", value);
}

function onDroneToggle(e) {
  const enabled = e.target.checked;
  audio?.setDroneEnabled(enabled);
  storage.set("drone", enabled ? "on" : "off");
}

document.addEventListener("DOMContentLoaded", init);
