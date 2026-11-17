import type { ReactNode } from "react";
import { Stack } from "@mantine/core";
import { PrivacySection } from "./privacy-section";
import type { ComponentProps } from "react";
export function SettingsSections({
  offline,
  consent,
  children,
  compact = false,
}: {
  offline: ReactNode;
  consent: ComponentProps<typeof PrivacySection>;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Stack className="settings-page" data-compact={compact || undefined}>
      {offline}
      <PrivacySection {...consent} compact={compact} />
      {children}
    </Stack>
  );
}
