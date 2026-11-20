import { PanelResizer, usePanelWidth } from "./panel-resizer";
import { UpdateBar } from "./offline-status-panel";
import { restoreFocus } from "./restore-focus";
import { ControlIcon } from "./control-icon";
import { PanelIcon } from "./panel-icon";
import { useEffect, useState, type ReactNode } from "react";
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
      leftSection={<ControlIcon name="settings" />}
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
  navigationScrollable = true,
  navigationOpen,
  navigationCollapsed,
  onNavigationOpen,
  onNavigationClose,
  onNavigationCollapse,
  onNavigationExpand,
  onNavigationExited,
  headerActions,
  updateAction,
  blocked,
  mainClassName,
  compact = false,
  toolbarOnly = false,
  resizableNavigation = true,
  mobileToolbarHeight,
  headerClassName,
  children,
}: {
  brand: ReactNode;
  title: ReactNode;
  area: string;
  navigation: ReactNode;
  /** Disable when navigation supplies its own bounded scrolling region and footer. */
  navigationScrollable?: boolean;
  navigationOpen: boolean;
  navigationCollapsed: boolean;
  onNavigationOpen(): void;
  onNavigationClose(): void;
  onNavigationCollapse(): void;
  onNavigationExpand(): void;
  onNavigationExited?(): void;
  headerActions?: ReactNode;
  updateAction?: ReactNode;
  blocked?: boolean;
  mainClassName?: string;
  compact?: boolean;
  toolbarOnly?: boolean;
  resizableNavigation?: boolean;
  mobileToolbarHeight?: number;
  headerClassName?: string;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  const minimumWidth = compact ? 224 : 244;
  const {
    width: navigationWidth,
    maximum: maximumWidth,
    resize: resizeNavigation,
  } = usePanelWidth(minimumWidth);
  const [resizing, setResizing] = useState(false);
  const desktop = useMediaQuery(
    `(min-width: ${theme.breakpoints.sm})`,
    undefined,
    { getInitialValueInEffect: false },
  );
  useEffect(() => {
    if (desktop && navigationOpen) onNavigationClose();
  }, [desktop, navigationOpen, onNavigationClose]);
  const smallToolbar = useMediaQuery("(max-width: 479px)", undefined, {
    getInitialValueInEffect: false,
  });
  const toolbarHeight = toolbarOnly
    ? desktop
      ? 56
      : (mobileToolbarHeight ?? (smallToolbar ? 148 : 104))
    : compact
      ? 56
      : 72;
  const mobileUpdate = !desktop && !!updateAction;
  return (
    <>
      <Anchor href="#practice-content" className="skip-link">
        Skip to practice
      </Anchor>
      <AppShell
        transitionDuration={resizing ? 0 : 200}
        header={{
          height: toolbarHeight + (mobileUpdate ? 48 : 0),
        }}
        navbar={{
          width: resizableNavigation ? navigationWidth : minimumWidth,
          breakpoint: "sm",
          collapsed: { desktop: navigationCollapsed, mobile: true },
        }}
        padding="md"
      >
        <AppShell.Header className={`soundtools-ui ${headerClassName || ""}`}>
          <Group
            className="application-toolbar"
            h={toolbarHeight}
            px={compact ? "sm" : "md"}
            gap={toolbarOnly ? "xs" : "md"}
            wrap="nowrap"
          >
            {(compact || !desktop || navigationCollapsed) && (
              <Burger
                className="nav-toggle"
                size="sm"
                opened={!desktop && navigationOpen}
                aria-label={
                  desktop && compact && !navigationCollapsed
                    ? "Collapse navigation"
                    : "Open navigation"
                }
                aria-expanded={
                  !desktop ? navigationOpen : compact && !navigationCollapsed
                }
                aria-controls="practice-navigation"
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  if (desktop && compact && !navigationCollapsed) {
                    onNavigationCollapse();
                    return;
                  }
                  if (desktop) {
                    onNavigationExpand();
                    const from = event.currentTarget;
                    requestAnimationFrame(() => {
                      if (!compact)
                        restoreFocus(
                          document.querySelector<HTMLElement>(".nav-close"),
                          from,
                        );
                    });
                  } else onNavigationOpen();
                }}
              />
            )}
            <Box hidden={toolbarOnly} style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed" hidden={compact}>
                {area}
              </Text>
              <Title
                id={toolbarOnly ? undefined : "page-title"}
                order={1}
                size="h3"
                lineClamp={1}
                tabIndex={-1}
              >
                {title}
              </Title>
            </Box>
            {toolbarOnly ? (
              <Box
                className="application-toolbar-actions"
                inert={blocked}
                style={{ flex: 1, minWidth: 0 }}
              >
                {headerActions}
              </Box>
            ) : null}
            <PracticeOptionsReopen />
            {!toolbarOnly && headerActions}
          </Group>
          {mobileUpdate && <UpdateBar>{updateAction}</UpdateBar>}
        </AppShell.Header>
        {desktop && (
          <AppShell.Navbar
            id="practice-navigation"
            aria-label="Exercises"
            className="soundtools-ui app-sidebar"
            p="md"
            style={navigationScrollable ? { overflowY: "auto" } : { overflow: "clip" }}
            inert={navigationCollapsed}
          >
            <Group justify="space-between" wrap="nowrap" mb="lg">
              {brand}
              <ActionIcon
                className="nav-close"
                hidden={compact}
                variant="subtle"
                aria-label="Collapse navigation"
                onClick={(event) => {
                  const from = event.currentTarget;
                  onNavigationCollapse();
                  requestAnimationFrame(() =>
                    restoreFocus(
                      document.querySelector<HTMLElement>(".nav-toggle"),
                      from,
                    ),
                  );
                }}
              >
                <PanelIcon />
              </ActionIcon>
            </Group>
            {updateAction && (
              <Box mb="md" aria-live="polite">
                {updateAction}
              </Box>
            )}
            {navigation}
            {resizableNavigation && !navigationCollapsed && (
              <PanelResizer
                side="left"
                width={navigationWidth}
                minimum={minimumWidth}
                maximum={maximumWidth}
                resize={resizeNavigation}
                label="Resize navigation"
                className="navigation-resizer"
                onResizing={setResizing}
              />
            )}
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
