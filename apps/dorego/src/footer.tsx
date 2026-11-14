import { useSyncExternalStore } from 'react';
import { Box, Button, Group, Progress, Stack } from '@mantine/core';
import { DiagnosticConsent } from '@ldayton/ui/diagnostic-consent';
import { OfflineStatusPanel } from '@ldayton/ui/offline-status-panel';
import { offlineState, offlineActions } from './offline-state';
import { diagnostics } from './diagnostics';
export function PracticeFooter() {
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  return (
    <Stack gap="sm" mt="md">
      <OfflineStatusPanel status={offline.status} ready={offline.ready}>
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
            autoContrast
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
      </OfflineStatusPanel>
      <Box mx="md">
        <DiagnosticConsent id="share-diagnostics" client={diagnostics} />
      </Box>
    </Stack>
  );
}
