import type { ReactNode } from "react";
import { Paper, Stack, Title } from "@mantine/core";
import { DiagnosticConsent } from "./diagnostic-consent";
import type { ComponentProps } from "react";
export function SettingsSections({
  offline,
  consent,
  children,
}: {
  offline: ReactNode;
  consent: ComponentProps<typeof DiagnosticConsent>;
  children?: ReactNode;
}) {
  return (
    <Stack className="settings-page">
      {offline}
      <Paper
        component="section"
        withBorder
        p="md"
        aria-labelledby="privacy-title"
      >
        <Stack gap="sm">
          <Title order={2} size="h4" id="privacy-title">
            Privacy
          </Title>
          <DiagnosticConsent {...consent} />
        </Stack>
      </Paper>
      {children}
    </Stack>
  );
}
