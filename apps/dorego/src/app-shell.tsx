import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Anchor, Button, Modal, Stack, Text } from '@mantine/core';
import { SoundToolsProvider } from '@ldayton/ui';
export function RetainedContent({ element }: { element: HTMLElement }) {
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) node.append(element);
    },
    [element]
  );
  return <div ref={attach} />;
}
function AppShell({ workspace }: { workspace: HTMLElement }) {
  const [help, setHelp] = useState(false);
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <header className="site-header">
        <a className="brand" href={base} aria-label="DoReGo home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          DoReGo<span className="brand-dot">.</span>
        </a>
        <Button id="how-button" variant="subtle" onClick={() => setHelp(true)}>
          Help ↗
        </Button>
      </header>
      <RetainedContent element={workspace} />
      <Modal
        id="dorego-help"
        opened={help}
        onClose={() => setHelp(false)}
        title="Help"
        centered
        closeButtonProps={{ 'aria-label': 'Close how it works' }}
      >
        <Stack gap="sm">
          <ol className="how-steps">
            <li>Choose an exercise, range, and tempo.</li>
            <li>Press Play and follow the notes.</li>
            <li>Adjust the exercise whenever you like.</li>
          </ol>
          <Text size="sm">Shortcuts: Space to play or pause. R to restart. F for fullscreen.</Text>
          <Anchor
            size="sm"
            href={`${base}samples/bitklavier/NOTICE.txt`}
            target="_blank"
            rel="noopener"
          >
            bitKlavier Grand recordings & credits · CC BY 4.0
          </Anchor>
          <Anchor
            size="sm"
            href={`${base}samples/vsco-cello/NOTICE.txt`}
            target="_blank"
            rel="noopener"
          >
            VSCO cello recordings & credits · CC0
          </Anchor>
        </Stack>
      </Modal>
    </>
  );
}
export function mountAppShell(element: HTMLElement, workspace: HTMLElement) {
  const root = createRoot(element);
  flushSync(() =>
    root.render(
      <SoundToolsProvider primaryColor="lime">
        <AppShell workspace={workspace} />
      </SoundToolsProvider>
    )
  );
}
