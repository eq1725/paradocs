// Shadowlands Haunted Places Index Adapter
// Scrapes ghost/haunting reports from theshadowlands.net

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse HTML to extract text content (simple regex-based for server-side)
function extractText(html: string, selector: string): string {
  // Basic extraction - in production would use a proper HTML parser
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

// Extract state entries from the Shadowlands haunted places index
function parseStateIndex(html: string): { state: string; url: string }[] {
  const states: { state: string; url: string }[] = [];

  // Match links to state pages
  const linkPattern = /<a\s+href="([^"]*(?:places|haunted)[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1];
    const text = match[2].trim();

    // Filter for US state pages
    if (url.includes('places') || url.includes('haunted')) {
      states.push({ state: text, url });
    }
  }

  return states;
}

// Parse individual location entries from a state page
function parseLocationEntries(html: string, stateName: string): ScrapedReport[] {
  const reports: ScrapedReport[] = [];

  // Shadowlands format typically has location entries as paragraphs or list items
  // Each entry usually has a location name followed by description

  // Split by common delimiters used on the site
  const entryPattern = /<p[^>]*>(.*?)<\/p>|<li[^>]*>(.*?)<\/li>/gi;
  let match;
  let entryIndex = 0;

  while ((match = entryPattern.exec(html)) !== null) {
    const content = (match[1] || match[2] || '').trim();
    if (!content || content.length < 50) continue; // Skip short entries

    // Clean HTML tags
    const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Try to extract location name (usually bold or at start)
    const locationMatch = content.match(/<b>([^<]+)<\/b>|<strong>([^<]+)<\/strong>/i);
    const locationName = locationMatch
      ? (locationMatch[1] || locationMatch[2]).trim()
      : cleanContent.split(/[-–—:]/, 2)[0]?.trim().substring(0, 100);

    if (!locationName || locationName.length < 3) continue;

    // Generate unique ID
    const reportId = `shadowlands-${stateName.toLowerCase().replace(/\s+/g, '-')}-${entryIndex++}`;

    // Extract description (everything after location name)
    let description = cleanContent;
    if (locationName && cleanContent.startsWith(locationName)) {
      description = cleanContent.substring(locationName.length).replace(/^[-–—:\s]+/, '').trim();
    }

    if (description.length < 30) continue; // Skip entries with very short descriptions

    // Create summary from first ~200 chars
    const summary = description.length > 200
      ? description.substring(0, 197) + '...'
      : description;

    // Extract tags based on content
    const tags: string[] = ['haunted'];
    const lowerContent = cleanContent.toLowerCase();

    if (lowerContent.includes('ghost') || lowerContent.includes('spirit') || lowerContent.includes('apparition')) {
      tags.push('ghost');
    }
    if (lowerContent.includes('poltergeist') || lowerContent.includes('noise') || lowerContent.includes('thrown')) {
      tags.push('poltergeist');
    }
    if (lowerContent.includes('cemetery') || lowerContent.includes('graveyard')) {
      tags.push('cemetery');
    }
    if (lowerContent.includes('hotel') || lowerContent.includes('inn')) {
      tags.push('hotel');
    }
    if (lowerContent.includes('house') || lowerContent.includes('home') || lowerContent.includes('residence')) {
      tags.push('residence');
    }
    if (lowerContent.includes('hospital') || lowerContent.includes('asylum')) {
      tags.push('hospital');
    }
    if (lowerContent.includes('school') || lowerContent.includes('university') || lowerContent.includes('college')) {
      tags.push('school');
    }
    if (lowerContent.includes('civil war') || lowerContent.includes('battlefield')) {
      tags.push('historical');
    }

    // Determine credibility based on detail level
    let credibility: 'low' | 'medium' | 'high' = 'medium';
    if (description.length > 500 && tags.length > 2) {
      credibility = 'high';
    } else if (description.length < 100) {
      credibility = 'low';
    }

    reports.push({
      title: `Haunted: ${locationName}`,
      summary,
      description,
      category: 'ghosts_hauntings',
      location_name: `${locationName}, ${stateName}`,
      country: 'United States',
      state_province: stateName,
      credibility,
      source_type: 'shadowlands',
      original_report_id: reportId,
      tags,
      // New quality system fields
      source_label: 'Shadowlands',
      metadata: {
        locationName,
        stateName
      }
    });
  }

  return reports;
}

// Fetch with browser-like headers
async function fetchWithHeaders(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
}

// Main adapter implementation
export const shadowlandsAdapter: SourceAdapter = {
  name: 'shadowlands',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const rateLimitMs = config.rate_limit_ms || 1000;
    const targetStates = config.states || ['california', 'texas', 'florida', 'ohio', 'pennsylvania', 'new york', 'illinois'];

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    // Try multiple possible base URLs
    const possibleUrls = [
      'https://theshadowlands.net/places',
      'http://theshadowlands.net/places',
      'https://www.theshadowlands.net/places',
      'http://www.theshadowlands.net/places',
    ];

    try {
      console.log('[Shadowlands] Starting scrape...');

      let indexHtml: string | null = null;
      let successfulBaseUrl = '';

      // Try to fetch the main index page from various URLs
      for (const baseUrl of possibleUrls) {
        try {
          console.log(`[Shadowlands] Trying: ${baseUrl}`);
          const indexResponse = await fetchWithHeaders(baseUrl);

          if (indexResponse.ok) {
            indexHtml = await indexResponse.text();
            successfulBaseUrl = baseUrl;
            console.log(`[Shadowlands] Success with: ${baseUrl}`);
            break;
          }
        } catch (e) {
          console.log(`[Shadowlands] Failed: ${baseUrl}`);
        }
      }

      if (!indexHtml) {
        return {
          success: false,
          reports: [],
          error: 'Failed to fetch Shadowlands index from any known URL'
        };
      }

      const baseUrl = successfulBaseUrl;
      const stateLinks = parseStateIndex(indexHtml);

      console.log(`[Shadowlands] Found ${stateLinks.length} state pages`);

      // Filter to target states
      const filteredStates = stateLinks.filter(s =>
        targetStates.some(target => s.state.toLowerCase().includes(target.toLowerCase()))
      );

      // Scrape each state page
      for (const stateInfo of filteredStates) {
        if (allReports.length >= limit) break;

        try {
          await delay(rateLimitMs);

          // Resolve relative URLs
          const stateUrl = stateInfo.url.startsWith('http')
            ? stateInfo.url
            : new URL(stateInfo.url, baseUrl).toString();

          console.log(`[Shadowlands] Fetching ${stateInfo.state}...`);

          const stateResponse = await fetch(stateUrl, {
            headers: {
              'User-Agent': 'ParaDocs Research Bot/1.0 (educational research)',
              'Accept': 'text/html'
            }
          });

          if (!stateResponse.ok) {
            errors.push(`Failed to fetch ${stateInfo.state}: ${stateResponse.status}`);
            continue;
          }

          const stateHtml = await stateResponse.text();
          const stateReports = parseLocationEntries(stateHtml, stateInfo.state);

          console.log(`[Shadowlands] Found ${stateReports.length} entries in ${stateInfo.state}`);

          // Add reports up to limit
          const remaining = limit - allReports.length;
          allReports.push(...stateReports.slice(0, remaining));

        } catch (stateError) {
          errors.push(`Error processing ${stateInfo.state}: ${stateError}`);
        }
      }

      console.log(`[Shadowlands] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: true,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

    } catch (error) {
      console.error('[Shadowlands] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
