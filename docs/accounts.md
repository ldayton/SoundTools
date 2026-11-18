# Accounts and cloud data

All four apps use `@ldayton/account` for email login, IndexedDB caching,
revision-checked synchronization and account status. `@ldayton/ui/account-menu`
provides their shared Mantine dialog and navigation item. App adapters select and validate only the data that belongs in the cloud.

## Ownership and privacy

- One Supabase project, one approved owner, separate records for each app.
- Public signup and anonymous login are disabled. Provision the owner through
  the Supabase admin API, then insert its UUID and email into
  `private.account_owners` using a privileged database connection.
- The login endpoint compares the email against server-only
  `ACCOUNT_APPROVED_EMAIL`. It never accepts a caller-supplied redirect URL.
- Authentication is also enforced by the database. RLS and every RPC require
  the approved user ID and email. Browser clients cannot write tables directly.
- Apps receive only the publishable key. SMTP and admin credentials stay out of
  browser bundles, source control, diagnostics and Vercel frontend variables.
- Diagnostics record coded outcomes, never email addresses, tokens or settings.
  Diagnostic consent, MIDI permissions/identity and downloaded file caches remain local.

## Email and hosting

Both alternatives appear in one email: a six-digit code and an app link.
They redeem the same one-time credential, expiring after 30 minutes. The link
carries the token hash in its fragment, which is stripped before routing and
telemetry; a confirmation button prevents passive link scanners consuming it.
DoReGo, NoteWise and SongAlong confirm email links on a standalone page before
starting practice. That page only saves the authentication session; it does not
open progress storage, acquire a practice writer lock or initialize cloud data.
An already-open same-origin app receives Supabase's authentication event. The
confirmation page tells the user to return to it; without an active practice
window it offers Continue. Normal duplicate-window protection remains intact.

Hosted email uses Amazon SES, `SoundTools <no-reply@lilydayton.me>` in us-east-1.
The domain has DKIM and a dedicated mail-return subdomain. Its default
`SoundToolsLogin` configuration set disables click/open tracking: authentication
links must not be rewritten. A dedicated SMTP IAM user/group permits
`ses:SendRawEmail` only from that sender, to the approved recipient, through
that domain and configuration set. No console password or other AWS access is granted.
Supabase uses a one-second resend interval and a 30-email hourly limit. The resend interval is per email address across the project, so a one-minute interval would prevent sequential sign-ins to different apps. The endpoint still accepts only the approved owner.

For each Vercel project configure:

| Variable | Location |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser, public project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser, public publishable key |
| `SUPABASE_URL` | Login function |
| `SUPABASE_PUBLISHABLE_KEY` | Login function; no admin key |
| `ACCOUNT_APPROVED_EMAIL` | Sensitive server variable |
| `ACCOUNT_APP_URL` | Exact origin for that app/environment |
| `ACCOUNT_ADDITIONAL_ORIGINS` | Optional comma-separated exact origins for existing bookmarks |

Allowlist each exact `/auth/confirm` URL in Supabase Auth and serve that path as
`index.html` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
Production uses `https://<app>.lilydayton.me` for dorego, notewise, songalong and soundglow.
The previous `*-soundtools.vercel.app` origins remain explicitly allowed. The
callback stays on the origin that requested the email; no request body controls
it. Supabase allows each exact callback on both domains. Configuring variables
does not deploy the implementation. Preview deployments need their own deliberate
configuration; never allow arbitrary preview origins for production auth.

Supabase free projects can pause after inactivity. Cached account data and queued
changes remain usable during outages; resume the project before expecting new
sign-ins or synchronization. Use a paid plan if guaranteed availability is needed.

## Sync behavior

The cloud is authoritative for signed-in data; IndexedDB holds a durable replica
and outbox for offline use. Guest data remains separate. First login atomically
imports the current guest state only if that app has no cloud data. Later devices
load cloud data; they cannot overwrite it by uploading their defaults.

Adapters split independent settings into records. Related pitch choices are one
record; checkpoints include content identity, key, hands and other matching
semantics. Writes carry the expected revision and an operation UUID. The server
serializes initialization/writes per owner and app, and retries are idempotent.
JSON equality ignores object-key ordering because Postgres JSONB reorders keys.

Independent edits merge. Conflicting edits to one record are preserved for the
user to choose in Account. A reset can legitimately move progress backwards.
Each local edit is saved immediately to the outbox; uploads are debounced. Active
pages check every 15 seconds and on focus, visibility and reconnection. Tabs share
an atomic IndexedDB queue and broadcast invalidations without network ping-pong.

Remote changes apply while idle. During practice they wait behind **Apply cloud
changes**, avoiding interruption or silent checkpoint resets. Reloads use cached
account data before a network check. App updates flush the outbox before reload.
Signing out restores guest data and refuses while unsynced edits remain.
Unavailable device storage is reported explicitly; keep the page open to recover
an unsaved in-memory draft. Account schema versions prevent older clients
rewriting data they do not understand.

## App data

- **NoteWise:** exercise settings, per-exercise checkpoints and lifetime practice totals. Attempts/correct answers use bounded, cumulative contributions per card and replica, so practising the same card offline on two devices adds both sets of attempts. The latest review supplies scheduling metadata. Divergent round checkpoints remain explicit conflicts; lifetime totals are independent of the choice.
- **Soundglow:** spectrogram/pitch settings, custom presets, playback volume/speed and bookmarks. Related values within each feature stay atomic to retain valid ranges/preset identity. Microphone selection, permissions, diagnostic consent, live microphone audio, analysis buffers, waveform peaks and file-library playback positions remain on the device. Imported audio files use the separate private file catalogue described below. Guest bookmarks/settings remain separate from the signed-in replica.

## Private file library

Signed-in Soundglow desktops automatically upload imported audio originals to the private `soundtools-files` Supabase Storage bucket. Signed-out imports remain local until login. Other devices fetch the catalogue, not all audio; opening a file or bookmark downloads and verifies its bytes, then caches it for offline use. A bookmark stores the content fingerprint, selection, view and playback/analysis settings. Matching content reconnects it even when local identifiers or names differ. No microphone recording is automatically uploaded. Mobile does not expose the desktop file library.

The shared `@ldayton/account/files` coordinator reuses the existing Supabase session and refreshes credentials for each native TUS request. Original bytes stay in Soundglow's chunked IndexedDB store; a separate shared IndexedDB database holds transfer intentions, TUS checkpoints and the catalogue. Uploads use the direct Storage endpoint and 6 MiB chunks. Interrupted uploads resume after reopening the app, including after a reload. Browser closure does not continue an upload in the background. Downloads retry on reopening, obtain a fresh short-lived URL, and verify size and fingerprint before being committed. Interrupted downloads restart; partial downloads are not retained. Signed URLs and tokens are not written into settings or diagnostics.

The free-tier cap is 50 MiB per original. Larger recordings still import and play locally with a visible local-only status. Storage exhaustion and connection failures leave the original intact and offer retry. A device's cached downloads can be evicted by its browser; cloud originals can be downloaded again. Do not treat an unfinished upload as a backup.

`public.media_files` records an immutable owner/app/id object path and pending/ready/deleted lifecycle. RLS and owner-checked RPCs limit access to the approved account. Clients cannot forge a ready state or overwrite audio. A snapshot repairs uploads that completed before their catalogue acknowledgement. Deletion first leaves a tombstone, fencing stale uploads, then removes bytes through the Storage API; snapshots retry outstanding physical deletions. Completed tombstones remain small metadata records so stale devices cannot restore a deleted original. Renaming changes metadata across devices. **Remove download** removes only that device's cached copy; **Delete everywhere** removes the cloud original and bound caches as devices reconnect. It never deletes the OS file originally imported. Shared bookmarks may retain their reference after a file is deleted and reconnect if the same recording is explicitly imported again.

Soundglow fingerprints fixed 1 MiB chunks and hashes their digests with the file size. This versioned content identity uses bounded memory. Existing imports receive fingerprints before upload; downloads must match them exactly. Owned cached files are hidden and active playback is stopped immediately on logout, including when the separate sync queue is unavailable. Queue failures leave existing local originals playable and show sync as unavailable. An import keeps the identity that started it even if it completes after logout. Uploads recheck authorization after credential refresh, and cancellation prevents late callbacks from restarting them. Removing a downloaded copy fences pending cache commits across tabs. The last selected owned file restores paused after account recovery. Guest imports remain separate.

The schema and policies live in `supabase/migrations/202611180003_native_files.sql`. Deploy this migration before shipping the new client. Keep the hosted bucket private and its 50 MiB limit; do not add update/upsert or public-read policies. No Vercel upload proxy or server secret is needed in the browser.

## Local tests

Install Supabase CLI 3.2.0. A native runtime works on macOS without Docker:

```sh
supabase start --runtime native --exclude functions,studio,analytics,pooler,realtime --eager
supabase db push
node scripts/setup-account-local.mjs
npm run test:accounts
```

The setup creates only `owner@soundtools.test` in the local stack and captures
emails in Mailpit. Generated keys/configuration go under ignored `work/`; never
use the local bootstrap against a hosted project. Browser tests reset only the
local records for all four apps. They use the iPhone 14 Pro and 13-inch MacBook
Air profiles and mute browser audio. Run each browser sequentially because they
share disposable local account data:

```sh
TEST_BROWSER=firefox npm run test:accounts
TEST_BROWSER=webkit npm run test:accounts
```

The account CI job uses an isolated Docker stack and these same tests. Shared
unit tests cover conflict resolution, lost acknowledgements, concurrent edits,
JSONB ordering and account isolation. App tests cover codec round trips, related
settings and content-checked checkpoints. Browser tests exercise real emailed
codes/links, denied addresses, two-device MIDI progress, offline edits, cached
startup, reloads and guest separation.

For a new app, provide `AccountBinding.read`, `apply`, `validate`, `pause` and
`canApply`; route its persistence through `changed()` and flush it before updates.
Keep versioned codecs separate from rendering. Use an app-specific account ID
and the existing provider/menu, endpoint and database protocol.

The account suite also exercises the native Storage policies and two isolated browser sessions, including cloud bookmark downloads, cached offline playback, cross-device rename/delete, guest isolation, size limits, and TUS resumption from a confirmed chunk after reload. `node scripts/dev-file-storage.mjs` starts a Soundglow-only local preview on port 4394 after local account setup. All fixture reset scripts reject hosted API URLs.
