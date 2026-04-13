// Audio synthesis engine using Web Audio API
// Generates all sounds programmatically — no audio files needed

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.droneGain = null;
    this.droneOscillators = [];
    this.droneEnabled = true;
    this.droneBreathTimer = null;
    this.activeNotes = 0;
    this.maxNotes = 15;
    this.noteTimeout = 300;

    // C major pentatonic across 3 octaves
    this.scale = {
      low: [130.81, 146.83, 164.81, 196.0, 220.0],
      mid: [261.63, 293.66, 329.63, 392.0, 440.0],
      high: [523.25, 587.33, 659.26, 783.99, 880.0],
    };
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);

    // Reverb bus — gives all sounds spatial depth and blends them together
    this._initReverb();

    // Dry bus for non-reverb signals
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;
    this.dryGain.connect(this.masterGain);

    // Drone output
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.masterGain);

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  _initReverb() {
    // Simple convolution reverb using a generated impulse response
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2.5; // 2.5 second tail
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Exponential decay with random noise = simple room reverb
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
      }
    }

    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.3;

    // reverb send → convolver → reverbGain → master
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);
    convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
  }

  // Create a gain node routed to a destination at a specific level
  _scaledSend(destination, level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(destination);
    return g;
  }

  // Route a panner to both dry and reverb buses at the given mix ratio
  _routePan(reverbMix) {
    const pan = this._randomPan();
    pan.connect(this._scaledSend(this.dryGain, 1 - reverbMix));
    pan.connect(this._scaledSend(this.reverbSend, reverbMix));
    return pan;
  }

  // Add a quiet perfect-fifth harmonic for authored packages
  _playAccent(pan, freq, now, decayBase, { peak = 0.03, attack = 0.01, decayMul = 0.6 } = {}) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * 1.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decayBase * decayMul);
    osc.connect(gain).connect(pan);
    osc.start(now);
    osc.stop(now + decayBase * decayMul + 0.1);
  }

  _randomPan() {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.4; // -0.7 to +0.7
    return pan;
  }

  startDrone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Two sine oscillators forming a fifth (C3 + G3), slightly detuned for warmth
    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 130.81;

    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 196.02; // G3 + slight detune for slow beating

    const osc3 = this.ctx.createOscillator();
    osc3.type = "sine";
    osc3.frequency.value = 164.91; // E3 + slight detune to soften beating with G3

    // Slow LFO for gentle volume modulation
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.04;

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.008;

    lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);

    osc1.connect(this.droneGain);
    osc2.connect(this.droneGain);
    osc3.connect(this.droneGain);

    // Fade in the drone over 3 seconds
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.035, now + 3);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    lfo.start(now);

    this.droneOscillators = [osc1, osc2, osc3, lfo];
    this.droneLfo = lfo;
    this.droneLfoGain = lfoGain;
    this._scheduleDroneBreath();
  }

  // Breathing cycle: the drone fades out to silence and back in at
  // random intervals so the texture never becomes static. Randomized
  // timings prevent the cycle from feeling mechanical (inspired by
  // Eno's incommensurable loop technique).
  _scheduleDroneBreath() {
    if (!this.droneEnabled) return;

    const fadeOut = 45 + Math.random() * 45; // 45-90s fade out
    const silence = 15 + Math.random() * 15; // 15-30s silence
    const fadeIn = 45 + Math.random() * 45; // 45-90s fade in
    const hold = 60 + Math.random() * 120; // 60-180s at full level

    // Wait at full level, then begin the breath cycle
    this.droneBreathTimer = setTimeout(() => {
      if (!this.droneEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Schedule the full breath: fade out -> silence -> fade in
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
      this.droneGain.gain.linearRampToValueAtTime(0, now + fadeOut);
      const returnTime = now + fadeOut + silence;
      this.droneGain.gain.linearRampToValueAtTime(0, returnTime);
      this.droneGain.gain.linearRampToValueAtTime(0.035, returnTime + fadeIn);

      // Schedule next cycle after this breath completes
      const breathDuration = (fadeOut + silence + fadeIn) * 1000;
      this.droneBreathTimer = setTimeout(() => {
        this._scheduleDroneBreath();
      }, breathDuration);
    }, hold * 1000);
  }

  _stopDroneBreath() {
    clearTimeout(this.droneBreathTimer);
    this.droneBreathTimer = null;
  }

  setDroneEnabled(enabled) {
    if (!this.droneGain || !this.ctx) return;
    this.droneEnabled = enabled;
    const now = this.ctx.currentTime;

    // Cancel any in-flight ramps (breathing cycle or startup fade)
    this.droneGain.gain.cancelScheduledValues(0);

    if (enabled) {
      // Reconnect LFO, fade in, and restart breathing cycle
      this.droneLfoGain?.connect(this.droneGain.gain);
      this.droneGain.gain.setTargetAtTime(0.035, now, 0.3);
      this._scheduleDroneBreath();
    } else {
      // Stop breathing, disconnect LFO, fade out
      this._stopDroneBreath();
      this.droneLfoGain?.disconnect();
      this.droneGain.gain.setTargetAtTime(0, now, 0.15);
    }
  }

  // Bell sound — used for minor/patch updates
  // hints: { overtone, reverbMix, decayScale, octaveShift, accent }
  playBell(noteIndex, octave, hints = {}) {
    if (!this.ctx || this.activeNotes >= this.maxNotes) return;
    this.activeNotes++;

    // Apply octave shift from maturity, plus occasional random drift
    const octaves = ["low", "mid", "high"];
    let idx = octaves.indexOf(octave) + (hints.octaveShift || 0);
    if (Math.random() < 0.15) idx += Math.random() < 0.5 ? -1 : 1;
    octave = octaves[Math.max(0, Math.min(2, idx))];

    const freq = this.scale[octave][noteIndex % 5];
    const now = this.ctx.currentTime;
    const detune = (Math.random() - 0.5) * 8;
    const decayScale = hints.decayScale || 1;

    const decayBase = (2 + Math.random() * 3) * decayScale;
    const numHarmonics = 2 + Math.floor(Math.random() * 3);
    const overtoneType = hints.overtone || (Math.random() < 0.3 ? "triangle" : "sine");

    const pan = this._routePan(hints.reverbMix ?? 0.45);

    for (let h = 0; h < numHarmonics; h++) {
      const osc = this.ctx.createOscillator();
      osc.type = h === 0 ? "sine" : overtoneType;
      osc.frequency.value = freq * (h + 1);
      osc.detune.value = detune + (Math.random() - 0.5) * (h + 1) * 4;

      const gain = this.ctx.createGain();
      const level = 0.1 / (h + 1);
      const decay = decayBase / (1 + h * 0.4);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

      osc.connect(gain).connect(pan);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }

    if (hints.accent) {
      this._playAccent(pan, freq, now, decayBase);
    }

    setTimeout(() => {
      this.activeNotes--;
    }, this.noteTimeout);
  }

  // Bowl sound — used for new packages and major versions
  // hints: { overtone, reverbMix, decayScale, octaveShift, accent }
  playBowl(noteIndex, hints = {}) {
    if (!this.ctx || this.activeNotes >= this.maxNotes) return;
    this.activeNotes++;

    const octaves = ["low", "mid"];
    const shift = hints.octaveShift || 0;
    const useOctave = octaves[Math.max(0, Math.min(1, (Math.random() < 0.25 ? 1 : 0) + shift))];
    const freq = this.scale[useOctave][noteIndex % 5];
    const now = this.ctx.currentTime;
    const decayScale = hints.decayScale || 1;

    const beatFreq = 1.0 + Math.random() * 1.0;
    const decayBase = (4 + Math.random() * 4) * decayScale;
    const overtoneType = hints.overtone || (Math.random() < 0.4 ? "triangle" : "sine");

    const pan = this._routePan(hints.reverbMix ?? 0.35);

    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;

    const osc2 = this.ctx.createOscillator();
    osc2.type = overtoneType;
    osc2.frequency.value = freq + beatFreq;

    const osc3 = this.ctx.createOscillator();
    osc3.type = overtoneType;
    osc3.frequency.value = freq * 2;

    const g1 = this.ctx.createGain();
    const g2 = this.ctx.createGain();
    const g3 = this.ctx.createGain();

    const attack = 0.03 + Math.random() * 0.05;

    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(0.1, now + attack);
    g1.gain.exponentialRampToValueAtTime(0.001, now + decayBase);

    g2.gain.setValueAtTime(0.001, now);
    g2.gain.linearRampToValueAtTime(0.06, now + attack);
    g2.gain.exponentialRampToValueAtTime(0.001, now + decayBase * 0.8);

    g3.gain.setValueAtTime(0.001, now);
    g3.gain.linearRampToValueAtTime(0.015, now + attack);
    g3.gain.exponentialRampToValueAtTime(0.001, now + decayBase * 0.6);

    osc1.connect(g1).connect(pan);
    osc2.connect(g2).connect(pan);
    osc3.connect(g3).connect(pan);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + decayBase + 0.1);
    osc2.stop(now + decayBase * 0.8 + 0.1);
    osc3.stop(now + decayBase * 0.6 + 0.1);

    if (hints.accent) {
      this._playAccent(pan, freq, now, decayBase, {
        peak: 0.02,
        attack: 0.05,
        decayMul: 0.5,
      });
    }

    setTimeout(() => {
      this.activeNotes--;
    }, this.noteTimeout * 2);
  }

  // Shimmer — a brief, bright accent
  // hints: { overtone, reverbMix, decayScale }
  playShimmer(noteIndex, hints = {}) {
    if (!this.ctx || this.activeNotes >= this.maxNotes) return;
    this.activeNotes++;

    const freq = this.scale.high[noteIndex % 5];
    const now = this.ctx.currentTime;
    const decayScale = hints.decayScale || 1;

    const pan = this._routePan(hints.reverbMix ?? 0.3);

    const oscType = hints.overtone || "sine";
    const osc1 = this.ctx.createOscillator();
    osc1.type = oscType;
    osc1.frequency.value = freq;
    osc1.detune.value = -6;

    const osc2 = this.ctx.createOscillator();
    osc2.type = oscType;
    osc2.frequency.value = freq;
    osc2.detune.value = 6;

    const decay = (0.3 + Math.random() * 0.5) * decayScale;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(pan);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + decay + 0.1);
    osc2.stop(now + decay + 0.1);

    setTimeout(() => {
      this.activeNotes--;
    }, 100);
  }

  // Ambient chime — subtle random bell for quiet periods
  playAmbientChime() {
    const noteIndex = Math.floor(Math.random() * 5);
    const octaves = ["mid", "high"];
    const octave = octaves[Math.floor(Math.random() * octaves.length)];
    const now = this.ctx.currentTime;

    const pan = this._randomPan();
    pan.connect(this.reverbSend); // heavy reverb, no dry — ghostly

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.scale[octave][noteIndex];

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 4);

    osc.connect(gain).connect(pan);
    osc.start(now);
    osc.stop(now + 4.1);
  }

  // Suspend the AudioContext — immediately silences all output.
  // Existing oscillators freeze in place and resume where they left off.
  async suspend() {
    this._stopDroneBreath();
    if (this.ctx?.state === "running") {
      await this.ctx.suspend();
    }
  }

  async resume() {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.droneEnabled) {
      this._scheduleDroneBreath();
    }
  }

  setVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(value / 100, this.ctx.currentTime);
    }
  }

  getState() {
    return this.ctx ? this.ctx.state : "uninitialized";
  }
}

export default AudioEngine;
