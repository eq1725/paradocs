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

    // Check for "in [Country]" pattern
    const countryRegex = new RegExp(`\\b(in|from)\\s+${countryKey}\\b`, 'i');
    if (countryRegex.test(lowerText) && countryKey !== 'georgia') {
      return {
        locationName: countryName,
        country: countryName,
        isInternational: true
      };
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
