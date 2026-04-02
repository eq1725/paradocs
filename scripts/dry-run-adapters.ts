#!/usr/bin/env npx tsx
/**
 * Session B1: Adapter Dry-Run Script
 *
 * Tests each high-priority ingestion adapter with a small batch (limit=5)
 * to verify they fetch, parse, and produce valid ScrapedReport objects.
 *
 * Usage:
 *   npx tsx scripts/dry-run-adapters.ts [adapter-name]
 *
 * Examples:
 *   npx tsx scripts/dry-run-adapters.ts          # run all adapters
 *   npx tsx scripts/dry-run-adapters.ts nuforc    # run only NUFORC
 *   npx tsx scripts/dry-run-adapters.ts youtube   # run only YouTube
 *
 * Environment:
 *   Requires .env.local with YOUTUBE_API_KEY for YouTube adapter.
 *   NUFORC, BFRO, Reddit, NDERF, IANDS, Erowid use public endpoints (no keys).
 *
 * This does NOT insert into the database. It only tests adapter.scrape().
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Import adapters
import { getAdapter, listAdapters } from '../src/lib/ingestion/adapters/index';

const DRY_RUN_LIMIT = 5;

// Adapter configs for dry run
const ADAPTER_CONFIGS: Record<string, { config: Record<string, any>; limit: number; requiresKey?: string }> = {
  nuforc: {
    config: {},
    limit: DRY_RUN_LIMIT,
  },
  'reddit-v2': {
    config: {
      subreddits: ['Paranormal', 'UFOs'],
      minScore: 5,  // Lowered from 50 — Arctic Shift returns recent posts with low scores; real ingestion will use afterEpoch for date-range control
    },
    limit: DRY_RUN_LIMIT,
  },
  youtube: {
    config: {
      includeComments: true,
      includeSearch: false,
      maxCommentsPerVideo: 20,
      channelIds: ['UCvSbzThCzHK_P0nZHOvmHxQ'], // Just one channel for dry run
    },
    limit: DRY_RUN_LIMIT,
    requiresKey: 'YOUTUBE_API_KEY',
  },
  bfro: {
    config: {},
    limit: DRY_RUN_LIMIT,
  },
  nderf: {
    config: {},
    limit: DRY_RUN_LIMIT,
  },
  iands: {
    config: {},
    limit: DRY_RUN_LIMIT,
  },
  // erowid: disabled pending written permission from Erowid Center
};

interface ValidationResult {
  adapter: string;
  success: boolean;
  reportCount: number;
  errors: string[];
  warnings: string[];
  sampleReport?: {
    title: string;
    source_url: string;
    category: string;
    has_description: boolean;
    description_length: number;
    has_event_date: boolean;
    has_media: boolean;
    media_count: number;
  };
  duration_ms: number;
}

function validateReport(report: any, adapterName: string): { errors: string[]; warnings: string[] } {
  var errors: string[] = [];
  var warnings: string[] = [];

  // Required fields
  if (!report.title || report.title.trim().length === 0) {
    errors.push('Missing or empty title');
  }
  if (!report.source_url || report.source_url.trim().length === 0) {
    errors.push('Missing source_url (LEGALLY REQUIRED)');
  }
  if (!report.source_type) {
    errors.push('Missing source_type');
  }
  if (!report.category) {
    errors.push('Missing category');
  }
  if (!report.original_report_id) {
    errors.push('Missing original_report_id');
  }

  // Quality checks
  if (!report.description || report.description.length < 50) {
    warnings.push('Description very short or missing (< 50 chars)');
  }
  if (!report.event_date) {
    warnings.push('No event_date');
  }
  if (!report.summary) {
    warnings.push('No summary');
  }
  if (!report.credibility) {
    warnings.push('No credibility rating');
  }
  if (!report.tags || report.tags.length === 0) {
    warnings.push('No tags');
  }

  // URL validation
  if (report.source_url && !report.source_url.startsWith('http')) {
    errors.push('source_url does not start with http: ' + report.source_url.substring(0, 50));
  }

  return { errors: errors, warnings: warnings };
}

async function runAdapterDryRun(adapterName: string): Promise<ValidationResult> {
  var startTime = Date.now();
  var result: ValidationResult = {
    adapter: adapterName,
    success: false,
    reportCount: 0,
    errors: [],
    warnings: [],
    duration_ms: 0,
  };

  // Check for required API key
  var adapterConfig = ADAPTER_CONFIGS[adapterName];
  if (!adapterConfig) {
    result.errors.push('No dry-run config defined for adapter: ' + adapterName);
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  if (adapterConfig.requiresKey && !process.env[adapterConfig.requiresKey]) {
    result.errors.push('Missing required env var: ' + adapterConfig.requiresKey);
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  // Get the adapter
  var adapter = getAdapter(adapterName);
  if (!adapter) {
    result.errors.push('Adapter not found in registry: ' + adapterName);
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('DRY RUN: ' + adapterName + ' (limit=' + adapterConfig.limit + ')');
    console.log('='.repeat(60));

    var adapterResult = await adapter.scrape(adapterConfig.config, adapterConfig.limit);

    if (!adapterResult.success) {
      result.errors.push('Adapter returned success=false: ' + (adapterResult.error || 'unknown error'));
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    result.reportCount = adapterResult.reports.length;
    result.success = true;

    if (adapterResult.reports.length === 0) {
      result.warnings.push('Adapter returned 0 reports');
    }

    // Validate each report
    var allReportErrors: string[] = [];
    var allReportWarnings: string[] = [];

    for (var i = 0; i < adapterResult.reports.length; i++) {
      var report = adapterResult.reports[i];
      var validation = validateReport(report, adapterName);

      for (var j = 0; j < validation.errors.length; j++) {
        allReportErrors.push('Report ' + i + ' (' + (report.original_report_id || 'no-id') + '): ' + validation.errors[j]);
      }
      for (var j = 0; j < validation.warnings.length; j++) {
        allReportWarnings.push('Report ' + i + ' (' + (report.original_report_id || 'no-id') + '): ' + validation.warnings[j]);
      }
    }

    result.errors = result.errors.concat(allReportErrors);
    result.warnings = result.warnings.concat(allReportWarnings);

    if (allReportErrors.length > 0) {
      result.success = false;
    }

    // Sample report for inspection
    if (adapterResult.reports.length > 0) {
      var sample = adapterResult.reports[0];
      result.sampleReport = {
        title: (sample.title || '').substring(0, 80),
        source_url: (sample.source_url || '').substring(0, 100),
        category: sample.category || 'none',
        has_description: !!sample.description && sample.description.length > 0,
        description_length: (sample.description || '').length,
        has_event_date: !!sample.event_date,
        has_media: !!sample.media && sample.media.length > 0,
        media_count: sample.media ? sample.media.length : 0,
      };
    }

  } catch (error) {
    var errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push('Exception during scrape: ' + errorMsg);
    result.success = false;
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

async function main() {
  var targetAdapter = process.argv[2] || null;
  var adapterNames = targetAdapter ? [targetAdapter] : Object.keys(ADAPTER_CONFIGS);

  console.log('Paradocs Adapter Dry-Run');
  console.log('Testing ' + adapterNames.length + ' adapter(s) with limit=' + DRY_RUN_LIMIT);
  console.log('Date: ' + new Date().toISOString());

  var results: ValidationResult[] = [];

  for (var i = 0; i < adapterNames.length; i++) {
    var adapterResult = await runAdapterDryRun(adapterNames[i]);
    results.push(adapterResult);

    // Print per-adapter summary
    var status = adapterResult.success ? 'PASS' : 'FAIL';
    console.log('\n[' + status + '] ' + adapterResult.adapter + ' — ' + adapterResult.reportCount + ' reports in ' + adapterResult.duration_ms + 'ms');

    if (adapterResult.sampleReport) {
      console.log('  Sample: "' + adapterResult.sampleReport.title + '"');
      console.log('  Source URL: ' + adapterResult.sampleReport.source_url);
      console.log('  Category: ' + adapterResult.sampleReport.category + ', Desc: ' + adapterResult.sampleReport.description_length + ' chars');
    }

    if (adapterResult.errors.length > 0) {
      console.log('  ERRORS:');
      for (var j = 0; j < Math.min(adapterResult.errors.length, 5); j++) {
        console.log('    - ' + adapterResult.errors[j]);
      }
      if (adapterResult.errors.length > 5) {
        console.log('    ... and ' + (adapterResult.errors.length - 5) + ' more');
      }
    }

    if (adapterResult.warnings.length > 0) {
      console.log('  WARNINGS: ' + adapterResult.warnings.length + ' total');
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  var passed = results.filter(function(r) { return r.success; }).length;
  var failed = results.filter(function(r) { return !r.success; }).length;

  console.log('Passed: ' + passed + '/' + results.length);
  console.log('Failed: ' + failed + '/' + results.length);

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var icon = r.success ? 'OK' : 'XX';
    console.log('  [' + icon + '] ' + r.adapter + ' — ' + r.reportCount + ' reports, ' + r.errors.length + ' errors, ' + r.warnings.length + ' warnings (' + r.duration_ms + 'ms)');
  }

  // Exit with error code if any failed
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
