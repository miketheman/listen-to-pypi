# Sound Design

This document explains the audio design choices in Listen to PyPI and the
reasoning behind them.

## Goals

- Create a calm, ambient soundscape suitable for background listening
- Convey real-time PyPI activity without demanding attention
- Avoid listener fatigue during extended sessions

## Scale

All notes are drawn from the **C major pentatonic scale** (C, D, E, G, A)
across three octaves. Any combination of simultaneous notes in this scale
sounds harmonious, which is important since events arrive at unpredictable
times and overlap freely.

Research confirms this choice: pentatonic scales lack semitones, which
eliminates tonal tension and produces significantly higher pleasantness
ratings than other stimuli (Dondena et al., 2024). The pentatonic scale
appears in most world music traditions, suggesting a naturally occurring
resonance with human perception.

Each package gets a deterministic note (hash of package name mod 5), so the
same package always produces the same tone.

## Voices

### Drone Pad

A continuous C major triad (C3, E3, G3) using pure sine oscillators with a
slow LFO (0.04 Hz) for gentle volume breathing.

- Gain is low (0.035) so it sits beneath the event sounds
- E3 is slightly detuned (+0.1 Hz) to soften beating with G3 on headphones
- Toggleable via the header switch; state persisted in localStorage

### Bell Chime (minor/patch updates - most frequent)

Sine fundamental with 2-4 overtone harmonics. Category metadata controls the
overtone waveform (sine vs triangle), maturity controls decay length.

- Gain kept low (0.1 per harmonic, divided by harmonic number) to avoid
  dominating the mix during high-activity periods
- Higher reverb mix (0.45) pushes bells into the background, creating an
  atmospheric wash rather than sharp individual strikes
- 50ms attack avoids clicks on mobile hardware while producing a softer,
  less percussive onset. Research on relaxation stimuli recommends smooth
  attack envelopes to prevent startling transitions (Dondena et al., 2024)
- Frequency range spans mid-to-high octave (261-880 Hz). The high octave
  (500-880 Hz) is where human hearing is most sensitive, so patch releases
  favor the mid octave 70% of the time to reduce fatigue

### Singing Bowl (new packages + major versions - less frequent)

Two oscillators with a slight beat frequency (1-2 Hz) creating a slow
pulsing effect, plus an octave-doubled overtone.

- Beat frequency narrowed to 1-2 Hz for a consistently calming pulse.
  A singing bowl study found beat frequencies in this range correlated
  with increased theta wave activity (~251% spectral increase), which
  is associated with relaxed meditation states (Stumpf et al., 2023)
- Octave overtone gain reduced to 0.015 to avoid brightness competing with
  bells
- Longer decay (4-8s) gives these events more presence, appropriate for
  their lower frequency of occurrence
- Softer attack (30-80ms) compared to bells, matching the organic onset of
  a real singing bowl strike

### Shimmer (25% of patch updates)

A brief detuned pair of oscillators (6 cents apart) creating a chorus
effect. Short decay (0.3-0.8s). These provide textural variety without
adding sustained density.

### Ambient Chime

A single reverb-heavy bell that fires after 90 seconds of silence. Prevents
the soundscape from feeling dead during quiet periods on PyPI.

## Mix Considerations

**Sparse textures with generous silence** are more relaxing than continuous
layered tones. Thoma et al. (2013) found that listening to relaxing music
before a stressor significantly reduced cortisol response compared to
silence, and Dondena et al. (2024) found optimal relaxation at ~12 BPM
(0.2 Hz) - far slower than typical musical tempos.

With events draining every 2-5 seconds, each bell/bowl has a 2-8 second
tail, meaning 2-4 notes overlap at steady state. To keep this from becoming
a fatiguing wall of sound:

- Bell gain is modest (0.1) relative to the drone (0.035) - bells are only
  ~3x the drone, not 4x
- Higher reverb mix (0.45) blends bells into a wash rather than distinct
  strikes
- The drone provides a warm foundation that makes silence between events
  feel intentional rather than empty
- Stereo panning spreads sounds across the field, reducing the perception
  of density

## Reverb

A synthesized impulse response (2.5 second tail) shared by all voices via
a convolver node. The reverb bus receives a configurable mix from each voice
(bells 45%, bowls 35%, shimmers 30%). This shared space creates cohesion
between otherwise unrelated sounds.

## Frequencies to Avoid

- Below 100 Hz: rumble on small speakers, inaudible on phone speakers
- 2-4 kHz sustained: most fatiguing range per Fletcher-Munson curves
- Pure integer harmonics without detune: sound synthetic and metallic

The current design stays primarily in 130-880 Hz with slight detuning on
all voices, hitting the sweet spot for warmth without fatigue.

## Generative Qualities

Like Brian Eno's generative ambient work (notably Music for Airports, 1978),
this soundscape is never the same twice. Eno used incommensurable tape loop
lengths (16-32 seconds) so patterns never repeated exactly. Our system
achieves a similar effect naturally - real-time data drives the event
stream, producing unpredictable timing and note combinations that evolve
continuously without repetition.

## References

Listed by influence on this project's sound design:

1. Dondena, C. et al. (2024). Pentatonic sequences and monaural beats to
  facilitate relaxation: an EEG study. Frontiers in Psychology, 15.
  <https://doi.org/10.3389/fpsyg.2024.1369485>
  Informed: scale choice, 50ms attack envelope, 2-5s event spacing.

2. Stumpf, S. et al. (2023). Acute Relaxation Response Induced by Tibetan
  Singing Bowl Sounds: A Randomized Controlled Trial. Complementary
  Medicine Research, 30(2), 126-134.
  <https://doi.org/10.1159/000528188>
  Informed: bowl beat frequency range (1-2 Hz), frequency range (99-465 Hz).

3. Thoma, M.V. et al. (2013). The effect of music on the human stress
  response. PLoS ONE, 8(8), e70156.
  <https://doi.org/10.1371/journal.pone.0070156>
  Informed: overall approach of sparse, relaxing tones for stress reduction.
