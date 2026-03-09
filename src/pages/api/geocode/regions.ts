import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!token) {
    return res.status(500).json({ error: 'Mapbox token not configured' });
  }

  var regions = req.body.regions;
  if (!regions || !Array.isArray(regions) || regions.length === 0) {
    return res.status(400).json({ error: 'regions array required' });
  }

  // Limit to 10 regions max
  var limited = regions.slice(0, 10);
  var results: Array<{ region: string; lat: number; lng: number } | null> = [];

  // First pass: geocode all regions
  for (var i = 0; i < limited.length; i++) {
    var region = limited[i];
    try {
      var encoded = encodeURIComponent(region);
      var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encoded + '.json?access_token=' + token + '&limit=1&types=country,region,place,locality';
      var resp = await fetch(url);
      var data = await resp.json();
      if (data.features && data.features.length > 0) {
        var coords = data.features[0].center;
        results.push({ region: region, lat: coords[1], lng: coords[0] });
      } else {
        results.push(null);
      }
    } catch (e) {
      results.push(null);
    }
  }

  var valid = results.filter(function(r) { return r !== null; }) as Array<{ region: string; lat: number; lng: number }>;

  // Second pass: if we have 3+ results and the spread is extreme (>50 degrees),
  // find the majority cluster and re-geocode outliers with proximity bias
  if (valid.length >= 3) {
    var lats = valid.map(function(v) { return v.lat; });
    var lngs = valid.map(function(v) { return v.lng; });
    var latSpread = Math.max.apply(null, lats) - Math.min.apply(null, lats);
    var lngSpread = Math.max.apply(null, lngs) - Math.min.apply(null, lngs);

    if (latSpread > 50 || lngSpread > 100) {
      // Find median point as cluster center
      var sortedLats = lats.slice().sort(function(a, b) { return a - b; });
      var sortedLngs = lngs.slice().sort(function(a, b) { return a - b; });
      var medIdx = Math.floor(sortedLats.length / 2);
      var medLat = sortedLats[medIdx];
      var medLng = sortedLngs[medIdx];

      // Re-geocode points that are far from the median (>40 degrees away)
      for (var j = 0; j < valid.length; j++) {
        var dist = Math.abs(valid[j].lat - medLat) + Math.abs(valid[j].lng - medLng);
        if (dist > 40) {
          try {
            var reEncoded = encodeURIComponent(valid[j].region);
            var reUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + reEncoded + '.json?access_token=' + token + '&limit=1&types=country,region,place,locality&proximity=' + medLng + ',' + medLat;
            var reResp = await fetch(reUrl);
            var reData = await reResp.json();
            if (reData.features && reData.features.length > 0) {
              var reCoords = reData.features[0].center;
              valid[j] = { region: valid[j].region, lat: reCoords[1], lng: reCoords[0] };
            }
          } catch (e) {
            // keep original result
          }
        }
      }
    }
  }

  return res.status(200).json({ locations: valid });
}