const mobile = window.matchMedia("(max-width: 760px)");
let mobileCollapsed = true;
let desktopCollapsed = false;
const panels = new Set<HTMLElement>();
const panelIcon = `<svg class="options-panel-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m-6-11 3 3-3 3"/></svg>`;

function render() {
  const collapsed = mobile.matches ? mobileCollapsed : desktopCollapsed;
  for (const item of panels) {
    item.dataset.layout = mobile.matches ? "mobile" : "desktop";
    item.classList.toggle("is-collapsed", collapsed);
    const button = item.querySelector<HTMLButtonElement>(".options-toggle")!;
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute(
      "aria-label",
      `${collapsed ? "Expand" : "Collapse"} practice options`,
    );
    button.title = `${collapsed ? "Expand" : "Collapse"} practice options`;
    item.querySelector<HTMLElement>(".practice-options-content")!.hidden =
      collapsed;
  }
}

mobile.addEventListener("change", render);

/** Persistent exercise sidebar; collapsing keeps its toggle docked beside the exercise. */
export function mountPracticeOptions(
  element: HTMLElement,
  controls: HTMLElement[],
) {
  const panel = document.createElement("aside");
  panel.className = "practice-options";
  panel.setAttribute("aria-label", "Practice options");
  const contentId = `${element.id || "flashcard"}-options-content`;
  panel.innerHTML = `<div class="options-header"><h2>Practice options</h2><button class="options-toggle" type="button" aria-controls="${contentId}">${panelIcon}<span class="options-toggle-label">Practice options</span><svg class="options-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div><div id="${contentId}" class="practice-options-content"></div>`;
  const content = panel.querySelector<HTMLElement>(
    ".practice-options-content",
  )!;
  for (const control of controls) content.append(control);
  panels.add(panel);
  panel.querySelector<HTMLButtonElement>(".options-toggle")!.onclick = () => {
    if (mobile.matches) mobileCollapsed = !mobileCollapsed;
    else desktopCollapsed = !desktopCollapsed;
    render();
  };
  render();
  element.prepend(panel);
  element
    .querySelectorAll("details")
    .forEach((e) => e.classList.add("disclosure"));
}
