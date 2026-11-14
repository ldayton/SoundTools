import { MantineProvider, createTheme } from "@mantine/core";
import { useMemo, type PropsWithChildren } from "react";
import "./styles.css";

// Brand accents and page tone only: use Mantine's default typography, spacing, sizes, and behavior.
export function SoundToolsProvider({
  children,
  primaryColor = "violet",
  pageColor = "#f8f9fa",
  colorScheme = "light",
}: PropsWithChildren<{
  primaryColor?: string;
  pageColor?: string;
  colorScheme?: "light" | "dark";
}>) {
  const theme = useMemo(() => createTheme({ primaryColor }), [primaryColor]);
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={colorScheme}
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
