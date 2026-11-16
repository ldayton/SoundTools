import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Stack } from '@mantine/core';
import { RenderErrorBoundary } from '@ldayton/ui/render-error-boundary';
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
  toolbar: ReactNode;
  builder: ReactNode;
  practice: ReactNode;
  settingsView: ReactNode;
  pause(): void;
  shutdown(): void;
};
function AppShell({ selection, title, toolbar, builder, practice, settingsView, pause }: AppViews) {
  const [settings, setSettings] = useState(location.hash === '#settings');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const small = useMediaQuery('(max-width:359px)', undefined, { getInitialValueInEffect: false });
  const base = import.meta.env.BASE_URL;
  const offline = useSyncExternalStore(offlineState.subscribe, offlineState.getSnapshot);
  useEffect(() => {
    const change = () => {
      const settings = location.hash === '#settings';
      if (settings) pause();
      setSettings(settings);
      setNavigationOpen(false);
      document.title = settings ? 'Settings · DoReGo' : 'DoReGo';
      requestAnimationFrame(() =>
        document
          .getElementById(settings ? 'page-title' : 'exercise-title')
          ?.focus({ preventScroll: true })
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
    <Stack gap="md" className="dorego-navigation">
      {selection(() => navigate(false))}
      <div className="dorego-navigation-tools">
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
      </div>
    </Stack>
  );
  return (
    <PracticeOptionsProvider
      entries={[{ id: 'builder', form: builder }]}
      mobileDrawer
      activeId={settings ? undefined : 'builder'}
      activityKey={settings ? 'settings' : 'practice'}
    >
      <ApplicationLayout
        compact
        toolbarOnly={!settings}
        mobileToolbarHeight={small ? 148 : 104}
        headerClassName={settings ? undefined : 'dorego-header'}
        mainClassName="dorego-workspace"
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
        headerActions={settings ? undefined : toolbar}
      >
        <div hidden={settings}>
          <PracticeWorkspace>{practice}</PracticeWorkspace>
        </div>
        <section id="settings-ui" aria-label="App settings" hidden={!settings}>
          {settingsView}
        </section>
      </ApplicationLayout>
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
        <RenderErrorBoundary
          appName="DoReGo"
          onStop={views.shutdown}
          onError={(error) => diagnostics.capture(error, 'shell.render_failed')}
        >
          <SoundToolsProvider primaryColor="lime" pageColor="#f5f6f1">
            <AppShell {...views} />
          </SoundToolsProvider>
        </RenderErrorBoundary>
      </StrictMode>
    )
  );
}
