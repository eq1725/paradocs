// Location Parser Utility
// Smarter parsing to distinguish international locations from US locations

// Major international cities that might be confused with US locations
const INTERNATIONAL_CITIES: Record<string, { country: string; countryCode: string }> = {
  // Georgia (country) cities
  'tbilisi': { country: 'Georgia', countryCode: 'GE' },
  'batumi': { country: 'Georgia', countryCode: 'GE' },
  'kutaisi': { country: 'Georgia', countryCode: 'GE' },

  // Other commonly confused locations
  'moscow': { country: 'Russia', countryCode: 'RU' },
  'st petersburg': { country: 'Russia', countryCode: 'RU' },
  'saint petersburg': { country: 'Russia', countryCode: 'RU' },
  'paris': { country: 'France', countryCode: 'FR' },
  'london': { country: 'United Kingdom', countryCode: 'GB' },
  'berlin': { country: 'Germany', countryCode: 'DE' },
  'rome': { country: 'Italy', countryCode: 'IT' },
  'tokyo': { country: 'Japan', countryCode: 'JP' },
  'sydney': { country: 'Australia', countryCode: 'AU' },
  'melbourne': { country: 'Australia', countryCode: 'AU' },
  'toronto': { country: 'Canada', countryCode: 'CA' },
  'vancouver': { country: 'Canada', countryCode: 'CA' },
  'montreal': { country: 'Canada', countryCode: 'CA' },
  'calgary': { country: 'Canada', countryCode: 'CA' },
  'edmonton': { country: 'Canada', countryCode: 'CA' },
  'ottawa': { country: 'Canada', countryCode: 'CA' },
  'mexico city': { country: 'Mexico', countryCode: 'MX' },
  'guadalajara': { country: 'Mexico', countryCode: 'MX' },
  'manchester': { country: 'United Kingdom', countryCode: 'GB' },
  'birmingham': { country: 'United Kingdom', countryCode: 'GB' },
  'glasgow': { country: 'United Kingdom', countryCode: 'GB' },
  'edinburgh': { country: 'United Kingdom', countryCode: 'GB' },
  'dublin': { country: 'Ireland', countryCode: 'IE' },
  'amsterdam': { country: 'Netherlands', countryCode: 'NL' },
  'brussels': { country: 'Belgium', countryCode: 'BE' },
  'vienna': { country: 'Austria', countryCode: 'AT' },
  'zurich': { country: 'Switzerland', countryCode: 'CH' },
  'geneva': { country: 'Switzerland', countryCode: 'CH' },
  'stockholm': { country: 'Sweden', countryCode: 'SE' },
  'oslo': { country: 'Norway', countryCode: 'NO' },
  'copenhagen': { country: 'Denmark', countryCode: 'DK' },
  'helsinki': { country: 'Finland', countryCode: 'FI' },
  'warsaw': { country: 'Poland', countryCode: 'PL' },
  'prague': { country: 'Czech Republic', countryCode: 'CZ' },
  'budapest': { country: 'Hungary', countryCode: 'HU' },
  'bucharest': { country: 'Romania', countryCode: 'RO' },
  'sofia': { country: 'Bulgaria', countryCode: 'BG' },
  'athens': { country: 'Greece', countryCode: 'GR' },
  'istanbul': { country: 'Turkey', countryCode: 'TR' },
  'ankara': { country: 'Turkey', countryCode: 'TR' },
  'cairo': { country: 'Egypt', countryCode: 'EG' },
  'johannesburg': { country: 'South Africa', countryCode: 'ZA' },
  'cape town': { country: 'South Africa', countryCode: 'ZA' },
  'mumbai': { country: 'India', countryCode: 'IN' },
  'delhi': { country: 'India', countryCode: 'IN' },
  'new delhi': { country: 'India', countryCode: 'IN' },
  'bangalore': { country: 'India', countryCode: 'IN' },
  'chennai': { country: 'India', countryCode: 'IN' },
  'kolkata': { country: 'India', countryCode: 'IN' },
  'beijing': { country: 'China', countryCode: 'CN' },
  'shanghai': { country: 'China', countryCode: 'CN' },
  'hong kong': { country: 'Hong Kong', countryCode: 'HK' },
  'singapore': { country: 'Singapore', countryCode: 'SG' },
  'seoul': { country: 'South Korea', countryCode: 'KR' },
  'taipei': { country: 'Taiwan', countryCode: 'TW' },
  'bangkok': { country: 'Thailand', countryCode: 'TH' },
  'manila': { country: 'Philippines', countryCode: 'PH' },
  'jakarta': { country: 'Indonesia', countryCode: 'ID' },
  'kuala lumpur': { country: 'Malaysia', countryCode: 'MY' },
  'auckland': { country: 'New Zealand', countryCode: 'NZ' },
  'wellington': { country: 'New Zealand', countryCode: 'NZ' },
  'buenos aires': { country: 'Argentina', countryCode: 'AR' },
  'sao paulo': { country: 'Brazil', countryCode: 'BR' },
  'rio de janeiro': { country: 'Brazil', countryCode: 'BR' },
  'lima': { country: 'Peru', countryCode: 'PE' },
  'bogota': { country: 'Colombia', countryCode: 'CO' },
  'santiago': { country: 'Chile', countryCode: 'CL' },
  'caracas': { country: 'Venezuela', countryCode: 'VE' },
  'havana': { country: 'Cuba', countryCode: 'CU' },
  'kiev': { country: 'Ukraine', countryCode: 'UA' },
  'kyiv': { country: 'Ukraine', countryCode: 'UA' },
  'minsk': { country: 'Belarus', countryCode: 'BY' },
  'riga': { country: 'Latvia', countryCode: 'LV' },
  'vilnius': { country: 'Lithuania', countryCode: 'LT' },
  'tallinn': { country: 'Estonia', countryCode: 'EE' },
  'belgrade': { country: 'Serbia', countryCode: 'RS' },
  'zagreb': { country: 'Croatia', countryCode: 'HR' },
  'ljubljana': { country: 'Slovenia', countryCode: 'SI' },
  'sarajevo': { country: 'Bosnia and Herzegovina', countryCode: 'BA' },
  'skopje': { country: 'North Macedonia', countryCode: 'MK' },
  'tirana': { country: 'Albania', countryCode: 'AL' },
  'lisbon': { country: 'Portugal', countryCode: 'PT' },
  'madrid': { country: 'Spain', countryCode: 'ES' },
  'barcelona': { country: 'Spain', countryCode: 'ES' },
  'yerevan': { country: 'Armenia', countryCode: 'AM' },
  'baku': { country: 'Azerbaijan', countryCode: 'AZ' },
  // V11.11 — extra spiritual / consciousness / travel destinations that
  // appear repeatedly in Reddit witness reports. Smoke #10 surfaced
  // bodies set in Ibiza, Peru, Bali — all real places that were
  // dropping out of the structural location-validator because the
  // adapter couldn't resolve them. The downstream geocoder is fed
  // (city, country) tuples so it can fetch coordinates via MapTiler.
  'ibiza': { country: 'Spain', countryCode: 'ES' },
  'bali': { country: 'Indonesia', countryCode: 'ID' },
  'cusco': { country: 'Peru', countryCode: 'PE' },
  'cuzco': { country: 'Peru', countryCode: 'PE' },
  'iquitos': { country: 'Peru', countryCode: 'PE' },
  'pucallpa': { country: 'Peru', countryCode: 'PE' },
  'paculppa': { country: 'Peru', countryCode: 'PE' },  // smoke #9 misspelling of Pucallpa
  'rishikesh': { country: 'India', countryCode: 'IN' },
  'varanasi': { country: 'India', countryCode: 'IN' },
  'goa': { country: 'India', countryCode: 'IN' },
  'kathmandu': { country: 'Nepal', countryCode: 'NP' },
  'pokhara': { country: 'Nepal', countryCode: 'NP' },
  'chiang mai': { country: 'Thailand', countryCode: 'TH' },
  'koh phangan': { country: 'Thailand', countryCode: 'TH' },
  'tulum': { country: 'Mexico', countryCode: 'MX' },
  'oaxaca': { country: 'Mexico', countryCode: 'MX' },
  'palenque': { country: 'Mexico', countryCode: 'MX' },
  'machu picchu': { country: 'Peru', countryCode: 'PE' },
};

// Countries that share names with US states or could be confused
const COUNTRY_NAMES: Record<string, string> = {
  'georgia': 'Georgia',  // The country, not the US state
  'england': 'United Kingdom',
  'scotland': 'United Kingdom',
  'wales': 'United Kingdom',
  'northern ireland': 'United Kingdom',
  'britain': 'United Kingdom',
  'great britain': 'United Kingdom',
  'uk': 'United Kingdom',
  'ireland': 'Ireland',
  'australia': 'Australia',
  'new zealand': 'New Zealand',
  'canada': 'Canada',
  'mexico': 'Mexico',
  'germany': 'Germany',
  'france': 'France',
  'spain': 'Spain',
  'italy': 'Italy',
  'japan': 'Japan',
  'china': 'China',
  'india': 'India',
  'russia': 'Russia',
  'brazil': 'Brazil',
  'argentina': 'Argentina',
  // V11.11 — countries that appear in Reddit consciousness/cryptid/UFO
  // bodies but were missing from the original list. Added so
  // parseLocation can recognize "in Peru" / "from Iceland" / "in Costa
  // Rica" and feed structured country values to the geocoder.
  'peru': 'Peru',
  'chile': 'Chile',
  'colombia': 'Colombia',
  'venezuela': 'Venezuela',
  'ecuador': 'Ecuador',
  'bolivia': 'Bolivia',
  'uruguay': 'Uruguay',
  'paraguay': 'Paraguay',
  'guyana': 'Guyana',
  'suriname': 'Suriname',
  'costa rica': 'Costa Rica',
  'panama': 'Panama',
  'nicaragua': 'Nicaragua',
  'honduras': 'Honduras',
  'guatemala': 'Guatemala',
  'belize': 'Belize',
  'el salvador': 'El Salvador',
  'cuba': 'Cuba',
  'jamaica': 'Jamaica',
  'haiti': 'Haiti',
  'dominican republic': 'Dominican Republic',
  'iceland': 'Iceland',
  'norway': 'Norway',
  'sweden': 'Sweden',
  'denmark': 'Denmark',
  'finland': 'Finland',
  'netherlands': 'Netherlands',
  'belgium': 'Belgium',
  'switzerland': 'Switzerland',
  'austria': 'Austria',
  'portugal': 'Portugal',
  'greece': 'Greece',
  'turkey': 'Turkey',
  'egypt': 'Egypt',
  'morocco': 'Morocco',
  'south africa': 'South Africa',
  'kenya': 'Kenya',
  'ethiopia': 'Ethiopia',
  'nigeria': 'Nigeria',
  'ghana': 'Ghana',
  'israel': 'Israel',
  'lebanon': 'Lebanon',
  'jordan': 'Jordan',
  'iran': 'Iran',
  'iraq': 'Iraq',
  'saudi arabia': 'Saudi Arabia',
  'uae': 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
  'thailand': 'Thailand',
  'vietnam': 'Vietnam',
  'cambodia': 'Cambodia',
  'laos': 'Laos',
  'myanmar': 'Myanmar',
  'philippines': 'Philippines',
  'indonesia': 'Indonesia',
  'malaysia': 'Malaysia',
  'singapore': 'Singapore',
  'south korea': 'South Korea',
  'korea': 'South Korea',
  'taiwan': 'Taiwan',
  'nepal': 'Nepal',
  'bhutan': 'Bhutan',
  'sri lanka': 'Sri Lanka',
  'bangladesh': 'Bangladesh',
  'pakistan': 'Pakistan',
  'afghanistan': 'Afghanistan',
  'mongolia': 'Mongolia',
};

// Valid US state codes
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP'  // Territories
]);

// US state full names to codes
const US_STATE_NAMES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL',
  'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS', 'kentucky': 'KY',
  'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD', 'massachusetts': 'MA',
  'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
  'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI',
  'wyoming': 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR',
};

export interface ParsedLocation {
  locationName?: string;
  city?: string;
  stateProvince?: string;
  country?: string;
  isInternational: boolean;
}

/**
 * Parse location from text and determine if it's US or international
 */
export function parseLocation(text: string): ParsedLocation {
  const lowerText = text.toLowerCase();

  // First, check for known international cities
  for (const [cityName, info] of Object.entries(INTERNATIONAL_CITIES)) {
    // Look for the city name in the text
    const cityRegex = new RegExp(`\\b${cityName}\\b`, 'i');
    if (cityRegex.test(lowerText)) {
      // Found an international city
      const capitalizedCity = cityName.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      return {
        locationName: `${capitalizedCity}, ${info.country}`,
        city: capitalizedCity,
        country: info.country,
        isInternational: true
      };
    }
  }

  // V11.14.5 — Strip compound proper nouns BEFORE running the
  // country-context regex below. Otherwise:
  //   - "Haunted in New England" → "in England" → UK false positive
  //   - "Little Britain Road" → "Britain" multi-mention → UK false positive
  //   - "in New Mexico" → Mexico false positive
  //   - "in North Carolina" → ... etc
  // We replace the compound with a sentinel so the alias inside it
  // doesn't survive to the regex check.
  const COMPOUND_PROPER_NOUNS = [
    /\bnew\s+england\b/gi,
    /\bnew\s+mexico\b/gi,
    /\bnew\s+zealand\s+(?:street|road|drive|avenue|way|lane|highway)\b/gi,
    /\b(?:little|great|old|new|north|south|east|west|royal|king|queen|prince|princess)\s+(?:britain|england|scotland|wales|ireland|france|germany|spain|italy|china|japan|india|russia|mexico|peru|brazil|portugal|holland|sweden|norway|finland|poland|austria|hungary|greece|turkey|egypt|kenya|morocco|argentina|colombia)\s+(?:road|street|drive|avenue|way|lane|highway|park|square|circle|court|terrace|place|boulevard|crescent)\b/gi,
    // Bare "Little Britain" / "Great Britain" appear as proper nouns in
    // many road/place names; only Great Britain as a country deserves
    // matching, and we already match it via the "great britain"
    // COUNTRY_NAMES key further down — so safe to strip here.
    /\blittle\s+britain\b/gi,
    /\bnew\s+england\s+(?:patriots|revolution|aquarium|conservatory)\b/gi,
  ]
  let strippedLowerText = lowerText
  for (const pat of COMPOUND_PROPER_NOUNS) {
    strippedLowerText = strippedLowerText.replace(pat, '___strip___')
  }

  // V11.14.6 — Strip ETHNIC IDENTITY phrases. The Lakewood case
  // surfaced "im half mexican" — the body describes the witness's
  // ethnic identity, not their current location. Same for "I'm French"
  // / "we're half Italian" / "his Korean grandfather". These should not
  // contribute to country matching.
  const ETHNIC_IDENTITY = /\b(?:i(?:'m|m| am)|we(?:'re|re| are)|he(?:'s|s| is)|she(?:'s|s| is)|they(?:'re|re| are)|his|her|their|my|our|the)\s+(?:half|part|quarter|fully|three[\s-]quarter|one[\s-]quarter|fully\s+ethnic|ethnically)?\s*(?:mexican|italian|french|german|spanish|portuguese|chinese|japanese|korean|vietnamese|filipino|filipina|indian|pakistani|iranian|iraqi|israeli|lebanese|jordanian|turkish|brazilian|argentine|chilean|peruvian|cuban|jamaican|haitian|russian|polish|czech|romanian|hungarian|greek|english|scottish|welsh|irish|british|australian|canadian|kiwi|nigerian|kenyan|ethiopian|moroccan|egyptian|swiss|austrian|dutch|belgian|swedish|norwegian|danish|finnish|icelandic|colombian|venezuelan|ecuadorian|bolivian|paraguayan|uruguayan|salvadoran|guatemalan|honduran|nicaraguan|panamanian|costa\s+rican|dominican|burmese|cambodian|laotian|mongolian|nepalese|tibetan|bhutanese|bangladeshi|sri\s+lankan|afghan|saudi|yemeni|omani|emirati|qatari|kuwaiti|bahraini|south\s+african)\b/gi
  strippedLowerText = strippedLowerText.replace(ETHNIC_IDENTITY, '___strip___')

  // V11.14.6 — Strip PAST-TRIP NARRATIVE CONTEXTS. The Lakewood body
  // also had "his stories from visiting mexico". The "visiting <Country>"
  // pattern correctly catches present trips but false-positives on
  // story preambles ("stories from", "tales of", "memories of").
  // Generic preamble + travel verb + country becomes a strip target.
  const PAST_TRIP_NARRATIVE = /\b(?:stories?|tales?|memories|legends?|folklore|myths?|accounts?|songs?|movies?|films?|books?|games?|games\s+like|culture|cultures|traditions?)\s+(?:from|of|about|featuring|set\s+in|told\s+by)\s+(?:visiting|the\s+|a\s+|an\s+)?\w+/gi
  strippedLowerText = strippedLowerText.replace(PAST_TRIP_NARRATIVE, '___strip___')

  // Aliases that are heavily polluted by ordinary English usage in
  // non-location contexts. For these, we require an explicit
  // preposition match — skip the multi-mention fallback entirely.
  const HIGH_FP_ALIASES = new Set([
    'britain', 'england', 'scotland', 'wales', 'northern ireland',
    'great britain', 'uk', 'ireland',  // Ireland sometimes appears as a person's surname
  ])

  // Check for explicit country mentions (not US states)
  for (const [countryKey, countryName] of Object.entries(COUNTRY_NAMES)) {
    // Special handling for "Georgia" - check context
    if (countryKey === 'georgia') {
      // If text mentions Tbilisi or other Georgian cities, it's the country
      if (/tbilisi|batumi|kutaisi/i.test(lowerText)) {
        return {
          locationName: extractLocationContext(text, 'Georgia'),
          country: 'Georgia',
          isInternational: true
        };
      }
      // If it says "Georgia, USA" or mentions US context, it's the state
      if (/georgia,?\s*(usa|us|united states|u\.s\.)|\bga\b/i.test(lowerText)) {
        continue; // Let it fall through to US state handling
      }
      // If standalone "in Georgia" with no US city context, check for US city names
      const georgiaUSCities = ['atlanta', 'savannah', 'augusta', 'macon', 'columbus', 'athens'];
      if (georgiaUSCities.some(city => lowerText.includes(city))) {
        continue; // It's the US state
      }
    }

    // V11.14.4 — Expanded preposition + qualifier set. Previous regex
    // only matched "(in|from) Italy" — missing "trip to Italy", "After
    // hitting southern Italy", "near Italy", "across Italy", "northern
    // Italy", "rural Italy", etc. Smoke spot-check (May 2026) surfaced
    // a r/Ghosts post that mentions Italy 3 times — none of them with
    // a preposition that hit the old regex — and the report shipped
    // with country=null.
    //
    // Strategy: a single union regex covers prepositions ("(in|from|to|
    // into|across|throughout|around|near|visiting|toured?|traveling|
    // travelled|trip\s+to|study\s+in|studied\s+in|live(?:d|s)?\s+in|
    // moved\s+to|outside)\s+Italy"), directional qualifiers ("northern|
    // southern|eastern|western|central|rural|coastal|interior\s+Italy"),
    // and declarative context ("Italy\s+(?:was|is|has)").
    // (1) prepositions that don't normally appear in negations
    // (2) specific verb+"to" / verb+"in" residence constructions
    // (3) directional/regional qualifier
    // (4) declarative country-first clause
    //
    // NOTE deliberately excluded: bare "to <Country>". That phrase
    // matches "I never went to Italy" / "we couldn't fly to Italy" /
    // etc. and creates false positives in long bodies that mention a
    // country only in a hypothetical or negated context. Specific
    // verb+to combinations ("trip to", "moved to", "traveled to")
    // are positive enough to keep.
    // V11.14.6 — Dropped bare "visiting" from preposition list (too
    // permissive in narrative contexts; PAST_TRIP_NARRATIVE handles
    // most of the harm but the preposition itself is still noisy).
    // Kept "while visiting" / "during my visit to" as specific
    // positives — those unambiguously indicate the witness's location.
    const countryContextRegex = new RegExp(
      `\\b(?:in|from|into|across|throughout|around|near|toured?|traveling|travelled|outside|leaving|hitting)\\s+${countryKey}\\b`
      + `|\\b(?:trip\\s+to|traveled\\s+to|travelled\\s+to|moved\\s+to|flew\\s+to|drove\\s+to|sailed\\s+to|return(?:ed|ing)?\\s+to|came\\s+to|back\\s+to|relocated\\s+to|emigrated\\s+to|immigrated\\s+to)\\s+${countryKey}\\b`
      + `|\\b(?:while\\s+visiting|(?:i|we|they|she|he)\\s+(?:was|were|am|are)\\s+visiting|during\\s+(?:my|our|their|his|her|a)\\s+(?:visit|trip|stay)\\s+to|on\\s+(?:my|our|their|his|her|a)\\s+(?:visit|trip)\\s+to)\\s+${countryKey}\\b`
      + `|\\b(?:study(?:ing)?\\s+in|studied\\s+in|live(?:d|s)?\\s+in|living\\s+in|stationed\\s+in|grew\\s+up\\s+in|raised\\s+in|born\\s+in|stayed\\s+in|staying\\s+in)\\s+${countryKey}\\b`
      + `|\\b(?:northern|southern|eastern|western|central|rural|coastal|interior|mountainous|countryside\\s+of|all\\s+over|throughout|outskirts\\s+of)\\s+${countryKey}\\b`
      + `|\\b${countryKey}\\s+(?:was|is|has|had|during\\s+the)\\b`,
      'i'
    );
    if (countryContextRegex.test(strippedLowerText) && countryKey !== 'georgia') {
      return {
        locationName: countryName,
        country: countryName,
        isInternational: true
      };
    }

    // V11.14.4 — Multi-mention fallback. If the country name appears
    // 2+ times in the body with no preposition match, that's still a
    // strong signal it's the locale (the title may use the adjectival
    // form like "Italian" and the body keeps saying "Italy").
    //
    // V11.14.5 — Skip this fallback for HIGH_FP aliases (UK pieces +
    // Ireland). Those are too commonly used in road names ("Little
    // Britain Road"), surnames ("Mr. Ireland"), TV show titles
    // ("Haunted in New England"), and historical references to be
    // safely inferred from frequency alone.
    if (
      countryKey !== 'georgia'
      && !HIGH_FP_ALIASES.has(countryKey)
      && countryKey.length >= 4
      && strippedLowerText.length > 200
    ) {
      const wordBoundary = new RegExp('\\b' + countryKey + '\\b', 'gi');
      const matches = strippedLowerText.match(wordBoundary);
      if (matches && matches.length >= 2) {
        return {
          locationName: countryName,
          country: countryName,
          isInternational: true
        };
      }
    }
  }

  // Check for "[City], [Country]" pattern for Georgia specifically
  const georgiaCountryMatch = text.match(/([A-Z][a-zA-Z\s]+),\s*Georgia(?!\s*,?\s*(?:USA|US|United States))/i);
  if (georgiaCountryMatch) {
    const city = georgiaCountryMatch[1].trim();
    // Check if this city is a known Georgian city or NOT a US city
    const knownUSGeorgiaCities = ['atlanta', 'savannah', 'augusta', 'macon', 'columbus', 'athens', 'marietta', 'roswell', 'albany', 'valdosta'];
    if (!knownUSGeorgiaCities.includes(city.toLowerCase())) {
      // Check if it's a known Georgian (country) city
      if (['tbilisi', 'batumi', 'kutaisi', 'rustavi', 'gori', 'zugdidi', 'poti', 'kobuleti'].includes(city.toLowerCase())) {
        return {
          locationName: `${city}, Georgia`,
          city: city,
          country: 'Georgia',
          isInternational: true
        };
      }
    }
  }

  // Standard US location extraction
  // Look for [City], [State] or [City], [ST] patterns
  const usLocationMatch = text.match(
    /(?:in|at|near|from)\s+([A-Z][a-zA-Z\s]+),?\s*([A-Z]{2})(?:,?\s*(?:USA|US|United States))?/
  );

  if (usLocationMatch) {
    const city = usLocationMatch[1].trim();
    const stateCode = usLocationMatch[2].toUpperCase();

    if (US_STATE_CODES.has(stateCode)) {
      return {
        locationName: `${city}, ${stateCode}`,
        city: city,
        stateProvince: stateCode,
        country: 'United States',
        isInternational: false
      };
    }
  }

  // Check for full state names
  for (const [stateName, stateCode] of Object.entries(US_STATE_NAMES)) {
    const stateRegex = new RegExp(`\\b([A-Z][a-zA-Z\\s]+),?\\s*${stateName}\\b`, 'i');
    const match = text.match(stateRegex);
    if (match) {
      return {
        locationName: `${match[1].trim()}, ${stateCode}`,
        city: match[1].trim(),
        stateProvince: stateCode,
        country: 'United States',
        isInternational: false
      };
    }
  }

  // Check for explicit USA/US mention
  if (/\b(USA|United States|U\.S\.A?)\b/i.test(text)) {
    return {
      country: 'United States',
      isInternational: false
    };
  }

  // No location found or couldn't determine
  return {
    isInternational: false
  };
}

/**
 * Extract location context around a country/region name
 */
function extractLocationContext(text: string, region: string): string {
  const regex = new RegExp(`([A-Z][a-zA-Z\\s]+),?\\s*${region}`, 'i');
  const match = text.match(regex);
  if (match) {
    return `${match[1].trim()}, ${region}`;
  }
  return region;
}

/**
 * Determine country from text, with better international awareness
 */
export function determineCountry(text: string, defaultCountry: string = 'Unknown'): string {
  const parsed = parseLocation(text);
  return parsed.country || defaultCountry;
}
