'use client'

/**
 * /cases/invite/[token] — landing page for collaborator invite links.
 *
 * The email invite sends the user here with a one-time token. We:
 *   1. Require sign-in (redirect to /login with ?next= if needed)
 *   2. POST the token to /api/constellation/case-files/accept-invite
 *   3. On success, redirect to the Cases tab (and highlight the case file)
 *   4. On failure, show the specific error from the API
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { Loader2, AlertCircle, CheckCircle2, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type State =
  | { kind: 'loading' }
  | { kind: 'needs_signin' }
  | { kind: 'accepting' }
  | { kind: 'success'; caseFileId: string; alreadyMember?: boolean }
  | { kind: 'error'; message: string }

export default function AcceptInvitePage() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : null
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!router.isReady || !token) return

    let cancelled = false
    async function go() {
      try {
        const sess = await supabase.auth.getSession()
        const authToken = sess.data.session?.access_token
        if (!authToken) {
          if (!cancelled) setState({ kind: 'needs_signin' })
          return
        }
        if (!cancelled) setState({ kind: 'accepting' })

        const res = await fetch('/api/constellation/case-files/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
          body: JSON.stringify({ token }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'error', message: json.error || 'Could not accept invite' })
          return
        }
        if (!cancelled) setState({
          kind: 'success',
          caseFileId: json.case_file_id,
          alreadyMember: !!json.alreadyMember,
        })
      } catch (err: any) {
        if (!cancelled) setState({ kind: 'error', message: err?.message || 'Network error' })
      }
    }
    go()
    return () => { cancelled = true }
  }, [router.isReady, token])

  return (
    <>
      <Head>
        <title>Accept case file invite · Paradocs</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 text-center">
          <div className="inline-flex p-3 bg-primary-500/10 rounded-full mb-3">
            <FolderOpen className="w-6 h-6 text-primary-400" />
          </div>

          {state.kind === 'loading' && (
            <>
              <h1 className="text-white text-lg font-semibold mb-1">Checking your invite...</h1>
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin mx-auto mt-3" />
            </>
          )}

          {state.kind === 'needs_signin' && (
            <>
              <h1 className="text-white text-lg font-semibold mb-1">You&apos;re invited to investigate</h1>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">
                Sign in to Paradocs to accept this invitation and view the shared case file.
              </p>
              <Link
                href={'/login?next=' + encodeURIComponent('/cases/invite/' + token)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
              >
                Sign in to accept
              </Link>
              <p className="text-[10px] text-gray-600 mt-3">
                Don&apos;t have an account yet? <Link href={'/signup?next=' + encodeURIComponent('/cases/invite/' + token)} className="text-primary-300 hover:text-primary-200">Create one</Link>.
              </p>
            </>
          )}

          {state.kind === 'accepting' && (
            <>
              <h1 className="text-white text-lg font-semibold mb-1">Accepting invite...</h1>
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin mx-auto mt-3" />
            </>
          )}

          {state.kind === 'success' && (
            <>
              <div className="inline-flex p-1.5 bg-emerald-500/15 rounded-full mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <h1 className="text-white text-lg font-semibold mb-1">
                {state.alreadyMember ? "You're already a member" : 'Invite accepted'}
              </h1>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">
                {state.alreadyMember
                  ? 'This case file is already in your library.'
                  : 'You can now view and contribute to this case file.'}
              </p>
              <Link
                href="/lab?tab=cases"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
              >
                Open in Lab
              </Link>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <div className="inline-flex p-1.5 bg-red-500/15 rounded-full mb-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <h1 className="text-white text-lg font-semibold mb-1">Could not accept this invite</h1>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">{state.message}</p>
              <Link
                href="/lab?tab=cases"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Go to your Lab
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}
