/**
 * Digest Service
 *
 * Generates personalized weekly anomaly reports for each opted-in user.
 * Aggregates trending reports, streak data, nearby activity, and
 * category-specific highlights into a structured digest.
 */

import { createServerClient } from '@/lib/supabase'

// ============================================
// TYPES
// ============================================

export interface DigestReport {
  id: string
  title: string
  slug: string
  category: string
  location_text: string | null
  event_date: string | null
  view_count: number
  credibility_score: number | null
}

export interface DigestStreak {
  current_streak: number
  longest_streak: number
  total_activities: number
}

export interface DigestSection {
  title: string
  icon: string
  items: DigestReport[]
}

export interface UserDigestData {
  user_id: string
  user_email: string
  display_name: string | null
  week_start: string
  week_end: string
  greeting: string
  streak: DigestStreak | null
  journal_count: number
  sections: DigestSection[]
  total_new_reports: number
  top_category: string | null
  unsubscribe_url: string
}

// ============================================
// CATEGORY DISPLAY CONFIG
// ============================================

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  ufo: { label: 'UFO Sightings', icon: '🛸' },
  cryptid: { label: 'Cryptid Encounters', icon: '🦶' },
  ghost: { label: 'Ghost & Hauntings', icon: '👻' },
  psychic: { label: 'Psychic Phenomena', icon: '🔮' },
  conspiracy: { label: 'Conspiracies', icon: '🕵️' },
  mythological: { label: 'Mythological', icon: '🐉' },
  extraterrestrial: { label: 'Extraterrestrial', icon: '👽' },
  other: { label: 'Other Anomalies', icon: '❓' },
}

// ============================================
// DIGEST GENERATION
// ============================================

/**
 * Get all users who have opted in to weekly digests
 */
export async function getDigestOptedInUsers(): Promise<Array<{
  id: string
  email: string
  display_name: string | null
  interested_categories: string[] | null
  location_state: string | null
}>> {
  const supabase = createServerClient()

  // Get profiles where notification_settings has email_weekly_digest = true
  const { data, error } = await (supabase
    .from('profiles') as any)
    .select('id, email, display_name, interested_categories, location_state, notification_settings')
    .not('email', 'is', null)

  if (error) {
    console.error('[Digest] Error fetching opted-in users:', error)
    return []
  }

  // Filter to users who have opted in
  return (data || []).filter((user: any) => {
    const settings = user.notification_settings
    return settings && settings.email_weekly_digest === true
  }).map((user: any) => ({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    interested_categories: user.interested_categories,
    location_state: user.location_state,
  }))
}

/**
 * Generate digest data for a single user
 */
export async function generateUserDigest(
  userId: string,
  userEmail: string,
  displayName: string | null,
  interestedCategories: string[] | null,
  weekStart: Date,
  weekEnd: Date
): Promise<UserDigestData> {
  const supabase = createServerClient()
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com'

  // Run all queries in parallel
  const [
    trendingResult,
    categoryResults,
    streakResult,
    journalResult,
    totalNewResult,
  ] = await Promise.all([
    // 1. Trending reports this week (most viewed)
    (supabase
      .from('reports') as any)
      .select('id, title, slug, category, location_text, event_date, view_count, credibility_score')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .eq('status', 'published')
      .order('view_count', { ascending: false })
      .limit(5),

    // 2. Reports in user's interested categories
    interestedCategories && interestedCategories.length > 0
      ? (supabase
          .from('reports') as any)
          .select('id, title, slug, category, location_text, event_date, view_count, credibility_score')
          .in('category', interestedCategories)
          .gte('created_at', weekStart.toISOString())
          .lte('created_at', weekEnd.toISOString())
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // 3. User streak data
    (supabase
      .from('user_streaks') as any)
      .select('current_streak, longest_streak, total_activities')
      .eq('user_id', userId)
      .single(),

    // 4. Journal entries this week
    (supabase
      .from('journal_entries') as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString()),

    // 5. Total new reports this week
    (supabase
      .from('reports') as any)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString()),
  ])

  // Build sections
  const sections: DigestSection[] = []

  // Trending section
  if (trendingResult.data && trendingResult.data.length > 0) {
    sections.push({
      title: 'Trending This Week',
      icon: '🔥',
      items: trendingResult.data.slice(0, 5),
    })
  }

  // Category-specific sections
  if (categoryResults.data && categoryResults.data.length > 0) {
    // Group by category
    const byCategory = new Map<string, DigestReport[]>()
    for (const report of categoryResults.data) {
      const cat = report.category || 'other'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(report)
    }

    Array.from(byCategory.entries()).forEach(([category, reports]) => {
      const config = CATEGORY_LABELS[category] || CATEGORY_LABELS.other
      sections.push({
        title: `New in ${config.label}`,
        icon: config.icon,
        items: reports.slice(0, 3),
      })
    })
  }

  // Find top category this week
  let topCategory: string | null = null
  if (trendingResult.data && trendingResult.data.length > 0) {
    const categoryCounts = new Map<string, number>()
    for (const r of trendingResult.data) {
      const cat = r.category || 'other'
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1)
    }
    let maxCount = 0
    Array.from(categoryCounts.entries()).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count
        topCategory = cat
      }
    })
  }

  // Generate greeting
  const name = displayName || 'Investigator'
  const greetings = [
    `Here's what stirred in the shadows this week, ${name}.`,
    `Your weekly briefing is ready, ${name}.`,
    `The anomalies don't rest, and neither do we. Here's your update, ${name}.`,
    `Another week of unexplained activity. Here's what you need to know, ${name}.`,
    `Strange things happened this week. Let's review, ${name}.`,
  ]
  const greeting = greetings[Math.floor(Math.random() * greetings.length)]

  return {
    user_id: userId,
    user_email: userEmail,
    display_name: displayName,
    week_start: weekStartStr,
    week_end: weekEndStr,
    greeting,
    streak: streakResult.data || null,
    journal_count: journalResult.count || 0,
    sections,
    total_new_reports: totalNewResult.count || 0,
    top_category: topCategory,
    unsubscribe_url: `${baseUrl}/dashboard/settings`,
  }
}

/**
 * Store a generated digest in the database
 */
export async function storeDigest(
  userId: string,
  weekStart: string,
  weekEnd: string,
  digestData: UserDigestData
): Promise<string | null> {
  const supabase = createServerClient()

  const { data, error } = await (supabase
    .from('weekly_digests') as any)
    .upsert({
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      digest_data: digestData,
    }, { onConflict: 'user_id,week_start' })
    .select('id')
    .single()

  if (error) {
    console.error('[Digest] Error storing digest:', error)
    return null
  }

  return data?.id || null
}

/**
 * Mark a digest as emailed
 */
export async function markDigestEmailed(digestId: string): Promise<void> {
  const supabase = createServerClient()
  await (supabase
    .from('weekly_digests') as any)
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', digestId)
}

/**
 * Mark a digest as read (for in-app viewing)
 */
export async function markDigestRead(digestId: string): Promise<void> {
  const supabase = createServerClient()
  await (supabase
    .from('weekly_digests') as any)
    .update({ read_at: new Date().toISOString() })
    .eq('id', digestId)
}

// ============================================
// EMAIL TEMPLATE
// ============================================

/**
 * Generate the HTML email for a weekly digest
 */
export function generateDigestEmailHtml(digest: UserDigestData): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com'

  const renderReport = (report: DigestReport): string => {
    const catConfig = CATEGORY_LABELS[report.category] || CATEGORY_LABELS.other
    const location = report.location_text ? ` · ${report.location_text}` : ''
    return `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #2d2d3f;">
          <a href="${baseUrl}/report/${report.slug}" style="color: #c084fc; text-decoration: none; font-weight: 600; font-size: 15px;">
            ${catConfig.icon} ${escapeHtml(report.title)}
          </a>
          <div style="color: #9ca3af; font-size: 13px; margin-top: 4px;">
            ${catConfig.label}${location}
            ${report.view_count > 0 ? ` · ${report.view_count} views` : ''}
          </div>
        </td>
      </tr>
    `
  }

  const renderSection = (section: DigestSection): string => {
    if (section.items.length === 0) return ''
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px 0 8px 0;">
            <h2 style="color: #e5e7eb; font-size: 18px; margin: 0; font-weight: 600;">
              ${section.icon} ${escapeHtml(section.title)}
            </h2>
          </td>
        </tr>
        ${section.items.map(renderReport).join('')}
      </table>
    `
  }

  // Stats row
  const statsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        ${digest.streak ? `
        <td style="text-align: center; padding: 16px; background: #1e1b2e; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: #f97316;">🔥 ${digest.streak.current_streak}</div>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">Day Streak</div>
        </td>
        <td style="width: 12px;"></td>
        ` : ''}
        <td style="text-align: center; padding: 16px; background: #1e1b2e; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: #c084fc;">${digest.total_new_reports}</div>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">New Reports</div>
        </td>
        <td style="width: 12px;"></td>
        <td style="text-align: center; padding: 16px; background: #1e1b2e; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: #60a5fa;">📓 ${digest.journal_count}</div>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">Journal Entries</div>
        </td>
      </tr>
    </table>
  `

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Anomaly Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a1a;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="text-align: center; padding: 32px 0 24px 0;">
              <h1 style="color: #c084fc; font-size: 24px; margin: 0 0 4px 0; letter-spacing: 1px;">
                ✦ PARADOCS ✦
              </h1>
              <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">
                Weekly Anomaly Report
              </div>
              <div style="color: #4b5563; font-size: 12px; margin-top: 8px;">
                ${escapeHtml(digest.week_start)} — ${escapeHtml(digest.week_end)}
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 0 0 24px 0;">
              <p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin: 0;">
                ${escapeHtml(digest.greeting)}
              </p>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td>${statsHtml}</td>
          </tr>

          <!-- Sections -->
          <tr>
            <td>
              ${digest.sections.map(renderSection).join('')}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="text-align: center; padding: 24px 0;">
              <a href="${baseUrl}/dashboard" style="
                display: inline-block;
                background: linear-gradient(135deg, #7c3aed, #a855f7);
                color: white;
                text-decoration: none;
                padding: 14px 32px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 15px;
              ">
                Open Your Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 16px 0; border-top: 1px solid #1f2937; text-align: center;">
              <p style="color: #4b5563; font-size: 12px; margin: 0 0 8px 0;">
                You're receiving this because you opted in to weekly digests.
              </p>
              <a href="${escapeHtml(digest.unsubscribe_url)}" style="color: #6b7280; font-size: 12px; text-decoration: underline;">
                Manage email preferences
              </a>
              <p style="color: #374151; font-size: 11px; margin: 16px 0 0 0;">
                © ${new Date().getFullYear()} ParaDocs · The world's largest paranormal database
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
