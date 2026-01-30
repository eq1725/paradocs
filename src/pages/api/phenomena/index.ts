/**
 * API: GET /api/phenomena
 * List all phenomena, optionally filtered by category
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllPhenomena, getPhenomenaByCategory } from '@/lib/services/phenomena.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { category } = req.query;

    let phenomena;
    if (category && typeof category === 'string') {
      phenomena = await getPhenomenaByCategory(category);
    } else {
      phenomena = await getAllPhenomena();
    }

    return res.status(200).json({
      phenomena,
      count: phenomena.length,
    });
  } catch (error) {
    console.error('[API] Phenomena list error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
