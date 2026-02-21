/**
 * API: GET /api/og/default
 * Generates a default Open Graph image for ParaDocs.
 */

import { ImageResponse } from '@vercel/og';

export var config = {
  runtime: 'edge',
};

export default async function handler() {
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
          padding: '48px 56px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                color: '#c084fc',
                fontSize: '52px',
                fontWeight: 800,
                letterSpacing: '4px',
                marginBottom: '24px',
              },
              children: 'PARADOCS',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                color: '#e5e7eb',
                fontSize: '34px',
                fontWeight: 600,
                marginBottom: '16px',
                textAlign: 'center',
              },
              children: 'Where Mysteries Meet Discovery',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                color: '#9ca3af',
                fontSize: '22px',
                textAlign: 'center',
                lineHeight: 1.5,
                maxWidth: '700px',
                marginBottom: '40px',
              },
              children: "The world's largest database of paranormal phenomena",
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '16px',
              },
              children: [
                { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: 'UFOs' } },
                { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: 'Cryptids' } },
                { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: 'Ghosts' } },
                { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: 'Psychic' } },
                { type: 'div', props: { style: { padding: '8px 20px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '24px', color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: 'Myths' } },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
    }
  );
}
