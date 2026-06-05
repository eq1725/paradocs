# Custom Watchlists — quality smoke (V11.17.72)

Generated: 2026-06-04T23:14:07.025Z
Engine: src/lib/lab/watchlists/match-engine.ts

## Summary

| # | Watchlist | Hits | Threshold | Duration (ms) | Status |
|---|---|---:|---:|---:|---|
| 1 | Triangle UFOs anywhere | 292 | 0.5 | 906 | OK |
| 2 | Disc / saucer UFOs | 189 | 0.5 | 803 | OK |
| 3 | Texas-only UFOs | 896 | 0.7 | 547 | OK |
| 4 | 1990s UFO reports | 464 | 0.7 | 452 | OK |
| 5 | Cryptid sightings — Bigfoot vocalizations | 760 | 0.5 | 783 | OK |
| 6 | Apparitions in California | 806 | 0.7 | 579 | OK |
| 7 | Missing-time accounts (any family) | 8 | 0.5 | 848 | OK |
| 8 | Sleep-paralysis pattern (shadow + paralysis) | 568 | 0.5 | 911 | OK |
| 9 | Witness count ≥ 2 cryptid reports | 560 | 0.6 | 968 | OK |
| 10 | Orb UFOs 2020-present | 631 | 0.5 | 701 | OK |

## Precision check — eyeball each sample for false positives

Per PRO_TIER_VALIDATION_V3 §8.3, target ≥95% precision (almost no false-positives).

### 1. Triangle UFOs anywhere

- **Criteria:** `{"phen_family":["ufos_aliens"],"descriptors_any":["craft_shape_triangle"]}`
- **Threshold:** 0.5
- **Hits:** 292
- **Expected:** Hundreds of triangle UFO reports across the Archive; expect every match to be UFO-tagged AND mention triangle/V-formation/boomerang.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | White Triangle with Red Center Lights Hovers Over Cornfield | ufos_aliens | Missouri | 2024 | 100% | ufo, nuforc, triangle, triangular |
| 2 | Triangle of Lights Crosses Gulf Near Panama City Beach | ufos_aliens | Florida | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 3 | Silent Triangle Craft Passes Over Littleton Apartment | ufos_aliens | Colorado | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 4 | Orange Star-Like Object Pivots Over Belvidere | ufos_aliens | Illinois | 2025 | 100% | ufo, nuforc, star, point-light |
| 5 | Disc-Shaped Object Performs Aerial Maneuvers Over Concrete | ufos_aliens | Washington | 2025 | 100% | ufo, nuforc, other, bright |
| 6 | Rhombus Object Zips Over Field in North Salem | ufos_aliens | New York | 2025 | 100% | ufo, nuforc, chevron, v-shaped |
| 7 | Triangular Object With Blinking Lights Over Chennai | ufos_aliens | Tamil Nadu | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 8 | Four Purple Egg-Shaped Objects Over Wynnum | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, egg, oval |
| 9 | Triangle Ship Emerges From Fireball Over Wyrzysk | ufos_aliens | Greater Poland Voivodeship | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 10 | Orb Transforms Into Triangle Formation Over Capalaba | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, light, lights |
| 11 | Triangle of Colored Lights Over Gates, New York | ufos_aliens | New York | 2025 | 100% | ufo, nuforc, other |
| 12 | Geometric Light Formation Over Albion, Idaho | ufos_aliens | Idaho | 2025 | 100% | ufo, nuforc, light, lights |
| 13 | Asymmetrical Red Chevron Over Lehigh Mountain Range | ufos_aliens | Pennsylvania | 2025 | 100% | ufo, nuforc, chevron, v-shaped |
| 14 | Lights Maneuver in Halifax Sky in Erratic Formation | ufos_aliens | Nova Scotia | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 15 | Triangle Formation and Blue Craft Over Mississauga | ufos_aliens | Ontario | 2025 | 100% | ufo, nuforc, rectangle, rectangular |
| 16 | Three White Lights in Rigid Triangle Formation, Fullerton | ufos_aliens | California | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 17 | Orbs and Silent Triangles Over Kentucky Lake | ufos_aliens | Kentucky | 2025 | 100% | ufo, nuforc, orb, spherical |
| 18 | Glowing White Triangle Fades Over Connecticut | ufos_aliens | Connecticut | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 19 | Black Triangle Passes Over Covington, Georgia | ufos_aliens | Georgia | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 20 | Triangle With Corner Lights Over Pueblo, Colorado | ufos_aliens | Colorado | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 21 | Black Triangle Hovers Above Melbourne House | ufos_aliens | Arkansas | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 22 | Black Triangle Craft Skims Treetops Over Topeka | ufos_aliens | Kansas | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 23 | Matte Black Pyramid Hovers at Window in Manhattan | ufos_aliens | New York | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 24 | Black Triangle Hovers Over Manitoba Highway at Treetop Height | ufos_aliens | Manitoba | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 25 | Part Circle, Part Triangle Vanishes Into Light Over Anchorage | ufos_aliens | Alaska | 2025 | 100% | ufo, nuforc, unknown |

### 2. Disc / saucer UFOs

- **Criteria:** `{"phen_family":["ufos_aliens"],"descriptors_any":["craft_shape_disc"]}`
- **Threshold:** 0.5
- **Hits:** 189
- **Expected:** Should surface NUFORC disc/saucer reports.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | 12-Foot Orange Orb Follows Car Through North Charleston | ufos_aliens | South Carolina | 2024 | 100% | ufo, nuforc, orb, spherical |
| 2 | Bright Circle Vanishes at Incredible Speed Over Queensland | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, circle, circular |
| 3 | Hairless Five-Foot Being Enters Disc Craft in Key Largo | ufos_aliens | Florida | 2025 | 100% | ufo, nuforc, disk, disc |
| 4 | White Disc Hovers Over Treeline in Broad Daylight | ufos_aliens | Maine | 2025 | 100% | ufo, nuforc, disk, disc |
| 5 | Golden Saucer Hovers Over York Residence | ufos_aliens | Pennsylvania | 2025 | 100% | ufo, nuforc, disk, disc |
| 6 | Silent Cloud-Like Object Descends Over Bihar Village | ufos_aliens | Bihar | 2025 | 100% | ufo, nuforc, unknown, night |
| 7 | Disc-Shaped Object Performs Aerial Maneuvers Over Concrete | ufos_aliens | Washington | 2025 | 100% | ufo, nuforc, other, bright |
| 8 | Bright Flashing Object Vanishes Over İzmir | ufos_aliens | İzmir | 2025 | 100% | ufo, nuforc, light, lights |
| 9 | Silent Polygonal Cone Observed Over Fairfax | ufos_aliens | Virginia | 2025 | 100% | ufo, nuforc, cone, conical |
| 10 | Paired Orbs Orbit Waterhole, Cylinder Reforms Over Zebras | ufos_aliens | Kgaolo ya Legare | 2025 | 100% | ufo, nuforc, changing, morphing |
| 11 | Massive Hovering Disk Emits Multicolored Glow in Kentucky | ufos_aliens | Kentucky | 2025 | 100% | ufo, nuforc, disk, disc |
| 12 | Two Bird-Like Objects Pursued by Disc Over Minneapolis | ufos_aliens | Minnesota | 2025 | 100% | ufo, nuforc, changing, morphing |
| 13 | Silver Sphere Evades Jet in Ontario Airspace | ufos_aliens | Ontario | 2025 | 100% | ufo, nuforc, circle, circular |
| 14 | Red Glowing Craft Pursued by Fighter Jets Over Pennsylvania | ufos_aliens | Pennsylvania | 2025 | 100% | ufo, nuforc, disk, disc |
| 15 | Bright White Object Changes Direction Over Langait | ufos_aliens | – | 2025 | 100% | ufo, nuforc, disk, disc |
| 16 | Glowing Saturn-Shaped Object Over Arenal | ufos_aliens | Alajuela Province | 2025 | 100% | ufo, nuforc, disk, disc |
| 17 | Two Silent Lights Dance Over Bir Jdid, Morocco | ufos_aliens | Casablanca-Settat | 2025 | 100% | ufo, nuforc, disk, disc |
| 18 | Silver Disc Vanishes When Binoculars Lowered in Colorado | ufos_aliens | Colorado | 2025 | 100% | ufo, nuforc, disk, disc |
| 19 | Dark Cube Observed Descending Near Honolulu Airspace | ufos_aliens | Hawaii | 2025 | 100% | ufo, nuforc, night |
| 20 | Bright White Orb Hovers in Las Vegas Yard | ufos_aliens | Nevada | 2025 | 100% | ufo, nuforc, orb, spherical |
| 21 | Two Bright Orbs Accelerate Over Redondo Beach | ufos_aliens | California | 2025 | 100% | ufo, nuforc, orb, spherical |
| 22 | Oval Saucer With Lights Vanishes Above Philadelphia | ufos_aliens | Pennsylvania | 2025 | 100% | ufo, nuforc, oval, elliptical |
| 23 | Stationary Disk Observed Over Colorado Springs | ufos_aliens | Colorado | 2025 | 100% | ufo, nuforc, disk, disc |
| 24 | Red and White Saucer Over Druids Heath | ufos_aliens | England | 2025 | 100% | ufo, nuforc, circle, circular |
| 25 | Solid Black Disk Ascends Into Cloud Layer Over Centennial | ufos_aliens | Colorado | 2025 | 100% | ufo, nuforc, disk, disc |

### 3. Texas-only UFOs

- **Criteria:** `{"phen_family":["ufos_aliens"],"state_or_country":"US-TX"}`
- **Threshold:** 0.7
- **Hits:** 896
- **Expected:** Every match must have state_province = TX AND category = ufos_aliens.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Flashing Object Executes Rapid Directional Changes Over Texas Ranch | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, flash, bright |
| 2 | I-Beam Object Captured on Home Surveillance in El Paso | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, other, night |
| 3 | Pulsating Cigar Shape Holds Station Over Texas City | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, cigar, cylindrical |
| 4 | Craft Zips Over Austin Parking Lot at 800 Feet | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, light, lights |
| 5 | Bright Green Oval Moves Rapidly West Over Plano | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, oval, elliptical |
| 6 | Recurring Orbs Near Big Dipper Over Tuscola, Texas | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, orb, spherical |
| 7 | Bright Horizontal Light Crosses Texas Sky at Extreme Speed | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, light, lights |
| 8 | Transparent Object With Foil Reflection Over Alto, Texas | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, unknown, bright |
| 9 | White Bulbous Object Causes Power Outage in Irving | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, unknown, silent |
| 10 | Three-Hour Missing Time After Flash in Moore | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, flash, bright |
| 11 | Transparent V-Shaped Formation Sighted Over Round Rock | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, formation, multiple |
| 12 | Red Blinking Orb Moves Rapidly Across San Marcos Sky | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, orb, spherical |
| 13 | Jerking Lights Perform Sky-Writing Over Alma, Texas | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, light, lights |
| 14 | Formation Objects Sighted Over Ira, Texas | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, formation, multiple |
| 15 | Glowing Disc Traverses San Marcos Skies at Dawn | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, circle, circular |
| 16 | Silent Object Executes Serpentine Flight Over Melissa | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, light, lights |
| 17 | Gold and Silver Cylinder Moves Behind Tree in Diana | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, cylinder, tube |
| 18 | Three UAVs in Formation Over Holiday Beach, Texas | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, changing, morphing |
| 19 | Bright White Circle Hovers Over Austin for Hours | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, circle, circular |
| 20 | Bright Orb Vanishes, Smaller Object Emerges in Austin Sky | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, orb, spherical |
| 21 | Circular Object Descends Over Hill Country Southwest of Austin | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, circle, circular |
| 22 | Craft Separates Into Two Over Colleyville Backyard | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, changing, morphing |
| 23 | Shooting Star Descends After Playful Summoning Attempt | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, star, point-light |
| 24 | Orange Plasma Orb Rises Above Tomball Backyard | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, orb, spherical |
| 25 | Two Bright Orbs Over San Antonio International Airspace | ufos_aliens | Texas | 2025 | 100% | ufo, nuforc, orb, spherical |

### 4. 1990s UFO reports

- **Criteria:** `{"phen_family":["ufos_aliens"],"event_year_from":1990,"event_year_to":1999}`
- **Threshold:** 0.7
- **Hits:** 464
- **Expected:** event_date year in [1990, 1999] AND category = ufos_aliens. Hard-fails on year mismatch.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Meteor Executes Sharp Right-Angle Turn Mid-Flight | ufos_aliens | – | 1999 | 100% | glitch_in_the_matrix |
| 2 | Freeway Sky Turns Noon-Bright at Night | ufos_aliens | – | 1998 | 100% | glitch_in_the_matrix |
| 3 | Stationary Light Descends Over Lancaster Desert Home | ufos_aliens | California | 1995 | 100% | glitch_in_the_matrix, childhood-experience |
| 4 | Ball of Light Strikes Room, Five Lose Hours | ufos_aliens | – | 1998 | 100% | glitch_in_the_matrix, personal-experience, has-media |
| 5 | Massive Black Square Eclipses Quarter of Sky | ufos_aliens | Florida | 1994 | 100% | glitch_in_the_matrix |
| 6 | UFO Hovering Over Driveway Recalled by Two Witnesses | ufos_aliens | California | 1996 | 100% | glitch_in_the_matrix, encounter, personal-experience |
| 7 | Ten Light Points Engulf Mountain House Living Room | ufos_aliens | – | 1995 | 100% | glitch_in_the_matrix |
| 8 | Missing Hours and Unexplained Pregnancy in Michigan | ufos_aliens | Michigan | 1999 | 100% | glitch_in_the_matrix, personal-experience |
| 9 | Translucent Rectangle Blocks Mountain Road in Quincy | ufos_aliens | California | 1995 | 100% | glitch_in_the_matrix |
| 10 | Diver Encounters Humanoid Inside Underwater Cucumber Object | ufos_aliens | – | 1997 | 100% | humanoidencounters, encounter |
| 11 | Blue-Robed Figure Glides Through BC Underbrush | ufos_aliens | BC | 1995 | 100% | humanoidencounters |
| 12 | Blue Humanoid Appears During Hovering Craft Sighting | ufos_aliens | New Hampshire | 1990 | 100% | humanoidencounters |
| 13 | Disc Rescue and Valley Scorching in Colombia | ufos_aliens | – | 1990 | 100% | humanoidencounters, personal-experience |
| 14 | Caped Figure Observed Flying Over Devon | ufos_aliens | Devon | 1993 | 100% | humanoidencounters, flying-humanoid, encounter, evidence |
| 15 | Streaked Humanoid Figure Glides Past Desert Ruin | ufos_aliens | California | 1998 | 100% | humanoidencounters, creature, encounter, has-media |
| 16 | Black Oval Pod with Worm-Like Appendage at Bedside | ufos_aliens | – | 1998 | 100% | alienabduction, experience, personal-experience, childhood-experience |
| 17 | Seven Days Missing After Cornfield Abduction | ufos_aliens | – | 1999 | 100% | alienabduction, experience |
| 18 | Chip Implant, Mental Illness Diagnosis, Telepathic Contact | ufos_aliens | – | 1997 | 100% | alienabduction, encounter |
| 19 | Violet Light and Grey Figures in Illinois Hunting Camp | ufos_aliens | Illinois | 1995 | 100% | humanoidencounters, u.f.o.-humanoid, personal-experience, has-media |
| 20 | Sombrero Craft Lands Near Cuban River, Leaves Wax Papers | ufos_aliens | – | 1998 | 100% | humanoidencounters, unidentified |
| 21 | Phoenix Lights Mass Sighting Motive Inquiry | ufos_aliens | Arizona | 1997 | 100% | alienabduction, question, encounter |
| 22 | Two Hours Lost Stargazing Near Bloomington | ufos_aliens | Indiana | 1991 | 100% | humanoidencounters, outside-site |
| 23 | Morse Code Light and Missing Time in Cape Town | ufos_aliens | – | 1994 | 100% | alienabduction, experience, personal-experience |
| 24 | Glowing Humanoid Observed Near Landed Craft in Puerto Rico | ufos_aliens | Puerto Rico | 1992 | 100% | humanoidencounters, alien-humanoid |
| 25 | Luminous Sphere Descends Near Kiev Bridge | ufos_aliens | – | 1992 | 100% | humanoidencounters, alien-humanoid |

### 5. Cryptid sightings — Bigfoot vocalizations

- **Criteria:** `{"phen_family":["cryptids"],"descriptors_any":["whoop_vocalization"]}`
- **Threshold:** 0.5
- **Hits:** 760
- **Expected:** Cryptid reports mentioning whoop/howl/call.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Tactile Dog Vanishes Mid-Stroke on Staircase | cryptids | – | – | 100% | glitch_in_the_matrix |
| 2 | Eight-Foot Gopher Snake Appears After Unprompted Utterance | cryptids | Arizona | 2013 | 100% | glitch_in_the_matrix, personal-experience, evidence |
| 3 | Impossibly Thin Cat Vanishes at Same Woodland Spot | cryptids | – | 2016 | 100% | glitch_in_the_matrix |
| 4 | Stick-Legged Figure Crosses Road at Night | cryptids | – | 2017 | 100% | glitch_in_the_matrix, personal-experience |
| 5 | River Bird Twice the Size of a Great Dane | cryptids | Wales | 2017 | 100% | glitch_in_the_matrix |
| 6 | Humanoid Rabbit Encounter in Catskills Woods | cryptids | New York | – | 100% | glitch_in_the_matrix, personal-experience, childhood-experience |
| 7 | Giant Black Feathered Bird Over Residential Trees | cryptids | – | 2016 | 100% | glitch_in_the_matrix |
| 8 | Massive Four-Legged Creature Vanishes on Dead-End Street | cryptids | – | 2014 | 100% | glitch_in_the_matrix |
| 9 | Creature Shifts From Cat to Lion-Sized Beast on Dark Road | cryptids | – | 2017 | 100% | glitch_in_the_matrix |
| 10 | Large Limping Dog Vanishes Mid-Driveway | cryptids | – | 2020 | 100% | glitch_in_the_matrix |
| 11 | Small Boney Creature Dissolves Into Park Darkness | cryptids | – | – | 100% | glitch_in_the_matrix |
| 12 | Massive Golden-Eyed Bird Passes Over Moving Vehicle | cryptids | – | – | 100% | glitch_in_the_matrix, personal-experience |
| 13 | Large Feline Observed in Urban Northeast Park | cryptids | California | – | 100% | glitch_in_the_matrix, encounter |
| 14 | Pale Crawler Under Porch Triggers Shared Nightmares | cryptids | Illinois | 2012 | 100% | crawlersightings, encounter, personal-experience |
| 15 | Elongated Gray Crawler on Riverside Hiking Trail | cryptids | Indiana | 2017 | 100% | crawlersightings, encounter |
| 16 | Pale Crawler Observed Across River at Minnesota Campsite | cryptids | Minnesota | 1996 | 100% | crawlersightings, encounter |
| 17 | White Bipedal Creature Haunts Central Minnesota Grove | cryptids | Minnesota | – | 100% | crawlersightings, encounter |
| 18 | Skinny Grey Figure With Yellow Eyes Near Effingham Cemetery | cryptids | Illinois | 2012 | 100% | crawlersightings, encounter, personal-experience, has-media |
| 19 | Four-Foot Crawler with Melted Jaw Appears in Living Room | cryptids | Washington | – | 100% | crawlersightings, encounter, personal-experience |
| 20 | Seven-Foot Outline Drags Feet Along Camp Road | cryptids | Illinois | 2018 | 100% | crawlersightings, encounter |
| 21 | Pale Crawler Appears to Three Unconnected Witnesses | cryptids | – | 2012 | 100% | crawlersightings, personal-experience |
| 22 | Seven-Foot Crawler With Backward-Bent Joints Approaches Fire | cryptids | – | 2017 | 100% | crawlersightings |
| 23 | Seeker Seeks Pale Antlered Crawler Chase Account | cryptids | – | 2017 | 100% | crawlersightings |
| 24 | Pale Crawler Chases Car Down Logging Highway | cryptids | – | – | 100% | crawlersightings |
| 25 | White Crawler Pursues Vehicle on Kentucky Farm Road | cryptids | Kentucky | – | 100% | crawlersightings |

### 6. Apparitions in California

- **Criteria:** `{"phen_family":["ghosts_hauntings"],"state_or_country":"US-CA"}`
- **Threshold:** 0.7
- **Hits:** 806
- **Expected:** California-state apparition reports only.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Spherical White Lights Rise Above Joshua Tree Cabin | ghosts_hauntings | California | – | 100% | paranormal, experience-, personal-experience |
| 2 | Senior Vanishes After Calling Out in Empty Hall | ghosts_hauntings | California | 2003 | 100% | paranormal, unexplained, encounter |
| 3 | Girl in Black Plaids Confirmed by Stranger's Encounter | ghosts_hauntings | California | 2022 | 100% | paranormal, haunted-house, encounter, personal-experience |
| 4 | Dark Figure Piloting Santa's Sleigh Over San Jose | ghosts_hauntings | California | 2025 | 100% | paranormal, elf/fairy, personal-experience |
| 5 | Three Translucent Faces Emerge in Photograph | ghosts_hauntings | California | 2012 | 100% | paranormal, nsfw, personal-experience, evidence |
| 6 | Bathroom Door Locks From Empty Room on Military Base | ghosts_hauntings | California | 2015 | 100% | paranormal, encounter |
| 7 | Nurse in Pink Scrubs Appears in Empty Hospital Room | ghosts_hauntings | California | – | 100% | paranormal, experience- |
| 8 | Horse-Faced Woman in Red Dress Descends Stairwell | ghosts_hauntings | California | 2002 | 100% | paranormal, unexplained |
| 9 | Screams at the Moment of Death, Three Times Over | ghosts_hauntings | California | 2015 | 100% | paranormal, nsfw-/-graphic-content |
| 10 | Faceless Figure Chases Two Witnesses Across Sunset Beach | ghosts_hauntings | California | 2023 | 100% | paranormal, question, personal-experience |
| 11 | Unfamiliar Faces Appear in Dreams With Biographical Details | ghosts_hauntings | California | 2025 | 100% | paranormal, question |
| 12 | The Cowboy Follows Family From Arizona to California | ghosts_hauntings | California | 2010 | 100% | paranormal, haunting |
| 13 | Recurring Nightmares of Child Harm at Airbnb | ghosts_hauntings | California | – | 100% | paranormal, encounter, personal-experience |
| 14 | Unidentified Hell Gate Location in Southern California | ghosts_hauntings | California | 2022 | 100% | paranormal, question |
| 15 | Faceless Figure Appears in Mirror During Family Photo | ghosts_hauntings | California | – | 100% | paranormal, photo-evidence, personal-experience, evidence |
| 16 | Overwhelming Dread Prompts Sudden Flight Change | ghosts_hauntings | California | 2025 | 100% | paranormal, extrasensory-perception |
| 17 | Glowing Jellyfish Hovers Over China Camp Cliff | ghosts_hauntings | California | 2013 | 100% | paranormal, nsfw, personal-experience |
| 18 | White Witch Apparition Reported at Elfin Forest Trail | ghosts_hauntings | California | – | 100% | paranormal, findings- |
| 19 | Large Hunched Creature Trots Through Desert Clearing | ghosts_hauntings | California | – | 100% | paranormal, cryptids |
| 20 | Whimpering Figure in White at Bedroom Window | ghosts_hauntings | California | 2025 | 100% | paranormal, encounter, encounter, personal-experience |
| 21 | Faceless Figure Stalks Fishing Spot at Burned Cabin | ghosts_hauntings | California | – | 100% | paranormal, cryptids |
| 22 | Physical Touch During Sleep in Palm Springs Hotel | ghosts_hauntings | California | 2025 | 100% | paranormal, unexplained, personal-experience, childhood-experience |
| 23 | Figure in Night Vision Bends Unnaturally, Grins | ghosts_hauntings | California | – | 100% | paranormal, encounter, encounter |
| 24 | Girl Laughter Ceases When Witness Approaches La Cumbre Peak | ghosts_hauntings | California | – | 100% | paranormal, nsfw |
| 25 | Woman's Voice Captured on Apartment Recording, Source Unknown | ghosts_hauntings | California | 2025 | 100% | paranormal, debunk-this, evidence |

### 7. Missing-time accounts (any family)

- **Criteria:** `{"descriptors_any":["time_distortion"]}`
- **Threshold:** 0.5
- **Hits:** 8
- **Expected:** Should surface reports with "missing time" / "time slowed" / "time stopped" language regardless of phen family.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Sudden Unresponsiveness and Missing Time After Cannabis | consciousness_practices | – | 2013 | 100% | psychonaut |
| 2 | Upward Pull and Missing Time During Night Episode | consciousness_practices | – | 2013 | 100% | psychonaut, personal-experience |
| 3 | Music Dissolves Into Hours During 25I Experience | consciousness_practices | – | – | 100% | psychonaut |
| 4 | Dissociative State and Missing Time After High-Dose DXM | consciousness_practices | – | 2016 | 100% | psychonaut, personal-experience |
| 5 | Missing Time During High-Dose DMT Experience | consciousness_practices | – | 2013 | 100% | psychonaut, personal-experience |
| 6 | Brain Lobes Unhinge During Guided Meditation | consciousness_practices | – | 2020 | 100% | psychonaut, personal-experience |
| 7 | Cyclist Struck by Car, Emerges Unharmed | consciousness_practices | – | 2019 | 100% | psychonaut |
| 8 | Cyanescens Lemon Tek Overwhelms Experienced Psychonaut | consciousness_practices | – | – | 100% | psychonaut, personal-experience, evidence |

### 8. Sleep-paralysis pattern (shadow + paralysis)

- **Criteria:** `{"descriptors_all":["shadow_figure","paralysis_onset"]}`
- **Threshold:** 0.5
- **Hits:** 568
- **Expected:** Reports mentioning both a shadow/figure AND paralysis/frozen language.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Old Soul Recognitions and the Calling to Plant Medicine | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 2 | DMT Invocation Followed by Hospitalization of Named Target | consciousness_practices | – | – | 50% | shamanism |
| 3 | Shamanic Journeying Without Strong Visuals | consciousness_practices | – | 2018 | 50% | shamanism |
| 4 | Skeletal Figure Confrontation in Lucid Dream State | consciousness_practices | – | – | 50% | shamanism |
| 5 | Lotus Entity Appears During Father's Final Hours | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 6 | Circling Breeze Examines Witness at Dawn | consciousness_practices | – | 2017 | 50% | shamanism, personal-experience |
| 7 | Negative Presence Drains Energy From Household Members | consciousness_practices | – | – | 50% | shamanism |
| 8 | Shirtless Figure and Sharp-Toothed Apparition on Road | consciousness_practices | – | – | 50% | shamanism |
| 9 | Clear Visions During Hospital Pain, Animal Messengers | consciousness_practices | – | – | 50% | shamanism |
| 10 | Tall Green Witch Appears in Kitchen During Childhood | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 11 | Galaxy Entity Redirects Shaman to Upper World Healing | consciousness_practices | – | 2019 | 100% | shamanism, encounter, personal-experience |
| 12 | Demonic Voice and Shadow Figure Follow Across Residences | consciousness_practices | – | 2016 | 50% | shamanism, personal-experience |
| 13 | Multicolored Aquatic Entities Make Repeated Contact | consciousness_practices | – | 2018 | 50% | shamanism, encounter, personal-experience |
| 14 | Two Figures Rush In During Sleep Paralysis Episode | consciousness_practices | – | – | 100% | shamanism |
| 15 | Vine-Bearing Child Figure in Forest Encounters | consciousness_practices | – | – | 50% | shamanism, question |
| 16 | Timber Wolf Stares Through Windshield at Midnight | consciousness_practices | – | 2022 | 50% | shamanism, encounter, personal-experience |
| 17 | Lion's Mane Emerges During Psytrance LSD Journey | consciousness_practices | – | – | 50% | shamanism |
| 18 | Lightning Strike Survivor Seeks Shamanic Initiation Guidance | consciousness_practices | – | 2018 | 50% | shamanism, personal-experience |
| 19 | Healer Cycles Between Intense Interventions and Isolation | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 20 | Entity Presence Intensifies During Reiki Session | consciousness_practices | – | – | 50% | shamanism |
| 21 | Shadow Entity Cuts Screen During Out-Of-Body Encounter | consciousness_practices | – | – | 50% | shamanism, encounter |
| 22 | Two Shaggy Figures Perched on Fence at Childhood Home | consciousness_practices | – | – | 50% | shamanism |
| 23 | Bear's Corrupted Heart Healed Through Dream Confrontation | consciousness_practices | – | 2018 | 50% | shamanism |
| 24 | Mourning Dove Strike Precedes Shamanic Encounter | consciousness_practices | – | 2018 | 50% | shamanism, encounter |
| 25 | Shadow Figure Holds Witness During Hypnagogic Encounter | consciousness_practices | – | 2018 | 50% | shamanism, personal-experience |

### 9. Witness count ≥ 2 cryptid reports

- **Criteria:** `{"phen_family":["cryptids"],"witness_count_min":2}`
- **Threshold:** 0.6
- **Hits:** 560
- **Expected:** Cryptid reports with multi-witness signal — uses witness_paired_or_more descriptor + assessment.witness_count.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Black Blur Sprints From House at Impossible Speed | cryptids | – | – | 100% | glitch_in_the_matrix |
| 2 | Large Bird Materializes and Vanishes During Commute | cryptids | – | 2015 | 100% | glitch_in_the_matrix, personal-experience |
| 3 | White Wolf Emerges From Ditch on Rural Road | cryptids | Minnesota | – | 100% | glitch_in_the_matrix, encounter, personal-experience |
| 4 | Towering Figure in Torn Coat Chases Hikers from Tracks | cryptids | – | – | 100% | glitch_in_the_matrix |
| 5 | Black Dog Runs Without Touching Ground | cryptids | – | 2013 | 100% | glitch_in_the_matrix |
| 6 | Hybrid Creature With Pendulum Gait on Rural Road | cryptids | – | 2011 | 100% | glitch_in_the_matrix |
| 7 | Impossibly Thin Cat Vanishes at Same Woodland Spot | cryptids | – | 2016 | 100% | glitch_in_the_matrix |
| 8 | Stick-Legged Figure Crosses Road at Night | cryptids | – | 2017 | 100% | glitch_in_the_matrix, personal-experience |
| 9 | River Bird Twice the Size of a Great Dane | cryptids | Wales | 2017 | 100% | glitch_in_the_matrix |
| 10 | Giant Black Feathered Bird Over Residential Trees | cryptids | – | 2016 | 100% | glitch_in_the_matrix |
| 11 | Flaming Black Bird Vanishes in Colorado Yard | cryptids | Colorado | – | 100% | glitch_in_the_matrix, personal-experience |
| 12 | Loud Grunts Follow Group Through Norwegian Forest | cryptids | – | – | 100% | glitch_in_the_matrix, encounter |
| 13 | Meredith Emerson Case Surfaces Three Times in One Week | cryptids | North Carolina | 2019 | 100% | glitch_in_the_matrix |
| 14 | Massive Four-Legged Creature Vanishes on Dead-End Street | cryptids | – | 2014 | 100% | glitch_in_the_matrix |
| 15 | Creature Shifts From Cat to Lion-Sized Beast on Dark Road | cryptids | – | 2017 | 100% | glitch_in_the_matrix |
| 16 | Massive Golden-Eyed Bird Passes Over Moving Vehicle | cryptids | – | – | 100% | glitch_in_the_matrix, personal-experience |
| 17 | Man with Black Dog Appears at Crisis Moments | cryptids | – | – | 100% | glitch_in_the_matrix, personal-experience |
| 18 | Pale Quadrupedal Figure Circles Cemetery in Rossville | cryptids | Illinois | – | 100% | crawlersightings |
| 19 | Pale Crawler Under Porch Triggers Shared Nightmares | cryptids | Illinois | 2012 | 100% | crawlersightings, encounter, personal-experience |
| 20 | Elongated Gray Crawler on Riverside Hiking Trail | cryptids | Indiana | 2017 | 100% | crawlersightings, encounter |
| 21 | Pale Crawler Observed Across River at Minnesota Campsite | cryptids | Minnesota | 1996 | 100% | crawlersightings, encounter |
| 22 | Skinny Grey Figure With Yellow Eyes Near Effingham Cemetery | cryptids | Illinois | 2012 | 100% | crawlersightings, encounter, personal-experience, has-media |
| 23 | Pale Creature Halts Two Girls on Kentucky Mountain | cryptids | Kentucky | – | 100% | crawlersightings, encounter |
| 24 | Grey Crawler Observed Near Resurrection Cemetery, Wyoming | cryptids | Michigan | – | 100% | crawlersightings, encounter |
| 25 | Seven-Foot Outline Drags Feet Along Camp Road | cryptids | Illinois | 2018 | 100% | crawlersightings, encounter |

### 10. Orb UFOs 2020-present

- **Criteria:** `{"phen_family":["ufos_aliens"],"descriptors_any":["craft_shape_orb"],"event_year_from":2020}`
- **Threshold:** 0.5
- **Hits:** 631
- **Expected:** Modern orb / sphere / ball-of-light UFO reports.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | 12-Foot Orange Orb Follows Car Through North Charleston | ufos_aliens | South Carolina | 2024 | 100% | ufo, nuforc, orb, spherical |
| 2 | Deep Orange Sphere Hovers Low Over Edwinstowe Garden | ufos_aliens | England | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 3 | Dark Orb with Red Corona Follows Kite in Highland | ufos_aliens | Indiana | 2025 | 100% | ufo, nuforc, orb, spherical |
| 4 | Orb Responds to Flashlight Signal Over Ashland Park | ufos_aliens | Oregon | 2025 | 100% | ufo, nuforc, light, lights |
| 5 | Luminous Sphere Splits Into Three Over Internet Tower | ufos_aliens | Ceará | 2025 | 100% | ufo, nuforc, circle, circular |
| 6 | Three Spheres Move Strangely Above Turpin Trees | ufos_aliens | Oklahoma | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 7 | Orangy-Red Sphere Hovers Then Vanishes Over West Bellaire | ufos_aliens | Ohio | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 8 | Pulsing Orb Halts Over Ingonish, Nova Scotia | ufos_aliens | Nova Scotia | 2025 | 100% | ufo, nuforc, orb, spherical |
| 9 | Silver Sphere Accelerates Toward Fairhaven Bridge | ufos_aliens | Massachusetts | 2025 | 100% | ufo, nuforc, circle, circular |
| 10 | Round Glowing Object Crosses Airplane Path Over Loanhead | ufos_aliens | Scotland | 2025 | 100% | ufo, nuforc, circle, circular |
| 11 | Bright Circle Vanishes Instantly Over New Beith | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, circle, circular |
| 12 | Three Green Orbs Descend and Scatter Over Alabama | ufos_aliens | Alabama | 2025 | 100% | ufo, nuforc, orb, spherical |
| 13 | Bright Circle Vanishes at Incredible Speed Over Queensland | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, circle, circular |
| 14 | Sphere Accelerates Beyond Known Physics Over Warsaw | ufos_aliens | Województwo mazowieckie | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 15 | Orb Freezes When Witness Attempts Recording in Kentucky | ufos_aliens | Kentucky | 2025 | 100% | ufo, nuforc, orb, spherical |
| 16 | Recurring Orbs Over Dresden Display Formation and Speed | ufos_aliens | Tennessee | 2025 | 100% | ufo, nuforc, orb, spherical |
| 17 | Multiple Light Spheres Flash Over Mornington Peninsula | ufos_aliens | Victoria | 2025 | 100% | ufo, nuforc, orb, spherical |
| 18 | Oval Craft Vanishes as Jets Circle Ocilla Home | ufos_aliens | Georgia | 2025 | 100% | ufo, nuforc, oval, elliptical |
| 19 | Round Silver Orb Evades Night Vision Goggles in Arizona | ufos_aliens | Arizona | 2025 | 100% | ufo, nuforc, orb, spherical |
| 20 | Yellow Orb Vanishes and Reappears Over Astoria River | ufos_aliens | Oregon | 2025 | 100% | ufo, nuforc, orb, spherical |
| 21 | Light Orb Bolts Across Phoenix Night Sky | ufos_aliens | Arizona | 2025 | 100% | ufo, nuforc, circle, circular |
| 22 | Tic Tac UFO Sighted South of Buffalo Galleria | ufos_aliens | New York | 2025 | 100% | ufo, nuforc, cylinder, tube |
| 23 | Triangle Ship Emerges From Fireball Over Wyrzysk | ufos_aliens | Greater Poland Voivodeship | 2025 | 100% | ufo, nuforc, triangle, triangular |
| 24 | Orb Accelerates South and Vanishes Over Alabama | ufos_aliens | Alabama | 2025 | 100% | ufo, nuforc, orb, spherical |
| 25 | Silver Sphere Evades Jet in Ontario Airspace | ufos_aliens | Ontario | 2025 | 100% | ufo, nuforc, circle, circular |

## Aggregate counts

- Watchlists evaluated: 10
- Returned ≥1 match: 10
- Returned 0 matches: 0
- Errored: 0
- Total matches across all watchlists: 5174

---

Operator action: for each watchlist with hits, scan the sample table and mark any row that does not actually meet the criteria. >5% off-target across the smoke fails the precision gate; tune match-engine.ts and re-run.