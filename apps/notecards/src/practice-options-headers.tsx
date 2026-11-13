import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ActionIcon, Button, Group, Text } from "@mantine/core";
import {
  practiceOptionsChrome,
  togglePracticeOptions,
} from "./practice-controls";

/** Share the shell's provider while keeping legacy exercise controls mounted. */
export function PracticeOptionsHeaders() {
  useSyncExternalStore(
    practiceOptionsChrome.subscribe,
    practiceOptionsChrome.getSnapshot,
  );
  const mobile = practiceOptionsChrome.isMobile();
  const collapsed = practiceOptionsChrome.isCollapsed();
  const label = `${collapsed ? "Expand" : "Collapse"} practice options`;
  return practiceOptionsChrome.getPanels().map((panel) => {
    const target = panel.querySelector<HTMLElement>(".options-header")!;
    const controls = panel.querySelector<HTMLElement>(
      ".practice-options-content",
    )!.id;
    const props = {
      className: "options-toggle",
      "aria-label": label,
      "aria-controls": controls,
      "aria-expanded": !collapsed,
      onClick: togglePracticeOptions,
    };
    const header = createPortal(
      mobile ? (
        <Button
          {...props}
          variant="subtle"
          fullWidth
          justify="space-between"
          rightSection={<Chevron expanded={!collapsed} />}
        >
          Practice options
        </Button>
      ) : (
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>Practice options</Text>
          <ActionIcon {...props} variant="subtle" title={label}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16m-6-11 3 3-3 3" />
            </svg>
          </ActionIcon>
        </Group>
      ),
      target,
      controls + "-header",
    );
    const form = practiceOptionsChrome.getForm(panel);
    return [
      header,
      form
        ? createPortal(
            form,
            panel.querySelector<HTMLElement>(".practice-options-content")!,
            controls + "-form",
          )
        : null,
    ];
  });
}
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
