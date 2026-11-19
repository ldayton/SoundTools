import { SettingsSections } from "@ldayton/ui/settings-sections";
import { OfflineStatusPanel } from "@ldayton/ui/offline-status-panel";
import { useSyncExternalStore } from "react";
import {
  Anchor,
  Button,
  Group,
  Paper,
  Stack,
  Title,
  Select,
} from "@mantine/core";
import { diagnostics } from "./diagnostics";
import { offlineState, offlineActions } from "./offline-state";
import {
  getPianoChannels,
  setPianoChannels,
  subscribePianoVolume,
  pianoCreditsUrl,
} from "./piano-audio";
import backingCreditsUrl from "./assets/backing-soul-folk/NOTICE.txt?url&no-inline";
import { APP } from "./app-profile";

export function SettingsPage() {
  const channels = useSyncExternalStore(subscribePianoVolume, getPianoChannels);
  const offline = useSyncExternalStore(
    offlineState.subscribe,
    offlineState.getSnapshot,
  );
  return (
    <SettingsSections
      compact={APP.id === "notewise"}
      consent={{ id: "diagnostics-sharing", client: diagnostics }}
      offline={
        <>
          <OfflineStatusPanel
            compact={APP.id === "notewise"}
            status={offline.status}
            ready={offline.ready}
          >
            <Group hidden={!offline.retryVisible}>
              <Button
                id="offline-retry"
                hidden={!offline.retryVisible}
                variant="default"
                disabled={offline.busy}
                onClick={() => offlineActions.retry()}
              >
                Retry offline setup
              </Button>
            </Group>
          </OfflineStatusPanel>
        </>
      }
    >
      {APP.id === "songalong" && (
        <Paper
          component="section"
          withBorder
          p="md"
          aria-labelledby="audio-title"
        >
          <Stack gap="sm">
            <Title order={2} size="h4" id="audio-title">
              Audio
            </Title>
            <Select
              label="Output"
              value={channels}
              allowDeselect={false}
              data={[
                { value: "stereo", label: "Stereo" },
                { value: "mono", label: "Combined mono" },
              ]}
              onChange={(value) => {
                if (value === "stereo" || value === "mono")
                  setPianoChannels(value);
              }}
            />
          </Stack>
        </Paper>
      )}
      <Anchor
        href={pianoCreditsUrl}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
      >
        Piano recording credits
      </Anchor>
      {APP.id === "notewise" && (
        <Anchor
          href={backingCreditsUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
        >
          Backing track sound and performance credits
        </Anchor>
      )}
    </SettingsSections>
  );
}
