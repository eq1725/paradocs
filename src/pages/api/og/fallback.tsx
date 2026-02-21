import { ImageResponse } from '@vercel/og';

export var config = {
  runtime: 'edge',
};

export default function handler() {
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
              style: { color: '#c084fc', fontSize: 52, fontWeight: 800, letterSpacing: 4, marginBottom: 24 },
              children: 'PARADOCS',
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#e5e7eb', fontSize: 30, fontWeight: 600 },
              children: 'Where Mysteries Meet Discovery',
            },
          },
          {
            type: 'div',
            props: {
              style: { color: '#9ca3af', fontSize: 20, marginTop: 16 },
              children: 'The worlds largest database of paranormal phenomena',
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}
