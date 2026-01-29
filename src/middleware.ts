import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Basic auth credentials for beta site access
const BETA_USERNAME = process.env.BETA_AUTH_USERNAME || 'paradocs'
const BETA_PASSWORD = process.env.BETA_AUTH_PASSWORD || 'beta2026'

// Paths that should bypass authentication (API routes, static files, etc.)
const PUBLIC_PATHS = [
  '/api/cron/', // Cron jobs need to run without auth
  '/api/admin/', // Admin API uses Supabase auth, not basic auth
  '/auth/', // OAuth callback routes
  '/_next/',
  '/favicon.ico',
  '/images/',
  '/fonts/',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
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

  // Get authorization header
  const authHeader = request.headers.get('authorization')

  if (authHeader) {
    // Parse Basic auth credentials
    const authValue = authHeader.split(' ')[1]
    if (authValue) {
      try {
        const [user, pwd] = atob(authValue).split(':')
        if (user === BETA_USERNAME && pwd === BETA_PASSWORD) {
          return NextResponse.next()
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
