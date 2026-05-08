# Paradocs — Auth email templates (V9.11.1)

This folder holds the branded HTML templates used for Supabase Auth emails
(magic-link, signup, recovery, etc.). They live in source control so we can
review changes via PR even though Supabase stores them in its own Dashboard.

## Why this exists

By default the magic-link email is sent **from `noreply@mail.app.supabase.io`
with the bare Supabase template** ("Click the link below to sign in"). For a
consumer onboarding funnel that's wrong on three counts:

1. **Sender domain** &mdash; users see "Supabase Auth" in their inbox preview
   instead of "Paradocs". Trust drops; spam-filter risk rises.
2. **Body copy** &mdash; the default template is functional but anonymous. It
   doesn't reinforce the Paradocs brand or explain "what happens next."
3. **Conversion** &mdash; without "what to expect after the click" copy,
   bounce rates between magic-link send and confirm are 30-50% on B2C funnels
   (industry data: Auth0 + Supabase community benchmarks). Branded + reassured
   templates close the gap.

## Files

| File | Purpose | Where to paste |
|------|---------|----------------|
| `magic-link.html` | First-time signin / signup via OTP | Supabase Dashboard &rarr; Authentication &rarr; Email Templates &rarr; **Magic Link** |
| `confirm-signup.html` | (Pending) For email/password signups &mdash; not used by /start | Authentication &rarr; Email Templates &rarr; **Confirm signup** |
| `recovery.html` | (Pending) Password reset | Authentication &rarr; Email Templates &rarr; **Reset Password** |

> Currently only `magic-link.html` is in scope for V9.11.1; the other two will
> be added when we wire the legacy email/password login surface.

## Applying the template

Supabase doesn't expose email-template editing via API or migrations. They are
configured in the Dashboard. Steps:

1. Open https://supabase.com/dashboard/project/&lt;project-ref&gt;/auth/templates.
2. Select **"Magic Link"** in the left rail.
3. Open `docs/auth-email-templates/magic-link.html` in this repo.
4. Copy **everything inside `<body>` &hellip; `</body>`** (Supabase already
   wraps the content in its own `<html><head>`).
5. Paste into the Supabase **"Message Body (HTML)"** textarea. Replace the
   default content entirely.
6. Set **Subject heading** to: `Sign in to Paradocs`
7. Click **Save**.
8. Test by triggering /start &rarr; enter your email &rarr; check the rendered
   email in your inbox.

## Sender identity (separate fix)

The template change handles body content. To change the **From: name and
email address** so messages come from `Paradocs <hello@discoverparadocs.com>`
instead of `Supabase Auth <noreply@mail.app.supabase.io>`, you need to
configure a custom SMTP provider:

1. Pick a provider &mdash; we recommend **Resend** (has a generous free tier,
   1-click DNS verification, modern dashboard). Alternatives: Postmark,
   SendGrid, Mailgun.
2. Sign up at https://resend.com (or chosen provider) and verify the
   `discoverparadocs.com` domain &mdash; add the DKIM/SPF records they ask for
   to your DNS host.
3. Generate an SMTP API key.
4. Open Supabase Dashboard &rarr; Project Settings &rarr; Authentication
   &rarr; SMTP Settings.
5. Toggle **Enable Custom SMTP** ON and fill:
    - Sender email: `hello@discoverparadocs.com`
    - Sender name: `Paradocs`
    - Host: `smtp.resend.com`
    - Port: `465`
    - Username: `resend`
    - Password: &lt;the API key from step 3&gt;
6. Click **Save**, then **Send Test Email**.
7. Verify the test email shows `Paradocs <hello@discoverparadocs.com>` as the
   sender in your inbox.

## Token replacement

Supabase substitutes these placeholders in templates:

| Placeholder | What it becomes |
|-------------|-----------------|
| `{{ .ConfirmationURL }}` | The full magic-link URL (includes our `?next=/start?from=auth` redirect &mdash; configured in /start.tsx via `emailRedirectTo`). |
| `{{ .SiteURL }}` | The site URL configured under Auth &rarr; URL Configuration. |
| `{{ .Email }}` | The recipient address. |
| `{{ .Token }}` | A six-digit code (alternative to clicking the link). Not used in our template; we rely on the click flow. |

## Testing checklist

After applying the new template:

- [ ] Trigger /start flow on staging &rarr; submit email &rarr; receive email.
- [ ] Sender shows as "Paradocs" not "Supabase".
- [ ] Subject reads "Sign in to Paradocs".
- [ ] Body renders branded purple gradient + Paradocs wordmark.
- [ ] CTA button is `Continue to Paradocs &rarr;` and links to a URL
      containing `next=%2Fstart%3Ffrom%3Dauth`.
- [ ] Click the button &mdash; lands on `/start?from=auth` and resumes the
      RADAR reveal step.
- [ ] Email renders correctly in Gmail (Web + iOS), Apple Mail (macOS + iOS),
      and Outlook desktop.
- [ ] Spam check: SpamAssassin score &lt; 2.0 (use https://mail-tester.com or
      similar).

## Future work

- Add `confirm-signup.html` once we re-enable email/password registration.
- Add `recovery.html` for password-reset flow.
- Consider per-locale templates (i18n) when we ship non-English markets.
- A/B test subject lines once volume justifies it (e.g. "One tap to finish
  your Paradocs report" vs current "Sign in to Paradocs").
