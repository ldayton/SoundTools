import {canonicalHymnId, migrateHymnIdentity} from "./hymn-identity";
import type { Records, Json } from "@ldayton/account";
import { checkSchema } from "@ldayton/account/model";
import { migrateLegacy, decodeState, type DurableState } from "./durable-state";
import type { HymnState } from "./hymn-progress";
function flatten(prefix:string,value:Json,records:Records){
  if(value && typeof value === "object" && !Array.isArray(value))
    for(const [key,v] of Object.entries(value))flatten(`${prefix}:${key}`,v,records);
  else records[prefix]=value;
}
function put(target:Record<string,any>,path:string[],value:Json){
  const last=path.pop()!;for(const key of path)target=target[key] ??= {};target[last]=structuredClone(value);
}
/** Only app data, never diagnostic consent, MIDI identity or legacy recovery blobs. */
export function songalongRecords(state: DurableState): Records {
  const records: Records = { schema: 2 };
  const sight = migrateHymnIdentity(state.activities.sight as HymnState | undefined);
  if (sight) {
    for (const [key, value] of Object.entries(sight)) {
      if (["bookmarks", "preferences", "sections", "favorites"].includes(key)) {
        for (const [id, setting] of Object.entries(value || {})) {
          if (key === "preferences") {
            const pitch = ["key", "octave", "capo"];
            const settings = setting as Record<string, Json>;
            records[`hymn:${id}:pitch`] = Object.fromEntries(
              pitch
                .filter((k) => settings[k] !== undefined)
                .map((k) => [k, settings[k]]),
            );
            const staffChoices=settings.staffChoices || (typeof settings.arrangement === "string" && (settings.hiddenStaves || settings.mutedStaves) ? {[settings.arrangement]:{hiddenStaves:settings.hiddenStaves || [],mutedStaves:settings.mutedStaves || []}} : {});
            for(const [score,selection] of Object.entries(staffChoices as Record<string,Record<string,Json>>))
              for(const [field,value] of Object.entries(selection))records[`hymn:${id}:staffChoices:${score}:${field}`]=value;
            for (const [field, v] of Object.entries(settings))
              if (![...pitch, "low", "high", "mode", "staffChoices", "hiddenStaves", "mutedStaves"].includes(field))
                records[`hymn:${id}:${field}`] = v;
          } else records[`${key}:${id}`] = setting as Json;
        }
      } else if(key === "zoomByLayout"){
        for(const [layout,size] of Object.entries(value || {}))records[`current:zoomByLayout:${layout}`]=size as Json;
      } else if (
        ["catalogueRevision", "hymn", "mode", "zoom", "zoomByLayout", "low", "high"].includes(key) &&
        value !== undefined
      )
        records[`current:${key}`] = value as Json;
    }
  }
  for (const id of ["audio", "presentation"]) {
    if (state.activities[id])
      flatten(`activity:${id}`,state.activities[id] as Json,records);
  }
  return records;
}
export function restoreSongalongRecords(records: Records): DurableState {
  checkSchema(records,2);
  const state = migrateLegacy({});
  const sight: Record<string, any> = {
    version: 1,
    bookmarks: {},
    preferences: {},
    sections: {},
    favorites: {},
  };
  for (const [key, value] of Object.entries(records).sort(([a],[b])=>a.split(":").length-b.split(":").length)) {
    if (value === null && !["current:low", "current:high"].includes(key))
      continue;
    if(key.startsWith("current:zoomByLayout:"))put(sight,["zoomByLayout",key.split(":")[2]],value);
    else if (key.startsWith("current:")) sight[key.slice(8)] = value;
    else if (key.startsWith("hymn:")) {
      const [, id, field,...path] = key.split(":");
      const preference = (sight.preferences[id] ??= {});
      if(field === "staffChoices" && path.length)put(preference,[field,...path],value);
      else if (field === "pitch") Object.assign(preference, value);
      else preference[field] = value;
    } else if (key.startsWith("bookmarks:"))
      sight.bookmarks[key.slice(10)] = value;
    else if (key.startsWith("sections:")) sight.sections[key.slice(9)] = value;
    else if (key.startsWith("favorites:"))
      sight.favorites[key.slice(10)] = value;
    else if(key.startsWith("activity:audio:") || key.startsWith("activity:presentation:")){
      const [,activity,...path]=key.split(":");put((state.activities[activity] ??= {}) as Record<string,any>,path,value);
    } else if (["activity:audio", "activity:presentation"].includes(key))
      state.activities[key.slice(9)] = value;
  }
  for(const preference of Object.values(sight.preferences) as Record<string,any>[])
    if(preference.staffChoices?.[preference.arrangement])Object.assign(preference,preference.staffChoices[preference.arrangement]);
  const migrated = migrateHymnIdentity(sight);
  if (typeof migrated.hymn === "string")
    state.activities.sight = migrateHymnIdentity({
      ...migrated,
      ...migrated.preferences[migrated.hymn],
      hymn: migrated.hymn,
      mode: migrated.mode,
      zoom: migrated.zoom,
      // Older records stored the range inside each song's pitch record.
      low:
        migrated.low !== undefined
          ? migrated.low
          : migrated.preferences[migrated.hymn]?.low,
      high:
        migrated.high !== undefined
          ? migrated.high
          : migrated.preferences[migrated.hymn]?.high,
    });
  return decodeState(state);
}

/** Library favorites can update during playback without replacing the active score. */
export function songalongLiveKeys(keys: string[], current: string | undefined) {
  return keys.filter(
    (key) =>
      (key === "activity:audio" || key.startsWith("activity:audio:")) ||
      key.startsWith("favorites:") ||
      (["hymn:", "bookmarks:", "sections:"].some((prefix) =>
        key.startsWith(prefix),
      ) &&
        !["hymn:", "bookmarks:", "sections:"].some((prefix) =>
          key.startsWith(prefix) && canonicalHymnId(key.slice(prefix.length).split(":")[0]) === (current ? canonicalHymnId(current) : undefined),
        )),
  );
}
