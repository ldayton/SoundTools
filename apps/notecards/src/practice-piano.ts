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
  button.textContent = "On-screen piano";
  button.setAttribute("aria-controls", panel.id);
  transport.append(button);
  let available = true;
  function render() {
    panel.hidden = !available || !visible;
    button.hidden = !available;
    button.setAttribute("aria-expanded", String(visible));
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
