import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { batchImportRedditDump, TARGET_SUBREDDITS } from '@/lib/ingestion/batch-reddit-importer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Log to ingestion_logs
async function logActivity(level: string, message: string, metadata?: Record<string, unknown>) {
  try {
    await supabaseAdmin.from('ingestion_logs').insert({
      source_id: null,
      job_id: null,
      level,
      message,
      metadata: metadata || {}
    })
  } catch (err) {
    console.log(`[BatchImport] ${level}: ${message}`)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { filePath, limit, batchSize, useAITitles, subreddits } = req.body

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' })
    }

    await logActivity('info', `Starting batch import from ${filePath}`, {
      limit,
      batchSize,
      useAITitles,
      subreddits: subreddits || Array.from(TARGET_SUBREDDITS)
    })

    // Note: For very large imports, this should be moved to a background job
    // Vercel functions have a 60-second timeout (or 300 on Pro plan)
    const result = await batchImportRedditDump({
      filePath,
      limit: limit || 5000, // Default limit for API calls to avoid timeout
      batchSize: batchSize || 100,
      useAITitles: useAITitles || false,
      subreddits,
      onProgress: (progress) => {
        // Log progress every 1000 inserts
        if (progress.inserted % 1000 === 0 && progress.inserted > 0) {
          console.log(`[BatchImport] Progress: ${progress.inserted} inserted`)
        }
      }
    })

    await logActivity('success', `Batch import completed`, {
      totalLines: result.totalLines,
      matched: result.matchedSubreddit,
      inserted: result.inserted,
      rejected: result.rejected,
      durationMs: Date.now() - result.startTime
    })

    res.status(200).json({
      success: true,
      result: {
        totalLines: result.totalLines,
        matchedSubreddit: result.matchedSubreddit,
        passedFilters: result.passedFilters,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        rejected: result.rejected,
        errors: result.errors,
        durationSeconds: (Date.now() - result.startTime) / 1000
      }
    })

  } catch (error) {
    console.error('Batch import error:', error)
    await logActivity('error', `Batch import failed: ${error instanceof Error ? error.message : 'Unknown'}`)

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Batch import failed'
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes on Vercel Pro
}
