// Ghosts of America Adapter
// Scrapes user-submitted ghost sighting reports from ghostsofamerica.com

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// State abbreviation to full name mapping
const STATE_NAMES: Record<string, string> = {
  'al': 'Alabama', 'ak': 'Alaska', 'az': 'Arizona', 'ar': 'Arkansas', 'ca': 'California',
  'co': 'Colorado', 'ct': 'Connecticut', 'de': 'Delaware', 'fl': 'Florida', 'ga': 'Georgia',
  'hi': 'Hawaii', 'id': 'Idaho', 'il': 'Illinois', 'in': 'Indiana', 'ia': 'Iowa',
  'ks': 'Kansas', 'ky': 'Kentucky', 'la': 'Louisiana', 'me': 'Maine', 'md': 'Maryland',
  'ma': 'Massachusetts', 'mi': 'Michigan', 'mn': 'Minnesota', 'ms': 'Mississippi', 'mo': 'Missouri',
  'mt': 'Montana', 'ne': 'Nebraska', 'nv': 'Nevada', 'nh': 'New Hampshire', 'nj': 'New Jersey',
  'nm': 'New Mexico', 'ny': 'New York', 'nc': 'North Carolina', 'nd': 'North Dakota', 'oh': 'Ohio',
  'ok': 'Oklahoma', 'or': 'Oregon', 'pa': 'Pennsylvania', 'ri': 'Rhode Island', 'sc': 'South Carolina',
  'sd': 'South Dakota', 'tn': 'Tennessee', 'tx': 'Texas', 'ut': 'Utah', 'vt': 'Vermont',
  'va': 'Virginia', 'wa': 'Washington', 'wv': 'West Virginia', 'wi': 'Wisconsin', 'wy': 'Wyoming'
};

// Parse the state index page to get links to state ghost pages
function parseStateIndex(html: string): { state: string; stateCode: string; url: string }[] {
  const states: { state: string; stateCode: string; url: string }[] = [];

  // Match links to ghost state pages
  const linkPattern = /<a\s+href="([^"]*\/([a-z]{2})\/)"[^>]*>([^<]*ghost[^<]*)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1];
    const stateCode = match[2].toLowerCase();
    const stateName = STATE_NAMES[stateCode];

    if (stateName) {
      states.push({ state: stateName, stateCode, url });
    }
  }

  // Also try a simpler pattern for state links
  if (states.length === 0) {
    const simplePattern = /href="[^"]*\/ghosts\/([a-z]{2})\/"/gi;
    while ((match = simplePattern.exec(html)) !== null) {
      const stateCode = match[1].toLowerCase();
      const stateName = STATE_NAMES[stateCode];
      if (stateName && !states.find(s => s.stateCode === stateCode)) {
        states.push({
          state: stateName,
          stateCode,
          url: `/ghosts/${stateCode}/`
        });
      }
    }
  }

  return states;
}

// Parse individual ghost story entries from a state or city page
function parseGhostStories(html: string, stateName: string, cityName?: string): ScrapedReport[] {
  const reports: ScrapedReport[] = [];

  // Ghost stories are typically in article or div blocks
  // Look for story content blocks
  const storyPattern = /<div[^>]*class="[^"]*(?:story|ghost|report|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>|<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  let storyIndex = 0;

  while ((match = storyPattern.exec(html)) !== null) {
    const content = (match[1] || match[2] || '').trim();
    if (!content || content.length < 100) continue;

    // Clean HTML
    const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Try to extract title
    const titleMatch = content.match(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/i);
    const title = titleMatch
      ? titleMatch[1].trim()
      : cleanContent.substring(0, 60).split(/[.!?]/)[0] + '...';

    // Try to extract location from content
    const locationMatch = cleanContent.match(/(?:in|at|near)\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2})?)/);
    const location = locationMatch
      ? locationMatch[1]
      : (cityName || stateName);

    // Try to extract date
    const dateMatch = cleanContent.match(/(?:in|on|around|circa)\s+(\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i);
    let eventDate: string | undefined;
    if (dateMatch) {
      const dateStr = dateMatch[1];
      if (/^\d{4}$/.test(dateStr)) {
        eventDate = `${dateStr}-01-01`; // Just year, use Jan 1
      } else {
        try {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            eventDate = parsed.toISOString().split('T')[0];
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }

    // Generate unique ID
    const reportId = `goa-${stateName.toLowerCase().replace(/\s+/g, '-')}-${storyIndex++}`;

    // Create summary
    const summary = cleanContent.length > 200
      ? cleanContent.substring(0, 197) + '...'
      : cleanContent;

    // Extract tags
    const tags: string[] = ['ghost-story'];
    const lowerContent = cleanContent.toLowerCase();

    if (lowerContent.includes('apparition') || lowerContent.includes('figure') || lowerContent.includes('shadow')) {
      tags.push('apparition');
    }
    if (lowerContent.includes('voice') || lowerContent.includes('heard') || lowerContent.includes('sound') || lowerContent.includes('scream')) {
      tags.push('audio-phenomena');
    }
    if (lowerContent.includes('cold') || lowerContent.includes('temperature') || lowerContent.includes('chill')) {
      tags.push('cold-spot');
    }
    if (lowerContent.includes('touch') || lowerContent.includes('felt') || lowerContent.includes('grabbed')) {
      tags.push('physical-contact');
    }
    if (lowerContent.includes('child') || lowerContent.includes('children') || lowerContent.includes('little girl') || lowerContent.includes('little boy')) {
      tags.push('child-spirit');
    }
    if (lowerContent.includes('civil war') || lowerContent.includes('soldier') || lowerContent.includes('war')) {
      tags.push('historical');
    }
    if (lowerContent.includes('murder') || lowerContent.includes('killed') || lowerContent.includes('death')) {
      tags.push('tragic-death');
    }

    // Determine credibility
    let credibility: 'low' | 'medium' | 'high' = 'medium';
    const hasDetails = cleanContent.length > 500;
    const hasDate = !!eventDate;
    const hasSpecificLocation = locationMatch !== null;
    const detailScore = (hasDetails ? 1 : 0) + (hasDate ? 1 : 0) + (hasSpecificLocation ? 1 : 0);

    if (detailScore >= 2) {
      credibility = 'high';
    } else if (detailScore === 0 && cleanContent.length < 200) {
      credibility = 'low';
    }

    reports.push({
      title: title.length > 100 ? title.substring(0, 97) + '...' : title,
      summary,
      description: cleanContent,
      category: 'ghosts_hauntings',
      location_name: location,
      country: 'United States',
      state_province: stateName,
      city: cityName,
      event_date: eventDate,
      credibility,
      source_type: 'ghostsofamerica',
      original_report_id: reportId,
      tags
    });
  }

  // Fallback: Try parsing paragraphs if no structured stories found
  if (reports.length === 0) {
    const paragraphs = html.match(/<p[^>]*>([\s\S]{200,}?)<\/p>/gi) || [];

    for (const p of paragraphs.slice(0, 10)) {
      const cleanContent = p.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      // Skip navigation/boilerplate text
      if (cleanContent.includes('click here') || cleanContent.includes('submit') ||
          cleanContent.includes('copyright') || cleanContent.length < 150) {
        continue;
      }

      const reportId = `goa-${stateName.toLowerCase().replace(/\s+/g, '-')}-p${storyIndex++}`;

      reports.push({
        title: `Ghost Story from ${cityName || stateName}`,
        summary: cleanContent.substring(0, 197) + '...',
        description: cleanContent,
        category: 'ghosts_hauntings',
        location_name: cityName || stateName,
        country: 'United States',
        state_province: stateName,
        city: cityName,
        credibility: 'medium',
        source_type: 'ghostsofamerica',
        original_report_id: reportId,
        tags: ['ghost-story']
      });
    }
  }

  return reports;
}

// Main adapter implementation
export const ghostsOfAmericaAdapter: SourceAdapter = {
  name: 'ghostsofamerica',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const baseUrl = config.base_url || 'https://www.ghostsofamerica.com';
    const rateLimitMs = config.rate_limit_ms || 1000;
    const targetStates = config.states || ['ca', 'tx', 'fl', 'oh', 'pa', 'ny', 'il', 'ga'];

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    try {
      console.log('[GhostsOfAmerica] Starting scrape...');

      // Directly construct state URLs based on known structure
      for (const stateCode of targetStates) {
        if (allReports.length >= limit) break;

        const stateName = STATE_NAMES[stateCode.toLowerCase()];
        if (!stateName) {
          errors.push(`Unknown state code: ${stateCode}`);
          continue;
        }

        try {
          await delay(rateLimitMs);

          const stateUrl = `${baseUrl}/ghosts/${stateCode.toLowerCase()}/`;
          console.log(`[GhostsOfAmerica] Fetching ${stateName}...`);

          const response = await fetch(stateUrl, {
            headers: {
              'User-Agent': 'ParaDocs Research Bot/1.0 (educational research)',
              'Accept': 'text/html'
            }
          });

          if (!response.ok) {
            errors.push(`Failed to fetch ${stateName}: ${response.status}`);
            continue;
          }

          const html = await response.text();
          const stateReports = parseGhostStories(html, stateName);

          console.log(`[GhostsOfAmerica] Found ${stateReports.length} stories in ${stateName}`);

          // Add reports up to limit
          const remaining = limit - allReports.length;
          allReports.push(...stateReports.slice(0, remaining));

        } catch (stateError) {
          errors.push(`Error processing ${stateName}: ${stateError}`);
        }
      }

      console.log(`[GhostsOfAmerica] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

    } catch (error) {
      console.error('[GhostsOfAmerica] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
