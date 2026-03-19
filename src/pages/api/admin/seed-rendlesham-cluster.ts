import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';

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

// ─── Rendlesham Forest Case Cluster ─────────────────────────────────────
// 1 showcase + 5 witness reports
// Pattern: identical to Roswell cluster (Session 6a)
// Sources: Halt Memo (FOIA 1983), Halt audio tape (Wikimedia Commons),
//   Ian Ridpath analysis, Wikipedia, UK National Archives DEFE 24/1948,
//   GAO-equivalent UK Parliamentary records (Hansard 2001, 2015),
//   Pope/Burroughs/Penniston "Encounter in Rendlesham Forest" (2014),
//   Bruni "You Can't Tell the People" (2000), James Easton witness
//   statement analysis (1997), Burroughs VA medical settlement (2015)

var CASE_GROUP = 'rendlesham-1980';

var REPORTS: Array<any> = [

  // ═══════════════════════════════════════════════════════════════════════
  // 0. SHOWCASE \u2014 Target: 10,000+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'The Rendlesham Forest Incident \u2014 December 1980',
    slug: 'the-rendlesham-forest-incident-december-1980-showcase',
    summary: 'Over three nights in December 1980, United States Air Force personnel stationed at RAF Woodbridge in Suffolk, England, reported encounters with unidentified lights and a craft in the adjacent Rendlesham Forest. The incident produced an official military memo, a contemporaneous audio tape recording, documented radiation readings, and physical ground traces \u2014 making it one of the best-documented UFO cases in history.',
    description: "Something moved through Rendlesham Forest in the early hours of December 26, 1980. What followed over the next three nights would produce more contemporaneous military documentation than any other UFO case on record \u2014 an official memo to the UK Ministry of Defence, a real-time audio tape of a deputy base commander pursuing lights through the trees, radiation readings from military-grade equipment, and physical evidence on the forest floor. The Rendlesham Forest Incident, often called Britain's Roswell, stands apart from most UFO cases for a simple reason: the primary witnesses were United States Air Force personnel stationed at a NATO twin base complex during the Cold War, and several of them documented what they saw in real time.\n\nTHE SETTING\n\nRAF Woodbridge and RAF Bentwaters were twin air bases in Suffolk, England, approximately 80 miles northeast of London. In December 1980, both bases were operated by the United States Air Force as part of NATO's European defense infrastructure. The 81st Tactical Fighter Wing was stationed at Bentwaters, while Woodbridge served as a secondary facility. Rendlesham Forest \u2014 a dense pine plantation managed by the Forestry Commission \u2014 lay between and adjacent to both bases. The East Gate of RAF Woodbridge opened directly onto a logging track leading into the forest.\n\nThe bases held strategic significance during the Cold War. While the U.S. and UK governments have neither confirmed nor denied it, multiple sources have reported that nuclear weapons were stored at the facility \u2014 a detail that, if true, would elevate the security implications of unidentified objects operating in the immediate vicinity.\n\nTHE FIRST NIGHT \u2014 DECEMBER 26, 1980\n\nAt approximately 3:00 AM on December 26, security police patrolling near the East Gate of RAF Woodbridge observed unusual lights apparently descending into Rendlesham Forest. The initial assumption was a downed aircraft. Three patrolmen \u2014 Staff Sergeant Jim Penniston, Airman First Class John Burroughs, and Airman Edward Cabansag \u2014 were dispatched to investigate, with Master Sergeant J.D. Chandler coordinating via radio and Lieutenant Fred Buran monitoring from Central Security Control at Bentwaters.\n\nWhat Penniston and Burroughs reported encountering in the forest has been the subject of intense debate for over four decades. Penniston described a small, triangular craft approximately two to three meters across and two meters high, resting on the forest floor. He reported it was dark metallic in appearance, warm to the touch, with a bank of blue lights underneath and a pulsing red light on top. He made sketches in his patrol notebook and noted strange symbols on the craft's surface.\n\nBurroughs, who accompanied Penniston, confirmed seeing unusual lights but his description of the encounter differed in key details from Penniston's account \u2014 a divergence that has been noted by both believers and skeptics.\n\nCabansag, the third patrolman, provided what may be the most significant first-night testimony precisely because of its restraint. In his original 1980 statement \u2014 discovered by Scottish researcher James Easton in 1997 in files held by Citizens Against UFO Secrecy (CAUS) in Arizona \u2014 Cabansag wrote that after searching the forest for over an hour, the team concluded the lights came from a beacon at a nearby lighthouse. This contemporaneous written statement, made within days of the event, directly contradicts the more dramatic accounts that emerged in later years.\n\nIMPORTANT NOTE: An exceptionally bright fireball (meteor) was recorded by astronomers over southern England at approximately the same time as the first-night sighting. Bright fireballs are a well-documented trigger for UFO reports.\n\nPHYSICAL EVIDENCE\n\nAt daybreak on December 26, investigators found three shallow depressions in the forest floor arranged in a triangular pattern. The Halt Memo (see below) records these as 1.5 inches deep and 7 inches in diameter. Broken branches were observed on nearby trees, along with marks on the trunks.\n\nThe ground impressions were examined by Suffolk police officers who were called to the scene. According to researcher Ian Ridpath's documentation of the police response, the officers identified the depressions as rabbit diggings \u2014 a common feature of the sandy forest soil. The tree marks were identified by local forestry workers as standard axe blazes used to mark trees scheduled for felling \u2014 a routine forestry practice.\n\nThese competing interpretations of the same physical evidence \u2014 extraordinary landing traces versus mundane forest features \u2014 remain unresolved.\n\nTHE HALT MEMO\n\nOn January 13, 1981, Lieutenant Colonel Charles Halt, Deputy Base Commander at RAF Woodbridge, submitted an official memorandum to the UK Ministry of Defence titled \"Unexplained Lights.\" The memo was unclassified and was released under the U.S. Freedom of Information Act in 1983. It describes the initial sighting, the physical evidence, radiation readings taken during a return investigation, and subsequent light phenomena observed over multiple nights.\n\nThe Halt Memo is the cornerstone document of the case. It is an official military communication from a senior officer to a foreign government's defense ministry, describing events that the officer personally investigated. No other UFO case has produced a comparable document from such a senior source.\n\nHowever, the memo contains a dating error. It places the first night's events on December 27, while patrol logs and witness statements indicate December 26. This one-day discrepancy in an official document has been seized upon by both sides \u2014 skeptics cite it as evidence of carelessness, while proponents argue it reflects the chaos of the situation.\n\nTHE SECOND INVESTIGATION \u2014 DECEMBER 28, 1980\n\nOn the night of December 27-28, Halt personally led a team back into the forest to investigate. He brought military-grade radiation detection equipment (an AN/PDR-27 survey meter) and a handheld Lanier micro-cassette recorder.\n\nThe audio tape Halt made that night is one of the most remarkable pieces of evidence in UFO history. Over approximately 18 minutes of recording (with gaps where the recorder was switched on and off), Halt documents radiation readings, describes light phenomena, and directs his team through the forest in real time.\n\nRadiation readings taken at the triangular depression site measured 0.07 milliroentgens per hour, compared to background levels of 0.03-0.04 milliroentgens per hour in surrounding areas. The UK Ministry of Defence later assessed these readings as \"not significantly higher than average background.\" A subsequent independent radiation survey, however, identified elevated readings confined to a small area near the alleged landing site that were significantly higher than the field average.\n\nDuring the investigation, Halt and his team reported observing a red, sun-like light moving through the trees with a pulsing motion. At one point, it appeared to throw off glowing particles before breaking into five separate white objects that disappeared. Three star-like objects were later observed in the sky, displaying red, green, and blue lights with sharp angular movements.\n\nTHE SKEPTICAL CASE\n\nThe most thorough skeptical analysis of the Rendlesham incident has been conducted by Ian Ridpath, a British astronomer and science writer. Ridpath's investigation, published in detail on his website, argues that the sightings can be explained by a combination of the Orfordness Lighthouse, bright stars (particularly Sirius), and the December 26 fireball.\n\nThe Orfordness Lighthouse, located due east of Rendlesham Forest, was one of the brightest in the UK at the time, rated at five million candelas. Its beam swept the area every five seconds. Ridpath demonstrated that the flash rate recorded on Halt's audio tape matches the lighthouse's rotation precisely. Suffolk police officers called to the scene on the first night independently identified the light source as the Orfordness Lighthouse.\n\nPerhaps most significantly, the original 1980 witness statements discovered by James Easton show that at least one first-night witness (Cabansag) explicitly identified the lighthouse as the light source, and Burroughs referenced seeing \"a beacon going around.\" These contemporaneous statements, made before the incident became a celebrated UFO case, carry substantial weight.\n\nRidpath's analysis does not dismiss the witnesses as liars. Rather, it demonstrates how unfamiliar surroundings, a nighttime forest, the excitement of a potential downed aircraft, and the presence of a lighthouse beam visible through moving trees could combine to create a genuinely disorienting experience \u2014 one that was later reinterpreted through the lens of the UFO phenomenon.\n\nTHE BURROUGHS MEDICAL SETTLEMENT\n\nIn January 2015, Airman First Class John Burroughs received a full medical disability settlement from the U.S. Department of Veterans Affairs. The settlement acknowledged that Burroughs suffered a cardiac injury \u2014 a shredded anterior mitral valve \u2014 that occurred in the line of duty in December 1980. The identified cause was exposure to \"broad-band non-ionizing electromagnetic radiation.\"\n\nThe settlement was secured after years of legal battle involving attorney Pat Frascogna and intervention by Senator John McCain's staff. Approximately 1,000 pages of Burroughs' medical records from RAF Bentwaters/Woodbridge (1979-1982) remain legally classified, with references to Special Access Programs (SAPs) cited as justification for continued classification.\n\nWhile the medical settlement does not prove extraterrestrial origin for the Rendlesham events, it represents an official U.S. government acknowledgment that something physically harmful occurred to a servicemember during the December 1980 incident \u2014 and that the nature of the exposure was sufficiently sensitive to justify ongoing classification of medical records.\n\nGOVERNMENT RESPONSE\n\nThe UK Ministry of Defence, through its DS8 division (responsible for UFO matters), received and filed the Halt Memo. The MoD's consistent public position has been that \"nothing of defence significance occurred at Rendlesham Forest in 1980\" \u2014 a statement repeated in response to a July 2015 parliamentary inquiry by Lord Black of Brentwood.\n\nHowever, the case has generated sustained parliamentary interest. The House of Lords debated the incident in both January and October 2001, prompted in part by Georgina Bruni's 2000 book \"You Can't Tell the People\" \u2014 a title derived from a remark reportedly made by Prime Minister Margaret Thatcher to Bruni in 1997: \"UFOs! You must get your facts right and you can't tell the people.\"\n\nAll 18 MoD UFO files transferred to the UK National Archives reference the Rendlesham incident, though primarily in the context of replies to parliamentary questions and public inquiries. Nick Pope, who served on the MoD's UFO desk from 1991 to 1994, has stated that the Rendlesham case was considered the most significant in the MoD's files.\n\nLEGACY\n\nThe Rendlesham Forest Incident occupies a unique position in UFO history. It is the only case that produced both a contemporaneous audio recording of the investigation and an official military memo from a senior officer to a foreign government's defense ministry. The 2015 Burroughs medical settlement added a further layer \u2014 official government acknowledgment that a servicemember was physically harmed during the events.\n\nThe case divides sharply between those who see it as powerful evidence of an extraordinary encounter and those who view it as a textbook example of how misidentified mundane stimuli can be amplified by expectation, unfamiliar terrain, and the passage of time. Both positions are supported by evidence, and the original contemporaneous witness statements \u2014 particularly Cabansag's identification of the lighthouse \u2014 exist in tension with the more dramatic accounts that followed.\n\nRendlesham Forest itself has become a site of public interest. The Forestry Commission maintains a marked \"UFO Trail\" through the forest, and a nine-foot oak sculpture modeled on witness descriptions of the alleged craft was installed at the trail's end in 2014.\n\nThe incident continues to generate new developments. In 2010, Jim Penniston revealed a notebook containing 16 pages of binary code that he claimed to have received telepathically during the encounter \u2014 a claim that has generated significant controversy (see the Penniston witness report for analysis). The Burroughs medical records remain classified. And the question of whether nuclear weapons were present at the bases during the incident \u2014 a factor that would significantly alter the security calculus \u2014 has never been officially addressed.\n\nSources: Halt Memo (January 13, 1981, released via FOIA 1983), Halt audio tape (Wikimedia Commons), Ian Ridpath analysis (ianridpath.com/ufo/rendlesham.html), James Easton witness statement research (1997), UK National Archives DEFE 24/1948, Hansard parliamentary debates (January 30, 2001; October 16, 2001), Lord Black of Brentwood inquiry (July 2015), Burroughs VA settlement documentation (January 2015), Pope, Burroughs & Penniston \"Encounter in Rendlesham Forest\" (2014), Bruni \"You Can't Tell the People\" (2000).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: true,
    location_name: 'Rendlesham Forest, Suffolk, England',
    location_description: 'Dense pine forest between RAF Woodbridge and RAF Bentwaters, approximately 80 miles northeast of London',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0833,
    longitude: 1.4453,
    event_date: '1980-12-26',
    event_date_approximate: false,
    event_time: '03:00:00',
    witness_count: 15,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Halt Memo (official USAF memo to UK MoD, January 1981). Contemporaneous audio tape recording by Deputy Base Commander. Radiation readings (AN/PDR-27 military equipment). Three ground depressions in triangular pattern. Tree damage. Original 1980 witness statements. 2015 VA medical settlement for witness injury. Parliamentary debates (Hansard 2001, 2015). UK National Archives files DEFE 24/1948.',
    tags: ['rendlesham', 'raf-woodbridge', 'raf-bentwaters', 'suffolk', 'halt-memo', 'halt-tape', 'cold-war', 'nato', 'usaf', 'uk-mod', 'physical-evidence', 'radiation', 'audio-recording', 'parliamentary-inquiry', 'december-1980'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated high credibility based on the breadth and quality of contemporaneous documentation: an official military memo from a Lt Col to the UK Ministry of Defence, a real-time audio tape recording of the investigation, military-grade radiation readings, physical ground traces, and original 1980 witness statements. The 2015 VA medical settlement officially acknowledged a servicemember was physically harmed during the events. The case has generated sustained UK parliamentary interest (Hansard debates 2001, 2015).',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 1. JIM PENNISTON \u2014 Target: 5,500+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'SSgt Jim Penniston \u2014 The Airman Who Touched the Craft',
    slug: 'jim-penniston-rendlesham-craft-encounter-1980',
    summary: 'Staff Sergeant Jim Penniston was the senior security patrolman dispatched to investigate lights in Rendlesham Forest on December 26, 1980. He is the only witness who claims direct physical contact with an unidentified craft. Thirty years later, he revealed a notebook containing binary code allegedly received during the encounter \u2014 a claim that remains deeply controversial.',
    description: "Jim Penniston ran toward something he expected to be a downed aircraft. What he found instead, he would spend the rest of his career trying to explain.\n\nStaff Sergeant Penniston was the senior security patrolman on duty at RAF Woodbridge on the night of December 25-26, 1980. When unusual lights were reported near the East Gate at approximately 3:00 AM, Penniston led the initial response team into Rendlesham Forest alongside Airman First Class John Burroughs and Airman Edward Cabansag, with Master Sergeant J.D. Chandler coordinating by radio.\n\nTHE FOREST ENCOUNTER\n\nPenniston's account of what happened in the forest that night is the most dramatic of any Rendlesham witness. He reported encountering a small triangular craft, approximately two to three meters across and two meters high, resting in a clearing. The object was dark metallic in appearance with a smooth surface. Blue lights ran along its underside, and a pulsing red light sat on top.\n\nUnlike other witnesses who described lights at a distance, Penniston stated that he approached the object and physically touched it. He described the surface as warm and smooth, like running a hand over glass. He noted symbols etched or embossed on the craft's surface \u2014 which he sketched in his patrol notebook.\n\nPenniston stated: \"The air was filled with electricity. You could feel it on your skin, in your hair. The craft was warm to the touch and had a roughness to certain areas where there were symbols, like pictorial writing.\"\n\nAfter several minutes of observation, the craft allegedly lifted off silently and departed at extraordinary speed.\n\nTHE BINARY CODE CONTROVERSY\n\nIn December 2010 \u2014 on the thirtieth anniversary of the incident \u2014 Penniston publicly revealed that his patrol notebook contained 16 pages of handwritten binary code (sequences of 1s and 0s) that he claimed to have received telepathically when he touched the craft's surface. He stated that he had written the code down compulsively the following day but had kept it private for three decades.\n\nWhen researchers decoded the binary in 2011, the sequences yielded seven sets of geographical coordinates and a message fragment. The revelation generated immediate controversy.\n\nThe technical problems with the binary code claim are substantial. The encoding uses 8-bit ASCII character representation \u2014 but in 1980, the standard computing character set was 7-bit ASCII (established in 1967). Eight-bit extended ASCII encoding did not become widespread until the mid-1980s. There is no documented mechanism by which an alien intelligence would employ an Earth-based computer encoding standard, let alone a version of that standard that had not yet been adopted.\n\nAdditionally, the notebook itself is dated \"27 Dec 80\" at the beginning of the craft description section. Penniston originally stated this was the date of the encounter, but later revised his explanation, claiming the date referred to when he wrote down the binary code rather than the encounter itself. However, researchers have noted that the date appears at the start of the craft description, not at the start of the binary section \u2014 a structural detail that contradicts the revised explanation.\n\nThe thirty-year gap between the alleged event and the revelation raises fundamental questions. No mention of binary code appears in Penniston's original 1980 statement, in any contemporary documentation, or in his public discussions of the incident during the intervening decades. The claim surfaced at a time of renewed public interest in the Rendlesham case and shortly before the publication of \"Encounter in Rendlesham Forest\" (2014), which Penniston co-authored with Burroughs and Nick Pope.\n\nMILITARY CREDENTIALS\n\nPenniston served in the United States Air Force for over 20 years, reaching the rank of Technical Sergeant (later referred to by some sources as Staff Sergeant at the time of the incident). His security clearances and professional responsibilities placed him in a position where identification of potential threats was a core duty. Proponents argue that a trained security professional is unlikely to misidentify a lighthouse beam as a landed craft at close range.\n\nSkeptics counter that Penniston's initial report, made through the chain of command in the days following the event, was significantly less dramatic than accounts given in later years. The evolution of his testimony \u2014 from an unusual light encounter to physical contact with an alien craft to telepathic binary code transmission \u2014 represents an escalation that is difficult to reconcile with a single underlying experience.\n\nCONTEXT AND ASSESSMENT\n\nPenniston's account divides into two distinct components that should be evaluated separately. His first-night forest encounter \u2014 seeing unusual lights, investigating them, and experiencing something genuinely disorienting in an unfamiliar forest at 3 AM \u2014 is corroborated in general terms by Burroughs and is consistent with something unusual having occurred. The specific claim of touching a landed craft is supported only by Penniston's own testimony.\n\nThe binary code claim, by contrast, introduces elements that did not appear in any account for 30 years and carries technical anachronisms that undermine its plausibility. Most researchers \u2014 including some who believe the core Rendlesham encounter was genuine \u2014 treat the binary code revelation with significant skepticism.\n\nPenniston continues to speak publicly about the incident and co-authored \"The Rendlesham Enigma\" with Gary Osborn, further developing the binary code thesis.\n\nSources: Penniston's original 1980 witness statement (CAUS files), Pope, Burroughs & Penniston \"Encounter in Rendlesham Forest\" (2014), Ian Ridpath notebook analysis (ianridpath.com/ufo/pennistonnotebook.html), The Rendlesham Forest Incident research archive (therendleshamforestincident.com), binary code revelation (December 2010).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Rendlesham Forest, near East Gate, RAF Woodbridge',
    location_description: 'Forest clearing approximately half a mile from the East Gate of RAF Woodbridge where Penniston claims to have encountered and touched an unidentified craft',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0853,
    longitude: 1.4420,
    event_date: '1980-12-26',
    event_date_approximate: false,
    event_time: '03:00:00',
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Original 1980 witness statement. Patrol notebook with sketches (and later binary code claim). Co-authored "Encounter in Rendlesham Forest" (2014) and "The Rendlesham Enigma." Binary code claim emerged 30 years post-incident with technical anachronisms (8-bit ASCII in 1980). Testimony escalated significantly over decades.',
    tags: ['rendlesham', 'jim-penniston', 'craft-encounter', 'physical-contact', 'binary-code', 'notebook', 'raf-woodbridge', 'security-police', 'first-night', 'december-1980'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated medium credibility. Penniston\u2019s military credentials are strong and his first-night forest encounter is corroborated in general terms by other witnesses. However, the binary code claim \u2014 which emerged 30 years after the incident \u2014 carries technical anachronisms (8-bit ASCII did not exist in 1980) and has no contemporaneous documentation. His testimony escalated significantly over decades, from unusual lights to physical contact to telepathic data transmission.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. JOHN BURROUGHS \u2014 Target: 5,000+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'A1C John Burroughs \u2014 The Airman Whose Injury the Government Acknowledged',
    slug: 'john-burroughs-rendlesham-medical-settlement-1980',
    summary: 'Airman First Class John Burroughs accompanied Jim Penniston into Rendlesham Forest on the first night and was present during subsequent investigations. In 2015, the U.S. government officially acknowledged that Burroughs suffered a cardiac injury in the line of duty during the December 1980 incident \u2014 the first known medical disability settlement linked to a UFO encounter.',
    description: "The U.S. government does not officially acknowledge that anything extraordinary happened at Rendlesham Forest. But it does officially acknowledge that John Burroughs was injured there.\n\nAirman First Class Burroughs was among the first military personnel to enter Rendlesham Forest on the night of December 25-26, 1980, alongside Staff Sergeant Jim Penniston and Airman Edward Cabansag. He was present during both the initial encounter and subsequent nights of investigation, making him one of the most extensively involved witnesses in the case.\n\nTHE FOREST ENCOUNTERS\n\nBurroughs accompanied Penniston on the first-night patrol dispatched from the East Gate of RAF Woodbridge at approximately 3:00 AM on December 26. While Penniston described a triangular craft he touched at close range, Burroughs' description of the encounter differed in key details. Burroughs confirmed seeing unusual lights and experiencing something disorienting in the forest, but his account focused more on the light phenomena than on a physical object.\n\nThis divergence between the two primary first-night witnesses is significant. Both men were in the same patrol, in the same forest, at the same time, yet their descriptions do not fully align. Proponents suggest both men experienced the same extraordinary event but perceived different aspects of it. Skeptics argue that the discrepancy indicates the experience was more ambiguous than either later account suggests.\n\nBurroughs was also present during the December 27-28 investigation led by Lt Col Charles Halt, though his role during the second and third nights is less prominently documented than during the first.\n\nTHE CARDIAC INJURY\n\nFollowing his service at RAF Woodbridge, Burroughs developed a serious cardiac condition: a shredded anterior mitral valve leaflet. The injury required lifesaving open-heart surgery. Burroughs attributed the cardiac damage to exposure during the December 1980 incident.\n\nFor years, Burroughs fought to obtain his medical records from the period and to secure VA medical benefits for the injury. The fight was complicated by an unusual obstacle: approximately 1,000 pages of Burroughs' medical records from RAF Bentwaters/Woodbridge covering 1979-1982 were \u2014 and remain \u2014 legally classified. The justification cited for the ongoing classification references Special Access Programs (SAPs), a designation typically reserved for the most sensitive national security matters.\n\nThe classification of routine medical records from an overseas posting is, by itself, extraordinary. Medical records do not normally involve national security classifications. The fact that Burroughs' Rendlesham-era medical file is subject to SAP-level protection strongly suggests that the government's interest in the December 1980 events extends beyond the public position of \"nothing of defence significance.\"\n\nTHE 2015 SETTLEMENT\n\nIn January 2015, after years of legal proceedings involving attorney Pat Frascogna and direct intervention by the staff of Senator John McCain, Burroughs received a full medical disability settlement from the U.S. Department of Veterans Affairs and the Department of Defense.\n\nThe settlement formally acknowledged that Burroughs' cardiac injury occurred in the line of duty in December 1980. The identified cause of the injury was exposure to \"broad-band non-ionizing electromagnetic radiation\" \u2014 a category of radiation that includes radio frequencies and microwaves and has been linked to cardiac and neurological injuries in classified military studies.\n\nThe implications of this settlement deserve careful consideration. The U.S. government, through its VA and DoD apparatus, officially agreed that:\n\n1. John Burroughs was injured during the December 1980 events at Rendlesham Forest.\n2. The injury was caused by exposure to non-ionizing electromagnetic radiation.\n3. The injury occurred in the line of duty.\n4. The medical records from the period warranted ongoing classification under Special Access Program protocols.\n\nThis is not a statement about alien spacecraft. But it is an official acknowledgment that something occurred at Rendlesham Forest in December 1980 that exposed a servicemember to harmful levels of electromagnetic radiation \u2014 and that the circumstances of that exposure remain sensitive enough to justify classification more than four decades later.\n\nCREDIBILITY AND SIGNIFICANCE\n\nBurroughs' credibility rests on a foundation that no other Rendlesham witness possesses: official government validation of physical harm. Whatever caused his cardiac injury, the government has confirmed it happened during the events in question and has classified the details.\n\nBurroughs co-authored \"Encounter in Rendlesham Forest\" (2014) with Jim Penniston and Nick Pope, providing his first-person account. He has spoken publicly about the incident at conferences and in media appearances, maintaining that the experience was genuine and that the government has not been forthcoming about what it knows.\n\nUnlike Penniston's evolving testimony (which introduced the binary code claim decades later), Burroughs' account has remained relatively consistent. He has focused less on the specifics of what was seen in the forest and more on the institutional response \u2014 the classification of his medical records, the difficulty of obtaining VA benefits, and the broader pattern of government obfuscation.\n\nSources: Burroughs VA medical settlement documentation (January 2015), Pat Frascogna legal proceedings, Senator John McCain staff intervention, Pope, Burroughs & Penniston \"Encounter in Rendlesham Forest\" (2014), RDR News (Burroughs government acknowledgment article, 2023), OpenMinds.tv (VA settlement reporting), East Anglian Daily Times (medical payout reporting).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: false,
    location_name: 'Rendlesham Forest / RAF Woodbridge, Suffolk',
    location_description: 'Present during both the first-night forest encounter and the subsequent investigation led by Lt Col Halt',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0853,
    longitude: 1.4420,
    event_date: '1980-12-26',
    event_date_approximate: false,
    event_time: '03:00:00',
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: '2015 VA/DoD medical settlement acknowledging cardiac injury in line of duty, December 1980. Cause: "broad-band non-ionizing electromagnetic radiation." ~1,000 pages of medical records remain classified under Special Access Program protocols. Co-authored "Encounter in Rendlesham Forest" (2014). Present first and third nights.',
    tags: ['rendlesham', 'john-burroughs', 'medical-settlement', 'va-disability', 'cardiac-injury', 'electromagnetic-radiation', 'classified-records', 'sap', 'raf-woodbridge', 'december-1980', 'john-mccain'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated high credibility. Burroughs is the only Rendlesham witness whose injury has been officially acknowledged by the U.S. government. The 2015 VA/DoD medical settlement confirmed a cardiac injury occurred in the line of duty in December 1980, caused by electromagnetic radiation exposure. Approximately 1,000 pages of his Rendlesham-era medical records remain classified under Special Access Program protocols \u2014 an extraordinary classification for routine medical files.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3. CHARLES HALT \u2014 Target: 5,500+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'Lt Col Charles Halt \u2014 The Deputy Base Commander Who Recorded It',
    slug: 'charles-halt-rendlesham-memo-tape-1980',
    summary: 'Lieutenant Colonel Charles Halt was Deputy Base Commander at RAF Woodbridge when he personally led the second investigation into Rendlesham Forest on December 27-28, 1980. He produced two pieces of primary evidence that no other UFO case can match: a real-time audio tape of the investigation and an official memorandum to the UK Ministry of Defence.',
    description: "Charles Halt did not believe in UFOs. On the night of December 27, 1980, the Deputy Base Commander of RAF Woodbridge walked into Rendlesham Forest to put the matter to rest.\n\nHe brought a radiation detector, a team of airmen, and a handheld cassette recorder. He came back with evidence that has fueled four decades of debate.\n\nTHE DECISION TO INVESTIGATE\n\nFollowing the first-night encounter on December 26, reports of unusual phenomena in the forest had created unease among base personnel. As Deputy Base Commander, Halt held a position of significant authority \u2014 and significant responsibility. Rather than allow rumors to fester, he organized a return investigation with proper equipment and personnel.\n\nHalt's decision to personally lead the team is itself significant. A Lieutenant Colonel at a NATO base during the Cold War does not casually walk into a forest at night to chase lights. Halt later stated that he expected to find a mundane explanation and put the matter to rest quickly.\n\nTHE AUDIO TAPE\n\nWhat Halt recorded on his Lanier micro-cassette that night is unlike anything else in the UFO evidence archive. Over approximately 18 minutes of intermittent recording (he switched the device on and off as events warranted), Halt documented radiation readings, directed his team, and described what he was seeing in real time.\n\nThe tape captures Halt calling out radiation measurements at the triangular depressions (0.07 milliroentgens versus 0.03-0.04 background). It records his reaction to light phenomena moving through the forest. And it preserves the genuine surprise in his voice as events unfolded beyond his expectations.\n\nHalt described a red, sun-like light that moved through the trees, pulsing and appearing to drip glowing particles. The object reportedly broke into five separate white objects that vanished. Later, three star-like objects appeared in the sky displaying red, green, and blue lights with sharp angular movements.\n\nSkeptical analysis by Ian Ridpath has demonstrated that the timing of the light flashes recorded on the tape matches the five-second rotation of the Orfordness Lighthouse precisely. Ridpath argues that Halt and his team, unfamiliar with the forest and primed by two days of UFO reports, misidentified the lighthouse beam as it swept through gaps in the trees.\n\nTHE HALT MEMO\n\nOn January 13, 1981, Halt submitted an official memorandum titled \"Unexplained Lights\" to the UK Ministry of Defence through the base's British liaison officer. The single-page, unclassified document summarizes both the initial encounter and the subsequent investigation, including the physical evidence and radiation readings.\n\nThe memo was released under the U.S. Freedom of Information Act in 1983. Its significance lies not in its content alone \u2014 which is measured and deliberately understated \u2014 but in what it represents: an official military communication from a senior officer to a foreign government's defense ministry acknowledging that something unexplained occurred under his command.\n\nHalt later expressed frustration that the memo was treated dismissively by the MoD. He stated that he expected an investigation to follow and was surprised when none materialized.\n\nThe memo contains a notable error: it dates the first-night events to December 27, when patrol logs indicate December 26. Halt has attributed this to the confusion of the period. The error has been cited by skeptics as evidence of imprecision in the official record.\n\nTHE 2010 AFFIDAVIT\n\nIn June 2010, Halt signed a notarized affidavit stating his belief that the objects encountered at Rendlesham Forest were \"extraterrestrial in origin.\" This represented a significant escalation from the measured language of the original memo, which described \"unexplained lights\" without speculating on their nature.\n\nIan Ridpath has documented substantial discrepancies between the 2010 affidavit and Halt's contemporaneous 1980-1981 accounts. Additionally, Colonel Ted Conrad \u2014 Halt's superior officer and the Base Commander at RAF Woodbridge \u2014 has publicly contradicted Halt's account, stating that nothing extraordinary occurred.\n\nThe contrast between the cautious 1981 memo and the definitive 2010 affidavit illustrates a pattern seen across multiple Rendlesham witnesses: accounts that have grown more dramatic and more certain over time.\n\nCREDIBILITY ASSESSMENT\n\nHalt's credibility rests on two pillars. First, his rank and position: a Deputy Base Commander at a NATO installation during the Cold War had professional obligations and career incentives that would strongly discourage fabrication. Second, the contemporaneous evidence: the audio tape and the memo were both created within days or weeks of the events, before the incident became a public UFO case.\n\nThe skeptical case against Halt does not require him to have lied. The lighthouse explanation, supported by the tape's flash-rate timing and by independent police identification of the light source, offers a framework in which a sincere and competent officer could genuinely misinterpret what he was seeing \u2014 particularly in a dark, unfamiliar forest, after two days of alarming reports from his subordinates.\n\nHalt retired from the U.S. Air Force and has continued to speak publicly about the incident. He co-authored \"The Halt Perspective\" with John Hanson, providing his detailed account of the events and his assessment of the evidence.\n\nSources: Halt Memo (January 13, 1981, FOIA release 1983, NICAP archive), Halt audio tape (Wikimedia Commons), Halt 2010 notarized affidavit (documented at ianridpath.com/ufo/Halt_affidavit.html), Ian Ridpath tape analysis (ianridpath.com/ufo/halttape.html), Col Ted Conrad statements, Halt & Hanson \"The Halt Perspective,\" Pope, Burroughs & Penniston \"Encounter in Rendlesham Forest\" (2014).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'high',
    status: 'approved',
    featured: false,
    location_name: 'Rendlesham Forest, Suffolk, England',
    location_description: 'Led second investigation into the forest on December 27-28, 1980 with radiation detection equipment and audio recorder',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0833,
    longitude: 1.4453,
    event_date: '1980-12-28',
    event_date_approximate: false,
    event_time: '02:00:00',
    witness_count: 6,
    has_physical_evidence: true,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Authored Halt Memo to UK MoD (January 13, 1981). Made contemporaneous audio tape recording. Documented radiation readings with AN/PDR-27 equipment. 2010 notarized affidavit. Superior officer Col Ted Conrad contradicts account. Halt tape flash-rate matches Orfordness Lighthouse per Ian Ridpath analysis.',
    tags: ['rendlesham', 'charles-halt', 'halt-memo', 'halt-tape', 'audio-recording', 'radiation', 'deputy-base-commander', 'lt-col', 'raf-woodbridge', 'mod', 'december-1980', 'orfordness-lighthouse'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated high credibility based on Halt\u2019s rank (Lt Col, Deputy Base Commander at a NATO installation) and the contemporaneous evidence he produced: a real-time audio tape and an official memo to the UK MoD, both created within weeks of the events. However, his 2010 affidavit represents a significant escalation from the measured 1981 memo, and his superior officer Col Ted Conrad has publicly contradicted his account.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4. LARRY WARREN \u2014 Target: 4,500+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'A1C Larry Warren \u2014 The Contested Witness at Capel Green',
    slug: 'larry-warren-rendlesham-capel-green-1980',
    summary: 'Airman First Class Larry Warren claims to have witnessed a triangular craft land at Capel Green, a field at the edge of Rendlesham Forest, on the night of December 27-28, 1980. His account, published in the 1997 book "Left at East Gate," was the first full-length Rendlesham narrative \u2014 but his co-author later disavowed it, and his credibility is disputed by other military witnesses.',
    description: "Larry Warren was the first Rendlesham witness to tell his story in a book. He may also be the least trusted.\n\nAirman First Class Warren was stationed at RAF Bentwaters as a security policeman in December 1980. He claims to have been present during a dramatic encounter at Capel Green \u2014 a farmer's field at the edge of Rendlesham Forest \u2014 on the night of December 27-28, in which a triangular craft allegedly landed with entities visible nearby. According to Warren, Base Commander Colonel Gordon Williams and two Suffolk Constabulary officers were also present.\n\nTHE CAPEL GREEN ACCOUNT\n\nWarren's account describes being ordered to Capel Green as part of a security detail. There, he says, a glowing triangular craft descended and landed. Warren has described seeing small entities near or within the craft, and has claimed that the event was witnessed by senior officers and local police.\n\nThe account is vivid and specific. It includes details about the behavior of the craft, the reactions of personnel, and the subsequent institutional response, including alleged debriefings where witnesses were instructed not to discuss what they had seen.\n\nSergeant Adrian Bustinza, a security police commander who appears on Halt's audio tape, has confirmed Warren's presence at Capel Green and corroborated some elements of his account. Bustinza's credibility is generally regarded as stronger than Warren's, and his confirmation has been cited by proponents as evidence that Warren's core claim \u2014 being present at a significant event at Capel Green \u2014 has at least some basis.\n\nTHE CREDIBILITY CRISIS\n\nWarren's credibility problems are extensive and well-documented.\n\nOther military personnel who were directly involved in the Rendlesham events have disputed Warren's presence and rejected his account. Unlike Penniston, Burroughs, and Halt, Warren does not appear in the original first-night witness statements or in the Halt Memo. His involvement is not corroborated by any official documentation from the period.\n\nWarren had a documented interest in UFOs and aliens before his posting to RAF Bentwaters \u2014 a detail that, while not disqualifying on its own, raises questions about whether his expectations shaped his interpretation of events.\n\nMost damaging is the position of his own co-author. Peter Robbins, an investigative writer who collaborated with Warren on \"Left at East Gate\" (1997), publicly disavowed the book's accuracy in 2018. Robbins stated that he had come to believe that \"falsehoods\" in the book had \"unraveled,\" and expressed \"more than fair amount of anger, regret and frustration\" regarding Warren's truthfulness.\n\nRobbins wrote: \"Looking back on what I now know to be true, my efforts in many respects came up woefully short.\"\n\nWhen the person who spent years investigating and writing a book with you concludes that the account contains falsehoods, it represents a credibility collapse that is difficult to overcome.\n\nTHE BOOK AND ITS IMPACT\n\n\"Left at East Gate,\" published in 1997, was the first full-length book devoted to the Rendlesham incident from a witness perspective. It introduced the case to a wide audience and served as the basis for the Sci-Fi Channel documentary \"UFO Invasion at Rendlesham\" and subsequent History Channel coverage.\n\nThe book's impact on public awareness of the Rendlesham case was significant. For many people, Warren's account was their introduction to the incident. This creates a problem for the case's overall credibility: the most widely disseminated early account is now the most disputed.\n\nNick Pope, former MoD UFO desk officer, has publicly endorsed elements of Warren's account, adding a degree of institutional credibility. However, Pope's endorsement has been contested by other researchers who point to the weight of evidence against Warren's reliability.\n\nASSESSMENT\n\nWarren's account must be assessed with significant caution. The Bustinza confirmation provides some support for his physical presence at Capel Green, but the broader credibility issues \u2014 co-author disavowal, other witnesses' rejection, pre-existing UFO interest, and absence from official documentation \u2014 make his specific claims difficult to accept without independent corroboration.\n\nThe Capel Green events remain among the most contested aspects of the Rendlesham case. A 2025 documentary, \"Capel Green,\" has revisited Warren's claims, but the fundamental credibility questions remain unresolved.\n\nSources: Warren & Robbins \"Left at East Gate\" (1997), Peter Robbins 2018 public statement (peterrobbinsny.com), Adrian Bustinza testimony, Nick Pope statements, Ian Ridpath analysis, \"Capel Green\" documentary (2025, IMDB).",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'low',
    status: 'approved',
    featured: false,
    location_name: 'Capel Green, Rendlesham Forest edge, Suffolk',
    location_description: 'Farmer\'s field at the edge of Rendlesham Forest where Warren claims a triangular craft landed on December 27-28, 1980',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0870,
    longitude: 1.4480,
    event_date: '1980-12-28',
    event_date_approximate: true,
    event_time: null,
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: 'Co-authored "Left at East Gate" (1997). Co-author Peter Robbins publicly disavowed book accuracy in 2018. Absent from original 1980 witness statements and Halt Memo. Presence at Capel Green confirmed by Sgt Adrian Bustinza but disputed by other military witnesses. Pre-existing interest in UFOs documented.',
    tags: ['rendlesham', 'larry-warren', 'capel-green', 'controversial', 'credibility-disputed', 'left-at-east-gate', 'peter-robbins', 'raf-bentwaters', 'entities', 'december-1980'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated low credibility. Warren is absent from all original 1980 documentation (witness statements and Halt Memo). His co-author Peter Robbins publicly disavowed the accuracy of their book \"Left at East Gate\" in 2018, citing \"falsehoods.\" Other military witnesses dispute his presence. While Sgt Bustinza confirms Warren was at Capel Green, the broader credibility issues \u2014 including pre-existing UFO interest and the co-author retraction \u2014 are substantial.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5. EDWARD CABANSAG \u2014 Target: 4,000+ chars
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: 'A1C Edward Cabansag \u2014 The First-Night Witness Who Identified the Lighthouse',
    slug: 'edward-cabansag-rendlesham-first-night-statement-1980',
    summary: 'Airman Edward Cabansag was part of the three-man patrol dispatched into Rendlesham Forest on the first night, December 26, 1980. His significance lies not in dramatic claims but in his original 1980 written statement \u2014 discovered in 1997 \u2014 in which he reported that after searching the forest for over an hour, the team concluded the lights came from a nearby lighthouse.',
    description: "Edward Cabansag may be the most important Rendlesham witness precisely because his testimony is the least dramatic.\n\nAirman Cabansag was the third member of the patrol dispatched from the East Gate of RAF Woodbridge into Rendlesham Forest at approximately 3:00 AM on December 26, 1980, alongside Staff Sergeant Jim Penniston and Airman First Class John Burroughs. While Penniston would later describe touching an alien craft and Burroughs would receive a government medical settlement, Cabansag's contribution to the case is of a different kind entirely: a contemporaneous written statement, made within days of the event, that contradicts the dramatic narratives that would emerge in subsequent decades.\n\nTHE ORIGINAL STATEMENT\n\nIn 1997, Scottish researcher James Easton discovered original first-night witness statements in files held by Citizens Against UFO Secrecy (CAUS) in Arizona. Among them was Cabansag's written account, produced in the days immediately following the encounter.\n\nCabansag's statement described the patrol entering the forest, pursuing unusual lights, and searching for over an hour. His conclusion was measured and specific: the lights came from a beacon at a nearby lighthouse. There was no mention of a landed craft, no description of physical contact with an object, and no suggestion of anything extraterrestrial.\n\nThe discovery of this statement was a watershed moment in Rendlesham research. Here was a written account from one of the three men who were actually in the forest on the first night \u2014 produced while memories were fresh and before the incident had become a celebrated UFO case \u2014 stating that the team identified the light source as a lighthouse.\n\nAdditionally, Burroughs' own original statement referenced seeing \"a beacon going around\" \u2014 language consistent with Cabansag's lighthouse identification and inconsistent with the close encounter described by Penniston in later years.\n\nTHE SIGNIFICANCE OF CONTEMPORANEOUS DOCUMENTATION\n\nThe Cabansag statement matters because of when it was written, not what it describes. In any investigation \u2014 military, legal, or historical \u2014 contemporaneous records are weighted more heavily than later recollections. Memories are malleable. Stories evolve. Social pressure, media attention, and the human tendency to construct coherent narratives from ambiguous experiences all shape how events are remembered.\n\nA statement written days after the event, before any of these pressures could operate, represents the closest available record to what the witness actually experienced and believed at the time. Cabansag's statement says lighthouse. Not craft. Not contact. Lighthouse.\n\nThis does not necessarily mean the other witnesses are fabricating. It is entirely possible that Penniston and Burroughs had different vantage points or experienced something that Cabansag did not perceive. But it does establish that at least one member of the first-night patrol, writing in the immediate aftermath, identified a mundane explanation.\n\nTHE ORFORDNESS LIGHTHOUSE\n\nThe lighthouse in question is the Orfordness Lighthouse, located on the coast due east of Rendlesham Forest. In 1980, it was one of the brightest lighthouses in the UK, rated at five million candelas, with a beam that rotated every five seconds. The lighthouse was clearly visible from within the forest, its beam sweeping through gaps in the trees.\n\nIan Ridpath's analysis demonstrated that the five-second flash rate matches precisely with the timing of light phenomena recorded on Halt's audio tape from the second night. Suffolk police officers who responded to the base's call on the first night independently identified the light as the lighthouse.\n\nThe lighthouse explanation does not require the witnesses to have been incompetent or dishonest. Rendlesham Forest is dense, dark, and disorienting at night. The airmen were Americans unfamiliar with the English countryside. They had been dispatched to investigate what they initially believed was a downed aircraft \u2014 a scenario that primes the observer for extraordinary rather than ordinary explanations. The rotating lighthouse beam, seen through moving trees on a cold winter night, created a genuinely unusual visual experience.\n\nWHERE IS CABANSAG NOW?\n\nCabansag has largely stayed out of public discussions of the Rendlesham incident. He has not written a book, given conference presentations, or pursued media attention. His contribution to the historical record consists almost entirely of his original 1980 statement \u2014 which may be the single most important document in the case, because it was written before the Rendlesham narrative was constructed.\n\nSources: Cabansag original 1980 witness statement (CAUS files, discovered by James Easton 1997), Ian Ridpath analysis (ianridpath.com/ufo/rendlesham2c.html), Orfordness Lighthouse specifications, Suffolk Constabulary first-night response documentation.",
    category: 'ufos_aliens',
    content_type: 'historical_case',
    credibility: 'medium',
    status: 'approved',
    featured: false,
    location_name: 'Rendlesham Forest, near East Gate, RAF Woodbridge',
    location_description: 'Part of the three-man patrol that entered Rendlesham Forest on the first night, December 26, 1980',
    state_province: 'Suffolk',
    country: 'United Kingdom',
    latitude: 52.0853,
    longitude: 1.4420,
    event_date: '1980-12-26',
    event_date_approximate: false,
    event_time: '03:00:00',
    witness_count: 1,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: true,
    evidence_summary: 'Original 1980 written statement discovered by James Easton in CAUS files (1997). Statement identifies the light source as a lighthouse beacon after over an hour of searching. No mention of craft, contact, or extraordinary phenomena. Contemporaneous documentation from within days of the event.',
    tags: ['rendlesham', 'edward-cabansag', 'first-night', 'lighthouse', 'orfordness', 'witness-statement', 'contemporaneous', 'skeptical-evidence', 'raf-woodbridge', 'december-1980', 'james-easton'],
    source_type: 'historical_archive',
    submitter_was_witness: false,
    anonymous_submission: false,
    upvotes: 0, downvotes: 0, view_count: 0,
    case_group: CASE_GROUP,
    credibility_rationale: 'Rated medium credibility. Cabansag\u2019s significance is as a first-night patrol member whose original 1980 written statement \u2014 produced days after the event, before any media attention \u2014 identified the forest lights as a lighthouse beacon. This contemporaneous documentation is weighted heavily in any historical analysis. His relative silence in subsequent decades, while limiting his testimony, also means his account has not been shaped by the pressures of the Rendlesham narrative.',
  },
];

// ─── Media ──────────────────────────────────────────────────────────────
var MEDIA: Array<{ slug: string; media_type: string; url: string; caption: string; is_primary: boolean }> = [
  // Showcase media
  {
    slug: 'the-rendlesham-forest-incident-december-1980-showcase',
    media_type: 'document',
    url: 'https://www.nicap.org/docs/810113_Halt_Memo.pdf',
    caption: 'The Halt Memo (January 13, 1981) \u2014 Official memorandum from Lt Col Charles Halt to the UK Ministry of Defence, titled "Unexplained Lights." Released under U.S. FOIA in 1983. The cornerstone document of the Rendlesham case.',
    is_primary: false,
  },
  {
    slug: 'the-rendlesham-forest-incident-december-1980-showcase',
    media_type: 'audio',
    url: 'https://commons.wikimedia.org/wiki/File:Rendelsham.ogg',
    caption: 'The Halt Audio Tape \u2014 Contemporaneous recording made by Lt Col Halt on a Lanier micro-cassette recorder during the December 28, 1980 forest investigation. Approximately 18 minutes of real-time field documentation including radiation readings and light descriptions.',
    is_primary: false,
  },
  // Halt report media
  {
    slug: 'charles-halt-rendlesham-memo-tape-1980',
    media_type: 'document',
    url: 'https://www.nicap.org/docs/810113_Halt_Memo.pdf',
    caption: 'The Halt Memo \u2014 Halt\u2019s official January 13, 1981 memorandum to the UK Ministry of Defence describing the events and physical evidence.',
    is_primary: false,
  },
  {
    slug: 'charles-halt-rendlesham-memo-tape-1980',
    media_type: 'audio',
    url: 'https://commons.wikimedia.org/wiki/File:Rendelsham.ogg',
    caption: 'The Halt Audio Tape \u2014 Real-time recording made during Halt\u2019s December 28, 1980 forest investigation, capturing radiation readings and descriptions of light phenomena.',
    is_primary: false,
  },
];

// ─── Books ──────────────────────────────────────────────────────────────
var BOOKS: Array<{ slug: string; title: string; author: string; amazon_asin: string; editorial_note: string; display_order: number }> = [
  // Showcase
  { slug: 'the-rendlesham-forest-incident-december-1980-showcase', title: 'Encounter in Rendlesham Forest', author: 'Nick Pope, John Burroughs & Jim Penniston', amazon_asin: '1250038103', editorial_note: 'The definitive account from two primary witnesses and the MoD\u2019s former UFO desk officer. Essential reading for the insider perspective.', display_order: 1 },
  { slug: 'the-rendlesham-forest-incident-december-1980-showcase', title: 'You Can\'t Tell the People', author: 'Georgina Bruni', amazon_asin: '033039021X', editorial_note: 'Bruni\u2019s investigative account drew on police, MoD, and military sources. The title comes from a reported remark by Margaret Thatcher. Prompted parliamentary debates.', display_order: 2 },
  { slug: 'the-rendlesham-forest-incident-december-1980-showcase', title: 'The Halt Perspective', author: 'Charles Halt & John Hanson', amazon_asin: '0957494491', editorial_note: 'Halt\u2019s own detailed account of the investigation, the evidence, and his assessment. Read alongside the original memo and audio tape.', display_order: 3 },
  // Penniston
  { slug: 'jim-penniston-rendlesham-craft-encounter-1980', title: 'Encounter in Rendlesham Forest', author: 'Nick Pope, John Burroughs & Jim Penniston', amazon_asin: '1250038103', editorial_note: 'Penniston\u2019s first-person account of touching the craft and the binary code revelation, co-written with Burroughs and Nick Pope.', display_order: 1 },
  // Burroughs
  { slug: 'john-burroughs-rendlesham-medical-settlement-1980', title: 'Encounter in Rendlesham Forest', author: 'Nick Pope, John Burroughs & Jim Penniston', amazon_asin: '1250038103', editorial_note: 'Burroughs\u2019 account of the encounters and the institutional response, including the fight for medical acknowledgment.', display_order: 1 },
  // Halt
  { slug: 'charles-halt-rendlesham-memo-tape-1980', title: 'The Halt Perspective', author: 'Charles Halt & John Hanson', amazon_asin: '0957494491', editorial_note: 'Halt\u2019s detailed first-person narrative of the second-night investigation, the radiation readings, and his evolution from skeptic to believer.', display_order: 1 },
  { slug: 'charles-halt-rendlesham-memo-tape-1980', title: 'You Can\'t Tell the People', author: 'Georgina Bruni', amazon_asin: '033039021X', editorial_note: 'Includes extensive analysis of the Halt Memo and the MoD\u2019s response to the official report.', display_order: 2 },
  // Warren
  { slug: 'larry-warren-rendlesham-capel-green-1980', title: 'Left at East Gate', author: 'Larry Warren & Peter Robbins', amazon_asin: '159605753X', editorial_note: 'The first full Rendlesham book from a witness perspective. Read with awareness that co-author Robbins publicly disavowed the book\u2019s accuracy in 2018.', display_order: 1 },
];

// ─── Featured Investigation ─────────────────────────────────────────────
var FEATURED_INVESTIGATION = {
  case_group: CASE_GROUP,
  title: 'The Rendlesham Forest Incident',
  subtitle: 'Britain\u2019s Roswell \u2014 Three Nights in a Suffolk Forest',
  editorial_blurb: 'Over three nights in December 1980, USAF personnel at a NATO twin base complex reported encounters with unidentified lights and a craft in Rendlesham Forest. The incident produced an official military memo, a real-time audio tape, radiation readings, and a government medical settlement \u2014 the most contemporaneous documentation of any UFO case in history.',
  hero_image_url: null,
  showcase_slug: 'the-rendlesham-forest-incident-december-1980-showcase',
  report_count: 6,
  category: 'ufos_aliens',
  location_label: 'Suffolk, England',
  date_label: 'December 1980',
  display_order: 2,
  is_active: true,
};

// ═══════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results: any = { reports: [], media: [], books: [], featured: null, links: [] };

  // Get phenomenon type for Notable Case (temporary, same as Roswell — to be replaced with proper type)
  var { data: notableCase } = await supabase.from('phenomenon_types')
    .select('id').eq('name', 'Notable Case').single();
  var phenomenonTypeId = notableCase ? notableCase.id : null;

  // ─── Step 1: Upsert Reports ──────────────────────────────────────────
  for (var i = 0; i < REPORTS.length; i++) {
    var report = REPORTS[i];
    var reportData: any = {
      title: report.title,
      slug: report.slug,
      summary: report.summary,
      description: report.description,
      category: report.category,
      content_type: report.content_type,
      credibility: report.credibility,
      status: report.status,
      featured: report.featured,
      location_name: report.location_name,
      location_description: report.location_description,
      state_province: report.state_province,
      country: report.country,
      latitude: report.latitude,
      longitude: report.longitude,
      event_date: report.event_date,
      event_date_approximate: report.event_date_approximate,
      event_time: report.event_time,
      witness_count: report.witness_count,
      has_physical_evidence: report.has_physical_evidence,
      has_photo_video: report.has_photo_video,
      has_official_report: report.has_official_report,
      evidence_summary: report.evidence_summary,
      tags: report.tags,
      source_type: report.source_type,
      submitter_was_witness: report.submitter_was_witness,
      anonymous_submission: report.anonymous_submission,
      upvotes: report.upvotes,
      downvotes: report.downvotes,
      view_count: report.view_count,
      case_group: report.case_group,
      credibility_rationale: report.credibility_rationale,
    };
    if (phenomenonTypeId) {
      reportData.phenomenon_type_id = phenomenonTypeId;
    }

    // Check if report exists
    var { data: existing } = await supabase.from('reports')
      .select('id').eq('slug', report.slug).single();

    if (existing) {
      var { error: updateErr } = await supabase.from('reports')
        .update(reportData).eq('slug', report.slug);
      results.reports.push({ slug: report.slug, status: updateErr ? 'UPDATE_ERROR: ' + updateErr.message : 'updated' });
    } else {
      var { error: insertErr } = await supabase.from('reports')
        .insert(reportData);
      results.reports.push({ slug: report.slug, status: insertErr ? 'INSERT_ERROR: ' + insertErr.message : 'inserted' });
    }
  }

  // ─── Step 2: Link witness reports to showcase ─────────────────────────
  var { data: showcaseReport } = await supabase.from('reports')
    .select('id').eq('slug', 'the-rendlesham-forest-incident-december-1980-showcase').single();

  if (showcaseReport) {
    var witnessSlugs = REPORTS.filter(function(r) { return r.slug !== 'the-rendlesham-forest-incident-december-1980-showcase'; }).map(function(r) { return r.slug; });
    for (var w = 0; w < witnessSlugs.length; w++) {
      var { data: witnessReport } = await supabase.from('reports')
        .select('id').eq('slug', witnessSlugs[w]).single();
      if (witnessReport) {
        // Check if link exists
        var { data: existingLink } = await supabase.from('report_links')
          .select('id')
          .eq('source_report_id', showcaseReport.id)
          .eq('target_report_id', witnessReport.id)
          .eq('link_type', 'witness_account')
          .single();
        if (!existingLink) {
          var { error: linkErr } = await supabase.from('report_links').insert({
            source_report_id: showcaseReport.id,
            target_report_id: witnessReport.id,
            link_type: 'witness_account',
          });
          results.links.push({ witness: witnessSlugs[w], status: linkErr ? 'ERROR: ' + linkErr.message : 'linked' });
        } else {
          results.links.push({ witness: witnessSlugs[w], status: 'already_linked' });
        }
      }
    }
  }

  // ─── Step 3: Add Media ────────────────────────────────────────────────
  for (var m = 0; m < MEDIA.length; m++) {
    var media = MEDIA[m];
    var { data: mediaReport } = await supabase.from('reports')
      .select('id').eq('slug', media.slug).single();
    if (mediaReport) {
      // Check if media already exists
      var { data: existingMedia } = await supabase.from('report_media')
        .select('id').eq('report_id', mediaReport.id).eq('url', media.url).single();
      if (!existingMedia) {
        var { error: mediaErr } = await supabase.from('report_media').insert({
          report_id: mediaReport.id,
          media_type: media.media_type,
          url: media.url,
          caption: media.caption,
          is_primary: media.is_primary,
        });
        results.media.push({ slug: media.slug, type: media.media_type, status: mediaErr ? 'ERROR: ' + mediaErr.message : 'inserted' });
      } else {
        results.media.push({ slug: media.slug, type: media.media_type, status: 'already_exists' });
      }
    }
  }

  // ─── Step 4: Add Books ────────────────────────────────────────────────
  for (var b = 0; b < BOOKS.length; b++) {
    var book = BOOKS[b];
    var { data: bookReport } = await supabase.from('reports')
      .select('id').eq('slug', book.slug).single();
    if (bookReport) {
      // Check if book already exists
      var { data: existingBook } = await supabase.from('report_books')
        .select('id').eq('report_id', bookReport.id).eq('amazon_asin', book.amazon_asin).single();
      if (!existingBook) {
        var { error: bookErr } = await supabase.from('report_books').insert({
          report_id: bookReport.id,
          title: book.title,
          author: book.author,
          amazon_asin: book.amazon_asin,
          cover_image_url: null,
          editorial_note: book.editorial_note,
          display_order: book.display_order,
        });
        results.books.push({ slug: book.slug, asin: book.amazon_asin, status: bookErr ? 'ERROR: ' + bookErr.message : 'inserted' });
      } else {
        results.books.push({ slug: book.slug, asin: book.amazon_asin, status: 'already_exists' });
      }
    }
  }

  // ─── Step 5: Add Featured Investigation ───────────────────────────────
  var { data: existingFeatured } = await supabase.from('featured_investigations')
    .select('id').eq('case_group', CASE_GROUP).single();
  if (!existingFeatured) {
    var { error: featErr } = await supabase.from('featured_investigations')
      .insert(FEATURED_INVESTIGATION);
    results.featured = featErr ? 'ERROR: ' + featErr.message : 'inserted';
  } else {
    var { error: featUpdErr } = await supabase.from('featured_investigations')
      .update(FEATURED_INVESTIGATION).eq('case_group', CASE_GROUP);
    results.featured = featUpdErr ? 'UPDATE_ERROR: ' + featUpdErr.message : 'updated';
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  var reportSuccess = results.reports.filter(function(r: any) { return r.status === 'inserted' || r.status === 'updated'; }).length;
  var mediaSuccess = results.media.filter(function(r: any) { return r.status === 'inserted' || r.status === 'already_exists'; }).length;
  var bookSuccess = results.books.filter(function(r: any) { return r.status === 'inserted' || r.status === 'already_exists'; }).length;
  var linkSuccess = results.links.filter(function(r: any) { return r.status === 'linked' || r.status === 'already_linked'; }).length;

  return res.status(200).json({
    summary: {
      reports: reportSuccess + '/' + REPORTS.length,
      media: mediaSuccess + '/' + MEDIA.length,
      books: bookSuccess + '/' + BOOKS.length,
      links: linkSuccess + '/' + (REPORTS.length - 1),
      featured: results.featured,
    },
    details: results,
  });
}
