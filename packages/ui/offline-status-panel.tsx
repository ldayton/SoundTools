import "./update-bar.css";
import type { ReactNode } from "react";
import { Button, Paper, Stack, Text, Title } from "@mantine/core";

/** Only render after the app's worker has verified a complete staged release. */
export function CompleteUpdateButton({
  id = "offline-update",
  version,
  hidden,
  onClick,
}: {
  id?: string;
  version?: string;
  hidden?: boolean;
  onClick(): void;
}) {
  return (
    <Button
      id={id}
      hidden={hidden}
      data-version={version}
      size="sm"
      variant="filled"
      autoContrast
      title="Downloaded and ready. Reload to complete the update."
      onClick={onClick}
    >
      Complete update
    </Button>
  );
}
/** Presentation only. Each app retains its own caching and download lifecycle. */
export function OfflineStatusPanel({
  status,
  ready,
  children,
  compact = false,
}: {
  status: string;
  ready: boolean;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Paper
      component="section"
      withBorder={!compact}
      radius={compact ? 0 : undefined}
      p={compact ? 0 : "md"}
      aria-label="Offline use"
    >
      <Stack gap={compact ? "xs" : "sm"}>
        <Title order={2} size={compact ? "h5" : "h4"}>
          Take it with you
        </Title>
        <Text
          id="offline-status"
          size="sm"
          role="status"
          c={ready ? "green" : "dimmed"}
          className={ready ? "is-ready" : undefined}
        >
          {status}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

/** A dedicated, centered update row shared by every app and screen size. */
export function UpdateBar({ children, hidden, className = "" }: { children: ReactNode; hidden?: boolean; className?: string }) {
  return <div className={`application-update-bar ${className}`} hidden={hidden} aria-live="polite">{children}</div>;
}
