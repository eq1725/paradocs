/**
 * API: GET /api/og/default
 *
 * Generates a default Open Graph image for ParaDocs site-wide sharing.
 * Used as fallback OG image for pages without specific images.
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
          // Logo
          {
            type: 'div',
            props: {
              style: {
                color: '#c084fc',
                fontSize: '48px',
                fontWeight: 800,
                letterSpacing: '4px',
                marginBottom: '20px',
              },
              children: '\u2726 PARADOCS',
            },
          },
          // Tagline
          {
            type: 'div',
            props: {
              style: {
                color: '#e5e7eb',
                fontSize: '32px',
                fontWeight: 600,
                marginBottom: '16px',
                textAlign: 'center',
              },
              children: 'Where Mysteries Meet Discovery',
            },
          },
          // Description
          {
            type: 'div',
            props: {
              style: {
                color: '#9ca3af',
                fontSize: '20px',
                textAlign: 'center',
                lineHeight: 1.5,
                maxWidth: '700px',
                marginBottom: '40px',
              },
              children: "The world's largest database of paranormal phenomena",
            },
          },
          // Category bar
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '28px',
                padding: '16px 32px',
                background: 'rgba(139,92,246,0.1)',
                borderRadius: '16px',
                border: '1px solid rgba(139,92,246,0.2)',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '22px' }, children: '\uD83D\uDEF8' } },
                      { type: 'span', props: { style: { color: '#d1d5db', fontSize: '15px' }, children: 'UFOs' } },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '22px' }, children: '\uD83E\uDDB6' } },
                      { type: 'span', props: { style: { color: '#d1d5db', fontSize: '15px' }, children: 'Cryptids' } },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '22px' }, children: '\uD83D\uDC7B' } },
                      { type: 'span', props: { style: { color: '#d1d5db', fontSize: '15px' }, children: 'Ghosts' } },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '22px' }, children: '\uD83D\uDD2E' } },
                      { type: 'span', props: { style: { color: '#d1d5db', fontSize: '15px' }, children: 'Psychic' } },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '22px' }, children: '\uD83D\uDC09' } },
                      { type: 'span', props: { style: { color: '#d1d5db', fontSize: '15px' }, children: 'Myths' } },
                    ],
                  },
                },
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
