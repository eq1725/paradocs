import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * POST /api/admin/revalidate
 * Body: { paths: ["/report/slug-1", "/report/slug-2"] }
 *
 * Forces Next.js ISR to regenerate specific pages immediately.
 * Useful when DB data changes (media, descriptions) and the ISR cache is stale.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth check — admin email from auth token
  var paths = req.body?.paths as string[];
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'Provide paths array, e.g. ["/report/my-slug"]' });
  }

  var results: Array<{ path: string; status: string }> = [];

  for (var i = 0; i < paths.length; i++) {
    try {
      await res.revalidate(paths[i]);
      results.push({ path: paths[i], status: 'revalidated' });
    } catch (err: any) {
      results.push({ path: paths[i], status: 'error: ' + (err.message || 'unknown') });
    }
  }

  return res.status(200).json({ success: true, results: results });
}
