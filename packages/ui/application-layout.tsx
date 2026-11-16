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
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
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
  compact = false,
  toolbarOnly = false,
  resizableNavigation = false,
  mobileToolbarHeight,
  headerClassName,
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
  compact?: boolean;
  toolbarOnly?: boolean;
  resizableNavigation?: boolean;
  mobileToolbarHeight?: number;
  headerClassName?: string;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  const minimumWidth = compact ? 224 : 244;
  const [navigationWidth, setNavigationWidth] = useState(minimumWidth);
  const [resizing, setResizing] = useState(false);
  const { width: viewportWidth } = useViewportSize();
  const maximumWidth = Math.max(
    minimumWidth,
    Math.min(480, (viewportWidth || 880) - 400),
  );
  const resizeNavigation = (width: number) =>
    setNavigationWidth(
      Math.round(Math.max(minimumWidth, Math.min(maximumWidth, width))),
    );
  const desktop = useMediaQuery(
    `(min-width: ${theme.breakpoints.sm})`,
    undefined,
    { getInitialValueInEffect: false },
  );
  useEffect(() => {
    if (desktop && resizableNavigation)
      setNavigationWidth((width) => Math.min(width, maximumWidth));
  }, [desktop, resizableNavigation, maximumWidth]);
  useEffect(() => {
    if (desktop && navigationOpen) onNavigationClose();
  }, [desktop, navigationOpen, onNavigationClose]);
  const smallToolbar = useMediaQuery("(max-width: 479px)", undefined, {
    getInitialValueInEffect: false,
  });
  return (
    <>
      <Anchor href="#practice-content" className="skip-link">
        Skip to practice
      </Anchor>
      <AppShell
        transitionDuration={resizing ? 0 : 200}
        header={{
          height: toolbarOnly
            ? desktop
              ? 56
              : (mobileToolbarHeight ?? (smallToolbar ? 148 : 104))
            : compact
              ? 56
              : 72,
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
            h="100%"
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
                  if (compact) event.currentTarget.focus();
                  if (desktop && compact && !navigationCollapsed) {
                    onNavigationCollapse();
                    return;
                  }
                  if (desktop) {
                    onNavigationExpand();
                    requestAnimationFrame(
                      () =>
                        !compact &&
                        document
                          .querySelector<HTMLElement>(".nav-close")
                          ?.focus(),
                    );
                  } else onNavigationOpen();
                }}
              />
            )}
            <Box hidden={toolbarOnly} style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed" hidden={compact}>
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
            {toolbarOnly ? (
              <Box style={{ flex: 1, minWidth: 0 }}>{headerActions}</Box>
            ) : null}
            <PracticeOptionsReopen />
            {!toolbarOnly && headerActions}
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
                hidden={compact}
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
            {resizableNavigation && !navigationCollapsed && (
              <div
                className="navigation-resizer"
                role="separator"
                aria-label="Resize navigation"
                aria-orientation="vertical"
                aria-valuemin={minimumWidth}
                aria-valuemax={maximumWidth}
                aria-valuenow={navigationWidth}
                aria-valuetext={`${navigationWidth} pixels`}
                tabIndex={0}
                data-resizing={resizing || undefined}
                title="Drag to resize. Double-click to reset."
                onDoubleClick={() => resizeNavigation(minimumWidth)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setResizing(true);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    resizeNavigation(
                      event.clientX -
                        event.currentTarget.parentElement!.getBoundingClientRect()
                          .left,
                    );
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onLostPointerCapture={() => setResizing(false)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  resizeNavigation(
                    event.key === "Home"
                      ? minimumWidth
                      : event.key === "End"
                        ? maximumWidth
                        : navigationWidth +
                          (event.key === "ArrowRight" ? 16 : -16),
                  );
                }}
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
