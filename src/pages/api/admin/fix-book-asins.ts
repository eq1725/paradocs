import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';

async function getAuthenticatedUser(req: NextApiRequest) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  var { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * POST /api/admin/fix-book-asins
 *
 * Fixes three incorrect Amazon ASINs in the report_books table:
 * 1. "Witness to Roswell" — 1601199996 → 1601630662 (Revised & Expanded Edition)
 * 2. "The Roswell Incident" — 1605209228 → 1567311326 (Fine Communications edition)
 * 3. "The Roswell Legacy" — 1601630662 → 1601630263 (was accidentally given Witness ASIN)
 *
 * ORDER MATTERS: Fix Roswell Legacy FIRST (since its current ASIN is the
 * correct ASIN for Witness to Roswell), then fix Witness to Roswell.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results = { fixed: 0, errors: [] as string[] };

  // Fix order matters — Roswell Legacy first (its current ASIN = Witness's correct ASIN)

  // 1. Fix "The Roswell Legacy" — 1601630662 → 1601630263
  var { data: legacyBooks, error: e1 } = await supabase
    .from('report_books')
    .update({ amazon_asin: '1601630263' })
    .eq('amazon_asin', '1601630662')
    .ilike('title', '%Roswell Legacy%')
    .select('id');
  if (e1) { results.errors.push('Legacy fix failed: ' + e1.message); }
  else { results.fixed += (legacyBooks || []).length; }

  // 2. Fix "Witness to Roswell" — 1601199996 → 1601630662
  var { data: witnessBooks, error: e2 } = await supabase
    .from('report_books')
    .update({ amazon_asin: '1601630662' })
    .eq('amazon_asin', '1601199996')
    .select('id');
  if (e2) { results.errors.push('Witness fix failed: ' + e2.message); }
  else { results.fixed += (witnessBooks || []).length; }

  // 3. Fix "The Roswell Incident" — 1605209228 → 1567311326
  var { data: incidentBooks, error: e3 } = await supabase
    .from('report_books')
    .update({ amazon_asin: '1567311326' })
    .eq('amazon_asin', '1605209228')
    .select('id');
  if (e3) { results.errors.push('Incident fix failed: ' + e3.message); }
  else { results.fixed += (incidentBooks || []).length; }

  return res.status(200).json({
    success: true,
    results: results,
    details: {
      legacyFixed: (legacyBooks || []).length,
      witnessFixed: (witnessBooks || []).length,
      incidentFixed: (incidentBooks || []).length,
    },
    message: 'Fixed ' + results.fixed + ' book ASINs'
  });
}
