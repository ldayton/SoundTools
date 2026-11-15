import { Component, useEffect, useRef, type ReactNode } from "react";
import { Button, Paper, Stack, Text, Title } from "@mantine/core";
import { SoundToolsProvider } from "./provider";

function RecoveryScreen({ appName, dark }: { appName: string; dark: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `Reload ${appName}`;
    heading.current?.focus();
  }, [appName]);
  return (
    <SoundToolsProvider colorScheme={dark ? "dark" : "light"}>
      <main aria-label={`${appName} recovery`}>
        <Paper withBorder p="xl" m="md" maw={480} mx="auto" mt="xl">
          <Stack>
            <Title ref={heading} order={1} size="h3" tabIndex={-1}>
              {appName} couldn’t display this page
            </Title>
            <Text>Reload the app to continue.</Text>
            <Button onClick={() => window.location.reload()}>Reload app</Button>
          </Stack>
        </Paper>
      </main>
    </SoundToolsProvider>
  );
}

/** A fatal render failure stops the app; reload is the only safe restart. */
export class RenderErrorBoundary extends Component<
  {
    appName: string;
    dark?: boolean;
    onStop(): void;
    onError(error: unknown): void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Recovery must remain usable even if shutdown or diagnostics also fails.
    // Controllers can synchronously publish React state while stopping. Run
    // after this commit rather than forcing another commit from a lifecycle.
    queueMicrotask(() => {
      try {
        this.props.onStop();
      } catch (shutdownError) {
        this.report(shutdownError);
      }
    });
    this.report(error);
  }
  private report(error: unknown) {
    try {
      this.props.onError(error);
    } catch {
      // Diagnostics is optional and must never take down recovery.
    }
  }
  render() {
    return this.state.failed ? (
      <RecoveryScreen appName={this.props.appName} dark={!!this.props.dark} />
    ) : (
      this.props.children
    );
  }
}
