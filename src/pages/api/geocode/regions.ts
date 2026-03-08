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

  return res.status(200).json({ locations: results.filter(function(r) { return r !== null; }) });
}