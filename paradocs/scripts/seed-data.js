/**
 * ParaDocs Seed Data Script
 *
 * This script populates the database with sample paranormal reports
 * for testing and demonstration purposes.
 *
 * Usage: node scripts/seed-data.js
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Sample data - famous and well-documented cases
const sampleReports = [
  // UFO/UAP Cases
  {
    title: "Phoenix Lights Mass Sighting",
    slug: "phoenix-lights-mass-sighting-1997",
    category: "ufo_uap",
    summary: "Thousands of witnesses observed a V-shaped formation of lights over Phoenix, Arizona, in one of the most witnessed UFO events in history.",
    description: `On March 13, 1997, thousands of people across Nevada, Arizona, and the Mexican state of Sonora reported seeing a massive V-shaped or triangular formation of lights in the night sky.

The event occurred in two distinct phases. The first sighting, around 7:30 PM, involved a large V-shaped object with lights passing overhead, described as being up to a mile wide. Witnesses reported the object moved silently and blocked out the stars as it passed.

The second phase, around 10 PM, involved a series of stationary lights that appeared over the Phoenix area. These were later attributed by the Air Force to flares dropped during a training exercise at the Barry Goldwater Range.

However, many witnesses maintain that the earlier V-shaped object was distinctly different from the later lights and could not have been military flares. Former Arizona Governor Fife Symington, who initially mocked the sighting, later admitted he had also witnessed the object and found it unexplainable.

The Phoenix Lights remain one of the most significant mass UFO sightings in American history, with witnesses ranging from ordinary citizens to pilots and law enforcement officers.`,
    location_name: "Phoenix, Arizona",
    country: "United States",
    state_province: "Arizona",
    city: "Phoenix",
    latitude: 33.4484,
    longitude: -112.0740,
    event_date: "1997-03-13",
    event_time: "19:30:00",
    witness_count: 10000,
    credibility: "high",
    has_photo_video: true,
    has_official_report: true,
    featured: true,
    source_type: "historical",
    tags: ["mass sighting", "v-shaped", "lights", "arizona", "1990s"],
    status: "approved",
  },
  {
    title: "Rendlesham Forest Incident",
    slug: "rendlesham-forest-incident-1980",
    category: "ufo_uap",
    summary: "U.S. Air Force personnel stationed at RAF Woodbridge witnessed unexplained lights and a triangular craft in Rendlesham Forest, often called 'Britain's Roswell'.",
    description: `In late December 1980, a series of unexplained events occurred in Rendlesham Forest, Suffolk, England, near the twin NATO air bases RAF Bentwaters and RAF Woodbridge, which were being used by the United States Air Force.

On December 26, 1980, around 3:00 AM, security personnel observed unusual lights descending into the forest. Staff Sergeant Jim Penniston and Airman John Burroughs were dispatched to investigate. Penniston reported approaching a triangular craft about 3 meters tall and 3 meters wide at its base, covered in strange symbols. He claimed to have touched the craft and received a mental download of binary code.

Two nights later, Deputy Base Commander Lieutenant Colonel Charles Halt led a larger group into the forest after more reports. Halt recorded his observations on a portable tape recorder, documenting anomalous lights, radiation readings three times normal levels, and impressions in the ground where the craft had reportedly landed.

The incident has been corroborated by multiple military witnesses and is supported by official documentation, including Halt's memo to the UK Ministry of Defence. It remains one of the best-documented and most credible UFO cases involving military personnel.`,
    location_name: "Rendlesham Forest, Suffolk",
    country: "United Kingdom",
    state_province: "Suffolk",
    city: "Woodbridge",
    latitude: 52.0836,
    longitude: 1.4392,
    event_date: "1980-12-26",
    event_time: "03:00:00",
    witness_count: 80,
    credibility: "high",
    has_physical_evidence: true,
    has_official_report: true,
    featured: true,
    source_type: "historical",
    tags: ["military", "triangular", "forest", "uk", "1980s", "binary code"],
    status: "approved",
  },
  {
    title: "USS Nimitz Tic Tac Encounter",
    slug: "uss-nimitz-tic-tac-encounter-2004",
    category: "ufo_uap",
    summary: "Navy pilots from the USS Nimitz encountered a white, oblong 'Tic Tac' shaped object exhibiting extraordinary flight characteristics off the coast of San Diego.",
    description: `On November 14, 2004, the USS Princeton, part of the USS Nimitz Carrier Strike Group, detected multiple anomalous aerial vehicles on radar during training exercises off the coast of San Diego.

Commander David Fravor and Lieutenant Commander Alex Dietrich were vectored to investigate. They observed a white, oblong object approximately 40 feet long, shaped like a Tic Tac breath mint, hovering over a disturbance in the water.

According to Fravor, the object had no visible means of propulsion - no wings, rotors, exhaust, or flight surfaces. When Fravor descended to investigate, the object rapidly ascended and matched his altitude, then accelerated away at speeds that appeared to defy known physics.

A second aircraft piloted by Chad Underwood captured the object on infrared video, which was later released by the Pentagon and became known as the "FLIR1" or "Tic Tac" video.

The incident was investigated as part of the Advanced Aerospace Threat Identification Program (AATIP). In 2020, the Pentagon officially released the videos and confirmed their authenticity. The encounter remains unexplained and is considered one of the most significant military UFO encounters in recent history.`,
    location_name: "Pacific Ocean, off San Diego",
    country: "United States",
    state_province: "California",
    latitude: 31.0000,
    longitude: -117.0000,
    event_date: "2004-11-14",
    event_time: "14:00:00",
    witness_count: 6,
    credibility: "confirmed",
    has_photo_video: true,
    has_official_report: true,
    featured: true,
    source_type: "historical",
    tags: ["military", "navy", "tic tac", "infrared", "2000s", "pentagon"],
    status: "approved",
  },

  // Cryptid Cases
  {
    title: "Patterson-Gimlin Bigfoot Film",
    slug: "patterson-gimlin-bigfoot-film-1967",
    category: "cryptid",
    summary: "Roger Patterson and Bob Gimlin captured the most famous and controversial footage of an alleged Bigfoot creature at Bluff Creek, California.",
    description: `On October 20, 1967, Roger Patterson and Bob Gimlin were horseback riding in the area around Bluff Creek, California, searching for evidence of Bigfoot when they encountered and filmed what they claimed was a female Sasquatch.

The creature, often referred to as "Patty," is seen walking away from the camera, turning to look back briefly before disappearing into the forest. The footage shows a large, hair-covered bipedal figure with apparent female anatomy.

The film has been analyzed extensively by both skeptics and believers. Proponents point to the creature's proportions, gait, and muscle movement as evidence of authenticity, arguing these would be impossible to replicate with 1967 costume technology.

Critics argue the footage shows a person in a suit, though no one has successfully replicated the film's characteristics. Bob Gimlin has maintained his account for over 50 years and continues to speak at Bigfoot conferences.

The approximately one minute of 16mm color footage remains the most analyzed piece of cryptid evidence in history and continues to be debated by researchers, anthropologists, and special effects experts.`,
    location_name: "Bluff Creek, Six Rivers National Forest",
    country: "United States",
    state_province: "California",
    city: "Orleans",
    latitude: 41.4472,
    longitude: -123.6539,
    event_date: "1967-10-20",
    event_time: "13:15:00",
    witness_count: 2,
    credibility: "medium",
    has_photo_video: true,
    featured: true,
    source_type: "historical",
    tags: ["bigfoot", "sasquatch", "film", "california", "1960s", "iconic"],
    status: "approved",
  },
  {
    title: "Point Pleasant Mothman Sightings",
    slug: "point-pleasant-mothman-sightings-1966",
    category: "cryptid",
    summary: "Multiple witnesses in Point Pleasant, West Virginia, reported encounters with a large winged humanoid creature with glowing red eyes, known as the Mothman.",
    description: `Between November 1966 and December 1967, numerous residents of Point Pleasant, West Virginia, and the surrounding area reported encounters with a large, winged humanoid creature with glowing red eyes.

The first widely publicized sighting occurred on November 15, 1966, when two young couples reported being chased by a "large flying man with ten-foot wings" near an abandoned munitions factory known as the "TNT area." They described the creature as gray, larger than a man, with large reflective red eyes.

Over the following months, over 100 people reported similar encounters. Witnesses consistently described a tall (6-7 feet), gray creature with large wings folded against its back and hypnotic, glowing red eyes. Many reported that it could fly without flapping its wings.

The sightings coincided with reports of UFOs, men in black, and other paranormal phenomena in the area. The encounters ended abruptly after the Silver Bridge collapse on December 15, 1967, which killed 46 people. Some speculate the Mothman was a harbinger of the disaster.

The events were chronicled in John Keel's book "The Mothman Prophecies" and later adapted into a 2002 film. Point Pleasant now hosts an annual Mothman Festival and features a Mothman statue and museum.`,
    location_name: "Point Pleasant, West Virginia",
    country: "United States",
    state_province: "West Virginia",
    city: "Point Pleasant",
    latitude: 38.8445,
    longitude: -82.1371,
    event_date: "1966-11-15",
    witness_count: 100,
    credibility: "medium",
    featured: true,
    source_type: "historical",
    tags: ["mothman", "winged creature", "red eyes", "west virginia", "1960s"],
    status: "approved",
  },
  {
    title: "Loch Ness Monster - Surgeon's Photograph",
    slug: "loch-ness-surgeon-photograph-1934",
    category: "cryptid",
    summary: "The famous 'Surgeon's Photograph' purportedly showing the Loch Ness Monster's head and neck became the most iconic image of Nessie, though later revealed as a hoax.",
    description: `On April 21, 1934, the Daily Mail published a photograph allegedly taken by London surgeon Robert Kenneth Wilson, showing what appeared to be a long neck and small head protruding from the waters of Loch Ness, Scotland.

The image became the most famous photograph of the Loch Ness Monster and shaped public perception of "Nessie" for decades. Wilson refused to have his name associated with the photo, leading to its designation as "the Surgeon's Photograph."

The photograph appeared to show a plesiosaur-like creature, reinforcing theories that Nessie might be a surviving prehistoric marine reptile. It sparked increased interest in the Loch Ness phenomenon and inspired numerous expeditions.

In 1994, Christian Spurling, on his deathbed, confessed that the photograph was a hoax orchestrated by his stepfather, Marmaduke Wetherell. The "monster" was actually a toy submarine with a sculpted head attached. Wetherell had been humiliated after the Daily Mail discovered that "Nessie footprints" he had found were actually made with a hippo-foot umbrella stand.

Despite the photo's debunking, Loch Ness Monster sightings continue to be reported, and the legend remains one of the most enduring cryptid mysteries in the world.`,
    location_name: "Loch Ness, Scottish Highlands",
    country: "United Kingdom",
    state_province: "Scotland",
    latitude: 57.3229,
    longitude: -4.4244,
    event_date: "1934-04-21",
    witness_count: 1,
    credibility: "low",
    has_photo_video: true,
    source_type: "historical",
    tags: ["loch ness", "nessie", "lake monster", "scotland", "1930s", "hoax"],
    status: "approved",
  },

  // Ghost/Haunting Cases
  {
    title: "Enfield Poltergeist Case",
    slug: "enfield-poltergeist-case-1977",
    category: "ghost_haunting",
    summary: "One of the most documented poltergeist cases in history, involving the Hodgson family in Enfield, England, with events witnessed by police, journalists, and investigators.",
    description: `The Enfield Poltergeist case began in August 1977 at a council house in Enfield, north London, occupied by Peggy Hodgson and her four children. The activity centered on 11-year-old Janet and her 13-year-old brother Johnny.

Events began with knocking sounds and furniture moving on its own. A police constable, WPC Carolyn Heeps, witnessed a chair slide across the floor by itself and signed an affidavit attesting to the phenomenon.

Investigators Maurice Grosse and Guy Lyon Playfair of the Society for Psychical Research documented the case over 18 months. They recorded over 2,000 incidents including levitation, objects thrown with trajectory changes mid-flight, pools of water appearing, equipment malfunctions, and cold spots.

Most notably, Janet allegedly became possessed by the spirit of Bill Wilkins, a man who had died in the house years earlier. She spoke in a deep, gravelly male voice, sometimes for hours, in a manner ventriloquists stated would be physically impossible for a child.

Some incidents were found to be faked when Janet and her sister were caught bending spoons and attempting to bend an iron bar. However, investigators maintained that much of the activity remained unexplained and was witnessed by dozens of credible observers including journalists, police, and neighbors.

The case inspired the 2016 film "The Conjuring 2."`,
    location_name: "284 Green Street, Enfield",
    country: "United Kingdom",
    state_province: "Greater London",
    city: "Enfield",
    latitude: 51.6538,
    longitude: -0.0799,
    event_date: "1977-08-31",
    witness_count: 30,
    credibility: "high",
    has_photo_video: true,
    has_official_report: true,
    featured: true,
    source_type: "historical",
    tags: ["poltergeist", "possession", "uk", "1970s", "investigated"],
    status: "approved",
  },
  {
    title: "Bell Witch Haunting",
    slug: "bell-witch-haunting-1817",
    category: "ghost_haunting",
    summary: "The Bell Witch is considered one of the most famous hauntings in American history, tormenting the Bell family of Tennessee from 1817 to 1821.",
    description: `The Bell Witch haunting occurred from 1817 to 1821 at the Bell family farm in Robertson County, Tennessee. The events allegedly began when John Bell encountered a strange creature in his cornfield, described as having the body of a dog and the head of a rabbit.

Soon after, the family experienced knocking and scratching sounds, invisible forces pulling at bedcovers, and physical attacks on family members, particularly John Bell and his daughter Betsy. The entity could speak, initially in whispers and eventually in a full voice, and identified itself with various names including "Kate."

The haunting attracted widespread attention. General Andrew Jackson, future President of the United States, allegedly visited the Bell farm to investigate. According to legend, his wagon wheels became stuck and would not move until the witch gave permission.

The entity showed particular hostility toward John Bell, reportedly vowing to kill him. In December 1820, John Bell was found in a comatose state and died the next day. A strange vial of liquid was found near his bed; when given to the family cat, the animal died instantly.

The Bell Witch promised to return in 1935, though reports of her return were not substantiated. The Bell Witch Cave, located on the former Bell property, remains a tourist attraction and is said to still be haunted.`,
    location_name: "Adams, Robertson County, Tennessee",
    country: "United States",
    state_province: "Tennessee",
    city: "Adams",
    latitude: 36.5600,
    longitude: -87.0628,
    event_date: "1817-06-01",
    witness_count: 50,
    credibility: "medium",
    source_type: "historical",
    tags: ["witch", "poltergeist", "tennessee", "1800s", "american folklore"],
    status: "approved",
  },

  // Unexplained Events
  {
    title: "Dyatlov Pass Incident",
    slug: "dyatlov-pass-incident-1959",
    category: "unexplained_event",
    summary: "Nine hikers died under mysterious circumstances in the Ural Mountains, their tent cut from the inside, bodies found scattered, some with unexplained injuries.",
    description: `In February 1959, a group of nine experienced hikers led by Igor Dyatlov set out on a ski trek in the northern Ural Mountains of Soviet Russia. When they failed to return, search parties discovered their tent on February 26, cut open from the inside. The hikers had fled into the freezing night inadequately dressed.

The bodies were found over the following months in two groups. Some showed signs of hypothermia, but others had injuries inconsistent with natural causes. Two victims had major chest fractures comparable to those caused by car crashes, but with no external wounds. One woman was missing her tongue, eyes, part of her lips, and a fragment of skull bone.

The Soviet investigation concluded that an "unknown compelling force" had caused the deaths. Various theories have been proposed including avalanche, military testing, indigenous Mansi people, and even yeti attack.

Modern investigations have suggested a delayed avalanche or slab avalanche could explain the events - the tent was pitched on a slope that could have released snow, forcing evacuation. However, this theory doesn't fully explain the unusual injuries or the reported orange spheres seen in the sky that night by other hikers.

The area was named Dyatlov Pass after the incident and remained closed to visitors for years. The case was officially reopened in 2019 by Russian authorities.`,
    location_name: "Dyatlov Pass, Ural Mountains",
    country: "Russia",
    state_province: "Sverdlovsk Oblast",
    latitude: 61.7544,
    longitude: 59.4550,
    event_date: "1959-02-02",
    witness_count: 9,
    credibility: "high",
    has_official_report: true,
    featured: true,
    source_type: "historical",
    tags: ["mystery", "death", "russia", "1950s", "unsolved", "cold war"],
    status: "approved",
  },
  {
    title: "Tunguska Event",
    slug: "tunguska-event-1908",
    category: "unexplained_event",
    summary: "A massive explosion flattened 2,000 square kilometers of Siberian forest, with the energy of 1,000 Hiroshima bombs, yet left no impact crater.",
    description: `On June 30, 1908, at approximately 7:17 AM local time, an enormous explosion occurred near the Podkamennaya Tunguska River in Siberia, Russia. The blast flattened an estimated 80 million trees over an area of 2,150 square kilometers.

The explosion is estimated to have had an energy equivalent of 10-15 megatons of TNT, roughly 1,000 times more powerful than the atomic bomb dropped on Hiroshima. The shock wave registered on seismic stations across Eurasia and barometric sensors detected atmospheric pressure changes as far away as England.

Eyewitnesses described a bright blue light moving across the sky, followed by a flash and explosion that knocked people off their feet hundreds of kilometers away. For several nights afterward, the skies over Europe and Asia were bright enough to read by.

Despite the magnitude of the event, no impact crater was ever found. The first scientific expedition to the site in 1927 discovered trees knocked flat in a radial pattern, but standing trees at ground zero with their branches stripped.

The most widely accepted explanation is that a meteor or comet fragment 50-80 meters in diameter exploded in the atmosphere 5-10 kilometers above the surface, creating an airburst. However, some researchers have proposed alternative theories including antimatter, a natural nuclear explosion, or even an alien spacecraft malfunction.`,
    location_name: "Tunguska River Basin, Siberia",
    country: "Russia",
    state_province: "Krasnoyarsk Krai",
    latitude: 60.8860,
    longitude: 101.8940,
    event_date: "1908-06-30",
    event_time: "07:17:00",
    witness_count: 1000,
    credibility: "confirmed",
    has_physical_evidence: true,
    source_type: "historical",
    tags: ["explosion", "siberia", "meteor", "1900s", "mystery"],
    status: "approved",
  },

  // Mystery Locations
  {
    title: "Bermuda Triangle Disappearance - Flight 19",
    slug: "bermuda-triangle-flight-19-1945",
    category: "mystery_location",
    summary: "Five TBM Avenger torpedo bombers vanished during a training flight over the Bermuda Triangle, followed by one of the search planes, sparking enduring mystery.",
    description: `On December 5, 1945, five TBM Avenger torpedo bombers departed from Fort Lauderdale Naval Air Station for a routine training mission over the Bahamas. The flight, designated Flight 19, consisted of 14 crew members led by experienced pilot Lieutenant Charles Taylor.

Approximately 90 minutes into the flight, Taylor reported that both of his compasses had failed and he could not determine his position. Radio transmissions indicated increasing confusion about their location, with Taylor apparently believing they were over the Gulf of Mexico rather than the Atlantic.

The last transmission from Flight 19 was received at 7:04 PM: "All planes close up tight... will have to ditch unless landfall... when the first plane drops below 10 gallons, we all go down together."

Despite extensive searches, no trace of Flight 19 was ever found. Furthermore, one of the search planes - a PBM Mariner with 13 crew - also disappeared during the search. A merchant ship reported witnessing an explosion in the air, but no wreckage was recovered.

The incident became foundational to the Bermuda Triangle legend. Official investigations attributed the loss to Taylor becoming disoriented and the aircraft running out of fuel over the ocean. However, the complete absence of debris and the additional loss of the search plane have kept speculation alive.`,
    location_name: "Bermuda Triangle, Atlantic Ocean",
    country: "United States",
    latitude: 25.0000,
    longitude: -71.0000,
    event_date: "1945-12-05",
    event_time: "14:10:00",
    witness_count: 27,
    credibility: "confirmed",
    has_official_report: true,
    source_type: "historical",
    tags: ["bermuda triangle", "disappearance", "aircraft", "navy", "1940s"],
    status: "approved",
  },

  // More recent reports
  {
    title: "Tic Tac UFO - East Coast Encounter",
    slug: "tic-tac-ufo-east-coast-2015",
    category: "ufo_uap",
    summary: "Navy pilots operating from USS Theodore Roosevelt captured multiple UFO encounters on video, later released by the Pentagon as the 'GIMBAL' and 'GOFAST' footage.",
    description: `Between 2014 and 2015, Navy pilots from Fighter Squadron VFA-11 "Red Rippers" operating from the USS Theodore Roosevelt reported frequent encounters with unidentified aerial phenomena off the eastern seaboard of the United States.

The objects, similar to those encountered by the USS Nimitz group in 2004, displayed extraordinary flight characteristics. Pilot Ryan Graves reported that the objects were detected "every day for at least a couple years" and could remain stationary in high winds, accelerate to hypersonic speeds, and make instant directional changes.

Two videos from these encounters were later released by the Pentagon. The "GIMBAL" video shows an object rotating in mid-air while traveling against the wind. The "GOFAST" video shows a small object moving at high speed low over the water.

Lieutenant Danny Accoin reported that his radar had locked onto an object and received a return indicating something solid, but when he approached the coordinates, he could see nothing - yet his radar still showed the object present.

These encounters led to new Navy guidelines for reporting UAP sightings and contributed to Congressional hearings on the phenomenon. The pilots involved have gone on record emphasizing that the objects were neither conventional aircraft nor known drones.`,
    location_name: "Atlantic Ocean, East Coast",
    country: "United States",
    state_province: "Virginia",
    latitude: 36.8500,
    longitude: -75.9780,
    event_date: "2015-01-21",
    witness_count: 12,
    credibility: "confirmed",
    has_photo_video: true,
    has_official_report: true,
    source_type: "historical",
    tags: ["navy", "gimbal", "gofast", "pentagon", "2010s"],
    status: "approved",
  },
  {
    title: "Skinwalker Ranch Phenomena",
    slug: "skinwalker-ranch-phenomena",
    category: "mystery_location",
    summary: "A Utah ranch has been the site of numerous reported paranormal events including UFO sightings, animal mutilations, poltergeist activity, and cryptid encounters.",
    description: `Skinwalker Ranch, a 512-acre property in Utah's Uintah Basin, has been associated with paranormal activity since at least the 1950s. The Ute tribe has long considered the area cursed, associating it with the skinwalker of Navajo legend.

The ranch gained wider attention when the Sherman family purchased it in 1994 and reported ongoing bizarre phenomena: cattle mutilations, crop circles, poltergeist activity, sightings of large wolves and other unknown creatures, disembodied voices, and frequent UFO sightings.

In 1996, Robert Bigelow's National Institute for Discovery Science (NIDS) purchased the property for scientific study. Over seven years, researchers documented numerous anomalies but reported that phenomena seemed to respond to observation - intensifying when researchers were present but occurring unpredictably.

NIDS scientists reported seeing large orangish circular objects, blue orbs, and a "hole in the sky" from which a large black triangular object emerged. Cattle continued to be found mutilated with surgical precision.

In 2016, the ranch was sold to aerospace entrepreneur Brandon Fugal, who has continued research and hosts the TV series "The Secret of Skinwalker Ranch." Modern investigations using advanced sensors continue to record anomalous electromagnetic phenomena, radiation spikes, and unexplained aerial activity.`,
    location_name: "Skinwalker Ranch, Uintah Basin",
    country: "United States",
    state_province: "Utah",
    city: "Ballard",
    latitude: 40.2588,
    longitude: -109.8880,
    witness_count: 100,
    credibility: "medium",
    has_photo_video: true,
    has_physical_evidence: true,
    featured: true,
    source_type: "historical",
    tags: ["ranch", "utah", "portal", "ufo", "cryptid", "investigated"],
    status: "approved",
  },
]

async function seedDatabase() {
  console.log('Starting database seed...')

  // Get phenomenon types for mapping
  const { data: phenomenonTypes, error: typesError } = await supabase
    .from('phenomenon_types')
    .select('*')

  if (typesError) {
    console.error('Error fetching phenomenon types:', typesError)
    return
  }

  console.log(`Found ${phenomenonTypes?.length || 0} phenomenon types`)

  // Insert reports
  for (const report of sampleReports) {
    // Find matching phenomenon type if possible
    const matchingType = phenomenonTypes?.find(t =>
      t.category === report.category &&
      report.title.toLowerCase().includes(t.name.toLowerCase())
    )

    const reportData = {
      ...report,
      phenomenon_type_id: matchingType?.id || null,
    }

    const { data, error } = await supabase
      .from('reports')
      .upsert(reportData, { onConflict: 'slug' })
      .select()

    if (error) {
      console.error(`Error inserting "${report.title}":`, error.message)
    } else {
      console.log(`✓ Inserted: ${report.title}`)
    }
  }

  console.log('\nSeed completed!')
  console.log(`Total reports processed: ${sampleReports.length}`)
}

seedDatabase().catch(console.error)
