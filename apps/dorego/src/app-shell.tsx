import { restoreFocus } from "@ldayton/ui/restore-focus";
import { AccountMenu, AccountProvider } from '@ldayton/ui/account-menu';
import { account } from './account';
import { preferences } from './preferences';
import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Divider, Stack, UnstyledButton } from '@mantine/core';
import {
  BreathOptions,
  BreathSquares,
  BreathToolbar,
  useBreathSession,
} from './breath-squares-view';
import { RenderErrorBoundary } from '@ldayton/ui/render-error-boundary';
import { SoundToolsProvider } from '@ldayton/ui';
import {
  ApplicationLayout,
  AppBrand,
  SettingsNavigationLink,
  SidebarTools,
  isNavigationClick,
} from '@ldayton/ui/application-layout';
import { PracticeOptionsProvider, PracticeWorkspace } from '@ldayton/ui/practice-workspace';
import { diagnostics } from './diagnostics';
import { offlineState, offlineActions } from './offline-state';
import { CompleteUpdateButton } from '@ldayton/ui/offline-status-panel';
export type AppViews = {
  selection(onSelect: () => void, active: boolean): ReactNode;
  title: ReactNode;
  toolbar: ReactNode;
  volumeControl: ReactNode;
  getVolume(): number;
  builder: ReactNode;
  practice: ReactNode;
  settingsView: ReactNode;
  pause(): void;
  shutdown(): void;
};
function AppShell({
  selection,
  title,
  toolbar,
  volumeControl,
  getVolume,
  builder,
  practice,
  settingsView,
  pause,
}: AppViews) {
  const [settings, setSettings] = useState(location.hash === '#settings');
  const saved = useSyncExternalStore(listener => preferences.subscribe(listener), () => preferences.state);
  const breathing = saved.selected === 'breathSquares';
  const setBreathing = (value: boolean) => preferences.update({ selected: value ? 'breathSquares' : 'warmup' });
  const breath = useBreathSession(breathing && !settings, getVolume);
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
      const from = document.activeElement;
      requestAnimationFrame(() => restoreFocus(
        document.getElementById(settings ? 'page-title' : 'exercise-title'),
        from,
      ));
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
        history.replaceState(null, '', location.pathname + location.search);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  };
  const navigation = (
    <Stack gap="md" className="dorego-navigation">
      {selection(() => {
        setBreathing(false);
        navigate(false);
      }, !breathing)}
      <Divider />
      <UnstyledButton
        className="dorego-exercise"
        data-pattern="breathSquares"
        aria-current={breathing ? 'true' : undefined}
        onClick={() => {
          pause();
          setBreathing(true);
          navigate(false);
        }}
      >
        Breath Squares
      </UnstyledButton>
      <SidebarTools>
        <SettingsNavigationLink
          href={`${location.pathname}${location.search}#settings`}
          active={settings}
          updateAvailable={!offline.updateHidden}
          onClick={(event) => {
            if (!isNavigationClick(event)) return;
            event.preventDefault();
            navigate(true);
          }}
        />
        <AccountMenu />
      </SidebarTools>
    </Stack>
  );
  return (
    <AccountProvider account={account} opening={() => { pause(); breath.pause(); }}>
    <PracticeOptionsProvider
      entries={[
        { id: 'builder', form: builder },
        { id: 'breathing', form: <BreathOptions session={breath} /> },
      ]}
      mobileDrawer
      activeId={settings ? undefined : breathing ? 'breathing' : 'builder'}
      activityKey={settings ? 'settings' : breathing ? 'breathing' : 'practice'}
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
        headerActions={
          settings ? undefined : breathing ? (
            <BreathToolbar session={breath} volumeControl={volumeControl} />
          ) : (
            toolbar
          )
        }
        updateAction={
          !offline.updateHidden ? (
            <CompleteUpdateButton onClick={() => offlineActions.update()} />
          ) : undefined
        }
      >
        <div hidden={settings}>
          <PracticeWorkspace>
            {breathing ? <BreathSquares session={breath} /> : practice}
          </PracticeWorkspace>
        </div>
        <section id="settings-ui" aria-label="App settings" hidden={!settings}>
          {settingsView}
        </section>
      </ApplicationLayout>
    </PracticeOptionsProvider>
    </AccountProvider>
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
