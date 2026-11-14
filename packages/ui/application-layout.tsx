import { PanelIcon } from "./panel-icon";
import { useEffect, type ReactNode } from "react";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Burger,
  Drawer,
  Group,
  Indicator,
  NavLink,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { PracticeOptionsReopen } from "./practice-workspace";
import "./layout.css";

export function isNavigationClick(event: React.MouseEvent) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function SettingsNavigationLink({
  href,
  active,
  onClick,
  updateAvailable = false,
}: {
  href: string;
  active: boolean;
  onClick: React.MouseEventHandler<HTMLAnchorElement>;
  updateAvailable?: boolean;
}) {
  return (
    <NavLink
      component="a"
      href={href}
      label="Settings"
      aria-label="Settings"
      aria-description={updateAvailable ? "App update available" : undefined}
      data-settings
      active={active}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      leftSection={
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6" />
        </svg>
      }
      rightSection={
        updateAvailable ? (
          <Indicator color="orange" position="middle-center">
            <Box w={8} h={8} role="img" aria-label="Update available" />
          </Indicator>
        ) : undefined
      }
    />
  );
}

export function AppBrand({
  name,
  icon,
  href = "/",
  onClick,
}: {
  name: string;
  icon: string;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Anchor
      href={href}
      onClick={onClick}
      aria-label={`${name} home`}
      c="inherit"
      underline="never"
    >
      <Group gap="xs" wrap="nowrap">
        <img src={icon} alt="" width="28" height="28" />
        <Text fw={600}>{name}</Text>
      </Group>
    </Anchor>
  );
}

/** Shared page geometry and accessible navigation. Apps supply their own content and routing. */
export function ApplicationLayout({
  brand,
  title,
  area,
  navigation,
  navigationOpen,
  navigationCollapsed,
  onNavigationOpen,
  onNavigationClose,
  onNavigationCollapse,
  onNavigationExpand,
  onNavigationExited,
  headerActions,
  blocked,
  mainClassName,
  children,
}: {
  brand: ReactNode;
  title: ReactNode;
  area: string;
  navigation: ReactNode;
  navigationOpen: boolean;
  navigationCollapsed: boolean;
  onNavigationOpen(): void;
  onNavigationClose(): void;
  onNavigationCollapse(): void;
  onNavigationExpand(): void;
  onNavigationExited?(): void;
  headerActions?: ReactNode;
  blocked?: boolean;
  mainClassName?: string;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  const desktop = useMediaQuery(
    `(min-width: ${theme.breakpoints.sm})`,
    undefined,
    { getInitialValueInEffect: false },
  );
  useEffect(() => {
    if (desktop && navigationOpen) onNavigationClose();
  }, [desktop, navigationOpen, onNavigationClose]);
  return (
    <>
      <Anchor href="#practice-content" className="skip-link">
        Skip to practice
      </Anchor>
      <AppShell
        header={{ height: 72 }}
        navbar={{
          width: 244,
          breakpoint: "sm",
          collapsed: { desktop: navigationCollapsed, mobile: true },
        }}
        padding="md"
      >
        <AppShell.Header className="soundtools-ui">
          <Group h="100%" px="md" wrap="nowrap">
            {(!desktop || navigationCollapsed) && (
              <Burger
                className="nav-toggle"
                size="sm"
                opened={!desktop && navigationOpen}
                aria-label="Open navigation"
                aria-expanded={!desktop ? navigationOpen : false}
                aria-controls="practice-navigation"
                onClick={() => {
                  if (desktop) {
                    onNavigationExpand();
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>(".nav-close")
                        ?.focus(),
                    );
                  } else onNavigationOpen();
                }}
              />
            )}
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed">
                {area}
              </Text>
              <Title
                id="page-title"
                order={1}
                size="h3"
                lineClamp={1}
                tabIndex={-1}
              >
                {title}
              </Title>
            </Box>
            <PracticeOptionsReopen />
            {headerActions}
          </Group>
        </AppShell.Header>
        {desktop && (
          <AppShell.Navbar
            id="practice-navigation"
            aria-label="Exercises"
            className="soundtools-ui app-sidebar"
            p="md"
            style={{ overflowY: "auto" }}
            inert={navigationCollapsed}
          >
            <Group justify="space-between" wrap="nowrap" mb="lg">
              {brand}
              <ActionIcon
                className="nav-close"
                variant="subtle"
                aria-label="Collapse navigation"
                onClick={() => {
                  onNavigationCollapse();
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>(".nav-toggle")?.focus(),
                  );
                }}
              >
                <PanelIcon />
              </ActionIcon>
            </Group>
            {navigation}
          </AppShell.Navbar>
        )}
        <AppShell.Main
          id="practice-content"
          tabIndex={-1}
          inert={blocked}
          className={mainClassName}
        >
          <div className="workspace-content">{children}</div>
        </AppShell.Main>
      </AppShell>
      <Drawer
        id="navigation-drawer"
        opened={!desktop && navigationOpen}
        onClose={onNavigationClose}
        title={brand}
        closeButtonProps={{ "aria-label": "Close navigation" }}
        classNames={{ content: "soundtools-ui" }}
        onExitTransitionEnd={onNavigationExited}
      >
        <Box
          component="nav"
          aria-label="Exercises"
          id="practice-navigation"
          className="app-sidebar"
        >
          {navigation}
        </Box>
      </Drawer>
    </>
  );
}
