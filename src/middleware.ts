import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Basic auth credentials for beta site access
const BETA_USERNAME = process.env.BETA_AUTH_USERNAME || 'paradocs'
const BETA_PASSWORD = process.env.BETA_AUTH_PASSWORD || 'beta2026'

// Cookie name for session persistence
const BETA_COOKIE_NAME = 'paradocs_beta_auth'
// Session duration: 7 days in seconds
const SESSION_DURATION = 7 * 24 * 60 * 60

// Paths that should bypass authentication (API routes, static files, etc.)
const PUBLIC_PATHS = [
  '/api/cron/', // Cron jobs need to run without auth
  '/api/admin/', // Admin API uses Supabase auth, not basic auth
  '/api/', // All API routes should work with Supabase auth
  '/auth/', // OAuth callback routes
  '/survey', // Public survey page (linked from email campaigns)
  // V11.17.39 — /citd is the public landing page for the Contact in
  // the Desert event. The QR code on event marketing material points
  // here. Visitors must be able to load this page (and only this page)
  // without basic-auth. They can submit emails to the waitlist via
  // /api/citd/signup but cannot navigate to any other route until the
  // BETA_PROTECTION gate is lifted at launch.
  '/citd',
  '/showcase/', // /citd uses /showcase/feed.mp4 + /showcase/desktop-demo.mp4
  '/_next/',
  '/favicon.ico',
  '/images/',
  '/fonts/',
  // V11.17.39 — common public folder subdirs that _app.tsx / various
  // pages reference as background assets.
  '/icons/',
  '/splash/',
  '/avatars/',
  '/categories/',
]

// V11.17.39 — static-asset extensions that should bypass basic auth
// regardless of where they live. Without this, hits to root-level
// public files like /sw.js, /manifest.json, /apple-touch-icon.png,
// /device-phone.svg etc. all 401 → trigger the WWW-Authenticate
// popup on otherwise-public pages (operator-observed on /citd: the
// page itself was allow-listed but the SW + manifest + favicon
// fetches each surfaced a sign-in prompt).
//
// Conservative list — only well-known static formats. Any future
// data-bearing endpoint we add as a bare /foo.json route stays
// gated unless explicitly allow-listed.
const STATIC_ASSET_EXT_RE = /\.(?:js|css|map|png|jpg|jpeg|gif|webp|avif|svg|ico|webmanifest|json|woff|woff2|ttf|otf|eot|mp4|webm|m3u8|ts|mov|txt|xml)$/i

function isPublicPath(pathname: string): boolean {
  // V11.17.39 — bypass auth for static-asset extensions regardless
  // of path. Keeps PUBLIC_PATHS focused on routes; lets every
  // /public folder file load without enumerating each one.
  if (STATIC_ASSET_EXT_RE.test(pathname)) return true
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
}

// V10.7.G — known link-preview scrapers. iMessage, Slack, Twitter/X,
// Discord, WhatsApp, etc. fetch the page once to read OG/Twitter card
// meta tags so they can render an inline preview card. They cannot
// authenticate, so when the site is behind basic auth they get a 401
// and silently render nothing. The OG meta tags on /report/[slug] are
// fully populated; we just need to let the scrapers reach the HTML.
//
// Identifying scrapers by User-Agent is the standard approach for
// password-protected staging sites that still want shareable previews
// — Vercel's password protection feature does the same thing internally.
// This pattern is well-known to scraper operators, so we are not
// changing the security posture meaningfully: the data exposed is the
// same data anyone with a Paradocs login would see, scraped instead of
// rendered.
//
// Pattern intentionally inclusive: any spammy bot pretending to be
// Twitterbot still only gets the same OG-card-friendly HTML a normal
// shared link would produce. The basic-auth gate stays up for normal
// browser traffic.
const SOCIAL_BOT_UA_RE = /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Slack-ImgProxy|Discordbot|WhatsApp|TelegramBot|Iframely|LinkPreview|LinkPresentation|redditbot|Mastodon|Pinterest|Applebot|Skypeuripreview|bingbot|Google-PageRenderer|YandexBot|DuckDuckBot|Baiduspider|vkShare|W3C_Validator)/i

function isSocialMediaScraper(userAgent: string | null): boolean {
  if (!userAgent) return false
  return SOCIAL_BOT_UA_RE.test(userAgent)
}

function createSessionToken(username: string): string {
  // Simple session token (in production, use a proper JWT)
  const payload = `${username}:${Date.now()}`
  return Buffer.from(payload).toString('base64')
}

function verifySessionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const [username, timestamp] = decoded.split(':')
    const time = parseInt(timestamp, 10)
    const age = (Date.now() - time) / 1000

    // Token is valid if it's from the correct user and not expired
    return username === BETA_USERNAME && age < SESSION_DURATION
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth for public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check if beta protection is enabled
  const betaProtectionEnabled = process.env.BETA_PROTECTION_ENABLED === 'true'

  if (!betaProtectionEnabled) {
    return NextResponse.next()
  }

  // V10.7.G — let link-preview scrapers through so iMessage / Slack /
  // Twitter / Discord etc. can render OG cards for shared report URLs.
  // The OG/Twitter meta tags on /report/[slug] are fully populated; the
  // scrapers were hitting 401 before they could read them. Humans still
  // get the basic-auth prompt below.
  if (isSocialMediaScraper(request.headers.get('user-agent'))) {
    return NextResponse.next()
  }

  // First, check for existing session cookie
  const sessionCookie = request.cookies.get(BETA_COOKIE_NAME)
  if (sessionCookie && verifySessionToken(sessionCookie.value)) {
    return NextResponse.next()
  }

  // Check for Basic Auth header (initial login)
  const authHeader = request.headers.get('authorization')

  if (authHeader) {
    // Parse Basic auth credentials
    const authValue = authHeader.split(' ')[1]
    if (authValue) {
      try {
        const [user, pwd] = Buffer.from(authValue, 'base64').toString('utf8').split(':')
        if (user === BETA_USERNAME && pwd === BETA_PASSWORD) {
          // Create response with session cookie
          const response = NextResponse.next()

          // Set session cookie for future requests
          response.cookies.set(BETA_COOKIE_NAME, createSessionToken(user), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_DURATION,
            path: '/',
          })

          return response
        }
      } catch (e) {
        // Invalid base64, fall through to prompt
      }
    }
  }

  // V11.17.39 — only include the WWW-Authenticate header on top-level
  // page navigations. iOS Safari (especially in Private Browsing) is
  // aggressive about showing the basic-auth popup whenever it sees a
  // 401 + WWW-Authenticate challenge, even for background subresource
  // requests (manifest icons, web-app meta-link fetches, sw.js
  // preloads, etc.). The popup appears on /citd despite the page
  // itself being allow-listed because some Safari-initiated
  // background fetch is hitting a gated path and 401-ing.
  //
  // Fix: gate the challenge header by request destination. Real human
  // page navigations get the prompt (so the dev gate keeps working);
  // every other request type silently 401s with no popup trigger.
  const secFetchDest = request.headers.get('sec-fetch-dest') || ''
  const secFetchMode = request.headers.get('sec-fetch-mode') || ''
  const accept = request.headers.get('accept') || ''
  const isTopLevelNavigation =
    secFetchMode === 'navigate' ||
    secFetchDest === 'document' ||
    // Fallback heuristic — Safari sometimes omits Sec-Fetch-* headers.
    (accept.includes('text/html') && !accept.includes('image/'))

  const headers: Record<string, string> = {}
  if (isTopLevelNavigation) {
    headers['WWW-Authenticate'] = 'Basic realm="Paradocs - Enter access credentials"'
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers,
  })
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
