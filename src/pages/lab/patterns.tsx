// V11.18.1 — Sprint 1A-2 — /lab/patterns
//
// Static grid of all published Findings per V2 roadmap §2.4. Server-side
// rendered (getServerSideProps) so unauth'd visitors can land on the
// page from share links and see the catalogue immediately. Authed
// requests additionally compute the per-Finding user_overlay via the
// `with_user_overlay=1` API parameter.
//
// Sprint 1 ships the grid only — no filter, no search, no per-finding
// detail page. Those land in Sprint 2 (V2 §6.2 — Pattern Explorer).
//
// SWC: var + function() per repo convention.

import React from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import FindingCard from '@/components/patterns/FindingCard'
import type { Finding } from '@/components/patterns/FindingCard'

interface PatternsPageProps {
  findings: Finding[]
}

export default function PatternsPage(props: PatternsPageProps) {
  return (
    <>
      <Head>
        <title>Patterns | Paradocs</title>
        <meta
          name="description"
          content="The archive's recurring testimony, across phenomenon families. Cross-cutting descriptors, regional concentrations, and witness patterns drawn from the full Paradocs corpus."
        />
      </Head>
      <main className="min-h-screen bg-black">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          {/* Back link */}
          <Link
            href="/lab"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-200 transition-colors min-h-[44px] -my-2 py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            My Record
          </Link>

          {/* Header */}
          <header className="mt-6 mb-8">
            <h1
              className="text-white"
              style={{
                fontFamily: "'Changa One', Changa, system-ui, sans-serif",
                fontSize: 'clamp(28px, 5vw, 40px)',
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              Patterns
            </h1>
            <p className="mt-3 text-[14px] sm:text-[15px] text-gray-300 leading-relaxed max-w-[60ch]">
              The archive&rsquo;s recurring testimony, across phenomenon families.
            </p>
          </header>

          {/* Grid or empty state */}
          {props.findings.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-6 sm:p-8">
              <p className="text-[14px] text-gray-400 leading-relaxed">
                Findings publish in waves. The first wave is in editorial review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {props.findings.map(function (f) {
                return (
                  <FindingCard key={f.id} finding={f} variant="grid" />
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PatternsPageProps> = async function (ctx) {
  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { props: { findings: [] } }
  }
  var svc = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var findings: Finding[] = []
  try {
    var res: any = await (svc.from('findings_catalogue' as any) as any)
      .select('id, slug, eyebrow_type, headline, descriptor, phen_families, denominator_n, denominator_n_label, interpretive_sentence, representative_report_ids')
      .eq('published', true)
      .order('publish_order', { ascending: true, nullsFirst: false })
      .limit(20)
    if (res?.data) {
      findings = (res.data as any[]).map(function (r) {
        return {
          id: String(r.id),
          slug: String(r.slug),
          eyebrow_type: r.eyebrow_type,
          headline: String(r.headline),
          descriptor: String(r.descriptor),
          phen_families: r.phen_families || [],
          denominator_n: Number(r.denominator_n) || 0,
          denominator_n_label: String(r.denominator_n_label || ''),
          interpretive_sentence: String(r.interpretive_sentence || ''),
          representative_report_ids: r.representative_report_ids || null,
          user_overlay: null,
        } as Finding
      })
    }
  } catch (_e) { /* defensive — falls through to empty grid */ }

  // V2 roadmap §2.5 — public unauthed URLs are SEO-indexed for inbound
  // search; we set a public Cache-Control header so CDNs can cache the
  // anon view. (Per-user overlay computation lives in the rail/API, not
  // in this server-render path.)
  ctx.res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')

  return { props: { findings: findings } }
}
