/** Original tonewheel/rotary model. No sampled organ loop or external runtime. */
export const ORGAN_DRAWBARS = [1, 3, 2, 4, 6, 8, 10, 12, 16] as const;
const registrations = {
  warm: [8, 8, 8, 3, 1, 0, 0, 0, 0],
  full: [8, 8, 8, 8, 6, 5, 3, 3, 2],
};

/** The oscillator runs at half the key's fundamental (the 16-foot drawbar). */
export function tonewheelPartials(
  note: number,
  registration: keyof typeof registrations,
) {
  const base = (440 * 2 ** ((note - 69) / 12)) / 2;
  const imaginary = new Float32Array(17),
    real = new Float32Array(17);
  registrations[registration].forEach((drawbar, i) => {
    if (!drawbar) return;
    let harmonic: number = ORGAN_DRAWBARS[i];
    // Upper tonewheel foldback keeps the top drawbars inside the generator range.
    while (base * harmonic > 5920) harmonic /= 2;
    imaginary[harmonic] += 10 ** (((drawbar - 8) * 3) / 20) / 8;
  });
  return { base, real, imaginary };
}

export type OrganScene = {
  registration: number;
  expression: number;
  rotary: "slow" | "fast";
};
type Voice = {
  note: number;
  start: number;
  end: number;
  gates: GainNode[];
  oscillators: OscillatorNode[];
};
const hold = (param: AudioParam, when: number) => {
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(when);
  else {
    const value = param.value;
    param.cancelScheduledValues(when);
    param.setValueAtTime(value, when);
  }
};

export class TonewheelOrgan {
  private warm: GainNode;
  private full: GainNode;
  private expression: GainNode;
  private rotorFrequencies: AudioParam[] = [];
  private oscillators: OscillatorNode[] = [];
  private nodes: AudioNode[] = [];
  private waves = new Map<string, PeriodicWave>();
  private voices = new Set<Voice>();
  private scene?: OrganScene;
  private disposed = false;
  get voiceCount() {
    return this.voices.size;
  }

  constructor(
    readonly context: BaseAudioContext,
    readonly destination: AudioNode,
  ) {
    const node = <T extends AudioNode>(n: T) => {
      this.nodes.push(n);
      return n;
    };
    this.warm = node(context.createGain());
    this.full = node(context.createGain());
    this.warm.gain.value = 1;
    this.full.gain.value = 0;
    this.expression = node(context.createGain());
    this.expression.gain.value = 0.65;
    const drive = node(context.createWaveShaper());
    drive.curve = Float32Array.from(
      { length: 2049 },
      (_, i) => Math.tanh((i / 1024 - 1) * 1.4) / Math.tanh(1.4),
    );
    drive.oversample = "2x";
    this.warm.connect(drive);
    this.full.connect(drive);
    const chorus = node(context.createDelay(0.02));
    chorus.delayTime.value = 0.004;
    const scanner = node(context.createOscillator());
    scanner.frequency.value = 6.7;
    const depth = node(context.createGain());
    depth.gain.value = 0.00018;
    scanner.connect(depth).connect(chorus.delayTime);
    const wet = node(context.createGain());
    wet.gain.value = 0.25;
    const dry = node(context.createGain());
    dry.gain.value = 0.75;
    const tone = node(context.createBiquadFilter());
    tone.type = "lowpass";
    tone.frequency.value = 6200;
    drive.connect(dry).connect(tone);
    drive.connect(chorus).connect(wet).connect(tone);
    scanner.start();
    this.oscillators.push(scanner);
    // One shared horn/drum pair processes the complete organ. Different speeds
    // and inertia preserve a coherent rotary field across chords and legato notes.
    for (const high of [false, true]) {
      const split = node(context.createBiquadFilter());
      split.type = high ? "highpass" : "lowpass";
      split.frequency.value = 800;
      split.Q.value = 0.5;
      tone.connect(split);
      // Second-order Linkwitz-Riley: invert the high branch for a flat crossover.
      const polarity = node(context.createGain());
      polarity.gain.value = high ? -1 : 1;
      split.connect(polarity);
      const rotor = node(context.createOscillator());
      rotor.frequency.value = high ? 0.8 : 0.65;
      this.rotorFrequencies.push(rotor.frequency);
      this.oscillators.push(rotor);
      const stereo = node(context.createChannelMerger(2));
      for (const channel of [0, 1]) {
        const sign = channel ? -1 : 1;
        const delay = node(context.createDelay(0.02));
        delay.delayTime.value = 0.003;
        const doppler = node(context.createGain());
        doppler.gain.value = sign * (high ? 0.00035 : 0.00016);
        rotor.connect(doppler).connect(delay.delayTime);
        const amp = node(context.createGain());
        amp.gain.value = 0.72;
        const amplitude = node(context.createGain());
        amplitude.gain.value = sign * (high ? 0.22 : 0.12);
        rotor.connect(amplitude).connect(amp.gain);
        polarity.connect(delay).connect(amp).connect(stereo, 0, channel);
      }
      stereo.connect(this.expression);
      rotor.start();
    }
    this.expression.connect(destination);
  }

  setScene(scene: OrganScene, when: number) {
    if (this.disposed) return;
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const registration = clamp(scene.registration),
      expression = clamp(scene.expression);
    if (!this.scene || this.scene.registration !== registration) {
      this.warm.gain.setTargetAtTime(1 - registration, when, 0.22);
      this.full.gain.setTargetAtTime(registration, when, 0.22);
    }
    if (!this.scene || this.scene.expression !== expression)
      this.expression.gain.setTargetAtTime(expression, when, 0.2);
    if (!this.scene || this.scene.rotary !== scene.rotary)
      this.rotorFrequencies.forEach((frequency, i) => {
        frequency.setTargetAtTime(
          scene.rotary === "fast" ? (i ? 6.7 : 5.8) : i ? 0.8 : 0.65,
          when,
          scene.rotary === "fast" ? (i ? 0.45 : 0.95) : i ? 0.75 : 1.8,
        );
      });
    this.scene = { registration, expression, rotary: scene.rotary };
  }

  play(
    note: number,
    when: number,
    duration: number,
    level: number,
    resumed = false,
  ) {
    if (
      this.disposed ||
      !Number.isInteger(note) ||
      note < 36 ||
      note > 96 ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return;
    for (const voice of this.voices)
      if (voice.note === note && voice.start <= when && voice.end > when)
        this.release(voice, when);
    const gates: GainNode[] = [],
      oscillators: OscillatorNode[] = [];
    for (const registration of ["warm", "full"] as const) {
      const key = `${note}/${registration}`;
      let wave = this.waves.get(key);
      const partials = tonewheelPartials(note, registration);
      if (!wave) {
        wave = this.context.createPeriodicWave(
          partials.real,
          partials.imaginary,
          { disableNormalization: true },
        );
        this.waves.set(key, wave);
      }
      const oscillator = this.context.createOscillator();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = partials.base;
      const gate = this.context.createGain(),
        amplitude = 0.16 * Math.max(0, Math.min(1.5, level));
      gate.gain.setValueAtTime(0, when);
      gate.gain.linearRampToValueAtTime(
        amplitude * 0.9,
        when + Math.min(duration / 2, resumed ? 0.02 : 0.006),
      );
      gate.gain.linearRampToValueAtTime(
        amplitude,
        when + Math.min(duration * 0.45, 0.7),
      );
      gate.gain.setValueAtTime(amplitude, when + duration);
      gate.gain.linearRampToValueAtTime(0, when + duration + 0.04);
      oscillator
        .connect(gate)
        .connect(registration === "warm" ? this.warm : this.full);
      gates.push(gate);
      oscillators.push(oscillator);
    }
    const voice = {
      note,
      start: when,
      end: when + duration,
      gates,
      oscillators,
    };
    this.voices.add(voice);
    let ended = 0;
    oscillators.forEach((oscillator, i) => {
      oscillator.onended = () => {
        oscillator.disconnect();
        gates[i].disconnect();
        if (++ended === 2) this.voices.delete(voice);
      };
      oscillator.start(when);
      oscillator.stop(when + duration + 0.055);
    });
  }

  private release(voice: Voice, when: number) {
    for (const gate of voice.gates) {
      hold(gate.gain, when);
      gate.gain.setTargetAtTime(0, when, 0.006);
    }
    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop(when + 0.04);
      } catch {
        /* ended */
      }
    }
    voice.end = when;
  }

  stop(when = this.context.currentTime) {
    for (const voice of this.voices) this.release(voice, when);
    for (const param of [
      this.warm.gain,
      this.full.gain,
      this.expression.gain,
      ...this.rotorFrequencies,
    ])
      hold(param, when);
    this.scene = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        /* ended */
      }
    }
    for (const node of this.nodes) node.disconnect();
    this.waves.clear();
  }
}
