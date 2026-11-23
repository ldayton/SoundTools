# Song identity

Every catalog entry has a permanent UUID in `id`. Assign it once when adding the
song, and keep it when changing the title, URL, source file, or arrangements.
Favorites, preferences, checkpoints, account records and edition lookup use this ID.

`slug` is the readable public URL segment. `legacyIds` retains former slugs and
retired IDs, including the current pre-UUID ID. When renaming a slug, keep the
previous slug in that list so saved references and shared links still resolve.
Never reuse an alias for a different song. The importer rejects invalid UUIDs,
duplicate identities, conflicting references and duplicate edition ownership.

Reviewed arrangements use a stable `editionKey` to bind their code and owning
tests to a catalog UUID. This key is independent of the public slug. Source ABC
filenames are also explicit catalog fields, independent of the UUID.

`hymn-identity.ts` resolves incoming UUIDs, slugs and historical aliases. Routes
resolve to UUIDs internally and publish the current slug. The state migration
first preserves the earlier In Christ Alone consolidation, then converts all
song references, including checkpoint key prefixes, to UUIDs. Existing UUID data
wins over stale aliases; checkpoint content remains subject to the existing
content checks. Catalogue revision 2 is retained in both local and account saves
so earlier verse migrations run only once. Unknown references stay available for
normal validation and recovery rather than receiving invented identities.
