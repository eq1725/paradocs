/**
 * API: GET /api/user/year-in-review
 *
 * Generates a personalized Year in Review summary for the user:
 * - Total reports viewed, saved, submitted
 * - Top categories explored
 * - Longest research streak
 * - Most-reacted reports they interacted with
 * - AI insights summary
 * - Shareable card data
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var supabase = createClient(supabaseUrl, supabaseKey);
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) { return res.status(401).json({ error: 'Unauthorized' }); }

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  var userId = userResult.data.user.id;
  var year = parseInt((req.query.year as string) || '2026');
  var startDate = year + '-01-01T00:00:00Z';
  var endDate = year + '-12-31T23:59:59Z';

  // Get user's reports submitted this year
  var submittedResult = await supabase
    .from('reports')
    .select('id, title, category, credibility_score, view_count, created_at')
    .eq('author_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  var submitted = submittedResult.data || [];

  // Get saved reports
  var savedResult = await supabase
    .from('saved_reports')
    .select('report_id, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  var saved = savedResult.data || [];

  // Get reactions made
  var reactionsResult = await supabase
    .from('reactions')
    .select('report_id, type, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  var reactions = reactionsResult.data || [];

  // Get comments made
  var commentsResult = await supabase
    .from('comments')
    .select('id, report_id, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);
  var comments = commentsResult.data || [];

  // Get user profile for streak info
  var profileResult = await supabase
    .from('profiles')
    .select('display_name, streak, longest_streak, joined_at')
    .eq('id', userId)
    .single();
  var profile = profileResult.data || {};

  // Calculate top categories
  var catCounts: Record<string, number> = {};
  submitted.forEach(function(r: any) {
    var cat = r.category || 'other';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  var topCategories = Object.entries(catCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 5)
    .map(function(entry) { return { category: entry[0], count: entry[1] }; });

  // Find most popular report (by views)
  var topReport = submitted.sort(function(a: any, b: any) { return (b.view_count || 0) - (a.view_count || 0); })[0] || null;

  // Calculate total views across all user's reports
  var totalViews = submitted.reduce(function(sum: number, r: any) { return sum + (r.view_count || 0); }, 0);

  // Monthly activity breakdown
  var monthlyActivity: number[] = [0,0,0,0,0,0,0,0,0,0,0,0];
  submitted.forEach(function(r: any) {
    var month = new Date(r.created_at).getMonth();
    monthlyActivity[month]++;
  });
  reactions.forEach(function(r: any) {
    var month = new Date(r.created_at).getMonth();
    monthlyActivity[month]++;
  });

  // Find most active month
  var maxActivity = Math.max.apply(null, monthlyActivity);
  var mostActiveMonth = monthlyActivity.indexOf(maxActivity);
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Generate researcher persona
  var persona = 'Curious Explorer';
  if (submitted.length >= 20) persona = 'Prolific Investigator';
  else if (submitted.length >= 10) persona = 'Dedicated Researcher';
  else if (saved.length >= 30) persona = 'Avid Collector';
  else if (reactions.length >= 50) persona = 'Community Champion';
  else if (comments.length >= 20) persona = 'Discussion Leader';

  var review = {
    year: year,
    user: {
      display_name: profile.display_name || 'Researcher',
      joined_at: profile.joined_at,
      persona: persona
    },
    stats: {
      reports_submitted: submitted.length,
      reports_saved: saved.length,
      reactions_given: reactions.length,
      comments_made: comments.length,
      total_views_earned: totalViews,
      current_streak: profile.streak || 0,
      longest_streak: profile.longest_streak || 0
    },
    highlights: {
      top_categories: topCategories,
      top_report: topReport ? { id: topReport.id, title: topReport.title, views: topReport.view_count || 0 } : null,
      most_active_month: monthNames[mostActiveMonth] || 'N/A',
      monthly_activity: monthlyActivity
    },
    share: {
      text: profile.display_name + '\'s ' + year + ' ParaDocs Year in Review: ' + submitted.length + ' reports submitted, ' + totalViews + ' views earned. Persona: ' + persona + ' \u2726',
      url: (process.env.NEXT_PUBLIC_BASE_URL || 'https://beta.discoverparadocs.com') + '/year-in-review/' + year
    }
  };

  return res.status(200).json(review);
}
