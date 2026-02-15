/**
 * API: POST /api/cron/smart-alerts
 *
 * Background job that checks for new reports matching user preferences
 * and sends email notifications. Max 3 alerts per user per week.
 *
 * Triggered after new report ingestion or on a schedule.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/services/email.service';

var MAX_ALERTS_PER_WEEK = 3;
var LOOKBACK_HOURS = 24;

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
    var stats = { users_checked: 0, alerts_sent: 0, errors: 0 };

    // Get users who have smart alerts enabled
    var usersResult = await (supabase
      .from('profiles') as any)
      .select('id, email, display_name, interested_categories, location_state, notification_settings')
      .not('email', 'is', null);

    if (usersResult.error) {
      console.error('[SmartAlerts] Error fetching users:', usersResult.error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Filter to users with smart alerts enabled
    var eligibleUsers = (usersResult.data || []).filter(function(user: any) {
      var settings = user.notification_settings;
      return settings && settings.smart_alerts !== false;
    });

    // Get new reports from the last LOOKBACK_HOURS
    var lookbackTime = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    var reportsResult = await supabase
      .from('reports')
      .select('id, title, slug, category, location_name, latitude, longitude, event_date, tags, summary, credibility_score')
      .eq('status', 'approved')
      .gte('created_at', lookbackTime)
      .order('created_at', { ascending: false })
      .limit(100);

    if (reportsResult.error) {
      console.error('[SmartAlerts] Error fetching new reports:', reportsResult.error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    var newReports = reportsResult.data || [];
    if (newReports.length === 0) {
      return res.status(200).json({ message: 'No new reports to alert on', stats: stats });
    }

    // Process each eligible user
    for (var i = 0; i < eligibleUsers.length; i++) {
      var user = eligibleUsers[i];
      stats.users_checked++;

      try {
        // Check how many alerts sent this week
        var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        var alertCountResult = await (supabase
          .from('smart_alert_log') as any)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('sent_at', weekAgo);

        var alertsSentThisWeek = alertCountResult.count || 0;
        if (alertsSentThisWeek >= MAX_ALERTS_PER_WEEK) {
          continue; // Skip - already at weekly limit
        }

        // Find matching reports for this user
        var matches = findMatchingReports(user, newReports);
        if (matches.length === 0) {
          continue; // No matches for this user
        }

        // Check if we already alerted on these reports
        var matchIds = matches.map(function(m: any) { return m.id; });
        var existingAlerts = await (supabase
          .from('smart_alert_log') as any)
          .select('report_id')
          .eq('user_id', user.id)
          .in('report_id', matchIds);

        var alreadyAlerted = new Set((existingAlerts.data || []).map(function(a: any) { return a.report_id; }));
        var newMatches = matches.filter(function(m: any) { return !alreadyAlerted.has(m.id); });

        if (newMatches.length === 0) {
          continue;
        }

        // Take top 3 matches
        var topMatches = newMatches.slice(0, 3);

        // Send alert email
        var emailHtml = generateAlertEmail(user, topMatches);
        var emailResult = await sendEmail({
          to: user.email,
          subject: getAlertSubject(topMatches),
          html: emailHtml,
          tags: [{ name: 'type', value: 'smart-alert' }]
        });

        if (emailResult.success) {
          stats.alerts_sent++;

          // Log the alerts
          var logEntries = topMatches.map(function(m: any) {
            return {
              user_id: user.id,
              report_id: m.id,
              match_reason: m.matchReason,
              sent_at: new Date().toISOString()
            };
          });

          await (supabase
            .from('smart_alert_log') as any)
            .insert(logEntries);
        }
      } catch (err) {
        console.error('[SmartAlerts] Error processing user ' + user.id + ':', err);
        stats.errors++;
      }
    }

    return res.status(200).json({
      message: 'Smart alerts processing complete',
      stats: stats
    });
  } catch (error) {
    console.error('[SmartAlerts] Fatal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function findMatchingReports(user: any, reports: any[]) {
  var userCategories = user.interested_categories || [];
  var userState = user.location_state;
  var matches: any[] = [];

  for (var i = 0; i < reports.length; i++) {
    var report = reports[i];
    var score = 0;
    var reasons: string[] = [];

    // Category match
    if (userCategories.length > 0 && userCategories.includes(report.category)) {
      score += 3;
      reasons.push('Matches your interest in ' + report.category);
    }

    // Location match (same state/region)
    if (userState && report.location_name) {
      var locLower = report.location_name.toLowerCase();
      if (locLower.includes(userState.toLowerCase())) {
        score += 2;
        reasons.push('Near your area (' + userState + ')');
      }
    }

    // High credibility bonus
    if (report.credibility_score && report.credibility_score >= 0.7) {
      score += 1;
      reasons.push('High credibility report');
    }

    if (score >= 2) {
      matches.push({
        id: report.id,
        title: report.title,
        slug: report.slug,
        category: report.category,
        location_name: report.location_name,
        summary: report.summary,
        score: score,
        matchReason: reasons.join('; ')
      });
    }
  }

  matches.sort(function(a, b) { return b.score - a.score; });
  return matches;
}

function getAlertSubject(matches: any[]) {
  if (matches.length === 1) {
    return 'New report matches your interests: ' + matches[0].title;
  }
  return matches.length + ' new reports match your interests';
}

function generateAlertEmail(user: any, matches: any[]) {
  var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';
  var name = user.display_name || 'Investigator';

  var reportCards = matches.map(function(m: any) {
    var summary = m.summary ? m.summary.substring(0, 150) + '...' : '';
    var location = m.location_name ? ' · ' + m.location_name : '';
    return '<tr><td style="padding: 16px; background: #1e1b2e; border-radius: 8px; margin-bottom: 12px;">' +
      '<a href="' + baseUrl + '/report/' + m.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600; font-size: 16px;">' +
      escapeHtml(m.title) + '</a>' +
      '<div style="color: #9ca3af; font-size: 13px; margin-top: 4px;">' + escapeHtml(m.category) + location + '</div>' +
      (summary ? '<div style="color: #d1d5db; font-size: 14px; margin-top: 8px; line-height: 1.5;">' + escapeHtml(summary) + '</div>' : '') +
      '<div style="color: #8b5cf6; font-size: 12px; margin-top: 8px;">' + escapeHtml(m.matchReason) + '</div>' +
      '</td></tr><tr><td style="height: 12px;"></td></tr>';
  }).join('');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a1a;"><tr><td align="center" style="padding: 24px 16px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">' +
    '<tr><td style="text-align: center; padding: 32px 0 16px 0;">' +
    '<h1 style="color: #c084fc; font-size: 20px; margin: 0;">PARADOCS</h1>' +
    '<div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Smart Alert</div></td></tr>' +
    '<tr><td style="padding: 0 0 24px 0;">' +
    '<p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin: 0;">' +
    'Hey ' + escapeHtml(name) + ', we found new reports that match your research interests.</p></td></tr>' +
    '<tr><td><table width="100%" cellpadding="0" cellspacing="0">' + reportCards + '</table></td></tr>' +
    '<tr><td style="text-align: center; padding: 24px 0;">' +
    '<a href="' + baseUrl + '/explore" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">' +
    'Explore More Reports</a></td></tr>' +
    '<tr><td style="padding: 32px 0 16px 0; border-top: 1px solid #1f2937; text-align: center;">' +
    '<p style="color: #4b5563; font-size: 12px; margin: 0 0 8px 0;">You receive these because smart alerts are enabled.</p>' +
    '<a href="' + baseUrl + '/dashboard/settings" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Manage alert preferences</a>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
