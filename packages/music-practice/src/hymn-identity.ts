const retired = "in-christ-alone-2",
  canonical = "in-christ-alone";
export function canonicalHymnId(id: string) {
  return id === retired ? canonical : id;
}
/** Promote the teacher score's saved choices; old score checkpoints remain content-checked. */
export function migrateHymnIdentity<T>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const state = structuredClone(input) as Record<string, any>;
  const first = state.catalogueRevision !== 1;
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
  state.catalogueRevision = 1;
  return state as T;
}
