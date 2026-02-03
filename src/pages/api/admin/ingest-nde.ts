// API Route: /api/admin/ingest-nde
// Specifically ingests Near-Death Experience (NDE) content
// Uses Reddit r/NDE via Arctic Shift API (since direct NDE website access is restricted)

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScrapedReport, ScrapedMediaItem } from '@/lib/ingestion/types';
import {
  assessQuality,
  getStatusFromScore,
  improveTitleWithAI,
  getSourceLabel,
  isObviouslyLowQuality,
} from '@/lib/ingestion/filters';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Create user client from request
function getSupabaseUser(req: NextApiRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.authorization || '',
      },
    },
  });

  return supabase;
}

// Arctic Shift API for Reddit data
const ARCTIC_SHIFT_ENDPOINTS = [
  'https://arctic-shift.photon-reddit.com/api',
];

// NDE-related subreddits
const NDE_SUBREDDITS = ['NDE', 'nde', 'NearDeathExperiences'];

// Arctic Shift post interface
interface ArcticShiftPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  link_flair_text?: string;
  is_self: boolean;
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number };
    }>;
  };
}

// NDE-specific characteristics extraction
function extractNDECharacteristics(content: string): string[] {
  const characteristics: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common NDE elements
  if (lowerContent.includes('tunnel') || lowerContent.includes('darkness')) {
    characteristics.push('tunnel-experience');
  }
  if (lowerContent.includes('light') && (lowerContent.includes('bright') || lowerContent.includes('white'))) {
    characteristics.push('being-of-light');
  }
  if (lowerContent.includes('deceased') || lowerContent.includes('relatives') || lowerContent.includes('family member')) {
    characteristics.push('deceased-relatives');
  }
  if (lowerContent.includes('life review') || lowerContent.includes('my life flash') || lowerContent.includes('saw my life')) {
    characteristics.push('life-review');
  }
  if (lowerContent.includes('out of body') || lowerContent.includes('above my body') || lowerContent.includes('looking down')) {
    characteristics.push('out-of-body');
  }
  if (lowerContent.includes('peaceful') || lowerContent.includes('calm') || lowerContent.includes('serenity')) {
    characteristics.push('peace-calm');
  }
  if (lowerContent.includes('love') && (lowerContent.includes('unconditional') || lowerContent.includes('overwhelming'))) {
    characteristics.push('unconditional-love');
  }
  if (lowerContent.includes('boundary') || lowerContent.includes('border') || lowerContent.includes('point of no return')) {
    characteristics.push('boundary-experience');
  }
  if (lowerContent.includes('sent back') || lowerContent.includes('told to return') || lowerContent.includes('not my time')) {
    characteristics.push('sent-back');
  }
  if (lowerContent.includes('hospital') || lowerContent.includes('surgery') || lowerContent.includes('cardiac')) {
    characteristics.push('medical-setting');
  }

  return characteristics;
}

// Check if post is a meta/question post (not a personal NDE story)
function isMetaPost(title: string, text: string): boolean {
  const combined = `${title} ${text}`.toLowerCase();

  const metaPatterns = [
    /\b(share your|tell me about|what's your|anyone have)\b/i,
    /\b(looking for|searching for|collecting)\b/i,
    /\b(question|asking|wondering|curious)\b/i,
    /\b(what do you think|thoughts on|opinions)\b/i,
    /\b(has anyone|does anyone|anyone else)\b/i,
  ];

  // Also check if title ends with a question mark and is short
  if (title.endsWith('?') && title.split(' ').length < 12) {
    const promptWords = ['your', 'you', 'anyone', 'has', 'does', 'what', 'who', 'share'];
    if (promptWords.some(word => title.toLowerCase().includes(word))) {
      return true;
    }
  }

  return metaPatterns.some(pattern => pattern.test(combined));
}

// Parse Reddit NDE post
function parseNDEPost(post: ArcticShiftPost): ScrapedReport | null {
  const textContent = post.selftext || '';

  // Skip non-text posts or very short posts
  if (!post.is_self || textContent.length < 150) {
    return null;
  }

  // Skip removed/deleted posts
  if (textContent === '[removed]' || textContent === '[deleted]') {
    return null;
  }

  // Skip meta posts
  if (isMetaPost(post.title, textContent)) {
    console.log(`[NDE] Skipping meta post: "${post.title.substring(0, 40)}..."`);
    return null;
  }

  // Clean the text
  const description = textContent
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  // Create summary
  const summary = description.length > 300
    ? description.substring(0, 297) + '...'
    : description;

  // Convert UTC timestamp to date
  const eventDate = new Date(post.created_utc * 1000).toISOString().split('T')[0];

  // Extract NDE characteristics as tags
  const characteristics = extractNDECharacteristics(description);
  const tags: string[] = [
    'nde',
    'near-death-experience',
    'reddit',
    post.subreddit.toLowerCase(),
    ...characteristics
  ];

  // Add flair as tag if present
  if (post.link_flair_text) {
    tags.push(post.link_flair_text.toLowerCase().replace(/\s+/g, '-'));
  }

  // Determine credibility based on detail and engagement
  let credibility: 'low' | 'medium' | 'high' = 'medium';
  const hasHighEngagement = post.score > 50 || post.num_comments > 15;
  const hasDetailedText = description.length > 1000;

  if (hasHighEngagement && hasDetailedText) {
    credibility = 'high';
  } else if (description.length < 400 && post.score < 5) {
    credibility = 'low';
  }

  return {
    title: post.title.length > 150 ? post.title.substring(0, 147) + '...' : post.title,
    summary,
    description,
    category: 'psychological_experiences',
    country: 'United States', // Default for Reddit
    event_date: eventDate,
    credibility,
    source_type: 'reddit',
    original_report_id: `reddit-nde-${post.id}`,
    tags: Array.from(new Set(tags)),
    source_label: `r/${post.subreddit}`,
    source_url: `https://reddit.com${post.permalink}`,
    metadata: {
      subreddit: post.subreddit,
      postId: post.id,
      score: post.score,
      numComments: post.num_comments,
      flair: post.link_flair_text,
      ndeCharacteristics: characteristics,
      isNDE: true
    }
  };
}

// Fetch NDE posts from Reddit via Arctic Shift
async function fetchNDEPosts(limit: number): Promise<ScrapedReport[]> {
  const reports: ScrapedReport[] = [];

  for (const subreddit of NDE_SUBREDDITS) {
    if (reports.length >= limit) break;

    try {
      // Get posts from last 2 years
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const afterDate = twoYearsAgo.toISOString().split('T')[0];

      const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${subreddit}&after=${afterDate}&limit=${Math.min(limit * 2, 200)}&sort=desc`;

      console.log(`[NDE] Fetching r/${subreddit}: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ParaDocs/1.0 (NDE Research Database)',
        }
      });

      if (!response.ok) {
        console.log(`[NDE] Failed to fetch r/${subreddit}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const posts: ArcticShiftPost[] = Array.isArray(data) ? data : (data.data || []);

      console.log(`[NDE] Found ${posts.length} raw posts in r/${subreddit}`);

      for (const post of posts) {
        if (reports.length >= limit) break;

        // Skip downvoted posts
        if (post.score < 0) continue;

        const report = parseNDEPost(post);
        if (report) {
          reports.push(report);
        }
      }

      console.log(`[NDE] Extracted ${reports.length} valid NDE reports so far`);

      // Rate limit between subreddits
      await delay(500);

    } catch (error) {
      console.error(`[NDE] Error fetching r/${subreddit}:`, error);
    }
  }

  return reports;
}

// Near-Death Experience phenomenon ID (from phenomena table)
const NDE_PHENOMENON_ID = 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70';

// Link a report to the NDE phenomenon
async function linkToNDEPhenomenon(
  supabase: SupabaseClient,
  reportId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('report_phenomena')
      .upsert({
        report_id: reportId,
        phenomenon_id: NDE_PHENOMENON_ID,
        confidence: 0.9, // High confidence for NDE-specific ingestion
        tagged_by: 'auto-nde'
      }, {
        onConflict: 'report_id,phenomenon_id',
        ignoreDuplicates: true
      });

    if (error) {
      console.error(`[NDE] Failed to link report ${reportId} to phenomenon:`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[NDE] Error linking report to phenomenon:`, e);
    return false;
  }
}

// Generate URL-safe slug
function generateSlug(title: string, originalReportId: string, sourceType: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);

  const uniqueKey = `${sourceType}-${originalReportId}`;
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    const char = uniqueKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 8);

  return `${baseSlug}-${hashStr}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabaseUser = getSupabaseUser(req);

    // Try to get user from cookie/session
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabaseUser.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    // Also try cookie-based auth
    if (!userId) {
      const cookies = req.headers.cookie || '';
      const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
      if (accessTokenMatch) {
        try {
          const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
          if (tokenData?.access_token) {
            const supabaseWithToken = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                global: {
                  headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                  },
                },
              }
            );
            const { data: { user } } = await supabaseWithToken.auth.getUser();
            if (user) {
              userId = user.id;
            }
          }
        } catch (e) {
          // Cookie parse error, continue
        }
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if user is admin
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('[NDE] Starting NDE-specific ingestion...');
    const startTime = Date.now();

    // Get limit from query (default 200 for NDE)
    const limit = parseInt(req.query.limit as string) || 200;

    // Fetch NDE posts from Reddit
    const reports = await fetchNDEPosts(limit);

    console.log(`[NDE] Fetched ${reports.length} NDE reports from Reddit`);

    // Process and insert the reports
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    let linked = 0;

    for (const report of reports) {
      try {
        // Quick rejection for obviously low quality content
        if (isObviouslyLowQuality(report.title, report.description)) {
          rejected++;
          continue;
        }

        // Full quality assessment
        const qualityResult = assessQuality(report, report.metadata);

        if (!qualityResult.passed) {
          console.log(`[NDE] Filtered: "${report.title.substring(0, 40)}..." (${qualityResult.reason})`);
          rejected++;
          continue;
        }

        // Get quality score and determine status
        const qualityScore = qualityResult.qualityScore!;
        const status = getStatusFromScore(qualityScore.total);

        if (status === 'rejected') {
          rejected++;
          continue;
        }

        // Improve title if needed
        const titleResult = await improveTitleWithAI(
          report.title,
          report.description,
          report.category,
          report.location_name,
          report.event_date
        );

        const finalTitle = titleResult.title;
        const originalTitle = titleResult.wasImproved ? titleResult.originalTitle : undefined;

        // Check if report already exists
        const { data: existing } = await supabaseAdmin
          .from('reports')
          .select('id')
          .eq('original_report_id', report.original_report_id)
          .eq('source_type', report.source_type)
          .single();

        if (existing) {
          // Update existing report
          const { error: updateError } = await supabaseAdmin
            .from('reports')
            .update({
              title: finalTitle,
              summary: report.summary,
              description: report.description,
              tags: report.tags,
              source_label: report.source_label,
              original_title: originalTitle,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!updateError) {
            updated++;
            // Also link to NDE phenomenon if not already linked
            const wasLinked = await linkToNDEPhenomenon(supabaseAdmin, existing.id);
            if (wasLinked) linked++;
          } else {
            skipped++;
          }
        } else {
          // Insert new report
          const slug = generateSlug(finalTitle, report.original_report_id, report.source_type);

          const { data: insertedReport, error: insertError } = await supabaseAdmin
            .from('reports')
            .insert({
              title: finalTitle,
              slug: slug,
              summary: report.summary,
              description: report.description,
              category: report.category,
              location_name: report.location_name,
              country: report.country || 'United States',
              event_date: report.event_date,
              credibility: report.credibility || 'medium',
              source_type: report.source_type,
              original_report_id: report.original_report_id,
              status: status,
              tags: report.tags || [],
              source_label: report.source_label,
              source_url: report.source_url,
              original_title: originalTitle,
              upvotes: 0,
              view_count: 0
            })
            .select('id')
            .single();

          if (!insertError && insertedReport) {
            inserted++;
            // Link to NDE phenomenon
            const wasLinked = await linkToNDEPhenomenon(supabaseAdmin, insertedReport.id);
            if (wasLinked) linked++;
          } else {
            console.error('[NDE] Insert error:', insertError);
            skipped++;
          }
        }
      } catch (reportError) {
        console.error('[NDE] Error processing report:', reportError);
        skipped++;
      }
    }

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      source: 'reddit-nde',
      recordsFound: reports.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      recordsRejected: rejected,
      recordsLinked: linked,
      duration,
      message: `NDE ingestion complete: ${inserted} new, ${updated} updated, ${rejected} filtered, ${linked} linked to NDE phenomenon`
    };

    console.log('[NDE] Ingestion complete:', summary);

    return res.status(200).json(summary);

  } catch (error) {
    console.error('[NDE] Ingestion error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Extended timeout for NDE ingestion
export const config = {
  maxDuration: 300
};
