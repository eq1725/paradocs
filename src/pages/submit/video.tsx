'use client'

/**
 * /submit/video — Phase A video capture entry point
 *
 * Panel-feedback (May 2026). Dedicated page for users who want to
 * record + submit a video instead of typing. The /start page can
 * link here ("Or record a video instead"), and the page itself
 * checks auth — if the user isn't signed in, we send them to
 * /start with a callback param so they can sign in and then come
 * back here.
 *
 * After upload, the VideoCapture component navigates the user to
 * /submit/video-review/[report_id] where they confirm the location,
 * date, title, and description before publishing.
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { ArrowLeft, Type } from 'lucide-react'
import { supabase } from '@/lib/supabase'

var VideoCapture = dynamic(function () { return import('@/components/submit/VideoCapture') }, { ssr: false })

export default function SubmitVideoPage() {
  var router = useRouter()
  var [checking, setChecking] = useState(true)
  var [authed, setAuthed] = useState(false)

  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      setAuthed(!!result.data.session)
      setChecking(false)
    })
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-xl font-bold mb-3">Sign in to record a video</h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            Video submissions are tied to your account so you can edit, take down, or
            cancel them any time. Sign in or create an account and we&rsquo;ll bring
            you right back here.
          </p>
          <Link
            href="/start?next=%2Fsubmit%2Fvideo"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full"
          >
            Sign in or create account
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Record a video · Paradocs</title>
        <meta name="description" content="Record a 60-second video about your experience and submit it to the Paradocs archive." />
      </Head>
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={function () { router.back() }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <Link
              href="/start"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              <Type className="w-4 h-4" />
              Type instead
            </Link>
          </div>

          <h1 className="text-lg font-semibold text-white mb-1">Share your experience on camera</h1>
          <p className="text-sm text-gray-400 mb-5 leading-relaxed">
            Up to 5 minutes. We&rsquo;ll auto-transcribe it and ask you to confirm where and when it
            happened before it goes live.
          </p>

          <VideoCapture />

          <p className="mt-5 text-[11px] text-gray-500 leading-relaxed text-center px-4">
            By recording, you agree to our{' '}
            <Link href="/terms" className="underline hover:text-gray-300">Terms</Link> and{' '}
            <Link href="/privacy" className="underline hover:text-gray-300">Privacy Policy</Link>.
            You can take your video down at any time from your account.
          </p>
        </div>
      </div>
    </>
  )
}
