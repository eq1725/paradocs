import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';
const CASE_GROUP = 'roswell-1947';

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

// ─── New witness reports ──────────────────────────────────────────────

var NEW_WITNESS_REPORTS = [
  {
    title: 'Robert Porter \u2014 B-29 Flight Engineer Who Transported Roswell Debris',
    slug: 'robert-porter-roswell-transport-1947',
    summary: 'Staff Sergeant Robert R. Porter was a flight engineer on the B-29 that transported debris from Roswell to Fort Worth. He described packages that were impossibly light and was told the cargo was a "flying saucer."',
    description: "Staff Sergeant Robert R. Porter served as a B-29 flight engineer with the 830th Bomb Squadron at Roswell Army Air Field. On July 8, 1947, he was a crew member on the flight that transported debris recovered from the Foster Ranch to Fort Worth Army Air Field, where Brigadier General Roger Ramey would hold his press conference.\n\nPorter provided a sworn affidavit in 1991 describing his role in the transport. He stated that packages of debris were loaded onto the aircraft, wrapped in brown paper. One piece was triangle-shaped, approximately two and a half feet across the bottom. The remaining items were in small packages about the size of a shoebox.\n\nWhat struck Porter most was the weight \u2014 or rather, the absence of it. \"When I picked it up, it was just like picking up an empty package,\" he stated. The material was extraordinarily light, as if the packages contained nothing at all, despite clearly holding solid objects.\n\nPorter stated that the crew was told the cargo was the remains of a \"flying saucer.\" After landing at Fort Worth, the material was transferred to a B-25 aircraft and flown onward to Wright Field (now Wright-Patterson Air Force Base) in Dayton, Ohio. This detail is significant because Wright Field was home to the Air Materiel Command, the military\u2019s technical intelligence center responsible for analyzing foreign technology.\n\nWhen the weather balloon cover story was issued later that day, Porter noted that the material he had handled was clearly not a weather balloon. He had experience with military equipment and was familiar with standard observation balloon materials \u2014 the wreckage he transported was unlike any of them.\n\nPorter\u2019s testimony is particularly valuable because it corroborates the chain of custody: debris moved from Roswell to Fort Worth (where it was publicly displayed as a weather balloon) and then onward to Wright Field (where it was presumably analyzed in secret). His description of the impossibly lightweight packages aligns with Jesse Marcel\u2019s account of anomalous materials.\n\nPorter maintained his account consistently until his death. His sworn affidavit remains part of the documentary record compiled by researchers Thomas Carey and Donald Schmitt.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: false,
    location_name: 'Roswell Army Air Field / Fort Worth AAF',
    location_description: 'B-29 flight from Roswell Army Air Field to Fort Worth Army Air Field, then material transferred to B-25 bound for Wright Field, Ohio',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.3016,
    longitude: -104.5305,
    event_date: '1947-07-08',
    event_time: '10:00:00',
    witness_count: 1,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Sworn affidavit (1991) describing debris transport. Military service records confirm assignment to 830th Bomb Squadron at Roswell AAF. Flight logs corroborate B-29 mission to Fort Worth.',
    tags: ['roswell', 'robert-porter', 'military-witness', 'debris-transport', 'b-29', 'wright-field', '1947', 'first-hand-account', 'sworn-affidavit', '509th-bomb-group'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Sheriff George Wilcox \u2014 The Lawman Who Connected Brazel to the Military',
    slug: 'george-wilcox-roswell-sheriff-1947',
    summary: 'Chaves County Sheriff George Wilcox was the first official Mac Brazel contacted about the debris. Wilcox relayed the report to Roswell Army Air Field and was later warned by the military to stay silent.',
    description: "George A. Wilcox served as Sheriff of Chaves County, New Mexico, in July 1947. He was the critical link in the chain of events that brought the Roswell debris to military attention \u2014 the first official that rancher Mac Brazel contacted after discovering unusual wreckage on the Foster Ranch.\n\nOn approximately July 7, 1947, Brazel drove into Roswell and reported his find to Sheriff Wilcox at the Chaves County courthouse. Brazel described finding a large field of unusual debris \u2014 material that was unlike anything he had encountered in his years ranching, including the two weather balloons he had previously recovered on the property.\n\nWilcox recognized that the description was beyond ordinary and immediately contacted Roswell Army Air Field. The base dispatched Major Jesse Marcel, the intelligence officer, and Captain Sheridan Cavitt to investigate. This decision by Wilcox set in motion the most famous UFO case in history.\n\nAccording to testimony from his family, Wilcox\u2019s involvement did not end with the phone call. His granddaughter, Barbara Dugger, stated in the 1990s that Wilcox told her grandmother (his wife Inez) that military personnel came to the sheriff\u2019s office and warned him that if he ever spoke about the incident, his entire family would be killed. Dugger stated that her grandmother relayed this to her directly.\n\nInez Wilcox reportedly confirmed to family members that her husband had been deeply troubled by the military\u2019s threats and the pressure to remain silent. He took what he knew about the incident to his grave.\n\nWilcox\u2019s daughter, Phyllis McGuire, also provided testimony to researchers. She confirmed that her father had been visited by military personnel who impressed upon him the seriousness of maintaining silence. She described her father as visibly shaken by the encounter and noted that he never discussed the Roswell incident publicly afterward.\n\nThe sheriff\u2019s role is significant for several reasons. As a civilian law enforcement official, Wilcox had no military obligation to maintain secrecy about the incident. The fact that the military reportedly went to extraordinary lengths \u2014 including alleged death threats \u2014 to ensure his silence suggests the recovered material was far more significant than a weather balloon. A misidentified balloon would not have warranted such extreme measures against a county sheriff.\n\nGeorge Wilcox served as Chaves County Sheriff until 1948 and died in 1961. He never publicly discussed the Roswell incident after July 1947.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Chaves County Courthouse, Roswell',
    location_description: "Chaves County Sheriff\u2019s Office, Roswell, New Mexico",
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.3943,
    longitude: -104.5230,
    event_date: '1947-07-07',
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: "Family testimony from granddaughter Barbara Dugger and daughter Phyllis McGuire confirming military intimidation. Sheriff\u2019s office records from 1947. Brazel\u2019s visit to the courthouse documented in Roswell Daily Record interview.",
    tags: ['roswell', 'george-wilcox', 'sheriff', 'civilian-witness', 'military-intimidation', '1947', 'first-hand-account', 'family-testimony', 'chaves-county'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Jesse Marcel Jr. \u2014 The Boy Who Held the Roswell Debris',
    slug: 'jesse-marcel-jr-roswell-debris-1947',
    summary: 'At age 11, Jesse Marcel Jr. was awakened by his father to examine debris from the Foster Ranch. He spent the rest of his life publicly testifying about the extraordinary materials, including I-beams with strange symbols.',
    description: "Jesse A. Marcel Jr. was eleven years old on the night of July 7-8, 1947, when his father \u2014 Major Jesse Marcel Sr., intelligence officer for the 509th Bomb Group \u2014 stopped at the family home in Roswell before returning to base. Marcel Sr. woke his wife Viaud and son Jesse Jr. to show them debris he had recovered from the Foster Ranch.\n\nMarcel Jr. described being shown the materials on the kitchen floor. He recalled handling several types of debris: thin metallic foil that was extremely light and incredibly tough, dark plastic-like material, and small I-beam structures approximately three-eighths of an inch square. The I-beams bore symbols that Marcel Jr. described as resembling geometric shapes and figures \u2014 not letters from any alphabet he recognized. The symbols appeared to be embossed or raised from the surface, colored in a violet-purple hue.\n\nThe young Marcel attempted to bend and break the I-beam material but could not. It was rigid yet impossibly lightweight. The metallic foil could be crumpled but would return to its original flat shape when released, with no crease marks remaining.\n\nMarcel Jr. later reflected that his father was clearly excited about the find and wanted his family to see the materials before they were turned over to the base. Marcel Sr. told his son they were looking at pieces from a \"flying saucer\" \u2014 using the terminology of the era.\n\nUnlike many Roswell witnesses who came forward late in life, Jesse Marcel Jr. began speaking publicly about his experience in the 1970s and continued for nearly four decades. He earned a medical degree, served as a Navy flight surgeon during the Vietnam War, and later served in the Iraq War as a colonel in the Montana Army National Guard \u2014 retiring as a full colonel. His distinguished military and medical career lent substantial credibility to his testimony.\n\nIn 2007, Marcel Jr. published \"The Roswell Legacy,\" a detailed account of his experience and his father\u2019s involvement. He appeared in numerous documentaries and interviews, always maintaining the same core account: the materials he handled as a child were unlike anything manufactured on Earth.\n\nMarcel Jr. specifically addressed skeptics who attributed the debris to a Project Mogul balloon array. He stated that the materials bore no resemblance to weather balloon components \u2014 his father, a trained intelligence officer familiar with cutting-edge military technology, would have immediately recognized standard balloon materials.\n\nDr. Jesse Marcel Jr. died on August 24, 2013, at the age of 76. He never wavered from his account over 35 years of public testimony.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: false,
    location_name: 'Marcel Family Home, Roswell',
    location_description: 'Marcel family residence in Roswell, New Mexico, where Major Marcel brought debris samples before returning to base',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.3943,
    longitude: -104.5230,
    event_date: '1947-07-07',
    event_time: '23:00:00',
    witness_count: 3,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: "Published book \"The Roswell Legacy\" (2007). Decades of consistent public testimony. Military service records (Navy flight surgeon, Colonel). Corroborated father\u2019s account independently.",
    tags: ['roswell', 'jesse-marcel-jr', 'debris-handler', 'child-witness', 'military-family', '1947', 'first-hand-account', 'i-beams', 'hieroglyphics', 'roswell-legacy'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Captain Sheridan Cavitt \u2014 The CIC Agent Who Accompanied Marcel',
    slug: 'sheridan-cavitt-roswell-cic-1947',
    summary: "Counter-Intelligence Corps Captain Sheridan Cavitt accompanied Major Marcel to the Foster Ranch but later claimed to the Air Force that he immediately recognized the debris as a weather balloon \u2014 directly contradicting Marcel.",
    description: "Captain Sheridan W. Cavitt was the head of the Counter-Intelligence Corps (CIC) detachment at Roswell Army Air Field in July 1947. Along with Major Jesse Marcel, he was one of only two military officers to visit the Foster Ranch debris field and personally handle the recovered materials.\n\nCavitt accompanied Marcel on the trip to the ranch on July 7, 1947, following Mac Brazel to the debris field. The two officers spent time at the ranch surveying the wreckage before loading materials into their vehicles and returning to Roswell.\n\nCavitt\u2019s account of the incident is uniquely important \u2014 and uniquely controversial \u2014 because it directly contradicts Marcel\u2019s testimony. In 1994, when the Air Force conducted its official investigation into the Roswell incident, Cavitt was the only living principal military witness who cooperated with the investigation. He told Air Force investigators that he had immediately recognized the debris as a weather balloon and that the debris field was small, contradicting Marcel\u2019s description of an extensive field requiring multiple vehicles to clear.\n\nCavitt\u2019s counter-narrative is problematic for several reasons. First, his account changed over time. When initially contacted by researchers in the 1970s and 1980s, Cavitt denied ever going to the ranch at all \u2014 a claim contradicted by Marcel, Brazel\u2019s family, and base records. It was only after the Air Force investigation that he provided his \"weather balloon\" account. Second, if Cavitt had truly recognized the debris as a balloon immediately, the logical response would have been to tell Marcel on site, and the famous press release would never have been issued.\n\nAs a CIC officer, Cavitt\u2019s primary role at Roswell was counter-intelligence \u2014 protecting classified information and maintaining security. Researchers have noted that if the recovery involved classified materials (whether extraterrestrial or from a secret project), Cavitt would have been the officer most professionally obligated to maintain the cover story, even decades later.\n\nCavitt\u2019s wife Mary confirmed to researchers that her husband had indeed gone to the ranch with Marcel, contradicting his initial denial. She also stated that he had been reluctant to discuss the incident throughout their marriage.\n\nThe divergence between Marcel\u2019s and Cavitt\u2019s accounts remains one of the central puzzles of the Roswell case. Marcel described extraordinary materials unlike anything terrestrial; Cavitt claimed it was an immediately recognizable balloon. Both were experienced military officers. Both were at the same debris field on the same day.\n\nSheridan Cavitt retired from the military and died in 1999. His 1994 interview with Air Force investigators remains the only detailed account he ever provided.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Foster Ranch / Roswell Army Air Field',
    location_description: 'J.B. Foster Ranch debris field and Roswell Army Air Field CIC office',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.9425,
    longitude: -104.5230,
    event_date: '1947-07-07',
    event_time: '08:00:00',
    witness_count: 1,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: "1994 Air Force interview transcript. Wife Mary Cavitt\u2019s corroboration of ranch visit. CIC assignment records at RAAF. Contradicts Marcel\u2019s account \u2014 key dissenting witness in the Roswell record.",
    tags: ['roswell', 'sheridan-cavitt', 'cic', 'counter-intelligence', 'military-witness', 'contradictory-testimony', '1947', 'foster-ranch', 'air-force-investigation', 'dissenting-account'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
];

// ─── Witness media (existing + new) ───────────────────────────────────

var ALL_WITNESS_MEDIA: Record<string, Array<{media_type: string; url: string; caption: string; is_primary: boolean}>> = {
  'jesse-marcel-roswell-debris-field-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Marcel-roswell-debris_0.jpg', caption: 'Major Jesse Marcel poses with debris recovered from the Foster Ranch near Roswell. He later claimed this was substituted weather balloon material, not the actual anomalous wreckage he recovered.', is_primary: true },
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Maj_Jesse_A_Marcel_of_Houma.jpg', caption: 'Major Jesse A. Marcel of Houma, Louisiana. As intelligence officer for the 509th Bomb Group, he was the first military person to inspect the debris field on the Foster Ranch.', is_primary: false },
    { media_type: 'document', url: 'https://vault.fbi.gov/Roswell%20UFO/Roswell%20UFO%20Part%2001%20%28Final%29/view', caption: 'FBI Vault \u2014 Declassified FBI documents related to the Roswell UFO incident, including internal memos referencing the recovery.', is_primary: false },
    { media_type: 'video', url: 'https://archive.org/details/CSPAN3_20210620_202900_Reel_America_The_Roswell_Reports_-_1997', caption: '"The Roswell Reports" (1997) \u2014 Official Air Force documentary on C-SPAN3 covering Project Mogul and crash test dummy explanations.', is_primary: false },
  ],
  'mac-brazel-roswell-debris-discovery-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp', caption: 'Roswell Daily Record, July 8, 1947 \u2014 Front page headline after Brazel reported his find to the sheriff.', is_primary: true },
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Roswell_Crash_1947.jpg', caption: 'Photograph associated with the 1947 Roswell crash site area \u2014 the remote New Mexico terrain where Mac Brazel discovered debris.', is_primary: false },
    { media_type: 'document', url: 'https://www.gao.gov/assets/nsiad-95-187.pdf', caption: 'GAO Report NSIAD-95-187 \u2014 Found that key RAAF administrative records had been destroyed.', is_primary: false },
  ],
  'walter-haut-roswell-press-release-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/a/a3/UFO_Museum%2C_Roswell%2C_NM.JPG', caption: 'The International UFO Museum and Research Center in Roswell \u2014 co-founded in 1991 by Walter Haut himself.', is_primary: true },
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp', caption: "The Roswell Daily Record headline Haut helped create \u2014 his press release resulted in this front page on July 8, 1947.", is_primary: false },
    { media_type: 'video', url: 'https://archive.org/details/gov.archives.341-roswell-1', caption: 'Roswell Reports, Volume 1 \u2014 National Archives footage related to the official Air Force investigation.', is_primary: false },
  ],
  'thomas-dubose-roswell-coverup-testimony-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Brig_General_Ramey_Roswell_debris.jpg', caption: "Brigadier General Roger Ramey examines debris in Fort Worth. DuBose later confirmed this display was a deliberate substitution.", is_primary: true },
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/General_Ramey_with_Roswell_Memo.png', caption: 'The "Ramey Memo" \u2014 General Ramey holding a document. Researchers have spent decades attempting to decipher its contents.', is_primary: false },
    { media_type: 'document', url: 'https://www.nsa.gov/portals/75/documents/news-features/declassified-documents/ufo/report_af_roswell.pdf', caption: "NSA-hosted declassified U.S. Air Force report on Roswell \u2014 the 1994 investigation that DuBose\u2019s testimony directly contradicts.", is_primary: false },
  ],
  'robert-porter-roswell-transport-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Brig_General_Ramey_Roswell_debris.jpg', caption: "The Fort Worth press conference \u2014 Porter\u2019s B-29 flight transported materials here from Roswell before they were reshipped to Wright Field.", is_primary: true },
    { media_type: 'video', url: 'https://archive.org/details/gov.archives.341-roswell-1', caption: 'Roswell Reports, Volume 1 \u2014 National Archives footage covering the transport chain Porter was part of.', is_primary: false },
  ],
  'george-wilcox-roswell-sheriff-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Roswell_Daily_Record._July_8%2C_1947._RAAF_Captures_Flying_Saucer_On_Ranch_in_Roswell_Region.webp', caption: "Roswell Daily Record, July 8, 1947 \u2014 the chain started when Brazel walked into Sheriff Wilcox\u2019s office.", is_primary: true },
    { media_type: 'document', url: 'https://www.gao.gov/assets/nsiad-95-187.pdf', caption: "GAO Report NSIAD-95-187 \u2014 Found that key RAAF records had been destroyed, including records that would have documented the sheriff\u2019s initial report.", is_primary: false },
  ],
  'jesse-marcel-jr-roswell-debris-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Marcel-roswell-debris_0.jpg', caption: "Major Jesse Marcel Sr. with Roswell debris \u2014 Marcel Jr.\u2019s father brought similar material home for his family to see.", is_primary: true },
    { media_type: 'video', url: 'https://archive.org/details/CSPAN3_20210620_202900_Reel_America_The_Roswell_Reports_-_1997', caption: '"The Roswell Reports" (1997) \u2014 Air Force documentary presenting their official explanation, which Marcel Jr. publicly disputed.', is_primary: false },
  ],
  'sheridan-cavitt-roswell-cic-1947': [
    { media_type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Roswell_Crash_1947.jpg', caption: 'The remote New Mexico terrain near the Foster Ranch \u2014 Cavitt and Marcel traversed this landscape together but gave drastically different accounts.', is_primary: true },
    { media_type: 'document', url: 'https://www.nsa.gov/portals/75/documents/news-features/declassified-documents/ufo/report_af_roswell.pdf', caption: "The 1994 Air Force Roswell Report \u2014 Cavitt\u2019s interview was the only time he provided a detailed account.", is_primary: false },
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
  var results = { fixed: 0, mediaAdded: 0, reportsCreated: 0, linked: 0, errors: [] as string[] };
  var slugToId: Record<string, string> = {};

  try {
    // ─── Step 1: Find showcase ────────────────────────────────────────
    var { data: showcase, error: findErr } = await supabase
      .from('reports')
      .select('id, phenomenon_type_id')
      .eq('slug', 'the-roswell-incident-july-1947-showcase')
      .single();

    if (findErr || !showcase) {
      return res.status(404).json({ error: 'Showcase report not found. Run seed-showcase first.' });
    }
    slugToId['the-roswell-incident-july-1947-showcase'] = showcase.id;

    // Get phenomenon type
    var phenomenonTypeId = showcase.phenomenon_type_id;
    if (!phenomenonTypeId) {
      var { data: notableCase } = await supabase.from('phenomenon_types')
        .select('id').eq('name', 'Notable Case').single();
      phenomenonTypeId = notableCase ? notableCase.id : null;
    }

    // ─── Step 2: Fix existing witnesses ───────────────────────────────
    var existingSlugs = [
      'jesse-marcel-roswell-debris-field-1947',
      'mac-brazel-roswell-debris-discovery-1947',
      'walter-haut-roswell-press-release-1947',
      'thomas-dubose-roswell-coverup-testimony-1947',
    ];

    var fixPayload: Record<string, any> = {
      category: 'ufos_aliens',
      case_group: CASE_GROUP,
      content_type: 'historical_case',
    };
    if (phenomenonTypeId) fixPayload.phenomenon_type_id = phenomenonTypeId;

    // Also update showcase phenomenon_type_id if missing
    if (phenomenonTypeId && !showcase.phenomenon_type_id) {
      await supabase.from('reports')
        .update({ phenomenon_type_id: phenomenonTypeId })
        .eq('id', showcase.id);
    }

    var { data: fixedRows, error: fixErr } = await supabase.from('reports')
      .update(fixPayload)
      .in('slug', existingSlugs)
      .select('id, slug');

    if (fixErr) {
      results.errors.push('fix metadata: ' + fixErr.message);
    } else {
      results.fixed = fixedRows ? fixedRows.length : 0;
      if (fixedRows) fixedRows.forEach(function(r: any) { slugToId[r.slug] = r.id; });
    }

    // Also fetch by slug in case update returned 0 (already correct)
    var { data: bySlug } = await supabase.from('reports')
      .select('id, slug').in('slug', existingSlugs);
    if (bySlug) bySlug.forEach(function(r: any) { slugToId[r.slug] = r.id; });

    // ─── Step 3: Create new witness reports ───────────────────────────
    for (var report of NEW_WITNESS_REPORTS) {
      var { data: existing } = await supabase.from('reports')
        .select('id').eq('slug', report.slug).single();

      if (existing) {
        slugToId[report.slug] = existing.id;
        // Update metadata on existing
        var updatePayload: Record<string, any> = { case_group: CASE_GROUP };
        if (phenomenonTypeId) updatePayload.phenomenon_type_id = phenomenonTypeId;
        await supabase.from('reports').update(updatePayload).eq('id', existing.id);
        continue;
      }

      var insertData: Record<string, any> = { ...report, case_group: CASE_GROUP };
      if (phenomenonTypeId) insertData.phenomenon_type_id = phenomenonTypeId;

      var { data: inserted, error: insertErr } = await supabase.from('reports')
        .insert(insertData).select('id').single();

      if (insertErr) {
        results.errors.push('insert ' + report.slug + ': ' + insertErr.message);
        continue;
      }
      slugToId[report.slug] = inserted.id;
      results.reportsCreated++;
    }

    // ─── Step 4: Add media to all witness reports ─────────────────────
    for (var [slug, mediaItems] of Object.entries(ALL_WITNESS_MEDIA)) {
      var reportId = slugToId[slug];
      if (!reportId) continue;

      var { data: existingMedia } = await supabase.from('report_media')
        .select('url').eq('report_id', reportId);

      var existingUrls = new Set((existingMedia || []).map(function(m: any) { return m.url; }));
      var newItems = mediaItems.filter(function(m) { return !existingUrls.has(m.url); });

      for (var item of newItems) {
        var { error: mediaErr } = await supabase.from('report_media').insert({
          report_id: reportId,
          media_type: item.media_type,
          url: item.url,
          caption: item.caption,
          is_primary: item.is_primary,
        });
        if (mediaErr) {
          results.errors.push('media ' + slug + ': ' + mediaErr.message);
        } else {
          results.mediaAdded++;
        }
      }
    }

    // ─── Step 5: Create report links ──────────────────────────────────
    var { data: existingLinks } = await supabase.from('report_links')
      .select('target_report_id')
      .eq('source_report_id', showcase.id);

    var linkedTargets = new Set((existingLinks || []).map(function(l: any) { return l.target_report_id; }));

    var linksToCreate: Array<{source_report_id: string; target_report_id: string; link_type: string; description: string}> = [];
    for (var [lSlug, lId] of Object.entries(slugToId)) {
      if (lSlug === 'the-roswell-incident-july-1947-showcase') continue;
      if (!linkedTargets.has(lId)) {
        linksToCreate.push({
          source_report_id: showcase.id,
          target_report_id: lId,
          link_type: 'witness_account',
          description: 'Witness account related to the Roswell Incident',
        });
      }
    }

    if (linksToCreate.length > 0) {
      var { error: linkErr } = await supabase.from('report_links').insert(linksToCreate);
      if (linkErr) {
        results.errors.push('report_links: ' + linkErr.message);
      } else {
        results.linked = linksToCreate.length;
      }
    }

    // ─── Step 6: Invalidate stale AI insights ─────────────────────────
    var allIds = Object.values(slugToId);
    await supabase.from('report_insights')
      .update({ is_stale: true })
      .in('report_id', allIds);

    return res.status(200).json({
      success: true,
      results: results,
      totalClusterReports: Object.keys(slugToId).length,
      slugs: Object.keys(slugToId),
      urls: Object.keys(slugToId).map(function(s) { return '/report/' + s; }),
    });

  } catch (err: any) {
    return res.status(500).json({ error: 'Internal error', details: err.message, results: results });
  }
}
