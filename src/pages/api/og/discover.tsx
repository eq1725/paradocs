/**
 * API: GET /api/og/discover
 * 
 * Generates a static Open Graph image for the Discover feed page.
 * Uses Vercel OG (Satori) to create a branded social card.
 */

import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a14 0%, #1a1025 50%, #0f0a1a 100%)',
          position: 'relative',
        }}
      >
        {/* Subtle purple glow */}
        <div
          style={{
            position: 'absolute',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginBottom: '24px',
          }}
        >
          <span
            style={{
              fontSize: '80px',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '-2px',
            }}
          >
            Paradocs
          </span>
          <span
            style={{
              fontSize: '80px',
              fontWeight: 900,
              color: '#a855f7',
            }}
          >
            .
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            color: '#d1d5db',
            marginBottom: '16px',
          }}
        >
          Discover the Unexplained
        </div>

        {/* Subtext */}
        <div
          style={{
            fontSize: '22px',
            color: '#9ca3af',
          }}
        >
          Swipe through 500+ documented paranormal phenomena
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
