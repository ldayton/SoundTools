# Tagalujah

A service reader using the SoundTools application shell, practice workspace,
number controls, settings, privacy and offline lifecycle. Run `npm run dev
--workspace=tagaluya` (port 4330), or `npm run build --workspace=tagaluya`.

The initial hardcoded service is November 28, 2026. `src/services.ts` keeps the
provided song order, sections and repetitions. English originals display once;
Tagalog originals have a phrase-aligned English reading translation. The welcome
song includes both verses and the chorus from the supplied lyric image. Jesus, You Are Glorious uses the supplied Robert Gay lyrics.
The Andy Evans PDF is a different song and is excluded. Copied recommendation
links and advertisements are excluded.

No supplied source contains verified staff notation. The toolbar offers the shared
minus/plus text-size field directly on desktop and mobile, without a Text/Score
selector or a size popover. Saved melody preferences remain readable when every
phrase has real ABC underlay; no tunes are invented. The browser capability fixture
exercises that compatibility with a shared generic hymn.
`BilingualMelody` delegates engraving to the existing shared score layout and
shows the opening clef once. Translation remains readable text under each phrase.

Services use the left navigation; songs use the shared table-of-contents drawer.
Each song shows its service role between the service/date and song title. The
contents trigger uses the shared list icon in a 56×44 px target, matching the
text-size control height.
Horizontal swipes move to adjacent songs without wrapping, while vertical
scrolling remains native. Preferences are versioned local storage; service/song
URLs and offline routes use `/services/:service/:song`.

Mobile song paging uses `packages/ui/swipe-pager`: native horizontal scroll
snapping with independently scrolling song pages, fixed toolbar geometry, and
inactive pages excluded from focus and the accessibility tree. Desktop keeps
the standard document layout. The shared UI styles honor reduced motion for
transitions and animations across apps. The existing CI reader browser witness
owns native Chromium dragging/reversal, vertical scrolling, boundaries, resize
alignment and reduced motion; WebKit also checks snapping and layout.
The shell offline controller lives in `packages/browser-controls`, also used
by the existing practice apps. The Vercel project is `tagalujah`, using the standard staged release flow.
Production is https://tagalujah.lilydayton.me. The `tagalujah` project in Sentry
uses the shared opt-in diagnostics adapter and production-only source-map uploads.

The song-ending ornament is GDJ's **Flourish Divider**
(Openclipart ID 308072), released under CC0 1.0 / public domain.
Source: https://openclipart.org/detail/308072/flourish-divider
License: https://creativecommons.org/publicdomain/zero/1.0/
The local SVG preserves the artwork paths, with editor metadata removed.

Home Screen installation uses the same manifest convention as the other apps:
root `id`, `start_url` and `scope`, with `display: standalone`. The root scope
includes all service/song and settings URLs, including history updates during
paging. Install icons are produced by `node scripts/generate-branding.cjs tagaluya`.
The CI reader witness checks the manifest, PNG dimensions and same-document
paging; the offline witness retains the install metadata on deep song routes.
Existing Home Screen installations created before the manifest was provided
should be removed and added again to ensure they adopt the explicit settings.
