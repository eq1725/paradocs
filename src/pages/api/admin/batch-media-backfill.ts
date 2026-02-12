/**
 * Batch Media Backfill API
 *
 * POST /api/admin/batch-media-backfill
 *
 * Two-pass media extraction for existing Reddit reports:
 *   Pass 1 (mode: "text") - Extract media URLs from description text (free, fast)
 *   Pass 2 (mode: "arctic") - Fetch original posts from Arctic Shift API (slower, for video/gallery)
 *
 * Body params:
 *   batchSize: number (default: 200 for text, 50 for arctic)
 *   offset: number (default: 0)
 *   mode: "text" | "arctic" (default: "text")
 *   dryRun: boolean (default: false)
 *
 * Uses Supabase Bearer token auth (same as batch-link).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Get user from Bearer token
async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

// URL extraction patterns
const IMAGE_URL_PATTERNS = [
  /https?:\/\/[^\s\)\]"]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)\]"]*)?\b/gi,
  /https?:\/\/i\.redd\.it\/[a-zA-Z0-9_-]+/gi,
  /https?:\/\/i\.imgur\.com\/[a-zA-Z0-9_-]+/gi,
  /https?:\/\/preview\.redd\.it\/[^\s\)\]"]+/gi,
];

const VIDEO_URL_PATTERNS = [
  /https?:\/\/v\.redd\.it\/[a-zA-Z0-9_-]+/gi,
  /https?:\/\/[^\s\)\]"]+\.(mp4|webm|mov)(\?[^\s\)\]"]*)?\b/gi,
];

function extractMediaUrlsFromText(text: string): Array<{ type: 'image' | 'video'; url: string }> {
  if (!text) return [];
  const results: Array<{ type: 'image' | 'video'; url: string }> = [];
  const seenUrls = new Set<string>();

  const addUrl = (type: 'image' | 'video', url: string) => {
    const clean = url.replace(/&amp;/g, '&').replace(/[)\]"]+$/, '');
    const normalized = clean.toLowerCase();
    if (!seenUrls.has(normalized) && !normalized.includes('deleted') && !normalized.includes('removed')) {
      seenUrls.add(normalized);
      results.push({ type, url: clean });
    }
  };

  for (const pattern of IMAGE_URL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      addUrl('image', match[0]);
    }
  }

  for (const pattern of VIDEO_URL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      addUrl('video', match[0]);
    }
  }

  return results;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    batchSize: requestedBatchSize,
    offset = 0,
    mode = 'text',
    dryRun = false
  } = req.body;

  const batchSize = requestedBatchSize || (mode === 'text' ? 200 : 50);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch batch of Reddit posts (not comments) that don't have media records yet
    // We use a LEFT JOIN approach: fetch reports and check if they have media
    const { data: reports, error, count } = await supabase
      .from('reports')
      .select('id, title, description, original_report_id, tags, source_type', { count: 'exact' })
      .eq('source_type', 'reddit')
      .not('original_report_id', 'like', 'reddit-comment-%')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(`Database query error: ${error.message}`);
    }

    if (!reports || reports.length === 0) {
      return res.status(200).json({
        success: true,
        done: true,
        results: { processed: 0, mediaFound: 0, mediaInserted: 0, alreadyHasMedia: 0 },
        nextOffset: offset
      });
    }

    let processed = 0;
    let mediaFound = 0;
    let mediaInserted = 0;
    let alreadyHasMedia = 0;
    let noMediaInText = 0;
    const sampleMedia: Array<{ title: string; type: string; url: string }> = [];

    for (const report of reports) {
      processed++;

      // Check if report already has media
      const { count: existingMedia } = await supabase
        .from('report_media')
        .select('*', { count: 'exact', head: true })
        .eq('report_id', report.id);

      if (existingMedia && existingMedia > 0) {
        alreadyHasMedia++;
        continue;
      }

      if (mode === 'text') {
        // Extract media URLs from description text
        const mediaUrls = extractMediaUrlsFromText(report.description || '');

        if (mediaUrls.length === 0) {
          noMediaInText++;
          continue;
        }

        mediaFound += mediaUrls.length;

        if (!dryRun) {
          for (let i = 0; i < mediaUrls.length; i++) {
            const media = mediaUrls[i];
            const { error: insertError } = await supabase
              .from('report_media')
              .insert({
                report_id: report.id,
                media_type: media.type,
                url: media.url,
                is_primary: i === 0
              });

            if (!insertError) {
              mediaInserted++;
            }
          }

          // Add has-media tag if not present
          const tags = report.tags || [];
          if (!tags.includes('has-media')) {
            await supabase
              .from('reports')
              .update({ tags: [...tags, 'has-media'] })
              .eq('id', report.id);
          }
        }

        if (sampleMedia.length < 3) {
          sampleMedia.push({
            title: (report.title || '').substring(0, 60),
            type: mediaUrls[0].type,
            url: mediaUrls[0].url.substring(0, 80)
          });
        }

      } else if (mode === 'arctic') {
        // Fetch from Arctic Shift API
        const postId = report.original_report_id.replace('reddit-', '');
        try {
          const arcticResponse = await fetch(
            `https://arctic-shift.photon-reddit.com/api/posts/search?ids=${postId}`,
            {
              headers: { 'Accept': 'application/json', 'User-Agent': 'ParaDocs/1.0' }
            }
          );

          if (arcticResponse.ok) {
            const arcticData = await arcticResponse.json();
            const posts = Array.isArray(arcticData) ? arcticData : (arcticData.data || []);
            const post = posts[0];

            if (post) {
              const mediaItems: Array<{ type: 'image' | 'video'; url: string }> = [];

              // Reddit video
              if (post.is_video && post.media?.reddit_video?.fallback_url) {
                mediaItems.push({ type: 'video', url: post.media.reddit_video.fallback_url });
              }

              // Gallery
              if (post.gallery_data?.items && post.media_metadata) {
                for (const item of post.gallery_data.items) {
                  const meta = post.media_metadata[item.media_id];
                  if (meta?.s?.u) {
                    mediaItems.push({ type: 'image', url: meta.s.u.replace(/&amp;/g, '&') });
                  }
                }
              }

              // Direct image URL
              if (post.url && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(post.url)) {
                mediaItems.push({ type: 'image', url: post.url });
              }

              // Preview
              if (mediaItems.length === 0 && post.preview?.images?.[0]?.source?.url) {
                mediaItems.push({ type: 'image', url: post.preview.images[0].source.url.replace(/&amp;/g, '&') });
              }

              if (mediaItems.length > 0) {
                mediaFound += mediaItems.length;

                if (!dryRun) {
                  const seenUrls = new Set<string>();
                  for (let i = 0; i < mediaItems.length; i++) {
                    const media = mediaItems[i];
                    const normalized = media.url.toLowerCase();
                    if (seenUrls.has(normalized)) continue;
                    seenUrls.add(normalized);

                    const { error: insertError } = await supabase
                      .from('report_media')
                      .insert({
                        report_id: report.id,
                        media_type: media.type,
                        url: media.url,
                        is_primary: i === 0
                      });

                    if (!insertError) mediaInserted++;
                  }

                  const tags = report.tags || [];
                  if (!tags.includes('has-media')) {
                    await supabase
                      .from('reports')
                      .update({ tags: [...tags, 'has-media'] })
                      .eq('id', report.id);
                  }
                }

                if (sampleMedia.length < 3) {
                  sampleMedia.push({
                    title: (report.title || '').substring(0, 60),
                    type: mediaItems[0].type,
                    url: mediaItems[0].url.substring(0, 80)
                  });
                }
              } else {
                noMediaInText++;
              }
            }
          }
        } catch (e) {
          // Skip Arctic Shift failures silently
        }
      }
    }

    const nextOffset = offset + reports.length;
    const done = reports.length < batchSize;

    return res.status(200).json({
      success: true,
      done,
      mode,
      dryRun,
      results: {
        processed,
        mediaFound,
        mediaInserted,
        alreadyHasMedia,
        noMediaInText,
        sampleMedia
      },
      nextOffset,
      totalRemaining: count ? count - reports.length : undefined
    });

  } catch (error) {
    console.error('[Batch Media Backfill] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const config = {
  maxDuration: 300,
};
