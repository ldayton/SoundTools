import { hymnPreferences, type HymnSettings } from "./hymn-settings";
import { hymnKeySuffix, type HymnKey } from "./hymn-transpose";
import type { CountInBars } from "./hymn-count-in";
import type { Arrangement, HymnHands } from "./hymn-arrangements";
import { bookmark, restoreBookmark, type Bookmark } from "./bookmarks";
export type HymnState = {
  version: 1;
  mode?: "wait" | "playback";
  bpm?: number;
  countIn?: CountInBars;
  key?: HymnKey;
  low?: number | null;
  high?: number | null;
  zoom?: number;
  hymn: string;
  arrangement: Arrangement;
  hands?: HymnHands;
  viewHands?: HymnHands;
  reattackTies?: boolean;
  sectionBars: number;
  section: number;
  bookmarks: Record<string, Bookmark>;
  sections: Record<string, number>;
  preferences?: Record<string, ReturnType<typeof hymnPreferences>>;
};

/** Saved preferences and content-checked checkpoints, independent of rendering and transport. */
export class HymnProgress {
  readonly bookmarks: Record<string, Bookmark> = {};
  readonly preferences: Record<string, ReturnType<typeof hymnPreferences>> = {};
  readonly sections: Record<string, number> = {};
  constructor(saved: HymnState | undefined, hymnIds: readonly string[]) {
    if (saved?.version !== 1) return;
    for (const field of ["bookmarks", "sections"] as const)
      if (saved[field] && typeof saved[field] === "object")
        Object.assign(this[field], structuredClone(saved[field]));
    if (saved.preferences && typeof saved.preferences === "object")
      for (const id of hymnIds)
        if (saved.preferences[id])
          this.preferences[id] = hymnPreferences(id, saved.preferences[id]);
  }
  forHymn(id: string) {
    return hymnPreferences(id, this.preferences[id]);
  }
  remember(settings: HymnSettings, zoom: number) {
    this.preferences[settings.hymn] = { ...settings, zoom };
  }
  restore(
    settings: HymnSettings,
    originalKey: string,
    content: string,
    length: number,
  ) {
    return restoreBookmark(
      this.bookmarks[hymnProgressKey(settings, originalKey)],
      content,
      length,
    );
  }
  snapshot(
    settings: HymnSettings,
    originalKey: string,
    zoom: number,
    checkpoint?: { content: string; paused: boolean; length: number },
  ): HymnState {
    this.remember(settings, zoom);
    if (checkpoint)
      this.bookmarks[hymnProgressKey(settings, originalKey)] = bookmark(
        checkpoint.content,
        settings.position,
        checkpoint.paused,
        checkpoint.length,
      );
    this.sections[hymnProgressKey(settings, originalKey, false)] =
      settings.section;
    return {
      ...settings,
      version: 1,
      zoom,
      bookmarks: this.bookmarks,
      sections: this.sections,
      preferences: this.preferences,
    };
  }
}

/** Layout and visible hands do not change a matching checkpoint's identity. */
export function hymnProgressKey(
  settings: HymnSettings,
  originalKey: string,
  section = true,
) {
  const hand =
    settings.arrangement === "melody" ||
    settings.hands === "both" ||
    !settings.hands
      ? ""
      : `:hands=${settings.hands}`;
  return `${settings.hymn}:${settings.arrangement}:${settings.sectionBars}${section ? `:${settings.section}` : ""}${hymnKeySuffix(originalKey, settings.key || "original")}${hand}${settings.reattackTies ? ":reattack-ties" : ""}`;
}
