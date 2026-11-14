import { PanelIcon } from "./panel-icon";
import { closePitchFields } from "@ldayton/ui/responsive-pitch-field";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { ActionIcon, Button, Group, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export type OptionsEntry = { id: string; form: ReactNode };
function useOptionsState(
  views: readonly OptionsEntry[],
  activeId?: string,
  activityKey?: string,
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
      } else setMobileCollapsed((value) => !value);
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
}: PropsWithChildren<{
  entries: readonly OptionsEntry[];
  activeId?: string;
  activityKey?: string;
}>) {
  const state = useOptionsState(entries, activeId, activityKey);
  return (
    <OptionsContext.Provider value={state}>{children}</OptionsContext.Provider>
  );
}
export function PracticeOptionsReopen() {
  const state = useOptions();
  return (
    <Button
      id="practice-options-reopen"
      ref={state.reopenRef}
      variant="default"
      hidden={!state.active || !state.desktop || !state.collapsed}
      aria-label="Expand practice options"
      aria-controls="practice-options-content"
      aria-expanded={false}
      onClick={state.reopen}
    >
      Options
    </Button>
  );
}
export function PracticeWorkspace({ children }: PropsWithChildren) {
  const state = useOptions();
  const label = `${state.collapsed ? "Expand" : "Collapse"} practice options`;
  return (
    <div
      className="practice-workspace"
      data-has-options={state.active || undefined}
      data-options-open={(state.active && !state.collapsed) || undefined}
    >
      <div className="practice-workspace-content">{children}</div>
      <aside
        className="practice-options soundtools-ui"
        aria-label="Practice options"
        data-layout={state.desktop ? "desktop" : "mobile"}
        hidden={!state.active || (state.desktop && state.collapsed)}
      >
        {state.desktop ? (
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>Practice options</Text>
            <ActionIcon
              className="options-toggle"
              ref={state.toggleRef}
              variant="subtle"
              title={label}
              aria-label={label}
              aria-expanded={!state.collapsed}
              aria-controls="practice-options-content"
              onClick={state.toggle}
            >
              <PanelIcon right />
            </ActionIcon>
          </Group>
        ) : (
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
            Practice options
          </Button>
        )}
        <div
          id="practice-options-content"
          ref={state.contentRef}
          className="practice-options-content"
          hidden={state.collapsed}
        >
          {state.views.map((view) => (
            <section key={view.id} hidden={view.id !== state.activeId}>
              {view.form}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
