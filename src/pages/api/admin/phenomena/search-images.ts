/**
 * Search Wikimedia Commons for Phenomena Images API
 *
 * Searches Wikimedia Commons for images related to phenomena and stores
 * candidate images in the phenomena_media table for human review.
 * Uses AI confidence scoring based on metadata relevance matching.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var USER_AGENT = 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)';
var RATE_LIMIT_MS = 200;
var MIN_IMAGE_SIZE = 200;
var MAX_FILE_SIZE_MB = 10;
var MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Allowed image MIME types
var ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

interface Phenomenon {
  id: string;
  slug: string;
  name: string;
  aliases?: string[];
  category: string;
}

interface WikimediaSearchResult {
  ns: number;
  title: string;
}

interface WikimediaImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
  extmetadata?: Record<string, { value: string }>;
}

interface ImageCandidate {
  title: string;
  original_url: string;
  width: number;
  height: number;
  mime: string;
  ai_confidence: number;
  ai_search_query: string;
  license?: string;
  description?: string;
}

interface SearchResult {
  slug: string;
  phenomenon_name: string;
  candidates_found: number;
  inserted: number;
  duplicates_skipped: number;
  errors: string[];
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

function getSearchTerms(phenomenon: Phenomenon): string[] {
  var terms = [phenomenon.name];

  if (phenomenon.aliases && Array.isArray(phenomenon.aliases) && phenomenon.aliases.length > 0) {
    for (var i = 0; i < phenomenon.aliases.length; i++) {
      var alias = phenomenon.aliases[i];
      if (alias && typeof alias === 'string' && alias.length > 0) {
        terms.push(alias);
      }
    }
  }

  return terms;
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
    /book|novel|author|publication/i
  ];

  for (var i = 0; i < mismatchPatterns.length; i++) {
    var pattern = mismatchPatterns[i];
    if (pattern.test(imageTitle) || pattern.test(description)) {
      return { score: 0.1, reason: 'likely_mismatch' };
    }
  }

  var score = 0;
  var reasons = [];

  // High confidence: exact name or search term in title
  if (titleLower.includes(phenomLower) || titleLower.includes(searchLower)) {
    score = 0.95;
    reasons.push('name_in_title');
  }
  // Medium confidence: name in description or categories
  else if (descLower.includes(phenomLower) || catLower.includes(phenomLower)) {
    score = 0.70;
    reasons.push('name_in_description');
  }
  // Medium confidence: search term in description
  else if (descLower.includes(searchLower) || catLower.includes(searchLower)) {
    score = 0.65;
    reasons.push('term_in_description');
  }
  // Low confidence: generic match
  else {
    score = 0.40;
    reasons.push('generic_match');
  }

  return { score: score, reason: reasons[0] || 'generic_match' };
}

async function searchWikimediaCommons(searchTerm: string): Promise<WikimediaSearchResult[]> {
  try {
    var query = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=' +
      encodeURIComponent(searchTerm) + '&format=json&srlimit=50';

    var response = await fetch(query, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
      console.error('[SearchImages] Wikimedia search failed:', response.status);
      return [];
    }

    var data = await response.json() as { query?: { search?: WikimediaSearchResult[] } };
    return data.query?.search || [];
  } catch (error) {
    console.error('[SearchImages] Search error:', error);
    return [];
  }
}

async function getImageInfo(imageTitle: string): Promise<ImageCandidate | null> {
  try {
    var query = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' +
      encodeURIComponent(imageTitle) +
      '&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json';

    var response = await fetch(query, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
      return null;
    }

    var data = await response.json() as {
      query?: {
        pages?: Record<string, {
          imageinfo?: [WikimediaImageInfo]
        }>
      }
    };

    var pages = data.query?.pages;
    if (!pages) {
      return null;
    }

    var pageKeys = Object.keys(pages);
    if (pageKeys.length === 0) {
      return null;
    }

    var pageKey = pageKeys[0];
    var page = pages[pageKey];
    if (!page.imageinfo || page.imageinfo.length === 0) {
      return null;
    }

    var info = page.imageinfo[0];

    // Filter: size and MIME type
    if (!info.width || !info.height || info.width < MIN_IMAGE_SIZE || info.height < MIN_IMAGE_SIZE) {
      return null;
    }

    if (!ALLOWED_MIMES.includes(info.mime)) {
      return null;
    }

    // Extract metadata
    var license = '';
    var description = '';

    if (info.extmetadata) {
      var licenseData = info.extmetadata['LicenseShortName'];
      if (licenseData && licenseData.value) {
        license = licenseData.value;
      }

      var descData = info.extmetadata['ImageDescription'];
      if (descData && descData.value) {
        description = descData.value.substring(0, 500);
      }
    }

    return {
      title: imageTitle,
      original_url: info.url,
      width: info.width,
      height: info.height,
      mime: info.mime,
      ai_confidence: 0,
      ai_search_query: '',
      license: license || null,
      description: description || null
    };
  } catch (error) {
    console.error('[SearchImages] Image info error:', error);
    return null;
  }
}

async function getPhenomenaByFilter(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  slugs?: string[],
  category?: string,
  limit?: number
): Promise<Phenomenon[]> {
  var query = supabase.from('phenomena').select('id, slug, name, aliases, category');

  if (slugs && slugs.length > 0) {
    query = query.in('slug', slugs);
  } else if (category) {
    query = query.eq('category', category);
  }

  var { data, error } = await query.limit(limit || 100);

  if (error || !data) {
    console.error('[SearchImages] Fetch phenomena error:', error?.message);
    return [];
  }

  return data as Phenomenon[];
}

async function checkDuplicateMedia(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phenomenonId: string,
  originalUrl: string
): Promise<boolean> {
  var { data, error } = await supabase
    .from('phenomena_media')
    .select('id')
    .eq('phenomenon_id', phenomenonId)
    .eq('original_url', originalUrl)
    .limit(1);

  if (error) {
    console.error('[SearchImages] Duplicate check error:', error.message);
    return false;
  }

  return data && data.length > 0;
}

async function insertMediaCandidate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phenomenonId: string,
  candidate: ImageCandidate,
  searchQuery: string
): Promise<boolean> {
  try {
    var { error } = await supabase
      .from('phenomena_media')
      .insert([{
        phenomenon_id: phenomenonId,
        media_type: 'image',
        original_url: candidate.original_url,
        thumbnail_url: candidate.original_url,
        caption: candidate.description || null,
        source: 'wikimedia_commons',
        license: candidate.license || null,
        status: 'pending',
        ai_confidence: candidate.ai_confidence,
        ai_search_query: searchQuery,
        tags: []
      }]);

    if (error) {
      console.error('[SearchImages] Insert error:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[SearchImages] Insert exception:', error);
    return false;
  }
}

async function searchImagesForPhenomenon(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phenomenon: Phenomenon,
  maxResults: number
): Promise<SearchResult> {
  var result: SearchResult = {
    slug: phenomenon.slug,
    phenomenon_name: phenomenon.name,
    candidates_found: 0,
    inserted: 0,
    duplicates_skipped: 0,
    errors: []
  };

  try {
    var searchTerms = getSearchTerms(phenomenon);
    var allCandidates: ImageCandidate[] = [];

    for (var i = 0; i < searchTerms.length; i++) {
      var searchTerm = searchTerms[i];

      console.log('[SearchImages] Searching for ' + phenomenon.slug + ' with term: ' + searchTerm);

      var results = await searchWikimediaCommons(searchTerm);

      for (var j = 0; j < results.length && allCandidates.length < maxResults; j++) {
        var searchResult = results[j];

        var imageInfo = await getImageInfo(searchResult.title);

        await sleep(RATE_LIMIT_MS);

        if (imageInfo) {
          // Score the confidence
          var descText = imageInfo.description || '';
          var confidence = scoreConfidence(
            imageInfo.title,
            descText,
            searchTerm,
            searchTerm,
            phenomenon.name
          );

          imageInfo.ai_confidence = confidence.score;
          imageInfo.ai_search_query = searchTerm;

          // Only include if confidence is above threshold
          if (confidence.score >= 0.40) {
            allCandidates.push(imageInfo);
            result.candidates_found++;
          }
        }
      }

      // Small delay between search terms
      await sleep(RATE_LIMIT_MS);
    }

    // Insert candidates into database
    for (var k = 0; k < allCandidates.length; k++) {
      var candidate = allCandidates[k];

      // Check for duplicates
      var isDuplicate = await checkDuplicateMedia(
        supabase,
        phenomenon.id,
        candidate.original_url
      );

      if (isDuplicate) {
        result.duplicates_skipped++;
        continue;
      }

      // Insert the candidate
      var success = await insertMediaCandidate(
        supabase,
        phenomenon.id,
        candidate,
        candidate.ai_search_query
      );

      if (success) {
        result.inserted++;
      } else {
        result.errors.push('Failed to insert candidate: ' + candidate.title);
      }
    }

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
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
  var { slugs, category, limit = 20, max_results_per = 5 } = req.body;

  // Validation
  if (!slugs && !category) {
    return res.status(400).json({
      error: 'Bad request',
      details: 'Either slugs array or category string is required'
    });
  }

  if (slugs && !Array.isArray(slugs)) {
    return res.status(400).json({
      error: 'Bad request',
      details: 'slugs must be an array'
    });
  }

  if (typeof limit !== 'number' || limit < 1) {
    return res.status(400).json({
      error: 'Bad request',
      details: 'limit must be a positive number'
    });
  }

  if (typeof max_results_per !== 'number' || max_results_per < 1) {
    return res.status(400).json({
      error: 'Bad request',
      details: 'max_results_per must be a positive number'
    });
  }

  try {
    // Fetch phenomena
    var phenomena = await getPhenomenaByFilter(
      supabase,
      slugs,
      category,
      limit
    );

    if (phenomena.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        details: 'No phenomena found matching the criteria'
      });
    }

    var results: SearchResult[] = [];

    for (var i = 0; i < phenomena.length; i++) {
      var phenomenon = phenomena[i];

      var searchResult = await searchImagesForPhenomenon(
        supabase,
        phenomenon,
        max_results_per
      );

      results.push(searchResult);

      // Small delay between phenomena
      await sleep(RATE_LIMIT_MS);
    }

    var totalCandidatesFound = 0;
    var totalInserted = 0;
    var totalDuplicates = 0;
    var allErrors: string[] = [];

    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      totalCandidatesFound += r.candidates_found;
      totalInserted += r.inserted;
      totalDuplicates += r.duplicates_skipped;
      for (var k = 0; k < r.errors.length; k++) {
        allErrors.push(r.errors[k]);
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        phenomena_processed: phenomena.length,
        total_candidates_found: totalCandidatesFound,
        total_inserted: totalInserted,
        total_duplicates_skipped: totalDuplicates,
        total_errors: allErrors.length
      },
      results: results,
      errors: allErrors
    });

  } catch (error) {
    console.error('[SearchImages] Error:', error);
    return res.status(500).json({
      error: 'Failed to search images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
