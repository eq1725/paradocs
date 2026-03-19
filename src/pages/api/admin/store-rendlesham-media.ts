import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var MEDIA_BUCKET = 'report-media';

async function getAuthenticatedUser(req: NextApiRequest) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  var result = await userClient.auth.getUser();
  if (result.error || !result.data.user) return null;
  return result.data.user;
}

export var config = {
  api: { bodyParser: { sizeLimit: '50mb' } },
};

/**
 * Downloads all external images for Rendlesham Forest reports,
 * uploads them to Supabase Storage (report-media bucket),
 * and updates the report_media records to use our own URLs.
 *
 * Same pattern as store-roswell-media.ts. No external hotlinking.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results = { stored: 0, skipped: 0, failed: 0, errors: [] as string[] };

  try {
    // Ensure bucket exists and is public
    var bucketList = await supabase.storage.listBuckets();
    if (!bucketList.data || !bucketList.data.some(function(b) { return b.name === MEDIA_BUCKET; })) {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    }

    // Step 0: Revert any incorrectly-stored Supabase URLs back to correct Wikimedia URLs
    // This handles the case where a previous run stored images with wrong content
    var correctWikimediaUrls: Record<string, string> = {
      'sculpture': 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Rendlesham_Forest_UFO_Sculpture_-_geograph.org.uk_-_8120767.jpg',
      'aerial': 'https://upload.wikimedia.org/wikipedia/commons/6/67/RAF_Woodbridge_and_Former_RAF_Bentwaters_from_the_air_-_geograph.org.uk_-_2962734.jpg',
      'halt_memo': 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Halt_Memorandum.jpg',
      'penniston_symbols': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Gliewe_op_Rendlesham-tuig_uit_Jim_Penniston-notaboek.png',
      'forest': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Rendlesham_Forest_-_geograph.org.uk_-_2399424.jpg',
    };
    // Revert records that point to our storage back to Wikimedia for re-download
    var revertMap: Array<{ caption_match: string; correct_url: string }> = [
      { caption_match: 'UFO Trail sculpture', correct_url: correctWikimediaUrls.sculpture },
      { caption_match: 'Aerial view of RAF Woodbridge', correct_url: correctWikimediaUrls.aerial },
      { caption_match: 'Halt Memorandum', correct_url: correctWikimediaUrls.halt_memo },
      { caption_match: 'Halt\'s official January', correct_url: correctWikimediaUrls.halt_memo },
      { caption_match: 'Symbols from Penniston', correct_url: correctWikimediaUrls.penniston_symbols },
      { caption_match: 'Rendlesham Forest, Suffolk', correct_url: correctWikimediaUrls.forest },
      { caption_match: 'Rendlesham Forest edge', correct_url: correctWikimediaUrls.forest },
      { caption_match: 'RAF Woodbridge and Bentwaters from the air', correct_url: correctWikimediaUrls.aerial },
    ];
    for (var r = 0; r < revertMap.length; r++) {
      var rv = revertMap[r];
      // Find records with matching caption that point to supabase storage
      var { data: toRevert } = await supabase.from('report_media')
        .select('id, url')
        .like('caption', '%' + rv.caption_match + '%')
        .like('url', '%supabase.co%');
      if (toRevert) {
        for (var rr = 0; rr < toRevert.length; rr++) {
          await supabase.from('report_media').update({ url: rv.correct_url }).eq('id', toRevert[rr].id);
        }
      }
    }

    // Fix wrong Wikimedia hash paths (research agent gave incorrect hashes)
    var urlFixes: Record<string, string> = {
      'https://upload.wikimedia.org/wikipedia/commons/0/02/Rendlesham_Forest_UFO_Sculpture_-_geograph.org.uk_-_8120767.jpg': 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Rendlesham_Forest_UFO_Sculpture_-_geograph.org.uk_-_8120767.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/5/5e/RAF_Woodbridge_and_Former_RAF_Bentwaters_from_the_air_-_geograph.org.uk_-_2962734.jpg': 'https://upload.wikimedia.org/wikipedia/commons/6/67/RAF_Woodbridge_and_Former_RAF_Bentwaters_from_the_air_-_geograph.org.uk_-_2962734.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/1/12/Halt_Memorandum.jpg': 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Halt_Memorandum.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/a/a9/Gliewe_op_Rendlesham-tuig_uit_Jim_Penniston-notaboek.png': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Gliewe_op_Rendlesham-tuig_uit_Jim_Penniston-notaboek.png',
      'https://upload.wikimedia.org/wikipedia/commons/5/5b/Rendlesham_Forest_-_geograph.org.uk_-_2399424.jpg': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Rendlesham_Forest_-_geograph.org.uk_-_2399424.jpg',
    };
    for (var fixUrl of Object.keys(urlFixes)) {
      await supabase.from('report_media').update({ url: urlFixes[fixUrl] }).eq('url', fixUrl);
    }

    // All Rendlesham report slugs
    var slugs = [
      'the-rendlesham-forest-incident-december-1980-showcase',
      'jim-penniston-rendlesham-craft-encounter-1980',
      'john-burroughs-rendlesham-medical-settlement-1980',
      'charles-halt-rendlesham-memo-tape-1980',
      'larry-warren-rendlesham-capel-green-1980',
      'edward-cabansag-rendlesham-first-night-statement-1980',
    ];

    for (var i = 0; i < slugs.length; i++) {
      var slug = slugs[i];

      // Get report ID
      var reportResult = await supabase.from('reports').select('id').eq('slug', slug).single();
      if (reportResult.error || !reportResult.data) {
        results.errors.push('Report not found: ' + slug);
        continue;
      }
      var reportId = reportResult.data.id;

      // Get all media for this report
      var mediaResult = await supabase.from('report_media').select('*').eq('report_id', reportId);
      if (!mediaResult.data || mediaResult.data.length === 0) {
        results.errors.push('No media for: ' + slug);
        continue;
      }

      for (var j = 0; j < mediaResult.data.length; j++) {
        var mediaItem = mediaResult.data[j] as any;
        var externalUrl = mediaItem.url;

        // Only process images (not videos, audio, documents)
        if (mediaItem.media_type !== 'image') {
          results.skipped++;
          continue;
        }

        // Skip if already stored in our bucket
        if (externalUrl.indexOf('supabase.co') !== -1) {
          results.skipped++;
          continue;
        }

        try {
          // Download the external image
          var fetchResponse = await fetch(externalUrl, {
            headers: {
              'User-Agent': 'Paradocs/1.0 (https://beta.discoverparadocs.com; research platform)',
            },
          });

          if (!fetchResponse.ok) {
            results.errors.push('Download failed (' + fetchResponse.status + '): ' + externalUrl.slice(-60));
            results.failed++;
            continue;
          }

          var imageBuffer = Buffer.from(await fetchResponse.arrayBuffer());
          var contentType = fetchResponse.headers.get('content-type') || 'image/jpeg';

          // Determine file extension
          var ext = 'jpg';
          if (externalUrl.indexOf('.png') !== -1 || contentType.indexOf('png') !== -1) ext = 'png';
          else if (externalUrl.indexOf('.webp') !== -1 || contentType.indexOf('webp') !== -1) ext = 'webp';
          else if (externalUrl.indexOf('.gif') !== -1 || contentType.indexOf('gif') !== -1) ext = 'gif';

          // Use media record ID for unique filename (avoids index mismatch bugs)
          var slugSuffix = slug.replace('rendlesham-', '').replace('-1980', '').slice(0, 30);
          var storagePath = 'rendlesham/' + slugSuffix + '/' + mediaItem.id.slice(0, 8) + '.' + ext;

          // Upload to Supabase Storage
          var uploadResult = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(storagePath, imageBuffer, {
              contentType: contentType,
              upsert: true,
              cacheControl: '31536000',
            });

          if (uploadResult.error) {
            results.errors.push('Upload failed for ' + slug.slice(-30) + '[' + j + ']: ' + uploadResult.error.message);
            results.failed++;
            continue;
          }

          // Get the public URL
          var publicUrlResult = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
          var newUrl = publicUrlResult.data.publicUrl;

          // Update the report_media record
          var updateResult = await supabase.from('report_media')
            .update({ url: newUrl })
            .eq('id', mediaItem.id);

          if (updateResult.error) {
            results.errors.push('DB update failed for ' + slug.slice(-30) + '[' + j + ']: ' + updateResult.error.message);
            results.failed++;
          } else {
            results.stored++;
          }
        } catch (fetchErr: any) {
          results.errors.push('Error processing ' + slug.slice(-30) + '[' + j + ']: ' + (fetchErr.message || 'unknown'));
          results.failed++;
        }
      }
    }

    // Also fix the Featured Investigation hero image URL hash
    var featHeroFixes: Record<string, string> = {
      'https://upload.wikimedia.org/wikipedia/commons/0/02/Rendlesham_Forest_UFO_Sculpture_-_geograph.org.uk_-_8120767.jpg': 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Rendlesham_Forest_UFO_Sculpture_-_geograph.org.uk_-_8120767.jpg',
    };
    for (var heroFixUrl of Object.keys(featHeroFixes)) {
      await supabase.from('featured_investigations').update({ hero_image_url: featHeroFixes[heroFixUrl] }).eq('hero_image_url', heroFixUrl);
    }

    // Update Featured Investigation hero to use Supabase Storage URL after migration
    var featResult = await supabase.from('featured_investigations')
      .select('id, hero_image_url')
      .eq('case_group', 'rendlesham-1980')
      .single();

    if (featResult.data && featResult.data.hero_image_url && featResult.data.hero_image_url.indexOf('supabase.co') === -1) {
      var showcaseResult = await supabase.from('reports').select('id').eq('slug', 'the-rendlesham-forest-incident-december-1980-showcase').single();
      if (showcaseResult.data) {
        var primaryMedia = await supabase.from('report_media')
          .select('url')
          .eq('report_id', showcaseResult.data.id)
          .eq('is_primary', true)
          .eq('media_type', 'image')
          .single();
        if (primaryMedia.data && primaryMedia.data.url.indexOf('supabase.co') !== -1) {
          await supabase.from('featured_investigations')
            .update({ hero_image_url: primaryMedia.data.url })
            .eq('case_group', 'rendlesham-1980');
          results.stored++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      results: results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, results: results });
  }
}
