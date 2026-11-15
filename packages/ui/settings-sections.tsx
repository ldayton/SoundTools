import type { ReactNode } from "react";
import { Stack } from "@mantine/core";
import { PrivacySection } from "./privacy-section";
import type { ComponentProps } from "react";
export function SettingsSections({
  offline,
  consent,
  children,
}: {
  offline: ReactNode;
  consent: ComponentProps<typeof PrivacySection>;
  children?: ReactNode;
}) {
  return (
    <Stack className="settings-page">
      {offline}
      <PrivacySection {...consent} />
      {children}
    </Stack>
  );
}
