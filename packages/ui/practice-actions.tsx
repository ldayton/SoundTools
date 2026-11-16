import {
  ActionIcon,
  VisuallyHidden,
  Group,
  type ActionIconProps,
  type GroupProps,
} from "@mantine/core";
import { ControlIcon, type ControlIconName } from "./control-icon";
/** Ordinary practice actions stay content-sized and wrap as one regular row. */
export function PracticeActions({ className, ...props }: GroupProps) {
  return (
    <Group
      gap="xs"
      className={["soundtools-ui", "practice-actions", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export function PracticeAction({
  label,
  icon,
  onClick,
  ...props
}: ActionIconProps & {
  id?: string;
  label: string;
  icon: ControlIconName;
  onClick(): void;
}) {
  return (
    <ActionIcon
      size={36}
      variant="default"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...props}
    >
      <ControlIcon name={icon} size={18} />
      <VisuallyHidden>{label}</VisuallyHidden>
    </ActionIcon>
  );
}
