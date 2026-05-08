# Supabase Custom Domain — Production Setup

> **Goal:** map our Supabase project URL from
> `https://<project-ref>.supabase.co` to `https://db.discoverparadocs.com`
> so every user-facing artefact (auth verify links, REST API calls,
> Storage URLs, etc.) is on the Paradocs brand domain. Required before
> public launch.
>
> **Scope:** all Supabase API surfaces (Auth, REST, GraphQL, Storage,
> Realtime, Edge Functions) — not just auth. A single custom-domain
> mapping covers everything.

## Why this matters

Today the magic-link email contains a URL like:

```
https://bhkbctdmwnowfmqpksed.supabase.co/auth/v1/verify?token=...
```

For brand-conscious users that's two unprofessional signals:

1. The random project-ref subdomain (`bhkbctdmwnowfmqpksed`) leaks
   our infrastructure provider and looks like spam to security-aware
   recipients.
2. It implies we don't own our auth flow.

After this runbook, the same email will read:

```
https://db.discoverparadocs.com/auth/v1/verify?token=...
```

## Pre-flight checklist

- [ ] Supabase Pro plan or higher is active
      ([pricing](https://supabase.com/pricing) — Custom Domain is
      included on Pro+, no add-on charge).
- [ ] DNS host access for `discoverparadocs.com`. (Cloudflare,
      Namecheap, Vercel DNS, etc.)
- [ ] Vercel project env-var access for the Paradocs project.
- [ ] No active maintenance window — the cutover is zero-downtime
      but takes 5-15 min for DNS propagation.

## Subdomain choice

We recommend **`db.discoverparadocs.com`** because:

- Supabase Custom Domain covers ALL their APIs (REST, GraphQL, Auth,
  Storage, Realtime, Functions) — not just auth. So `auth.` is too
  narrow.
- `api.` conflicts with future Paradocs-owned API endpoints.
- `db.` is the convention Supabase suggests in its own docs.

If you'd rather use a different subdomain, replace `db` everywhere
in the steps below.

## Steps

### 1. Add the custom domain in Supabase Dashboard

1. Open https://supabase.com/dashboard → your Paradocs project.
2. Left sidebar → gear icon (**Project Settings**) → **General**.
3. Scroll to **Custom Domain** section. (If not present, your project
   isn't on Pro+ — upgrade before continuing.)
4. Click **Add Custom Domain**.
5. Enter `db.discoverparadocs.com` and click **Verify**.
6. Supabase shows you a DNS record to add at your DNS host. It
   looks roughly like:

   ```
   Type:   CNAME
   Name:   db
   Value:  <project-ref>.supabase.co
   TTL:    300
   ```

   Keep this tab open — you'll come back to verify.

### 2. Add the DNS record

1. Open your DNS provider for `discoverparadocs.com`.
2. Add the CNAME exactly as Supabase shows it.
   - **Cloudflare users:** make sure the record is set to **DNS only**
     (gray cloud icon), NOT **Proxied** (orange cloud). Proxying
     breaks SSL handshake with Supabase.
3. Save.

### 3. Verify DNS in Supabase

1. Back in the Supabase Dashboard tab, click **Verify** (or wait —
   it polls automatically).
2. Status should flip from "Pending" → "Verified" within 5-15 min,
   sometimes up to an hour for stubborn DNS resolvers.
3. Once verified, Supabase auto-provisions an SSL cert via Let's
   Encrypt. This can take another 2-5 min. The status will become
   **Active**.

### 4. Test the new domain works

In a terminal:

```sh
curl -I https://db.discoverparadocs.com/rest/v1/
```

Expected: `HTTP/2 401` (unauthenticated REST endpoint — that's fine,
means TLS + routing work). If you get a 502 or DNS-NXDOMAIN, wait
longer or recheck the CNAME.

### 5. Update Vercel env vars

The frontend needs to know about the new URL. Both production and
preview deploys read this:

1. Vercel → Paradocs project → **Settings → Environment Variables**.
2. Find `NEXT_PUBLIC_SUPABASE_URL`. Currently:
   ```
   https://bhkbctdmwnowfmqpksed.supabase.co
   ```
3. Edit → set value to:
   ```
   https://db.discoverparadocs.com
   ```
4. Apply to **Production**, **Preview**, **Development** (all three).
5. Save.

### 6. Update Auth URL Configuration in Supabase

1. Supabase Dashboard → **Authentication → URL Configuration**.
2. Set:
   - **Site URL:** `https://discoverparadocs.com`
     (the user-facing site, NOT the auth domain)
   - **Redirect URLs** — add (don't replace existing):
     - `https://discoverparadocs.com/auth/callback`
     - `https://discoverparadocs.com/auth/callback?**`
     - `https://*.discoverparadocs.com/auth/callback`
       *(covers Vercel preview deploys on subdomains if you use them)*
3. Save.

### 7. Redeploy Vercel

Env-var changes don't apply until a new build runs.

1. Vercel → **Deployments** → most recent → three-dot menu → **Redeploy**.
2. Wait for build to complete (~3-5 min).

### 8. Test end-to-end

1. Open production site → `/start` → submit a signup with a fresh
   alias email (e.g. `williamschaseh+customdomain@gmail.com`).
2. Check the inbox.
3. Inspect the URL in the email's "Or copy this link" block. It
   should now read:
   ```
   https://db.discoverparadocs.com/auth/v1/verify?token=...
   ```
4. Tap the button — should redirect to `discoverparadocs.com/start?from=auth`
   and complete the funnel normally.

## Rollback

If anything goes wrong:

1. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL` back to the original
   `*.supabase.co` value and redeploy.
2. The custom domain stays configured in Supabase but unused. Both
   URLs work in parallel — Supabase keeps the original alias active
   forever.
3. Diagnose, fix, re-cut over.

## Things that DON'T need updating

- **Anon key + service role key** — same keys work on both URLs.
- **Database connection strings** — those are separate from the API
  URL, unaffected.
- **Email templates** — `{{ .ConfirmationURL }}` is generated server-
  side from whatever URL Supabase serves; once Site URL + Redirect
  URLs are updated, the variable resolves to the new domain
  automatically.
- **Resend SMTP config** — unrelated; sends from `discoverparadocs.com`
  regardless of which Supabase URL the app talks to.

## Things to consider in the future

- **Anon key rotation** — when ready, rotate the anon key, then this
  is a good time to also push it through your custom domain to
  validate end-to-end.
- **`auth.` subdomain instead** — if you later split auth into its
  own subdomain (cosmetic only), you can add a second custom domain.
  Supabase allows multiple.
- **Webhooks** — any third-party services posting webhooks to your
  Supabase URL (Stripe → Functions, etc.) should be updated to use
  the custom domain too, for consistency.
- **Documentation in CLAUDE.md / handoff docs** — note the new URL
  so future contributors don't reach for the project-ref one.

## Cost summary

- Supabase Pro: $25/month — already required for production-ready
  Paradocs (production-grade backups, point-in-time recovery, etc.).
  Custom Domain is a free add-on at this tier.
- DNS host: free (just a CNAME).
- SSL cert: free (Let's Encrypt, auto-renewed by Supabase).

## Commit / handoff

After cutover succeeds, update:

- This runbook → mark the section done with the date.
- `HANDOFF_MAP.md` → note the new auth/API domain.
- Update any internal docs that reference the project-ref URL.
