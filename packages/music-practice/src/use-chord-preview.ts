import { useEffect, useRef, useState } from "react";
import { chordPreviewSequence, type ChordPreviewTone } from "./chord-preview";
/** Both chord viewers own and cancel their preview, including pending sample loads. */
export function useChordPreview(
  tones: readonly ChordPreviewTone[],
  instrument: "piano" | "guitar",
) {
  const output = useRef<{ stop(): void } | null>(null),
    generation = useRef(0);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setLoading(false);
    setError("");
    return () => {
      generation.current++;
      output.current?.stop();
      output.current = null;
    };
  }, [tones, instrument]);
  async function play() {
    if (!tones.length) return;
    const request = ++generation.current;
    output.current?.stop();
    setLoading(true);
    setError("");
    try {
      const { preparePianoPlayback } = await import("./piano-audio");
      const sequence = chordPreviewSequence(tones, instrument);
      const voice = await preparePianoPlayback(
        sequence.map((note) => note.pitch),
        instrument,
        sequence,
      );
      if (request !== generation.current || !voice.running) {
        voice.stop();
        return;
      }
      const level = await voice.previewLevel(sequence);
      if (request !== generation.current || !voice.running) {
        voice.stop();
        return;
      }
      output.current = voice;
      const start = voice.now + 0.01;
      for (const note of sequence)
        voice.schedule(
          note.pitch,
          start + note.start,
          note.duration,
          note.volume,
          note.string ?? -1,
          0,
          level.gain,
        );
    } catch (failure) {
      if (request === generation.current) {
        setError("Audio couldn’t load. Try again.");
        const { diagnostics } = await import("./diagnostics");
        diagnostics.capture(failure, "chord_preview.failed");
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  return { play, loading, error };
}
