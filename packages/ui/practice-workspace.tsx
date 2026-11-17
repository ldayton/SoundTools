import { createPortal } from "react-dom";
import { RetainedContent } from "./retained-content";
import { PanelIcon } from "./panel-icon";
import { closePitchFields } from "@ldayton/ui/responsive-pitch-field";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { ActionIcon, Button, Drawer, Group, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export type OptionsEntry = { id: string; form: ReactNode; title?: string };
function useOptionsState(
  views: readonly OptionsEntry[],
  activeId?: string,
  activityKey?: string,
  mobileDrawer = false,
) {
  const desktop = useMediaQuery("(min-width: 70em)", undefined, {
    getInitialValueInEffect: false,
  });
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    closePitchFields();
    contentRef.current?.scrollTo(0, 0);
  }, [activityKey]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const focus = useRef<"toggle" | "reopen" | undefined>(undefined);
  const active = views.some((view) => view.id === activeId);
  const collapsed = desktop ? desktopCollapsed : mobileCollapsed;
  useLayoutEffect(() => {
    if (focus.current)
      (focus.current === "toggle" ? toggleRef : reopenRef).current?.focus({
        preventScroll: true,
      });
    focus.current = undefined;
  });
  return {
    views,
    title:
      views.find((view) => view.id === activeId)?.title || "Practice options",
    mobileDrawer,
    closeMobile() {
      closePitchFields();
      setMobileCollapsed(true);
    },
    activeId,
    active,
    desktop,
    collapsed,
    contentRef,
    toggleRef,
    reopenRef,
    toggle() {
      closePitchFields();
      if (desktop) {
        focus.current = "reopen";
        setDesktopCollapsed(true);
      } else {
        // Safari does not focus buttons on pointer activation. Give the drawer
        // a stable trigger for its standard return-focus behavior.
        toggleRef.current?.focus({ preventScroll: true });
        setMobileCollapsed((value) => !value);
      }
    },
    reopen() {
      focus.current = "toggle";
      setDesktopCollapsed(false);
    },
  };
}
const OptionsContext = createContext<ReturnType<typeof useOptionsState> | null>(
  null,
);
function useOptions() {
  const value = useContext(OptionsContext);
  if (!value) throw Error("Practice options require the application shell");
  return value;
}
export function PracticeOptionsProvider({
  activeId,
  activityKey,
  children,
  entries,
  mobileDrawer = false,
  onMobileOpenChange,
}: PropsWithChildren<{
  entries: readonly OptionsEntry[];
  activeId?: string;
  activityKey?: string;
  mobileDrawer?: boolean;
  onMobileOpenChange?(opened: boolean): void;
}>) {
  const state = useOptionsState(entries, activeId, activityKey, mobileDrawer);
  const mobileOpen =
    mobileDrawer && !state.desktop && state.active && !state.collapsed;
  const reportedOpen = useRef(false);
  useEffect(() => {
    if (reportedOpen.current === mobileOpen) return;
    reportedOpen.current = mobileOpen;
    onMobileOpenChange?.(mobileOpen);
  }, [mobileOpen, onMobileOpenChange]);
  return (
    <OptionsContext.Provider value={state}>{children}</OptionsContext.Provider>
  );
}
export function PracticeOptionsReopen() {
  const state = useOptions();
  return (
    <Button
      id="practice-options-reopen"
      ref={
        state.desktop && state.collapsed
          ? state.reopenRef
          : state.mobileDrawer
            ? state.toggleRef
            : undefined
      }
      variant="default"
      px={state.mobileDrawer ? 0 : undefined}
      w={state.mobileDrawer ? 38 : undefined}
      miw={state.mobileDrawer ? 38 : undefined}
      title={`${!state.collapsed ? "Collapse" : "Expand"} ${state.title.toLowerCase()}`}
      hidden={
        !state.mobileDrawer &&
        (!state.active || !state.desktop || !state.collapsed)
      }
      disabled={!state.active}
      aria-label={`${!state.collapsed ? "Collapse" : "Expand"} ${state.title.toLowerCase()}`}
      aria-controls="practice-options-content"
      aria-expanded={state.active && !state.collapsed}
      onClick={state.desktop && state.collapsed ? state.reopen : state.toggle}
    >
      {state.mobileDrawer ? (
        <PanelIcon side={state.desktop ? "right" : "bottom"} />
      ) : (
        "Options"
      )}
    </Button>
  );
}
export function PracticeWorkspace({ children }: PropsWithChildren) {
  const state = useOptions();
  // Keep forms and pitch pickers mounted as the same React subtree when the
  // responsive panel moves between its desktop aside and the mobile drawer.
  const [optionsHost] = useState(() => {
    const host = document.createElement("div");
    host.className = "practice-options-host";
    return host;
  });
  const label = `${state.collapsed ? "Expand" : "Collapse"} ${state.title.toLowerCase()}`;
  const drawer = state.mobileDrawer && !state.desktop;
  const content = (
    <div
      id="practice-options-content"
      ref={state.contentRef}
      className="practice-options-content"
      hidden={!drawer && state.collapsed}
    >
      {state.views.map((view) => (
        <section key={view.id} hidden={view.id !== state.activeId}>
          {view.form}
        </section>
      ))}
    </div>
  );
  return (
    <div
      className="practice-workspace"
      data-has-options={state.active || undefined}
      data-options-open={(state.active && !state.collapsed) || undefined}
    >
      <div className="practice-workspace-content">{children}</div>
      <aside
        className="practice-options soundtools-ui"
        aria-label={state.title}
        data-layout={state.desktop ? "desktop" : "mobile"}
        hidden={!state.active || (state.desktop && state.collapsed) || drawer}
      >
        {state.desktop ? (
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>{state.title}</Text>
            <ActionIcon
              className="options-toggle"
              ref={state.mobileDrawer ? undefined : state.toggleRef}
              hidden={state.mobileDrawer}
              variant="subtle"
              title={label}
              aria-label={label}
              aria-expanded={!state.collapsed}
              aria-controls="practice-options-content"
              onClick={state.toggle}
            >
              <PanelIcon side="right" />
            </ActionIcon>
          </Group>
        ) : !drawer ? (
          <Button
            className="options-toggle"
            ref={state.toggleRef}
            variant="subtle"
            fullWidth
            justify="space-between"
            aria-label={label}
            aria-expanded={!state.collapsed}
            aria-controls="practice-options-content"
            onClick={state.toggle}
            rightSection={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d={state.collapsed ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"} />
              </svg>
            }
          >
            {state.title}
          </Button>
        ) : null}
        {!drawer && (
          <RetainedContent
            element={optionsHost}
            className="practice-options-mount"
          />
        )}
      </aside>
      {drawer && (
        <Drawer
          opened={state.active && !state.collapsed}
          onClose={state.closeMobile}
          position="bottom"
          size="80dvh"
          title={state.title}
          keepMounted
          closeButtonProps={{
            "aria-label": `Close ${state.title.toLowerCase()}`,
          }}
          classNames={{ content: "soundtools-ui" }}
          styles={{
            body: { overflowY: "auto", maxHeight: "calc(80dvh - 64px)" },
          }}
        >
          <RetainedContent
            element={optionsHost}
            className="practice-options-mount"
          />
        </Drawer>
      )}
      {createPortal(content, optionsHost)}
    </div>
  );
}
