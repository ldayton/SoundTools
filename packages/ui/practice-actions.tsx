import { Group, type GroupProps } from "@mantine/core";
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
