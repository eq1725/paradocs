// ═══════════════════════════════════════════════════════════════════════
// ROSWELL SHOWCASE — Browser-Side Media Upload Script
// Run this in the browser console on beta.discoverparadocs.com
// It downloads all images through the browser (no server-side blocking)
// then uploads each to Supabase storage via the API, and seeds the report.
// ═══════════════════════════════════════════════════════════════════════

const MEDIA_LIST = [
  // ─── PHOTOGRAPHS ───────────────────────────────────────────────
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/RoswellDailyRecordJuly8%2C1947.jpg',
    storageName: 'roswell-daily-record-1947.jpg',
    media_type: 'image',
    caption: 'Roswell Daily Record, July 8, 1947 — Front page headline: "RAAF Captures Flying Saucer On Ranch in Roswell Region." This was the original announcement before the military retraction.',
    is_primary: true,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Ramey_and_Marcel_with_debris.jpg',
    storageName: 'ramey-marcel-debris-1947.jpg',
    media_type: 'image',
    caption: 'Brigadier General Roger Ramey and Colonel Thomas DuBose examine debris in Ramey\'s office at Fort Worth Army Air Field, July 8, 1947. Major Jesse Marcel later claimed this was substituted material, not the actual debris from the Foster Ranch.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Roswell_UFO_Museum.jpg/1280px-Roswell_UFO_Museum.jpg',
    storageName: 'roswell-ufo-museum.jpg',
    media_type: 'image',
    caption: 'The International UFO Museum and Research Center in Roswell, New Mexico — founded in 1991 by Walter Haut, the RAAF officer who issued the original "flying disc" press release.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Roswell_nm.jpg/1280px-Roswell_nm.jpg',
    storageName: 'roswell-new-mexico-aerial.jpg',
    media_type: 'image',
    caption: 'Aerial view of Roswell, New Mexico — the town that became synonymous with UFO phenomena after the July 1947 incident.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/ProjectMogulBalloonTrainFlightNo.2.jpg/800px-ProjectMogulBalloonTrainFlightNo.2.jpg',
    storageName: 'project-mogul-balloon.jpg',
    media_type: 'image',
    caption: 'A Project Mogul balloon train in flight — the U.S. Air Force\'s 1994 official explanation attributed the Roswell debris to this classified high-altitude surveillance program.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Mogul_balloon_train_USAF_1995.png',
    storageName: 'project-mogul-diagram-usaf-1995.png',
    media_type: 'image',
    caption: 'Project Mogul balloon train configuration — USAF diagram from the 1995 report showing the arrangement of balloons, radar reflectors, and acoustic sensors used in the classified surveillance program.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/81/Roswell_crash_site_2.png',
    storageName: 'roswell-crash-site-map.png',
    media_type: 'image',
    caption: 'Map showing the location of the Roswell debris field on the Foster Ranch and other key sites related to the July 1947 incident.',
    is_primary: false,
  },
  {
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/USAF_Roswell_Report_cover.jpg/800px-USAF_Roswell_Report_cover.jpg',
    storageName: 'usaf-roswell-report-cover.jpg',
    media_type: 'image',
    caption: 'Cover of the 1994 U.S. Air Force report "The Roswell Report: Fact Versus Fiction in the New Mexico Desert" — the official investigation that attributed the debris to Project Mogul.',
    is_primary: false,
  },

  // ─── GOVERNMENT DOCUMENTS ──────────────────────────────────────
  {
    sourceUrl: 'https://vault.fbi.gov/Roswell%20UFO/Roswell%20UFO%20Part%2001%20%28Final%29/view',
    storageName: null, // External link, not uploaded
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
    console.error(`  ✗ Download failed: ${url.slice(0, 60)}... — ${err.message}`);
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
  console.log('🛸 Starting Roswell Showcase Media Upload...');
  console.log(`   ${MEDIA_LIST.length} total media items`);

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
