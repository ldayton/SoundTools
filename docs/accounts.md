# Accounts and cloud data

DoReGo and SongAlong use `@ldayton/account` for email login, IndexedDB caching,
revision-checked synchronization and account status. `@ldayton/ui/account-menu`
provides their shared Mantine dialog and navigation item. NoteWise and Soundglow
can adopt the same mechanism by supplying an app adapter; their data is not yet synced.

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
  Diagnostic consent, MIDI permissions/identity and downloaded files remain local.

## Email and hosting

Both alternatives appear in one email: a six-digit code and an app link.
They redeem the same one-time credential, expiring after 30 minutes. The link
carries the token hash in its fragment, which is stripped before routing and
telemetry; a confirmation button prevents passive link scanners consuming it.

Hosted email uses Amazon SES, `SoundTools <no-reply@lilydayton.me>` in us-east-1.
The domain has DKIM and a dedicated mail-return subdomain. Its default
`SoundToolsLogin` configuration set disables click/open tracking: authentication
links must not be rewritten. A dedicated SMTP IAM user/group permits
`ses:SendRawEmail` only from that sender, to the approved recipient, through
that domain and configuration set. No console password or other AWS access is granted.
Supabase has a 60-second resend interval and a ten-email hourly limit.

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
Production uses `https://dorego.lilydayton.me` and `https://songalong.lilydayton.me`.
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

## Local tests

Install Supabase CLI 3.2.0. A native runtime works on macOS without Docker:

```sh
supabase start --runtime native --exclude storage,functions,studio,analytics,pooler,realtime --eager
supabase db push
node scripts/setup-account-local.mjs
npm run test:accounts
```

The setup creates only `owner@soundtools.test` in the local stack and captures
emails in Mailpit. Generated keys/configuration go under ignored `work/`; never
use the local bootstrap against a hosted project. Browser tests reset only the
local DoReGo/SongAlong test records. They use the iPhone 14 Pro and 13-inch MacBook
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
