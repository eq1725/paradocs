// NDERF (Near-Death Experience Research Foundation) Adapter
// Fetches near-death experience reports from nderf.org
//
// NOTE: This adapter requires external web access to nderf.org
// The site structure is based on the NDERF archives which organize
// experiences by category (exceptional, probable NDE, etc.)

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// NDE experience types on NDERF
const NDE_TYPES = {
  exceptional: 'Exceptional NDE',
  probable: 'Probable NDE',
  questionable: 'Questionable NDE',
  sde: 'Shared Death Experience',
  obe: 'Out of Body Experience',
  fearde: 'Fear-Death Experience',
  other: 'Other Spiritually Transformative Experience'
};

// Extract NDE characteristics from content
function extractCharacteristics(content: string): string[] {
  const characteristics: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common NDE elements
  if (lowerContent.includes('tunnel') || lowerContent.includes('darkness')) {
    characteristics.push('tunnel-experience');
  }
  if (lowerContent.includes('light') && (lowerContent.includes('bright') || lowerContent.includes('white'))) {
    characteristics.push('being-of-light');
  }
  if (lowerContent.includes('deceased') || lowerContent.includes('relatives') || lowerContent.includes('family member')) {
    characteristics.push('deceased-relatives');
  }
  if (lowerContent.includes('life review') || lowerContent.includes('my life flash') || lowerContent.includes('saw my life')) {
    characteristics.push('life-review');
  }
  if (lowerContent.includes('out of body') || lowerContent.includes('above my body') || lowerContent.includes('looking down')) {
    characteristics.push('out-of-body');
  }
  if (lowerContent.includes('peaceful') || lowerContent.includes('calm') || lowerContent.includes('serenity')) {
    characteristics.push('peace-calm');
  }
  if (lowerContent.includes('love') && (lowerContent.includes('unconditional') || lowerContent.includes('overwhelming'))) {
    characteristics.push('unconditional-love');
  }
  if (lowerContent.includes('boundary') || lowerContent.includes('border') || lowerContent.includes('point of no return')) {
    characteristics.push('boundary-experience');
  }
  if (lowerContent.includes('sent back') || lowerContent.includes('told to return') || lowerContent.includes('not my time')) {
    characteristics.push('sent-back');
  }
  if (lowerContent.includes('hospital') || lowerContent.includes('surgery') || lowerContent.includes('cardiac arrest')) {
    characteristics.push('medical-setting');
  }
  if (lowerContent.includes('drown') || lowerContent.includes('water')) {
    characteristics.push('drowning');
  }
  if (lowerContent.includes('car') && (lowerContent.includes('accident') || lowerContent.includes('crash'))) {
    characteristics.push('accident');
  }

  return characteristics;
}

// Determine credibility based on detail level
function determineCredibility(content: string, ndeType: string): 'low' | 'medium' | 'high' {
  let score = 0;

  // Length-based scoring
  if (content.length > 500) score += 1;
  if (content.length > 1500) score += 1;
  if (content.length > 3000) score += 1;

  // Type-based scoring
  if (ndeType === 'exceptional') score += 2;
  else if (ndeType === 'probable') score += 1;

  // Detail indicators
  if (content.includes('date') || /\d{4}/.test(content)) score += 1;
  if (content.includes('hospital') || content.includes('doctor')) score += 1;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// Generate tags from content
function generateTags(content: string, ndeType: string): string[] {
  const tags: string[] = ['nde', 'near-death-experience', 'nderf'];

  // Add NDE type as tag
  tags.push(ndeType.toLowerCase().replace(/\s+/g, '-'));

  // Add characteristics as tags
  const characteristics = extractCharacteristics(content);
  tags.push(...characteristics);

  // Add emotional tone tags
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('terrifying') || lowerContent.includes('frightening') || lowerContent.includes('scary')) {
    tags.push('distressing-nde');
  }
  if (lowerContent.includes('beautiful') || lowerContent.includes('wonderful') || lowerContent.includes('amazing')) {
    tags.push('positive-nde');
  }

  return Array.from(new Set(tags));
}

// Clean text from HTML artifacts
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch page with browser-like headers
async function fetchWithHeaders(url: string, retries: number = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      if (response.ok) {
        return await response.text();
      }
      console.log(`[NDERF] Fetch failed (attempt ${i + 1}): ${url} - Status: ${response.status}`);
    } catch (e) {
      console.error(`[NDERF] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) {
      await delay(1000);
    }
  }
  return null;
}

// Parse the NDERF archive index page
async function parseArchiveIndex(html: string): Promise<Array<{ id: string; name: string; url: string }>> {
  const experiences: Array<{ id: string; name: string; url: string }> = [];

  // NDERF uses links like /Experiences/1_name_nde.htm
  const linkPattern = /<a[^>]+href=["']([^"']*\/Experiences\/([^"']+)\.htm)["'][^>]*>([^<]+)/gi;

  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1].startsWith('http') ? match[1] : `https://www.nderf.org${match[1]}`;
    const id = match[2];
    const name = cleanText(match[3]);

    if (name && id && !experiences.find(e => e.id === id)) {
      experiences.push({ id, name, url });
    }
  }

  return experiences;
}

// Parse an individual experience page
function parseExperiencePage(html: string, id: string, name: string): ScrapedReport | null {
  // Extract the main content (usually in a specific div or article)
  let content = '';

  // Try different content extraction patterns
  const contentPatterns = [
    /<div[^>]*class="[^"]*experience[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
  ];

  for (const pattern of contentPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      content = Array.isArray(matches) ? matches.join('\n\n') : matches[1];
      if (content.length > 200) break;
    }
  }

  // Clean the content
  content = cleanText(content);

  // Skip if content is too short
  if (content.length < 100) {
    console.log(`[NDERF] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }

  // Determine NDE type from page content or URL
  let ndeType = 'exceptional';
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('probable nde')) ndeType = 'probable';
  else if (lowerHtml.includes('shared death') || id.toLowerCase().includes('sde')) ndeType = 'sde';
  else if (lowerHtml.includes('out of body') || id.toLowerCase().includes('obe')) ndeType = 'obe';

  // Generate title from name or first sentence
  const title = name || content.substring(0, 80).split('.')[0] + '...';

  // Create summary
  const summary = content.length > 300 ? content.substring(0, 297) + '...' : content;

  // Generate tags
  const tags = generateTags(content, ndeType);

  return {
    title: `Near-Death Experience: ${title}`.substring(0, 200),
    summary,
    description: content,
    category: 'psychological_experiences',
    event_date: undefined, // NDERF doesn't always include specific dates
    credibility: determineCredibility(content, ndeType),
    source_type: 'nderf',
    original_report_id: `nderf-${id}`,
    tags,
    source_label: 'NDERF',
    source_url: `https://www.nderf.org/Experiences/${id}.htm`,
    metadata: {
      ndeType: NDE_TYPES[ndeType as keyof typeof NDE_TYPES] || ndeType,
      characteristics: extractCharacteristics(content),
      source: 'Near-Death Experience Research Foundation'
    }
  };
}

export const nderfAdapter: SourceAdapter = {
  name: 'nderf',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    const rateLimitMs = config.rate_limit_ms || 500;

    try {
      console.log(`[NDERF] Starting scrape. Limit: ${limit}`);

      // NDERF archive URLs - different categories
      const archiveUrls = [
        'https://www.nderf.org/Experiences/exceptional.htm',
        'https://www.nderf.org/Experiences/probable_nde.htm',
        'https://www.nderf.org/Archives/exceptional.html',
      ];

      for (const archiveUrl of archiveUrls) {
        if (reports.length >= limit) break;

        console.log(`[NDERF] Fetching archive: ${archiveUrl}`);
        const archiveHtml = await fetchWithHeaders(archiveUrl);

        if (!archiveHtml) {
          console.log(`[NDERF] Failed to fetch archive: ${archiveUrl}`);
          continue;
        }

        // Parse index to get experience links
        const experiences = await parseArchiveIndex(archiveHtml);
        console.log(`[NDERF] Found ${experiences.length} experiences in archive`);

        for (const exp of experiences) {
          if (reports.length >= limit) break;

          await delay(rateLimitMs);

          console.log(`[NDERF] Fetching experience: ${exp.id}`);
          const expHtml = await fetchWithHeaders(exp.url);

          if (!expHtml) {
            console.log(`[NDERF] Failed to fetch experience: ${exp.id}`);
            continue;
          }

          const report = parseExperiencePage(expHtml, exp.id, exp.name);
          if (report) {
            reports.push(report);

            if (reports.length % 20 === 0) {
              console.log(`[NDERF] Processed ${reports.length} reports...`);
            }
          }
        }
      }

      console.log(`[NDERF] Scrape complete. Total: ${reports.length} reports`);

      return {
        success: reports.length > 0,
        reports: reports
      };

    } catch (error) {
      console.error('[NDERF] Scrape error:', error);
      return {
        success: false,
        reports: reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default nderfAdapter;
