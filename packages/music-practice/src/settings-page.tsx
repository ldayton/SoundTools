import { SettingsSections } from "@ldayton/ui/settings-sections";
import { OfflineStatusPanel } from "@ldayton/ui/offline-status-panel";
import { useSyncExternalStore } from "react";
import { Anchor, Button, Group } from "@mantine/core";
import { diagnostics } from "./diagnostics";
import { offlineState, offlineActions } from "./offline-state";
import { pianoCreditsUrl } from "./piano-audio";
import backingCreditsUrl from "./assets/backing-v2/NOTICE.txt?url&no-inline";
import { APP } from "./app-profile";

export function SettingsPage() {
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
