import { ActionIcon } from "@mantine/core";
import { ControlIcon } from "./control-icon";

/** A disclosure for an extra toolbar row, distinct from an options drawer. */
export function ToolbarDisclosure({
  opened,
  controls,
  onChange,
  className,
}: {
  opened: boolean;
  controls: string;
  onChange(opened: boolean): void;
  className?: string;
}) {
  const label = opened ? "Hide controls" : "Show controls";
  return (
    <ActionIcon
      className={className}
      variant={opened ? "light" : "default"}
      aria-label={label}
      title={label}
      aria-expanded={opened}
      aria-controls={controls}
      onClick={() => onChange(!opened)}
    >
      <ControlIcon name={opened ? "chevron-up" : "chevron-down"} />
    </ActionIcon>
  );
}
