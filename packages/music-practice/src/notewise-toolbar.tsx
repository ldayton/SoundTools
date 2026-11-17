import { useSyncExternalStore } from "react";
import { ToolbarDisclosure } from "@ldayton/ui/toolbar-disclosure";
import { ToolbarVolume } from "./sidebar-controls";
import { RetainedContent } from "./retained-content";
import { PracticePianoToggle } from "./piano-presentation";
import { createViewState } from "./view-state";
import { useMediaQuery } from "@mantine/hooks";

export const notewiseToolbarState = createViewState({ expanded: false });

export function NotewiseToolbar({
  session,
  properties,
  hasProperties,
  pianoPanelId,
  pianoRequired,
}: {
  session: HTMLElement;
  properties: HTMLElement;
  hasProperties: boolean;
  pianoPanelId: string;
  pianoRequired: boolean;
}) {
  const mobile = useMediaQuery("(max-width: 767px)", undefined, {
    getInitialValueInEffect: false,
  });
  const state = useSyncExternalStore(
    notewiseToolbarState.subscribe,
    notewiseToolbarState.getSnapshot,
  );
  return (
    <div className="notewise-toolbar">
      <div className="notewise-toolbar-volume">
        <ToolbarVolume />
      </div>
      <RetainedContent element={session} className="notewise-toolbar-session" />
      <div className="notewise-toolbar-piano" hidden={pianoRequired}>
        <PracticePianoToggle iconOnly panelId={pianoPanelId} />
      </div>
      {mobile && hasProperties && (
        <ToolbarDisclosure
          className="notewise-controls-toggle"
          opened={state.expanded}
          controls="notewise-mobile-controls"
          onChange={(expanded) => notewiseToolbarState.set({ expanded })}
        />
      )}
      <div
        id="notewise-mobile-controls"
        className="notewise-mobile-controls"
        role="region"
        aria-label="Additional practice controls"
        hidden={!mobile || !hasProperties || !state.expanded}
      >
        <RetainedContent element={properties} />
      </div>
    </div>
  );
}
