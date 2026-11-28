import { ToolbarVolume } from "./sidebar-controls";
import { RetainedContent } from "./retained-content";
import { PracticePianoToggle } from "./piano-presentation";

export function NotewiseToolbar({
  session,
  pianoPanelId,
  pianoRequired,
}: {
  session: HTMLElement;
  pianoPanelId: string;
  pianoRequired: boolean;
}) {
  return (
    <div className="notewise-toolbar">
      <div className="notewise-toolbar-volume">
        <ToolbarVolume />
      </div>
      <RetainedContent element={session} className="notewise-toolbar-session" />
      <div className="notewise-toolbar-piano" hidden={pianoRequired}>
        <PracticePianoToggle iconOnly panelId={pianoPanelId} />
      </div>
    </div>
  );
}
