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
  // Note: preview.redd.it excluded — URLs expire for archived posts
];

const VIDEO_URL_PATTERNS = [
  /https?:\/\/v\.redd\.it\/[a-zA-Z0-9_-]+/gi,
  /https?:\/\/[^\s\)\]"]+\.(mp4|webm|mov)(\?[^\s\)\]"]*)?\b/gi,
];

// ── Non-related media filter ──────────────────────────────────────────
// Reject URLs that are logos, site assets, tracking pixels, awards, etc.
function isJunkMedia(url: string): boolean {
  const lower = url.toLowerCase();

  // Reddit system images (logos, snoo, awards, badges, emojis)
  if (/redditstatic\.com/i.test(lower)) return true;
  if (/\/award_images?\//i.test(lower)) return true;
  if (/\/snoovatar/i.test(lower)) return true;
  if (/\/snoo[-_]/i.test(lower)) return true;
  if (/\/emoji\//i.test(lower)) return true;
  if (/\/communitypoints\//i.test(lower)) return true;

  // Reddit default/placeholder thumbnails
  if (/\/(default|self|nsfw|spoiler|image)\.(png|jpg)$/i.test(lower)) return true;
  if (/\/thumb\b/i.test(lower) && /redd/i.test(lower)) return true;

  // Reddit preview CDN — URLs expire for archived posts, always dead
  if (/preview\.redd\.it/i.test(lower)) return true;

  // Common non-content patterns
  if (/favicon/i.test(lower)) return true;
  if (/logo[\._-]/i.test(lower)) return true;
  if (/\/icon[s]?\//i.test(lower)) return true;
  if (/\/badge[s]?\//i.test(lower)) return true;
  if (/\/avatar[s]?\//i.test(lower)) return true;
  if (/\/banner[s]?\//i.test(lower)) return true;
  if (/\/header[s]?\//i.test(lower)) return true;
  if (/\/sprite[s]?\//i.test(lower)) return true;

  // Tracking pixels and tiny images
  if (/pixel\.(gif|png|jpg)/i.test(lower)) return true;
  if (/\/1x1\./i.test(lower)) return true;
  if (/\/spacer\./i.test(lower)) return true;
  if (/\/blank\.(gif|png)/i.test(lower)) return true;
  if (/\/clear\.(gif|png)/i.test(lower)) return true;
  if (/\/beacon/i.test(lower)) return true;
  if (/\/track(er|ing)/i.test(lower)) return true;

  // Ad networks, analytics, CDN junk
  if (/doubleclick\.net/i.test(lower)) return true;
  if (/googlesyndication/i.test(lower)) return true;
  if (/google-analytics/i.test(lower)) return true;
  if (/facebook\.com\/tr/i.test(lower)) return true;
  if (/analytics\./i.test(lower)) return true;

  // Common site assets / CSS images
  if (/\/assets\/.*\.(png|jpg|gif|svg)$/i.test(lower)) return true;
  if (/\/static\/.*\.(png|jpg|gif|svg)$/i.test(lower) && !/redd\.it/i.test(lower)) return true;
  if (/\/images\/(logo|icon|bg|background)/i.test(lower)) return true;

  // Imgur album pages (not direct images — no file ext, not i.imgur.com)
  if (/imgur\.com\/(a|gallery)\//i.test(lower)) return true;

  // Very short filenames likely auto-generated placeholders
  // e.g., https://example.com/a.png
  const filename = lower.split('/').pop() || '';
  if (/^\w\.(png|jpg|gif)$/.test(filename)) return true;

  return false;
}

// ── Content viability classifier ──────────────────────────────────────
// Determines whether a post is media-primary (worthless without media)
// or text-primary (valuable on its own)
type ContentClass = 'media-primary' | 'text-primary' | 'link-primary';

function classifyContent(title: string, description: string): ContentClass {
  const titleLower = (title || '').toLowerCase();
  const descLen = (description || '').length;
  const descLower = (description || '').toLowerCase();

  // Visual content keywords in the title
  const mediaTitleSignals = /\b(photo|picture|image|video|footage|film|frame|captured|caught on|recording|evp|screenshot|pic |pics |look at this|check this out|what is this|what did i)\b/i;
  const hasMediaTitle = mediaTitleSignals.test(titleLower);

  // External link signals
  const linkSignals = /\b(youtube\.com|youtu\.be|vimeo\.com|dailymotion|streamable|twitter\.com|x\.com|tiktok\.com|news|article)\b/i;
  const hasLinkInDesc = linkSignals.test(descLower);

  // Short description = likely just a media share or link share
  const isShortDesc = descLen < 200;
  const isVeryShortDesc = descLen < 50;

  // Long narrative text = text-primary
  const isLongDesc = descLen > 500;

  // Narrative personal experience signals
  const narrativeSignals = /\b(i was|i saw|i heard|i felt|i experienced|my friend|we were|last night|years ago|happened to me|this happened|true story)\b/i;
  const hasNarrative = narrativeSignals.test(descLower);

  // If it's mostly a link post with little text
  if (hasLinkInDesc && isShortDesc) return 'link-primary';

  // Long narrative = text-primary regardless of title
  if (isLongDesc && hasNarrative) return 'text-primary';
  if (descLen > 1000) return 'text-primary';

  // Media title signals + short description = media-primary
  if (hasMediaTitle && isShortDesc) return 'media-primary';

  // Very short description with no narrative = likely media-primary
  if (isVeryShortDesc && !hasNarrative) return 'media-primary';

  // Default: if there's reasonable text, it's text-primary
  if (descLen > 200) return 'text-primary';

  // Short but has narrative content
  if (hasNarrative) return 'text-primary';

  // Ambiguous short posts without clear signals — conservative: text-primary
  return 'text-primary';
}

// ── Media URL validation ─────────────────────────────────────────────
// HEAD request to check if a media URL is still live
async function isMediaUrlLive(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'ParaDocs/1.0' },
      redirect: 'follow'
    });

    clearTimeout(timer);

    // 200-399 = live, 404/410/403 = dead
    return response.status >= 200 && response.status < 400;
  } catch {
    // Network error, timeout, abort = treat as dead
    return false;
  }
}

function extractMediaUrlsFromText(text: string): Array<{ type: 'image' | 'video'; url: string }> {
  if (!text) return [];
  const results: Array<{ type: 'image' | 'video'; url: string }> = [];
  const seenUrls = new Set<string>();

  const addUrl = (type: 'image' | 'video', url: string) => {
    const clean = url.replace(/&amp;/g, '&').replace(/[)\]"]+$/, '');
    const normalized = clean.toLowerCase();
    if (seenUrls.has(normalized)) return;
    if (normalized.includes('deleted') || normalized.includes('removed')) return;
    if (isJunkMedia(clean)) return;
    seenUrls.add(normalized);
    results.push({ type, url: clean });
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
    let filteredJunk = 0;
    let duplicateSkipped = 0;
    let deadUrlSkipped = 0;
    let mediaPrimaryFlagged = 0;
    let mediaPrimaryArchived = 0;
    let mediaRecovered = 0;
    let classificationCounts = { 'media-primary': 0, 'text-primary': 0, 'link-primary': 0 };
    const sampleMedia: Array<{ title: string; type: string; url: string }> = [];
    const sampleFiltered: Array<{ title: string; url: string; reason: string }> = [];
    const sampleFlagged: Array<{ title: string; contentClass: string; reason: string }> = [];
    const sampleArchived: Array<{ title: string; reason: string }> = [];

    // Helper: attempt media recovery from Arctic Shift for a specific report
    async function tryArcticRecovery(report: any): Promise<Array<{ type: 'image' | 'video'; url: string }>> {
      const postId = (report.original_report_id || '').replace('reddit-', '');
      if (!postId || postId.startsWith('comment-')) return [];

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        const arcticResponse = await fetch(
          `https://arctic-shift.photon-reddit.com/api/posts/search?ids=${postId}`,
          {
            headers: { 'Accept': 'application/json', 'User-Agent': 'ParaDocs/1.0' },
            signal: controller.signal
          }
        );
        clearTimeout(timer);

        if (!arcticResponse.ok) return [];

        const arcticData = await arcticResponse.json();
        const posts = Array.isArray(arcticData) ? arcticData : (arcticData.data || []);
        const post = posts[0];
        if (!post) return [];

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

        // Direct image URL (i.redd.it, imgur, etc.)
        if (post.url && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(post.url)) {
          mediaItems.push({ type: 'image', url: post.url });
        }

        return mediaItems;
      } catch {
        return [];
      }
    }

    // Helper: get existing media URLs for a report (URL-level dedup)
    async function getExistingMediaUrls(reportId: string): Promise<Set<string>> {
      const { data } = await supabase
        .from('report_media')
        .select('url')
        .eq('report_id', reportId);
      const urls = new Set<string>();
      if (data) {
        for (const row of data) {
          urls.add((row.url || '').toLowerCase());
        }
      }
      return urls;
    }

    // Helper: insert media with URL-level dedup, junk filter, and liveness check
    async function insertMediaForReport(
      report: any,
      mediaItems: Array<{ type: 'image' | 'video'; url: string }>
    ): Promise<{ inserted: number; duped: number; junked: number; dead: number }> {
      let inserted = 0;
      let duped = 0;
      let junked = 0;
      let dead = 0;

      // Filter junk first
      const cleanItems: typeof mediaItems = [];
      for (const item of mediaItems) {
        if (isJunkMedia(item.url)) {
          junked++;
          if (sampleFiltered.length < 3) {
            sampleFiltered.push({
              title: (report.title || '').substring(0, 40),
              url: item.url.substring(0, 80),
              reason: 'junk'
            });
          }
        } else {
          cleanItems.push(item);
        }
      }

      if (cleanItems.length === 0) return { inserted: 0, duped: 0, junked, dead: 0 };

      // Get existing URLs for this report
      const existingUrls = await getExistingMediaUrls(report.id);

      // Deduplicate within batch
      const batchSeen = new Set<string>();
      let primarySet = existingUrls.size === 0;

      for (const media of cleanItems) {
        const normalized = media.url.toLowerCase();
        if (existingUrls.has(normalized) || batchSeen.has(normalized)) {
          duped++;
          continue;
        }
        batchSeen.add(normalized);

        // Validate URL is still live
        const isLive = await isMediaUrlLive(media.url);
        if (!isLive) {
          dead++;
          if (sampleFiltered.length < 5) {
            sampleFiltered.push({
              title: (report.title || '').substring(0, 40),
              url: media.url.substring(0, 80),
              reason: 'dead-url'
            });
          }
          continue;
        }

        if (!dryRun) {
          const { error: insertError } = await supabase
            .from('report_media')
            .insert({
              report_id: report.id,
              media_type: media.type,
              url: media.url,
              is_primary: primarySet ? true : false
            });

          if (!insertError) {
            inserted++;
            primarySet = false;
          }
        } else {
          inserted++;
          primarySet = false;
        }
      }

      // Add has-media tag if we inserted anything
      if (inserted > 0 && !dryRun) {
        const tags = report.tags || [];
        if (!tags.includes('has-media')) {
          await supabase
            .from('reports')
            .update({ tags: [...tags, 'has-media'] })
            .eq('id', report.id);
        }
      }

      return { inserted, duped, junked, dead };
    }

    for (const report of reports) {
      processed++;

      // Classify content type
      const contentClass = classifyContent(report.title || '', report.description || '');
      classificationCounts[contentClass]++;

      if (mode === 'text') {
        // Extract media URLs from description text
        const mediaUrls = extractMediaUrlsFromText(report.description || '');

        if (mediaUrls.length === 0) {
          noMediaInText++;

          // If media-primary with no media in text, attempt Arctic Shift recovery
          if (contentClass === 'media-primary') {
            mediaPrimaryFlagged++;
            const recovered = await tryArcticRecovery(report);
            if (recovered.length > 0) {
              const recoveryResult = await insertMediaForReport(report, recovered);
              if (recoveryResult.inserted > 0) {
                mediaRecovered += recoveryResult.inserted;
                mediaInserted += recoveryResult.inserted;
                if (sampleMedia.length < 5) {
                  sampleMedia.push({
                    title: (report.title || '').substring(0, 50) + ' [recovered]',
                    type: recovered[0].type,
                    url: recovered[0].url.substring(0, 80)
                  });
                }
                continue; // Successfully recovered — move on
              }
              deadUrlSkipped += recoveryResult.dead;
            }

            // Recovery failed — archive the report
            if (!dryRun) {
              await supabase
                .from('reports')
                .update({ status: 'archived', tags: [...(report.tags || []), 'media-missing'] })
                .eq('id', report.id);
              mediaPrimaryArchived++;
            }
            if (sampleArchived.length < 5) {
              sampleArchived.push({
                title: (report.title || '').substring(0, 60),
                reason: 'no-media-found'
              });
            }
          }
          continue;
        }

        mediaFound += mediaUrls.length;
        const result = await insertMediaForReport(report, mediaUrls);
        mediaInserted += result.inserted;
        duplicateSkipped += result.duped;
        filteredJunk += result.junked;
        deadUrlSkipped += result.dead;

        // If media-primary and ALL text media was dead/junk, try Arctic recovery
        if (contentClass === 'media-primary' && result.inserted === 0) {
          mediaPrimaryFlagged++;
          const recovered = await tryArcticRecovery(report);
          if (recovered.length > 0) {
            const recoveryResult = await insertMediaForReport(report, recovered);
            if (recoveryResult.inserted > 0) {
              mediaRecovered += recoveryResult.inserted;
              mediaInserted += recoveryResult.inserted;
              if (sampleMedia.length < 5) {
                sampleMedia.push({
                  title: (report.title || '').substring(0, 50) + ' [recovered]',
                  type: recovered[0].type,
                  url: recovered[0].url.substring(0, 80)
                });
              }
              continue; // Successfully recovered
            }
            deadUrlSkipped += recoveryResult.dead;
          }

          // Recovery failed — archive the report
          if (!dryRun) {
            await supabase
              .from('reports')
              .update({ status: 'archived', tags: [...(report.tags || []), 'media-missing'] })
              .eq('id', report.id);
            mediaPrimaryArchived++;
          }
          if (sampleArchived.length < 5) {
            sampleArchived.push({
              title: (report.title || '').substring(0, 60),
              reason: result.dead > 0 ? 'all-media-dead' : 'all-media-junk'
            });
          }
        }

        if (result.inserted > 0 && sampleMedia.length < 3) {
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
                const result = await insertMediaForReport(report, mediaItems);
                mediaInserted += result.inserted;
                duplicateSkipped += result.duped;
                filteredJunk += result.junked;
                deadUrlSkipped += result.dead;

                // Flag media-primary posts with all dead media
                if (contentClass === 'media-primary' && result.inserted === 0) {
                  mediaPrimaryFlagged++;
                  if (!dryRun) {
                    const tags = report.tags || [];
                    if (!tags.includes('media-missing')) {
                      await supabase
                        .from('reports')
                        .update({ tags: [...tags, 'media-missing'] })
                        .eq('id', report.id);
                    }
                  }
                }

                if (result.inserted > 0 && sampleMedia.length < 3) {
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
        filteredJunk,
        duplicateSkipped,
        deadUrlSkipped,
        mediaPrimaryFlagged,
        mediaPrimaryArchived,
        mediaRecovered,
        classificationCounts,
        sampleMedia,
        sampleFiltered,
        sampleFlagged,
        sampleArchived
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
