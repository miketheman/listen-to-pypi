// Translate event metadata into audio parameter hints.
// Category → waveform character, maturity → depth, author → accent.

const CATEGORY_VOICE = {
  web: { overtone: "triangle", reverbMix: 0.4 },
  data: { overtone: "sine", reverbMix: 0.3 },
  ml: { overtone: "sawtooth", reverbMix: 0.5 },
  cli: { overtone: "square", reverbMix: 0.2 },
  test: { overtone: "triangle", reverbMix: 0.2 },
  infra: { overtone: "sine", reverbMix: 0.4 },
  general: { overtone: "sine", reverbMix: 0.3 },
};

const MATURITY_DEPTH = {
  early: { decayScale: 0.7, octaveShift: 1 }, // shorter, brighter
  growing: { decayScale: 1.0, octaveShift: 0 }, // baseline
  mature: { decayScale: 1.4, octaveShift: -1 }, // longer, deeper
};

function soundHints(event) {
  const voice = CATEGORY_VOICE[event.category] || CATEGORY_VOICE.general;
  const depth = MATURITY_DEPTH[event.maturity] || MATURITY_DEPTH.growing;
  return {
    overtone: voice.overtone,
    reverbMix: voice.reverbMix,
    decayScale: depth.decayScale,
    octaveShift: depth.octaveShift,
    accent: event.hasAuthor,
  };
}

export default soundHints;
export { CATEGORY_VOICE, MATURITY_DEPTH };
