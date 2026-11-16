import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  newPianoAttacks,
  strikePianoKey,
  type PianoVoice,
} from "./piano-motion";
import "./piano-keyboard.css";

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

/** A fixed-width, accessible keybed; the app owns sound and playback timing. */
export function PianoKeyboard({
  rows,
  voices,
  label,
  onPress,
}: {
  rows: readonly (readonly [number, number])[];
  voices: readonly PianoVoice[];
  label(midi: number): string;
  onPress(midi: number): () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const gestures = useRef(new Map<string, { midi: number; stop(): void }>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const animations = useRef(new Map<number, Animation>());
  const previous = useRef<readonly PianoVoice[]>([]);
  const [held, setHeld] = useState<number[]>([]);
  const [focus, setFocus] = useState(rows[0]?.[0] ?? 60);
  const signature = JSON.stringify(rows);
  const keys = rows.flatMap(([low, high]) =>
    Array.from({ length: high - low + 1 }, (_, i) => low + i),
  );
  const focusKey = keys.includes(focus) ? focus : keys[0];
  const refresh = () =>
    setHeld([...new Set([...gestures.current.values()].map((g) => g.midi))]);
  function release(source: string) {
    gestures.current.get(source)?.stop();
    gestures.current.delete(source);
    refresh();
  }
  function clear() {
    for (const gesture of gestures.current.values()) gesture.stop();
    gestures.current.clear();
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    refresh();
  }
  function strike(midi: number) {
    const key = element.current?.querySelector<HTMLElement>(
      `[data-piano="${midi}"]`,
    );
    if (!key) return;
    animations.current.get(midi)?.cancel();
    const animation = strikePianoKey(key);
    if (!animation) return;
    animations.current.set(midi, animation);
    animation.onfinish = () => {
      if (animations.current.get(midi) === animation)
        animations.current.delete(midi);
    };
  }
  function press(source: string, midi: number) {
    release(source);
    gestures.current.set(source, { midi, stop: onPress(midi) });
    setFocus(midi);
    refresh();
    strike(midi);
  }
  useEffect(() => {
    const blur = () => clear();
    const visibility = () => {
      if (document.hidden) clear();
    };
    const keyup = (event: KeyboardEvent) => release(`key:${event.key}`);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    window.addEventListener("keyup", keyup);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("keyup", keyup);
      document.removeEventListener("visibilitychange", visibility);
      clear();
    };
  }, [signature]);
  useEffect(() => {
    for (const midi of newPianoAttacks(previous.current, voices)) strike(midi);
    for (const note of previous.current)
      if (!voices.some((next) => next.pitch === note.pitch)) {
        animations.current.get(note.pitch)?.cancel();
        animations.current.delete(note.pitch);
      }
    previous.current = voices;
  }, [voices]);
  return (
    <div
      className="piano-keybed"
      ref={element}
      role="group"
      aria-label="Reference piano"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          clear();
      }}
    >
      <div className="piano-layout">
        {rows.map(([low, high]) => {
          const notes = Array.from(
            { length: high - low + 1 },
            (_, i) => low + i,
          );
          const whites = notes.filter((n) => !isBlack(n));
          return (
            <div
              key={`${low}:${high}`}
              className="piano-octave"
              style={
                {
                  "--whites": whites.length,
                  "--white": "32px",
                } as CSSProperties
              }
            >
              <div className="piano-keys">
                {notes.map((midi) => {
                  const black = isBlack(midi),
                    index = whites.filter((n) => n < midi).length;
                  return (
                    <button
                      key={midi}
                      type="button"
                      data-piano={midi}
                      className={`piano-key ${black ? "black-key" : "white-key"}${voices.some((n) => n.pitch === midi) ? " is-playing" : ""}${held.includes(midi) ? " is-held" : ""}`}
                      aria-label={label(midi)}
                      aria-pressed={held.includes(midi)}
                      tabIndex={midi === focusKey ? 0 : -1}
                      style={{
                        left: `calc(${index} * var(--white)${black ? " - var(--black) / 2" : ""})`,
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.focus({ preventScroll: true });
                        event.currentTarget.setPointerCapture(event.pointerId);
                        press(`pointer:${event.pointerId}`, midi);
                      }}
                      onPointerUp={(event) => {
                        release(`pointer:${event.pointerId}`);
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        )
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                      }}
                      onPointerCancel={(event) =>
                        release(`pointer:${event.pointerId}`)
                      }
                      onLostPointerCapture={(event) =>
                        release(`pointer:${event.pointerId}`)
                      }
                      onKeyDown={(event) => {
                        if (["Enter", " "].includes(event.key)) {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!event.repeat) press(`key:${event.key}`, midi);
                          return;
                        }
                        const index = keys.indexOf(midi);
                        const next =
                          event.key === "Home"
                            ? keys[0]
                            : event.key === "End"
                              ? keys.at(-1)
                              : event.key === "ArrowLeft"
                                ? keys[Math.max(0, index - 1)]
                                : event.key === "ArrowRight"
                                  ? keys[Math.min(keys.length - 1, index + 1)]
                                  : undefined;
                        if (next !== undefined) {
                          event.preventDefault();
                          setFocus(next);
                          element.current
                            ?.querySelector<HTMLButtonElement>(
                              `[data-piano="${next}"]`,
                            )
                            ?.focus({ preventScroll: true });
                        }
                      }}
                      onClick={(event) => {
                        if (event.detail !== 0) return;
                        press("activation", midi);
                        const timer = setTimeout(() => {
                          timers.current.delete(timer);
                          release("activation");
                        }, 150);
                        timers.current.add(timer);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
