import type { ComponentProps } from "react";
import { Paper, Stack, Title } from "@mantine/core";
import { DiagnosticConsent } from "./diagnostic-consent";

/** User-facing consent stays separate from developer measurement tools. */
export function PrivacySection(props: ComponentProps<typeof DiagnosticConsent>) {
  const titleId = `${props.id}-privacy-title`;
  return <Paper component="section" withBorder p="md" aria-labelledby={titleId}>
    <Stack gap="sm">
      <Title order={2} size="h4" id={titleId}>Privacy</Title>
      <DiagnosticConsent {...props} />
    </Stack>
  </Paper>;
}
