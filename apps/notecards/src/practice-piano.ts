import { persistence } from "./persistence";
let visible = true;
const panels = new Set<() => void>();

/** One keyboard visibility preference and control across piano exercises. */
export function restorePianoVisibility() {
  const saved = persistence.read<{ version: 1; pianoVisible?: boolean }>(
    "presentation",
  );
  visible = saved?.pianoVisible !== false;
  for (const render of panels) render();
}
export function isPianoVisible() {
  return visible;
}

export function mountPracticePiano(
  keyboard: HTMLElement,
  transport: HTMLElement,
  options: { buttonClass?: string; changed?: () => void } = {},
) {
  const panel = document.createElement("div");
  panel.className = "practice-piano";
  panel.id = `${keyboard.className.split(" ")[0] || keyboard.id}-panel`;
  panel.append(keyboard);
  transport.after(panel);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `piano-toggle ${options.buttonClass || ""}`.trim();
  button.setAttribute("aria-label", "On-screen piano");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v8m8-8v8M8 13v6m8-6v6"/></svg><span>Piano</span>';
  button.setAttribute("aria-controls", panel.id);
  transport.append(button);
  let available = true;
  function render() {
    panel.hidden = !available || !visible;
    button.hidden = !available;
    button.setAttribute("aria-expanded", String(visible));
    button.title = `${visible ? "Hide" : "Show"} on-screen piano`;
    options.changed?.();
  }
  panels.add(render);
  button.onclick = () => {
    visible = !visible;
    for (const update of panels) update();
    persistence.write("presentation", {
      ...persistence.read<object>("presentation"),
      version: 1,
      pianoVisible: visible,
    });
  };
  render();
  return {
    setAvailable(value: boolean) {
      available = value;
      render();
    },
  };
}
