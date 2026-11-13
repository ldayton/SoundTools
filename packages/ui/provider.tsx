import { MantineProvider, createTheme } from "@mantine/core";
import type { PropsWithChildren } from "react";
import "./styles.css";

// Brand color only: use Mantine's default typography, spacing, sizes, and behavior.
const theme = createTheme({ primaryColor: "violet" });
export function SoundToolsProvider({ children }: PropsWithChildren) {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}
