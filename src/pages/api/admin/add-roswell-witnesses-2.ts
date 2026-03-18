import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var CASE_GROUP = 'roswell-1947';

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

// ─── 5 New Roswell Witness Reports ──────────────────────────────────

var NEW_WITNESS_REPORTS = [
  {
    title: 'Bill Rickett \u2014 CIC Agent Who Handled Roswell Debris and Assisted Trajectory Analysis',
    slug: 'bill-rickett-roswell-cic-agent-1947',
    summary: 'Master Sergeant Lewis "Bill" Rickett was a Counter-Intelligence Corps agent and assistant to Captain Cavitt at Roswell AAF. He confirmed handling anomalous debris and later assisted astronomer Dr. Lincoln La Paz in determining the craft\'s trajectory.',
    description: "Master Sergeant Lewis S. \"Bill\" Rickett served as a Counter-Intelligence Corps (CIC) agent at Roswell Army Air Field in July 1947, working directly under Captain Sheridan Cavitt. He was one of a small number of military personnel who had direct contact with debris recovered from the Foster Ranch.\n\nRickett was taken to a site approximately 45 to 60 minutes from Roswell where he observed and handled debris from the crash. He described the material as a thin, lightweight metallic substance that could not be bent, cut, or permanently deformed. In interviews with researchers Mark Rodeghier and Mark Chesney in the late 1980s, Rickett stated plainly that the Air Force's explanation of a weather balloon was \"totally untrue.\"\n\nRickett noted that the object appeared to have been \"in trouble\" before it crashed \u2014 suggesting that whatever it was, it had experienced a catastrophic failure in flight. He described the debris as unlike any conventional material he had encountered during his military career.\n\nPerhaps the most significant aspect of Rickett's involvement came in September 1947, approximately two months after the initial recovery. Rickett stated that he and Cavitt assisted astronomer Dr. Lincoln La Paz of the University of New Mexico in an effort to determine the speed and trajectory of the object that had crashed on the Brazel ranch. La Paz was a respected scientist who specialized in tracking meteorites.\n\nAccording to Rickett, Dr. La Paz concluded that the object was an unmanned probe from another planet. During their investigation, Rickett said they found a touchdown point approximately five miles from the main debris field where the sand had crystallized \u2014 possibly from extreme heat generated during impact or a low pass over the terrain.\n\nRickett's testimony is corroborated by several factors: military records confirm his CIC posting at Roswell AAF, his account aligns with Cavitt's confirmed presence at the debris site, and the involvement of Dr. La Paz in post-crash analysis has been confirmed through independent channels. La Paz himself reportedly confirmed to colleagues that he had been involved in the investigation, though he maintained discretion about his conclusions.\n\nRickett spoke with researchers on multiple occasions, maintaining a consistent account. His position as Cavitt's direct subordinate in the CIC gives his testimony particular weight \u2014 he was embedded in the intelligence apparatus that would have been responsible for securing and classifying any recovered materials.\n\nNote on sourcing: Rickett's testimony is primarily documented in Kevin Randle and Donald Schmitt's \"UFO Crash at Roswell\" (1991) and Thomas Carey and Donald Schmitt's \"Witness to Roswell\" (2007). His military service records confirm his assignment to the CIC detachment at Roswell AAF.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: false,
    location_name: 'Foster Ranch / Roswell Army Air Field',
    location_description: 'CIC office at Roswell Army Air Field and debris recovery site near the Foster Ranch',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.9567,
    longitude: -105.3069,
    event_date: '1947-07-07',
    event_time: null,
    witness_count: 1,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Recorded interviews with researchers Rodeghier and Chesney (late 1980s). Military records confirm CIC posting at Roswell AAF. Testimony corroborated by Cavitt\'s confirmed presence. Dr. La Paz trajectory investigation independently confirmed.',
    tags: ['roswell', 'bill-rickett', 'cic', 'counter-intelligence', 'military-witness', 'debris-handler', '1947', 'first-hand-account', 'la-paz', 'trajectory-analysis'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Glenn Dennis \u2014 The Roswell Mortician Who Received Calls About Child-Sized Coffins',
    slug: 'glenn-dennis-roswell-mortician-1947',
    summary: 'Glenn Dennis was a mortician at Ballard Funeral Home in Roswell who claimed the military base called requesting small, hermetically sealed coffins. His account is one of the most well-known \u2014 and most debated \u2014 of all Roswell witness testimonies.',
    description: "Glenn Dennis (March 24, 1925 \u2013 April 28, 2015) was a mortician and ambulance driver employed at Ballard Funeral Home in Roswell, New Mexico. His claims regarding the Roswell incident are among the most widely known \u2014 and most vigorously debated \u2014 of all witness accounts.\n\nDennis asserted that on or around July 5, 1947, he received a series of phone calls from the mortuary officer at Roswell Army Air Field. The calls requested information about the availability of small, hermetically sealed caskets \u2014 child-sized \u2014 and inquired about preservation techniques for bodies that had been exposed to the elements. Dennis found the questions unusual and noted that the caller seemed particularly interested in whether embalming fluid would alter the chemical composition of tissue.\n\nDennis also claimed that he later drove an injured airman to the base hospital in the Ballard Funeral Home ambulance (which had a contract to provide ambulance service to the base). While at the hospital, he said he encountered a nurse he knew who was visibly distressed. According to Dennis, the nurse later described to him seeing the autopsy of small, non-human bodies \u2014 diminutive beings with oversized heads and small, delicate features.\n\nDennis further stated that when he attempted to enter the hospital, he was confronted by military police who threatened him with severe consequences if he spoke about what he had seen or heard at the base.\n\nHis testimony first became public in August 1989 through an interview with ufologist Stanton Friedman, more than four decades after the event.\n\nIMPORTANT CREDIBILITY NOTES: Dennis's account carries significant credibility questions that researchers and readers should weigh carefully:\n\n1. The nurse Dennis initially identified has never been verified. When researchers found no military nurse matching the name he provided, Dennis changed the name. No military records have confirmed the existence of the nurse under either name at Roswell AAF.\n\n2. Dennis's professional title at the time has been questioned. Records suggest he was working as an embalmer in 1947, not yet holding the full mortician title he later used.\n\n3. His story became more detailed over the decades, which critics argue suggests embellishment. Supporters counter that this is common with traumatic memories recalled after long periods of silence.\n\n4. However, multiple individuals have independently confirmed that Dennis told them about the unusual phone calls from the base \"way back when it happened\" \u2014 long before Roswell became a public sensation. This contemporaneous corroboration is significant.\n\nDennis went on to co-found the International UFO Museum and Research Center in Roswell in 1991, alongside Walter Haut. He remained a prominent figure in Roswell advocacy until his death in 2015.\n\nSources: Randle & Schmitt \"The Truth About the UFO Crash at Roswell\" (1994), Carey & Schmitt \"Witness to Roswell\" (2007). Dennis's Wikipedia entry provides a balanced overview of both his claims and the criticisms.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Ballard Funeral Home, Roswell',
    location_description: 'Ballard Funeral Home in Roswell, New Mexico, which held the ambulance contract for Roswell Army Air Field',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.3943,
    longitude: -104.5230,
    event_date: '1947-07-09',
    event_date_approximate: true,
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: 'Public testimony beginning 1989. Contemporaneous corroboration from individuals who heard his account decades before Roswell became public. Co-founded International UFO Museum (1991). Nurse witness never independently verified. Story details evolved over time.',
    tags: ['roswell', 'glenn-dennis', 'mortician', 'civilian-witness', 'ballard-funeral-home', '1947', 'child-coffins', 'base-hospital', 'controversial-testimony', 'ufo-museum'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Barney Barnett \u2014 Civil Engineer Who Reportedly Witnessed Crash Debris and Bodies',
    slug: 'barney-barnett-roswell-san-agustin-1947',
    summary: 'Grady L. "Barney" Barnett was a respected civil engineer with the U.S. Soil Conservation Service who reportedly encountered a crashed disc and alien bodies on the Plains of San Agustin. His account survives only through second-hand testimony.',
    description: "Grady L. \"Barney\" Barnett (1896\u20131969) was a civil engineer employed by the U.S. Soil Conservation Service in Socorro, New Mexico. He was reportedly one of the first civilians to encounter debris from what may have been connected to the Roswell incident, though his account remains among the most debated aspects of the case.\n\nAccording to testimony relayed by his friends Jean and Vern Maltais, Barnett told them that while conducting field work on the Plains of San Agustin in early July 1947, he came upon a disc-shaped craft the color of dirty stainless steel, approximately twenty to thirty feet in diameter. Barnett reportedly described seeing four small humanoid bodies near the wreckage \u2014 beings approximately four to five feet tall, wearing one-piece gray suits. He said a group of archaeologists from a university also arrived at the site before the military cordoned off the area and warned everyone present not to speak about what they had seen.\n\nBarnett's story became public through the first major book on Roswell \u2014 \"The Roswell Incident\" by William Moore and Charles Berlitz (1980), with research assistance from Stanton Friedman. The account was one of the foundational elements of the early Roswell narrative.\n\nIMPORTANT CREDIBILITY NOTES: Barnett's testimony carries significant caveats that readers should carefully consider:\n\n1. ALL of Barnett's testimony is second-hand. He died in 1969, a decade before Roswell researchers began systematic investigation. No researcher was able to interview him directly. His account survives entirely through what he told friends and what his wife Ruth recorded in her diary.\n\n2. The location is problematic. The Plains of San Agustin are approximately 150 miles west of the Foster Ranch near Corona where the primary Roswell debris was found. Some researchers have argued this represents a second, separate crash site. Others, including later work by Kevin Randle and Donald Schmitt, concluded that the San Agustin connection lacked sufficient evidence and abandoned it.\n\n3. The archaeologists Barnett mentioned were never identified. Despite extensive research, no university archaeological team has been confirmed as present in the area at that time.\n\n4. However, Barnett was by all accounts a highly respected, steady individual with no history of fabrication. His standing in the community lends weight to the possibility that he did encounter something unusual, even if the exact details are now impossible to verify.\n\nToday, the Barnett account is largely treated separately from the core Roswell narrative centered on the Foster Ranch. Whether it represents a genuine second crash site, a conflated memory, or a misidentified event remains unresolved.\n\nSources: Moore & Berlitz \"The Roswell Incident\" (1980), Friedman & Berliner \"Crash at Corona\" (1992), Randle & Schmitt \"The Truth About the UFO Crash at Roswell\" (1994).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Plains of San Agustin, New Mexico',
    location_description: 'The Plains of San Agustin in west-central New Mexico, approximately 150 miles west of the Foster Ranch',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.87,
    longitude: -108.35,
    event_date: '1947-07-03',
    event_date_approximate: true,
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: 'Second-hand testimony relayed by friends Jean and Vern Maltais. Wife Ruth Barnett\'s diary entries. No direct interview exists \u2014 Barnett died 1969 before systematic research began. Plains of San Agustin location debated by researchers.',
    tags: ['roswell', 'barney-barnett', 'civilian-witness', 'plains-san-agustin', 'second-hand-testimony', '1947', 'crash-bodies', 'soil-conservation', 'socorro', 'debated-location'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Chester Lytle \u2014 Manhattan Project Engineer Told of Alien Recovery by Colonel Blanchard',
    slug: 'chester-lytle-roswell-blanchard-testimony-1953',
    summary: 'Chester Lytle was a senior Manhattan Project engineer whose work required close contact with the military. In 1953, Colonel William Blanchard \u2014 commander of the 509th Bomb Group at Roswell in 1947 \u2014 personally told Lytle that an alien spacecraft and four bodies had been recovered.',
    description: "Chester Lytle was a senior engineer who developed key components for the Manhattan Project, including work on the atomic bomb's detonation systems. His post-war work with the Atomic Energy Commission (AEC) required his supervision of the transfer of nuclear weapons from Albuquerque's Sandia Laboratory to forward bomber bases, placing him in regular contact with high-ranking military officials.\n\nLytle's connection to the Roswell incident comes not from direct observation of the crash, but from a remarkable disclosure by the base commander himself. In February 1953, Lytle was in Alaska on military-related business. His wife was in Chicago about to give birth, and Lytle was desperate to get home. Colonel William \"Butch\" Blanchard \u2014 who had commanded the 509th Bomb Group at Roswell Army Air Field in July 1947 and was now a general officer \u2014 offered to help by arranging Air Force transport to Illinois.\n\nDuring the flight, the conversation turned to UFOs, possibly prompted by recent sightings near Elmendorf Air Force Base near Anchorage. According to Lytle, Blanchard then made a direct and unambiguous statement: an alien spacecraft had been recovered near Roswell in July 1947, along with four dead humanoid bodies.\n\nThis account is notable for several reasons. Blanchard was not a peripheral figure \u2014 he was the commanding officer who authorized the original July 8, 1947, press release announcing the capture of a \"flying disc.\" He was the highest-ranking officer at Roswell AAF and the person who would have had the most comprehensive knowledge of what was actually recovered. If anyone in the military chain of command knew the full truth, it was Blanchard.\n\nLytle's testimony was collected by researcher Robert Hastings, who was interviewing Lytle about his involvement with atomic energy and his knowledge of UFO sightings near nuclear facilities. According to Hastings, Lytle volunteered the Blanchard account without prompting.\n\nCREDIBILITY ASSESSMENT: Lytle's account is second-hand testimony \u2014 he is reporting what Blanchard told him, not what he personally witnessed. However, the credibility factors are unusually strong: the source of the information (Blanchard) was the base commander during the event, Lytle had no financial motive to fabricate, and his professional standing as a senior nuclear weapons engineer made him an unlikely candidate for invention. Blanchard died in 1966 and cannot confirm or deny the account.\n\nSources: Robert Hastings' research interviews. Kevin Randle's analysis at \"A Different Perspective\" blog (August 2008). Documented in various Roswell research compilations.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'In-flight, Alaska to Illinois (testimony about Roswell)',
    location_description: 'Air Force aircraft from Alaska to Illinois, February 1953. Lytle received disclosure from Colonel Blanchard during the flight.',
    state_province: 'New Mexico',
    country: 'United States',
    latitude: 33.3016,
    longitude: -104.5305,
    event_date: '1953-02-01',
    event_date_approximate: true,
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: 'Testimony collected by researcher Robert Hastings. Lytle volunteered the account unprompted. Blanchard was the actual Roswell base commander in 1947. Lytle\'s Manhattan Project credentials independently verifiable. Blanchard died 1966 and cannot confirm.',
    tags: ['roswell', 'chester-lytle', 'manhattan-project', 'blanchard', 'second-hand-testimony', '1953', 'base-commander', 'nuclear-engineer', 'disclosure', 'sandia-laboratory'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
  },
  {
    title: 'Lt. Col. Philip Corso \u2014 The Intelligence Officer Who Claimed to Manage Roswell Technology',
    slug: 'philip-corso-roswell-reverse-engineering-1997',
    summary: 'Lt. Col. Philip J. Corso published "The Day After Roswell" in 1997, claiming he oversaw the reverse-engineering of alien technology recovered from Roswell. His book was a New York Times bestseller, but his account contains documented factual errors and remains highly controversial.',
    description: "Lieutenant Colonel Philip James Corso (May 22, 1915 \u2013 July 16, 1998) was a career U.S. Army intelligence officer who served on the National Security Council staff under President Eisenhower. In 1997, he published \"The Day After Roswell\" (co-authored with William J. Birnes), which became a New York Times bestseller and one of the most controversial books in UFO history.\n\nCorso's claims are extraordinary in scope. He asserted that in 1947, while stationed at Fort Riley, Kansas, he personally saw the body of an extraterrestrial being in a shipping crate \u2014 a small humanoid with an oversized head. He further claimed that in 1961, as head of the Foreign Technology desk at the Army's Research and Development division in the Pentagon, he was given custody of recovered Roswell artifacts and directed their \"seeding\" into American industry.\n\nAccording to Corso, technologies reverse-engineered from Roswell debris included integrated circuit chips, fiber optics, lasers, Kevlar and super-tenacity fibers, and night vision equipment. He claimed to have personally delivered materials to defense contractors and research institutions while disguising their extraterrestrial origin as \"foreign technology\" captured from adversaries.\n\nIMPORTANT CREDIBILITY NOTES: Corso's account carries the most significant credibility questions of any major Roswell witness. Readers should weigh these carefully:\n\n1. FACTUAL ERRORS: Analysts have identified numerous errors about basic, verifiable facts in the text. Some chronological claims are impossible given known timelines. Skeptic Philip Klass documented multiple instances where Corso's assertions contradicted established historical records.\n\n2. QUALIFICATIONS: Critics have pointed out that Corso did not hold a bachelor's degree in science or engineering, making his claimed role in evaluating and distributing advanced alien technology implausible. His military service, while distinguished, was primarily in intelligence and administration.\n\n3. TECHNOLOGY CLAIMS: The technologies Corso attributed to Roswell reverse-engineering all have well-documented, incremental human development histories. Fiber optics, for example, traces back to experiments in the 1840s, with steady progress through the 20th century. The transistor (precursor to integrated circuits) was under development at Bell Labs before 1947.\n\n4. TIMING: Corso went public at age 82, shortly before his death. He had no living contemporaries who could confirm or deny his specific claims about the Foreign Technology desk activities.\n\n5. HOWEVER: Corso's military service record is verified. He did serve on the NSC staff. He did work at the Pentagon. His general career trajectory aligns with someone who could theoretically have had access to classified programs.\n\nCorso testified before a closed session of the Senate in 1997 but died the following year before any substantive verification of his claims could be conducted.\n\n\"The Day After Roswell\" remains in print and continues to be widely read. It represents the most ambitious \u2014 and most contested \u2014 claim about the practical implications of the Roswell recovery.\n\nSources: Corso & Birnes \"The Day After Roswell\" (Pocket Books, 1997). Philip Klass critical analysis. Kevin Randle's review at \"A Different Perspective.\" Wikipedia provides a balanced overview.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'low',
    status: 'approved',
    featured: false,
    location_name: 'Fort Riley, Kansas / The Pentagon',
    location_description: 'Corso claimed to have seen an alien body at Fort Riley, Kansas in 1947, and later managed reverse-engineering at the Pentagon in 1961',
    state_province: 'Kansas',
    country: 'United States',
    latitude: 39.0553,
    longitude: -96.7648,
    event_date: '1947-07-06',
    event_date_approximate: true,
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: 'Published book "The Day After Roswell" (1997, NYT bestseller). Verified military service record including NSC staff position. Senate testimony (1997). Multiple documented factual errors in text. No independent corroboration of specific reverse-engineering claims. Died 1998.',
    tags: ['roswell', 'philip-corso', 'reverse-engineering', 'pentagon', 'fort-riley', '1947', 'nyt-bestseller', 'controversial', 'nsc', 'foreign-technology'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
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
  var results = { reportsCreated: 0, linked: 0, errors: [] as string[] };

  try {
    // ─── Step 1: Find showcase ────────────────────────────────────────
    var { data: showcase, error: findErr } = await supabase
      .from('reports')
      .select('id, phenomenon_type_id')
      .eq('slug', 'the-roswell-incident-july-1947-showcase')
      .single();

    if (findErr || !showcase) {
      return res.status(404).json({ error: 'Showcase report not found.' });
    }

    var phenomenonTypeId = showcase.phenomenon_type_id;

    // ─── Step 2: Create new witness reports ────────────────────────────
    for (var i = 0; i < NEW_WITNESS_REPORTS.length; i++) {
      var rpt = NEW_WITNESS_REPORTS[i];

      // Check if already exists
      var { data: existing } = await supabase
        .from('reports')
        .select('id')
        .eq('slug', rpt.slug)
        .single();

      if (existing) {
        results.errors.push('Report already exists: ' + rpt.slug);
        continue;
      }

      // Create the report
      var insertPayload = Object.assign({}, rpt, {
        case_group: CASE_GROUP,
        phenomenon_type_id: phenomenonTypeId,
      });

      var { data: created, error: createErr } = await supabase
        .from('reports')
        .insert(insertPayload)
        .select('id')
        .single();

      if (createErr) {
        results.errors.push('Failed to create ' + rpt.slug + ': ' + createErr.message);
        continue;
      }

      results.reportsCreated++;

      // ─── Step 3: Link to showcase via report_links ──────────────────
      try {
        await supabase.from('report_links').insert({
          source_report_id: showcase.id,
          target_report_id: created!.id,
          link_type: 'witness_account',
        });
        results.linked++;
      } catch (linkErr: any) {
        results.errors.push('Failed to link ' + rpt.slug + ': ' + (linkErr.message || 'unknown'));
      }
    }

    return res.status(200).json({
      success: true,
      results: results,
      message: 'Created ' + results.reportsCreated + ' reports, linked ' + results.linked + ' to showcase',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
