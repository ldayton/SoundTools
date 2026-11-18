import { useState, useSyncExternalStore } from "react";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { backingClockActive } from "./backing-track-model";
import type { BackingTrackPlayer } from "./backing-track-audio";
import "./backing-track-settings.css";

/** Shared audio clock when backing plays; independent tempo is retained for solo use. */
export function MetronomeSettings({ player }: { player: BackingTrackPlayer }) {
  const backing = useSyncExternalStore(
    player.model.subscribe,
    player.model.getSnapshot,
  );
  const state = useSyncExternalStore(
    player.metronome.subscribe,
    player.metronome.getSnapshot,
  );
  const linked = backingClockActive(backing);
  const tempo = linked ? backing.tempo : state.tempo;
  const numerator = linked ? 4 : state.numerator;
  const denominator = linked ? 4 : state.denominator;
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    if (!linked && draft !== undefined && draft.trim())
      player.setMetronomeTempo(Number(draft));
    setDraft(undefined);
  };
  return (
    <section
      className="backing-track-settings metronome-settings"
      aria-label="Metronome"
      data-status={state.enabled ? "playing" : "ready"}
    >
      <header className="backing-track-heading">
        <h3>
          <ControlIcon name="tempo" size={18} />
          Metronome
        </h3>
      </header>
      <div className="backing-track-body">
        <p className="metronome-link" id="metronome-source">
          {linked
            ? "Synced to backing track · change tempo above"
            : "Independent tempo · syncs when backing plays"}
        </p>
        <div className="backing-track-tempo-row">
          <label htmlFor="metronome-tempo">
            Tempo <span>BPM</span>
          </label>
          <div className="backing-track-stepper">
            <button
              type="button"
              aria-label="Decrease metronome tempo"
              disabled={linked || tempo <= 50}
              onClick={() => {
                setDraft(undefined);
                player.setMetronomeTempo(tempo - 2);
              }}
            >
              <ControlIcon name="minus" size={13} />
            </button>
            <input
              id="metronome-tempo"
              type="number"
              aria-label="Metronome tempo in beats per minute"
              aria-describedby="metronome-source"
              min={50}
              max={180}
              step={2}
              disabled={linked}
              value={linked ? tempo : (draft ?? tempo)}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") setDraft(undefined);
              }}
            />
            <button
              type="button"
              aria-label="Increase metronome tempo"
              disabled={linked || tempo >= 180}
              onClick={() => {
                setDraft(undefined);
                player.setMetronomeTempo(tempo + 2);
              }}
            >
              <ControlIcon name="plus" size={13} />
            </button>
          </div>
        </div>
        <div className="metronome-meter-row">
          <label className="metronome-downbeat">
            <input
              type="checkbox"
              checked={state.downbeat}
              onChange={(e) =>
                player.setMetronomeDownbeat(e.currentTarget.checked)
              }
            />
            Downbeat
          </label>
          <fieldset
            className="metronome-signature"
            aria-label="Time signature"
            disabled={!state.downbeat || linked}
          >
            <div className="metronome-fraction">
              <div>
                <button
                  type="button"
                  aria-label="Decrease beats per bar"
                  disabled={numerator <= 1}
                  onClick={() =>
                    player.setMetronomeSignature(numerator - 1, denominator)
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  aria-label="Time signature numerator"
                  min={1}
                  max={16}
                  value={numerator}
                  onChange={(e) => {
                    if (e.currentTarget.value)
                      player.setMetronomeSignature(
                        Number(e.currentTarget.value),
                        denominator,
                      );
                  }}
                />
                <button
                  type="button"
                  aria-label="Increase beats per bar"
                  disabled={numerator >= 16}
                  onClick={() =>
                    player.setMetronomeSignature(numerator + 1, denominator)
                  }
                >
                  +
                </button>
              </div>
              <div>
                <button
                  type="button"
                  aria-label="Decrease time signature denominator"
                  disabled={denominator <= 2}
                  onClick={() =>
                    player.setMetronomeSignature(numerator, denominator / 2)
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  aria-label="Time signature denominator"
                  min={2}
                  max={16}
                  value={denominator}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if ([2, 4, 8, 16].includes(n))
                      player.setMetronomeSignature(numerator, n);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      player.setMetronomeSignature(
                        numerator,
                        Math.max(
                          2,
                          Math.min(
                            16,
                            denominator * (e.key === "ArrowUp" ? 2 : 0.5),
                          ),
                        ),
                      );
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Increase time signature denominator"
                  disabled={denominator >= 16}
                  onClick={() =>
                    player.setMetronomeSignature(numerator, denominator * 2)
                  }
                >
                  +
                </button>
              </div>
            </div>
          </fieldset>
        </div>
        <div className="metronome-controls">
          <button
            className="backing-track-play"
            type="button"
            aria-label={state.enabled ? "Pause metronome" : "Play metronome"}
            aria-pressed={state.enabled}
            onClick={() =>
              state.enabled
                ? player.stopMetronome()
                : void player.startMetronome()
            }
          >
            <ControlIcon name={state.enabled ? "pause" : "play"} size={14} />
            {state.enabled ? "Pause" : "Play"}
          </button>
        </div>
      </div>
      <footer className="backing-track-footer">
        <span role="status">
          {state.enabled
            ? linked
              ? "Playing · synced"
              : "Playing · independent"
            : linked
              ? "Ready · synced"
              : "Ready to play"}
        </span>
        <span
          className="backing-track-beats metronome-beats"
          aria-hidden="true"
        >
          {Array.from(
            { length: state.downbeat ? numerator : 1 },
            (_, i) => i,
          ).map((beat) => (
            <i
              key={state.downbeat ? beat : state.beat}
              data-pulse={!state.downbeat || undefined}
              data-active={
                (state.enabled &&
                  state.beat >= 0 &&
                  (!state.downbeat || state.beat % numerator === beat)) ||
                undefined
              }
            />
          ))}
        </span>
      </footer>
      {state.error && (
        <p className="backing-track-error" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}
