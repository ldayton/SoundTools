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
const labels = {
  guest: "",
  loading: "Loading account…",
  syncing: "Syncing…",
  synced: "Synced",
  offline: "Offline—using saved data",
  reauth: "Sign in to sync",
  error: "Sync needs attention",
};
const status = (state: ReturnType<Account["getSnapshot"]>) =>
  state.status === "offline" && state.pending
    ? "Offline—changes pending"
    : labels[state.status];
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
  return (
    <NavLink
      component="button"
      leftSection={<ControlIcon name="account" size={18} />}
      label={state.user ? "Account" : "Log in"}
      aria-label={state.user ? "Account" : "Log in"}
      description={
        state.user
          ? state.conflicts.length
            ? "Changes need review"
            : state.updates
              ? "Cloud changes ready"
              : status(state)
          : undefined
      }
      onClick={context.open}
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
              <Text size="sm" role="status">
                {status(state)}
                {state.pending ? ` (${state.pending})` : ""}
              </Text>
              {state.updates && (
                <Button onClick={() => void run(() => account.apply(true))}>
                  Apply cloud changes
                </Button>
              )}
              {state.conflicts.map((key) => (
                <Stack key={key} gap="xs">
                  <Text size="sm">
                    Changed on both devices: {key.replace(/[.:]/g, " ")}
                  </Text>
                  <Group grow>
                    <Button
                      variant="default"
                      onClick={() =>
                        void run(() => account.resolve(key, "device"))
                      }
                    >
                      Use this device
                    </Button>
                    <Button
                      variant="default"
                      onClick={() =>
                        void run(() => account.resolve(key, "cloud"))
                      }
                    >
                      Use cloud
                    </Button>
                  </Group>
                </Stack>
              ))}
              <Group>
                <Button
                  variant="default"
                  loading={busy}
                  onClick={() => void run(() => account.sync())}
                >
                  Sync now
                </Button>
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
