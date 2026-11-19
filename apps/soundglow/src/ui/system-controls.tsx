// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import {
  Accordion,
  Box,
  Button,
  Checkbox,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { PrivacySection } from "@ldayton/ui/privacy-section";
import {
  CompleteUpdateButton,
  UpdateBar,
  OfflineStatusPanel,
} from "@ldayton/ui/offline-status-panel";
import { createViewState } from "@ldayton/ui/view-state";
type OfflineView = {
  status: string;
  ready: boolean;
  downloadVisible: boolean;
  downloadDisabled: boolean;
  downloadLabel: string;
  progressVisible: boolean;
  updateVisible: boolean;
  updateVersion: string | null;
};
export function createSystemControls() {
  const offline = createViewState<OfflineView>({
    status: "Offline downloads are available in the built app.",
    ready: false,
    downloadVisible: false,
    downloadDisabled: false,
    downloadLabel: "Download for offline use",
    progressVisible: false,
    updateVisible: false,
    updateVersion: null,
  });
  const performance = createViewState(false);
  let offlineActions: { download(): void; update(): void } | undefined;
  let performanceActions:
    { enable(value: boolean): void; reset(): void; export(): void } | undefined;
  function Offline() {
    const view = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
    return (
      <Box id="offlineStatus">
        <OfflineStatusPanel status={view.status} ready={view.ready}>
          <Button
            id="offlineDownload"
            hidden={!view.downloadVisible}
            disabled={view.downloadDisabled}
            onClick={() => offlineActions?.download()}
          >
            {view.downloadLabel}
          </Button>
          <Progress.Root
            id="offlineProgress"
            role="progressbar"
            aria-label="Offline download progress"
            aria-busy={view.progressVisible}
            hidden={!view.progressVisible}
          >
            <Progress.Section value={100} animated withAria={false} />
          </Progress.Root>
        </OfflineStatusPanel>
      </Box>
    );
  }
  function Update() {
    const view = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
    return (
      <UpdateBar
        className="soundglow-update-ready"
        hidden={!view.updateVisible}
      >
        <CompleteUpdateButton
          id="update"
          hidden={!view.updateVisible}
          version={view.updateVersion ?? undefined}
          onClick={() => offlineActions?.update()}
        />
      </UpdateBar>
    );
  }
  function Privacy() {
    const client = window.SoundglowDiagnostics;
    return client ? (
      <PrivacySection id="shareDiagnostics" client={client} />
    ) : null;
  }
  function Developer() {
    const enabled = useSyncExternalStore(
      performance.subscribe,
      performance.getSnapshot,
    );
    return (
      <Accordion mt="lg" variant="default">
        <Accordion.Item id="developerSettings" value="developer">
          <Accordion.Control>Developer settings</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Title order={3} size="sm">
                Performance diagnostics
              </Title>
              <Checkbox
                id="measurePerformance"
                label="Measure performance"
                checked={enabled}
                onChange={(event) =>
                  performanceActions?.enable(event.currentTarget.checked)
                }
              />
              <Text size="sm" c="dimmed">
                Enable before starting a test. Run for several minutes, then
                export the report. No audio is included or uploaded. Reset after
                changing settings.
              </Text>
              <Group gap="sm">
                <Button
                  id="resetPerformance"
                  variant="default"
                  onClick={() => performanceActions?.reset()}
                >
                  Reset measurements
                </Button>
                <Button
                  id="exportPerformance"
                  variant="default"
                  onClick={() => performanceActions?.export()}
                >
                  Export report
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }
  return {
    Offline,
    Privacy,
    Update,
    Developer,
    offline: {
      connect(actions: typeof offlineActions) {
        offlineActions = actions;
      },
      publish(next: Partial<OfflineView>) {
        offline.set({ ...offline.getSnapshot(), ...next });
      },
    },
    performance: {
      connect(actions: typeof performanceActions) {
        performanceActions = actions;
      },
      publish(enabled: boolean) {
        performance.set(enabled);
      },
    },
  };
}
