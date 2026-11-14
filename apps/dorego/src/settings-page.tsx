import { useSyncExternalStore } from 'react';
import { Anchor, Button, Group, Progress } from '@mantine/core';
import { SettingsSections } from '@ldayton/ui/settings-sections';
import { OfflineStatusPanel } from '@ldayton/ui/offline-status-panel';
import { offlineState, offlineActions } from './offline-state';
import { diagnostics } from './diagnostics';
export function SettingsPage() {
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  return (
    <SettingsSections
      consent={{ id: 'share-diagnostics', client: diagnostics }}
      offline={
        <>
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
        </>
      }
    >
      <Anchor
        size="sm"
        href={`${import.meta.env.BASE_URL}samples/bitklavier/NOTICE.txt`}
        target="_blank"
        rel="noopener"
      >
        Piano recording credits
      </Anchor>
      <Anchor
        size="sm"
        href={`${import.meta.env.BASE_URL}samples/vsco-cello/NOTICE.txt`}
        target="_blank"
        rel="noopener"
      >
        Cello recording credits
      </Anchor>
    </SettingsSections>
  );
}
