import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

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

// Portrait mapping: local filename → report slug + caption + is_primary
var PORTRAITS = [
  {
    filename: 'Jim Penniston 2.png',
    slug: 'jim-penniston-rendlesham-craft-encounter-1980',
    caption: 'Jim Penniston during a later interview discussing the Rendlesham Forest encounter. Penniston served as a USAF Staff Sergeant and was the senior security patrolman dispatched to investigate on December 26, 1980.',
    is_primary: true,
  },
  {
    filename: 'Jim Penniston 1.png',
    slug: 'jim-penniston-rendlesham-craft-encounter-1980',
    caption: 'Jim Penniston in USAF military uniform during his service — the period when he was stationed at RAF Woodbridge and reported the Rendlesham Forest encounter.',
    is_primary: false,
  },
  {
    filename: 'John Burroughs.png',
    slug: 'john-burroughs-rendlesham-medical-settlement-1980',
    caption: 'John Burroughs speaking at a conference about the Rendlesham Forest incident. Burroughs received a VA medical disability settlement in 2015 acknowledging his cardiac injury occurred in the line of duty in December 1980.',
    is_primary: true,
  },
  {
    filename: 'Charles Halt.png',
    slug: 'charles-halt-rendlesham-memo-tape-1980',
    caption: 'Retired Lt. Col. Charles Halt — the Deputy Base Commander at RAF Woodbridge who personally led the second investigation into Rendlesham Forest and produced both the famous audio tape and the official memo to the UK Ministry of Defence.',
    is_primary: true,
  },
  {
    filename: 'Larry Warren.png',
    slug: 'larry-warren-rendlesham-capel-green-1980',
    caption: 'Larry Warren during an interview discussing his claims about the Capel Green encounter. Warren co-authored "Left at East Gate" (1997), though his co-author Peter Robbins later disavowed the book\'s accuracy.',
    is_primary: true,
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results: Array<{ filename: string; slug: string; status: string }> = [];

  // Ensure bucket exists
  var bucketList = await supabase.storage.listBuckets();
  if (!bucketList.data || !bucketList.data.some(function(b) { return b.name === MEDIA_BUCKET; })) {
    await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
  }

  // Project root — portraits are in the repo root
  var projectRoot = process.cwd();

  for (var i = 0; i < PORTRAITS.length; i++) {
    var portrait = PORTRAITS[i];
    var filePath = path.join(projectRoot, portrait.filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      results.push({ filename: portrait.filename, slug: portrait.slug, status: 'FILE_NOT_FOUND: ' + filePath });
      continue;
    }

    try {
      // Read the file
      var fileBuffer = fs.readFileSync(filePath);
      var ext = path.extname(portrait.filename).replace('.', '').toLowerCase();
      var contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      // Clean storage path
      var cleanName = portrait.filename.replace(/\s+/g, '-').toLowerCase();
      var storagePath = 'rendlesham/portraits/' + cleanName;

      // Upload to Supabase Storage
      var uploadResult = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: contentType,
          upsert: true,
          cacheControl: '31536000',
        });

      if (uploadResult.error) {
        results.push({ filename: portrait.filename, slug: portrait.slug, status: 'UPLOAD_ERROR: ' + uploadResult.error.message });
        continue;
      }

      // Get the public URL
      var publicUrlResult = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
      var publicUrl = publicUrlResult.data.publicUrl;

      // Get report ID
      var { data: reportData } = await supabase.from('reports')
        .select('id').eq('slug', portrait.slug).single();

      if (!reportData) {
        results.push({ filename: portrait.filename, slug: portrait.slug, status: 'REPORT_NOT_FOUND' });
        continue;
      }

      // If this is primary, demote existing primary images first
      if (portrait.is_primary) {
        await supabase.from('report_media')
          .update({ is_primary: false })
          .eq('report_id', reportData.id)
          .eq('media_type', 'image')
          .eq('is_primary', true);
      }

      // Check if this portrait already exists (by URL)
      var { data: existingMedia } = await supabase.from('report_media')
        .select('id').eq('url', publicUrl).single();

      if (existingMedia) {
        // Update existing record
        await supabase.from('report_media')
          .update({ caption: portrait.caption, is_primary: portrait.is_primary })
          .eq('id', existingMedia.id);
        results.push({ filename: portrait.filename, slug: portrait.slug, status: 'updated_existing' });
      } else {
        // Insert new media record
        var { error: insertErr } = await supabase.from('report_media').insert({
          report_id: reportData.id,
          media_type: 'image',
          url: publicUrl,
          caption: portrait.caption,
          is_primary: portrait.is_primary,
        });
        results.push({ filename: portrait.filename, slug: portrait.slug, status: insertErr ? 'INSERT_ERROR: ' + insertErr.message : 'inserted' });
      }
    } catch (err: any) {
      results.push({ filename: portrait.filename, slug: portrait.slug, status: 'ERROR: ' + (err.message || 'unknown') });
    }
  }

  var successCount = results.filter(function(r) { return r.status === 'inserted' || r.status === 'updated_existing'; }).length;

  return res.status(200).json({
    summary: successCount + '/' + PORTRAITS.length + ' portraits processed',
    results: results,
  });
}
