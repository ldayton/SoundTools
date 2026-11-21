import accidentalLicense from './fonts/OFL.txt?url';
import { useSyncExternalStore } from 'react';
import { preferences } from './preferences';
import { Anchor, Button, Group, Progress, Paper, Select, Stack, Title } from '@mantine/core';
import { SettingsSections } from '@ldayton/ui/settings-sections';
import { OfflineStatusPanel } from '@ldayton/ui/offline-status-panel';
import { offlineState, offlineActions } from './offline-state';
import { diagnostics } from './diagnostics';
import { saveAudioChannels, type AudioChannels } from './audio-channels';
export function SettingsPage({
  onAudioChannelsChange,
}: {
  onAudioChannelsChange(channels: AudioChannels): void;
}) {
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  const channels = useSyncExternalStore(listener => preferences.subscribe(listener), () => preferences.state.channels);
  return (
    <SettingsSections
      consent={{ id: 'share-diagnostics', client: diagnostics }}
      offline={
        <>
          <OfflineStatusPanel status={offline.status} ready={offline.ready}>
            <Group gap="xs" hidden={offline.downloadHidden}>
              <Button
                id="offline-download"
                variant="default"
                hidden={offline.downloadHidden}
                disabled={offline.downloadDisabled}
                onClick={() => offlineActions.download()}
              >
                {offline.downloadLabel}
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
      <Paper component="section" withBorder p="md" aria-labelledby="audio-title">
        <Stack gap="sm">
          <Title order={2} size="h4" id="audio-title">
            Audio
          </Title>
          <Select
            label="Output"
            value={channels}
            allowDeselect={false}
            data={[
              { value: 'stereo', label: 'Stereo' },
              { value: 'mono', label: 'Combined mono' },
            ]}
            onChange={(value) => {
              if (value !== 'stereo' && value !== 'mono') return;
              saveAudioChannels(value);
              onAudioChannelsChange(value);
            }}
          />
        </Stack>
      </Paper>
      <Paper component="section" withBorder p="md" aria-labelledby="credits-title">
        <Stack gap="sm">
          <Title order={2} size="h4" id="credits-title">
            Credits
          </Title>
          <Anchor
            size="sm"
            href={`${import.meta.env.BASE_URL}samples/bitklavier/NOTICE.txt`}
            target="_blank"
            rel="noopener"
          >
            bitKlavier Grand recordings · CC BY 4.0
          </Anchor>
          <Anchor
            size="sm"
            href={`${import.meta.env.BASE_URL}samples/vsco-cello/NOTICE.txt`}
            target="_blank"
            rel="noopener"
          >
            VSCO cello recordings · CC0
          </Anchor>
          <Anchor size="sm" href={accidentalLicense} target="_blank" rel="noopener">
            Bravura accidental glyphs · SIL Open Font License
          </Anchor>
        </Stack>
      </Paper>
    </SettingsSections>
  );
}
