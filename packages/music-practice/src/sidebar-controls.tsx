import { useSyncExternalStore } from "react";
import { Stack } from "@mantine/core";
import { VolumeControl } from "@ldayton/ui/volume-control";
import {
  getPianoVolume,
  setPianoVolume,
  subscribePianoVolume,
} from "./piano-audio";
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
