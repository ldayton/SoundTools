import { MantineProvider, createTheme } from "@mantine/core";
import { useMemo, type PropsWithChildren } from "react";
import "./styles.css";

// Brand accents and page tone only: use Mantine's default typography, spacing, sizes, and behavior.
export function SoundToolsProvider({
  children,
  primaryColor = "violet",
  pageColor = "#f8f9fa",
}: PropsWithChildren<{ primaryColor?: string; pageColor?: string }>) {
  const theme = useMemo(() => createTheme({ primaryColor }), [primaryColor]);
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme="light"
      cssVariablesResolver={() => ({
        variables: { "--soundtools-page": pageColor },
        light: {},
        dark: {},
      })}
    >
      {children}
    </MantineProvider>
  );
}
