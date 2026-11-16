import { useSyncExternalStore } from "react";
import { ToolbarSlider } from "@ldayton/ui/toolbar-slider";
import {
  getPianoVolume,
  setPianoVolume,
  subscribePianoVolume,
} from "./piano-audio";
export function ToolbarVolume() {
  const volume = useSyncExternalStore(subscribePianoVolume, getPianoVolume);
  return (
    <ToolbarSlider
      id="piano-volume"
      label="Piano volume"
      buttonLabel="Volume"
      value={volume}
      min={0}
      max={100}
      valueText={volume === 0 ? "Muted" : `${volume}%`}
      onChange={setPianoVolume}
      icon={
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M11 4 6 8H3v8h3l5 4Z" />
          {volume === 0 ? (
            <path d="m16 9 6 6m0-6-6 6" />
          ) : (
            <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
          )}
        </svg>
      }
    />
  );
}
