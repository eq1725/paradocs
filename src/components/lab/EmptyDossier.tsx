'use client'

// V11.17.69 - Tier 2B
//
// EmptyDossier — the ghosted-dossier empty state surfaced when a user
// is signed in but has not yet submitted any experiences (n=0).
//
// Per LAB_PANEL_REVIEW_V3 §3 "One experience is world-class" + V2 §2
// empty-state spec:
//   - Render a desaturated mock dossier (30% opacity) so the user
//     sees the SHAPE of what they're about to build — not an empty
//     dashboard.
//   - Editorial register: documentary, archival, no marketing copy.
//   - Single CTA: "Document your first experience" → /start.
//
// This is the n=0 leaf of the scaling tier in DossierHeader. It is
// intentionally a separate file so the empty state can grow its own
// micro-illustrations + onboarding copy without bloating
// DossierHeader.tsx.

import React from 'react'
import Link from 'next/link'
import { Plus, MapPin, Calendar, Telescope } from 'lucide-react'

interface EmptyDossierProps {
  /**
   * Optional analytics surface slug — passed back when the CTA fires.
   * Defaults to 'empty_dossier_cta'.
   */
  surface?: string
}

export default function EmptyDossier(props: EmptyDossierProps) {
  var ctaHref = '/start?ref=' + encodeURIComponent(props.surface || 'empty_dossier_cta')
  return (
    <section
      aria-label="Sample record — yours starts when you share your first experience"
      className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4"
    >
      {/* Eyebrow — names the surface honestly. */}
      <div className="flex items-baseline justify-between gap-2 mb-3 px-1">
        <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300/90">
          Sample record
        </span>
        <span className="text-[10px] text-gray-500">
          This is what yours will look like
        </span>
      </div>

      {/* Ghosted dossier surface. 30% opacity per V2 §2 — visible
          enough to read the shape, dim enough that it never reads as
          the user's actual data. */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="rounded-2xl border border-purple-800/30 bg-gradient-to-br from-purple-950/15 via-gray-950/40 to-gray-950/60 p-5 sm:p-6"
          style={{ opacity: 0.32, filter: 'grayscale(0.4)' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
              <Telescope className="w-5 h-5 text-purple-200" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300 mb-1">
                Your experience
              </p>
              <p className="text-base font-semibold text-white truncate">
                Lumberton triangle, 1998
              </p>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">
                &ldquo;Three lights moving in formation, low above the trees.
                No sound. Held position for nearly a minute before sliding
                northwest.&rdquo;
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[11px] text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Lumberton, NC
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> 1998
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-3 italic leading-relaxed">
                One of 23 triangle sightings in central North Carolina between
                1990 and 2000. The closest in time and place was July 14, 1998,
                eleven miles east.
              </p>
            </div>
          </div>
        </div>

        {/* Overlay CTA — anchored bottom-center, lifted above the
            ghosted surface so the call-to-action is unambiguous. */}
        <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
          <Link
            href={ctaHref}
            className="pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Document your first experience
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed max-w-md mx-auto">
        Your account sets against the wider archive of 200,000+ reports.
        Submissions are free, unlimited, and yours to keep.
      </p>
    </section>
  )
}
