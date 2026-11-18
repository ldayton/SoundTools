# App sign-in emails

The existing Supabase magic-link template serves all four apps. It selects the
app name, accent color, and public PNG logo from the exact validated `/auth/confirm`
redirect URL. Canonical production domains, explicit legacy aliases, and local
app preview ports are supported. Unknown callbacks receive neutral wording.
Branding is not stored in shared user metadata, so signing into one app cannot
change another app's email branding.

`supabase/templates/magic-link.html` is the body and
`supabase/templates/magic-link.subject.txt` is the subject. The same subject is
configured under `[auth.email.template.magic_link]` in `supabase/config.toml` for
local Mailpit tests. Keep the subject file and config value identical.

The subject includes the existing one-time code (`123456 — Sign in to NoteWise`).
This varies the subject on each new code without adding another identifier,
changing authentication, changing Gmail settings, or replacing SMTP. Google
recommends distinct subjects for automated emails that should not be grouped:
https://support.google.com/mail/answer/5900 . The normal SMTP delivery produces
new Message-IDs and does not add reply/reference headers. Gmail ultimately owns
its conversation grouping, and these changes do not split old conversations.

Hosted Supabase configuration is separate from the repository. Deploy by PATCHing
only these three properties on the Management API project's `/config/auth`:

- `mailer_subjects_magic_link`: contents of the subject file, trimmed.
- `mailer_templates_magic_link_content`: contents of the HTML file.
- `smtp_sender_name`: `Sign-in` (a neutral sender shared across apps).

Preserve the current sender address, SMTP transport/credentials, SES tracking
policy, allowlists, expiry, resend limits, and all other auth configuration.
No admin key is added to the app. Keep a local backup of the three previous
values before applying, and read the same three values back to verify.

The shared account dialog keeps email and one-time-code fields at a minimum
16px via `max(1em, 16px)`. This prevents iPhone focus auto-zoom while retaining
user pinch zoom and larger inherited fonts. Do not use `user-scalable=no` or
`maximum-scale=1` to work around input zoom.

Account integration tests verify each app's name/logo and OTP in its actual
Mailpit email subject, and verify the input font sizes. For visual QA, render the
Go templates with fixture tokens only; never save live credentials in previews.
