#!/usr/bin/env node
/**
 * Upload Rendlesham witness portraits to Supabase Storage.
 * Run from project root: node scripts/upload-rendlesham-portraits.mjs
 *
 * Reads image files from project root, uploads to Supabase Storage,
 * and creates/updates report_media records.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Load env
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEDIA_BUCKET = 'report-media';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const PORTRAITS = [
  {
    filename: 'Jim Penniston 2.png',
    slug: 'jim-penniston-rendlesham-craft-encounter-1980',
    caption: 'Jim Penniston during a later interview discussing the Rendlesham Forest encounter. Penniston served as a USAF Staff Sergeant and was the senior security patrolman dispatched to investigate on December 26, 1980.',
    is_primary: true,
  },
  {
    filename: 'Jim Penniston 1.png',
    slug: 'jim-penniston-rendlesham-craft-encounter-1980',
    caption: 'Jim Penniston in USAF military uniform during his service \u2014 the period when he was stationed at RAF Woodbridge and reported the Rendlesham Forest encounter.',
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
    caption: 'Retired Lt. Col. Charles Halt \u2014 the Deputy Base Commander at RAF Woodbridge who personally led the second investigation into Rendlesham Forest and produced both the famous audio tape and the official memo to the UK Ministry of Defence.',
    is_primary: true,
  },
  {
    filename: 'Larry Warren.png',
    slug: 'larry-warren-rendlesham-capel-green-1980',
    caption: "Larry Warren during an interview discussing his claims about the Capel Green encounter. Warren co-authored \"Left at East Gate\" (1997), though his co-author Peter Robbins later disavowed the book's accuracy.",
    is_primary: true,
  },
];

async function main() {
  console.log('Uploading Rendlesham witness portraits...\n');

  for (const portrait of PORTRAITS) {
    const filePath = path.join(projectRoot, portrait.filename);

    if (!fs.existsSync(filePath)) {
      console.log(`SKIP: ${portrait.filename} not found`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(portrait.filename).replace('.', '').toLowerCase();
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const cleanName = portrait.filename.replace(/\s+/g, '-').toLowerCase();
    const storagePath = `rendlesham/portraits/${cleanName}`;

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
        cacheControl: '31536000',
      });

    if (uploadErr) {
      console.log(`FAIL: ${portrait.filename} - ${uploadErr.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // Get report ID
    const { data: report } = await supabase.from('reports')
      .select('id').eq('slug', portrait.slug).single();

    if (!report) {
      console.log(`FAIL: Report not found for ${portrait.slug}`);
      continue;
    }

    // Demote existing primary images if this is primary
    if (portrait.is_primary) {
      await supabase.from('report_media')
        .update({ is_primary: false })
        .eq('report_id', report.id)
        .eq('media_type', 'image')
        .eq('is_primary', true);
    }

    // Check if already exists
    const { data: existing } = await supabase.from('report_media')
      .select('id').eq('url', publicUrl).single();

    if (existing) {
      await supabase.from('report_media')
        .update({ caption: portrait.caption, is_primary: portrait.is_primary })
        .eq('id', existing.id);
      console.log(`UPDATED: ${portrait.filename} -> ${portrait.slug}`);
    } else {
      const { error: insertErr } = await supabase.from('report_media').insert({
        report_id: report.id,
        media_type: 'image',
        url: publicUrl,
        caption: portrait.caption,
        is_primary: portrait.is_primary,
      });
      if (insertErr) {
        console.log(`FAIL: ${portrait.filename} - ${insertErr.message}`);
      } else {
        console.log(`INSERTED: ${portrait.filename} -> ${portrait.slug}`);
      }
    }
  }

  console.log('\nDone! Run ISR revalidation to see changes on live site.');
}

main().catch(console.error);
