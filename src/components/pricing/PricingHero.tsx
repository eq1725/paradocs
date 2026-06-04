'use client'

// V11.17.68 - Tier 2A
//
// PricingHero — full-bleed editorial hero for /pricing.
//
// Hero image: Trouvelot, "Aurora Borealis" (1872) — public-domain
// chromolithograph from the New York Public Library scan released as
// CC0 on Wikimedia Commons. Selected by the Pricing Hero Imagery panel
// (PRICING_HERO_IMAGES.md) as the on-brand archival-yet-celestial
// substrate for the page.
//
// Overlay treatment per the brief:
//   - 60% brand-purple gradient from bottom-left → top-right
//   - top-right corner left at lower tint (~20%) so headline reads clean
//   - subtle vignette pulls eye to the CTA stack
//
// Voice: documentary, not SaaS-pitch. Hero leads with the Archive as
// the value object, never the product feature list.

import React from 'react'
import Link from 'next/link'

interface PricingHeroProps {
  /**
   * The primary CTA changes by auth state. Caller passes a node so
   * the page can route logged-out → /start, logged-in free → Stripe
   * checkout, logged-in paid → /account/subscription redirect.
   */
  primaryCta: React.ReactNode
}

var HERO_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/6/60/Trouvelot_-_Aurora_Borealis_-_1872.jpg'

export default function PricingHero(props: PricingHeroProps) {
  return (
    <section
      aria-labelledby="pricing-hero-headline"
      className="relative w-full overflow-hidden"
      style={{ minHeight: '560px' }}
    >
      {/* Base image — fixed position so the gradient blends naturally
          regardless of screen height. Server-renders into the DOM so
          first paint shows the image without waiting on client JS. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(' + HERO_IMAGE_URL + ')',
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Brand-purple gradient overlay — 60% from bottom-left to
          ~20% in the top-right where the headline anchors. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top right, rgba(144,0,240,0.72) 0%, rgba(144,0,240,0.55) 35%, rgba(144,0,240,0.28) 65%, rgba(8,2,18,0.55) 100%)',
        }}
      />

      {/* Vignette — concentrate eye toward upper-right where copy lives */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 75% 30%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-32">
        <div className="max-w-2xl ml-auto text-right">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-purple-200/90 mb-4">
            The Paradocs Archive
          </p>
          <h1
            id="pricing-hero-headline"
            className="font-brand text-3xl sm:text-4xl lg:text-5xl text-white leading-tight tracking-tight mb-5"
            style={{ textShadow: '0 2px 24px rgba(0,0,0,0.35)' }}
          >
            A documentary catalogue of anomalous experience. Open to read.
            Open to add to.
          </h1>
          <p className="text-base sm:text-lg text-purple-50/90 leading-relaxed mb-8">
            Over 200,000 accounts of paranormal and anomalous experience,
            drawn from public archives, newspaper and broadcast records,
            and contributor submissions. Anyone can read it. Anyone can
            submit. Subscriptions open the comparative layer that places
            your own account inside the wider record.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {props.primaryCta}
            <Link
              href="#tiers"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-purple-100 hover:text-white transition-colors"
            >
              See the tiers ↓
            </Link>
          </div>
          <p className="mt-6 text-xs text-purple-200/70 italic">
            Hero plate: Étienne Léopold Trouvelot, <em>Aurora Borealis</em>,
            1872 — public-domain chromolithograph, NYPL / Wikimedia Commons.
          </p>
        </div>
      </div>
    </section>
  )
}
