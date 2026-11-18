import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Button,
  Center,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Account } from "@ldayton/account";
import { isAccountConfirmation } from "@ldayton/account/link";
import { SoundToolsProvider } from "./provider";

type App = { id: string; name: string; color: string };

/** Email confirmation must never initialize practice, its writer lock, or sync.
 * Supabase shares the saved session with the already-open app on this origin. */
export async function bootAccountApp(app: App, start: () => Promise<unknown>) {
  if (!isAccountConfirmation()) {
    await start();
    return;
  }
  const account = new Account(app.id);
  function Confirmation() {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [otherWindow, setOtherWindow] = useState(false);
    const [error, setError] = useState("");
    const [invalid, setInvalid] = useState(!account.getSnapshot().link);
    async function confirm() {
      setBusy(true);
      setError("");
      try {
        await account.confirmLink();
        // Query only; never acquire or steal the live practice writer's lock.
        const locks = await navigator.locks?.query().catch(() => undefined);
        setOtherWindow(
          !!locks?.held?.some(
            (lock) => lock.name === `soundtools-${app.id}-writer`,
          ),
        );
        setDone(true);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not sign in. Try again.",
        );
        setInvalid(!account.getSnapshot().link);
      } finally {
        setBusy(false);
      }
    }
    return (
      <Center mih="100dvh" p="md">
        <Paper withBorder p="xl" radius="md" maw={440} w="100%">
          <Stack gap="md">
            <Title order={1} size="h3">
              {app.name}
            </Title>
            <Title order={2} size="h4">
              {done ? "Signed in" : "Confirm sign-in"}
            </Title>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {done ? (
              <>
                <Text role="status">
                  {otherWindow
                    ? `Return to your open ${app.name} window. You can close this page.`
                    : `You can now continue to ${app.name}.`}
                </Text>
                {!otherWindow && (
                  <Button component="a" href="/">
                    Continue to {app.name}
                  </Button>
                )}
              </>
            ) : invalid ? (
              <>
                <Text>
                  This sign-in link is missing or has expired. Return to the app
                  to request a new email.
                </Text>
                <Button component="a" href="/">
                  Open {app.name}
                </Button>
              </>
            ) : (
              <Button loading={busy} onClick={() => void confirm()}>
                Sign in
              </Button>
            )}
          </Stack>
        </Paper>
      </Center>
    );
  }
  document.title = `Sign in · ${app.name}`;
  createRoot(document.getElementById("app")!).render(
    <SoundToolsProvider primaryColor={app.color}>
      <Confirmation />
    </SoundToolsProvider>,
  );
  window.dispatchEvent(new Event("soundtools:ready"));
}
