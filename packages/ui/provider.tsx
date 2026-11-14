import { MantineProvider, createTheme } from "@mantine/core";
import { useMemo, type PropsWithChildren } from "react";
import "./styles.css";

// Brand color only: use Mantine's default typography, spacing, sizes, and behavior.
export function SoundToolsProvider({
  children,
  primaryColor = "violet",
}: PropsWithChildren<{ primaryColor?: string }>) {
  const theme = useMemo(() => createTheme({ primaryColor }), [primaryColor]);
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}
