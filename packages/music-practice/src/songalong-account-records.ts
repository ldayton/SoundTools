import type { Records, Json } from "@ldayton/account";
import { checkSchema } from "@ldayton/account/model";
import { migrateLegacy, decodeState, type DurableState } from "./durable-state";
import type { HymnState } from "./hymn-progress";
/** Only app data, never diagnostic consent, MIDI identity or legacy recovery blobs. */
export function songalongRecords(state: DurableState): Records {
  const records: Records = { schema: 1 };
  const sight = state.activities.sight as HymnState | undefined;
  if (sight) {
    for (const [key, value] of Object.entries(sight)) {
      if (["bookmarks", "preferences", "sections"].includes(key)) {
        for (const [id, setting] of Object.entries(value || {})) {
          if (key === "preferences") {
            const pitch = ["key", "octave"];
            const settings = setting as Record<string, Json>;
            records[`hymn:${id}:pitch`] = Object.fromEntries(
              pitch
                .filter((k) => settings[k] !== undefined)
                .map((k) => [k, settings[k]]),
            );
            for (const [field, v] of Object.entries(settings))
              if (![...pitch, "low", "high", "mode"].includes(field))
                records[`hymn:${id}:${field}`] = v;
          } else records[`${key}:${id}`] = setting as Json;
        }
      } else if (
        ["hymn", "mode", "zoom", "zoomByLayout", "low", "high"].includes(key) &&
        value !== undefined
      )
        records[`current:${key}`] = value as Json;
    }
  }
  for (const id of ["audio", "presentation"]) {
    if (state.activities[id])
      records[`activity:${id}`] = state.activities[id] as Json;
  }
  return records;
}
export function restoreSongalongRecords(records: Records): DurableState {
  checkSchema(records);
  const state = migrateLegacy({});
  const sight: Record<string, any> = {
    version: 1,
    bookmarks: {},
    preferences: {},
    sections: {},
  };
  for (const [key, value] of Object.entries(records)) {
    if (value === null && !["current:low", "current:high"].includes(key))
      continue;
    if (key.startsWith("current:")) sight[key.slice(8)] = value;
    else if (key.startsWith("hymn:")) {
      const [, id, field] = key.split(":");
      const preference = (sight.preferences[id] ??= {});
      if (field === "pitch") Object.assign(preference, value);
      else preference[field] = value;
    } else if (key.startsWith("bookmarks:"))
      sight.bookmarks[key.slice(10)] = value;
    else if (key.startsWith("sections:")) sight.sections[key.slice(9)] = value;
    else if (["activity:audio", "activity:presentation"].includes(key))
      state.activities[key.slice(9)] = value;
  }
  if (typeof sight.hymn === "string")
    state.activities.sight = {
      ...sight,
      ...sight.preferences[sight.hymn],
      hymn: sight.hymn,
      mode: sight.mode,
      zoom: sight.zoom,
      // Older records stored the range inside each song's pitch record.
      low:
        sight.low !== undefined
          ? sight.low
          : sight.preferences[sight.hymn]?.low,
      high:
        sight.high !== undefined
          ? sight.high
          : sight.preferences[sight.hymn]?.high,
    };
  return decodeState(state);
}
