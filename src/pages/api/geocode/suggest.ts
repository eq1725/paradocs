/**
 * GET /api/geocode/suggest?q=Lum&types=place
 *
 * Panel-feedback (May 2026). Mapbox forward-geocoding proxy
 * returning up to 5 typeahead suggestions. Powers the
 * <LocationAutocomplete> dropdown.
 *
 * Query params:
 *   q     — free-text typed query (required, min 2 chars)
 *   types — optional Mapbox types filter (default: 'place,locality,region,country')
 *           valid: place, locality, region, country, district
 *
 * Response shape:
 *   { ok: true, suggestions: Array<{
 *       label: string,           // human-readable, e.g. "Lumberton, Texas, USA"
 *       city: string | null,
 *       state: string | null,
 *       country: string | null,
 *       latitude: number | null,
 *       longitude: number | null,
 *     }> }
 *
 * Defensive: silent no-op (empty suggestions) if MAPBOX_ACCESS_TOKEN
 * isn't configured.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'

var ALLOWED_TYPES = ['place', 'locality', 'region', 'country', 'district']
var DEFAULT_TYPES = 'place,locality,region,country'
var MAX_SUGGESTIONS = 5

interface Suggestion {
  label: string
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

function getToken(): string | null {
  return process.env.MAPBOX_ACCESS_TOKEN
    || process.env.MAPBOX_TOKEN
    || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    || null
}

function extractContext(feature: any): Suggestion {
  var city: string | null = null
  var state: string | null = null
  var country: string | null = null

  var topId = String(feature.id || '')
  var topText = String(feature.text || '')
  if (topId.indexOf('place.') === 0 || topId.indexOf('locality.') === 0) city = topText
  else if (topId.indexOf('region.') === 0) state = topText
  else if (topId.indexOf('country.') === 0) country = topText

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

  return {
    label: feature.place_name || feature.text || '',
    city: city,
    state: state,
    country: country,
    latitude: lat,
    longitude: lng,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  var q = ((req.query.q as string) || '').trim()
  if (!q || q.length < 2) {
    return res.status(200).json({ ok: true, suggestions: [] })
  }

  var typesParam = (req.query.types as string) || DEFAULT_TYPES
  // Validate types — strip anything not in the allowlist.
  var filteredTypes = typesParam.split(',')
    .map(function (t) { return t.trim() })
    .filter(function (t) { return ALLOWED_TYPES.indexOf(t) !== -1 })
    .join(',') || DEFAULT_TYPES

  var token = getToken()
  if (!token) {
    return res.status(200).json({ ok: true, suggestions: [], reason: 'no_mapbox_token' })
  }

  try {
    var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
      + encodeURIComponent(q)
      + '.json?types=' + encodeURIComponent(filteredTypes)
      + '&limit=' + MAX_SUGGESTIONS
      + '&autocomplete=true'
      + '&access_token=' + encodeURIComponent(token)

    var upstream = await fetch(url)
    if (!upstream.ok) {
      var bodyText = await upstream.text()
      console.warn('[geocode/suggest] mapbox upstream', upstream.status, bodyText.slice(0, 200))
      return res.status(200).json({ ok: true, suggestions: [], reason: 'upstream_error' })
    }
    var data = await upstream.json()
    var features = (data && data.features) || []
    var suggestions: Suggestion[] = features.slice(0, MAX_SUGGESTIONS).map(extractContext)

    return res.status(200).json({ ok: true, suggestions: suggestions })
  } catch (e: any) {
    console.warn('[geocode/suggest] failed:', e?.message)
    return res.status(200).json({ ok: true, suggestions: [], reason: 'exception' })
  }
}
