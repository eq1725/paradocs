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

// Media entries keyed by report slug
var MEDIA_BY_SLUG: Record<string, Array<{media_type: string; url: string; caption: string; is_primary: boolean}>> = {
  // ─── Bill Rickett — CIC agent, no personal photo available ─────────
  'bill-rickett-roswell-cic-agent-1947': [
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Roswell_AAF_sign_-_1946.jpg',
      caption: 'Roswell Army Air Field entrance sign, 1946 \u2014 the base where Master Sergeant Bill Rickett served as a Counter-Intelligence Corps agent under Captain Cavitt.',
      is_primary: true,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
      caption: 'Roswell Daily Record, July 8, 1947 \u2014 the front page headline that resulted from the debris recovery Rickett participated in.',
      is_primary: false,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Marcel-roswell-debris_0.jpg',
      caption: 'Major Jesse Marcel with debris at the Fort Worth press conference \u2014 Rickett described handling similar anomalous material at the recovery site.',
      is_primary: false,
    },
  ],

  // ─── Glenn Dennis — verified personal photo available ──────────────
  'glenn-dennis-roswell-mortician-1947': [
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Glenn_Dennis_in_1990.png',
      caption: 'Glenn Dennis in 1990 \u2014 the Roswell mortician who claimed the military base called requesting small, hermetically sealed coffins. He co-founded the International UFO Museum in 1991.',
      is_primary: true,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/UFO_Museum%2C_Roswell%2C_NM.JPG',
      caption: 'The International UFO Museum and Research Center in Roswell \u2014 co-founded by Glenn Dennis and Walter Haut in 1991.',
      is_primary: false,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
      caption: 'Roswell Daily Record, July 8, 1947 \u2014 the press coverage that followed the events Dennis later described.',
      is_primary: false,
    },
  ],

  // ─── Barney Barnett — no personal photo, died 1969 ─────────────────
  'barney-barnett-roswell-san-agustin-1947': [
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/6/63/USA.NM.VeryLargeArray.02.jpg',
      caption: 'The Plains of San Agustin, New Mexico \u2014 the remote landscape where Barnett reportedly encountered crash debris and non-human bodies while conducting field work for the U.S. Soil Conservation Service. No photograph of Barnett himself is known to exist.',
      is_primary: true,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
      caption: 'Roswell Daily Record, July 8, 1947 \u2014 the news coverage of the crash event that Barnett\'s account may be connected to.',
      is_primary: false,
    },
  ],

  // ─── Chester Lytle — no personal photo, private engineer ───────────
  'chester-lytle-roswell-blanchard-testimony-1953': [
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Wm_H_Blanchard_VCSAF.jpg',
      caption: 'General William H. Blanchard \u2014 the Roswell base commander in July 1947 who, according to Lytle, personally disclosed the alien spacecraft recovery during a 1953 flight. Blanchard later became Vice Chief of Staff of the U.S. Air Force.',
      is_primary: true,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Roswell_AAF_sign_-_1946.jpg',
      caption: 'Roswell Army Air Field entrance \u2014 the base Blanchard commanded when the crash recovery occurred in July 1947.',
      is_primary: false,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
      caption: 'Roswell Daily Record, July 8, 1947 \u2014 the press release Blanchard authorized, which he later confirmed to Lytle was accurate.',
      is_primary: false,
    },
  ],

  // ─── Philip Corso — verified personal photos available ─────────────
  'philip-corso-roswell-reverse-engineering-1997': [
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Philip_j_corso_2.jpg',
      caption: 'Lt. Col. Philip J. Corso (right) in military uniform \u2014 the Army intelligence officer who claimed to have managed the reverse-engineering of Roswell alien technology at the Pentagon.',
      is_primary: true,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Philip_j_corso_1.jpg',
      caption: 'Philip Corso (second from left) with fellow military officers \u2014 Corso served on the National Security Council staff under President Eisenhower.',
      is_primary: false,
    },
    {
      media_type: 'image',
      url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Philip_j_corso_3.jpg',
      caption: 'Corso during his military career \u2014 he retired as a Lieutenant Colonel after 21 years of service.',
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

  var slugs = Object.keys(MEDIA_BY_SLUG);

  for (var i = 0; i < slugs.length; i++) {
    var slug = slugs[i];
    var mediaItems = MEDIA_BY_SLUG[slug];

    // Get report ID
    var { data: report, error: findErr } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', slug)
      .single();

    if (findErr || !report) {
      results.errors.push('Report not found: ' + slug);
      continue;
    }

    // Check if media already exists
    var { data: existingMedia } = await supabase
      .from('report_media')
      .select('id')
      .eq('report_id', report.id)
      .limit(1);

    if (existingMedia && existingMedia.length > 0) {
      results.skipped++;
      results.errors.push('Media already exists for ' + slug + ', skipping');
      continue;
    }

    // Insert all media items
    for (var j = 0; j < mediaItems.length; j++) {
      var item = mediaItems[j];
      var { error: insertErr } = await supabase
        .from('report_media')
        .insert({
          report_id: report.id,
          media_type: item.media_type,
          url: item.url,
          caption: item.caption,
          is_primary: item.is_primary,
          display_order: j,
        });

      if (insertErr) {
        results.errors.push('Failed to insert media for ' + slug + ': ' + insertErr.message);
      } else {
        results.mediaAdded++;
      }
    }
  }

  return res.status(200).json({
    success: true,
    results: results,
    message: 'Added ' + results.mediaAdded + ' media items, skipped ' + results.skipped + ' reports',
  });
}
