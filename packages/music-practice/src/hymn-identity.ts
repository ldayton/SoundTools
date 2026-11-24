import catalogue from "../../../apps/songalong/hymns/catalogue.json";
import { createHymnIdentityIndex } from "./hymn-identifiers";
const identity = createHymnIdentityIndex(catalogue);
export const canonicalHymnId = identity.id;
export const hymnSlug = identity.slug;
export const hymnForEdition = identity.edition;
export const HYMN_CATALOGUE_REVISION = 4;

const retired = "in-christ-alone-2",
  canonical = "in-christ-alone";
/** Promote the teacher score's saved choices; old score checkpoints remain content-checked. */
export function migrateHymnIdentity<T>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const state = structuredClone(input) as Record<string, any>;
  const first = (state.catalogueRevision || 0) < 1;
  const teacher = state.preferences?.[retired];
  const verses = (settings: Record<string, any>) => {
    if (Array.isArray(settings.stanzas))
      settings.stanzas = settings.stanzas.map((verse: number) =>
        verse === 2 ? 3 : verse === 3 ? 4 : verse,
      );
    if (settings.stanza === 2) settings.stanza = 3;
    else if (settings.stanza === 3) settings.stanza = 4;
    settings.position = 0;
    settings.section = 0;
  };
  if (first && state.preferences?.[canonical])
    verses(state.preferences[canonical]);
  if (first && state.hymn === canonical) {
    verses(state);
    if (teacher)
      for (const [field, value] of Object.entries(teacher))
        if (!["mode", "low", "high", "zoom", "hymn"].includes(field))
          state[field] = value;
  }
  if (state.preferences) {
    if (teacher && (first || !state.preferences[canonical]))
      state.preferences[canonical] = { ...teacher, hymn: canonical };
    delete state.preferences[retired];
  }
  if (state.favorites && retired in state.favorites) {
    if (first || !(canonical in state.favorites))
      state.favorites[canonical] = state.favorites[retired];
    delete state.favorites[retired];
  }
  for (const field of ["bookmarks", "sections"])
    if (state[field]) {
      for (const key of Object.keys(state[field]))
        if (key.startsWith(retired + ":")) {
          const target = canonical + key.slice(retired.length);
          if (first || !(target in state[field]))
            state[field][target] = state[field][key];
          delete state[field][key];
        }
    }
  if (state.hymn === retired) state.hymn = canonical;
  if (typeof state.hymn === "string") state.hymn = canonicalHymnId(state.hymn);
  // Process legacy aliases first, UUID entries last, so canonical data wins
  // regardless of account record or object insertion order.
  for (const field of ["preferences", "favorites", "bookmarks", "sections"]) {
    const values = state[field];
    if (!values || typeof values !== "object") continue;
    const target: Record<string, any> = {};
    const keyFor = (key: string) => {
      const colon = ["bookmarks", "sections"].includes(field) ? key.indexOf(":") : -1;
      const reference = colon < 0 ? key : key.slice(0, colon);
      return canonicalHymnId(reference) + (colon < 0 ? "" : key.slice(colon));
    };
    const priority = (key: string) => {
      if (keyFor(key) === key) return 2;
      const reference = ["bookmarks", "sections"].includes(field) ? key.split(":")[0] : key;
      return hymnSlug(reference) === reference ? 1 : 0;
    };
    const entries = Object.entries(values).sort(([a], [b]) => priority(a) - priority(b));
    for (const [key, value] of entries) {
      const next = keyFor(key);
      target[next] = field === "preferences" && value && typeof value === "object"
        ? { ...value, hymn: canonicalHymnId(key) } : value;
    }
    state[field] = target;
  }
  if ((state.catalogueRevision || 0) < 3) {
    // These original scores gained an independent vocal staff before the two
    // existing piano staves. Preserve the intent of old Show/Play selections.
    const shifted = new Set(["blessed-assurance","silent-night","joy-to-the-world"].map(canonicalHymnId));
    const visited = new WeakSet<object>();
    const shift = (settings: Record<string, any>, id: string) => {
      if (!shifted.has(id) || settings.arrangement !== "original" || visited.has(settings)) return;
      visited.add(settings);
      for (const field of ["hiddenStaves", "mutedStaves"])
        if (Array.isArray(settings[field]))
          settings[field] = settings[field].filter((index:unknown)=>index === 0 || index === 1).map((index:number)=>index+1);
    };
    if (typeof state.hymn === "string") shift(state,state.hymn);
    for (const [id,settings] of Object.entries(state.preferences || {}))
      if (settings && typeof settings === "object") shift(settings as Record<string,any>,id);
  }
  { // Normalize retired scores even if an older account client edits a newer catalogue.
    const retire = (settings:Record<string,any>) => {
      if (!["melody","bass","chords","broken"].includes(settings.arrangement)) return;
      if (settings.arrangement === "melody") settings.hands = "right";
      settings.arrangement = "piano";
      settings.viewHands = "both";
      settings.position = 0;
    };
    retire(state);
    for (const settings of Object.values(state.preferences || {}))
      if (settings && typeof settings === "object") retire(settings as Record<string,any>);
    for (const field of ["bookmarks","sections"])
      for (const key of Object.keys(state[field] || {}))
        if (/:true:(?:melody|bass|chords|broken):|:(?:melody|bass|chords|broken):/.test(key)) delete state[field][key];
  }
  state.catalogueRevision = HYMN_CATALOGUE_REVISION;
  return state as T;
}
