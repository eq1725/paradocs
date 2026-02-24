// Admin API: Quality Scoring & Deduplication Pipeline
// POST /api/admin/quality-pipeline
//
// Actions:
//   action=score-all       — Score all unscored approved reports
//   action=score-batch     — Score a batch of N reports (default 100)
//   action=rescore-all     — Re-score all reports (version mismatch)
//   action=dedup-scan      — Scan approved reports for duplicates
//   action=score-single    — Score a single report by ID
//   action=stats           — Get quality score distribution stats
//
// Requires: CRON_SECRET or admin auth

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { scoreReport, ScoringInput } from '@/lib/ingestion/filters/quality-scorer';
import {
  findDuplicates,
  generateFingerprint,
  DedupCandidate,
} from '@/lib/ingestion/dedup';

const SCORER_VERSION = '2.0.0';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function isAuthorized(req: NextApiRequest): boolean {
  // Check CRON_SECRET header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization === 'Bearer ' + cronSecret) {
    return true;
  }
  // For development, allow without auth if no CRON_SECRET is set
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, reportId, batchSize = 100 } = req.body;

  try {
    switch (action) {
      case 'score-batch':
        return await handleScoreBatch(res, Number(batchSize));

      case 'score-all':
        return await handleScoreAll(res);

      case 'rescore-all':
        return await handleRescoreAll(res, Number(batchSize));

      case 'dedup-scan':
        return await handleDedupScan(res);

      case 'score-single':
        if (!reportId) return res.status(400).json({ error: 'reportId required' });
        return await handleScoreSingle(res, reportId);

      case 'stats':
        return await handleStats(res);

      default:
        return res.status(400).json({
          error: 'Unknown action',
          validActions: ['score-batch', 'score-all', 'rescore-all', 'dedup-scan', 'score-single', 'stats']
        });
    }
  } catch (error) {
    console.error('[quality-pipeline] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// SCORE A BATCH OF UNSCORED REPORTS
// ============================================================================

async function handleScoreBatch(res: NextApiResponse, batchSize: number) {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(batchSize, 500);

  // Fetch unscored approved/pending reports
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, latitude, longitude, event_date, event_time, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, credibility, tags')
    .is('quality_score', null)
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Failed to fetch reports: ' + error.message);
  if (!reports || reports.length === 0) {
    return res.status(200).json({ message: 'No unscored reports found', scored: 0 });
  }

  let scored = 0;
  let errors = 0;
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  for (const report of reports) {
    try {
      const input: ScoringInput = {
        title: report.title,
        summary: report.summary,
        description: report.description,
        category: report.category,
        location_name: report.location_name,
        country: report.country,
        state_province: report.state_province,
        city: report.city,
        latitude: report.latitude,
        longitude: report.longitude,
        event_date: report.event_date,
        event_time: report.event_time,
        witness_count: report.witness_count,
        has_physical_evidence: report.has_physical_evidence,
        has_photo_video: report.has_photo_video,
        has_official_report: report.has_official_report,
        evidence_summary: report.evidence_summary,
        source_type: report.source_type,
        credibility: report.credibility,
        tags: report.tags,
      };

      const result = scoreReport(input);
      const fingerprint = generateFingerprint(
        report.title,
        report.event_date,
        report.location_name
      );

      const { error: updateError } = await supabase
        .from('reports')
        .update({
          quality_score: result.totalScore,
          quality_grade: result.grade,
          quality_dimensions: result.dimensions,
          quality_scored_at: result.scoredAt,
          quality_scorer_version: result.version,
          content_fingerprint: fingerprint,
        })
        .eq('id', report.id);

      if (!updateError) {
        scored++;
        gradeDistribution[result.grade]++;
      } else {
        errors++;
        console.error('[quality-pipeline] Update error for', report.id, updateError.message);
      }
    } catch (e) {
      errors++;
      console.error('[quality-pipeline] Scoring error for', report.id, e);
    }
  }

  return res.status(200).json({
    message: 'Batch scoring complete',
    total: reports.length,
    scored,
    errors,
    gradeDistribution,
  });
}

// ============================================================================
// SCORE ALL UNSCORED REPORTS (iterative)
// ============================================================================

async function handleScoreAll(res: NextApiResponse) {
  const supabase = getSupabaseAdmin();
  const batchSize = 200;
  let totalScored = 0;
  let totalErrors = 0;
  let hasMore = true;
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  while (hasMore) {
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, title, summary, description, category, location_name, country, state_province, city, latitude, longitude, event_date, event_time, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, credibility, tags')
      .is('quality_score', null)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (error) throw new Error('Fetch error: ' + error.message);
    if (!reports || reports.length === 0) {
      hasMore = false;
      break;
    }

    for (const report of reports) {
      try {
        const input: ScoringInput = {
          title: report.title,
          summary: report.summary,
          description: report.description,
          category: report.category,
          location_name: report.location_name,
          country: report.country,
          state_province: report.state_province,
          city: report.city,
          latitude: report.latitude,
          longitude: report.longitude,
          event_date: report.event_date,
          event_time: report.event_time,
          witness_count: report.witness_count,
          has_physical_evidence: report.has_physical_evidence,
          has_photo_video: report.has_photo_video,
          has_official_report: report.has_official_report,
          evidence_summary: report.evidence_summary,
          source_type: report.source_type,
          credibility: report.credibility,
          tags: report.tags,
        };

        const result = scoreReport(input);
        const fingerprint = generateFingerprint(report.title, report.event_date, report.location_name);

        const { error: updateError } = await supabase
          .from('reports')
          .update({
            quality_score: result.totalScore,
            quality_grade: result.grade,
            quality_dimensions: result.dimensions,
            quality_scored_at: result.scoredAt,
            quality_scorer_version: result.version,
            content_fingerprint: fingerprint,
          })
          .eq('id', report.id);

        if (!updateError) {
          totalScored++;
          gradeDistribution[result.grade]++;
        } else {
          totalErrors++;
        }
      } catch {
        totalErrors++;
      }
    }

    // Safety: if batch returned fewer than limit, we're done
    if (reports.length < batchSize) hasMore = false;
  }

  return res.status(200).json({
    message: 'Full scoring complete',
    totalScored,
    totalErrors,
    gradeDistribution,
  });
}

// ============================================================================
// RE-SCORE ALL REPORTS (when scorer version changes)
// ============================================================================

async function handleRescoreAll(res: NextApiResponse, batchSize: number) {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(batchSize, 500);

  // Find reports with outdated scorer version
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, latitude, longitude, event_date, event_time, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, credibility, tags')
    .neq('quality_scorer_version', SCORER_VERSION)
    .in('status', ['approved', 'pending'])
    .limit(limit);

  if (error) throw new Error('Fetch error: ' + error.message);
  if (!reports || reports.length === 0) {
    return res.status(200).json({ message: 'All reports are on current scorer version', rescored: 0 });
  }

  let rescored = 0;
  for (const report of reports) {
    try {
      const input: ScoringInput = report as ScoringInput;
      const result = scoreReport(input);
      const fingerprint = generateFingerprint(report.title, report.event_date, report.location_name);

      await supabase
        .from('reports')
        .update({
          quality_score: result.totalScore,
          quality_grade: result.grade,
          quality_dimensions: result.dimensions,
          quality_scored_at: result.scoredAt,
          quality_scorer_version: result.version,
          content_fingerprint: fingerprint,
        })
        .eq('id', report.id);

      rescored++;
    } catch {
      // continue
    }
  }

  return res.status(200).json({
    message: 'Re-scoring batch complete',
    total: reports.length,
    rescored,
    remaining: reports.length === limit ? 'more batches needed' : 'done',
  });
}

// ============================================================================
// DEDUP SCAN — find duplicates among approved reports
// ============================================================================

async function handleDedupScan(res: NextApiResponse) {
  const supabase = getSupabaseAdmin();

  // Fetch all approved reports (limited fields for performance)
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, location_name, city, state_province, country, latitude, longitude, event_date, source_type, original_report_id, description')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(2000); // Safety cap

  if (error) throw new Error('Fetch error: ' + error.message);
  if (!reports || reports.length === 0) {
    return res.status(200).json({ message: 'No reports to scan', duplicatesFound: 0 });
  }

  // First pass: exact fingerprint matches
  const fingerprints = new Map<string, string[]>();
  for (const r of reports) {
    const fp = generateFingerprint(r.title, r.event_date, r.location_name);
    if (!fingerprints.has(fp)) fingerprints.set(fp, []);
    fingerprints.get(fp)!.push(r.id);
  }

  const exactDupes = Array.from(fingerprints.values()).filter(ids => ids.length > 1);

  // Second pass: fuzzy matching
  const candidates: DedupCandidate[] = reports.map(r => ({
    id: r.id,
    title: r.title,
    location_name: r.location_name,
    city: r.city,
    state_province: r.state_province,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    event_date: r.event_date,
    source_type: r.source_type,
    original_report_id: r.original_report_id,
    description: r.description ? r.description.substring(0, 500) : undefined, // Truncate for performance
  }));

  const dedupResult = findDuplicates(candidates);

  // Store detected duplicates in the database
  let stored = 0;
  for (const match of dedupResult.matches) {
    try {
      // Use LEAST/GREATEST to ensure consistent ordering
      const { error: insertError } = await supabase
        .from('duplicate_matches')
        .upsert({
          report_a_id: match.reportA < match.reportB ? match.reportA : match.reportB,
          report_b_id: match.reportA < match.reportB ? match.reportB : match.reportA,
          title_similarity: match.titleSimilarity,
          location_similarity: match.locationSimilarity,
          date_similarity: match.dateSimilarity,
          content_similarity: match.contentSimilarity,
          overall_score: match.overallScore,
          confidence: match.confidence,
          details: match.details,
          resolution: 'pending',
        }, {
          onConflict: 'idx_duplicate_matches_pair',
          ignoreDuplicates: false, // Update scores on re-scan
        });

      if (!insertError) stored++;
    } catch (e) {
      console.error('[dedup] Failed to store match:', e);
    }
  }

  return res.status(200).json({
    message: 'Dedup scan complete',
    reportsScanned: reports.length,
    exactFingerprintDupes: exactDupes.length,
    fuzzyDuplicatesFound: dedupResult.duplicatesFound,
    matchesStored: stored,
    comparisons: dedupResult.totalCompared,
    duration: dedupResult.duration + 'ms',
    topMatches: dedupResult.matches.slice(0, 10).map(m => ({
      confidence: m.confidence,
      overall: m.overallScore,
      details: m.details,
    })),
  });
}

// ============================================================================
// SCORE A SINGLE REPORT
// ============================================================================

async function handleScoreSingle(res: NextApiResponse, reportId: string) {
  const supabase = getSupabaseAdmin();

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, latitude, longitude, event_date, event_time, witness_count, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, credibility, tags')
    .eq('id', reportId)
    .single();

  if (error || !report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const input: ScoringInput = report as ScoringInput;
  const result = scoreReport(input);
  const fingerprint = generateFingerprint(report.title, report.event_date, report.location_name);

  // Save to DB
  await supabase
    .from('reports')
    .update({
      quality_score: result.totalScore,
      quality_grade: result.grade,
      quality_dimensions: result.dimensions,
      quality_scored_at: result.scoredAt,
      quality_scorer_version: result.version,
      content_fingerprint: fingerprint,
    })
    .eq('id', report.id);

  return res.status(200).json({
    reportId: report.id,
    title: report.title,
    ...result,
  });
}

// ============================================================================
// STATS — quality distribution overview
// ============================================================================

async function handleStats(res: NextApiResponse) {
  const supabase = getSupabaseAdmin();

  // Grade distribution
  const { data: distribution } = await supabase.rpc('get_quality_distribution');

  // Unscored count
  const { count: unscoredCount } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .is('quality_score', null)
    .in('status', ['approved', 'pending']);

  // Pending duplicates
  const { count: pendingDupes } = await supabase
    .from('duplicate_matches')
    .select('*', { count: 'exact', head: true })
    .or('resolution.is.null,resolution.eq.pending');

  // Score stats
  const { data: scoreStats } = await supabase
    .from('reports')
    .select('quality_score')
    .not('quality_score', 'is', null)
    .eq('status', 'approved');

  let avgScore = 0;
  let minScore = 0;
  let maxScore = 0;
  if (scoreStats && scoreStats.length > 0) {
    const scores = scoreStats.map(r => r.quality_score).filter(Boolean) as number[];
    avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    minScore = Math.min(...scores);
    maxScore = Math.max(...scores);
  }

  return res.status(200).json({
    gradeDistribution: distribution || [],
    unscoredReports: unscoredCount || 0,
    pendingDuplicates: pendingDupes || 0,
    scorerVersion: SCORER_VERSION,
    scoreStats: {
      average: avgScore,
      min: minScore,
      max: maxScore,
      totalScored: scoreStats?.length || 0,
    },
  });
}
