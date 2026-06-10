// V11.18.7 — Sprint 1D — /lab/patterns/[slug]
//
// Per-Finding detail page. The scholarly companion to the lay-person
// FindingCard. Tapping "See reports →" on a card lands here.
//
// Voice contract (LAY_PERSON_FINDING_COPY.md §5):
//   - The FindingCard surface is lay-person (aunt-screenshottable,
//     plain English, taxonomy banned).
//   - The DETAIL PAGE here is NYT-data-journalism + scholarly footnote:
//     taxonomy terms allowed (with first-mention gloss), database
//     verbs OK, citations to PATTERNS_TAXONOMY sources by name.
//
// Page structure (top-to-bottom):
//   1. Eyebrow: "ACROSS PHENOMENA" — same small-caps register as card
//   2. H1: the lay-person headline (verbatim from findings_catalogue.headline)
//   3. Lead paragraph: the lay-person interpretive_sentence (verbatim)
//   4. Section: "The breakdown" — full per-family table + horizontal bars
//   5. Section: "What we're measuring" — keyword set + match policy
//   6. Section: "What the literature says" — 2–3 scholarly paragraphs
//   7. Section: "Representative accounts" — 3–5 linked report cards
//   8. Section: "Related Findings" — 2–3 cross-link cards
//   9. Footer: "Source: Paradocs Archive" + share-this placeholder
//
// Server-side rendering — `getStaticProps` with `revalidate: 300`
// because the catalogue is read-mostly and the nightly cron refreshes
// the underlying counts. Missing slug or unpublished row → notFound.
//
// SWC: var + function() per repo convention.

import React from 'react'
import type { GetStaticProps, GetStaticPaths } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Share2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import { getDescriptorKeywords } from '@/lib/patterns/descriptor-vocabulary'
import { getDescriptorCommentary } from '@/lib/patterns/detail-page-commentary'
import type {
  FindingDetailPayload,
  RepresentativeReport,
  RelatedFinding,
} from '@/components/patterns/finding-detail-types'
import type { FindingFamilyBreakdown } from '@/components/patterns/FindingCard'

interface PageProps {
  payload: FindingDetailPayload | null
}

/* -------------------------------------------------------------------------- */
/* Family-label + eyebrow helpers (kept local — the card has its own copy)    */
/* -------------------------------------------------------------------------- */

var EYEBROW_LABEL: Record<string, string> = {
  cross_cutting_descriptor: 'Across Phenomena',
  temporal: 'A Temporal Pattern',
  geographic: 'A Geographic Pattern',
  witness_pattern: 'A Witness Pattern',
  source_overlap: 'A Source Overlap',
  sub_family_distribution: 'Within a Phenomenon',
}

var FAMILY_LABEL_OVERRIDES: Record<string, string> = {
  cryptid: 'Cryptid Encounters',
  UFO: 'UFO Sightings',
  haunting: 'Hauntings',
  psychic: 'Psychic Phenomena',
  esoteric: 'Esoteric Practices',
  consciousness: 'Consciousness Practices',
  'perception-sensory': 'Sleep Paralysis & Perception',
  psychological: 'Near-Death & Psychological',
  'religion/mythology': 'Religion & Mythology',
  cryptids: 'Cryptid Encounters',
  ufos_aliens: 'UFO Sightings',
  ghosts_hauntings: 'Hauntings',
  psychic_phenomena: 'Psychic Phenomena',
  esoteric_practices: 'Esoteric Practices',
  consciousness_practices: 'Consciousness Practices',
  perception_sensory: 'Sleep Paralysis & Perception',
  psychological_experiences: 'Near-Death & Psychological',
  religion_mythology: 'Religion & Mythology',
}

function prettyFamilyLabel(f: { family_slug?: string; family_label?: string }): string {
  if (f.family_slug && FAMILY_LABEL_OVERRIDES[f.family_slug]) {
    return FAMILY_LABEL_OVERRIDES[f.family_slug]
  }
  if (f.family_label && FAMILY_LABEL_OVERRIDES[f.family_label]) {
    return FAMILY_LABEL_OVERRIDES[f.family_label]
  }
  return f.family_label || f.family_slug || ''
}

function fmtInt(n: number): string {
  if (!isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function FindingDetailPage(props: PageProps) {
  if (!props.payload) {
    // Belt + suspenders: getStaticProps returns notFound, but if Next
    // ever lands here we render a graceful absence rather than blank.
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <Link
            href="/lab/patterns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-200 transition-colors min-h-[44px] -my-2 py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Patterns
          </Link>
          <h1 className="mt-6 font-display text-[28px] text-white">Finding not available</h1>
          <p className="mt-3 text-[14px] text-gray-400 max-w-[60ch]">
            This Finding may have been unpublished or moved. Browse the catalogue for the current
            set.
          </p>
        </div>
      </main>
    )
  }

  var f = props.payload
  var eyebrowLabel = EYEBROW_LABEL[f.eyebrow_type] || 'Across Phenomena'
  var commentary = f.commentary
  var keywords = getDescriptorKeywords(f.descriptor)
  var keywordPreview = keywords.slice(0, 14)

  // Sort families by absolute count descending — the same order the
  // editorial header used when we picked the publish triple.
  var familiesSorted = (f.phen_families || []).slice().sort(function (a, b) {
    return (b.count || 0) - (a.count || 0)
  })

  var title = stripMd(f.headline) + ' · Paradocs Patterns'
  var metaDescription = stripMd(f.interpretive_sentence).slice(0, 280)

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={stripMd(f.headline)} />
        <meta property="og:description" content={metaDescription} />
      </Head>
      <main className="min-h-screen bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          {/* Back link */}
          <Link
            href="/lab/patterns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-200 transition-colors min-h-[44px] -my-2 py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Patterns
          </Link>

          {/* Eyebrow + H1 + lead */}
          <header className="mt-6 mb-10">
            <span
              className={
                'inline-block uppercase font-sans font-semibold tracking-[0.22em] ' +
                'text-gray-300 text-[11px] sm:text-[12px] pb-1.5 border-b border-white/[0.18]'
              }
            >
              {eyebrowLabel}
            </span>
            <h1
              className={
                'mt-5 font-display text-white ' +
                'text-[28px] sm:text-[36px] leading-[1.15] tracking-tight'
              }
            >
              {f.headline}
            </h1>
            <p className="mt-5 text-[15px] sm:text-[16.5px] text-gray-200 leading-relaxed max-w-[64ch]">
              {f.interpretive_sentence}
            </p>
          </header>

          {/* The breakdown */}
          <Section title="The breakdown">
            <BreakdownTable families={familiesSorted} />
            <p className="mt-4 text-[12px] italic text-gray-400">
              Across {fmtInt(f.denominator_n)} documented accounts in {familiesSorted.length}{' '}
              phenomenon families.
            </p>
          </Section>

          {/* What we're measuring */}
          <Section title="What we're measuring">
            <p className="text-[14.5px] sm:text-[15px] text-gray-200 leading-relaxed max-w-[64ch]">
              {commentary.measuring}
            </p>
            {keywordPreview.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400 mb-2">
                  Sample of the keyword set
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {keywordPreview.map(function (kw) {
                    return (
                      <li
                        key={kw}
                        className={
                          'inline-block px-2 py-1 text-[11.5px] text-gray-300 ' +
                          'border border-white/[0.10] rounded-md bg-white/[0.025]'
                        }
                      >
                        {kw}
                      </li>
                    )
                  })}
                  {keywords.length > keywordPreview.length && (
                    <li className="inline-block px-2 py-1 text-[11.5px] text-gray-500">
                      …and {keywords.length - keywordPreview.length} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </Section>

          {/* What the literature says */}
          {commentary.literature && commentary.literature.length > 0 && (
            <Section title="What the literature says">
              <div className="space-y-4 max-w-[64ch]">
                {commentary.literature.map(function (para, i) {
                  return (
                    <p
                      key={i}
                      className="text-[14.5px] sm:text-[15px] text-gray-200 leading-relaxed"
                    >
                      {para}
                    </p>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Representative accounts */}
          {f.representative_reports && f.representative_reports.length > 0 && (
            <Section title="Representative accounts">
              <ul className="flex flex-col gap-3">
                {f.representative_reports.map(function (r) {
                  return <RepresentativeReportCard key={r.id} r={r} />
                })}
              </ul>
            </Section>
          )}

          {/* Related Findings */}
          {f.related_findings && f.related_findings.length > 0 && (
            <Section title="Related Findings">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {f.related_findings.map(function (rf) {
                  return <RelatedFindingCard key={rf.id} rf={rf} />
                })}
              </ul>
            </Section>
          )}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-white/[0.08] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 text-[12px] text-gray-400">
              <span className="font-sans font-semibold uppercase tracking-[0.16em] text-gray-300">
                Paradocs Archive
              </span>
              <span aria-hidden="true" className="inline-block h-3 w-px bg-white/[0.18]" />
              <span className="font-sans tabular-nums">{fmtInt(f.denominator_n)} accounts</span>
            </div>
            {/* V11.18.7 — Share button is a placeholder. Sprint 2 will wire
                this up against the existing share-card PNG infrastructure
                (api/og/report/[slug] is the structural reference). For
                now the button copies the canonical URL to the clipboard
                when the user taps it; on platforms without clipboard API
                it falls back to a plain Web-Share-API invocation. */}
            <ShareButton slug={f.slug} headline={f.headline} />
          </footer>
        </div>
      </main>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 sm:mt-12">
      <h2
        className={
          'mb-4 font-display text-white text-[19px] sm:text-[22px] leading-snug ' +
          'tracking-tight pb-2 border-b border-white/[0.08]'
        }
      >
        {props.title}
      </h2>
      {props.children}
    </section>
  )
}

function BreakdownTable(props: { families: FindingFamilyBreakdown[] }) {
  var fams = props.families
  if (fams.length === 0) {
    return (
      <p className="text-[13px] text-gray-400">No per-family breakdown available.</p>
    )
  }
  // The table is rendered as a flex stack at narrow viewports (375px+)
  // and as an aligned grid at sm+ where there's room. The horizontal
  // overflow guard lets the row scroll if anything genuinely overflows.
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <ul className="flex flex-col gap-4 min-w-0">
        {fams.map(function (f) {
          var pct = Math.max(0, Math.min(100, f.pct))
          return (
            <li key={f.family_slug} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-[14px] sm:text-[15px] text-gray-100">
                  {prettyFamilyLabel(f)}
                </span>
                <span className="text-[12.5px] tabular-nums text-gray-400">
                  {fmtInt(f.count)} of {fmtInt(f.total_in_family)}
                </span>
                <span
                  className="text-[18px] sm:text-[20px] font-display font-semibold tabular-nums"
                  style={{ color: '#9000F0' }}
                >
                  {f.pct}%
                </span>
              </div>
              <div
                className="relative h-[5px] w-full overflow-hidden border-y border-white/[0.06]"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                role="img"
                aria-label={prettyFamilyLabel(f) + ' ' + f.pct + ' percent'}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: pct + '%',
                    background:
                      'linear-gradient(to right, rgba(144,0,240,0.95), rgba(144,0,240,0.55))',
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RepresentativeReportCard(props: { r: RepresentativeReport }) {
  var r = props.r
  return (
    <li>
      <Link
        href={'/report/' + encodeURIComponent(r.slug || r.id)}
        className={
          'block rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 ' +
          'hover:border-white/[0.18] hover:bg-white/[0.045] transition-colors'
        }
      >
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-gray-400 mb-1.5">
          <span>{prettyFamilyLabel({ family_slug: r.category || '' }) || 'Account'}</span>
          {(r.location_text || r.event_date) && (
            <span aria-hidden="true" className="inline-block h-3 w-px bg-white/[0.18]" />
          )}
          {r.location_text && <span className="truncate normal-case tracking-normal text-gray-400">{r.location_text}</span>}
          {r.event_date && (
            <>
              {r.location_text && (
                <span aria-hidden="true" className="inline-block h-3 w-px bg-white/[0.18]" />
              )}
              <span className="normal-case tracking-normal text-gray-400">{fmtDate(r.event_date)}</span>
            </>
          )}
        </div>
        <h3 className="text-[15px] sm:text-[15.5px] text-white leading-snug">
          {r.title || 'Untitled account'}
        </h3>
        {r.preview_text && (
          <p className="mt-1.5 text-[13px] text-gray-400 leading-relaxed line-clamp-2">
            {r.preview_text}
          </p>
        )}
        <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-purple-300">
          Read the account
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>
    </li>
  )
}

function RelatedFindingCard(props: { rf: RelatedFinding }) {
  var rf = props.rf
  return (
    <li>
      <Link
        href={'/lab/patterns/' + encodeURIComponent(rf.slug)}
        className={
          'block rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 ' +
          'hover:border-white/[0.18] hover:bg-white/[0.045] transition-colors h-full'
        }
      >
        <span className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
          Shares a family
        </span>
        <h3 className="mt-1.5 text-[14.5px] sm:text-[15px] text-white leading-snug">
          {rf.headline}
        </h3>
        <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-purple-300">
          See the breakdown
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>
    </li>
  )
}

/**
 * ShareButton — Sprint 2 will replace this with proper share-card PNG
 * generation against api/og infrastructure. For now we surface the
 * affordance and degrade gracefully:
 *   1. Web Share API on platforms that support it (mobile Safari, etc.)
 *   2. Clipboard copy fallback (most desktops)
 *   3. The button stays a button; no broken interaction.
 */
function ShareButton(props: { slug: string; headline: string }) {
  function handleShare() {
    if (typeof window === 'undefined') return
    var url = window.location.origin + '/lab/patterns/' + encodeURIComponent(props.slug)
    var nav = (window as any).navigator
    if (nav && typeof nav.share === 'function') {
      try {
        nav.share({ title: props.headline, text: props.headline, url: url })
        return
      } catch (_e) {
        /* fall through to clipboard */
      }
    }
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        nav.clipboard.writeText(url)
      } catch (_e) { /* no-op */ }
    }
  }
  return (
    <button
      type="button"
      onClick={handleShare}
      className={
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12.5px] ' +
        'text-purple-200 border border-purple-500/30 bg-purple-950/30 ' +
        'hover:bg-purple-950/50 transition-colors min-h-[40px]'
      }
      aria-label="Share this Finding"
    >
      <Share2 className="w-3.5 h-3.5" />
      Share this Finding
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers (server-side)                                                      */
/* -------------------------------------------------------------------------- */

function stripMd(s: string): string {
  if (!s) return ''
  return String(s).replace(/[\*\_`]/g, '').trim()
}

function buildPreview(text: string | null | undefined): string | null {
  if (!text) return null
  var t = String(text).trim()
  if (t.length === 0) return null
  if (t.length <= 140) return t
  return t.slice(0, 140).trim() + '…'
}

/* -------------------------------------------------------------------------- */
/* getStaticPaths + getStaticProps                                            */
/* -------------------------------------------------------------------------- */

export const getStaticPaths: GetStaticPaths = async function () {
  // We don't pre-render every published slug at build time — the
  // catalogue is small enough today that on-demand ISR is the right
  // posture (most slugs see traffic from a few share links). `blocking`
  // means the first request renders server-side and is then cached
  // for `revalidate` seconds.
  return { paths: [], fallback: 'blocking' }
}

export const getStaticProps: GetStaticProps<PageProps> = async function (ctx) {
  var slug = (ctx.params && (ctx.params as any).slug) || ''
  if (!slug || typeof slug !== 'string') {
    return { notFound: true, revalidate: 60 }
  }

  var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { notFound: true, revalidate: 60 }
  }
  var svc = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 1. Fetch the catalogue row.
  var findingRes: any
  try {
    findingRes = await (svc.from('findings_catalogue' as any) as any)
      .select(
        'id, slug, eyebrow_type, headline, descriptor, phen_families, denominator_n, ' +
        'denominator_n_label, interpretive_sentence, representative_report_ids, published',
      )
      .eq('slug', slug)
      .maybeSingle()
  } catch (_e) {
    return { notFound: true, revalidate: 60 }
  }

  if (!findingRes || findingRes.error || !findingRes.data) {
    return { notFound: true, revalidate: 60 }
  }
  var row: any = findingRes.data
  if (!row.published) {
    // Unpublished rows do not render on the public surface — same
    // posture as the listing API (api/lab/patterns/list.ts).
    return { notFound: true, revalidate: 60 }
  }

  var phenFamilies: FindingFamilyBreakdown[] = Array.isArray(row.phen_families)
    ? (row.phen_families as any[]).map(function (p) {
        return {
          family_slug: String(p.family_slug || ''),
          family_label: String(p.family_label || ''),
          count: Number(p.count) || 0,
          total_in_family: Number(p.total_in_family) || 0,
          pct: Number(p.pct) || 0,
        }
      })
    : []

  // 2. Fetch representative reports by ID. Limit 5 — the page shows
  //    up to 5 cards; anything beyond that crowds the section.
  var repIds: string[] = Array.isArray(row.representative_report_ids)
    ? (row.representative_report_ids as any[]).map(function (x) {
        return String(x)
      })
    : []
  var reps: RepresentativeReport[] = []
  if (repIds.length > 0) {
    try {
      var repsRes: any = await svc
        .from('reports')
        .select('id, slug, title, location_text, event_date, paradocs_narrative, category, status')
        .in('id', repIds.slice(0, 5))
        .eq('status', 'approved')
      var repsRows: any[] = (repsRes.data as any[]) || []
      // Preserve the order specified in representative_report_ids so the
      // family ordering is editorial-stable.
      var byId: Record<string, any> = {}
      for (var ri = 0; ri < repsRows.length; ri++) {
        byId[String(repsRows[ri].id)] = repsRows[ri]
      }
      for (var rj = 0; rj < repIds.length; rj++) {
        var rr = byId[repIds[rj]]
        if (!rr) continue
        reps.push({
          id: String(rr.id),
          slug: String(rr.slug || rr.id),
          title: rr.title || null,
          location_text: rr.location_text || null,
          event_date: rr.event_date || null,
          preview_text: buildPreview(rr.paradocs_narrative),
          category: rr.category || null,
        })
      }
    } catch (_e) {
      /* defensive — representative section just renders empty */
    }
  }

  // 3. Fetch 2-3 related Findings — rows that share at least one
  //    phen-family slug with the current Finding. We fetch the
  //    catalogue (published only), then filter in-process; the
  //    catalogue is small (≤ 20 rows currently), so in-process
  //    filtering is fine and avoids a Postgres JSONB containment
  //    query path that the executor doesn't currently use.
  var thisFamilySlugs = phenFamilies.map(function (p) {
    return p.family_slug
  })
  var related: RelatedFinding[] = []
  try {
    var relRes: any = await (svc.from('findings_catalogue' as any) as any)
      .select('id, slug, headline, phen_families')
      .eq('published', true)
      .neq('slug', slug)
      .order('publish_order', { ascending: true, nullsFirst: false })
      .limit(20)
    var relRows: any[] = (relRes.data as any[]) || []
    for (var rk = 0; rk < relRows.length; rk++) {
      var rrow: any = relRows[rk]
      var rrowFams: any[] = Array.isArray(rrow.phen_families) ? rrow.phen_families : []
      var sharedSlug: string | null = null
      for (var fk = 0; fk < rrowFams.length; fk++) {
        var sl = String(rrowFams[fk].family_slug || '')
        if (sl && thisFamilySlugs.indexOf(sl) !== -1) {
          sharedSlug = sl
          break
        }
      }
      if (sharedSlug) {
        related.push({
          id: String(rrow.id),
          slug: String(rrow.slug),
          headline: String(rrow.headline),
          shared_family_slug: sharedSlug,
        })
      }
      if (related.length >= 3) break
    }
  } catch (_e) {
    /* defensive — related section just renders empty */
  }

  var commentary = getDescriptorCommentary(String(row.descriptor))

  var payload: FindingDetailPayload = {
    id: String(row.id),
    slug: String(row.slug),
    eyebrow_type: String(row.eyebrow_type || 'cross_cutting_descriptor'),
    headline: String(row.headline || ''),
    descriptor: String(row.descriptor || ''),
    phen_families: phenFamilies,
    denominator_n: Number(row.denominator_n) || 0,
    denominator_n_label: String(row.denominator_n_label || ''),
    interpretive_sentence: String(row.interpretive_sentence || ''),
    representative_reports: reps,
    related_findings: related,
    commentary: commentary,
  }

  return {
    props: { payload: payload },
    revalidate: 300,
  }
}
