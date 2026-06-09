'use client'

/**
 * LabPromo — V11.18.x tier-aware variants
 *
 * Per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions. The original Today
 * marketing card (src/components/discover/LabPromo.tsx) is preserved
 * for the Today feed; THIS file is a separate, smaller LabPromo for
 * the /lab + auxiliary surfaces that adapts to user state.
 *
 * Variants (selected server-side via props.user.tier + account_count):
 *
 *   free_empty   — Free, 0 submissions
 *   free_active  — Free, 1+ submissions
 *   basic        — Basic, 1+ submissions
 *   pro          — suppressed (renders null)
 *
 * Editorial sniff test (Helena, June 2026):
 *   - free_empty:  "Your record begins with your first account. Submit
 *                  yours, and the catalogue starts answering back."
 *     ON-BRAND. Documentary register, plural-archive subject, no
 *     spookiness, no exhortation. The "answering back" verb is the
 *     load-bearing image — it positions the catalogue as the speaker,
 *     not the user as the protagonist.
 *
 *   - free_active: "You've shared N account(s). Basic unlocks every
 *                  match and pattern the corpus surfaces for your
 *                  record."
 *     ON-BRAND. Concrete (N), corpus-as-actor ("the corpus surfaces"),
 *     no possessive overreach. Helena flagged the original draft
 *     ("Your record is growing") as too gentle — the substitution
 *     emphasizes capability over emotion.
 *
 *   - basic:       "Pro adds monthly Atlas drops and standing-pattern
 *                  alerts to your record."
 *     ON-BRAND. Two concrete additions, no verb-first hype, no
 *     superlatives. The phrase "monthly Atlas drops" is the V2
 *     roadmap's Pro flagship — surface name locked.
 *
 *   - pro:         null (suppressed). Helena rule: never promote at
 *                  someone who's already paid the top tier.
 *
 * SWC: var + function() per repo convention.
 */

import React from 'react'
import Link from 'next/link'

export type LabPromoVariant = 'free_empty' | 'free_active' | 'basic' | 'pro'

export interface LabPromoUser {
  /** 'free' | 'basic' | 'pro' — null for signed-out (treated as free_empty). */
  tier: 'free' | 'basic' | 'pro' | null
  /** Count of the user's submitted accounts. Defaults to 0 when unknown. */
  account_count?: number
}

interface LabPromoProps {
  user: LabPromoUser | null
}

interface CopyShape {
  eyebrow: string
  body: string
  cta?: { label: string; href: string }
  trailing?: string
}

export function resolveLabPromoVariant(user: LabPromoUser | null): LabPromoVariant {
  if (!user || !user.tier || user.tier === 'free') {
    return (user && (user.account_count || 0) >= 1) ? 'free_active' : 'free_empty'
  }
  if (user.tier === 'basic') return 'basic'
  return 'pro'
}

function buildCopy(variant: LabPromoVariant, accountCount: number): CopyShape | null {
  if (variant === 'pro') return null
  if (variant === 'free_empty') {
    return {
      eyebrow: 'Your record',
      body:
        'Your record begins with your first account. Submit yours, ' +
        'and the catalogue starts answering back.',
      cta: { label: 'Submit an account', href: '/start' },
    }
  }
  if (variant === 'free_active') {
    var n = Math.max(1, accountCount)
    var nounPhrase = n === 1 ? '1 account' : (n + ' accounts')
    return {
      eyebrow: 'Your record',
      body:
        'You’ve shared ' + nounPhrase + '. Basic unlocks every match ' +
        'and pattern the corpus surfaces for your record.',
      cta: { label: 'Unlock Basic — $5.99/mo', href: '/pricing' },
    }
  }
  // basic
  return {
    eyebrow: 'Your record',
    body:
      'Pro adds monthly Atlas drops and standing-pattern alerts to your record.',
    cta: { label: 'Upgrade to Pro', href: '/pricing' },
  }
}

export function LabPromo(props: LabPromoProps) {
  var variant = resolveLabPromoVariant(props.user)
  if (variant === 'pro') return null

  var copy = buildCopy(variant, (props.user && props.user.account_count) || 0)
  if (!copy) return null

  return (
    <section
      aria-label={'LabPromo — ' + variant}
      className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      <div className="rounded-2xl border border-purple-700/30 bg-gradient-to-br from-purple-950/30 via-gray-950/40 to-gray-950/60 p-5 sm:p-6">
        <p
          className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2 text-purple-300"
          style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}
        >
          {copy.eyebrow}
        </p>
        <p className="text-sm sm:text-[15px] leading-relaxed text-gray-200">
          {copy.body}
        </p>
        {copy.cta && (
          <div className="mt-4">
            <Link
              href={copy.cta.href}
              className="inline-flex items-center justify-center px-4 py-2 rounded-full text-xs sm:text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
            >
              {copy.cta.label}
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

export default LabPromo
