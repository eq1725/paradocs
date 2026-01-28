// NUFORC (National UFO Reporting Center) Adapter
// Scrapes UFO sighting reports from nuforc.org

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

interface NuforcConfig {
    baseUrl?: string;
    maxPages?: number;
}

// Parse a NUFORC report page
async function parseReportPage(html: string): Promise<ScrapedReport[]> {
    const reports: ScrapedReport[] = [];

  // Simple regex-based parsing for NUFORC table format
  // In production, use a proper HTML parser like cheerio
  const tableRegex = /<TR[^>]*>[\s\S]*?<\/TR>/gi;
    const matches = html.match(tableRegex) || [];

  for (const row of matches) {
        try {
                // Extract cells
          const cellRegex = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
                const cells: string[] = [];
                let cellMatch;
                while ((cellMatch = cellRegex.exec(row)) !== null) {
                          cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
                }

          if (cells.length >= 7) {
                    const [dateTime, city, state, country, shape, duration, summary] = cells;

                  // Generate unique ID from date + location
                  const reportId = `nuforc-${dateTime}-${city}-${state}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

                  reports.push({
                              title: `UFO Sighting in ${city}, ${state}`,
                              summary: summary.substring(0, 500),
                              description: `Shape: ${shape}. Duration: ${duration}. ${summary}`,
                              category: 'ufo_sighting',
                              location_name: `${city}, ${state}`,
                              country: country || 'USA',
                              state_province: state,
                              city: city,
                              event_date: dateTime,
                              credibility: 'medium',
                              source_type: 'nuforc',
                              original_report_id: reportId,
                              tags: ['ufo', 'nuforc', shape.toLowerCase()].filter(Boolean),
                  });
          }
        } catch (e) {
                console.error('Error parsing NUFORC row:', e);
        }
  }

  return reports;
}

// Fetch reports from NUFORC
async function fetchNuforcReports(config: NuforcConfig, limit: number): Promise<ScrapedReport[]> {
    const baseUrl = config.baseUrl || 'https://nuforc.org/webreports/ndxe.html';
    const allReports: ScrapedReport[] = [];

  try {
        // Fetch the main index page
      const response = await fetch(baseUrl);
        if (!response.ok) {
                throw new Error(`Failed to fetch NUFORC: ${response.status}`);
        }

      const html = await response.text();
        const reports = await parseReportPage(html);
        allReports.push(...reports);

  } catch (error) {
        console.error('NUFORC fetch error:', error);
        throw error;
  }

  return allReports.slice(0, limit);
}

export const nuforcAdapter: SourceAdapter = {
    name: 'NUFORC',

    async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
          try {
                  const reports = await fetchNuforcReports(config as NuforcConfig, limit);

            return {
                      success: true,
                      reports,
            };
          } catch (error) {
                  return {
                            success: false,
                            reports: [],
                            error: error instanceof Error ? error.message : 'Unknown error',
                  };
          }
    },
};
