// API Route: /api/cron/ingest
// Triggered by Vercel cron job to run scheduled data ingestion

import type { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledIngestion, runIngestion } from '@/lib/ingestion/engine';

// Verify the request is from Vercel Cron
function isValidCronRequest(req: NextApiRequest): boolean {
  // In production, verify the CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.authorization;
    return authHeader === `Bearer ${cronSecret}`;
  }

  // In development, allow requests without secret
  return process.env.NODE_ENV === 'development';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST or GET (for cron)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Cron] Starting scheduled ingestion...');
    const startTime = Date.now();

    // Check if a specific source is requested
    const sourceId = req.query.source as string;

    let results;
    if (sourceId) {
      // Run for specific source
      const result = await runIngestion(sourceId);
      results = [result];
    } else {
      // Run for all due sources
      results = await runScheduledIngestion();
    }

    const totalDuration = Date.now() - startTime;

    // Summarize results
    const summary = {
      success: results.every(r => r.success),
      sourcesProcessed: results.length,
      totalRecordsFound: results.reduce((sum, r) => sum + r.recordsFound, 0),
      totalRecordsInserted: results.reduce((sum, r) => sum + r.recordsInserted, 0),
      totalRecordsUpdated: results.reduce((sum, r) => sum + r.recordsUpdated, 0),
      totalRecordsSkipped: results.reduce((sum, r) => sum + r.recordsSkipped, 0),
      duration: totalDuration,
      jobs: results.map(r => ({
        jobId: r.jobId,
        success: r.success,
        recordsInserted: r.recordsInserted,
        error: r.error
      }))
    };

    console.log('[Cron] Ingestion complete:', summary);

    return res.status(200).json(summary);

  } catch (error) {
    console.error('[Cron] Ingestion error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Vercel cron configuration
export const config = {
  maxDuration: 60 // Maximum execution time in seconds
};
