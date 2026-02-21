/**
 * API: GET /api/og/report?slug=xxx
 *
 * Generates dynamic Open Graph images for report pages using Vercel OG (Satori).
 * Creates a branded, dark-themed social card with report title, category,
 * location, and credibility score for rich social media previews.
 */

import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export var config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  var url = new URL(req.url, 'http://n');
  var title = url.searchParams.get('title') || 'Unexplained Report';
  var category = url.searchParams.get('category') || '';
  var location = url.searchParams.get('location') || '';
  var date = url.searchParams.get('date') || '';
  var score = url.searchParams.get('score') || '';
  var views = url.searchParams.get('views') || '0';

  var categoryIcons: Record<string, string> = {
    ufo: '\uD83D\uDEF8',
    cryptid: '\uD83E\uDDB6',
    ghost: '\uD83D\uDC7B',
    psychic: '\uD83D\uDD2E',
    conspiracy: '\uD83D\uDD75\uFE0F',
    mythological: '\uD83D\uDC09',
    extraterrestrial: '\uD83D\uDC7D',
    other: '\u2753'
  };

  var icon = categoryIcons[category] || '\uD83D\uDD2E';
  var categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Unknown';
  var scoreNum = score ? parseFloat(score) : 0;
  var scoreColor = scoreNum >= 0.7 ? '#22c55e' : scoreNum >= 0.4 ? '#eab308' : '#ef4444';

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1035 50%, #0a0a1a 100%)',
          padding: '48px 56px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        children: [
          // Top bar: logo + category
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '32px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      color: '#c084fc',
                      fontSize: '28px',
                      fontWeight: 700,
                      letterSpacing: '2px',
                    },
                    children: '\u2726 PARADOCS',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(139,92,246,0.15)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      borderRadius: '24px',
                      padding: '8px 20px',
                    },
                    children: [
                      { type: 'span', props: { style: { fontSize: '20px' }, children: icon } },
                      { type: 'span', props: { style: { color: '#c084fc', fontSize: '16px', fontWeight: 600 }, children: categoryLabel } },
                    ],
                  },
                },
              ],
            },
          },
          // Title
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                display: 'flex',
                alignItems: 'center',
              },
              children: {
                type: 'h1',
                props: {
                  style: {
                    color: '#e5e7eb',
                    fontSize: title.length > 60 ? '36px' : '44px',
                    fontWeight: 700,
                    lineHeight: 1.3,
                    margin: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                  children: title,
                },
              },
            },
          },
          // Bottom bar: location, date, credibility, views
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(75,85,99,0.5)',
                paddingTop: '24px',
              },
              children: [
                // Location + date
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: '24px' },
                    children: [
                      location ? {
                        type: 'div',
                        props: {
                          style: { display: 'flex', alignItems: 'center', gap: '6px' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '16px' }, children: '\uD83D\uDCCD' } },
                            { type: 'span', props: { style: { color: '#9ca3af', fontSize: '16px' }, children: location } },
                          ],
                        },
                      } : null,
                      date ? {
                        type: 'div',
                        props: {
                          style: { display: 'flex', alignItems: 'center', gap: '6px' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '16px' }, children: '\uD83D\uDCC5' } },
                            { type: 'span', props: { style: { color: '#9ca3af', fontSize: '16px' }, children: date } },
                          ],
                        },
                      } : null,
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', alignItems: 'center', gap: '6px' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '16px' }, children: '\uD83D\uDC41' } },
                            { type: 'span', props: { style: { color: '#9ca3af', fontSize: '16px' }, children: views + ' views' } },
                          ],
                        },
                      },
                    ].filter(Boolean),
                  },
                },
                // Credibility score
                score ? {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(30,27,46,0.8)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                    },
                    children: [
                      { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px' }, children: 'Credibility' } },
                      { type: 'span', props: { style: { color: scoreColor, fontSize: '18px', fontWeight: 700 }, children: Math.round(scoreNum * 100) + '%' } },
                    ],
                  },
                } : null,
              ].filter(Boolean),
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
