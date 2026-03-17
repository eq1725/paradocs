/**
 * Fix Roswell Cluster Coordinates
 *
 * Migration script to correct location data for Roswell cluster reports.
 * Several reports had coordinates pointing to Roswell city center instead
 * of the actual incident locations (Foster Ranch debris field, etc.)
 *
 * Documented Foster Ranch debris field: ~33°57'N, 105°18'W (33.9567, -105.3069)
 * Source: Multiple research sources including Carey/Schmitt documentation
 *
 * Run via: POST /api/admin/fix-roswell-coordinates (requires admin auth)
 */

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

// ─── Coordinate corrections ──────────────────────────────────────────
// Each entry: slug, what's wrong, correct values, and why
var CORRECTIONS = [
  {
    slug: 'the-roswell-incident-july-1947-showcase',
    reason: 'Coordinates were Roswell city center (33.3943, -104.523) but location_name says Foster Ranch near Corona — 75 miles northwest',
    updates: {
      latitude: 33.9567,
      longitude: -105.3069,
      city: 'Corona',  // Nearest town to Foster Ranch, not Roswell
    },
  },
  {
    slug: 'jesse-marcel-roswell-debris-field-1947',
    reason: 'Marcel visited the Foster Ranch debris field. Latitude was close (33.9425) but longitude was Roswell city (-104.523) instead of Foster Ranch (-105.3069)',
    updates: {
      latitude: 33.9567,
      longitude: -105.3069,
    },
  },
  {
    slug: 'mac-brazel-roswell-debris-discovery-1947',
    reason: 'Brazel discovered debris on Foster Ranch. Coords were close (33.815, -105.169) but slightly off from documented site',
    updates: {
      latitude: 33.9567,
      longitude: -105.3069,
    },
  },
  {
    slug: 'sheridan-cavitt-roswell-cic-1947',
    reason: 'Cavitt visited Foster Ranch with Marcel. Latitude was close (33.9425) but longitude was Roswell city (-104.523) instead of Foster Ranch',
    updates: {
      latitude: 33.9567,
      longitude: -105.3069,
    },
  },
  // These are already correct — included for verification only:
  // robert-porter: 33.3016, -104.5305 → Roswell AAF (Walker AFB) — correct, flight departed here
  // george-wilcox: 33.3943, -104.5230 → Roswell city center — correct, courthouse is in Roswell
  // jesse-marcel-jr: 33.3943, -104.5230 → Roswell city center — correct, Marcel family home in Roswell
  // walter-haut: 33.3016, -104.5305 → Roswell AAF — correct, press release issued from RAAF
  // thomas-dubose: 32.7682, -97.4375 → Fort Worth, TX — correct, DuBose was at Fort Worth AAF
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey);
  var results: Array<{ slug: string; status: string; before?: any; after?: any }> = [];

  for (var correction of CORRECTIONS) {
    try {
      // Get current values
      var { data: current, error: fetchErr } = await supabase
        .from('reports')
        .select('id, slug, latitude, longitude, city, location_name')
        .eq('slug', correction.slug)
        .single();

      if (fetchErr || !current) {
        results.push({ slug: correction.slug, status: 'NOT_FOUND' });
        continue;
      }

      var before = {
        latitude: current.latitude,
        longitude: current.longitude,
        city: current.city,
        location_name: current.location_name,
      };

      // Apply correction
      var { error: updateErr } = await supabase
        .from('reports')
        .update(correction.updates)
        .eq('id', current.id);

      if (updateErr) {
        results.push({ slug: correction.slug, status: 'ERROR: ' + updateErr.message, before: before });
        continue;
      }

      results.push({
        slug: correction.slug,
        status: 'FIXED',
        before: before,
        after: correction.updates,
      });

    } catch (err: any) {
      results.push({ slug: correction.slug, status: 'EXCEPTION: ' + err.message });
    }
  }

  // Also verify the reports we believe are correct
  var verifySlgs = [
    'robert-porter-roswell-transport-1947',
    'george-wilcox-roswell-sheriff-1947',
    'jesse-marcel-jr-roswell-debris-1947',
    'walter-haut-roswell-press-release-1947',
    'thomas-dubose-roswell-coverup-testimony-1947',
  ];

  var verified: Array<{ slug: string; lat: number; lng: number; location_name: string }> = [];
  for (var vs of verifySlgs) {
    var { data: vr } = await supabase
      .from('reports')
      .select('slug, latitude, longitude, location_name')
      .eq('slug', vs)
      .single();
    if (vr) {
      verified.push({ slug: vr.slug, lat: vr.latitude, lng: vr.longitude, location_name: vr.location_name });
    }
  }

  return res.status(200).json({
    success: true,
    corrections: results,
    verified_unchanged: verified,
    note: 'Foster Ranch debris field documented at ~33.9567, -105.3069 (33°57\'N, 105°18\'W). Source: Carey/Schmitt research, USAF report references.',
  });
}
