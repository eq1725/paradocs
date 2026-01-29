'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { Mail, Lock, ArrowLeft, Github, Chrome } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const router = useRouter()
  const { redirect } = router.query

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push(typeof redirect === 'string' ? redirect : '/')
      }
    })
  }, [redirect, router])

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
      } else if (mode === 'login') {
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

  async function handleOAuthLogin(provider: 'google' | 'github') {
    setError('')
    try {
      // Build the callback URL with the final redirect destination
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

  return (
    <>
      <Head>
        <title>{mode === 'signup' ? 'Sign Up' : mode === 'forgot' ? 'Reset Password' : 'Sign In'} - ParaDocs</title>
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
              <span className="text-4xl mb-4 block">🌌</span>
              <h1 className="text-2xl font-display font-bold text-white">
                {mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Reset Password' : 'Welcome Back'}
              </h1>
              <p className="text-gray-400 mt-2">
                {mode === 'signup'
                  ? 'Join the paranormal research community'
                  : mode === 'forgot'
                    ? 'Enter your email to reset your password'
                    : 'Sign in to continue your exploration'}
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

            {mode !== 'forgot' && (
              <>
                {/* OAuth buttons */}
                <div className="space-y-3 mb-6">
                  <button
                    onClick={() => handleOAuthLogin('google')}
                    className="w-full btn btn-secondary"
                  >
                    <Chrome className="w-5 h-5" />
                    Continue with Google
                  </button>
                  <button
                    onClick={() => handleOAuthLogin('github')}
                    className="w-full btn btn-secondary"
                  >
                    <Github className="w-5 h-5" />
                    Continue with GitHub
                  </button>
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

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'signup' && (
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
              )}

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

              {mode !== 'forgot' && (
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
                      placeholder="••••••••"
                      className="w-full pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn btn-primary disabled:opacity-50"
              >
                {loading
                  ? 'Loading...'
                  : mode === 'signup'
                    ? 'Create Account'
                    : mode === 'forgot'
                      ? 'Send Reset Link'
                      : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm">
              {mode === 'login' ? (
                <p className="text-gray-400">
                  Don't have an account?{' '}
                  <button
                    onClick={() => setMode('signup')}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-gray-400">
                  Already have an account?{' '}
                  <button
                    onClick={() => setMode('login')}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
