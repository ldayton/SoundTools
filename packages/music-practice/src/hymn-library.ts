import { searchHymns } from "./sight-reading-model";

const titles = new Intl.Collator("en", {
  sensitivity: "base",
  ignorePunctuation: true,
  numeric: true,
});

/** Favorites and ordinary songs each retain alphabetical order, including search results. */
export function hymnLibrary<
  T extends { id: string; title: string; aliases?: string[] },
>(
  songs: readonly T[],
  query: string,
  favorites: Readonly<Record<string, boolean>>,
): T[] {
  return searchHymns(songs, query).sort(
    (a, b) =>
      Number(favorites[b.id] === true) - Number(favorites[a.id] === true) ||
      titles.compare(a.title, b.title) ||
      a.id.localeCompare(b.id),
  );
}
