import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export var config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  var url = req.nextUrl;
  var title = url.searchParams.get('title') || 'PARADOCS';
  var subtitle = url.searchParams.get('subtitle') || 'Where Mysteries Meet Discovery';
  var desc = url.searchParams.get('desc') || 'The worlds largest database of paranormal phenomena';

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1035 50%, #0a0a1a 100%)',
          fontFamily: 'system-ui, sans-serif',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { color: '#c084fc', fontSize: '52px', fontWeight: 800, letterSpacing: '4px', marginBottom: '24px' },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#e5e7eb', fontSize: '30px', fontWeight: 600 },
              children: subtitle,
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#9ca3af', fontSize: '20px', marginTop: '16px' },
              children: desc,
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}
