import type { BackingInstrument } from "./backing-track-model";

type Filter = { type: BiquadFilterType; frequency: number };
type Sound = {
  lowestNote?: number;
  drive?: number;
  maxSeconds?: number;
  filters: Filter[];
  pan?: { rate: number; depth: number };
};
/** Instrument-scoped processing never changes another genre's approved bus. */
const sounds: Partial<Record<BackingInstrument, Sound>> = {
  "rock-guitar": {
    lowestNote: 44,
    maxSeconds: 3.4,
    drive: 2.2,
    filters: [
      { type: "highpass", frequency: 95 },
      { type: "lowpass", frequency: 4300 },
    ],
  },
  "rock-muted": {
    lowestNote: 44,
    maxSeconds: 0.55,
    drive: 2.2,
    filters: [
      { type: "highpass", frequency: 95 },
      { type: "lowpass", frequency: 4300 },
    ],
  },
  "rock-bass": {
    maxSeconds: 1.7,
    filters: [{ type: "lowpass", frequency: 1800 }],
  },
  "blues-rhythm": {
    lowestNote: 44,
    maxSeconds: 0.9,
    drive: 1.4,
    filters: [
      { type: "highpass", frequency: 100 },
      { type: "lowpass", frequency: 4800 },
    ],
  },
  "blues-lead": {
    maxSeconds: 0.9,
    drive: 1.55,
    filters: [
      { type: "highpass", frequency: 150 },
      { type: "lowpass", frequency: 5200 },
    ],
  },
  "blues-bass": {
    maxSeconds: 1.7,
    filters: [{ type: "lowpass", frequency: 1500 }],
  },
  "reggae-guitar": {
    maxSeconds: 0.3,
    filters: [{ type: "highpass", frequency: 240 }],
  },
  "reggae-bass": {
    maxSeconds: 1.6,
    filters: [{ type: "lowpass", frequency: 750 }],
  },
  "funk-guitar": {
    maxSeconds: 0.4,
    filters: [
      { type: "highpass", frequency: 300 },
      { type: "lowpass", frequency: 6500 },
    ],
  },
  "funk-scratch": {
    maxSeconds: 0.14,
    filters: [
      { type: "highpass", frequency: 1500 },
      { type: "lowpass", frequency: 7000 },
    ],
  },
  "funk-bass": {
    maxSeconds: 1.1,
    filters: [{ type: "lowpass", frequency: 2200 }],
  },
  "soul-guitar": {
    maxSeconds: 1.4,
    filters: [
      { type: "highpass", frequency: 200 },
      { type: "lowpass", frequency: 4200 },
    ],
  },
  "soul-bass": {
    maxSeconds: 2,
    filters: [{ type: "lowpass", frequency: 1400 }],
  },
  "soul-keys": {
    filters: [
      { type: "highpass", frequency: 90 },
      { type: "lowpass", frequency: 3400 },
    ],
    pan: { rate: 4.2, depth: 0.18 },
  },
};
export function backingInstrumentSound(instrument?: BackingInstrument) {
  return instrument ? sounds[instrument] : undefined;
}

/** One effect chain per instrument. Electric-piano chords share one modulation
 * phase, rather than restarting a separate tremolo for every played note. */
export class BackingInstrumentRack {
  private entries = new Map<
    BackingInstrument,
    {
      destination: AudioNode;
      input: GainNode;
      nodes: AudioNode[];
      oscillators: OscillatorNode[];
    }
  >();
  constructor(readonly context: BaseAudioContext) {}
  input(instrument: BackingInstrument, destination: AudioNode) {
    const sound = sounds[instrument];
    if (!sound) return destination;
    const cached = this.entries.get(instrument);
    if (cached && cached.destination === destination) return cached.input;
    if (cached) this.remove(instrument);
    const input = this.context.createGain(),
      nodes: AudioNode[] = [input],
      oscillators: OscillatorNode[] = [];
    let last: AudioNode = input;
    for (const [index, spec] of sound.filters.entries()) {
      if (sound.drive && index === sound.filters.length - 1) {
        const drive = this.context.createWaveShaper();
        drive.curve = Float32Array.from(
          { length: 2049 },
          (_, i) =>
            Math.tanh((i / 1024 - 1) * sound.drive!) / Math.tanh(sound.drive!),
        );
        drive.oversample = "2x";
        last.connect(drive);
        last = drive;
        nodes.push(drive);
      }
      const filter = this.context.createBiquadFilter();
      filter.type = spec.type;
      filter.frequency.value = spec.frequency;
      filter.Q.value = 0.5;
      last.connect(filter);
      last = filter;
      nodes.push(filter);
    }
    if (sound.pan) {
      const panner = this.context.createStereoPanner(),
        lfo = this.context.createOscillator(),
        depth = this.context.createGain();
      lfo.frequency.value = sound.pan.rate;
      depth.gain.value = sound.pan.depth;
      lfo.connect(depth).connect(panner.pan);
      last.connect(panner);
      last = panner;
      nodes.push(panner, lfo, depth);
      oscillators.push(lfo);
      lfo.start();
    }
    last.connect(destination);
    this.entries.set(instrument, { destination, input, nodes, oscillators });
    return input;
  }
  private remove(instrument: BackingInstrument) {
    const entry = this.entries.get(instrument);
    if (!entry) return;
    for (const oscillator of entry.oscillators) {
      try {
        oscillator.stop();
      } catch {
        /* context already ended */
      }
    }
    for (const node of entry.nodes) node.disconnect();
    this.entries.delete(instrument);
  }
  dispose() {
    for (const instrument of this.entries.keys()) this.remove(instrument);
  }
}
