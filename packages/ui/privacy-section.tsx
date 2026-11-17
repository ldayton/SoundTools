import type { ComponentProps } from "react";
import { Paper, Stack, Title } from "@mantine/core";
import { DiagnosticConsent } from "./diagnostic-consent";

/** User-facing consent stays separate from developer measurement tools. */
export function PrivacySection({
  compact = false,
  ...props
}: ComponentProps<typeof DiagnosticConsent> & { compact?: boolean }) {
  const titleId = `${props.id}-privacy-title`;
  return (
    <Paper
      component="section"
      withBorder={!compact}
      radius={compact ? 0 : undefined}
      p={compact ? 0 : "md"}
      aria-labelledby={titleId}
    >
      <Stack gap={compact ? "xs" : "sm"}>
        <Title order={2} size={compact ? "h5" : "h4"} id={titleId}>
          Privacy
        </Title>
        <DiagnosticConsent {...props} />
      </Stack>
    </Paper>
  );
}
