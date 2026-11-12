import {
  countInPlan,
  type CountInBars,
  type HymnTiming,
} from "./hymn-count-in";
import type { AudioTracks } from "abcjs";
import type { preparePianoPlayback } from "./piano-audio";

export function playbackNotes(audio: AudioTracks) {
  // abcjs expresses its flattened score in whole notes at the requested 60 QPM.
  return audio.tracks
    .flatMap((track) =>
      track.flatMap((item) =>
        item.cmd === "note"
          ? [
              {
                pitch: item.pitch,
                start: item.start * 4,
                duration: item.duration * 4,
                volume: item.volume / 127,
              },
            ]
          : [],
      ),
    )
    .sort((a, b) => a.start - b.start);
}
type PlaybackOutput = Omit<
  Awaited<ReturnType<typeof preparePianoPlayback>>,
  "click"
> & { click?(when: number, accent: boolean): void };
export class HymnPlayback {
  position = 0; // Score seconds at 60 quarter notes/minute, independent of tempo.
  state: "ready" | "loading" | "counting" | "playing" | "paused" | "complete" =
    "ready";
  private generation = 0;
  private timer = 0;
  private output?: PlaybackOutput;
  private timing: HymnTiming = { meter: "4/4", pickup: 0 };
  private countOnly = false;
  private countBars: CountInBars = 0;
  private countPlan?: ReturnType<typeof countInPlan>;
  private origin = 0;
  private offset = 0;
  private cursor = 0;
  private bpm = 80;
  private notes: ReturnType<typeof playbackNotes> = [];
  private end = 0;
  private boundaries: number[] = [0];
  get section() {
    let index = this.boundaries.length - 1;
    while (index > 0 && this.position < this.boundaries[index]) index--;
    return index;
  }
  get sectionPosition() {
    return this.position - this.boundaries[this.section];
  }
  get counting() {
    if (this.state !== "counting" || !this.output || !this.countPlan) return;
    const p = this.countPlan;
    const elapsed = Math.max(
      0,
      ((this.output.now - this.origin) * this.bpm) / 60 + p.duration,
    );
    return {
      bar: Math.min(Math.ceil(p.bars), Math.floor(elapsed / p.barLength) + 1),
      bars: p.bars,
      beat:
        (((Math.floor((p.from + elapsed) / p.pulse) % p.beats) + p.beats) %
          p.beats) +
        1,
      beats: p.beats,
    };
  }
  get sounding() {
    if (this.state === "counting") return false;
    return this.notes.some(
      (n) => n.start <= this.position && n.start + n.duration > this.position,
    );
  }
  constructor(
    private changed: () => void,
    private failed: (error: unknown) => void,
    private prepare: (pitches: number[]) => Promise<PlaybackOutput>,
  ) {}
  load(
    audio: AudioTracks,
    sectionStarts = [0],
    startSection = 0,
    timing: HymnTiming = { meter: "4/4", pickup: 0 },
  ) {
    this.timing = timing;
    this.pause();
    const offset = sectionStarts[startSection];
    // Keep cross-bar ties in one score: section changes must not re-attack them.
    this.notes = playbackNotes(audio)
      .filter((n) => n.start + n.duration > offset)
      .map((note) => {
        const start = Math.max(note.start, offset);
        return {
          ...note,
          start: start - offset,
          duration: note.start + note.duration - start,
        };
      });
    this.boundaries = sectionStarts
      .slice(startSection)
      .map((start) => start - offset);
    this.end = Math.max(
      audio.totalDuration * 4 - offset,
      ...this.notes.map((n) => n.start + n.duration),
    );
    this.position = 0;
    this.state = "ready";
  }
  async play(bpm: number, bars: CountInBars = 0, countOnly = false) {
    if (
      this.state === "playing" ||
      this.state === "counting" ||
      this.state === "loading" ||
      !this.notes.length
    )
      return;
    if (this.state === "complete") this.position = 0;
    const request = ++this.generation;
    this.bpm = bpm;
    this.countBars = bars;
    this.countOnly = countOnly;
    this.countPlan = countInPlan(this.timing, bars, this.position);
    this.state = "loading";
    this.changed();
    try {
      const output = await this.prepare(
        countOnly ? [] : this.notes.map((n) => n.pitch),
      );
      if (request !== this.generation) {
        output.stop();
        return;
      }
      if (!output.running) {
        this.state = "paused";
        this.changed();
        return;
      }
      this.output = output;
      this.offset = this.position;
      const plan = this.countPlan!;
      const countStart = output.now + 0.06;
      this.origin = countStart + (plan.duration * 60) / this.bpm;
      for (const click of plan.clicks)
        output.click?.(countStart + (click.at * 60) / this.bpm, click.accent);
      this.cursor = 0;
      this.state =
        plan.duration > 0 ? "counting" : countOnly ? "complete" : "playing";
      const tick = () => {
        if (request !== this.generation || this.output !== output) return;
        if (!output.running) {
          this.pause();
          this.changed();
          return;
        }
        if (output.now >= this.origin && this.state === "counting")
          this.state = this.countOnly ? "complete" : "playing";
        this.position = this.countOnly
          ? this.offset
          : Math.min(
              this.end,
              this.offset +
                (Math.max(0, output.now - this.origin) * this.bpm) / 60,
            );
        const horizon =
          this.offset + ((output.now + 0.15 - this.origin) * this.bpm) / 60;
        while (
          !this.countOnly &&
          this.cursor < this.notes.length &&
          this.notes[this.cursor].start < horizon
        ) {
          const n = this.notes[this.cursor++];
          // A delayed timer must not burst through notes that have already passed.
          if (n.start + n.duration <= this.position) continue;
          const start = Math.max(n.start, this.offset, this.position);
          output.schedule(
            n.pitch,
            Math.max(
              output.now,
              this.origin + ((start - this.offset) * 60) / this.bpm,
            ),
            ((n.start + n.duration - start) * 60) / this.bpm,
            n.volume,
          );
        }
        if (this.state === "complete" || this.position >= this.end) {
          clearInterval(this.timer);
          this.timer = 0;
          this.state = "complete";
        }
        this.changed();
      };
      tick();
      if (this.state === "playing" || this.state === "counting")
        this.timer = window.setInterval(tick, 25);
    } catch (error) {
      if (request !== this.generation) return;
      this.pause();
      this.changed();
      this.failed(error);
    }
  }
  pause() {
    if (this.state === "playing" && this.output && !this.countOnly)
      this.position = Math.min(
        this.end,
        this.offset +
          (Math.max(0, this.output.now - this.origin) * this.bpm) / 60,
      );
    ++this.generation;
    clearInterval(this.timer);
    this.timer = 0;
    this.output?.stop();
    this.output = undefined;
    if (
      this.state === "playing" ||
      this.state === "counting" ||
      this.state === "loading"
    )
      this.state = "paused";
  }
  restart() {
    this.pause();
    this.position = 0;
    this.state = "ready";
  }
  setTempo(bpm: number) {
    const resume =
      this.state === "playing" ||
      this.state === "counting" ||
      this.state === "loading";
    const bars =
      this.state === "counting" || this.state === "loading"
        ? this.countBars
        : 0;
    const only = this.countOnly;
    this.pause();
    this.bpm = bpm;
    if (resume) void this.play(bpm, bars, only);
  }
}
