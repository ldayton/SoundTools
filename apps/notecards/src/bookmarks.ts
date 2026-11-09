/** Content identity includes arrangement/section and matching semantics, not layout width. */
export type Bookmark = {
  version: 1;
  content: string;
  position: number;
  paused: boolean;
  length: number;
};
export function bookmark(
  content: string,
  position: number,
  paused: boolean,
  length: number,
): Bookmark {
  return { version: 1, content, position, paused, length };
}
export function restoreBookmark(raw: unknown, content: string, length: number) {
  const b = raw as Bookmark;
  return b?.version === 1 &&
    b.content === content &&
    b.length === length &&
    Number.isSafeInteger(b.position) &&
    b.position >= 0 &&
    b.position <= length &&
    typeof b.paused === "boolean"
    ? { position: b.position, paused: b.paused }
    : { position: 0, paused: false };
}
