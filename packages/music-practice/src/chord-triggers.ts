/** Shared accessible chord hit targets for guitar and piano diagrams. */
export function attachChordTriggers<
  T extends { name: string; element: SVGGraphicsElement },
>(
  paper: HTMLElement,
  passages: readonly T[],
  className: string,
  show: (passage: T, trigger: SVGElement) => void,
) {
  for (const passage of passages) {
    const { name, element: text } = passage;
    if (!paper.contains(text) || text.closest(`.${className}`)) continue;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add(className);
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `Show ${name} chord diagram`);
    group.setAttribute("aria-haspopup", "dialog");
    const bounds = text.getBBox(),
      target = document.createElementNS(group.namespaceURI, "rect");
    target.setAttribute("x", String(bounds.x - 8));
    target.setAttribute("y", String(bounds.y - 8));
    target.setAttribute("width", String(Math.max(32, bounds.width + 16)));
    target.setAttribute("height", String(Math.max(32, bounds.height + 16)));
    target.setAttribute("fill", "transparent");
    target.setAttribute("stroke", "none");
    if (text.hasAttribute("transform"))
      target.setAttribute("transform", text.getAttribute("transform")!);
    text.parentNode!.insertBefore(group, text);
    group.append(target, text);
    const open = () => {
      show(passage, group);
    };
    for (const event of ["pointerdown", "mousedown", "touchstart", "dblclick"])
      group.addEventListener(event, (event) => event.stopPropagation());
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      open();
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        open();
      }
    });
  }
}
