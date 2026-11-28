import { MantineProvider, createTheme, type MantineColorsTuple } from "@mantine/core";
import { useMemo, type PropsWithChildren } from "react";
import "./styles.css";

// Brand accents and page tone only: use Mantine's default typography, spacing, sizes, and behavior.
export function SoundToolsProvider({
  children,
  primaryColor = "violet",
  primaryColors,
  pageColor = "#f8f9fa",
  colorScheme = "light",
}: PropsWithChildren<{
  primaryColor?: string;
  primaryColors?: MantineColorsTuple;
  pageColor?: string;
  colorScheme?: "light" | "dark";
}>) {
  const theme = useMemo(() => createTheme({ primaryColor, ...(primaryColors ? { colors: { [primaryColor]: primaryColors } } : {}) }), [primaryColor, primaryColors]);
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
