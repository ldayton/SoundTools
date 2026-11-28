import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NavLink,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import type { Account } from "@ldayton/account";
import { ControlIcon } from "./control-icon";
const AccountContext = createContext<{ account: Account; open(): void } | null>(
  null,
);
export function AccountMenu() {
  const context = useContext(AccountContext);
  if (!context) throw Error("AccountMenu needs AccountProvider.");
  const state = useSyncExternalStore(
    context.account.subscribe,
    context.account.getSnapshot,
  );
  const signedIn = !!state.user && state.status !== "reauth";
  return (
    <NavLink
      component="button"
      leftSection={<ControlIcon name="account" size={18} />}
      label={signedIn ? state.email || "Account" : "Log in"}
      aria-label={signedIn ? "Account" : "Log in"}
      aria-description={signedIn ? `Signed in as ${state.email}` : undefined}
      title={signedIn ? state.email || "Account" : "Log in"}
      styles={{label:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}}
      data-account-entry
      data-account-status={state.status}
      data-account-pending={state.pending}
      onClick={(event) => {
        // Safari pointer activation does not focus buttons. Capture the actual
        // opener before Mantine records where to return focus after the modal.
        event.currentTarget.focus({ preventScroll: true });
        context.open();
      }}
    />
  );
}
/** The modal stays mounted outside responsive navigation drawers, including
 * when an email link is opened on a phone with its navigation closed. */
export function AccountProvider({
  account,
  opening,
  onOpenedChange,
  children,
}: {
  account: Account;
  opening?(): void;
  onOpenedChange?(opened: boolean): void;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot);
  const [opened, setOpened] = useState(state.link);
  useLayoutEffect(() => onOpenedChange?.(opened), [opened, onOpenedChange]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>, success?: () => void) => {
    setBusy(true);
    setError("");
    try {
      await action();
      success?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const signedIn = !!state.user && state.status !== "reauth";
  return (
    <AccountContext.Provider
      value={{
        account,
        open() {
          opening?.();
          setOpened(true);
        },
      }}
    >
      {children}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        closeButtonProps={{ "aria-label": "Close account" }}
        title={state.link ? "Confirm sign-in" : signedIn ? "Account" : "Log in"}
      >
        <Stack gap="md">
          {(error || state.error) && (
            <Alert color="red" role="alert">
              {error || state.error}
            </Alert>
          )}
          {state.link ? (
            <Button
              loading={busy}
              onClick={() =>
                void run(
                  () => account.confirmLink(),
                  () => setOpened(false),
                )
              }
            >
              Sign in
            </Button>
          ) : signedIn ? (
            <>
              <Text size="sm">{state.email}</Text>
              <Group>
                <Button
                  variant="subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => account.signOut(),
                      () => setOpened(false),
                    )
                  }
                >
                  Sign out
                </Button>
              </Group>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    sent ? account.verify(email, code) : account.send(email),
                  () => {
                    if (sent) setOpened(false);
                    else setSent(true);
                  },
                );
              }}
            >
              <Stack gap="md">
                <TextInput
                  label="Email address"
                  type="email"
                  styles={{ input: { fontSize: "max(1em, 16px)" } }}
                  autoComplete="email"
                  required
                  value={email}
                  disabled={busy || sent}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                {sent && (
                  <>
                    <Text size="sm">
                      Check your email for a sign-in link or enter its code
                      here.
                    </Text>
                    <TextInput
                      label="Sign-in code"
                      inputMode="numeric"
                      styles={{ input: { fontSize: "max(1em, 16px)" } }}
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.currentTarget.value)}
                    />
                  </>
                )}
                <Button type="submit" loading={busy}>
                  {sent ? "Log in" : "Send sign-in email"}
                </Button>
                {sent && (
                  <Button
                    variant="subtle"
                    disabled={busy}
                    onClick={() => {
                      setSent(false);
                      setCode("");
                    }}
                  >
                    Use another email or resend
                  </Button>
                )}
              </Stack>
            </form>
          )}
        </Stack>
      </Modal>
    </AccountContext.Provider>
  );
}
