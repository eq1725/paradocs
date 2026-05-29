/**
 * GET/POST /api/cron/audit-taxonomy
 *
 * V11.17.41 — Daily taxonomy hygiene check.
 *
 * Runs the same audit that scripts/audit-category-counts.ts does, on
 * Vercel cron (daily 06:00 UTC). Report-only: it never mutates data.
 * Findings surface in Vercel function logs; if anything looks off
 * (drift > tolerance, orphan category values appearing, large
 * reports_total ≠ category_sum gap), operator sees them in the
 * dashboard and runs the matching fix script manually.
 *
 * Output (JSON, also console.log):
 *   {
 *     ok: true,
 *     reports_total_approved: number,
 *     per_category: { <cat>: number },
 *     uncategorized_gap: number,        // total_approved - sum(per_cat)
 *     orphan_categories: { <unknown_cat>: number },
 *     anomalies: string[],              // human-readable warnings
 *   }
 *
 * Anomaly triggers (logged):
 *   - any category value present in approved reports that is not in
 *     CANONICAL_CATEGORIES (deprecated value drift)
 *   - any canonical category with count < 50 (suspicious for a 100k+
 *     archive — likely phenomenon-vs-category drift like the
 *     religion_mythology=1 case we just fixed)
 *   - uncategorized_gap > 100 (rows escaping the canonical bucket set)
 *
 * Auth: same CRON_SECRET convention used by the other cron endpoints.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const CANONICAL_CATEGORIES = [
  'ufos_aliens',
  'cryptids',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
]

// Below this count a canonical category warrants investigation —
// likely report.category vs phenomenon.category drift.
const LOW_CATEGORY_FLOOR = 50

// Above this number of approved rows that don't sit in any canonical
// category, log an anomaly (drift / deprecated value re-introduction).
const UNCATEGORIZED_GAP_THRESHOLD = 100

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel cron fires GET; accept both for manual triggering convenience.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Per-canonical-category approved count.
    const perCategory: Record<string, number> = {}
    for (const cat of CANONICAL_CATEGORIES) {
      const { count, error } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', cat)
      if (error) {
        console.error('[CronAuditTaxonomy] count error for ' + cat + ': ' + error.message)
        perCategory[cat] = -1
        continue
      }
      perCategory[cat] = count || 0
    }

    // Total approved (any category).
    const { count: totalApproved } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
    const reportsTotalApproved = totalApproved || 0

    const canonicalSum = Object.values(perCategory).reduce((s, n) => s + Math.max(0, n), 0)
    const uncategorizedGap = reportsTotalApproved - canonicalSum

    // Orphan-category sweep: paginate approved rows, collect any
    // category value NOT in CANONICAL_CATEGORIES. We page through
    // distinct categories instead of every row to keep this cheap.
    //
    // Trick: subtract the canonical sum from the total. If the gap is
    // non-trivial, we paginate the leftovers to discover the orphan
    // values. Otherwise skip the paginate (cheap branch).
    const orphanCategories: Record<string, number> = {}
    if (uncategorizedGap > 0) {
      let from = 0
      const page = 1000
      const seenIds = new Set<string>()
      while (true) {
        const { data, error } = await supabase
          .from('reports')
          .select('id, category')
          .eq('status', 'approved')
          .not('category', 'in', '(' + CANONICAL_CATEGORIES.map((c) => '"' + c + '"').join(',') + ')')
          .range(from, from + page - 1)
        if (error) {
          console.error('[CronAuditTaxonomy] orphan paginate error: ' + error.message)
          break
        }
        if (!data || data.length === 0) break
        for (const r of data) {
          if (seenIds.has((r as any).id)) continue
          seenIds.add((r as any).id)
          const c = (r as any).category || '(null)'
          orphanCategories[c] = (orphanCategories[c] || 0) + 1
        }
        if (data.length < page) break
        from += page
        // Safety guard — don't paginate forever if the .not.in filter
        // is silently ignored by the client (shouldn't happen but cheap).
        if (from > 10000) break
      }
    }

    // Anomaly synthesis
    const anomalies: string[] = []
    for (const cat of CANONICAL_CATEGORIES) {
      if (perCategory[cat] >= 0 && perCategory[cat] < LOW_CATEGORY_FLOOR) {
        anomalies.push(
          'LOW_CATEGORY_FLOOR: ' + cat + ' has ' + perCategory[cat] + ' approved rows (<' + LOW_CATEGORY_FLOOR +
          '). Likely phenomenon-vs-category drift — run scripts/audit-category-counts.ts and consider a recategorize sweep.',
        )
      }
    }
    if (uncategorizedGap > UNCATEGORIZED_GAP_THRESHOLD) {
      anomalies.push(
        'UNCATEGORIZED_GAP: ' + uncategorizedGap + ' approved reports sit outside the canonical category list (>' +
        UNCATEGORIZED_GAP_THRESHOLD + '). Orphan values: ' + JSON.stringify(orphanCategories),
      )
    }
    for (const [cat, n] of Object.entries(orphanCategories)) {
      anomalies.push('ORPHAN_CATEGORY: "' + cat + '" → ' + n + ' approved rows. Run a recategorize sweep to map to a canonical bucket.')
    }

    // Log to Vercel function logs.
    console.log('[CronAuditTaxonomy] V11.17.41 — total approved: ' + reportsTotalApproved)
    for (const [cat, n] of Object.entries(perCategory)) {
      console.log('  ' + cat.padEnd(28) + ' ' + n)
    }
    console.log('  uncategorized_gap: ' + uncategorizedGap)
    if (anomalies.length > 0) {
      console.warn('[CronAuditTaxonomy] anomalies detected (' + anomalies.length + '):')
      for (const a of anomalies) console.warn('  ⚠ ' + a)
    } else {
      console.log('[CronAuditTaxonomy] no anomalies')
    }

    return res.status(200).json({
      ok: true,
      reports_total_approved: reportsTotalApproved,
      per_category: perCategory,
      uncategorized_gap: uncategorizedGap,
      orphan_categories: orphanCategories,
      anomalies,
    })
  } catch (e: any) {
    console.error('[CronAuditTaxonomy] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}
