/**
 * API: POST /api/phenomena/resolve
 *
 * Resolve free-text phenomenon names (as produced by Paradocs Analysis'
 * `similar_phenomena` LLM output) to concrete encyclopedia entries.
 *
 * Input:  { "names": ["yogic siddhis and body-related phenomena", ...] }
 * Output: { "matches": { "<original name>": { slug, name, category } | null } }
 *
 * Matching strategy (in order):
 *   1. Exact-by-slug  (naive slugify of the input)
 *   2. Case-insensitive name / aliases ilike match
 *   3. Token-based ilike: take the longest content word (>3 chars) from
 *      the phrase and try ilike against `name` and `aliases`
 *   4. null  → caller can fall back to an encyclopedia search URL
 *
 * This replaces the previous naive behaviour where the frontend blindly
 * slugified the LLM output and always produced dead links that redirected
 * to the encyclopedia index. (QA/QC Apr 15 2026.)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type Match = { slug: string; name: string; category: string | null } | null;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Drop low-signal filler that the LLM likes to tack onto phenomenon labels.
// e.g. "yogic siddhis and body-related phenomena" → "yogic siddhis"
var FILLER_SUFFIX_RE = /\b(and\s+body[- ]related\s+phenomena|phenomena|experiences|reports?|cases?|and\s+related\s+.*|related\s+.*)\b/gi;

function primaryTokens(s: string): string[] {
  // Strip filler, then pick the longest meaningful tokens in order.
  var cleaned = s.replace(FILLER_SUFFIX_RE, ' ').replace(/\s+/g, ' ').trim();
  var stop = new Set(['the', 'and', 'or', 'of', 'for', 'with', 'a', 'an', 'in', 'on', 'to']);
  return cleaned
    .split(/\s+/)
    .map(function (t) { return t.toLowerCase().replace(/[^a-z0-9-]/g, ''); })
    .filter(function (t) { return t.length > 3 && !stop.has(t); });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = req.body || {};
  var names: string[] = Array.isArray(body.names) ? body.names : [];
  if (names.length === 0) return res.status(200).json({ matches: {} });
  // Clamp to avoid runaway queries.
  names = names.slice(0, 24);

  var url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });
  var sb = createClient(url, key);

  var matches: Record<string, Match> = {};

  for (var i = 0; i < names.length; i++) {
    var original = names[i];
    if (typeof original !== 'string' || !original.trim()) {
      matches[original] = null;
      continue;
    }

    // 1) slug hit
    var slug = slugify(original);
    var exact = await sb
      .from('phenomena')
      .select('slug, name, category')
      .eq('status', 'active')
      .eq('slug', slug)
      .limit(1);
    if (exact.data && exact.data.length > 0) {
      var e = exact.data[0] as any;
      matches[original] = { slug: e.slug, name: e.name, category: e.category };
      continue;
    }

    // 2) name / aliases ilike on the full phrase
    var full = original.replace(/[%_]/g, ' ').trim();
    var byName = await sb
      .from('phenomena')
      .select('slug, name, category, aliases, report_count')
      .eq('status', 'active')
      .or('name.ilike.%' + full + '%,aliases.cs.{' + full + '}')
      .order('report_count', { ascending: false, nullsFirst: false })
      .limit(1);
    if (byName.data && byName.data.length > 0) {
      var b = byName.data[0] as any;
      matches[original] = { slug: b.slug, name: b.name, category: b.category };
      continue;
    }

    // 3) token-level fallback — try the longest significant token
    var tokens = primaryTokens(original).sort(function (a, b) { return b.length - a.length; });
    var hit: Match = null;
    for (var t = 0; t < tokens.length && !hit; t++) {
      var token = tokens[t];
      var byTok = await sb
        .from('phenomena')
        .select('slug, name, category, report_count')
        .eq('status', 'active')
        .or('name.ilike.%' + token + '%,aliases.cs.{' + token + '}')
        .order('report_count', { ascending: false, nullsFirst: false })
        .limit(1);
      if (byTok.data && byTok.data.length > 0) {
        var r = byTok.data[0] as any;
        hit = { slug: r.slug, name: r.name, category: r.category };
      }
    }
    matches[original] = hit;
  }

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  return res.status(200).json({ matches: matches });
}
