/** Holding Enter/Space on a focused button must not submit several answers. */
export function preventRepeatedButtonActivation(event: KeyboardEvent) {
  if (
    event.repeat &&
    ["Enter", " "].includes(event.key) &&
    (event.target as HTMLElement | null)?.closest("button")
  ) {
    event.preventDefault();
    return true;
  }
  return false;
}
