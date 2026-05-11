'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { Mail, Lock, ArrowLeft, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Mode = 'magic' | 'password' | 'signup' | 'forgot'

/**
 * V9.11.5 #29 — Proper Google G logo (multi-color) inline SVG.
 * Replaces the lucide Chrome icon, which is the *browser* logo
 * and confuses users about what they're signing in with. Google's
 * brand guidelines also require the multi-color G for "Sign in
 * with Google" surfaces.
 */
function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const { redirect } = router.query

  const [mode, setMode] = useState<Mode>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  /**
   * V9.11.5 #29 — iOS detection for OAuth button ordering.
   * On iOS, Apple sign-in moves to the top slot (Apple HIG +
   * App Store reviewer expectation). On every other platform
   * Google sits at the top because it's the most-recognized
   * social-auth provider for mass-market consumer products.
   *
   * iPadOS 13+ reports as Macintosh, so we also check for
   * touch capability to catch iPads that look like Macs.
   */
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    var ua = navigator.userAgent || ''
    var iOS = /iPhone|iPad|iPod/.test(ua) ||
              (ua.indexOf('Mac') !== -1 && typeof document !== 'undefined' && 'ontouchend' in document)
    setIsIOS(iOS)
  }, [])

  useEffect(() => {
    // V9.11.2 — direct hits on /login?mode=signup are an old funnel.
    // Funnel signup intent through /start so every new account is
    // preceded by an experience-share prompt.
    if (typeof router.query.mode === 'string' && router.query.mode === 'signup') {
      router.replace('/start')
      return
    }

    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push(typeof redirect === 'string' ? redirect : '/')
      }
    })
  }, [redirect, router])

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const finalRedirect = typeof redirect === 'string' ? redirect : '/'
      const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(finalRedirect)}`

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
        },
      })
      if (error) throw error
      setMessage('Check your email for the login link!')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
            },
          },
        })
        if (error) throw error
        setMessage('Check your email for the confirmation link!')
      } else if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push(typeof redirect === 'string' ? redirect : '/')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setMessage('Check your email for the reset link!')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuthLogin(provider: 'google' | 'apple') {
    setError('')
    try {
      const finalRedirect = typeof redirect === 'string' ? redirect : '/'
      const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(finalRedirect)}`

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl,
        },
      })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  const pageTitle = mode === 'signup'
    ? 'Create Account'
    : mode === 'forgot'
      ? 'Reset Password'
      : 'Welcome Back'

  const pageSubtitle = mode === 'signup'
    ? 'Join the Paradocs community'
    : mode === 'forgot'
      ? 'Enter your email to reset your password'
      : 'Sign in to continue your exploration'

  return (
    <>
      <Head>
        <title>{mode === 'signup' ? 'Sign Up' : mode === 'forgot' ? 'Reset Password' : 'Sign In'} - Paradocs</title>
      </Head>

      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="glass-card p-8">
            <div className="text-center mb-8">
              <span className="text-4xl mb-4 block">{'\uD83C\uDF0C'}</span>
              <h1 className="text-2xl font-display font-bold text-white">
                {pageTitle}
              </h1>
              <p className="text-gray-400 mt-2">
                {pageSubtitle}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
                {message}
              </div>
            )}

            {/* OAuth + Magic Link — shown on main login and signup modes */}
            {(mode === 'magic' || mode === 'signup') && (
              <>
                {/* OAuth buttons.
                    V9.11.5 #29 — iOS-first ordering: Apple sits at the
                    top on iOS (Apple HIG + App Store reviewer
                    expectation); Google at the top on every other
                    platform (mass-market recognition). Google G logo
                    is the official multi-color brand mark; Apple logo
                    inherits currentColor for theme consistency. */}
                <div className="space-y-3 mb-6">
                  {isIOS ? (
                    <>
                      <button
                        onClick={() => handleOAuthLogin('apple')}
                        className="w-full btn btn-secondary"
                      >
                        <AppleLogo className="w-5 h-5" />
                        Continue with Apple
                      </button>
                      <button
                        onClick={() => handleOAuthLogin('google')}
                        className="w-full btn btn-secondary"
                      >
                        <GoogleGLogo className="w-5 h-5" />
                        Continue with Google
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleOAuthLogin('google')}
                        className="w-full btn btn-secondary"
                      >
                        <GoogleGLogo className="w-5 h-5" />
                        Continue with Google
                      </button>
                      <button
                        onClick={() => handleOAuthLogin('apple')}
                        className="w-full btn btn-secondary"
                      >
                        <AppleLogo className="w-5 h-5" />
                        Continue with Apple
                      </button>
                    </>
                  )}
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-gray-900 text-gray-500">or continue with email</span>
                  </div>
                </div>
              </>
            )}

            {/* Magic link form — primary email flow */}
            {mode === 'magic' && (
              <>
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn btn-primary disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {loading ? 'Sending...' : 'Send me a login link'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setMode('password')}
                    className="text-xs text-gray-500 hover:text-gray-400"
                  >
                    Sign in with password instead
                  </button>
                </div>

                {/* V9.11.2 — route signup intent through /start so every
                    new account is preceded by an experience-share prompt
                    (or the explicit "share later" skip). The /login route
                    is for returning users only. */}
                <div className="mt-6 text-center text-sm">
                  <p className="text-gray-400">
                    {"New to Paradocs? "}
                    <Link
                      href="/start"
                      className="text-primary-400 hover:text-primary-300 font-medium"
                    >
                      Share your first experience &rarr;
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* Password login — secondary flow for existing users */}
            {mode === 'password' && (
              <>
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        className="w-full pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-sm text-primary-400 hover:text-primary-300"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn btn-primary disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Sign In'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setMode('magic')}
                    className="text-xs text-gray-500 hover:text-gray-400"
                  >
                    {'\u2190'} Back to passwordless login
                  </button>
                </div>
              </>
            )}

            {/* Signup with password */}
            {mode === 'signup' && (
              <>
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        className="w-full pl-10"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn btn-primary disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Create Account'}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm">
                  <p className="text-gray-400">
                    Already have an account?{' '}
                    <button
                      onClick={() => setMode('magic')}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </>
            )}

            {/* Forgot password */}
            {mode === 'forgot' && (
              <>
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn btn-primary disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Send Reset Link'}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm">
                  <p className="text-gray-400">
                    Remember your password?{' '}
                    <button
                      onClick={() => setMode('magic')}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
