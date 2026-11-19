import { backingMixGain } from "./backing-mix-balance";
import type {
  BackingEvent,
  BackingPart,
  BackingInstrument,
  BackingMode,
} from "./backing-track-model";
import type { GenreDefinition } from "./backing-genres";

const roomSends = {
  drums: 0.045,
  percussion: 0.08,
  bass: 0.012,
  guitar: 0.18,
  keys: 0.14,
};
/** Rules concern physical voices, independently of the sample chosen for them. */
export function backingChokes(
  event: BackingEvent,
  voice: {
    part: BackingPart;
    instrument?: BackingInstrument;
    note: number;
    string?: number;
    articulation?: BackingEvent["articulation"];
  },
) {
  if (event.part !== voice.part) return false;
  if (
    event.instrument &&
    voice.instrument &&
    event.instrument !== voice.instrument
  )
    return false;
  if (event.part === "drums") {
    const openness = (note: number, art?: BackingEvent["articulation"]) =>
      note === 46
        ? 1
        : note === 44
          ? 0
          : note === 42
            ? art === "hat-half"
              ? 0.5
              : art === "hat-loose"
                ? 0.75
                : 0
            : -1;
    const next = openness(event.note, event.articulation),
      previous = openness(voice.note, voice.articulation);
    return next >= 0 && previous > next;
  }
  if (event.part === "bass") return true;
  if (event.part === "keys") return event.note === voice.note;
  if (event.part === "guitar")
    return event.string !== undefined
      ? event.string === voice.string
      : event.note === voice.note;
  return false;
}
/** Original, deterministic short stereo room; no external IR or sampler required. */
export function backingRoom(sampleRate: number) {
  const length = Math.ceil(sampleRate * 0.36);
  return [0, 1].map((channel) => {
    const ir = new Float32Array(length);
    let seed = 7919 + channel * 97;
    for (let i = Math.ceil(sampleRate * 0.018); i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ir[i] =
        ((seed / 4294967296) * 2 - 1) *
        0.008 *
        Math.exp((-i / sampleRate) * 20);
    }
    for (const [delay, gain] of [
      [0.009, 0.32],
      [0.017, 0.2],
      [0.031, 0.12],
      [0.049, 0.065],
    ])
      ir[Math.round((delay + channel * 0.0017) * sampleRate)] += gain;
    return ir;
  });
}

/** Live and offline renders share exactly the same room, buses and dynamics. */
export function backingAudioGraph(
  context: BaseAudioContext,
  levels: Record<BackingPart, number>,
  profile: GenreDefinition["instrumentation"]["mix"] = "approved-drum-forward",
  mode: BackingMode = "steady",
) {
  const buses = new Map<BackingPart, GainNode>();
  const sends = new Map<BackingPart, GainNode>();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  const output = context.createGain();
  output.gain.value = 1;
  const sum = context.createGain();
  sum.gain.value = 3;
  const headroom = context.createGain();
  headroom.gain.value = 0.75 * backingMixGain(profile, mode);
  sum.connect(limiter).connect(headroom);
  if (profile === "approved-drum-forward") headroom.connect(output);
  else {
    // A final oversampled soft ceiling catches exceptional mixer boosts. Its
    // conservative sample ceiling leaves headroom for reconstruction peaks;
    // actual true peaks are checked on rendered audio, never inferred from the
    // compressor's threshold. Normalized ordinary passages stay linear.
    const safety = context.createWaveShaper();
    safety.curve = backingPeakCurve();
    safety.oversample = "4x";
    const ceilingHeadroom = context.createGain();
    ceilingHeadroom.gain.value = 0.7;
    headroom.connect(safety).connect(ceilingHeadroom).connect(output);
  }
  output.connect(context.destination);
  const room = context.createConvolver();
  const response = backingRoom(context.sampleRate);
  const impulse = context.createBuffer(
    2,
    response[0].length,
    context.sampleRate,
  );
  response.forEach((channel, i) => impulse.copyToChannel(channel, i));
  room.normalize = false;
  room.buffer = impulse;
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 200;
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5500;
  room.connect(highpass).connect(lowpass).connect(sum);
  for (const part of [
    "drums",
    "percussion",
    "bass",
    "guitar",
    "keys",
  ] as const) {
    const bus = context.createGain();
    bus.gain.value = levels[part] ?? levels.guitar;
    const comp = context.createDynamicsCompressor();
    comp.threshold.value = part === "bass" ? -26 : -22;
    comp.knee.value = 8;
    comp.ratio.value = part === "bass" ? 2 : 1.5;
    comp.attack.value = 0.014;
    comp.release.value = 0.12;
    bus.connect(comp).connect(sum);
    const send = context.createGain();
    send.gain.value = roomSends[part];
    comp.connect(send).connect(room);
    buses.set(part, bus);
    sends.set(part, send);
  }
  function setMix(
    next: Record<BackingPart, number>,
    style: typeof profile,
    feel: BackingMode = "steady",
  ) {
    headroom.gain.setTargetAtTime(
      0.75 * backingMixGain(style, feel),
      context.currentTime,
      0.02,
    );
    const wet =
      style === "intimate-acoustic" || style === "strummed-acoustic"
        ? 0.4
        : style === "roots-room"
          ? 0.3
          : style === "blues-room"
            ? 0.5
            : style === "dry-country"
              ? 0.22
              : style === "dry-funk"
                ? 0.2
                : style === "warm-soul"
                  ? 0.45
                  : style === "dry-reggae"
                    ? 0.15
                    : style === "gospel-room"
                      ? 0.7
                      : 1;
    for (const [part, bus] of buses) {
      bus.gain.setTargetAtTime(
        next[part] ?? next.guitar,
        context.currentTime,
        0.02,
      );
      sends
        .get(part)!
        .gain.setTargetAtTime(roomSends[part] * wet, context.currentTime, 0.02);
    }
  }
  // Preserve the approved default graph exactly, including its initial values.
  if (profile !== "approved-drum-forward") setMix(levels, profile, mode);
  return { output, buses, setMix };
}

export function backingPeakCurve() {
  return Float32Array.from({ length: 8193 }, (_, i) => {
    const x = i / 4096 - 1,
      magnitude = Math.abs(x);
    return magnitude <= 0.65
      ? x
      : Math.sign(x) * (0.65 + 0.09 * Math.tanh((magnitude - 0.65) / 0.09));
  });
}

/** Native browser resampling bounds memory without changing pitch or note length. */
export async function compactBackingBuffer(
  buffer: AudioBuffer,
  part: BackingPart,
) {
  const rate =
    part === "bass"
      ? 16000
      : part === "guitar" || part === "keys"
        ? 24000
        : buffer.sampleRate;
  if (buffer.sampleRate <= rate) return buffer;
  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(buffer.duration * rate),
    rate,
  );
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}
