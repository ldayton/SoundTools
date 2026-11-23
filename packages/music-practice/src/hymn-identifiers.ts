export type HymnIdentity = {
  id: string;
  slug: string;
  legacyIds?: readonly string[];
  editionKey?: string;
};

/** IDs are assigned once in the catalogue; imports must never regenerate them. */
export function createHymnIdentityIndex<T extends HymnIdentity>(songs: readonly T[]) {
  const references = new Map<string, T>();
  const ids = new Set<string>();
  const editions = new Map<string, T>();
  for (const song of songs) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(song.id))
      throw Error(`Invalid song UUID: ${song.id}`);
    if (ids.has(song.id)) throw Error(`Duplicate song UUID: ${song.id}`);
    ids.add(song.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(song.slug))
      throw Error(`Invalid song slug: ${song.slug}`);
    for (const reference of [song.id, song.slug, ...(song.legacyIds || [])]) {
      if (references.has(reference) && references.get(reference) !== song)
        throw Error(`Conflicting song reference: ${reference}`);
      references.set(reference, song);
    }
    if (song.editionKey) {
      if (editions.has(song.editionKey)) throw Error(`Duplicate edition key: ${song.editionKey}`);
      editions.set(song.editionKey, song);
    }
  }
  return {
    id: (reference: string) => references.get(reference)?.id ?? reference,
    slug: (reference: string) => references.get(reference)?.slug ?? reference,
    edition: (key: string) => {
      const song = editions.get(key);
      if (!song) throw Error(`Missing catalogue edition: ${key}`);
      return song;
    },
  };
}
