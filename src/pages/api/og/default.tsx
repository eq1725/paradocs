/**
 * API: GET /api/og/default
 *
 * Generates a default Open Graph image for ParaDocs site-wide sharing.
 * Used as fallback when no page-specific OG image is available.
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
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Decorative star dots
          ...[
            { x: '10%', y: '15%', s: 3, o: 0.6 },
            { x: '85%', y: '20%', s: 4, o: 0.8 },
            { x: '25%', y: '75%', s: 2.5, o: 0.5 },
            { x: '70%', y: '80%', s: 3, o: 0.7 },
            { x: '50%', y: '10%', s: 2, o: 0.4 },
            { x: '15%', y: '45%', s: 3.5, o: 0.6 },
            { x: '90%', y: '55%', s: 2, o: 0.5 },
            { x: '40%', y: '85%', s: 3, o: 0.6 },
            { x: '65%', y: '30%', s: 2, o: 0.3 },
            { x: '30%', y: '25%', s: 2.5, o: 0.4 },
          ].map((star, i) => ({
            type: 'div',
            key: String(i),
            props: {
              style: {
                position: 'absolute',
                left: star.x,
                top: star.y,
                width: star.s + 'px',
                height: star.s + 'px',
                borderRadius: '50%',
                background: '#c084fc',
                opacity: star.o,
                boxShadow: '0 0 ' + (star.s * 3) + 'px rgba(139, 92, 246, 0.5)',
              },
            },
          })),
          // Logo mark
          {
            type: 'div',
            props: {
              style: {
                color: '#c084fc',
                fontSize: '48px',
                fontWeight: 800,
                letterSpacing: '4px',
                marginBottom: '16px',
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
                marginBottom: '12px',
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
                maxWidth: '700px',
                textAlign: 'center',
                lineHeight: 1.5,
              },
              children: "The world's largest database of paranormal phenomena",
            },
          },
          // Bottom bar with category icons
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '32px',
                marginTop: '48px',
                padding: '16px 32px',
                background: 'rgba(139,92,246,0.1)',
                borderRadius: '16px',
                border: '1px solid rgba(139,92,246,0.2)',
              },
              children: [
                { emoji: '\uD83D\uDEF8', label: 'UFOs' },
                { emoji: '\uD83E\uDDB6', label: 'Cryptids' },
                { emoji: '\uD83D\uDC7B', label: 'Ghosts' },
                { emoji: '\uD83D\uDD2E', label: 'Psychic' },
                { emoji: '\uD83D\uDC09', label: 'Myths' },
              ].map((cat, i) => ({
                type: 'div',
                key: String(i),
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: '8px' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '24px' }, children: cat.emoji } },
                    { type: 'span', props: { style: { color: '#d1d5db', fontSize: '16px' }, children: cat.label } },
                  ],
                },
              })),
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
