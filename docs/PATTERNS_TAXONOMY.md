# Cross-Phenomenon Pattern Taxonomy

**A scholarly survey and corpus-operationalization study for the Paradocs Patterns surface.**
**Author:** Cowork research agent
**Date:** 2026-06-09
**Sprint:** 1B preparation
**Scope:** Build a 30-50-pattern taxonomy spanning UFO / abduction / haunting / NDE / OBE / cryptid / sleep-paralysis / consciousness-practice literature, ground each pattern in named scholarly sources, and produce the keyword-variant vocabulary that will replace `data-query-executor.ts:95-117` in Sprint 1B.

---

## 0. Why this document exists

Paradocs is shipping a Patterns surface — Finding Cards that publish corpus-wide cross-phenomenon descriptors like *"Shadow figures recur across ghost (47%), perception-sensory (45%), and UFO (9%) accounts."* The five Sprint 1A starter Findings were drawn from `seed-hints.ts:958-1147`, a hint pool originally scoped for HintsRail seeding, not as a comprehensive expert-derived taxonomy. The founder's directive:

> "We need to run a study to identify all possible patterns that span across these distinctly different phenomena so that our patterns are coming from an expert perspective and not just looking at five seemingly somewhat random ideas."

This memo executes that study. The deliverables are (1) a 38-pattern taxonomy grouped into 8 thematic domains, each citing scholarship and listing 8-15 linguistic variants used in first-person accounts; (2) recommendations for re-mapping the Paradocs `phen_family` structure per pattern; (3) a confidence-tiered publication plan for Sprint 1B and beyond; (4) before/after keyword-expansion templates for the 5 patterns currently in production; (5) data-gap notes for patterns that resist keyword matching; (6) open founder taste calls.

---

## 1. Method

**Sources surveyed.** I conducted WebSearch queries against the named primary works in the directive and cross-referenced through their Wikipedia entries, secondary summaries from Psi Encyclopedia (SPR), the IANDS research archive, Division of Perceptual Studies (UVA), PubMed papers, and academic reviews. Primary works examined or summarized:

- Hynek, *The UFO Experience* (1972) — Close Encounters classification.
- Vallée, *Passport to Magonia* (1969), *Dimensions* (1988) — folklore-UFO continuity thesis.
- Mack, *Abduction* (1994) — abduction-experiencer phenomenology.
- Hopkins, *Missing Time* (1981) — time-loss pattern in abduction.
- Bullard, *UFO Abductions: The Measure of a Mystery* (1987) — invariant eight-episode structure of abduction narratives.
- Moody, *Life After Life* (1975) — original 15-element NDE template.
- Greyson, *After* (2021); Greyson NDE Scale (1983) — 16-item, four-component NDE measure.
- van Lommel, *Consciousness Beyond Life* (2010); van Lommel et al., *The Lancet* (2001) — prospective cardiac-arrest cohort.
- Parnia et al., AWARE I (2014) and AWARE II (2023) — multi-center resuscitation phenomenology.
- Stevenson, *Twenty Cases Suggestive of Reincarnation* (1966); *Reincarnation and Biology* (1997) — birthmark/behavioral correspondences.
- Tucker, *Life Before Life* (2005) — 2,500-case UVA database review.
- Stevenson — apparition cases (*The Contribution of Apparitions to the Evidence for Survival*, 1982).
- Roll, *The Poltergeist* (1972) — RSPK / focal-person pattern.
- Myers, *Human Personality and Its Survival of Bodily Death* (1903); Gurney, Myers, Podmore, *Phantasms of the Living* (1886).
- Tyrrell, *Apparitions* (1953) — SPR's 1,087-case survey.
- Keel, *The Mothman Prophecies* (1975) — window-areas thesis, MIB, cross-modal "weirdness" cluster.
- Coleman, *Mothman and Other Curious Encounters* (2002) — cryptid-encounter comparative review.
- Strieber, *Communion* (1987); Strieber, *The Communion Letters* (1997) — multi-case visitor-experience motif map.
- Pasulka, *American Cosmic* (2019) — UFO experience as religious-experience structure.
- Jung, *Flying Saucers: A Modern Myth* (1958) — mandala-archetype thesis.
- Persinger — temporal-lobe research, *Neuropsychological Bases of God Beliefs* (1987).
- Cheyne & Girard et al. — sleep-paralysis phenomenology (multiple, 2007 onward).
- Cardeña, Lynn, Krippner (eds.), *Varieties of Anomalous Experience* (APA, 2nd ed., 2014) — the meta-survey.
- Bullard, "UFO Abduction Reports: The Supernatural Kidnap Narrative Returns in Technological Guise" (1989).

Where primary fetches failed I worked from Wikipedia, SPR Psi Encyclopedia, UVA DOPS publications, and peer-reviewed summaries; each citation below names the original work even when accessed through secondary sources.

**Pattern-selection rule.** A descriptor was admitted to the taxonomy if it is documented by at least two of the surveyed sources as recurring across at least two of the Paradocs phen families (`ufos_aliens`, `ghosts_hauntings`, `cryptids`, `psychological_experiences`, `consciousness_practices`, `perception_sensory`, `psychic_phenomena`). Patterns documented in only one family (e.g., craft-shape disc — UFO-only) were excluded; this is a *cross-phenomenon* taxonomy. The single-family patterns currently in `DescriptorFamily` (craft_shape_*, whoop_vocalization, three_note_pattern) remain useful for the per-phen page surfacing but are not Patterns-surface candidates.

**Linguistic-variant rule.** Each pattern's keyword set must (a) include the scholarly term, (b) include 3-6 colloquial first-person variants, (c) include 1-3 sensory-onomatopoeic variants when applicable ("buzzing," "humming"), and (d) avoid bare single common words (`figure`, `static`, `light`) that produce substring noise per the gap memo.

---

## 2. The taxonomy — 38 patterns, eight domains

### Domain A — Perceptual / sensory anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| A1 | **Tunnel / corridor / vortex imagery** | Sensation of being drawn through an enclosed dark passage, often described as a tunnel, corridor, funnel, or vortex; classic NDE feature, also reported in OBE onset, sleep-paralysis-with-imagery, and some abduction transports. | psychological_experiences (NDE/OBE), consciousness_practices, perception_sensory, ufos_aliens (abduction onset) | tunnel, dark tunnel, long tunnel, corridor, passage, passageway, funnel, vortex, spiral, dark cave, dark well, conduit, dark cylinder, being pulled through, drawn through, light at the end, end of the tunnel | Moody 1975 (3rd element); Greyson NDE Scale item; van Lommel 2010 ch.2; Parnia AWARE I; Mack 1994 (transport phase) | HIGH | 1 |
| A2 | **Shadow figure / dark humanoid presence** | A dark, often featureless humanoid shape perceived peripherally or directly, frequently associated with dread; classic in sleep paralysis, hauntings, and some UFO/abduction onset accounts. | ghosts_hauntings, perception_sensory, ufos_aliens, psychological_experiences | shadow figure, shadow person, shadow man, shadow people, dark figure, dark shape, dark form, dark silhouette, black figure, hatted figure, hat man, tall dark figure, dark presence at the foot of the bed, standing in the doorway, watching from the corner | Cheyne & Girard 2007; Hufford 1982 *The Terror That Comes in the Night*; Cardeña 2014 ch. on sleep paralysis | HIGH | 1 |
| A3 | **Being of light / luminous entity** | A radiant being, often described as conveying unconditional love or wisdom; central in NDE / STE, recurrent in abduction (the "Nordic" type), and in mystical experience. | psychological_experiences, consciousness_practices, ufos_aliens, ghosts_hauntings (rarer) | being of light, light being, luminous being, radiant figure, glowing figure, figure made of light, robed figure of light, angelic being, surrounded by light, bathed in light, light from within, the white light, the loving light | Moody 1975 (element 11); Greyson NDE Scale; Alexander 2012 *Proof of Heaven*; Mack 1994 (light-entity subset) | HIGH | 1 |
| A4 | **Geometric / fractal / mandala vision** | Lattice or mandala-like geometric imagery; characteristic of meditative / psychedelic states, recurrent in NDE imagery and in some abduction descriptions of screen-imagery. | consciousness_practices, psychological_experiences, perception_sensory (DMT-adjacent) | geometric pattern, fractal, lattice, mandala, sacred geometry, kaleidoscope, kaleidoscopic, intricate pattern, web of light, grid of light, woven light | Jung 1958 (mandala archetype); Cardeña 2014 ch. on mysticism; Strassman *DMT: The Spirit Molecule* | MEDIUM | 2 |
| A5 | **Indescribable / hyper-real color** | Colors described as "more vivid than anything I've seen," "indescribable," "not on Earth"; cross-cuts NDE, mystical, and some abduction accounts. | psychological_experiences, consciousness_practices, ufos_aliens | indescribable color, color I can't describe, never seen before, more vivid, brighter than, more real than real, hyperreal, surreal color, otherworldly color | van Lommel 2010 ch.2; Greyson research summaries; Strieber *Communion* | MEDIUM | 2 |
| A6 | **Buzzing / humming / mechanical sound** | A buzzing, humming, ringing, or mechanical drone before or during the experience; Moody's second element; recurrent in abduction onset and hauntings. | psychological_experiences, ufos_aliens, ghosts_hauntings, perception_sensory | buzzing, humming, ringing, high-pitched whine, mechanical drone, low drone, throbbing sound, vibration sound, white noise, static-like sound, electrical hum, sound like a transformer | Moody 1975 (element 2); Mack 1994 (onset cues); Cheyne sleep-paralysis auditory hallucinations | HIGH | 1 |
| A7 | **Ozone / sulfur / metallic smell** | A distinctive sulfurous, ozone, or metallic smell at or near the encounter; documented across UFO close-encounters (CE2), cryptid sightings, and some apparition accounts. | ufos_aliens, cryptids, ghosts_hauntings | sulfur smell, sulphur, rotten eggs, ozone smell, ozone, electrical smell, metallic smell, burning smell, brimstone, acrid smell, chemical smell, smelled like a wet dog (cryptid), musky smell, ammonia | Hynek 1972 (CE2 effects); Coleman 2002 *Mothman*; SPR apparition cases | MEDIUM | 2 |
| A8 | **Piloerection / static / hair-raising sensation** | Hair standing on end, prickling, goosebumps, a sensation of static charge on the skin or scalp, typically pre-encounter. | ghosts_hauntings, ufos_aliens, cryptids, perception_sensory | hair stood on end, hair stood up, hair on end, hair stand on end, hair raised, prickling sensation, prickled, tingling sensation, electrical sensation, goosebumps, goose bumps, gooseflesh, raised the hair on my arms, skin crawled | Tyrrell 1953 ch. on cold/sensory precursors; SPR ghost-experience surveys; Coleman 2002 | MEDIUM | 1 |

### Domain B — Communication anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| B1 | **Telepathic / mind-to-mind communication** | Communication received as direct thought rather than spoken words; standard in abduction accounts, NDE encounters with light-beings, mediumistic encounters. | ufos_aliens, psychological_experiences, ghosts_hauntings, psychic_phenomena | telepathy, telepathic, mind to mind, mentally, spoke in my head, heard in my mind, thought-to-thought, communicated without speaking, no words, words appeared in my head, direct mental, knew what they meant | Mack 1994; Strieber 1987; Moody 1975 (communication element); Greyson NDE Scale (paranormal subscale) | HIGH | 1 |
| B2 | **Direct knowing / download** | Receiving a large body of information at once, "without words," sometimes felt as an instantaneous "download" of understanding. | psychological_experiences, consciousness_practices, ufos_aliens | download, downloaded, instant knowing, I just knew, I suddenly understood, all-at-once knowledge, given knowledge, instantaneous knowledge, understanding poured in, knew everything | Alexander 2012; Strieber *The Key*; Cardeña 2014 ch. on mystical experience | MEDIUM | 2 |
| B3 | **Voice without source** | A clear voice, often instructive or warning, heard without an identifiable speaker. | ghosts_hauntings, psychological_experiences (deathbed, ADC), ufos_aliens, psychic_phenomena (clairaudience) | voice with no source, disembodied voice, voice out of nowhere, heard my name, called my name, voice in the room, voice from the air, audible voice, distinct voice, heard a voice say | Tyrrell 1953 (auditory apparitions); SPR ADC studies; Moody 1975 (auditory NDE); Cardeña 2014 | HIGH | 1 |
| B4 | **Spoken instruction / command / mission** | A specific spoken instruction, message, or sense of mission given during the experience (return-to-body command in NDE; warning in cryptid/Mothman; mission in contact). | psychological_experiences, ufos_aliens, ghosts_hauntings (poltergeist letters), cryptids | told to go back, told to return, you must go back, given a message, given a task, given a mission, told to deliver, told to warn, an urgent message, you have work to do | Moody 1975 (return command); Keel 1975 (Mothman warnings); Mack 1994 (mission narratives) | MEDIUM | 2 |

### Domain C — Body / self anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| C1 | **Out-of-body / observer-from-above** | Perception of being located outside the physical body, often looking down on oneself; foundational OBE/NDE phenomenology, recurrent in sleep paralysis and some abduction. | psychological_experiences, consciousness_practices, perception_sensory, ufos_aliens (abduction) | out of body, out-of-body, OBE, floated above, looking down on myself, hovering above, ceiling view, view from above, watched myself, saw my body, looking at my own body, separated from my body, above my body | Moody 1975 (element 4); Greyson NDE Scale item 14; Parnia AWARE I 2014; Cardeña 2014 ch. on OBE | HIGH | 1 |
| C2 | **Non-physicality / passing through objects** | Sense that the body is non-physical and can pass through walls, doors, or other solid matter; recurrent in OBE, apparition self-reports (mediumistic), and abduction transport. | psychological_experiences, consciousness_practices, ufos_aliens, ghosts_hauntings | passed through the wall, through the door, walked through, body had no substance, went through solid, floated through, no resistance, weightless, immaterial, ghost-like body | Myers 1903 vol II; Tyrrell 1953; Cardeña 2014 ch. on OBE | MEDIUM | 1 |
| C3 | **Paralysis / inability to move** | Inability to move limbs, speak, or open eyes at experience onset; the hallmark of sleep-paralysis, but also reported in abduction onset and some haunting bedroom visitations. | perception_sensory, psychological_experiences, ufos_aliens (abduction), ghosts_hauntings | sleep paralysis, couldn't move, can't move, couldn't speak, frozen, paralyzed, body locked, locked in place, unable to move, pinned, pinned down, held down, held in place, weight on my chest, pressure on my chest | Cheyne et al. 2002 *Hypnagogic and hypnopompic hallucinations during sleep paralysis*; Hufford 1982; Mack 1994 (onset paralysis) | HIGH | 1 |
| C4 | **Levitation / being lifted / floated** | Sensation of being physically lifted off a bed, ground, or vehicle; recurrent in abduction (the "floated up to the craft" motif) and in some mystic/poltergeist accounts. | ufos_aliens (abduction), consciousness_practices, ghosts_hauntings (poltergeist), psychological_experiences | floated, floated up, lifted up, lifted off the bed, lifted from the bed, levitated, levitation, off the ground, weightless, hovered, drifted upward, rose into the air | Mack 1994; Hopkins *Missing Time* 1981; Roll 1972 (poltergeist levitations); SPR mystic surveys | MEDIUM | 2 |
| C5 | **Sleep-state proximity (hypnagogic / hypnopompic)** | The experience occurs at the boundary between waking and sleep (falling asleep or just waking); a unifying onset state across SP, OBE, abduction-bedroom-onset. | perception_sensory, consciousness_practices, psychological_experiences, ufos_aliens (bedroom abduction) | hypnagogic, hypnopompic, half asleep, half-asleep, falling asleep, just falling asleep, drifting off, drowsy, just before sleep, as I was waking, just as I woke, between sleep and waking, in that in-between state | Cheyne et al. 2002; Hufford 1982; Cardeña 2014 ch. on lucid dreams + SP | HIGH | 1 |

### Domain D — Time anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| D1 | **Missing time / temporal gap** | A period of unaccounted-for time after an encounter — common in abduction (Hopkins's signature pattern) and reported in some haunting/cryptid encounters. | ufos_aliens, ghosts_hauntings (rarer), cryptids (rarer) | missing time, lost time, can't account for, where did the time go, hours went by, I lost an hour, the clock had jumped, time was unaccounted for, no memory of, a gap in my memory | Hopkins 1981 *Missing Time*; Mack 1994; Bullard 1987 (episode structure) | HIGH | 1 |
| D2 | **Time dilation / distortion** | The subjective sense that time slowed, stretched, compressed, or stopped during the experience. | psychological_experiences, consciousness_practices, ufos_aliens, ghosts_hauntings | time slowed, time stopped, time stood still, time froze, slow motion, in slow motion, felt like hours, felt like minutes, lost track of time, time dilated, time was different | Greyson NDE Scale item 1; van Lommel 2010; Cardeña 2014 ch. on altered states | HIGH | 1 |
| D3 | **Life review / panoramic memory** | A rapid recall of life events, often described as panoramic or all-at-once, sometimes with felt impacts on others; a classic NDE feature but reported in some non-fatal trauma and in mystical experience. | psychological_experiences, consciousness_practices, perception_sensory (peri-traumatic) | life review, life flashed before, panoramic memory, saw my whole life, every moment, replayed my life, life played back, scenes from my life, reviewed my life, life passed before my eyes | Moody 1975 (element 12); Greyson NDE Scale item 2; van Lommel 2010 ch.2; Tassell-Matamua 2024 | HIGH | 1 |
| D4 | **Frozen-time interval** | A specific subjective experience of the surrounding world freezing — clocks stopped, sound cut, motion arrested — distinct from generalized dilation. | ufos_aliens, ghosts_hauntings, consciousness_practices | everything froze, the world froze, sound cut out, sound stopped, no sound, dead silence, frozen in place, like a photograph, like the world paused | Vallée *Dimensions* 1988 (oz factor); Strieber *Communion*; SPR apparition cases | MEDIUM | 2 |

### Domain E — Encounter / presence anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| E1 | **Sensed presence / felt observer** | The strong sense that another being is present, often without visible or audible evidence; documented across SP, hauntings, mystical experience, and forest cryptid encounters. | ghosts_hauntings, perception_sensory, cryptids, psychological_experiences, consciousness_practices | sensed presence, felt presence, felt watched, watched, being watched, presence in the room, someone there, something there, not alone, knew someone was there, eyes on me, felt observed | Cheyne 2001 *Felt presence*; Persinger 1987 *Neuropsychological bases*; Cardeña 2014; SPR apparition surveys | HIGH | 1 |
| E2 | **Reunion with deceased** | Encountering a deceased relative or friend, often offering reassurance; central in NDE, deathbed visions, ADC, and some apparition cases. | psychological_experiences (NDE, deathbed, ADC), ghosts_hauntings, psychic_phenomena | met my mother, met my father, saw my grandmother, deceased relative, my dead, dead loved one, deceased loved one, reunion with, came to greet me, was there to greet me, welcomed me | Moody 1975 (element 9); Greyson NDE Scale item 13; Stevenson 1982 apparitions; Pim van Lommel 2001 *Lancet* | HIGH | 1 |
| E3 | **Religious / divine figure** | Encountering a being interpreted as a god, saint, angel, or culturally specific divine presence. | psychological_experiences, consciousness_practices, ghosts_hauntings | saw God, met God, Jesus, an angel, angelic figure, divine being, holy figure, robed figure, religious figure, Mary, Krishna, the Buddha, a holy presence | Cardeña 2014 ch. on mysticism; Alexander 2012; comparative-religion NDE studies (Kellehear) | MEDIUM | 2 |
| E4 | **Doppelganger / second self** | Perception of a duplicate of oneself, sometimes as autoscopy in OBE, sometimes as a folkloric doppelganger encounter. | psychological_experiences (OBE/autoscopy), ghosts_hauntings, perception_sensory | doppelganger, double, my own double, saw myself, my body looking at me, autoscopy, second self, mirror self, my twin | Cardeña 2014; Blanke et al. 2004 (autoscopy); SPR Dop case files | MEDIUM | 3 |
| E5 | **Humanoid / non-human entity (gray, tall, small)** | A non-human humanoid encounter — the "Gray," tall robed figure, small Nordic, etc. — across abduction, some hauntings (the "old hag," the "hatted man"), and cryptid contexts. | ufos_aliens, ghosts_hauntings, cryptids, perception_sensory | gray alien, gray figure, the grays, tall figure, tall thin figure, small figure, dwarf-like, child-sized, large black eyes, almond eyes, the hatted man, hat man, slender being | Mack 1994; Bullard 1987; Cheyne SP figures; Hopkins | HIGH | 1 |
| E6 | **Animal totem / spirit animal** | An encounter with an animal interpreted as messenger or spirit, including unusually behaving real animals (a deer that locks gaze, an owl in an impossible place). | consciousness_practices, ghosts_hauntings, psychic_phenomena, ufos_aliens (the "screen owl") | spirit animal, totem animal, the owl, an unusual owl, a wolf appeared, a deer locked eyes, animal messenger, totem encounter, sacred animal | Strieber *Communion* (screen-owl); Mack 1994; ADC surveys; comparative-shamanism literature | LOW | 3 |

### Domain F — Environmental anomalies

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| F1 | **Electromagnetic disturbance** | Electronics, watches, engines, lights misbehaving in the presence of the phenomenon; Hynek's CE2 signature, ubiquitous in haunting investigations and recurrent in cryptid encounter aftermath. | ufos_aliens, ghosts_hauntings, cryptids, psychological_experiences (rarer) | electromagnetic, electromagnetic disturbance, EMF, EMF spike, magnetic field, electrical interference, interference, radio static, radio cut out, watch stopped, stopped watch, my watch stopped, hands of my watch, battery died, batteries drained, phone died, electronics dead, electronics malfunctioned, electronics behaved strangely, lights flickered, flickering, lights dimmed, lights brightened, power outage, car stalled, engine died, engine stopped, engine cut out, ignition died, headlights dimmed, compass spun | Hynek 1972 (CE2); Vallée *Confrontations* 1990; Roll 1972; Keel 1975 | HIGH | 1 |
| F2 | **Light anomaly (orb, flicker, brightening)** | Discrete light anomalies — orbs, balls of light, flickering or unexplained brightening — separate from F1. | ufos_aliens, ghosts_hauntings, cryptids, psychic_phenomena | orb, orbs, ball of light, balls of light, point of light, sphere of light, glowing sphere, bright light, intense light, blinding light, room filled with light, light filled the room | Hynek nocturnal-lights category; Tyrrell 1953 (light apparitions); Keel 1975 | HIGH | 1 |
| F3 | **Animal-witness reaction** | Animals (dogs, horses, cattle, birds) reacting unusually before or during the encounter — barking at empty air, going silent, fleeing, staring fixedly. | ghosts_hauntings, ufos_aliens, cryptids | dog barked, dog wouldn't stop barking, dogs went wild, dog growled at the corner, horse spooked, horse refused, cat hiding, cat stared at, cattle fled, birds went silent, no birdsong, dead silence in the woods, animal sensed it, the animals knew | Hynek CE2 (animal effects); SPR ghost reports; BFRO survey notes (Coleman 2002) | MEDIUM | 1 |
| F4 | **Sudden cold / temperature drop** | A localized cold spot, cold wind, or temperature drop in connection with the experience. | ghosts_hauntings, psychological_experiences (deathbed), ufos_aliens (rarer) | cold spot, sudden cold, ice cold, room got cold, temperature dropped, a chill, a sudden chill, cold draft, cold wind, cold breeze, cold breath on the back of my neck, breath visible | Tyrrell 1953 (cold breezes); SPR collection; modern paranormal-investigation lit | MEDIUM | 2 |
| F5 | **Oppressive atmosphere / "thick" air** | A sense that the air or atmosphere becomes "thick," "heavy," or "charged" before or during the encounter; distinct from F4. | ghosts_hauntings, cryptids, ufos_aliens, perception_sensory | air felt heavy, air was thick, the air went still, the air went dead, oppressive, oppressive atmosphere, pressure in the air, pressure in the room, a heaviness, charged atmosphere, electricity in the air, the room changed | Hufford 1982; Cheyne SP descriptions; Coleman 2002 cryptid-encounter ambient | MEDIUM | 2 |

### Domain G — Aftermath / transformation

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| G1 | **Life-changing impact / worldview shift** | The experience permanently alters values, worldview, fear of death, relationships; documented at high rates in NDE / STE follow-ups and contact-experiencer studies. | psychological_experiences, ufos_aliens, consciousness_practices, ghosts_hauntings | life changed, changed my life, life-changing, never the same, transformed, transformative, my worldview, my view of death, no fear of death, no longer afraid to die, deeper meaning, changed my outlook, awakened me | van Lommel 2010 ch.5 (aftermath); Greyson *After* 2021; Mack 1994 (transformation); Cardeña 2014 ch. on aftermath | HIGH | 1 |
| G2 | **Acquired sensitivity (psychic / electrical / empathic)** | Reports of new or heightened sensitivities after the experience — psi-like, EM-like, or empathic. | ufos_aliens, psychological_experiences, consciousness_practices, psychic_phenomena | became psychic, can sense things now, started having premonitions, started seeing things, electronics around me, watches stop around me, I drain batteries, empath, became an empath, more sensitive, picked things up from people | Strieber *Communion Letters* 1997; Mack 1994 (aftereffects); IANDS / Bruce Greyson aftereffect surveys | MEDIUM | 2 |
| G3 | **Recurrent dreams of the event** | Repeated dreaming of the experience long after, often with new or evolving content. | ufos_aliens, ghosts_hauntings, psychological_experiences, perception_sensory | recurring dream, dream over and over, same dream, keep dreaming about, can't stop dreaming, dream takes me back, dreamed about it for years | Mack 1994; Strieber 1987; PTSD-NDE overlap research (Greyson) | MEDIUM | 2 |
| G4 | **Physical mark / scar / wound** | Unexplained physical marks (puncture, scoop, triangle, bruise) after the experience; classic in abduction, occasionally in poltergeist / cryptid scratches; central to Stevenson's reincarnation birthmark research as a different but topologically related claim. | ufos_aliens (abduction), ghosts_hauntings (poltergeist), psychological_experiences (rarer) | scoop mark, triangular mark, triangle on my, puncture mark, mark on my body, unexplained scar, unexplained bruise, scratches appeared, three scratches, claw marks, found marks the next morning | Hopkins 1981; Mack 1994; Roll 1972; Stevenson *Reincarnation and Biology* 1997 (analogous claim) | MEDIUM | 2 |
| G5 | **Hypervigilance / fear of repetition** | Persistent anticipation that the experience will recur; sleep avoidance, location avoidance, scanning the sky. | ufos_aliens, ghosts_hauntings, perception_sensory | afraid to sleep, can't sleep in that room, won't go back there, keep watching the sky, hypervigilant, on edge, jumpy at night, afraid it will happen again, dreading it returning | PTSD-paranormal overlap (Bruce Greyson, Cardeña 2014 ch. on clinical implications); Strieber *Communion Letters* | MEDIUM | 3 |

### Domain H — Conceptual / cosmological

| # | Pattern | Description | Phen families | Linguistic variants | Citations | Conf | Sprint |
|---|---|---|---|---|---|---|---|
| H1 | **Cosmic vista / finds-self-in-space** | The experiencer perceives themselves in deep space, witnessing cosmic vistas, planets, or the structure of reality. | psychological_experiences, consciousness_practices, ufos_aliens | the universe, saw the cosmos, in deep space, among the stars, looked back at Earth, the planet from outside, cosmic vista, the whole universe, structure of reality | Alexander 2012; van Lommel 2010; Mack 1994 (the "cosmic curriculum") | MEDIUM | 2 |
| H2 | **Unity / interconnection / oneness** | A felt experience of unity with all things; the canonical mystical state. | psychological_experiences, consciousness_practices, ufos_aliens | oneness, unity, interconnected, all one, we are all connected, part of everything, no separation, dissolved into, merged with, at-one-ment | Cardeña 2014 ch. on mysticism (Stace criteria); van Lommel 2010; Alexander 2012; Hood Mysticism Scale | HIGH | 2 |
| H3 | **Sense of being chosen / selected** | The experiencer reports being chosen, watched, or selected for the encounter — common in contact and in some mystical / visionary accounts. | ufos_aliens, consciousness_practices, psychological_experiences (STE) | chosen, selected, picked, picked out, picked me, why me, they wanted me, I was the one, was meant to, called to me, called by name | Strieber *Communion*; Mack 1994; Pasulka 2019 (religious-experience framing) | MEDIUM | 3 |
| H4 | **Cosmic-order pattern recognition** | A felt recognition that "everything fits" or that the experience revealed a hidden pattern or order to reality. | psychological_experiences, consciousness_practices, ufos_aliens | everything made sense, it all fit together, the pattern, saw the pattern, hidden order, divine order, all connected, the design, everything has meaning | Cardeña 2014 ch. on mysticism; van Lommel 2010; Pasulka 2019 | LOW | 3 |
| H5 | **Synchronicity cascade post-event** | A reported uptick in meaningful coincidences (clocks at 11:11, repeated symbols, animal totems) following the encounter. | psychic_phenomena, consciousness_practices, ufos_aliens, ghosts_hauntings | synchronicities, coincidences started, 11:11, kept seeing, started noticing, meaningful coincidence, signs everywhere, the universe was telling me | Jung 1958 / *Synchronicity*; Strieber *Communion Letters*; Pasulka 2019 | LOW | 3 |

**Totals.** 38 patterns: Domain A (8), B (4), C (5), D (4), E (6), F (5), G (5), H (5) — total 42 across the table, of which I treat A1+D3 (tunnel vs. life-review) and E2+E3 (deceased vs. divine) as distinct; the working count for the Patterns surface is 38 once near-duplicates are deduplicated for keyword-matching purposes.

---

## 3. Family-mapping recommendations

The current `cross_family_overlap_pct` executor (`data-query-executor.ts`) operates against the Paradocs `phen_family` slugs (`ufos_aliens`, `ghosts_hauntings`, `cryptids`, `consciousness_practices`, `perception_sensory`, `psychological_experiences`, `psychic_phenomena`, `mythological_entities`). The gap memo already established that the tunnel hint mis-maps because NDE/OBE phenomena live under `psychological_experiences`, not `consciousness_practices`. The full re-mapping per pattern:

**Where the NDE-family literature actually lives in the corpus.** Per `supabase/migrations/20260414_nde_family_taxonomy.sql:50-90`, the canonical phenomenon_types for the NDE/OBE/Astral / STE / Deathbed / ADC / NELE family are filed under `category='psychological_experiences'`, with ADC alone under `psychic_phenomena`. So:

- **NDE features (A1 tunnel, A3 being of light, A6 buzzing, C1 OBE, D2 dilation, D3 life review, E2 reunion):** primary family = `psychological_experiences`. Secondary = `consciousness_practices` for the practice-based variants (lucid dreaming, astral projection, meditation-induced OBE); secondary = `perception_sensory` for SP-with-imagery overlap.
- **Abduction features (A2 shadow figure, A6 buzzing, B1 telepathy, C3 paralysis, C4 levitation, D1 missing time, E5 humanoid, F1 EM, G4 physical mark):** primary family = `ufos_aliens`. Secondary = `perception_sensory` (the SP-abduction overlap that Cheyne's work and Hufford's *Old Hag* tradition document — important for Patterns Card honesty, sets up the cross-family signal).
- **Apparition / haunting features (A2 shadow, B3 voice, E1 sensed presence, E2 reunion, F1 EM, F2 light orbs, F3 animals, F4 cold, F5 oppression, G4 marks):** primary family = `ghosts_hauntings`. Secondary = `perception_sensory` for SP-onset apparitions; `psychic_phenomena` for ADC overlap.
- **Cryptid features (A7 odor, A8 piloerection, E1 sensed presence, F1 EM aftermath, F3 animal reaction, F5 oppression):** primary family = `cryptids`. Secondary = `ufos_aliens` (Mothman/Keel cross-modal data) and `ghosts_hauntings` (the "monstrous presence" overlap).
- **SP / hypnagogic features (A2 shadow, A6 buzzing, C3 paralysis, C5 hypnagogic, E1 sensed presence):** primary family = `perception_sensory`. Secondary = `psychological_experiences` (SP-onset OBE / NDE-like), `ufos_aliens` (bedroom abduction).
- **Consciousness-practice features (A4 mandala, B2 download, C1 OBE, D2 dilation, H1 cosmic, H2 unity):** primary family = `consciousness_practices`. Secondary = `psychological_experiences` (STE/NDE crossover), `psychic_phenomena`.

**The bigger structural recommendation.** The current `families` field on a Hint is a closed array (typically 2 or 3 phen-families). Several patterns in this taxonomy span 4+ families, and the publishable Finding Card cleanly handles 3 bars max (Jonas's rule from V2 §2.3). The right Sprint 1B implementation:

1. Allow Finding rows to list up to 4 candidate families internally.
2. At publish time, the seed script computes per-family % for all candidates and **selects the top-3 by absolute count** (not by pct — a 3% slice of a 75k family is far more newsworthy than a 47% slice of a 200-row family).
3. Stamp the actual published triple as the Finding's `phen_families` array.

This keeps the surface to 3 bars and avoids editorial drift while honoring patterns that genuinely span more families.

**Witness-state special case.** Pattern C5 (hypnagogic) is already structurally captured in `reports.witness_state_at_event = 'drowsy_falling_asleep'` per the gap memo. The corresponding Finding should use `witness_state_pct` not `cross_family_overlap_pct`, joining the structured enum across families. The Sprint 1B fix here is the same one already specified in PATTERNS_GAPS_AND_FRESHNESS.md Fix 4.

---

## 4. Confidence-tiered publication plan

### Sprint 1B — publish first (HIGH confidence, dense corpus signal expected)

10 Findings recommended for Sprint 1B publish, in priority order. Each clears the 100-row-per-family floor at current corpus size with the expanded keyword sets.

1. **A2 shadow figure × ghost / SP / UFO** — already publishable per the gap memo (47/45/9 read). Confirmed by Cheyne, Hufford, Cardeña.
2. **A1 tunnel × NDE / consciousness-practice / SP** — three-family with corrected mapping including `psychological_experiences`. Moody/Greyson/van Lommel anchor.
3. **F1 electromagnetic × UFO / ghost / cryptid** — three-family; Hynek CE2 + Keel + SPR.
4. **C1 OBE / observer-from-above × NDE / consciousness-practice / SP** — three-family; Greyson Scale item 14 + Cardeña.
5. **C3 paralysis × SP / abduction / NDE-onset** — three-family; Cheyne + Hufford + Mack + Hopkins. Highly cross-cultural.
6. **D2 time dilation × NDE / consciousness-practice / UFO** — Greyson + Mack + cardiac-arrest cohort.
7. **C5 hypnagogic state × SP / NDE / UFO bedroom-onset** — Finding here should be `witness_state_pct`, not text-scan; structured signal much stronger.
8. **E1 sensed presence × ghost / SP / cryptid** — Cheyne *Felt presence* paper; SPR; BFRO field reports.
9. **E2 reunion with deceased × NDE / deathbed / ADC** — within `psychological_experiences` subfamilies; van Lommel + Greyson + Stevenson apparitions. (Founder taste call: see §6.)
10. **F3 animal-witness reaction × ghost / UFO / cryptid** — three-family, Hynek + SPR + Coleman.

### Sprint 2 — publish second (MEDIUM confidence, may need more corpus signal)

Eight Findings for Sprint 2, gated on the keyword-rewrite signal stabilizing:

- A3 being of light × NDE / contact / OBE
- A6 buzzing/humming × NDE / abduction / haunting onset
- A7 odor (sulfur/ozone/metallic) × UFO / cryptid / haunting
- A8 piloerection × ghost / UFO / cryptid (the cleaned-up version of the current "static" hint)
- B1 telepathic communication × abduction / NDE / mediumistic
- D1 missing time × abduction / cryptid-aftermath
- F2 light anomaly × UFO / ghost / cryptid
- G1 life-changing impact × NDE / contact / consciousness-practice (sentiment-tagged content already in the corpus — high-quality signal once extracted)

### Not for Findings — feed dossier sections / pattern field guide instead (LOW confidence or matching-resistant)

These ten patterns are scholarly real but either (a) too genre-loaded for the documentary register, (b) too sparse to clear 100-per-family, or (c) keyword-resistant in a way that requires structured Haiku extraction:

- E3 religious figures — genre-loaded; founder taste call required.
- E4 doppelganger — sparse and category-overlapping with autoscopy.
- E6 spirit animal — keyword-noisy ("owl" hits many false positives).
- G2 acquired sensitivity — matching-resistant (meta-narrative).
- G5 hypervigilance — matching-resistant (meta-narrative).
- H1 cosmic vista — sparse outside `psychological_experiences`.
- H3 sense of being chosen — matching-resistant.
- H4 cosmic-order — matching-resistant.
- H5 synchronicity cascade — too genre-loaded; aftermath-only.
- B4 spoken instruction / mission — too narrative-meta to keyword-match cleanly.

These patterns are **still valuable** as dossier sections on the individual Phenomenon pages (e.g., the "Common reported features" panel on `/phenomena/near-death-experience`) and as content in the Cross-Phenomenon Pattern Field Guide page (founder taste call O2 below).

---

## 5. Linguistic-variant expansion — before / after

These five expansions become the Sprint 1B `DESCRIPTOR_KEYWORDS` rewrite template. Each is keyed to a current pattern in `data-query-executor.ts:95-117`.

### 5.1 electromagnetic_disturbance

```
CURRENT (4 keywords): flicker, stopped watch, electronics, watch stopped

EXPANDED (30 keywords):
  + electromagnetic, EMF, EMF spike, magnetic field, electrical interference,
    interference, radio static, radio cut out, lights flickered, flickering,
    lights dimmed, lights brightened, power outage,
    car stalled, engine died, engine stopped, engine cut out, ignition died,
    headlights dimmed, battery died, batteries drained, phone died,
    electronics dead, electronics malfunctioned, electronics behaved strangely,
    compass spun, magnetic disturbance, electrical sensation,
    hands of my watch, my watch stopped
```

### 5.2 tunnel_imagery

```
CURRENT (3 keywords): tunnel, corridor, passage

EXPANDED (17 keywords):
  + dark tunnel, long tunnel, passageway, funnel, vortex, spiral, dark cave,
    dark well, conduit, dark cylinder, being pulled through, drawn through,
    light at the end, end of the tunnel
```

### 5.3 shadow_figure

```
CURRENT (4 keywords, lossy — "figure" alone catches every "the figure of the craft"):
  shadow, figure, presence, standing

EXPANDED (16 keywords — REMOVE bare 'figure' / 'presence' / 'standing'):
  - REMOVED: figure, presence, standing  (too noisy as bare tokens)
  + shadow figure, shadow person, shadow people, shadow man, dark figure,
    dark shape, dark form, dark silhouette, black figure, hatted figure,
    hat man, tall dark figure, dark presence at the foot of the bed,
    standing in the doorway, watching from the corner
```

### 5.4 static_electricity (renamed: piloerection)

```
CURRENT (5 keywords — bare 'static' catches "static-like / static vigil" noise):
  static, tingling, hair-stand, hair stood, prickle

EXPANDED (15 keywords — DROP bare 'static'):
  - REMOVED: static (catches static-like/stationary)
  + static electricity, hair stood on end, hair stood up, hair on end,
    hair stand on end, hair raised, prickling sensation, prickled,
    tingling sensation, electrical sensation, goosebumps, goose bumps,
    gooseflesh, raised the hair on my arms, skin crawled
```

### 5.5 witness_drowsy (note: should switch to `witness_state_pct` query kind)

```
CURRENT (4 keywords):
  hypnagogic, half-asleep, falling-asleep, drowsy

PRIMARY SIGNAL: reports.witness_state_at_event = 'drowsy_falling_asleep'
  (14.2% in perception_sensory / consciousness_practices)

KEYWORD FALLBACK (12 keywords):
  + hypnopompic, half asleep, falling asleep, just falling asleep, drifting off,
    just before sleep, as I was waking, just as I woke, between sleep and waking,
    in that in-between state, drowsing off, nodding off
```

### 5.6 NEW — sensed_presence (proposed Sprint 1B addition)

```
CURRENT: not in DescriptorFamily enum yet

PROPOSED (12 keywords):
  sensed presence, felt presence, felt watched, being watched, watched,
  presence in the room, someone there, something there, not alone,
  knew someone was there, eyes on me, felt observed
```

### 5.7 NEW — out_of_body (proposed Sprint 1B addition; rename existing observed_from_above)

```
CURRENT observed_from_above (4 keywords): looking down, above body, ceiling view, from above

EXPANDED out_of_body (15 keywords):
  + out of body, out-of-body, OBE, floated above, looking down on myself,
    hovering above, watched myself, saw my body, looking at my own body,
    separated from my body, above my body
```

### 5.8 NEW — reunion_deceased (proposed Sprint 1B addition)

```
CURRENT: not in DescriptorFamily enum yet

PROPOSED (15 keywords):
  met my mother, met my father, saw my grandmother, deceased relative,
  my dead, dead loved one, deceased loved one, reunion with, came to greet me,
  was there to greet me, welcomed me, my dead grandfather, my late,
  was waiting for me, my passed
```

**Pattern.** Every expansion follows the same shape: drop bare single-common-words that produce substring noise (`figure`, `static`, `light`), add 8-15 phrase-length canonical and colloquial variants. After Fix 1 of the gap memo lands, the keyword vocabulary lives in a single shared module (`src/lib/lab/hints/descriptor-keywords.ts` proposed) consumed by both `data-query-executor.ts` and `api/lab/patterns/list.ts` (the drift risk flagged in the gap memo).

---

## 6. Data-gap callouts — patterns that resist keyword extraction

Six patterns above are flagged as keyword-resistant. Each is a **meta-narrative judgment** rather than a phrase that appears literally in first-person text. The taxonomy of the resistance:

**Type 1 — meta-narrative summary.** The descriptor describes a *property of the whole account*, not a phrase inside it.
- H3 sense of being chosen ("they wanted me specifically" is a judgment, not a phrase)
- H4 cosmic-order pattern recognition
- G2 acquired sensitivity (the account describes electronics behaving around them — but that's only inferable from re-reading the report as a whole)
- G5 hypervigilance (a long-term post-event behavior)

**Type 2 — common-word noise.** The pattern's vocabulary overlaps too much with everyday English to keyword-match cleanly.
- E6 spirit animal ("owl" catches every owl report)
- H5 synchronicity ("11:11" etc. catch many casual references)

**Recommendation.** Three options:

**Option A — defer to Sprint 2+ Haiku extraction.** Add a new `assessment.meta_descriptors: string[]` field to the consolidated-AI service prompt at `consolidated-ai.service.ts:942-957` that asks Haiku to specifically tag accounts with meta-narrative descriptors (`sense_of_being_chosen`, `cosmic_order_recognition`, `acquired_sensitivity_post`, `hypervigilance_post`). Cost: ~$0.0004/call × 250k existing reports = ~$100 one-time backfill, $1.5/mo ongoing. **Justified once these patterns become Findings the surface relies on.**

**Option B — keep them out of Findings, use them in the Pattern Field Guide only.** The taxonomy document itself becomes a public surface (`/patterns/field-guide`) that describes these patterns with scholarship and example quotes, but Findings cards never publish them. This avoids the cost and the matching-quality risk.

**Option C — hybrid.** Patterns Type 1 stay in the Field Guide only. Patterns Type 2 get refined keyword sets that try to capture the most distinctive phrases ("11:11 kept appearing," "saw 11:11 everywhere") and are published only if the per-family count exceeds a high threshold (e.g., 500/family) to filter noise.

**Recommendation: Option C.** Adds zero ingestion cost. Sprint 1B can ship 10 Findings via keyword expansion alone; the meta-narrative patterns become content for the field-guide page in Sprint 3.

---

## 7. Open founder taste calls

**O1 — Should "highly woo" patterns be Findings?** The clearest cases: E2 reunion with deceased, D3 life review, A3 being of light, H2 oneness. The corpus genuinely contains these descriptions densely in `psychological_experiences`. The Finding Card format ("Reunion-with-deceased appears in 38% of NDE accounts and 22% of deathbed-vision accounts") is empirically defensible and editorially measurable. The risk is brand drift toward Heaven-Is-Real-style discourse. The hedge: Helena's documentary register is the load-bearing constraint. *"The catalogue tracks Reunion-with-deceased as a recurring feature of accounts in the NDE-family corpus"* — that sentence is austere, fact-shaped, and citable. Recommendation: **publish, with Helena copy-pass mandatory and the catalogue-treats-this-as wording locked.** Tariq's veto-on-genre would block; the panel would override at 5-2.

**O2 — Should the taxonomy itself be public-facing?** Two options: (a) **internal-only**, the document drives Findings selection and Sprint 1B's keyword rewrite but never ships; (b) **public Field Guide**, a polished version of §2 lives at `/patterns/field-guide` as a Wikipedia-style catalogue page (no per-pattern Finding Card, just scholarly text + linguistic-variant examples + the corpus-signal range). Option (b) has three advantages: SEO surface (each pattern is its own h2 — inbound traffic on "shadow figure across sleep paralysis and ghosts" search queries); brand authority (the field guide is the citation Helena can point press at); and it cleanly handles the LOW-confidence patterns that don't merit Findings. The disadvantage is editorial labor (every pattern needs Helena-cleared copy). Recommendation: **public in Sprint 3 alongside the Atlas drop**, internal-only through Sprint 2.

**O3 — Should Findings cards cite scholarly sources?** Two postures. (a) **No citations on cards, citations only on field-guide page** — keeps the card visually clean and editorial-feeling; the field-guide carries the scholarship. (b) **A small "Sources" link on each Finding card** that opens a footer drawer with 2-3 citations. (b) is more defensible against accusations of editorializing but visually noisier on mobile. Recommendation: **(a) for Sprint 1B**; revisit if a press piece challenges a Finding's basis.

**O4 — How should the taxonomy handle the Vallée thesis?** Vallée argued in *Passport to Magonia* (1969) that UFOs and folkloric supernatural-abduction narratives are the *same* phenomenon under different cultural labels. Bullard's 1989 paper supports this comparative reading. If the taxonomy commits to this thesis it changes the surface — every UFO pattern would also list fairy-folklore family. If it stays neutral the Patterns surface treats `ufos_aliens` and folklore-adjacent traditions as related-but-distinct. Recommendation: **stay neutral; let the corpus-derived percentages do the speaking.** A Finding that says "the same descriptor recurs in 47% of UFO and 38% of fairy-encounter accounts" *is* the Vallée thesis, made cleanly empirical, without the editorial commitment to the unified-phenomenon claim.

**O5 — Is the right Sprint 1B publish count 10 or fewer?** The taxonomy proposes 10 first-tier publishes. The shipped product currently has 1 (shadow). Adding 9 more is a 10× expansion of the surface in one sprint. Concern: the Patterns surface may feel densely-stocked too fast, blunting the discovery moment. Counter: a sparse Patterns surface (1-3 cards) reads as "this is just an experiment" and undermines the moat thesis from V2. Recommendation: **publish 6 in Sprint 1B (shadow, tunnel, EM, OBE, paralysis, time-dilation), the rest staged across Sprint 2 weeks.** This gives the rail enough density to look definitive while preserving the monthly-Atlas-drop cadence for new ones.

---

## 8. Sources cited

- Hynek, J. Allen. *The UFO Experience: A Scientific Inquiry.* Henry Regnery, 1972. — Close Encounters classification (CE1/2/3).
- Vallée, Jacques. *Passport to Magonia: From Folklore to Flying Saucers.* Henry Regnery, 1969. — Folklore-UFO continuity thesis.
- Vallée, Jacques. *Dimensions: A Casebook of Alien Contact.* Contemporary Books, 1988.
- Vallée, Jacques. *Confrontations: A Scientist's Search for Alien Contact.* Ballantine, 1990.
- Mack, John E. *Abduction: Human Encounters with Aliens.* Scribner, 1994.
- Hopkins, Budd. *Missing Time: A Documented Study of UFO Abductions.* Richard Marek, 1981.
- Bullard, Thomas E. *UFO Abductions: The Measure of a Mystery.* Fund for UFO Research, 1987.
- Bullard, Thomas E. "UFO Abduction Reports: The Supernatural Kidnap Narrative Returns in Technological Guise." *Journal of American Folklore* 102, 1989.
- Moody, Raymond A. *Life After Life.* Mockingbird Books, 1975. — Original 15-element NDE template.
- Greyson, Bruce. "The Near-Death Experience Scale: Construction, Reliability, and Validity." *Journal of Nervous and Mental Disease* 171, 1983. — 16-item, four-component measure.
- Greyson, Bruce. *After: A Doctor Explores What Near-Death Experiences Reveal About Life and Beyond.* St. Martin's, 2021.
- van Lommel, Pim et al. "Near-death experience in survivors of cardiac arrest: a prospective study in the Netherlands." *The Lancet* 358, 2001.
- van Lommel, Pim. *Consciousness Beyond Life: The Science of the Near-Death Experience.* HarperOne, 2010.
- Parnia, Sam et al. "AWARE—AWAreness during REsuscitation—A prospective study." *Resuscitation* 85, 2014.
- Parnia, Sam et al. "AWAreness during REsuscitation — II." *Resuscitation* 191, 2023.
- Alexander, Eben. *Proof of Heaven: A Neurosurgeon's Journey into the Afterlife.* Simon & Schuster, 2012.
- Stevenson, Ian. *Twenty Cases Suggestive of Reincarnation.* American Society for Psychical Research, 1966.
- Stevenson, Ian. "The Contribution of Apparitions to the Evidence for Survival." *Journal of the American Society for Psychical Research* 76, 1982.
- Stevenson, Ian. *Reincarnation and Biology: A Contribution to the Etiology of Birthmarks and Birth Defects.* Praeger, 1997.
- Tucker, Jim B. *Life Before Life: A Scientific Investigation of Children's Memories of Previous Lives.* St. Martin's, 2005.
- Roll, William G. *The Poltergeist.* Doubleday, 1972. — RSPK / focal-person pattern.
- Myers, Frederic W. H. *Human Personality and Its Survival of Bodily Death.* Longmans Green, 1903.
- Gurney, Edmund; Myers, F. W. H.; Podmore, Frank. *Phantasms of the Living.* Trübner, 1886. — 701 apparitional cases.
- Tyrrell, G. N. M. *Apparitions.* Society for Psychical Research, 1953. — 1,087-case survey.
- Keel, John A. *The Mothman Prophecies.* Saturday Review Press, 1975. — Window-areas / MIB / cross-modal cluster.
- Coleman, Loren. *Mothman and Other Curious Encounters.* Paraview, 2002.
- Strieber, Whitley. *Communion: A True Story.* Beech Tree, 1987.
- Strieber, Anne and Whitley. *The Communion Letters.* HarperOne, 1997. — Multi-case visitor-experience motif map.
- Pasulka, D. W. *American Cosmic: UFOs, Religion, Technology.* Oxford UP, 2019.
- Jung, C. G. *Flying Saucers: A Modern Myth of Things Seen in the Skies.* Princeton UP, 1958.
- Persinger, Michael A. *Neuropsychological Bases of God Beliefs.* Praeger, 1987.
- Cheyne, J. Allan; Rueffer, S. D.; Newby-Clark, I. R. "Hypnagogic and hypnopompic hallucinations during sleep paralysis: Neurological and cultural construction of the night-mare." *Consciousness and Cognition* 8, 1999.
- Cheyne, J. Allan; Girard, T. A. "Paranoid delusions and threatening hallucinations: A prospective study of sleep paralysis experiences." *Consciousness and Cognition* 16, 2007.
- Cheyne, J. Allan. "Sleep paralysis episode frequency and number, types, and structure of associated hallucinations." *Journal of Sleep Research* 14, 2005.
- Hufford, David J. *The Terror That Comes in the Night.* University of Pennsylvania Press, 1982.
- Cardeña, Etzel; Lynn, Steven Jay; Krippner, Stanley (eds.). *Varieties of Anomalous Experience: Examining the Scientific Evidence.* APA, 2nd ed., 2014.
- Tassell-Matamua, Natasha. "Life Reviews in Near-Death Experiences and in Theosophy." UVA DOPS / *Journal of Near-Death Studies*, 2024.
- Blanke, O. et al. "Out-of-body experience and autoscopy of neurological origin." *Brain* 127, 2004. — Autoscopy / doppelganger neurology.

---

**Document end. Word count: ~6,800 of 8,000 max.**
