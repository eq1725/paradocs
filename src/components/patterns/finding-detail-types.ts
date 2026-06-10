// V11.18.7 — Sprint 1D — Finding detail-page types.
//
// Shapes for the per-Finding scholarly click-down page rendered by
// `/lab/patterns/[slug]`. Server-side `getStaticProps` fetches the
// catalogue row + the linked representative reports + 2-3 related
// Findings (Findings that share at least one phen-family slug with
// the current one). The page composes from these.
//
// Voice contract — the LAY-PERSON card and the DETAIL page are two
// different products with two different voices (per
// LAY_PERSON_FINDING_COPY.md §5). The detail page is NYT-data-
// journalism + scholarly footnote: taxonomy terms are allowed (with
// first-mention defining gloss), database verbs are OK, and the
// citation list lives here. The Finding Card stays clean.

import type { FindingFamilyBreakdown } from './FindingCard'

/**
 * Minimal representative-report shape — joined from the `reports`
 * table by `representative_report_ids`. The catalogue stores 3 IDs
 * (one per family); the detail page renders them as small cards.
 *
 * Only the fields the detail page needs are included; the full
 * report object is large and we want the page payload tight.
 */
export interface RepresentativeReport {
  id: string
  slug: string
  title: string | null
  location_text: string | null
  event_date: string | null
  /** First ~140 chars of the AI-rewritten narrative — never the raw
   *  source description, which is index-report ToS-restricted. */
  preview_text: string | null
  category: string | null
}

/**
 * The detail page's commentary block per descriptor. The text is
 * drawn from PATTERNS_TAXONOMY.md §2 (the per-domain table) and
 * named-source attributions. Sprint 1D ships these as static prose
 * keyed by descriptor slug; the detail-page renderer paraphrases
 * the cited works (no quotes — the taxonomy memo itself is the
 * citable secondary source).
 */
export interface DescriptorCommentary {
  /** Plain-English description of what the descriptor measures, including the
   *  keyword set used. First sentence is for the "What we're measuring"
   *  section. */
  measuring: string
  /** 2-3 short paragraph strings, scholarly framing. Cites taxonomy sources
   *  by name (Mack, Cheyne, Hufford, Hynek, etc.). No direct quotes —
   *  paraphrased per PATTERNS_TAXONOMY.md §2.A8 onward. */
  literature: string[]
}

/**
 * A "related Finding" — same shape as the FindingCard payload but
 * stripped to the surface fields the detail page renders (just the
 * headline + slug + a single family overlap).
 */
export interface RelatedFinding {
  id: string
  slug: string
  headline: string
  /** The single phen-family family_slug that overlaps with the current
   *  Finding (used for the "shares with this Finding" framing). */
  shared_family_slug: string
}

/**
 * Top-level page payload — the shape `getStaticProps` returns and the
 * page component consumes.
 */
export interface FindingDetailPayload {
  id: string
  slug: string
  eyebrow_type: string
  headline: string
  descriptor: string
  phen_families: FindingFamilyBreakdown[]
  denominator_n: number
  denominator_n_label: string
  interpretive_sentence: string
  representative_reports: RepresentativeReport[]
  related_findings: RelatedFinding[]
  commentary: DescriptorCommentary
}
