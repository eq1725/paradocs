'use client'

// V11.17.68 - Tier 2A
//
// PricingTierTable — three-tier comparison (Free / Basic / Pro) with a
// monthly/annual cadence toggle, side-by-side tier cards, and a full
// feature matrix sourced from PRO_TIER_VALIDATION_V3.md §7.
//
// Voice rules per the Pricing Panel memo:
//   - Tier names lowercase in body, capitalized in chrome.
//   - No "unlock" / "premium" / "supercharge" vocabulary.
//   - Free is described first and at equal visual weight to Basic/Pro.
//   - Bolded rows in the matrix are Pro flagships (Dossier + Watchlists).
//
// SWC compliant: var + named function expressions where reasonable.

import React, { useState } from 'react'
import { Check } from 'lucide-react'

export type Cadence = 'monthly' | 'annual'

interface PricingTierTableProps {
  /**
   * Click handler for the per-tier primary CTA. Caller decides whether
   * to deep-link to signup, Stripe Checkout, or /account/subscription
   * based on auth state. `tier` is the tier slug; `cadence` matches
   * the toggle.
   */
  onTierSelect: (tier: 'free' | 'basic' | 'pro', cadence: Cadence) => void
  /**
   * If passed, the matching tier renders a "Current plan" pill instead
   * of an active CTA. Used when /pricing is shown to a logged-in user.
   */
  currentTier?: 'free' | 'basic' | 'pro' | null
}

interface TierBullet {
  text: string
  /** When true, bullet renders in brand-purple to mark a flagship. */
  flagship?: boolean
}

interface TierSpec {
  slug: 'free' | 'basic' | 'pro'
  name: string
  priceMonthly: number
  priceAnnual: number
  framing: string
  bullets: TierBullet[]
  ctaLabel: { monthly: string; annual: string }
  ctaVariant: 'primary' | 'ghost'
}

var TIERS: TierSpec[] = [
  {
    slug: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    framing:
      'The catalogue is open. Submissions are free, for everyone, forever. Your Record renders as a full dossier from your first submitted experience.',
    bullets: [
      { text: 'Unlimited submissions to the Archive' },
      { text: 'Read the full catalogue of 200,000+ accounts' },
      { text: 'Your Record at Free depth: 24h dial, decade band, 50-mile geography' },
      { text: 'Anonymous aggregate matches (e.g., "8 nearby reports")' },
      { text: 'One Hint per visit from the catalogue' },
    ],
    ctaLabel: { monthly: 'Start free', annual: 'Start free' },
    ctaVariant: 'ghost',
  },
  {
    slug: 'basic',
    name: 'Basic',
    priceMonthly: 5.99,
    priceAnnual: 59,
    framing:
      'The comparative depth opens. Configurable temporal and geographic lenses, a body-of-work paragraph, and the named-match layer when another contributor shares signal with you.',
    bullets: [
      { text: 'Named-match introductions, mutual opt-in required' },
      { text: 'Configurable geographic radius, decades shift, lunar and seasonal lenses' },
      { text: 'Body-of-work paragraph, refreshed weekly' },
      { text: 'Multi-dimensional sentiment baseline' },
      { text: 'Unlimited Hints, refreshed daily' },
      { text: 'Shareable private Record link (view-only, expirable)' },
    ],
    ctaLabel: {
      monthly: 'Subscribe — $5.99/mo',
      annual: 'Subscribe — $59/yr',
    },
    ctaVariant: 'primary',
  },
  {
    slug: 'pro',
    name: 'Pro',
    priceMonthly: 14.99,
    priceAnnual: 149,
    framing:
      'The working tools open. Every experience in your Record becomes a 7-section Dossier with PDF export and shareable image card. Custom Watchlists notify you when matching reports land in the Archive.',
    bullets: [
      { text: 'The Dossier — full 7-section cross-reference per experience, refreshed nightly', flagship: true },
      { text: 'Dossier PDF export with cover, footnotes, and citations', flagship: true },
      { text: '1080×1350 image card + opt-in public Dossier URL', flagship: true },
      { text: 'Custom Watchlists — alerts when new Archive ingest matches your standing interests', flagship: true },
      { text: 'County-level density, KML, raw JSON export' },
      { text: 'On-demand top-5 named-match view, daily refresh, private annotations' },
    ],
    ctaLabel: {
      monthly: 'Subscribe — $14.99/mo',
      annual: 'Subscribe — $149/yr',
    },
    ctaVariant: 'primary',
  },
]

interface MatrixRow {
  feature: string
  free: string
  basic: string
  pro: string
  flagship?: boolean
}

// Sourced verbatim from PRO_TIER_VALIDATION_V3.md §7.
var MATRIX: MatrixRow[] = [
  { feature: 'Submitting experiences', free: 'Unlimited', basic: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Browsing the Archive', free: 'Open', basic: 'Open', pro: 'Open' },
  { feature: 'Your Record (dossier view)', free: 'Full', basic: 'Full + cross-experience header', pro: 'Full + advanced lenses' },
  { feature: 'AI synthesis paragraph', free: 'Per experience, monthly refresh', basic: 'Body-of-work paragraph, weekly', pro: 'Nightly + regenerate on demand' },
  { feature: 'The Dossier (cross-reference)', free: '—', basic: 'Closest 3 reports listed', pro: 'Full 7-section dossier, nightly refresh', flagship: true },
  { feature: 'Dossier PDF export', free: '—', basic: '—', pro: 'Formatted PDF book with cover, TOC, footnotes', flagship: true },
  { feature: 'Dossier social share', free: '—', basic: '—', pro: '1080×1350 image card + opt-in public URL', flagship: true },
  { feature: 'Custom Watchlists', free: '—', basic: '—', pro: 'Saved search criteria, push/email on new matches', flagship: true },
  { feature: 'Temporal analysis', free: '24h dial + decade band', basic: '+ time-of-week, lunar, seasonal, decades shift', pro: '+ custom date-range, raw histograms' },
  { feature: 'Geographic analysis', free: '50-mile ring, 3 data lines', basic: 'Configurable 10–500 mi, corridor explorer', pro: 'County-level density, multi-experience, KML' },
  { feature: 'Sentiment baseline', free: 'One-line population comparison', basic: 'Multi-dimensional, sub-pattern comparison', pro: 'Trajectory analysis, archive-wide shifts' },
  { feature: 'Aggregate-pattern matches', free: 'Always-on', basic: '+ adjacent counties, nearby phenomena', pro: '+ underlying reports listed and citable' },
  { feature: 'Named-match introductions', free: '—', basic: 'Mutual opt-in, one per visit', pro: '+ on-demand top-5 view' },
  { feature: 'Private channel after match', free: '—', basic: 'One channel per matched pair', pro: '+ Record snapshot sharing' },
  { feature: 'Hints queue', free: '1/visit, lifetime cap 12', basic: 'Unlimited, refreshed daily', pro: '+ save Hints into Collections' },
  { feature: 'Private annotations', free: '—', basic: '—', pro: 'On any catalogue report or phen page' },
  { feature: 'Phenomenon claims', free: 'Read-only', basic: 'Claim to Record', pro: '+ edit / annotate' },
  { feature: 'Re-analysis cadence', free: 'Monthly', basic: 'Weekly + digest', pro: 'Daily + real-time on demand' },
  { feature: 'Year-in-Review', free: 'Teaser (3 cards)', basic: 'Full', pro: 'Full + multi-year retrospective' },
  { feature: 'Shareable Record link', free: '—', basic: 'View-only, expirable', pro: 'Permissioned by section' },
  { feature: 'Raw export (JSON / KML / CSV)', free: '—', basic: '—', pro: 'Yes' },
  { feature: 'First-look on matched ingest', free: '—', basic: 'Weekly digest', pro: 'Real-time' },
]

function formatPrice(n: number): string {
  if (n === 0) return '$0'
  if (Number.isInteger(n)) return '$' + n.toString()
  return '$' + n.toFixed(2)
}

function annualEquivalentMonthly(annual: number): string {
  if (annual === 0) return '$0'
  var perMonth = annual / 12
  return '$' + perMonth.toFixed(2)
}

export default function PricingTierTable(props: PricingTierTableProps) {
  var [cadence, setCadence] = useState<Cadence>('monthly')

  return (
    <section id="tiers" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-purple-300/80 mb-2">
            The tiers
          </p>
          <h2 className="font-brand text-2xl sm:text-3xl text-white tracking-tight">
            Three depths of access to the same Archive.
          </h2>
          <p className="text-sm text-gray-400 mt-2 max-w-xl leading-relaxed">
            Free is the catalogue, open. Basic opens the comparative
            depth and the named-match layer. Pro opens the Dossier and
            the working tools.
          </p>
        </div>

        {/* Cadence toggle — segmented control */}
        <div
          role="tablist"
          aria-label="Billing cadence"
          className="inline-flex items-center self-start sm:self-auto bg-white/[0.04] border border-white/10 rounded-full p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cadence === 'monthly'}
            onClick={function () { setCadence('monthly') }}
            className={
              'px-4 py-1.5 text-sm font-medium rounded-full transition-colors ' +
              (cadence === 'monthly'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:text-white')
            }
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cadence === 'annual'}
            onClick={function () { setCadence('annual') }}
            className={
              'px-4 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-2 ' +
              (cadence === 'annual'
                ? 'bg-white text-gray-950'
                : 'text-gray-300 hover:text-white')
            }
          >
            Annual
            <span
              className={
                'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ' +
                (cadence === 'annual'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-500/20 text-purple-200')
              }
            >
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Tier cards — three stacked on mobile, side-by-side at md+ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {TIERS.map(function (tier) {
          var isCurrent = props.currentTier === tier.slug
          var monthly = tier.priceMonthly
          var annual = tier.priceAnnual
          var showAnnual = cadence === 'annual' && tier.slug !== 'free'

          return (
            <div
              key={tier.slug}
              className={
                'flex flex-col rounded-2xl border p-6 sm:p-7 bg-gray-950/40 backdrop-blur-sm transition-colors ' +
                (tier.slug === 'pro'
                  ? 'border-purple-500/40 ring-1 ring-purple-500/20'
                  : 'border-white/10')
              }
            >
              <div className="mb-4">
                <h3 className="font-brand text-2xl text-white tracking-tight">
                  {tier.name}
                </h3>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                  {tier.framing}
                </p>
              </div>

              <div className="mb-5">
                {tier.slug === 'free' ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-brand text-4xl text-white">$0</span>
                    <span className="text-sm text-gray-500">always</span>
                  </div>
                ) : showAnnual ? (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-brand text-4xl text-white">
                        {formatPrice(annual)}
                      </span>
                      <span className="text-sm text-gray-400">/year</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span>{annualEquivalentMonthly(annual)}/mo equivalent</span>
                      <span className="mx-2">·</span>
                      <span className="line-through text-gray-600">
                        {formatPrice(monthly)}/mo
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-brand text-4xl text-white">
                        {formatPrice(monthly)}
                      </span>
                      <span className="text-sm text-gray-400">/month</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      or {formatPrice(annual)}/yr (save 17%)
                    </div>
                  </div>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {tier.bullets.map(function (b, i) {
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check
                        className={
                          'w-4 h-4 mt-0.5 flex-shrink-0 ' +
                          (b.flagship ? 'text-purple-300' : 'text-gray-500')
                        }
                      />
                      <span
                        className={
                          b.flagship ? 'text-purple-100' : 'text-gray-300'
                        }
                      >
                        {b.text}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {isCurrent ? (
                <div className="text-center py-3 text-sm font-medium text-gray-300 bg-white/[0.04] border border-white/10 rounded-full">
                  Your current plan
                </div>
              ) : (
                <button
                  type="button"
                  onClick={function () { props.onTierSelect(tier.slug, cadence) }}
                  className={
                    'w-full py-3 px-4 rounded-full font-semibold text-sm transition-colors ' +
                    (tier.ctaVariant === 'primary'
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-transparent border border-white/15 hover:border-white/30 text-white')
                  }
                >
                  {tier.ctaLabel[cadence]}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Full comparison matrix — collapsed accordion on mobile, open on desktop */}
      <details className="group bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden md:open:" open>
        <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between text-sm font-medium text-gray-200 hover:text-white">
          <span>The full comparison</span>
          <span className="text-xs text-gray-500 group-open:hidden">Expand ↓</span>
          <span className="text-xs text-gray-500 hidden group-open:inline">Collapse ↑</span>
        </summary>
        <div className="overflow-x-auto border-t border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="text-left px-6 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Feature
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Free
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Basic
                </th>
                <th className="text-left px-4 py-3 font-medium text-purple-300 text-xs uppercase tracking-wider">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(function (row, i) {
                return (
                  <tr
                    key={i}
                    className={
                      'border-b border-white/5 ' +
                      (row.flagship ? 'bg-purple-500/[0.06]' : '')
                    }
                  >
                    <td
                      className={
                        'px-6 py-3 ' +
                        (row.flagship
                          ? 'text-purple-100 font-medium'
                          : 'text-gray-200')
                      }
                    >
                      {row.feature}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{row.free}</td>
                    <td className="px-4 py-3 text-gray-300">{row.basic}</td>
                    <td
                      className={
                        'px-4 py-3 ' +
                        (row.flagship ? 'text-purple-100' : 'text-gray-300')
                      }
                    >
                      {row.pro}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
