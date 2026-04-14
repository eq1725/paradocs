/**
 * Erowid Experience Vaults Adapter
 *
 * This adapter respects Erowid's robots.txt and implements thoughtful rate limiting.
 * Erowid is a valuable harm reduction and educational resource and should be treated with respect.
 * We implement 2-second delays between requests to minimize server load.
 */

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

interface ErowidConfig {
  startOffset?: number;
  substances?: string[];
}

interface ParsedExperience {
  id: string;
  title: string;
  author?: string;
  substance?: string;
  experienceType?: string;
  body: string;
  profile?: ErowidCaseProfile;
}

/**
 * Structured factual metadata surfaced on Erowid report headers.
 *
 * Every field below is extracted from the published dose table / byline
 * row — never from the free-form narrative. We DO NOT paraphrase or
 * summarise the witness prose here; we only record yes/no, numeric, or
 * short factual labels that already appear on the source page.
 *
 * Added Apr 14 2026 as part of the cross-adapter detail-capture pass
 * (QA/QC #3). See src/components/discover/DiscoverCards.tsx for the
 * corresponding renderer.
 */
export interface ErowidCaseProfile {
  /** Primary substance (canonical-cased, e.g. "Psilocybin mushrooms"). */
  substance?: string;
  /** Additional substances listed in the dose table (polysubstance use). */
  coSubstances?: string[];
  /** Route of administration: oral, inhaled, IV, insufflated, sublingual, etc. */
  route?: string;
  /** Total dose amount text as listed (e.g. "3 g", "250 mg", "2 hits"). */
  doseAmount?: string;
  /** Experiencer gender — "Male" | "Female" | other labels Erowid uses. */
  gender?: string;
  /** Experiencer age at the time of the experience, as a string ("19", "mid-20s"). */
  ageAtExperience?: string;
  /** Experiencer body weight, as listed (e.g. "150 lb"). */
  bodyWeight?: string;
  /** Year the experience occurred, if listed separately from publish date. */
  experienceYear?: string;
  /** Published date as listed on the page. */
  publishedDate?: string;
  /** Free-form "Setting" header value if present (e.g. "Home", "Forest"). */
  setting?: string;
  /** True if the header indicates a group/multi-person setting. */
  isGroupContext?: 'yes' | 'no';
}

class ErowidAdapter implements SourceAdapter {
  name = 'Erowid Experience Vault';
  private readonly baseIndexUrl = 'https://erowid.org/experiences/exp.cgi';
  private readonly baseExperienceUrl = 'https://erowid.org/experiences/exp.php';
  private readonly rateLimitMs = 2000; // Respect Erowid servers

  /**
   * Fetch with rate limiting
   */
  private async fetchWithRateLimit(url: string): Promise<string> {
    await this.delay(this.rateLimitMs);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ParadocsBot/1.0; +https://paradocs.example.com/bot)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse HTML content - extract experience IDs and titles from index page
   */
  private parseIndexPage(html: string): Array<{ id: string; title: string }> {
    const experiences: Array<{ id: string; title: string }> = [];

    // Match experience links like: <a href="exp.php?ID=12345">Experience Title</a>
    const experiencePattern =
      /<a\s+href="exp\.php\?ID=(\d+)">([^<]+)<\/a>/gi;
    let match;

    while ((match = experiencePattern.exec(html)) !== null) {
      experiences.push({
        id: match[1],
        title: this.decodeHtmlEntities(match[2]),
      });
    }

    return experiences;
  }

  /**
   * Parse individual experience page
   * @param listingTitle - fallback title from the index page if h1 extraction fails
   */
  private parseExperiencePage(html: string, id: string, listingTitle?: string): ParsedExperience | null {
    // Extract title — try multiple patterns, fall back to listing title
    let title = '';
    const titlePatterns = [
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<title>([^<]+)<\/title>/i,
    ];
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim().length > 0) {
        title = this.decodeHtmlEntities(match[1].trim());
        // Clean up title if it came from <title> tag (often has site name appended)
        if (pattern.source.includes('title')) {
          title = title.replace(/\s*[-|].*erowid.*/i, '').trim();
        }
        break;
      }
    }
    // Use listing title as fallback
    if (!title && listingTitle) {
      title = listingTitle;
    }

    // Extract body text from main content area
    let body = '';
    const bodyMatch = html.match(
      /<div[^>]*class="report-text-surround"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (bodyMatch) {
      body = bodyMatch[1];
    } else {
      // Fallback: try to find main content div
      const contentMatch = html.match(
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );
      if (contentMatch) {
        body = contentMatch[1];
      }
    }

    // Clean HTML from body text
    const cleanedBody = this.stripHtmlTags(body);

    // Extract author
    let author: string | undefined;
    const authorMatch = html.match(
      /<td[^>]*class="author"[^>]*>([^<]+)<\/td>/i
    );
    if (authorMatch) {
      author = this.decodeHtmlEntities(authorMatch[1]).trim();
    }

    // Extract substance from title or metadata
    const substance = this.extractSubstance(title);

    // Determine experience type
    const experienceType = this.determineExperienceType(title, cleanedBody);

    // Extract structured factual metadata from the Erowid report header
    // (dose table + byline row). All values originate on the source page;
    // we only record short factual tokens, never the narrative prose.
    const profile = this.extractCaseProfile(html);

    // Quality filter: skip very short reports
    if (cleanedBody.length < 200) {
      return null;
    }

    return {
      id,
      title,
      author,
      substance,
      experienceType,
      body: cleanedBody,
      profile,
    };
  }

  /**
   * Extract structured factual fields from the Erowid report header table.
   *
   * Erowid reports ship with two well-defined header blocks:
   *   - A byline row carrying author handle, body weight, gender, age
   *   - A dose table with one row per substance listing T+offset, route,
   *     form, substance name, and amount
   *
   * We walk both structures defensively — any individual field may be
   * absent — and produce only short factual tokens. We NEVER read free
   * narrative text here; that remains in the report body and is the
   * experiencer's own copyrighted prose.
   */
  private extractCaseProfile(html: string): ErowidCaseProfile {
    const profile: ErowidCaseProfile = {};

    // Byline / meta row — Erowid marks body-weight / gender / age with
    // class hooks like "bodyweight-amount", "sex", "age". Pull them
    // conservatively with forgiving regex that tolerates attribute
    // ordering.
    const weightMatch = html.match(/class="[^"]*bodyweight[-_]amount[^"]*"[^>]*>([^<]+)</i);
    if (weightMatch) profile.bodyWeight = this.decodeHtmlEntities(weightMatch[1]).trim();

    const genderMatch = html.match(/class="[^"]*sex[^"]*"[^>]*>([^<]+)</i);
    if (genderMatch) {
      const g = this.decodeHtmlEntities(genderMatch[1]).trim();
      if (g.length > 0 && g.length < 20) profile.gender = g;
    }

    const ageMatch = html.match(/class="[^"]*age[^"]*"[^>]*>([^<]+)</i);
    if (ageMatch) {
      const a = this.decodeHtmlEntities(ageMatch[1]).trim();
      if (a.length > 0 && a.length < 20) profile.ageAtExperience = a;
    }

    // Published / experience year footers — Erowid prints
    // "Published: Mon dd, yyyy" and "Exp Year: yyyy" in a subfooter row.
    const publishedMatch = html.match(/Published\s*:\s*([A-Za-z0-9,\s-]{3,40})/i);
    if (publishedMatch) profile.publishedDate = publishedMatch[1].trim();

    const expYearMatch = html.match(/Exp(?:erience)?\s*Year\s*:\s*(\d{4})/i);
    if (expYearMatch) profile.experienceYear = expYearMatch[1];

    // Dose table — <table class="dosechart"> with one row per substance.
    // We extract the first substance row as the canonical one (the header
    // of the table lists T+0:00 for the primary dose) and collect
    // additional substance names as co-substances for polysubstance use.
    const doseTableMatch = html.match(/<table[^>]*class="[^"]*dosechart[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (doseTableMatch) {
      const tbody = doseTableMatch[1];
      const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const substances: string[] = [];
      let routeCaptured = false;
      let doseCaptured = false;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowPattern.exec(tbody)) !== null) {
        const row = rowMatch[1];
        // Skip header rows (<th>...</th>)
        if (/<th[\s>]/i.test(row)) continue;
        const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellPattern.exec(row)) !== null) {
          cells.push(this.decodeHtmlEntities(this.stripHtmlTags(cellMatch[1])).trim());
        }
        if (cells.length === 0) continue;
        // Standard Erowid dose row: [T+offset, amount, route, form, substance]
        // Column indices vary slightly by template; we identify by content.
        const joined = cells.join(' | ').toLowerCase();
        // Route detection — typical Erowid route tokens
        if (!routeCaptured) {
          const routeTokens = ['oral', 'insufflated', 'smoked', 'vaporized', 'sublingual', 'iv', 'im', 'intravenous', 'intramuscular', 'rectal', 'inhaled'];
          for (const token of routeTokens) {
            if (joined.indexOf(token) >= 0) {
              profile.route = token === 'iv' ? 'intravenous' : token === 'im' ? 'intramuscular' : token;
              routeCaptured = true;
              break;
            }
          }
        }
        // Dose amount — look for numeric+unit pattern in cells
        if (!doseCaptured) {
          for (const c of cells) {
            const m = c.match(/^\s*(\d+(?:\.\d+)?)\s*(g|mg|mcg|\u00b5g|ml|hits?|tabs?|caps?|drops?|capsule|tablet)s?\s*$/i);
            if (m) {
              profile.doseAmount = c.trim();
              doseCaptured = true;
              break;
            }
          }
        }
        // Substance name — last cell often carries the common substance name
        const candidateSubstance = cells[cells.length - 1];
        if (candidateSubstance && candidateSubstance.length > 0 && candidateSubstance.length < 80) {
          if (substances.indexOf(candidateSubstance) === -1) {
            substances.push(candidateSubstance);
          }
        }
      }
      if (substances.length > 0) {
        profile.substance = substances[0];
        if (substances.length > 1) profile.coSubstances = substances.slice(1);
      }
    }

    return profile;
  }

  /**
   * Extract substance name from title or content
   */
  private extractSubstance(text: string): string | undefined {
    const substances = [
      'DMT',
      'Ayahuasca',
      'Salvia',
      '5-MeO-DMT',
      'Psilocybin',
      'LSD',
      'Ketamine',
      'Mescaline',
      'MDMA',
      'Meditation',
      'Sensory Deprivation',
    ];

    for (const substance of substances) {
      if (text.toLowerCase().includes(substance.toLowerCase())) {
        return substance;
      }
    }

    return undefined;
  }

  /**
   * Determine experience type from title and content
   */
  private determineExperienceType(title: string, body: string): string {
    const content = (title + ' ' + body).toLowerCase();

    if (
      content.includes('astral projection') ||
      content.includes('out of body') ||
      content.includes('oobe') ||
      content.includes('obe')
    ) {
      return 'Astral Projection / OBE';
    }

    if (
      content.includes('entity') ||
      content.includes('entities') ||
      content.includes('machine elves') ||
      content.includes('beings')
    ) {
      return 'Entity Encounter';
    }

    if (
      content.includes('near death') ||
      content.includes('nde') ||
      content.includes('death-like')
    ) {
      return 'Near-Death-Like Experience';
    }

    if (
      content.includes('mystical') ||
      content.includes('spiritual') ||
      content.includes('transcendent') ||
      content.includes('divine')
    ) {
      return 'Mystical / Spiritual Experience';
    }

    if (
      content.includes('dissociative') ||
      content.includes('dissociation') ||
      content.includes('dissociating')
    ) {
      return 'Dissociative Experience';
    }

    return 'Consciousness Experience';
  }

  /**
   * Map experience type and substance to Paradocs category
   */
  private mapToCategory(substance?: string, experienceType?: string): string {
    const substanceLower = (substance || '').toLowerCase();

    // DMT/Ayahuasca/Salvia entities and consciousness practices
    if (
      substanceLower.includes('dmt') ||
      substanceLower.includes('ayahuasca') ||
      substanceLower.includes('salvia') ||
      substanceLower.includes('5-meo')
    ) {
      return 'consciousness_practices';
    }

    // Astral projection and OBE
    if (experienceType === 'Astral Projection / OBE') {
      return 'consciousness_practices';
    }

    // Near-death-like experiences
    if (experienceType === 'Near-Death-Like Experience') {
      return 'psychological_experiences';
    }

    // Mystical/spiritual experiences
    if (experienceType === 'Mystical / Spiritual Experience') {
      return 'psychic_phenomena';
    }

    // Dissociative/Ketamine experiences
    if (substanceLower.includes('ketamine')) {
      return 'psychological_experiences';
    }

    // Meditation and sensory deprivation
    if (
      substanceLower.includes('meditation') ||
      substanceLower.includes('sensory deprivation')
    ) {
      return 'consciousness_practices';
    }

    // Default
    return 'consciousness_practices';
  }

  /**
   * Strip HTML tags and decode entities
   */
  private stripHtmlTags(html: string): string {
    // Remove script and style elements
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&apos;': "'",
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Handle numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });

    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });

    return decoded;
  }

  /**
   * Build index URL with parameters
   */
  private buildIndexUrl(startOffset: number): string {
    const params = new URLSearchParams({
      S1: '0',
      S2: '-1',
      C1: '-1',
      Rone: '-1',
      Rone_text: '',
      Max: '25',
      Start: startOffset.toString(),
      SortBy: 'RA',
      FIL: '',
    });

    return `${this.baseIndexUrl}?${params.toString()}`;
  }

  /**
   * Build experience URL
   */
  private buildExperienceUrl(id: string): string {
    return `${this.baseExperienceUrl}?ID=${id}`;
  }

  /**
   * Main scrape method
   */
  async scrape(
    config: Record<string, any> = {},
    limit: number = 50
  ): Promise<AdapterResult> {
    try {
      const erowIdConfig: ErowidConfig = {
        startOffset: config.startOffset || 0,
        substances: config.substances || [
          'DMT',
          'Ayahuasca',
          'Salvia',
          '5-MeO-DMT',
        ],
      };

      const reports: ScrapedReport[] = [];
      const startOffset = erowIdConfig.startOffset || 0;

      // Fetch experience index with default filters
      const indexUrl = this.buildIndexUrl(startOffset);
      console.log(`Fetching Erowid index: ${indexUrl}`);

      const indexHtml = await this.fetchWithRateLimit(indexUrl);
      const experienceListing = this.parseIndexPage(indexHtml);

      if (experienceListing.length === 0) {
        return {
          success: true,
          reports: [],
        };
      }

      console.log(`Found ${experienceListing.length} experiences in index`);

      // Fetch individual experiences up to limit
      for (const listing of experienceListing) {
        if (reports.length >= limit) {
          break;
        }

        try {
          const experienceUrl = this.buildExperienceUrl(listing.id);
          const experienceHtml = await this.fetchWithRateLimit(experienceUrl);
          const parsed = this.parseExperiencePage(experienceHtml, listing.id, listing.title);

          if (!parsed) {
            console.log(
              `Skipped experience ${listing.id}: insufficient content`
            );
            continue;
          }

          // Check if substance matches filters (if configured)
          if (
            erowIdConfig.substances &&
            erowIdConfig.substances.length > 0 &&
            parsed.substance
          ) {
            const substanceMatch = erowIdConfig.substances.some(s =>
              parsed.substance!.toLowerCase().includes(s.toLowerCase())
            );
            if (!substanceMatch) {
              console.log(
                `Skipped experience ${listing.id}: substance not in filter`
              );
              continue;
            }
          }

          const category = this.mapToCategory(
            parsed.substance,
            parsed.experienceType
          );

          const summary = parsed.body.substring(0, 200);

          const report: ScrapedReport = {
            original_report_id: `erowid-${parsed.id}`,
            source_type: 'erowid',
            source_label: 'Erowid Experience Vault',
            source_url: this.buildExperienceUrl(parsed.id),
            title: parsed.title,
            description: parsed.body,
            summary: summary,
            category: category,
            credibility: 'medium',
            event_date_precision: 'unknown',
            tags: [
              'erowid',
              ...(parsed.substance ? [parsed.substance] : []),
              ...(parsed.experienceType ? [parsed.experienceType] : []),
            ],
            metadata: {
              experienceId: parsed.id,
              substance: parsed.substance,
              experienceType: parsed.experienceType,
              author: parsed.author,
              // Structured factual header fields (dose table / byline).
              // Added Apr 14 2026 — see ErowidCaseProfile interface above.
              case_profile: parsed.profile && Object.keys(parsed.profile).length > 0
                ? parsed.profile
                : undefined,
            },
          };

          reports.push(report);
          console.log(
            `Successfully parsed experience ${parsed.id}: ${parsed.title}`
          );
        } catch (error) {
          console.error(
            `Error fetching experience ${listing.id}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
          // Continue to next experience on error
          continue;
        }
      }

      return {
        success: true,
        reports: reports,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Erowid adapter error:', errorMessage);

      return {
        success: false,
        reports: [],
        error: errorMessage,
      };
    }
  }
}

// Export singleton instance
export const erowidAdapter = new ErowidAdapter();
