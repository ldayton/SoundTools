function available(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    !!element.getClientRects().length &&
    !element.closest("[inert]") &&
    !element.matches(":disabled") &&
    getComputedStyle(element).visibility === "visible"
  );
}

/** Restore focus after closing UI, without overwriting a newer focus choice.
 * Pass the closing surface (or the original focused element for a queued route
 * change). An unavailable trigger can fall back to the next supplied target. */
export function restoreFocus(
  targets: HTMLElement | null | readonly (HTMLElement | null)[],
  from: Element | null,
): boolean {
  const active = document.activeElement;
  if (
    active !== document.body &&
    active !== document.documentElement &&
    available(active) &&
    !from?.contains(active)
  )
    return false;
  const target = (Array.isArray(targets) ? targets : [targets]).find(available);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}
