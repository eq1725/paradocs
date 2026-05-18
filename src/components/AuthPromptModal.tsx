'use client'

/**
 * AuthPromptModal — soft signup wall for high-engagement actions
 *
 * Panel-feedback (May 2026). Rather than letting save/comment/etc.
 * silently no-op for unauthed users, intercept the tap and surface a
 * lightweight signup prompt. Industry pattern: "save this to your
 * library →" beats a dead button.
 *
 * Props:
 *   open      — controlled visibility
 *   onClose   — close handler
 *   action    — short verb for the headline ("Save this report",
 *               "Join the conversation", "Share your experience")
 *   subtitle  — optional secondary line
 *   nextUrl   — the URL to land on after auth completes; passed through
 *               to /start so the user resumes the in-progress action
 *
 * SWC: var + function() form.
 */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { X, ArrowRight, Sparkles } from 'lucide-react'

interface AuthPromptModalProps {
  open: boolean
  onClose: () => void
  action: string
  subtitle?: string
  /** Path the user should land on after signing in. Defaults to current
   *  pathname so they resume where they left off. */
  nextUrl?: string
}

export default function AuthPromptModal(props: AuthPromptModalProps) {
  var router = useRouter()
  if (!props.open) return null

  var next = props.nextUrl || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')
  var startHref = '/start?next=' + encodeURIComponent(next)
  var loginHref = '/login?next=' + encodeURIComponent(next)

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) props.onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 py-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/95 to-gray-950/95 p-5 shadow-2xl shadow-purple-900/40">
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 inline-flex w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/30 items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-300" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white leading-snug">
              {props.action}
            </h2>
            {props.subtitle && (
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                {props.subtitle}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          Create a free Paradocs account to save reports, see patterns that match your interests, and share your own experiences. No password required.
        </p>

        <div className="flex flex-col gap-2">
          <Link
            href={startHref}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
          >
            Create free account
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Or sign in →
          </Link>
        </div>

        <p className="text-[11px] text-gray-500 text-center mt-3 leading-relaxed">
          We&rsquo;ll bring you right back here after you sign in.
        </p>
      </div>
    </div>
  )
}
