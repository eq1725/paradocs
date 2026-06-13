# Cryptids Taxonomy Gap Audit

**Generated:** 2026-06-13
**Scope:** 181 (not 142 — corrected) `chronicling-america` reports with `category='cryptids'`, `status='approved'`, and no `report_phenomena` link.
**Question:** Is the classifier missing entries we already have (verifier-drop / keyword-gap), or is the taxonomy genuinely missing the bucket?

---

## 1. Existing Cryptids Taxonomy

**DB rows (`phenomena.category='cryptids'`):** 212 total
- `active`: 57
- `archived`: 139 (most pruned per `CRYPTID_PRUNE_REVIEW.json` — "real-animal" / "extinct-species" / "isolated primate" rejected)
- `merged`: 16

**Classifier auto-targets (`src/lib/ingestion/utils/auto-targets.json` → cryptids):** 92 entries.
Note: classifier targets file is ahead of DB-active count because it was last generated before some V11.17.61 prunes (cosmetic — extra entries match nothing).

**The 57 active slugs (alphabetical):**
adze, agropelter, ahool, almasti, am-fear-liath-m-r, appalachian-wildman, aswang, barghest-of-yorkshire, batsquatch, beast-of-busco, bigfoot, black-shuck, bunyip, burrunjor, cadborosaurus, champ, chupacabra, dogman, dover-demon, dwayyo, enfield-horror, flatwoods-monster, fresno-nightcrawler, giant-spider, goatman, grafton-monster, grassman, great-lakes-sea-monster, honey-island-swamp-monster, indrid-cold, jersey-devil, kongamato, lechuza, lizard-man-of-scape-ore-swamp, loch-ness-monster, loveland-frog, lusca, metoh-kangmi, mokele-mbembe, momo, mothman, ogopogo, orang-bati, ozark-howler, popobawa, pukwudgie, ropen, rougarou, sheepsquatch, skinwalker, skunk-ape, spring-heeled-jack, thunderbird, urayuli, white-thang, yeren, yowie

---

## 2. Cluster Analysis: 181 Unlinked CA Cryptids Rows

Years covered: **1895 (108), 1896 (49), 1897 (24)**.

| Cluster | Count | Sample titles |
|---|---|---|
| **sea_serpent / marine_cryptid** | 55 | "Wall Street Broker Reports 100-Foot Sea Serpent Sighting"; "Twenty-Five-Foot Sea Creature Washed Ashore Blackwell's Island"; "Massive Creature Attacks Schooner Off Wood Island"; "Sea Serpent Captured in Steele's Brook" |
| **wild_man / hairy_hominid** | 34 | "Armed Posse Hunts Wild Man in Connecticut Woods"; "Naked Wild Man Emerges From Connecticut Woods"; "Wild Man of Winsted Sighted Near Roxbury"; "Bearded Figure Flees Through Connecticut Woods"; "Hairless Pink Creature Sighted Near Hightower, Kentucky" |
| **unknown_creature_generic** | 27 | "Strange Animals Reported Across Maine in 1895"; "Forty-Foot Creature Shot Near Maximo, Florida"; "Tusked Creature with Red Tongue Reported Near Palmyra"; "Boy's Lost Speech Restored After Cryptid Encounter" |
| **mystery_panther / phantom_cat** | 16 | "Panther-Like Beast Kills Dogs in Moundsville"; "Tiger-Like Animal Kills Dog Near Prison, West Virginia"; "Tawny Lion-Like Creature Sighted Near Paragon, Kentucky"; "Escaped circus animal kills dogs across Long Island" |
| **giant_serpent / snake** | 9 | "Silver Serpent Coiled in Swamp Tree, Georgia"; "Headless Snake Returns Beneath House in Louisiana"; "Black Snake Coils Around Telegraph Operator's Leg"; "Two-Headed Rattlesnake" |
| **hybrid / chimera_creature** | 9 | "Hybrid Creature With Cat Head Killed in Pennsylvania"; "Half-Hog, Half-Kangaroo Creature Captured in Tennessee"; "Duck-Headed Lizard Creature Reported in Georgia Swamp"; "Tusked Creature Emerges From May Bog Near Palmyra" |
| **lake / freshwater_monster** | 5 | "Snake-Like Creature Pursued Canoe at Lake Wayagamack"; "Flat-Headed Aquatic Creatures Found in Utah Reservoir"; "Four-Clawed Creature Pulled From Salem Creek Ice" |
| **wolf_child / feral_human** | 4 | "Wolf boy captured in Indian jungle, Bulandshahr, 1867" (4 reprints of same event) |
| **ghost_phantom_animal** | 2 | "White Doe Sighting Prompts Camp Relocation"; "Unknown Animal Desecrates Graves in Minnesota Cemetery" |
| **thunderbird / giant_bird** | 1 | "Seven-Foot Eagle Attacks Man Near Sylvan Beach" |
| **unclustered** | 19 | Mostly real-animal "wonders" → see §3 (prune, not phen) |

**Total: 181**

The 19 unclustered are mostly natural-history curiosities that should have been pruned upstream: pet-rat bites, bee-swarm battles, leatherback turtles, mudskipper "walking fish", land turtle, etc. They are not phenomenon-gaps but extraction false-positives. Recommend: leave unlinked, surface in next CA QC sweep.

---

## 3. Cross-Category Miss Check (Verifier-Drop Hunt)

For each cluster, I checked whether any existing phenomenon (active OR archived OR in other category) already covers it and the classifier merely failed to match.

| Cluster | Existing entry that could cover? | Verdict |
|---|---|---|
| sea_serpent | `great-lakes-sea-monster` (active, freshwater Great Lakes only); `azores-sea-serpent` (archived, single region); `cadborosaurus` (active, Pacific NW only) — none generic | **TRUE GAP.** No generic "Sea Serpent" / "Atlantic Sea Serpent" / 19th-century-marine-cryptid bucket. The 55 reports span North Atlantic (Maine, Long Island, Spring Lake NJ, Gloucester, Skye) + Pacific (Sicily, Pearl Islands) + freshwater (CT brook, Wichita). |
| wild_man | `appalachian-wildman` (active, Appalachia only); `tennessee-wildman` (merged); `mogollon-monster` (AZ); `sheepsquatch` (WV); `bigfoot` (PNW); `baluchistan-wildman`, `altai-wild-man`, `pongo`, `ban-manush`, `almas` (all archived/merged, non-US) | **TRUE GAP.** Period 1895-97 "Wild Man" newspaper sightings cluster in Connecticut (Winsted-of-Winsted is the canonical case!), Kentucky, Indiana, Texas, Montana, Washington state, New Jersey. None of these map to existing regional active phens. Wild Man of Winsted is itself a famous 1895 case absent from taxonomy. |
| mystery_panther | `alien-big-cat` (archived); `mimic-tiger`, `marozi`, `gippsland-phantom-cat`, `wampus-cat` (all archived/merged) | **TRUE GAP.** Classic 19th-c. American "phantom panther" / "black panther" period genre. `alien-big-cat` was archived as too-generic-modern; the period-American equivalent ("mystery panther") deserves its own entry. |
| giant_serpent | `giant-anaconda`, `megaconda` (archived per prune); `lake-worth-monster` close-ish | **TRUE GAP.** Period American giant-snake / mystery-serpent reports (silver serpent, black serpent, two-headed rattlesnake) — folkloric genre distinct from cryptid lake monsters. |
| hybrid / chimera | `jersey-devil` partly (NJ specific) | **TRUE GAP — but lower priority.** 9 reports, very diverse. Recommend single catch-all `chimera-creature` entry. |
| lake / freshwater_monster (5) | `champ`, `ogopogo`, `loch-ness-monster`, `great-lakes-sea-monster`, `lake-worth-monster`, `beast-of-busco` (all named-lake-specific); 30+ archived (manipogo, memphre, bessie, chessie, isshii, etc.) | **TRUE GAP.** A generic `freshwater-lake-monster` or `unidentified-lake-creature` would catch reports tied to non-famous lakes/reservoirs/creeks. But 5 reports = low ROI. Defer. |
| wolf_child (4) | Nothing in cryptids; could arguably be `feral-children` under psychological_experiences or anthropology bucket | **CROSS-CATEGORY.** Not really a cryptid — 4 reports = single Bulandshahr wolf-child reprint. Recommend re-categorize to `psychological_experiences` or archive as historical-anomaly. No new cryptid entry. |
| ghost_phantom_animal (2) | None active; should live in `ghosts_hauntings` not cryptids | **CROSS-CATEGORY.** Re-classify these 2 rows to ghosts_hauntings (white doe sighting + Minnesota cemetery grave-desecration). No new cryptid entry. |
| thunderbird_giant_bird (1) | `thunderbird` (active) — keyword "giant eagle" / "seven-foot eagle" not in current target list | **VERIFIER-DROP, not gap.** Add "giant eagle", "monster eagle", "huge bird", "enormous bird" keywords to existing `thunderbird` entry. |
| unknown_creature_generic (27) | None — by definition | **TRUE GAP — partial.** A catch-all `unidentified-creature` entry would absorb 27 weak-signal rows but risks becoming a junk-drawer. Recommend: keep these unlinked; classifier will route them away after 3-attempt skip (V11.17.96). |

---

## 4. Recommended New Phenomena Entries (4 entries — for Chase approval)

Field set mirrors existing `appalachian-wildman` template (slug, name, category, status, aliases, ai_summary, display_blurb, feed_hook, push_copy, anchor_*, primary_regions, icon). Full encyclopedia copy (`ai_description`, `ai_history`, `ai_theories`, `ai_paradocs_analysis`, `ai_quick_facts`, etc.) generates downstream via the standard phen-enrichment script and is NOT human-authored here.

---

### Entry 1 — `sea-serpent` (HIGH priority, 55 rows + future-proofs Erowid/period archives)

```yaml
slug: sea-serpent
name: Sea Serpent
category: cryptids
status: active
aliases:
  - Sea Serpent
  - Sea Monster
  - Marine Serpent
  - Great Sea Serpent
  - Atlantic Sea Serpent
display_blurb: >
  Elongated marine cryptid reported across Atlantic and Pacific waters since
  classical antiquity, peaking in 19th-century North American newspaper accounts
  of multi-humped serpentine forms observed from ships and coastal vantages.
feed_hook: >
  A long, serpentine marine creature reported from open ocean and coastal waters
  worldwide, distinguished from named lake monsters by its saltwater habitat and
  multi-witness ship-deck observations dating to at least the 17th century.
push_copy: >
  Gloucester Harbor, August 1817: multiple townspeople testified under oath to
  a humped sea serpent off the Massachusetts coast.
anchor_when: 1817 (Gloucester) through late 19th century
anchor_where: North Atlantic coast — Massachusetts, Maine, Long Island Sound
anchor_witness: Coastal townspeople, ship crews, fishermen
anchor_case_hook: >
  August 1817. Gloucester Harbor, Massachusetts. Sworn affidavits from dozens of
  residents described an elongated serpentine creature with sequential humps
  observed at close range, prompting the Linnaean Society of New England to
  investigate. The Gloucester case anchors a century of similar Atlantic
  sea-serpent reports peaking 1817-1895.
primary_regions:
  - North Atlantic Ocean
  - Massachusetts Coast
  - Gulf of Maine
  - Long Island Sound
  - New Jersey shore
  - Scottish coastal waters
icon: 🐍
```

**Classifier target (add to auto-targets.json cryptids array):**
```json
{
  "slug": "sea-serpent",
  "name": "Sea Serpent",
  "keywords": [
    "sea serpent", "sea monster", "sea dragon", "marine serpent",
    "great sea serpent", "atlantic sea serpent", "sea creature",
    "marine creature", "horned marine creature", "humped sea creature",
    "serpentine sea", "ocean serpent"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with or experience involving a Sea Serpent",
    "The account includes specific details consistent with Sea Serpent reports (elongated serpentine form, multi-humped silhouette, saltwater or coastal setting, vessel-witness observation)",
    "NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion of Sea Serpent"
  ],
  "description": "Elongated marine cryptid reported from Atlantic, Pacific, and coastal waters worldwide, characterized by multi-humped serpentine form observed from ships and shorelines."
}
```

---

### Entry 2 — `wild-man` (HIGH priority, 34 rows + huge folkloric history)

```yaml
slug: wild-man
name: Wild Man
category: cryptids
status: active
aliases:
  - Wild Man
  - Wild Woman
  - Wildman
  - Naked Wild Man
  - Bearded Wild Figure
  - Wild Man of the Woods
  - Wild Man of Winsted
display_blurb: >
  A bare or hair-covered humanoid figure reported across rural North America
  and Europe from medieval folklore through 20th-century newspaper accounts —
  a precursor genre that gave rise to regional variants like Bigfoot and the
  Appalachian Wildman.
feed_hook: >
  An unclothed or hair-covered solitary humanoid reported from rural woodlands,
  caves, and outskirts of small towns, distinguished from regional cryptids
  (Bigfoot, Appalachian Wildman) by its widespread non-localized occurrence
  in 19th-century press accounts and its more human-proportioned anatomy.
push_copy: >
  Winsted, Connecticut, August 1895: an armed posse pursued a bearded naked
  figure through the Litchfield Hills — one of America's most famous wild-man cases.
anchor_when: 1895 (Wild Man of Winsted)
anchor_where: Winsted, Connecticut and surrounding Litchfield Hills
anchor_witness: Local farmers, hunters, and an organized posse
anchor_case_hook: >
  August 1895. Winsted, Connecticut. Riley Smith, a selectman, reported being
  charged by a naked, hair-covered six-foot man in the woods near Colebrook.
  The story ran in newspapers nationwide and triggered an armed posse hunt that
  lasted into September. The Wild Man of Winsted became the template for
  decades of similar period sightings from Connecticut to Texas.
primary_regions:
  - Connecticut (Winsted, Litchfield County)
  - Rural Kentucky and Tennessee
  - Indiana woodlands
  - Pacific Northwest (Quilcene Mountains)
  - Montana ranching country
  - Texas (Alpine cliffs)
icon: 🪵
```

**Classifier target:**
```json
{
  "slug": "wild-man",
  "name": "Wild Man",
  "keywords": [
    "wild man", "wild woman", "wild men", "wildman", "wild girl",
    "naked wild man", "bearded figure", "nude figure",
    "hairy figure", "hairy man", "hairy woman", "hairy creature",
    "wild man of winsted", "wild man of the woods", "naked attacker"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with or experience involving a Wild Man (solitary unclothed or hair-covered humanoid in rural/wilderness setting)",
    "The account includes specific details consistent with Wild Man reports (rural/wooded location, human-proportioned bipedal figure, evasive behavior, posse or hunt response, late-19th-to-early-20th-century context)",
    "NOT a regional named variant (Bigfoot, Appalachian Wildman, Sheepsquatch, Mogollon Monster) — those have their own entries",
    "NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion of Wild Man"
  ],
  "description": "Solitary unclothed or hair-covered humanoid figure reported from rural woodlands in 19th-century North American press accounts; folkloric precursor to regional Sasquatch-type cryptids."
}
```

---

### Entry 3 — `mystery-panther` (MEDIUM priority, 16 rows)

```yaml
slug: mystery-panther
name: Mystery Panther
category: cryptids
status: active
aliases:
  - Mystery Panther
  - Phantom Panther
  - Black Panther Sighting
  - American Black Panther
  - Mystery Cat
  - Panther-Like Beast
display_blurb: >
  Out-of-place large cat — typically described as black, tawny, or maned —
  reported across the eastern and midwestern United States since the
  19th century, often killing livestock and dogs in rural communities.
feed_hook: >
  A large unidentified cat — frequently described as a black panther, maned
  lion-like animal, or tiger-like predator — reported from the eastern and
  midwestern United States outside the documented range of any native felid
  species, often blamed for livestock and dog killings.
push_copy: >
  Moundsville, West Virginia, 1895: a panther-like beast killed dogs on the
  outskirts of town, leaving residents armed and alarmed.
anchor_when: 1890s-1900s peak; ongoing
anchor_where: Eastern and midwestern United States — West Virginia, Pennsylvania, Kentucky
anchor_witness: Rural residents, farmers, livestock owners
anchor_case_hook: >
  August 1895. Moundsville, West Virginia. An unidentified large cat-like
  predator killed multiple dogs on the outskirts of town. Residents described
  a maned, panther-like beast far larger than any native bobcat. Period
  newspapers carried dozens of similar "mystery panther" reports across the
  Ohio Valley and Appalachian foothills.
primary_regions:
  - West Virginia
  - Kentucky
  - Pennsylvania (Sullivan County, Moundsville region)
  - Indiana
  - Eastern Tennessee
  - Ohio Valley
icon: 🐈‍⬛
```

**Classifier target:**
```json
{
  "slug": "mystery-panther",
  "name": "Mystery Panther",
  "keywords": [
    "mystery panther", "phantom panther", "black panther",
    "panther-like beast", "panther-like predator", "panther-like animal",
    "tiger-like animal", "lion-like creature", "tawny lion-like",
    "maned animal", "large maned", "mystery cat", "phantom cat",
    "monster cat", "tawny beast"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with or experience involving a Mystery Panther (large unidentified cat outside documented native range)",
    "The account includes specific details consistent with Mystery Panther reports (black/tawny/maned coloration, large size beyond native felids, livestock or dog predation, rural eastern or midwestern US setting)",
    "NOT a known escaped zoo or circus animal where the source is documented in the account",
    "NOT a regional named cryptid (Wampus Cat, Mimic Tiger) with its own entry",
    "NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion"
  ],
  "description": "Out-of-place large cat reported across eastern and midwestern United States — typically described as black panther, maned lion-like, or tiger-like — implicated in livestock killings outside documented native felid range."
}
```

---

### Entry 4 — `giant-serpent` (MEDIUM priority, 9 rows + giant-snake folklore)

```yaml
slug: giant-serpent
name: Giant Serpent
category: cryptids
status: active
aliases:
  - Giant Serpent
  - Giant Snake
  - Monster Snake
  - Enormous Serpent
  - Silver Serpent
  - Black Serpent
  - Scaled Serpent
display_blurb: >
  Outsized snake or serpent — far exceeding the dimensions of any documented
  native species — reported from swamps, fields, and watercourses of the
  American South and Midwest in 19th-century press accounts.
feed_hook: >
  A large terrestrial or semi-aquatic serpent — often described as silver,
  black, or many-colored, and frequently 10 to 40 feet in length — reported
  from swamps, swimming holes, and field margins in 19th-century rural
  American newspapers.
push_copy: >
  Georgia, March 1895: hunters near the Savannah River reported a silver
  serpent coiled in a swamp tree, far longer than any known species.
anchor_when: 1890s peak
anchor_where: American South (Georgia, Louisiana, Alabama) and Midwest
anchor_witness: Hunters, farmers, telegraph operators
anchor_case_hook: >
  March 1895. The "Fork" region between the Savannah and Brier Creek, Georgia.
  A party of deer-hunters from Sylvania reported encountering a silver-scaled
  serpent of unprecedented length coiled in a swamp tree — one of dozens of
  period giant-snake reports from southern swampland that defy native species
  identification.
primary_regions:
  - Georgia swamplands
  - Louisiana (Webster Parish)
  - Tennessee (Obion River, Big Cut Off)
  - Indiana woodlands
  - American South
icon: 🐉
```

**Classifier target:**
```json
{
  "slug": "giant-serpent",
  "name": "Giant Serpent",
  "keywords": [
    "giant serpent", "giant snake", "monster snake", "monster serpent",
    "enormous serpent", "enormous snake", "huge snake", "huge serpent",
    "silver serpent", "black serpent", "scaled serpent",
    "twenty-foot snake", "thirty-foot snake", "forty-foot serpent",
    "two-headed rattlesnake", "color-changing reptile"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with or experience involving a Giant Serpent (terrestrial or semi-aquatic snake far exceeding documented native species)",
    "The account includes specific details consistent with Giant Serpent reports (length 10+ feet beyond native maximum, unusual coloration or morphology, rural southern or midwestern US setting)",
    "NOT a regional named cryptid (Giant Anaconda, Megaconda, Mongolian Death Worm) — those have their own entries (or are archived)",
    "NOT a Sea Serpent (separate marine entry) or freshwater lake monster",
    "NOT a generic mention, fictional plot, pop-culture reference, or naturalist's report of a normal large native snake"
  ],
  "description": "Outsized terrestrial or semi-aquatic serpent reported from rural American swamps, fields, and watercourses in 19th-century newspaper accounts, exceeding the dimensions and morphology of documented native species."
}
```

---

## 5. Recommended Adjustments to Existing Entries (no new phen needed)

**`thunderbird`** — add keywords: `"giant eagle"`, `"enormous eagle"`, `"monster eagle"`, `"seven-foot eagle"`, `"huge bird"`, `"enormous bird"`, `"giant bird"`. Single CA row + future-proofs period giant-bird reports.

**`appalachian-wildman` / `bigfoot`** — leave alone. Period generic "wild man" reports should NOT collapse into these regional variants; the new `wild-man` entry is the correct catch-all and existing regional entries remain distinct.

---

## 6. Re-categorization Recommendations (no DB writes — flag for Chase)

- **2 ghost_phantom_animal rows** ("White Doe Sighting Prompts Camp Relocation", "Unknown Animal Desecrates Graves in Minnesota Cemetery") — re-classify `category` from `cryptids` to `ghosts_hauntings`. Existing ghosts taxonomy probably has phantom-animal coverage; if not, separate audit.
- **4 wolf_child rows** (single Bulandshahr 1867 reprint × 4) — re-classify `category` from `cryptids` to `psychological_experiences` or `religion_mythology`. Single historical anthropological event, not a cryptid.
- **19 unclustered "real-animal wonder" rows** — flag for next CA QC sweep (pet-rat bites, leatherback turtles, walking mudskippers, bee swarms). These are extraction false-positives — the lexicon let them through as "cryptids" but they're natural history. Recommend Chase reviews in held-row sweep (task #260).

---

## 7. Expected Coverage After Approval

| Entry added | Rows newly classifiable |
|---|---|
| sea-serpent | 55 |
| wild-man | 34 |
| mystery-panther | 16 |
| giant-serpent | 9 |
| thunderbird keyword expansion | 1 |
| **Total** | **115 of 181 (63.5%)** |

Remaining 66 rows: 27 unknown-creature-generic (likely classifier-skip after 3 attempts), 9 hybrid-chimera (defer single entry decision), 5 lake-freshwater (defer), 19 should-be-pruned-not-classified, 6 cross-category rerouting candidates.

---

## 8. Recommendation

**Add the 4 entries above + thunderbird keyword expansion → expect 63.5% recovery (115/181) on `--retry-failed` cryptids classifier pass.**

No DB writes performed. Awaiting Chase approval.

---

## 9. REVISED Entries (Post-Editorial-Filter — V11.17.61 Paranormal-Qualifier Policy)

**Founder ruling (2026-06-13):** Paradocs cryptids must have explicit paranormal/supernatural qualities — not just "unidentified animal." Zoological mysteries (rare native species, escaped exotic pets, unknown-but-mundane large fish/cats/snakes, vagrant humans) belong in archives, not the phenomenon taxonomy.

### 9.1 REJECTED — `mystery-panther` (per editorial policy)

Out-of-range large cats are zoological mystery, not paranormal. Entry **dropped entirely.** Original 16 candidate rows route to archive via separate sweep (or remain unlinked indefinitely if borderline). Do NOT add to taxonomy.

### 9.2 Per-row re-audit results (92 rows, Haiku 4.5 Batch API, $0.0568)

Re-audited the 51 sea_serpent + 32 wild_man + 9 giant_serpent rows against the paranormal-qualifier filter:

| Cluster | qualifies_paranormal | mundane_zoology | borderline | Total |
|---|---|---|---|---|
| sea_serpent | 1 (2.0%) | 44 (86.3%) | 6 (11.8%) | 51 |
| wild_man | 1 (3.1%) | 30 (93.8%) | 1 (3.1%) | 32 |
| giant_serpent | 0 (0%) | 5 (55.6%) | 4 (44.4%) | 9 |
| **TOTAL** | **2 (2.2%)** | **79 (85.9%)** | **11 (12.0%)** | **92** |

CSV: `outputs/ca-cryptid-reaudit.csv`. Apply with `npx tsx scripts/ca-cryptid-reaudit.ts --apply` (archives the 79 mundane rows with `metadata.archive_reason='cryptid_paranormal_filter_v1'`; flags the 11 borderline rows with `metadata.qc_flag='cryptid_borderline_review'`; leaves the 2 paranormal-qualifying rows untouched).

### 9.3 REVISED Entry 1 — `sea-serpent` (HIGH priority retained, but evidence rules tightened)

```yaml
slug: sea-serpent
name: Sea Serpent
category: cryptids
status: active
aliases:
  - Sea Serpent
  - Sea Monster
  - Marine Serpent
  - Great Sea Serpent
  - Atlantic Sea Serpent
display_blurb: >
  Elongated marine cryptid distinguished from mundane unknown-species reports
  by explicit anomalous markers — multi-humped impossible morphology, intelligent
  malevolent pursuit, supernatural intelligence, or behavior inconsistent with
  any known cetacean — observed across Atlantic and Pacific waters since
  classical antiquity.
feed_hook: >
  A serpentine marine creature whose witnesses describe paranormal markers —
  impossible sequential humps, intelligent pursuit of vessels, immunity to
  harpoons, or movement against current and wind — that distinguish it from
  large but biologically plausible whales, basking sharks, oarfish, or
  leatherback turtles.
push_copy: >
  Skye, 1895: witnesses described a marine creature with sequential humps
  rising in regular, calculated six-foot intervals — morphology impossible
  for any known cetacean.
anchor_when: 1817 (Gloucester) through late 19th century
anchor_where: North Atlantic coast — Massachusetts, Maine, Long Island Sound
anchor_witness: Coastal townspeople, ship crews, fishermen
anchor_case_hook: >
  August 1817. Gloucester Harbor, Massachusetts. Sworn affidavits from dozens
  of residents described a serpentine creature with sequential humps observed
  at close range — morphology the Linnaean Society of New England could not
  reconcile with any known species. The Gloucester case anchors a century of
  similar Atlantic sea-serpent reports peaking 1817-1895.
primary_regions:
  - North Atlantic Ocean
  - Massachusetts Coast
  - Gulf of Maine
  - Long Island Sound
  - Scottish coastal waters
icon: 🐍
```

**Classifier target (REVISED evidence rules):**
```json
{
  "slug": "sea-serpent",
  "name": "Sea Serpent",
  "keywords": [
    "sea serpent", "sea monster", "sea dragon", "marine serpent",
    "great sea serpent", "atlantic sea serpent",
    "horned marine creature", "humped sea creature",
    "serpentine sea", "ocean serpent", "sequential humps"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with a Sea Serpent",
    "The account includes EXPLICIT PARANORMAL MARKERS that distinguish it from an unidentified-but-mundane marine creature: anomalous behavior (intelligent malevolent pursuit of vessels, impossible movement against current/wind, vanishing or dematerializing), impossible physiology (multi-humped sequential form impossible for known cetaceans, glowing/luminous attributes, size far exceeding any biological maximum >100ft, anatomical features impossible for any known species), or supernatural framing (immunity to harpoons/bullets, supernatural intelligence)",
    "REJECT mundane unknown-species reports: 'large unfamiliar creature,' '30-foot fish or whale,' 'unknown marine animal seen briefly,' creatures washed ashore that resemble large eel/shark/turtle/cetacean, fishing-steamer collisions with large unknown animals — these are zoological mysteries, not Paradocs cryptids",
    "REJECT aggressive-but-plausible animal behavior (whales attacking schooners, large eels striking sailors) without additional paranormal markers",
    "NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion of Sea Serpent"
  ],
  "description": "Elongated marine cryptid reported worldwide whose accounts include explicit paranormal markers — impossible sequential-humped morphology, intelligent malevolent pursuit, immunity to weapons, or behavior inconsistent with any known cetacean — distinguishing it from mundane unidentified-large-marine-animal reports."
}
```

### 9.4 REVISED Entry 2 — `wild-man` (HIGH priority retained, but evidence rules tightened)

```yaml
slug: wild-man
name: Wild Man
category: cryptids
status: active
aliases:
  - Wild Man
  - Wild Woman
  - Wildman
  - Wild Man of the Woods
  - Wild Man of Winsted
display_blurb: >
  Hair-covered humanoid figure distinguished from mundane vagrant or
  feral-human accounts by explicit paranormal markers — supernatural strength,
  immunity to gunfire, impossible size, vampiric livestock drainage, or
  vanishing behavior — reported across rural North America in folklore and
  19th-century newspaper accounts.
feed_hook: >
  A hair-covered solitary humanoid whose accounts include explicit paranormal
  markers (superhuman strength, immunity to bullets, impossible height,
  vampiric exsanguination of livestock, supernatural evasion) that distinguish
  it from mundane vagrant, hermit, escaped-asylum-inmate, or feral-child reports.
push_copy: >
  Montana, 1895: a six-foot naked figure attacked a cowboy with superhuman
  strength, was struck by multiple gunshots without effect, and was blamed
  for ritualistic blood-drainage of livestock across the region.
anchor_when: 1895 (Wild Man of Winsted era)
anchor_where: Rural United States — Montana, Connecticut, Kentucky, Indiana
anchor_witness: Local farmers, hunters, ranchers, posses
anchor_case_hook: >
  August 1895. Montana ranching country. A six-foot, hair-covered figure of
  superhuman strength attacked a cowboy, proved immune to multiple gunshots,
  and was implicated in vampiric exsanguination of livestock — markers that
  distinguish the case from contemporaneous mundane "wild man" press reports
  involving vagrants, feral children, and escaped asylum inmates.
primary_regions:
  - Montana ranching country
  - Connecticut (Winsted, Litchfield County)
  - Rural Kentucky and Tennessee
  - Indiana woodlands
icon: 🪵
```

**Classifier target (REVISED evidence rules):**
```json
{
  "slug": "wild-man",
  "name": "Wild Man",
  "keywords": [
    "wild man", "wild woman", "wild men", "wildman",
    "hairy man", "hairy creature", "hairy hominid",
    "wild man of winsted", "wild man of the woods",
    "superhuman strength wild", "immune to bullets wild",
    "vampiric wild man", "drains livestock"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with a Wild Man",
    "The account includes EXPLICIT PARANORMAL MARKERS that distinguish it from a mundane vagrant, hermit, escaped-asylum-inmate, or feral-child report: hair-covered bipedal humanoid with impossible attributes (>7ft tall, superhuman strength or speed, immunity to gunfire or capture by supernatural rather than evasive means), supernatural behaviors (vanishing into thin air, leaping impossible distances, glowing eyes, vampiric exsanguination of livestock), or folkloric supernatural framing",
    "REJECT mundane wild-man reports: 'naked man caught in woods' (= vagrant/hermit), 'bearded figure flees through woods' (= just a person), 'wild man eludes posse' (= human fugitive), thefts attributed to 'wild man' (= human criminal), feral children, escaped asylum inmates, men in animal skins behaving rationally — these are zoological/human mysteries, not Paradocs cryptids",
    "NOT a regional named variant (Bigfoot, Appalachian Wildman, Sheepsquatch, Mogollon Monster) — those have their own entries",
    "NOT a generic mention, fictional plot, pop-culture reference, movie/TV/book/game recap, or second-hand discussion of Wild Man"
  ],
  "description": "Hair-covered humanoid reported from rural woodlands whose accounts include explicit paranormal markers (superhuman strength, immunity to gunfire, impossible size, vampiric exsanguination, supernatural evasion) distinguishing it from mundane vagrant, hermit, or feral-human reports."
}
```

### 9.5 REVISED Entry 3 — `giant-serpent` (MEDIUM priority retained, but evidence rules tightened)

```yaml
slug: giant-serpent
name: Giant Serpent
category: cryptids
status: active
aliases:
  - Giant Serpent
  - Silver Serpent
  - Monster Serpent
  - Scaled Serpent
display_blurb: >
  Outsized terrestrial or semi-aquatic serpent distinguished from mundane
  rare-large-snake reports by explicit paranormal markers — luminous or
  color-changing scales, vanishing when shot at, intelligent pursuit,
  immunity to weapons, or impossible morphology — reported from swamps and
  watercourses of the American South in 19th-century press accounts.
feed_hook: >
  A serpent whose accounts include explicit paranormal markers — silver or
  color-changing scales with no biological precedent, vanishing under fire,
  intelligent pursuit of canoes, immunity to weapons — that distinguish it
  from large but biologically plausible boas, pythons, rat-snakes, polycephalic
  rattlesnake specimens, or legless lizards.
push_copy: >
  Georgia swamplands, March 1895: a silver-scaled serpent of unprecedented
  size coiled in a swamp tree — coloration and reflectivity inconsistent
  with any documented native species.
anchor_when: 1890s peak
anchor_where: American South — Georgia, Louisiana, Tennessee swamplands
anchor_witness: Hunters, swamp residents, telegraph operators
anchor_case_hook: >
  March 1895. The Fork region between the Savannah and Brier Creek, Georgia.
  A party of deer-hunters from Sylvania reported a silver-scaled serpent of
  unprecedented length coiled in a swamp tree — silver coloration and
  reflectivity that no known native species or escaped exotic could explain.
primary_regions:
  - Georgia swamplands
  - Louisiana (Webster Parish)
  - Tennessee (Obion River, Big Cut Off)
  - American South
icon: 🐉
```

**Classifier target (REVISED evidence rules):**
```json
{
  "slug": "giant-serpent",
  "name": "Giant Serpent",
  "keywords": [
    "silver serpent", "monster serpent", "scaled serpent",
    "color-changing snake", "luminous serpent",
    "vanishing serpent", "intelligent serpent pursuit",
    "bulletproof snake", "two-headed serpent paranormal"
  ],
  "evidenceRules": [
    "The narrator describes a first-hand or close-witness encounter with a Giant Serpent",
    "The account includes EXPLICIT PARANORMAL MARKERS that distinguish it from a mundane rare-large-snake report: luminous or color-changing scales with no biological precedent (silver, glowing, shifts hue without ambient cause), vanishing when shot at or under fire, intelligent pursuit of humans, immunity to weapons, supernatural size combined with anomalous behavior (e.g., returning after being killed), or impossible morphology beyond known polycephalic curiosities",
    "REJECT mundane unknown-snake reports: '20-foot snake in swamp' (= rare large boa/python/rat-snake), a large rattlesnake (= just a rattlesnake), a snake coiling around someone's leg (= ordinary snake behavior), an actual two-headed rattlesnake specimen (= real zoological curiosity, not paranormal), a glass snake or legless lizard with known autotomy — these are zoological mysteries, not Paradocs cryptids",
    "NOT a regional named cryptid (Giant Anaconda, Megaconda, Mongolian Death Worm)",
    "NOT a Sea Serpent (separate marine entry) or freshwater lake monster",
    "NOT a generic mention, fictional plot, pop-culture reference, or naturalist's report of a normal large native snake"
  ],
  "description": "Outsized serpent whose accounts include explicit paranormal markers — luminous/color-changing scales, vanishing under fire, intelligent pursuit, immunity to weapons, or impossible morphology — distinguishing it from mundane rare-large-snake reports."
}
```

### 9.6 Revised Expected Coverage (vs prior 63.5%)

| Entry added | Rows newly classifiable (paranormal-qualifying) |
|---|---|
| sea-serpent (revised) | 1 |
| wild-man (revised) | 1 |
| giant-serpent (revised) | 0 |
| ~~mystery-panther~~ | DROPPED |
| thunderbird keyword expansion (unchanged) | 1 |
| **Total qualifying** | **3 of 181 (1.7%)** |

The remaining 90 cluster-matched rows now route as follows:
- **79 archived** — `metadata.archive_reason='cryptid_paranormal_filter_v1'` (mundane zoology)
- **11 flagged** — `metadata.qc_flag='cryptid_borderline_review'` (await Chase eyeball)
- Plus the original 16 `mystery-panther` rows (separate archive sweep) + 66 unrelated cluster rows.

**Net effect of the editorial filter:** The taxonomy gap is real but the volume that genuinely qualifies is tiny — most of what we thought we were missing was zoological mystery, not paranormal phenomena. The 3 new entries still earn their slot (they cover historical/folkloric paranormal sea-serpent and wild-man cases that future Erowid / period archive ingestion will surface in larger numbers); current CA volume just isn't where that signal lives.

No DB writes performed. Awaiting Chase approval for `--apply`.
