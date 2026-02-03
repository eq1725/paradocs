// IANDS (International Association for Near-Death Studies) Adapter
// Fetches NDE stories from iands.org
//
// NOTE: This adapter requires external web access to iands.org
// IANDS is a leading organization for NDE research and education

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// NDE account categories on IANDS
const IANDS_CATEGORIES = {
  nde: 'Near-Death Experience',
  ste: 'Spiritually Transformative Experience',
  obe: 'Out of Body Experience',
  childhood: 'Childhood NDE',
  distressing: 'Distressing NDE'
};

// Extract NDE characteristics from content
function extractCharacteristics(content: string): string[] {
  const characteristics: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common NDE elements (same as NDERF for consistency)
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
  if (lowerContent.includes('being') || lowerContent.includes('entity') || lowerContent.includes('presence')) {
    characteristics.push('encounter-beings');
  }
  if (lowerContent.includes('knowledge') || lowerContent.includes('understanding') || lowerContent.includes('revelation')) {
    characteristics.push('heightened-understanding');
  }
  if (lowerContent.includes('music') || lowerContent.includes('sound')) {
    characteristics.push('celestial-sounds');
  }
  if (lowerContent.includes('garden') || lowerContent.includes('landscape') || lowerContent.includes('meadow')) {
    characteristics.push('transcendent-landscape');
  }

  return characteristics;
}

// Determine credibility based on detail level
function determineCredibility(content: string): 'low' | 'medium' | 'high' {
  let score = 0;

  // Length-based scoring
  if (content.length > 500) score += 1;
  if (content.length > 1500) score += 1;
  if (content.length > 3000) score += 1;

  // Detail indicators
  if (content.includes('date') || /\d{4}/.test(content)) score += 1;
  if (content.includes('hospital') || content.includes('doctor')) score += 1;
  if (content.includes('verified') || content.includes('medical records')) score += 1;

  // IANDS accounts are typically well-vetted
  score += 1;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// Generate tags from content
function generateTags(content: string, accountType: string): string[] {
  const tags: string[] = ['nde', 'near-death-experience', 'iands'];

  // Add account type as tag
  if (accountType) {
    tags.push(accountType.toLowerCase().replace(/\s+/g, '-'));
  }

  // Add characteristics as tags
  const characteristics = extractCharacteristics(content);
  tags.push(...characteristics);

  // Add contextual tags
  const lowerContent = content.toLowerCase();

  // Cause of NDE
  if (lowerContent.includes('cardiac') || lowerContent.includes('heart')) tags.push('cardiac-arrest');
  if (lowerContent.includes('surgery') || lowerContent.includes('operation')) tags.push('surgical');
  if (lowerContent.includes('accident') || lowerContent.includes('crash')) tags.push('accident');
  if (lowerContent.includes('drown')) tags.push('drowning');
  if (lowerContent.includes('suicide') || lowerContent.includes('self')) tags.push('suicide-attempt');
  if (lowerContent.includes('childbirth') || lowerContent.includes('pregnancy')) tags.push('childbirth');
  if (lowerContent.includes('illness') || lowerContent.includes('disease')) tags.push('illness');

  // Experience type
  if (lowerContent.includes('hell') || lowerContent.includes('terrifying') || lowerContent.includes('dark')) {
    tags.push('distressing-nde');
  }
  if (lowerContent.includes('heaven') || lowerContent.includes('paradise') || lowerContent.includes('beautiful')) {
    tags.push('positive-nde');
  }
  if (lowerContent.includes('child') || lowerContent.includes('young') || lowerContent.includes('years old')) {
    if (lowerContent.match(/(\d+)\s*(years?\s*old|yr)/i)) {
      const ageMatch = lowerContent.match(/(\d+)\s*(years?\s*old|yr)/i);
      if (ageMatch && parseInt(ageMatch[1]) < 18) {
        tags.push('childhood-nde');
      }
    }
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
      console.log(`[IANDS] Fetch failed (attempt ${i + 1}): ${url} - Status: ${response.status}`);
    } catch (e) {
      console.error(`[IANDS] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) {
      await delay(1000);
    }
  }
  return null;
}

// Parse the IANDS accounts listing page
async function parseAccountsListing(html: string): Promise<Array<{ id: string; title: string; url: string }>> {
  const accounts: Array<{ id: string; title: string; url: string }> = [];

  // IANDS uses Joomla CMS - typical patterns for article links
  const linkPatterns = [
    // Standard Joomla article links
    /<a[^>]+href=["']([^"']*\/nde-stories\/nde-accounts\/([^"']+))["'][^>]*>([^<]+)/gi,
    // Alternative pattern
    /<a[^>]+href=["']([^"']*itemid=\d+[^"']*)["'][^>]*>([^<]+)/gi,
    // Generic article pattern
    /<h\d[^>]*><a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)/gi,
  ];

  for (const pattern of linkPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1].startsWith('http') ? match[1] : `https://iands.org${match[1]}`;
      const id = match[2] || url.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
      const title = cleanText(match[3] || match[2]);

      // Skip navigation/menu links
      if (title.length < 5 || title.toLowerCase().includes('menu') || title.toLowerCase().includes('home')) {
        continue;
      }

      if (!accounts.find(a => a.url === url)) {
        accounts.push({ id, title, url });
      }
    }
  }

  return accounts;
}

// Parse an individual NDE account page
function parseAccountPage(html: string, id: string, title: string): ScrapedReport | null {
  let content = '';

  // Try different content extraction patterns for Joomla
  const contentPatterns = [
    /<div[^>]*class="[^"]*item-page[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      content = cleanText(match[1]);
      if (content.length > 200) break;
    }
  }

  // Fallback: grab all paragraphs
  if (content.length < 200) {
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    content = paragraphs.map(p => cleanText(p)).join('\n\n');
  }

  // Skip if content is too short
  if (content.length < 100) {
    console.log(`[IANDS] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }

  // Determine account type
  let accountType = 'nde';
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('out of body') && !lowerContent.includes('near death')) accountType = 'obe';
  else if (lowerContent.includes('spiritually transformative')) accountType = 'ste';
  else if (lowerContent.includes('distressing')) accountType = 'distressing';

  // Create summary
  const summary = content.length > 300 ? content.substring(0, 297) + '...' : content;

  // Generate tags
  const tags = generateTags(content, accountType);

  return {
    title: title.length > 150 ? title.substring(0, 147) + '...' : title,
    summary,
    description: content,
    category: 'psychological_experiences',
    event_date: undefined,
    credibility: determineCredibility(content),
    source_type: 'iands',
    original_report_id: `iands-${id}`,
    tags,
    source_label: 'IANDS',
    source_url: `https://iands.org/nde-stories/nde-accounts/${id}`,
    metadata: {
      accountType: IANDS_CATEGORIES[accountType as keyof typeof IANDS_CATEGORIES] || accountType,
      characteristics: extractCharacteristics(content),
      source: 'International Association for Near-Death Studies'
    }
  };
}

export const iandsAdapter: SourceAdapter = {
  name: 'iands',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    const rateLimitMs = config.rate_limit_ms || 500;

    try {
      console.log(`[IANDS] Starting scrape. Limit: ${limit}`);

      // IANDS NDE stories URL
      const listingUrls = [
        'https://iands.org/nde-stories/nde-accounts.html',
        'https://iands.org/nde-stories.html',
      ];

      for (const listingUrl of listingUrls) {
        if (reports.length >= limit) break;

        console.log(`[IANDS] Fetching listing: ${listingUrl}`);
        const listingHtml = await fetchWithHeaders(listingUrl);

        if (!listingHtml) {
          console.log(`[IANDS] Failed to fetch listing: ${listingUrl}`);
          continue;
        }

        // Parse listing to get account links
        const accounts = await parseAccountsListing(listingHtml);
        console.log(`[IANDS] Found ${accounts.length} accounts in listing`);

        for (const account of accounts) {
          if (reports.length >= limit) break;

          await delay(rateLimitMs);

          console.log(`[IANDS] Fetching account: ${account.id}`);
          const accountHtml = await fetchWithHeaders(account.url);

          if (!accountHtml) {
            console.log(`[IANDS] Failed to fetch account: ${account.id}`);
            continue;
          }

          const report = parseAccountPage(accountHtml, account.id, account.title);
          if (report) {
            reports.push(report);

            if (reports.length % 20 === 0) {
              console.log(`[IANDS] Processed ${reports.length} reports...`);
            }
          }
        }
      }

      console.log(`[IANDS] Scrape complete. Total: ${reports.length} reports`);

      return {
        success: reports.length > 0,
        reports: reports
      };

    } catch (error) {
      console.error('[IANDS] Scrape error:', error);
      return {
        success: false,
        reports: reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default iandsAdapter;
