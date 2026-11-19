import hymns from "./hymns.json";
import { hymnEndingBar } from "./hymn-lyrics";
import {
  hymnPreferences,
  optionalHymnNote,
  validHymnZoom,
  type HymnSettings,
} from "./hymn-settings";
import { hymnKeySuffix, type HymnKey } from "./hymn-transpose";
import type { CountInBars } from "./hymn-count-in";
import type { Arrangement, HymnHands } from "./hymn-arrangements";
import { bookmark, restoreBookmark, type Bookmark } from "./bookmarks";
export type HymnState = {
  version: 1;
  mode?: "wait" | "playback";
  bpm?: number;
  countIn?: CountInBars;
  loopCountIn?: boolean;
  key?: HymnKey;
  octave?: number;
  low?: number | null;
  high?: number | null;
  zoom?: number;
  zoomByLayout?: Partial<Record<"mobile" | "desktop", number>>;
  hymn: string;
  arrangement: Arrangement;
  hands?: HymnHands;
  viewHands?: HymnHands;
  reattackTies?: boolean;
  stanzas?: number[];
  stanza?: number;
  sectionBars: number;
  section: number;
  bookmarks: Record<string, Bookmark>;
  sections: Record<string, number>;
  preferences?: Record<string, ReturnType<typeof hymnPreferences>>;
};

/** Saved preferences and content-checked checkpoints, independent of rendering and transport. */
export class HymnProgress {
  private range: { low: number | null; high: number | null } = {
    low: null,
    high: null,
  };
  private zoomByLayout = { mobile: 1, desktop: 1 };
  readonly bookmarks: Record<string, Bookmark> = {};
  readonly preferences: Record<string, ReturnType<typeof hymnPreferences>> = {};
  readonly sections: Record<string, number> = {};
  constructor(saved: HymnState | undefined, hymnIds: readonly string[]) {
    // The current song's last range becomes the global range for older saves.
    this.range = {
      low: optionalHymnNote(saved?.low),
      high: optionalHymnNote(saved?.high),
    };
    const legacy = validHymnZoom(saved?.zoom) ? saved.zoom : 1;
    for (const layout of ["mobile", "desktop"] as const) {
      const value = saved?.zoomByLayout?.[layout];
      this.zoomByLayout[layout] = validHymnZoom(value) ? value : legacy;
    }
    if (saved?.version !== 1) return;
    for (const field of ["bookmarks", "sections"] as const)
      if (saved[field] && typeof saved[field] === "object")
        Object.assign(this[field], structuredClone(saved[field]));
    if (saved.preferences && typeof saved.preferences === "object")
      for (const id of hymnIds)
        if (saved.preferences[id])
          this.preferences[id] = hymnPreferences(id, saved.preferences[id]);
  }
  zoomFor(layout: "mobile" | "desktop") {
    return this.zoomByLayout[layout];
  }
  setZoom(zoom: number, layout: "mobile" | "desktop") {
    if (validHymnZoom(zoom)) this.zoomByLayout[layout] = zoom;
  }
  forHymn(id: string) {
    return {
      ...hymnPreferences(id, this.preferences[id]),
      ...this.range,
      zoom: this.zoomByLayout.desktop,
    };
  }
  remember(
    settings: HymnSettings,
    zoom: number,
    layout: "mobile" | "desktop" = "desktop",
  ) {
    this.setZoom(zoom, layout);
    this.range = {
      low: optionalHymnNote(settings.low),
      high: optionalHymnNote(settings.high),
    };
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
    layout: "mobile" | "desktop" = "desktop",
  ): HymnState {
    this.remember(settings, zoom, layout);
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
      zoomByLayout: { ...this.zoomByLayout },
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
  const hymn = hymns.find((h) => h.id === settings.hymn);
  const endingBar = hymn
    ? hymnEndingBar(
        hymn,
        settings.stanza === undefined
          ? settings.stanzas
          : settings.stanza
            ? [settings.stanza]
            : [],
      )
    : undefined;
  const hand =
    settings.arrangement === "melody" ||
    settings.hands === "both" ||
    !settings.hands
      ? ""
      : `:hands=${settings.hands}`;
  return `${settings.hymn}:${settings.arrangement}:${settings.sectionBars}${section ? `:${settings.section}` : ""}${hymnKeySuffix(originalKey, settings.key || "original")}${settings.octave ? `:octave=${settings.octave}` : ""}${hand}${settings.stanza && settings.stanza > 1 ? `:stanza=${settings.stanza}` : ""}${endingBar ? `:ending=${endingBar}` : ""}${settings.reattackTies ? ":reattack-ties" : ""}`;
}
