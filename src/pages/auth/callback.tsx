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
        // Get the intended redirect from the URL or default to home
        const params = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const redirectTo = params.get('redirect') || '/'

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
