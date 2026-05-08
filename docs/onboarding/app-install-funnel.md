# V9.11.1 #6 &mdash; PWA + native-app onboarding funnel

> **Status:** plan / scoping &mdash; implementation deferred to V9.11 P3
> (routing flip) and NATIVE-1 (Capacitor wrapper).

## The question

How do new users arrive at /start instead of the homepage when they:

1. Visit the site for the first time on the open web (`discoverparadocs.com`).
2. Install the PWA via "Add to Home Screen" (Safari) or Chrome's install
   prompt, then launch from the home-screen icon.
3. Download the native iOS app (planned, NATIVE-1) and open it for the
   first time.

Today, all three land on `/`. The /start funnel only sees traffic from users
who type `/start` directly or follow an explicit deep-link.

## Current state &mdash; what we know

- `public/manifest.json` &mdash; `start_url: "/"`. So the PWA boots on the
  homepage, same as a normal browser visit.
- `/index.tsx` does not check for first-run. It renders the marketing
  homepage for every visitor.
- localStorage keys we already write from /start:
  - `paradocs_onboarding_draft_v1` &mdash; partial step-1 form data.
  - `paradocs_onboarding_account_v1` &mdash; partial step-2 email/username.
  - `paradocs_onboarding_skipped_v1` &mdash; user clicked "Browse first".
- We do **not** yet write a `paradocs_onboarding_complete` marker. (Easy
  add in /api/onboarding/submit success handler.)

## Plan &mdash; three parts

### Part 1 &mdash; first-run detection on `/` (V9.11 P3)

Add to `src/pages/index.tsx`:

    useEffect(function () {
      // Server-side renders see no localStorage; only run client-side.
      if (typeof window === 'undefined') return

      var url = new URL(window.location.href)

      // 1. Honor explicit overrides &mdash; these always skip the redirect.
      //    /?force_home=1 lets us link to the marketing page from emails,
      //    press kits, etc. without bouncing readers into onboarding.
      if (url.searchParams.has('force_home')) return

      // 2. Already a returning user &mdash; never redirect them away.
      var skipped = localStorage.getItem('paradocs_onboarding_skipped_v1')
      var completed = localStorage.getItem('paradocs_onboarding_complete_v1')
      if (skipped || completed) return

      // 3. Existing session = existing user. Route them to /discover.
      //    (Race-safe: getSession() resolves quickly off cookies.)
      supabase.auth.getSession().then(function (s) {
        if (s.data.session) {
          router.replace('/discover')
          return
        }
        // 4. Genuine first-run: route to onboarding.
        router.replace('/start')
      })
    }, [])

Notes:

- Uses `replace`, not `push`, so the homepage doesn't enter back-stack.
- Only runs once per mount (effect with empty deps).
- Doesn't flash the marketing page for existing users because it fires on
  first paint &mdash; we may want a brief loader to suppress flash. Easy
  fix: render `null` until the redirect decision is made.

Add this counterpart in /api/onboarding/submit.ts on success:

    // Client side, after success:
    localStorage.setItem('paradocs_onboarding_complete_v1', '1')

(Already partially set by SKIP_KEY when user picks "Browse Paradocs first".)

### Part 2 &mdash; PWA install handling

PWAs read `start_url` from the manifest each time the user launches from the
home screen. By default, `start_url: "/"` will pick up the new homepage
behavior (Part 1) automatically &mdash; new installs land on /start, returning
launches go to /discover. **No manifest change required.**

One refinement worth considering: change the PWA `start_url` to
`/?source=pwa` so server-side analytics can distinguish PWA launches from
browser visits. The client-side first-run logic stays the same. Optional;
not required for V9.11.1.

Test plan:

- iOS Safari: Add to Home Screen, force-close, tap icon &mdash; expect /start.
- iOS Safari: complete onboarding, force-close, re-open &mdash; expect /discover.
- Android Chrome: Install, force-close, re-open &mdash; expect /start.

### Part 3 &mdash; Native iOS app (NATIVE-1)

The Capacitor wrapper just hosts a WebView pointed at the production SPA. The
launch URL is configured in `capacitor.config.ts`:

    server: {
      url: 'https://discoverparadocs.com',
      cleartext: false,
    },

Or we ship the static export bundled and point at `index.html`. Either way,
the first-run logic from Part 1 fires inside the WebView on first open.
Native-specific overrides:

- `localStorage` inside Capacitor's WebView **persists across app launches**
  but does **not** sync with Safari/PWA installs. Each surface is a separate
  storage origin. So a user who completes /start on the web won't be
  recognized as a returning user when they later install the native app
  &mdash; they'll see /start again on first native launch.

  **Mitigation:** the Supabase session, if signed in via web first, is in a
  separate cookie domain &mdash; native + web don't share auth either.
  However, we can call /api/auth/has-account?email=&hellip; from the native
  first-run screen and skip /start when an email is recognized.

  Decision: ship V1 with the simple first-run logic; revisit this in NATIVE-3
  ("subscription migration from Web Push to APNs on first native open")
  where the same identity-bridging problem surfaces.

- Universal Links / Associated Domains: NATIVE-1 should configure
  `applinks:discoverparadocs.com` so deep-links to `/report/[slug]`,
  `/start`, etc. open in the native app instead of Safari for users who
  have it installed.

## Telemetry to add (lightweight, ship-blocking)

When implementing Part 1, instrument:

- `event: 'onboarding_index_redirect_to_start'` &mdash; first-run redirect fired.
- `event: 'onboarding_index_redirect_to_discover'` &mdash; returning user.
- `event: 'onboarding_skipped'` &mdash; user clicked "Browse Paradocs first".
- `event: 'onboarding_completed'` &mdash; report submitted via /start funnel.

These let us measure the funnel after the routing flip ships:

- Step-through rate from index → /start → email → magic-link → submitted.
- Skip-rate (where do users bail and what happens to D7 retention).

## Open questions for Chase

- Do we want returning-user URL be `/discover` or `/explore`?  Today it's
  `/discover` (the swipe feed). Confirm.
- `?force_home=1` override &mdash; do we also want a permanent unauthenticated
  "marketing site" URL like `/welcome` or `/about` that never redirects?
  My current take: `/about` already exists; just link there from blog
  posts, partner sites, press kits. No new route needed.
- Roll out behind a feature flag (`onboarding_first_run_redirect`) or just
  ship it? My take: feature-flag for one week so we can A/B-test the impact
  on signup conversion vs. organic homepage discovery.

## Implementation order when greenlit

1. Write `paradocs_onboarding_complete_v1` from /api/onboarding/submit
   success handler in /start.tsx.
2. Add the first-run check + null-fallback to /index.tsx.
3. Add `?force_home=1` escape hatch.
4. Add the four telemetry events.
5. Wrap the redirect in the feature flag.
6. Ship to staging, run on Chase's iPhone via PWA install + browser open
   in incognito + signed-in returning user.
7. Roll to 100% after one week of data.

NATIVE-3 + NATIVE-4 will pick up the native-specific concerns when those
tickets land.
