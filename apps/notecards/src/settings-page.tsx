import { DiagnosticConsent } from "@ldayton/ui/diagnostic-consent";
import { OfflineStatusPanel } from "@ldayton/ui/offline-status-panel";
import { VolumeControl } from "@ldayton/ui/volume-control";
import { useState, useSyncExternalStore } from "react";
import { Anchor, Button, Group, Paper, Stack, Title } from "@mantine/core";
import { diagnostics } from "./diagnostics";
import { offlineState, offlineActions } from "./offline-state";
import { getPianoVolume, setPianoVolume, pianoCreditsUrl } from "./piano-audio";

export function SettingsPage() {
  const offline = useSyncExternalStore(
    offlineState.subscribe,
    offlineState.getSnapshot,
  );
  const [volume, setVolume] = useState(getPianoVolume);
  return (
    <Stack>
      <OfflineStatusPanel status={offline.status} ready={offline.ready}>
        <Group hidden={!offline.retryVisible && !offline.updateAvailable}>
          <Button
            id="offline-retry"
            hidden={!offline.retryVisible}
            variant="default"
            disabled={offline.busy}
            onClick={() => offlineActions.retry()}
          >
            Retry offline setup
          </Button>
          <Button
            id="offline-update"
            hidden={!offline.updateAvailable}
            onClick={() => offlineActions.update()}
          >
            Update available
          </Button>
        </Group>
      </OfflineStatusPanel>
      <Paper
        component="section"
        withBorder
        p="md"
        aria-labelledby="sound-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="sound-title">
            Sound
          </Title>
          <VolumeControl
            id="piano-volume"
            label="Piano volume"
            value={volume}
            onChange={(value) => {
              setVolume(value);
              setPianoVolume(value);
            }}
          />
        </Stack>
      </Paper>
      <Paper
        component="section"
        withBorder
        p="md"
        aria-labelledby="privacy-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="privacy-title">
            Privacy
          </Title>
          <DiagnosticConsent id="diagnostics-sharing" client={diagnostics} />
        </Stack>
      </Paper>
      <Anchor
        href={pianoCreditsUrl}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
      >
        Piano recording credits
      </Anchor>
    </Stack>
  );
}
