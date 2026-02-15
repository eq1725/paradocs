/**
 * API: POST /api/cron/email-drip
 *
 * 3-email drip sequence for pre-signup leads from beta-signup.
 * Email 1 (Day 0): Welcome + top 3 reports
 * Email 2 (Day 3): "You missed this" + trending report
 * Email 3 (Day 7): "Your area has activity" + nearby reports + create account CTA
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
    var stats = { email1_sent: 0, email2_sent: 0, email3_sent: 0, errors: 0 };
    var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';

    // Get beta signups that need drip emails
    var signupsResult = await (supabase
      .from('beta_signups') as any)
      .select('id, email, created_at, drip_stage, last_drip_at')
      .is('unsubscribed_at', null)
      .lt('drip_stage', 3)
      .order('created_at', { ascending: true })
      .limit(100);

    if (signupsResult.error) {
      // Table might not have drip columns yet - add them
      if (signupsResult.error.message && signupsResult.error.message.includes('drip_stage')) {
        return res.status(200).json({ message: 'Drip columns not yet added to beta_signups table', stats: stats });
      }
      console.error('[EmailDrip] Error fetching signups:', signupsResult.error);
      return res.status(500).json({ error: 'Failed to fetch signups' });
    }

    var signups = signupsResult.data || [];
    if (signups.length === 0) {
      return res.status(200).json({ message: 'No signups to drip', stats: stats });
    }

    // Get trending reports for email content
    var trendingResult = await supabase
      .from('reports')
      .select('id, title, slug, category, location_name, summary, view_count')
      .eq('status', 'approved')
      .order('view_count', { ascending: false })
      .limit(5);

    var trendingReports = trendingResult.data || [];
    var now = Date.now();

    for (var i = 0; i < signups.length; i++) {
      var signup = signups[i];
      var stage = signup.drip_stage || 0;
      var createdAt = new Date(signup.created_at).getTime();
      var daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);

      try {
        if (stage === 0 && daysSinceSignup >= 0) {
          // Email 1: Welcome (send immediately or on first cron after signup)
          var html1 = generateDripEmail1(signup.email, trendingReports.slice(0, 3), baseUrl);
          var result1 = await sendEmail({
            to: signup.email,
            subject: 'Welcome to ParaDocs - The unexplained awaits',
            html: html1,
            tags: [{ name: 'type', value: 'drip-1' }]
          });
          if (result1.success) {
            stats.email1_sent++;
            await (supabase.from('beta_signups') as any)
              .update({ drip_stage: 1, last_drip_at: new Date().toISOString() })
              .eq('id', signup.id);
          }
        } else if (stage === 1 && daysSinceSignup >= 3) {
          // Email 2: "You missed this" (Day 3)
          var topReport = trendingReports[0];
          if (topReport) {
            var html2 = generateDripEmail2(signup.email, topReport, baseUrl);
            var result2 = await sendEmail({
              to: signup.email,
              subject: 'While you were away, something unexplained happened...',
              html: html2,
              tags: [{ name: 'type', value: 'drip-2' }]
            });
            if (result2.success) {
              stats.email2_sent++;
              await (supabase.from('beta_signups') as any)
                .update({ drip_stage: 2, last_drip_at: new Date().toISOString() })
                .eq('id', signup.id);
            }
          }
        } else if (stage === 2 && daysSinceSignup >= 7) {
          // Email 3: "Your area has activity" (Day 7)
          var html3 = generateDripEmail3(signup.email, trendingReports, baseUrl);
          var result3 = await sendEmail({
            to: signup.email,
            subject: 'Create your free account - your research awaits',
            html: html3,
            tags: [{ name: 'type', value: 'drip-3' }]
          });
          if (result3.success) {
            stats.email3_sent++;
            await (supabase.from('beta_signups') as any)
              .update({ drip_stage: 3, last_drip_at: new Date().toISOString() })
              .eq('id', signup.id);
          }
        }
      } catch (err) {
        console.error('[EmailDrip] Error for ' + signup.email + ':', err);
        stats.errors++;
      }
    }

    return res.status(200).json({ message: 'Email drip processing complete', stats: stats });
  } catch (error) {
    console.error('[EmailDrip] Fatal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function generateDripEmail1(email: string, reports: any[], baseUrl: string) {
  var reportList = reports.map(function(r) {
    return '<tr><td style="padding: 12px 0; border-bottom: 1px solid #2d2d3f;">' +
      '<a href="' + baseUrl + '/report/' + r.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600;">' +
      esc(r.title) + '</a>' +
      '<div style="color: #9ca3af; font-size: 13px; margin-top: 4px;">' +
      esc(r.category || '') + (r.location_name ? ' · ' + esc(r.location_name) : '') +
      '</div></td></tr>';
  }).join('');

  return emailWrap(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">Welcome to ParaDocs</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">You just joined the world\'s largest database of paranormal phenomena. ' +
    'Here are some of our most-viewed reports to get you started:</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">' + reportList + '</table>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Create a free account to save reports, get personalized recommendations, and join our research community.</p>',
    baseUrl + '/explore',
    'Start Exploring',
    baseUrl
  );
}

function generateDripEmail2(email: string, report: any, baseUrl: string) {
  var summary = report.summary ? report.summary.substring(0, 200) + '...' : '';
  return emailWrap(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">While you were away...</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">This report is getting a lot of attention from our research community:</p>' +
    '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; border-left: 3px solid #8b5cf6; margin: 16px 0;">' +
    '<a href="' + baseUrl + '/report/' + report.slug + '" style="color: #c084fc; text-decoration: none; font-weight: 600; font-size: 17px;">' +
    esc(report.title) + '</a>' +
    (summary ? '<p style="color: #d1d5db; font-size: 14px; margin: 8px 0 0 0; line-height: 1.5;">' + esc(summary) + '</p>' : '') +
    '<div style="color: #9ca3af; font-size: 12px; margin-top: 8px;">' + (report.view_count || 0) + ' views</div>' +
    '</div>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Don\'t miss out on the conversation. Create your free account to join the discussion.</p>',
    baseUrl + '/report/' + report.slug,
    'Read Full Report',
    baseUrl
  );
}

function generateDripEmail3(email: string, reports: any[], baseUrl: string) {
  return emailWrap(
    '<h2 style="color: #e5e7eb; font-size: 20px; margin: 0 0 16px 0;">Your Research Dashboard Awaits</h2>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">With a free ParaDocs account, you get:</p>' +
    '<div style="padding: 16px; background: #1e1b2e; border-radius: 8px; margin: 16px 0;">' +
    '<div style="color: #d1d5db; font-size: 14px; line-height: 2;">' +
    '<span style="color: #c084fc;">&#x2713;</span> Save and organize reports into collections<br>' +
    '<span style="color: #c084fc;">&#x2713;</span> Get personalized AI-curated recommendations<br>' +
    '<span style="color: #c084fc;">&#x2713;</span> Ask the Unknown - your AI research assistant<br>' +
    '<span style="color: #c084fc;">&#x2713;</span> Weekly digest of reports matching your interests<br>' +
    '<span style="color: #c084fc;">&#x2713;</span> Research journal for tracking your investigations' +
    '</div></div>' +
    '<p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">Join ' + (reports.length > 0 ? 'thousands of' : 'our growing community of') + ' researchers exploring the unexplained.</p>',
    baseUrl + '/login',
    'Create Free Account',
    baseUrl
  );
}

function emailWrap(content: string, ctaUrl: string, ctaText: string, baseUrl: string) {
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
