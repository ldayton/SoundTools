import { useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { offlineState, offlineActions } from './offline-state';
import { diagnostics } from './diagnostics';
const subscribeDiagnostics = (listener: () => void) => diagnostics.subscribe(listener);
const sharingSnapshot = () => diagnostics.getState().sharing;
export function PracticeFooter() {
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  const sharing = useSyncExternalStore(subscribeDiagnostics, sharingSnapshot);
  const [error, setError] = useState(false);
  return (
    <Stack gap="sm" mt="md">
      <Paper withBorder p="md" component="section" aria-label="Offline use">
        <Stack gap="sm">
          <Title order={2} size="h4">
            Take it with you
          </Title>
          <Text
            id="offline-status"
            size="sm"
            role="status"
            c={offline.ready ? 'green' : 'dimmed'}
            className={offline.ready ? 'is-ready' : undefined}
          >
            {offline.status}
          </Text>
          <Group gap="xs" hidden={offline.downloadHidden && offline.updateHidden}>
            <Button
              id="offline-download"
              variant="default"
              hidden={offline.downloadHidden}
              disabled={offline.downloadDisabled}
              onClick={() => offlineActions.download()}
            >
              {offline.downloadLabel}
            </Button>
            <Button
              id="offline-update"
              hidden={offline.updateHidden}
              onClick={() => offlineActions.update()}
            >
              Update available
            </Button>
          </Group>
          <Progress
            id="offline-progress"
            hidden={offline.progressHidden}
            value={(100 * offline.progressValue) / Math.max(1, offline.progressMax)}
            role="progressbar"
            aria-label="Offline download progress"
            aria-valuemin={0}
            aria-valuemax={offline.progressMax}
            aria-valuenow={offline.progressValue}
          />
        </Stack>
      </Paper>
      <Checkbox
        id="share-diagnostics"
        mx="md"
        label="Share diagnostic information"
        checked={sharing}
        onChange={(event) => {
          setError(false);
          void diagnostics.setSharing(event.currentTarget.checked).catch(() => setError(true));
        }}
      />
      {error && (
        <Text size="sm" c="red" mx="md" role="alert">
          Couldn’t change diagnostic sharing. Please retry.
        </Text>
      )}
    </Stack>
  );
}
