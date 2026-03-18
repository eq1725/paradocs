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
 * Downloads all external images for the 5 new Roswell witness reports,
 * uploads them to Supabase Storage (report-media bucket),
 * and updates the report_media records to point to our own URLs.
 *
 * This ensures images are always available and not dependent on external hosts.
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

    // Fix known broken Wikimedia URLs (wrong hash paths) before downloading
    var urlFixes: Record<string, string> = {
      'https://upload.wikimedia.org/wikipedia/commons/a/a3/Roswell_AAF_sign_-_1946.jpg': 'https://upload.wikimedia.org/wikipedia/commons/3/31/Roswell_AAF_sign_-_1946.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/0/06/Philip_j_corso_1.jpg': 'https://upload.wikimedia.org/wikipedia/commons/8/84/Philip_j_corso_1.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/5/53/Philip_j_corso_3.jpg': 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Philip_j_corso_3.jpg',
    };
    for (var fixUrl of Object.keys(urlFixes)) {
      await supabase.from('report_media').update({ url: urlFixes[fixUrl] }).eq('url', fixUrl);
    }

    // Find all report_media with external URLs (wikimedia, archive.org, etc.)
    var slugs = [
      'bill-rickett-roswell-cic-agent-1947',
      'glenn-dennis-roswell-mortician-1947',
      'barney-barnett-roswell-san-agustin-1947',
      'chester-lytle-roswell-blanchard-testimony-1953',
      'philip-corso-roswell-reverse-engineering-1997',
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

        // Skip if already stored in our bucket
        if (externalUrl.indexOf('supabase.co') !== -1) {
          results.skipped++;
          continue;
        }

        // Skip non-image types (videos, documents)
        if (mediaItem.media_type !== 'image') {
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

          // Determine file extension from URL or content type
          var ext = 'jpg';
          if (externalUrl.indexOf('.png') !== -1 || contentType.indexOf('png') !== -1) ext = 'png';
          else if (externalUrl.indexOf('.webp') !== -1 || contentType.indexOf('webp') !== -1) ext = 'webp';
          else if (externalUrl.indexOf('.gif') !== -1 || contentType.indexOf('gif') !== -1) ext = 'gif';

          // Create a clean storage path: roswell/{slug}/{index}.{ext}
          var storagePath = 'roswell/' + slug + '/' + j + '.' + ext;

          // Upload to Supabase Storage
          var uploadResult = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(storagePath, imageBuffer, {
              contentType: contentType,
              upsert: true,
              cacheControl: '31536000',
            });

          if (uploadResult.error) {
            results.errors.push('Upload failed for ' + slug + '[' + j + ']: ' + uploadResult.error.message);
            results.failed++;
            continue;
          }

          // Get the public URL
          var publicUrlResult = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
          var newUrl = publicUrlResult.data.publicUrl;

          // Update the report_media record to use our storage URL
          var updateResult = await supabase.from('report_media')
            .update({ url: newUrl })
            .eq('id', mediaItem.id);

          if (updateResult.error) {
            results.errors.push('DB update failed for ' + slug + '[' + j + ']: ' + updateResult.error.message);
            results.failed++;
          } else {
            results.stored++;
          }
        } catch (fetchErr: any) {
          results.errors.push('Error processing ' + slug + '[' + j + ']: ' + (fetchErr.message || 'unknown'));
          results.failed++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      results: results,
      message: 'Stored ' + results.stored + ' images, skipped ' + results.skipped + ', failed ' + results.failed,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
