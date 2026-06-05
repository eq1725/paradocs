# Custom Watchlists — quality smoke (V11.17.72)

Generated: 2026-06-04T23:12:43.760Z
Engine: src/lib/lab/watchlists/match-engine.ts

## Summary

| # | Watchlist | Hits | Threshold | Duration (ms) | Status |
|---|---|---:|---:|---:|---|
| 1 | Triangle UFOs anywhere | 2000 | 0.5 | 871 | OK |
| 2 | Disc / saucer UFOs | 2000 | 0.5 | 908 | OK |
| 3 | Texas-only UFOs | 0 | 0.7 | 62 | EMPTY |
| 4 | 1990s UFO reports | 464 | 0.7 | 489 | OK |
| 5 | Cryptid sightings — Bigfoot vocalizations | 2000 | 0.5 | 771 | OK |
| 6 | Apparitions in California | 0 | 0.7 | 65 | EMPTY |
| 7 | Missing-time accounts (any family) | 2000 | 0.5 | 818 | OK |
| 8 | Sleep-paralysis pattern (shadow + paralysis) | 568 | 0.5 | 806 | OK |
| 9 | Witness count ≥ 2 cryptid reports | 560 | 0.6 | 706 | OK |
| 10 | Orb UFOs 2020-present | 2000 | 0.5 | 709 | OK |

## Precision check — eyeball each sample for false positives

Per PRO_TIER_VALIDATION_V3 §8.3, target ≥95% precision (almost no false-positives).

### 1. Triangle UFOs anywhere

- **Criteria:** `{"phen_family":["ufos_aliens"],"descriptors_any":["craft_shape_triangle"]}`
- **Threshold:** 0.5
- **Hits:** 2000
- **Expected:** Hundreds of triangle UFO reports across the Archive; expect every match to be UFO-tagged AND mention triangle/V-formation/boomerang.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | 12-Foot Orange Orb Follows Car Through North Charleston | ufos_aliens | South Carolina | 2024 | 50% | ufo, nuforc, orb, spherical |
| 2 | Lights Rise From Cliff, Accelerate East at Extreme Speed | ufos_aliens | New York | 2024 | 50% | ufo, nuforc, fireball, bright |
| 3 | White Triangle with Red Center Lights Hovers Over Cornfield | ufos_aliens | Missouri | 2024 | 100% | ufo, nuforc, triangle, triangular |
| 4 | Large Black Rectangle Vanishes Over Lexington | ufos_aliens | South Carolina | 2024 | 50% | ufo, nuforc, rectangle, rectangular |
| 5 | Oval Object Moves Abnormally Over Motorsports Park | ufos_aliens | California | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 6 | Two White Lights Descend Over Cannon Air Force Base | ufos_aliens | New Mexico | 2025 | 50% | ufo, nuforc, unknown |
| 7 | Three Green Orbs Descend and Scatter Over Alabama | ufos_aliens | Alabama | 2025 | 50% | ufo, nuforc, orb, spherical |
| 8 | Bright Circle Vanishes at Incredible Speed Over Queensland | ufos_aliens | Queensland | 2025 | 50% | ufo, nuforc, circle, circular |
| 9 | Teardrop Silhouette Crosses Shelbyville Sky at High Speed | ufos_aliens | Illinois | 2025 | 50% | ufo, nuforc, teardrop, pear-shaped |
| 10 | Multicolored Light Performs Circular Hover Over Conyers | ufos_aliens | Georgia | 2025 | 50% | ufo, nuforc, light, lights |
| 11 | Three Lights Merge and Vanish Over Pyeongchang-gun | ufos_aliens | – | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 12 | Asteroid-Shaped Object Rotates Over Jensen Beach | ufos_aliens | Florida | 2025 | 50% | ufo, nuforc, cigar, cylindrical |
| 13 | Orangy-Red Sphere Hovers Then Vanishes Over West Bellaire | ufos_aliens | Ohio | 2025 | 50% | ufo, nuforc, sphere, spherical |
| 14 | Colored Lights and Bedroom Paralysis in Minas Gerais | ufos_aliens | State of Minas Gerais | 2025 | 50% | ufo, nuforc, light, lights |
| 15 | Pulsing Orb Halts Over Ingonish, Nova Scotia | ufos_aliens | Nova Scotia | 2025 | 50% | ufo, nuforc, orb, spherical |
| 16 | Diamond Craft Plays With Cessna Over Carlow | ufos_aliens | Carlow | 2025 | 50% | ufo, nuforc, diamond, rhombus |
| 17 | Dark Orb with Red Corona Follows Kite in Highland | ufos_aliens | Indiana | 2025 | 50% | ufo, nuforc, orb, spherical |
| 18 | Orb Responds to Flashlight Signal Over Ashland Park | ufos_aliens | Oregon | 2025 | 50% | ufo, nuforc, light, lights |
| 19 | Aspirin-Shaped Craft With Brown Exhaust Trails Over Danville | ufos_aliens | Virginia | 2025 | 50% | ufo, nuforc, circle, circular |
| 20 | Silver Sphere Accelerates Toward Fairhaven Bridge | ufos_aliens | Massachusetts | 2025 | 50% | ufo, nuforc, circle, circular |
| 21 | Round Glowing Object Crosses Airplane Path Over Loanhead | ufos_aliens | Scotland | 2025 | 50% | ufo, nuforc, circle, circular |
| 22 | Luminous Sphere Splits Into Three Over Internet Tower | ufos_aliens | Ceará | 2025 | 50% | ufo, nuforc, circle, circular |
| 23 | Hairless Five-Foot Being Enters Disc Craft in Key Largo | ufos_aliens | Florida | 2025 | 50% | ufo, nuforc, disk, disc |
| 24 | Bright Circle Vanishes Instantly Over New Beith | ufos_aliens | Queensland | 2025 | 50% | ufo, nuforc, circle, circular |
| 25 | Bright Object Rises and Accelerates Over Redding, California | ufos_aliens | California | 2025 | 50% | ufo, nuforc, unknown, bright |

### 2. Disc / saucer UFOs

- **Criteria:** `{"phen_family":["ufos_aliens"],"descriptors_any":["craft_shape_disc"]}`
- **Threshold:** 0.5
- **Hits:** 2000
- **Expected:** Should surface NUFORC disc/saucer reports.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | 12-Foot Orange Orb Follows Car Through North Charleston | ufos_aliens | South Carolina | 2024 | 100% | ufo, nuforc, orb, spherical |
| 2 | Lights Rise From Cliff, Accelerate East at Extreme Speed | ufos_aliens | New York | 2024 | 50% | ufo, nuforc, fireball, bright |
| 3 | White Triangle with Red Center Lights Hovers Over Cornfield | ufos_aliens | Missouri | 2024 | 50% | ufo, nuforc, triangle, triangular |
| 4 | Large Black Rectangle Vanishes Over Lexington | ufos_aliens | South Carolina | 2024 | 50% | ufo, nuforc, rectangle, rectangular |
| 5 | Oval Object Moves Abnormally Over Motorsports Park | ufos_aliens | California | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 6 | Two White Lights Descend Over Cannon Air Force Base | ufos_aliens | New Mexico | 2025 | 50% | ufo, nuforc, unknown |
| 7 | Three Green Orbs Descend and Scatter Over Alabama | ufos_aliens | Alabama | 2025 | 50% | ufo, nuforc, orb, spherical |
| 8 | Bright Circle Vanishes at Incredible Speed Over Queensland | ufos_aliens | Queensland | 2025 | 100% | ufo, nuforc, circle, circular |
| 9 | Teardrop Silhouette Crosses Shelbyville Sky at High Speed | ufos_aliens | Illinois | 2025 | 50% | ufo, nuforc, teardrop, pear-shaped |
| 10 | Multicolored Light Performs Circular Hover Over Conyers | ufos_aliens | Georgia | 2025 | 50% | ufo, nuforc, light, lights |
| 11 | Three Lights Merge and Vanish Over Pyeongchang-gun | ufos_aliens | – | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 12 | Asteroid-Shaped Object Rotates Over Jensen Beach | ufos_aliens | Florida | 2025 | 50% | ufo, nuforc, cigar, cylindrical |
| 13 | Orangy-Red Sphere Hovers Then Vanishes Over West Bellaire | ufos_aliens | Ohio | 2025 | 50% | ufo, nuforc, sphere, spherical |
| 14 | Colored Lights and Bedroom Paralysis in Minas Gerais | ufos_aliens | State of Minas Gerais | 2025 | 50% | ufo, nuforc, light, lights |
| 15 | Pulsing Orb Halts Over Ingonish, Nova Scotia | ufos_aliens | Nova Scotia | 2025 | 50% | ufo, nuforc, orb, spherical |
| 16 | Diamond Craft Plays With Cessna Over Carlow | ufos_aliens | Carlow | 2025 | 50% | ufo, nuforc, diamond, rhombus |
| 17 | Dark Orb with Red Corona Follows Kite in Highland | ufos_aliens | Indiana | 2025 | 50% | ufo, nuforc, orb, spherical |
| 18 | Orb Responds to Flashlight Signal Over Ashland Park | ufos_aliens | Oregon | 2025 | 50% | ufo, nuforc, light, lights |
| 19 | Aspirin-Shaped Craft With Brown Exhaust Trails Over Danville | ufos_aliens | Virginia | 2025 | 50% | ufo, nuforc, circle, circular |
| 20 | Silver Sphere Accelerates Toward Fairhaven Bridge | ufos_aliens | Massachusetts | 2025 | 50% | ufo, nuforc, circle, circular |
| 21 | Round Glowing Object Crosses Airplane Path Over Loanhead | ufos_aliens | Scotland | 2025 | 50% | ufo, nuforc, circle, circular |
| 22 | Luminous Sphere Splits Into Three Over Internet Tower | ufos_aliens | Ceará | 2025 | 50% | ufo, nuforc, circle, circular |
| 23 | Hairless Five-Foot Being Enters Disc Craft in Key Largo | ufos_aliens | Florida | 2025 | 100% | ufo, nuforc, disk, disc |
| 24 | Bright Circle Vanishes Instantly Over New Beith | ufos_aliens | Queensland | 2025 | 50% | ufo, nuforc, circle, circular |
| 25 | Bright Object Rises and Accelerates Over Redding, California | ufos_aliens | California | 2025 | 50% | ufo, nuforc, unknown, bright |

### 3. Texas-only UFOs

- **Criteria:** `{"phen_family":["ufos_aliens"],"state_or_country":"US-TX"}`
- **Threshold:** 0.7
- **Hits:** 0
- **Expected:** Every match must have state_province = TX AND category = ufos_aliens.

> No matches surfaced. If known-positives exist for this criterion in the live DB, this signals a recall failure.

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
- **Hits:** 2000
- **Expected:** Cryptid reports mentioning whoop/howl/call.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Massive Underground Boom Shakes Sedona Hotel Room | cryptids | – | – | 50% | youtube, youtube-comment, experiencer-account, jesse-michels |
| 2 | Black Blur Sprints From House at Impossible Speed | cryptids | – | – | 50% | glitch_in_the_matrix |
| 3 | Giant Red Beetle Vanishes From Wall Without Trace | cryptids | – | 2013 | 50% | glitch_in_the_matrix, personal-experience |
| 4 | Tactile Dog Vanishes Mid-Stroke on Staircase | cryptids | – | – | 100% | glitch_in_the_matrix |
| 5 | Large Bird Materializes and Vanishes During Commute | cryptids | – | 2015 | 50% | glitch_in_the_matrix, personal-experience |
| 6 | Brown Furred Figure Vanishes From Direct View | cryptids | – | 2014 | 50% | glitch_in_the_matrix |
| 7 | White Wolf Emerges From Ditch on Rural Road | cryptids | Minnesota | – | 50% | glitch_in_the_matrix, encounter, personal-experience |
| 8 | Towering Figure in Torn Coat Chases Hikers from Tracks | cryptids | – | – | 50% | glitch_in_the_matrix |
| 9 | Friend Witnesses Double Running Through Florida Woods | cryptids | Florida | 2011 | 50% | glitch_in_the_matrix |
| 10 | Black Dog Runs Without Touching Ground | cryptids | – | 2013 | 50% | glitch_in_the_matrix |
| 11 | Eight-Foot Gopher Snake Appears After Unprompted Utterance | cryptids | Arizona | 2013 | 100% | glitch_in_the_matrix, personal-experience, evidence |
| 12 | Impossibly Orange Fox Vanishes Into Barbed Fence | cryptids | – | 2015 | 50% | glitch_in_the_matrix |
| 13 | Hybrid Creature With Pendulum Gait on Rural Road | cryptids | – | 2011 | 50% | glitch_in_the_matrix |
| 14 | King Kong Beckons From Woods Behind Military Base | cryptids | Missouri | – | 50% | glitch_in_the_matrix |
| 15 | Reptilian Head on Canine Body Encountered on Hillside | cryptids | – | – | 50% | glitch_in_the_matrix |
| 16 | Jet Black Fin Surfaces in Shallow Lake Water | cryptids | – | – | 50% | glitch_in_the_matrix |
| 17 | Giant Green Bug With Red Eyes Vanishes From Memory | cryptids | – | – | 50% | glitch_in_the_matrix |
| 18 | Hairless Limb Drags Across Road in Headlights | cryptids | – | – | 50% | glitch_in_the_matrix, personal-experience |
| 19 | Impossibly Thin Cat Vanishes at Same Woodland Spot | cryptids | – | 2016 | 100% | glitch_in_the_matrix |
| 20 | Grey Kangaroo Vanishes From Ute Tray Overnight | cryptids | – | – | 50% | glitch_in_the_matrix, personal-experience |
| 21 | Stick-Legged Figure Crosses Road at Night | cryptids | – | 2017 | 100% | glitch_in_the_matrix, personal-experience |
| 22 | River Bird Twice the Size of a Great Dane | cryptids | Wales | 2017 | 100% | glitch_in_the_matrix |
| 23 | Deer-Headed Figure Passes Unnoticed on Crowded Street | cryptids | – | 2015 | 50% | glitch_in_the_matrix, encounter |
| 24 | Black Dog Transforms to Cat Across Parking Lot | cryptids | Indiana | – | 50% | glitch_in_the_matrix, personal-experience |
| 25 | Godzilla-Like Creature at Riverside Bridge | cryptids | – | – | 50% | glitch_in_the_matrix, encounter, personal-experience |

### 6. Apparitions in California

- **Criteria:** `{"phen_family":["ghosts_hauntings"],"state_or_country":"US-CA"}`
- **Threshold:** 0.7
- **Hits:** 0
- **Expected:** California-state apparition reports only.

> No matches surfaced. If known-positives exist for this criterion in the live DB, this signals a recall failure.

### 7. Missing-time accounts (any family)

- **Criteria:** `{"descriptors_any":["time_distortion"]}`
- **Threshold:** 0.5
- **Hits:** 2000
- **Expected:** Should surface reports with "missing time" / "time slowed" / "time stopped" language regardless of phen family.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | Cross in Circle with Descending Arms Shown in Dream | consciousness_practices | – | – | 50% | shamanism |
| 2 | Winged Entity Claims Hecate Form During Meditation Journey | consciousness_practices | – | – | 50% | shamanism, encounter |
| 3 | Old Soul Recognitions and the Calling to Plant Medicine | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 4 | Unconscious Mind Declares Inner Child Dead, Soul Shattered | consciousness_practices | – | 2021 | 50% | shamanism, question, personal-experience |
| 5 | Surgical Extraction Dreams During Icaro Listening | consciousness_practices | – | 2021 | 50% | shamanism |
| 6 | DMT Invocation Followed by Hospitalization of Named Target | consciousness_practices | – | – | 50% | shamanism |
| 7 | Shamanic Journeying Without Strong Visuals | consciousness_practices | – | 2018 | 50% | shamanism |
| 8 | Psychotic Episodes or Shamanic Calling | consciousness_practices | – | 2018 | 50% | shamanism, personal-experience |
| 9 | Red-Tailed Hawk Prompts First Shamanic Journey | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 10 | Repeated Pneumonia and Spiritual Awakening After Near-Death | consciousness_practices | – | – | 50% | shamanism, personal-experience, childhood-experience |
| 11 | White Tiger Shifts From Guide to Attacker | consciousness_practices | – | – | 50% | shamanism |
| 12 | Skeletal Figure Confrontation in Lucid Dream State | consciousness_practices | – | – | 50% | shamanism |
| 13 | Mutual Energy Depletion After Reunion Encounter | consciousness_practices | – | 2020 | 50% | shamanism |
| 14 | Drumming, Voices, and Sudden Rain in the Woods | consciousness_practices | – | 2020 | 50% | shamanism |
| 15 | Forty Days in Ayahuasca Visions After Solstice Ceremony | consciousness_practices | – | 2014 | 50% | shamanism, personal-experience, has-media |
| 16 | Lotus Entity Appears During Father's Final Hours | consciousness_practices | – | – | 50% | shamanism, personal-experience |
| 17 | Hawk Appears During Shamanic Practice Preparation | consciousness_practices | – | 2020 | 50% | shamanism, ancient-ways |
| 18 | Grandfather's Final Gifts and the Bunny Visitations | consciousness_practices | – | – | 50% | shamanism |
| 19 | Giant Caterpillar Appears in Lower-World Journey | consciousness_practices | – | – | 50% | shamanism, question, personal-experience |
| 20 | Owl Vision During DMT Followed by Real Encounter | consciousness_practices | – | 2020 | 50% | shamanism, personal-experience |
| 21 | Psilocybin Shifts Nightmare Endings From Tragedy to Resolution | consciousness_practices | – | – | 50% | shamanism, ah.-funny., personal-experience |
| 22 | Rune Council of 33 Entities Appears in Meditation | consciousness_practices | – | 2020 | 50% | shamanism, personal-experience |
| 23 | Three Dead Animals Appear in Backyard Within Weeks | consciousness_practices | – | 2018 | 50% | shamanism |
| 24 | Priestess Reveals Past-Life Guardian Role in Shamanic Journey | consciousness_practices | – | 2018 | 50% | shamanism |
| 25 | Three Animals Guide Witness Into Tower of Light | consciousness_practices | – | 2018 | 50% | shamanism |

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
- **Hits:** 2000
- **Expected:** Modern orb / sphere / ball-of-light UFO reports.

| # | Report title | Category | State | Year | Confidence | Tags sample |
|---|---|---|---|---:|---:|---|
| 1 | 12-Foot Orange Orb Follows Car Through North Charleston | ufos_aliens | South Carolina | 2024 | 100% | ufo, nuforc, orb, spherical |
| 2 | Lights Rise From Cliff, Accelerate East at Extreme Speed | ufos_aliens | New York | 2024 | 50% | ufo, nuforc, fireball, bright |
| 3 | White Triangle with Red Center Lights Hovers Over Cornfield | ufos_aliens | Missouri | 2024 | 50% | ufo, nuforc, triangle, triangular |
| 4 | Large Black Rectangle Vanishes Over Lexington | ufos_aliens | South Carolina | 2024 | 50% | ufo, nuforc, rectangle, rectangular |
| 5 | Oval Object Moves Abnormally Over Motorsports Park | ufos_aliens | California | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 6 | Deep Orange Sphere Hovers Low Over Edwinstowe Garden | ufos_aliens | England | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 7 | Diamond-Shaped Object Leaves Light Trail Over Gaziantep | ufos_aliens | Gaziantep | 2025 | 50% | ufo, nuforc, diamond, rhombus |
| 8 | Dark Orb with Red Corona Follows Kite in Highland | ufos_aliens | Indiana | 2025 | 100% | ufo, nuforc, orb, spherical |
| 9 | Teardrop Silhouette Crosses Shelbyville Sky at High Speed | ufos_aliens | Illinois | 2025 | 50% | ufo, nuforc, teardrop, pear-shaped |
| 10 | Orb Responds to Flashlight Signal Over Ashland Park | ufos_aliens | Oregon | 2025 | 100% | ufo, nuforc, light, lights |
| 11 | Luminous Sphere Splits Into Three Over Internet Tower | ufos_aliens | Ceará | 2025 | 100% | ufo, nuforc, circle, circular |
| 12 | Golden Saucer Hovers Over York Residence | ufos_aliens | Pennsylvania | 2025 | 50% | ufo, nuforc, disk, disc |
| 13 | Three Spheres Move Strangely Above Turpin Trees | ufos_aliens | Oklahoma | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 14 | Asteroid-Shaped Object Rotates Over Jensen Beach | ufos_aliens | Florida | 2025 | 50% | ufo, nuforc, cigar, cylindrical |
| 15 | Orangy-Red Sphere Hovers Then Vanishes Over West Bellaire | ufos_aliens | Ohio | 2025 | 100% | ufo, nuforc, sphere, spherical |
| 16 | Pulsing Orb Halts Over Ingonish, Nova Scotia | ufos_aliens | Nova Scotia | 2025 | 100% | ufo, nuforc, orb, spherical |
| 17 | Silver Sphere Accelerates Toward Fairhaven Bridge | ufos_aliens | Massachusetts | 2025 | 100% | ufo, nuforc, circle, circular |
| 18 | Three Lights Merge and Vanish Over Pyeongchang-gun | ufos_aliens | – | 2025 | 50% | ufo, nuforc, oval, elliptical |
| 19 | Bright Object Rises and Accelerates Over Redding, California | ufos_aliens | California | 2025 | 50% | ufo, nuforc, unknown, bright |
| 20 | Cigar Object Executes Impossible Turns Over Belfast Railway | ufos_aliens | Northern Ireland | 2025 | 50% | ufo, nuforc, cigar, cylindrical |
| 21 | Colored Lights and Bedroom Paralysis in Minas Gerais | ufos_aliens | State of Minas Gerais | 2025 | 50% | ufo, nuforc, light, lights |
| 22 | Round Glowing Object Crosses Airplane Path Over Loanhead | ufos_aliens | Scotland | 2025 | 100% | ufo, nuforc, circle, circular |
| 23 | Hairless Five-Foot Being Enters Disc Craft in Key Largo | ufos_aliens | Florida | 2025 | 50% | ufo, nuforc, disk, disc |
| 24 | Two White Lights Descend Over Cannon Air Force Base | ufos_aliens | New Mexico | 2025 | 50% | ufo, nuforc, unknown |
| 25 | White Disc Hovers Over Treeline in Broad Daylight | ufos_aliens | Maine | 2025 | 50% | ufo, nuforc, disk, disc |

## Aggregate counts

- Watchlists evaluated: 10
- Returned ≥1 match: 8
- Returned 0 matches: 2
- Errored: 0
- Total matches across all watchlists: 11592

---

Operator action: for each watchlist with hits, scan the sample table and mark any row that does not actually meet the criteria. >5% off-target across the smoke fails the precision gate; tune match-engine.ts and re-run.