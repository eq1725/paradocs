import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

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

// ─── Roswell Incident — Showcase Report Data ────────────────────────────

const SHOWCASE_SLUG = 'the-roswell-incident-july-1947-showcase';

const SHOWCASE_REPORT = {
  title: 'The Roswell Incident — July 1947',
  slug: SHOWCASE_SLUG,
  summary: 'In July 1947, debris from an unknown craft was recovered near Roswell, New Mexico. The U.S. military initially announced the capture of a "flying disc" before retracting the statement — igniting decades of controversy over what was truly found on the Foster Ranch.',
  description: `In early July 1947, rancher William "Mac" Brazel discovered a large field of unusual debris scattered across the J.B. Foster Ranch, approximately 75 miles northwest of Roswell, New Mexico. The wreckage consisted of metallic foil-like material, lightweight beams with strange symbols, and a tough, parchment-like substance — none of which Brazel could identify or had ever seen before.

On July 7, Brazel reported his find to the Chaves County Sheriff, George Wilcox, who in turn contacted the Roswell Army Air Field (RAAF). Major Jesse Marcel, the base intelligence officer, was dispatched along with Captain Sheridan Cavitt to inspect the site. Marcel later recalled being struck by the unusual properties of the material: impossibly thin yet resistant to bending, burning, or cutting.

On July 8, 1947, the RAAF public information office issued what would become one of the most consequential press releases in modern history. Lieutenant Walter Haut, acting on orders from base commander Colonel William Blanchard, announced that the 509th Bomb Group had recovered a "flying disc" from a ranch near Roswell. The Roswell Daily Record ran the headline across its front page: "RAAF Captures Flying Saucer on Ranch in Roswell Region."

Within hours, the narrative changed dramatically. Brigadier General Roger Ramey, commander of the Eighth Air Force at Fort Worth Army Air Field, held a press conference where he displayed debris and announced the material was nothing more than a common weather balloon with a radar reflector. Photographs from this press conference show Ramey and his chief of staff, Colonel Thomas DuBose, posing with what appeared to be torn metallic foil and balsa wood sticks — material that Major Marcel would later insist was not what he had recovered.

The story was quickly buried. For over 30 years, the Roswell incident faded from public consciousness. It was not until 1978 that nuclear physicist and UFO researcher Stanton Friedman interviewed Jesse Marcel, who stated publicly that the debris he recovered was "not of this Earth" and that the military had engaged in a deliberate cover-up.

This revelation triggered a cascade of new investigations. In 1980, Charles Berlitz and William Moore published "The Roswell Incident," which included testimony from multiple witnesses who described not only exotic debris but also the recovery of non-human bodies from a second crash site. Former mortician Glenn Dennis claimed he was contacted by the RAAF about child-sized caskets and later warned to remain silent. Other witnesses, including military personnel and civilians, came forward with accounts of harassment, threats, and coerced silence.

In 1994, the U.S. Air Force published "The Roswell Report: Fact Versus Fiction in the New Mexico Desert," attributing the debris to Project Mogul — a classified program using high-altitude balloon trains to monitor Soviet nuclear tests. A 1997 follow-up report, "The Roswell Report: Case Closed," explained the alleged body recoveries as misremembered encounters with anthropomorphic crash test dummies used in high-altitude parachute experiments during the 1950s.

Critics of the official explanation point to numerous inconsistencies: Project Mogul used standard neoprene weather balloons and aluminum radar targets, materials that experienced ranch hands like Brazel would have recognized immediately. The timeline of the crash test dummy program does not align with the 1947 events. Multiple first-hand witnesses — including Major Marcel, his son Jesse Marcel Jr. (who handled the debris as a child), and flight engineer Robert Shirkey — maintained until their deaths that the material was extraordinary and unlike any known technology.

The debris field itself spanned an area approximately three-quarters of a mile long and several hundred feet wide, suggesting a high-velocity impact inconsistent with a slowly descending balloon. Archaeologist William Curry Holden, who was reportedly escorted to a second site, described a damaged metallic craft and small non-human bodies, though his account was only documented secondhand.

The Roswell Incident remains the most investigated and debated case in UFO history. It led directly to the founding of the International UFO Museum and Research Center in Roswell, prompted multiple congressional inquiries, and continues to serve as a touchstone for discussions about government transparency, military secrecy, and the possibility of non-human intelligence. Whether one accepts the Project Mogul explanation or believes something far more extraordinary was recovered from the New Mexico desert, the events of July 1947 fundamentally altered the cultural and scientific conversation about unidentified aerial phenomena.

The case file includes official military communications, sworn affidavits from over 30 witnesses, the original Roswell Daily Record front page, photographs from General Ramey's office, and decades of investigative research. Multiple deathbed testimonies from military personnel involved in the recovery have added further weight to claims of a cover-up.`,
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
const SHOWCASE_MEDIA = [
  {
    media_type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/RoswellDailyRecordJuly8%2C1947.jpg',
    caption: 'Roswell Daily Record, July 8, 1947 — Front page headline: "RAAF Captures Flying Saucer On Ranch in Roswell Region." This was the original announcement before the military retraction.',
    is_primary: true,
  },
  {
    media_type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Ramey_and_Marcel_with_debris.jpg',
    caption: 'Brigadier General Roger Ramey and Colonel Thomas DuBose examine debris in Ramey\'s office at Fort Worth Army Air Field, July 8, 1947. Major Jesse Marcel later claimed this was substituted material, not the actual debris from the Foster Ranch.',
    is_primary: false,
  },
  {
    media_type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Roswell_UFO_Museum.jpg/1280px-Roswell_UFO_Museum.jpg',
    caption: 'The International UFO Museum and Research Center in Roswell, New Mexico — founded in 1991 by Walter Haut, the RAAF officer who issued the original "flying disc" press release.',
    is_primary: false,
  },
  {
    media_type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Roswell_nm.jpg/1280px-Roswell_nm.jpg',
    caption: 'Aerial view of Roswell, New Mexico — the town that became synonymous with UFO phenomena after the July 1947 incident.',
    is_primary: false,
  },
  {
    media_type: 'image',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/ProjectMogulBalloonTrainFlightNo.2.jpg/800px-ProjectMogulBalloonTrainFlightNo.2.jpg',
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
      for (const mediaItem of SHOWCASE_MEDIA) {
        const { error: mediaError } = await supabase
          .from('report_media')
          .insert({
            report_id: existing.id,
            ...mediaItem,
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

    // Insert media
    let mediaInserted = 0;
    for (const mediaItem of SHOWCASE_MEDIA) {
      const { error: mediaError } = await supabase
        .from('report_media')
        .insert({
          report_id: inserted.id,
          ...mediaItem,
        });
      if (!mediaError) {
        mediaInserted++;
      } else {
        console.error('Media insert error:', mediaError.message, mediaItem.url);
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
