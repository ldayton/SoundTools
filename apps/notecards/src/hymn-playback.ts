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
export class HymnPlayback {
  position = 0; // Score seconds at 60 quarter notes/minute, independent of tempo.
  state: "ready" | "loading" | "playing" | "paused" | "complete" = "ready";
  private generation = 0;
  private timer = 0;
  private output?: Awaited<ReturnType<typeof preparePianoPlayback>>;
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
  get sounding() {
    return this.notes.some(
      (n) => n.start <= this.position && n.start + n.duration > this.position,
    );
  }
  constructor(
    private changed: () => void,
    private failed: (error: unknown) => void,
    private prepare: typeof preparePianoPlayback,
  ) {}
  load(audio: AudioTracks, sectionStarts = [0], startSection = 0) {
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
  async play(bpm: number) {
    if (
      this.state === "playing" ||
      this.state === "loading" ||
      !this.notes.length
    )
      return;
    if (this.state === "complete") this.position = 0;
    const request = ++this.generation;
    this.bpm = bpm;
    this.state = "loading";
    this.changed();
    try {
      const output = await this.prepare(this.notes.map((n) => n.pitch));
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
      this.origin = output.now + 0.06;
      this.cursor = 0;
      this.state = "playing";
      const tick = () => {
        if (!output.running) {
          this.pause();
          this.changed();
          return;
        }
        this.position = Math.min(
          this.end,
          this.offset + (Math.max(0, output.now - this.origin) * this.bpm) / 60,
        );
        const horizon =
          this.offset + ((output.now + 0.15 - this.origin) * this.bpm) / 60;
        while (
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
        if (this.position >= this.end) {
          clearInterval(this.timer);
          this.timer = 0;
          this.state = "complete";
        }
        this.changed();
      };
      tick();
      if (this.state === "playing") this.timer = window.setInterval(tick, 25);
    } catch (error) {
      if (request !== this.generation) return;
      this.pause();
      this.changed();
      this.failed(error);
    }
  }
  pause() {
    if (this.state === "playing" && this.output)
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
    if (this.state === "playing" || this.state === "loading")
      this.state = "paused";
  }
  restart() {
    this.pause();
    this.position = 0;
    this.state = "ready";
  }
  setTempo(bpm: number) {
    const resume = this.state === "playing" || this.state === "loading";
    this.pause();
    this.bpm = bpm;
    if (resume) void this.play(bpm);
  }
}
