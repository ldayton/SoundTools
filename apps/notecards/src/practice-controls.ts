/** A single home for exercise configuration, separate from answering and playback. */
export function mountPracticeOptions(
  element: HTMLElement,
  controls: HTMLElement[],
  help: string,
) {
  const details = document.createElement("details");
  details.className = "practice-options disclosure";
  details.innerHTML =
    '<summary>Practice options</summary><div class="practice-options-content"></div>';
  const content = details.querySelector<HTMLElement>(
    ".practice-options-content",
  )!;
  for (const control of controls) content.append(control);
  const note = document.createElement("p");
  note.className = "options-help";
  note.textContent = help;
  content.append(note);
  element.prepend(details);
  element
    .querySelectorAll("details:not(.practice-options)")
    .forEach((e) => e.classList.add("disclosure"));
}
