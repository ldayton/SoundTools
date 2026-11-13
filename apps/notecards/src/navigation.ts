import { AREAS, EXERCISES, exercise, type Mode } from "./exercises";
export { AREAS, EXERCISES, exercise } from "./exercises";

export type PracticeRoute = {
  kind: "exercise";
  mode: Mode;
  hymn?: string;
  query: URLSearchParams;
};
export type AppRoute =
  PracticeRoute | { kind: "settings" } | { kind: "not-found" };
export function readRoute(url: URL, fallback: Mode): AppRoute {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/" || path === "/index.html")
    return { kind: "exercise", mode: fallback, query: url.searchParams };
  if (path === "/settings") return { kind: "settings" };
  const item = EXERCISES.find((e) => e.path === path);
  if (item)
    return { kind: "exercise", mode: item.mode, query: url.searchParams };
  const hymnBase = exercise("sight").path + "/";
  const hymn = path.startsWith(hymnBase) ? path.slice(hymnBase.length) : "";
  return /^[a-z0-9-]+$/.test(hymn)
    ? { kind: "exercise", mode: "sight", hymn, query: url.searchParams }
    : { kind: "not-found" };
}
export function icon(name: string) {
  const paths: Record<string, string> = {
    piano:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v8m8-8v8M9 13H7V5m10 8h-2V5M9 13v6m6-6v6"/>',
    guitar:
      '<path d="m13 9 6-6 2 2-6 6m-3-3c-2-1-4 0-4 2-4 0-6 4-3 7s7 1 7-3c2 0 3-2 2-4"/><circle cx="9" cy="13" r="1.5"/>',
    rhythm:
      '<path d="M9 18V5l10-2v13M9 8l10-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/>',
    settings:
      '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/>',
    theory: '<path d="M4 7h16M4 12h16M4 17h16M10 3 8 21m8-18-2 18"/>',
    panelLeft:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-11-3 3 3 3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.theory}</svg>`;
}
