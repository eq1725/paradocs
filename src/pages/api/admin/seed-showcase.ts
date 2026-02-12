import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';
const MEDIA_BUCKET = 'report-media';

async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ─── Download external image → Supabase Storage ─────────────────────────

async function getWikimediaDirectUrl(commonsFileName: string): Promise<string | null> {
  // Use the Wikimedia Commons API to resolve a filename to a direct download URL
  // This API is designed for programmatic access and won't return 403
  try {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(commonsFileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
    const resp = await fetch(apiUrl);
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    return page?.imageinfo?.[0]?.url || null;
  } catch {
    return null;
  }
}

async function downloadAndUploadImage(
  supabase: ReturnType<typeof createClient>,
  commonsFileName: string,
  storageName: string
): Promise<string | null> {
  try {
    // Step 1: Resolve the actual download URL via the Wikimedia API
    const directUrl = await getWikimediaDirectUrl(commonsFileName);
    if (!directUrl) {
      console.error(`Could not resolve Wikimedia URL for: ${commonsFileName}`);
      return null;
    }

    // Step 2: Download the image binary
    const response = await fetch(directUrl, {
      headers: {
        'User-Agent': 'ParaDocsBot/1.0 (https://discoverparadocs.com; williamschaseh@gmail.com) node-fetch',
      },
    });
    if (!response.ok) {
      console.error(`Failed to download ${commonsFileName}: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`Downloaded ${commonsFileName}: ${buffer.length} bytes`);

    // Step 3: Upload to Supabase Storage
    const storagePath = `showcase/${storageName}`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      console.error(`Failed to upload ${storageName}:`, error.message);
      return null;
    }

    // Step 4: Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    console.log(`Uploaded ${storageName} → ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error(`Error processing image ${commonsFileName}:`, err.message);
    return null;
  }
}

// ─── Roswell Incident — Showcase Report Data ────────────────────────────

const SHOWCASE_SLUG = 'the-roswell-incident-july-1947-showcase';

const SHOWCASE_REPORT = {
  title: 'The Roswell Incident — July 1947',
  slug: SHOWCASE_SLUG,
  summary: 'In July 1947, debris from an unknown craft was recovered near Roswell, New Mexico. The U.S. military initially announced the capture of a "flying disc" before retracting the statement — igniting decades of controversy over what was truly found on the Foster Ranch.',
  description: `In early July 1947, rancher William "Mac" Brazel discovered a large field of unusual debris scattered across the J.B. Foster Ranch, approximately 75 miles northwest of Roswell, New Mexico. The wreckage consisted of metallic foil-like material, lightweight beams with strange symbols, and a tough, parchment-like substance — none of which Brazel could identify or had ever seen before. Brazel later told reporters: "I am sure that what I found was not any weather observation balloon."

On July 7, Brazel reported his find to the Chaves County Sheriff, George Wilcox, who in turn contacted the Roswell Army Air Field (RAAF). Major Jesse Marcel, the base intelligence officer, was dispatched along with Captain Sheridan Cavitt to inspect the site. Marcel and Cavitt met Brazel and followed him back to the ranch — Marcel in a jeep, Brazel and Cavitt on horseback — where they loaded debris into the vehicle. Marcel later recalled being struck by the unusual properties of the material: impossibly thin yet resistant to bending, burning, or cutting.

FIRST-HAND TESTIMONY — MAJOR JESSE MARCEL

Marcel described the debris in vivid detail: "There was all kinds of stuff — small beams about three-eighths of an inch square with some sort of hieroglyphics on them that nobody could decipher. They were pink and purple." He described a metallic foil that could be crumpled but would spring back to its original shape when released. In a 1980 interview on the television series "In Search Of...," Marcel stated: "General Ramey is the one who told the newsmen what it was, and to forget about it. It is nothing more than a weather observation balloon. Of course, we both knew differently."

Marcel's son, Jesse Marcel Jr., corroborated his father's account. At ten years old in 1947, he handled the debris when his father brought samples home before returning to base. He spent 35 years publicly testifying that the material included "a small beam with purple-hued hieroglyphics on it" and stated the family was told they were looking at "pieces of a flying saucer." Marcel Sr. reportedly tried to drill through pieces of the wreckage and melt them with a cigarette lighter, to no avail.

THE PRESS RELEASE AND RETRACTION

On July 8, 1947, the RAAF public information office issued what would become one of the most consequential press releases in modern history. First Lieutenant Walter Haut, acting on orders from base commander Colonel William Blanchard, announced that the 509th Bomb Group had recovered a "flying disc" from a ranch near Roswell. Haut later recalled: "At approximately 9:30 AM on July 8, I received a call from Colonel Blanchard saying he had in his possession a 'flying saucer or parts thereof.'" The Roswell Daily Record ran the headline across its front page: "RAAF Captures Flying Saucer on Ranch in Roswell Region."

Within hours, the narrative changed. Brigadier General Roger Ramey, commander of the Eighth Air Force at Fort Worth Army Air Field, held a press conference displaying debris and announcing it was a common weather balloon with a radar reflector. Photographs from this press conference — now held in the Fort Worth Star-Telegram Photograph Collection at the University of Texas at Arlington Library — show Ramey and his chief of staff, Colonel Thomas DuBose, posing with torn metallic foil and balsa wood. In a 1991 interview, retired Brigadier General DuBose acknowledged that "the weather balloon explanation for the material was a cover story to divert the attention of the press."

Major Marcel described returning from the press conference to find that the actual debris had been switched: "After returning from a map room, the remains of a weather balloon and radar kite had been substituted while he was out of the room." Marcel was reportedly deeply upset by the deception.

ADDITIONAL FIRST-HAND WITNESSES

B-29 Flight Engineer Robert R. Porter stated in a 1991 sworn affidavit that he was a crew member on the flight that transported debris from Roswell to Fort Worth, with Major Marcel on board. Porter described the material: "One piece was triangle-shaped, about two and a half feet across the bottom. The rest were in small packages about the size of a shoe box. When I picked it up, it was just like picking up an empty package." He said he was told the cargo was a "flying saucer."

Mac Brazel told reporters he wished he had never reported the find: "If I find anything else besides a bomb, they are going to have a hard time getting me to say anything about it." He had been detained by the military for approximately a week following his report.

WALTER HAUT'S DEATHBED AFFIDAVIT

Perhaps the most significant testimony came from Walter Haut himself. In a sealed affidavit signed on December 26, 2002 — to be opened only after his death — Haut revealed that his original press release about a "flying disc" was accurate. He disclosed that there were two crash sites, and that he had personally witnessed the recovered craft and bodies.

Haut described being taken by Colonel Blanchard to Building 84, a hangar at the base, where he saw an egg-shaped metallic craft approximately 12 to 15 feet long and 6 feet wide, with no windows, wings, tail, or landing gear. On the floor nearby, partially covered by a tarpaulin, were two bodies approximately four feet tall with disproportionately large heads. Debris samples were passed around at a staff meeting — material unlike anything Haut had seen in his life, including paper-thin metal foil of extraordinary strength and pieces with unusual markings.

Haut stated in the affidavit: "I am convinced that what I personally observed was some type of craft and its crew from outer space." His daughter, Julie Shuster, later confirmed: "Dad said yes, he did see the bodies, yes he did see the craft." Haut had kept silent during his lifetime out of an oath to Colonel Blanchard, but felt the world deserved to know the truth after his passing. He died on December 15, 2005, and the affidavit was published in the 2007 book "Witness to Roswell" by Thomas Carey and Donald Schmitt.

OFFICIAL INVESTIGATIONS AND RESPONSES

In 1994, the U.S. Air Force published "The Roswell Report: Fact Versus Fiction in the New Mexico Desert," attributing the debris to Project Mogul — a classified program using high-altitude balloon trains to monitor Soviet nuclear tests. The full report is available through the National Security Agency's declassified documents archive. A 1997 follow-up, "The Roswell Report: Case Closed," attributed body recovery accounts to misremembered encounters with anthropomorphic crash test dummies used in 1950s parachute experiments.

A General Accounting Office investigation, prompted by Congressman Steven Schiff of New Mexico, found that key administrative records from the Roswell Army Air Field covering March 1945 through December 1949 had been destroyed, with no record of when or by whom. FBI documents from the period, released through the FBI Vault, include a 1947 handwritten memo noting the recovery of a "flying disc" near Roswell.

Critics of the official explanation cite numerous inconsistencies: Project Mogul used standard neoprene weather balloons and aluminum radar targets — materials that an experienced rancher like Brazel would have recognized immediately. The symbols described by Marcel as alien hieroglyphics, which the Air Force attributed to decorative tape from a New York toy manufacturer, were described by multiple witnesses as unlike any conventional markings. The crash test dummy program timeline does not align with the 1947 events.

The debris field spanned approximately three-quarters of a mile long and several hundred feet wide — Marcel estimated it took five to six large 2.5-ton cargo trucks to transport all debris back to base. This scale is inconsistent with a slowly descending balloon array.

LEGACY

The Roswell Incident led directly to the founding of the International UFO Museum and Research Center in Roswell in 1991, established by Walter Haut himself. The case prompted multiple congressional inquiries, spawned hundreds of books and documentaries, and remains the most investigated event in UFO history. The University of Texas at Arlington Libraries maintains a dedicated Roswell archival collection including the original Fort Worth Star-Telegram photographs. Project Blue Book records are held at the National Archives.

Whether one accepts the Project Mogul explanation or believes something far more extraordinary was recovered from the New Mexico desert, the first-hand testimony of Marcel, Haut, DuBose, Porter, and dozens of others ensures that the events of July 1947 remain a case demanding continued investigation. Over 30 sworn affidavits from military and civilian witnesses, declassified government documents, and the destroyed records from Roswell AAF form a body of evidence that continues to challenge the official narrative.`,
  category: 'ufos_aliens',
  content_type: 'historical_case',
  credibility: 'high',
  status: 'approved',
  featured: true,
  location_name: 'Foster Ranch, near Corona, New Mexico',
  location_description: 'The debris field was located on the J.B. Foster Ranch, approximately 75 miles northwest of Roswell. A possible second site was reported closer to the town itself.',
  country: 'United States',
  state_province: 'New Mexico',
  city: 'Roswell',
  latitude: 33.3943,
  longitude: -104.5230,
  event_date: '1947-07-08',
  event_time: null,
  event_date_approximate: false,
  event_duration_minutes: null,
  witness_count: 30,
  has_physical_evidence: true,
  has_photo_video: true,
  has_official_report: true,
  evidence_summary: 'Physical debris recovered from the Foster Ranch (metallic foil, I-beams with symbols, parchment-like material). Photographs from Gen. Ramey\'s Fort Worth press conference. Official RAAF press release confirming "flying disc" recovery. Two U.S. Air Force reports (1994, 1997). Over 30 sworn witness affidavits. Roswell Daily Record front page. Congressional inquiry records.',
  source_type: 'curated',
  source_reference: 'Historical research compilation — primary sources include RAAF press releases, Roswell Daily Record archives, USAF reports (1994/1997), witness affidavits, and investigative research by Stanton Friedman, Kevin Randle, and Donald Schmitt.',
  tags: [
    'roswell', 'crash-retrieval', 'military', 'cover-up', 'debris',
    'new-mexico', '1947', 'historical', 'ufo-crash', 'government-secrecy',
    'physical-evidence', 'multiple-witnesses', 'project-mogul', 'jesse-marcel',
    'walter-haut', 'first-hand-testimony', 'sworn-affidavit', 'witness-testimony',
    'showcase'
  ],
  upvotes: 0,
  downvotes: 0,
  view_count: 0,
  comment_count: 0,
  anonymous_submission: false,
  submitter_was_witness: false,
};

// Media items — Public domain and historically significant
// commonsFile = exact filename on Wikimedia Commons (used to resolve download URL via API)
// storageName = filename in our Supabase storage bucket
const SHOWCASE_MEDIA = [
  {
    media_type: 'image',
    commonsFile: 'RoswellDailyRecordJuly8,1947.jpg',
    storageName: 'roswell-daily-record-1947.jpg',
    caption: 'Roswell Daily Record, July 8, 1947 — Front page headline: "RAAF Captures Flying Saucer On Ranch in Roswell Region." This was the original announcement before the military retraction.',
    is_primary: true,
  },
  {
    media_type: 'image',
    commonsFile: 'Ramey_and_Marcel_with_debris.jpg',
    storageName: 'ramey-marcel-debris-1947.jpg',
    caption: 'Brigadier General Roger Ramey and Colonel Thomas DuBose examine debris in Ramey\'s office at Fort Worth Army Air Field, July 8, 1947. Major Jesse Marcel later claimed this was substituted material, not the actual debris from the Foster Ranch.',
    is_primary: false,
  },
  {
    media_type: 'image',
    commonsFile: 'Roswell_UFO_Museum.jpg',
    storageName: 'roswell-ufo-museum.jpg',
    caption: 'The International UFO Museum and Research Center in Roswell, New Mexico — founded in 1991 by Walter Haut, the RAAF officer who issued the original "flying disc" press release.',
    is_primary: false,
  },
  {
    media_type: 'image',
    commonsFile: 'Roswell_nm.jpg',
    storageName: 'roswell-new-mexico-aerial.jpg',
    caption: 'Aerial view of Roswell, New Mexico — the town that became synonymous with UFO phenomena after the July 1947 incident.',
    is_primary: false,
  },
  {
    media_type: 'image',
    commonsFile: 'ProjectMogulBalloonTrainFlightNo.2.jpg',
    storageName: 'project-mogul-balloon.jpg',
    caption: 'A Project Mogul balloon train in flight — the U.S. Air Force\'s 1994 official explanation attributed the Roswell debris to this classified high-altitude surveillance program.',
    is_primary: false,
  },
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Ensure the storage bucket exists and is public
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === MEDIA_BUCKET);
    if (!bucketExists) {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    }

    // Check if showcase report already exists
    const { data: existing } = await supabase
      .from('reports')
      .select('id, slug')
      .eq('slug', SHOWCASE_SLUG)
      .single();

    if (existing) {
      // Update existing instead of failing
      const { error: updateError } = await supabase
        .from('reports')
        .update({
          ...SHOWCASE_REPORT,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update existing showcase report', details: updateError.message });
      }

      // Delete existing media and re-insert
      await supabase
        .from('report_media')
        .delete()
        .eq('report_id', existing.id);

      let mediaInserted = 0;
      let imagesDownloaded = 0;
      const errors: string[] = [];
      for (const mediaItem of SHOWCASE_MEDIA) {
        // Download from Wikimedia Commons → Supabase Storage
        const storedUrl = await downloadAndUploadImage(supabase, mediaItem.commonsFile, mediaItem.storageName);
        if (storedUrl) {
          imagesDownloaded++;
        } else {
          errors.push(`Failed: ${mediaItem.commonsFile}`);
        }

        const { error: mediaError } = await supabase
          .from('report_media')
          .insert({
            report_id: existing.id,
            media_type: mediaItem.media_type,
            url: storedUrl || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(mediaItem.commonsFile)}?width=1024`,
            caption: mediaItem.caption,
            is_primary: mediaItem.is_primary,
          });
        if (!mediaError) mediaInserted++;
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        reportId: existing.id,
        slug: SHOWCASE_SLUG,
        url: `/report/${SHOWCASE_SLUG}`,
        mediaInserted,
        imagesDownloaded,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // Insert new showcase report
    const { data: inserted, error: insertError } = await supabase
      .from('reports')
      .insert(SHOWCASE_REPORT)
      .select('id')
      .single();

    if (insertError || !inserted) {
      return res.status(500).json({
        error: 'Failed to insert showcase report',
        details: insertError?.message,
      });
    }

    // Download images from Wikimedia Commons → Supabase Storage, then insert media
    let mediaInserted = 0;
    let imagesDownloaded = 0;
    for (const mediaItem of SHOWCASE_MEDIA) {
      const storedUrl = await downloadAndUploadImage(supabase, mediaItem.commonsFile, mediaItem.storageName);
      if (storedUrl) imagesDownloaded++;

      const { error: mediaError } = await supabase
        .from('report_media')
        .insert({
          report_id: inserted.id,
          media_type: mediaItem.media_type,
          url: storedUrl || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(mediaItem.commonsFile)}?width=1024`,
          caption: mediaItem.caption,
          is_primary: mediaItem.is_primary,
        });
      if (!mediaError) {
        mediaInserted++;
      } else {
        console.error('Media insert error:', mediaError.message, mediaItem.commonsFile);
      }
    }

    // Try to link to existing phenomena
    let phenomenaLinked = 0;
    const { data: phenomena } = await supabase
      .from('phenomenon_types')
      .select('id, name')
      .in('category', ['ufos_aliens'])
      .limit(20);

    if (phenomena) {
      for (const p of phenomena) {
        const nameL = p.name.toLowerCase();
        // Link to UFO/crash related phenomena with high confidence
        if (
          nameL.includes('ufo') || nameL.includes('uap') ||
          nameL.includes('crash') || nameL.includes('retrieval') ||
          nameL.includes('flying') || nameL.includes('disc') ||
          nameL.includes('saucer') || nameL.includes('roswell')
        ) {
          const { error } = await supabase
            .from('report_phenomena')
            .upsert(
              {
                report_id: inserted.id,
                phenomenon_id: p.id,
                confidence: 0.95,
                tagged_by: 'manual',
              },
              { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true }
            );
          if (!error) phenomenaLinked++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      action: 'created',
      reportId: inserted.id,
      slug: SHOWCASE_SLUG,
      url: `/report/${SHOWCASE_SLUG}`,
      mediaInserted,
      phenomenaLinked,
    });

  } catch (err: any) {
    console.error('Seed showcase error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
