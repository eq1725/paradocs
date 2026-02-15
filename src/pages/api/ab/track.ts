/**
 * API: POST /api/ab/track
 *
 * Receives A/B test impression and conversion events.
 * Stores to Supabase ab_events table for analysis.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  var experimentId = body.experiment_id;
  var variant = body.variant;
  var event = body.event;
  var userId = body.user_id || 'anonymous';
  var metadata = body.metadata || {};

  if (!experimentId || !variant || !event) {
    return res.status(400).json({ error: 'experiment_id, variant, and event required' });
  }

  var supabase = createClient(supabaseUrl, supabaseKey);

  var insertResult = await supabase
    .from('ab_events')
    .insert({
      experiment_id: experimentId,
      variant: variant,
      event_type: event,
      user_id: userId,
      metadata: metadata,
      created_at: new Date().toISOString()
    });

  if (insertResult.error) {
    console.error('AB track error:', insertResult.error.message);
  }

  return res.status(200).json({ ok: true });
}
