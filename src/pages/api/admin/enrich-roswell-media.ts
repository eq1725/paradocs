import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';

async function getAuthenticatedUser(req: NextApiRequest) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  var { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// ─── New media to add for enrichment ─────────────────────────────────
// Only adds media that doesn't already exist (checks by URL).
// Focus: government documents, audio sources, and video interviews.

var NEW_MEDIA: Record<string, Array<{media_type: string; url: string; caption: string; is_primary: boolean}>> = {
  // Showcase — add government documents and audio
  'the-roswell-incident-july-1947-showcase': [
    {
      media_type: 'audio',
      url: 'https://soundcloud.com/x503/abc-news-1947-roswell-ufo',
      caption: 'ABC News Radio Bulletin — July 8, 1947. Correspondent Taylor Grant reports from New York on the RAAF announcement of a recovered "flying disc" near Roswell. One of the earliest broadcast reports before the retraction.',
      is_primary: false,
    },
    {
      media_type: 'document',
      url: 'https://www.gao.gov/assets/nsiad-95-187.pdf',
      caption: 'GAO Report NSIAD-95-187 (July 1995) — "Results of a Search for Records Concerning the 1947 Crash Near Roswell, New Mexico." Found that RAAF administrative records (1945-1949) had been destroyed with no documentation of when, by whom, or under what authority.',
      is_primary: false,
    },
    {
      media_type: 'document',
      url: 'https://vault.fbi.gov/Roswell%20UFO',
      caption: 'FBI Vault — Roswell UFO Files. Declassified FBI documents including a 1947 internal memo referencing the recovery of a "flying disc" near Roswell and subsequent military handling of the material.',
      is_primary: false,
    },
  ],

  // Mac Brazel — add the Roswell Daily Record as document source
  'mac-brazel-roswell-debris-discovery-1947': [
    {
      media_type: 'document',
      url: 'https://vault.fbi.gov/Roswell%20UFO',
      caption: 'FBI Vault — Roswell UFO Files. Includes a July 8, 1947 FBI teletype referencing the recovery of material Brazel reported to Sheriff Wilcox.',
      is_primary: false,
    },
  ],

  // Jesse Marcel — add the C-SPAN Roswell Reports video
  'jesse-marcel-roswell-debris-field-1947': [
    {
      media_type: 'document',
      url: 'https://www.nsa.gov/portals/75/documents/news-features/declassified-documents/ufo/report_af_roswell.pdf',
      caption: 'NSA-hosted declassified U.S. Air Force Roswell Report (1994) — The official investigation that attributed the debris Marcel recovered to Project Mogul balloon equipment.',
      is_primary: false,
    },
  ],

  // Sheridan Cavitt — add Air Force report (his interview is in it)
  'sheridan-cavitt-roswell-cic-1947': [
    {
      media_type: 'document',
      url: 'https://www.gao.gov/assets/nsiad-95-187.pdf',
      caption: 'GAO Report NSIAD-95-187 — The investigation that found RAAF records had been destroyed, removing documentation that could have corroborated or refuted Cavitt\'s evolving account.',
      is_primary: false,
    },
  ],

  // Walter Haut — add the National Archives footage
  'walter-haut-roswell-press-release-1947': [
    {
      media_type: 'document',
      url: 'https://vault.fbi.gov/Roswell%20UFO',
      caption: 'FBI Vault — Roswell UFO Files. Includes 1947 documents from the period when Haut issued the press release that was transmitted worldwide.',
      is_primary: false,
    },
  ],

  // Philip Corso — add the UK National Archives document reference
  'philip-corso-roswell-reverse-engineering-1997': [
    {
      media_type: 'document',
      url: 'https://vault.fbi.gov/Roswell%20UFO',
      caption: 'FBI Vault — Roswell UFO Files. While Corso\'s claims postdate these documents, the original 1947 FBI records provide context for evaluating his assertions about government recovery programs.',
      is_primary: false,
    },
  ],
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results = { mediaAdded: 0, skipped: 0, errors: [] as string[] };

  for (var slug in NEW_MEDIA) {
    if (!NEW_MEDIA.hasOwnProperty(slug)) continue;

    // Find report by slug
    var { data: report, error: fetchErr } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', slug)
      .single();

    if (fetchErr || !report) {
      results.errors.push('Report not found: ' + slug);
      continue;
    }

    // Get existing media URLs for this report
    var { data: existingMedia } = await supabase
      .from('report_media')
      .select('url')
      .eq('report_id', report.id);

    var existingUrls = new Set((existingMedia || []).map(function(m: any) { return m.url; }));

    var mediaItems = NEW_MEDIA[slug];
    for (var i = 0; i < mediaItems.length; i++) {
      var item = mediaItems[i];

      if (existingUrls.has(item.url)) {
        results.skipped++;
        continue;
      }

      var { error: insertErr } = await supabase.from('report_media').insert({
        report_id: report.id,
        media_type: item.media_type,
        url: item.url,
        caption: item.caption,
        is_primary: item.is_primary,
      });

      if (insertErr) {
        results.errors.push('Insert failed for ' + slug + ': ' + insertErr.message);
      } else {
        results.mediaAdded++;
      }
    }
  }

  return res.status(200).json({
    success: true,
    results: results,
    message: 'Added ' + results.mediaAdded + ' new media items, skipped ' + results.skipped + ' existing',
  });
}
