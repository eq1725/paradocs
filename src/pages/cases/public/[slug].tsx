'use client'

/**
 * /cases/public/[slug] — View-only public case file page.
 *
 * Rendered for anyone who has the link; no authentication required. Uses
 * getServerSideProps so the page is SEO-indexable and social share previews
 * get OG tags.
 *
 * This is the Raindrop-style "public collection" surface — a researcher
 * can share a URL and anyone can read their investigation, but can't edit.
 */

import React from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import {
  ExternalLink, ArrowLeft, FolderOpen, Calendar, Tag,
} from 'lucide-react'
interface PublicCaseFile {
  id: string
  title: string
  description: string | null
  coverColor: string
  icon: string
  slug: string
  createdAt: string
  updatedAt: string
}
interface PublicArtifact {
  id: string
  title: string
  thumbnailUrl: string | null
  sourceType: string
  sourcePlatform: string | null
  externalUrl: string | null
  verdict: string
  tags: string[]
  description: string | null
  createdAt: string
}
interface PublicOwner {
  displayName: string | null
  username: string | null
}

interface PageProps {
  caseFile: PublicCaseFile | null
  owner: PublicOwner | null
  artifacts: PublicArtifact[]
  notFound: boolean
}

const VERDICT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  compelling:   { label: 'Compelling',   icon: '✦', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  inconclusive: { label: 'Inconclusive', icon: '◐', color: 'text-blue-400',  bg: 'bg-blue-500/15' },
  skeptical:    { label: 'Skeptical',    icon: '⊘', color: 'text-gray-400', bg: 'bg-gray-500/15' },
  needs_info:   { label: 'Needs info',   icon: '?', color: 'text-purple-400',bg: 'bg-purple-500/15' },
}

export default function PublicCaseFilePage({ caseFile, owner, artifacts, notFound }: PageProps) {
  if (notFound || !caseFile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3">🔎</div>
          <h1 className="text-white text-xl font-bold mb-2">Case file not found</h1>
          <p className="text-gray-400 text-sm mb-4">
            This case file isn&apos;t public or no longer exists.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Paradocs
          </Link>
        </div>
      </div>
    )
  }

  const title = caseFile.title
  const ownerName = owner?.displayName || owner?.username || 'A Paradocs researcher'
  const shareDesc = caseFile.description
    || `A paranormal research case file with ${artifacts.length} ${artifacts.length === 1 ? 'source' : 'sources'}, curated by ${ownerName}.`

  return (
    <>
      <Head>
        <title>{title} · Paradocs case file</title>
        <meta name="description" content={shareDesc} />
        <meta property="og:title" content={title + ' · Paradocs case file'} />
        <meta property="og:description" content={shareDesc} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Thin header bar */}
        <header className="border-b border-gray-900 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white hover:text-primary-300 transition-colors">
              <span className="text-lg">🔭</span>
              <span>Paradocs</span>
            </Link>
            <Link
              href="/signup"
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-primary-300 bg-primary-600/10 border border-primary-500/20 hover:bg-primary-600/20 transition-colors"
            >
              Start your own research
            </Link>
          </div>
        </header>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-4">
          <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/40">
            <div className="h-2" style={{ backgroundColor: caseFile.coverColor }} />
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Public case file</span>
                <span>·</span>
                <span>Curated by {ownerName}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                {title}
              </h1>
              {caseFile.description && (
                <p className="text-sm text-gray-300 mt-3 leading-relaxed whitespace-pre-wrap">
                  {caseFile.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-4">
                <span className="flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  {artifacts.length} {artifacts.length === 1 ? 'source' : 'sources'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Updated {new Date(caseFile.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Artifact list */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-12 space-y-2">
          {artifacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/50 p-8 text-center">
              <p className="text-sm text-gray-400">
                This case file doesn&apos;t have any sources yet.
              </p>
            </div>
          ) : (
            artifacts.map(a => (
              <PublicArtifactCard key={a.id} artifact={a} />
            ))
          )}
        </div>

        {/* CTA strip */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
          <div className="rounded-xl border border-primary-500/20 bg-gradient-to-r from-primary-600/10 to-primary-500/5 p-5 text-center">
            <h2 className="text-white font-semibold text-base mb-1">
              Build your own paranormal research library
            </h2>
            <p className="text-xs text-gray-400 max-w-md mx-auto mb-3">
              Paradocs helps you save, organize, and discover patterns across every UAP sighting,
              cryptid report, and paranormal source on the internet.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
            >
              Start researching
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Artifact row card ──

function PublicArtifactCard({ artifact }: { artifact: PublicArtifact }) {
  const verdict = VERDICT_CONFIG[artifact.verdict] || VERDICT_CONFIG.needs_info
  const isExternal = artifact.sourceType !== 'paradocs_report'
  const targetHref = artifact.externalUrl || '#'

  const Outer: React.ElementType = isExternal ? 'a' : 'div'
  const outerProps = isExternal
    ? { href: targetHref, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <Outer
      {...outerProps}
      className="group block rounded-xl overflow-hidden bg-gray-900/40 border border-gray-800 hover:border-gray-700 hover:bg-gray-900 transition-colors"
    >
      <div className="flex items-stretch gap-0">
        {/* Thumb */}
        <div className="relative w-32 sm:w-44 flex-shrink-0 bg-gray-900">
          {artifact.thumbnailUrl ? (
            <img
              src={artifact.thumbnailUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-2xl opacity-40">🔭</div>
          )}
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-sm sm:text-base font-semibold text-white leading-snug line-clamp-2 group-hover:text-primary-200 transition-colors">
              {artifact.title}
            </h3>
            {isExternal && (
              <ExternalLink className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
            )}
          </div>
          {artifact.description && (
            <p className="text-xs text-gray-400 leading-snug line-clamp-2">{artifact.description}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-auto">
            <span className={'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ' + verdict.color + ' ' + verdict.bg}>
              <span>{verdict.icon}</span>
              <span>{verdict.label}</span>
            </span>
            {artifact.sourcePlatform && (
              <span className="text-[10px] text-gray-500">
                {artifact.sourcePlatform}
              </span>
            )}
            {artifact.tags.slice(0, 3).map(t => (
              <span key={t} className="inline-flex items-center gap-0.5 text-[10px] text-purple-300/80 bg-purple-500/10 rounded px-1.5 py-0.5">
                <Tag className="w-2.5 h-2.5" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Outer>
  )
}

// ── Server-side data load ──

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const slug = (ctx.params?.slug as string || '').trim()
  if (!slug) {
    return { props: { caseFile: null, owner: null, artifacts: [], notFound: true } }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || (
    ctx.req.headers.host
      ? (ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') + ctx.req.headers.host
      : 'https://beta.discoverparadocs.com'
  )

  try {
    const res = await fetch(base + '/api/public/case-files/' + encodeURIComponent(slug))
    if (!res.ok) {
      return { props: { caseFile: null, owner: null, artifacts: [], notFound: true } }
    }
    const data = await res.json()
    return {
      props: {
        caseFile: data.caseFile,
        owner: data.owner || null,
        artifacts: data.artifacts || [],
        notFound: false,
      },
    }
  } catch (err) {
    console.error('[public-case-file:ssr]', err)
    return { props: { caseFile: null, owner: null, artifacts: [], notFound: true } }
  }
}
