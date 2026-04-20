# Paradocs Icon Curation — Curated Picks for Review

**Date:** April 19, 2026  
**Purpose:** Replace emoji-based category/phenomenon icons with commercial SVG icons from 7 purchased packs.

---

## Style Assessment

After examining every SVG across all 7 packs, here's what we're working with:

**Esoteric Outline** (30 SVGs) — Clean monochrome line art, 512×512, single-color paths. CSS-colorable. Scales perfectly from 16px to 128px. This is the strongest pack for UI consistency.

**Halloween/Vivid** (65 SVGs) — Full-color detailed illustrations, 256×256. Named creatures (Bigfoot, Ghost, Banshee, etc.). Multi-fill. Best at 48px+ sizes. The only pack with creature-specific icons.

**UFO/Aliens** (30 SVGs) — Mixed color fills, 512×512. Numbered files. Good UFO/alien variants but overlaps with Esoteric.

**Hell/Underworld** (50 SVGs) — Full-color, numbered, generic names. Angel/devil/reaper variants. Niche.

**Paranormal** (15 SVGs) — Full-color with fills. Small set — soul, UFO, ghost, tarot, telekinesis.

**Science** (50 SVGs) — Full-color flat illustrations. DNA, microscope, brain, hypothesis. Essential for the analytical categories.

**Nature** (50 SVGs) — Full-color flat illustrations. Trees, moon, mountains, animals. Useful for environmental/outdoor cues.

---

## Recommendation: Two-Tier Icon System

### Tier 1 — Category Icons (11 icons, used everywhere)
These appear on cards, map pins, badges, nav elements, constellation nodes — often at 16-32px. They need to be **monochrome, CSS-colorable, and instantly recognizable at small sizes.**

**Primary pack: Esoteric Outline** (9 of 11 categories covered).  
Gaps filled from Halloween/Vivid and Science packs — all will be normalized to monochrome in the build step.

### Tier 2 — Phenomenon-Type Icons (encyclopedia entries, larger contexts)
These appear on `/phenomena/[slug]` pages at 64-128px and in search results. They can be **richer, more detailed, and multi-color** since they render at larger sizes. The Halloween/Vivid pack is ideal here.

---

## Tier 1: Category Icon Picks

| # | Category | Current Emoji | Recommended SVG | Pack | Why This One |
|---|----------|--------------|-----------------|------|-------------|
| 1 | `ufos_aliens` | 🛸 | **`UFO.svg`** | Esoteric Outline | Classic saucer with beam + window dots. Instantly readable as "UFO" at any size. Clean single-path. |
| 2 | `cryptids` | 🦶 | **`Bigfoot.svg`** | Halloween/Vivid | Only pack with a named cryptid icon. Will normalize to monochrome silhouette. Bigfoot is the category flagship. |
| 3 | `ghosts_hauntings` | 👻 | **`Ghost.svg`** | Esoteric Outline | Classic ghost form with eyes and open mouth. Clean outline, universally recognizable. |
| 4 | `psychic_phenomena` | 🔮 | **`Psychic.svg`** | Esoteric Outline | Figure with radiating energy lines + eye motif. Reads as "psychic/ESP" immediately. |
| 5 | `consciousness_practices` | 🧘 | **`Out_of_body_experience.svg`** | Esoteric Outline | Two-body astral projection figure — soul leaving body. Perfect metaphor for consciousness/meditation/OBE practices. |
| 6 | `psychological_experiences` | 🧠 | **`Deja_vu.svg`** | Esoteric Outline | Eye with circular reflection pattern + a "rewind" arrow motif — represents altered perception/psychological states. Unique and evocative. |
| 7 | `biological_factors` | 🧬 | **`027-dna.svg`** | Science | DNA double helix. No esoteric equivalent exists. Will normalize to monochrome. Universal "biology/genetics" symbol. |
| 8 | `perception_sensory` | 👁️ | **`Illuminati.svg`** | Esoteric Outline | All-seeing eye inside triangle with radiating rays. The eye is the universal perception symbol; the triangle adds gravitas without being cheesy. |
| 9 | `religion_mythology` | ⚡ | **`Sun_and_moon.svg`** | Esoteric Outline | Sun (with rays) + crescent moon in dual composition. Represents celestial duality — day/night, sacred/profane. Perfect for comparative religion & mythology. |
| 10 | `esoteric_practices` | ✨ | **`Alchemy.svg`** | Esoteric Outline | Alchemical flask with transmutation symbols. Represents the "hidden knowledge / transformation" thread that runs through esoteric traditions. Alt: `Magic_circle.svg` (ritual circle with symbols) — either works. |
| 11 | `combination` | 🔄 | **`Yin_and_yang.svg`** | Esoteric Outline | Yin-yang with detailed inner circles. Perfect for "multiple categories apply" — balance, duality, interconnection. |

### Category Picks Summary
- 9 from Esoteric Outline (consistent monochrome line art)
- 1 from Halloween/Vivid (`Bigfoot.svg` — normalized to monochrome)
- 1 from Science (`027-dna.svg` — normalized to monochrome)

---

## Tier 2: Phenomenon-Type Icon Picks (Encyclopedia Pages)

These map to individual `/phenomena/[slug]` entries. Using the richer, named Halloween/Vivid illustrations where available, supplemented by Esoteric Outline and other packs.

### UFOs & Aliens Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `ufo-encounter` | `Extraterrestrials.svg` | Halloween/Vivid | Alien figure — distinct from the saucer category icon |
| `alien-abduction` | `Extraterrestrials.svg` | Halloween/Vivid | Same alien figure works |
| `ufo-sighting` | `UFO.svg` | Esoteric Outline | Saucer shape, matches category |
| `men-in-black` | `Doppelganger.svg` | Halloween/Vivid | Shadowy double figure |

### Cryptids Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `bigfoot-sighting` | `Bigfoot.svg` | Halloween/Vivid | Direct match |
| `sasquatch-sighting` | `Yeti.svg` | Halloween/Vivid | Yeti variant distinguishes from Bigfoot |
| `lake-monster-sighting` | `Kraken.svg` | Halloween/Vivid | Tentacled water creature |
| `sea-serpent-sighting` | `Kraken.svg` | Halloween/Vivid | Same — or `Mermaids.svg` if we want distinction |
| `cryptid-sighting` (generic) | `Bigfoot.svg` | Halloween/Vivid | Flagship cryptid as generic |

### Ghosts & Hauntings Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `ghost` / `apparition` | `Ghost.svg` | Halloween/Vivid | Classic ghost, more detailed than Outline version |
| `poltergeist` | `Poltergeist.svg` | Halloween/Vivid | Direct match — distinct from regular ghost |
| `haunting` | `Ghost.svg` | Esoteric Outline | Subtle outline version for the broad category |
| `banshee` | `Banshee.svg` | Halloween/Vivid | Direct match |
| `outdoor-apparition` | `Pirate Ghost.svg` | Halloween/Vivid | Distinct outdoor/wandering ghost variant |
| `roadside-apparition` | `Pirate Ghost.svg` | Halloween/Vivid | Same outdoor ghost |
| `demonic-possession` | `Demonic Possesion.svg` | Halloween/Vivid | Direct match (note: filename typo in pack) |
| `shadow-person` | `Doppelganger.svg` | Halloween/Vivid | Dark double figure |

### NDE / Consciousness Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `near-death-experience` | `Out_of_body_experience.svg` | Esoteric Outline | Soul-leaving-body is the canonical NDE image |
| `out-of-body-experience` | `Out_of_body_experience.svg` | Esoteric Outline | Direct match |
| `shared-death-experience` | `Ghost.svg` | Esoteric Outline | Subtle spiritual presence |
| `deathbed-vision` | `Grim_reaper.svg` | Esoteric Outline | Threshold figure — not scary, just liminal |
| `after-death-communication` | `Ghost.svg` | Esoteric Outline | Spirit communication |
| `spiritually-transformative-experience` | `Sun_and_moon.svg` | Esoteric Outline | Transformation/transcendence |
| `pre-birth-memory` | `Deja_vu.svg` | Esoteric Outline | Memory/perception motif |
| `dream-experience` | `Deja_vu.svg` | Esoteric Outline | Altered perception — dream state |
| `premonition-experience` | `Horoscope_ball.svg` | Esoteric Outline | Crystal ball / foresight |

### Psychic Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `psychic` (generic) | `Psychic.svg` | Esoteric Outline | Direct match |
| `telepathy` | `Psychic.svg` | Esoteric Outline | Mental transmission |
| `telekinesis` | `012-telekinesis.svg` | Paranormal | Object-moving figure — unique icon |
| `clairvoyance` | `Horoscope_ball.svg` | Esoteric Outline | Crystal ball / seeing beyond |
| `tarot-reading` | `Tarot.svg` | Esoteric Outline | Direct match |
| `palmistry` | `Palmistry.svg` | Esoteric Outline | Direct match |
| `precognition` | `Horoscope_ball.svg` | Esoteric Outline | Foresight |

### Religion & Mythology Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `angel` / `angelic-encounter` | `Angel.svg` | Halloween/Vivid | Winged figure |
| `demon` / `demonic-encounter` | `Demon.svg` | Halloween/Vivid | Direct match |
| `djinn` | `Djinn.svg` | Halloween/Vivid | Direct match |
| `prayer-experience` | `Sun_and_moon.svg` | Esoteric Outline | Celestial/spiritual |
| `miracle` | `Angel.svg` | Halloween/Vivid | Divine intervention |
| `gods` / `deity-encounter` | `Gods.svg` | Halloween/Vivid | Direct match (detailed deity figure) |

### Esoteric Practices Phenomena

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `alchemy` | `Alchemy.svg` | Esoteric Outline | Direct match |
| `ritual` / `magic-ritual` | `Magic_circle.svg` | Esoteric Outline | Ritual circle with symbols |
| `voodoo` | `Voodoo_doll.svg` | Esoteric Outline | Direct match |
| `spell` / `cursed-object` | `Cursed_gem.svg` | Esoteric Outline | Cursed artifact |
| `talisman` | `Talisman.svg` | Esoteric Outline | Direct match |
| `witchcraft` | `Witch.svg` | Halloween/Vivid | Direct match |
| `necromancy` | `Necromancer.svg` | Halloween/Vivid | Direct match |

### Mythological Creatures (Encyclopedia)

| Phenomenon Slug | Recommended SVG | Pack | Notes |
|----------------|-----------------|------|-------|
| `vampire` | `Vampire.svg` or `Dracula.svg` | Halloween/Vivid | Both available — Dracula is more classic |
| `werewolf` | `Werewolf.svg` | Halloween/Vivid | Direct match |
| `dragon` | `Dragon.svg` | Halloween/Vivid | Direct match |
| `mermaid` | `Mermaids.svg` | Halloween/Vivid | Direct match |
| `fairy` / `fae` | `Fairy.svg` | Halloween/Vivid | Direct match |
| `shapeshifter` | `Shapeshifter.svg` | Halloween/Vivid | Direct match |
| `zombie` | `Zombie.svg` | Halloween/Vivid | Direct match |
| `centaur` | `Centaur.svg` | Halloween/Vivid | Direct match |
| `chimera` | `Chimera.svg` | Halloween/Vivid | Direct match |
| `cyclops` | `Cyclops.svg` | Halloween/Vivid | Direct match |
| `medusa` / `gorgon` | `Medusa.svg` | Halloween/Vivid | Direct match |
| `minotaur` | `Minotaur.svg` | Halloween/Vivid | Direct match |
| `golem` | `Golem.svg` | Halloween/Vivid | Direct match |
| `gargoyle` | `Gargoyles.svg` | Halloween/Vivid | Direct match |
| `time-traveler` | `Time Travelers.svg` | Halloween/Vivid | Direct match |
| `seer` / `oracle` | `Seer.svg` | Halloween/Vivid | Direct match |

---

## Gaps & Open Questions

1. **`cryptids` category icon** — Using `Bigfoot.svg` from Halloween/Vivid. This is a full-color illustration that we'll convert to monochrome silhouette. The silhouette of Bigfoot (upright ape figure) is iconic and readable at small sizes. **OK or want a different approach?**

2. **`biological_factors` category icon** — Using `027-dna.svg` from Science pack. It's a colored DNA helix that we'll normalize to monochrome. **OK?**

3. **`esoteric_practices` category icon** — Two strong candidates: `Alchemy.svg` (flask with transmutation) vs `Magic_circle.svg` (ritual circle with symbols). Alchemy feels more "knowledge-seeking," Magic_circle feels more "practice/ritual." **Which do you prefer?**

4. **`perception_sensory` = Illuminati eye?** — The all-seeing-eye-in-triangle is the strongest "perception/seeing" icon in the packs. It does carry Illuminati connotations, but in Paradocs's context (a paranormal research site), that's arguably on-brand. The alternative is `Deja_vu.svg` (eye with reflection), but that's already assigned to `psychological_experiences`. **Keep Illuminati or swap?**

5. **Substance/drug experiences** — Erowid reports don't have a dedicated phenomenon type icon. `Potion_cauldron.svg` (Esoteric Outline) or `016-flask.svg` (Science) could work if we need one. **Need this?**

6. **Halloween/Vivid color handling** — These are multi-color illustrations. For Tier 2 encyclopedia use, do you want to keep them full-color, or normalize everything to a single Paradocs brand color? Full-color is more visually engaging at 64px+; monochrome is more cohesive.

---

## Implementation Plan (After Approval)

1. **Copy approved SVGs** into `public/icons/categories/` and `public/icons/phenomena/`
2. **Normalize category icons** to monochrome (strip fills, use `currentColor`)
3. **Build `PhenomenonIcon.tsx`** component that takes a `category` or `phenomenonSlug` prop and renders the right SVG, with size/color props
4. **Replace `CATEGORY_ICONS` emoji map** in `mapStyles.ts` with SVG references
5. **Swap sitewide** — map pins, cards, badges, constellation nodes, nav, encyclopedia headers
6. **Verify** at all breakpoints and in dark/light mode
