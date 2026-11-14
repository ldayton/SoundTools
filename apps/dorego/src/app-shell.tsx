import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Anchor, Button, Modal, NavLink, Stack, Text } from '@mantine/core';
import { SoundToolsProvider } from '@ldayton/ui';
import {
  ApplicationLayout,
  AppBrand,
  SettingsNavigationLink,
  isNavigationClick,
} from '@ldayton/ui/application-layout';
import { PracticeOptionsProvider, PracticeWorkspace } from '@ldayton/ui/practice-workspace';
import { diagnostics } from './diagnostics';
import { offlineState } from './offline-state';
export type AppViews = {
  selection(onSelect: () => void): ReactNode;
  title: ReactNode;
  volume: ReactNode;
  builder: ReactNode;
  practice: ReactNode;
  settingsView: ReactNode;
  pause(): void;
};
function AppShell({ selection, title, volume, builder, practice, settingsView, pause }: AppViews) {
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(location.hash === '#settings');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const base = import.meta.env.BASE_URL;
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  useEffect(() => {
    const change = () => {
      const settings = location.hash === '#settings';
      if (settings) pause();
      setSettings(settings);
      setNavigationOpen(false);
      document.title = `${settings ? 'Settings' : 'Practice'} · DoReGo`;
      requestAnimationFrame(() =>
        document.getElementById('page-title')?.focus({ preventScroll: true })
      );
    };
    window.addEventListener('hashchange', change);
    if (settings) pause();
    return () => window.removeEventListener('hashchange', change);
  }, [pause]);
  const navigate = (settings: boolean) => {
    setNavigationOpen(false);
    if (settings) pause();
    if (location.hash !== (settings ? '#settings' : '')) {
      if (settings) location.hash = 'settings';
      else {
        history.pushState(null, '', base);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  };
  const navigation = (
    <Stack gap="md">
      {selection(() => navigate(false))}
      <NavLink
        component="a"
        href={base}
        label="Warm-up"
        active={!settings}
        aria-current={!settings ? 'page' : undefined}
        onClick={(event) => {
          if (!isNavigationClick(event)) return;
          event.preventDefault();
          navigate(false);
        }}
      />
      {volume}
      <SettingsNavigationLink
        href={`${base}#settings`}
        active={settings}
        updateAvailable={!offline.updateHidden}
        onClick={(event) => {
          if (!isNavigationClick(event)) return;
          event.preventDefault();
          navigate(true);
        }}
      />
      <Text size="xs" c="dimmed">
        SOUNDTOOLS
      </Text>
    </Stack>
  );
  return (
    <PracticeOptionsProvider
      entries={[{ id: 'builder', form: builder }]}
      activeId={settings ? undefined : 'builder'}
      activityKey={settings ? 'settings' : 'practice'}
    >
      <ApplicationLayout
        brand={
          <AppBrand
            name="DoReGo"
            icon={`${base}icon.svg`}
            href={base}
            onClick={(event) => {
              if (!isNavigationClick(event)) return;
              event.preventDefault();
              navigate(false);
            }}
          />
        }
        title={settings ? 'Settings' : title}
        area={settings ? 'DoReGo' : 'Singing'}
        navigation={navigation}
        navigationOpen={navigationOpen}
        navigationCollapsed={navigationCollapsed}
        onNavigationOpen={() => setNavigationOpen(true)}
        onNavigationClose={() => setNavigationOpen(false)}
        onNavigationCollapse={() => setNavigationCollapsed(true)}
        onNavigationExpand={() => setNavigationCollapsed(false)}
        headerActions={
          <Button id="how-button" variant="subtle" onClick={() => setHelp(true)}>
            Help
          </Button>
        }
      >
        <div hidden={settings}>
          <PracticeWorkspace>{practice}</PracticeWorkspace>
        </div>
        <section id="settings-ui" aria-label="App settings" hidden={!settings}>
          {settingsView}
        </section>
      </ApplicationLayout>
      <Modal
        id="dorego-help"
        opened={help}
        onClose={() => setHelp(false)}
        title="Help"
        centered
        closeButtonProps={{ 'aria-label': 'Close how it works' }}
      >
        <Stack gap="sm">
          <Text>
            Choose an exercise in the navigation. Adjust its range and repeats in Practice options,
            then press Play.
          </Text>
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
    </PracticeOptionsProvider>
  );
}
export function mountAppShell(element: HTMLElement, views: AppViews) {
  const root = createRoot(element, {
    onUncaughtError: (error) => diagnostics.capture(error, 'shell.render_failed'),
  });
  flushSync(() =>
    root.render(
      <StrictMode>
        <SoundToolsProvider primaryColor="lime" pageColor="#f5f6f1">
          <AppShell {...views} />
        </SoundToolsProvider>
      </StrictMode>
    )
  );
}
