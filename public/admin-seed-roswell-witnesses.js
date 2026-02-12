// ═══════════════════════════════════════════════════════════════════════
// ROSWELL WITNESSES — Browser-Side Report Seed Script
// Run this in the browser console on beta.discoverparadocs.com
// Creates individual first-hand witness reports linked to the showcase
// ═══════════════════════════════════════════════════════════════════════

(async function seedRoswellWitnesses() {
  console.log('🛸 Roswell Witness Reports Seeder');
  console.log('══════════════════════════════════');

  // Get Supabase client
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabaseUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2JjdGRtd25vd2ZtcXBrc2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTk4NjIsImV4cCI6MjA4NTA5NTg2Mn0.eQAyAKbNwfmJZzSgGTz1hTH-I5IWYa7E2pLJER6M8bc';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // First, find the main Roswell showcase report to get its ID
  const { data: showcase, error: findErr } = await supabase
    .from('reports')
    .select('id, title')
    .eq('slug', 'the-roswell-incident-july-1947-showcase')
    .single();

  if (findErr || !showcase) {
    console.error('❌ Could not find Roswell showcase report:', findErr);
    return;
  }
  console.log(`✅ Found showcase: "${showcase.title}" (${showcase.id})`);

  // Get the UFO phenomenon type
  const { data: ufoType } = await supabase
    .from('phenomenon_types')
    .select('id')
    .eq('slug', 'ufo-uap')
    .single();

  const phenomenonTypeId = ufoType?.id || null;

  // ─── WITNESS REPORTS ───────────────────────────────────────────────
  const witnessReports = [
    {
      title: 'Major Jesse Marcel — First Military Responder to Roswell Debris Field',
      slug: 'jesse-marcel-roswell-debris-field-1947',
      summary: 'Intelligence officer Major Jesse Marcel was the first military person to inspect the debris at the Foster Ranch. He later recanted the weather balloon explanation, describing materials unlike anything terrestrial.',
      description: `Major Jesse Antoine Marcel Sr. served as Intelligence Officer for the 509th Bomber Group at Roswell Army Air Field — the only nuclear-armed unit in the world at the time. On July 7, 1947, he was dispatched to investigate debris discovered by ranch foreman Mac Brazel on the J.B. Foster Ranch, approximately 75 miles northwest of Roswell.

Marcel, accompanied by Captain Sheridan Cavitt, drove to the ranch and spent the night before surveying the debris field the following morning. He described a field of wreckage scattered across approximately 200 yards of terrain.

The materials Marcel described were extraordinary: metallic foil that was exceedingly thin yet could not be dented, creased, or permanently bent — when crumpled, it would unfold back to its original shape. He reported lightweight I-beam structures bearing strange symbols resembling hieroglyphics. The debris also included a parchment-like material that would not burn.

Marcel loaded his vehicle with debris samples and, en route back to Roswell, stopped at his home to show his wife and son Jesse Marcel Jr. the materials. His son later confirmed handling the debris pieces, including the I-beams with unusual symbols.

On July 8, the materials were flown to Fort Worth Army Air Field where Brigadier General Roger Ramey held a press conference displaying what he claimed was a standard weather balloon. Marcel maintained until his death in 1986 that the materials photographed at that press conference were NOT the same debris he recovered from the ranch — they had been substituted.

Marcel broke his silence in 1978 when contacted by nuclear physicist and UFO researcher Stanton Friedman. He stated: "It was not anything from this Earth, that I'm quite sure of." His military credentials — including participation in Operation Crossroads atomic bomb tests at Bikini Atoll in 1946 — lent significant weight to his testimony. Marcel was intimately familiar with cutting-edge military technology and weather observation equipment, making his insistence that the debris was anomalous particularly noteworthy.

Marcel's account was corroborated by his son Jesse Marcel Jr., who published "The Roswell Legacy" detailing his own firsthand experience handling the debris as an 11-year-old boy. Both father and son maintained their accounts consistently until their respective deaths.`,
      category: 'ufo',
      event_date: '1947-07-07',
      event_time: '08:00:00',
      location_name: 'Foster Ranch / Roswell Army Air Field',
      location_description: 'J.B. Foster sheep ranch, approximately 75 miles NW of Roswell, New Mexico; then Roswell Army Air Field',
      state_province: 'New Mexico',
      country: 'United States',
      latitude: 33.9425,
      longitude: -104.5230,
      witness_count: 3,
      credibility: 'high',
      has_physical_evidence: true,
      has_photo_video: true,
      has_official_report: true,
      evidence_summary: 'Marcel photographed with debris at Fort Worth press conference. Son Jesse Marcel Jr. corroborated handling debris. Military records confirm Marcel\'s assignment and timeline.',
      tags: ['roswell', 'jesse-marcel', 'military-witness', 'debris-field', 'ufo-crash', 'cover-up', '1947', 'first-hand-account', 'intelligence-officer', '509th-bomb-group'],
      source_type: 'historical_archive',
      submitter_was_witness: false,
      content_type: 'historical_case',
    },
    {
      title: 'Mac Brazel — Ranch Foreman Who Discovered the Roswell Debris',
      slug: 'mac-brazel-roswell-debris-discovery-1947',
      summary: 'W.W. "Mac" Brazel discovered a field of unusual debris on the Foster Ranch in early July 1947. He reported it was unlike the two weather balloons he had previously found on the property.',
      description: `William Ware "Mac" Brazel was the foreman of the J.B. Foster sheep ranch located approximately 30 miles southeast of Corona, New Mexico. In mid-June to early July 1947 — accounts vary on the exact date, with some placing it as early as June 14 and others around July 3-4 — Brazel discovered a large field of unusual debris scattered across his grazing land.

Brazel described finding a "large area of bright wreckage made up of rubber strips, tinfoil, and rather tough paper, and sticks." The debris field extended approximately 200 yards, and he noted a shallow trench several hundred feet long gouged into the earth. Crucially, Brazel stated that this material was distinctly different from the two weather balloons he had previously recovered on his property — he knew what weather balloon debris looked like, and this was not that.

Initially, Brazel gathered some of the debris and stored it in a shed. It was not until several days later that he drove into Roswell to report his find to Sheriff George Wilcox. The sheriff contacted Roswell Army Air Field, which dispatched Major Jesse Marcel and Captain Sheridan Cavitt to investigate.

On July 7-8, Marcel and Cavitt accompanied Brazel back to the ranch to survey the debris field. They loaded as much material as possible into their vehicles and transported it to the base.

Following the military's involvement, Brazel was reportedly held at the base for several days — accounts from family and neighbors describe him being sequestered and unable to communicate freely. When he finally spoke to reporters from the Roswell Daily Record, his account appeared carefully controlled. He told them: "I am sure that what I found was not any weather observation balloon."

Brazel later expressed regret about reporting the discovery, telling neighbors he "wished he had never reported the finding." Family members noted a marked change in his demeanor after his time at the base — he became reluctant to discuss the incident and appeared to have been pressured into silence.

Brazel died in 1963 without ever publicly elaborating further on what he found. His son Bill Brazel Jr. later reported that his father had kept some debris samples hidden and showed them privately, describing material that could not be cut with a knife or burned.`,
      category: 'ufo',
      event_date: '1947-07-03',
      event_time: null,
      location_name: 'J.B. Foster Ranch, near Corona',
      location_description: 'J.B. Foster sheep ranch, approximately 30 miles SE of Corona and 75 miles NW of Roswell, New Mexico',
      state_province: 'New Mexico',
      country: 'United States',
      latitude: 33.8150,
      longitude: -105.1690,
      witness_count: 1,
      credibility: 'high',
      has_physical_evidence: true,
      has_photo_video: false,
      has_official_report: true,
      evidence_summary: 'Brazel reported debris to Sheriff Wilcox, triggering military response. Debris collected by RAAF personnel. Brazel interviewed by Roswell Daily Record. Family members corroborated his private statements.',
      tags: ['roswell', 'mac-brazel', 'debris-field', 'discovery', 'foster-ranch', 'ufo-crash', '1947', 'first-hand-account', 'civilian-witness'],
      source_type: 'historical_archive',
      submitter_was_witness: false,
      content_type: 'historical_case',
    },
    {
      title: 'Lt. Walter Haut — The Man Who Issued the "Flying Disc" Press Release',
      slug: 'walter-haut-roswell-press-release-1947',
      summary: 'Public Information Officer Walter Haut issued the famous "RAAF Captures Flying Saucer" press release on July 8, 1947. His 2002 deathbed affidavit claimed he personally saw alien craft and bodies in a base hangar.',
      description: `First Lieutenant Walter Gray Haut served as the Public Information Officer for the 509th Bomb Group at Roswell Army Air Field. A decorated WWII bombardier who flew 35 combat missions against Japan, Haut was also personally close to base commander Colonel William "Butch" Blanchard.

On July 8, 1947, Colonel Blanchard directly ordered Haut to draft and distribute a press release announcing that the 509th had recovered a "flying disc" from a ranch near Roswell. Haut complied, sending the release to local media outlets including the Roswell Daily Record and radio stations KGFL and KSWS. The resulting headline — "RAAF Captures Flying Saucer On Ranch in Roswell Region" — made international news within hours.

That same afternoon, the story was retracted by Brigadier General Roger Ramey at Fort Worth Army Air Field, who stated the recovered object was merely a weather balloon with a radar reflector. Haut went along with the retraction publicly.

For decades, Haut described his role as limited to following orders — drafting the press release based on what Blanchard told him, without personal knowledge of the recovered materials. He maintained this position publicly while co-founding the International UFO Museum and Research Center in Roswell in 1991, serving as its president until 1996.

However, in December 2002, at the age of 80, Haut signed a sealed affidavit that dramatically expanded his account. The affidavit, which he specified should remain confidential until after his death, contained extraordinary claims:

He stated that on July 8, 1947, he attended a morning meeting at the officers' club called by Colonel Blanchard. The meeting included key officers and covered the recovery of debris from two separate sites. Haut claimed that after the meeting, Colonel Blanchard personally escorted him to Building 84 (Hangar P-3), a heavily guarded hangar on the base. Inside, Haut stated he saw an egg-shaped metallic craft approximately 12 to 15 feet long and about 6 feet high. He also claimed to have briefly seen two bodies partially covered by a tarp — small beings approximately 4 feet tall.

Haut's affidavit affirmed that the original "flying disc" press release he issued was accurate and that the weather balloon retraction was a deliberate cover story.

Walter Haut died on December 15, 2005, at age 83. His sealed affidavit was published in 2007 in the book "Witness to Roswell" by Donald Schmitt and Tom Carey.`,
      category: 'ufo',
      event_date: '1947-07-08',
      event_time: '08:00:00',
      location_name: 'Roswell Army Air Field',
      location_description: 'Roswell Army Air Field (now Roswell International Air Center), Roswell, New Mexico',
      state_province: 'New Mexico',
      country: 'United States',
      latitude: 33.3016,
      longitude: -104.5305,
      witness_count: 1,
      credibility: 'medium',
      has_physical_evidence: false,
      has_photo_video: false,
      has_official_report: true,
      evidence_summary: 'Original press release archived. Deathbed affidavit signed 2002, released posthumously 2007. Military service records confirm role as PIO at 509th. WWII service record with 35 combat missions confirmed.',
      tags: ['roswell', 'walter-haut', 'press-release', 'deathbed-affidavit', 'military-witness', 'alien-bodies', 'cover-up', '1947', 'first-hand-account', '509th-bomb-group'],
      source_type: 'historical_archive',
      submitter_was_witness: false,
      content_type: 'historical_case',
    },
    {
      title: 'Colonel Thomas DuBose — Senior Officer Confirms Roswell Cover-Up',
      slug: 'thomas-dubose-roswell-coverup-testimony-1947',
      summary: 'Brigadier General Ramey\'s chief of staff Thomas DuBose was present at the Fort Worth press conference. He later confirmed in a sworn affidavit that the weather balloon was a deliberate substitution to divert press attention.',
      description: `Colonel Thomas Jefferson DuBose served as Chief of Staff to Brigadier General Roger M. Ramey at Fort Worth Army Air Field (later Carswell Air Force Base) in July 1947. He was a key participant in the events of July 8, 1947, when the Roswell debris was flown to Fort Worth and the official cover story was established.

DuBose was present in General Ramey's office when the famous photographs were taken showing officers posed with weather balloon debris. These photographs, intended to demonstrate that the Roswell recovery was nothing more than a misidentified weather balloon with a radar reflector, were distributed to press agencies worldwide and effectively killed the "flying disc" story.

In 1991, 44 years after the incident, DuBose provided testimony to UFO researchers that dramatically contradicted the official narrative he had helped establish. He signed an affidavit and gave recorded interviews in which he made the following key statements:

"The weather balloon explanation for the material was a cover story to divert the attention of the press."

"It damn sure wasn't a weather balloon."

Regarding the materials displayed at the press conference: "I knew the material in the photos was not what was found in the desert."

DuBose described receiving a phone call from General Clements McMullen at the Pentagon (Deputy Commander, Strategic Air Command), ordering that the real debris be sent to Washington immediately and that a cover story be implemented. According to DuBose, the order was explicit: contain the story, create a plausible alternative explanation, and ensure no further information leaked to the press.

DuBose explained that a real weather balloon was obtained, deliberately damaged to simulate a crash landing, and substituted for the actual recovered materials before the press conference. He participated in the staged event and posed for photographs knowing the materials being shown were not what Marcel had recovered from the Foster Ranch.

Importantly, DuBose did not claim to know what the actual debris was — he did not assert it was extraterrestrial. His testimony specifically addressed the fact that a cover-up occurred, that the weather balloon was a deliberate substitution, and that orders came from the highest levels of military command. This limited, specific claim — focused on what he directly knew rather than speculating about the nature of the materials — gives his testimony particular credibility.

Thomas DuBose was later promoted to Brigadier General before his retirement. He died in 1992, the year after providing his testimony.`,
      category: 'ufo',
      event_date: '1947-07-08',
      event_time: '14:00:00',
      location_name: 'Fort Worth Army Air Field',
      location_description: 'Brigadier General Ramey\'s office, Fort Worth Army Air Field (now Carswell Air Force Base), Fort Worth, Texas',
      state_province: 'Texas',
      country: 'United States',
      latitude: 32.7682,
      longitude: -97.4375,
      witness_count: 1,
      credibility: 'high',
      has_physical_evidence: false,
      has_photo_video: true,
      has_official_report: true,
      evidence_summary: 'DuBose photographed with substituted weather balloon debris in 1947. Signed affidavit in 1991 confirming cover-up. Military service records confirm his rank and position as Ramey\'s chief of staff.',
      tags: ['roswell', 'thomas-dubose', 'cover-up', 'weather-balloon', 'military-witness', 'sworn-affidavit', '1947', 'first-hand-account', 'fort-worth', 'pentagon-orders'],
      source_type: 'historical_archive',
      submitter_was_witness: false,
      content_type: 'historical_case',
    },
  ];

  // ─── INSERT REPORTS ────────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;
  const insertedIds = [];

  for (const report of witnessReports) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', report.slug)
      .single();

    if (existing) {
      console.log(`⏭️  Skipped (exists): ${report.title.substring(0, 50)}...`);
      insertedIds.push(existing.id);
      skipped++;
      continue;
    }

    const { data: newReport, error: insertErr } = await supabase
      .from('reports')
      .insert({
        ...report,
        phenomenon_type_id: phenomenonTypeId,
        status: 'approved',
        featured: false,
        upvotes: 0,
        downvotes: 0,
        view_count: 0,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`❌ Failed: ${report.slug}`, insertErr);
      continue;
    }

    console.log(`✅ Created: ${report.title.substring(0, 60)}... (${newReport.id})`);
    insertedIds.push(newReport.id);
    inserted++;
  }

  console.log('');
  console.log(`📊 Reports: ${inserted} created, ${skipped} skipped`);
  console.log('');
  console.log('══════════════════════════════════');
  console.log(`✅ Done! ${inserted} reports created.`);
  console.log('Related Reports sidebar will discover them automatically via shared category/location.');
  console.log('Refresh the Roswell report page to see witness reports.');

  // ─── INVALIDATE CACHED AI INSIGHT ──────────────────────────────────
  // Mark the existing insight as stale so it regenerates with new prompt
  const { error: staleErr } = await supabase
    .from('report_insights')
    .update({ is_stale: true })
    .eq('report_id', showcase.id);

  if (!staleErr) {
    console.log('🔄 Invalidated cached AI insight — will regenerate on next page load');
  }
})();
