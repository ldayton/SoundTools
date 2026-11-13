import type { ReactNode } from "react";
const mobile = window.matchMedia("(max-width: 1119px)");
let mobileCollapsed = true;
let desktopCollapsed = false;
const panels = new Set<HTMLElement>();
const forms = new WeakMap<HTMLElement, ReactNode>();
let revision = 0;
const chromeListeners = new Set<() => void>();
export const practiceOptionsChrome = {
  getSnapshot: () => revision,
  subscribe(listener: () => void) {
    chromeListeners.add(listener);
    return () => {
      chromeListeners.delete(listener);
    };
  },
  getPanels: () => [...panels],
  getForm: (panel: HTMLElement) => forms.get(panel),
  isMobile: () => mobile.matches,
  isCollapsed: () => (mobile.matches ? mobileCollapsed : desktopCollapsed),
};
function notifyChrome() {
  revision++;
  chromeListeners.forEach((listener) => listener());
}
export function togglePracticeOptions() {
  if (mobile.matches) mobileCollapsed = !mobileCollapsed;
  else desktopCollapsed = !desktopCollapsed;
  render();
  if (!mobile.matches && desktopCollapsed)
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>("#practice-options-reopen")
        ?.focus({ preventScroll: true }),
    );
}

let reopen = { visible: false, controls: undefined as string | undefined };
const listeners = new Set<() => void>();
export const practiceOptionsState = {
  getSnapshot: () => reopen,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export function refreshPracticeOptions() {
  const current = [...panels].find((panel) => !panel.closest("[hidden]"));
  const next = {
    visible: !mobile.matches && !!current && desktopCollapsed,
    controls: current?.querySelector(".practice-options-content")?.id,
  };
  if (next.visible === reopen.visible && next.controls === reopen.controls)
    return;
  reopen = next;
  listeners.forEach((listener) => listener());
}
export function reopenPracticeOptions() {
  const current = [...panels].find((panel) => !panel.closest("[hidden]"));
  desktopCollapsed = false;
  render();
  current
    ?.querySelector<HTMLButtonElement>(".options-toggle")
    ?.focus({ preventScroll: true });
}
function render() {
  const collapsed = mobile.matches ? mobileCollapsed : desktopCollapsed;
  for (const item of panels) {
    item.dataset.layout = mobile.matches ? "mobile" : "desktop";
    item.classList.toggle("is-collapsed", collapsed);
    item.querySelector<HTMLElement>(".practice-options-content")!.hidden =
      collapsed;
  }
  refreshPracticeOptions();
  notifyChrome();
}

mobile.addEventListener("change", render);

/** Persistent exercise sidebar; collapsing keeps its toggle docked beside the exercise. */
export function mountPracticeOptions(
  element: HTMLElement,
  controls: HTMLElement[],
  form?: ReactNode,
) {
  const panel = document.createElement("aside");
  panel.className = "practice-options";
  panel.setAttribute("aria-label", "Practice options");
  const contentId = `${element.id || "flashcard"}-options-content`;
  panel.innerHTML = `<div class="options-header soundtools-ui"></div><div id="${contentId}" class="practice-options-content"></div>`;
  const content = panel.querySelector<HTMLElement>(
    ".practice-options-content",
  )!;
  for (const control of controls) content.append(control);
  if (form) forms.set(panel, form);
  panels.add(panel);
  element.prepend(panel);
  render();
  element
    .querySelectorAll("details")
    .forEach((e) => e.classList.add("disclosure"));
}
