/**
 * Wikipedia Image Lookup API for Phenomena
 *
 * Uses Wikipedia's REST API to find lead images for phenomena.
 * Wikipedia editors curate article images, so quality is much higher
 * than raw Wikimedia Commons keyword search.
 *
 * Strategy:
 * 1. Search Wikipedia for the phenomenon name
 * 2. Get the page summary (includes lead image)
 * 3. Score relevance based on how well the article matches
 * 4. Store as a candidate in phenomena_media with source 'wikipedia'
 *
 * POST body:
 *   category?: string - filter to one category (default: 'cryptids')
 *   batch_size?: number - how many to process (default: 20)
 *   offset?: number - skip this many (for pagination)
 *   replace_existing?: boolean - re-search ones that already have images (default: false)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export var config = {
  maxDuration: 60
};

var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var USER_AGENT = 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)';
var RATE_LIMIT_MS = 200;
var MIN_IMAGE_WIDTH = 200;

interface Phenomenon {
  id: string;
  slug: string;
  name: string;
  aliases: string[] | null;
  category: string;
  primary_image_url: string | null;
  profile_review_status: string | null;
}

interface WikipediaSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop?: { page?: string };
  };
}

interface LookupResult {
  id: string;
  slug: string;
  name: string;
  status: string;
  wikipedia_title: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  confidence: number;
  confidence_reason: string;
  description: string | null;
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

/**
 * Search Wikipedia for an article matching the phenomenon.
 * Returns the best matching page title, or null.
 */
async function findWikipediaArticle(searchTerm: string, category: string): Promise<string | null> {
  try {
    // Build a category-aware search query
    var query = searchTerm;
    if (category === 'cryptids') {
      // Try the name first, then with qualifiers
      query = searchTerm + ' cryptid OR creature OR folklore OR legend';
    } else if (category === 'ufos_aliens') {
      query = searchTerm + ' UFO OR extraterrestrial OR sighting';
    } else if (category === 'ghosts_hauntings') {
      query = searchTerm + ' ghost OR haunting OR paranormal';
    }

    var url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='
      + encodeURIComponent(query)
      + '&srnamespace=0&srlimit=5&format=json';

    var response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) return null;

    var data = await response.json() as {
      query?: { search?: Array<{ title: string; snippet: string }> }
    };

    var results = data.query?.search;
    if (!results || results.length === 0) return null;

    // Score each result by how well it matches the phenomenon
    var searchLower = searchTerm.toLowerCase();
    var bestTitle: string | null = null;
    var bestScore = 0;

    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      var titleLower = result.title.toLowerCase();
      var snippetLower = (result.snippet || '').toLowerCase();
      var score = 0;

      // Exact title match is best
      if (titleLower === searchLower) {
        score = 1.0;
      }
      // Title contains the search term
      else if (titleLower.indexOf(searchLower) > -1) {
        score = 0.85;
      }
      // Search term contains the title (e.g. searching "Loch Ness Monster" finds "Loch Ness")
      else if (searchLower.indexOf(titleLower) > -1) {
        score = 0.7;
      }
      // Snippet mentions cryptid/creature/folklore keywords
      else if (snippetLower.indexOf('cryptid') > -1 || snippetLower.indexOf('creature') > -1 ||
               snippetLower.indexOf('folklore') > -1 || snippetLower.indexOf('legend') > -1 ||
               snippetLower.indexOf('sighting') > -1 || snippetLower.indexOf('monster') > -1) {
        score = 0.5;
      }
      // Generic match
      else {
        score = 0.2;
      }

      // Penalize disambiguation pages
      if (titleLower.indexOf('(disambiguation)') > -1) {
        score = score * 0.1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTitle = result.title;
      }
    }

    // Only return if we have a reasonable match
    if (bestScore >= 0.5) {
      return bestTitle;
    }

    // Fallback: try exact title lookup (many cryptids have exact Wikipedia titles)
    var exactUrl = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
      + encodeURIComponent(searchTerm.replace(/ /g, '_'));

    var exactResponse = await fetch(exactUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (exactResponse.ok) {
      var summaryData = await exactResponse.json() as WikipediaSummary;
      if (summaryData.title && summaryData.extract) {
        return summaryData.title;
      }
    }

    return bestTitle;
  } catch (error) {
    console.error('[WikiLookup] Search error for "' + searchTerm + '":', error);
    return null;
  }
}

/**
 * Get the Wikipedia page summary including lead image.
 */
async function getPageSummary(pageTitle: string): Promise<WikipediaSummary | null> {
  try {
    var url = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
      + encodeURIComponent(pageTitle.replace(/ /g, '_'));

    var response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) return null;

    var data = await response.json() as WikipediaSummary;
    return data;
  } catch (error) {
    console.error('[WikiLookup] Summary error for "' + pageTitle + '":', error);
    return null;
  }
}

/**
 * Score how relevant a Wikipedia article image is for a phenomenon.
 */
function scoreWikipediaMatch(
  phenomenonName: string,
  pageTitle: string,
  extract: string,
  description: string | null,
  hasImage: boolean
): { score: number; reason: string } {
  var nameLower = phenomenonName.toLowerCase();
  var titleLower = pageTitle.toLowerCase();
  var extractLower = extract.toLowerCase();
  var descLower = (description || '').toLowerCase();

  // No image = no use
  if (!hasImage) {
    return { score: 0, reason: 'no_image' };
  }

  // Exact or near-exact title match with an image = high confidence
  if (titleLower === nameLower || titleLower.replace(/[_-]/g, ' ') === nameLower.replace(/[_-]/g, ' ')) {
    return { score: 0.95, reason: 'exact_title_match' };
  }

  // Title contains the phenomenon name
  if (titleLower.indexOf(nameLower) > -1) {
    // Check if the article is about the right topic
    if (extractLower.indexOf('cryptid') > -1 || extractLower.indexOf('creature') > -1 ||
        extractLower.indexOf('folklore') > -1 || extractLower.indexOf('legend') > -1 ||
        extractLower.indexOf('monster') > -1 || extractLower.indexOf('mythical') > -1 ||
        extractLower.indexOf('supernatural') > -1 || extractLower.indexOf('cryptozoology') > -1) {
      return { score: 0.90, reason: 'name_in_title_paranormal_context' };
    }
    return { score: 0.75, reason: 'name_in_title' };
  }

  // Name in description
  if (descLower.indexOf(nameLower) > -1) {
    return { score: 0.70, reason: 'name_in_description' };
  }

  // Extract mentions relevant keywords
  if (extractLower.indexOf(nameLower) > -1) {
    return { score: 0.65, reason: 'name_in_extract' };
  }

  // Partial match - some words overlap
  var nameWords = nameLower.split(/\s+/);
  var matchingWords = 0;
  for (var i = 0; i < nameWords.length; i++) {
    if (nameWords[i].length > 3 && titleLower.indexOf(nameWords[i]) > -1) {
      matchingWords++;
    }
  }
  if (matchingWords > 0 && nameWords.length > 0) {
    var ratio = matchingWords / nameWords.length;
    if (ratio >= 0.5) {
      return { score: 0.55, reason: 'partial_title_match' };
    }
  }

  return { score: 0.30, reason: 'weak_match' };
}

async function lookupPhenomenon(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phenomenon: Phenomenon
): Promise<LookupResult> {
  var result: LookupResult = {
    id: phenomenon.id,
    slug: phenomenon.slug,
    name: phenomenon.name,
    status: 'no_match',
    wikipedia_title: null,
    image_url: null,
    thumbnail_url: null,
    confidence: 0,
    confidence_reason: '',
    description: null,
    error: null
  };

  try {
    // Try the phenomenon name first
    var searchTerms = [phenomenon.name];
    if (phenomenon.aliases && Array.isArray(phenomenon.aliases)) {
      for (var a = 0; a < phenomenon.aliases.length && a < 2; a++) {
        if (phenomenon.aliases[a] && typeof phenomenon.aliases[a] === 'string') {
          searchTerms.push(phenomenon.aliases[a]);
        }
      }
    }

    var bestSummary: WikipediaSummary | null = null;
    var bestScore = 0;
    var bestReason = '';

    for (var t = 0; t < searchTerms.length; t++) {
      var term = searchTerms[t];

      // First try direct page lookup (fastest, most accurate)
      var directSummary = await getPageSummary(term);
      await sleep(RATE_LIMIT_MS);

      if (directSummary && directSummary.extract) {
        var hasImage = !!(directSummary.originalimage || directSummary.thumbnail);
        var scoring = scoreWikipediaMatch(
          phenomenon.name,
          directSummary.title,
          directSummary.extract,
          directSummary.description || null,
          hasImage
        );

        if (scoring.score > bestScore) {
          bestScore = scoring.score;
          bestReason = scoring.reason;
          bestSummary = directSummary;
        }

        // If we got a great match, stop searching
        if (bestScore >= 0.90) break;
      }

      // If direct lookup didn't work well, try search API
      if (bestScore < 0.70) {
        var articleTitle = await findWikipediaArticle(term, phenomenon.category);
        await sleep(RATE_LIMIT_MS);

        if (articleTitle) {
          var searchSummary = await getPageSummary(articleTitle);
          await sleep(RATE_LIMIT_MS);

          if (searchSummary && searchSummary.extract) {
            var hasImg = !!(searchSummary.originalimage || searchSummary.thumbnail);
            var searchScoring = scoreWikipediaMatch(
              phenomenon.name,
              searchSummary.title,
              searchSummary.extract,
              searchSummary.description || null,
              hasImg
            );

            if (searchScoring.score > bestScore) {
              bestScore = searchScoring.score;
              bestReason = searchScoring.reason;
              bestSummary = searchSummary;
            }
          }
        }
      }

      // Stop if we found a good match
      if (bestScore >= 0.85) break;
    }

    // If we found a match with an image
    if (bestSummary && bestScore >= 0.50) {
      var imageUrl = bestSummary.originalimage
        ? bestSummary.originalimage.source
        : (bestSummary.thumbnail ? bestSummary.thumbnail.source : null);

      var thumbUrl = bestSummary.thumbnail
        ? bestSummary.thumbnail.source
        : imageUrl;

      if (imageUrl) {
        // Check minimum size
        var imgWidth = bestSummary.originalimage
          ? bestSummary.originalimage.width
          : (bestSummary.thumbnail ? bestSummary.thumbnail.width : 0);

        if (imgWidth < MIN_IMAGE_WIDTH) {
          result.status = 'image_too_small';
          result.confidence = bestScore;
          result.confidence_reason = bestReason;
          return result;
        }

        result.status = 'found';
        result.wikipedia_title = bestSummary.title;
        result.image_url = imageUrl;
        result.thumbnail_url = thumbUrl;
        result.confidence = bestScore;
        result.confidence_reason = bestReason;
        result.description = (bestSummary.description || bestSummary.extract || '').substring(0, 300);

        // Check for duplicate in phenomena_media
        var { data: existing } = await supabase
          .from('phenomena_media')
          .select('id')
          .eq('phenomenon_id', phenomenon.id)
          .eq('original_url', imageUrl)
          .limit(1);

        if (existing && existing.length > 0) {
          result.status = 'duplicate';
          return result;
        }

        // Insert into phenomena_media
        var { error: insertError } = await supabase
          .from('phenomena_media')
          .insert([{
            phenomenon_id: phenomenon.id,
            media_type: 'image',
            original_url: imageUrl,
            thumbnail_url: thumbUrl,
            caption: result.description,
            source: 'wikipedia',
            source_url: bestSummary.content_urls?.desktop?.page || null,
            license: 'CC-compatible (Wikipedia)',
            status: 'pending',
            ai_confidence: bestScore,
            ai_search_query: 'wikipedia:' + bestSummary.title,
            is_profile: true,
            tags: ['wikipedia_lead_image']
          }]);

        if (insertError) {
          result.status = 'error';
          result.error = 'Insert failed: ' + insertError.message;
          return result;
        }

        // Update the phenomenon's primary_image_url if it doesn't have one,
        // or if the Wikipedia image scored higher than the existing one
        var shouldUpdate = !phenomenon.primary_image_url || bestScore >= 0.85;

        if (shouldUpdate) {
          var { error: updateError } = await supabase
            .from('phenomena')
            .update({
              primary_image_url: imageUrl,
              profile_review_status: 'unreviewed'
            })
            .eq('id', phenomenon.id);

          if (updateError) {
            console.error('[WikiLookup] Update phenomenon error:', updateError.message);
          }
        }
      } else {
        result.status = 'article_found_no_image';
        result.wikipedia_title = bestSummary.title;
        result.confidence = bestScore;
        result.confidence_reason = bestReason;
      }
    }

    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
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

  var category = req.body.category || 'cryptids';
  var batchSize = parseInt(req.body.batch_size) || 20;
  var offset = parseInt(req.body.offset) || 0;
  var replaceExisting = req.body.replace_existing === true;

  if (batchSize > 50) batchSize = 50;

  try {
    // Fetch phenomena
    var query = supabase
      .from('phenomena')
      .select('id, slug, name, aliases, category, primary_image_url, profile_review_status')
      .eq('status', 'active')
      .eq('category', category)
      .order('name', { ascending: true });

    var { data: allPhenomena, error: fetchError } = await query.range(0, 5000);

    if (fetchError || !allPhenomena) {
      return res.status(500).json({
        error: 'Failed to fetch phenomena',
        details: fetchError?.message || 'Unknown error'
      });
    }

    // Filter based on whether we're replacing existing images
    var targets: Phenomenon[] = [];
    for (var i = 0; i < allPhenomena.length; i++) {
      var p = allPhenomena[i] as Phenomenon;
      if (replaceExisting) {
        // Include all unreviewed (re-search with Wikipedia)
        if (p.profile_review_status !== 'approved') {
          targets.push(p);
        }
      } else {
        // Only ones without images
        if (!p.primary_image_url) {
          targets.push(p);
        }
      }
    }

    var batch = targets.slice(offset, offset + batchSize);

    console.log('[WikiLookup] Processing ' + batch.length + ' of ' + targets.length + ' total targets');

    var results: LookupResult[] = [];
    var foundCount = 0;
    var noMatchCount = 0;
    var errorCount = 0;
    var duplicateCount = 0;

    for (var b = 0; b < batch.length; b++) {
      var phenomenon = batch[b];
      console.log('[WikiLookup] (' + (b + 1) + '/' + batch.length + ') Looking up: ' + phenomenon.name);

      var lookupResult = await lookupPhenomenon(supabase, phenomenon);
      results.push(lookupResult);

      if (lookupResult.status === 'found') foundCount++;
      else if (lookupResult.status === 'duplicate') duplicateCount++;
      else if (lookupResult.status === 'error') errorCount++;
      else noMatchCount++;
    }

    return res.status(200).json({
      success: true,
      summary: {
        total_targets: targets.length,
        batch_size: batch.length,
        offset: offset,
        found: foundCount,
        no_match: noMatchCount,
        duplicates: duplicateCount,
        errors: errorCount,
        has_more: (offset + batchSize) < targets.length,
        next_offset: offset + batchSize
      },
      results: results
    });
  } catch (error) {
    console.error('[WikiLookup] Error:', error);
    return res.status(500).json({
      error: 'Wikipedia lookup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
