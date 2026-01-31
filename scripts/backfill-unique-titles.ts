/**
 * Backfill Unique Titles Script
 * Regenerates all report titles using the improved title-improver
 * with key feature extraction, location, and date fallback
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Import the phenomenon patterns directly (compiled version)
const PHENOMENON_PATTERNS: Record<string, Array<{ pattern: RegExp; title: string; priority: number }>> = {
  'ghosts_hauntings': [
    { pattern: /\b(shadow\s*(figure|person|man|people)|dark\s*figure|black\s*(figure|mass|shape))\b/i, title: 'Shadow Figure Encounter', priority: 10 },
    { pattern: /\b(hat\s*man|man\s*in\s*(a\s*)?hat)\b/i, title: 'Hat Man Sighting', priority: 10 },
    { pattern: /\b(full[\s-]?body\s*apparition|see[\s-]?through|transparent\s*(figure|person))\b/i, title: 'Full-Body Apparition', priority: 10 },
    { pattern: /\b(apparition|ghost\s*(of|appeared)|spirit\s*appeared)\b/i, title: 'Ghostly Apparition', priority: 8 },
    { pattern: /\b(white\s*(figure|lady|woman)|lady\s*in\s*white)\b/i, title: 'White Lady Apparition', priority: 10 },
    { pattern: /\b(poltergeist|objects?\s*(moved?|flying|thrown)|things?\s*(moved?|flying))\b/i, title: 'Poltergeist Activity', priority: 10 },
    { pattern: /\b(evp|electronic\s*voice|voice\s*recording)\b/i, title: 'EVP Recording', priority: 10 },
    { pattern: /\b(cold\s*spot|sudden(ly)?\s*cold|temperature\s*drop)\b/i, title: 'Cold Spot Phenomenon', priority: 7 },
    { pattern: /\b(orb|ball\s*of\s*light|floating\s*light)\b/i, title: 'Orb Manifestation', priority: 8 },
    { pattern: /\b(disembodied\s*voice|voice\s*with\s*no|heard\s*(a\s*)?(voice|whisper|someone))\b/i, title: 'Disembodied Voice', priority: 9 },
    { pattern: /\b(footsteps?|walking|pacing)\s*(upstairs|downstairs|above|in\s*the)?\b/i, title: 'Phantom Footsteps', priority: 7 },
    { pattern: /\b(knocking|banging|tapping)\s*(on|at|sound)?\b/i, title: 'Unexplained Knocking', priority: 7 },
    { pattern: /\b(watched|being\s*watched|eyes\s*on\s*me|someone\s*there)\b/i, title: 'Presence Felt', priority: 5 },
    { pattern: /\b(touched|grabbed|pushed|pulled)\s*(by|me|my)?\b/i, title: 'Physical Contact', priority: 8 },
    { pattern: /\b(sleep\s*paralysis|couldn\'t\s*move|paralyzed|frozen)\b/i, title: 'Sleep Paralysis Entity', priority: 9 },
    { pattern: /\b(haunted\s*(house|home|building|hotel|hospital))\b/i, title: 'Haunted Location', priority: 6 },
    { pattern: /\b(cemetery|graveyard|grave)\b/i, title: 'Cemetery Encounter', priority: 7 },
    { pattern: /\b(glow(ing|ed)?\s*(figure|white|person)|figure\s*glow)\b/i, title: 'Glowing Figure', priority: 9 },
  ],
  'ufos_aliens': [
    { pattern: /\b(triangle|triangular)\s*(craft|object|ufo|shape)?\b/i, title: 'Black Triangle UFO', priority: 10 },
    { pattern: /\b(disc|saucer|flying\s*saucer)\b/i, title: 'Disc-Shaped Craft', priority: 10 },
    { pattern: /\b(cigar[\s-]?shaped?|cylinder|cylindrical)\b/i, title: 'Cigar-Shaped Object', priority: 10 },
    { pattern: /\b(tic[\s-]?tac|pill[\s-]?shaped?|oval)\b/i, title: 'Tic-Tac UFO', priority: 10 },
    { pattern: /\b(sphere|spherical|ball)\s*(of\s*light|shaped|ufo)?\b/i, title: 'Spherical Object', priority: 8 },
    { pattern: /\b(orb|orbs|ball\s*of\s*light|light\s*ball)\b/i, title: 'Luminous Orb', priority: 8 },
    { pattern: /\b(flash|flashing|pulsing|pulsating)\s*(light|object)?\b/i, title: 'Pulsating Lights', priority: 7 },
    { pattern: /\b(beam\s*of\s*light|light\s*beam|searchlight)\b/i, title: 'Light Beam Phenomenon', priority: 9 },
    { pattern: /\b(formation|multiple\s*(lights|objects|ufos))\b/i, title: 'UFO Formation', priority: 9 },
    { pattern: /\b(abduct|taken|aboard|inside\s*(the|a)\s*(craft|ship))\b/i, title: 'Abduction Experience', priority: 10 },
    { pattern: /\b(alien|grey|gray|being|entity|creature)\s*(encounter|contact|saw)?\b/i, title: 'Entity Encounter', priority: 9 },
    { pattern: /\b(close\s*encounter|landed|landing)\b/i, title: 'Close Encounter', priority: 9 },
    { pattern: /\b(missing\s*time|lost\s*time|time\s*loss)\b/i, title: 'Missing Time Event', priority: 10 },
    { pattern: /\b(hover|hovering|stationary)\b/i, title: 'Hovering Object', priority: 6 },
    { pattern: /\b(zigzag|erratic|impossible\s*(movement|maneuver))\b/i, title: 'Erratic Movement UFO', priority: 8 },
    { pattern: /\b(silent|no\s*sound|soundless)\b/i, title: 'Silent Craft', priority: 6 },
  ],
  'cryptids': [
    { pattern: /\b(bigfoot|sasquatch|squatch)\b/i, title: 'Bigfoot Encounter', priority: 10 },
    { pattern: /\b(yeti|abominable)\b/i, title: 'Yeti Sighting', priority: 10 },
    { pattern: /\b(yowie)\b/i, title: 'Yowie Sighting', priority: 10 },
    { pattern: /\b(skunk\s*ape)\b/i, title: 'Skunk Ape Sighting', priority: 10 },
    { pattern: /\b(dogman|dog[\s-]?man|werewolf|wolf[\s-]?man)\b/i, title: 'Dogman Encounter', priority: 10 },
    { pattern: /\b(skinwalker|skin[\s-]?walker)\b/i, title: 'Skinwalker Encounter', priority: 10 },
    { pattern: /\b(wendigo)\b/i, title: 'Wendigo Encounter', priority: 10 },
    { pattern: /\b(mothman|moth[\s-]?man)\b/i, title: 'Mothman Sighting', priority: 10 },
    { pattern: /\b(thunderbird|giant\s*bird)\b/i, title: 'Thunderbird Sighting', priority: 10 },
    { pattern: /\b(chupacabra)\b/i, title: 'Chupacabra Sighting', priority: 10 },
    { pattern: /\b(crawler|pale\s*crawler)\b/i, title: 'Crawler Sighting', priority: 10 },
    { pattern: /\b(rake|the\s*rake)\b/i, title: 'The Rake Encounter', priority: 10 },
    { pattern: /\b(bipedal|two[\s-]?leg(ged)?|upright)\s*(creature|figure|animal)?\b/i, title: 'Bipedal Creature', priority: 7 },
    { pattern: /\b(hairy|furry|hair[\s-]?covered)\s*(creature|figure|man|being)?\b/i, title: 'Hairy Humanoid', priority: 8 },
    { pattern: /\b(glowing|red|yellow)\s*eyes?\b/i, title: 'Red-Eyed Creature', priority: 8 },
    { pattern: /\b(giant|huge|massive|enormous)\s*(creature|animal|figure)?\b/i, title: 'Giant Creature', priority: 7 },
    { pattern: /\b(footprint|track|print)\b/i, title: 'Cryptid Tracks Found', priority: 8 },
    { pattern: /\b(howl|scream|vocalization|call|roar)\b/i, title: 'Unknown Vocalization', priority: 7 },
    { pattern: /\b(tree[\s-]?knock|wood[\s-]?knock)\b/i, title: 'Wood Knock Heard', priority: 8 },
  ],
  'psychological_experiences': [
    { pattern: /\b(glitch\s*(in|the)?\s*(matrix|reality)|reality\s*glitch)\b/i, title: 'Glitch in the Matrix', priority: 10 },
    { pattern: /\b(doppelganger|double|duplicate\s*(of\s*)?(me|myself))\b/i, title: 'Doppelganger Encounter', priority: 10 },
    { pattern: /\b(mandela\s*effect|false\s*memory|remember\s*differently)\b/i, title: 'Mandela Effect', priority: 10 },
    { pattern: /\b(time\s*slip|slipped?\s*(through|in)\s*time)\b/i, title: 'Time Slip Experience', priority: 10 },
    { pattern: /\b(deja\s*vu|already\s*happened)\b/i, title: 'Déjà Vu Experience', priority: 7 },
    { pattern: /\b(vanish|disappear|gone\s*missing|ceased\s*to\s*exist)\b/i, title: 'Vanishing Object', priority: 8 },
    { pattern: /\b(alternate\s*(reality|timeline|dimension)|parallel)\b/i, title: 'Alternate Reality', priority: 9 },
  ],
  'consciousness_practices': [
    { pattern: /\b(out[\s-]?of[\s-]?body|obe|astral\s*project)\b/i, title: 'Out-of-Body Experience', priority: 10 },
    { pattern: /\b(near[\s-]?death|nde|died\s*and\s*(came|returned))\b/i, title: 'Near-Death Experience', priority: 10 },
    { pattern: /\b(lucid\s*dream|aware\s*(in|during)\s*(the\s*)?dream)\b/i, title: 'Lucid Dream', priority: 9 },
    { pattern: /\b(astral\s*(travel|plane|realm))\b/i, title: 'Astral Travel', priority: 9 },
    { pattern: /\b(meditation|meditat(ed|ing))\b/i, title: 'Meditation Vision', priority: 6 },
  ],
  'psychic_phenomena': [
    { pattern: /\b(precognit|premonition|foresaw|foresee|knew.*before)\b/i, title: 'Precognitive Experience', priority: 10 },
    { pattern: /\b(telepath|read\s*(my|their)\s*(mind|thought)|mind\s*read)\b/i, title: 'Telepathic Experience', priority: 10 },
    { pattern: /\b(remote\s*view|saw\s*(something|somewhere)\s*far)\b/i, title: 'Remote Viewing', priority: 10 },
    { pattern: /\b(psychic\s*dream|dream(ed|t)?\s*(about|of).*came\s*true)\b/i, title: 'Prophetic Dream', priority: 9 },
    { pattern: /\b(empath|felt\s*(their|others)\s*(emotions?|feelings?))\b/i, title: 'Empathic Experience', priority: 8 },
  ],
};

const FALLBACK_DESCRIPTORS: Record<string, string> = {
  'ufos_aliens': 'UFO Sighting',
  'ghosts_hauntings': 'Paranormal Experience',
  'cryptids': 'Creature Sighting',
  'psychological_experiences': 'Strange Experience',
  'consciousness_practices': 'Consciousness Experience',
  'psychic_phenomena': 'Psychic Experience',
  'combination': 'Unexplained Event',
  'biological_factors': 'Biological Anomaly',
  'perception_sensory': 'Sensory Experience',
  'religion_mythology': 'Spiritual Experience',
  'esoteric_practices': 'Esoteric Experience',
  'multi_disciplinary': 'Multi-Faceted Experience',
};

function extractPhenomenon(description: string, category: string): string {
  const patterns = PHENOMENON_PATTERNS[category];
  if (patterns) {
    const sortedPatterns = [...patterns].sort((a, b) => b.priority - a.priority);
    for (const { pattern, title } of sortedPatterns) {
      if (pattern.test(description)) {
        return title;
      }
    }
  }
  return FALLBACK_DESCRIPTORS[category] || FALLBACK_DESCRIPTORS['combination'];
}

function extractKeyFeature(description: string): string | null {
  const featurePatterns = [
    { pattern: /\b(chased|followed|pursued)\b/i, feature: 'Pursuit' },
    { pattern: /\b(multiple witnesses|we all saw|group of us|family saw)\b/i, feature: 'Multiple Witnesses' },
    { pattern: /\b(photograph|photo|video|recorded|on camera)\b/i, feature: 'Documented' },
    { pattern: /\b(recurring|happened again|multiple times|keeps happening)\b/i, feature: 'Recurring' },
    { pattern: /\b(childhood|as a (kid|child)|when I was young|grew up)\b/i, feature: 'Childhood' },
    { pattern: /\b(family home|parents.?\s*house|grandparents?)\b/i, feature: 'Family Home' },
    { pattern: /\b(camping|woods|forest|hiking|trail)\b/i, feature: 'in the Woods' },
    { pattern: /\b(highway|road|driving|car)\b/i, feature: 'on the Road' },
    { pattern: /\b(bedroom|bed|sleep|woke)\b/i, feature: 'Bedroom' },
  ];

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(description)) {
      return feature;
    }
  }
  return null;
}

function extractLocation(description: string): string | null {
  const locationPatterns = [
    /(?:in|from|near)\s+([A-Z][a-z]+(?:ville|town|burg|field|port|land)?),?\s*([A-Z]{2})\b/,
    /(?:in|from|near)\s+([A-Z][a-z]+),?\s+(California|Texas|Florida|New York|Ohio|Pennsylvania|Georgia|Michigan|Arizona|Colorado|Washington|Oregon|Nevada|Utah)\b/i,
    /(?:in|from)\s+(California|Texas|Florida|New York|Ohio|Pennsylvania|Georgia|Michigan|Arizona|Colorado|Washington|Oregon|Nevada|Utah|Australia|Canada|UK|England)\b/i,
  ];

  for (const pattern of locationPatterns) {
    const match = description.match(pattern);
    if (match) {
      if (match[2]) {
        return `${match[1]}, ${match[2]}`;
      }
      return match[1];
    }
  }
  return null;
}

function formatDateForTitle(date: string | null): string | null {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return null;
  }
}

function generateTitle(
  description: string,
  category: string,
  locationName: string | null,
  eventDate: string | null,
  createdAt: string | null
): string {
  // 1. Get phenomenon from description
  const phenomenon = extractPhenomenon(description, category);

  // 2. Try to get a key feature
  const keyFeature = extractKeyFeature(description);

  // 3. Try to get location from description or use provided location
  const extractedLocation = extractLocation(description);
  const location = locationName || extractedLocation;

  // 4. Get date for fallback
  const dateStr = formatDateForTitle(eventDate) || formatDateForTitle(createdAt);

  // Build title
  let title = phenomenon;

  // Add key feature if meaningful
  if (keyFeature) {
    if (['in the Woods', 'on the Road'].includes(keyFeature)) {
      title = `${title} ${keyFeature}`;
    } else if (keyFeature === 'Childhood' || keyFeature === 'Family Home') {
      title = `${keyFeature} ${title}`;
    } else if (keyFeature === 'Bedroom') {
      title = `${title} in ${keyFeature}`;
    } else if (keyFeature === 'Multiple Witnesses') {
      title = `${title} - ${keyFeature}`;
    } else if (keyFeature === 'Documented') {
      title = `${title} Caught on Camera`;
    } else if (keyFeature === 'Recurring') {
      title = `Recurring ${title}`;
    }
  }

  // Add location (priority 1 for uniqueness)
  if (location && location.length < 25) {
    const cleanLocation = location.replace(/,?\s*(USA|US|United States)$/i, '').trim();
    if (cleanLocation) {
      title = `${title} - ${cleanLocation}`;
    }
  } else if (dateStr) {
    // Add date if no location (priority 2 for uniqueness)
    title = `${title} - ${dateStr}`;
  }

  // Proper capitalization
  title = title
    .split(' ')
    .map((word, i) => {
      const smallWords = ['a', 'an', 'the', 'in', 'on', 'at', 'by', 'for', 'of', 'to'];
      if (i > 0 && smallWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      if (word.includes('-')) {
        return word.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Truncate if too long
  if (title.length > 80) {
    title = title.substring(0, 77) + '...';
  }

  return title;
}

async function backfillTitles() {
  console.log('Starting title backfill...\n');

  // Fetch all reports
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reports:', error);
    return;
  }

  console.log(`Found ${reports.length} reports to process\n`);

  let updated = 0;
  let errors = 0;
  const titleCounts: Record<string, number> = {};

  for (const report of reports) {
    try {
      const newTitle = generateTitle(
        report.description || '',
        report.category || 'combination',
        report.location_name,
        report.event_date,
        report.created_at
      );

      // Track title distribution
      const baseTitle = newTitle.split(' - ')[0];
      titleCounts[baseTitle] = (titleCounts[baseTitle] || 0) + 1;

      // Update the report
      const { error: updateError } = await supabase
        .from('reports')
        .update({
          original_title: report.title,
          title: newTitle
        })
        .eq('id', report.id);

      if (updateError) {
        console.error(`Error updating report ${report.id}:`, updateError);
        errors++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`Processed ${updated} reports...`);
        }
      }
    } catch (err) {
      console.error(`Error processing report ${report.id}:`, err);
      errors++;
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);

  console.log(`\nTitle distribution (top 20):`);
  const sortedTitles = Object.entries(titleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [title, count] of sortedTitles) {
    console.log(`   ${title}: ${count}`);
  }
}

backfillTitles().catch(console.error);
