/**
 * API: POST /api/cron/winback
 *
 * Win-back email sequence for churned paid users.
 * Email 1 (Day 3 after churn): "We miss your research" + what they're missing
 * Email 2 (Day 10): Special offer / discount
 * Email 3 (Day 21): Final "door is always open" + community highlights
 * Max 1 sequence per user per 90 days.
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
    var stats = { checked: 0, email1_sent: 0, email2_sent: 0, email3_sent: 0, errors: 0 };
    var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';
    var now = Date.now();

    // Get churned users (had a subscription that ended)
    var churnedResult = await (supabase
      .from('user_subscriptions') as any)
      .select('user_id, plan_name, canceled_at, winback_stage, last_winback_at')
      .not('canceled_at', 'is', null)
      .order('canceled_at', { ascending: false })
      .limit(100);

    if (churnedResult.error) {
      // Table might not have winback columns yet
      if (churnedResult.error.message && churnedResult.error.message.includes('winback_stage')) {
        return res.status(200).json({ message: 'Winback columns not yet added to user_subscriptions', stats: stats });
      }
      console.error('[Winback] Error fetching churned users:', churnedResult.error);
      return res.status(500).json({ error: 'Failed to fetch churned users' });
    }

    var churned = churnedResult.data || [];
    if (churned.length === 0) {
      return res.status(200).json({ message: 'No churned users found', stats: stats });
    }

    // Get profiles for churned users
    var userIds = churned.map(function(c: any) { return c.user_id; });
    var profilesResult = await (supabase
      .from('profiles') as any)
      .select('id, email, display_name, notification_settings')
      .in('id', userIds)
      .not('email', 'is', null);

    if (profilesResult.error) {
      console.error('[Winback] Error fetching profiles:', profilesResult.error);
      return res.status(500).json({ error: 'Failed to fetch profiles' });
    }

    // Filter to users who allow marketing emails
    var profiles: Record<string, any> = {};
    (profilesResult.data || []).forEach(function(p: any) {
      var settings = p.notification_settings;
      if (!settings || settings.marketing_emails !== false) {
        profiles[p.id] = p;
      }
    });

    // Get trending content for email hooks
    var trendingResult = await supabase
      .from('reports')
      .select('id, title, slug, category, view_count')
      .eq('status', 'approved')
      .order('view_count', { ascending: false })
      .limit(5);

    var trendingReports = trendingResult.data || [];

    // Get community stats
    var statsResult = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    var totalReports = (statsResult as any).count || 0;

    for (var i = 0; i < churned.length; i++) {
      var sub = churned[i];
      var profile = profiles[sub.user_id];
      if (!profile) continue;

      stats.checked++;
      var stage = sub.winback_stage || 0;
      var canceledAt = new Date(sub.canceled_at).getTime();
      var daysSinceChurn = (now - canceledAt) / (1000 * 60 * 60 * 24);

      // Don't send if already completed sequence or too recent
      if (stage >= 3) continue;

      // Check 90-day cooldown
      if (sub.last_winback_at) {
        var lastWinback = new Date(sub.last_winback_at).getTime();
        var daysSinceLastWinback = (now - lastWinback) / (1000 * 60 * 60 * 24);
        if (daysSinceLastWinback < 90 && stage >= 3) continue;
      }

      try {
        var name = profile.display_name || 'Investigator';
        var planName = sub.plan_name || 'Pro';

        if (stage === 0 && daysSinceChurn >= 3) {
          // Email 1: "We miss your research"
          var html1 = generateWinbackEmail1(name, planName, trendingReports.slice(0, 3), baseUrl);
          var result1 = await sendEmail({
            to: profile.email,
            subject: 'Your research tools are waiting, ' + name,
            html: html1,
            tags: [{ name: 'type', value: 'winback-1' }]
          });
          if (result1.success) {
            stats.email1_sent++;
            await (supabase.from('user_subscriptions') as any)
              .update({ winback_stage: 1, last_winback_at: new Date().toISOString() })
              .eq('user_id', sub.user_id);
          }
        } else if (stage === 1 && daysSinceChurn >= 10) {
          // Email 2: Special offer
          var html2 = generateWinbackEmail2(name, planName, baseUrl);
          var result2 = await sendEmail({
            to: profile.email,
            subject: 'A special offer for you, ' + name,
            html: html2,
            tags: [{ name: 'type', value: 'winback-2' }]
          });
          if (result2.success) {
            stats.email2_sent++;
            await (supabase.from('user_subscriptions') as any)
              .update({ winback_stage: 2, last_winback_at: new Date().toISOString() })
              .eq('user_id', sub.user_id);
          }
        } else if (stage === 2 && daysSinceChurn >= 21) {
          // Email 3: "Door is always open"
          var html3 = generateWinbackEmail3(name, totalReports, trendingReports, baseUrl);
          var result3 = await sendEmail({
            to: profile.email,
            subject: 'The unexplained never stops - neither does ParaDocs',
            html: html3,
            tags: [{ name: 'type', value: 'winback-3' }]
          });
          if (result3.success) {
            stats.email3_sent++;
            await (supabase.from('user_subscriptions') as any)
              .update({ winback_stage: 3, last_winback_at: new Date().toISOString() })
              .eq('user_id', sub.user_id);
          }
        }
      } catch (err) {
        console.error('[Winback] Error for user ' + sub.user_id + ':', err);
        stats.errors++;
      }
    }

    return res.status(200).json({ message: 'Winback processing complete', stats: stats });
  } catch (error) {
    console.error('[Winback] Fatal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function generateWinbackEmail1(name: string, planName: string, reports: any[], baseUrl: string) {
  var reportList = reports.map(function(r) {
    return '<tr><td style="padding: 10px 0; border-bottom: 1px solid #2d2d3f;">' +
      '<a href="' + baseUrl + '/report/' + r.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600;">' +
      esc(r.title) + '</a>' +
      '<div style="color: #9ca3af; font-size: 12px; margin-top: 2px;">' +
      esc(r.category || '') + ' \u00B7 ' + (r.view_count || 0) + ' views</div>' +
      '</td></tr>';
  }).join('');

  return emailShell(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">We miss your research, ' + esc(name) + '</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Since you left, our community has been busy. Here are some things you\'re missing with your ' + esc(planName) + ' access:</p>' +
    '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; margin: 16px 0;">' +
    '<div style="color: #d1d5db; font-size: 14px; line-height: 2;">' +
    '<span style="color: #f97316;">\u2717</span> Unlimited AI research assistant queries<br>' +
    '<span style="color: #f97316;">\u2717</span> Advanced pattern detection across reports<br>' +
    '<span style="color: #f97316;">\u2717</span> Priority access to new features<br>' +
    '<span style="color: #f97316;">\u2717</span> Research journal with AI summaries' +
    '</div></div>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Meanwhile, these reports are trending:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">' + reportList + '</table>',
    baseUrl + '/dashboard/settings',
    'Reactivate Your Plan',
    baseUrl
  );
}

function generateWinbackEmail2(name: string, planName: string, baseUrl: string) {
  return emailShell(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">A special offer just for you</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Hey ' + esc(name) + ', we know life gets busy. But the unexplained waits for no one.</p>' +
    '<div style="padding: 24px; background: linear-gradient(135deg, #1e1b2e, #2d1f4e); border-radius: 12px; text-align: center; margin: 24px 0; border: 1px solid #7c3aed;">' +
    '<div style="color: #c084fc; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Welcome Back Offer</div>' +
    '<div style="color: #e5e7eb; font-size: 28px; font-weight: 700; margin: 12px 0;">20% Off</div>' +
    '<div style="color: #d1d5db; font-size: 15px;">your first month back on ' + esc(planName) + '</div>' +
    '<div style="color: #9ca3af; font-size: 13px; margin-top: 8px;">Use code: <span style="color: #f97316; font-weight: 600;">COMEBACK20</span></div>' +
    '</div>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Your saved reports, collections, and research journal are all still here, exactly as you left them.</p>',
    baseUrl + '/dashboard/settings',
    'Claim Your 20% Off',
    baseUrl
  );
}

function generateWinbackEmail3(name: string, totalReports: number, reports: any[], baseUrl: string) {
  var topReport = reports[0];
  var reportSnippet = topReport
    ? '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; border-left: 3px solid #8b5cf6; margin: 16px 0;">' +
      '<a href="' + baseUrl + '/report/' + topReport.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600;">' +
      esc(topReport.title) + '</a>' +
      '<div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">' + (topReport.view_count || 0) + ' views this week</div>' +
      '</div>'
    : '';

  return emailShell(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">The door is always open</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Hey ' + esc(name) + ', this is the last we\'ll reach out for a while. We just wanted you to know:</p>' +
    '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; text-align: center; margin: 16px 0;">' +
    '<div style="font-size: 32px; font-weight: 700; color: #c084fc;">' + totalReports.toLocaleString() + '+</div>' +
    '<div style="color: #9ca3af; font-size: 13px; margin-top: 4px;">reports in the ParaDocs database</div>' +
    '</div>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">The community is growing, and the mysteries keep coming. Your research contributions and saved work are preserved and waiting for you.</p>' +
    reportSnippet +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Free accounts still get access to browse and read. Whenever you\'re ready to dive deeper, we\'ll be here.</p>',
    baseUrl + '/explore',
    'Visit ParaDocs',
    baseUrl
  );
}

function emailShell(content: string, ctaUrl: string, ctaText: string, baseUrl: string) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a1a;"><tr><td align="center" style="padding: 24px 16px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">' +
    '<tr><td style="text-align: center; padding: 32px 0 24px 0;">' +
    '<h1 style="color: #c084fc; font-size: 24px; margin: 0; letter-spacing: 1px;">PARADOCS</h1></td></tr>' +
    '<tr><td>' + content + '</td></tr>' +
    '<tr><td style="text-align: center; padding: 24px 0;">' +
    '<a href="' + ctaUrl + '" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">' +
    ctaText + '</a></td></tr>' +
    '<tr><td style="padding: 32px 0 16px 0; border-top: 1px solid #1f2937; text-align: center;">' +
    '<a href="' + baseUrl + '/dashboard/settings" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Unsubscribe</a>' +
    '<p style="color: #374151; font-size: 11px; margin: 16px 0 0 0;">&copy; 2026 ParaDocs</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
