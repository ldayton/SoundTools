import { useState, useSyncExternalStore } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  Paper,
  Slider,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { diagnostics } from "./diagnostics";
import { offlineState, offlineActions } from "./offline-state";
import { getPianoVolume, setPianoVolume, pianoCreditsUrl } from "./piano-audio";

const subscribeDiagnostics = (listener: () => void) =>
  diagnostics.subscribe(listener);
const sharingSnapshot = () => diagnostics.getState().sharing;
export function SettingsPage() {
  const offline = useSyncExternalStore(
    offlineState.subscribe,
    offlineState.getSnapshot,
  );
  const sharing = useSyncExternalStore(subscribeDiagnostics, sharingSnapshot);
  const [volume, setVolume] = useState(getPianoVolume);
  const [sharingError, setSharingError] = useState(false);
  return (
    <Stack>
      <Paper
        component="section"
        withBorder
        p="lg"
        aria-labelledby="offline-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="offline-title">
            Take it with you
          </Title>
          <Text
            id="offline-status"
            role="status"
            c={offline.ready ? "green" : "dimmed"}
            className={offline.ready ? "is-ready" : undefined}
          >
            {offline.status}
          </Text>
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
        </Stack>
      </Paper>
      <Paper
        component="section"
        withBorder
        p="lg"
        aria-labelledby="sound-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="sound-title">
            Sound
          </Title>
          <Text component="label" htmlFor="piano-volume">
            Piano volume{" "}
            <output id="piano-volume-value" htmlFor="piano-volume">
              {volume}
            </output>
          </Text>
          <Slider
            thumbProps={{ id: "piano-volume" }}
            thumbLabel="Piano volume"
            min={0}
            max={100}
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
        p="lg"
        aria-labelledby="privacy-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="privacy-title">
            Privacy
          </Title>
          <Checkbox
            id="diagnostics-sharing"
            label="Share diagnostic information"
            checked={sharing}
            onChange={(event) => {
              setSharingError(false);
              void diagnostics
                .setSharing(event.currentTarget.checked)
                .catch(() => setSharingError(true));
            }}
          />
          {sharingError && (
            <Text role="alert" c="red">
              Couldn’t change diagnostic sharing. Please retry.
            </Text>
          )}
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
