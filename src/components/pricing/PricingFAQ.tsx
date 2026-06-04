'use client'

// V11.17.68 - Tier 2A
//
// PricingFAQ — six questions written against the real objections a cold
// visitor brings to the page. Copy approved against the Pricing Panel
// memo §5.4 and PRO_TIER_VALIDATION_V3 (Dossier + Watchlists framing).
// Documentary register throughout — no "unlock", no "premium".

import React from 'react'

interface FAQItem {
  q: string
  a: React.ReactNode
}

var FAQS: FAQItem[] = [
  {
    q: 'What’s in the Free tier?',
    a: (
      <>
        Everything that makes Paradocs a catalogue: unlimited submissions
        to the Archive, the full corpus open to read, and your Record
        rendered as a complete dossier from your very first experience.
        Free shows the comparative surfaces — temporal, geographic, and
        sentiment — at Free depth, with anonymous aggregate matches and
        one Hint per visit. Submissions are free, for everyone, forever.
      </>
    ),
  },
  {
    q: 'What does Basic open up?',
    a: (
      <>
        The named-match layer is the load-bearing addition: when another
        contributor’s account shares phenomenon-type, geography,
        time period, and language pattern with yours, Basic offers an
        introduction. Both sides must opt in before any identifying
        detail is shared. Basic also widens the comparative lenses
        (configurable geographic radius, lunar and seasonal time
        signatures, multi-dimensional sentiment), adds a weekly
        body-of-work paragraph, unlimited Hints refreshed daily, and a
        view-only shareable Record link.
      </>
    ),
  },
  {
    q: 'What is the Dossier?',
    a: (
      <>
        The Dossier is Pro’s flagship surface. For every experience
        in your Record, the Dossier auto-generates a structured
        seven-section cross-reference: closest reports, phenomenology
        lineage, geographic neighbors, temporal neighbors, descriptor
        matches, a rarity reading, and contemporaneous Archive context.
        It refreshes nightly. You can export it as a formatted PDF book
        with cover, footnotes, and citations, and share it as a
        1080×1350 image card or an opt-in anonymized public URL.
      </>
    ),
  },
  {
    q: 'Can I cancel anytime?',
    a: (
      <>
        Yes. Cancellation is two clicks from the Subscription page; your
        subscription stays active through the end of the period you’ve
        already paid for. No questions, no retention call, no
        downgrade-friction step.
      </>
    ),
  },
  {
    q: 'Who can see my submitted experiences?',
    a: (
      <>
        Your account appears in the public catalogue with the visibility
        setting you chose at submission (public, anonymous, or
        operator-only). Named-match introductions require mutual opt-in
        from both contributors before any identifying detail is shared.
        We do not sell data and we do not use submissions to train
        third-party models. The full policy lives in the privacy notes.
      </>
    ),
  },
  {
    q: 'Do you offer a free trial?',
    a: (
      <>
        No trial period — the Free tier is the trial. It’s a real
        product, not a friction layer; it includes unlimited submissions,
        the full catalogue, and the comparative surfaces on your Record
        at Free depth. Subscribe when you want the named-match layer or
        the Dossier, not before.
      </>
    ),
  },
  {
    q: 'What happens if I stop paying?',
    a: (
      <>
        Your account doesn’t go anywhere. Your submitted experiences
        stay in the Archive. You drop back to the Free tier, which keeps
        you reading the catalogue and seeing the comparative surfaces on
        your Record at Free depth. Named-match channels you’ve
        already opened remain readable; no new introductions are offered.
      </>
    ),
  },
]

export default function PricingFAQ() {
  return (
    <section
      aria-labelledby="pricing-faq-heading"
      className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-white/5"
    >
      <p className="text-[11px] font-semibold tracking-widest uppercase text-purple-300/80 mb-2">
        Common questions
      </p>
      <h2
        id="pricing-faq-heading"
        className="font-brand text-2xl sm:text-3xl text-white tracking-tight mb-10"
      >
        Before you subscribe.
      </h2>

      <dl className="space-y-6">
        {FAQS.map(function (item, i) {
          return (
            <div
              key={i}
              className="border-b border-white/5 pb-6 last:border-0 last:pb-0"
            >
              <dt className="text-base font-semibold text-white mb-2">
                {item.q}
              </dt>
              <dd className="text-sm text-gray-300 leading-relaxed">
                {item.a}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
