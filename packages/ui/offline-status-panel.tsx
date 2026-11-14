import type { ReactNode } from "react";
import { Paper, Stack, Text, Title } from "@mantine/core";
/** Presentation only. Each app retains its own caching and download lifecycle. */
export function OfflineStatusPanel({
  status,
  ready,
  children,
}: {
  status: string;
  ready: boolean;
  children?: ReactNode;
}) {
  return (
    <Paper component="section" withBorder p="md" aria-label="Offline use">
      <Stack gap="sm">
        <Title order={2} size="h4">
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
