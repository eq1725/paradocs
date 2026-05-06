/**
 * POST /api/admin/leads/select-today
 *
 * V9.2 — selects Today's Lead phenomenon via auto-heuristic and
 * upserts a daily_leads row for today (UTC). Cron-friendly — call
 * once per day at 06:00 UTC or via a Vercel cron job.
 *
 * Selection heuristic (highest score wins):
 *   +5  anchor_case_hook present (and not __NEEDS_REVIEW__)
 *   +3  primary_image_url present
 *   +2  push_copy present (and not __NEEDS_REVIEW__)
 *   +log10(report_count) — capped at +5
 *   +2  unresolved_tension present (real curiosity gap)
 *   -10 has been Today's Lead in the last 30 days (avoid repeats)
 *
 * Body params (optional):
 *   { date: 'YYYY-MM-DD' }    — override which day to select for
 *   { force: true }           — overwrite editorial_locked rows too
 *
 * Editorial override:
 *   If a daily_leads row already exists for the date AND
 *   editorial_locked = true, the selector skips it (unless force=true).
 *   This protects manually-picked leads from the cron.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

function todayUTC(): string {
  var d = new Date()
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0')
}

function thirtyDaysAgoUTC(): string {
  var d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow GET for cron (Vercel cron jobs hit GET) AND POST for admin tools
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth — admin key OR Vercel cron secret OR signed-in user (for manual)
  var adminKey = req.headers['x-admin-key']
  var isAuthed = false
  if (adminKey === process.env.ADMIN_API_KEY) isAuthed = true
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  if (!isAuthed) {
    var authHeader = req.headers.authorization || ''
    var cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  if (!isAuthed) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var supabase = getSupabaseAdmin()

  var targetDate = (req.body && req.body.date) || (req.query && (req.query.date as string)) || todayUTC()
  var force = !!((req.body && req.body.force) || (req.query && req.query.force === 'true'))

  // Check existing lead for the date
  var { data: existing } = await supabase
    .from('daily_leads')
    .select('id, phenomenon_id, report_id, editorial_locked, selection_method')
    .eq('lead_date', targetDate)
    .single()

  if (existing && existing.editorial_locked && !force) {
    return res.status(200).json({
      skipped: true,
      reason: 'editorial_locked',
      existing: existing,
    })
  }

  // Pull recent leads to avoid repeats
  var { data: recent } = await supabase
    .from('daily_leads')
    .select('phenomenon_id, report_id')
    .gte('lead_date', thirtyDaysAgoUTC())
  var recentPhenIds = new Set<string>()
  if (recent) {
    recent.forEach(function (r: any) {
      if (r.phenomenon_id) recentPhenIds.add(r.phenomenon_id)
    })
  }

  // Pull candidate phenomena (only ones with anchor + image + high counts)
  var { data: candidates, error } = await supabase
    .from('phenomena')
    .select('id, name, slug, category, primary_image_url, anchor_case_hook, push_copy, report_count, unresolved_tension')
    .eq('status', 'active')
    .not('anchor_case_hook', 'is', null)
    .not('primary_image_url', 'is', null)
    .order('report_count', { ascending: false })
    .limit(500)

  if (error || !candidates || candidates.length === 0) {
    console.error('[SelectLead] No candidates:', error)
    return res.status(500).json({ error: 'No candidates available' })
  }

  // Score candidates
  var scored: { phen: any; score: number; reasons: string[] }[] = []
  for (var i = 0; i < candidates.length; i++) {
    var p = candidates[i] as any
    var reasons: string[] = []
    var score = 0

    // Skip sentinels
    if (p.anchor_case_hook && p.anchor_case_hook.substring(0, 2) === '__') continue

    score += 5
    reasons.push('anchor_case_hook(+5)')

    if (p.primary_image_url) {
      score += 3
      reasons.push('image(+3)')
    }
    if (p.push_copy && p.push_copy.substring(0, 2) !== '__') {
      score += 2
      reasons.push('push_copy(+2)')
    }
    if (p.unresolved_tension) {
      score += 2
      reasons.push('tension(+2)')
    }

    var rc = p.report_count || 0
    if (rc > 0) {
      var logBoost = Math.min(5, Math.log10(rc + 1))
      score += logBoost
      reasons.push('reports=' + rc + '(+' + logBoost.toFixed(1) + ')')
    }

    if (recentPhenIds.has(p.id)) {
      score -= 10
      reasons.push('recent_lead(-10)')
    }

    scored.push({ phen: p, score: score, reasons: reasons })
  }

  if (scored.length === 0) {
    return res.status(500).json({ error: 'No scored candidates' })
  }

  scored.sort(function (a, b) { return b.score - a.score })
  var winner = scored[0]

  // Upsert
  var upsertPayload: any = {
    lead_date: targetDate,
    phenomenon_id: winner.phen.id,
    report_id: null,
    selection_method: 'auto_heuristic',
    selection_reason: winner.reasons.join(' | ') + ' | total=' + winner.score.toFixed(1),
    editorial_locked: false,
    updated_at: new Date().toISOString(),
  }

  var { error: upsertError } = await supabase
    .from('daily_leads')
    .upsert(upsertPayload, { onConflict: 'lead_date' })

  if (upsertError) {
    console.error('[SelectLead] Upsert error:', upsertError)
    return res.status(500).json({ error: 'Failed to upsert lead' })
  }

  return res.status(200).json({
    selected: true,
    lead_date: targetDate,
    phenomenon_id: winner.phen.id,
    name: winner.phen.name,
    slug: winner.phen.slug,
    score: winner.score,
    reasons: winner.reasons,
    runners_up: scored.slice(1, 4).map(function (s) {
      return { name: s.phen.name, score: s.score }
    }),
  })
}
