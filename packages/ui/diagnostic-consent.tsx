import { useCallback, useState, useSyncExternalStore } from "react";
import { Checkbox } from "@mantine/core";
type DiagnosticClient = {
  subscribe(listener: () => void): () => void;
  getState(): { sharing: boolean };
  setSharing(value: boolean): Promise<unknown>;
};
/** Consent has one owner (the diagnostics client), with identical feedback in every app. */
export function DiagnosticConsent({
  id,
  client,
}: {
  id: string;
  client: DiagnosticClient;
}) {
  const subscribe = useCallback(
    (listener: () => void) => client.subscribe(listener),
    [client],
  );
  const sharing = useSyncExternalStore(
    subscribe,
    () => client.getState().sharing,
  );
  const [error, setError] = useState(false);
  return (
    <Checkbox
      id={id}
      label="Share diagnostic information"
      checked={sharing}
      error={
        error ? "Couldn’t change diagnostic sharing. Please retry." : undefined
      }
      onChange={(event) => {
        setError(false);
        void client
          .setSharing(event.currentTarget.checked)
          .catch(() => setError(true));
      }}
    />
  );
}
