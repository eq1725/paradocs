/**
 * Auto-Search Profile Images API
 *
 * Batch endpoint that searches Wikimedia Commons for phenomena missing
 * profile images (or denied ones). For each phenomenon:
 * 1. Searches by name + aliases
 * 2. Scores results by AI confidence
 * 3. Auto-selects the best candidate as the profile image
 * 4. Marks it as 'unreviewed' for admin review
 *
 * POST body:
 *   category?: string - filter to one category
 *   batch_size?: number - how many phenomena per request (default 50)
 *   confidence_threshold?: number - minimum AI confidence (default 0.65)
 *   include_denied?: boolean - re-search denied items too (default true)
 *   offset?: number - skip this many matching phenomena (for pagination)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var USER_AGENT = 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)';
var RATE_LIMIT_MS = 200;
var MIN_IMAGE_SIZE = 200;
var MAX_SEARCH_RESULTS = 20;
var ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

interface Phenomenon {
  id: string;
  slug: string;
  name: string;
  aliases: string[] | null;
  category: string;
  primary_image_url: string | null;
  profile_review_status: string | null;
}

interface WikimediaImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
  extmetadata?: Record<string, { value: string }>;
}

interface ScoredCandidate {
  url: string;
  title: string;
  width: number;
  height: number;
  mime: string;
  confidence: number;
  confidence_reason: string;
  search_term: string;
  license: string;
  description: string;
}

interface PhenomenonResult {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: string;
  selected_url: string | null;
  selected_confidence: number;
  candidates_evaluated: number;
  error: string | null;
}

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  var authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    var token = authHeader.substring(7);
    var supabase = createClient(supabaseUrl, supabaseAnonKey);
    var { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  var cookies = req.headers.cookie || '';
  var accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      var tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        var supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: 'Bearer ' + tokenData.access_token } },
        });
        var { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function scoreConfidence(
  imageTitle: string,
  description: string,
  categories: string,
  searchTerm: string,
  phenomenonName: string
): { score: number; reason: string } {
  var titleLower = imageTitle.toLowerCase();
  var descLower = description.toLowerCase();
  var catLower = categories.toLowerCase();
  var searchLower = searchTerm.toLowerCase();
  var phenomLower = phenomenonName.toLowerCase();

  // Check for mismatch patterns (band names, movies, etc.)
  var mismatchPatterns = [
    /the\s+band|band\s+member|musician|singer|album|concert|tour/i,
    /film|movie|tv\s+show|actor|actress|character|series/i,
    /book|novel|author|publication/i,
    /logo|icon|symbol|emblem|badge|flag/i
  ];

  for (var i = 0; i < mismatchPatterns.length; i++) {
    if (mismatchPatterns[i].test(imageTitle) || mismatchPatterns[i].test(description)) {
      return { score: 0.1, reason: 'likely_mismatch' };
    }
  }

  // High confidence: exact name or search term in title
  if (titleLower.includes(phenomLower) || titleLower.includes(searchLower)) {
    return { score: 0.95, reason: 'name_in_title' };
  }
  // Medium-high: name in description or categories
  if (descLower.includes(phenomLower) || catLower.includes(phenomLower)) {
    return { score: 0.70, reason: 'name_in_description' };
  }
  // Medium: search term in description
  if (descLower.includes(searchLower) || catLower.includes(searchLower)) {
    return { score: 0.65, reason: 'term_in_description' };
  }
  // Low: generic match
  return { score: 0.40, reason: 'generic_match' };
}

async function searchWikimediaCommons(searchTerm: string): Promise<Array<{ title: string }>> {
  try {
    var query = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=' +
      encodeURIComponent(searchTerm) + '&format=json&srlimit=' + MAX_SEARCH_RESULTS;

    var response = await fetch(query, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
      console.error('[AutoSearch] Wikimedia search failed:', response.status);
      return [];
    }

    var data = await response.json() as { query?: { search?: Array<{ title: string }> } };
    return data.query?.search || [];
  } catch (error) {
    console.error('[AutoSearch] Search error:', error);
    return [];
  }
}

async function getImageInfo(imageTitle: string): Promise<{
  url: string;
  width: number;
  height: number;
  mime: string;
  license: string;
  description: string;
  categories: string;
} | null> {
  try {
    var query = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' +
      encodeURIComponent(imageTitle) +
      '&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json';

    var response = await fetch(query, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) return null;

    var data = await response.json() as {
      query?: {
        pages?: Record<string, {
          imageinfo?: [WikimediaImageInfo]
        }>
      }
    };

    var pages = data.query?.pages;
    if (!pages) return null;

    var pageKeys = Object.keys(pages);
    if (pageKeys.length === 0) return null;

    var page = pages[pageKeys[0]];
    if (!page.imageinfo || page.imageinfo.length === 0) return null;

    var info = page.imageinfo[0];

    // Filter: size and MIME type
    if (!info.width || !info.height || info.width < MIN_IMAGE_SIZE || info.height < MIN_IMAGE_SIZE) {
      return null;
    }

    if (ALLOWED_MIMES.indexOf(info.mime) === -1) {
      return null;
    }

    var license = '';
    var description = '';
    var categories = '';

    if (info.extmetadata) {
      if (info.extmetadata['LicenseShortName'] && info.extmetadata['LicenseShortName'].value) {
        license = info.extmetadata['LicenseShortName'].value;
      }
      if (info.extmetadata['ImageDescription'] && info.extmetadata['ImageDescription'].value) {
        description = info.extmetadata['ImageDescription'].value.substring(0, 500);
      }
      if (info.extmetadata['Categories'] && info.extmetadata['Categories'].value) {
        categories = info.extmetadata['Categories'].value;
      }
    }

    return {
      url: info.url,
      width: info.width,
      height: info.height,
      mime: info.mime,
      license: license,
      description: description,
      categories: categories
    };
  } catch (error) {
    console.error('[AutoSearch] Image info error:', error);
    return null;
  }
}

async function findBestImageForPhenomenon(
  phenomenon: Phenomenon,
  confidenceThreshold: number
): Promise<{ candidate: ScoredCandidate | null; evaluated: number }> {
  var searchTerms = [phenomenon.name];

  if (phenomenon.aliases && Array.isArray(phenomenon.aliases)) {
    for (var i = 0; i < phenomenon.aliases.length && i < 3; i++) {
      var alias = phenomenon.aliases[i];
      if (alias && typeof alias === 'string' && alias.length > 0) {
        searchTerms.push(alias);
      }
    }
  }

  var bestCandidate: ScoredCandidate | null = null;
  var totalEvaluated = 0;

  for (var t = 0; t < searchTerms.length; t++) {
    var searchTerm = searchTerms[t];

    console.log('[AutoSearch] Searching "' + searchTerm + '" for ' + phenomenon.slug);

    var results = await searchWikimediaCommons(searchTerm);
    await sleep(RATE_LIMIT_MS);

    for (var r = 0; r < results.length; r++) {
      var result = results[r];

      var imageInfo = await getImageInfo(result.title);
      await sleep(RATE_LIMIT_MS);

      if (!imageInfo) continue;

      totalEvaluated++;

      var scoring = scoreConfidence(
        result.title,
        imageInfo.description,
        imageInfo.categories,
        searchTerm,
        phenomenon.name
      );

      if (scoring.score >= confidenceThreshold) {
        if (!bestCandidate || scoring.score > bestCandidate.confidence) {
          bestCandidate = {
            url: imageInfo.url,
            title: result.title,
            width: imageInfo.width,
            height: imageInfo.height,
            mime: imageInfo.mime,
            confidence: scoring.score,
            confidence_reason: scoring.reason,
            search_term: searchTerm,
            license: imageInfo.license,
            description: imageInfo.description
          };

          // If we got a 0.95 confidence, no need to keep looking
          if (scoring.score >= 0.95) {
            return { candidate: bestCandidate, evaluated: totalEvaluated };
          }
        }
      }
    }
  }

  return { candidate: bestCandidate, evaluated: totalEvaluated };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabaseAdmin();

  var category = req.body.category || null;
  var batchSize = parseInt(req.body.batch_size) || 50;
  var confidenceThreshold = parseFloat(req.body.confidence_threshold) || 0.65;
  var includeDenied = req.body.include_denied !== false;
  var requestOffset = parseInt(req.body.offset) || 0;

  // Cap batch size at 100
  if (batchSize > 100) batchSize = 100;

  try {
    // Build query for phenomena that need images
    var query = supabase
      .from('phenomena')
      .select('id, slug, name, aliases, category, primary_image_url, profile_review_status')
      .eq('status', 'active');

    if (category) {
      query = query.eq('category', String(category));
    }

    // Get phenomena where: no image OR denied
    // We fetch more than batch_size and filter in code because
    // Supabase doesn't support OR on nullable columns easily
    var { data: allPhenomena, error: fetchError } = await query
      .order('name', { ascending: true })
      .range(0, 5000);

    if (fetchError || !allPhenomena) {
      return res.status(500).json({
        error: 'Failed to fetch phenomena',
        details: fetchError?.message || 'Unknown error'
      });
    }

    // Filter to ones needing images
    var needsImages: Phenomenon[] = [];
    for (var i = 0; i < allPhenomena.length; i++) {
      var p = allPhenomena[i] as Phenomenon;
      var hasNoImage = !p.primary_image_url;
      var isDenied = p.profile_review_status === 'denied';

      if (hasNoImage || (includeDenied && isDenied)) {
        needsImages.push(p);
      }
    }

    // Apply offset and batch_size
    var batch = needsImages.slice(requestOffset, requestOffset + batchSize);

    // Count total for progress reporting
    var totalNeedingImages = needsImages.length;

    console.log('[AutoSearch] Processing batch of ' + batch.length + ' / ' + totalNeedingImages + ' total needing images');

    var results: PhenomenonResult[] = [];
    var successCount = 0;
    var noMatchCount = 0;
    var errorCount = 0;

    for (var b = 0; b < batch.length; b++) {
      var phenomenon = batch[b];

      try {
        var searchResult = await findBestImageForPhenomenon(phenomenon, confidenceThreshold);

        if (searchResult.candidate) {
          // Set the best image as primary_image_url and mark unreviewed
          var { error: updateError } = await supabase
            .from('phenomena')
            .update({
              primary_image_url: searchResult.candidate.url,
              profile_review_status: 'unreviewed'
            })
            .eq('id', phenomenon.id);

          if (updateError) {
            results.push({
              id: phenomenon.id,
              slug: phenomenon.slug,
              name: phenomenon.name,
              category: phenomenon.category,
              status: 'error',
              selected_url: null,
              selected_confidence: 0,
              candidates_evaluated: searchResult.evaluated,
              error: 'DB update failed: ' + updateError.message
            });
            errorCount++;
          } else {
            // Also insert into phenomena_media for tracking
            var { error: insertError } = await supabase
              .from('phenomena_media')
              .insert([{
                phenomenon_id: phenomenon.id,
                media_type: 'image',
                original_url: searchResult.candidate.url,
                thumbnail_url: searchResult.candidate.url,
                caption: searchResult.candidate.description || null,
                source: 'wikimedia_commons',
                license: searchResult.candidate.license || null,
                status: 'pending',
                ai_confidence: searchResult.candidate.confidence,
                ai_search_query: searchResult.candidate.search_term,
                is_profile: true,
                tags: []
              }]);

            if (insertError) {
              console.error('[AutoSearch] Media insert warning for ' + phenomenon.slug + ':', insertError.message);
            }

            results.push({
              id: phenomenon.id,
              slug: phenomenon.slug,
              name: phenomenon.name,
              category: phenomenon.category,
              status: 'found',
              selected_url: searchResult.candidate.url,
              selected_confidence: searchResult.candidate.confidence,
              candidates_evaluated: searchResult.evaluated,
              error: null
            });
            successCount++;
          }
        } else {
          results.push({
            id: phenomenon.id,
            slug: phenomenon.slug,
            name: phenomenon.name,
            category: phenomenon.category,
            status: 'no_match',
            selected_url: null,
            selected_confidence: 0,
            candidates_evaluated: searchResult.evaluated,
            error: null
          });
          noMatchCount++;
        }
      } catch (phenomError) {
        results.push({
          id: phenomenon.id,
          slug: phenomenon.slug,
          name: phenomenon.name,
          category: phenomenon.category,
          status: 'error',
          selected_url: null,
          selected_confidence: 0,
          candidates_evaluated: 0,
          error: phenomError instanceof Error ? phenomError.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        total_needing_images: totalNeedingImages,
        batch_size: batch.length,
        batch_offset: requestOffset,
        images_found: successCount,
        no_match: noMatchCount,
        errors: errorCount,
        has_more: (requestOffset + batchSize) < totalNeedingImages,
        next_offset: requestOffset + batchSize
      },
      results: results
    });

  } catch (error) {
    console.error('[AutoSearch] Error:', error);
    return res.status(500).json({
      error: 'Auto-search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
