import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return getLogs(req, res)
  } else if (req.method === 'POST') {
    return addLog(req, res)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function getLogs(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = '50', level, source_id } = req.query

    let query = supabaseAdmin
      .from('ingestion_logs')
      .select('*, data_sources(name, slug)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string))

    if (level) {
      query = query.eq('level', level)
    }

    if (source_id) {
      query = query.eq('source_id', source_id)
    }

    const { data: logs, error } = await query

    if (error) {
      // Table might not exist yet - return empty array
      if (error.code === '42P01') {
        return res.status(200).json({ logs: [], message: 'Logs table not yet created' })
      }
      throw error
    }

    res.status(200).json({ logs: logs || [] })
  } catch (error) {
    console.error('Logs API error:', error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
}

async function addLog(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { source_id, job_id, level, message, metadata } = req.body

    const { data, error } = await supabaseAdmin
      .from('ingestion_logs')
      .insert({
        source_id,
        job_id,
        level,
        message,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return res.status(200).json({ success: false, message: 'Logs table not yet created' })
      }
      throw error
    }

    res.status(200).json({ success: true, log: data })
  } catch (error) {
    console.error('Add log error:', error)
    res.status(500).json({ error: 'Failed to add log' })
  }
}
