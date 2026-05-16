#!/usr/bin/env npx tsx
/**
 * B0.1 — B1.5 Adapter QA/QC Smoke Test Runner
 *
 * Runs each adapter through the FULL ingestion engine (not just scrape)
 * and runs the per-adapter verification queries from
 * B1_5_QA_QC_NOTES.md § 7. Outputs a structured pass/fail report.
 *
 * Unlike scripts/dry-run-adapters.ts (which only tests adapter.scrape()),
 * this script actually inserts to the DB so we can verify:
 *   - phenomenon_type_id is resolved correctly
 *   - report_phenomena junction rows are created
 *   - /phenomena/<slug> would render the new report
 *   - OBERF archive-type sub-typing fires defensibly
 *
 * Usage:
 *   # Test all adapters with 5 reports each:
 *   npx tsx scripts/b1-5-smoke-test.ts
 *
 *   # Test one adapter:
 *   npx tsx scripts/b1-5-smoke-test.ts nderf
 *
 *   # Custom report count:
 *   npx tsx scripts/b1-5-smoke-test.ts nderf --limit=10
 *
 * Environment (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY            (for paradocs_narrative gen — capped by B0.7 daily limit)
 *   YOUTUBE_API_KEY              (for YouTube adapter only)
 *
 * The smoke tests INSERT rows into the production database. To run
 * against a staging/test project, point NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY at that project instead.
 *
 * Cleanup: the script does NOT automatically delete the rows it inserts.
 * After verifying the test outputs, archive them via the source-takedown
 * admin tool (/admin/source-takedown) OR run the SQL at the bottom of
 * this file.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runIngestion } from '../src/lib/ingestion/engine';

// ===========================================================================
// Per-adapter expected outcomes (derived from B1_5_QA_QC_NOTES.md § 7)
// ===========================================================================

interface AdapterExpectation {
  /** data_sources.slug pattern to look up the source UUID */
  sourceSlugPattern: string;
  /** Default limit if not overridden via CLI */
  defaultLimit: number;
  /** If true, every inserted report must have phenomenon_type_id resolved */
  requiresPhenomenonTypeId: boolean;
  /** If true, every inserted report must have a report_phenomena junction row */
  requiresPhenomenaLink: boolean;
  /** Allowed slugs for phenomenon_type_id (informational; not strictly enforced) */
  expectedTypeSlugs: string[];
  /** Adapter-specific spot-check notes printed in the report */
  spotCheckNotes: string[];
  /** Optional env var that must be set */
  requiresEnvVar?: string;
}

var EXPECTATIONS: Record<string, AdapterExpectation> = {
  nderf: {
    sourceSlugPattern: '%nderf%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: true,
    requiresPhenomenaLink: true,
    expectedTypeSlugs: ['near-death-experience', 'distressing-nde'],
    spotCheckNotes: [
      'Verify NDE vs Distressing-NDE branching by reading the narrative.',
      'Confirm reports.phenomenon_type_id matches expected slug.',
      'Confirm /phenomena/near-death-experience renders the new report.',
    ],
  },
  oberf: {
    sourceSlugPattern: '%oberf%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: true,
    requiresPhenomenaLink: true,
    expectedTypeSlugs: [
      'sudden-obe', 'out-of-body-experience', 'nde-like-experience',
      'after-death-communication', 'nearing-end-of-life-experience',
      'deathbed-vision', 'spiritually-transformative-experience',
      'prayer-experience', 'ufo-encounter', 'pre-birth-memory',
      'dream-experience', 'premonition-experience', 'shared-death-experience',
      'other-experience',
    ],
    spotCheckNotes: [
      'CRITICAL: spot-check subtypeDBVArchive() reassignments — ',
      '  if metadata.archiveTypeSlug = deathbed-vision but metadata.experienceTypeSlug = ',
      '  after-death-communication / nearing-end-of-life-experience, confirm the narrative ',
      '  actually supports the reassignment. False positives = adapter bug.',
      'Same for subtypeDreamArchive() — dream→premonition reassignments need narrative ',
      '  cues about foresight/confirmation.',
    ],
  },
  nuforc: {
    sourceSlugPattern: '%nuforc%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,  // NUFORC uses pattern matcher + category, not direct type
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    spotCheckNotes: [
      'Confirm shape + region variety in the 5-report sample.',
      'Verify location extraction (city, state, country populated).',
      'Verify paradocs_narrative generated successfully.',
    ],
  },
  bfro: {
    sourceSlugPattern: '%bfro%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    spotCheckNotes: [
      'Confirm regional variety (different states/provinces).',
      'Confirm Class A/B/C classification surfaces in metadata.',
      'Spot-check that report_phenomena links to bigfoot encyclopedia entry.',
    ],
  },
  'reddit-v2': {
    sourceSlugPattern: '%reddit%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    spotCheckNotes: [
      'Test against 4 subreddits: r/Paranormal, r/UFOs, r/Ghosts, r/Cryptids.',
      'Verify spam filter caught obvious off-topic posts.',
      'Verify comments handled correctly (if includeComments=true).',
      'Verify metadata.subreddit + metadata.permalink populated.',
    ],
  },
  iands: {
    sourceSlugPattern: '%iands%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: ['near-death-experience'],
    spotCheckNotes: [
      'Only public-facing case excerpts — confirm no journal-gated content.',
      'Attribution to IANDS visible on report-page header.',
    ],
  },
  wikipedia: {
    sourceSlugPattern: '%wikipedia%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    spotCheckNotes: [
      'Confirm CC-BY-SA attribution on report-page.',
      'Verify Wikipedia article URL in source_url.',
    ],
  },
  historical_archive: {
    sourceSlugPattern: '%historical%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    spotCheckNotes: [
      'Confirm public-domain attribution.',
      'Spot-check date extraction for pre-1900 events.',
    ],
  },
  youtube: {
    sourceSlugPattern: '%youtube%',
    defaultLimit: 5,
    requiresPhenomenonTypeId: false,
    requiresPhenomenaLink: false,
    expectedTypeSlugs: [],
    requiresEnvVar: 'YOUTUBE_API_KEY',
    spotCheckNotes: [
      'PENDING legal review — defer until B0.8 green-lights this source.',
      'Once cleared, confirm Data API v3 quota is not exhausted.',
    ],
  },
};

// ===========================================================================
// Verification queries (run after ingest, report findings)
// ===========================================================================

interface SmokeTestReport {
  adapter: string;
  sourceUuid: string | null;
  ingestSucceeded: boolean;
  ingestedCount: number;
  ingestedIds: string[];
  errors: string[];
  verifications: Array<{ name: string; status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; details: string }>;
  spotCheckNotes: string[];
  durationMs: number;
}

async function lookupSourceUuid(svc: SupabaseClient, slugPattern: string): Promise<string | null> {
  var { data, error } = await svc
    .from('data_sources')
    .select('id, slug, name')
    .ilike('slug', slugPattern)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as any).id;
}

async function verifyInsertedReports(
  svc: SupabaseClient,
  adapter: string,
  expectation: AdapterExpectation,
  insertedIds: string[],
  report: SmokeTestReport,
): Promise<void> {
  if (insertedIds.length === 0) {
    report.verifications.push({ name: 'No reports inserted', status: 'WARN', details: 'Adapter returned 0 reports — re-check source availability.' });
    return;
  }

  // 1. report_type = 'ingested' on every row (B0.2)
  var { data: typeRows } = await (svc.from('reports') as any)
    .select('id, report_type')
    .in('id', insertedIds);
  var allIngested = ((typeRows as any) || []).every(function (r: any) { return r.report_type === 'ingested'; });
  report.verifications.push({
    name: 'report_type = ingested',
    status: allIngested ? 'PASS' : 'FAIL',
    details: allIngested
      ? insertedIds.length + ' rows all marked ingested'
      : 'Some rows have report_type != ingested — B0.2 enum wiring broken',
  });

  // 2. phenomenon_type_id resolution (if expected)
  if (expectation.requiresPhenomenonTypeId) {
    var { data: ptypeRows } = await (svc.from('reports') as any)
      .select('id, phenomenon_type_id, phenomenon_type:phenomenon_types(slug)')
      .in('id', insertedIds);
    var rows = ((ptypeRows as any) || []);
    var withType = rows.filter(function (r: any) { return r.phenomenon_type_id; });
    var typeSlugs = withType.map(function (r: any) { return r.phenomenon_type?.slug || '(unknown)'; });
    var unexpectedSlugs = expectation.expectedTypeSlugs.length > 0
      ? typeSlugs.filter(function (s: string) { return expectation.expectedTypeSlugs.indexOf(s) < 0; })
      : [];
    report.verifications.push({
      name: 'phenomenon_type_id resolution',
      status: withType.length === rows.length && unexpectedSlugs.length === 0 ? 'PASS' : 'FAIL',
      details:
        withType.length + '/' + rows.length + ' rows have phenomenon_type_id. ' +
        'Resolved slugs: [' + typeSlugs.join(', ') + ']' +
        (unexpectedSlugs.length > 0 ? ' UNEXPECTED: [' + unexpectedSlugs.join(', ') + ']' : ''),
    });
  } else {
    report.verifications.push({ name: 'phenomenon_type_id resolution', status: 'SKIP', details: 'Not required for this adapter' });
  }

  // 3. report_phenomena junction rows (if expected)
  if (expectation.requiresPhenomenaLink) {
    var { data: linkRows } = await (svc.from('report_phenomena') as any)
      .select('report_id, phenomenon:phenomena(slug)')
      .in('report_id', insertedIds);
    var links = ((linkRows as any) || []);
    var linkedReportIds: Record<string, string[]> = {};
    links.forEach(function (l: any) {
      if (!linkedReportIds[l.report_id]) linkedReportIds[l.report_id] = [];
      linkedReportIds[l.report_id].push(l.phenomenon?.slug || '(unknown)');
    });
    var unlinkedCount = insertedIds.filter(function (id: string) { return !linkedReportIds[id]; }).length;
    report.verifications.push({
      name: 'report_phenomena junction links',
      status: unlinkedCount === 0 ? 'PASS' : 'FAIL',
      details:
        (insertedIds.length - unlinkedCount) + '/' + insertedIds.length + ' rows have at least one phenomena link. ' +
        (unlinkedCount > 0 ? unlinkedCount + ' rows MISSING a junction row — encyclopedia page won\'t show them.' : 'All rows link to canonical encyclopedia entries.'),
    });
  } else {
    report.verifications.push({ name: 'report_phenomena junction links', status: 'SKIP', details: 'Not required for this adapter' });
  }

  // 4. paradocs_narrative generation (B0.7 daily cap may have skipped)
  var { data: narrRows } = await (svc.from('reports') as any)
    .select('id, paradocs_narrative')
    .in('id', insertedIds);
  var withNarrative = ((narrRows as any) || []).filter(function (r: any) {
    return r.paradocs_narrative && r.paradocs_narrative.length > 50;
  });
  report.verifications.push({
    name: 'paradocs_narrative generation',
    status: withNarrative.length === insertedIds.length
      ? 'PASS'
      : withNarrative.length > 0 ? 'WARN' : 'FAIL',
    details:
      withNarrative.length + '/' + insertedIds.length + ' rows have a non-trivial paradocs_narrative. ' +
      (withNarrative.length < insertedIds.length
        ? 'Possible causes: B0.7 daily cost cap, Haiku transient failure, or extractor produced too-short source text.'
        : 'All rows have meaningful Paradocs-voice narrative.'),
  });

  // 5. OBERF-specific archive vs effective type sub-typing
  if (adapter === 'oberf') {
    var { data: oberfRows } = await (svc.from('reports') as any)
      .select('id, metadata')
      .in('id', insertedIds);
    var reassigned = ((oberfRows as any) || []).filter(function (r: any) {
      var meta = r.metadata || {};
      return meta.archiveTypeSlug && meta.experienceTypeSlug && meta.archiveTypeSlug !== meta.experienceTypeSlug;
    });
    report.verifications.push({
      name: 'OBERF sub-typing fires',
      status: 'WARN',
      details: reassigned.length + ' rows have archive→effective type reassignment. ' +
        'MANUAL SPOT-CHECK REQUIRED — read the narratives for each reassigned row and confirm the new type is defensible.',
    });
  }
}

async function runOneAdapter(
  svc: SupabaseClient,
  adapter: string,
  limit: number,
): Promise<SmokeTestReport> {
  var startTime = Date.now();
  var report: SmokeTestReport = {
    adapter: adapter,
    sourceUuid: null,
    ingestSucceeded: false,
    ingestedCount: 0,
    ingestedIds: [],
    errors: [],
    verifications: [],
    spotCheckNotes: [],
    durationMs: 0,
  };

  var expectation = EXPECTATIONS[adapter];
  if (!expectation) {
    report.errors.push('No expectations defined for adapter: ' + adapter);
    report.durationMs = Date.now() - startTime;
    return report;
  }

  report.spotCheckNotes = expectation.spotCheckNotes;

  if (expectation.requiresEnvVar && !process.env[expectation.requiresEnvVar]) {
    report.errors.push('Missing required env var: ' + expectation.requiresEnvVar);
    report.durationMs = Date.now() - startTime;
    return report;
  }

  console.log('\n' + '='.repeat(70));
  console.log('B0.1 SMOKE TEST: ' + adapter + ' (limit=' + limit + ')');
  console.log('='.repeat(70));

  // Look up source UUID
  var sourceUuid = await lookupSourceUuid(svc, expectation.sourceSlugPattern);
  if (!sourceUuid) {
    report.errors.push('No data_sources row matching slug pattern: ' + expectation.sourceSlugPattern);
    report.durationMs = Date.now() - startTime;
    return report;
  }
  report.sourceUuid = sourceUuid;
  console.log('  source_uuid=' + sourceUuid);

  // Run the ingestion engine
  try {
    var ingestResult = await runIngestion(sourceUuid, limit);
    report.ingestSucceeded = !!ingestResult;
    report.ingestedCount = (ingestResult as any)?.processed || 0;
    // The engine doesn't return inserted IDs directly; query for the most recent
    // N reports from this source for verification.
    var { data: recent } = await (svc.from('reports') as any)
      .select('id, created_at')
      .eq('source_type', adapter)
      .order('created_at', { ascending: false })
      .limit(limit + 2);
    report.ingestedIds = ((recent as any) || []).slice(0, limit).map(function (r: any) { return r.id; });
    console.log('  ingested=' + report.ingestedCount + ' verified_ids=' + report.ingestedIds.length);
  } catch (e: any) {
    report.errors.push('Ingestion exception: ' + (e?.message || String(e)));
  }

  if (report.ingestedIds.length > 0) {
    await verifyInsertedReports(svc, adapter, expectation, report.ingestedIds, report);
  }

  report.durationMs = Date.now() - startTime;
  return report;
}

function printReport(reports: SmokeTestReport[]): void {
  console.log('\n\n' + '='.repeat(70));
  console.log('B0.1 SMOKE TEST SUMMARY');
  console.log('='.repeat(70));

  reports.forEach(function (r) {
    console.log('\n[' + r.adapter + ']');
    console.log('  Source UUID: ' + (r.sourceUuid || '(not found)'));
    console.log('  Ingested: ' + r.ingestedCount + ' reports (' + r.durationMs + 'ms)');
    if (r.errors.length > 0) {
      console.log('  ERRORS:');
      r.errors.forEach(function (e) { console.log('    - ' + e); });
    }
    if (r.verifications.length > 0) {
      console.log('  Verifications:');
      r.verifications.forEach(function (v) {
        console.log('    [' + v.status + '] ' + v.name + ' — ' + v.details);
      });
    }
    if (r.spotCheckNotes.length > 0) {
      console.log('  MANUAL spot-check:');
      r.spotCheckNotes.forEach(function (n) { console.log('    - ' + n); });
    }
  });

  var allPassed = reports.every(function (r) {
    return r.errors.length === 0 && r.verifications.every(function (v) { return v.status !== 'FAIL'; });
  });
  console.log('\n' + '='.repeat(70));
  console.log(allPassed ? 'OVERALL: PASS (manual spot-checks still required)' : 'OVERALL: FAIL — review errors above');
  console.log('='.repeat(70));

  // Also write a JSON report for archival
  var outPath = path.resolve(process.cwd(), 'b1-5-smoke-test-' + Date.now() + '.json');
  fs.writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log('\nFull JSON report written to: ' + outPath);
}

async function main() {
  var args = process.argv.slice(2);
  var adapterArg = args.find(function (a) { return !a.startsWith('--'); }) || null;
  var limitArg = args.find(function (a) { return a.startsWith('--limit='); });
  var limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars. Create .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  var svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  var adapterNames = adapterArg ? [adapterArg] : Object.keys(EXPECTATIONS);
  // Skip YouTube by default unless explicitly requested — it's gated on B0.8.
  if (!adapterArg) {
    adapterNames = adapterNames.filter(function (a) { return a !== 'youtube'; });
  }

  console.log('B1.5 Smoke Test Runner — B0.1');
  console.log('Date: ' + new Date().toISOString());
  console.log('Testing ' + adapterNames.length + ' adapter(s) with limit=' + limit);

  var reports: SmokeTestReport[] = [];
  for (var i = 0; i < adapterNames.length; i++) {
    var report = await runOneAdapter(svc, adapterNames[i], limit);
    reports.push(report);
  }

  printReport(reports);
}

main().catch(function (err) {
  console.error('Fatal:', err);
  process.exit(1);
});

// ===========================================================================
// Cleanup SQL — run after spot-checking to remove the smoke-test rows
// ===========================================================================
//
// -- Delete only smoke-test rows (those created in the last hour):
// DELETE FROM reports
// WHERE created_at > NOW() - INTERVAL '1 hour'
//   AND report_type = 'ingested';
//
// -- Or archive them via the admin source-takedown tool at
// -- /admin/source-takedown — safer than DELETE because it's reversible
// -- and writes an audit log.
