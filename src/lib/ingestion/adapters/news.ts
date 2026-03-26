// News Aggregation Adapter
// Fetches paranormal news articles from NewsAPI.org

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

const SEARCH_QUERIES = [
  'UFO sighting witness',
  'paranormal encounter report',
  'ghost sighting',
  'cryptid sighting bigfoot',
  'unexplained phenomenon witness',
  'UAP military report',
  'near death experience',
];

// NewsAPI.org interface types
interface NewsArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

/**
 * Simple string hash function for generating unique IDs from URLs
 * Using a basic djb2 algorithm
 */
function hashUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) + hash + url.charCodeAt(i);
    hash = hash & 0xffffffff; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Detect category based on article content and title keywords
 */
function detectCategory(title: string, description: string): string {
  const content = `${title} ${description}`.toLowerCase();

  const ufoKeywords = ['ufo', 'uap', 'alien', 'extraterrestrial', 'spacecraft', 'unidentified flying object'];
  const ghostKeywords = ['ghost', 'haunting', 'spirit', 'apparition', 'poltergeist', 'supernatural'];
  const cryptidKeywords = ['cryptid', 'bigfoot', 'sasquatch', 'yeti', 'loch ness', 'creature', 'beast'];
  const ndeKeywords = ['near-death', 'nde', 'afterlife', 'consciousness', 'near death experience', 'tunnel of light'];

  if (ufoKeywords.some(kw => content.includes(kw))) {
    return 'ufos_aliens';
  }
  if (ghostKeywords.some(kw => content.includes(kw))) {
    return 'ghosts_hauntings';
  }
  if (cryptidKeywords.some(kw => content.includes(kw))) {
    return 'cryptids';
  }
  if (ndeKeywords.some(kw => content.includes(kw))) {
    return 'psychological_experiences';
  }

  return 'combination';
}

/**
 * Extract category keywords for tags
 */
function getCategoryKeywords(category: string): string[] {
  const keywordMap: Record<string, string[]> = {
    'ufos_aliens': ['ufo', 'alien', 'uap'],
    'ghosts_hauntings': ['ghost', 'haunting', 'spirit'],
    'cryptids': ['cryptid', 'creature', 'bigfoot'],
    'psychological_experiences': ['nde', 'consciousness', 'afterlife'],
    'combination': ['paranormal', 'unexplained'],
  };
  return keywordMap[category] || ['paranormal'];
}

/**
 * Determine credibility based on source reputation
 */
function determineCredibility(sourceName: string): 'low' | 'medium' | 'high' {
  const majorOutlets = [
    'bbc', 'cnn', 'reuters', 'associated press', 'ap', 'npr', 'guardian',
    'new york times', 'times', 'washington post', 'wall street journal',
    'abc', 'nbc', 'cbs', 'pbs', 'bbc', 'itv', 'channel 4', 'fox',
    'cnet', 'wired', 'techcrunch', 'theverge', 'engadget',
    'nature', 'science daily', 'scientific american', 'mit technology review',
  ];

  const sourceLower = sourceName.toLowerCase();
  if (majorOutlets.some(outlet => sourceLower.includes(outlet))) {
    return 'medium';
  }
  return 'low';
}

/**
 * Quality filter: skip articles that don't meet minimum quality standards
 */
function passesQualityFilter(article: NewsArticle): boolean {
  // Skip articles with very short descriptions
  const description = article.description || '';
  if (description.length < 100) {
    return false;
  }

  // Skip listicles and entertainment-focused content
  const titleLower = article.title.toLowerCase();
  const listislicePatterns = [
    /top \d+/i,
    /best \d+/i,
    /worst \d+/i,
    /ranked/i,
    /countdown/i,
    /here are/i,
    /these \d+ (things|reasons|ways)/i,
  ];

  if (listislicePatterns.some(pattern => pattern.test(titleLower))) {
    return false;
  }

  // Skip entertainment/celebrity gossip
  if (
    titleLower.includes('celebrity') ||
    titleLower.includes('actor') ||
    titleLower.includes('actress') ||
    titleLower.includes('gossip') ||
    titleLower.includes('dating') ||
    titleLower.includes('relationship')
  ) {
    return false;
  }

  return true;
}

/**
 * Truncate description to max length while preserving word boundaries
 */
function truncateDescription(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

/**
 * NewsAPI adapter implementation
 */
const newsAdapter: SourceAdapter = {
  name: 'NewsAPI',

  async scrape(config: Record<string, any>, limit?: number): Promise<AdapterResult> {
    const apiKey = config.apiKey || process.env.NEWS_API_KEY;

    // Validate API key
    if (!apiKey) {
      return {
        success: false,
        reports: [],
        error: 'NEWS_API_KEY environment variable is not set. Please provide a valid NewsAPI.org API key.',
      };
    }

    // Configuration options
    const queries = config.queries || SEARCH_QUERIES;
    const fromDate = config.fromDate || null;
    const perQueryLimit = limit ? Math.ceil(limit / queries.length) : 50;

    const reports: ScrapedReport[] = [];
    const seenUrls = new Set<string>();

    try {
      for (const query of queries) {
        // Rate limiting: 1 second between queries
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          let endpoint = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${perQueryLimit}&apiKey=${apiKey}`;

          if (fromDate) {
            endpoint += `&from=${fromDate}`;
          }

          const response = await fetch(endpoint);

          if (!response.ok) {
            console.error(
              `[NEWS] API error for query "${query}": ${response.status} ${response.statusText}`
            );
            continue;
          }

          const data: NewsAPIResponse = await response.json();

          if (data.status !== 'ok') {
            console.error(`[NEWS] API returned status "${data.status}" for query "${query}"`);
            continue;
          }

          // Process articles
          for (const article of data.articles) {
            // Skip if we've already seen this URL
            if (seenUrls.has(article.url)) {
              continue;
            }

            // Apply quality filters
            if (!passesQualityFilter(article)) {
              continue;
            }

            seenUrls.add(article.url);

            // Detect category
            const category = detectCategory(article.title, article.description || '');
            const categoryKeywords = getCategoryKeywords(category);

            // Prepare description: concatenate description and content
            let fullDescription = article.description || '';
            if (article.content) {
              fullDescription = `${fullDescription} ${article.content}`.trim();
            }
            fullDescription = truncateDescription(fullDescription, 5000);

            // Create scraped report
            const report: ScrapedReport = {
              title: article.title,
              summary: truncateDescription(article.description || '', 200),
              description: fullDescription,
              category,
              source_type: 'news',
              original_report_id: hashUrl(article.url),
              source_label: article.source.name,
              source_url: article.url,
              credibility: determineCredibility(article.source.name),
              event_date: article.publishedAt.split('T')[0], // Extract date from ISO timestamp
              event_date_precision: 'exact',
              tags: ['news', article.source.name, ...categoryKeywords],
              metadata: {
                author: article.author,
                source_name: article.source.name,
                url: article.url,
                publishedAt: article.publishedAt,
                urlToImage: article.urlToImage,
              },
            };

            reports.push(report);

            // Stop if we've reached the limit
            if (limit && reports.length >= limit) {
              break;
            }
          }

          console.log(
            `[NEWS] Query "${query}": found ${data.articles.length} articles, added ${reports.length} total so far`
          );

          // Stop if we've reached the limit
          if (limit && reports.length >= limit) {
            break;
          }
        } catch (queryError) {
          console.error(`[NEWS] Error processing query "${query}":`, queryError);
          continue;
        }
      }

      return {
        success: true,
        reports: limit ? reports.slice(0, limit) : reports,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        reports: [],
        error: `Failed to scrape news: ${errorMessage}`,
      };
    }
  },
};

export default newsAdapter;
export { newsAdapter };
