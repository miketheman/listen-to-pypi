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
  const savedVolume = localStorage.getItem("volume");
  if (savedVolume !== null) volumeEl.value = savedVolume;
  volumeEl.addEventListener("input", onVolumeChange);

  // Restore drone toggle state
  const droneEl = document.getElementById("drone-toggle");
  const savedDrone = localStorage.getItem("drone");
  if (savedDrone !== null) droneEl.checked = savedDrone !== "off";
  droneEl.addEventListener("change", onDroneToggle);

  window.addEventListener("resize", () => visual?.resize());

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

    // First fetch — seed the seen set, no sounds
    await feed.poll();
    log.info("Initial seed complete", feed.getStats());

    // Start the drone pad (respects saved toggle state)
    audio.startDrone();
    if (!document.getElementById("drone-toggle").checked) {
      audio.setDroneEnabled(false);
    }
    running = true;
    updatePlayButton();
    lastEventTime = Date.now();

    // Remove the hero overlay — animate it toward the header play button
    // to guide the user's eye, or remove instantly if reduced motion.
    const hero = document.getElementById("hero-play");
    if (hero) {
      const removeHero = () => {
        hero.remove();
        document.getElementById("play-btn").focus();
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        removeHero();
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
          .finished.then(removeHero);
      }
    }

    // First real poll immediately — no silent gap after clicking Start
    await poll();

    // Begin regular polling
    pollIntervalId = setInterval(poll, CONFIG.POLL_INTERVAL);
    startAmbientTimer();
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
  startAmbientTimer();
  updatePlayButton();
  log.info("Resumed");
  poll();
}

function updatePlayButton() {
  const btn = document.getElementById("play-btn");
  btn.innerHTML = running ? ICON_PAUSE : ICON_PLAY;
  btn.setAttribute("aria-label", running ? "Pause" : "Resume");
  btn.disabled = false;
}

async function poll() {
  if (!running) return;

  try {
    const events = await feed.poll();
    log.verbose(`Poll: ${events.length} new events`, feed.getStats());

    if (events.length > 0) {
      scheduleEvents(events);
      lastEventTime = Date.now();
    }

    updateStats();
  } catch (err) {
    log.warn("Poll failed, will retry next interval", { error: err.message });
  }
}

function scheduleEvents(events) {
  if (events.length === 0) return;

  // Spread events evenly across the poll interval so there's
  // a consistent stream of sound with minimal silence gaps.
  const totalDuration = CONFIG.POLL_INTERVAL * 0.9;
  const spacing = totalDuration / events.length;

  // Fisher-Yates shuffle for variety (since RSS items are sorted by time)
  const shuffled = [...events];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  shuffled.forEach((event, i) => {
    const jitter = (Math.random() - 0.5) * spacing * 0.4;
    // First event plays quickly (within 500ms), rest spread out
    const delay = i === 0 ? Math.random() * 500 : spacing * i + jitter;
    setTimeout(() => triggerEvent(event), Math.max(100, delay));
  });
}

function triggerEvent(event) {
  if (!running) return;

  totalEvents++;
  eventTimes.push(Date.now());

  const hints = soundHints(event);

  if (event.type === "new_package" || event.versionType === "major") {
    audio.playBowl(event.noteIndex, hints);
  } else if (event.versionType === "minor") {
    audio.playBell(event.noteIndex, "mid", hints);
  } else if (Math.random() < 0.25) {
    audio.playShimmer(event.noteIndex, hints);
  } else {
    audio.playBell(event.noteIndex, "high", hints);
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
  localStorage.setItem("volume", value);
}

function onDroneToggle(e) {
  const enabled = e.target.checked;
  audio?.setDroneEnabled(enabled);
  localStorage.setItem("drone", enabled ? "on" : "off");
}

document.addEventListener("DOMContentLoaded", init);
