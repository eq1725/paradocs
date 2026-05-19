/**
 * GET /api/geocode/forward?q=Lumberton
 *
 * Panel-feedback (May 2026). Light Mapbox proxy that takes a city
 * query and returns the best-matching {city, state, country,
 * latitude, longitude}. Called from the submit form on city blur to
 * auto-populate state + country so the user doesn't have to type
 * "United States" eighty times.
 *
 * Why a proxy (vs. client-side direct call):
 *   1. Keeps the Mapbox token server-side (Mapbox tokens can be
 *      restricted to specific URLs, but a server proxy is cleaner).
 *   2. Lets us shape the response — we strip everything except the
 *      fields we actually use.
 *   3. Defensive: silently returns 200 with empty hit when
 *      MAPBOX_TOKEN isn't configured, so the client never errors
 *      out in environments where geocoding isn't wired up.
 *
 * Auth: none. The endpoint is read-only and rate-limited at the
 *       upstream by Mapbox (100k requests/month free tier).
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'

interface GeocodeHit {
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  full_label: string | null
  confidence: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var q = ((req.query.q as string) || '').trim()
  if (!q || q.length < 2) {
    return res.status(200).json({ ok: true, hit: null })
  }

  // Accept either env var name. Different parts of the codebase use
  // different conventions and the launch infra already has
  // MAPBOX_ACCESS_TOKEN populated; this avoids requiring a second
  // copy under a different key.
  var token = process.env.MAPBOX_ACCESS_TOKEN
    || process.env.MAPBOX_TOKEN
    || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!token) {
    // Silent no-op — caller can decide whether to surface this.
    return res.status(200).json({ ok: true, hit: null, reason: 'no_mapbox_token' })
  }

  try {
    var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
      + encodeURIComponent(q)
      + '.json?types=place,locality,region,country&limit=1&access_token=' + encodeURIComponent(token)

    var upstream = await fetch(url)
    if (!upstream.ok) {
      var bodyText = await upstream.text()
      console.warn('[geocode/forward] mapbox upstream', upstream.status, bodyText.slice(0, 200))
      return res.status(200).json({ ok: true, hit: null, reason: 'upstream_error' })
    }
    var data = await upstream.json()
    var feature = data && data.features && data.features[0]
    if (!feature) {
      return res.status(200).json({ ok: true, hit: null, reason: 'no_match' })
    }

    // Mapbox returns `context` as an ordered array from most-specific
    // to least-specific. We pluck city / state / country by inspecting
    // the id prefix of each context entry.
    var city: string | null = null
    var state: string | null = null
    var country: string | null = null

    // The matched feature itself may be city/region/country level.
    var topId = String(feature.id || '')
    var topText = String(feature.text || '')
    if (topId.indexOf('place.') === 0 || topId.indexOf('locality.') === 0) city = topText
    else if (topId.indexOf('region.') === 0) state = topText
    else if (topId.indexOf('country.') === 0) country = topText

    // Walk context for missing fields.
    var ctx = (feature.context || []) as any[]
    for (var i = 0; i < ctx.length; i++) {
      var c = ctx[i]
      var cid = String(c.id || '')
      var ctext = String(c.text || '')
      if (!city && (cid.indexOf('place.') === 0 || cid.indexOf('locality.') === 0)) city = ctext
      if (!state && cid.indexOf('region.') === 0) state = ctext
      if (!country && cid.indexOf('country.') === 0) country = ctext
    }

    var lng: number | null = null
    var lat: number | null = null
    if (feature.center && Array.isArray(feature.center) && feature.center.length === 2) {
      lng = feature.center[0]
      lat = feature.center[1]
    }

    var hit: GeocodeHit = {
      city: city,
      state: state,
      country: country,
      latitude: lat,
      longitude: lng,
      full_label: feature.place_name || null,
      // Mapbox relevance is 0..1; we expose it so the client can
      // decide whether to trust the auto-fill or just suggest.
      confidence: typeof feature.relevance === 'number' ? feature.relevance : 0,
    }

    return res.status(200).json({ ok: true, hit: hit })
  } catch (e: any) {
    console.warn('[geocode/forward] failed:', e?.message)
    return res.status(200).json({ ok: true, hit: null, reason: 'exception' })
  }
}
