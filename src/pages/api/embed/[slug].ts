/**
 * API: GET /api/embed/[slug]
 *
 * Embeddable Widget endpoint - returns an HTML snippet or JSON data
 * for external sites to embed a ParaDocs report card.
 *
 * Supports two modes:
 * - ?format=html  -> Returns a self-contained HTML card (for iframe embed)
 * - ?format=json  -> Returns JSON data (for custom rendering)
 * - ?format=script -> Returns a JS snippet that creates the embed
 *
 * Usage on external sites:
 *   <iframe src="https://beta.discoverparadocs.com/api/embed/roswell-incident?format=html" width="400" height="300"></iframe>
 *   OR
 *   <script src="https://beta.discoverparadocs.com/api/embed/roswell-incident?format=script"></script>
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
var baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://beta.discoverparadocs.com';

var categoryIcons: Record<string, string> = {
  ufo: '\uD83D\uDEF8', cryptid: '\uD83E\uDDB6', ghost: '\uD83D\uDC7B',
  psychic: '\uD83D\uDD2E', conspiracy: '\uD83D\uDD75\uFE0F',
  mythological: '\uD83D\uDC09', extraterrestrial: '\uD83D\uDC7D', other: '\u2753'
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var slug = req.query.slug;
  var format = (req.query.format || 'html') as string;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug parameter required' });
  }

  var supabase = createClient(supabaseUrl, supabaseKey);
  // Check if slug looks like a UUID to avoid PostgreSQL type error
  var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  var query = supabase
    .from('reports')
    .select('id, title, slug, description, category, location, date_of_event, credibility_score, view_count');
  if (isUuid) {
    query = query.or('slug.eq.' + slug + ',id.eq.' + slug);
  } else {
    query = query.eq('slug', slug);
  }
  var result = await query.single();

  if (result.error || !result.data) {
    return res.status(404).json({ error: 'Report not found' });
  }

  var r = result.data;
  var icon = categoryIcons[r.category] || '\uD83D\uDD2E';
  var catLabel = r.category ? r.category.charAt(0).toUpperCase() + r.category.slice(1) : 'Unknown';
  var score = Math.round((r.credibility_score || 0) * 100);
  var teaser = (r.description || '').substring(0, 120);
  if ((r.description || '').length > 120) teaser += '...';
  var reportUrl = baseUrl + '/report/' + (r.slug || r.id);

  // Allow CORS for embeds
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (format === 'json') {
    return res.status(200).json({
      id: r.id, title: r.title, slug: r.slug, category: r.category,
      icon: icon, location: r.location || '', date_of_event: r.date_of_event || '',
      credibility_score: r.credibility_score, score_percent: score,
      view_count: r.view_count || 0, teaser: teaser, url: reportUrl
    });
  }

  var scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444';

  var htmlCard = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:system-ui,-apple-system,sans-serif;background:transparent}'
    + '.card{background:#111827;border:1px solid #374151;border-radius:12px;padding:20px;color:#e5e7eb;max-width:400px;cursor:pointer;transition:border-color 0.2s}'
    + '.card:hover{border-color:#7c3aed}'
    + '.header{display:flex;align-items:center;gap:8px;margin-bottom:12px}'
    + '.icon{font-size:24px}'
    + '.cat{font-size:11px;color:#c084fc;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:2px 10px}'
    + '.title{font-size:16px;font-weight:700;color:#f3f4f6;margin-bottom:8px;line-height:1.3}'
    + '.teaser{font-size:13px;color:#9ca3af;line-height:1.5;margin-bottom:12px}'
    + '.meta{display:flex;gap:16px;font-size:12px;color:#6b7280;align-items:center}'
    + '.score{color:' + scoreColor + ';font-weight:600}'
    + '.brand{display:flex;align-items:center;gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid #1f2937;font-size:11px;color:#6b7280}'
    + '.brand span{color:#c084fc;font-weight:600}'
    + '</style></head><body>'
    + '<a class="card" href="' + reportUrl + '" target="_blank" rel="noopener" style="text-decoration:none;display:block">'
    + '<div class="header"><span class="icon">' + icon + '</span><span class="cat">' + catLabel + '</span></div>'
    + '<div class="title">' + r.title.replace(/</g, '&lt;') + '</div>'
    + '<div class="teaser">' + teaser.replace(/</g, '&lt;') + '</div>'
    + '<div class="meta">';

  if (r.location) {
    htmlCard += '<span>\uD83D\uDCCD ' + r.location.replace(/</g, '&lt;') + '</span>';
  }
  htmlCard += '<span class="score">' + score + '% credibility</span>';
  htmlCard += '<span>\uD83D\uDC41 ' + (r.view_count || 0) + ' views</span>';
  htmlCard += '</div>';
  htmlCard += '<div class="brand">\u2726 <span>ParaDocs</span></div>';
  htmlCard += '</a></body></html>';

  if (format === 'html') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlCard);
  }

  if (format === 'script') {
    var scriptContent = '(function(){'
      + 'var d=document;var s=d.currentScript;'
      + 'var f=d.createElement("iframe");'
      + 'f.src="' + baseUrl + '/api/embed/' + slug + '?format=html";'
      + 'f.style.border="none";f.style.width="400px";f.style.height="280px";f.style.borderRadius="12px";'
      + 'f.style.overflow="hidden";f.setAttribute("loading","lazy");'
      + 's.parentNode.insertBefore(f,s);'
      + '})();';
    res.setHeader('Content-Type', 'application/javascript');
    return res.status(200).send(scriptContent);
  }

  return res.status(400).json({ error: 'Invalid format. Use html, json, or script.' });
}
