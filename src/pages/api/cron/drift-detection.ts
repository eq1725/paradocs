/**
 * API: POST /api/cron/drift-detection
 *
 * 7-day drift detection: emails users who haven't visited in 7+ days.
 * "We noticed you haven't been back" + personalized content hook.
 * Max 1 drift email per user per 30 days.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/services/email.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var authHeader = req.headers.authorization;
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var supabase = createServerClient();
    var stats = { checked: 0, emails_sent: 0, errors: 0 };
    var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';

    var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get users who haven't been active in 7+ days
    // Use user_streaks table to check last activity
    var inactiveResult = await (supabase
      .from('user_streaks') as any)
      .select('user_id, last_activity_date, current_streak, longest_streak')
      .lt('last_activity_date', sevenDaysAgo)
      .limit(100);

    if (inactiveResult.error) {
      console.error('[DriftDetection] Error fetching inactive users:', inactiveResult.error);
      return res.status(200).json({ message: 'Could not check streaks', stats: stats });
    }

    var inactiveUsers = inactiveResult.data || [];
    if (inactiveUsers.length === 0) {
      return res.status(200).json({ message: 'No inactive users found', stats: stats });
    }

    // Get user profiles for these users
    var userIds = inactiveUsers.map(function(u: any) { return u.user_id; });
    var profilesResult = await (supabase
      .from('profiles') as any)
      .select('id, email, display_name, interested_categories, notification_settings')
      .in('id', userIds)
      .not('email', 'is', null);

    if (profilesResult.error) {
      console.error('[DriftDetection] Error fetching profiles:', profilesResult.error);
      return res.status(500).json({ error: 'Failed to fetch profiles' });
    }

    // Filter to users who allow drift emails
    var profiles = (profilesResult.data || []).filter(function(p: any) {
      var settings = p.notification_settings;
      return !settings || settings.drift_emails !== false;
    });

    // Check who already got a drift email in the last 30 days
    var driftLogResult = await (supabase
      .from('drift_email_log') as any)
      .select('user_id')
      .in('user_id', profiles.map(function(p: any) { return p.id; }))
      .gte('sent_at', thirtyDaysAgo);

    var recentlySent = new Set((driftLogResult.data || []).map(function(d: any) { return d.user_id; }));

    // Get fresh content to entice them back
    var trendingResult = await supabase
      .from('reports')
      .select('id, title, slug, category, view_count')
      .eq('status', 'approved')
      .order('view_count', { ascending: false })
      .limit(3);

    var trendingReports = trendingResult.data || [];

    // Build streak lookup
    var streakMap: Record<string, any> = {};
    inactiveUsers.forEach(function(u: any) { streakMap[u.user_id] = u; });

    for (var i = 0; i < profiles.length; i++) {
      var profile = profiles[i];
      stats.checked++;

      if (recentlySent.has(profile.id)) {
        continue; // Already sent drift email recently
      }

      try {
        var streak = streakMap[profile.id];
        var name = profile.display_name || 'Investigator';
        var longestStreak = streak ? streak.longest_streak : 0;

        var html = generateDriftEmail(name, longestStreak, trendingReports, baseUrl);
        var subject = longestStreak > 3
          ? 'Your ' + longestStreak + '-day research streak is at risk'
          : 'New reports are waiting for you';

        var emailResult = await sendEmail({
          to: profile.email,
          subject: subject,
          html: html,
          tags: [{ name: 'type', value: 'drift-detection' }]
        });

        if (emailResult.success) {
          stats.emails_sent++;
          await (supabase.from('drift_email_log') as any)
            .insert({ user_id: profile.id, sent_at: new Date().toISOString() });
        }
      } catch (err) {
        console.error('[DriftDetection] Error for user ' + profile.id + ':', err);
        stats.errors++;
      }
    }

    return res.status(200).json({ message: 'Drift detection complete', stats: stats });
  } catch (error) {
    console.error('[DriftDetection] Fatal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function generateDriftEmail(name: string, longestStreak: number, reports: any[], baseUrl: string) {
  var streakSection = '';
  if (longestStreak > 3) {
    streakSection = '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; text-align: center; margin: 16px 0;">' +
      '<div style="font-size: 36px; font-weight: 700; color: #f97316;">&#x1F525; ' + longestStreak + '</div>' +
      '<div style="color: #9ca3af; font-size: 13px; margin-top: 4px;">Your longest research streak (days)</div>' +
      '<div style="color: #d1d5db; font-size: 14px; margin-top: 8px;">Don\'t let it fade. One visit keeps your streak alive.</div>' +
      '</div>';
  }

  var reportList = reports.map(function(r) {
    return '<tr><td style="padding: 10px 0; border-bottom: 1px solid #2d2d3f;">' +
      '<a href="' + baseUrl + '/report/' + r.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600;">' +
      esc(r.title) + '</a>' +
      '<div style="color: #9ca3af; font-size: 12px; margin-top: 2px;">' +
      esc(r.category || '') + ' · ' + (r.view_count || 0) + ' views</div>' +
      '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a1a;"><tr><td align="center" style="padding: 24px 16px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">' +
    '<tr><td style="text-align: center; padding: 32px 0 24px 0;">' +
    '<h1 style="color: #c084fc; font-size: 24px; margin: 0; letter-spacing: 1px;">PARADOCS</h1></td></tr>' +
    '<tr><td><h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">We miss you, ' + esc(name) + '</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">The unexplained doesn\'t take breaks, and neither should your research. Here\'s what you\'ve been missing:</p>' +
    streakSection +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">' + reportList + '</table>' +
    '</td></tr>' +
    '<tr><td style="text-align: center; padding: 24px 0;">' +
    '<a href="' + baseUrl + '/dashboard" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">' +
    'Resume Your Research</a></td></tr>' +
    '<tr><td style="padding: 32px 0 16px 0; border-top: 1px solid #1f2937; text-align: center;">' +
    '<a href="' + baseUrl + '/dashboard/settings" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Manage email preferences</a>' +
    '<p style="color: #374151; font-size: 11px; margin: 16px 0 0 0;">&copy; 2026 ParaDocs</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
