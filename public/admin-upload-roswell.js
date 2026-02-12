// ═══════════════════════════════════════════════════════════════════════
// ROSWELL SHOWCASE — Browser-Side Media Upload Script v2
// Run this in the browser console on beta.discoverparadocs.com
// Uses verified Wikimedia Commons filenames + computed hash paths
// ═══════════════════════════════════════════════════════════════════════

const MEDIA_LIST = [
  // ─── PHOTOGRAPHS (verified Wikimedia Commons filenames) ──────────
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp',
    storageName: 'roswell-daily-record-1947.webp',
    media_type: 'image',
    caption: 'Roswell Daily Record, July 8, 1947 — Front page headline: "RAAF Captures Flying Saucer On Ranch in Roswell Region." This was the original announcement before the military retraction.',
    is_primary: true,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Brig_General_Ramey_Roswell_debris.jpg',
    storageName: 'ramey-roswell-debris-1947.jpg',
    media_type: 'image',
    caption: 'Brigadier General Roger Ramey examines debris in his office at Fort Worth Army Air Field, July 8, 1947. The military claimed this was a weather balloon, but witnesses disputed that account.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Marcel-roswell-debris_0.jpg',
    storageName: 'marcel-roswell-debris-1947.jpg',
    media_type: 'image',
    caption: 'Major Jesse Marcel poses with debris recovered from the Foster Ranch. Marcel later claimed the material displayed at the press event was substituted — not the actual wreckage he recovered in the field.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Maj_Jesse_A_Marcel_of_Houma.jpg',
    storageName: 'jesse-marcel-portrait.jpg',
    media_type: 'image',
    caption: 'Major Jesse A. Marcel of Houma, Louisiana — the intelligence officer at Roswell AAF who first recovered debris from the Foster Ranch. His testimony decades later was central to the Roswell controversy.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/UFO_Museum%2C_Roswell%2C_NM.JPG',
    storageName: 'roswell-ufo-museum.jpg',
    media_type: 'image',
    caption: 'The International UFO Museum and Research Center in Roswell, New Mexico — founded in 1991 by Walter Haut, the RAAF public information officer who issued the original "flying disc" press release in 1947.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Roswell_Crash_1947.jpg',
    storageName: 'roswell-crash-1947.jpg',
    media_type: 'image',
    caption: 'Photograph associated with the 1947 Roswell crash — wreckage from the incident that became the most famous UFO case in history.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/General_Ramey_with_Roswell_Memo.png',
    storageName: 'ramey-roswell-memo.png',
    media_type: 'image',
    caption: 'Brigadier General Ramey holding a memo — the so-called "Ramey Memo" visible in his hand has been subject to decades of analysis by researchers attempting to decipher its contents about the Roswell debris.',
    is_primary: false,
  },

  // ─── GOVERNMENT DOCUMENTS ──────────────────────────────────────
  {
    sourceUrl: 'https://vault.fbi.gov/Roswell%20UFO/Roswell%20UFO%20Part%2001%20%28Final%29/view',
    storageName: null,
    media_type: 'document',
    caption: 'FBI Vault — Declassified FBI documents related to the Roswell UFO incident, including internal memos and communications from 1947.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://www.nsa.gov/portals/75/documents/news-features/declassified-documents/ufo/report_af_roswell.pdf',
    storageName: null,
    media_type: 'document',
    caption: 'NSA-hosted declassified U.S. Air Force report on the Roswell incident — the official 1994 investigation attributing the debris to Project Mogul.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://www.gao.gov/assets/nsiad-95-187.pdf',
    storageName: null,
    media_type: 'document',
    caption: 'General Accounting Office Report NSIAD-95-187 — Results of the search for records concerning the 1947 crash near Roswell, New Mexico. Found that key administrative records from Roswell AAF had been destroyed.',
    is_primary: false,
  },

  // ─── ARCHIVAL VIDEO / DOCUMENTARIES ────────────────────────────
  {
    sourceUrl: 'https://archive.org/details/CSPAN3_20210620_202900_Reel_America_The_Roswell_Reports_-_1997',
    storageName: null,
    media_type: 'video',
    caption: '"The Roswell Reports" (1997) — Official Air Force documentary companion to "The Roswell Report: Case Closed," aired on C-SPAN3. Features Air Force officials presenting the Project Mogul and crash test dummy explanations.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://archive.org/details/gov.archives.341-roswell-1',
    storageName: null,
    media_type: 'video',
    caption: 'Roswell Reports, Volume 1 — National Archives footage related to the official Air Force investigation of the Roswell incident.',
    is_primary: false,
  },
];

// ─── Helper Functions ──────────────────────────────────────────────────

function getToken() {
  const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return JSON.parse(localStorage.getItem(key)).access_token;
}

async function downloadImage(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const blob = await resp.blob();
    return blob;
  } catch (err) {
    console.error(`  ✗ Download failed: ${url.slice(0, 80)}... — ${err.message}`);
    return null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadToSupabase(base64, storageName, contentType, token) {
  const resp = await fetch('/api/admin/upload-showcase-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({ imageData: base64, storageName, contentType }),
  });
  return resp.json();
}

// ─── Main Upload Flow ──────────────────────────────────────────────────

async function runUpload() {
  const token = getToken();
  console.log('🛸 Starting Roswell Showcase Media Upload v2...');
  console.log(`   ${MEDIA_LIST.length} total media items (${MEDIA_LIST.filter(m => m.storageName).length} images + ${MEDIA_LIST.filter(m => !m.storageName).length} external links)`);

  const uploadedMedia = [];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of MEDIA_LIST) {
    // External links (documents, videos) — just add directly, no upload needed
    if (!item.storageName) {
      console.log(`📎 External link: ${item.media_type} — ${item.caption.slice(0, 50)}...`);
      uploadedMedia.push({
        media_type: item.media_type,
        url: item.sourceUrl,
        caption: item.caption,
        is_primary: item.is_primary,
      });
      skipped++;
      continue;
    }

    // Download image through the browser
    console.log(`⬇️  Downloading: ${item.storageName}...`);
    const blob = await downloadImage(item.sourceUrl);
    if (!blob) {
      console.error(`  ✗ Failed to download ${item.storageName}`);
      failed++;
      continue;
    }

    console.log(`  ✓ Downloaded: ${(blob.size / 1024).toFixed(0)} KB`);

    // Convert to base64 and upload
    const base64 = await blobToBase64(blob);
    console.log(`⬆️  Uploading to Supabase: ${item.storageName}...`);
    const result = await uploadToSupabase(base64, item.storageName, blob.type, token);

    if (result.success) {
      console.log(`  ✓ Uploaded → ${result.publicUrl.slice(0, 60)}...`);
      uploadedMedia.push({
        media_type: item.media_type,
        url: result.publicUrl,
        caption: item.caption,
        is_primary: item.is_primary,
      });
      uploaded++;
    } else {
      console.error(`  ✗ Upload failed: ${result.error} — ${result.details || ''}`);
      failed++;
    }
  }

  console.log(`\n📊 Upload Summary: ${uploaded} uploaded, ${skipped} external links, ${failed} failed`);
  console.log(`   Total media for report: ${uploadedMedia.length}`);

  // Now seed the report with all the uploaded media URLs
  console.log('\n🌱 Seeding showcase report with uploaded media...');
  const seedResp = await fetch('/api/admin/seed-showcase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({ media: uploadedMedia }),
  });
  const seedResult = await seedResp.json();
  console.log('🎉 Seed result:', seedResult);

  return seedResult;
}

// Run it!
runUpload();
