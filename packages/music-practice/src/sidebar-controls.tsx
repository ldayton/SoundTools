import { useSyncExternalStore, type ReactNode } from "react";
import { Stack } from "@mantine/core";
import { VolumeControl } from "@ldayton/ui/volume-control";
import {
  getPianoVolume,
  setPianoVolume,
  subscribePianoVolume,
} from "./piano-audio";
let selection: ReactNode = null;
const listeners = new Set<() => void>();
export function setSidebarSelection(content: ReactNode) {
  selection = content;
  listeners.forEach((listener) => listener());
}
export function SidebarSelection() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => selection,
  );
}
export function SidebarVolume() {
  const volume = useSyncExternalStore(subscribePianoVolume, getPianoVolume);
  return (
    <Stack gap="xs">
      <VolumeControl
        id="piano-volume"
        label="Piano volume"
        value={volume}
        onChange={setPianoVolume}
      />
    </Stack>
  );
}
