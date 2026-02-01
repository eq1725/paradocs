/**
 * Admin API: POST /api/admin/run-migration
 *
 * Runs SQL migration statements for scale optimizations
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Split SQL into individual statements
const migrationSQL = `
-- Get approved reports count (estimated for speed)
CREATE OR REPLACE FUNCTION get_approved_reports_count()
RETURNS TABLE (count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*)::BIGINT
  FROM reports
  WHERE status = 'approved';
END;
$$ LANGUAGE plpgsql STABLE;

-- Get unique countries count
CREATE OR REPLACE FUNCTION get_unique_countries_count()
RETURNS TABLE (count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(DISTINCT country)::BIGINT
  FROM reports
  WHERE status = 'approved' AND country IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Category breakdown with counts
CREATE OR REPLACE FUNCTION get_category_breakdown()
RETURNS TABLE (category TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.category::TEXT, COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
  GROUP BY r.category
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Country breakdown with counts (top 15)
CREATE OR REPLACE FUNCTION get_country_breakdown(limit_count INT DEFAULT 15)
RETURNS TABLE (country TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.country::TEXT, COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved' AND r.country IS NOT NULL
  GROUP BY r.country
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Source type breakdown
CREATE OR REPLACE FUNCTION get_source_breakdown()
RETURNS TABLE (source_type TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(r.source_type, 'user_submission')::TEXT AS source_type,
    COUNT(*)::BIGINT
  FROM reports r
  WHERE r.status = 'approved'
  GROUP BY r.source_type
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_approved_reports_count() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_unique_countries_count() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_category_breakdown() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_country_breakdown(INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_source_breakdown() TO authenticated, anon;
`

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const results: { statement: string; success: boolean; error?: string }[] = []

  // Split into statements and execute each
  const statements = migrationSQL
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  for (const stmt of statements) {
    try {
      // Use Supabase's query method for raw SQL
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql: stmt + ';' }).single()

      if (error) {
        results.push({
          statement: stmt.substring(0, 50) + '...',
          success: false,
          error: error.message
        })
      } else {
        results.push({
          statement: stmt.substring(0, 50) + '...',
          success: true
        })
      }
    } catch (e: any) {
      results.push({
        statement: stmt.substring(0, 50) + '...',
        success: false,
        error: e.message || 'Unknown error'
      })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return res.status(200).json({
    message: `Migration completed: ${successCount} succeeded, ${failCount} failed`,
    note: 'If functions failed, run migration 019 directly in Supabase SQL Editor',
    results
  })
}
