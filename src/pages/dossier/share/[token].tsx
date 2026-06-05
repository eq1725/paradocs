// V11.17.71 - Pro Dossier
//
// /dossier/share/[token] — the public, unauthenticated, anonymized
// Dossier viewer per PRO_TIER_VALIDATION_V3.md §3.4.
//
// This page is reachable without a login, but ONLY when the underlying
// Dossier has `is_public_shareable = TRUE`. The share token is the
// unguessable URL slug — never the user_id. RLS on pro_dossiers
// enforces that public-flag-false rows never leak, even if someone
// guesses or scrapes a token-shaped value.
//
// Render policy (anonymized by default):
//   - Show: phen_family, year, region (state-level only), rarity
//     percentile, closest-report count, geographic neighbor count,
//     descriptor match top-3.
//   - DO NOT show: verbatim account text, precise location, the
//     user's name or username, or the closest-report titles.

import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps, NextPage } from 'next'
import { serviceContext } from '@/lib/lab/dossier/dossier-auth'
import { getDossierByShareToken } from '@/lib/lab/dossier/dossier-service'
import type { DossierSections } from '@/lib/lab/dossier/dossier-types'

interface PageProps {
  found: boolean
  shareToken: string
  dossierId: string | null
  sections: DossierSections | null
}

var BRAND_PURPLE = '#9000F0'

var PublicDossierPage: NextPage<PageProps> = function (props) {
  if (!props.found || !props.sections) {
    return (
      <>
        <Head>
          <title>Dossier not found · Paradocs</title>
          <meta name="robots" content="noindex" />
        </Head>
        <main style={{ minHeight: '100dvh', background: '#0a0a14', color: '#fff', padding: '48px 20px' }}>
          <div style={{ maxWidth: 540, margin: '64px auto', textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Changa One', system-ui, sans-serif", fontSize: 28, color: BRAND_PURPLE, marginBottom: 12 }}>
              Dossier not available
            </h1>
            <p style={{ color: '#bcb0d8', fontFamily: 'Georgia, serif' }}>
              The owner of this Dossier may have turned off public sharing, or the link may be incorrect.
            </p>
            <p style={{ marginTop: 24 }}>
              <Link href="/" style={{ color: BRAND_PURPLE, textDecoration: 'underline' }}>
                Visit The Paradocs Archive
              </Link>
            </p>
          </div>
        </main>
      </>
    )
  }

  var sections = props.sections
  var meta = sections.meta
  var year = meta.experience_year !== null ? String(meta.experience_year) : 'unknown year'
  // Region — state-level only (strip city).
  var locationParts = meta.experience_location_label.split(',').map(function (p) { return p.trim() })
  var region = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0] || 'unrecorded region'

  var imgUrl = '/api/lab/dossier/' + (props.dossierId || '') + '/share-card.png?token=' + encodeURIComponent(props.shareToken)

  var topDescriptors = sections.descriptor_matches.matches.slice(0, 3)

  return (
    <>
      <Head>
        <title>Dossier · {region} · {year} · Paradocs</title>
        <meta name="description" content={'A cross-reference dossier from The Paradocs Archive — ' + region + ', ' + year + '.'} />
        <meta property="og:image" content={imgUrl} />
        <meta property="og:title" content={'Paradocs Dossier — ' + region + ' · ' + year} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={imgUrl} />
      </Head>
      <main style={{ minHeight: '100dvh', background: '#0a0a14', color: '#fff', padding: '32px 20px 64px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <p style={{ color: BRAND_PURPLE, fontSize: 11, letterSpacing: 4, fontFamily: "'Changa One', system-ui, sans-serif", textTransform: 'uppercase', marginBottom: 8 }}>
              From The Paradocs Archive
            </p>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#fff', margin: 0 }}>
              {humanizeFamily(meta.phen_family)} dossier
            </h1>
            <p style={{ color: '#bcb0d8', fontFamily: 'Georgia, serif', fontSize: 18, marginTop: 8 }}>
              {region} · {year}
            </p>
          </div>

          {/* Share card preview */}
          <div style={{ maxWidth: 320, margin: '0 auto 40px' }}>
            <img src={imgUrl} alt="Dossier share card" style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(144,0,240,0.3)' }} />
          </div>

          {/* Rarity callout */}
          {!sections.rarity_percentile.data_sparse && (
            <section style={sectionStyle()}>
              <SectionLabel>Rarity</SectionLabel>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <span style={{ fontSize: 64, fontWeight: 700, color: BRAND_PURPLE, fontFamily: "'Changa One', system-ui, sans-serif" }}>
                  {sections.rarity_percentile.percentile}
                </span>
                <span style={{ fontSize: 18, color: '#9080b0', marginLeft: 8 }}>
                  th percentile
                </span>
              </div>
              <p style={{ color: '#bcb0d8', fontStyle: 'italic', textAlign: 'center', fontSize: 14 }}>
                {sections.rarity_percentile.caption}
              </p>
            </section>
          )}

          {/* Closest + Geographic counts */}
          <section style={sectionStyle()}>
            <SectionLabel>Cross-reference scope</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <Stat n={sections.closest_reports.reports.length} label="closest" />
              <Stat n={sections.geographic_neighbors.total_count} label={'within ' + sections.geographic_neighbors.radius_mi + 'mi'} />
              <Stat n={sections.temporal_neighbors.decade_count} label={(sections.temporal_neighbors.decade_label || '—') + ' decade'} />
            </div>
          </section>

          {/* Top descriptors */}
          {topDescriptors.length > 0 && (
            <section style={sectionStyle()}>
              <SectionLabel>Descriptor signature</SectionLabel>
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
                {topDescriptors.map(function (d) {
                  return (
                    <li key={d.family} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ color: '#fff', fontSize: 14 }}>{d.label}</span>
                        <span style={{ color: BRAND_PURPLE, fontFamily: 'monospace', fontSize: 13 }}>{d.pct}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ width: d.pct + '%', height: '100%', background: BRAND_PURPLE }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Lineage */}
          {sections.phen_lineage.inheritances.length > 0 && (
            <section style={sectionStyle()}>
              <SectionLabel>Lineage</SectionLabel>
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
                {sections.phen_lineage.inheritances.map(function (l) {
                  return (
                    <li key={l.sub_pattern_id} style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>
                      <span style={{ color: BRAND_PURPLE }}>{l.label}</span> — {l.matched_signals} of {l.total_signals} signals match
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Footer */}
          <footer style={{ marginTop: 48, textAlign: 'center', color: '#9080b0' }}>
            <p style={{ marginBottom: 12 }}>
              <Link href="/" style={{ color: BRAND_PURPLE, fontFamily: "'Changa One', system-ui, sans-serif", letterSpacing: 2, textDecoration: 'none' }}>
                PARADOCS
              </Link>
            </p>
            <p style={{ fontSize: 11, opacity: 0.6 }}>
              Generate your own dossier — sign up and submit an experience.
            </p>
          </footer>
        </div>
      </main>
    </>
  )
}

function sectionStyle(): React.CSSProperties {
  return {
    background: 'linear-gradient(135deg, rgba(144,0,240,0.08) 0%, rgba(0,0,0,0.3) 100%)',
    border: '1px solid rgba(144,0,240,0.18)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  }
}

function SectionLabel(props: { children: React.ReactNode }) {
  return (
    <p style={{
      color: BRAND_PURPLE,
      fontSize: 10,
      letterSpacing: 3,
      fontFamily: "'Changa One', system-ui, sans-serif",
      textTransform: 'uppercase',
      marginBottom: 8,
    }}>
      {props.children}
    </p>
  )
}

function Stat(props: { n: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 32, color: '#fff', fontFamily: "'Changa One', system-ui, sans-serif", margin: 0 }}>{props.n}</p>
      <p style={{ fontSize: 10, color: '#9080b0', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{props.label}</p>
    </div>
  )
}

function humanizeFamily(f: string): string {
  switch (f) {
    case 'cryptids': return 'Cryptid'
    case 'ufos_aliens': return 'UFO / alien'
    case 'ghosts_hauntings': return 'Haunting'
    case 'psychic_phenomena': return 'Psychic'
    case 'consciousness_practices': return 'Consciousness'
    case 'perception_sensory': return 'Perception'
    case 'psychological_experiences': return 'Psychological'
    case 'religion_mythology': return 'Religion / mythology'
    default: return String(f).replace(/_/g, ' ')
  }
}

export var getServerSideProps: GetServerSideProps<PageProps> = async function (ctx) {
  var token = String(ctx.params?.token || '')
  if (!token) return { props: { found: false, shareToken: token, dossierId: null, sections: null } }

  var svcCtx = serviceContext()
  var row = await getDossierByShareToken(svcCtx.svc, token)
  if (!row || !row.is_public_shareable) {
    return { props: { found: false, shareToken: token, dossierId: null, sections: null } }
  }

  return {
    props: {
      found: true,
      shareToken: token,
      dossierId: row.id,
      sections: row.sections_json,
    },
  }
}

export default PublicDossierPage
