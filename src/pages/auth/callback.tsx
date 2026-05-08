import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        // Get the intended redirect from the URL or default to home.
        // Accept both 'redirect' (legacy) and 'next' (V9.11 onboarding flow)
        // for backward compatibility — the onboarding /start flow sends
        // ?next=/start?from=auth so the magic-link click resumes the funnel
        // (RADAR reveal step) instead of dumping the user on the homepage.
        const params = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const redirectTo = params.get('next') || params.get('redirect') || '/'

        // Check for error in URL (OAuth error)
        const errorParam = params.get('error') || hashParams.get('error')
        if (errorParam) {
          const errorDesc = params.get('error_description') || hashParams.get('error_description')
          console.error('OAuth error:', errorParam, errorDesc)
          setError(errorDesc || errorParam)
          return
        }

        // Check for code (PKCE flow) or access_token (implicit flow)
        const code = params.get('code')
        const accessToken = hashParams.get('access_token')

        if (code) {
          // PKCE flow - exchange code for session
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(exchangeError.message)
            return
          }
        } else if (accessToken) {
          // Implicit flow - session should already be set from hash
          // Just verify we have a session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError || !session) {
            console.error('Session error:', sessionError)
            setError(sessionError?.message || 'Failed to get session')
            return
          }
        } else {
          // No auth params - check if we already have a session (page refresh)
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            // No session and no auth params - redirect to login
            router.push('/login')
            return
          }
        }

        // V9.11.2 — new-user redirect.
        //
        // After auth is set, check whether this user has a populated
        // profile. If the profile.username is empty, they're new — they
        // probably came from /login (which doesn't pass auth metadata)
        // without ever filling out the experience-share funnel. Route
        // them through /start so we capture their first experience
        // before dropping them on the marketing/discover pages.
        //
        // Privacy-safe: this check happens AFTER the magic-link click,
        // so we never leak account-existence information at the email
        // submit step.
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', user.id)
              .maybeSingle()
            const hasUsername = !!(profile as any)?.username
            const targetIsStart = redirectTo.indexOf('/start') === 0
            if (!hasUsername && !targetIsStart) {
              router.push('/start?from=auth')
              return
            }
          }
        } catch (e) {
          // Non-fatal; fall through to the originally requested redirect.
          console.warn('Profile check failed in callback:', e)
        }

        // Success - redirect to intended destination
        router.push(redirectTo)
      } catch (err) {
        console.error('Callback error:', err)
        setError(err instanceof Error ? err.message : 'Authentication failed')
      }
    }

    // Small delay to ensure URL params are parsed
    const timeout = setTimeout(handleCallback, 100)
    return () => clearTimeout(timeout)
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Authentication Error</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Completing sign in...</p>
      </div>
    </div>
  )
}
