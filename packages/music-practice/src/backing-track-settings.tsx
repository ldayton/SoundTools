import { useState, useSyncExternalStore } from "react";
import { ControlIcon } from "@ldayton/ui/control-icon";
import type { BackingTrackPlayer } from "./backing-track-audio";
import "./backing-track-settings.css";

/** Exercise-owned key is read-only here. Other hosts can supply their own key UI. */
export function BackingTrackSettings({
  player,
}: {
  player: BackingTrackPlayer;
}) {
  const state = useSyncExternalStore(
    player.model.subscribe,
    player.model.getSnapshot,
  );
  const [draft, setDraft] = useState<string>();
  const active = state.status === "playing" || state.status === "loading";
  const commit = () => {
    if (draft !== undefined && draft.trim()) player.setTempo(Number(draft));
    setDraft(undefined);
  };
  return (
    <section
      className="backing-track-settings"
      aria-label="Backing track"
      data-status={state.status}
    >
      <header className="backing-track-heading">
        <h3>
          <ControlIcon name="tempo" size={18} />
          Backing track
        </h3>
        <span
          className="backing-track-loop"
          aria-label="Loops continuously"
          title="Loops continuously until paused"
        >
          ∞
        </span>
      </header>
      <div className="backing-track-body">
        <fieldset className="backing-track-style">
          <legend>Style</legend>
          <div role="group" aria-label="Backing style">
            {(["blues", "rock"] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={state.style === style}
                onClick={() => player.setStyle(style)}
              >
                {style === "blues" ? "Blues" : "Rock"}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="backing-track-style">
          <legend>Feel</legend>
          <div role="group" aria-label="Backing feel">
            {(["steady", "active"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={state.mode === mode}
                onClick={() => player.setMode(mode)}
              >
                {mode === "steady" ? "Steady" : "Active"}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="backing-track-tempo-row">
          <label htmlFor="backing-tempo">
            Tempo <span>BPM</span>
          </label>
          <div className="backing-track-stepper">
            <button
              type="button"
              aria-label="Decrease backing tempo"
              disabled={state.tempo <= 50}
              onClick={() => {
                setDraft(undefined);
                player.setTempo(state.tempo - 2);
              }}
            >
              <ControlIcon name="minus" size={13} />
            </button>
            <input
              id="backing-tempo"
              type="number"
              aria-label="Backing tempo in beats per minute"
              min={50}
              max={180}
              step={2}
              value={draft ?? state.tempo}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") setDraft(undefined);
              }}
            />
            <button
              type="button"
              aria-label="Increase backing tempo"
              disabled={state.tempo >= 180}
              onClick={() => {
                setDraft(undefined);
                player.setTempo(state.tempo + 2);
              }}
            >
              <ControlIcon name="plus" size={13} />
            </button>
          </div>
        </div>
        <div className="backing-track-bottom">
          <div className="backing-track-key">
            <span>Key</span>
            <strong data-backing-key={state.tonic}>{state.keyLabel}</strong>
            <small>From scale</small>
          </div>
          <button
            className="backing-track-play"
            type="button"
            aria-label={active ? "Pause backing track" : "Play backing track"}
            aria-pressed={active}
            onClick={() => (active ? player.pause() : void player.play())}
          >
            <ControlIcon name={active ? "pause" : "play"} size={14} />
            {state.status === "loading"
              ? "Loading…"
              : active
                ? "Pause"
                : "Play"}
          </button>
        </div>
      </div>
      <footer className="backing-track-footer">
        <span role="status">
          {state.status === "playing"
            ? "Playing · looping"
            : state.status === "loading"
              ? "Loading sounds…"
              : state.status === "paused"
                ? "Paused"
                : state.status === "error"
                  ? "Tap play to retry"
                  : "Ready to play"}
        </span>
        <span className="backing-track-beats" aria-hidden="true">
          {[0, 1, 2, 3].map((beat) => (
            <i
              key={beat}
              data-active={
                (state.status === "playing" && state.beat === beat) || undefined
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
