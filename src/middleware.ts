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
  '/_next/',
  '/favicon.ico',
  '/images/',
  '/fonts/',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
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

  // Prompt for credentials
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="ParaDocs Beta - Enter beta credentials"',
    },
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
